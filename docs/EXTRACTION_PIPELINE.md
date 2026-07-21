# Extraction Pipeline — File Intake, Models, and Prompts

Companion to [KILLER_APP_PLAN.md](KILLER_APP_PLAN.md) (workstreams WS-C and
WS-X). This document is the operating manual for turning any incoming file
into rows in `kg_pages`, and `kg_pages` into the knowledge graph.

**Three rules:**
1. **Cheapest model that passes the quality gate wins.** We measure on a
   golden set (§5), we don't guess. If cheap is bad, escalating is fine —
   extraction runs ONCE per page, so even a 10× price difference is a
   one-time cost, not a recurring one.
2. **Never OCR-then-parse when a vision model can go image → JSON directly**
   for structured layouts (address books, tables). Two lossy steps are worse
   than one.
3. **Audit with a different model family than the one that extracted.**
   Same-family models make the same mistakes; cross-family auditing catches
   them.

**Rule zero: rights before tokens.** Before conversion or an API call, the
source must have a stable `source_id`, an item-level rights-evidence URL, a
`green|yellow|red` verdict, and a complete local inventory record. Unknown
rights default to red/private. Extraction success never changes that verdict.
See [licensing.md](licensing.md) and
[`ingest/corpus/README.md`](../ingest/corpus/README.md).

---

## 1. File intake — decision tree by type

Every file lands in R2 (`corpus/{source}/raw/…`) first, then flows:

```
file
├─ .txt / .html / .epub  ──────────────► TEXT PATH (§1.1)
├─ .pdf ── has text layer? (§1.2 test)
│           ├─ yes, good yield ─────────► TEXT PATH
│           ├─ per-page mixed ──────────► split: text pages → TEXT PATH
│           │                                    image pages → OCR PATH
│           └─ no (scanned) ────────────► OCR PATH (§1.3)
├─ .djvu ── `ddjvu -format=pdf` ────────► re-enter as PDF
├─ .jpg/.png/.tiff (photographed docs) ─► OCR PATH
├─ structured API/CSV/JSON (Wikidata,
│   Europeana, OSM) ────────────────────► DIRECT PATH (no LLM: mapper code
│                                          writes rows, as ingest/ does today)
└─ layout-heavy print (address books,
    directories, tables) ───────────────► VISION-STRUCTURED PATH (§1.4)
```

### 1.1 TEXT PATH (born-digital text)
- HTML: strip boilerplate with a readability pass (cheerio — pattern already
  exists in `ingest/src/scraper/parseHousePage.ts`). Keep headings.
- EPUB: unzip, it's HTML inside; same strip.
- Chunking into `kg_pages`: split at chapter headings when present, else
  every ~1,500 words at paragraph boundaries. Store `page_ref`
  ("ch. 3" / "§12").
- Cleanup (regex, no LLM): de-hyphenate line-break splits
  (`köz-\nség` → `község`), collapse whitespace, strip running headers/
  footers and bare page numbers.

### 1.2 PDF text-layer test
```bash
pdftotext -f N -l N file.pdf -   # per page
```
- ≥ ~200 characters/page of real words → page has a usable text layer.
- Watch for garbage layers (bad embedded OCR from the source archive):
  if >5% of characters are non-Hungarian-alphabet junk, treat as scanned.
- Decide **per page**, not per file — old digitizations are often mixed.

### 1.3 OCR PATH (scanned pages, photos)
Render pages to images first: `pdftoppm -r 300 -png`.

Two engines, chosen per source:

| Engine | Cost | Use when |
|---|---|---|
| **Tesseract** (`-l hun+eng`, free, runs on the Oracle VM) | $0 | Clean modern print, uniform single-column layout |
| **Vision LLM** (Gemini Flash family via AI Studio free tier / OpenRouter) | $0 on free tier; fractions of a cent per page paid | Old typefaces, damaged pages, multi-column, mixed Hungarian/German, marginalia — i.e. most pre-1945 material |

Practical rule from real archives: **try Tesseract on 10 sample pages per
source.** If you're hand-fixing more than a couple of lines per page, switch
that source to the vision LLM and don't look back — your time is the scarce
resource, and vision OCR of a 300-page book costs cents.

After either engine, run the **OCR cleanup prompt** (§4, Prompt P2b) only on
pages where junk-character ratio > 2% — most pages skip it.

