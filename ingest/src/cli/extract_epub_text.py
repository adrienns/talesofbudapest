#!/usr/bin/env python3
"""Extract EPUB print-page breaks into stable page-delimited UTF-8 text.

Expects EPUB3 `epub:type="pagebreak"` markers (aria-label / id like Page N /
page_N). Output matches the restricted-corpus pages.txt contract used by
extract-restricted-book.js:

  --- PDF PAGE N ---

  <page text>

Never rewrite an existing pages.txt in place for a different edition — pick a
new source_id / path. Restricted sources stay private (red).
"""

from __future__ import annotations

import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET


PAGEBREAK_RE = re.compile(
    r'<(?:span|div|p|hr)\b[^>]*?(?:epub:type|role)\s*=\s*["\'](?:pagebreak|doc-pagebreak)["\'][^>]*?/?>',
    re.I,
)
PAGE_NUM_RE = re.compile(
    r'(?:aria-label|title)\s*=\s*["\']Page\s+(\d+)["\']|id\s*=\s*["\']page[_-]?(\d+)["\']',
    re.I,
)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._skip += 1
            return
        if tag in {"br", "p", "div", "h1", "h2", "h3", "h4", "li", "tr", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._skip:
            self._skip -= 1
        if tag in {"p", "div", "h1", "h2", "h3", "h4", "li", "section"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        self.parts.append(data)


def html_to_text(fragment: str) -> str:
    parser = _TextExtractor()
    parser.feed(fragment)
    parser.close()
    text = "".join(parser.parts)
    text = text.replace("\u00ad", "")  # soft hyphen
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def spine_html_paths(zf: zipfile.ZipFile) -> list[str]:
    opf_name = next(n for n in zf.namelist() if n.endswith(".opf"))
    root = ET.fromstring(zf.read(opf_name))
    ns = {
        "opf": "http://www.idpf.org/2007/opf",
        "": "http://www.idpf.org/2007/opf",
    }
    # ElementTree may keep default ns on tags
    def local(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    manifest: dict[str, str] = {}
    for item in root.iter():
        if local(item.tag) != "item":
            continue
        item_id = item.attrib.get("id")
        href = item.attrib.get("href")
        if item_id and href:
            manifest[item_id] = href

    opf_dir = str(Path(opf_name).parent).replace("\\", "/")
    if opf_dir == ".":
        opf_dir = ""

    ordered: list[str] = []
    for itemref in root.iter():
        if local(itemref.tag) != "itemref":
            continue
        idref = itemref.attrib.get("idref")
        href = manifest.get(idref or "")
        if not href:
            continue
        full = f"{opf_dir}/{href}" if opf_dir else href
        full = str(Path(full)).replace("\\", "/")
        if full.lower().endswith((".xhtml", ".html", ".htm")):
            ordered.append(full)
    return ordered


def split_on_pagebreaks(html: str) -> list[tuple[int | None, str]]:
    """Return [(page_number_or_None, html_fragment), ...] in document order."""
    parts: list[tuple[int | None, str]] = []
    last = 0
    current_page: int | None = None
    for match in PAGEBREAK_RE.finditer(html):
        before = html[last : match.start()]
        if before.strip() or parts:
            parts.append((current_page, before))
        nums = PAGE_NUM_RE.search(match.group(0))
        if not nums:
            raise SystemExit(f"pagebreak without page number: {match.group(0)[:160]}")
        current_page = int(nums.group(1) or nums.group(2))
        last = match.end()
    tail = html[last:]
    if tail.strip() or current_page is not None:
        parts.append((current_page, tail))
    return parts


def extract_pages(epub_path: Path) -> dict[int, str]:
    pages: dict[int, list[str]] = {}
    with zipfile.ZipFile(epub_path) as zf:
        for path in spine_html_paths(zf):
            raw = zf.read(path).decode("utf-8", errors="replace")
            # Keep body only when present
            body = re.search(r"<body\b[^>]*>([\s\S]*)</body>", raw, re.I)
            html = body.group(1) if body else raw
            for page_num, fragment in split_on_pagebreaks(html):
                if page_num is None:
                    continue
                text = html_to_text(fragment)
                if not text:
                    continue
                pages.setdefault(page_num, []).append(text)
    return {num: "\n\n".join(chunks).strip() for num, chunks in sorted(pages.items())}


def main() -> None:
    if len(sys.argv) not in (3, 5):
        raise SystemExit(
            "Usage: extract_epub_text.py INPUT.epub OUTPUT.txt [START_PAGE END_PAGE]"
        )
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    start_page = int(sys.argv[3]) if len(sys.argv) == 5 else None
    end_page = int(sys.argv[4]) if len(sys.argv) == 5 else None

    pages = extract_pages(source)
    if not pages:
        raise SystemExit("No epub:type=pagebreak markers found")

    selected = [
        (num, text)
        for num, text in pages.items()
        if (start_page is None or num >= start_page)
        and (end_page is None or num <= end_page)
    ]
    if not selected:
        raise SystemExit(
            f"No pages in range; available {min(pages)}–{max(pages)} ({len(pages)} pages)"
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as output:
        for num, text in selected:
            output.write(f"--- PDF PAGE {num} ---\n\n{text}\n\n")

    print(
        f"Wrote {len(selected)} pages "
        f"({selected[0][0]}–{selected[-1][0]}) → {destination}"
    )


if __name__ == "__main__":
    main()
