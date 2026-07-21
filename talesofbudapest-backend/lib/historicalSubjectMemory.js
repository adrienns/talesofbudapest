import crypto from 'node:crypto';
import { canonicalizeDomainText, canonicalizeDomainToken } from './historicalOcrLexicon.js';
import {
  canonicalizeLocationText,
  canonicalizeLocationToken,
  isLocationLikeMention,
} from './hungarianOcrGazetteer.js';

const PERSON_TYPES = new Set(['person', 'family']);
const NONPERSON_TYPES = new Set(['building', 'business', 'organisation', 'work', 'movement', 'place']);
const TITLES = new Set(['r', 'rav', 'rabbi', 'dr', 'mr', 'mrs', 'ms', 'professor', 'prof', 'saint', 'st']);
const ROLE_WORDS = new Set(['rabbi', 'scholar', 'author', 'writer', 'architect', 'doctor', 'teacher', 'mayor', 'ruler', 'king', 'queen']);
const BUILDING_WORDS = new Set(['synagogue', 'temple', 'school', 'building', 'house', 'hospital', 'cemetery', 'church', 'hall', 'museum', 'library', 'institute']);
const GROUP_WORDS = new Set(['community', 'family', 'group', 'people', 'they', 'followers', 'students', 'workers', 'burgher', 'burghers', 'population', 'inhabitants', 'residents']);
// Ordinary narrative object heads that GLiNER misses but the subject memory
// must track so possessives and definite descriptions stay resolvable.
const TRACKABLE_HEADS = new Set([...BUILDING_WORDS, 'tomb', 'grave', 'tombstone', 'gravestone', 'stele', 'plaque', 'inscription', 'monument', 'statue', 'bath', 'bridge', 'mill', 'factory', 'shop', 'press', 'yeshiva', 'mikveh', 'quarter', 'district', 'street', 'tower', 'wall', 'gate', 'book']);
const PRONOUN_EXPECTED = {
  he: 'person', him: 'person', his: 'person', she: 'person', her: 'person', hers: 'person',
  they: 'group', them: 'group', their: 'group', theirs: 'group',
  it: 'thing', its: 'thing',
};

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
const words = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').replace(/(?:['’]s)\b/giu, '')
  .toLowerCase().match(/[a-z0-9]+/gu) ?? [];
const phrase = (value) => words(value).join(' ');
// Module-level places index for location OCR unique-hit repair. Extract /
// browser call setPlacesGazetteerIndex once; tests may inject a fixture.
let placesGazetteerIndex = null;
let placeRepairLog = [];

/** Install the Budapest places index used for location identity folding. */
export const setPlacesGazetteerIndex = (index) => {
  placesGazetteerIndex = index ?? null;
  placeRepairLog = [];
};

export const getPlaceRepairLog = () => placeRepairLog.slice();
export const clearPlaceRepairLog = () => { placeRepairLog = []; };

// OCR damage must not fork one building into two entities: `synagoque` and
// `synagogue` are the same word, so identity keys and roles read the folded
// form while the raw surface survives as an alias. Location-like labels also
// fold unique-hit Hungarian gazetteer confusion (Dohdny → Dohány) without
// rewriting immutable evidence.
const canonicalPhrase = (value, { locationLike = false } = {}) => {
  if (locationLike && placesGazetteerIndex) {
    return canonicalizeLocationText(value, placesGazetteerIndex, { log: placeRepairLog }).identity_key;
  }
  return words(value).map(canonicalizeDomainToken).join(' ');
};
const displayPhrase = (value, { locationLike = false } = {}) => {
  if (locationLike && placesGazetteerIndex) {
    return canonicalizeLocationText(value, placesGazetteerIndex, { log: placeRepairLog }).text;
  }
  return canonicalizeDomainText(value);
};
const entityClass = (type) => PERSON_TYPES.has(type) ? 'person' : type === 'group' || type === 'organisation' || type === 'family' ? 'group' : 'thing';
const entityId = (sourceId, type, key) => `se_${hash(`${sourceId}\u001f${type}\u001f${key}`)}`;

const nameTokens = (value) => words(String(value ?? '')
  .replace(/\br\s*\(\s*av\s*\)/giu, 'rav')
  .replace(/\bb\s*\(\s*en\s*\)/giu, 'ben'))
  .filter((word) => !TITLES.has(word));
const isNameLike = (mention) => PERSON_TYPES.has(mention.type) && nameTokens(mention.normalized_text ?? mention.text).length > 0;
const mentionLabel = (mention) => String(mention.normalized_text ?? mention.text ?? '').replace(/\s+/gu, ' ').trim();
const SHORT_ALIAS_BLOCKED = new Set([...TITLES, ...ROLE_WORDS, 'baron', 'count', 'emperor', 'pope', 'lady', 'magister', 'the', 'great', 'ben', 'ibn', 'of']);
const standaloneNameToken = (token) => token && !SHORT_ALIAS_BLOCKED.has(token) && !/^[ivxlcdm]+$/u.test(token);

/**
 * Repair only exact, adjacent source-local type drift. A lone "Mendel" tagged
 * as place one page after person "Mendel" is continuity evidence; fuzzy or
 * distant names remain untouched and therefore reviewable.
 */
export const correctSourceLocalPersonMentionTypes = (mentions) => {
  const rows = mentions.map((mention) => ({ ...mention }));
  const peopleBySurface = new Map();
  for (const mention of rows.filter((row) => PERSON_TYPES.has(row.type))) {
    const key = phrase(mentionLabel(mention));
    if (!key) continue;
    const values = peopleBySurface.get(key) ?? []; values.push(mention); peopleBySurface.set(key, values);
  }
  const corrections = [];
  for (const mention of rows) {
    if (!NONPERSON_TYPES.has(mention.type)) continue;
    const anchors = peopleBySurface.get(phrase(mentionLabel(mention))) ?? [];
    const nearest = anchors.sort((left, right) => Math.abs(left.page - mention.page) - Math.abs(right.page - mention.page))[0];
    if (!nearest || Math.abs(nearest.page - mention.page) > 1 || words(mentionLabel(mention)).length > 2) continue;
    const oldType = mention.type;
    mention.type = 'person';
    if (nearest.subject_entity_id) mention.subject_entity_id = nearest.subject_entity_id;
    corrections.push({
      mention_id: mention.mention_id, page_ref: mention.page, start_offset: mention.start_offset,
      surface: mentionLabel(mention), from_type: oldType, to_type: 'person',
      anchor_mention_id: nearest.mention_id, reason: 'exact_adjacent_person_type_continuity',
    });
  }
  return { mentions: rows, corrections };
};

