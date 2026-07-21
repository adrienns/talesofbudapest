# Plan: Sol silver held-out certification

> **For agentic workers:** Implement tasks in order. Each task has steps + verification.

**Spec:** `docs/superpowers/specs/2026-07-20-sol-silver-heldout-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `lib/historicalGoldProvenance.js` | `isHumanSource`, `isSolSource`, `isAdjudicatedSource`, certification label |
| `cli/eval-historical-items-v2.js` | Accept sol-* held-out; certification + honesty; mixed provenance block |
| `cli/merge-gold-annotations.js` | Sol regenerates manifest; stamp adjudication on sol-* |
| `cli/sol-adjudicate-heldout.js` | NEW: Sol-as-judge → annotations JSON |
| `cli/extract-heldout-pages.sh` or npm script | Batch extract missing held-out pages |
| `fixtures/historical-book-items-golden-v3.json` | Sol labels + manifest fields |
| `docs/DECISIONS.md` + quality doc | Policy change |

## Tasks

### Task 1: Provenance helpers + eval/merge policy

**Files:** create `historicalGoldProvenance.js`; edit eval + merge + tests

- [ ] `isAdjudicatedSource` = human* \| sol*
- [ ] Held-out checks use adjudicated (not human-only)
- [ ] Mixed human+sol → `heldout_provenance_mixed`
- [ ] Report `certification` + updated `metric_honesty`
- [ ] Merge regenerates manifest for sol-*; requires adjudication metadata for sol-*
- [ ] Unit/adversarial tests for sol path blockers

**Verify:** `node --test` adversarial + provenance tests pass; heldout without sol gold still blocks

### Task 2: Extract missing held-out pages

**Files:** runs append to `jewish-budapest.historical-items-v3.jsonl`

- [ ] For each missing page in heldout, run `extract:historical:v3 --from-page N --page-count 1` with adequate `--max-cost-usd` aiming for `complete`
- [ ] Record run_ids covering all 16 pages

**Verify:** every heldout page has ≥1 selected-capable run

### Task 3: Sol-as-judge CLI

**Files:** `cli/sol-adjudicate-heldout.js`

- [ ] Load OCR + winning runs for heldout pages
- [ ] Judge items (accept/reject), emit clauses/refs/layout/transitions/negatives or dispositions
- [ ] Write annotations JSON with sol-adjudication metadata

**Verify:** annotations file validates; merge succeeds

### Task 4: Merge + fixture binding

- [ ] Merge annotations; set `immutable_source_sha256`, `approved_run_ids`, `locked_config`, annotation_status
- [ ] Fingerprint matches manifest

**Verify:** fingerprint check; no `adjudication_manifest_mismatch`

### Task 5: Eval dry-run + docs

- [ ] `eval --split heldout --approved-run-id ...`
- [ ] DECISIONS + quality doc updated
- [ ] Report certification honestly; do not claim human promotion

**Verify:** tests green; report has `certification: sol_silver`