### 1.4 VISION-STRUCTURED PATH (address books, directories, tables)
The 1880–1928 address books are two-column, abbreviation-dense agate print.
OCR-then-parse mangles them. Instead: page image → vision LLM → structured
JSON in ONE call (Prompt P3). The model reads the layout like a human would.
Store the raw JSON in `kg_mentions.payload` directly (these pages skip the
general extraction prompt entirely).

---

## 2. Model matrix — task → model → escalation

Prices are per 1M tokens, approximate (mid-2026); **re-check on
openrouter.ai/models before each batch — prices move monthly.** The
"escalate to" column is used only when the primary fails the quality gate
(§5) for a given source.

| # | Task | Primary (cheapest that fits) | ~Price in/out | Escalate to | Notes |
|---|---|---|---|---|---|
| T1 | OCR, clean modern print | Tesseract (local) | $0 | Gemini Flash-Lite (vision) | free forever |
| T2 | OCR, old/damaged/multi-column | `google/gemini-2.5-flash-lite` (vision) or AI Studio free tier | ~$0.10 / $0.40 | `google/gemini-2.5-flash` | vision quality on Hungarian print is excellent |
| T3 | Page extraction (Prompt P1) | `google/gemma-3-27b-it:free` → paid fallback `deepseek/deepseek-chat-v3` | $0 / ~$0.3–1.1 | `google/gemini-2.5-flash`, then `anthropic/claude-sonnet-*` for the worst sources | the workhorse; ~5k pages × ~3k tokens ≈ 15M tokens total — even paid ≈ a few $ |
| T3-R | Current restricted-book extraction (Prompt P1-R) | `qwen/qwen3-coder:free` | Live preflight | `deepseek/deepseek-v4-flash` → `google/gemini-2.5-flash-lite` | implemented ladder; 5,000 max output tokens, 10 items/array, one request/rung, conservative `$1` default ceiling |
| T4 | Address-book page → JSON (Prompt P3) | `google/gemini-2.5-flash` (vision) | ~$0.30 / $2.50 | `gemini-2.5-pro` | worth the mid-tier: these produce your highest-value edges; volume is small |
| T5 | Entity adjudication, yes/no (Prompt P4) | `google/gemma-3-27b-it:free` | $0 | `gemini-2.5-flash-lite` | trivially small calls |
| T5-R | Historical discourse reference resolution | local noun ledger + existing extraction vote | local / included | `qwen/qwen3-30b-a3b-instruct-2507` audit, then `google/gemini-2.5-flash` only on disagreement | batched per discourse block, never one call per pronoun; see the reference-resolution design |
| T6 | Fact re-ranking per location (Prompt P5) | `google/gemini-2.5-flash-lite` | ~$0.10 / $0.40 | `gemini-2.5-flash` | needs mild judgment; ~500 calls total |
| T7 | Translation hu↔en (Prompt P6) | `google/gemini-2.5-flash-lite` | ~$0.10 / $0.40 | `gemini-2.5-flash` | validate 30 samples with a native speaker (plan task Q-04) |
| T8 | Faithfulness audit (Prompt P7) | **different family than T3**: if T3=Gemma → audit with `deepseek/deepseek-chat-v3` or `qwen/qwen3-*` | ~$0.3 / $1 | `claude-sonnet` spot checks | only on the 50-fact random samples, not everything |
| T9 | Embeddings (persons + facts + chunks) | OpenAI `text-embedding-3-small` | $0.02 flat | — | keep: schema is `vector(1536)` (`008_rag_history.sql`); whole corpus ≈ $1 |
| T10 | Narrative/tour scripts (existing pipeline) | `deepseek/deepseek-chat-v3` or `gemini-2.5-flash` | ~$0.3–1 | `claude-sonnet` for hero routes | quality is user-facing; hero routes deserve the good model |
| T11 | Resident monologues (Prompt P8) | `anthropic/claude-sonnet-*` or `gemini-2.5-pro` | ~$3 / $15 | — | ~10–40 calls EVER; character writing quality is the product — don't cheap out here |
| T12 | TTS — English | Kokoro or Piper on VM / Gemini TTS free tier | $0 | ElevenLabs for hero voices | per plan step M-08 |
| T12b | TTS — Hungarian | **Piper** (open source, has hu_HU voices; Kokoro has NO Hungarian; verify Gemini TTS hu support before relying on it) | $0 | paid TTS with confirmed hu (e.g. ElevenLabs/Azure) | gate: a 10s hu sample must pass a native listener (plan Q-04) |

