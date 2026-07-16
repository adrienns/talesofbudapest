#!/usr/bin/env python3
"""Detect historical-book entity mentions locally with exact page offsets.

Input is one JSON document on stdin: {"pages": [{"page": 1, "text": "..."}]}.
Output is one JSON document on stdout. Model/library logs remain on stderr.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from typing import Any, Iterable

try:
    from gliner2 import GLiNER2
except ImportError as error:
    raise SystemExit(
        "GLiNER2 local runtime is missing. Run `npm run setup:historical:nlp` "
        "from talesofbudapest-backend."
    ) from error


ENTITY_LABELS = [
    "person",
    "family",
    "organization",
    "place",
    "building",
    "business",
    "creative work",
    "population group",
    "religion or movement",
    "historical event",
    "date or time",
]

TYPE_ALIASES = {
    "organisation": "organisation",
    "organization": "organisation",
    "person": "person",
    "family": "family",
    "place": "place",
    "location": "place",
    "building": "building",
    "business": "business",
    "creative work": "work",
    "work": "work",
    "population group": "group",
    "group": "group",
    "religion or movement": "movement",
    "religion": "movement",
    "movement": "movement",
    "historical event": "event",
    "event": "event",
    "date or time": "date",
    "date": "date",
    "time": "date",
}

MIN_CONFIDENCE_BY_TYPE = {
    "person": 0.75,
    "family": 0.78,
    "organisation": 0.70,
    "place": 0.78,
    "building": 0.72,
    "business": 0.72,
    "work": 0.60,
    "group": 0.75,
    "movement": 0.65,
    "event": 0.65,
    "date": 0.80,
}

GENERIC_MENTIONS = {
    "father",
    "mother",
    "son",
    "daughter",
    "brother",
    "sister",
    "husband",
    "wife",
    "family",
    "man",
    "woman",
}

HEURISTIC_PATTERNS = [
    ("person", re.compile(r"\b(?:R\.|Rabbi|Dr\.|Count|Baron|Professor|General)\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+(?:ben\s+)?[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,4}")),
    # Book-specific city anchors: GLiNER can skip Buda when it is embedded in
    # a dense historical claim, but it is unambiguously a place in this corpus.
    ("place", re.compile(r"\b(?:Buda|Pest|Budapest|Óbuda|Obuda)\b", re.IGNORECASE)),
    # Keep generic synagogue references as exact building mentions. They are
    # intentionally not resolved to one named building; the browser aggregates
    # them as a searchable building class.
    ("building", re.compile(r"\bsynagog(?:ue|ues)\b", re.IGNORECASE)),
    ("organisation", re.compile(r"\b(?:[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+\s+){1,5}(?:community|Society|Academy|University|Diet|Parliament|Council|synagogue|school|parish|authorities|leadership)\b")),
    ("work", re.compile(r"\b(?:Sefer|Sha'ar|Mahane|Panim|Mishneh|Yemei)\s+[A-ZÀ-Ža-zà-ž][A-Za-zÀ-ž'’ -]{1,50}")),
    ("group", re.compile(r"\b(?:the\s+)?(?:fanatic\s+)?followers of the (?:new\s+)?Messiah\b", re.IGNORECASE)),
    ("group", re.compile(r"\b(?:an?|the)\s+(?:observant\s+)?Jew\b", re.IGNORECASE)),
    ("movement", re.compile(r"\b(?:Islam|Moslem|Muslim|Christianity|Protestant|Lutheran|Calvinist|Shabbateans?|Hasid(?:ic|im)?|Sephardi(?:m)?|Ashkenazi(?:m)?|Messianic movement)\b", re.IGNORECASE)),
    ("event", re.compile(r"\b(?:flood|epidemic|cholera epidemic|sieges?|reconquest|War of Independence)\b", re.IGNORECASE)),
]


def chunks(text: str, max_chars: int, overlap: int = 160) -> Iterable[tuple[int, str]]:
    """Yield overlapping, whitespace-aligned chunks and their page-relative starts."""
    start = 0
    while start < len(text):
        hard_end = min(len(text), start + max_chars)
        end = hard_end
        if hard_end < len(text):
            floor = start + max_chars // 2
            breaks = [text.rfind("\n", floor, hard_end), text.rfind(" ", floor, hard_end)]
            end = max(breaks)
            if end <= start:
                end = hard_end
        yield start, text[start:end]
        if end >= len(text):
            return
        start = max(start + 1, end - overlap)


def occurrences(text: str, needle: str) -> Iterable[int]:
    cursor = 0
    while needle and cursor < len(text):
        found = text.find(needle, cursor)
        if found < 0:
            return
        yield found
        cursor = found + max(1, len(needle))


def normalize_reading_view(source_text: str) -> tuple[str, list[int], list[int]]:
    """Build readable OCR text plus a reversible map to immutable source offsets."""
    chars: list[str] = []
    raw_starts: list[int] = []
    raw_ends: list[int] = []

    def append(char: str, raw_start: int, raw_end: int) -> None:
        if char.isspace():
            if not chars:
                return
            if chars[-1] == " ":
                raw_ends[-1] = raw_end
                return
            char = " "
        chars.append(char)
        raw_starts.append(raw_start)
        raw_ends.append(raw_end)

    index = 0
    while index < len(source_text):
        # Join words split by print-layout line breaks: "finan-\ncial" -> "financial".
        if source_text[index] == "-" and index > 0 and source_text[index - 1].isalpha():
            cursor = index + 1
            while cursor < len(source_text) and source_text[cursor] in " \t\r":
                cursor += 1
            if cursor < len(source_text) and source_text[cursor] == "\n":
                cursor += 1
                while cursor < len(source_text) and source_text[cursor].isspace():
                    cursor += 1
                if cursor < len(source_text) and source_text[cursor].isalpha():
                    index = cursor
                    continue
        if source_text[index].isspace():
            cursor = index + 1
            while cursor < len(source_text) and source_text[cursor].isspace():
                cursor += 1
            append(" ", index, cursor)
            index = cursor
            continue
        # This scan encodes Hungarian umlauts as digit 6 inside words
        # (`T6r6k`, `K6zépponti`, `temet6`). Repair only letter-adjacent
        # cases; years and house numbers remain digits. Replacement is one
        # code point, so immutable raw offsets still align exactly.
        if source_text[index] == "6" and index > 0 and source_text[index - 1].isalpha():
            next_char = source_text[index + 1] if index + 1 < len(source_text) else ""
            if not next_char or next_char.isalpha() or not next_char.isdigit():
                append("ö" if next_char.isalpha() else "ő", index, index + 1)
                index += 1
                continue
        append(source_text[index], index, index + 1)
        index += 1

    return "".join(chars).strip(), raw_starts, raw_ends


def entity_groups(result: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(result, dict):
        grouped = result.get("entities", result)
        if isinstance(grouped, dict):
            for label, values in grouped.items():
                if isinstance(values, list):
                    for value in values:
                        yield str(label), value
            return
        if isinstance(grouped, list):
            for value in grouped:
                if isinstance(value, dict):
                    yield str(value.get("label") or value.get("type") or "unknown"), value


def unpack(value: Any) -> tuple[str | None, int | None, int | None, float | None]:
    if isinstance(value, str):
        return value, None, None, None
    if isinstance(value, dict):
        text = value.get("text") or value.get("value") or value.get("entity")
        start = value.get("start")
        end = value.get("end")
        score = value.get("confidence", value.get("score"))
        return (
            text if isinstance(text, str) else None,
            start if isinstance(start, int) else None,
            end if isinstance(end, int) else None,
            float(score) if isinstance(score, (int, float)) and math.isfinite(score) else None,
        )
    if isinstance(value, (list, tuple)) and value and isinstance(value[0], str):
        start = value[1] if len(value) > 2 and isinstance(value[1], int) else None
        end = value[2] if len(value) > 2 and isinstance(value[2], int) else None
        score = value[3] if len(value) > 3 and isinstance(value[3], (int, float)) else None
        return value[0], start, end, float(score) if score is not None else None
    return None, None, None, None


def detect_page(
    model: Any,
    page: int,
    source_text: str,
    reading_text: str,
    raw_starts: list[int],
    raw_ends: list[int],
    threshold: float,
    max_chars: int,
) -> list[dict[str, Any]]:
    found: dict[tuple[int, int, str], dict[str, Any]] = {}
    for chunk_start, chunk in chunks(reading_text, max_chars):
        result = model.extract_entities(
            chunk,
            ENTITY_LABELS,
            threshold=threshold,
            include_confidence=True,
            include_spans=True,
        )
        for raw_label, value in entity_groups(result):
            mention_text, local_start, local_end, confidence = unpack(value)
            entity_type = TYPE_ALIASES.get(raw_label.strip().lower())
            if not entity_type or not mention_text or not mention_text.strip():
                continue
            candidate_offsets: list[tuple[int, int]] = []
            if (
                local_start is not None
                and local_end is not None
                and 0 <= local_start < local_end <= len(chunk)
                and chunk[local_start:local_end] == mention_text
            ):
                candidate_offsets.append((local_start, local_end))
            else:
                candidate_offsets.extend((start, start + len(mention_text)) for start in occurrences(chunk, mention_text))
            for relative_start, relative_end in candidate_offsets:
                reading_start = chunk_start + relative_start
                reading_end = chunk_start + relative_end
                if reading_text[reading_start:reading_end] != mention_text or reading_end > len(raw_ends):
                    continue
                start = raw_starts[reading_start]
                end = raw_ends[reading_end - 1]
                if not 0 <= start < end <= len(source_text):
                    continue
                key = (start, end, entity_type)
                item = {
                    "page": page,
                    "start_offset": start,
                    "end_offset": end,
                    "text": source_text[start:end],
                    "normalized_text": mention_text,
                    "reading_start_offset": reading_start,
                    "reading_end_offset": reading_end,
                    "type": entity_type,
                    "confidence": confidence,
                }
                previous = found.get(key)
                if previous is None or (confidence or 0) > (previous.get("confidence") or 0):
                    found[key] = item
    filtered: list[dict[str, Any]] = []
    for item in found.values():
        confidence = item.get("confidence")
        minimum = max(threshold, MIN_CONFIDENCE_BY_TYPE.get(item["type"], threshold))
        normalized = " ".join(item["normalized_text"].lower().split()).strip(".,;:!?()[]{}\"'")
        if confidence is None or confidence < minimum or normalized in GENERIC_MENTIONS:
            continue
        filtered.append(item)

    for entity_type, pattern in HEURISTIC_PATTERNS:
        for match in pattern.finditer(reading_text):
            reading_start, reading_end = match.span()
            if reading_end <= reading_start or reading_end > len(raw_ends):
                continue
            start = raw_starts[reading_start]
            end = raw_ends[reading_end - 1]
            filtered.append({
                "page": page,
                "start_offset": start,
                "end_offset": end,
                "text": source_text[start:end],
                "normalized_text": match.group(0),
                "reading_start_offset": reading_start,
                "reading_end_offset": reading_end,
                "type": entity_type,
                "confidence": 1.0,
                "source": "deterministic_pattern",
            })

    # A single span often receives several labels. Keep the strongest label so downstream
    # schema gating does not turn one mention into several fictional participants.
    by_span: dict[tuple[int, int], dict[str, Any]] = {}
    for item in filtered:
        key = (item["start_offset"], item["end_offset"])
        previous = by_span.get(key)
        if previous is None or (item.get("confidence") or 0) > (previous.get("confidence") or 0):
            by_span[key] = item
    strongest = list(by_span.values())
    # Do not turn words inside a person's name into separate movements/groups
    # (for example "Ashkenazi" inside "R. Jacob ... Ashkenazi").
    pruned = [
        item for item in strongest
        if not (
            item["type"] in {"movement", "group"}
            and any(
                person["type"] == "person"
                and person["start_offset"] <= item["start_offset"]
                and person["end_offset"] >= item["end_offset"]
                and (person["start_offset"], person["end_offset"]) != (item["start_offset"], item["end_offset"])
                for person in strongest
            )
        )
    ]
    return sorted(pruned, key=lambda item: (item["start_offset"], item["end_offset"], item["type"]))


def load_noun_phrase_parser() -> Any:
    """Load the spaCy pipeline for the local noun-phrase ledger.

    V3 subject memory needs ordinary noun heads (tomb, school, building) that
    GLiNER labels miss. Failing loudly here keeps V3 from silently degrading.
    """
    try:
        import spacy
    except ImportError as error:
        raise SystemExit(
            "spaCy is required for --noun-ledger. Run `npm run setup:historical:nlp`."
        ) from error
    try:
        return spacy.load("en_core_web_sm")
    except OSError as error:
        raise SystemExit(
            "spaCy model en_core_web_sm is missing. Install it inside "
            ".venv-historical-nlp with `python -m spacy download en_core_web_sm`."
        ) from error


def noun_ledger_for_page(
    parser: Any,
    page: int,
    source_text: str,
    reading_text: str,
    raw_starts: list[int],
    raw_ends: list[int],
) -> list[dict[str, Any]]:
    from noun_phrases import noun_phrase_rows

    ledger: list[dict[str, Any]] = []
    for row in noun_phrase_rows(parser(reading_text)):
        reading_start = row["reading_start"]
        reading_end = row["reading_end"]
        if reading_end <= reading_start or reading_end > len(raw_ends):
            continue
        start = raw_starts[reading_start]
        end = raw_ends[reading_end - 1]
        if not 0 <= start < end <= len(source_text):
            continue
        ledger.append({
            **row,
            "page": page,
            "start_offset": start,
            "end_offset": end,
            "reading_start_offset": reading_start,
            "reading_end_offset": reading_end,
            "source_text": source_text[start:end],
        })
    return ledger


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="fastino/gliner2-multi-v1")
    parser.add_argument("--threshold", type=float, default=0.50)
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--noun-ledger", action="store_true")
    args = parser.parse_args()
    if not 0 < args.threshold <= 1 or args.max_chars < 500:
        raise SystemExit("--threshold must be in (0,1] and --max-chars must be >= 500")

    payload = json.load(sys.stdin)
    pages = payload.get("pages")
    if not isinstance(pages, list) or not pages:
        raise SystemExit("stdin JSON must contain a non-empty pages array")

    print(f"Loading local GLiNER2 model {args.model} on {args.device}...", file=sys.stderr)
    model = GLiNER2.from_pretrained(args.model, map_location=args.device)
    noun_parser = load_noun_phrase_parser() if args.noun_ledger else None
    mentions: list[dict[str, Any]] = []
    reading_pages: list[dict[str, Any]] = []
    noun_phrases: list[dict[str, Any]] = []
    for source_page in pages:
        page = source_page.get("page")
        text = source_page.get("text")
        if not isinstance(page, int) or not isinstance(text, str):
            raise SystemExit("each page needs integer page and string text")
        reading_text, raw_starts, raw_ends = normalize_reading_view(text)
        reading_pages.append({
            "page": page,
            "text": reading_text,
            "raw_starts": raw_starts,
            "raw_ends": raw_ends,
        })
        mentions.extend(detect_page(
            model, page, text, reading_text, raw_starts, raw_ends, args.threshold, args.max_chars
        ))
        if noun_parser is not None:
            noun_phrases.extend(noun_ledger_for_page(noun_parser, page, text, reading_text, raw_starts, raw_ends))
    json.dump(
        {
            "engine": "gliner2",
            "model": args.model,
            "threshold": args.threshold,
            "labels": ENTITY_LABELS,
            "mentions": mentions,
            "reading_pages": reading_pages,
            "noun_phrases": noun_phrases if noun_parser is not None else None,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
