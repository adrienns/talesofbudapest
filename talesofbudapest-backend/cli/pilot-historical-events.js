import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? null;
};

const sourceId = option('--source', 'jewish-budapest');
const fromPage = Number(option('--from-page', '118'));
const pageCount = Number(option('--page-count', '3'));
const extractorModel = option('--model', process.env.KG_EVENT_EXTRACT_MODEL ?? 'google/gemini-2.5-flash-lite');
const verifierModel = option('--verifier-model', process.env.KG_EVENT_VERIFY_MODEL ?? extractorModel);
const input = path.join(__dirname, `../../ingest/corpus/restricted/text/${sourceId}.pages.txt`);
const output = path.join(__dirname, `../../ingest/corpus/restricted/extractions/${sourceId}.historical-events-pilot.jsonl`);

const EXTRACTOR_PROMPT = `Return JSON only. Extract a small number of explicit, historically meaningful event claims from supplied book pages. This is private research data.

Return exactly {claims:[{claim_text,event_type,participants:[{mention,type,role}],time_text,evidence:{page,quote}}]}.

Rules:
- Extract only events explicitly asserted by supplied text. Empty claims is valid.
- event_type must be one of construction, alteration, ownership_change, business_operation, residence, birth_death, appointment, organisation_change, publication, migration, law_or_prohibition, persecution_or_rescue, commemoration, other.
- participants need exact names/phrases from evidence and a role in event. type is person, family, organisation, place, building, business, work, group, or unknown.
- time_text must be copied from source or null. Never sharpen dates.
- Each evidence.quote must be one exact, contiguous substring from one supplied page. Keep it under 320 characters. Do not normalize spelling, whitespace, hyphenation, punctuation, or OCR errors.
- Each evidence.page must be its PDF page number.
- Do not extract generic background, bibliography, image credits, or inferred relations.`;

const VERIFIER_PROMPT = `Return JSON only. Judge whether each historical-event candidate is supported by its exact evidence quote.

Return exactly {verdicts:[{index,verdict,reason}]} where verdict is supported, partially_supported, unsupported, ambiguous, or contradicted_by_evidence.

Rules:
- Mark supported only if quote explicitly asserts event, roles, and stated time.
- Mark partially_supported if core event is present but a role, qualifier, or identity is stronger than quote.
- Do not use outside knowledge. Do not repair OCR or infer missing context.
- reason is one short sentence.`;

const parsePages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ page: Number(match[1]), text: match[2].trim() }))
  .filter((page) => page.text);

const exactSpan = (page, quote) => {
  if (typeof quote !== 'string' || !quote || quote.length > 320) return null;
  const start = page.text.indexOf(quote);
  if (start === -1 || page.text.indexOf(quote, start + 1) !== -1) return null;
  return { page_ref: page.page, start_offset: start, end_offset: start + quote.length, quote };
};

const normalizeClaim = (claim, pages) => {
  if (!claim || typeof claim !== 'object' || !Array.isArray(claim.participants)) return null;
  const page = pages.find((candidate) => candidate.page === Number(claim.evidence?.page));
  const evidence = page ? exactSpan(page, claim.evidence?.quote) : null;
  if (!evidence || typeof claim.claim_text !== 'string' || !claim.claim_text.trim()) return null;
  const participants = claim.participants
    .filter((participant) => participant && typeof participant.mention === 'string' && participant.mention.trim())
    .map((participant) => ({ mention: participant.mention.trim(), type: participant.type ?? 'unknown', role: participant.role ?? 'unknown' }));
  if (!participants.length || typeof claim.event_type !== 'string') return null;
  return {
    claim_text: claim.claim_text.trim(), event_type: claim.event_type,
    participants, time_text: typeof claim.time_text === 'string' ? claim.time_text : null, evidence,
  };
};

const extractClaims = async (pages) => {
  const text = pages.map((page) => `--- PDF PAGE ${page.page} ---\n${page.text}`).join('\n\n');
  const completion = await createChatCompletion({
    operation: 'kg.historical_event_pilot.extract', model: extractorModel,
    messages: [{ role: 'system', content: EXTRACTOR_PROMPT }, { role: 'user', content: text }],
    response_format: { type: 'json_object' }, max_tokens: 2_500, temperature: 0, fallback_without_response_format: false,
  });
  const payload = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
  if (!Array.isArray(payload.claims)) throw new Error('Extractor returned no claims array');
  return { claims: payload.claims.map((claim) => normalizeClaim(claim, pages)).filter(Boolean), usage: completion.usage ?? null, model: completion.model ?? extractorModel };
};

const verifyClaims = async (claims) => {
  const candidates = claims.map((claim, index) => ({ index, claim_text: claim.claim_text, event_type: claim.event_type, participants: claim.participants, time_text: claim.time_text, evidence: claim.evidence }));
  const completion = await createChatCompletion({
    operation: 'kg.historical_event_pilot.verify', model: verifierModel,
    messages: [{ role: 'system', content: VERIFIER_PROMPT }, { role: 'user', content: JSON.stringify({ candidates }) }],
    response_format: { type: 'json_object' }, max_tokens: 1_500, temperature: 0, fallback_without_response_format: false,
  });
  const payload = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
  if (!Array.isArray(payload.verdicts)) throw new Error('Verifier returned no verdicts array');
  const verdicts = new Map(payload.verdicts.filter((verdict) => Number.isInteger(verdict?.index)).map((verdict) => [verdict.index, { verdict: verdict.verdict, reason: verdict.reason ?? null }]));
  return { claims: claims.map((claim, index) => ({ ...claim, verification: verdicts.get(index) ?? { verdict: 'ambiguous', reason: 'Missing verifier verdict.' } })), usage: completion.usage ?? null, model: completion.model ?? verifierModel };
};

const main = async () => {
  if (!Number.isInteger(fromPage) || fromPage < 1 || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 3) {
    throw new Error('--from-page must be positive; --page-count must be 1–3 for this pilot');
  }
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required. Add it to talesofbudapest-backend/.env before sending private book pages to OpenRouter.');
  const allPages = parsePages(await fs.readFile(input, 'utf8'));
  const pages = allPages.filter((page) => page.page >= fromPage).slice(0, pageCount);
  if (pages.length !== pageCount) throw new Error(`Only found ${pages.length} requested pages in ${input}`);

  console.log(`Private event pilot: ${sourceId}, pages ${pages.map((page) => page.page).join('-')}. No database writes.`);
  const extracted = await extractClaims(pages);
  const verified = await verifyClaims(extracted.claims);
  const record = {
    source_id: sourceId, pdf_pages: pages.map((page) => page.page), source_text_sha256: crypto.createHash('sha256').update(pages.map((page) => page.text).join('\n\n')).digest('hex'),
    extracted_at: new Date().toISOString(), extractor: { model: extracted.model, usage: extracted.usage }, verifier: { model: verified.model, usage: verified.usage }, claims: verified.claims,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.appendFile(output, `${JSON.stringify(record)}\n`, 'utf8');
  const supported = verified.claims.filter((claim) => claim.verification.verdict === 'supported').length;
  console.log(`Saved ${verified.claims.length} claims (${supported} supported) to private pilot output.`);
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
