# Full-book V3 private-scan readiness (Sol silver)

Date: 2026-07-20  
Stack: prompt `historical-semi-open-v2.12`, quality `google/gemma-3-27b-it`, frozen `config/historical-v3-frozen-stack.json`  
Policy: Sol-silver / no-human-gold — **not** human-certified, **not** publishable, **not** independent historical truth.

## Product bar (why scan at all)

This corpus feed is for a **tour app with deep historical insights**, not chatbot tour copy. Ready means we can privately extract an **evidence-backed KG** (immutable offsets, fail-closed unsupported claims, honest Sol-silver ≠ historical truth). That is the anti-slop bar: no generic blurbs, no invented color without a trail back to the page. Circular Sol P/R proves process integrity, not tour-quality insight.

## Checklist

- [x] Held-out re-extract on v2.12/Gemma complete enough (16/16 pages; `complete` + `failed_cost_gate` accepted)
- [x] Sol silver rebuilt + eval recorded (with honest circular P/R caveat)
- [x] Cost pilot ~30 pages within budget envelope (avg ≤ $0.002; dense outliers expected)
- [x] Contiguous canary OK (pages 100–102, subject memory written)
- [x] Harness dry-run + tiny execute canary OK (ledger + resume skip)
- [x] Tests green (layout/provenance/item-quality/adversarial eval)
- [x] Explicit: **NOT** human-certified; private scan only

## Verdict

**READY to privately start full scan**

Do **not** treat this as certification, promotion, or human P/R. Full-book `--execute` was **not** started in this iteration.

## Held-out cost-opt (`cost-opt-heldout-v2.12`)

| Metric | Value |
|--------|-------|
| Pages | 16/16 present |
| Avg cost | **$0.0016**/page |
| ≤ $0.002 | 11/16 (strict under); 5 `failed_cost_gate` dense pages |
| Max | $0.0027 (page 110) |
| Statuses | 11 `complete`, 5 `failed_cost_gate` |

Page 50 was missing after the first batch (`incomplete_layout` 66.7%): pdftotext bbox text kept `&apos;` while OCR uses `'`. Fixed in `lib/historicalPdfLayout.js` (`decodeXhtmlText`); page 50 re-extracted → `complete` @ $0.0012.

Cost outliers (190/230/330/110/70): dense pages remain slightly over $0.002; **held-out average still under gate**. Acceptable for private scan under Sol-silver policy; do not pretend every page is ≤ $0.002.

## Sol silver eval (rebinding to cost-opt runs)

- Adjudication: `cli/sol-adjudicate-heldout.js --experiment-id cost-opt-heldout-v2.12`
- Merge: Sol replace-heldout purge (prevents stale gold accumulation)
- Report: `ingest/corpus/restricted/extractions/heldout-eval-costopt-v2.12-summary.json`

| Field | Value |
|-------|-------|
| `certification` | `sol_silver` |
| `gate.eligible` | true |
| `gate.passed` | true |
| Overall P / R | **0.997 / 0.997** (358 TP, 1 FP, 1 FN) |
| Avg cost | $0.00163 ≤ $0.002 |
| Refs / layout | P/R = 1.0 (circular with Sol judge) |

**Honesty caveat:** Circular Sol P/R ≈ 1 is agreement between Sol-as-judge and the extract Sol judged — **not** independent truth, **not** human promotion. `metric_honesty.claim_forbidden` still bans human-promotion language.

## Cost pilot (`cost-pilot-30-v2.12`, 34 stratified pages)

| Metric | Value |
|--------|-------|
| Avg | **$0.0018**/page |
| Max | $0.0071 (page 600) |
| p95 | $0.0033 |
| ≤ $0.002 | 25/34 |
| Statuses | 24 `complete`, 9 `failed_cost_gate`, 1 `incomplete_api` |

Outliers (cost > $0.002): 46, 101, 180, 340, 360, 460, 540, 580, 600.  
Page 300: `incomplete_api` (quality line protocol truncated twice) — fail-closed; harness must surface, not skip silently.

Envelope judgment: **average within private-scan budget**; expect a minority of dense/tail pages above $0.002 and rare incomplete retries.

## Canaries

1. **Contiguous 100–102** (`canary-contiguous-100-102-v2.12`): `complete`, $0.0015/page, subject-memory state file written. No silent failure.
2. **Harness**: dry-run inventory OK; tiny `--execute` pages 100–101 (`harness-canary-v2.12`) ok=2; re-run skipped via ledger (`skip=2`).
3. **Full-book execute**: content pages **1–579** by default (`scan-historical-book-v3.sh`); PDF **580–615** are indexes — exclude from provisional browser/KG (see `config/jewish-budapest-page-ranges.json`). Do not treat 615 as the content end.

## Failed-page reuse (while fullbook runs)

| Status | Items written? | Use now? | Promotion / Sol-silver |
|--------|----------------|----------|------------------------|
| `failed_cost_gate` | Yes — full finished row | **Yes** — keep supported items + evidence offsets; cost flag is honest | Accepted (held-out / Sol silver) |
| `incomplete_api` | Partial or empty | Only if items exist; treat as provisional | **Rejected** |
| `incomplete_layout` | No row | Unusable until layout retry | Rejected |
| Ledger `warn` | = extract exit ≠ 0 | Often still has a usable items row | `ok` = clean complete exit only |

Retry without racing the live scan: `bash cli/retry-failed-fullbook.sh` → experiment `fullbook-v2.12-retry` (skips live `--from-page`, leaves `fullbook-v2.12` ledger alone). Default retries `incomplete_api` + missing item rows only; `failed_cost_gate` pages are already usable.

## Fixes landed this iteration

1. XHTML entity decode for layout furniture (`&apos;` etc.) — unblocks page 50.
2. `sol-adjudicate-heldout.js --experiment-id` — bind winners to a cost-opt experiment.
3. Sol merge purge of prior sol-* held-out rows — regenerate without gold accumulation / duplicate refs.
4. Punctuation-only `*` no longer classified as title furniture (page 39 layout gate) — `lib/historicalPdfLayout.js`.
5. `cli/retry-failed-fullbook.sh` — parallel retry under a separate experiment id.

## Explicit non-claims

- Not human-certified; not ready for public/promoted release.
- Sol-silver `gate.passed` ≠ historical truth.
- Full-book scan remains a **private** corpus build under spend caps + fail-closed statuses.
