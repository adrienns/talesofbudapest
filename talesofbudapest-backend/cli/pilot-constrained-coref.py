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
DEFAULT_CACHE = OUT_DIR / ".cache" / "model-responses.jsonl"
CACHE_VERSION = "compact-discourse-v5"
PRONOUNS = {"he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs", "it", "its"}
DEFINITE = {"the", "this", "that", "these", "those"}
POSSESSIVE = {"his", "her", "hers", "their", "theirs", "its"}
PERSON_HEADS = {"man", "woman", "girl", "boy", "child", "rabbi", "scholar", "author", "writer", "father", "mother", "son", "daughter", "husband", "wife", "brother", "sister", "visitor"}
FEMALE_HEADS = {"woman", "girl", "mother", "daughter", "wife", "sister"}
MALE_HEADS = {"man", "boy", "father", "son", "husband", "brother"}
COLLECTIVE_HEADS = {"alumni", "community", "couple", "family", "group", "people", "public", "staff", "team"}
NON_ANTECEDENT_PRONOUNS = {"i", "me", "we", "us", "you", "who", "whom", "whose", "which", "what", "that"}
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
    if chunk.root.ent_type_ in {"GPE", "LOC", "FAC"}:
        return "place"
    if chunk.root.lemma_.lower() in PERSON_HEADS or re.match(
        r"^(?:(?:r|dr|mr|mrs)\.\s|(?:rabbi|saint|st\.)\b)", chunk.text, re.IGNORECASE
    ):
        return "person"
    # Entity labels on a possessor must not leak to the whole noun phrase:
    # "Béla Lajta's art" is art, not a person.
    if chunk.root.ent_type_ == "PERSON":
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


