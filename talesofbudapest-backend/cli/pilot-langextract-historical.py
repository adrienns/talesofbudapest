#!/usr/bin/env python3
"""Cost-aware LangExtract pilot for grounded historical clauses.

Keeps V2 untouched. Produces private pilot JSONL plus a comparison report.
"""

from __future__ import annotations

import argparse
import dataclasses
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
import unicodedata
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
PRONOUN_PREFIX = re.compile(r"^(he|his|him|she|her|hers|they|their|them|it|its)\b", re.IGNORECASE)
DEMONSTRATIVE_PREFIX = re.compile(r"^(this|that|these|those)\b", re.IGNORECASE)
DEFINITE_PREFIX = re.compile(r"^the\s+[A-Za-z]", re.IGNORECASE)
# Kept as a compatibility alias for older guard code. New code should use
# is_referential_subject(), which also covers repeated descriptions such as
# "this institute" and "the synagogue".
REFERENCE_PREFIX = PRONOUN_PREFIX
INTERNAL_MODEL_ID = re.compile(r"^[a-z]\d{2,}$", re.IGNORECASE)
STRUCTURE_HEADS = r"synagogue|temple|building|institute|hospital|clinic|school|house|prayer-house|sanctuary|cemetery|home|palace|hall"
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
                extra_body = dict(request.get("extra_body") or {})
                extra_body["provider"] = {"sort": "price"}
                if str(request.get("model") or "").startswith("google/gemini-"):
                    extra_body["reasoning"] = {"effort": "none"}
                request["extra_body"] = extra_body
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


def trailing_footer_start(source: str) -> int | None:
    matches = list(re.finditer(r"(?m)^([^\n]+)\s*$", source.rstrip()))
    if not matches:
        return None
    match = matches[-1]
    line = match.group(1).strip()
    if not (re.match(r"^\d{1,4}\s+", line) or re.search(r"\s\d{1,4}$", line)):
        return None
    letters = [char for char in line if char.isalpha()]
    uppercase_ratio = sum(char.isupper() for char in letters) / len(letters) if letters else 0
    return match.start(1) if len(letters) >= 8 and uppercase_ratio >= 0.55 else None


def boundary_repair(previous_page: int, previous: str, next_page: int, following: str, words: set[str]) -> dict[str, Any] | None:
    suffix_match = re.match(r"\s*([a-z]{3,})", following)
    if not suffix_match:
        return None
    suffix = suffix_match.group(1)
    def recognized(word: str) -> bool:
        stems = {word}
        if word.endswith("ed"):
            stems.update({word[:-2], word[:-1]})
        if word.endswith("ing"):
            stems.update({word[:-3], word[:-3] + "e"})
        if word.endswith("s"):
            stems.add(word[:-1])
        return not words or any(stem in words for stem in stems)
    # A cross-page join is legal only when the hyphenated fragment is the
    # literal final token of the previous page. The older search over the last
    # 1,800 characters could grab an unrelated "re-" inside a caption and
    # truncate everything after it (page 519 + "own" became "reown").
    footer_start = trailing_footer_start(previous)
    content = previous[:footer_start].rstrip() if footer_start is not None else previous.rstrip()
    match = re.search(r"\b([A-Za-z]{2,})-[ \t]*$", content)
    if not match:
        return None
    prefix = match.group(1)
    joined = (prefix + suffix).lower()
    if not recognized(joined):
        return None
    raw_hyphen = match.start(0) + len(prefix)
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
    footer_starts = {page: start for page in selected if (start := trailing_footer_start(pages[page])) is not None}
    chars: list[str] = []
    coordinates: list[Coordinate | None] = []
    repair_rows: list[dict[str, Any]] = []
    for index, page in enumerate(selected):
        source = pages[page]
        start = max(0, len(source) - context_chars) if page == from_page - 1 else 0
        end = repairs.get(page, {}).get("previous_end", footer_starts.get(page, len(source)))
        normalized, mapped = normalize_slice(page, source, start, end)
        chars.extend(normalized)
        coordinates.extend(mapped)
        repair = repairs.get(page)
        if repair:
            repair_rows.append(repair)
        elif index < len(selected) - 1:
            following = pages[selected[index + 1]]
            content = source[:end].rstrip()
            continuous = bool(content and following.lstrip() and content[-1] not in ".!?;:" and following.lstrip()[0].islower())
            separator = [" "] if continuous else ["\n", "\n"]
            if continuous and chars and chars[-1] == " ":
                separator = []
            chars.extend(separator)
            coordinates.extend([None] * len(separator))
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
            # Offsets remain immutable raw OCR offsets, but every consumer sees
            # the normalized reading view. Never show or prompt on `syna-\n`
            # followed by `gogue` when the actual word is "synagogue".
            "quote": "".join(normalize_slice(
                row["page"], pages[row["page"]], row["start_offset"], row["end_offset"]
            )[0]),
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


def is_referential_subject(value: str | None) -> bool:
    """Return true for discourse references, not merely personal pronouns.

    Definite noun phrases are deliberately included. They may introduce a new
    entity, so the resolver is allowed to return ``?``; excluding them entirely
    made page-initial phrases such as "the synagogue" impossible to link.
    """
    value = (value or "").strip()
    if not value or len(value) > 180:
        return False
    return bool(PRONOUN_PREFIX.match(value) or DEMONSTRATIVE_PREFIX.match(value) or DEFINITE_PREFIX.match(value))


def is_standalone_pronoun(value: str | None) -> bool:
    return bool(re.fullmatch(r"he|his|him|she|her|hers|they|their|them|it|its", value or "", re.IGNORECASE))


def safe_memory_subject(value: str | None) -> str | None:
    value = re.sub(r"\s+", " ", (value or "")).strip(" \t\r\n.,;:()[]{}\"'")
    if not value or len(value) > 140 or INTERNAL_MODEL_ID.fullmatch(value):
        return None
    if is_standalone_pronoun(value):
        return None
    return value


def classify_source_zone(statement: str) -> tuple[str, str, list[str]]:
    """Separate historical claims from citations without deleting either."""
    compact = re.sub(r"\s+", " ", statement).strip()
    reference_only = bool(
        re.match(r"^(?:From:|Repr\.?[:;]|Photo:|Drawing from\b|Inv\. no\.|See pp?\.|For the text see\b)", compact, re.IGNORECASE)
        or re.match(r"^[A-Z][A-Za-z .'-]+,\s+[A-Z][^()]{3,}\(\d{4}\),\s+no\.\s*\d+", compact)
    )
    quoted_source = compact.startswith(("“", '"')) and len(compact) > 180
    caption = bool(re.match(r"^(?:\d+[.:]\d*\.?\s+|Portrait of\b|The .{0,60}synagogue,\s+ca\.)", compact, re.IGNORECASE))
    if reference_only or quoted_source:
        return "reference", "reference_only", ["source_zone_reference_only"]
    if caption:
        return "caption", "covered", ["source_zone_caption"]
    return "body", "covered", []


def clause_ledger_for_page(pages: dict[int, str], page: int) -> list[dict[str, Any]]:
    """Sentence-complete audit units, including a previous-page bridge."""
    if page - 1 in pages:
        text, mapping, _ = build_normalized_document(pages, page, 1, 2600)
    else:
        chars, raw_mapping = normalize_slice(page, pages[page], 0, len(pages[page]))
        text, mapping = "".join(chars), raw_mapping
    if not text:
        return []
    starts = [0]
    starts.extend(match.end() for match in re.finditer(r"(?<=[.!?])\s+(?=[\"“'‘(\[]*[A-Z0-9])", text))
    starts = sorted(set(starts))
    clauses = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(text)
        while start < end and text[start].isspace():
            start += 1
        while end > start and text[end - 1].isspace():
            end -= 1
        if end - start < 12:
            continue
        evidence = evidence_for_span(start, end, mapping, pages)
        target_evidence = [row for row in evidence if row["page_ref"] == page]
        if not target_evidence:
            continue
        anchor = target_evidence[0]
        clauses.append({
            "clause_id": f"p{page}c{len(clauses) + 1:03d}",
            "page_ref": page,
            "start_offset": anchor["start_offset"],
            "end_offset": anchor["end_offset"],
            "text": text[start:end],
            "evidence": evidence,
        })
    return clauses