/** Add a first/last-name alias only when it identifies one source-local person. */
export const addSafePersonShortAliases = ({ entities, aliasIndex = null }) => {
  const owners = new Map();
  const existingSingleOwners = new Map();
  for (const entity of entities.values()) {
    if (entity.entity_class !== 'person') continue;
    for (const alias of entity.aliases ?? []) {
      const tokens = nameTokens(alias);
      if (tokens.length !== 1) continue;
      const ids = existingSingleOwners.get(tokens[0]) ?? new Set(); ids.add(entity.entity_id); existingSingleOwners.set(tokens[0], ids);
    }
  }
  for (const entity of entities.values()) {
    if (entity.entity_class !== 'person') continue;
    const canonical = phrase(entity.label);
    for (const alias of [...(entity.aliases ?? [])]) {
      const tokens = nameTokens(alias);
      if (tokens.length !== 1 || phrase(alias) === canonical) continue;
      if (!standaloneNameToken(tokens[0]) || (existingSingleOwners.get(tokens[0])?.size ?? 0) > 1) entity.aliases.delete(alias);
    }
  }
  const nonPersonAliases = new Set([...entities.values()]
    .filter((entity) => entity.entity_class !== 'person')
    .flatMap((entity) => [...(entity.aliases ?? []), entity.label])
    .map((alias) => phrase(alias)));
  for (const entity of entities.values()) {
    if (entity.entity_class !== 'person') continue;
    const full = [...(entity.aliases ?? [])].map(nameTokens).find((tokens) => tokens.length >= 2);
    if (!full) continue;
    for (const token of new Set([full[0], full.at(-1)].filter(standaloneNameToken))) {
      if (nonPersonAliases.has(token)) continue;
      const ids = owners.get(token) ?? new Set(); ids.add(entity.entity_id); owners.set(token, ids);
    }
  }
  for (const [token, ids] of owners) {
    if (ids.size !== 1) continue;
    const id = [...ids][0];
    entities.get(id)?.aliases.add(token);
    if (aliasIndex) {
      const indexed = aliasIndex.get(token) ?? new Set(); indexed.add(id); aliasIndex.set(token, indexed);
    }
  }
};
const GENERIC_COLLECTIVE_TERMS = new Set(['people', 'person', 'persons', 'men', 'women', 'children', 'residents', 'inhabitants', 'citizens', 'visitors', 'jew', 'jews']);
const GENERIC_BUILDING_TERMS = new Set(['synagogue', 'synagogues', 'shul', 'building', 'buildings', 'cemetery', 'cemeteries', 'museum', 'museums', 'house', 'houses', 'prayer', 'prayerhouse', 'prayerhouses', 'temple', 'temples', 'school', 'schools', 'hospital', 'hospitals', 'church', 'churches', 'hall', 'halls', 'library', 'libraries']);
const GENERIC_BUILDING_MODIFIERS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'its', 'their', 'new', 'old', 'small', 'large', 'former', 'other', 'no', 'jewish']);
const genericCollectiveSurface = (value) => {
  const tokenList = words(value);
  const withoutDeterminer = ['a', 'an', 'some', 'the', 'these', 'those', 'many', 'most', 'all'].includes(tokenList[0]) ? tokenList.slice(1) : tokenList;
  return withoutDeterminer.length === 1 && GENERIC_COLLECTIVE_TERMS.has(withoutDeterminer[0]);
};
const genericBuildingSurface = (value) => {
  const tokenList = words(value);
  return tokenList.length > 0 && tokenList.every((token) => GENERIC_BUILDING_TERMS.has(token) || GENERIC_BUILDING_MODIFIERS.has(token))
    && tokenList.some((token) => GENERIC_BUILDING_TERMS.has(token));
};

// Mentions remain in the evidence ledger, but only source-local identities
// may enter subject memory / the entity index. This is the ingestion boundary:
// browser rendering must not be responsible for repairing noun/date spam.
export const entityEligibilityReason = (mention) => {
  if (['date', 'event', 'movement'].includes(mention.type)) return 'non_identity_mention_type';
  if (genericCollectiveSurface(mention.normalized_text ?? mention.text)) return 'generic_collective_not_identity';
  return null;
};

/**
 * Give every explicit mention a source-local entity ID. Person aliases are
 * merged only when a short form names exactly one longer form in this source.
 */
