# Historical Extraction V3 — implementation handoff

## Read first

User goal: extract every meaningful historical event/assertion from a book,
without losing identity when prose changes surface form:

```text
Rabbi Moses Efraim → Efraim → R. Efraim → the rabbi → he → his tomb
Named synagogue → the synagogue → it → its decorations
```

**Current subject is central.** It must persist sentence-to-sentence and
page-to-page. It is an entity, not a string. A typed focus stack is required:
current person, current thing/building, current group, plus active focus.
Possessives link an owner to a separate object; `his tomb` must not turn a tomb
into Efraim.

Do not silently guess. If more than one compatible entity exists, mark the
reference ambiguous and send one compact block-level adjudication request.

## Current worktree state

Do not discard unrelated dirty changes. Several docs and LangExtract pilot files
were already modified before this handoff.

This handoff added, uncommitted:

- `talesofbudapest-backend/lib/historicalSubjectMemory.js`
- `talesofbudapest-backend/lib/historicalSubjectMemory.test.js`
- V3 mode inside `cli/extract-historical-book-v2.js` (`--v3`)
- `npm run extract:historical:v3`
- `npm run build:historical:v3-browser`
- entity IDs on resolved reference participants
- layout masking via `lib/historicalPdfLayout.js`

The new module currently does these deterministic pieces:

1. Builds source-local entity clusters from GLiNER mentions.
2. Merges full name / first or surname only when the short form is unique.
3. Records roles from titles, including `Rabbi` / `R.`.
4. Carries focus across exact sequential pages in a JSON state file.
5. Resolves pronouns, possessives, and common definite descriptions against
   typed focus before model calls.
6. Writes V3 item/coverage records and subject-transition records.
7. Uses Poppler layout coordinates to mask page headers/footers before local NLP
   while preserving raw text length and offsets.

Passing focused tests:

```sh
cd talesofbudapest-backend
node --test lib/historicalSubjectMemory.test.js
node --check cli/extract-historical-book-v2.js
```

Preflight ran on page 46 with **zero paid extraction calls**:

```sh
npm run extract:historical:v3 -- --source jewish-budapest --from-page 46 --page-count 1 --preflight-only --max-cost-usd 0.002
# Routine ceiling: $0.0018/page
```

Page 91 layout preflight also passed. It masked `KrrALy utca 77` as a footer
before NLP, preserving the raw-offset coordinate system. The Efraim entity
cluster now correctly contains `R. Efraim`, `R. Efraim haKohen`, and
`R. Efraim’s`, with role `rabbi`.

`npm test -- --test-name-pattern=...` is currently not valid because the
existing package script passes `lib/` as a Node test path. Use direct test file
commands until that separate script bug is fixed.

## Status — SUPERSEDED

> **This document is the architecture reference. For current state, read
> [HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md](HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md)
> first.** The status below is kept as the record of 2026-07-16 and is now
> partly out of date: the model configuration has since been frozen
> (DeepSeek V4 Flash primary, reasoning off), verification recovery fixes
> raised supported items from 71% to 91-97% on the sampled pages, and an
> address/geography layer and OCR lexicon were added.

## Status 2026-07-16 (branch `historical-extraction-v3`)

Committed on the branch (five commits from the baseline through eval gates):

- **State engine (§1) — done.** Reusable spaCy noun-phrase module
  (`nlp/noun_phrases.py`) feeds a per-page noun ledger from
  `nlp/gliner2_mentions.py --noun-ledger` (always on in V3). Typed resolution
  covers pronouns, possessives, demonstratives, and definite descriptions;
  `his tomb` creates an owned thing entity linked to the owner; `he` can never
  resolve to a place, `it` never to a person; away from the focus stack,
  comparably recent candidates become explicit ambiguity records grouped into
  one compact block-level adjudication request per page. Pages must ascend;
  cold starts are marked in run records. 12 unit tests pass.
- **V3 fields (§2) — done.** Items carry `subject_entity_id`,
  spec-compliant `subject_resolution_source`, `discourse_chain`,
  `literal_subject`, `subject_ambiguous`. Report artifact
  `<source>.historical-v3.report.json` emitted by the browser build.
- **Layout (§3) — partial.** Poppler bbox header/footer masking is wired and
  offset-preserving (page 91 footer case passes). Caption / quote /
  bibliography zone classification and the 99% body-alignment
  `incomplete_layout` gate are still open.
- **Cost routing (§4) — enforced, not passed.** The whole batch must fund the
  quality reserve up front or the run stops as `incomplete_budget`; routine
  calls cannot spend the reserve; V3 cache keys bind normalized body checksum,
  incoming subject-state hash, prompt version, model, and output limit.
  Current conservative ceilings (routine $0.0017/page + reserve $0.0022) do
  not fit the $0.002/page cap, so paid V3 runs stop unless `--max-cost-usd`
  is raised for development. **The cost gate has NOT passed.**