def statements_for_clause(items: list[dict[str, Any]], clause: dict[str, Any]) -> list[str]:
    rows = []
    for item in items:
        for evidence in item.get("evidence") or []:
            if any(
                evidence.get("page_ref") == target.get("page_ref")
                and int(evidence.get("start_offset", 0)) < int(target.get("end_offset", 0))
                and int(evidence.get("end_offset", 0)) > int(target.get("start_offset", 0))
                for target in clause.get("evidence") or []
            ):
                rows.append(item.get("statement_en") or "")
                break
    return [row for row in rows if row]


def fact_similarity(left: str, right: str) -> float:
    left_words = set(re.findall(r"[a-z0-9]+", left.lower()))
    right_words = set(re.findall(r"[a-z0-9]+", right.lower()))
    if not left_words or not right_words:
        return 0.0
    return len(left_words & right_words) / len(left_words | right_words)


def same_subject_duplicate(candidate: dict[str, Any], existing: dict[str, Any]) -> bool:
    candidate_subject = safe_memory_subject(candidate.get("resolved_subject") or candidate.get("literal_subject"))
    existing_subject = safe_memory_subject(existing.get("resolved_subject") or existing.get("literal_subject"))
    if not candidate_subject or not existing_subject:
        return False
    folded_candidate = ocr_identity(candidate_subject)
    folded_existing = ocr_identity(existing_subject)
    if folded_candidate != folded_existing and difflib.SequenceMatcher(None, folded_candidate, folded_existing).ratio() < 0.90:
        return False
    left = set(re.findall(r"[a-z0-9]+", candidate.get("statement_en", "").lower()))
    right = set(re.findall(r"[a-z0-9]+", existing.get("statement_en", "").lower()))
    return bool(left and right and (left <= right or fact_similarity(candidate.get("statement_en", ""), existing.get("statement_en", "")) >= 0.55))


def ocr_identity(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.lower()).encode("ascii", "ignore").decode("ascii")
    folded = re.sub(r"(?<=[a-z])6(?=[a-z])", "o", folded)
    return re.sub(r"[^a-z0-9]+", "", folded)


def deterministic_audit_rejection(candidate: dict[str, Any]) -> str | None:
    statement = candidate.get("statement_en") or ""
    evidence = ((candidate.get("evidence") or [{}])[0].get("quote") or "").strip()
    if re.search(r"\b[A-Z]{3,}(?:\s+(?:OF|THE|AND|[A-Z]{3,})){3,}\s+\d{1,4}\b", statement):
        return "page footer promoted as a claim"
    if re.match(r"^(?:Drawing|Design|Ground-plan|Photo|Repr\.)\s+by\b", evidence, re.IGNORECASE):
        return "caption credit interleaved with body prose"
    return None


def deterministic_direct_entailment(candidate: dict[str, Any]) -> bool:
    """Accept a long predicate copied verbatim after harmless subject expansion."""
    statement = candidate.get("statement_en") or ""
    literal = candidate.get("literal_subject") or ""
    evidence = " ".join(row.get("quote") or "" for row in candidate.get("evidence") or [])
    predicate = statement
    if literal and statement.lower().startswith(literal.lower()):
        predicate = statement[len(literal):]
    normalized_predicate = " ".join(re.findall(r"[a-z0-9]+", predicate.lower()))
    normalized_evidence = " ".join(re.findall(r"[a-z0-9]+", evidence.lower()))
    return len(normalized_predicate.split()) >= 5 and normalized_predicate in normalized_evidence


def boundary_requires_escalation(clause: dict[str, Any], target_page: int) -> bool:
    """Escalate real continuations, not adjacent captions/page numbers."""
    evidence = clause.get("evidence") or []
    if len({row.get("page_ref") for row in evidence}) < 2:
        return False
    target_quote = next((row.get("quote") or "" for row in evidence if row.get("page_ref") == target_page), "").lstrip()
    previous_quote = " ".join(row.get("quote") or "" for row in evidence if row.get("page_ref") != target_page).rstrip()
    if not target_quote:
        return False
    starts_word_continuation = bool(re.match(r"^[a-záéíóöőúüű]", target_quote))
    explicit_hyphen = previous_quote.endswith(("-", "‐", "‑", "–"))
    return starts_word_continuation or explicit_hyphen


def reject_post_resolution_duplicates(items: list[dict[str, Any]]) -> int:
    accepted: list[dict[str, Any]] = []
    rejected = 0
    for item in items:
        if item.get("verification", {}).get("verdict") == "unsupported":
            continue
        is_audit = "coverage_audit_only" in (item.get("risk_flags") or [])
        duplicate = is_audit and any(
            re.sub(r"\W+", "", item.get("statement_en", "").lower())
            == re.sub(r"\W+", "", previous.get("statement_en", "").lower())
            or same_subject_duplicate(item, previous)
            for previous in accepted
        )
        if duplicate:
            item["verification"] = {"verdict": "unsupported", "reason": "duplicate of an already grounded primary item"}
            item["disposition"] = "reference_only"
            item["risk_flags"] = sorted(set([*(item.get("risk_flags") or []), "post_resolution_duplicate"]))
            rejected += 1
        else:
            accepted.append(item)
    return rejected


