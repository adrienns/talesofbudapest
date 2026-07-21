# Historical Extraction V3 — quality & eval handoff, 2026-07-20

Supersedes the **status / eval / gold** sections of older V3 handoffs for day-to-day
work. Architecture remains [HISTORICAL_EXTRACTION_V3_HANDOFF.md](HISTORICAL_EXTRACTION_V3_HANDOFF.md).
Frozen models and address/OCR layers remain in
[HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md](HISTORICAL_EXTRACTION_V3_HANDOFF_2026-07-17.md).

## Goal (unchanged)

Extract tour-usable historical claims from the restricted *Jewish Budapest*
monograph with immutable PDF offsets, deterministic subject memory before LLMs,
dual-model support, and **fail-closed certification** until adjudicated held-out gold exists
(`human*` promotion or `sol-*` silver certification — never draft-auto).

Governing rule: never fail silently; supported ≠ true.

## Development vs test vs held-out

| Split | Pages (examples) | Purpose | May we retune against it? |
|---|---|---|---|
| `development` | 15–24, 46–48, 75, … | Iterate gates, gold hygiene, metrics | Yes |
| `test` | **97, 140, 160, 180** (frozen) | Separate check after changes | **No** — only `--force` reseed |
| `probe` | **55, 65, 95, 115** (frozen 2026-07-20) | Brand-new pages extracted then frozen | **No** — only `--force` reseed |
| `heldout` | 50, 70, 90, … | Future **human** promotion gold | Never with draft-auto |

```bash
npm run gold:seed-test          # first freeze (or --force to rebuild)
npm run gold:seed-probe -- --force
npm run eval:historical:v3:dev
npm run eval:historical:v3:test
npm run eval:historical:v3:probe
```

**Policy:** while improving precision on development, do not merge test/probe false
positives into gold. Frozen splits are snapshots (`draft-auto-test` /
`draft-auto-probe`) from pages held out of the tuning loop.

## Development eval snapshot (2026-07-20, post–Sol fixes)

Run from `talesofbudapest-backend/`:

```bash
node cli/eval-historical-items-v2.js --v3 --split development --allow-incomplete --report-only
# or: npm run eval:historical:v3:dev
```

| Metric | Meaning | Honesty note |
|---|---|---|
| `overall` (primary) | Strict bipartite P/R on pages with ≥1 gold item | Use this for decisions |
| `overall_paraphrase_sibling_adjusted` | Diagnostic: same-polarity paraphrase of gold (overlap ≥0.68) not counted as FP | Not a promotion metric; clause-id sharing alone is **not** enough |
| `overall` on `test` / `probe` | Strict P/R on frozen pages | Freeze is a **replay** of the same extract (`draft-auto-*`), not independent human gold |
| `negatives` | Caption/title/quote leakage patterns | Must stay clean |

