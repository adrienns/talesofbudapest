# Design: Sol silver held-out certification

Date: 2026-07-20  
Status: approved  
Repo: talesofbudapest (historical extraction V3)

## Problem

Promotion was fail-closed on **human*** held-out gold. Product owner chose to allow **Sol-adjudicated** held-out instead, with honest non-human claims, and to generate Sol labels autonomously (extract missing pages first).

## Decision

| Topic | Choice |
|-------|--------|
| Policy | Option **C**: Sol gold may set `gate.passed=true` with `certification: "sol_silver"`; Sol may regenerate `adjudication_manifest` |
| Labeling | Approach **A**: Sol-as-judge over approved extract runs vs immutable OCR |
| Coverage | Path **B**: Keep all 16 held-out pages; extract missing 15, then adjudicate |

## Provenance

- Adjudicated sources: `gold_source` starts with `human` **or** `sol` (e.g. `sol-adjudication`).
- Require `adjudication_id` + `adjudicator` on held-out rows.
- Do **not** mix `human*` and `sol-*` on held-out → hard block `heldout_provenance_mixed`.
- `draft-auto` / `fable-5` never certify held-out.

## Manifest

Regenerate on `human*` **or** `sol-*` merges:

- `adjudication_id`, `adjudicator`, `gold_source`
- `certification: "human" | "sol_silver"`
- `content_sha256` (heldout fingerprint)
- `approved_run_ids: string[]`
- `immutable_source_sha256` (hash of held-out OCR pages)

## Eval report honesty

When certification is Sol:

- `gate.passed` may be true (numeric thresholds unchanged).
- `metric_honesty.claim_allowed` = sol-silver certification agreement only.
- Forbidden: “human promotion”, “historical truth”, treating Sol agreement as human held-out.

## Pipeline

1. Extract V3 for held-out pages lacking runs:  
   `70, 90, 110, 130, 150, 170, 190, 210, 230, 250, 290, 330, 370, 410, 470`  
   (page 50 already has a run; prefer `complete` status via adequate `--max-cost-usd`).
2. Sol-as-judge each of 16 pages against `jewish-budapest.pages.txt`.
3. Merge annotations with `gold_source: sol-adjudication`.
4. Stamp fixture: `immutable_source_sha256`, `locked_config`, `approved_run_ids`, annotation status for Sol silver.
5. Eval held-out; document outcomes without overclaiming.

## Non-goals

- Calling Sol silver “human promotion”.
- Weakening P/R (>0.95) or cost (≤$0.002/page) thresholds.
- Mixing Sol and human on the same held-out set.

## Risks

- Extract cost may remain ~$0.005/page → cost gate may still fail (`passed=false`) even with strong P/R.
- Sol judging extract output is agreement with Sol, not independent historical truth.