export const buildSubjectEntityIndex = ({ sourceId, mentions }) => {
  const typeCorrection = correctSourceLocalPersonMentionTypes(mentions);
  const rows = typeCorrection.mentions;
  const entityEligibilityLog = [];
  for (const mention of rows) {
    const reason = entityEligibilityReason(mention);
    if (!reason) continue;
    mention.subject_entity_id = null;
    entityEligibilityLog.push({ mention_id: mention.mention_id, page_ref: mention.page, start_offset: mention.start_offset, surface: mentionLabel(mention), type: mention.type, reason });
  }
  const eligibleRows = rows.filter((mention) => !entityEligibilityReason(mention));
  const people = eligibleRows.filter(isNameLike);
  const fullNames = new Map();
  for (const mention of people) {
    const tokenList = nameTokens(mentionLabel(mention));
    if (tokenList.length >= 2) fullNames.set(tokenList.join(' '), tokenList);
  }
  const owners = new Map();
  for (const [full, tokenList] of fullNames) {
    for (const token of new Set([tokenList[0], tokenList.at(-1)])) {
      const list = owners.get(token) ?? new Set();
      list.add(full); owners.set(token, list);
    }
  }
  const canonicalForPerson = (mention) => {
    const tokenList = nameTokens(mentionLabel(mention));
    if (!tokenList.length) return phrase(mentionLabel(mention));
    const direct = tokenList.join(' ');
    if (fullNames.has(direct)) return direct;
    if (tokenList.length === 1 && (owners.get(tokenList[0])?.size ?? 0) === 1) return [...owners.get(tokenList[0])][0];
    return direct;
  };
  const entities = new Map();
  const aliasIndex = new Map();
  const addAlias = (alias, id) => {
    const key = phrase(alias); if (!key) return;
    const values = aliasIndex.get(key) ?? new Set(); values.add(id); aliasIndex.set(key, values);
  };
  for (const mention of eligibleRows) {
    const label = mentionLabel(mention);
    const type = mention.type ?? 'thing';
    // An address anchor distinguishes same-named buildings: the "great"
    // synagogue at 23 and the "small" synagogue at 26 are separate entities,
    // not one generic synagogue.
    const anchor = !isNameLike(mention) ? mention.address_anchor : null;
    // OCR variants fold into one identity: `synagoque` is not a second
    // building. The damaged surface stays searchable as an alias. Location
    // confusion (Dohdny/Dohany) folds only on a unique gazetteer hit.
    const locationLike = !isNameLike(mention) && isLocationLikeMention(mention);
    let base;
    let displayLabel;
    if (isNameLike(mention)) {
      base = canonicalForPerson(mention);
      displayLabel = label;
    } else if (locationLike && placesGazetteerIndex) {
      const repaired = canonicalizeLocationText(label, placesGazetteerIndex, { log: placeRepairLog });
      base = repaired.identity_key;
      displayLabel = repaired.text;
    } else {
      base = canonicalPhrase(label);
      displayLabel = displayPhrase(label);
    }
    const canonical = anchor?.key ? `${base} @ ${anchor.key}` : base;
    const id = entityId(sourceId, entityClass(type), canonical || `${mention.page}:${mention.start_offset}`);
    mention.subject_entity_id = id;
    let entity = entities.get(id);
    if (!entity) {
      entity = {
        entity_id: id, type, entity_class: entityClass(type), label: anchor ? `${displayLabel || base} (${anchor.display})` : (displayLabel || canonical),
        aliases: new Set(), roles: new Set(), mention_ids: [], last_mention_id: null, last_page: null, last_offset: null,
        presentation_eligible: !(type === 'building' && !anchor && genericBuildingSurface(label)),
      };
      if (anchor) entity.address = { street: anchor.street, house_number: anchor.house_number, display: anchor.display, center: anchor.center };
      entities.set(id, entity);
    }
    // Aliases keep the plain surface form; the anchored canonical key is an
    // identity device, not something a reader ever writes.
    entity.aliases.add(label); entity.aliases.add(base);
    if (anchor?.display) entity.aliases.add(anchor.display);
    for (const token of words(label).map((token) => (
      locationLike && placesGazetteerIndex ? canonicalizeLocationToken(token, placesGazetteerIndex) : canonicalizeDomainToken(token)
    ))) if (ROLE_WORDS.has(token)) entity.roles.add(token);
    if (/^\s*r\.\s+/iu.test(label)) entity.roles.add('rabbi');
    if (type === 'building' && /\bsynagog(?:ue|ues)\b/iu.test(displayPhrase(label, { locationLike }))) entity.roles.add('synagogue');
    entity.mention_ids.push(mention.mention_id);
    for (const alias of entity.aliases) addAlias(alias, id);
  }
  addSafePersonShortAliases({ entities, aliasIndex });
  return { mentions: rows, entities, aliasIndex, entityEligibilityLog, entityTypeCorrectionsLog: typeCorrection.corrections };
};

export const createSubjectState = ({ sourceId, entities, aliasIndex, persisted = null }) => {
  const state = { version: 1, source_id: sourceId, entities: new Map(), aliasIndex: new Map(), focus: { active: null, person: null, thing: null, group: null }, ordinal_pair: null, last_page: null };
  for (const [id, entity] of entities ?? []) state.entities.set(id, { ...entity, aliases: new Set(entity.aliases ?? []), roles: new Set(entity.roles ?? []) });
  for (const [alias, ids] of aliasIndex ?? []) state.aliasIndex.set(alias, new Set(ids));
  if (persisted?.source_id === sourceId && persisted.version === 1) {
    for (const saved of persisted.entities ?? []) {
      state.entities.set(saved.entity_id, { ...saved, aliases: new Set(saved.aliases ?? []), roles: new Set(saved.roles ?? []) });
      for (const alias of saved.aliases ?? []) {
        const key = phrase(alias); const ids = state.aliasIndex.get(key) ?? new Set(); ids.add(saved.entity_id); state.aliasIndex.set(key, ids);
      }
    }
    state.focus = { ...state.focus, ...(persisted.focus ?? {}) };
    state.ordinal_pair = persisted.ordinal_pair ?? null;
    state.last_page = persisted.last_page ?? null;
  }
  return state;
};

// Dates and abstract event nuggets are never discourse subjects; letting them
// hold focus produced nonsense antecedents such as "July 17, 1806".
const NON_FOCUS_TYPES = new Set(['date', 'event']);
const focusable = (entity) => entity && !NON_FOCUS_TYPES.has(entity.type);
const compatible = (entity, expected) => entity && focusable(entity) && (!expected || entity.entity_class === expected || (expected === 'thing' && entity.entity_class === 'thing'));
const pickFocus = (state, expected, role = null) => {
  const ordered = [state.focus.active, state.focus[expected], ...[...state.entities.values()].sort((a, b) => (b.last_page ?? -1) - (a.last_page ?? -1) || (b.last_offset ?? -1) - (a.last_offset ?? -1)).map((row) => row.entity_id)];
  for (const id of ordered) {
    const entity = state.entities.get(id);
    if (!compatible(entity, expected)) continue;
    if (role && !entity.roles.has(role) && !words(entity.label).includes(role)) continue;
    return entity;
  }
  return null;
};

