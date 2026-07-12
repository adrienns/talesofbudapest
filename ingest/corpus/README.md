# Local corpus contract

This directory is the local working corpus. It contains source files,
intermediate text and model output; it is not a publication directory and is
not a complete source registry. Large files and restricted material must stay
out of Git.

## Directory meanings

| Path | Meaning | May be public? |
|---|---|---|
| `mek/raw/` | Original files fetched from the reviewed MEK allowlist | Only according to each item's recorded license |
| `mek/text/` | Text derived from MEK originals | Same terms as the source; not independently relicensed |
| `mek/extractions/`, `mek/experiments/` | Experimental/model outputs | Review first; provenance and evidence must survive loading |
| `restricted/raw/`, `restricted/text/` | Local copyrighted research copies and page text | **No** |
| `restricted/extractions/`, `restricted/experiments/` | Private staging output, failures, caches and reports | **No** |

`raw → text → extraction` does not change a source's rights verdict. A model
output being an English paraphrase also does not automatically make it
publication-ready. Publication is a separate, explicit review decision.

## Minimum manifest record

Before a new source is processed, its inventory record must contain:

```json
{
  "source_id": "stable-slug",
  "title": "Bibliographic title",
  "author": "Author or editor",
  "source_url": "Item record page",
  "original_url": "Exact downloaded file",
  "local_path": "corpus-relative path",
  "sha256": "content checksum",
  "bytes": 0,
  "fetched_at": "ISO-8601 timestamp",
  "license": "machine-readable identifier or Unknown",
  "license_verdict": "green|yellow|red",
  "attribution": "display-ready credit",
  "license_evidence_url": "page supporting the verdict"
}
```

Never use `green` without an evidence URL. Unknown or missing rights default to
`red`/private. For a multi-file source, inventory every original separately;
do not let a book-level record hide which volume or scan produced a fact.

## Current inventory caveat

[`mek/manifest.json`](mek/manifest.json) is currently a **last-fetch receipt**,
not the full MEK inventory. `fetch:mek` overwrites it on each invocation. The
raw directory currently contains more reviewed allowlist files than that JSON
lists. Before the next fetch, either change the fetcher to merge by
`mekId + originalUrl`, or save and reconcile the previous manifest. Never use
the current manifest alone to conclude that a local file is licensed.

The restricted corpus has no complete machine-readable manifest yet. Until it
does, each restricted source is treated as `red`, uses a stable private
`source_id`, and must remain behind the KG staging/publication boundary.

## Next monograph: safe, cheap handoff

1. Prefer a Budapest monograph from the reviewed MEK allowlist or another
   source with item-level open-license evidence.
2. Record the complete manifest entry and SHA-256 before conversion.
3. Test the text layer per page; use local extraction/OCR where it is good.
4. Create page text with stable page references and inspect a small,
   representative sample.
5. From `talesofbudapest-backend/`, run a bounded OpenRouter preflight first:

   ```bash
   npm run extract:restricted:deep -- \
     --source <stable-slug> --from-page <n> --limit 5 --preflight-only
   ```

6. Run the same five-window sample without `--preflight-only`, review JSON
   quality/citations, then increase `--limit` gradually. Do not use
   `--confirm-full-book` until the sample passes and the displayed worst-case
   ceiling is explicitly acceptable.
7. Load to private staging. Promotion/publication requires a separate license
   and evidence review; extraction success is not approval.

Operational model, pricing and guard details live in
[`docs/OPENROUTER.md`](../../docs/OPENROUTER.md); prompt and page-intake details
live in
[`docs/EXTRACTION_PIPELINE.md`](../../docs/EXTRACTION_PIPELINE.md).