- **Browser (§5) — done for current data.** V3 entity chips show aliases,
  roles, provisional noun-ledger origin, owned-by links, resolution source,
  and ambiguity badges; HTML remains fully self-contained.
- **Evaluation (§6) — harness ready, gold missing.** `npm run
  eval:historical:v3` fails closed with explicit blockers until humans
  adjudicate the V3 gold manifest
  (`fixtures/historical-book-items-golden-v3.json`, 32 dev / 16 held-out
  pages). Reference P/R and subject-transition accuracy gates (>0.95) are
  wired in. **No promotion gate has been claimed.**

Open work: layout zone classification + alignment gate, quote-speaker vs
described-person regression, wiring ambiguity adjudication requests into the
quality escalation call, human gold adjudication, then measured paid runs.

### Later on 2026-07-16: verification recovery fixes

Manual review of all 74 non-supported items on the 46-50 sequential smoke
identified three fixable failure classes, now fixed (commit d7590e7):

1. Deterministic subject resolutions are now shown to every model as
   authoritative clause resolutions [[surface, antecedent]]; the reference
   gate accepts resolver-linked antecedents.
2. Single-capital initials ("R.") no longer split sentences.
3. Verify/quality treat paraphrase, double negation, and jointly asserting
   adjacent clauses as support; payloads include adjacent clauses;
   realignment may keep an overlapping neighbor clause.

Genuine rejections (invented citations, modality overreach, contradictions)
are deliberately untouched. Model config for the book pass is frozen:
DeepSeek V4 Flash primary with --primary-reasoning off, Qwen 30B audit,
Gemini Flash quality judge. Fable-5 pilot gold exists for page 75
(development gate only; held-out promotion still requires human gold).

## Exact implementation plan

### 1. Finish the state engine before paid runs

Keep `historicalSubjectMemory.js` as the single deterministic authority.

- Preserve stable source-local `entity_id`, `mention_id`, aliases, roles,
  last explicit mention, and typed focus in the state file.
- Add a local noun-phrase ledger. GLiNER alone misses ordinary heads such as
  `tomb`, `school`, and `building`; reuse the spaCy candidate logic already in
  `cli/pilot-constrained-coref.py`, but move pure logic into a reusable module.
- Resolve every pronoun, possessive, demonstrative, and definite description
  against typed candidates. Never resolve `he` to a place or `it` to a person.
- `the rabbi` needs current compatible person with role `rabbi`; `the synagogue`
  needs current compatible building with role/head `synagogue`.
- Do not merge short names when two candidates share them. Existing unit test
  covers `Moses Efraim`, `Jacob Efraim`, then bare `Efraim`.
- Process source pages strictly in ascending order. State can load only when
  `state.last_page === from_page - 1`; otherwise cold-start and mark it.
- Persist only explicit/source-grounded entities and the last three pages of
  relevant entity state. Do not persist unsupported model claims as focus.

### 2. Make extraction V3 a real first-class command

Current implementation uses `extract-historical-book-v2.js --v3` to reduce
duplication. Keep this only if behavior stays isolated. Otherwise split it into
`cli/extract-historical-book-v3.js` and retain V2 unchanged.

Required artifacts in `ingest/corpus/restricted/extractions/`:

- `<source>.historical-items-v3.jsonl`
- `<source>.historical-coverage-v3.jsonl`
- `<source>.historical-subject-transitions-v3.jsonl`
- `<source>.historical-subject-memory-v3.json`
- `<source>.historical-v3-model-cache.jsonl`
- a V3 report and self-contained browser HTML

Add these item fields:

```json
{
  "subject_entity_id": "source-local entity ID or null",
  "subject_resolution_source": "deterministic_subject_memory | model | adjudicated | null",
  "discourse_chain": ["mention/entity IDs"],
  "literal_subject": "exact source expression or null"
}
```

Model payload must contain only compact current-state rows, not repeated prose.
Models may select only supplied IDs. Evidence always comes from local clause
offsets. Reject invented clause/mention/entity IDs.

### 3. Fix layout and normalization before extraction

Flat OCR text is unsafe: it can merge captions/footers with body prose. The
page-91 failure showed this (`KrrALy utca 77` became part of a claim).

- Add Poppler `pdftotext -bbox-layout` source adapter.
- Classify body, quote, caption, header/footer, bibliography, and ambiguous
  zones before clause segmentation.
- Do not concatenate zones. Captions cannot update body focus.
- Repair line-break hyphenation in the reading view (`syna-\ngogue` →
  `synagogue`) while preserving raw offset mapping.
- Fail as `incomplete_layout` if body-to-source alignment is below 99%; never
  silently fall back to flat OCR for V3.

The existing Python pilot already has reversible reading normalization. Reuse
that logic rather than create a second incompatible offset mapper.

