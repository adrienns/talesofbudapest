// Pure logic for cli/research-kg-placeholders.js -- a research/enrichment
// pass over auto-created "needs research" placeholder entities.
//
// Placeholders are staged rows in kg_people / kg_locations / kg_events /
// kg_organisations that a relation endpoint named but the extraction never
// catalogued as its own entity (e.g. a relation says "Ede Horn founded
// OMIKE" but neither "Ede Horn" nor "OMIKE" has its own staged record). They
// are auto-created with `metadata.needs_research = true`,
// `metadata.origin = 'relation_endpoint'`, `resolution_status = 'pending'`
// (see migration 019_kg_organisations_and_placeholders.sql) so the graph can
// draw the edge today while a later pass confirms/enriches/rejects the
// endpoint itself.
//
// This module triages each placeholder's NAME via a knowledge-assisted
// OpenRouter model (Qwen Flash by default) and turns the result
// into a DB patch. It never decides publication -- see planResearchUpdate:
// a confirmed entity stays `resolution_status: 'pending'` (a human still
// reviews and promotes it) and a rejected one is marked
// `resolution_status: 'rejected'`, but publication_status/review_status on
// the eventual canonical kg_entities row are never touched here.
//
// Sending an entity NAME + kind hint to a model is not sending
// restricted book text -- only the book's page text is the RESTRICTED
// corpus; a bare name like "OMIKE" or "Ignác Goldziher" is not private. See
// cli/research-kg-placeholders.js for the Supabase REST + cache glue and the
// refusal of --publish/--allow-restricted-public (this pass never publishes
// anything).
//
// No I/O happens here -- see lib/openRouterClient.js for the chat call.
import { normalizeLocationName } from './kgNormalize.js';

/** The only entity kinds this pipeline recognizes; anything else collapses to 'unknown'. */
export const ALLOWED_KINDS = ['person', 'location', 'organisation', 'event'];
const ALLOWED_KIND_SET = new Set(ALLOWED_KINDS);

/** A confirmed research result must clear this confidence bar to auto-fill research_summary; below it (or is_real_entity:false) the placeholder is rejected instead. */
export const CONFIRM_CONFIDENCE_THRESHOLD = 0.5;

const MAX_SUMMARY_WORDS = 60;
// Defensive cap well above ~60 words' worth of characters -- guards planNode
// callers against a model that ignores the word-count instruction and
// returns a runaway paragraph, without needing a real tokenizer here.
const MAX_TEXT_LENGTH = 600;

export const RESEARCH_SYSTEM_PROMPT = `Return JSON only -- no commentary, no markdown fences. You are a cautious knowledge assistant triaging named entities that appear in a knowledge graph about Jewish life and history in Budapest, Hungary. You do not have live web access in this call.

For each entity given (a name and a hinted kind: person, location, organisation, or event), use only knowledge you are confident about and determine:
- is_real_entity: whether it is a real, specific, identifiable entity (a named person, place, organisation, or event) as opposed to a generic term, role, category, or something you can find no evidence for.
- kind: person, location, organisation, event, or unknown if you cannot determine one.
- summary_en: a short, factual, cautious summary in English, at most ${MAX_SUMMARY_WORDS} words. Prefer its connection to Budapest and/or Hungarian-Jewish history where relevant. Do not invent citations, URLs, or details.
- confidence: a score from 0.0 to 1.0 in your identification and summary.
- reject_reason: if is_real_entity is false, a short reason why (e.g. "generic role/title, not a named entity", "no evidence found of a specific entity by this name"); otherwise an empty string.

Rules:
- Never invent facts. If you cannot identify the entity confidently without live lookup, set is_real_entity false with a reject_reason explaining that manual verification is required.
- Generic terms, roles, titles, categories, or descriptions (e.g. "the rabbi", "the committee", "Jewish community") are NOT real entities -- set is_real_entity to false with a reject_reason.
- Keep summaries factual, concise, neutral in tone, and free of markdown formatting.

Return exactly this JSON shape, one entry per entity given, in any order (entries are matched back to the entities by "name"):
{"results":[{"name":"<the name you were given, verbatim>","is_real_entity":true|false,"kind":"person|location|organisation|event|unknown","summary_en":"","confidence":0.0,"reject_reason":""}]}`;

/**
 * Chat messages for a strict-JSON, knowledge-assisted OpenRouter call
 * (createChatCompletion's `messages` param) asking a model to research a
 * batch of placeholder entities. See RESEARCH_SYSTEM_PROMPT for the full
 * rules and JSON schema.
 *
 * @param {Array<{name:string, kind?:string}>} batch
 */
export const buildResearchPrompt = (batch) => {
  const entities = (batch ?? []).map((item) => ({
    name: item.name,
    kind: ALLOWED_KIND_SET.has(item.kind) ? item.kind : 'unknown',
  }));
  return [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: `Entities:\n${JSON.stringify(entities, null, 2)}` },
  ];
};

const coerceKind = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_KIND_SET.has(normalized) ? normalized : 'unknown';
};