**Budget shape this produces:** T3/T3-R dominate volume but are free-tier-first;
everything expensive (T4, T11) is low-volume. Historical whole-corpus dollar
figures are planning examples, not a spending authorization: model prices,
provider availability, tokenization and failure rates move. For the restricted
extractor, the live catalog preflight and displayed conservative ceiling are
the only valid estimate for the next run. For other tasks, sample first and
record measured input/output tokens before projecting a batch.

**OpenRouter mechanics:** pin exact, fully-suffixed model IDs in env vars
(`KG_EXTRACT_MODEL=…` — check the live ID on openrouter.ai; e.g. DeepSeek
IDs carry version suffixes like `-0324`). Do NOT set
`require_parameters:true` for free-tier models — their providers often
lack structured-output support and the call becomes unroutable; rely on
the P1 validate-and-retry loop instead (JSON `response_format` only where
the routed provider supports it). Set per-run `max_tokens`, and log
`usage.total_tokens` per call into the run summary (plan task X-22).

**Free-tier throughput (plan of record):** OpenRouter free models have
per-day request caps (historically ~50/day; ~1000/day after a one-time
$10 credit purchase — the credit stays spendable). Budget plan: buy the
$10 unlock, and use Gemini AI Studio's separate free daily quota as the
second lane. "Pure $0" remains possible but is the slow path — never let
the schedule assume uncapped free throughput.

---

## 3. Processing strategy per source (concrete)