### 4. Cost routing — must pass, not merely estimate

Target: average actual API cost `<= $0.002/source page`, with precision and
recall both `>0.95` on untouched held-out gold.

Current V3 preflight changed V2's impossible one-byte-per-token estimate to a
two-byte/token conservative estimate and compact limits:

- primary Flash-Lite: `min(1300, max(520, 140 + 16 * clause_count))`
- Qwen audit: `min(900, max(420, 120 + 11 * clause_count))`
- Flash quality: 700

This gets one-page routine ceiling to `$0.0018`, but **quality reserve is
`$0.0022` and cannot fit a `$0.002` total page cap**. Do not claim cost gate
passes until this is fixed.

Required fix:

1. Use one Flash-Lite page extraction and one Qwen audit per two pages.
2. Resolve normal references locally from subject state: no reference API call.
3. Escalate only compact disagreement chains, grouped up to 12 clauses.
4. Before starting, reserve quality only from unused budget of the whole batch;
   if it cannot fit, stop with `incomplete_budget`, not a quality downgrade.
5. Measure actual `usage.cost`, actual output tokens, cache hit rate, and cost
   per page. Tune only development pages.
6. Cache key must include normalized body checksum, incoming subject-state hash,
   prompt/schema hash, model, and output limit. A changed prior-page subject
   state must invalidate the next page cache.

No model downgrade after a failed quality check. Do not use an expensive model
to resolve every pronoun.

### 5. Browser and entity search

Update `cli/build-langextract-browser.mjs` to consume V3 IDs instead of grouping
only folded display text. Every entity chip must be clickable and show:

- canonical local label;
- aliases (`full name`, `first name`, `R. name`, descriptions);
- every mention with page and exact evidence;
- facts connected through subject, participant, ownership, or reference link;
- resolution source and ambiguity state.

Generic `synagogue` remains a searchable type/class. A named synagogue plus
later `the synagogue` should also share one provisional entity when the
state resolver supports it. Do not globally merge all synagogues.

Keep HTML fully self-contained: inline CSS and data, no remote script/style,
no document-write generated JavaScript, and modal must render above content.

### 6. Evaluation and rollout

The current V2 gold fixture is empty. Build evaluation before claiming success.

- Human-adjudicate 32 development pages and lock 16 untouched held-out pages.
- At least 300 gold items total and 150 held-out.
- Gold must include layout zones, source offsets, entity clusters, aliases,
  reference chains, and clause dispositions.
- Match prediction to gold by identity plus evidence clause, supported outputs
  only.
- Report overall/event/assertion P/R, reference P/R, subject-transition
  accuracy, layout P/R, OCR/negation/attribution/cross-page/OTHER slices, and
  actual cost.

Required regressions:

- Page 46: Efraim, `he`, `his tomb`.
- Cross-page full name → first name → title → role → pronoun.
- Named synagogue on page N → `the synagogue` / `it` on N+1.
- Same first name for two people: explicit ambiguity.
- Quote speaker vs described person.
- Subject switch then return.
- Possessive owner vs owned noun.
- Captions, bibliography, and footers cannot affect body focus.
- Page 91: no few-shot-example leakage or layout contamination.

Promotion gates: overall precision `>0.95`, recall `>0.95`, reference P/R
`>0.95`, transition accuracy `>0.95`, exact grounding `100%`, layout P/R
`>0.98`, average actual cost `<= $0.002/page`. If any fails: incomplete, tune
development only, rerun held-out once after configuration freeze.

## Prompt for the next LLM

```text
Work in /Users/mitik/workspace/talesofbudapest.

Read docs/HISTORICAL_EXTRACTION_V3_HANDOFF.md fully first. Do not reset or
discard dirty worktree changes. Continue Historical Extraction V3 from current
state, not from scratch.

Primary product requirement: a persistent, typed current-subject memory across
sentences and sequential pages. It must unify full/short/title/role/pronoun
forms (e.g. Rabbi Moses Efraim → Efraim → R. Efraim → the rabbi → he), while
staying ambiguous when a short alias has multiple candidates. Possessives must
keep owner and owned object separate.

First inspect and test existing changes in:
- talesofbudapest-backend/lib/historicalSubjectMemory.js
- talesofbudapest-backend/cli/extract-historical-book-v2.js (--v3)
- talesofbudapest-backend/cli/pilot-constrained-coref.py
- docs/HISTORICAL_REFERENCE_RESOLUTION.md

Do not spend paid API money until local unit tests, preflight, and an explicit
budget calculation pass. Preserve source offsets. Build layout-first processing,
then noun-complete state resolution, then V3 browser/evaluation. Never claim
the $0.002/page or >95% gates pass without held-out human gold and measured
actual costs.

Implement in small commits. Test focused logic after each step. Run only
bounded development pages; cache all model work with incoming-state hash.
```
