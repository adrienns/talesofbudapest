import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';
import {
  estimateExtractionCeiling,
  fetchOpenRouterCatalog,
  formatUsd,
  pricingForModels,
} from '../lib/openRouterCostGuard.js';
import { RESTRICTED_EXTRACTION_MODEL_LADDER as MODEL_LADDER } from '../lib/restrictedExtractionConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};

const SOURCE_ID = option('--source') ?? 'jewish-budapest';
const FROM_PAGE = Number(option('--from-page') ?? 100);
const PAGE_COUNT = Number(option('--pages') ?? 3);
const MAX_COST_USD = Number(option('--max-cost-usd') ?? 0.05);
const PREVIEW_ONLY = args.includes('--preflight-only');
const MODEL_OVERRIDE = process.env.KG_ATOMIC_CLAIMS_MODEL ?? null;
const MODELS = MODEL_OVERRIDE ? [MODEL_OVERRIDE] : MODEL_LADDER;
const MAX_OUTPUT_TOKENS = 3500;

const INPUT = path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`);
const OUTPUT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/experiments/atomic-claims');
const OUTPUT_STEM = `${SOURCE_ID}.pages-${FROM_PAGE}-${FROM_PAGE + PAGE_COUNT - 1}`;
const CLAIMS_OUTPUT = path.join(OUTPUT_DIR, `${OUTPUT_STEM}.claims.jsonl`);
const STRUCTURED_OUTPUT = path.join(OUTPUT_DIR, `${OUTPUT_STEM}.structured.jsonl`);

const HARVEST_PROMPT = `Return JSON only. Extract an append-only ledger of atomic source claims from the supplied book pages.

Rules:
1. Extract only facts explicitly stated in the supplied pages. Never add outside knowledge.
2. One claim must express exactly one independently supportable fact.
3. Write dry_fact_en as a short, plain English sentence. Preserve source names as written inside the sentence when practical.
4. Every claim must include the exact PDF page and one short verbatim evidence quote from that page.
5. Preserve uncertainty: use certainty "stated", "hedged", or "attributed". Do not sharpen dates or identities.
6. Include specific people, places, organisations, events, actions, dates, addresses, roles, ownership, construction, residence, education, and daily-life facts.
7. Exclude headings, image captions with no factual connection, bibliography, generic interpretation, and duplicate claims.
8. Do not resolve aliases or decide that similarly named people or places are identical.
9. Return at most 40 high-information claims.

Return exactly:
{"language":"en|hu|de","claims":[{"dry_fact_en":"...","page":100,"evidence_quote":"...","certainty":"stated|hedged|attributed"}]}`;

const STRUCTURE_PROMPT = `Return JSON only. Convert the supplied atomic claim ledger into typed source claims.

You will receive claims, not book pages. Do not add, merge, split, correct, enrich, or omit claims. Preserve every claim_id exactly once.

For each claim return:
- claim_id
- subject_name: source-facing name or phrase
- subject_kind: person|location|organisation|event|group|work|other
- predicate: concise snake_case relation or property
- object_name: source-facing name, value, or phrase; null only for a genuinely unary claim
- object_kind: person|location|organisation|event|group|work|date|number|text|other|null
- time: date/range exactly as represented in the dry fact, otherwise null
- place_name: explicit location context when present, otherwise null