const touch = (state, entity, mention, clause) => {
  if (!entity) return;
  // An indexed entity is always referencable: fall back to its last explicit
  // mention so a focus reached via resolution still yields an antecedent.
  entity.last_mention_id = mention?.mention_id ?? entity.last_mention_id ?? (entity.mention_ids ?? []).at(-1) ?? null;
  entity.last_page = clause.page_ref;
  entity.last_offset = clause.start_offset;
  state.focus[entity.entity_class] = entity.entity_id;
  state.focus.active = entity.entity_id;
};

const referenceExpressions = (text) => [...String(text ?? '').matchAll(/\b(he|him|his|she|her|hers|they|them|their|theirs|it|its|the\s+(?:former|latter|rabbi|scholar|author|writer|architect|doctor|teacher|mayor|ruler|king|queen|synagogue|temple|school|building|house|hospital|cemetery|church|hall|museum|library|institute)|(?:this|that|these|those)\s+[a-z][a-z-]*)\b/giu)]
  .map((match) => ({ surface: match[1], index: match.index }));

const expectedFor = (surface) => {
  const first = words(surface)[0];
  if (['he', 'him', 'his', 'she', 'her', 'hers'].includes(first) || /\b(rabbi|scholar|author|writer|architect|doctor|teacher|mayor|ruler|king|queen)\b/iu.test(surface)) return 'person';
  if (['they', 'them', 'their', 'theirs'].includes(first)) return 'group';
  return 'thing';
};

const roleFor = (surface) => words(surface).find((word) => ROLE_WORDS.has(word) || BUILDING_WORDS.has(word)) ?? null;

const byRecency = (a, b) => (b.last_page ?? -1) - (a.last_page ?? -1) || (b.last_offset ?? -1) - (a.last_offset ?? -1);
const entityMatchesHead = (entity, head) => !head || entity.roles.has(head) || entity.head === head || words(entity.label).includes(head);

/**
 * Typed resolution with explicit ambiguity. The focus stack is the discourse
 * rule, not a guess; away from focus, two comparably recent compatible
 * candidates are reported as ambiguous instead of silently picked.
 */
const resolveTyped = (state, { expected, head = null, page = null }) => {
  const seen = new Set();
  const matches = [];
  const consider = (id, isFocus) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const entity = state.entities.get(id);
    if (!compatible(entity, expected)) return;
    if (!entityMatchesHead(entity, head)) return;
    // Away from the focus stack, only recently discussed entities are
    // antecedent candidates; an untouched mention qualifies only through a
    // discriminating head (e.g. "the synagogue" after a named synagogue).
    if (!isFocus) {
      const recent = entity.last_page != null && (page == null || page - entity.last_page <= 2);
      if (!recent && !(head && entityMatchesHead(entity, head))) return;
      if (entity.last_page == null && !head) return;
    }
    matches.push({ entity, isFocus });
  };
  consider(state.focus.active, true);
  consider(state.focus[expected], true);
  for (const row of [...state.entities.values()].sort(byRecency)) consider(row.entity_id, false);
  if (!matches.length) return { status: 'unresolved' };
  if (matches[0].isFocus || matches.length === 1) return { status: 'resolved', entity: matches[0].entity };
  const leaderPage = matches[0].entity.last_page ?? -1;
  const runnerPage = matches[1].entity.last_page ?? -1;
  if (leaderPage - runnerPage >= 2) return { status: 'resolved', entity: matches[0].entity };
  return { status: 'ambiguous', candidates: matches.slice(0, 4).map((match) => match.entity) };
};

const mintLedgerMention = (state, phraseRow, type) => ({
  mention_id: `m_${hash(`${state.source_id}${phraseRow.page}${phraseRow.start_offset}${phraseRow.end_offset}ledger`)}`,
  page: phraseRow.page,
  start_offset: phraseRow.start_offset,
  end_offset: phraseRow.end_offset,
  text: phraseRow.source_text ?? phraseRow.text,
  normalized_text: phraseRow.text,
  type,
  source: 'noun_ledger',
});

const ensureTrackedEntity = (state, { key, type, head, ownerEntityId = null }) => {
  const id = entityId(state.source_id, entityClass(type), key);
  let entity = state.entities.get(id);
  if (!entity) {
    entity = {
      entity_id: id, type, entity_class: entityClass(type), label: ownerEntityId ? `${state.entities.get(ownerEntityId)?.label ?? 'owned'} ${head}` : head,
      aliases: new Set([head]), roles: new Set([head]), head, owner_entity_id: ownerEntityId,
      mention_ids: [], last_mention_id: null, last_page: null, last_offset: null,
      origin: 'noun_ledger', presentation_eligible: Boolean(ownerEntityId && type === 'group'),
    };
    state.entities.set(id, entity);
  }
  return entity;
};

const trackedTypeFor = (head) => BUILDING_WORDS.has(head) ? 'building' : GROUP_WORDS.has(head) ? 'group' : 'thing';

const registerLedgerEntity = ({ state, clause, phraseRow, head, ownerEntityId, ledgerMentions }) => {
  const type = trackedTypeFor(head);
  const key = ownerEntityId ? `${ownerEntityId}:owned:${head}` : `tracked:${head}`;
  const entity = ensureTrackedEntity(state, { key, type, head, ownerEntityId });
  const contextualAlias = words(phraseRow.text).filter((token) => !PRONOUN_EXPECTED[token]).join(' ');
  if (contextualAlias) entity.aliases.add(contextualAlias);
  if (ownerEntityId && contextualAlias) entity.label = `${state.entities.get(ownerEntityId)?.label ?? 'owned'} ${contextualAlias}`;
  const mention = mintLedgerMention(state, phraseRow, type);
  mention.subject_entity_id = entity.entity_id;
  if (!entity.mention_ids.includes(mention.mention_id)) entity.mention_ids.push(mention.mention_id);
  ledgerMentions.set(mention.mention_id, mention);
  touch(state, entity, mention, clause);
  return entity;
};

