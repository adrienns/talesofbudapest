#!/usr/bin/env python3
"""Run a local BookNLP coreference pilot on a small range of book pages.

The pilot deliberately keeps BookNLP output separate from production facts.  Its
purpose is to inspect candidate chains before using them to resolve entities.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

import torch
from booknlp.booknlp import BookNLP


BACKEND = Path(__file__).resolve().parents[1]
WORKSPACE = BACKEND.parent
TEXT_DIR = WORKSPACE / "ingest/corpus/restricted/text"
OUTPUT_ROOT = WORKSPACE / "ingest/corpus/restricted/extractions/booknlp-pilot"


def parse_pages(text: str) -> dict[int, str]:
    return {
        int(match.group(1)): match.group(2).strip()
        for match in re.finditer(r"--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)", text)
    }


def normalize_page(source: str) -> str:
    """Create the reading view used by every NLP model, without OCR line splits."""
    source = re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[A-Za-z])", "", source)
    return re.sub(r"\s+", " ", source).strip()


def allow_legacy_position_ids() -> None:
    """Bridge BookNLP's old BERT checkpoints to current Transformers.

    ``position_ids`` is a non-learned buffer that newer Transformers versions
    generate at runtime. It is safe to discard it from BookNLP's older state
    dictionaries; all learned weights remain strict.
    """
    original = torch.nn.Module.load_state_dict

    def load_state_dict(module, state_dict, strict=True, assign=False):  # type: ignore[no-untyped-def]
        filtered = state_dict.copy()
        filtered.pop("bert.embeddings.position_ids", None)
        return original(module, filtered, strict=strict, assign=assign)

    torch.nn.Module.load_state_dict = load_state_dict


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--from-page", type=int, required=True)
    parser.add_argument("--page-count", type=int, required=True)
    parser.add_argument("--model", choices=("small", "big"), default="small")
    parser.add_argument("--fresh", action="store_true", help="replace a prior pilot range")
    args = parser.parse_args()
    if args.page_count < 1:
        raise SystemExit("--page-count must be positive")

    pages = parse_pages((TEXT_DIR / f"{args.source}.pages.txt").read_text("utf-8"))
    selected = list(range(args.from_page, args.from_page + args.page_count))
    missing = [page for page in selected if page not in pages]
    if missing:
        raise SystemExit(f"Missing PDF pages: {missing}")

    output_dir = OUTPUT_ROOT / args.source / f"pages-{selected[0]}-{selected[-1]}"
    if output_dir.exists() and args.fresh:
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path = output_dir / "reading-view.txt"
    page_map = []
    chunks = []
    cursor = 0
    for page in selected:
        text = normalize_page(pages[page])
        chunks.append(text)
        page_map.append({"page_ref": page, "reading_start": cursor, "reading_end": cursor + len(text)})
        cursor += len(text) + 2
    input_path.write_text("\n\n".join(chunks), "utf-8")
    (output_dir / "pilot-metadata.json").write_text(json.dumps({
        "source": args.source,
        "pages": selected,
        "model": args.model,
        "reading_view": "OCR hyphen/newline repair then whitespace collapse",
        "page_map": page_map,
    }, indent=2) + "\n", "utf-8")

    # BookNLP requires its local quote-attribution prerequisite for coreference.
    # Event extraction remains intentionally out of scope for this pilot.
    allow_legacy_position_ids()
    BookNLP("en", {"pipeline": "entity,quote,coref", "model": args.model}).process(
        str(input_path), str(output_dir), "book"
    )
    print(json.dumps({
        "output_dir": str(output_dir),
        "entities": str(output_dir / "book.entities"),
        "tokens": str(output_dir / "book.tokens"),
        "input": str(input_path),
    }, indent=2))


if __name__ == "__main__":
    main()
