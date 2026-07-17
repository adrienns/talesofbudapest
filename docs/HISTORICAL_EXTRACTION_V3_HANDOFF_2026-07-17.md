# Historical Extraction V3 — handoff, 2026-07-17

Supersedes the status section of `HISTORICAL_EXTRACTION_V3_HANDOFF.md`, which
remains the authoritative architecture document. Read that first, then this.

## The goal, unchanged

Extract every meaningful historical event/assertion from a restricted book,
grounded in exact source offsets, without losing identity when prose changes
form (`Rabbi Moses Efraim → Efraim → R. Efraim → the rabbi → he → his tomb`).
Output feeds a location-based Budapest tour app (Supabase KG, curated tours,
generated stories, TTS).

**The governing principle, stated by the user and now load-bearing:** the
machine's job is not to be right, it is to *never fail silently*. Every wrong
answer must leave a machine-readable confession we can read, classify, and fix.
100% is reached by iterating that loop, not by loosening a check.

## Where things stand

Branch: `historical-extraction-v3` (26 commits ahead of the base).
Tests: `node --test lib/` → 337 tests, 336 pass. The single failure
(`kgEmbeddings: embedTexts...`) is pre-existing and env-dependent
(`OPENROUTER_API_KEY is not configured`); it is unrelated to V3.

**Do not discard the dirty worktree files.** These predate all V3 work:
`docs/DECISIONS.md`, `docs/EXTRACTION_PIPELINE.md`,
`docs/HISTORICAL_BOOK_KNOWLEDGE_EXTRACTION.md`, `docs/OPENROUTER.md`,
`docs/README.md`, `cli/pilot-constrained-coref.py`,
`cli/pilot-langextract-historical.py`, `cli/pilot_langextract_historical_test.py`.
Note that other agent sessions may share this worktree: re-read a file
immediately before editing it.

### Frozen model configuration (do not re-litigate without new evidence)

A bounded A/B on pages 75/97/140/160/180 (recorded in
`CLAUDE_HANDOFF_MODEL_COMPARISON_2026-07-16.md`) settled this:

```sh
--primary-model deepseek/deepseek-v4-flash --primary-reasoning off \
--audit-model qwen/qwen3-30b-a3b-instruct-2507 \
--quality-model google/gemini-2.5-flash
# and OPENROUTER_TIMEOUT_MS=300000
```

DeepSeek beat Gemini Flash-Lite on supported items *and* cost with zero
protocol failures. **GPT-OSS-20B is rejected for the audit role**: its endpoint
cannot disable reasoning (400 "Reasoning is mandatory") and it truncates.
`--primary-reasoning off` is mandatory: reasoning tokens eat the output cap and
truncate the TSV protocol.

### Measured reality (not projections)

- 10 pages (15-24), two warm-linked batches: **~13 minutes, $0.046, 379/410
  supported (92%), 100% exact grounding**. Warm start verified across batches.
- Pages 46-50 after the verification fixes: 71% → 91% supported. Page 49: 97%.
- Whole book ≈ 500 extraction pages ≈ **$2.50, 10-20h wall-clock**. The clock is
  dominated by ~125 sequential GLiNER reloads on CPU, not by the API. Keeping
  GLiNER warm across batches is the obvious win and is **not yet done**.
- The `$0.002/page` gate has **NOT** passed (actual ≈ $0.003-0.005). Runs report
  `failed_cost_gate` honestly. Do not claim otherwise.

## What exists now (beyond the architecture doc)

### Extraction

- `npm run extract:historical:v3 -- --from-page N --page-count M` — the V3 mode
  of `cli/extract-historical-book-v2.js`.
- Deterministic subject memory (`lib/historicalSubjectMemory.js`): typed focus
  stack, owner-vs-owned (`his tomb`), explicit ambiguity, per-page noun ledger
  from spaCy (`nlp/noun_phrases.py`, `nlp/gliner2_mentions.py --noun-ledger`).