const localTypedCandidate = ({ state, candidates, expected, phraseStart }) => {
  const local = [...new Map(candidates
    .filter(({ mention, entity }) => mention.start_offset < phraseStart && compatible(entity, expected))
    .map((row) => [row.entity.entity_id, row])).values()];
  if (!local.length) return null;
  if (local.length === 1) return { status: 'resolved', entity: local[0].entity, mention: local[0].mention, local: true };
  return { status: 'ambiguous', candidates: local.slice(0, 4).map((row) => row.entity), local: true };
};

const localBindingAllowed = (kind, first) => (
  kind === 'pronoun' && ['he', 'she', 'they'].includes(first)
  || kind === 'possessive' && ['his', 'hers', 'their', 'theirs'].includes(first)
);

const processLedgerPhrase = ({ state, clause, phraseRow, overlapsExplicit, references, ambiguities, ledgerMentions, unresolved, localCandidates }) => {
  const first = words(phraseRow.text)[0];
  const head = words(phraseRow.head ?? '')[0] ?? null;
  const kind = phraseRow.reference_kind;
  const pushReference = (entity, resolutionSource = 'deterministic_subject_memory', antecedentMentionId = null) => {
    const mentionId = antecedentMentionId ?? entity.last_mention_id;
    if (!mentionId) return;
    references.push({
      clause_id: clause.clause_id, antecedent_mention_id: mentionId,
      resolved_entity_id: entity.entity_id, surface: phraseRow.text,
      start_offset: phraseRow.start_offset,
      resolution_source: resolutionSource,
    });
  };
  const pushAmbiguity = (candidates, expected) => ambiguities.push({
    clause_id: clause.clause_id, page_ref: clause.page_ref, surface: phraseRow.text,
    expected, reference_kind: kind, start_offset: phraseRow.start_offset,
    candidate_entity_ids: candidates.map((entity) => entity.entity_id),
  });
  // Never fail silently: an unresolved reference leaves a record naming why.
  const pushUnresolved = (expected, why) => unresolved.push({
    clause_id: clause.clause_id, page_ref: clause.page_ref, surface: phraseRow.text,
    expected, reference_kind: kind, start_offset: phraseRow.start_offset, why,
  });

  if (kind === 'ordinal') {
    const member = phraseRow.ordinal_member ?? words(phraseRow.text).find((word) => word === 'former' || word === 'latter');
    const pair = state.ordinal_pair;
    if (!member || !pair || pair.entities?.length !== 2) {
      pushUnresolved('thing', 'ordinal_pair_not_safely_bound');
      return;
    }
    const selected = pair.entities[member === 'former' ? 0 : 1];
    const entity = state.entities.get(selected.entity_id);
    if (!entity || !selected.mention_id) {
      pushUnresolved('thing', 'ordinal_pair_candidate_missing');
      return;
    }
    pushReference(entity, 'deterministic_ordinal_pair', selected.mention_id);
    touch(state, entity, null, clause);
    return;
  }

  if (kind === 'pronoun') {
    const expected = PRONOUN_EXPECTED[first];
    if (!expected) return;
    // A name already stated in this clause is more immediate evidence than
    // a focus carried from a previous sentence. This matters for "Seybold
    // noted that he..." and appositions such as "Mendel ... his position".
    // Object pronouns deliberately keep the prior discourse focus: in
    // "Mendel greeted him", the local Mendel is not the object.
    let result = localBindingAllowed(kind, first)
      ? localTypedCandidate({ state, candidates: localCandidates, expected, phraseStart: phraseRow.start_offset })
      : null;
    if (!result) result = resolveTyped(state, { expected, page: clause.page_ref });
    // "They" also covers plural things (the gravestones ... They come from...);
    // fall back to the thing focus when no group candidate exists.
    // they/them/their are inherently plural regardless of the tagger's hint.
    // When no clean group antecedent exists, plural things (the gravestones
    // ... They come from ...) are the natural reading; keep the group
    // ambiguity only if things do not resolve either.
    if (result.status !== 'resolved' && expected === 'group') {
      const thingResult = resolveTyped(state, { expected: 'thing', page: clause.page_ref });
      if (thingResult.status === 'resolved') result = thingResult;
    }
    if (result.status === 'resolved') {
      // A same-clause binding carries its explicit local mention even when
      // the entity has not yet been touched by an earlier clause. Do not
      // emit a contradictory unresolved confession for that valid binding.
      if (!(result.mention?.mention_id ?? result.entity.last_mention_id)) pushUnresolved(expected, 'candidate_without_mention');
      pushReference(result.entity, result.local ? 'deterministic_local_clause' : undefined, result.mention?.mention_id); touch(state, result.entity, result.mention ?? null, clause);
    }
    else if (result.status === 'ambiguous') pushAmbiguity(result.candidates, expected);
    else pushUnresolved(expected, 'no_candidate');
    return;
  }
  if (kind === 'possessive') {
    const ownerExpected = PRONOUN_EXPECTED[first];
    if (!ownerExpected) return;
    const owner = localBindingAllowed(kind, first)
      ? localTypedCandidate({ state, candidates: localCandidates, expected: ownerExpected, phraseStart: phraseRow.start_offset })
        ?? resolveTyped(state, { expected: ownerExpected, page: clause.page_ref })
      : resolveTyped(state, { expected: ownerExpected, page: clause.page_ref });
    if (owner.status === 'ambiguous') { pushAmbiguity(owner.candidates, ownerExpected); return; }
    if (owner.status !== 'resolved') { pushUnresolved(ownerExpected, 'no_candidate'); return; }
    if (!(owner.mention?.mention_id ?? owner.entity.last_mention_id)) {
      pushUnresolved(ownerExpected, 'candidate_without_mention');
      return;
    }
    pushReference(owner.entity, owner.local ? 'deterministic_local_clause' : undefined, owner.mention?.mention_id);
    touch(state, owner.entity, owner.mention ?? null, clause);
    // The owned object is its own entity; "his tomb" never merges a tomb
    // into its owner.
    if (head && (TRACKABLE_HEADS.has(head) || GROUP_WORDS.has(head))) {
      registerLedgerEntity({ state, clause, phraseRow, head, ownerEntityId: owner.entity.entity_id, ledgerMentions });
    }
    return;
  }
  if (kind === 'definite') {
    // A trackable/building head overrides the tagger's type: a possessor name
    // inside the phrase ("the former Mendel Houses") must not make it a person.
    // GLiNER often labels "the king" / "the Queen" as things. A role title
    // denotes a person (or plural group) before ordinary object-head rules.
    const roleHead = head?.replace(/s$/u, '') ?? null;
    const expected = roleHead && ROLE_WORDS.has(roleHead) ? (head.endsWith('s') ? 'group' : 'person')
      : head && (TRACKABLE_HEADS.has(head) || BUILDING_WORDS.has(head)) ? 'thing'
      : phraseRow.type === 'person' ? 'person' : phraseRow.type === 'group' ? 'group' : 'thing';
    // A definite phrase naming a known alias ("the Orczy House") resolves by
    // exact alias before any head-based candidate search.
    const aliasKey = phrase(String(phraseRow.text).replace(/^(?:the|this|that|these|those)\s+/iu, ''));
    const exactAliasMatches = [...(state.aliasIndex.get(aliasKey) ?? [])]
      .map((id) => state.entities.get(id))
      .filter(Boolean);
    // A unique exact source alias is stronger evidence than GLiNER's coarse
    // entity class: "the Budapest Historical Museum" is an organisation,
    // even if the phrase was tagged as a thing.
    if (exactAliasMatches.length === 1) { pushReference(exactAliasMatches[0]); touch(state, exactAliasMatches[0], null, clause); return; }
    const aliasMatches = exactAliasMatches.filter((entity) => compatible(entity, expected));
    if (aliasMatches.length === 1) { pushReference(aliasMatches[0]); touch(state, aliasMatches[0], null, clause); return; }
    if (aliasMatches.length > 1) { pushAmbiguity(aliasMatches.slice(0, 4), expected); return; }
    const discriminating = head && (ROLE_WORDS.has(head) || TRACKABLE_HEADS.has(head) || GROUP_WORDS.has(head));
    const result = resolveTyped(state, { expected, head: discriminating ? head : null, page: clause.page_ref });
    if (result.status === 'resolved') { pushReference(result.entity); touch(state, result.entity, null, clause); return; }
    if (result.status === 'ambiguous') { pushAmbiguity(result.candidates, expected); return; }
    if (discriminating && !ROLE_WORDS.has(head) && !overlapsExplicit) {
      registerLedgerEntity({ state, clause, phraseRow, head, ownerEntityId: null, ledgerMentions });
      return;
    }
    pushUnresolved(expected, 'no_candidate');
    return;
  }
  // Plain noun phrase: a first mention such as "a tomb" introduces a
  // provisional tracked entity so a later "the tomb" / "it" can resolve.
  if (!phraseRow.named && !overlapsExplicit && head && (TRACKABLE_HEADS.has(head) || GROUP_WORDS.has(head))) {
    registerLedgerEntity({ state, clause, phraseRow, head, ownerEntityId: null, ledgerMentions });
  }
};