const clampConfidence = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
};

const cleanText = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '');

/**
 * Parses and validates a chat completion's JSON content against the batch
 * that was sent, returning one result per batch entry, IN BATCH ORDER
 * (never in whatever order the model happened to emit). Tolerant of a model
 * that omits a key, adds an unexpected key, reorders entries, or returns
 * fewer/more entries than asked for -- entries are matched back to the batch
 * by normalized `name` (lib/kgNormalize.js's normalizeLocationName, the same
 * identity normalizer used everywhere else in the KG pipeline, e.g.
 * lib/kgRelationResolver.js's buildEntityIndex).
 *
 * A batch entry with no matching result (dropped by the model, or its name
 * didn't survive normalization) gets a synthetic "not found" result --
 * is_real_entity:false, confidence 0 -- rather than being silently omitted,
 * so every input always has a corresponding output the caller can plan from.
 *
 * A raw result entry missing a usable `name` is malformed and dropped
 * outright (it can never be matched back to a batch entry).
 *
 * The only things that THROW are genuinely malformed responses: content
 * that isn't parseable JSON at all, or JSON missing a `results` array.
 *
 * @param {string|object} content raw `choices[0].message.content` (string) or an already-parsed object
 * @param {Array<{name:string, kind?:string}>} batch the same batch buildResearchPrompt was called with
 * @returns {Array<{name:string, is_real_entity:boolean, kind:string, summary_en:string, confidence:number, reject_reason:string}>}
 */
export const parseResearchResponse = (content, batch) => {
  let parsed;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (error) {
    throw new Error(`Failed to parse research response as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error('Research response is missing a "results" array');
  }

  const byNormalizedName = new Map();
  for (const item of parsed.results) {
    if (!item || typeof item.name !== 'string') continue; // malformed entry, dropped
    const key = normalizeLocationName(item.name);
    if (!key) continue;
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, item);
  }

  return (batch ?? []).map((entry) => {
    const key = normalizeLocationName(entry.name);
    const match = key ? byNormalizedName.get(key) : null;
    if (!match) {
      return {
        name: entry.name,
        is_real_entity: false,
        kind: 'unknown',
        summary_en: '',
        confidence: 0,
        reject_reason: 'no research result returned for this entity',
      };
    }
    const isRealEntity = match.is_real_entity === true;
    const rejectReason = cleanText(match.reject_reason);
    return {
      name: entry.name,
      is_real_entity: isRealEntity,
      kind: coerceKind(match.kind),
      summary_en: isRealEntity ? cleanText(match.summary_en) : '',
      confidence: clampConfidence(match.confidence),
      reject_reason: isRealEntity ? '' : (rejectReason || 'not a real researchable entity'),
    };
  });
};

/**
 * Turns one placeholder entity + its research result into the DB patch
 * cli/research-kg-placeholders.js PATCHes onto the staging row.
 *
 * Confirmed (`is_real_entity` true AND `confidence >= CONFIRM_CONFIDENCE_THRESHOLD`):
 * only `metadata` is patched -- `needs_research` cleared, `researched` set,
 * and the research findings recorded. `resolution_status` is left untouched
 * (still 'pending'): a human still reviews and promotes the entity, this
 * pass only enriches it.
 *
 * Not confirmed (`is_real_entity` false, OR real but below the confidence
 * bar): `resolution_status` is set to 'rejected' and `metadata` records why.
 * A real-but-low-confidence result has no model-supplied reject_reason (see
 * parseResearchResponse, which only fills reject_reason when is_real_entity
 * is false), so a fallback reason is used.
 *
 * Either way, `metadata` is a full replacement built by spreading the
 * entity's EXISTING metadata first -- callers must PATCH the whole object,
 * not a JSON-merge -- and this function never sets anything about
 * publication (no publication_status/review_status field exists on these
 * staging tables at all; that only happens at promotion time, see
 * lib/kgPromotion.js).
 *
 * @param {{metadata?: object}} entity
 * @param {{is_real_entity:boolean, kind:string, summary_en:string, confidence:number, reject_reason:string}} result
 */
export const planResearchUpdate = (entity, result) => {
  const baseMetadata = { ...(entity?.metadata ?? {}) };
  const confidence = clampConfidence(result?.confidence);
  const confirmed = result?.is_real_entity === true && confidence >= CONFIRM_CONFIDENCE_THRESHOLD;

  if (confirmed) {
    return {
      metadata: {
        ...baseMetadata,
        needs_research: false,
        researched: true,
        research_summary: result.summary_en ?? '',
        research_kind: coerceKind(result.kind),
        research_confidence: confidence,
      },
    };
  }

  const rejectReason = cleanText(result?.reject_reason)
    || (result?.is_real_entity ? 'confidence below threshold for automatic confirmation' : 'not a real researchable entity');

  return {
    resolution_status: 'rejected',
    metadata: {
      ...baseMetadata,
      needs_research: false,
      researched: true,
      research_reject_reason: rejectReason,
    },
  };
};
