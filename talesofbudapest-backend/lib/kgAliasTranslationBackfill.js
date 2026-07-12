// Pure logic for cli/backfill-kg-alias-translations.js -- Layer 7 of the KG
// matching pipeline: an LLM-suggested-alias backfill for the tail of
// landmarks the deterministic layers (curated lexicon expansion, the
// public.locations/location_translations seed pass, and the Wikidata anchor
// import) never covered in Hungarian or English.
//
// Unlike lib/kgAliasExpansion.js's lexicon derivation (born `approved`
// because it deterministically re-derives an alias a human already vetted),
// every row this module plans is born `review_status: 'needs_review'` and
// `source: 'llm_translation'` -- an LLM name suggestion is a judgment call,
// not a derivation, so it is always inert for auto-linking (the resolver
// only ever exact-matches `approved` aliases -- see
// migration 018_kg_alias_exact_match.sql's match_kg_entity_exact and
// lib/kgAliasGuard.js) until a human reviews and approves it. This module
// never sets review_status to anything else; that invariant is asserted on
// every row this file's tests produce.
//
// No I/O happens here -- see lib/openRouterClient.js for the chat call and
// cli/backfill-kg-alias-translations.js for the Supabase REST + cache glue.
import { normalizeLocationName } from './kgNormalize.js';
import { stableUuid } from './kgPromotion.js';

// Aliases that count as "this landmark already has a name in this
// language" -- 'name' (the original promoted/seeded alias) and
// 'translated_name' (a prior lexicon/wikidata/llm pass). 'address' and
// 'identifier' rows never establish name coverage in any language.
const NAME_ALIAS_KINDS = new Set(['name', 'translated_name']);

// The two languages this tail-fill targets. German and historical names are
// still solicited from the model (buildTranslationPrompt/
// planTranslationAliasRows) because they're useful once a human reviews
// them, but they never gate selection -- only a missing hu or en name pulls
// an entity into this backfill.
const COVERAGE_LANGUAGES = ['hu', 'en'];

const asMap = (value) => (value instanceof Map ? value : new Map(Object.entries(value ?? {})));

/**
 * Entities of `options.kinds` (default `['location']`) that lack an
 * APPROVED 'name'/'translated_name' alias in Hungarian OR English, and that
 * carry no alias at all sourced from 'wikidata' (any review_status -- a
 * Wikidata-anchored entity is deliberately never re-suggested by the LLM
 * layer, whether or not that anchor has been reviewed yet). A null
 * language_code never counts as coverage in any language -- it's an
 * "unknown" alias, not a Hungarian or English one.
 *
 * @param {Array<{id:string, entity_kind:string, canonical_name_en:string}>} entities
 * @param {Map<string, Array<{language_code:string|null, alias_kind:string, review_status:string, source?:string}>>} aliasesByEntityId
 * @param {{kinds?: string[]}} [options]
 * @returns {Array<object>} entities (spread) plus a `missing: string[]` field (subset of ['hu','en'])
 */
export const selectBackfillTargets = (entities, aliasesByEntityId, options = {}) => {
  const kinds = options.kinds ?? ['location'];
  const aliasesMap = asMap(aliasesByEntityId);
  const targets = [];

  for (const entity of entities ?? []) {
    if (!entity?.id || !kinds.includes(entity.entity_kind)) continue;
    const aliases = aliasesMap.get(entity.id) ?? [];
    if (aliases.some((alias) => alias?.source === 'wikidata')) continue;

    const covered = new Set();
    for (const alias of aliases) {
      if (alias?.review_status !== 'approved') continue;
      if (!NAME_ALIAS_KINDS.has(alias?.alias_kind)) continue;
      if (!alias?.language_code) continue; // null language_code is unknown, not a language
      if (COVERAGE_LANGUAGES.includes(alias.language_code)) covered.add(alias.language_code);
    }

    const missing = COVERAGE_LANGUAGES.filter((lang) => !covered.has(lang));
    if (!missing.length) continue;
    targets.push({ ...entity, missing });
  }

  return targets;
};

export const TRANSLATION_SYSTEM_PROMPT = `Return JSON only -- no commentary, no markdown fences. You translate Budapest landmark names for a multilingual gazetteer.

For each landmark, given only its canonical English name, suggest alternate name forms actually used to refer to it: Hungarian name(s), English name(s) (only if different from the canonical form you were given), German name(s), and any distinct historical or former name(s) in any language.

Rules:
- Names only. No descriptions, no addresses, no commentary.
- Never invent a house number or street address.
- If you are not confident of a form in a given language, leave that language's array empty rather than guessing.
- List at most 4 names per language, most likely/common first.
- Do not repeat the canonical English name you were given back in any array.

Return exactly this JSON shape, one entry per landmark given, in any order (entries are matched back to landmarks by "name"):
{"results":[{"name":"<the canonical_name_en you were given, verbatim>","hu":[],"en":[],"de":[],"historical":[]}]}`;