/** Process clauses in source order. References see prior clauses/pages only. */
export const resolveSubjectReferences = ({ state, clauses, mentionById, nounPhrases = [] }) => {
  const transitions = [];
  const references = [];
  const ambiguities = [];
  const unresolved = [];
  const ledgerMentions = new Map();
  for (const clause of [...clauses].sort((a, b) => a.page_ref - b.page_ref || a.start_offset - b.start_offset)) {
    const floor = Math.max(state.last_page ?? -Infinity, state.highest_page ?? -Infinity);
    if (clause.page_ref <= (state.last_page ?? -Infinity) || clause.page_ref < floor) {
      throw new Error(`subject memory already advanced past page ${clause.page_ref}; pages must be processed in ascending order`);
    }
    state.highest_page = Math.max(state.highest_page ?? -Infinity, clause.page_ref);
    const before = { ...state.focus };
    const clauseEnd = clause.end_offset ?? Infinity;
    const phrases = nounPhrases
      .filter((row) => row.page === clause.page_ref && row.start_offset >= clause.start_offset && row.start_offset < clauseEnd)
      .sort((a, b) => a.start_offset - b.start_offset);
    const candidates = clause.mention_ids.map((id) => mentionById.get(id)).filter(Boolean)
      .map((mention) => ({ mention, entity: state.entities.get(mention.subject_entity_id) }))
      .filter((row) => row.entity && focusable(row.entity) && (row.entity.entity_class === 'person' || row.entity.entity_class === 'thing' || row.entity.entity_class === 'group'))
      .sort((left, right) => left.mention.start_offset - right.mention.start_offset);
    if (phrases.length) {
      const explicitSpans = clause.mention_ids.map((id) => mentionById.get(id)).filter(Boolean)
        .map((mention) => [mention.start_offset, mention.end_offset]);
      for (const phraseRow of phrases) {
        const overlapsExplicit = explicitSpans.some(([start, end]) => phraseRow.start_offset < end && phraseRow.end_offset > start);
        processLedgerPhrase({ state, clause, phraseRow, overlapsExplicit, references, ambiguities, ledgerMentions, unresolved, localCandidates: candidates });
      }
      const coveredOrdinals = phrases.filter((row) => row.reference_kind === 'ordinal')
        .map((row) => [row.start_offset, row.end_offset]);
      for (const expression of referenceExpressions(clause.text).filter((row) => /\b(?:former|latter)\b/iu.test(row.surface))) {
        const start = clause.start_offset + expression.index;
        if (coveredOrdinals.some(([left, right]) => start >= left && start < right)) continue;
        processLedgerPhrase({
          state, clause,
          phraseRow: { page: clause.page_ref, start_offset: start, end_offset: start + expression.surface.length, text: expression.surface, head: expression.surface, type: 'thing', reference_kind: 'ordinal', ordinal_member: words(expression.surface).at(-1) },
          overlapsExplicit: false, references, ambiguities, ledgerMentions, unresolved, localCandidates: candidates,
        });
      }
    } else {
      for (const expression of referenceExpressions(clause.text)) {
        if (/\b(?:former|latter)\b/iu.test(expression.surface)) {
          const start = clause.start_offset + expression.index;
          processLedgerPhrase({
            state, clause,
            phraseRow: { page: clause.page_ref, start_offset: start, end_offset: start + expression.surface.length, text: expression.surface, head: expression.surface, type: 'thing', reference_kind: 'ordinal', ordinal_member: words(expression.surface).at(-1) },
            overlapsExplicit: false, references, ambiguities, ledgerMentions, unresolved, localCandidates: candidates,
          });
          continue;
        }
        const expected = expectedFor(expression.surface);
        let antecedent = pickFocus(state, expected, roleFor(expression.surface));
        // Plural "they" naturally covers plural things when no group exists.
        if (!antecedent?.last_mention_id && expected === 'group') antecedent = pickFocus(state, 'thing', null);
        if (!antecedent?.last_mention_id) continue;
        references.push({ clause_id: clause.clause_id, antecedent_mention_id: antecedent.last_mention_id, resolved_entity_id: antecedent.entity_id, surface: expression.surface, start_offset: clause.start_offset + expression.index, resolution_source: 'deterministic_subject_memory' });
      }
    }
    // Prefer an early non-prepositional mention. A nearby place must not displace
    // a named narrator such as "In Buda, R. Efraim...".
    const subject = candidates.find(({ mention }) => !/\b(?:in|at|from|to|near|within|of)\s*$/iu.test(clause.text.slice(0, Math.max(0, mention.start_offset - clause.start_offset))))
      ?? candidates[0];
    if (subject) touch(state, subject.entity, subject.mention, clause);
    const uniqueCandidates = [...new Map(candidates.map((row) => [row.entity.entity_id, row])).values()];
    if (uniqueCandidates.length === 2) {
      const between = clause.text.slice(
        Math.max(0, uniqueCandidates[0].mention.end_offset - clause.start_offset),
        Math.max(0, uniqueCandidates[1].mention.start_offset - clause.start_offset),
      );
      state.ordinal_pair = /\b(?:and|or|but)\b/iu.test(between)
        ? { clause_id: clause.clause_id, page_ref: clause.page_ref, entities: uniqueCandidates.map(({ entity, mention }) => ({ entity_id: entity.entity_id, mention_id: mention.mention_id })) }
        : null;
    } else state.ordinal_pair = null;
    transitions.push({
      clause_id: clause.clause_id, page_ref: clause.page_ref, before_focus: before, after_focus: { ...state.focus },
      references: references.filter((row) => row.clause_id === clause.clause_id),
      ambiguous_references: ambiguities.filter((row) => row.clause_id === clause.clause_id),
    });
  }
  return { references, transitions, ambiguities, unresolved, ledgerMentions: [...ledgerMentions.values()] };
};

