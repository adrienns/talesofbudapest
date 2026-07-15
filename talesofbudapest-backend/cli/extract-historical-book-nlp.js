import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';
import { estimateExtractionCeiling, fetchOpenRouterCatalog, formatUsd, pricingForModels } from '../lib/openRouterCostGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? null;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const FROM_PAGE = Number(option('--from-page', '46'));
const PAGE_COUNT = Number(option('--page-count', '3'));
const EXTRACTOR_MODEL = option('--model', process.env.KG_EVENT_EXTRACT_MODEL ?? 'google/gemini-2.5-flash-lite');
const QUALITY_MODEL = option('--quality-model', process.env.KG_EVENT_QUALITY_MODEL ?? 'google/gemini-2.5-flash');
const VERIFIER_MODEL = option('--verifier-model', process.env.KG_EVENT_VERIFY_MODEL ?? 'qwen/qwen3-30b-a3b-instruct-2507');
const NLP_MODEL = option('--nlp-model', process.env.KG_NLP_MODEL ?? 'fastino/gliner2-multi-v1');
const NLP_THRESHOLD = Number(option('--nlp-threshold', process.env.KG_NLP_THRESHOLD ?? '0.50'));
const NLP_PYTHON = option('--nlp-python', process.env.KG_NLP_PYTHON ?? path.join(__dirname, '../.venv-historical-nlp/bin/python'));
const MAX_COST_USD = Number(option('--max-cost-usd', process.env.KG_EVENT_MAX_COST_USD ?? '0.005'));
const MENTIONS_ONLY = args.includes('--mentions-only');
const CANDIDATES_ONLY = args.includes('--candidates-only');
const PREFLIGHT_ONLY = args.includes('--preflight-only');
const ALLOW_PAID = args.includes('--allow-paid');
const QUALITY_PASS = args.includes('--quality-pass');
const REVALIDATE_ONLY = args.includes('--revalidate-only');
const INPUT = path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`);
const MENTION_OUTPUT = path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.mentions.jsonl`);
const CANDIDATE_OUTPUT = path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.candidate-spans.jsonl`);
const CLAIM_OUTPUT = path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.claim-candidates.jsonl`);
const EVENT_OUTPUT = path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-events.jsonl`);
const MAX_CANDIDATE_SPANS = 30;
const EXTRACTOR_BATCH_SIZE = 4;
const MAX_SPAN_CHARS = 1100;

const EVENT_SCHEMAS = {
  construction: ['architect', 'commissioner', 'building', 'start', 'completion'],
  alteration_or_demolition: ['actor', 'building', 'alteration_type', 'date'],
  ownership_or_tenancy_change: ['previous_holder', 'new_holder', 'property', 'date'],
  business_operation: ['operator', 'business', 'premises', 'start', 'end'],
  residence: ['resident', 'residence', 'start', 'end'],
  birth_or_death: ['person', 'place', 'date'],
  appointment_or_employment: ['person', 'organisation', 'role', 'start', 'end'],
  invitation_or_acceptance: ['invitee', 'inviter', 'destination', 'role', 'date'],
  organisation_founding_or_dissolution: ['founder', 'organisation', 'place', 'date'],
  publication_or_creation: ['creator', 'work', 'publisher', 'date'],
  migration_or_journey: ['participant', 'origin', 'destination', 'date'],
  law_prohibition_or_permission: ['authority', 'affected_group', 'action', 'date'],
  attack_persecution_or_rescue: ['actor', 'affected_entity', 'place', 'date'],
  commemoration: ['commemorated_entity', 'actor', 'place_or_work', 'date'],
  religious_conversion_or_affiliation: ['person_or_group', 'movement_or_faith', 'action', 'place', 'date'],
  religious_practice_or_transgression: ['participant', 'attributor', 'movement_or_faith', 'practice', 'place', 'date'],
  disaster_or_rescue: ['disaster', 'rescuer', 'affected_entity', 'place', 'date'],
  civic_decision_or_legislation: ['authority', 'decision', 'affected_group', 'place', 'date'],
  performance_or_exhibition: ['creator_or_performer', 'work', 'place', 'date'],
};

const EVENT_REQUIREMENTS = {
  construction: [['person', 'organisation'], ['building', 'work']],
  alteration_or_demolition: [['building', 'place']],
  ownership_or_tenancy_change: [['person', 'family', 'organisation', 'business'], ['building', 'business', 'place', 'work']],
  business_operation: [['person', 'family', 'organisation', 'business'], ['business', 'building', 'place']],
  residence: [['person', 'family'], ['place', 'building']],
  birth_or_death: [['person']],
  appointment_or_employment: [['person'], ['organisation', 'business']],
  invitation_or_acceptance: [['person'], ['place', 'organisation']],
  organisation_founding_or_dissolution: [['organisation']],
  publication_or_creation: [['work']],
  migration_or_journey: [['person', 'family', 'group'], ['place', 'date']],
  law_prohibition_or_permission: [['organisation', 'group'], ['person', 'family', 'group', 'place']],
  attack_persecution_or_rescue: [['person', 'family', 'group', 'organisation'], ['person', 'family', 'group', 'place']],
  commemoration: [['person', 'family', 'group', 'organisation'], ['place', 'building', 'work']],
  religious_conversion_or_affiliation: [['person', 'family', 'group'], ['person', 'movement', 'group', 'organisation']],
  religious_practice_or_transgression: [['person', 'family', 'group']],
  disaster_or_rescue: [['person', 'family', 'group', 'organisation'], ['place', 'date', 'event']],
  civic_decision_or_legislation: [['organisation', 'group'], ['group', 'place', 'date']],
  performance_or_exhibition: [['person', 'organisation'], ['work', 'place', 'date']],
};

const EXTRACTOR_PROMPT = `Return JSON only. Build grounded historical event candidates from immutable book pages and a LOCAL_NLP_MENTIONS list.