def audit_missing_atomic_items(
    items: list[dict[str, Any]],
    memory_items: list[dict[str, Any]],
    pages: dict[int, str],
    target_pages: list[int],
    source_id: str,
    api_key: str,
    model_id: str,
    quality_model_id: str,
    max_cost_usd: float,
    cache: JsonlResponseCache,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Independent, clause-complete omission audit; one compact call/page."""
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1", timeout=REQUEST_TIMEOUT_SECONDS, max_retries=0)
    added: list[dict[str, Any]] = []
    usage_total = {"calls": 0, "cache_hits": 0, "cache_misses": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost": 0.0, "saved_cost": 0.0}
    page_rows = []
    instruction = """You are the independent omission auditor for a historical-book extraction.
Every CLAUSE must be checked against its EXISTING atomic facts. Return only explicit historical events or assertions that EXISTING missed. Split roles, relationships, dates, actions, states, and secondary events into separate atomic rows. Preserve negation, uncertainty, plans, and attribution. Do not output bibliography, page furniture, photo credits, inventory/source citations, or a long quoted passage. Resolve a referring subject from MEMORY/TEXT when clear; otherwise use ?. Never invent outside knowledge.

Important completeness examples:
- TEXT='Dana, an architect and council member, was buried here.' EXISTING='Dana was buried here.' Missing rows: Dana was an architect; Dana was a council member.
- TEXT='The account was told by a nurse who survived; she climbed out of the pit.' EXISTING='The account was told by a nurse.' Missing rows: The nurse survived; The nurse climbed out of the pit.
- TEXT='The melodies, rooted in Polish tradition, reflected a newer style.' EXISTING='The melodies reflected a newer style.' Missing row: The melodies were rooted in Polish tradition.
- TEXT='Alex, supported by Bea, established a school.' EXISTING='The school was established.' Missing rows: Alex established the school; Bea supported the establishment of the school.
- TEXT='Kai held the position only briefly; Kai was forced to resign.' EXISTING='Kai was forced to resign.' Missing row: Kai held the position only briefly.

For each named person or organization in every clause, explicitly check appositive roles, who performed the action, passive 'by' agents, support/co-agent relations, duration, purpose, and subordinate or relative-clause events. A broad existing sentence does not replace searchable atomic facts with the correct subject.

Output zero or more lines, exactly:
clause_id|E_or_A|open_type|+_N_?|modality|literal_subject|resolved_subject|atomic_statement
The labels above describe slots; NEVER copy words such as E_or_A, open_type, +_N_?, or modality literally. Use actual allowed values.

Valid example output:
p1c001|A|occupation|+|asserted|Dana|Dana|Dana was an architect.
p1c001|A|membership|+|asserted|Dana|Dana|Dana was a council member.
p1c002|E|survival|+|asserted|a nurse|a nurse|A nurse survived the shooting.
p1c002|E|escape|+|asserted|she|a nurse|A nurse climbed out of the pit.

No JSON, markdown, explanation, or pipes inside fields. Output NONE if nothing is missing.
"""
    for page in target_pages:
        clauses = clause_ledger_for_page(pages, page)
        if not clauses:
            continue
        memory_key = (page, 0, 0, "audit")
        memory = discourse_subject_memory([*memory_items, *items, *added], memory_key)
        clause_rows = []
        for clause in clauses:
            existing = statements_for_clause([*items, *added], clause)
            existing_text = " || ".join(value.replace("|", "/") for value in existing) if existing else "-"
            clause_rows.append(f"{clause['clause_id']}|TEXT={clause['text'].replace('|', '/')}|EXISTING={existing_text}")
        prompt = instruction + "\nMEMORY:\n" + (" ; ".join(memory) if memory else "-") + "\n\nCLAUSES:\n" + "\n".join(clause_rows)
        request = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": min(1800, 250 + len(clauses) * 22),
            "extra_body": {"provider": {"sort": "price"}, **({"reasoning": {"effort": "none"}} if model_id.startswith("google/gemini-") else {})},
        }
        cached = cache.get("coverage-audit", request)
        raw_output = cached["output"] if cached else ""
        usage = (cached or {}).get("usage") or {}
        paid = 0.0
        if cached:
            usage_total["cache_hits"] += 1
            usage_total["saved_cost"] += float(usage.get("cost") or 0)
        else:
            response = client.chat.completions.create(**request)
            dumped = response.model_dump()
            usage = dumped.get("usage") or {}
            raw_output = response.choices[0].message.content or ""
            paid = float(usage.get("cost") or usage.get("cost_details", {}).get("upstream_inference_cost") or 0.0)
            usage_total["calls"] += 1
            usage_total["cache_misses"] += 1
            usage_total["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
            usage_total["completion_tokens"] += int(usage.get("completion_tokens") or 0)
            usage_total["total_tokens"] += int(usage.get("total_tokens") or 0)
            usage_total["cost"] += paid
            if usage_total["cost"] > max_cost_usd:
                raise BudgetExceeded(f"coverage audit cost ${usage_total['cost']:.6f} exceeded ${max_cost_usd:.6f} cap")
        by_id = {clause["clause_id"]: clause for clause in clauses}
        audit_outputs = [(raw_output, model_id, "coverage_audit")]
        boundary_request = None
        boundary_cached = None
        boundary_usage: dict[str, Any] = {}
        boundary_paid = 0.0
        boundary_clauses = [clause for clause in clauses if boundary_requires_escalation(clause, page)]
        if boundary_clauses:
            boundary_rows = []
            for clause in boundary_clauses:
                existing = statements_for_clause([*items, *added], clause)
                existing_text = " || ".join(value.replace("|", "/") for value in existing) if existing else "-"
                boundary_rows.append(f"{clause['clause_id']}|TEXT={clause['text'].replace('|', '/')}|EXISTING={existing_text}")
            boundary_prompt = instruction + "\nThis is a page-boundary escalation. Pay special attention to every named agent, supporting person, role, duration, and action on both sides of the page break.\n\nCLAUSES:\n" + "\n".join(boundary_rows)
            boundary_request = {
                "model": quality_model_id,
                "messages": [{"role": "user", "content": boundary_prompt}],
                "temperature": 0,
                "max_tokens": min(900, 250 + len(boundary_clauses) * 180),
                "extra_body": {"provider": {"sort": "price"}, **({"reasoning": {"effort": "none"}} if quality_model_id.startswith("google/gemini-") else {})},
            }
            boundary_cached = cache.get("coverage-boundary-audit", boundary_request)
            boundary_output = boundary_cached["output"] if boundary_cached else ""
            boundary_usage = (boundary_cached or {}).get("usage") or {}
            if boundary_cached:
                usage_total["cache_hits"] += 1
                usage_total["saved_cost"] += float(boundary_usage.get("cost") or 0)
            else:
                boundary_response = client.chat.completions.create(**boundary_request)
                boundary_dumped = boundary_response.model_dump()
                boundary_usage = boundary_dumped.get("usage") or {}
                boundary_output = boundary_response.choices[0].message.content or ""
                boundary_paid = float(boundary_usage.get("cost") or boundary_usage.get("cost_details", {}).get("upstream_inference_cost") or 0.0)
                usage_total["calls"] += 1
                usage_total["cache_misses"] += 1
                usage_total["prompt_tokens"] += int(boundary_usage.get("prompt_tokens") or 0)
                usage_total["completion_tokens"] += int(boundary_usage.get("completion_tokens") or 0)
                usage_total["total_tokens"] += int(boundary_usage.get("total_tokens") or 0)
                usage_total["cost"] += boundary_paid
                if usage_total["cost"] > max_cost_usd:
                    raise BudgetExceeded(f"boundary audit cost ${usage_total['cost']:.6f} exceeded ${max_cost_usd:.6f} cap")
            audit_outputs.append((boundary_output, quality_model_id, "coverage_boundary_audit"))
        parsed_count = 0
        parsed_by_source: dict[str, int] = {}
        page_candidates: list[dict[str, Any]] = []
        for candidate_output, discovery_model, discovery_source in audit_outputs:
            for line in candidate_output.replace("```", "").splitlines():
                columns = [column.strip() for column in line.split(ROW_SEPARATOR)]
                if len(columns) != 8 or columns[0] not in by_id:
                    continue
                parsed = parse_item_row(ROW_SEPARATOR.join(columns[1:]))
                if not parsed:
                    continue
                clause = by_id[columns[0]]
                existing_items = [*items, *added, *page_candidates]
                if any(same_subject_duplicate(parsed, existing) for existing in existing_items):
                    continue
                source_zone, disposition, zone_flags = classify_source_zone(parsed["statement_en"])
                parsed["risk_flags"] = sorted(set([*(parsed.get("risk_flags") or []), *zone_flags, "coverage_audit_only"]))
                identity = json.dumps([source_id, clause["page_ref"], clause["start_offset"], clause["end_offset"], parsed], sort_keys=True, ensure_ascii=False)
                page_candidates.append({
                    "item_id": f"lxa_{hashlib.sha256(identity.encode()).hexdigest()[:20]}",
                    **parsed,
                    "evidence": clause["evidence"],
                    "grounding_status": "clause_id_grounded",
                    "source_zone": source_zone,
                    "disposition": disposition,
                    "discovery_sources": [discovery_model, discovery_source],
                    "verification": {"verdict": "pending", "reason": "quality adjudication required for auditor-only discovery"},
                    "_audit_clause_id": clause["clause_id"],
                    "publication_status": "private",
                })
                parsed_count += 1
                parsed_by_source[discovery_source] = parsed_by_source.get(discovery_source, 0) + 1
        if (
            not cached
            and raw_output.strip()
            and (parsed_by_source.get("coverage_audit", 0) or raw_output.strip().upper() == "NONE")
        ):
            cache.put("coverage-audit", request, raw_output, {
                "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                "completion_tokens": int(usage.get("completion_tokens") or 0),
                "total_tokens": int(usage.get("total_tokens") or 0),
                "cost": paid,
            })
        if (
            boundary_request
            and not boundary_cached
            and boundary_output.strip()
            and (parsed_by_source.get("coverage_boundary_audit", 0) or boundary_output.strip().upper() == "NONE")
        ):
            cache.put("coverage-boundary-audit", boundary_request, boundary_output, {
                "prompt_tokens": int(boundary_usage.get("prompt_tokens") or 0),
                "completion_tokens": int(boundary_usage.get("completion_tokens") or 0),
                "total_tokens": int(boundary_usage.get("total_tokens") or 0),
                "cost": boundary_paid,
            })
        quality_paid = 0.0
        supported_count = 0
        if page_candidates:
            quality_rows = []
            quality_ids: dict[str, dict[str, Any]] = {}
            for candidate in page_candidates:
                clause = by_id[candidate.pop("_audit_clause_id")]
                deterministic_rejection = deterministic_audit_rejection(candidate)
                if deterministic_rejection:
                    candidate["verification"] = {"verdict": "unsupported", "reason": deterministic_rejection}
                    candidate["disposition"] = "reference_only"
                    candidate["risk_flags"] = sorted(set([*(candidate.get("risk_flags") or []), "coverage_quality_rejected"]))
                    continue
                if deterministic_direct_entailment(candidate):
                    candidate["verification"] = {"verdict": "supported", "reason": "predicate copied directly from grounded evidence"}
                    supported_count += 1
                    continue
                quality_id = f"q{len(quality_ids) + 1:03d}"
                quality_ids[quality_id] = candidate
                quality_rows.append(
                    f"{quality_id}|SOURCE={clause['text'].replace('|', '/')}|CLAIM={candidate['statement_en'].replace('|', '/')}"
                )
            if quality_ids:
                quality_prompt = """Adjudicate auditor-only historical claims against their local source.
Return Y only when the CLAIM is directly and explicitly stated in one coherent body-text sentence. Return N for inference, duplicate page furniture, bibliography/photo credit, a caption mixed with distant prose, or a claim combining words from unrelated layout regions. Do not use outside knowledge.
Output every ID exactly once as qNNN|Y or qNNN|N. No explanation.

CANDIDATES:
""" + "\n".join(quality_rows)
                quality_request = {
                    "model": quality_model_id,
                    "messages": [{"role": "user", "content": quality_prompt}],
                    "temperature": 0,
                    "max_tokens": min(500, 40 + len(quality_ids) * 10),
                    "extra_body": {"provider": {"sort": "price"}, **({"reasoning": {"effort": "none"}} if quality_model_id.startswith("google/gemini-") else {})},
                }
                quality_cached = cache.get("coverage-quality", quality_request)
                quality_output = quality_cached["output"] if quality_cached else ""
                quality_usage = (quality_cached or {}).get("usage") or {}
                if quality_cached:
                    usage_total["cache_hits"] += 1
                    usage_total["saved_cost"] += float(quality_usage.get("cost") or 0)
                else:
                    quality_response = client.chat.completions.create(**quality_request)
                    quality_dumped = quality_response.model_dump()
                    quality_usage = quality_dumped.get("usage") or {}
                    quality_output = quality_response.choices[0].message.content or ""
                    quality_paid = float(quality_usage.get("cost") or quality_usage.get("cost_details", {}).get("upstream_inference_cost") or 0.0)
                    usage_total["calls"] += 1
                    usage_total["cache_misses"] += 1
                    usage_total["prompt_tokens"] += int(quality_usage.get("prompt_tokens") or 0)
                    usage_total["completion_tokens"] += int(quality_usage.get("completion_tokens") or 0)
                    usage_total["total_tokens"] += int(quality_usage.get("total_tokens") or 0)
                    usage_total["cost"] += quality_paid
                    if usage_total["cost"] > max_cost_usd:
                        raise BudgetExceeded(f"coverage quality cost ${usage_total['cost']:.6f} exceeded ${max_cost_usd:.6f} cap")
                quality_answers = {
                    match.group(1).lower(): match.group(2).upper()
                    for match in re.finditer(r"(?im)^\s*(q\d{3})\s*\|\s*([YN])\s*$", quality_output.replace("```", ""))
                    if match.group(1).lower() in quality_ids
                }
                for quality_id, candidate in quality_ids.items():
                    supported = quality_answers.get(quality_id) == "Y"
                    candidate["verification"] = {
                        "verdict": "supported" if supported else "unsupported",
                        "reason": f"{quality_model_id} direct-local-entailment adjudication",
                    }
                    if not supported:
                        candidate["disposition"] = "reference_only"
                        candidate["risk_flags"] = sorted(set([*(candidate.get("risk_flags") or []), "coverage_quality_rejected"]))
                    else:
                        supported_count += 1
                if not quality_cached and len(quality_answers) == len(quality_ids):
                    cache.put("coverage-quality", quality_request, quality_output, {
                        "prompt_tokens": int(quality_usage.get("prompt_tokens") or 0),
                        "completion_tokens": int(quality_usage.get("completion_tokens") or 0),
                        "total_tokens": int(quality_usage.get("total_tokens") or 0),
                        "cost": quality_paid,
                    })
            added.extend(page_candidates)
        page_rows.append({
            "page": page, "clauses": len(clauses), "candidates": parsed_count,
            "added": supported_count, "rejected": parsed_count - supported_count,
            "cache_hit": bool(cached) and (not boundary_request or bool(boundary_cached)),
            "paid_cost": paid + boundary_paid + quality_paid,
            "unparsed_preview": raw_output[:1200] if parsed_count == 0 and raw_output.strip().upper() != "NONE" else None,
        })
    return added, {
        "model": model_id, "quality_model": quality_model_id, "pages": page_rows,
        "candidate_items": len(added),
        "added_items": sum(1 for item in added if item.get("verification", {}).get("verdict") == "supported"),
        "rejected_items": sum(1 for item in added if item.get("verification", {}).get("verdict") != "supported"),
        "usage": usage_total,
    }


def parse_item_row(value: str) -> dict[str, Any] | None:
    columns = [column.strip() for column in value.split(ROW_SEPARATOR)]
    if len(columns) != 7:
        return None
    kind, open_type, polarity, modality, literal_subject, resolved_subject, statement = columns
    if kind not in VALID_KINDS or polarity not in VALID_POLARITIES or modality not in VALID_MODALITIES:
        return None
    if not open_type or not statement or not literal_subject or not resolved_subject:
        return None
    statement_reference = PRONOUN_PREFIX.match(statement)
    literal_reference = PRONOUN_PREFIX.match(literal_subject)
    if statement_reference and literal_reference and literal_subject.split()[0].lower() != statement_reference.group(1).lower():
        # One grounded clause can yield several rows. Do not let the clause's
        # first possessive phrase leak into a later row whose subject is "he".
        literal_subject = statement_reference.group(1)
        resolved_subject = "?"
    resolved_folded = resolved_subject.lower()
    literal_reference = PRONOUN_PREFIX.match(literal_subject)
    standalone_reference = is_standalone_pronoun(literal_subject)
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
    discourse_reference = is_referential_subject(literal_subject)
    # A model repeating "this institute" or "the synagogue" has not actually
    # resolved it. Preserve the grammatical phrase, but send identity to the
    # rolling discourse resolver.
    descriptive_self_resolution = discourse_reference and re.sub(r"\W+", "", literal_subject.lower()) == re.sub(r"\W+", "", resolved_folded)
    if descriptive_self_resolution and not literal_reference:
        ambiguous = True
    return {
        "kind": "event" if kind == "E" else "assertion",
        "open_type": re.sub(r"[^a-z0-9]+", "_", open_type.lower()).strip("_")[:80],
        "polarity": "negated" if polarity == "N" else "affirmed",
        "modality": "uncertain" if polarity == "?" else modality,
        "literal_subject": None if literal_subject == "-" else literal_subject,
        "resolved_subject": None if resolved_subject in {"-", "?"} or (ambiguous and standalone_reference) else resolved_subject,
        "reference_antecedent": resolved_subject if discourse_reference and not ambiguous and not expletive else None,
        "reference_status": "not_applicable" if expletive else "ambiguous" if ambiguous else "model_subject" if resolved_subject != "-" else "not_applicable",
        "reference_resolution_source": "primary_model" if discourse_reference and not ambiguous and not expletive else None,
        "statement_en": statement,
        "risk_flags": risk_flags,
    }


def reference_group_key(item: dict[str, Any]) -> tuple[int, int, int, str] | None:
    literal = item.get("literal_subject") or ""
    if not is_referential_subject(literal):
        return None
    evidence = (item.get("evidence") or [None])[0]
    if not evidence:
        return None
    return (int(evidence["page_ref"]), int(evidence["start_offset"]), int(evidence["end_offset"]), literal.lower())


def item_position(item: dict[str, Any]) -> tuple[int, int, int] | None:
    evidence = (item.get("evidence") or [None])[0]
    if not evidence:
        return None
    return int(evidence["page_ref"]), int(evidence["start_offset"]), int(evidence["end_offset"])


def discourse_subject_memory(
    items: list[dict[str, Any]],
    key: tuple[int, int, int, str],
    max_pages: int = 3,
    limit: int = 16,
) -> list[str]:
    """Recent resolved subjects carried across page boundaries.

    Memory is derived only from earlier grounded items. It is compact, ordered,
    and book-local; no entity name is hardcoded. The raw context remains the
    authority and the model may still return ``?``.
    """
    page, start, _, _ = key
    rows: list[tuple[int, int, str]] = []
    for item in items:
        position = item_position(item)
        if not position:
            continue
        item_page, item_start, _ = position
        if item_page < page - max_pages or (item_page, item_start) >= (page, start):
            continue
        candidates = [
            item.get("reference_antecedent"),
            item.get("resolved_subject"),
            item.get("literal_subject") if not is_referential_subject(item.get("literal_subject")) else None,
        ]
        for candidate in candidates:
            if safe := safe_memory_subject(candidate):
                rows.append((item_page, item_start, safe))
                break
    seen: set[str] = set()
    memory: list[str] = []
    for _, _, subject in reversed(rows):
        folded = re.sub(r"\W+", "", subject.lower())
        if folded in seen:
            continue
        seen.add(folded)
        memory.append(subject)
        if len(memory) >= limit:
            break
    return list(reversed(memory))


def load_persisted_discourse_memory(path: Path, expected_previous_page: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not path.exists():
        return [], {"loaded": False, "reason": "no memory file", "path": str(path)}
    try:
        payload = json.loads(path.read_text("utf-8"))
    except (json.JSONDecodeError, OSError):
        return [], {"loaded": False, "reason": "invalid memory file", "path": str(path)}
    if int(payload.get("last_page", -1)) != expected_previous_page:
        return [], {
            "loaded": False,
            "reason": f"memory ends at page {payload.get('last_page')}, expected {expected_previous_page}",
            "path": str(path),
        }
    rows = payload.get("items") if isinstance(payload.get("items"), list) else []
    return rows, {"loaded": True, "items": len(rows), "last_page": expected_previous_page, "path": str(path)}


def save_persisted_discourse_memory(path: Path, source_id: str, last_page: int, items: list[dict[str, Any]], max_pages: int = 3) -> None:
    rows = []
    for item in items:
        position = item_position(item)
        if not position or position[0] < last_page - max_pages + 1:
            continue
        if item.get("verification", {}).get("verdict") == "unsupported" or item.get("disposition") == "reference_only":
            continue
        subject = safe_memory_subject(item.get("reference_antecedent") or item.get("resolved_subject") or item.get("literal_subject"))
        if not subject:
            continue
        rows.append({
            "literal_subject": item.get("literal_subject"),
            "resolved_subject": subject,
            "reference_antecedent": item.get("reference_antecedent"),
            "reference_status": item.get("reference_status"),
            "evidence": [item["evidence"][0]],
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "version": 1, "source_id": source_id, "last_page": last_page,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "items": rows[-120:],
    }, ensure_ascii=False, indent=2) + "\n", "utf-8")


def reference_context(pages: dict[int, str], key: tuple[int, int, int, str]) -> str:
    page, start, end, _ = key
    page_text = pages.get(page, "")
    prefix = "".join(normalize_slice(page, page_text, max(0, start - 750), start)[0])
    target = "".join(normalize_slice(page, page_text, start, end)[0])
    suffix = "".join(normalize_slice(page, page_text, end, min(len(page_text), end + 160))[0])
    if start < 350 and pages.get(page - 1):
        previous = pages[page - 1]
        prefix = "".join(normalize_slice(page - 1, previous, max(0, len(previous) - 750), len(previous))[0]) + " " + prefix
    return re.sub(r"\s+", " ", f"{prefix} [[{target}]] {suffix}").strip()


def nearest_structural_antecedent(literal: str, context: str) -> str | None:
    if not DEMONSTRATIVE_PREFIX.match(literal) or not re.search(rf"\b(?:{STRUCTURE_HEADS})\b", literal, re.IGNORECASE):
        return None
    prefix = context.split("[[", 1)[0]
    matches = list(re.finditer(
        rf"(?=(\b(?:the|a|an|this|that)\s+(?:[A-Za-zÀ-ž'’-]+\s+){{0,7}}(?:{STRUCTURE_HEADS})(?:\s+of\s+(?:the\s+)?[A-Za-zÀ-ž'’-]+)?))",
        prefix,
        re.IGNORECASE,
    ))
    if not matches:
        return None
    return re.sub(r"\s+", " ", matches[-1].group(1)).strip()


def apply_reference_guards(items: list[dict[str, Any]], pages: dict[int, str]) -> dict[str, int]:
    guarded = {
        "subject_leakage_repaired": 0,
        "self_resolution_rejected": 0,
        "expletives_removed": 0,
        "ordinals_completed": 0,
        "kinship_escalated": 0,
        "local_discourse_resolved": 0,
        "internal_ids_rejected": 0,
        "structural_descriptions_resolved": 0,
        "cleft_pronouns_repaired": 0,
    }
    for item in items:
        literal = item.get("literal_subject") or ""
        statement_match = PRONOUN_PREFIX.match(item.get("statement_en") or "")
        literal_match = PRONOUN_PREFIX.match(literal)
        cleft = re.match(r"^It was\s+(him|her|them)\s+who\b", item.get("statement_en") or "", re.IGNORECASE)
        cleft_repaired = bool(cleft and literal.lower() == "it")
        if cleft_repaired:
            primary_antecedent = safe_memory_subject(item.get("resolved_subject"))
            item["literal_subject"] = cleft.group(1)
            item["resolved_subject"] = primary_antecedent
            item["reference_antecedent"] = primary_antecedent
            item["reference_status"] = "model_subject" if primary_antecedent else "ambiguous"
            item["reference_resolution_source"] = "primary_model" if primary_antecedent else None
            literal = item["literal_subject"]
            literal_match = PRONOUN_PREFIX.match(literal)
            guarded["cleft_pronouns_repaired"] += 1
        if not cleft_repaired and statement_match and literal_match and literal.split()[0].lower() != statement_match.group(1).lower():
            item["literal_subject"] = statement_match.group(1)
            item["resolved_subject"] = None
            item["reference_antecedent"] = None
            item["reference_status"] = "ambiguous"
            item["reference_resolution_source"] = None
            literal = item["literal_subject"]
            guarded["subject_leakage_repaired"] += 1
        if "kinship_coreference" in (item.get("risk_flags") or []):
            item["risk_flags"] = [flag for flag in item["risk_flags"] if flag != "kinship_coreference"]
        if not is_referential_subject(literal):
            continue
        antecedent = item.get("reference_antecedent") or ""
        if INTERNAL_MODEL_ID.fullmatch(antecedent):
            item["reference_antecedent"] = None
            item["reference_status"] = "ambiguous"
            item["reference_resolution_source"] = None
            guarded["internal_ids_rejected"] += 1
            antecedent = ""
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
        if item.get("reference_status") == "ambiguous":
            structural = nearest_structural_antecedent(literal, context)
            if structural:
                item["reference_antecedent"] = structural
                item["resolved_subject"] = structural
                item["reference_status"] = "resolved_reference"
                item["reference_resolution_source"] = "local_structural_carry_forward"
                guarded["structural_descriptions_resolved"] += 1
                continue
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
    last_person: tuple[int, int, str] | None = None
    last_nonperson: tuple[int, int, str] | None = None
    person_prefix = re.compile(r"^(?:R\.|Rabbi\b|Dr\.|Mr\.|Mrs\.|Saint\b|St\.)", re.IGNORECASE)
    for (page, start, end), span_items in sorted(spans.items()):
        for item in span_items:
            literal = item.get("literal_subject") or ""
            flags = item.get("risk_flags") or []
            pronoun_match = PRONOUN_PREFIX.match(literal)
            pronoun = pronoun_match.group(1).lower() if pronoun_match else None
            previous = last_nonperson if pronoun in {"it", "its"} else last_person
            close = bool(previous and (
                (previous[0] == page and start - previous[1] <= 320)
                or (previous[0] == page - 1 and start <= 450)
            ))
            if (
                previous
                and close
                and item.get("reference_status") == "ambiguous"
                and PRONOUN_PREFIX.match(literal)
                and "kinship_coreference" not in flags
            ):
                antecedent = previous[2]
                item["reference_antecedent"] = antecedent
                item["reference_status"] = "resolved_reference"
                item["reference_resolution_source"] = "local_discourse_carry_forward"
                if is_standalone_pronoun(literal):
                    item["resolved_subject"] = antecedent
                guarded["local_discourse_resolved"] += 1
            # Update rolling state immediately. Several atomic rows can share
            # one evidence span, so a separate second loop made "Its rooms"
            # miss "This institute" from the preceding row in that same span.
            candidate = item.get("reference_antecedent") or item.get("resolved_subject") or ""
            candidate = safe_memory_subject(candidate)
            if not candidate or item.get("reference_status") == "ambiguous":
                continue
            if person_prefix.match(candidate) or re.fullmatch(r"he|his|him|she|her|hers", literal, re.IGNORECASE):
                last_person = (page, end, candidate)
            elif not is_standalone_pronoun(literal):
                last_nonperson = (page, end, candidate)
    return guarded


def apply_constrained_coref_results(items: list[dict[str, Any]], payloads: list[dict[str, Any]]) -> dict[str, int]:
    links = []
    for payload in payloads:
        for row in (payload.get("results") or {}).values():
            reference = row.get("reference") or {}
            antecedent = row.get("antecedent") or {}
            links.append({
                "page_ref": reference.get("page"),
                "start_offset": reference.get("start"),
                "end_offset": reference.get("end"),
                "text": reference.get("text"),
                "reference_kind": reference.get("reference_kind"),
                "antecedent": antecedent.get("text"),
                "antecedent_page_ref": antecedent.get("page"),
                "antecedent_start_offset": antecedent.get("start"),
                "antecedent_end_offset": antecedent.get("end"),
                "antecedent_mention_id": antecedent.get("id"),
                "resolved_entity_id": row.get("chosen") if row.get("chosen") != "?" else None,
                "verdict": row.get("verdict"),
            })
    linked_items = resolved_links = ambiguous_links = 0
    for item in items:
        if item.get("verification", {}).get("verdict") == "unsupported" or item.get("disposition") == "reference_only":
            continue
        literal = item.get("literal_subject") or ""
        literal_first = (literal.split() or [""])[0].lower()
        item_links = []
        for link in links:
            if link["page_ref"] is None or link["start_offset"] is None or link["end_offset"] is None:
                continue
            link_first = (((link.get("text") or "").split() or [""])[0].lower())
            subject_match = link_first == literal_first and any(
                evidence.get("page_ref") == link["page_ref"]
                and int(evidence.get("start_offset", 0)) <= int(link["start_offset"])
                and int(evidence.get("end_offset", 0)) >= int(link["end_offset"])
                and (
                    not evidence.get("quote")
                    or _link_overlaps_literal_subject(evidence, literal, link)
                )
                for evidence in item.get("evidence") or []
            )
            if subject_match:
                item_links.append(link)
        if not item_links:
            continue
        item["reference_links"] = item_links
        linked_items += 1
        leading = next((
            link for link in item_links
            if (((link.get("text") or "").split() or [""])[0].lower() == literal_first)
        ), None)
        if not leading:
            continue
        antecedent = safe_memory_subject(leading.get("antecedent"))
        antecedent = canonical_subject_alias(antecedent, leading, items) or antecedent
        if antecedent and leading.get("verdict") != "ambiguous":
            item["reference_antecedent"] = antecedent
            item["reference_status"] = "resolved_reference"
            item["reference_resolution_source"] = "constrained_two_vote_coref"
            if is_standalone_pronoun(literal) or DEMONSTRATIVE_PREFIX.match(literal) or DEFINITE_PREFIX.match(literal):
                item["resolved_subject"] = antecedent
            resolved_links += 1
        else:
            item["reference_antecedent"] = None
            item["reference_status"] = "ambiguous"
            item["reference_resolution_source"] = "constrained_two_vote_coref"
            ambiguous_links += 1
    return {"links": len(links), "linked_items": linked_items, "resolved_leading_links": resolved_links, "ambiguous_leading_links": ambiguous_links}


def _link_overlaps_literal_subject(evidence: dict[str, Any], literal: str, link: dict[str, Any]) -> bool:
    """Do not attach another atomic row's reference merely because evidence is shared."""
    quote = evidence.get("quote") or ""
    index = quote.lower().find(literal.lower())
    if index < 0:
        first = (literal.split() or [""])[0]
        index = quote.lower().find(first.lower()) if first else -1
    if index < 0:
        return False
    expected_start = int(evidence.get("start_offset", 0)) + index
    expected_end = expected_start + max(1, len(literal))
    link_start = int(link.get("start_offset", -1))
    link_end = int(link.get("end_offset", -1))
    return link_start < expected_end and link_end > expected_start


def canonical_subject_alias(
    antecedent: str | None,
    link: dict[str, Any],
    items: list[dict[str, Any]],
) -> str | None:
    """Map a role/description mention to a grounded named subject when known."""
    if not antecedent:
        return None
    folded = re.sub(r"\W+", "", antecedent.lower())
    for candidate in items:
        literal = safe_memory_subject(candidate.get("literal_subject"))
        resolved = safe_memory_subject(candidate.get("resolved_subject"))
        if not literal or not resolved or re.sub(r"\W+", "", literal.lower()) != folded:
            continue
        if re.sub(r"\W+", "", resolved.lower()) == folded:
            continue
        # Canonical aliases must look like explicit names, not another generic
        # description guessed by a model.
        if len(re.findall(r"\b[A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű.-]*", resolved)) < 2:
            continue
        if any(
            evidence.get("page_ref") == link.get("antecedent_page_ref")
            and int(evidence.get("start_offset", 0)) <= int(link.get("antecedent_start_offset") or -1)
            and int(evidence.get("end_offset", 0)) >= int(link.get("antecedent_end_offset") or -1)
            for evidence in candidate.get("evidence") or []
        ):
            return resolved
    return antecedent


def run_constrained_coref_stage(
    source_id: str,
    target_pages: list[int],
    available_pages: set[int],
    items: list[dict[str, Any]],
    max_cost_usd: float,
    no_cache: bool,
    memory_pages: int = 3,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payloads = []
    paid_cost = 0.0
    uncached_equivalent_cost = 0.0
    command_rows = []
    script = Path(__file__).with_name("pilot-constrained-coref.py")
    for page in target_pages:
        window = [candidate for candidate in range(max(1, page - memory_pages), page + 1) if candidate in available_pages]
        remaining = max_cost_usd - paid_cost
        if remaining <= 0:
            raise BudgetExceeded("no budget remains for constrained coreference")
        command = [
            sys.executable, str(script), "--source", source_id,
            "--pages", ",".join(map(str, window)), "--resolve-pages", str(page),
            "--max-references", "120", "--max-cost-usd", f"{remaining:.8f}",
        ]
        spans = []
        for item in items:
            literal = item.get("literal_subject") or ""
            if (
                not needs_constrained_reference(item, items, memory_pages)
                or item.get("verification", {}).get("verdict") == "unsupported"
                or item.get("disposition") == "reference_only"
            ):
                continue
            for evidence in item.get("evidence") or []:
                if evidence.get("page_ref") != page:
                    continue
                quote = evidence.get("quote") or ""
                index = quote.lower().find(literal.lower())
                if index < 0:
                    first = (literal.split() or [""])[0]
                    index = quote.lower().find(first.lower()) if first else -1
                raw_start = int(evidence["start_offset"]) + max(0, index)
                raw_end = min(int(evidence["end_offset"]), raw_start + max(12, len(literal) + 8))
                spans.append({"page": page, "start": raw_start, "end": raw_end})
        spans = [
            {"page": span_page, "start": start, "end": end}
            for span_page, start, end in sorted({(row["page"], row["start"], row["end"]) for row in spans})
        ]
        if not spans:
            payloads.append({"results": {}, "paid_cost_usd": 0.0})
            command_rows.append({"page": page, "window": window, "references": 0, "paid_cost": 0.0})
            continue
        command.extend(["--target-spans-json", json.dumps(spans, separators=(",", ":"))])
        if no_cache:
            command.append("--no-cache")
        completed = subprocess.run(command, cwd=WORKSPACE, text=True, capture_output=True, check=False)
        if completed.returncode != 0:
            raise RuntimeError(f"constrained coreference failed on page {page}: {(completed.stderr or completed.stdout)[-1200:]}")
        output_path = EXTRACTIONS / "coref-pilot" / source_id / f"pages-{'-'.join(map(str, window))}-resolve-{page}.json"
        payload = json.loads(output_path.read_text("utf-8"))
        page_cost = float(payload.get("paid_cost_usd") or 0)
        page_uncached_cost = float(payload.get("uncached_equivalent_cost_usd") or page_cost)
        paid_cost += page_cost
        uncached_equivalent_cost += page_uncached_cost
        if paid_cost > max_cost_usd:
            raise BudgetExceeded(f"constrained coreference cost ${paid_cost:.6f} exceeded ${max_cost_usd:.6f}")
        payloads.append(payload)
        command_rows.append({
            "page": page, "window": window, "references": len(payload.get("results") or {}),
            "paid_cost": page_cost, "uncached_equivalent_cost": page_uncached_cost,
        })
    return payloads, {
        "pages": command_rows,
        "paid_cost_usd": paid_cost,
        "uncached_equivalent_cost_usd": uncached_equivalent_cost,
        "saved_cost_usd": max(0.0, uncached_equivalent_cost - paid_cost),
    }


def needs_constrained_reference(
    item: dict[str, Any],
    items: list[dict[str, Any]],
    memory_pages: int = 3,
) -> bool:
    """Route pronouns always; route definite descriptions only if repeated."""
    literal = item.get("literal_subject") or ""
    if PRONOUN_PREFIX.match(literal) or DEMONSTRATIVE_PREFIX.match(literal):
        return True
    if not DEFINITE_PREFIX.match(literal):
        return False
    position = item_position(item)
    if not position:
        return False
    page, start, _ = position
    words = re.findall(r"[a-z0-9]+", literal.lower())
    if len(words) < 2:
        return False
    head = words[-1]
    for previous in items:
        previous_position = item_position(previous)
        if not previous_position:
            continue
        previous_page, previous_start, _ = previous_position
        if previous_page < page - memory_pages or (previous_page, previous_start) >= (page, start):
            continue
        searchable = f"{previous.get('literal_subject') or ''} {previous.get('resolved_subject') or ''} {previous.get('statement_en') or ''}".lower()
        if re.search(rf"\b{re.escape(head)}s?\b", searchable):
            return True
    return False


def finalize_new_definite_subjects(items: list[dict[str, Any]], memory_pages: int = 3) -> int:
    """A newly introduced `the X` is a subject, not an unresolved reference."""
    finalized = 0
    for item in items:
        literal = item.get("literal_subject") or ""
        if not DEFINITE_PREFIX.match(literal) or PRONOUN_PREFIX.match(literal) or DEMONSTRATIVE_PREFIX.match(literal):
            continue
        if needs_constrained_reference(item, items, memory_pages):
            continue
        item["reference_status"] = "not_applicable"
        item["reference_antecedent"] = None
        item["reference_resolution_source"] = None
        item["resolved_subject"] = item.get("resolved_subject") or literal
        finalized += 1
    return finalized


def resolve_reference_antecedents(
    items: list[dict[str, Any]],
    pages: dict[int, str],
    api_key: str,
    model_id: str,
    max_cost_usd: float,
    cache: JsonlResponseCache,
    batch_size: int = 12,
    memory_items: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    memory_items = memory_items or []
    pre_guards = apply_reference_guards(items, pages)
    groups: dict[tuple[int, int, int, str], list[dict[str, Any]]] = {}
    for item in items:
        key = reference_group_key(item)
        literal = item.get("literal_subject") or ""
        standalone = is_standalone_pronoun(literal)
        primary_reference = (
            not standalone
            and item.get("reference_resolution_source") == "primary_model"
            and item.get("reference_antecedent")
        )
        needs_remote = item.get("reference_status") == "ambiguous" or primary_reference
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

    instruction = """Resolve the leading discourse reference in each literal subject.
The context target is inside [[double brackets]]. References include pronouns, possessives, demonstratives such as 'this institute', and repeated definite descriptions such as 'the synagogue'. A possessive phrase has a grammatical subject and a different reference antecedent: in 'His tomb', return the person denoted by His, not the tomb. For standalone He/They/It and for this/the descriptions, return the entity denoted by the expression. Never repeat an unresolved literal phrase as the answer. Return - only for an expletive or a genuinely new definite entity; a this/that/these/those phrase always refers, so use ? rather than - if its antecedent is unclear. Use only explicitly visible TEXT or the rolling MEMORY of earlier grounded subjects. Never output a context/request ID such as c001, r001, or x001.

Examples: 'His tomb' after 'Efraim died' -> Efraim. 'this institute' after 'The hospital opened' -> The hospital. 'the synagogue' at the top of a page after 'The Obuda synagogue' -> The Obuda synagogue. Standalone 'He' after 'R. Noah' -> R. Noah.

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
        visible_by_id: dict[str, str] = {}
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
                context = reference_context(pages, key)
                memory = discourse_subject_memory([*memory_items, *items], key)
                visible = context + " " + " ".join(memory)
                visible_by_id[request_id] = visible
                memory_text = " ; ".join(memory) if memory else "-"
                context_rows.append(f"{context_id}|MEMORY={memory_text.replace('|', '/')}|TEXT={context.replace('|', '/')}")
            else:
                context = reference_context(pages, key)
                memory = discourse_subject_memory([*memory_items, *items], key)
                visible_by_id[request_id] = context + " " + " ".join(memory)
            request_rows.append(f"{request_id}|{context_ids[span_key]}|{literal.replace('|', '/')}")
        prompt = instruction + "\nCONTEXTS:\n" + "\n".join(context_rows) + "\n\nREQUESTS:\n" + "\n".join(request_rows)
        request = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": min(400, max(80, 40 + len(batch) * 24)),
            "extra_body": {
                "provider": {"sort": "price"},
                **({"reasoning": {"effort": "none"}} if model_id.startswith("google/gemini-") else {}),
            },
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
            visible_folded = re.sub(r"\W+", "", visible_by_id.get(request_id, "").lower())
            invented = bool(answer not in {"-", "?"} and (INTERNAL_MODEL_ID.fullmatch(answer) or answer_folded not in visible_folded))
            if answer_folded == literal_folded or is_standalone_pronoun(answer) or invented:
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
                if stored_antecedent and (is_standalone_pronoun(literal) or DEMONSTRATIVE_PREFIX.match(literal) or DEFINITE_PREFIX.match(literal)):
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
    parser.add_argument("--reference-model", default="google/gemini-2.5-flash-lite")
    parser.add_argument("--max-reference-cost-usd", type=float, default=0.004)
    parser.add_argument("--reference-batch-size", type=int, default=12)
    parser.add_argument("--coverage-audit-model", default="qwen/qwen3-30b-a3b-instruct-2507")
    parser.add_argument("--coverage-quality-model", default="google/gemini-2.5-flash")
    parser.add_argument("--max-coverage-audit-cost-usd", type=float, default=0.004)
    parser.add_argument("--skip-coverage-audit", action="store_true")
    parser.add_argument("--cache-file", default=str(EXTRACTIONS / "historical-langextract-model-cache.jsonl"))
    parser.add_argument("--discourse-memory-file", default=None)
    parser.add_argument("--no-discourse-memory", action="store_true")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--skip-reference-fallback", action="store_true")
    parser.add_argument("--skip-constrained-coref", action="store_true")
    parser.add_argument("--coref-memory-pages", type=int, default=3)
    parser.add_argument("--repair-references-only", action="store_true")
    parser.add_argument("--validate-references-only", action="store_true")
    args = parser.parse_args()
    if args.page_count < 1 or args.max_cost_usd <= 0 or args.max_reference_cost_usd <= 0 or args.max_coverage_audit_cost_usd <= 0 or args.reference_batch_size < 1 or args.coref_memory_pages < 1:
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
    memory_path = Path(args.discourse_memory_file).expanduser().resolve() if args.discourse_memory_file else EXTRACTIONS / f"{args.source}.discourse-memory.json"
    persisted_memory, memory_status = ([], {"loaded": False, "reason": "disabled", "path": str(memory_path)}) if args.no_discourse_memory else load_persisted_discourse_memory(memory_path, args.from_page - 1)
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
    context_items: list[dict[str, Any]] = []
    invalid_rows: list[dict[str, Any]] = []
    grounded_extractions = 0
    extraction_count = len(result.extractions or [])
    for extraction in result.extractions or []:
        interval = extraction.char_interval
        if interval is None or interval.start_pos is None or interval.end_pos is None:
            continue
        grounded_extractions += 1
        evidence = evidence_for_span(interval.start_pos, interval.end_pos, coordinates, pages)
        touches_target = any(row["page_ref"] in target_pages for row in evidence)
        raw_items = (extraction.attributes or {}).get("items") or []
        if isinstance(raw_items, str):
            raw_items = [raw_items]
        for raw_item in raw_items:
            parsed = parse_item_row(str(raw_item))
            if parsed is None:
                invalid_rows.append({"extraction_text": extraction.extraction_text, "row": raw_item})
                continue
            identity = json.dumps([args.source, interval.start_pos, interval.end_pos, parsed], sort_keys=True, ensure_ascii=False)
            source_zone, disposition, zone_flags = classify_source_zone(parsed["statement_en"])
            parsed["risk_flags"] = sorted(set([*(parsed.get("risk_flags") or []), *zone_flags]))
            record = {
                "item_id": f"lx_{hashlib.sha256(identity.encode()).hexdigest()[:20]}",
                **parsed,
                "normalized_span": {"start_offset": interval.start_pos, "end_offset": interval.end_pos, "quote": normalized_text[interval.start_pos:interval.end_pos]},
                "evidence": evidence,
                "grounding_status": str(extraction.alignment_status.value if extraction.alignment_status else "grounded"),
                "source_zone": source_zone,
                "disposition": disposition,
                "publication_status": "private",
            }
            if touches_target:
                items.append(record)
            else:
                context_items.append(record)

    coverage_summary = {"model": args.coverage_audit_model, "quality_model": args.coverage_quality_model, "pages": [], "added_items": 0, "usage": {"calls": 0, "cost": 0.0, "saved_cost": 0.0}}
    if not args.skip_coverage_audit:
        remaining_budget = args.max_cost_usd - float(model.usage.get("cost") or 0)
        if remaining_budget <= 0:
            raise BudgetExceeded("no budget remains for required coverage audit")
        audit_items, coverage_summary = audit_missing_atomic_items(
            items, [*persisted_memory, *context_items], pages, sorted(target_pages), args.source, api_key,
            args.coverage_audit_model, args.coverage_quality_model,
            min(args.max_coverage_audit_cost_usd, remaining_budget), cache,
        )
        items.extend(audit_items)

    finalized_new_definites = finalize_new_definite_subjects(items, args.coref_memory_pages)
    reference_summary = {
        "model": "constrained_two_vote_coref" if not args.skip_constrained_coref else args.reference_model,
        "groups": 0, "resolved": 0, "ambiguous": 0, "not_applicable": finalized_new_definites,
        "new_definite_subjects": finalized_new_definites,
        "usage": {"calls": 0, "cost": 0.0, "saved_cost": 0.0},
    }
    if not args.skip_reference_fallback:
        remaining_budget = args.max_cost_usd - float(model.usage.get("cost") or 0) - float(coverage_summary["usage"].get("cost") or 0)
        if remaining_budget <= 0:
            raise BudgetExceeded("no budget remains for required reference fallback")
        supported_items = [item for item in items if item.get("verification", {}).get("verdict") != "unsupported"]
        if not args.skip_constrained_coref:
            payloads, constrained_usage = run_constrained_coref_stage(
                args.source, sorted(target_pages), set(pages), supported_items,
                min(args.max_reference_cost_usd, remaining_budget), args.no_cache,
                memory_pages=args.coref_memory_pages,
            )
            link_summary = apply_constrained_coref_results(supported_items, payloads)
            reference_summary = {
                "model": "flash-lite+qwen+flash-on-disagreement",
                "groups": link_summary["links"],
                "resolved": link_summary["resolved_leading_links"],
                "ambiguous": link_summary["ambiguous_leading_links"],
                "not_applicable": finalized_new_definites,
                "usage": {
                    "calls": len(constrained_usage["pages"]),
                    "cost": constrained_usage["paid_cost_usd"],
                    "saved_cost": constrained_usage["saved_cost_usd"],
                },
                "constrained": constrained_usage,
                "links": link_summary,
                "new_definite_subjects": finalized_new_definites,
            }
        else:
            reference_summary = resolve_reference_antecedents(
                supported_items, pages, api_key, args.reference_model,
                min(args.max_reference_cost_usd, remaining_budget), cache, args.reference_batch_size,
                memory_items=[*persisted_memory, *context_items],
            )

    post_resolution_duplicates = reject_post_resolution_duplicates(items)
    coverage_summary["post_resolution_duplicates_rejected"] = post_resolution_duplicates
    coverage_summary["added_items_after_dedup"] = max(0, int(coverage_summary.get("added_items") or 0) - post_resolution_duplicates)

    if not args.no_discourse_memory:
        save_persisted_discourse_memory(memory_path, args.source, max(target_pages), [*persisted_memory, *context_items, *items])
        memory_status["saved"] = True
        memory_status["saved_through_page"] = max(target_pages)

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
            "coverage_audit": coverage_summary,
            "discourse_memory": memory_status,
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
            "supported_items": sum(1 for item in items if item.get("verification", {}).get("verdict") != "unsupported" and item.get("disposition") != "reference_only"),
            "reference_only_or_rejected_items": sum(1 for item in items if item.get("verification", {}).get("verdict") == "unsupported" or item.get("disposition") == "reference_only"),
            "invalid_item_rows": len(invalid_rows),
            "schema_valid_rate": len(items) / (len(items) + len(invalid_rows)) if items or invalid_rows else 0,
            "unresolved_references": sum(1 for item in items if item["reference_status"] == "ambiguous" and item.get("verification", {}).get("verdict") != "unsupported" and item.get("disposition") != "reference_only"),
            "risk_flagged_items": sum(1 for item in items if item.get("risk_flags")),
        },
        "regressions": regressions,
        "regressions_passed": sum(regressions.values()),
        "regressions_total": len(regressions),
        "reference_resolution": reference_summary,
        "coverage_audit": coverage_summary,
        "discourse_memory": memory_status,
        "cache": {"enabled": cache.enabled, "path": str(cache.path)},
        "usage": {
            **model.usage,
            "reference_cost": reference_summary["usage"]["cost"],
            "reference_saved_cost": reference_summary["usage"].get("saved_cost", 0.0),
            "coverage_audit_cost": coverage_summary["usage"].get("cost", 0.0),
            "coverage_audit_saved_cost": coverage_summary["usage"].get("saved_cost", 0.0),
            "total_cost": model.usage["cost"] + coverage_summary["usage"].get("cost", 0.0) + reference_summary["usage"]["cost"],
            "total_saved_cost": model.usage["saved_cost"] + coverage_summary["usage"].get("saved_cost", 0.0) + reference_summary["usage"].get("saved_cost", 0.0),
            "uncached_equivalent_cost": (
                model.usage["cost"]
                + coverage_summary["usage"].get("cost", 0.0)
                + reference_summary["usage"]["cost"]
                + model.usage["saved_cost"]
                + coverage_summary["usage"].get("saved_cost", 0.0)
                + reference_summary["usage"].get("saved_cost", 0.0)
            ),
            "average_cost_usd_per_page": model.usage["cost"] / args.page_count,
            "average_total_cost_usd_per_page": (model.usage["cost"] + coverage_summary["usage"].get("cost", 0.0) + reference_summary["usage"]["cost"]) / args.page_count,
            "average_uncached_equivalent_cost_usd_per_page": (
                model.usage["cost"]
                + coverage_summary["usage"].get("cost", 0.0)
                + reference_summary["usage"]["cost"]
                + model.usage["saved_cost"]
                + coverage_summary["usage"].get("saved_cost", 0.0)
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