- **Resolutions are shown to every model.** Clause rows carry authoritative
  `[[surface, antecedent]]`. This was the single largest recall fix: the
  verifier used to reject every cross-clause subject because it could not see
  what the resolver knew.
- **Confessions**: `unresolved_references_log` records every reference that
  resolved to nothing, with `why` (`no_candidate` /
  `candidate_without_mention`). This log immediately diagnosed a real bug the
  first time it ran. Keep this property in anything you add.
- Subject memory persists **only** on `complete` / `failed_cost_gate`. A failed
  batch must never poison the warm-start chain.
- `--experiment-id` isolates A/B runs from the cache and the browser default.

### Addresses and geography (feeds the tour app)

- `npm run build:gazetteer` — Budapest streets from OSM Overpass (ODbL,
  attribution embedded in the artifact), plus a seeded historical rename table
  (`data/budapest-street-renames.json`).
- **21% of Budapest street names repeat across districts.** The gazetteer
  clusters ways by proximity and gives a multi-cluster name **no centre at
  all** — averaging them put `Táncsics Mihály utca` ~4km from the Castle
  district. A confident wrong pin is worse than no pin.
- `resolveAmbiguousStreets` places such streets from *unambiguous addresses on
  the same page* (`Hess András tér` ⇒ Castle district ⇒ Táncsics resolves to
  47.5040,19.0321, ~60m out), else the batch, else stays unlocated. Each row
  records `disambiguated_by` and `disambiguation_distance_km`.
  **Decision: proximity only. A city-centre default was considered and
  rejected — do not add a "assume the centre" prior.**
- Building mentions followed by an address are anchored, and entities are keyed
  by head + street + house number, so `synagogue (Táncsics Mihály utca 23)` and
  `(26)` are different buildings. House numbers parse in both Hungarian
  (`Király utca 77`) and English (`26 Táncsics Mihály utca`) order.

### OCR damage (`lib/historicalOcrLexicon.js`)

Page 21's great synagogue used to vanish: OCR wrote `syna-\ngoque`, and while
de-hyphenation already worked, the `g→q` left a word no detector recognised.

**The measured reason we do not repair text by similarity.** A book-wide scan
found 27 tokens within edit distance 1 of a domain word (330 occurrences), of
which only ~18 were real damage. `schools`, `prayers`, `streets` are plurals;
`horse`, `player`, `Prater` are ordinary words; `yeshivah` is a variant
spelling. Similarity repair would corrupt 300+ correct words to fix 18. **Do
not add a confusion-table or edit-distance repair pass over the reading view.**

Instead, three narrow layers, none of which rewrites the source:
1. the building detector in `nlp/gliner2_mentions.py` tolerates the forms the
   scan actually found (`synago[q]ue`, `synago[g]e`, `[s]ynagogue`,
   `syn[e]agogue`) and still rejects `analogue`/`dialogue`/`synagogal`;
2. entity identity folds those exact, curated forms, so `synagoque` is not a
   second building — the damaged surface survives as a searchable alias, and
   address identity still separates 23 from 26;
3. `ocr_damage_log` in every run record (preflight included) reports each
   damaged word with exact raw offsets — damage we chose not to repair stays
   visible instead of silently eating mentions.

Extend the lexicon only with forms verified in the corpus that are not words in
their own right.
- `npm run export:historical:map` → GeoJSON for the app's own map rendering.
- `npm run hungaricana:lookup -- --query "..."` — builds targeted Hungaricana
  search URLs for a **human** and records confirmed facts to a provenance
  ledger. **It is deliberately not a scraper**: browsing is free, but scans and
  curated databases carry provider rights and the EU database right. Facts are
  free; do not bulk-harvest.

### Downstream and review

- `node cli/transform-v3-to-kg.js` — dry-run load plan mapping V3 output to the
  app KG shape. Stable `se_*` entity ids across batches ⇒ idempotent upserts.
  App-facing statements are our short paraphrases; **verbatim book quotes stay
  in the restricted JSONL** (`license_verdict: red`) and must never ship.
