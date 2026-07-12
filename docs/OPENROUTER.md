# OpenRouter — Usage, Cost Controls, and Lessons Learned

Companion to [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md) (the prompts
and pipeline the model ladder below feeds) and [DECISIONS.md](DECISIONS.md)
(dated record of the prompt/model changes referenced here). This doc is the
operating manual for the OpenRouter-specific plumbing: which models we call,
what they cost, how prompt caching works, and the cost-control tooling that
exists because a real run once burned far more than it should have.

**All model IDs, prices, and code snippets below were re-read from the live
files at doc time — re-verify with `npm run check:openrouter-models` before
trusting a number here for a big paid run; free-tier IDs and pricing churn
on OpenRouter without notice.**

---

## 1. What OpenRouter is, and every real call site

[OpenRouter](https://openrouter.ai) is a unified API gateway that fronts
many LLM providers (OpenAI, Google, DeepSeek, Meta, Perplexity, Anthropic,
and more) behind one API shape and one API key, with a shared per-model
pricing/context catalog you can query for free. `talesofbudapest-backend/
lib/openRouterClient.js` is the single shared client: `createChatCompletion`
(chat/completions), `createSpeech` (audio/speech, TTS), both authenticated
with `OPENROUTER_API_KEY`. Real call sites, grepped from the current tree:

| Call site | Purpose |
|---|---|
| `cli/extract-restricted-book.js` | Restricted-book knowledge-graph extraction (§4 below) |
| `cli/research-kg-placeholders.js` | Placeholder-entity knowledge triage via Qwen Flash (§8) |
| `cli/backfill-kg-alias-translations.js` | LLM tail backfill for entity-alias translations |
| `cli/extract-mek.js`, `cli/extract-mek-deep.js` | MEK public-domain book extraction |
| `generateStory.js` | Legacy story generation |
| `lib/narrativePipeline.js` | Narrative/audio-tour script generation (3 call sites) |
| `lib/historianNarrative.js` (via `cli/enrich-history.js`) | Historian-voice narrative enrichment |
| `lib/landmarkAudioPipeline.js` | Landmark audio-tour script generation |
| `lib/ttsClient.js` | Text-to-speech (`generateAudio.js`) |
| `lib/kgEmbeddings.js` (`cli/embed-kg.js`, `cli/eval-kg-matching.js`) | Embeddings — hits OpenRouter's `/embeddings` endpoint directly (not through `createChatCompletion`), same `OPENROUTER_API_KEY`, default model `openai/text-embedding-3-small` |

This doc focuses on the restricted-book extraction and placeholder-research
paths (§4–§9) — that's where the cost incident happened and where the
cost-control tooling now lives.

---

## 2. The cost incident

A run of `cli/extract-restricted-book.js` used a hardcoded single paid model
(`google/gemini-2.5-flash`), `max_tokens: 12000`, and a 2-attempt retry per
window. 88 of ~200 windows failed validation — each failure could burn up to
2 × 12,000 output tokens for zero usable output (a truncated/invalid JSON
response is a total loss; there's no partial credit). Separately, the run
was accidentally kicked off unbounded — no `--limit` was passed, so it
attempted a re-extraction of the whole book rather than a bounded batch.
Combined, the run cost roughly **$8–10** when a properly bounded, ladder-first
test pass should have cost **~$1–2**.

`docs/DECISIONS.md` documents the related prompt-format side of this window
(schema/truncation fixes, not cost): the **2026-07-11** entry (p1→p2) is when
`max_tokens` was first raised to 12000 and the per-array item cap was
dropped; the **2026-07-12** entry (p2→p3) reinstated a 20-item cap and
cut a measured 75%→23% JSON-validation failure rate on a live run. The later
**2026-07-11 cost-control overhaul** entry records the model ladder, lower
`max_tokens`, one-request rule, `--limit` guard, and fail-closed spend
preflight added after that prompt-format work.

Root causes, factually:

- **Single hardcoded paid model, no cheap-first attempt.** Every window
  paid full `gemini-2.5-flash` price even for windows a free or near-free
  model would have handled.
- **Retry doubled the cost of every failure.** A 2-attempt retry means a
  window that fails validation twice pays for `2 × max_tokens` of wasted
  output, not `1 ×`.
- **`max_tokens: 12000` was large relative to typical output**, so a
  truncating/looping generation could run to the cap twice before giving up.
- **No startup guard against an unbounded run.** Nothing stopped the whole
  book (not just a test batch) from being re-processed when `--limit` was
  omitted by accident.

---

## 3. The fix — cost-control defaults now in place

### Request logging

Every authenticated OpenRouter request is logged at the shared client
boundary as newline-delimited JSON: chat completions, JSON-mode fallback
attempts, TTS, and embeddings. Each record includes a request ID, operation,
model, endpoint, status, latency, response size where relevant, and token/cost
usage when OpenRouter returns it. Prompts, source text, API keys, response
bodies, and audio payloads are never logged. Set `OPENROUTER_LOGS=0` only to
silence these records locally; leave it enabled for production diagnostics.

The `operation` field identifies callers such as `narrative.route_plan`,
`audio_script.generate`, `kg.book_extract.restricted`,
`kg.placeholder_triage`, and `embeddings`. This makes an unexpected Llama
call attributable instead of merely showing a model name.

| Control | Now | Where |
|---|---|---|
| `max_tokens` | **5000** | `MODEL_LADDER`/`extract()` call, `cli/extract-restricted-book.js` |
| `MAX_ITEMS_PER_ARRAY` | **10** | same file, baked into `SYSTEM_PROMPT` |
| Retry per rung | **1 attempt, no retry** — a failure escalates to the next model instead of re-paying the same model | `extract()`: "one attempt per rung, no retry within a rung, escalate ... on invalid JSON or a thrown API error" |
| Model choice | **3-rung free→paid ladder** (§4), not a single hardcoded paid model | `MODEL_LADDER` constant |
| Hidden transport retry | **Disabled for extraction** — the shared client's JSON-mode compatibility resend is not allowed on this path | `fallback_without_response_format: false` |
| Unbounded-run guard | Throws whenever `--limit` is missing, including a `--from-page`-only invocation; rejects `--limit 0`; `--confirm-full-book` is the only explicit override | `main()`, see exact message below |
| Live-price preflight | Fetches the free public OpenRouter catalog before every run; missing models, missing/invalid billing fields, or a `:free` model that gained a prompt, completion, or per-request price stop the run | `lib/openRouterCostGuard.js` |
| Hard spend ceiling | Conservative worst case must fit under **$1 per invocation** by default; override explicitly with `--max-cost-usd` or `KG_EXTRACTION_MAX_COST_USD` | `main()` |
| No-cost preview | `--preflight-only` prints pending windows and the model-by-model ceiling, then exits before any paid API request | `main()` |

The guard's exact error message:

```
Refusing to run unbounded: this would silently re-extract the entire book. Pass --limit <n> (optionally with --from-page) to bound this run, or pass --confirm-full-book to intentionally run the whole book.
```

The startup log includes pending windows, the conservative dollar ceiling,
and its model-by-model breakdown. The estimate reserves every ladder rung for
every pending window, assumes every model uses all 5000 output tokens, and
uses UTF-8 bytes as a deliberately high input-token ceiling:

```
Restricted extraction: source=<id>; <n> windows using <ladder or override>; concurrency=<n>.
Pending windows: <n>; conservative worst-case OpenRouter cost: $<amount>; hard ceiling: $1.0000.
```

For a new book, always preview a small sample first:

```bash
npm run extract:restricted:deep -- --source <slug> --limit 3 --preflight-only
npm run extract:restricted:deep -- --source <slug> --limit 3
```

Then preview the intended larger batch. If its deliberately conservative
ceiling exceeds $1, reduce `--limit`; raise `--max-cost-usd` only after
reviewing the printed estimate. A catalog outage fails closed: extraction
does not proceed using stale prices.

`--limit` must be a positive integer. In particular, `--limit 0` is rejected:
it is not an alias for a full-book run and cannot bypass the confirmation
guard. The only supported unbounded form is omitting `--limit` and supplying
`--confirm-full-book`.

---

## 4. The model ladder

Concept: try the cheapest (ideally free) model first; escalate to the next
rung **only** on failure (invalid JSON or a thrown API error); **one attempt
per rung**, never retry the same rung, never loop back to an earlier rung.
This bounds worst-case cost per window to "one call per rung, in ascending
price order," instead of "N retries at whatever price you started at."

Current shared ladder in `lib/restrictedExtractionConfig.js`, in order, with
pricing re-verified live via `node cli/check-openrouter-models.js` at doc
time:

| Rung | Model | Input $/M | Output $/M | Notes |
|---|---|---|---|---|
| 1 | `qwen/qwen3-coder:free` | $0.00 | $0.00 | Free tier, tried first |
| 2 | `deepseek/deepseek-v4-flash` | $0.077 | $0.154 | Cheapest paid rung on both dimensions; gets automatic prompt caching (§5) |
| 3 | `google/gemini-2.5-flash-lite` | $0.10 | $0.40 | Last-resort paid fallback |

`KG_RESTRICTED_EXTRACT_MODEL` env override: when set, it **replaces the
entire ladder** — the code builds a one-element ladder `[MODEL_OVERRIDE]`,
so the run becomes exactly one model, one attempt, no escalation. Use this
only when you have a specific reason to pin a model (e.g. reproducing a
result, or forcing the mid-tier model for a source you already know is
hard) — it forgoes the free-tier-first savings.

---

## 5. Prompt caching

Rung 2 (`deepseek/deepseek-v4-flash`) gets **automatic, server-side prompt
caching on OpenRouter** — no `cache_control` field or other body change is
needed, unlike Anthropic-style explicit cache breakpoints. Its live catalog
entry carries `input_cache_read: 0.0000000154` ($0.0154/M) against a fresh
`prompt` price of $0.077/M — a cached read is **~5x cheaper** than an
uncached one for this model (verified live at doc time via
`check-openrouter-models.js`'s underlying `/models` fetch; re-check before
relying on the exact ratio for a cost estimate).

Message ordering matters for this to actually fire: the extractor puts the
large, per-run-static `SYSTEM_PROMPT` as the **first** message, with the
small per-window page text as the user message after it
(`extract()` in `cli/extract-restricted-book.js`). That system prompt is the
shared prefix across every window in a run, so it's what OpenRouter's
automatic caching keys on — putting anything window-specific before it would
break the shared prefix and defeat the cache.

`google/gemini-2.5-flash-lite` (rung 3) also carries `input_cache_read`
($0.01/M vs $0.10/M fresh — 10x) in the live catalog, so the same
first-message-is-system-prompt ordering benefits that rung too if the ladder
escalates there.

---

## 6. Free vs cheap-paid landscape (July 2026 snapshot)

Live-checked via `node cli/check-openrouter-models.js` at doc time:

| Model | Tier | Input $/M | Output $/M | Context |
|---|---|---|---|---|
| `qwen/qwen3-coder:free` | free | $0.00 | $0.00 | 1,048,576 |
| `meta-llama/llama-3.3-70b-instruct:free` | free | $0.00 | $0.00 | 131,072 |
| `deepseek/deepseek-v4-flash` | cheap paid | $0.077 | $0.154 | 1,048,576 |
| `google/gemini-2.5-flash-lite` | cheap paid | $0.10 | $0.40 | 1,048,576 |
| `deepseek/deepseek-chat` | paid (spot-check) | $0.20 | $0.80 | 131,072 |
| `google/gemini-2.5-flash` (the incident model) | paid, mid-tier | $0.30 | $2.50 | 1,048,576 |

`:free`-suffixed IDs are not a permanent guarantee — pricing and the ID
catalog itself churn without notice. That's exactly what
`check-openrouter-models.js` exists to catch before it costs money.

---

## 7. The health-check tool

Run before any large extraction pass:

```bash
cd talesofbudapest-backend
npm run check:openrouter-models
```

(`node cli/check-openrouter-models.js` directly also works; accepts
`--ids <comma,separated,ids>` to override the default list.)

What it does: fetches OpenRouter's **public** `/api/v1/models` catalog
(`GET`, no auth, no cost) and checks a default list — the same three
`MODEL_LADDER` IDs plus two spot-checks (`meta-llama/llama-3.3-70b-
instruct:free`, `deepseek/deepseek-chat`) — reporting per model whether it
still exists in the catalog and, for any `:free`-suffixed ID, whether it's
still actually priced at $0.

- **WARNING** means either the ID is no longer in OpenRouter's catalog at
  all (`NOT FOUND`), or an ID that ends `:free` no longer has $0 pricing —
  i.e., a run using that ID would silently start costing money (or fail
  outright if the ID vanished).
- **Exit code:** `0` when there are no warnings, `1` when there is at least
  one warning (or the catalog fetch itself fails) — suitable for a
  pre-flight CI/cron gate.

---

## 8. Research pass (Qwen Flash triage)

`cli/research-kg-placeholders.js` (`npm run research:kg-placeholders`)
enriches auto-created "needs research" placeholder entities (people,
locations, events, organisations named only as a relation endpoint, never
their own extracted record) by sending each placeholder's bare name + kind
hint to a knowledge-assisted OpenRouter model, default
`qwen/qwen3.5-flash-02-23` (override via `KG_RESEARCH_MODEL`, or per-run
`--model`). This is triage, not live web verification: the model receives no
search tool in this call, and uncertain results must remain pending for human
verification.

- **Cost model:** Qwen3.5 Flash is a normal token-priced model (live catalog
  check recorded approximately $0.065/M input and $0.26/M output at doc time);
  re-check before a large pass because OpenRouter pricing changes.
- **Cache:** `ingest/corpus/restricted/experiments/kg-placeholder-research.cache.json`,
  keyed `${model}${name}`. A cache hit is **never** re-sent to the model —
  same "never pay twice" pattern as `cli/embed-kg.js`'s embedding cache and
  `cli/backfill-kg-alias-translations.js`'s suggestion cache.
- **Confidence-gated confirm/reject:** a result only confirms the
  placeholder (enriches metadata, `resolution_status` stays `pending`) when
  the model says `is_real_entity: true` **and** `confidence >=
  CONFIRM_CONFIDENCE_THRESHOLD` — currently **0.5** in
  `lib/kgPlaceholderResearch.js`. Anything else (not a real entity, or real
  but below 0.5 confidence) sets `resolution_status: 'rejected'`. This pass
  never approves or publishes a canonical entity either way; `--publish`/
  `--allow-restricted-public` are refused outright, same as
  `cli/resolve-kg-locations.js`.

---

## 9. Rules of thumb going forward

- Always pass `--limit` for extraction test runs — never rely on
  remembering to; the guard exists but a bounded run by habit is cheaper
  to reason about than reading an error message.
- Run `npm run check:openrouter-models` before any big paid pass.
- Prefer the free/ladder default over `KG_RESTRICTED_EXTRACT_MODEL` /
  `--model` overrides unless you have a specific reason — the ladder
  already tries cheap-to-expensive so a manual override usually just
  forgoes savings.
- Never assume a model ID's price from memory or from this doc's numbers
  past today — re-check live.
- Watch for `:free` IDs silently going paid; that's the exact failure mode
  `check-openrouter-models.js`'s WARNING output is built to catch.

---

## Cross-references

- [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md) — the extraction prompts
  and pipeline (§2 model matrix, §4 Prompt P1-R) that this ladder feeds.
- [DECISIONS.md](DECISIONS.md) — dated prompt/model-behavior changes;
  see the **2026-07-11** (p1→p2, `max_tokens` raised to 12000, cap removed)
  and **2026-07-12** (p2→p3, truncation fix, 75%→23% failure rate) entries
  for the prompt-format side of the incident window this doc's §2 covers.