const startsWithWords = (text, candidate) => {
  const actual = words(text);
  const expected = words(candidate);
  return expected.length > 0 && expected.length <= actual.length && expected.every((word, index) => actual[index] === word);
};

const containsWords = (text, candidate) => {
  const haystack = ` ${phrase(text)} `;
  const needle = phrase(candidate);
  return Boolean(needle) && haystack.includes(` ${needle} `);
};

const escapedPattern = (value) => words(value).map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s+');

// A name merely present in a clause is not necessarily its subject. This
// source-local syntax guard prevents an object alias ("referred to as Juden
// Gasse") from being promoted to fact subject while retaining explicit
// subjects, coordinated subjects, and named reporting attributions.
const safeSourceAliasBinding = (clauseText, alias, entity) => {
  const pattern = escapedPattern(alias);
  if (!pattern) return false;
  const match = new RegExp(`\\b${pattern}\\b`, 'iu').exec(String(clauseText ?? ''));
  if (!match) return false;
  const before = String(clauseText).slice(0, match.index).trim();
  const after = String(clauseText).slice(match.index + match[0].length).trim();
  if (!before || /^(?:the\s+)?$/iu.test(before)) return true;
  if (/\b(?:and|or)\s*$/iu.test(before) && /^(?:,\s*)?(?:was|were|is|are|had|has|did|could|would|became|remained|served|built|founded|occupied|lived|wrote|noted|said|reported)\b/iu.test(after)) return true;
  if (/^(?:in|on|at|by|after|before|during|from|until|around|about)\b[^,;]{0,100},\s*$/iu.test(before)) return true;
  if (entity?.entity_class === 'person') {
    if (/\bas\s*$/iu.test(before) && /^(?:notes?|writes?|says?|observes?|reports?|records?|describes?|recalls?)\b/iu.test(after)) return true;
    if (/\b(?:wrote|noted|said|reported|recorded|described|recalled)\s*$/iu.test(before)) return true;
  }
  return false;
};

const isClauseLeadingSubjectReference = (reference, clause) => {
  const first = words(reference.surface)[0];
  const definite = /^the\s+/iu.test(String(reference.surface ?? ''));
  if (!['he', 'she', 'they'].includes(first) && !definite) return false;
  const offset = Number(reference.start_offset) - Number(clause.start_offset);
  if (!Number.isFinite(offset) || offset < 0) return false;
  const prefix = clause.text.slice(0, offset);
  return /^(?:(?:while|and|but|however|then|later|also)\s+)?$/iu.test(prefix);
};

/**
 * Attach an item only when its subject has source-local evidence. References
 * elsewhere in the clause are participants, never a licence to make their
 * antecedent the fact subject ("Mendel greeted him" must not become a King
 * Matthias fact). The structured failure is intentionally returned so callers
 * can persist a machine-readable confession rather than guessing.
 */