- `node cli/build-langextract-browser.mjs --v3 --pages 15-24 [--annotate]` —
  self-contained HTML browser; `--pages` unions multi-batch runs; `--annotate`
  gives accept/reject/note per fact and exports gold annotations.
- `node cli/merge-gold-annotations.js --input <file> --gold-source fable-5|human`
  merges gold. `npm run eval:historical:v3` fails closed and **blocks promotion
  when held-out gold is not human-adjudicated**. Fable-5 pilot gold exists for
  page 75 only (development use).
- `node cli/run-historical-v3-batches.js --dry-run` — chapter-scoped batch
  orchestrator (`data/jewish-budapest.chapters.json`, 17 chapters; illustrations
  and bibliography marked `skip`). Per-chapter state file = deliberate cold
  start at chapter breaks. Budget caps, spend ledger, resume.
- `scripts/setup-historical-nlp-remote.sh <host>` — server prep. **Never run
  heavy jobs on the Mac**; use satoshi/nakamoto. Ask the user before touching
  infrastructure.

## Known defects, with named failing cases

1. **Inline figure captions leak into body facts.** Pages 15-24 produced
   "A Hakdome Buda, Obuda, Pest" (chapter title), "Denarius depicts King
   Stephen V", "Portrait of Mendel on his seal". Layout masking only covers
   header/footer zones. Caption/quote/bibliography zone classification and the
   99% body-alignment `incomplete_layout` gate are still open.
2. ~~OCR damage blocks recognition.~~ **Fixed** (see the OCR section above):
   page 21's great synagogue now anchors, and `synagogue (Táncsics Mihály utca
   23)` exists alongside 26. Residual damage outside the curated lexicon still
   costs mentions, but every instance is reported in `ocr_damage_log`.
3. **Quote-speaker attribution is missing.** Inside the Eszéki school-play
   quote, "the Jew considered king of Jews" is Shabbetai Tzvi, but only via
   quote context. The judge rejects such items — correct until a quote/
   inscription layer exists.
4. **Quote lines over-split.** Maimonides' exhortation became five one-line
   "assertions"; audit-discovered items default to kind `event`, so play
   quotes are mistyped.
5. **Two page-49 items stay ambiguous** ("They come from the medieval and
   Turkish period cemeteries"). Arguably genuinely ambiguous; logged.
6. `npm test -- --test-name-pattern=...` is invalid (the script passes `lib/`
   as a path). Use direct `node --test lib/<file>` commands.

## Suggested next steps, in order

1. **Rebuild the 10-page HTML** with the address/entity/OCR fixes and
   re-inspect (`--pages 15-24`). Cheap: model cache makes reruns nearly free.
2. **Inline caption masking** (defect 1) — biggest quality win, has concrete
   failing cases to test against.
3. **Keep GLiNER warm across batches** — roughly halves the full-book clock.
4. **Full book pass** on satoshi/nakamoto (ask first):
   `node cli/run-historical-v3-batches.js --max-total-usd 2.50` with the frozen
   config. Output is a *development corpus*, not production KG data, until gold
   exists.
5. **Grow gold** via `--annotate`, then wire an eval-vs-gold diff report so
   regressions are named automatically.

## Rules that must not be quietly dropped

- Never claim a promotion gate (precision/recall >0.95, cost ≤$0.002/page)
  without human-adjudicated held-out gold and measured cost. Nothing has passed.
- Never let a model's agreement stand in for truth: two cheap models agreed on
  caption junk on page 180.
- Never resolve a reference by guessing; record an ambiguity or a confession.
- Never send restricted page text anywhere without explicit user approval, and
  never ship verbatim quotes to the app.
- Keep every fix principled and testable — each diagnosed failure becomes a
  unit test or a gold item so it cannot silently return.