/**
 * Chat messages for a strict-JSON OpenRouter call (createChatCompletion's
 * `messages` param) asking for translated/alternate names for a batch of
 * landmarks. Names only -- see TRANSLATION_SYSTEM_PROMPT for the full rules.
 *
 * @param {Array<{canonical_name_en:string, kind_hint?:string}>} batch
 */
export const buildTranslationPrompt = (batch) => {
  const landmarks = (batch ?? []).map((item) => ({
    canonical_name_en: item.canonical_name_en,
    kind_hint: item.kind_hint ?? 'location',
  }));
  return [
    { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
    { role: 'user', content: `Landmarks:\n${JSON.stringify(landmarks, null, 2)}` },
  ];
};

const MAX_PER_LANGUAGE = 4;
const BARE_NUMBER = /^\d+$/;

// Drops anything that isn't a plausible name: not a string, too short (<=1
// char after trim), absurdly long (>120 chars -- almost certainly a
// hallucinated sentence, not a name), a bare number, or a value that
// normalizes to the same thing as the landmark's own canonical name (the
// model was asked not to do this, but the parser doesn't trust it). Also
// dedupes within a language's own array and caps it at MAX_PER_LANGUAGE,
// since a model can ignore the "at most 4" instruction.
const cleanLanguageValues = (raw, canonicalNormalized) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const value of raw) {
    if (cleaned.length >= MAX_PER_LANGUAGE) break;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length <= 1 || trimmed.length > 120) continue;
    if (BARE_NUMBER.test(trimmed)) continue;
    const normalized = normalizeLocationName(trimmed);
    if (!normalized || normalized === canonicalNormalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(trimmed);
  }
  return cleaned;
};

/**
 * Parses and validates a chat completion's JSON content against the batch
 * that was sent, returning one cleaned suggestion object per batch entry, in
 * batch order (never in whatever order the model happened to emit). Tolerant
 * of a model that omits a language key, adds an unexpected key, or returns
 * entries in a different order than the batch, or fewer/more entries than
 * asked for -- entries are matched back to the batch by normalized `name`,
 * and any batch entry without a match gets all-empty arrays rather than
 * throwing. The only things that throw are actual malformed-response cases:
 * content that isn't parseable JSON at all, or JSON missing a `results`
 * array entirely.
 *
 * @param {string|object} content raw `choices[0].message.content` (string) or an already-parsed object
 * @param {Array<{canonical_name_en:string}>} batch the same batch buildTranslationPrompt was called with
 * @returns {Array<{canonical_name_en:string, hu:string[], en:string[], de:string[], historical:string[]}>}
 */