def number_hint(chunk: Any) -> str:
    if chunk.root.tag_ in {"NNS", "NNPS"} or any(token.lower_ in {"and", "nor"} for token in chunk):
        return "plural"
    return "singular"


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
        if len(words) == 1 and first in NON_ANTECEDENT_PRONOUNS:
            continue
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
        row = {
            "id": stable_id(source, page, start, end), "page": page, "start": start, "end": end,
            "reading_start": chunk.start_char, "reading_end": chunk.end_char, "text": chunk.text,
            "head": chunk.root.lemma_.lower(), "type": mention_type(chunk), "named": named,
            "modifiers": modifiers(chunk), "gender_hint": gender_hint(chunk), "number_hint": number_hint(chunk),
            "dependency": chunk.root.dep_,
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


def canonicalize_local_person_aliases(source: str, mentions: list[dict[str, Any]]) -> None:
    """Collapse unambiguous full-name/surname variants inside this window."""
    full_by_surname: dict[str, list[dict[str, Any]]] = {}
    for mention in mentions:
        if mention["type"] != "person" or not mention["named"] or mention["reference"]:
            continue
        tokens = re.findall(r"[a-z0-9]+", mention["text"].lower())
        if len(tokens) >= 2:
            full_by_surname.setdefault(tokens[-1], []).append(mention)
    canonical_by_surname: dict[str, str] = {}
    for surname, rows in full_by_surname.items():
        first_sets = [set(re.findall(r"[a-z0-9]+", row["text"].lower())[:-1]) for row in rows]
        compatible = all(
            left.intersection(right) or any(a[:3] == b[:3] for a in left for b in right)
            for index, left in enumerate(first_sets)
            for right in first_sets[index + 1:]
        )
        if compatible:
            canonical_text = min((row["text"] for row in rows), key=lambda value: (len(value), value.lower()))
            canonical_by_surname[surname] = stable_entity_id(source, canonical_text)
    for mention in mentions:
        if mention["type"] != "person" or not mention["named"] or mention["reference"]:
            continue
        tokens = re.findall(r"[a-z0-9]+", mention["text"].lower())
        if tokens and tokens[-1] in canonical_by_surname:
            mention["entity_id"] = canonical_by_surname[tokens[-1]]


def candidates_for(reference: dict[str, Any], mentions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # A person introduced at the beginning of a two-page section may still be
    # the subject near its end. Generic descriptions remain local; only named
    # people receive this longer discourse-memory window.
    window = 15_000 if reference["reference_kind"] in {"pronoun", "possessive"} else 4_500
    reference_word = reference["text"].split()[0].lower()
    prior = [
        m for m in mentions
        if m["reading_end"] <= reference["reading_start"]
        and reference["reading_start"] - m["reading_end"] <= window
        and usable_antecedent(m)
    ]
    if reference["reference_kind"] in {"pronoun", "possessive"}:
        # Do not offer an earlier pronoun as an antecedent. Models otherwise
        # disagree between "he" and the explicit person name, forcing an
        # expensive quality call. The named/nominal source mention remains in
        # the longer discourse window.
        nearby_references = []
        prior = [m for m in prior if not m["reference"]]
        ref_word = reference_word
        if ref_word in {"he", "him", "his", "she", "her", "hers"}:
            prior = [m for m in prior if m["type"] == "person"]
            nearby_references = [m for m in nearby_references if m["type"] == "person"]
        elif ref_word in {"it", "its"}:
            prior = [m for m in prior if m["type"] != "person" and m["number_hint"] != "plural"]
            nearby_references = [
                m for m in nearby_references
                if m["type"] != "person" and m["number_hint"] != "plural"
            ]
        elif ref_word in {"they", "them", "their", "theirs"}:
            prior = [
                m for m in prior
                if m["number_hint"] == "plural" or m["head"] in COLLECTIVE_HEADS
            ]
            nearby_references = [
                m for m in nearby_references
                if m["number_hint"] == "plural" or m["head"] in COLLECTIVE_HEADS
            ]
        # This is a hard linguistic constraint, not a model hunch: a noun
        # explicitly described as "a girl" cannot antecede "he/his".
        if ref_word in {"he", "him", "his"}:
            prior = [m for m in prior if m["gender_hint"] != "female"]
        elif ref_word in {"she", "her", "hers"}:
            prior = [m for m in prior if m["gender_hint"] != "male"]
        if reference["reference_kind"] == "possessive":
            literal_folded = re.sub(r"\W+", "", reference["text"].lower())
            nearby_references = [
                m for m in nearby_references
                if re.sub(r"\W+", "", m["text"].lower()) != literal_folded
            ]
        prior.extend(sorted(nearby_references, key=lambda m: m["reading_end"], reverse=True)[:3])
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
        if mention["dependency"] in {"nsubj", "nsubjpass"} and reference_word not in {"they", "them", "their", "theirs"}:
            score += 30
        # In English discourse, a direct object or predicate complement often
        # becomes the subject of the next sentence ("set up a school. It...").
        # A nearer prepositional place ("in the House") is less salient.
        if mention["dependency"] in {"dobj", "obj", "attr", "oprd"}:
            score += 24
        elif mention["dependency"] in {"pobj", "obl"}:
            score -= 10
        if reference_word in {"it", "its"} and mention["type"] == "place":
            score -= 8
        if mention["reference"]:
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


def usable_antecedent(mention: dict[str, Any]) -> bool:
    tokens = re.findall(r"[a-z0-9]+", (mention.get("text") or "").lower())
    if not tokens:
        return False
    # OCR/layout debris such as a lone "T" must never become an entity even
    # when both models happen to agree on it.
    if len(tokens) == 1 and len(tokens[0]) <= 2:
        return False
    return True


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
    def __init__(self, path: Path, enabled: bool = True) -> None:
        self.path = path
        self.enabled = enabled
        self.rows: dict[str, dict[str, Any]] = {}
        if enabled and path.exists():
            for line in path.read_text("utf-8", errors="ignore").splitlines():
                try:
                    row = json.loads(line)
                    self.rows[row["key"]] = row
                except (json.JSONDecodeError, KeyError):
                    pass

    def call(self, operation: str, model: str, prompt: str, max_tokens: int, client: OpenAI) -> tuple[str, dict[str, Any], bool]:
        request: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": max_tokens,
            "extra_body": {"provider": {"sort": "price"}},
        }
        # ID selection does not benefit from hundreds of billed thinking
        # tokens. OpenRouter maps effort=none to Gemini's thinking-off mode.
        if model.startswith("google/gemini-"):
            request["extra_body"]["reasoning"] = {"effort": "none"}
        key = hashlib.sha256(json.dumps(
            [CACHE_VERSION, operation, request], sort_keys=True, ensure_ascii=False
        ).encode()).hexdigest()
        if self.enabled and key in self.rows:
            row = self.rows[key]
            return row["output"], row["usage"], True
        response = client.chat.completions.create(**request)
        output = response.choices[0].message.content or ""
        usage = response.model_dump().get("usage") or {}
        row = {"key": key, "operation": operation, "model": model, "output": output, "usage": usage, "created_at": time.time()}
        if self.enabled:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(row, ensure_ascii=False) + "\n")
            self.rows[key] = row
        return output, usage, False


