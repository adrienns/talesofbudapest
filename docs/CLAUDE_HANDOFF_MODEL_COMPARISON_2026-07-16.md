# Claude handoff — cheap-model comparison for Historical Extraction V3

## Immediate task

The user asked to test promising cheaper models on the **same five V3
development pages** and decide whether they are good enough:

```text
75, 97, 140, 160, 180
```

This is a paid, restricted-book extraction test. Do not replace production
models merely because a generic benchmark is high. Compare exact grounded,
supported historical items, reference handling, output protocol failures, and
actual cost on these pages.

## Stop condition / permission

The actual book text is restricted. Sending it to OpenRouter was blocked by
the local policy before any model request or charge. The user must give a
fresh explicit approval before a real test. Required wording may be:

```text
I approve sending pages 75, 97, 140, 160, 180 to OpenRouter for this
$0.05 capped model test.
```

Until that approval arrives, do only local inspection, preflight, code/tests,
or public/synthetic tests. Do not work around this restriction.

## Current repository state

- Workspace: `/Users/mitik/workspace/talesofbudapest`
- Backend: `talesofbudapest-backend/`
- Branch: `historical-extraction-v3`
- Read [`HISTORICAL_EXTRACTION_V3_HANDOFF.md`](HISTORICAL_EXTRACTION_V3_HANDOFF.md)
  fully first. It is the architecture handoff and remains authoritative.
- Preserve dirty files. They predate this task:
  - `docs/DECISIONS.md`
  - `docs/EXTRACTION_PIPELINE.md`
  - `docs/HISTORICAL_BOOK_KNOWLEDGE_EXTRACTION.md`
  - `docs/OPENROUTER.md`
  - `docs/README.md`
  - `talesofbudapest-backend/cli/pilot-constrained-coref.py`
  - `talesofbudapest-backend/cli/pilot-langextract-historical.py`
  - `talesofbudapest-backend/cli/pilot_langextract_historical_test.py`

Recent V3 commits:

```text
4010177 fix(extraction): preserve lists and mask captions
82687fe fix(extraction): resolve definite phrases by exact alias before head class
23b4d65 fix(extraction): repair V3 paid path defects found on five dev pages
```

The five old comparison runs found that extraction content was often good, but
the $0.002/page gate still failed on dense pages. Known remaining weaknesses:

1. Page 97 chronology/list segmentation can split `1827:` into a bad stub.
2. Page 180 captions can leak into body extraction.
3. OCR noise and occasional duplicate statements remain.
4. No human gold fixture exists yet, so no precision/recall claim is valid.

## Models under comparison

| role | baseline | challenger | intended decision |
| --- | --- | --- | --- |
| primary extractor | `google/gemini-2.5-flash-lite` | `deepseek/deepseek-v4-flash` | promote only if item and reference quality is not worse, at lower actual cost |
| independent audit | `qwen/qwen3-30b-a3b-instruct-2507` | `openai/gpt-oss-20b` | challenger is cheaper; do not assume it is a stronger historian |
| difficult-case quality | `google/gemini-2.5-flash` | unchanged | retain as the quality judge for this experiment |

Live OpenRouter catalog numbers observed on 2026-07-16:

```text
Gemini Flash-Lite: about $0.080 input / $0.399 output per M weighted tokens
DeepSeek V4 Flash: about $0.066 input / $0.240 output per M weighted tokens
Qwen 30B A3B: about $0.048 input / $0.193 output per M tokens
GPT-OSS-20B: about $0.038 input / $0.149 output per M weighted tokens
Gemini Flash quality: about $0.229 input / $2.49 output per M weighted tokens
```

Prices and provider routing change. The extraction CLI already fetches the
live `/models` catalog; use recorded `usage.cost` as the result of record.

## V3 command and safe test configuration

The script is `cli/extract-historical-book-v2.js --v3`; package command:

```sh
cd /Users/mitik/workspace/talesofbudapest/talesofbudapest-backend
npm run extract:historical:v3 -- [arguments]
```

There is **no `--help` implementation**. Passing it starts the default run,
so do not use `--help` to inspect options.

After explicit approval, run one page at a time with independent temporary
subject state. This keeps each candidate-page observation isolated and capped:

```sh
npm run extract:historical:v3 -- \
  --source jewish-budapest \
  --from-page 75 \
  --page-count 1 \
  --max-cost-usd 0.01 \
  --primary-model deepseek/deepseek-v4-flash \
  --audit-model openai/gpt-oss-20b \
  --quality-model google/gemini-2.5-flash \
  --state-file /private/tmp/historical-v3-model-test-75.json
```

Repeat only for `97 140 160 180`. Total hard cap: `$0.05`.

Important: model-cache hits make a repeat free but cannot prove the new model
worked live. Before reporting a paid A/B result, inspect
`ingest/corpus/restricted/extractions/jewish-budapest.historical-v3-model-cache.jsonl`.
If an exact cache key already exists for a candidate call, add a deliberate
test-only `--no-model-cache` or `--experiment-id` cache-key component, then
rerun the bounded page. Do not delete shared cache artifacts or production
records. Ideally also add a dedicated `--output-dir` or `--run-label` so
experiment records do not become the browser's default/latest run.

## What to measure

For each page/model configuration, record:

```text
run_id, page, status, total/supported item count,
primary/audit/quality call count, cache hits,
actual usage.cost, actual input/output/reasoning tokens,
cost/page, quality-route rate, protocol retry/truncation count,
resolved reference count, ambiguous reference count.
```

Then manually inspect the source and output for at least these slices:

- page 75: biography dates/names; ensure factual statements are grounded;
- page 97: chronology/list entries, especially colon stubs;
- page 140: Neolog/Orthodox discussion and subject changes;
- page 160: cross-sentence subject continuity;
- page 180: captions/illustration text must not become body facts.

For each real item, check:

1. Exact evidence clause and offsets exist.
2. Statement has correct subject, polarity, modality, and attribution.
3. `he`, `his`, `the rabbi`, `the synagogue`, `it`, and page continuations
   resolve to the correct source-local entity, or are marked ambiguous.
4. No model-invented entity, date, or relationship appears.
5. Items did not disappear because TSV was truncated or malformed.

Do not use only `supported_item_count` as quality. A weaker auditor can make
the pipeline look cheaper by failing to discover omissions or by agreeing too
easily.

## Decision rule

Do **not** promote either challenger from one run. On the five development
pages, require all of the following before proposing a wider evaluation:

- No worse manually checked recall or factual/reference precision than its
  baseline on every inspected slice.
- No unresolved protocol/truncation problem.
- Lower measured average cost, including any induced Gemini quality calls.
- No increase in caption leakage, chronology failures, or subject ambiguity.

Only then run the locked held-out evaluation after human gold exists. The real
promotion gates remain: precision > 0.95, recall > 0.95, exact grounding 100%,
and actual average cost <= $0.002/page.

Likely outcome to expect: DeepSeek V4 Flash is the best primary candidate;
GPT-OSS-20B is a cost challenger, not a proven Qwen replacement. Gemini Flash
quality routing may dominate total cost on hard pages, so lowering escalation
rate is still more valuable than swapping every model.

## Local checks allowed now

```sh
cd /Users/mitik/workspace/talesofbudapest/talesofbudapest-backend
node --test lib/historicalSubjectMemory.test.js
node --check cli/extract-historical-book-v2.js
npm run extract:historical:v3 -- \
  --source jewish-budapest --from-page 75 --page-count 1 \
  --preflight-only --max-cost-usd 0.01 \
  --primary-model deepseek/deepseek-v4-flash \
  --audit-model openai/gpt-oss-20b \
  --quality-model google/gemini-2.5-flash \
  --state-file /private/tmp/historical-v3-model-test-75.json
```

Preflight is local plus OpenRouter's public model catalog. It does not send
page text to a model, but needs network access for current pricing.

## Prompt for Claude

```text
Read docs/CLAUDE_HANDOFF_MODEL_COMPARISON_2026-07-16.md and
docs/HISTORICAL_EXTRACTION_V3_HANDOFF.md fully. Preserve existing dirty files.

Continue the restricted-book Historical Extraction V3 work. The immediate task
is a fair, bounded comparison of DeepSeek V4 Flash as primary and GPT-OSS-20B
as audit against the current Gemini Flash-Lite/Qwen baseline on pages
75, 97, 140, 160, 180. Never export restricted page text to OpenRouter until
the user gives fresh explicit approval. Once approved, cap the full experiment
at $0.05, isolate subject-memory state per page, avoid treating cache hits as
new model evidence, inspect outputs manually, and report both quality and
actual cost. Do not promote a model on generic benchmarks or supported-count
alone. Keep Gemini Flash as the difficult-case judge for this A/B test.
```

## Results 2026-07-16 (session 2, $0.044 of $0.05 spent)

Three challenger passes on pages 75/97/140/160/180, all isolated by
`--experiment-id` (never cache-mixed with baseline records):

1. **Defaults**: both challengers failed every page — reasoning tokens
   consumed the output caps (truncation) and DeepSeek hit the fixed 120s
   client timeout twice. Added `--primary-reasoning/--audit-reasoning`
   (OpenRouter reasoning parameter; joins the V3 cache key) and
   `OPENROUTER_TIMEOUT_MS`.
2. **reasoning off (both)**: DeepSeek primary worked cleanly and cheaply
   (~$0.0009/call); the GPT-OSS endpoint rejected the request with 400
   "Reasoning is mandatory for this endpoint and cannot be disabled".
3. **primary off / audit low**: 4/5 pages completed; GPT-OSS still
   truncated page 160 twice. **GPT-OSS-20B fails the decision rule**
   (unresolved protocol/truncation problem) and is not a Qwen replacement.
4. **Hybrid: DeepSeek primary (reasoning off) + Qwen audit + Flash judge**:

```text
page  baseline(sup/items, $)   hybrid(sup/items, $)
  75   39/39  0.0019(cached)    44/45  0.0029
  97   17/50  0.0075            41/47  0.0033
 140   37/46  0.0038            37/48  0.0031*
 160   18/25  0.0013(cached)    18/28  0.0020
 180   23/40  0.0027             0/37  0.0030*
TOTAL 134/200 $0.0034/page     140/205 $0.0029/page
* incomplete_budget: the $0.005 test cap could not fund the quality
  reserve; a real run needs the standard cap. Page 180's 0 supported is
  that artifact, not model output.
```

Manual slice checks: page 97 chronology items now bind exactly to their
`YEAR:` clauses (list preservation + terser DeepSeek statements); page 75
items grounded, atomic, no invented entities/dates in samples; DeepSeek
statements are terser and occasionally drop a date into evidence rather
than the statement text.

**Recommendation (not a promotion):** DeepSeek V4 Flash primary with
`--primary-reasoning off` + Qwen audit is the promotion candidate — more
supported items at lower measured cost with zero protocol failures.
Before promotion: rerun 140/180 uncapped for a clean five-page set, then
the locked held-out evaluation once human gold exists. GPT-OSS-20B is
rejected for the audit role.
