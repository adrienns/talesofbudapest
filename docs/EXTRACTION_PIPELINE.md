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
| T4 | Address-book page → JSON (Prompt P3) | `google/gemini-2.5-flash` (vision) | ~$0.30 / $2.50 | `gemini-2.5-pro` | worth the mid-tier: these produce your highest-value edges; volume is small |
| T5 | Entity adjudication, yes/no (Prompt P4) | `google/gemma-3-27b-it:free` | $0 | `gemini-2.5-flash-lite` | trivially small calls |
| T6 | Fact re-ranking per location (Prompt P5) | `google/gemini-2.5-flash-lite` | ~$0.10 / $0.40 | `gemini-2.5-flash` | needs mild judgment; ~500 calls total |
| T7 | Translation hu↔en (Prompt P6) | `google/gemini-2.5-flash-lite` | ~$0.10 / $0.40 | `gemini-2.5-flash` | validate 30 samples with a native speaker (plan task Q-04) |
| T8 | Faithfulness audit (Prompt P7) | **different family than T3**: if T3=Gemma → audit with `deepseek/deepseek-chat-v3` or `qwen/qwen3-*` | ~$0.3 / $1 | `claude-sonnet` spot checks | only on the 50-fact random samples, not everything |
| T9 | Embeddings (persons + facts + chunks) | OpenAI `text-embedding-3-small` | $0.02 flat | — | keep: schema is `vector(1536)` (`008_rag_history.sql`); whole corpus ≈ $1 |
| T10 | Narrative/tour scripts (existing pipeline) | `deepseek/deepseek-chat-v3` or `gemini-2.5-flash` | ~$0.3–1 | `claude-sonnet` for hero routes | quality is user-facing; hero routes deserve the good model |
| T11 | Resident monologues (Prompt P8) | `anthropic/claude-sonnet-*` or `gemini-2.5-pro` | ~$3 / $15 | — | ~10–40 calls EVER; character writing quality is the product — don't cheap out here |
| T12 | TTS — English | Kokoro or Piper on VM / Gemini TTS free tier | $0 | ElevenLabs for hero voices | per plan step M-08 |
| T12b | TTS — Hungarian | **Piper** (open source, has hu_HU voices; Kokoro has NO Hungarian; verify Gemini TTS hu support before relying on it) | $0 | paid TTS with confirmed hu (e.g. ElevenLabs/Azure) | gate: a 10s hu sample must pass a native listener (plan Q-04) |

**Budget shape this produces:** T3 dominates volume but is free-tier-first;
everything expensive (T4, T11) is low-volume. Full 5,000-page corpus:
realistically **$0–5 total** if free tiers cooperate, **<$25** if you pay for
everything. Decision rule when a free tier throttles you: waiting is free,
paying ~$3 to finish tonight is also fine — pick by mood, both are correct.

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
| Europeana | API JSON + files | DIRECT + per-file | per rights | P1 for text records |
| műemlékem.hu | HTML | TEXT | — | P1 |

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
  auto-quarantined (status flag), reviewed in /admin/kg.

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