**Measured (Sol loops #2–3, 2026-07-20):** development fixture-fit ~P **0.53** / R **0.58**, negatives **clean** against the four named patterns only; test/probe freeze-replay P/R=1 with `metric_honesty=fixture_fit_or_freeze_replay`. Fail-closed restore without backfilled bound `pre_structural_verification` explains the FN spike — do not weaken restore to chase P. Do **not** cite any older development P=1.00 figures.

**Promotion is still blocked.** Held-out requires typed hard blockers (`heldout_*`, `locked_config_*`, `annotation_incomplete`, clause integrity, `heldout_approved_run_required`) that `--allow-incomplete` cannot bypass. Diagnostic acceptance is `gate.diagnostic_ok` (separate from promotion `passed`).
## Sol review fixes (2026-07-20, GPT-5.6 Sol)

| Issue | Fix |
|---|---|
| Rescore re-promoted when reason ∉ HARD_DEMOTE | Re-promote **only if `reason === null`**; any structural reason demotes (aligned with extract) |
| Sibling metric too loose | Adjusted metric requires paraphrase + **same polarity**, not mere clause-id overlap |
| Collapse ignored polarity | `collapseClauseSiblingItems` / near-dedupe keep opposite polarity |
| Gold clause dedupe too aggressive | `dedupe-gold-clauses.js` requires identical clause **sets** + semantic/polarity check |
| Dev experiments could win held-out | `gold-seed-dev` / `gold-rebind-75` are **development-only** |
| Row winning page A emitted page-B predictions | Predictions and refs scoped to pages the row actually won |
| Rescore new `run_id` broke transitions | Eval looks up transitions via `run_id` **and** `structural_rescore.from_run_id` |
| `--allow-incomplete` skipped freeze | Freeze check for `test`/`probe` is never bypassed |
| Evidence quotes stole gold matches | `required_terms` match against **statement** (+ types/roles), not wide evidence spans |
| Weak kinship / abstract / book-meta FPs | Gate demotes bare kinship, locative fragments, abstract “The relocation…”, and `The book describes…` (not titled books like Esther) |
### Rescore without paid re-extract

```bash
npm run rescore:historical:v3
# node cli/rescore-v3-structural.js [--pages 46,47,48]
```

- Re-applies grounding + demotions; **does not full re-dedupe** (re-dedupe collapsed gold neighbors and tanked recall).
- Collapses same-clause paraphrases (polarity-aware).
- Re-promotes prior structural demotions **only** when the current gate returns `null`.
- Appends rows with `structural_rescore.from_run_id` + `policy: demote_any_reason_repromote_only_null`.

### Eval row selection

`cli/eval-historical-items-v2.js`:

- Prefer rows with **supported items on that page** over newer empty `incomplete_api` shells.
- Include `gold-seed-dev` / `gold-rebind-75` **only** for `--split development`.
- Other A/B `experiment_id` values stay opt-in via `--experiment-id`.
- `--ignore-rescore` scores only pre-rescore extracts.

### Structural quality gate (`lib/historicalItemQuality.js`)

Applied at extract time and via free rescoring:

| Reject | Keep |
|---|---|
| Meta “is mentioned”, maxim quotes, malformed prefixes | Named / place / year anchored claims |
| Leading unresolved pronouns (`He…` with no resolution) | Resolved pronouns after `groundPronominalStatement` |
| Bare vague agents (`Architects designed houses.`) | Specific agents (`People in black kaftans…`) |
| Caption/title furniture inside evidence quotes | Body claims whose statement is grounded even if evidence once opened with `It` |

### Gold hygiene

| Command | Role |
|---|---|
| `npm run gold:seed` | Supported run → annotation JSON (`draft-auto`, never `human-*`) |
| `npm run gold:merge` | Merge annotations into `fixtures/historical-book-items-golden-v3.json` |
| `npm run gold:rebind` | Rebind clause IDs after layout changes |
| `npm run gold:dedupe` | Drop near-duplicate gold with **identical clause sets** + paraphrase/polarity (keeps `hi_*` seeds) |

Fixture notes:

- Development items are mostly `draft-auto` / rebound Fable — fine for the loop, **not** for promotion.
- Negatives: Hakdome title, Denarius caption, Mendel seal caption, invented quote speaker.
- Duplicating `g75_*` and `hi_*` on the same clause starves bipartite matching; always `gold:dedupe` after merges.

## Artifact map

Under `ingest/corpus/restricted/extractions/` (gitignored bulk) and
`talesofbudapest-backend/fixtures/`:

| File | Purpose |
|---|---|
| `jewish-budapest.historical-items-v3.jsonl` | Item runs (production + experiments + rescored appends) |
| `jewish-budapest.historical-subject-transitions-v3.jsonl` | Subject-memory transitions per run |
| `jewish-budapest.gold-diff-development.json` | Latest dev eval FN/FP diff |
| `fixtures/historical-book-items-golden-v3.json` | Gold manifest + negatives + splits |

## Operator loop

1. Extract (or reuse) reference pages: `npm run extract:historical:v3 -- --from-page N --page-count M`
2. Free quality pass: `npm run rescore:historical:v3`
3. Score: `npm run eval:historical:v3:dev`
4. Inspect `jewish-budapest.gold-diff-development.json`
5. Seed/merge/dedupe gold as needed; never stamp `human-*` without browser adjudication
6. Only then consider held-out human gold and promotion gates

## Known remaining gaps

- Strict FPs that remain after polarity-aware collapse are usually near-paraphrases that still fail bipartite match (different required terms / open types) — keep tightening extract collapse, not the primary metric.
- **`overall_all_split_pages`** includes split pages that still lack gold items.
- **Subject memory** still leaves some possessives/pronouns unresolved; gate keeps named paraphrases, drops bare `He…`.
- **Cost gate** `$0.002`/page for promotion vs practical V3 ~`$0.005` — unchanged; do not claim cost pass.
- **Caption span bleed**: evidence can still include neighboring caption text; gate demotes known furniture patterns; layout mask remains the real fix.
- Test/probe P≈1 is **freeze replay**, not independent human truth.

## Do not claim

- Promotion / production readiness
- Human held-out recall/precision
- That paraphrase-sibling-adjusted P=1 means zero over-extraction
- That test/probe P=1 is a held-out human result