import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';
import { estimateExtractionCeiling, fetchOpenRouterCatalog, formatUsd, pricingForModels, validateExtractionLimit } from '../lib/openRouterCostGuard.js';
import {
  RESTRICTED_EXTRACTION_DEFAULT_MAX_COST_USD as DEFAULT_MAX_COST_USD,
  RESTRICTED_EXTRACTION_MAX_ITEMS_PER_ARRAY as MAX_ITEMS_PER_ARRAY,
  RESTRICTED_EXTRACTION_MAX_OUTPUT_TOKENS as MAX_OUTPUT_TOKENS,
  RESTRICTED_EXTRACTION_MODEL_LADDER as MODEL_LADDER,
  RESTRICTED_EXTRACTION_PAGES_PER_WINDOW as PAGES_PER_WINDOW,
  RESTRICTED_EXTRACTION_PROMPT_VERSION as PROMPT_VERSION,
  RESTRICTED_EXTRACTION_QUOTE_MAX_CHARS as QUOTE_MAX_CHARS,
  RESTRICTED_EXTRACTION_QUOTE_MIN_CHARS as QUOTE_MIN_CHARS,
} from '../lib/restrictedExtractionConfig.js';
import { filterPayloadEvidenceQuotes } from '../lib/restrictedEvidenceQuotes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};

