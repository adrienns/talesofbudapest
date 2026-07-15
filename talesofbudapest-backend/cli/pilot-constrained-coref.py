#!/usr/bin/env python3
"""Auditable, candidate-constrained coreference pilot.

Models may select only a local, exact-offset antecedent ID or ``?``.  They can
never invent a name or silently merge a reference with an unrelated entity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import spacy
from dotenv import load_dotenv
from openai import OpenAI


BACKEND = Path(__file__).resolve().parents[1]
WORKSPACE = BACKEND.parent
TEXT_DIR = WORKSPACE / "ingest/corpus/restricted/text"
OUT_DIR = WORKSPACE / "ingest/corpus/restricted/extractions/coref-pilot"
CACHE = Path("/private/tmp/constrained-coref-cache.jsonl")
PRONOUNS = {"he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs", "it", "its"}
DEFINITE = {"the", "this", "that", "these", "those"}
POSSESSIVE = {"his", "her", "hers", "their", "theirs", "its"}
PERSON_HEADS = {"man", "woman", "girl", "boy", "child", "rabbi", "scholar", "author", "writer", "father", "mother", "son", "daughter", "husband", "wife", "brother", "sister", "visitor"}
FEMALE_HEADS = {"woman", "girl", "mother", "daughter", "wife", "sister"}
MALE_HEADS = {"man", "boy", "father", "son", "husband", "brother"}
RATES = {
    "google/gemini-2.5-flash-lite": (0.10, 0.40),
    "qwen/qwen3-30b-a3b-instruct-2507": (0.04815, 0.1931),
    "google/gemini-2.5-flash": (0.30, 2.50),
}


def parse_pages(text: str) -> dict[int, str]:
    return {int(m.group(1)): m.group(2).strip() for m in re.finditer(
        r"--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)", text
    )}


def reading_view(page: int, source: str) -> tuple[str, list[tuple[int, int, int]]]:
    chars: list[str] = []
    mapping: list[tuple[int, int, int]] = []

    def add(char: str, start: int, end: int) -> None:
        if char.isspace():
            if not chars:
                return
            if chars[-1] == " ":
                mapping[-1] = (page, mapping[-1][1], end)
                return
            char = " "
        chars.append(char)
        mapping.append((page, start, end))

    index = 0
    while index < len(source):
        if source[index] == "-" and index and source[index - 1].isalpha():
            cursor = index + 1
            while cursor < len(source) and source[cursor] in " \t\r":
                cursor += 1
            if cursor < len(source) and source[cursor] == "\n":
                cursor += 1
                while cursor < len(source) and source[cursor].isspace():
                    cursor += 1
                if cursor < len(source) and source[cursor].isalpha():
                    index = cursor
                    continue
        if source[index].isspace():
            cursor = index + 1
            while cursor < len(source) and source[cursor].isspace():
                cursor += 1
            add(" ", index, cursor)
            index = cursor
            continue
        add(source[index], index, index + 1)
        index += 1
    return "".join(chars).strip(), mapping


def stable_id(source: str, page: int, start: int, end: int) -> str:
    return "m_" + hashlib.sha256(f"{source}\x1f{page}\x1f{start}\x1f{end}".encode()).hexdigest()[:16]


def stable_entity_id(source: str, text: str) -> str:
    normalized = re.sub(r"\W+", "", text.lower())
    return "e_" + hashlib.sha256(f"{source}\x1f{normalized}".encode()).hexdigest()[:16]


def raw_span(mapping: list[tuple[int, int, int] | None], start: int, end: int) -> tuple[int, int, int] | None:
    rows = [row for row in mapping[start:end] if row is not None]
    if not rows or len({row[0] for row in rows}) != 1:
        return None
    return rows[0][0], min(row[1] for row in rows), max(row[2] for row in rows)


def mention_type(chunk: Any) -> str:
    if chunk.root.pos_ == "PRON":
        return "person" if chunk.root.text.lower() not in {"it", "its"} else "thing"
    if any(token.ent_type_ in {"GPE", "LOC", "FAC"} for token in chunk):
        return "place"
    if chunk.root.lemma_.lower() in PERSON_HEADS or re.match(r"^(?:r\.|rabbi|dr\.|mr\.|mrs\.)\b", chunk.text, re.IGNORECASE):
        return "person"
    if any(token.ent_type_ == "PERSON" for token in chunk):
        return "person"
    return "thing"


def modifiers(chunk: Any) -> list[str]:
    ignored = DEFINITE | POSSESSIVE | {"a", "an", "of", "and", "or"}
    return [token.lemma_.lower() for token in chunk if token != chunk.root and token.lemma_.lower() not in ignored and token.is_alpha]


def gender_hint(chunk: Any) -> str | None:
    """Only encode explicit lexical gender; never guess from a proper name."""
    head = chunk.root.lemma_.lower()
    if head in FEMALE_HEADS:
        return "female"
    if head in MALE_HEADS:
        return "male"
    return None


def extract_mentions(source: str, text: str, mapping: list[tuple[int, int, int] | None], nlp: Any) -> list[dict[str, Any]]:
    doc = nlp(text)
    rows: dict[tuple[int, int], dict[str, Any]] = {}
    for chunk in doc.noun_chunks:
        span = raw_span(mapping, chunk.start_char, chunk.end_char)
        if not span:
            continue
        page, start, end = span
        words = [token.text.lower() for token in chunk]
        first = words[0] if words else ""
        # Relative words such as "who" and "that" attach within the same noun
        # phrase; they are not discourse references and must not enter the
        # entity linker.
        possessive = first in POSSESSIVE
        pronoun = first in PRONOUNS and not possessive
        definite = first in DEFINITE
        if len(words) == 1 and first in {"this", "that", "these", "those"}:
            # Deictic words without a noun are handled by sentence semantics,
            # not entity identity. Keep them out of the entity linker.
            definite = False
        named = any(token.pos_ == "PROPN" for token in chunk)
        reference = pronoun or possessive or definite
        generic_person = chunk.root.lemma_.lower() in PERSON_HEADS
        if not (reference or named or generic_person):
            continue
        row = {
            "id": stable_id(source, page, start, end), "page": page, "start": start, "end": end,
            "reading_start": chunk.start_char, "reading_end": chunk.end_char, "text": chunk.text,
            "head": chunk.root.lemma_.lower(), "type": mention_type(chunk), "named": named,
            "modifiers": modifiers(chunk), "gender_hint": gender_hint(chunk),
            "reference": reference, "reference_kind": "possessive" if possessive else "pronoun" if pronoun else "definite" if definite else None,
        }
        # Repeated explicit names are already safe aliases. Comparing the
        # entity ID prevents a needless Flash escalation when two models pick
        # different occurrences of the same person name.
        row["entity_id"] = stable_entity_id(source, chunk.text) if row["named"] and row["type"] == "person" else row["id"]
        old = rows.get((chunk.start_char, chunk.end_char))
        if old is None or (row["reference"] and not old["reference"]):
            rows[(chunk.start_char, chunk.end_char)] = row
    return sorted(rows.values(), key=lambda row: (row["reading_start"], row["reading_end"]))


def candidates_for(reference: dict[str, Any], mentions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # A person introduced at the beginning of a two-page section may still be
    # the subject near its end. Generic descriptions remain local; only named
    # people receive this longer discourse-memory window.
    window = 15_000 if reference["reference_kind"] in {"pronoun", "possessive"} else 4_500
    prior = [m for m in mentions if m["reading_end"] <= reference["reading_start"] and reference["reading_start"] - m["reading_end"] <= window]
    if reference["reference_kind"] in {"pronoun", "possessive"}:
        prior = [m for m in prior if m["type"] == "person" and not m["reference"]]
        ref_word = reference["text"].split()[0].lower()
        # This is a hard linguistic constraint, not a model hunch: a noun
        # explicitly described as "a girl" cannot antecede "he/his".
        if ref_word in {"he", "him", "his"}:
            prior = [m for m in prior if m["gender_hint"] != "female"]
        elif ref_word in {"she", "her", "hers"}:
            prior = [m for m in prior if m["gender_hint"] != "male"]
    else:
        same_head = [m for m in prior if m["head"] == reference["head"]]
        ref_modifiers = set(reference["modifiers"])
        if ref_modifiers:
            # A modified definite description is unsafe to merge merely on its
            # final noun: "Girls' Home" and "Old Age Home" are distinct.
            same_head = [m for m in same_head if ref_modifiers.intersection(m["modifiers"])]
        prior = same_head
    scored = []
    for mention in prior:
        score = 0.0
        if mention["head"] == reference["head"]:
            score += 100
        if mention["named"]:
            score += 5
        score += max(0, 40 - (reference["reading_start"] - mention["reading_end"]) / 130)
        scored.append((score, mention))
    # One ID per source span; closest matching names win.
    seen = set()
    result = []
    for _, mention in sorted(scored, key=lambda row: (-row[0], -row[1]["reading_end"])):
        if mention["entity_id"] not in seen:
            seen.add(mention["entity_id"])
            result.append(mention)
        if len(result) == 8:
            break
    return result


def context_for(reference: dict[str, Any], text: str) -> str:
    start = max(0, reference["reading_start"] - 520)
    end = min(len(text), reference["reading_end"] + 180)
    return (text[start:reference["reading_start"]] + "[[" + text[reference["reading_start"]:reference["reading_end"]] + "]]" + text[reference["reading_end"]:end]).replace("|", "/")


def option_for(mention: dict[str, Any], text: str) -> str:
    """Give an antecedent ID just enough source evidence to be auditable."""
    start = max(0, mention["reading_start"] - 55)
    end = min(len(text), mention["reading_end"] + 75)
    excerpt = text[start:mention["reading_start"]] + "[[" + text[mention["reading_start"]:mention["reading_end"]] + "]]" + text[mention["reading_end"]:end]
    return f"{mention['entity_id']}={excerpt.replace('|', '/')}"


class Cache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.rows: dict[str, dict[str, Any]] = {}
        if path.exists():
            for line in path.read_text("utf-8", errors="ignore").splitlines():
                try:
                    row = json.loads(line)
                    self.rows[row["key"]] = row
                except (json.JSONDecodeError, KeyError):
                    pass

    def call(self, operation: str, model: str, prompt: str, max_tokens: int, client: OpenAI) -> tuple[str, dict[str, Any], bool]:
        key = hashlib.sha256(json.dumps([operation, model, prompt, max_tokens], ensure_ascii=False).encode()).hexdigest()
        if key in self.rows:
            row = self.rows[key]
            return row["output"], row["usage"], True
        response = client.chat.completions.create(model=model, messages=[{"role": "user", "content": prompt}], temperature=0, max_tokens=max_tokens)
        output = response.choices[0].message.content or ""
        usage = response.model_dump().get("usage") or {}
        row = {"key": key, "operation": operation, "model": model, "output": output, "usage": usage, "created_at": time.time()}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.rows[key] = row
        return output, usage, False


def parse_answers(output: str, ids: set[str]) -> dict[str, str]:
    answers: dict[str, str] = {}
    for match in re.finditer(r"(?im)^\s*(r\d+)\s*\|\s*((?:m|e)_[0-9a-f]+|\?)\s*$", output.replace("`", "")):
        if match.group(1) in ids:
            answers[match.group(1)] = match.group(2)
    return answers


def canonical_answer(answer: str, row: dict[str, Any]) -> str:
    """Accept either a source-mention ID or its displayed canonical entity ID."""
    if answer == "?":
        return answer
    for mention in row["options"]:
        if answer in {mention["id"], mention["entity_id"]}:
            return mention["entity_id"]
    # A model must never invent an antecedent. Treat an unknown ID as unsure.
    return "?"


def cost(usage: dict[str, Any], model: str) -> float:
    raw = usage.get("cost") or usage.get("cost_details", {}).get("upstream_inference_cost")
    if raw is not None:
        return float(raw)
    rates = RATES[model]
    return (int(usage.get("prompt_tokens") or 0) * rates[0] + int(usage.get("completion_tokens") or 0) * rates[1]) / 1_000_000


def make_prompt(rows: list[dict[str, Any]], prefix: str) -> str:
    return prefix + "\n\n" + "\n".join(
        f"{row['rid']}|{row['ref']['reference_kind']}|{context_for(row['ref'], row['source_text'])}\n"
        + "OPTIONS: " + "; ".join(option_for(m, row["source_text"]) for m in row["options"]) + "; ?=ambiguous"
        for row in rows
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--pages", required=True, help="comma-separated source pages; include left context")
    parser.add_argument("--resolve-pages", required=True, help="comma-separated pages whose references are scored")
    parser.add_argument("--max-references", type=int, default=36)
    parser.add_argument("--max-cost-usd", type=float, default=0.01)
    args = parser.parse_args()
    page_ids = [int(value) for value in args.pages.split(",")]
    resolve_pages = {int(value) for value in args.resolve_pages.split(",")}
    pages = parse_pages((TEXT_DIR / f"{args.source}.pages.txt").read_text("utf-8"))
    nlp = spacy.load("en_core_web_sm")
    text_parts: list[str] = []
    mapping: list[tuple[int, int, int] | None] = []
    for index, page in enumerate(page_ids):
        reading, page_mapping = reading_view(page, pages[page])
        if index:
            text_parts.append("\n\n")
            mapping.extend([None, None])
        text_parts.append(reading)
        mapping.extend(page_mapping)
    text = "".join(text_parts)
    mentions = extract_mentions(args.source, text, mapping, nlp)
    refs = [m for m in mentions if m["reference"] and m["page"] in resolve_pages]
    work = []
    for ref in refs:
        options = candidates_for(ref, mentions)
        if options:
            work.append({"ref": ref, "options": options, "source_text": text})
    work = work[:args.max_references]
    for index, row in enumerate(work, start=1):
        row["rid"] = f"r{index:03d}"
    prompt_prefix = """Resolve each bracketed reference independently. For each record, copy exactly one ID from that record's OPTIONS; IDs may begin e_ or m_. Choose it only when it denotes the same person, place, organization, or thing. Possessives resolve their owner: in "His tomb" or "his books", choose the person who owns it, even though the whole noun phrase is not identical. Never choose a place for he/his. A newly introduced item, role, or list member is not coreference: return ? even if it shares a final word (for example, Girls' Home is not Old Age Home). Do not infer facts or create names. Return ? if the context is genuinely unclear. Output exactly one line per record: rNNN|e_id, rNNN|m_id, or rNNN|?. Do not reuse an ID from another record unless it is explicitly offered in this record."""
    load_dotenv(BACKEND / ".env")
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is required")
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1", timeout=180, max_retries=0)
    cache = Cache(CACHE)
    total_cost = 0.0
    usage_rows = []
    answers_by_model: dict[str, dict[str, str]] = {}
    for operation, model in [("primary", "google/gemini-2.5-flash-lite"), ("audit", "qwen/qwen3-30b-a3b-instruct-2507")]:
        # Reasoning-capable providers may spend hidden tokens before emitting
        # compact rNNN|m_id rows. Leave headroom so every requested row arrives.
        output, usage, hit = cache.call(operation, model, make_prompt(work, prompt_prefix), 800, client)
        value = cost(usage, model)
        total_cost += 0 if hit else value
        usage_rows.append({"operation": operation, "model": model, "cache_hit": hit, "cost": value, "output": output})
        raw_answers = parse_answers(output, {row["rid"] for row in work})
        answers_by_model[operation] = {
            row["rid"]: canonical_answer(raw_answers.get(row["rid"], "?"), row)
            for row in work
        }
    final = {}
    disagreements = [row for row in work if answers_by_model["primary"].get(row["rid"], "?") != answers_by_model["audit"].get(row["rid"], "?")]
    if disagreements:
        quality_prefix = prompt_prefix + "\nThe two cheap models disagreed. Decide from the source and options; their votes are advisory only."
        output, usage, hit = cache.call("quality", "google/gemini-2.5-flash", make_prompt(disagreements, quality_prefix), 500, client)
        value = cost(usage, "google/gemini-2.5-flash")
        total_cost += 0 if hit else value
        usage_rows.append({"operation": "quality", "model": "google/gemini-2.5-flash", "cache_hit": hit, "cost": value, "output": output})
        raw_quality = parse_answers(output, {row["rid"] for row in disagreements})
        quality = {
            row["rid"]: canonical_answer(raw_quality.get(row["rid"], "?"), row)
            for row in disagreements
        }
    else:
        quality = {}
    if total_cost > args.max_cost_usd:
        raise SystemExit(f"cost ${total_cost:.6f} exceeded cap ${args.max_cost_usd:.6f}")
    for row in work:
        primary = answers_by_model["primary"].get(row["rid"], "?")
        audit = answers_by_model["audit"].get(row["rid"], "?")
        chosen = primary if primary == audit else quality.get(row["rid"], "?")
        target = next((m for m in row["options"] if m["entity_id"] == chosen), None)
        final[row["rid"]] = {"reference": row["ref"], "options": row["options"], "primary": primary, "audit": audit, "chosen": chosen, "antecedent": target,
                             "verdict": "agreed" if primary == audit and chosen != "?" else "quality" if chosen != "?" else "ambiguous"}
    output_dir = OUT_DIR / args.source
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"pages-{'-'.join(map(str, page_ids))}-resolve-{'-'.join(map(str, sorted(resolve_pages)))}.json"
    output_path.write_text(json.dumps({"source": args.source, "pages": page_ids, "resolve_pages": sorted(resolve_pages), "mentions": mentions, "results": final, "usage": usage_rows, "paid_cost_usd": total_cost}, ensure_ascii=False, indent=2) + "\n", "utf-8")
    summary = [{"reference": row["reference"]["text"], "page": row["reference"]["page"], "antecedent": (row["antecedent"] or {}).get("text"), "verdict": row["verdict"]} for row in final.values()]
    print(json.dumps({"output": str(output_path), "references": len(final), "resolved": sum(row["verdict"] != "ambiguous" for row in final.values()), "paid_cost_usd": total_cost, "summary": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
