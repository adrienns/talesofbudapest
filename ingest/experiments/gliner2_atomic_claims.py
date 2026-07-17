#!/usr/bin/env python3
"""Local GLiNER2 atomic-claim experiment. No source text leaves this machine."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from gliner2 import GLiNER2


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "ingest/corpus/restricted/text/jewish-budapest.pages.txt"
DEFAULT_OUTPUT_DIR = ROOT / "ingest/corpus/restricted/experiments/atomic-claims"
MODEL_ID = "fastino/gliner2-base-v1"

ENTITY_TYPES = {
    "person": "Named historical person",
    "location": "Building, street, address, district, city, institution site, or geographic place",
    "organisation": "Business, school, religious community, government body, or other organisation",
    "event": "Named or bounded historical occurrence",
    "group": "Family, religious group, social group, or unnamed collective",
    "occupation": "Profession, trade, office, title, or social role",
    "date": "Year, date, period, century, or date range",
    "work": "Book, article, artwork, newspaper, or other named work",
}

RELATION_TYPES = {
    "built": "A person or organisation constructed a building or place",
    "designed": "A person designed a building, object, or work",
    "founded": "A person or group established an organisation or institution",
    "owned": "A person or organisation owned property or an object",
    "rented": "A person or group rented property or premises",
    "took_over": "A person or group assumed control of a business, property, or role",
    "lived_at": "A person resided at a place or address",
    "worked_at": "A person worked at a place or organisation",
    "operated_at": "A business or organisation operated at a place",
    "attended": "A person attended a school, event, or institution",
    "studied_at": "A person studied at a school or institution",
    "taught_at": "A person taught at a school or institution",
    "served_as": "A person held an occupation, office, title, or role",
    "member_of": "A person belonged to an organisation or group",
    "located_at": "A place, business, organisation, or event was situated at another place or address",
    "happened_at": "An event occurred at a place",
    "converted_to": "A person adopted a religion or denomination",
    "donated_to": "A person or group donated to an organisation, community, or cause",
    "commemorated_by": "A person, group, or event was commemorated by an object or organisation",
    "wrote": "A person authored a work",
    "related_to": "A person had a stated family relationship to another person",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="jewish-budapest")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--from-page", type=int, default=103)
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--threshold", type=float, default=0.42)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def pages_from_text(text: str) -> list[tuple[int, str]]:
    return [
        (int(match.group(1)), match.group(2).strip())
        for match in re.finditer(
            r"--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)",
            text,
        )
        if match.group(2).strip()
    ]


def evidence_units(page_text: str) -> list[str]:
    # Keep each unit as an exact substring of the stored page text. Paragraph-sized fallbacks
    # preserve claims from OCR text whose punctuation does not form conventional sentences.
    units: list[str] = []
    for paragraph in re.split(r"\n\s*\n", page_text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        matches = [match.group(0).strip() for match in re.finditer(r"[^.!?]+(?:[.!?]+(?=\s|$)|$)", paragraph)]
        for unit in matches or [paragraph]:
            if 35 <= len(unit) <= 1800:
                units.append(unit)
    return units


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if hasattr(value, "item"):
        return value.item()
    return value


def value_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)) and value:
        return value_text(value[0])
    if isinstance(value, dict):
        for key in ("text", "mention", "value", "name", "span"):
            if key in value:
                text = value_text(value[key])
                if text:
                    return text
    return None


def entity_type_map(result: dict[str, Any]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for kind, values in (result.get("entities") or {}).items():
        for value in values if isinstance(values, list) else [values]:
            text = value_text(value)
            if text:
                mapping[text.casefold()] = kind
    return mapping


def confidence_of(item: Any) -> float | None:
    if not isinstance(item, dict):
        return None
    for key in ("confidence", "score", "probability"):
        value = item.get(key)
        if isinstance(value, (int, float)):
            return round(float(value), 6)
    return None


def relation_records(result: dict[str, Any]) -> list[tuple[str, Any]]:
    container = result.get("relation_extraction") or result.get("relations") or {}
    records: list[tuple[str, Any]] = []
    if isinstance(container, dict):
        for predicate, items in container.items():
            for item in items if isinstance(items, list) else [items]:
                records.append((predicate, item))
    elif isinstance(container, list):
        for entry in container:
            if isinstance(entry, dict):
                for predicate, item in entry.items():
                    records.append((predicate, item))
    return records


def relation_ends(item: Any) -> tuple[str | None, str | None]:
    if isinstance(item, (list, tuple)) and len(item) >= 2:
        return value_text(item[0]), value_text(item[1])
    if isinstance(item, dict):
        return value_text(item.get("head") or item.get("subject")), value_text(item.get("tail") or item.get("object"))
    return None, None


def claim_id(source: str, page: int, quote: str, subject: str, predicate: str, obj: str) -> str:
    digest = hashlib.sha256(f"{source}\n{page}\n{quote}\n{subject}\n{predicate}\n{obj}".encode()).hexdigest()
    return f"claim_{digest[:20]}"


def main() -> None:
    args = parse_args()
    if args.pages < 1 or args.pages > 5 or args.from_page < 1 or not 0 < args.threshold < 1:
        raise SystemExit("Use 1-5 pages, a positive start page, and a threshold between 0 and 1")

    selected = [
        (page, text)
        for page, text in pages_from_text(args.input.read_text(encoding="utf-8"))
        if args.from_page <= page < args.from_page + args.pages
    ]
    if len(selected) != args.pages:
        raise SystemExit(f"Expected {args.pages} pages starting at {args.from_page}, found {len(selected)}")

    print(f"Loading local model {MODEL_ID}...")
    extractor = GLiNER2.from_pretrained(MODEL_ID)
    schema = extractor.create_schema().entities(ENTITY_TYPES, threshold=args.threshold).relations(
        RELATION_TYPES,
        threshold=args.threshold,
    )

    raw_rows: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []
    seen: set[str] = set()
    total_units = sum(len(evidence_units(text)) for _, text in selected)
    completed = 0

    for page, page_text in selected:
        for quote in evidence_units(page_text):
            completed += 1
            result = json_safe(extractor.extract(
                quote,
                schema,
                threshold=args.threshold,
                format_results=True,
                include_confidence=True,
                include_spans=True,
                max_len=384,
            ))
            raw_rows.append({"source_id": args.source, "pdf_page": page, "evidence_quote": quote, "result": result})
            types = entity_type_map(result)
            for predicate, relation in relation_records(result):
                subject, obj = relation_ends(relation)
                if not subject or not obj:
                    continue
                identifier = claim_id(args.source, page, quote, subject, predicate, obj)
                if identifier in seen:
                    continue
                seen.add(identifier)
                claims.append({
                    "experiment_version": "gliner2-atomic-claims-v1",
                    "claim_id": identifier,
                    "source_id": args.source,
                    "statement_en": f"{subject} {predicate.replace('_', ' ')} {obj}.",
                    "subject": {"source_name": subject, "kind_hint": types.get(subject.casefold(), "unknown")},
                    "predicate": {"relation_hint": predicate},
                    "object": {"source_name": obj, "kind_hint": types.get(obj.casefold(), "unknown")},
                    "qualifiers": {"time_source": None, "place_source": None, "negated": False},
                    "source_certainty": "stated",
                    "extraction_confidence": confidence_of(relation),
                    "evidence": {"pdf_page": page, "quote_verbatim": quote},
                    "model": MODEL_ID,
                })
            print(f"Processed evidence unit {completed}/{total_units}; claims={len(claims)}", end="\r", flush=True)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{args.source}.pages-{args.from_page}-{args.from_page + args.pages - 1}.gliner2"
    claims_path = args.output_dir / f"{stem}.claims.jsonl"
    raw_path = args.output_dir / f"{stem}.raw.jsonl"
    claims_path.write_text("".join(f"{json.dumps(row, ensure_ascii=False)}\n" for row in claims), encoding="utf-8")
    raw_path.write_text("".join(f"{json.dumps(row, ensure_ascii=False)}\n" for row in raw_rows), encoding="utf-8")
    print(f"\nExtracted {len(claims)} claims from {len(selected)} pages and {total_units} evidence units.")
    print(f"Claims: {claims_path}")
    print(f"Raw audit output: {raw_path}")


if __name__ == "__main__":
    main()