Return exactly {"structured_claims":[{...}]}.`;

const pagesFromText = (text) => Array.from(
  text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g),
).map((match) => ({ page: Number(match[1]), text: match[2].trim() })).filter((page) => page.text);

const requestJson = async ({ operation, systemPrompt, userPrompt, validate }) => {
  for (const model of MODELS) {
    try {
      const completion = await createChatCompletion({
        operation,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        fallback_without_response_format: false,
      });
      const payload = JSON.parse(completion.choices?.[0]?.message?.content);
      if (validate(payload)) {
        return { payload, model: completion.model ?? model, usage: completion.usage ?? null };
      }
    } catch {
      // One request per rung. A failed rung may fall through, but is never retried.
    }
  }
  throw new Error(`${operation} failed on every configured model`);
};

const claimId = (claim) => `claim_${crypto.createHash('sha256')
  .update(`${SOURCE_ID}\n${claim.page}\n${claim.dry_fact_en}\n${claim.evidence_quote}`)
  .digest('hex').slice(0, 20)}`;

const main = async () => {
  if (!Number.isInteger(FROM_PAGE) || FROM_PAGE < 1 || !Number.isInteger(PAGE_COUNT) || PAGE_COUNT < 1 || PAGE_COUNT > 5) {
    throw new Error('--from-page must be positive and --pages must be between 1 and 5');
  }
  if (!Number.isFinite(MAX_COST_USD) || MAX_COST_USD <= 0) throw new Error('--max-cost-usd must be positive');

  const selected = pagesFromText(await fs.readFile(INPUT, 'utf8'))
    .filter(({ page }) => page >= FROM_PAGE && page < FROM_PAGE + PAGE_COUNT);
  if (selected.length !== PAGE_COUNT) throw new Error(`Expected ${PAGE_COUNT} pages starting at ${FROM_PAGE}, found ${selected.length}`);

  const pageText = selected.map(({ page, text }) => `--- PDF PAGE ${page} ---\n${text}`).join('\n\n');
  const harvestRequest = `${HARVEST_PROMPT}\n\n${pageText}`;
  // Reserve a deliberately large stage-two input so the preflight covers the unknown first-pass output.
  const structureRequest = `${STRUCTURE_PROMPT}\n\n${'x'.repeat(16_000)}`;
  const pricing = pricingForModels(MODELS, await fetchOpenRouterCatalog());
  const ceiling = estimateExtractionCeiling({
    requests: [harvestRequest, structureRequest],
    modelPricing: pricing,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  console.log(`Atomic-claim experiment: ${SOURCE_ID}, PDF pages ${FROM_PAGE}-${FROM_PAGE + PAGE_COUNT - 1}`);
  console.log(`Models: ${MODELS.join(' -> ')}`);
  console.log(`Conservative two-pass ceiling: ${formatUsd(ceiling.usd)}; hard limit: ${formatUsd(MAX_COST_USD)}`);
  if (ceiling.usd > MAX_COST_USD) throw new Error(`Refusing experiment: ${formatUsd(ceiling.usd)} exceeds ${formatUsd(MAX_COST_USD)}`);
  if (PREVIEW_ONLY) {
    console.log('Preflight only: no extraction requests were made.');
    return;
  }
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required');

  const harvested = await requestJson({
    operation: 'kg.atomic_claims.harvest',
    systemPrompt: HARVEST_PROMPT,
    userPrompt: `PDF PAGES: ${selected.map(({ page }) => page).join(', ')}\n\n${pageText}`,
    validate: (payload) => payload && Array.isArray(payload.claims)
      && payload.claims.every((claim) => typeof claim.dry_fact_en === 'string'
        && Number.isInteger(claim.page)
        && typeof claim.evidence_quote === 'string'
        && ['stated', 'hedged', 'attributed'].includes(claim.certainty)),
  });

  const ledger = harvested.payload.claims.map((claim) => ({
    claim_id: claimId(claim),
    source_id: SOURCE_ID,
    dry_fact_en: claim.dry_fact_en,
    certainty: claim.certainty,
    evidence: { pdf_page: claim.page, quote: claim.evidence_quote },
  }));

  const ids = new Set(ledger.map(({ claim_id }) => claim_id));
  const structured = await requestJson({
    operation: 'kg.atomic_claims.structure',
    systemPrompt: STRUCTURE_PROMPT,
    userPrompt: JSON.stringify({ claims: ledger }),
    validate: (payload) => payload && Array.isArray(payload.structured_claims)
      && payload.structured_claims.length === ledger.length
      && payload.structured_claims.every((claim) => ids.has(claim.claim_id))
      && new Set(payload.structured_claims.map((claim) => claim.claim_id)).size === ledger.length,
  });

  const structureById = new Map(structured.payload.structured_claims.map((claim) => [claim.claim_id, claim]));
  const projected = ledger.map((claim) => ({ ...claim, structure: structureById.get(claim.claim_id) }));
  const metadata = {
    experiment_version: 'atomic-claims-v1',
    harvested_with: harvested.model,
    structured_with: structured.model,
    extracted_at: new Date().toISOString(),
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(CLAIMS_OUTPUT, `${ledger.map((claim) => JSON.stringify({ ...metadata, ...claim })).join('\n')}\n`, 'utf8');
  await fs.writeFile(STRUCTURED_OUTPUT, `${projected.map((claim) => JSON.stringify({ ...metadata, ...claim })).join('\n')}\n`, 'utf8');

  console.log(`Harvested ${ledger.length} atomic claims.`);
  console.log(`Claim ledger: ${CLAIMS_OUTPUT}`);
  console.log(`Structured projection: ${STRUCTURED_OUTPUT}`);
  console.log(`Usage: harvest=${harvested.usage?.total_tokens ?? 'unknown'} tokens; structure=${structured.usage?.total_tokens ?? 'unknown'} tokens`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