const SOURCE_ID = option('--source') ?? 'jewish-budapest';
const INPUT = path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`);
const OUTPUT = path.resolve(option('--output') ?? path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.entities.jsonl`));
const FAILURE_OUTPUT = path.resolve(option('--failure-output') ?? path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.failures.jsonl`));
const MODEL_OVERRIDE = process.env.KG_RESTRICTED_EXTRACT_MODEL ?? null;
// Cheapest-model-that-passes-the-gate ladder (docs/EXTRACTION_PIPELINE.md §2, T3): try a free,
// JSON-strong model first, then the cheapest verified paid model, escalating further only as
// each rung fails.
// Rung 2 (deepseek/deepseek-v4-flash) was verified live against OpenRouter's public /models
// catalog (see cli/check-openrouter-models.js) on 2026-07-11: id exists, pricing.prompt =
// 0.000000077 ($0.077/M input), pricing.completion = 0.000000154 ($0.154/M output) — cheaper
// per-token than gemini-2.5-flash-lite ($0.10/M input, $0.40/M output) on both dimensions, and
// our real extraction runs are output-heavy (~995K output vs ~421K input tokens per run per the
// JSONL usage data), so DeepSeek's cheaper output pricing dominates the savings. Its catalog
// entry also lists pricing.input_cache_read = 0.0000000154 ($0.0154/M, ~5x cheaper than a fresh
// read), and OpenRouter's prompt-caching docs state caching for DeepSeek models is automatic
// server-side — no cache_control param needed (unlike Anthropic-style explicit cache
// breakpoints). That makes it a real win here since our SYSTEM_PROMPT is large, static across
// every window in a run, and is already the first message below, so it forms the shared
// cacheable prefix DeepSeek discounts automatically. Rung 3 (gemini-2.5-flash-lite) is kept as
// the last-resort paid fallback if DeepSeek's rung fails. Re-run cli/check-openrouter-models.js
// before trusting these numbers again — free-tier ids and pricing churn on OpenRouter without
// notice.
const SYSTEM_PROMPT = `Return JSON only. You are a meticulous historical data extractor building a private, source-attributed knowledge graph from a book about Budapest (Hungarian, German, or English source text).

HARD RULES — violating any of these makes the output worthless:
1. Extract only what the supplied pages explicitly state. Do not add outside knowledge or "complete" partial information.
2. Empty arrays are a correct and common answer — a page with no extractable stories returns empty arrays.
3. Keep each array to at most ${MAX_ITEMS_PER_ARRAY} items, prioritising the highest-value ones. This keeps the JSON short enough to always finish — a truncated response is a total loss.
4. Every item needs an "evidence" object holding a single "quote": one short supporting sentence (${QUOTE_MIN_CHARS}–${QUOTE_MAX_CHARS} characters) copied verbatim from the single supplied page as a contiguous substring in its original language. Do not span page breaks. Prefer a complete sentence; trim only trailing clause noise. Do not translate the quote.
5. Never sharpen vague dates. If the text says "around 1900" or gives a range, record it exactly as such in when/year_approx — never invent an exact date.
6. People: source_name is the name exactly as written in the text. If only a surname appears, still record it but set partial_name: true — never invent or complete a full name from a surname alone. name_en is the natural English gloss of the name where one exists, otherwise repeat source_name.
7. Locations/addresses: source_name and address_source are the name/address AS WRITTEN in the text (historical street names count — never modernize them). name_en and address_en are the English gloss/translation; note a modern name only if the text itself states it.
8. facts.confidence: 1.0 = the text states it plainly; 0.7 = stated but with ambiguous phrasing or uncertain attribution; 0.5 = the text itself hedges ("allegedly", "it is said"). Never rate confidence above the text's own certainty.
9. facts.interestingness (1-5): 5 = a tourist would stop walking and gasp (crime, scandal, tragedy, love, ghost story, a famous person doing something surprising); 4 = a tour guide's best anecdote; 3 = solid color (what a shop sold, who held balls here, daily life detail); 2 = specialist interest (architectural detail, ownership change); 1 = dry registry data.
10. Exclude bibliographies, indexes, image credits, and generic background unless it states a specific Budapest-related person/place/event connection. Respond with JSON only — no commentary, no markdown fences.

Return exactly {language:"hu|de|en",locations:[{name_en,source_name,address_en,address_source,kind,evidence}],people:[{name_en,source_name,partial_name,role_en,years_hint,evidence}],events:[{title_en,statement_en,when,type,importance,evidence}],facts:[{location_source_name,text_en,year,year_approx,category,interestingness,confidence,evidence}],relations:[{subject_en,subject_kind,predicate,object_en,object_kind,statement_en,importance,evidence}]}. Every evidence is {quote}. type must be crime|celebration|construction|war|scandal|daily_life|disaster|religious|other. category must be architecture|resident|crime|anecdote|commerce|culture|politics|religion. subject_kind and object_kind must be location, person, event, organisation, or unknown. Use exact predicates such as lived_in, founded, built, owned, designed, commemorated_by, deported_from, sheltered_in, operated_at, or documented_in; omit unclear links.`;

const pagesFromText = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ page: Number(match[1]), text: match[2].trim() }))
  .filter((page) => page.text);

const windowsFromPages = (pages, pagesPerWindow = PAGES_PER_WINDOW) => {
  const size = Math.max(1, Number(pagesPerWindow) || 1);
  const windows = [];
  for (let index = 0; index < pages.length; index += size) {
    const group = pages.slice(index, index + size);
    windows.push({
      pages: group.map((page) => page.page),
      text: group.map((page) => `--- PDF PAGE ${page.page} ---\n${page.text}`).join('\n\n'),
      pageText: group.map((page) => page.text).join('\n\n'),
    });
  }
  return windows;
};

const existingIds = async () => {
  try {
    return new Set((await fs.readFile(OUTPUT, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line).window_id));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
};

const valid = (payload) => payload && ['locations', 'people', 'events', 'facts', 'relations'].every((key) => Array.isArray(payload[key]));

const extract = async (window) => {
  // With no explicit override, walk the free -> paid ladder: one attempt per rung, no retry within
  // a rung, escalate to the next rung on invalid JSON or a thrown API error (e.g. free-tier
  // rate-limit/unavailable). With an explicit override, behavior is unchanged: exactly one model,
  // one attempt.
  const ladder = MODEL_OVERRIDE ? [MODEL_OVERRIDE] : MODEL_LADDER;
  for (let rung = 0; rung < ladder.length; rung += 1) {
    const rungModel = ladder[rung];
    try {
      // system message stays first for every rung, including the deepseek rung: that's what lets
      // OpenRouter's automatic DeepSeek prompt caching (see MODEL_LADDER comment above) discount
      // repeat reads of this large, per-run-static SYSTEM_PROMPT as the shared cached prefix. No
      // cache_control or other extra body field is needed — caching is automatic for this id.
      const completion = await createChatCompletion({
        operation: 'kg.book_extract.restricted',
        model: rungModel,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `PDF PAGES: ${window.pages.join(', ')}\n\n${window.text}` }],
        response_format: { type: 'json_object' }, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0,
        // The shared client normally retries without JSON mode for compatibility. Extraction must
        // never do that: one rung means one billable HTTP request, then escalation.
        fallback_without_response_format: false,
      });
      const rawPayload = JSON.parse(completion.choices?.[0]?.message?.content);
      if (!valid(rawPayload)) continue;
      const { payload, dropped } = filterPayloadEvidenceQuotes(rawPayload, window.pageText ?? window.text);
      return {
        payload,
        model: completion.model ?? rungModel,
        usage: completion.usage ?? null,
        attempts: rung + 1,
        quote_gate: { dropped: dropped.length, reasons: dropped },
      };
    } catch {
      // Invalid payloads / thrown API errors are never staged; move to the next rung (if any) with
      // no retry of this rung — a truncated/invalid response wastes no further tokens on itself.
    }
  }
  throw new Error(`Model returned invalid JSON for pages ${window.pages.join(', ')}`);
};

const main = async () => {
  const limitRaw = option('--limit');
  const fromPageRaw = option('--from-page');
  const toPageRaw = option('--to-page');
  const confirmFullBook = args.includes('--confirm-full-book');
  const preflightOnly = args.includes('--preflight-only');
  const limit = validateExtractionLimit({ limitRaw, confirmFullBook });
  const fromPage = Number(fromPageRaw ?? 1);
  const toPage = toPageRaw == null ? null : Number(toPageRaw);
  const concurrency = Number(option('--concurrency') ?? 4);
  const maxCostUsd = Number(option('--max-cost-usd') ?? process.env.KG_EXTRACTION_MAX_COST_USD ?? DEFAULT_MAX_COST_USD);
  if (!Number.isInteger(fromPage) || fromPage < 1 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new Error('Invalid --from-page, --concurrency, or --max-cost-usd');
  if (toPage != null && (!Number.isInteger(toPage) || toPage < fromPage)) throw new Error('Invalid --to-page');
  // Incident: a real run of `--from-page 1` with no `--limit` re-extracted ~600 pages and cost
  // $8-10 instead of ~$1-2. `--from-page` only narrows the starting point; `limit === 0` (i.e.
  // `--limit` omitted) is what actually removes the cap — see `selected` below. So the guard must
  // trip whenever `--limit` itself is missing, regardless of whether `--from-page` was also given
  // (a from-page-only invocation is exactly the shape that caused the incident, not just a fully
  // bare one). `--confirm-full-book` remains the explicit, intentional opt-out.
  const pages = pagesFromText(await fs.readFile(INPUT, 'utf8'))
    .filter((page) => page.page >= fromPage && (toPage == null || page.page <= toPage));
  const windows = windowsFromPages(pages, PAGES_PER_WINDOW);
  const selected = limit === 0 ? windows : windows.slice(0, limit);
  const done = await existingIds();
  const pending = selected.filter((window) => !done.has(crypto.createHash('sha256').update(window.text).digest('hex')));
  const ladder = MODEL_OVERRIDE ? [MODEL_OVERRIDE] : MODEL_LADDER;
  const requests = pending.map((window) => `${SYSTEM_PROMPT}\nPDF PAGES: ${window.pages.join(', ')}\n\n${window.text}`);
  const pricing = pricingForModels(ladder, await fetchOpenRouterCatalog());
  const ceiling = estimateExtractionCeiling({ requests, modelPricing: pricing, maxOutputTokens: MAX_OUTPUT_TOKENS });
  const modelDescription = MODEL_OVERRIDE ? MODEL_OVERRIDE : `ladder [${MODEL_LADDER.join(' -> ')}]`;
  console.log(`Restricted extraction: source=${SOURCE_ID}; prompt=${PROMPT_VERSION}; pages_per_window=${PAGES_PER_WINDOW}; ${selected.length} windows using ${modelDescription}; concurrency=${concurrency}.`);
  console.log(`output=${OUTPUT}`);
  console.log(`Pending windows: ${pending.length}; conservative worst-case OpenRouter cost: ${formatUsd(ceiling.usd)}; hard ceiling: ${formatUsd(maxCostUsd)}.`);
  for (const model of ceiling.byModel) console.log(`  ${model.modelId}: up to ${formatUsd(model.usd)}`);
  if (ceiling.usd > maxCostUsd) {
    throw new Error(`Refusing extraction: conservative cost ceiling ${formatUsd(ceiling.usd)} exceeds --max-cost-usd ${formatUsd(maxCostUsd)}. Use a smaller --limit or explicitly raise the ceiling.`);
  }
  if (preflightOnly) {
    console.log('Preflight only: no paid API requests were made.');
    return;
  }
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required');
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  let completed = 0;
  let failures = 0;
  let quotesDropped = 0;
  const processWindow = async (window) => {
    const windowId = crypto.createHash('sha256').update(window.text).digest('hex');
    try {
      const result = await extract(window);
      quotesDropped += result.quote_gate?.dropped ?? 0;
      await fs.appendFile(OUTPUT, `${JSON.stringify({ window_id: windowId, source: SOURCE_ID, pdf_pages: window.pages, prompt_version: PROMPT_VERSION, extracted_at: new Date().toISOString(), ...result })}\n`, 'utf8');
      completed += 1;
      console.log(`pages ${window.pages.join('-')}: places=${result.payload.locations.length} people=${result.payload.people.length} events=${result.payload.events.length} facts=${result.payload.facts.length} quote_dropped=${result.quote_gate?.dropped ?? 0}`);
    } catch (error) {
      failures += 1;
      await fs.appendFile(FAILURE_OUTPUT, `${JSON.stringify({ pdf_pages: window.pages, error: error instanceof Error ? error.message : String(error), failed_at: new Date().toISOString() })}\n`, 'utf8');
      console.error(`pages ${window.pages.join('-')}: failed; recorded for retry.`);
    }
  };
  for (let index = 0; index < pending.length; index += concurrency) {
    await Promise.all(pending.slice(index, index + concurrency).map(processWindow));
  }
  console.log(`Completed ${completed}; failed ${failures}; skipped ${selected.length - pending.length}; quotes_dropped=${quotesDropped}.`);
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