export const resolveItemSubjectAttribution = ({ item, clauseById, references, mentionById, state }) => {
  const itemClauses = (item.clause_ids ?? []).map((id) => clauseById.get(id)).filter(Boolean);
  const possessiveReferences = (references ?? []).filter((reference) => reference.resolved_entity_id
    && itemClauses.some((clause) => clause.clause_id === reference.clause_id && /^(?:its|his|her|their)\b/iu.test(String(reference.surface ?? '').trim())));
  const ownedCandidates = [...state.entities.values()].filter((entity) => entity.owner_entity_id
    && possessiveReferences.some((reference) => reference.resolved_entity_id === entity.owner_entity_id
      && itemClauses.some((clause) => clause.clause_id === reference.clause_id && containsWords(clause.text, reference.surface)))
    && [...(entity.aliases ?? [])].some((alias) => startsWithWords(item.statement_en, alias)));
  if (ownedCandidates.length === 1) {
    const entity = ownedCandidates[0];
    const reference = possessiveReferences.find((row) => row.resolved_entity_id === entity.owner_entity_id);
    return {
      status: 'resolved', entity_id: entity.entity_id, literal_subject: reference.surface,
      resolution_source: 'deterministic_owned_subject', discourse_chain: [entity.owner_entity_id, entity.entity_id],
    };
  }
  if (ownedCandidates.length > 1) return {
    status: 'ambiguous', reason: 'multiple_owned_subject_candidates', candidate_entity_ids: ownedCandidates.map((entity) => entity.entity_id),
  };
  const directReferences = (references ?? []).filter((reference) => {
    if (!reference.resolved_entity_id || !itemClauses.some((clause) => clause.clause_id === reference.clause_id && isClauseLeadingSubjectReference(reference, clause))) return false;
    const entity = state.entities.get(reference.resolved_entity_id);
    // One clause can yield several facts. A leading subject is evidence only
    // for a fact that names that same subject (or preserves its pronoun), not
    // for every neighboring claim in the clause.
    const aliasMatch = [...(entity?.aliases ?? [])].some((alias) => startsWithWords(item.statement_en, alias));
    const pronoun = ['he', 'she', 'they'].includes(words(reference.surface)[0]);
    // A bare pronoun in the model paraphrase has no identity evidence of its
    // own. It may use a same-clause binding, but a carried focus must be named
    // in the fact or remain unresolved for review.
    return aliasMatch || (!pronoun && startsWithWords(item.statement_en, reference.surface))
      || (pronoun && reference.resolution_source === 'deterministic_local_clause' && startsWithWords(item.statement_en, reference.surface));
  });
  const directEntityIds = [...new Set(directReferences.map((reference) => reference.resolved_entity_id))];
  if (directEntityIds.length === 1) {
    const reference = directReferences.find((row) => row.resolved_entity_id === directEntityIds[0]);
    return {
      status: 'resolved', entity_id: directEntityIds[0], literal_subject: reference.surface,
      resolution_source: reference.resolution_source, discourse_chain: [reference.antecedent_mention_id, directEntityIds[0]].filter(Boolean),
    };
  }
  if (directEntityIds.length > 1) return {
    status: 'ambiguous', reason: 'multiple_clause_subject_references', candidate_entity_ids: directEntityIds,
  };

  const explicitEntityIds = new Set(itemClauses.flatMap((clause) => clause.mention_ids ?? [])
    .map((id) => mentionById.get(id)?.subject_entity_id)
    .filter(Boolean));
  const aliasCandidates = (entities) => entities.flatMap((entity) => [...(entity?.aliases ?? [])]
    .filter((alias) => startsWithWords(item.statement_en, alias) && itemClauses.some((clause) => safeSourceAliasBinding(clause.text, alias, entity)))
    .map((alias) => ({ entity, alias })));
  // GLiNER can miss a printed name in a dense clause. Exact name text in both
  // the source clause and the paraphrase is still safe evidence for a person;
  // use it only after trying actual clause mentions, so a same-spelled place
  // cannot compete with an explicit person such as Mendel.
  let candidates = aliasCandidates([...explicitEntityIds].map((id) => state.entities.get(id)).filter(Boolean));
  if (!candidates.length) candidates = aliasCandidates([...state.entities.values()].filter((entity) => entity.entity_class === 'person'));
  const byEntity = new Map();
  for (const candidate of candidates) {
    const current = byEntity.get(candidate.entity.entity_id);
    if (!current || words(candidate.alias).length > words(current.alias).length) byEntity.set(candidate.entity.entity_id, candidate);
  }
  if (byEntity.size === 1) {
    const { entity, alias } = [...byEntity.values()][0];
    return {
      status: 'resolved', entity_id: entity.entity_id, literal_subject: alias,
      resolution_source: 'deterministic_explicit_source_alias', discourse_chain: [entity.entity_id],
    };
  }
  if (byEntity.size > 1) return {
    status: 'ambiguous', reason: 'multiple_explicit_source_aliases', candidate_entity_ids: [...byEntity.keys()],
  };
  return { status: 'unresolved', reason: 'no_safe_subject_binding', candidate_entity_ids: [] };
};

export const subjectContext = (state) => {
  const ids = [...new Set([state.focus.active, state.focus.person, state.focus.thing, state.focus.group].filter(Boolean))];
  return ids.map((id) => {
    const entity = state.entities.get(id);
    return entity ? [entity.entity_id, entity.label, entity.type, [...entity.aliases].slice(0, 4), [...entity.roles]] : null;
  }).filter(Boolean);
};

export const serializeSubjectState = (state, lastPage) => ({
  version: 1, source_id: state.source_id, last_page: lastPage,
  focus: state.focus,
  ordinal_pair: state.ordinal_pair,
  entities: [...state.entities.values()].filter((entity) => (entity.last_page ?? -1) >= lastPage - 3).map((entity) => ({
    ...entity, aliases: [...entity.aliases].slice(0, 12), roles: [...entity.roles].slice(0, 8), mention_ids: (entity.mention_ids ?? []).slice(-12),
  })),
});
