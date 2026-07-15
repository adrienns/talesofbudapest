#!/usr/bin/env python3
"""Cost-aware LangExtract pilot for grounded historical clauses.

Keeps V2 untouched. Produces private pilot JSONL plus a comparison report.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

import langextract as lx
from dotenv import load_dotenv
from langextract.core import exceptions as lx_exceptions
from langextract.core import types as lx_types
from langextract.providers.openai import OpenAILanguageModel
from langextract.providers.schemas.openai import OpenAISchema
from openai import OpenAI


BACKEND = Path(__file__).resolve().parents[1]
WORKSPACE = BACKEND.parent
EXTRACTIONS = WORKSPACE / "ingest/corpus/restricted/extractions"
TEXT_DIR = WORKSPACE / "ingest/corpus/restricted/text"
ROW_SEPARATOR = "|"
VALID_KINDS = {"E", "A"}
VALID_POLARITIES = {"+", "N", "?"}
VALID_MODALITIES = {"asserted", "reported", "believed", "planned", "hypothetical", "uncertain"}
REFERENCE_PREFIX = re.compile(r"^(he|his|him|she|her|hers|they|their|them|it|its)\b", re.IGNORECASE)
CACHE_VERSION = "historical-langextract-v1"
REQUEST_TIMEOUT_SECONDS = 180.0


@dataclasses.dataclass(frozen=True)
class Coordinate:
    page: int
    raw_start: int
    raw_end: int


class BudgetExceeded(RuntimeError):
    pass


class JsonlResponseCache:
    """Small durable cache keyed by the complete model request."""

    def __init__(self, path: Path, enabled: bool = True) -> None:
        self.path = path
        self.enabled = enabled
        self._lock = threading.Lock()
        self._rows: dict[str, dict[str, Any]] = {}
        if not enabled or not path.exists():
            return
        for line in path.read_text("utf-8", errors="ignore").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("cache_key") and isinstance(row.get("output"), str):
                self._rows[row["cache_key"]] = row

    @staticmethod
    def key(operation: str, request: dict[str, Any]) -> str:
        canonical = json.dumps(
            {"version": CACHE_VERSION, "operation": operation, "request": request},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def get(self, operation: str, request: dict[str, Any]) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        return self._rows.get(self.key(operation, request))

    def put(self, operation: str, request: dict[str, Any], output: str, usage: dict[str, Any]) -> None:
        if not self.enabled:
            return
        cache_key = self.key(operation, request)
        row = {
            "cache_key": cache_key,
            "operation": operation,
            "model": request.get("model"),
            "output": output,
            "usage": usage,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        with self._lock:
            if cache_key in self._rows:
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(row, ensure_ascii=False) + "\n")
            self._rows[cache_key] = row


def unwrap_json_output(output: str) -> str:
    """Accept raw or fenced JSON, while rejecting prose and partial JSON."""
    candidate = output.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", candidate, flags=re.IGNORECASE)
    if fenced:
        candidate = fenced.group(1).strip()
    json.loads(candidate)
    return candidate


class MeteredOpenAIModel(OpenAILanguageModel):
    """OpenAI-compatible LangExtract provider that retains OpenRouter usage."""

    def __init__(self, *args: Any, max_cost_usd: float, cache: JsonlResponseCache, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # A stalled response must not hold the whole-book checkpoint forever.
        # No automatic transport retry: a timed-out provider may still bill it.
        self._client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            organization=self.organization,
            timeout=REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
        self.max_cost_usd = max_cost_usd
        self.cache = cache
        self.usage = {
            "calls": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "invalid_json_retries": 0,
            "invalid_json_failures": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cost": 0.0,
            "saved_prompt_tokens": 0,
            "saved_completion_tokens": 0,
            "saved_cost": 0.0,
        }
        self._usage_lock = threading.Lock()

    def _process_single_prompt(self, prompt: str, config: dict) -> lx_types.ScoredOutput:
        last_output = ""
        for attempt in range(2):
            with self._usage_lock:
                if self.usage["cost"] >= self.max_cost_usd:
                    raise BudgetExceeded(f"LangExtract pilot reached ${self.max_cost_usd:.4f} cap")
            try:
                retry_prompt = prompt if attempt == 0 else f"{prompt}\n\nRETRY: Return complete, shorter JSON. Close every string, array, and object."
                request = self._build_chat_completions_params(retry_prompt, config)
                cached = self.cache.get("primary", request)
                if cached:
                    try:
                        clean_output = unwrap_json_output(cached["output"])
                    except json.JSONDecodeError:
                        cached = None
                    else:
                        cached_usage = cached.get("usage") or {}
                        with self._usage_lock:
                            self.usage["cache_hits"] += 1
                            self.usage["saved_prompt_tokens"] += int(cached_usage.get("prompt_tokens") or 0)
                            self.usage["saved_completion_tokens"] += int(cached_usage.get("completion_tokens") or 0)
                            self.usage["saved_cost"] += float(cached_usage.get("cost") or 0)
                        return lx_types.ScoredOutput(score=1.0, output=clean_output)
                with self._usage_lock:
                    self.usage["cache_misses"] += 1
                response = self._client.chat.completions.create(**request)
                dumped = response.model_dump()
                usage = dumped.get("usage") or {}
                cost = usage.get("cost") or usage.get("cost_details", {}).get("upstream_inference_cost") or 0.0
                last_output = response.choices[0].message.content or ""
                with self._usage_lock:
                    self.usage["calls"] += 1
                    self.usage["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
                    self.usage["completion_tokens"] += int(usage.get("completion_tokens") or 0)
                    self.usage["total_tokens"] += int(usage.get("total_tokens") or 0)
                    self.usage["cost"] += float(cost)
                    if self.usage["cost"] > self.max_cost_usd:
                        raise BudgetExceeded(f"LangExtract pilot exceeded ${self.max_cost_usd:.4f} cap")
                try:
                    clean_output = unwrap_json_output(last_output)
                    self.cache.put(
                        "primary",
                        request,
                        clean_output,
                        {
                            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                            "completion_tokens": int(usage.get("completion_tokens") or 0),
                            "total_tokens": int(usage.get("total_tokens") or 0),
                            "cost": float(cost),
                        },
                    )
                    return lx_types.ScoredOutput(score=1.0, output=clean_output)
                except json.JSONDecodeError:
                    if attempt == 0:
                        with self._usage_lock:
                            self.usage["invalid_json_retries"] += 1
                        continue
            except (BudgetExceeded, lx_exceptions.InferenceConfigError):
                raise
            except Exception as error:
                raise lx_exceptions.InferenceRuntimeError(f"OpenRouter-compatible LangExtract call failed: {error}", original=error) from error
        with self._usage_lock:
            self.usage["invalid_json_failures"] += 1
        raise lx_exceptions.InferenceRuntimeError(
            "OpenRouter returned invalid JSON twice; refusing to pass a partial chunk to LangExtract"
        )


def parse_pages(text: str) -> dict[int, str]:
    return {
        int(match.group(1)): match.group(2).strip()
        for match in re.finditer(r"--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)", text)
    }


def english_words() -> set[str]:
    dictionary = Path("/usr/share/dict/words")
    if not dictionary.exists():
        return set()
    return {word.strip().lower() for word in dictionary.read_text("utf-8", errors="ignore").splitlines() if word.strip().isalpha()}


def boundary_repair(previous_page: int, previous: str, next_page: int, following: str, words: set[str]) -> dict[str, Any] | None:
    suffix_match = re.match(r"\s*([a-z]{3,})", following)
    if not suffix_match:
        return None
    suffix = suffix_match.group(1)
    tail_start = max(0, len(previous) - 1800)
    candidates = []
    def recognized(word: str) -> bool:
        stems = {word}
        if word.endswith("ed"):
            stems.update({word[:-2], word[:-1]})
        if word.endswith("ing"):
            stems.update({word[:-3], word[:-3] + "e"})
        if word.endswith("s"):
            stems.add(word[:-1])
        return not words or any(stem in words for stem in stems)
    for match in re.finditer(r"\b([A-Za-z]{2,})-[ \t]*\n", previous[tail_start:]):
        prefix = match.group(1)
        joined = (prefix + suffix).lower()
        if recognized(joined):
            raw_hyphen = tail_start + match.start(0) + len(prefix)
            candidates.append((raw_hyphen, prefix, joined))
    if not candidates:
        return None
    raw_hyphen, prefix, joined = candidates[-1]
    return {
        "normalized_text": joined,
        "previous_page": previous_page,
        "previous_end": raw_hyphen,
        "previous_fragment": {"page": previous_page, "start_offset": raw_hyphen - len(prefix), "end_offset": raw_hyphen + 1, "text": previous[raw_hyphen - len(prefix):raw_hyphen + 1]},
        "next_page": next_page,
        "next_start": suffix_match.start(1),
        "next_fragment": {"page": next_page, "start_offset": suffix_match.start(1), "end_offset": suffix_match.end(1), "text": following[suffix_match.start(1):suffix_match.end(1)]},
    }


def normalize_slice(page: int, source: str, start: int, end: int) -> tuple[list[str], list[Coordinate]]:
    chars: list[str] = []
    coordinates: list[Coordinate] = []

    def append(char: str, raw_start: int, raw_end: int) -> None:
        if char.isspace():
            if not chars:
                return
            if chars[-1] == " ":
                coordinates[-1] = Coordinate(page, coordinates[-1].raw_start, raw_end)
                return
            char = " "
        chars.append(char)
        coordinates.append(Coordinate(page, raw_start, raw_end))

    index = start
    while index < end:
        if source[index] == "-" and index > start and source[index - 1].isalpha():
            cursor = index + 1
            while cursor < end and source[cursor] in " \t\r":
                cursor += 1
            if cursor < end and source[cursor] == "\n":
                cursor += 1
                while cursor < end and source[cursor].isspace():
                    cursor += 1
                if cursor < end and source[cursor].isalpha():
                    index = cursor
                    continue
        if source[index].isspace():
            cursor = index + 1
            while cursor < end and source[cursor].isspace():
                cursor += 1
            append(" ", index, cursor)
            index = cursor
            continue
        append(source[index], index, index + 1)
        index += 1
    return chars, coordinates


def build_normalized_document(pages: dict[int, str], from_page: int, page_count: int, context_chars: int) -> tuple[str, list[Coordinate | None], list[dict[str, Any]]]:
    selected = list(range(from_page - 1, from_page + page_count))
    missing = [page for page in selected if page not in pages]
    if missing:
        raise ValueError(f"missing source pages: {missing}")
    words = english_words()
    repairs = {
        page: repair
        for page in selected[:-1]
        if (repair := boundary_repair(page, pages[page], page + 1, pages[page + 1], words))
    }
    chars: list[str] = []
    coordinates: list[Coordinate | None] = []
    repair_rows: list[dict[str, Any]] = []
    for index, page in enumerate(selected):
        source = pages[page]
        start = max(0, len(source) - context_chars) if page == from_page - 1 else 0
        end = repairs.get(page, {}).get("previous_end", len(source))
        normalized, mapped = normalize_slice(page, source, start, end)
        chars.extend(normalized)
        coordinates.extend(mapped)
        repair = repairs.get(page)
        if repair:
            repair_rows.append(repair)
        elif index < len(selected) - 1:
            chars.extend(["\n", "\n"])
            coordinates.extend([None, None])
    return "".join(chars), coordinates, repair_rows


def evidence_for_span(start: int, end: int, coordinates: list[Coordinate | None], pages: dict[int, str]) -> list[dict[str, Any]]:
    grouped: list[dict[str, int]] = []
    for coordinate in coordinates[start:end]:
        if coordinate is None:
            continue
        if grouped and grouped[-1]["page"] == coordinate.page:
            grouped[-1]["start_offset"] = min(grouped[-1]["start_offset"], coordinate.raw_start)
            grouped[-1]["end_offset"] = max(grouped[-1]["end_offset"], coordinate.raw_end)
        else:
            grouped.append({"page": coordinate.page, "start_offset": coordinate.raw_start, "end_offset": coordinate.raw_end})
    return [
        {
            "page_ref": row["page"],
            "start_offset": row["start_offset"],
            "end_offset": row["end_offset"],
            "quote": pages[row["page"]][row["start_offset"]:row["end_offset"]],
        }
        for row in grouped
    ]


def examples() -> list[lx.data.ExampleData]:
    return [
        lx.data.ExampleData(
            text="R. Ada became rabbi in 1837. He died in Buda during an epidemic.",
            extractions=[
                lx.data.Extraction(
                    extraction_class="historical_clause",
                    extraction_text="R. Ada became rabbi in 1837.",
                    attributes={"items": ["E|appointment_or_employment|+|asserted|R. Ada|R. Ada|R. Ada became rabbi in 1837."]},
                ),
                lx.data.Extraction(
                    extraction_class="historical_clause",
                    extraction_text="He died in Buda during an epidemic.",
                    attributes={"items": ["E|birth_or_death|+|asserted|He|R. Ada|R. Ada died in Buda during an epidemic."]},
                ),
            ],
        ),
        lx.data.ExampleData(
            text="He maintained that curses cannot be imposed on scholars and errors should be corrected privately.",
            extractions=[
                lx.data.Extraction(
                    extraction_class="historical_clause",
                    extraction_text="He maintained that curses cannot be imposed on scholars and errors should be corrected privately.",
                    attributes={"items": [
                        "A|religious_restriction|N|reported|He|R. Ada|Ritual curses cannot be imposed on scholars.",
                        "A|private_admonishment|+|reported|He|R. Ada|Errors should be corrected privately.",
                    ]},
                )
            ],
        ),
        lx.data.ExampleData(
            text="R. Ada died in Buda. His tomb was visited for many years.",
            extractions=[
                lx.data.Extraction(
                    extraction_class="historical_clause",
                    extraction_text="His tomb was visited for many years.",
                    attributes={"items": ["A|tomb_visitation|+|asserted|His tomb|His tomb|His tomb was visited for many years."]},
                )
            ],
        ),
    ]


PROMPT = """Extract an exhaustive historical ledger from every supplied sentence and clause.