def parse_answers(output: str, ids: set[str]) -> dict[str, str]:
    answers: dict[str, str] = {}
    for match in re.finditer(r"(?im)^\s*(r\d+)\s*\|\s*(x\d+|(?:m|e)_[0-9a-f]+|\?)\s*$", output.replace("`", "")):
        if match.group(1) in ids:
            answers[match.group(1)] = match.group(2)
    return answers


def canonical_answer(answer: str, row: dict[str, Any]) -> str:
    """Accept either a source-mention ID or its displayed canonical entity ID."""
    if answer == "?":
        return answer
    for mention in row["options"]:
        prompt_id = row["prompt_ids"].get(mention["entity_id"])
        if answer in {mention["id"], mention["entity_id"], prompt_id}:
            return mention["entity_id"]
    # A model must never invent an antecedent. Treat an unknown ID as unsure.
    return "?"


def collapse_reference_answers(rows: list[dict[str, Any]], answers: dict[str, str]) -> dict[str, str]:
    """Follow links through earlier references to the explicit source mention."""
    links = {
        row["ref"]["entity_id"]: answers[row["rid"]]
        for row in rows
        if row["rid"] in answers
        and answers[row["rid"]] != "?"
        # A definite phrase and a standalone pronoun denote their antecedent.
        # A possessive NP denotes a new thing plus an owner: "His tomb" is a
        # tomb, so a later "it" must not collapse to the man who owned it.
        and row["ref"]["reference_kind"] != "possessive"
    }
    collapsed: dict[str, str] = {}
    for request_id, answer in answers.items():
        seen = set()
        while answer in links and answer not in seen:
            seen.add(answer)
            answer = links[answer]
        collapsed[request_id] = "?" if answer in seen else answer
    return collapsed


def cost(usage: dict[str, Any], model: str) -> float:
    raw = usage.get("cost") or usage.get("cost_details", {}).get("upstream_inference_cost")
    if raw is not None:
        return float(raw)
    rates = RATES[model]
    return (int(usage.get("prompt_tokens") or 0) * rates[0] + int(usage.get("completion_tokens") or 0) * rates[1]) / 1_000_000


def marked_source(rows: list[dict[str, Any]]) -> str:
    """Render merged discourse blocks plus tiny distant-candidate snippets."""
    text = rows[0]["source_text"]
    intervals = []
    for row in rows:
        ref = row["ref"]
        intervals.append((max(0, ref["reading_start"] - 420), min(len(text), ref["reading_end"] + 160)))
        intervals.extend(
            (max(0, option["reading_start"] - 35), min(len(text), option["reading_end"] + 55))
            for option in row["options"]
        )
    merged: list[list[int]] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1] + 40:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    insertions: dict[int, list[str]] = {}
    for row in rows:
        ref = row["ref"]
        insertions.setdefault(ref["reading_start"], []).append(f"[[{row['rid']}:")
        insertions.setdefault(ref["reading_end"], []).append("]]" )
    blocks = []
    for start, end in merged:
        rendered = []
        for index in range(start, end + 1):
            if index in insertions:
                rendered.extend(insertions[index])
            if index < end:
                rendered.append(text[index])
        blocks.append("".join(rendered))
    return "\n…\n".join(blocks).replace("|", "/")