| Source | File reality | Path | OCR engine | Extraction |
|---|---|---|---|---|
| MEK books | HTML/TXT mostly; some scanned PDF | TEXT; OCR for scanned ones | Tesseract first, sample-test | P1 |
| Wikipedia/Wikisource | API text | TEXT | — | P1 (facts only; text is CC-BY-SA, see plan L-23) |
| Wikidata | JSON | DIRECT | — | none (mapper code) |
| Budapest100 | already scraped HTML | TEXT | — | P1 |
| Address books (FSZEK collection on Hungaricana) | scanned page images | VISION-STRUCTURED | — | P3 directly |
| Fortepan | JPEG + metadata API | DIRECT (media) | — | none; optional P9 caption pass |
| Postcards | JPEG + catalog metadata | DIRECT (media) | T2 only if the card back has text worth reading | — |
| Old maps | TIFF/JPEG scans | media only | — | none (georeferencing is manual, plan M-16) |
| MAPIRE / Budapest Time Machine (Arcanum + BFL) | georeferenced map tiles (WMTS) + plot/house person data | **BLOCKED — RED**; negotiate access (see [licensing.md](licensing.md#budapest-time-machine--mapire--partnership-target-red)) | — | none until licensed; own scans → manual georef |
| Europeana | API JSON + files | DIRECT + per-file | per rights | P1 for text records |
| műemlékem.hu | HTML | TEXT | — | P1 |

### 3.0 Historical Extraction V3 (restricted monographs) — the current path

V3 is the pipeline used for the restricted `jewish-budapest` monograph. Design
lives in [HISTORICAL_EXTRACTION_V3_HANDOFF.md](HISTORICAL_EXTRACTION_V3_HANDOFF.md);
frozen models / address / OCR in
[HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md](HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md);
**current quality, eval, gold, and rescore** in
[HISTORICAL_EXTRACTION_V3_QUALITY_2026-07-20.md](HISTORICAL_EXTRACTION_V3_QUALITY_2026-07-20.md).

Entry point: `npm run extract:historical:v3` (add `--preflight-only` for a free
local dry run that makes no paid calls).

Stages, in order. Everything before stage 6 is deterministic, local, and free:

| # | Stage | What it does |
|---|---|---|
| 1 | Layout mask (`lib/historicalPdfLayout.js`) | Poppler `-bbox-layout` coordinates mask header/footer furniture **while preserving text length**, so raw offsets stay immutable. Fails closed if Poppler fails. Titles/captions use body median font size (larger = title, smaller + cues = caption). |
| 2 | Reading view (`nlp/gliner2_mentions.py`) | Joins line-broken words (`syna-\ngogue`), repairs letter-adjacent Hungarian umlaut damage (`temet6` → `temető`), and keeps a reversible per-character map back to raw offsets. |
| 3 | Local NLP | GLiNER2 entity mentions + a spaCy noun-phrase ledger (`nlp/noun_phrases.py`, `--noun-ledger`) for the ordinary heads GLiNER misses (tomb, school, gravestone). |
| 4 | Addresses (`lib/historicalAddresses.js`) | Gazetteer-matched street/address references with exact offsets; ambiguous multi-district streets placed from page context only; building mentions anchored to a following address. |
| 5 | Identity + clauses | Source-local entity index (aliases merged only when unambiguous; buildings keyed by head + street + house number; OCR variants folded via `lib/historicalOcrLexicon.js`), then the clause ledger: every clause gets an ID, exact offsets, mentions, and risk flags. Quote spans are not split mid-quote. |
| 6 | Subject memory (`lib/historicalSubjectMemory.js`) | Typed focus stack resolves pronouns, possessives, and definite descriptions **before any paid call**. Owner and owned stay distinct (`his tomb`). Ambiguity is recorded, never guessed. State persists across strictly ascending pages. |
| 7 | Primary extraction | One cheap call per page. Model returns compact TSV referencing supplied clause/mention IDs only — it never writes quotations, so evidence cannot be misquoted by construction. |
| 8 | Independent audit | A second model reads the same pages without seeing the first model's answers. Agreement ⇒ `supported`. |
| 9 | Quality adjudication | Disagreements and risky items escalate to the judge, which must rule per candidate with a written reason. Funded from a reserve that the whole batch must afford up front, or the run stops `incomplete_budget` — quality is never downgraded to fit a budget. |
| 10 | Structural item gate (`lib/historicalItemQuality.js`) | Local post-pass: ground resolved `He`/`His` into the statement; demote meta claims, unresolved pronoun leads, caption furniture in evidence, and bare vague agents. Free re-apply via `npm run rescore:historical:v3`. |
| 11 | Artifacts | Items, coverage, subject transitions, addresses, layout, the subject-memory state file, a report, and the self-contained facts browser. Optional `canonical_events` via `cli/transform-v3-to-kg.js`. |

Non-negotiables specific to V3:

- **Evidence is attached from local clause offsets, never from model output.**
- **Supported ≠ true.** It means two independent models agreed *and* every
  reference in the item resolved (subject to the structural gate). Two cheap
  models have agreed on caption junk before — negatives and the furniture gate
  catch that class of failure.
- **Nothing fails silently.** `unresolved_references_log`, `ocr_damage_log`,
  ambiguity records, and per-item verdict reasons exist so every defect can be
  found, classified, and fixed.
- **No promotion claim without human-adjudicated held-out gold.** The eval
  harness (`npm run eval:historical:v3`) fails closed and stamps `gold_source`.
  Development scoring: `npm run eval:historical:v3:dev` (see the quality handoff
  for strict vs sibling-adjusted metrics).

### 3.1 Next monograph runbook

Use this sequence for every new book, including an open MEK monograph. The
restricted CLI name describes its private staging boundary; it does not grant
or imply any rights to the input.

1. **Register the edition.** Record title, author/editor, edition/volume,
   item page, exact file URL, SHA-256, bytes, retrieval time, license,
   verdict, attribution and evidence URL. Multi-volume works get one file
   record per volume.
2. **Choose a stable slug.** The same slug must identify the page-text file,
   extraction JSONL and `kg_sources` row. Never reuse a slug for a different
   edition.
3. **Test representative pages locally.** Include front matter, ordinary
   prose, a dense page/table and a scan with poor OCR. Prefer text-layer or
   local OCR when its sample is usable.
4. **Price without extracting** from `talesofbudapest-backend/`:

   ```bash
   npm run check:openrouter-models
   npm run extract:restricted:deep -- \
     --source <slug> --from-page <n> --limit 5 --preflight-only
   ```

   The first command verifies that the configured IDs still exist and that
   the expected free rung has not become paid. The second uses live catalog
   prices and reserves every ladder rung for every selected window.
5. **Run only the same five-window sample.** Remove `--preflight-only`, keep
   `--limit 5`, and inspect schema validity, evidence alignment, English
   translations, relation density and failures. A cheap invalid result is not
   a successful bargain.
6. **Scale in bounded batches.** Increase `--limit` only after the sample
   passes. Keep the default `$1` ceiling unless a reviewed preflight justifies
   an explicit lower/higher `--max-cost-usd`. Never use
   `--confirm-full-book` as a convenience flag.
7. **Load privately and reconcile counts.** Pages/windows attempted,
   successful/failed JSONL records and staged entity/relation counts must be
   explainable before resolution or promotion.
8. **Publish separately.** A human rights/review decision, not the extractor,
   controls movement across the public boundary.

For exact ladder order, cache assumptions, ceiling math and incident-safe
commands, [OPENROUTER.md](OPENROUTER.md) is authoritative. This document is
authoritative for file/page paths and prompt behavior.

---

## 4. The prompts

Verbatim, versioned here. When you change one, bump the version comment and
note it in `docs/DECISIONS.md` — extraction quality regressions must be
traceable to prompt changes.

### Prompt P1 — general page extraction (task T3)

**System:**
```
You are a meticulous historical data extractor working on Budapest history.
You will receive one page or chapter of a historical text (Hungarian, German,
or English). Extract information into JSON exactly matching the schema below.

HARD RULES — violating any of these makes the output worthless:
1. Extract ONLY what this text states. Do not add knowledge from outside the
   text. Do not "complete" partial information.
2. Empty arrays are a correct and common answer. A page about grain prices
   has no extractable stories — return empty arrays.
3. Every fact must be supported by a specific sentence in the text. Copy that
   sentence into the "quote" field verbatim, in the original language.
4. If the text gives a date range or "around 1900", record it as such — never
   sharpen vague dates into exact ones.
5. People: include full name as written. If only a surname appears, record
   the surname and set "partial_name": true.
5b. facts.confidence: 1.0 = the text states it plainly; 0.7 = stated but
   ambiguous phrasing or uncertain attribution; 0.5 = the text itself hedges
   ("allegedly", "it is said"). Never above the text's own certainty.
6. Locations: record the name/address AS WRITTEN in the text (historical
   street names count — do not modernize them; note the modern name only if
   the text itself gives it).
7. Respond with JSON only. No commentary, no markdown fences.

interestingness scale for facts:
5 = a tourist would stop walking and gasp (crime, scandal, tragedy, love,
    ghost story, famous person doing something surprising)
4 = would make a tour guide's best anecdote
3 = solid color (what a shop sold, who held balls here, daily life detail)
2 = specialist interest (architectural detail, ownership change)
1 = dry registry data

SCHEMA:
{
  "language": "hu|de|en",
  "locations": [
    {"name_as_written": "", "address_hint": "", "modern_name_if_stated": ""}
  ],
  "persons": [
    {"name_as_written": "", "partial_name": false, "years_hint": "",
     "occupation": "", "role_in_text": ""}
  ],
  "events": [
    {"title": "", "year": null, "year_approx": "", "type":
     "crime|celebration|construction|war|scandal|daily_life|disaster|other",
     "description": "", "quote": ""}
  ],
  "facts": [
    {"location_name_as_written": "", "text": "", "year": null,
     "year_approx": "", "category":
     "architecture|resident|crime|anecdote|commerce|culture|politics",
     "interestingness": 3, "confidence": 0.9, "quote": ""}
  ],
  "relations": [
    {"kind": "person_location", "person": "", "location": "",
     "relation": "lived_in|worked_in|built|owned|died_in|arrested_in|performed_in|frequented",
     "years": "", "quote": ""},
    {"kind": "person_person", "a": "", "b": "",
     "relation": "married|family|friend|rival|employed|collaborated|betrayed|duelled",
     "quote": ""},
    {"kind": "person_event", "person": "", "event_title": "",
     "role": "", "quote": ""}
  ]
}
```

**User (template):**
```
SOURCE: {source_title}, {page_ref}
TEXT:
"""
{page_text}
"""
```

Implementation notes: validate against a JSON Schema; on failure retry once
with the validator error appended ("Your previous output failed validation:
{error}. Return corrected JSON only."). Two failures → mark page `failed`,
move on; failures re-queue for the escalation model at week's end.

### Prompt P1-R — restricted-book CLI (`cli/extract-restricted-book.js`)

Restricted books (currently `jewish-budapest`) don't go through the generic
Prompt P1 pipeline — they run through a standalone CLI,
`npm run extract:restricted:deep -- --source <id>` (`--source` defaults to
`jewish-budapest` and derives both the input page-text path and the output
JSONL path, so the same CLI handles any restricted book). The current
cheap-first ladder is `qwen/qwen3-coder:free` →
`deepseek/deepseek-v4-flash` → `google/gemini-2.5-flash-lite` (override with
`KG_RESTRICTED_EXTRACT_MODEL`). `load-restricted-kg.js` now
validates records by payload shape rather than gating on a Qwen model name,
so it accepts prompt_version `restricted-book-entities-p1`, `-p2`, and the
current `-p3`.

P1-R follows P1's hard rules (extract only what's stated, empty arrays are
correct, never sharpen vague dates, verbatim quotes) with two differences
from the P1 schema above:

- **Source-language fidelity.** Locations and people record both the
  as-written text and an English gloss: `source_name`/`address_source`
  (verbatim, historical spellings kept) alongside `name_en`/`address_en`.
  People also carry `partial_name: true` when only a surname is given —
  never invent or complete a name from a surname alone.
- **`facts[]` is a new top-level array**, distinct from `events`/`relations`:
  each fact has `location_source_name`, `text_en`, `year`/`year_approx`,
  `category`, `interestingness` (1-5, same tourist-gasp scale as P1's
  `facts.interestingness`), `confidence` (1.0/0.7/0.5, same scale as P1's
  5b), and `evidence: {quote}` — one short verbatim source-language sentence.

**Format history — evidence and caps.** The `-p2` revision dropped the
per-array cap and required bilingual evidence (`{quote_source, quote_en}`) on
every item. On dense pages this tripled output length and truncated the JSON
mid-object (all-or-nothing loss), giving a ~75% failure rate. `-p3` reverted
to a per-array cap, now conservatively set to **10 items**, and a
**single-`quote` evidence object** — the English
rendering was redundant since `text_en`/`statement_en`/`name_en` already carry
it, so the quote only needs the verbatim source sentence for provenance. This
cut the failure rate to ~23% (the residual failures are content-specific
dense/tabular pages, not length). `max_tokens` is 5000, with one HTTP request
per ladder rung. Before any extraction call, the CLI live-checks prices and
refuses a conservative worst-case estimate above $1 by default.
`prompt_version` is
`restricted-book-entities-p3`, recorded on every JSONL line so downstream
tooling and `docs/DECISIONS.md` can trace behavior back to the exact prompt.
Output JSONL's `source` field is the source slug (e.g. `jewish-budapest`),
not a fixed constant. The loader reads `evidence` schema-agnostically, so p1/
p2/p3 all load without migration.

### Prompt P2 — vision OCR (task T2)

```
Transcribe this scanned page exactly as printed. Rules:
- Preserve the original language (Hungarian/German/English) and spelling,
  including archaic orthography (cz, ő/ű variants). Do not modernize.
- Reading order: if multi-column, transcribe left column fully, then right.
- Join words hyphenated across line breaks.
- Mark unreadable spots as [olvashatatlan].
- Skip running headers, footers, and bare page numbers.
- Output plain text only.
```

### Prompt P2b — OCR cleanup (only for junk-heavy Tesseract output)

```
The following is OCR output from a {year_hint} Hungarian book, containing
recognition errors. Correct ONLY obvious OCR character errors (e.g. "0rszág"
→ "Ország", "1iszt" → "Liszt", rn→m confusions). Do NOT rephrase, modernize
spelling, or add/remove content. If a word is too corrupted to repair
confidently, wrap it as [?szó?]. Output the corrected text only.
```

### Prompt P3 — address-book page → structured JSON (task T4, vision)

```
This is a scanned page from the Budapest address directory
("Budapesti Czím- és Lakásjegyzék"), year {year}. It lists residents in
dense two-column print with abbreviations.

Extract every legible entry as JSON:
{"entries":[
  {"surname":"", "given_name":"", "occupation_abbrev":"",
   "occupation_expanded":"", "street":"", "house_number":"",
   "district":"", "confidence": 0.0}
]}

Rules:
- Hungarian name order is surname first. Keep it that way.
- Expand occupation abbreviations only when unambiguous
  (e.g. "czipész"=shoemaker stays as written + expanded English gloss;
  unknown abbreviation → leave expanded field empty).
- Street names as printed (historical names — do not modernize).
- confidence: 1.0 clearly legible, 0.5 partially legible, skip entries
  below 0.3 rather than guessing.
- JSON only.
```

### Prompt P4 — person entity adjudication (task T5)

```
Are these two records the same historical person? Consider Hungarian name
order (surname-first vs given-first), nicknames, and spelling reforms.

Record A: {name_a} | years: {years_a} | occupation: {occ_a}
  | context: "{quote_a}"
Record B: {name_b} | years: {years_b} | occupation: {occ_b}
  | context: "{quote_b}"

Answer JSON only: {"same_person": "yes|no|unsure", "reason": "<one sentence>"}
Rule: conflicting death years or incompatible occupations in the same period
= "no". Genuinely insufficient evidence = "unsure", never a guess.
```

### Prompt P5 — comparative fact ranking (task T6)

```
You are ranking facts about one Budapest building for an audio walking tour
aimed at curious tourists. Below are {n} facts about {location_name}.

Re-score each fact's "interestingness" 1–5 RELATIVE to the others here
(5 = the single best gasp-moment, 1 = cut from the tour), and flag
near-duplicates.

Facts:
{numbered_fact_list}

JSON only:
{"rankings":[{"fact_id":"", "interestingness": 3,
  "duplicate_of": null, "one_line_reason": ""}]}
```

### Prompt P6 — translation (task T7)

```
Translate this historical fact for a tourist app. Source language: {src}.
Target: {tgt}. Keep proper names, street names, and institution names in
the original Hungarian (tourists see them on street signs). Keep the tone
factual and vivid, not academic. Length: similar to the original.
Text: "{fact_text}"
Output the translation only.
```

### Prompt P7 — faithfulness audit (task T8, different model family)

```
You are auditing a data pipeline for hallucinations. Below is a source
passage and a fact extracted from it. Judge STRICTLY.

SOURCE PASSAGE:
"""{page_text}"""

EXTRACTED FACT: "{fact_text}" (year: {year})

JSON only:
{"verdict": "supported|partially_supported|unsupported",
 "problem": "<empty if supported; else one sentence: what was added,
              sharpened, or misread>"}
"partially_supported" = the core is in the text but a detail (date, name,
number) was added or sharpened beyond what the text says.
```

### Prompt P8 — resident monologue (task T11, low volume, best model)

```
Write a 45-second first-person monologue (≈110 words) for {person_name}
({birth_year}–{death_year}, {occupation}), who will "speak" to a visitor
standing in front of {location_name} in Budapest.

VERIFIED FACTS — you may use ONLY these:
{fact_list_with_years}

Rules:
- First person, present-tense address to the visitor ("You are standing
  where my window used to be...").
- Period-appropriate voice for a person of their era and class; warm, a
  little wry; no modern slang, no "welcome to".
- Weave in at least 3 of the facts; invent NOTHING beyond them — no
  weather, no named relatives, no feelings presented as facts unless a
  fact supports them.
- End with one line that makes the visitor look at a specific physical
  detail of the building visible today: {visible_detail}.
- Language: {locale}. Output the monologue text only.
```

### Prompt P9 — media caption pass (optional, free tier)

```
Describe this historical photograph for a tourist app in one sentence
(max 20 words), stating only what is visible. Do not guess the decade
unless architectural/vehicle evidence makes it obvious; never invent
street names. Photo metadata: {year}, {location_name}.
```

### Historical discourse references (task T5-R)

Historical prose needs a separate identity layer for `he`, `his tomb`,
`its institutions`, `the synagogue`, and similar references. The implemented
pilot scans every noun phrase locally, preserves raw offsets, batches a shared
discourse view, and constrains models to exact candidate IDs. It distinguishes
the entity introduced by a possessive noun phrase from its owner.

Pages run sequentially. Each completed page writes a compact supported-subject
memory; only the exactly following page may load it. The local resolver also
keeps up to three previous raw pages, so a page-top pronoun or repeated
description can resolve to the preceding page. Clause-complete Qwen auditing
recovers atomic omissions, while strong Flash is reserved for real boundary
continuations and single-model discoveries. Captions, page numbers, source
zones, and hidden context cannot masquerade as or suppress target facts.

This is not one API call per pronoun. Flash-Lite and Qwen resolve the page/block
independently; Flash sees only real disagreement. Production must reuse the
page extractor's vote and remotely audit only risky chains, because adding a
second exhaustive remote pass to every page can fail the USD 0.002/page total
gate. See [Historical Reference Resolution](HISTORICAL_REFERENCE_RESOLUTION.md)
for the algorithm, measured costs, cache, commands, and held-out gate.

### Geocoding (restricted-book locations, `cli/geocode-kg.js`)

Not an extraction prompt — a deterministic lookup that feeds the entity
resolver. `npm run geocode:kg -- --dry-run|--limit N|--input <jsonl>` reads
unique staged location names/addresses out of a restricted book's extraction
JSONL and geocodes each one, writing `<basename>.geocoded.json` next to the
input. `cli/resolve-kg-locations.js --geocoded <path>` reads that file to
attach coordinates to staged locations before scoring, which is what lets
the distance <= 50m arm of the auto-link rule
([KG_APP_SYSTEM.md](KG_APP_SYSTEM.md#entity-resolution)) fire — staged
`kg_locations` carry no coordinates of their own otherwise.

- **Provider:** free-tier Nominatim/OpenStreetMap (`nominatim.openstreetmap.org`),
  not an LLM. Only place names/addresses are sent — never book text, quotes,
  or citations.
- **Policy constraints:** paced at least 1.1s between live requests (max
  1 request/second per Nominatim's usage policy), identifying `User-Agent`
  built from `NOMINATIM_CONTACT_EMAIL`, and results are cached persistently
  at `ingest/corpus/restricted/experiments/geocode.cache.json` so a query is
  never repeated against the live API.
- **Budapest bias:** requests are scoped to a Budapest viewbox and
  `countrycodes=hu`.
- **Hungarian<->English retry:** a zero-result query gets one retry with a
  single generic term swapped (street<->utca, square<->tér,
  synagogue<->zsinagóga, cemetery<->temető, and similar).
- **Precision guard:** city/administrative-level results are rejected when
  the query was street-level (named a specific address or building), so a
  vague match can't silently satisfy the 50m rule.
- **Known gap:** historical street names that no longer exist won't geocode
  — those locations rely on the name/alias-matching auto-link arm instead.

---

## 5. Quality gates and the escalation ladder

**Golden set (build once, ~half a day):**
1. Pick 20 pages spanning your sources: 8 MEK book pages, 4 Wikipedia,
   3 Budapest100, 3 address-book pages, 2 ugly OCR pages.
2. Hand-annotate them yourself: the persons, facts, and relations a careful
   human would extract. This is the answer key (`docs/golden-set/`).
3. Score any model run against it: fact **recall** (found what's there),
   fact **precision** (invented nothing — measured via P7 audit),
   person/location match rate.

**Gate:** a model is approved for a source when precision ≥ 95% and
recall ≥ 80% on that source's golden pages. (Precision matters more —
a missed fact is invisible; an invented fact is a broken promise.)

**Ladder (per source, not global):**
```
free model fails gate
  └► cheapest paid (T3 fallback column) — usually passes
        └► mid-tier (gemini-2.5-flash) — for the ugliest OCR sources
              └► top-tier spot use (claude-sonnet) — only if a source is
                  both high-value and hard; else drop the source instead
```
Record every gate result in `docs/DECISIONS.md` (model, version, date,
scores). Re-run the golden set whenever you change a prompt or a model —
it takes minutes and catches silent regressions.

**Runtime tripwires (automated, in the nightly job):**
- JSON validation failure rate per model >5% → alert.
- Average facts-per-page suddenly 2× up or down vs the source's trailing
  average → alert (prompt drift or a garbage batch).
- P7 audit sample: any `unsupported` verdict → the offending fact is
  auto-quarantined (status flag), reviewed in the separate admin app's
  `/reviews` queue.

---

## 6. Where this plugs into the plan

| This doc | Plan tasks |
|---|---|
| §1 intake paths | C-01..C-09, C-27..C-30 |
| §2 model matrix + throughput plan | X-04 (bake-off = run golden set per model), X-05, X-22 |
| §4 P1 (page extraction) | X-01..X-03, X-05 |
| §4 P2 (vision OCR) / P2b (cleanup) | C-29, C-30 |
| §4 P3 (address books) | C-15, C-16, X-20 |
| §4 P4 (adjudication) | X-09 |
| §4 P5 (ranking) | X-14 |
| §4 P6 (translation) | X-16 |
| §4 P7 (audit) | X-19, O-04 tripwires |
| §4 P8 (monologues) | M-07 |
| §4 P9 (photo captions) | C-13 |
| §5 golden set | X-03, X-04, X-19 |
