#!/usr/bin/env python3
"""Extract each PDF page into a stable page-delimited UTF-8 text file."""

from pathlib import Path
import sys

from pypdf import PdfReader


def main() -> None:
    if len(sys.argv) not in (3, 5, 6):
        raise SystemExit("Usage: extract_pdf_text.py INPUT.pdf OUTPUT.txt [START_PAGE END_PAGE [--append]]")

    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    reader = PdfReader(str(source))
    destination.parent.mkdir(parents=True, exist_ok=True)
    start_page = int(sys.argv[3]) if len(sys.argv) >= 5 else 1
    end_page = int(sys.argv[4]) if len(sys.argv) >= 5 else len(reader.pages)
    append = len(sys.argv) == 6 and sys.argv[5] == "--append"
    if not 1 <= start_page <= end_page <= len(reader.pages):
        raise SystemExit("Page range is outside the PDF")

    with destination.open("a" if append else "w", encoding="utf-8") as output:
        # Indexing explicitly is important for this scanned file: iterating the
        # virtual page list can terminate early despite its reported length.
        for page_number in range(start_page, end_page + 1):
            page = reader.pages[page_number - 1]
            text = (page.extract_text() or "").replace("\0", "")
            output.write(f"--- PDF PAGE {page_number} ---\n\n{text.strip()}\n\n")


if __name__ == "__main__":
    main()