def make_prompt(
    rows: list[dict[str, Any]],
    prefix: str,
    votes: dict[str, tuple[str, str]] | None = None,
) -> str:
    entities: dict[str, dict[str, Any]] = {}
    for row in rows:
        for mention in row["options"]:
            entities.setdefault(mention["entity_id"], mention)
    entity_rows = [
        f"{rows[0]['prompt_ids'][entity_id]}|{mention['text'].replace('|', '/')}|p{mention['page']}:{mention['start']}"
        for entity_id, mention in entities.items()
    ]
    request_rows = []
    for row in rows:
        option_ids = ",".join(row["prompt_ids"][mention["entity_id"]] for mention in row["options"])
        request = f"{row['rid']}|{row['ref']['reference_kind']}|{option_ids},?"
        if votes and row["rid"] in votes:
            rendered_votes = [row["prompt_ids"].get(vote, vote) for vote in votes[row["rid"]]]
            request += f"|votes={rendered_votes[0]},{rendered_votes[1]}"
        request_rows.append(request)
    return (
        prefix
        + "\n\nSOURCE:\n" + marked_source(rows)
        + "\n\nENTITIES:\n" + "\n".join(entity_rows)
        + "\n\nREQUESTS:\n" + "\n".join(request_rows)
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--pages", required=True, help="comma-separated source pages; include left context")
    parser.add_argument("--resolve-pages", required=True, help="comma-separated pages whose references are scored")
    parser.add_argument("--max-references", type=int, default=36)
    parser.add_argument("--max-cost-usd", type=float, default=0.01)
    parser.add_argument("--target-spans-json", default=None, help="optional JSON list of {page,start,end}; resolve only overlapping references")
    parser.add_argument("--cache-file", default=str(DEFAULT_CACHE))
    parser.add_argument("--no-cache", action="store_true", help="make fresh paid calls for measurement")
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
    canonicalize_local_person_aliases(args.source, mentions)
    refs = [m for m in mentions if m["reference"] and m["page"] in resolve_pages]
    if args.target_spans_json:
        target_spans = json.loads(args.target_spans_json)
        refs = [
            mention for mention in refs
            if any(
                int(span["page"]) == mention["page"]
                and int(span["start"]) < mention["end"]
                and int(span["end"]) > mention["start"]
                for span in target_spans
            )
        ]
    work = []
    for ref in refs:
        options = candidates_for(ref, mentions)
        if options:
            work.append({"ref": ref, "options": options, "source_text": text})
    if len(work) > args.max_references:
        raise SystemExit(
            f"page window has {len(work)} resolvable references, above --max-references {args.max_references}; "
            "refusing to truncate discourse coverage"
        )
    for index, row in enumerate(work, start=1):
        row["rid"] = f"r{index:03d}"
    prompt_ids: dict[str, str] = {}
    for row in work:
        for mention in row["options"]:
            prompt_ids.setdefault(mention["entity_id"], f"x{len(prompt_ids) + 1}")
        row["prompt_ids"] = prompt_ids
    prompt_prefix = """Resolve the marked references while reading SOURCE as one continuous narrative. Track discourse subjects across sentences. A marker looks like [[r001:His tomb]]. For every REQUEST, copy exactly one allowed short ID or ?. Possessives resolve their owner: "His tomb" and "his books" choose the person denoted by His. Never choose a place for he/his. A newly introduced role or list member is not coreference; Girls' Home is not Old Age Home. Use only SOURCE and ENTITIES. Return ? when genuinely unclear. Output exactly one line per request: rNNN|xN or rNNN|?. No explanation."""
    load_dotenv(BACKEND / ".env")
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is required")
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1", timeout=180, max_retries=0)
    cache = Cache(Path(args.cache_file).expanduser().resolve(), enabled=not args.no_cache)
    total_cost = 0.0
    uncached_equivalent_cost = 0.0
    usage_rows = []
    answers_by_model: dict[str, dict[str, str]] = {}
    for operation, model in [("primary", "google/gemini-2.5-flash-lite"), ("audit", "qwen/qwen3-30b-a3b-instruct-2507")]:
        prompt = make_prompt(work, prompt_prefix)
        max_tokens = min(1600, max(96, 48 + len(work) * 12))
        output, usage, hit = cache.call(operation, model, prompt, max_tokens, client)
        value = cost(usage, model)
        uncached_equivalent_cost += value
        total_cost += 0 if hit else value
        usage_rows.append({
            "operation": operation, "model": model, "cache_hit": hit,
            "cost": value, "prompt_chars": len(prompt), "usage": usage, "output": output,
        })
        raw_answers = parse_answers(output, {row["rid"] for row in work})
        answers_by_model[operation] = {
            row["rid"]: canonical_answer(raw_answers[row["rid"]], row)
            for row in work if row["rid"] in raw_answers
        }
        answers_by_model[operation] = collapse_reference_answers(work, answers_by_model[operation])
    final = {}
    disagreements = [
        row for row in work
        if row["rid"] not in answers_by_model["primary"]
        or row["rid"] not in answers_by_model["audit"]
        or answers_by_model["primary"][row["rid"]] != answers_by_model["audit"][row["rid"]]
    ]
    if disagreements:
        quality_prefix = prompt_prefix + "\nThe two cheap votes are advisory. Adjudicate only these disagreements."
        votes = {
            row["rid"]: (
                answers_by_model["primary"].get(row["rid"], "?"),
                answers_by_model["audit"].get(row["rid"], "?"),
            )
            for row in disagreements
        }
        quality_rows = []
        for row in disagreements:
            allowed = {
                votes[row["rid"]][0], votes[row["rid"]][1],
                row["options"][0]["entity_id"],
            } - {"?"}
            quality_rows.append({
                **row,
                "options": [mention for mention in row["options"] if mention["entity_id"] in allowed],
            })
        prompt = make_prompt(quality_rows, quality_prefix, votes=votes)
        max_tokens = min(1200, max(80, 40 + len(disagreements) * 12))
        output, usage, hit = cache.call("quality", "google/gemini-2.5-flash", prompt, max_tokens, client)
        value = cost(usage, "google/gemini-2.5-flash")
        uncached_equivalent_cost += value
        total_cost += 0 if hit else value
        usage_rows.append({
            "operation": "quality", "model": "google/gemini-2.5-flash", "cache_hit": hit,
            "cost": value, "prompt_chars": len(prompt), "usage": usage, "output": output,
        })
        raw_quality = parse_answers(output, {row["rid"] for row in quality_rows})
        quality = {
            row["rid"]: canonical_answer(raw_quality[row["rid"]], row)
            for row in quality_rows if row["rid"] in raw_quality
        }
        agreed_context = {
            row["rid"]: answers_by_model["primary"][row["rid"]]
            for row in work
            if row not in disagreements and row["rid"] in answers_by_model["primary"]
        }
        collapsed_quality = collapse_reference_answers(work, {**agreed_context, **quality})
        quality = {
            row["rid"]: collapsed_quality.get(row["rid"], "?")
            for row in disagreements
        }
    else:
        quality = {}
    if total_cost > args.max_cost_usd:
        raise SystemExit(f"cost ${total_cost:.6f} exceeded cap ${args.max_cost_usd:.6f}")
    chosen_by_rid = {
        row["rid"]: (
            answers_by_model["primary"].get(row["rid"], "?")
            if answers_by_model["primary"].get(row["rid"], "?") == answers_by_model["audit"].get(row["rid"], "?")
            else quality.get(row["rid"], "?")
        )
        for row in work
    }
    chosen_by_rid = collapse_reference_answers(work, chosen_by_rid)
    entity_mentions: dict[str, dict[str, Any]] = {}
    for mention in mentions:
        current = entity_mentions.get(mention["entity_id"])
        if current is None or (current["reference"] and not mention["reference"]):
            entity_mentions[mention["entity_id"]] = mention
    for row in work:
        primary = answers_by_model["primary"].get(row["rid"], "?")
        audit = answers_by_model["audit"].get(row["rid"], "?")
        chosen = chosen_by_rid[row["rid"]]
        target = entity_mentions.get(chosen)
        final[row["rid"]] = {"reference": row["ref"], "options": row["options"], "primary": primary, "audit": audit, "chosen": chosen, "antecedent": target,
                             "verdict": "agreed" if primary == audit and chosen != "?" else "quality" if chosen != "?" else "ambiguous"}
    output_dir = OUT_DIR / args.source
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"pages-{'-'.join(map(str, page_ids))}-resolve-{'-'.join(map(str, sorted(resolve_pages)))}.json"
    output_path.write_text(json.dumps({
        "source": args.source, "pages": page_ids, "resolve_pages": sorted(resolve_pages),
        "mentions": mentions, "results": final, "usage": usage_rows,
        "cache": {"enabled": cache.enabled, "path": str(cache.path)},
        "paid_cost_usd": total_cost,
        "uncached_equivalent_cost_usd": uncached_equivalent_cost,
    }, ensure_ascii=False, indent=2) + "\n", "utf-8")
    summary = [{"reference": row["reference"]["text"], "page": row["reference"]["page"], "antecedent": (row["antecedent"] or {}).get("text"), "verdict": row["verdict"]} for row in final.values()]
    print(json.dumps({"output": str(output_path), "references": len(final), "resolved": sum(row["verdict"] != "ambiguous" for row in final.values()), "paid_cost_usd": total_cost, "uncached_equivalent_cost_usd": uncached_equivalent_cost, "summary": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