Return one historical_clause extraction for every exact source span containing one or more explicit events or assertions. Assertions include states, customs, rules, relationships, beliefs, attributed reports, and historically relevant descriptions. Ignore headers, page numbers, bibliography, and image captions.

Each historical_clause has an items list. Each item is exactly seven pipe-separated fields:
kind|open_type|polarity|modality|literal_subject|resolved_subject|atomic_statement

Rules:
- kind is E for an event or A for any non-event assertion. open_type is a short normalized free type.
- polarity is +, N, or ? for an uncertain positive claim. modality is asserted, reported, believed, planned, hypothetical, or uncertain.
- extraction_text must be copied exactly from the supplied normalized source.
- literal_subject preserves source wording such as He, His tomb, R. Efraim, or -.
- resolved_subject is the grammatical subject. Resolve a standalone pronoun such as He to its antecedent. For a possessive noun phrase such as His tomb, keep His tomb as the grammatical subject; a later reference stage resolves His separately. Use ? when ambiguous and - when no subject applies. Never use outside knowledge.
- Put every independent fact in its own item row, but reuse one grounded historical_clause when several items share evidence.
- Never place a pipe character inside a field.
- Preserve negation, attribution, uncertainty, and plans. Do not turn a static rule into an event.
"""


def parse_item_row(value: str) -> dict[str, Any] | None:
    columns = [column.strip() for column in value.split(ROW_SEPARATOR)]
    if len(columns) != 7:
        return None
    kind, open_type, polarity, modality, literal_subject, resolved_subject, statement = columns
    if kind not in VALID_KINDS or polarity not in VALID_POLARITIES or modality not in VALID_MODALITIES:
        return None
    if not open_type or not statement or not literal_subject or not resolved_subject:
        return None
    statement_reference = REFERENCE_PREFIX.match(statement)
    literal_reference = REFERENCE_PREFIX.match(literal_subject)
    if statement_reference and literal_reference and literal_subject.split()[0].lower() != statement_reference.group(1).lower():
        # One grounded clause can yield several rows. Do not let the clause's
        # first possessive phrase leak into a later row whose subject is "he".
        literal_subject = statement_reference.group(1)
        resolved_subject = "?"
    resolved_folded = resolved_subject.lower()
    literal_reference = REFERENCE_PREFIX.match(literal_subject)
    standalone_reference = bool(re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", literal_subject, re.IGNORECASE))
    self_resolution = bool(literal_reference and re.sub(r"\W+", "", literal_subject.lower()) == re.sub(r"\W+", "", resolved_folded))
    ambiguous = resolved_subject == "?" or bool(re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", resolved_folded)) or self_resolution
    expletive = literal_subject.lower() == "it" and bool(
        re.match(r"^it (?:is|was|would be) (?:not )?(?:difficult|easy|possible|impossible|likely|clear|customary)\b", statement.lower())
    )
    if expletive:
        ambiguous = False
    risk_flags = []
    if polarity == "N" and not re.search(r"\b(not|no|never|cannot|neither|nor|without|failed|failure)\b", statement.lower()):
        risk_flags.append("polarity_label_without_negation")
    return {
        "kind": "event" if kind == "E" else "assertion",
        "open_type": re.sub(r"[^a-z0-9]+", "_", open_type.lower()).strip("_")[:80],
        "polarity": "negated" if polarity == "N" else "affirmed",
        "modality": "uncertain" if polarity == "?" else modality,
        "literal_subject": None if literal_subject == "-" else literal_subject,
        "resolved_subject": None if resolved_subject in {"-", "?"} or (ambiguous and standalone_reference) else resolved_subject,
        "reference_antecedent": resolved_subject if literal_reference and not ambiguous and not expletive else None,
        "reference_status": "not_applicable" if expletive else "ambiguous" if ambiguous else "model_subject" if resolved_subject != "-" else "not_applicable",
        "reference_resolution_source": "primary_model" if literal_reference and not ambiguous and not expletive else None,
        "statement_en": statement,
        "risk_flags": risk_flags,
    }


def reference_group_key(item: dict[str, Any]) -> tuple[int, int, int, str] | None:
    literal = item.get("literal_subject") or ""
    if not REFERENCE_PREFIX.match(literal):
        return None
    evidence = (item.get("evidence") or [None])[0]
    if not evidence:
        return None
    return (int(evidence["page_ref"]), int(evidence["start_offset"]), int(evidence["end_offset"]), literal.lower())


def reference_context(pages: dict[int, str], key: tuple[int, int, int, str]) -> str:
    page, start, end, _ = key
    page_text = pages.get(page, "")
    prefix = page_text[max(0, start - 750):start]
    if start < 350 and pages.get(page - 1):
        prefix = pages[page - 1][-750:] + " " + prefix
    return re.sub(r"\s+", " ", f"{prefix} [[{page_text[start:end]}]] {page_text[end:min(len(page_text), end + 160)]}").strip()


def apply_reference_guards(items: list[dict[str, Any]], pages: dict[int, str]) -> dict[str, int]:
    guarded = {
        "subject_leakage_repaired": 0,
        "self_resolution_rejected": 0,
        "expletives_removed": 0,
        "ordinals_completed": 0,
        "kinship_escalated": 0,
        "local_discourse_resolved": 0,
    }
    for item in items:
        literal = item.get("literal_subject") or ""
        statement_match = REFERENCE_PREFIX.match(item.get("statement_en") or "")
        literal_match = REFERENCE_PREFIX.match(literal)
        if statement_match and literal_match and literal.split()[0].lower() != statement_match.group(1).lower():
            item["literal_subject"] = statement_match.group(1)
            item["resolved_subject"] = None
            item["reference_antecedent"] = None
            item["reference_status"] = "ambiguous"
            item["reference_resolution_source"] = None
            literal = item["literal_subject"]
            guarded["subject_leakage_repaired"] += 1
        if "kinship_coreference" in (item.get("risk_flags") or []):
            item["risk_flags"] = [flag for flag in item["risk_flags"] if flag != "kinship_coreference"]
        if not REFERENCE_PREFIX.match(literal):
            continue
        antecedent = item.get("reference_antecedent") or ""
        if re.sub(r"\W+", "", antecedent.lower()) == re.sub(r"\W+", "", literal.lower()) or re.fullmatch(
            r"he|his|him|she|her|hers|they|their|them|it|its", antecedent, re.IGNORECASE
        ):
            item["reference_antecedent"] = None
            item["reference_status"] = "ambiguous"
            item["reference_resolution_source"] = None
            guarded["self_resolution_rejected"] += 1
            continue
        if re.match(r"^it (?:is|was)\b", literal, re.IGNORECASE) and len(literal.split()) > 2:
            item["reference_antecedent"] = None
            item["reference_status"] = "not_applicable"
            item["reference_resolution_source"] = "deterministic_expletive_guard"
            guarded["expletives_removed"] += 1
            continue
        key = reference_group_key(item)
        context = reference_context(pages, key) if key else ""
        ordinal = re.fullmatch(r"(?:the\s+)?(first|second|third|fourth|fifth)", antecedent, re.IGNORECASE)
        if ordinal:
            completion = re.search(rf"\bthe\s+{re.escape(ordinal.group(1))}\s+([A-Za-z][A-Za-z-]+)", context, re.IGNORECASE)
            if completion:
                noun = completion.group(1).lower()
                if noun in {"may", "might", "could", "would", "should", "can", "was", "is"}:
                    before_ordinal = context[:completion.start()]
                    counted_nouns = re.findall(r"\b(?:one|two|three|four|five|\d+)\s+([A-Za-z][A-Za-z-]+)", before_ordinal, re.IGNORECASE)
                    if counted_nouns:
                        noun = counted_nouns[-1].lower()
                        if noun.endswith("s") and not noun.endswith("ss"):
                            noun = noun[:-1]
                if noun not in {"may", "might", "could", "would", "should", "can", "was", "is"}:
                    item["reference_antecedent"] = f"the {ordinal.group(1).lower()} {noun}"
                    guarded["ordinals_completed"] += 1
        standalone = bool(re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", literal, re.IGNORECASE))
        pre_target = context.split("[[", 1)[0][-350:]
        kinship_scope = f"{literal} {pre_target}"
        if not standalone and re.search(r"\b(father|mother|son|daughter|brother|sister|husband|wife)\b", kinship_scope, re.IGNORECASE):
            flags = item.setdefault("risk_flags", [])
            if "kinship_coreference" not in flags:
                flags.append("kinship_coreference")
            source = item.get("reference_resolution_source")
            quality_resolved = (
                item.get("reference_status") == "resolved_reference"
                and source not in {None, "primary_model", "local_discourse_carry_forward"}
            )
            if not quality_resolved:
                item["reference_antecedent"] = None
                item["reference_status"] = "ambiguous"
                item["reference_resolution_source"] = None
                guarded["kinship_escalated"] += 1

    # Cheap discourse memory: an unresolved pronoun immediately following an
    # explicitly resolved person inherits that person. This is generic across
    # books and preserves the noun phrase as subject ("His tomb") while storing
    # the possessor separately. Kinship cases stay escalated instead of guessed.
    spans: dict[tuple[int, int, int], list[dict[str, Any]]] = {}
    for item in items:
        evidence = (item.get("evidence") or [None])[0]
        if evidence:
            spans.setdefault(
                (int(evidence["page_ref"]), int(evidence["start_offset"]), int(evidence["end_offset"])), []
            ).append(item)
    last_person: dict[int, tuple[int, str]] = {}
    person_prefix = re.compile(r"^(?:R\.|Rabbi\b|Dr\.|Mr\.|Mrs\.|Saint\b|St\.)", re.IGNORECASE)
    for (page, start, end), span_items in sorted(spans.items()):
        previous = last_person.get(page)
        if previous and start - previous[0] <= 320:
            antecedent = previous[1]
            for item in span_items:
                literal = item.get("literal_subject") or ""
                flags = item.get("risk_flags") or []
                if (
                    item.get("reference_status") == "ambiguous"
                    and REFERENCE_PREFIX.match(literal)
                    and "kinship_coreference" not in flags
                ):
                    item["reference_antecedent"] = antecedent
                    item["reference_status"] = "resolved_reference"
                    item["reference_resolution_source"] = "local_discourse_carry_forward"
                    if re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", literal, re.IGNORECASE):
                        item["resolved_subject"] = antecedent
                    guarded["local_discourse_resolved"] += 1

        candidates = []
        for item in span_items:
            candidate = item.get("reference_antecedent") or item.get("resolved_subject") or ""
            literal = item.get("literal_subject") or ""
            if candidate and (
                person_prefix.match(candidate)
                or (re.fullmatch(r"he|his|him|she|her|hers|they|their|them", literal, re.IGNORECASE)
                    and item.get("reference_status") != "ambiguous")
            ):
                candidates.append(candidate)
        if candidates:
            last_person[page] = (end, candidates[-1])
    return guarded


def resolve_reference_antecedents(
    items: list[dict[str, Any]],
    pages: dict[int, str],
    api_key: str,
    model_id: str,
    max_cost_usd: float,
    cache: JsonlResponseCache,
    batch_size: int = 12,
) -> dict[str, Any]:
    pre_guards = apply_reference_guards(items, pages)
    groups: dict[tuple[int, int, int, str], list[dict[str, Any]]] = {}
    for item in items:
        key = reference_group_key(item)
        literal = item.get("literal_subject") or ""
        standalone = bool(re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", literal, re.IGNORECASE))
        primary_possessive = (
            not standalone
            and item.get("reference_resolution_source") == "primary_model"
            and item.get("reference_antecedent")
        )
        needs_remote = item.get("reference_status") == "ambiguous" or primary_possessive
        if key is not None and needs_remote:
            groups.setdefault(key, []).append(item)
    if not groups:
        return {
            "model": model_id,
            "groups": 0,
            "batches": 0,
            "resolved": 0,
            "ambiguous": 0,
            "not_applicable": 0,
            "usage": {"calls": 0, "cache_hits": 0, "cache_misses": 0, "cost": 0.0, "saved_cost": 0.0},
            "guards": pre_guards,
        }

    instruction = """Resolve only the antecedent of the leading pronoun or possessive in each literal subject.