export const parseTranslationResponse = (content, batch) => {
  let parsed;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (error) {
    throw new Error(`Failed to parse translation response as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error('Translation response is missing a "results" array');
  }

  const byNormalizedName = new Map();
  for (const item of parsed.results) {
    if (!item || typeof item.name !== 'string') continue;
    const key = normalizeLocationName(item.name);
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, item);
  }

  return (batch ?? []).map((entry) => {
    const canonicalNormalized = normalizeLocationName(entry.canonical_name_en);
    const match = byNormalizedName.get(canonicalNormalized) ?? {};
    return {
      canonical_name_en: entry.canonical_name_en,
      hu: cleanLanguageValues(match.hu, canonicalNormalized),
      en: cleanLanguageValues(match.en, canonicalNormalized),
      de: cleanLanguageValues(match.de, canonicalNormalized),
      historical: cleanLanguageValues(match.historical, canonicalNormalized),
    };
  });
};

const LANGUAGE_ALIAS_ROWS = ['hu', 'en', 'de'];

/**
 * Turns one entity's cleaned LLM suggestion (a single item of
 * parseTranslationResponse's output, matching this entity) into
 * kg_entity_aliases rows. hu/en/de suggestions become alias_kind
 * 'translated_name' with their language_code set; historical suggestions
 * become alias_kind 'former_name' with language_code null UNLESS the same
 * normalized text also appears in this suggestion's hu/en/de arrays, in
 * which case that language is "obvious" and is carried over. Every row is
 * born `review_status: 'needs_review'` and `source: 'llm_translation'` --
 * this backfill never writes an approved alias.
 *
 * Dedup: a suggestion whose normalized form already exists for this entity
 * (any existing alias, any review_status, matched on (normalized_alias,
 * alias_kind)) is dropped -- it adds nothing that isn't already on record.
 * Two suggestions in the same call that normalize to the same
 * (normalized_alias, alias_kind) are likewise only emitted once.
 *
 * Row ids use kgPromotion.js's stableUuid('alias', entity.id, alias_kind,
 * normalized_alias) scheme, so re-running this planner over the same
 * suggestion is idempotent and upserts (on_conflict id) rather than
 * duplicating.
 *
 * @param {{id:string, canonical_name_en:string}} entity
 * @param {{hu:string[], en:string[], de:string[], historical:string[]}} suggestion
 * @param {Map<string, Array<{normalized_alias:string, alias_kind:string}>>} existingAliasesByEntityId
 */
export const planTranslationAliasRows = (entity, suggestion, existingAliasesByEntityId) => {
  const existingMap = asMap(existingAliasesByEntityId);
  const existingAliases = existingMap.get(entity.id) ?? [];
  const existingKeys = new Set(existingAliases.map((row) => `${row.normalized_alias}${row.alias_kind}`));
  const plannedKeys = new Set();
  const rows = [];

  const addRow = (rawName, languageCode, aliasKind) => {
    const normalized = normalizeLocationName(rawName);
    if (!normalized) return;
    const key = `${normalized}${aliasKind}`;
    if (existingKeys.has(key) || plannedKeys.has(key)) return;
    plannedKeys.add(key);
    rows.push({
      id: stableUuid('alias', entity.id, aliasKind, normalized),
      entity_id: entity.id,
      alias: rawName,
      normalized_alias: normalized,
      language_code: languageCode,
      alias_kind: aliasKind,
      review_status: 'needs_review',
      source: 'llm_translation',
    });
  };

  for (const lang of LANGUAGE_ALIAS_ROWS) {
    for (const name of suggestion?.[lang] ?? []) addRow(name, lang, 'translated_name');
  }

  const obviousLanguageByNormalized = new Map();
  for (const lang of LANGUAGE_ALIAS_ROWS) {
    for (const name of suggestion?.[lang] ?? []) {
      const normalized = normalizeLocationName(name);
      if (normalized && !obviousLanguageByNormalized.has(normalized)) obviousLanguageByNormalized.set(normalized, lang);
    }
  }
  for (const name of suggestion?.historical ?? []) {
    const normalized = normalizeLocationName(name);
    addRow(name, obviousLanguageByNormalized.get(normalized) ?? null, 'former_name');
  }

  return rows;
};

/**
 * Report-only cross-entity ambiguity check: which of `plannedRows`'
 * normalized aliases would end up owned by more than one distinct entity,
 * once combined with `aliasOwnership` (a Map<normalizedAlias,
 * Set<entityId>> the caller builds from existing approved aliases -- see
 * lib/kgAliasGuard.js's buildAliasOwnership for the same shape). This
 * function never mutates or vetoes anything; the resolver's own
 * suppressAmbiguousExactMatches (lib/kgAliasGuard.js) is what actually keeps
 * an ambiguous alias from being trusted at match time, and it re-derives
 * ambiguity from the live `kg_entity_aliases` table at resolve time anyway.
 * This is purely a heads-up for the report a reviewer reads.
 *
 * @param {Array<{entity_id:string, normalized_alias:string}>} plannedRows
 * @param {Map<string, Set<string>>} aliasOwnership
 * @returns {Array<{normalized_alias:string, entity_ids:string[]}>}
 */
export const crossEntityCollisions = (plannedRows, aliasOwnership) => {
  const ownership = new Map();
  for (const [normalized, owners] of asMap(aliasOwnership)) {
    ownership.set(normalized, new Set(owners));
  }

  const touched = new Set();
  for (const row of plannedRows ?? []) {
    if (!row?.normalized_alias || !row?.entity_id) continue;
    touched.add(row.normalized_alias);
    const owners = ownership.get(row.normalized_alias) ?? new Set();
    owners.add(row.entity_id);
    ownership.set(row.normalized_alias, owners);
  }

  const collisions = [];
  for (const normalized of touched) {
    const owners = ownership.get(normalized);
    if (owners && owners.size > 1) collisions.push({ normalized_alias: normalized, entity_ids: [...owners].sort() });
  }
  return collisions.sort((a, b) => a.normalized_alias.localeCompare(b.normalized_alias));
};