Return exactly {"claims":[{"claim_text":"","event_type":"","span_id":"","participants":[{"mention_id":"","role":""}],"time_text":null,"negated":false,"uncertain":false}]}.

Rules:
- Extract only events explicitly asserted by each candidate's focus_text. Use context_text only to resolve names, pronouns, roles, and dates. {"claims":[]} and NONE are correct outcomes.
- Return at most 8 claims, prioritising the clearest historically meaningful events. Extract separate events separately even when one span contains several. Keep claim_text under 180 characters and each claim to at most 4 participants.
- span_id must be copied exactly from CANDIDATE_SPANS. event_type must be allowed by that same span.
- Every participant must use a mention_id present in that span. Never generate, complete, merge, or retype a participant.
- Every participant role must exactly match one of event_roles[event_type] supplied on that span.
- Evidence is attached deterministically from span_id after your response. Do not copy or rewrite evidence.
- time_text must be copied exactly from the chosen span or null. Never sharpen a date.
- Preserve negation and uncertainty. Do not turn plans, prohibitions, allegations, or beliefs into completed facts.
- Do not use outside knowledge, generic background, bibliography, captions, or mere co-occurrence.`;

const VERIFIER_PROMPT = `Return JSON only. Independently judge grounded historical event candidates against their exact source evidence.
Return exactly {"verdicts":[{"index":0,"verdict":"supported","reason":""}]}, with verdict supported, partially_supported, unsupported, ambiguous, or contradicted_by_evidence.
Supported requires that the quote explicitly asserts the event, that event_type describes its real semantic meaning, and that participant roles, time, negation, attribution, and uncertainty are correct. Matching words alone is insufficient. Reject idioms: "lived through difficult days" is not residence. Sending charity or correspondence somewhere is not migration. Joining a religious movement is affiliation, not migration. An invitation is not employment unless a role is actually accepted. Reject an event whose required role is absent or semantically wrong. Use no outside knowledge. Keep each reason under 100 characters.`;

const parsePages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ page: Number(match[1]), text: match[2].trim() }))
  .filter((page) => page.text);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const appendJsonl = async (output, value) => {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.appendFile(output, `${JSON.stringify(value)}\n`, 'utf8');
};

const runLocalNlp = (pages) => new Promise((resolve, reject) => {
  const script = path.join(__dirname, '../nlp/gliner2_mentions.py');
  const child = spawn(NLP_PYTHON, [script, '--model', NLP_MODEL, '--threshold', String(NLP_THRESHOLD)], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
  child.on('error', (error) => reject(new Error(`Could not start local NLP at ${NLP_PYTHON}: ${error.message}. Run npm run setup:historical:nlp.`)));
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`Local NLP failed (${code}): ${stderr.trim() || 'no diagnostic'}`));
    try {
      const jsonLine = stdout.trim().split('\n').filter(Boolean).at(-1);
      resolve(JSON.parse(jsonLine));
    } catch (error) {
      reject(new Error(`Local NLP returned invalid JSON: ${error.message}`));
    }
  });
  child.stdin.end(JSON.stringify({ pages }));
});

const eligibleSchemas = (mentions) => {
  const types = new Set(mentions.map((mention) => mention.type));
  const has = (...candidates) => candidates.some((candidate) => types.has(candidate));
  const eligible = [];
  if (has('person', 'organisation') && has('building', 'place', 'work')) eligible.push('construction');
  if (has('person', 'organisation') && has('building', 'place')) eligible.push('alteration_or_demolition');
  if (has('person', 'family', 'organisation') && has('building', 'business', 'place', 'work')) eligible.push('ownership_or_tenancy_change');
  if (has('person', 'family', 'organisation', 'business') && has('business', 'building', 'place')) eligible.push('business_operation');
  if (has('person', 'family') && has('place', 'building')) eligible.push('residence');
  if (has('person')) eligible.push('birth_or_death');
  if (has('person') && has('organisation', 'business')) eligible.push('appointment_or_employment');
  if (has('person') && has('place', 'organisation')) eligible.push('invitation_or_acceptance');
  if (has('organisation') && has('person', 'family', 'place')) eligible.push('organisation_founding_or_dissolution');
  if (has('work') && has('person', 'organisation')) eligible.push('publication_or_creation');
  if (has('person', 'family', 'group') && has('place')) eligible.push('migration_or_journey');
  if (has('organisation', 'group') && has('person', 'family', 'group', 'place')) eligible.push('law_prohibition_or_permission');
  if (has('person', 'family', 'group', 'organisation') && has('person', 'family', 'group', 'place')) eligible.push('attack_persecution_or_rescue');
  if (has('person', 'family', 'group', 'organisation') && has('place', 'building', 'work')) eligible.push('commemoration');
  if (has('person', 'family', 'group') && has('movement', 'group', 'organisation')) eligible.push('religious_conversion_or_affiliation');
  if (has('person', 'family', 'group')) eligible.push('religious_practice_or_transgression');
  if (has('person', 'family', 'group', 'organisation') && has('place', 'date', 'event')) eligible.push('disaster_or_rescue');
  if (has('organisation', 'group') && has('group', 'place', 'date')) eligible.push('civic_decision_or_legislation');
  if (has('person', 'organisation') && has('work', 'place', 'date')) eligible.push('performance_or_exhibition');
  return eligible;
};

const assignMentionIds = (mentions) => mentions.map((mention) => ({
  ...mention,
  mention_id: `m_${sha256(`${SOURCE_ID}\u001f${mention.page}\u001f${mention.start_offset}\u001f${mention.end_offset}\u001f${mention.type}\u001f${mention.text}`).slice(0, 20)}`,
}));

const EVENT_CUE = /\b(?:built|build|constructed|designed|opened|closed|founded|established|created|printed|published|wrote|authored|book|surveyed|invited|accepted|rejected|refused|moved|settled|resided|born|died|buried|appointed|employed|worked|served|became|owned|bought|sold|rented|leased|demolished|altered|converted|travelled|traveled|arrived|returned|left|expelled|fled|survived|prohibited|permitted|forbidden|customary|recite|prayed|prayers|worshipped|observed|rejoiced|rejoicing|partaking|flouted|flouting|fasted|fasting|attacked|persecuted|deported|killed|rescued|saved|sheltered|ransom|donated|collected|followed|follower|opponent|join|joined|proclaimed|proclaiming|preached|performed|recorded|planned|prepared|preparing|petition|passed|commemorated)\b/i;
const SCHEMA_CUES = {
  construction: /\b(?:built|build|constructed|designed|commissioned|opened)\b/i,
  alteration_or_demolition: /\b(?:altered|renovated|rebuilt|demolished|destroyed)\b/i,
  ownership_or_tenancy_change: /\b(?:owned|bought|sold|rented|leased|acquired|inherited|took over)\b/i,
  business_operation: /\b(?:opened|closed|operated|traded|shop|business|factory|cafe|café|collected|donated|ransom)\b/i,
  residence: /\b(?:resided|dwelt|settled|lived\s+(?:at|in|on)|moved\s+(?:in|to))\b/i,
  birth_or_death: /\b(?:born|died|death|buried|killed)\b/i,
  appointment_or_employment: /\b(?:appointed|employed|worked|served as|became|rabbi of)\b/i,
  invitation_or_acceptance: /\b(?:invited|invitation|accepted|rejected|refused)\b/i,
  organisation_founding_or_dissolution: /\b(?:founded|established|formed|organized|reorganized|dissolved|disbanded)\b/i,
  publication_or_creation: /\b(?:book|surveyed|wrote|printed|published|created|composed|painted|authored|performed|recorded)\b/i,
  migration_or_journey: /\b(?:moved|moving|travelled|traveled|travel|arrived|left|expelled|fled|returned|journey|prepar(?:ed|ing) to travel|planned to travel|settling)\b/i,
  law_prohibition_or_permission: /\b(?:prohibited|permitted|banned|forbidden|allowed|decreed|law|commandment|must|could not|not customary|authorities|suspicious)\b/i,
  attack_persecution_or_rescue: /\b(?:attacked|persecuted|deported|rescued|sheltered|protected|killed|ransom|captive|survived)\b/i,
  commemoration: /\b(?:commemorated|memorial|named after|dedicated|tomb|visited)\b/i,
  religious_conversion_or_affiliation: /\b(?:converted|conversion|faith|messiah|movement|follower|followed|join|joined|proclaimed|proclaiming|religion|opponent|Shabbatean)\b/i,
  religious_practice_or_transgression: /\b(?:prayed|prayers|worshipped|observed|rejoiced|rejoicing|partaking|festive meals|religious precepts|flouted|flouting|fasted|fasting|Sabbath)\b/i,
  disaster_or_rescue: /\b(?:flood|epidemic|cholera|fire|disaster|rescued|saved|refuge|shelter|drowned)\b/i,
  civic_decision_or_legislation: /\b(?:petition|diet|parliament|act|law|decree|decision|passed|rights|allowed|turned down)\b/i,
  performance_or_exhibition: /\b(?:performed|play|concert|exhibited|staged|premiere)\b/i,
};

const sentenceSpans = (readingPage) => Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(readingPage.text)).flatMap((segment) => {
  const leading = segment.segment.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = segment.segment.match(/\s*$/u)?.[0].length ?? 0;
  const readingStart = segment.index + leading;
  const readingEnd = segment.index + segment.segment.length - trailing;
  if (readingEnd <= readingStart || readingEnd - readingStart < 8 || readingEnd > readingPage.raw_ends.length) return [];
  return [{
    page: readingPage.page,
    reading_start_offset: readingStart,
    reading_end_offset: readingEnd,
    start_offset: readingPage.raw_starts[readingStart],
    end_offset: readingPage.raw_ends[readingEnd - 1],
    reading_text: readingPage.text.slice(readingStart, readingEnd),
  }];
});

const mentionsInside = (span, mentions) => mentions.filter((mention) => mention.page === span.page
  && mention.reading_start_offset >= span.reading_start_offset && mention.reading_end_offset <= span.reading_end_offset);

const candidateScore = (span, mentions) => {
  const types = new Set(mentions.map((mention) => mention.type));
  const confidence = mentions.reduce((sum, mention) => sum + (mention.confidence ?? 0), 0);
  const highValueCue = /\b(?:killed|died|buried|converted|proclaimed|rejected|survived|ransom|persecuted|deported|rescued|founded|built|demolished|printed|published)\b/i.test(span.reading_text);
  return (Math.min(mentions.length, 6) * 1.5) + (types.has('date') ? 2 : 0) + (EVENT_CUE.test(span.reading_text) ? 3 : 0) + (highValueCue ? 5 : 0) + confidence;
};

const overlapRatio = (left, right) => Math.max(0, Math.min(left.end_offset, right.end_offset) - Math.max(left.start_offset, right.start_offset))
  / Math.min(left.end_offset - left.start_offset, right.end_offset - right.start_offset);

const buildCandidateSpans = (pages, readingPages, mentions) => {
  const raw = [];
  const sourceByPage = new Map(pages.map((page) => [page.page, page]));
  for (const readingPage of readingPages) {
    const sourcePage = sourceByPage.get(readingPage.page);
    if (!sourcePage || !Array.isArray(readingPage.raw_starts) || !Array.isArray(readingPage.raw_ends)) continue;
    const sentences = sentenceSpans(readingPage);
    for (let index = 0; index < sentences.length; index += 1) {
      const focus = sentences[index];
      if (!EVENT_CUE.test(focus.reading_text)) continue;
      let contextStart = Math.max(0, index - 2);
      let contextEnd = Math.min(sentences.length, index + 2);
      const contextLength = () => sentences[contextEnd - 1].reading_end_offset - sentences[contextStart].reading_start_offset;
      while (contextLength() > MAX_SPAN_CHARS && (contextStart < index || contextEnd > index + 1)) {
        if (contextStart < index) contextStart += 1;
        else contextEnd -= 1;
      }
      const group = sentences.slice(contextStart, contextEnd);
      const span = {
        page: readingPage.page,
        reading_start_offset: group[0].reading_start_offset,
        reading_end_offset: group.at(-1).reading_end_offset,
        start_offset: group[0].start_offset,
        end_offset: group.at(-1).end_offset,
        focus_start_offset: focus.start_offset,
        focus_end_offset: focus.end_offset,
        focus_text: focus.reading_text,
        reading_text: readingPage.text.slice(group[0].reading_start_offset, group.at(-1).reading_end_offset),
        evidence_quote: sourcePage.text.slice(group[0].start_offset, group.at(-1).end_offset),
      };
      if (span.reading_text.length > MAX_SPAN_CHARS) continue;
      const spanMentions = mentionsInside(span, mentions);
      if (spanMentions.length < 1) continue;
      const schemas = eligibleSchemas(spanMentions).filter((schema) => SCHEMA_CUES[schema]?.test(focus.reading_text));
      if (!schemas.length) continue;
      const compactMentions = spanMentions.map(({ mention_id, text, normalized_text, type, confidence }) => ({
        mention_id, text: normalized_text ?? text, source_text: text, type, confidence,
      }));
      const candidate = {
        span_id: `s_${sha256(`${SOURCE_ID}\u001f${span.page}\u001f${focus.start_offset}\u001f${focus.end_offset}`).slice(0, 20)}`,
        ...span,
        mentions: compactMentions,
        allowed_event_schemas: schemas,
        event_roles: Object.fromEntries(schemas.map((schema) => [schema, EVENT_SCHEMAS[schema]])),
      };
      raw.push({ ...candidate, score: candidateScore(focus, spanMentions) });
    }
  }
  return raw.sort((left, right) => right.score - left.score).slice(0, MAX_CANDIDATE_SPANS)
    .map(({ score: _score, ...candidate }) => candidate);
};

const deterministicSemanticReason = (claim) => {
  const semanticText = String(claim.claim_text ?? '').toLowerCase();
  if (claim.event_type === 'migration_or_journey') {
    if (/join(?:ed)?\s+(?:his|the|a)?\s*movement|sent charity|corresponded|donations?/.test(semanticText)) return 'Religious affiliation or correspondence is not physical migration.';
    if (!/travel|arriv|return|moved|moving|fled|expelled|settled|settling|journey|sojourn/.test(semanticText)) return 'No physical movement asserted.';
  }
  if (claim.event_type === 'residence' && (/lived through/.test(semanticText) || !/resided|dwelt|lived (?:at|in|on)|moved (?:in|to)/.test(semanticText))) return 'No literal residence asserted.';
  if (claim.event_type === 'alteration_or_demolition' && /converted to (?:islam|christian|protestant|catholic)/.test(semanticText)) return 'Religious conversion is not building alteration.';
  if (claim.event_type === 'publication_or_creation' && !/\b(?:book|surveyed|wrote|printed|published|created|composed|painted|authored|recorded)\b/.test(semanticText)) return 'No creation or publication action asserted.';
  if (claim.event_type === 'civic_decision_or_legislation' && !/\b(?:petition|diet|parliament|law|decree|decision|passed|rights|allowed|legislation|turned down)\b/.test(semanticText)) return 'No civic decision or legislation asserted.';
  if (claim.event_type === 'organisation_founding_or_dissolution' && !/\b(?:founded|established|formed|organized|organised|reorganized|reorganised|dissolved|disbanded)\b/.test(semanticText)) return 'No organisation founding, reorganisation, or dissolution asserted.';
  return null;
};

const applyDeterministicGuards = (claims) => claims.map((claim) => {
  const reason = deterministicSemanticReason(claim);
  if (!reason) return claim;
  return {
    ...claim,
    verification: {
      ...claim.verification,
      model_verdict: claim.verification?.model_verdict ?? claim.verification?.verdict ?? null,
      verdict: 'unsupported',
      reason: `Deterministic semantic guard: ${reason}`,
    },
  };
});

const normalizeClaims = (rawClaims, candidates) => {
  const bySpan = new Map(candidates.map((candidate) => [candidate.span_id, candidate]));
  return rawClaims.flatMap((claim) => {
    const span = bySpan.get(claim?.span_id);
    if (!claim || typeof claim !== 'object' || !span || !span.allowed_event_schemas.includes(claim.event_type) || !Array.isArray(claim.participants)) return [];
    const byId = new Map(span.mentions.map((mention) => [mention.mention_id, mention]));
    const participants = claim.participants.flatMap((participant) => {
      const mention = byId.get(participant?.mention_id);
      const role = typeof participant?.role === 'string' ? participant.role.trim() : '';
      if (!mention || !EVENT_SCHEMAS[claim.event_type]?.includes(role)) return [];
      return [{ mention_id: mention.mention_id, mention: mention.text, source_mention: mention.source_text, type: mention.type, role }];
    });
    if (!participants.length || participants.length !== claim.participants.length || new Set(participants.map((item) => item.mention_id)).size !== participants.length) return [];
    const requirements = EVENT_REQUIREMENTS[claim.event_type] ?? [];
    if (!requirements.every((types) => participants.some((participant) => types.includes(participant.type)))) return [];
    if (['attack_persecution_or_rescue', 'law_prohibition_or_permission', 'religious_conversion_or_affiliation'].includes(claim.event_type) && participants.length < 2) return [];
    if (typeof claim.claim_text !== 'string' || !claim.claim_text.trim()) return [];
    const evidence = { page_ref: span.page, start_offset: span.start_offset, end_offset: span.end_offset, quote: span.evidence_quote };
    const timeText = typeof claim.time_text === 'string' && span.reading_text.includes(claim.time_text) ? claim.time_text : null;
    const normalized = {
      span_id: span.span_id, claim_text: claim.claim_text.trim(), event_type: claim.event_type,
      participants, time_text: timeText,
      negated: claim.negated === true, uncertain: claim.uncertain === true, evidence,
    };
    if (deterministicSemanticReason(normalized)) return [];
    return [{ claim_id: `c_${sha256(JSON.stringify(normalized)).slice(0, 20)}`, ...normalized }];
  });
};

const isSubset = (left, right) => [...left].every((value) => right.has(value));
const foldText = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const actionFamily = (claim) => {
  const text = foldText(claim.claim_text);
  if (claim.event_type === 'religious_conversion_or_affiliation' && /\b(?:convert|converted|conversion|changed religion|became (?:a )?(?:turkish )?(?:moslem|muslim)|islam)\b/.test(text)) return 'conversion';
  return null;
};

const dedupeClaims = (claims) => {
  const selected = [];
  for (const claim of [...claims].sort((left, right) => right.participants.length - left.participants.length)) {
    const ids = new Set(claim.participants.map((participant) => participant.mention_id));
    const duplicate = selected.some((existing) => {
      if (existing.event_type !== claim.event_type || existing.evidence.page_ref !== claim.evidence.page_ref) return false;
      const existingIds = new Set(existing.participants.map((participant) => participant.mention_id));
      const sameParticipants = isSubset(ids, existingIds) || isSubset(existingIds, ids);
      const evidenceOverlap = overlapRatio(existing.evidence, claim.evidence);
      if (sameParticipants && evidenceOverlap > 0.25) return true;
      if (foldText(existing.claim_text) === foldText(claim.claim_text) && evidenceOverlap > 0.25) return true;
      const family = actionFamily(claim);
      if (!family || family !== actionFamily(existing) || evidenceOverlap < 0.80) return false;
      const coreTypes = new Set(['person', 'family', 'group', 'organisation']);
      const names = new Set(claim.participants.filter((item) => coreTypes.has(item.type)).map((item) => foldText(item.mention)));
      return existing.participants.some((item) => coreTypes.has(item.type) && names.has(foldText(item.mention)));
    });
    if (!duplicate) selected.push(claim);
  }
  return selected;
};

const promptCandidate = (candidate) => ({
  span_id: candidate.span_id,
  page: candidate.page,
  focus_text: candidate.focus_text,
  context_text: candidate.reading_text,
  mentions: candidate.mentions.map(({ mention_id, text, type }) => ({ mention_id, text, type })),
  allowed_event_schemas: candidate.allowed_event_schemas,
  event_roles: candidate.event_roles,
});

const extractorRequest = (candidates) => `CANDIDATE_SPANS:\n${JSON.stringify(candidates.map(promptCandidate))}`;

const batchesOf = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const aggregateUsage = (calls) => ({
  prompt_tokens: calls.reduce((sum, call) => sum + Number(call.usage?.prompt_tokens ?? 0), 0),
  completion_tokens: calls.reduce((sum, call) => sum + Number(call.usage?.completion_tokens ?? 0), 0),
  total_tokens: calls.reduce((sum, call) => sum + Number(call.usage?.total_tokens ?? 0), 0),
  cost: calls.reduce((sum, call) => sum + Number(call.usage?.cost ?? 0), 0),
  call_count: calls.length,
});

const extractClaims = async (candidates, { model = EXTRACTOR_MODEL, maxTokens = 2200, batchSize = EXTRACTOR_BATCH_SIZE, operation = 'kg.historical_nlp.extract' } = {}) => {
  const calls = [];
  const claims = [];
  for (const batch of batchesOf(candidates, batchSize)) {
    const userPayload = extractorRequest(batch);
    const completion = await createChatCompletion({
      operation, model,
      messages: [{ role: 'system', content: EXTRACTOR_PROMPT }, { role: 'user', content: userPayload }],
      response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0, fallback_without_response_format: false,
    });
    const payload = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
    if (!Array.isArray(payload.claims)) throw new Error('Schema-constrained extractor returned no claims array');
    claims.push(...normalizeClaims(payload.claims, batch));
    calls.push({ model: completion.model ?? model, usage: completion.usage ?? null });
  }
  return { claims: dedupeClaims(claims), model: calls[0]?.model ?? model, usage: aggregateUsage(calls), calls };
};

const verifyClaims = async (claims) => {
  if (!claims.length) return { claims, model: null, usage: null };
  const completion = await createChatCompletion({
    operation: 'kg.historical_nlp.verify', model: VERIFIER_MODEL,
    messages: [{ role: 'system', content: VERIFIER_PROMPT }, { role: 'user', content: JSON.stringify({ candidates: claims }) }],
    response_format: { type: 'json_object' }, max_tokens: 1400, temperature: 0, fallback_without_response_format: false,
  });
  const payload = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
  if (!Array.isArray(payload.verdicts)) throw new Error('Verifier returned no verdicts array');
  const allowed = new Set(['supported', 'partially_supported', 'unsupported', 'ambiguous', 'contradicted_by_evidence']);
  const verdicts = new Map(payload.verdicts.filter((item) => Number.isInteger(item?.index) && allowed.has(item?.verdict)).map((item) => [item.index, { verdict: item.verdict, reason: typeof item.reason === 'string' ? item.reason : null }]));
  return {
    claims: claims.map((claim, index) => ({ ...claim, verification: verdicts.get(index) ?? { verdict: 'ambiguous', reason: 'Verifier omitted this candidate.' } })),
    model: completion.model ?? VERIFIER_MODEL, usage: completion.usage ?? null,
  };
};

const main = async () => {
  if (REVALIDATE_ONLY) {
    const rows = (await fs.readFile(EVENT_OUTPUT, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    const requestedPages = Array.from({ length: PAGE_COUNT }, (_, index) => FROM_PAGE + index);
    const sourceRows = rows.filter((row) => row.source_id === SOURCE_ID && JSON.stringify(row.pdf_pages) === JSON.stringify(requestedPages));
    const latest = sourceRows.sort((left, right) => String(right.extracted_at ?? '').localeCompare(String(left.extracted_at ?? '')))[0];
    if (!latest || !Array.isArray(latest.claims)) throw new Error('No matching historical event run to revalidate');
    const claims = applyDeterministicGuards(latest.claims);
    const record = {
      ...latest,
      run_id: crypto.randomUUID(),
      parent_run_id: latest.run_id,
      extracted_at: new Date().toISOString(),
      claims,
      deterministic_guard_version: 'historical-semantic-guards-v2',
    };
    await appendJsonl(EVENT_OUTPUT, record);
    const rejected = claims.filter((claim, index) => claim.verification?.verdict === 'unsupported' && latest.claims[index]?.verification?.verdict !== 'unsupported').length;
    console.log(`Revalidated latest ${requestedPages.join('-')} run locally; rejected ${rejected} semantic schema errors. No API requests.`);
    return;
  }
  if (!Number.isInteger(FROM_PAGE) || FROM_PAGE < 1 || !Number.isInteger(PAGE_COUNT) || PAGE_COUNT < 1 || PAGE_COUNT > 3) throw new Error('--from-page must be positive and --page-count must be 1-3');
  if (!Number.isFinite(NLP_THRESHOLD) || NLP_THRESHOLD <= 0 || NLP_THRESHOLD > 1 || !Number.isFinite(MAX_COST_USD) || MAX_COST_USD <= 0) throw new Error('Invalid --nlp-threshold or --max-cost-usd');
  if (!MENTIONS_ONLY && EXTRACTOR_MODEL === VERIFIER_MODEL) throw new Error('Extractor and verifier must use different models; pass --verifier-model from another model family');
  if (QUALITY_PASS && QUALITY_MODEL === VERIFIER_MODEL) throw new Error('Quality extractor and verifier must use different model families');

  const allPages = parsePages(await fs.readFile(INPUT, 'utf8'));
  const pages = allPages.filter((page) => page.page >= FROM_PAGE).slice(0, PAGE_COUNT);
  if (pages.length !== PAGE_COUNT) throw new Error(`Only found ${pages.length} of ${PAGE_COUNT} requested pages`);
  const textSha = sha256(pages.map((page) => `${page.page}\n${page.text}`).join('\n\n'));
  const runId = crypto.randomUUID();
  console.log(`Local NLP first: ${SOURCE_ID}, pages ${pages.map((page) => page.page).join('-')}; no database writes.`);
  const nlp = await runLocalNlp(pages);
  if (!Array.isArray(nlp.mentions) || !Array.isArray(nlp.reading_pages)) throw new Error('Local NLP returned no mentions or reading-page map');
  const mentions = assignMentionIds(nlp.mentions);
  const mentionRecord = {
    run_id: runId, source_id: SOURCE_ID, pdf_pages: pages.map((page) => page.page), source_text_sha256: textSha,
    extracted_at: new Date().toISOString(), engine: nlp.engine, model: nlp.model, threshold: nlp.threshold, labels: nlp.labels,
    mentions,
  };
  await appendJsonl(MENTION_OUTPUT, mentionRecord);
  console.log(`Stored ${mentions.length} exact-offset local mentions in private JSONL.`);
  if (MENTIONS_ONLY) return;

  const candidates = buildCandidateSpans(pages, nlp.reading_pages, mentions);
  await appendJsonl(CANDIDATE_OUTPUT, {
    run_id: runId, source_id: SOURCE_ID, pdf_pages: pages.map((page) => page.page), source_text_sha256: textSha,
    mention_run_id: runId, created_at: new Date().toISOString(), candidates,
  });
  console.log(`Stored ${candidates.length} compact local candidate spans in private JSONL.`);
  if (CANDIDATES_ONLY) return;
  if (!candidates.length) {
    await appendJsonl(EVENT_OUTPUT, { run_id: runId, source_id: SOURCE_ID, pdf_pages: pages.map((page) => page.page), source_text_sha256: textSha, mention_run_id: runId, status: 'none', reason: 'No event schema satisfied local mention type constraints.', claims: [], publication_status: 'private' });
    console.log('No eligible event schema from local mention types; stopped before any API request.');
    return;
  }
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required after the local mention stage');

  const catalog = await fetchOpenRouterCatalog();
  const extractorPricing = pricingForModels([EXTRACTOR_MODEL], catalog);
  const qualityPricing = QUALITY_PASS ? pricingForModels([QUALITY_MODEL], catalog) : [];
  const verifierPricing = pricingForModels([VERIFIER_MODEL], catalog);
  const extractorCeiling = estimateExtractionCeiling({
    requests: batchesOf(candidates, EXTRACTOR_BATCH_SIZE).map((batch) => `${EXTRACTOR_PROMPT}\n${extractorRequest(batch)}`),
    modelPricing: extractorPricing,
    maxOutputTokens: 2200,
  });
  const qualityCeiling = QUALITY_PASS ? estimateExtractionCeiling({
    requests: batchesOf(candidates, 4).map((batch) => `${EXTRACTOR_PROMPT}\n${extractorRequest(batch)}`),
    modelPricing: qualityPricing,
    maxOutputTokens: 2200,
  }) : { usd: 0 };
  const verifierReservation = JSON.stringify({ candidates: candidates.map((candidate) => ({ event_type: candidate.allowed_event_schemas, participants: candidate.mentions.slice(0, 4), evidence: candidate.reading_text })) });
  const verifierCeiling = estimateExtractionCeiling({ requests: [`${VERIFIER_PROMPT}\n${verifierReservation}`], modelPricing: verifierPricing, maxOutputTokens: 1400 });
  const ceilingUsd = extractorCeiling.usd + qualityCeiling.usd + verifierCeiling.usd;
  console.log(`API ceiling: extractor ${formatUsd(extractorCeiling.usd)} + quality ${formatUsd(qualityCeiling.usd)} + verifier ${formatUsd(verifierCeiling.usd)} = ${formatUsd(ceilingUsd)}; hard ceiling ${formatUsd(MAX_COST_USD)}.`);
  if (ceilingUsd > MAX_COST_USD) throw new Error(`Refusing extraction: ${formatUsd(ceilingUsd)} exceeds --max-cost-usd ${formatUsd(MAX_COST_USD)}`);
  if (PREFLIGHT_ONLY) {
    console.log('Preflight only: local mentions and candidate spans stored; no paid API requests made.');
    return;
  }
  if (!ALLOW_PAID) throw new Error('Paid extraction requires explicit --allow-paid after reviewing the displayed ceiling.');

  const cheapExtraction = await extractClaims(candidates);
  let qualityExtraction = { claims: [], calls: [] };
  if (QUALITY_PASS) {
    const claimedSpans = new Set(cheapExtraction.claims.map((claim) => claim.span_id));
    const qualityCandidates = candidates.filter((candidate) => !claimedSpans.has(candidate.span_id) || candidate.allowed_event_schemas.length > 1);
    if (qualityCandidates.length) {
      console.log(`Quality pass: revisiting ${qualityCandidates.length} uncovered or multi-schema spans.`);
      qualityExtraction = await extractClaims(qualityCandidates, {
        model: QUALITY_MODEL,
        maxTokens: 2200,
        batchSize: 4,
        operation: 'kg.historical_nlp.extract_quality',
      });
    }
  }
  const extractionCalls = [...cheapExtraction.calls, ...qualityExtraction.calls];
  const extracted = {
    claims: dedupeClaims([...cheapExtraction.claims, ...qualityExtraction.claims]),
    model: EXTRACTOR_MODEL,
    quality_model: QUALITY_PASS ? QUALITY_MODEL : null,
    usage: aggregateUsage(extractionCalls),
    calls: extractionCalls,
  };
  await appendJsonl(CLAIM_OUTPUT, {
    run_id: runId, source_id: SOURCE_ID, pdf_pages: pages.map((page) => page.page), source_text_sha256: textSha,
    mention_run_id: runId, extracted_at: new Date().toISOString(), schema_version: 'historical-claims-v1',
    extractor: { model: extracted.model, quality_model: extracted.quality_model, prompt_version: 'historical-nlp-events-p4', usage: extracted.usage, calls: extracted.calls },
    claims: extracted.claims, publication_status: 'private', verification_status: 'pending',
  });
  console.log(`Stored ${extracted.claims.length} grounded claim candidates before verification.`);
  const verified = await verifyClaims(extracted.claims);
  verified.claims = applyDeterministicGuards(verified.claims);
  const record = {
    run_id: runId, source_id: SOURCE_ID, pdf_pages: pages.map((page) => page.page), source_text_sha256: textSha,
    mention_run_id: runId, extracted_at: new Date().toISOString(), schema_version: 'historical-events-v1',
    extractor: { model: extracted.model, quality_model: extracted.quality_model, prompt_version: 'historical-nlp-events-p4', usage: extracted.usage, calls: extracted.calls },
    verifier: { model: verified.model, prompt_version: 'historical-nlp-verifier-p2', usage: verified.usage },
    deterministic_guard_version: 'historical-semantic-guards-v2',
    candidate_span_ids: candidates.map((candidate) => candidate.span_id), claims: verified.claims, publication_status: 'private',
  };
  await appendJsonl(EVENT_OUTPUT, record);
  const supported = verified.claims.filter((claim) => claim.verification?.verdict === 'supported').length;
  console.log(`Stored ${verified.claims.length} grounded claims; ${supported} independently supported. Private only.`);
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