The context target is inside [[double brackets]]. A possessive phrase has a grammatical subject and a different reference antecedent: in 'His tomb', return the person denoted by His, not the tomb. For standalone He/They, return the entity denoted by the pronoun. Never repeat the literal pronoun or possessive phrase as the answer. Return - for an expletive with no referent and ? if genuinely ambiguous. Use only explicitly visible context.

Examples: 'His tomb' after 'Efraim died' -> Efraim. 'his non-Jewish contemporaries' in a paragraph about Shabbetai Tzvi -> Shabbetai Tzvi. Standalone 'He' after 'R. Noah' -> R. Noah.

Return every ID exactly once as ID|antecedent. No JSON, markdown, explanation, or extra pipes.
"""
    client = OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        timeout=REQUEST_TIMEOUT_SECONDS,
        max_retries=0,
    )
    totals = {
        "calls": 0,
        "cache_hits": 0,
        "cache_misses": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cost": 0.0,
        "saved_prompt_tokens": 0,
        "saved_completion_tokens": 0,
        "saved_cost": 0.0,
    }
    unparsed_previews = []
    group_entries = list(groups.items())
    for batch_start in range(0, len(group_entries), max(1, batch_size)):
        batch = group_entries[batch_start:batch_start + max(1, batch_size)]
        id_to_key: dict[str, tuple[int, int, int, str]] = {}
        request_rows = []
        context_ids: dict[tuple[int, int, int], str] = {}
        context_rows = []
        for index, (key, group_items) in enumerate(batch, start=1):
            request_id = f"r{index:03d}"
            id_to_key[request_id] = key
            literal = group_items[0].get("literal_subject") or "-"
            span_key = key[:3]
            if span_key not in context_ids:
                context_id = f"c{len(context_ids) + 1:03d}"
                context_ids[span_key] = context_id
                context_rows.append(f"{context_id}|{reference_context(pages, key).replace('|', '/')}")
            request_rows.append(f"{request_id}|{context_ids[span_key]}|{literal.replace('|', '/')}")
        prompt = instruction + "\nCONTEXTS:\n" + "\n".join(context_rows) + "\n\nREQUESTS:\n" + "\n".join(request_rows)
        request = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": min(400, max(80, 40 + len(batch) * 24)),
        }
        cached = cache.get("reference", request)
        raw_output = cached["output"] if cached else ""
        usage = (cached or {}).get("usage") or {}
        if cached:
            totals["cache_hits"] += 1
            totals["saved_prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
            totals["saved_completion_tokens"] += int(usage.get("completion_tokens") or 0)
            totals["saved_cost"] += float(usage.get("cost") or 0)
        else:
            totals["cache_misses"] += 1
            response = client.chat.completions.create(**request)
            dumped = response.model_dump()
            usage = dumped.get("usage") or {}
            raw_output = response.choices[0].message.content or ""
            cost = float(usage.get("cost") or usage.get("cost_details", {}).get("upstream_inference_cost") or 0.0)
            totals["calls"] += 1
            totals["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
            totals["completion_tokens"] += int(usage.get("completion_tokens") or 0)
            totals["total_tokens"] += int(usage.get("total_tokens") or 0)
            totals["cost"] += cost
            if totals["cost"] > max_cost_usd:
                raise BudgetExceeded(f"reference fallback cost ${totals['cost']:.6f} exceeded ${max_cost_usd:.6f} cap")

        answers: dict[str, str] = {}
        for match in re.finditer(r"(?im)^\s*(?:[-*]\s*)?(r\d{3})\s*\|\s*([^|\r\n]+)", raw_output.replace("```", "")):
            request_id = match.group(1).lower()
            if request_id in id_to_key and request_id not in answers:
                answers[request_id] = match.group(2).strip().strip("`\"'")
        if not answers:
            try:
                parsed_output = json.loads(raw_output)
            except json.JSONDecodeError:
                parsed_output = None
            if isinstance(parsed_output, dict):
                for key, value in parsed_output.items():
                    request_id = str(key).lower()
                    if request_id in id_to_key:
                        answers[request_id] = str(value).strip()
        if not answers:
            unparsed_previews.append(raw_output[:300])
        elif not cached:
            cache.put(
                "reference",
                request,
                raw_output,
                {
                    "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                    "completion_tokens": int(usage.get("completion_tokens") or 0),
                    "total_tokens": int(usage.get("total_tokens") or 0),
                    "cost": cost,
                },
            )
        for request_id, answer in list(answers.items()):
            literal = id_to_key[request_id][3]
            answer_folded = re.sub(r"\W+", "", answer.lower())
            literal_folded = re.sub(r"\W+", "", literal.lower())
            if answer_folded == literal_folded or re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", answer, re.IGNORECASE):
                answers[request_id] = "?"

        for request_id, key in id_to_key.items():
            antecedent = answers.get(request_id, "?")
            status = "not_applicable" if antecedent == "-" else "ambiguous" if antecedent == "?" else "resolved_reference"
            stored_antecedent = None if antecedent in {"-", "?"} else antecedent
            for item in groups[key]:
                item["reference_antecedent"] = stored_antecedent
                item["reference_status"] = status
                item["reference_resolution_source"] = model_id
                literal = item.get("literal_subject") or ""
                if stored_antecedent and re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", literal, re.IGNORECASE):
                    item["resolved_subject"] = stored_antecedent

    post_guards = apply_reference_guards(items, pages)
    guards = {key: pre_guards.get(key, 0) + post_guards.get(key, 0) for key in set(pre_guards) | set(post_guards)}
    resolved = ambiguous = not_applicable = 0
    for group_items in groups.values():
        statuses = {item.get("reference_status") for item in group_items}
        if "ambiguous" in statuses:
            ambiguous += 1
        elif statuses == {"not_applicable"}:
            not_applicable += 1
        else:
            resolved += 1
    return {
        "model": model_id,
        "groups": len(groups),
        "batches": (len(groups) + max(1, batch_size) - 1) // max(1, batch_size),
        "resolved": resolved,
        "ambiguous": ambiguous,
        "not_applicable": not_applicable,
        "usage": totals,
        "guards": guards,
        "unparsed_preview": unparsed_previews[0] if unparsed_previews else None,
    }


def validate_existing_references(source_id: str) -> None:
    item_path = EXTRACTIONS / f"{source_id}.langextract-pilot.jsonl"
    report_path = EXTRACTIONS / f"{source_id}.langextract-pilot.report.json"
    rows = [json.loads(line) for line in item_path.read_text("utf-8").splitlines() if line.strip()]
    run = next(row for row in rows if row.get("record_type") == "run")
    items = [row for row in rows if row.get("record_type") == "item"]
    pages = parse_pages((TEXT_DIR / f"{source_id}.pages.txt").read_text("utf-8"))
    guards = apply_reference_guards(items, pages)
    item_path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in [run, *items]) + "\n", "utf-8")
    report = json.loads(report_path.read_text("utf-8"))
    report.setdefault("reference_resolution", {})["guards"] = guards
    report["extraction"]["unresolved_references"] = sum(1 for item in items if item.get("reference_status") == "ambiguous")
    report["extraction"]["risk_flagged_items"] = sum(1 for item in items if item.get("risk_flags"))
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(json.dumps({"guards": guards, "unresolved": report["extraction"]["unresolved_references"]}, indent=2))


def repair_existing_references(
    source_id: str,
    api_key: str,
    model_id: str,
    max_cost_usd: float,
    cache: JsonlResponseCache,
    batch_size: int,
) -> None:
    item_path = EXTRACTIONS / f"{source_id}.langextract-pilot.jsonl"
    report_path = EXTRACTIONS / f"{source_id}.langextract-pilot.report.json"
    rows = [json.loads(line) for line in item_path.read_text("utf-8").splitlines() if line.strip()]
    run = next(row for row in rows if row.get("record_type") == "run")
    items = [row for row in rows if row.get("record_type") == "item"]
    pages = parse_pages((TEXT_DIR / f"{source_id}.pages.txt").read_text("utf-8"))
    summary = resolve_reference_antecedents(items, pages, api_key, model_id, max_cost_usd, cache, batch_size)
    run["reference_fallback"] = summary
    item_path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in [run, *items]) + "\n", "utf-8")
    report = json.loads(report_path.read_text("utf-8"))
    report["reference_resolution"] = summary
    report["extraction"]["unresolved_references"] = sum(1 for item in items if item.get("reference_status") == "ambiguous")
    report["extraction"]["risk_flagged_items"] = sum(1 for item in items if item.get("risk_flags"))
    primary_cost = float(report.get("usage", {}).get("cost") or 0)
    reference_cost = float(summary.get("usage", {}).get("cost") or 0)
    report["usage"]["reference_cost"] = reference_cost
    report["usage"]["total_cost"] = primary_cost + reference_cost
    report["usage"]["average_total_cost_usd_per_page"] = (primary_cost + reference_cost) / max(1, len(report.get("pages") or []))
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


def latest_v2_baseline(source_id: str, target_pages: set[int]) -> dict[str, Any]:
    path = EXTRACTIONS / f"{source_id}.historical-items-v2.jsonl"
    if not path.exists():
        return {"covered_pages": [], "supported_items": 0, "cost_usd": 0.0}
    latest: dict[int, dict[str, Any]] = {}
    for line in path.read_text("utf-8").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("source_id") != source_id or row.get("status") not in {"complete", "failed_cost_gate"}:
            continue
        for page in set(row.get("pdf_pages") or []) & target_pages:
            if page not in latest or str(row.get("extracted_at") or "") > str(latest[page].get("extracted_at") or ""):
                latest[page] = row
    rows = {row.get("run_id"): row for row in latest.values()}.values()
    supported = {
        item.get("item_id")
        for row in rows
        for item in row.get("items") or []
        if item.get("verification", {}).get("verdict") == "supported"
        and any(evidence.get("page_ref") in target_pages for evidence in item.get("evidence") or [])
    }
    return {
        "covered_pages": sorted(latest),
        "supported_items": len(supported),
        "cost_usd": sum(float(row.get("usage", {}).get("cost") or 0) for row in rows),
    }


def regression_report(items: list[dict[str, Any]]) -> dict[str, Any]:
    checks = {
        "efraim_correspondence": ["correspond"],
        "efraim_curse_rule": ["curse", "scholar"],
        "efraim_private_admonishment": ["private"],
        "efraim_marriage_permission": ["girl", "marriage"],
        "efraim_jerusalem_invitation": ["invited", "jerusalem"],
        "efraim_death": ["died", "epidemic"],
    }
    folded = []
    for item in items:
        evidence_text = " ".join(row.get("quote", "") for row in item.get("evidence") or [])
        searchable = re.sub(r"[^a-z0-9]+", " ", f"{item['statement_en']} {evidence_text}".lower())
        folded.append((item, searchable, (item.get("resolved_subject") or "").lower()))
    return {
        name: any(all(term in statement for term in terms) and "efraim" in subject for _, statement, subject in folded)
        for name, terms in checks.items()
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="jewish-budapest")
    parser.add_argument("--from-page", type=int, default=46)
    parser.add_argument("--page-count", type=int, default=3)
    parser.add_argument("--model", default="qwen/qwen3-30b-a3b-instruct-2507")
    parser.add_argument("--max-cost-usd", type=float, default=0.02)
    parser.add_argument("--max-char-buffer", type=int, default=6000)
    parser.add_argument("--max-output-tokens", type=int, default=7000)
    parser.add_argument("--context-window-chars", type=int, default=1600)
    parser.add_argument("--context-source-chars", type=int, default=2600)
    parser.add_argument("--reference-model", default="google/gemini-2.5-flash")
    parser.add_argument("--max-reference-cost-usd", type=float, default=0.004)
    parser.add_argument("--reference-batch-size", type=int, default=12)
    parser.add_argument("--cache-file", default=str(EXTRACTIONS / "historical-langextract-model-cache.jsonl"))
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--skip-reference-fallback", action="store_true")
    parser.add_argument("--repair-references-only", action="store_true")
    parser.add_argument("--validate-references-only", action="store_true")
    args = parser.parse_args()
    if args.page_count < 1 or args.max_cost_usd <= 0 or args.max_reference_cost_usd <= 0 or args.reference_batch_size < 1:
        raise SystemExit("invalid page count or cost cap")

    cache = JsonlResponseCache(Path(args.cache_file).expanduser().resolve(), enabled=not args.no_cache)
    if args.validate_references_only:
        validate_existing_references(args.source)
        return
    load_dotenv(BACKEND / ".env")
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is required")
    if args.repair_references_only:
        repair_existing_references(
            args.source,
            api_key,
            args.reference_model,
            args.max_reference_cost_usd,
            cache,
            args.reference_batch_size,
        )
        return

    pages = parse_pages((TEXT_DIR / f"{args.source}.pages.txt").read_text("utf-8"))
    normalized_text, coordinates, repairs = build_normalized_document(pages, args.from_page, args.page_count, args.context_source_chars)
    prompt_examples = examples()
    schema = OpenAISchema.from_examples(prompt_examples, strict=True)
    model = MeteredOpenAIModel(
        model_id=args.model,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        openai_schema=schema,
        temperature=0,
        max_workers=1,
        max_output_tokens=args.max_output_tokens,
        max_cost_usd=args.max_cost_usd,
        cache=cache,
    )

    started = time.time()
    result = lx.extract(
        text_or_documents=normalized_text,
        prompt_description=PROMPT,
        examples=prompt_examples,
        model=model,
        max_char_buffer=args.max_char_buffer,
        context_window_chars=args.context_window_chars,
        extraction_passes=1,
        batch_length=1,
        max_workers=1,
        temperature=0,
        show_progress=True,
        resolver_params={"suppress_parse_errors": False, "enable_fuzzy_alignment": True},
    )

    target_pages = set(range(args.from_page, args.from_page + args.page_count))
    items: list[dict[str, Any]] = []
    invalid_rows: list[dict[str, Any]] = []
    grounded_extractions = 0
    extraction_count = len(result.extractions or [])
    for extraction in result.extractions or []:
        interval = extraction.char_interval
        if interval is None or interval.start_pos is None or interval.end_pos is None:
            continue
        grounded_extractions += 1
        evidence = evidence_for_span(interval.start_pos, interval.end_pos, coordinates, pages)
        if not any(row["page_ref"] in target_pages for row in evidence):
            continue
        raw_items = (extraction.attributes or {}).get("items") or []
        if isinstance(raw_items, str):
            raw_items = [raw_items]
        for raw_item in raw_items:
            parsed = parse_item_row(str(raw_item))
            if parsed is None:
                invalid_rows.append({"extraction_text": extraction.extraction_text, "row": raw_item})
                continue
            identity = json.dumps([args.source, interval.start_pos, interval.end_pos, parsed], sort_keys=True, ensure_ascii=False)
            items.append({
                "item_id": f"lx_{hashlib.sha256(identity.encode()).hexdigest()[:20]}",
                **parsed,
                "normalized_span": {"start_offset": interval.start_pos, "end_offset": interval.end_pos, "quote": normalized_text[interval.start_pos:interval.end_pos]},
                "evidence": evidence,
                "grounding_status": str(extraction.alignment_status.value if extraction.alignment_status else "grounded"),
                "publication_status": "private",
            })

    reference_summary = {"model": args.reference_model, "groups": 0, "resolved": 0, "ambiguous": 0, "not_applicable": 0, "usage": {"calls": 0, "cost": 0.0, "saved_cost": 0.0}}
    if not args.skip_reference_fallback:
        remaining_budget = args.max_cost_usd - float(model.usage.get("cost") or 0)
        if remaining_budget <= 0:
            raise BudgetExceeded("no budget remains for required reference fallback")
        reference_summary = resolve_reference_antecedents(
            items,
            pages,
            api_key,
            args.reference_model,
            min(args.max_reference_cost_usd, remaining_budget),
            cache,
            args.reference_batch_size,
        )

    run_id = hashlib.sha256(f"{args.source}:{time.time_ns()}".encode()).hexdigest()[:20]
    item_output = EXTRACTIONS / f"{args.source}.langextract-pilot.jsonl"
    normalized_output = EXTRACTIONS / f"{args.source}.langextract-pilot.normalized.txt"
    report_output = EXTRACTIONS / f"{args.source}.langextract-pilot.report.json"
    item_output.parent.mkdir(parents=True, exist_ok=True)
    with item_output.open("w", encoding="utf-8") as stream:
        stream.write(json.dumps({
            "record_type": "run", "run_id": run_id, "source_id": args.source,
            "pages": sorted(target_pages), "model": args.model, "usage": model.usage,
            "normalization_repairs": repairs, "publication_status": "private",
            "reference_fallback": reference_summary,
            "cache": {"enabled": cache.enabled, "path": str(cache.path)},
        }, ensure_ascii=False) + "\n")
        for item in items:
            stream.write(json.dumps({"record_type": "item", "run_id": run_id, **item}, ensure_ascii=False) + "\n")
    normalized_output.write_text(normalized_text, "utf-8")

    regressions = regression_report(items)
    report = {
        "run_id": run_id,
        "source_id": args.source,
        "pages": sorted(target_pages),
        "model": args.model,
        "elapsed_seconds": round(time.time() - started, 3),
        "normalization": {"cross_page_repairs": repairs, "normalized_characters": len(normalized_text)},
        "extraction": {
            "clause_extractions": extraction_count,
            "grounded_clause_extractions": grounded_extractions,
            "grounded_rate": grounded_extractions / extraction_count if extraction_count else 0,
            "valid_items": len(items),
            "invalid_item_rows": len(invalid_rows),
            "schema_valid_rate": len(items) / (len(items) + len(invalid_rows)) if items or invalid_rows else 0,
            "unresolved_references": sum(1 for item in items if item["reference_status"] == "ambiguous"),
            "risk_flagged_items": sum(1 for item in items if item.get("risk_flags")),
        },
        "regressions": regressions,
        "regressions_passed": sum(regressions.values()),
        "regressions_total": len(regressions),
        "reference_resolution": reference_summary,
        "cache": {"enabled": cache.enabled, "path": str(cache.path)},
        "usage": {
            **model.usage,
            "reference_cost": reference_summary["usage"]["cost"],
            "reference_saved_cost": reference_summary["usage"].get("saved_cost", 0.0),
            "total_cost": model.usage["cost"] + reference_summary["usage"]["cost"],
            "total_saved_cost": model.usage["saved_cost"] + reference_summary["usage"].get("saved_cost", 0.0),
            "uncached_equivalent_cost": (
                model.usage["cost"]
                + reference_summary["usage"]["cost"]
                + model.usage["saved_cost"]
                + reference_summary["usage"].get("saved_cost", 0.0)
            ),
            "average_cost_usd_per_page": model.usage["cost"] / args.page_count,
            "average_total_cost_usd_per_page": (model.usage["cost"] + reference_summary["usage"]["cost"]) / args.page_count,
            "average_uncached_equivalent_cost_usd_per_page": (
                model.usage["cost"]
                + reference_summary["usage"]["cost"]
                + model.usage["saved_cost"]
                + reference_summary["usage"].get("saved_cost", 0.0)
            ) / args.page_count,
        },
        "v2_baseline": latest_v2_baseline(args.source, target_pages),
        "accuracy_gate": {
            "eligible": False,
            "reason": "The exhaustive human gold fixture is still empty; this pilot can test regressions, grounding, schema validity, and cost, but not >95% precision/recall.",
        },
        "files": {
            "items": str(item_output),
            "normalized_text": str(normalized_output),
        },
        "invalid_rows_preview": invalid_rows[:10],
    }
    report_output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
