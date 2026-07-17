import crypto from 'node:crypto';
import { canonicalizeDomainText, canonicalizeDomainToken } from './historicalOcrLexicon.js';

const PERSON_TYPES = new Set(['person', 'family']);
const NONPERSON_TYPES = new Set(['building', 'business', 'organisation', 'work', 'movement', 'place']);
const TITLES = new Set(['r', 'rabbi', 'dr', 'mr', 'mrs', 'ms', 'professor', 'prof', 'saint', 'st']);
const ROLE_WORDS = new Set(['rabbi', 'scholar', 'author', 'writer', 'architect', 'doctor', 'teacher', 'mayor', 'ruler', 'king', 'queen']);
const BUILDING_WORDS = new Set(['synagogue', 'temple', 'school', 'building', 'house', 'hospital', 'cemetery', 'church', 'hall', 'museum', 'library', 'institute']);
const GROUP_WORDS = new Set(['community', 'family', 'group', 'people', 'they', 'followers', 'students', 'workers']);
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
// OCR damage must not fork one building into two entities: `synagoque` and
// `synagogue` are the same word, so identity keys and roles read the folded
// form while the raw surface survives as an alias.
const canonicalPhrase = (value) => words(value).map(canonicalizeDomainToken).join(' ');
const entityClass = (type) => PERSON_TYPES.has(type) ? 'person' : type === 'group' || type === 'organisation' || type === 'family' ? 'group' : 'thing';
const entityId = (sourceId, type, key) => `se_${hash(`${sourceId}\u001f${type}\u001f${key}`)}`;

const nameTokens = (value) => words(value).filter((word) => !TITLES.has(word));
const isNameLike = (mention) => PERSON_TYPES.has(mention.type) && nameTokens(mention.normalized_text ?? mention.text).length > 0;
const mentionLabel = (mention) => String(mention.normalized_text ?? mention.text ?? '').replace(/\s+/gu, ' ').trim();

/**
 * Give every explicit mention a source-local entity ID. Person aliases are
 * merged only when a short form names exactly one longer form in this source.
 */
export const buildSubjectEntityIndex = ({ sourceId, mentions }) => {
  const rows = [...mentions].map((mention) => ({ ...mention }));
  const people = rows.filter(isNameLike);
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
  for (const mention of rows) {
    const label = mentionLabel(mention);
    const type = mention.type ?? 'thing';
    // An address anchor distinguishes same-named buildings: the "great"
    // synagogue at 23 and the "small" synagogue at 26 are separate entities,
    // not one generic synagogue.
    const anchor = !isNameLike(mention) ? mention.address_anchor : null;
    // OCR variants fold into one identity: `synagoque` is not a second
    // building. The damaged surface stays searchable as an alias.
    const base = isNameLike(mention) ? canonicalForPerson(mention) : canonicalPhrase(label);
    const displayLabel = isNameLike(mention) ? label : canonicalizeDomainText(label);
    const canonical = anchor?.key ? `${base} @ ${anchor.key}` : base;
    const id = entityId(sourceId, entityClass(type), canonical || `${mention.page}:${mention.start_offset}`);
    mention.subject_entity_id = id;
    let entity = entities.get(id);
    if (!entity) {
      entity = { entity_id: id, type, entity_class: entityClass(type), label: anchor ? `${displayLabel || base} (${anchor.display})` : (displayLabel || canonical), aliases: new Set(), roles: new Set(), mention_ids: [], last_mention_id: null, last_page: null, last_offset: null };
      if (anchor) entity.address = { street: anchor.street, house_number: anchor.house_number, display: anchor.display, center: anchor.center };
      entities.set(id, entity);
    }
    // Aliases keep the plain surface form; the anchored canonical key is an
    // identity device, not something a reader ever writes.
    entity.aliases.add(label); entity.aliases.add(base);
    if (anchor?.display) entity.aliases.add(anchor.display);
    for (const token of words(label).map(canonicalizeDomainToken)) if (ROLE_WORDS.has(token)) entity.roles.add(token);
    if (/^\s*r\.\s+/iu.test(label)) entity.roles.add('rabbi');
    if (type === 'building' && /\bsynagog(?:ue|ues)\b/iu.test(canonicalizeDomainText(label))) entity.roles.add('synagogue');
    entity.mention_ids.push(mention.mention_id);
    for (const alias of entity.aliases) addAlias(alias, id);
  }
  // Add safe single-name aliases for full names. If two people share it, leave ambiguous.
  for (const entity of entities.values()) {
    if (entity.entity_class !== 'person') continue;
    const canonical = [...entity.aliases].map(nameTokens).find((tokens) => tokens.length >= 2);
    if (!canonical) continue;
    for (const token of new Set([canonical[0], canonical.at(-1)])) {
      if ((owners.get(token)?.size ?? 0) === 1) addAlias(token, entity.entity_id);
    }
  }
  return { mentions: rows, entities, aliasIndex };
};

export const createSubjectState = ({ sourceId, entities, aliasIndex, persisted = null }) => {
  const state = { version: 1, source_id: sourceId, entities: new Map(), aliasIndex: new Map(), focus: { active: null, person: null, thing: null, group: null }, last_page: null };
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

const referenceExpressions = (text) => [...String(text ?? '').matchAll(/\b(he|him|his|she|her|hers|they|them|their|theirs|it|its|the\s+(?:rabbi|scholar|author|writer|architect|doctor|teacher|mayor|ruler|king|queen|synagogue|temple|school|building|house|hospital|cemetery|church|hall|museum|library|institute)|(?:this|that|these|those)\s+[a-z][a-z-]*)\b/giu)]
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
      entity_id: id, type, entity_class: entityClass(type), label: head,
      aliases: new Set([head]), roles: new Set([head]), head, owner_entity_id: ownerEntityId,
      mention_ids: [], last_mention_id: null, last_page: null, last_offset: null, origin: 'noun_ledger',
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
  const mention = mintLedgerMention(state, phraseRow, type);
  mention.subject_entity_id = entity.entity_id;
  if (!entity.mention_ids.includes(mention.mention_id)) entity.mention_ids.push(mention.mention_id);
  ledgerMentions.set(mention.mention_id, mention);
  touch(state, entity, mention, clause);
  return entity;
};

const processLedgerPhrase = ({ state, clause, phraseRow, overlapsExplicit, references, ambiguities, ledgerMentions, unresolved }) => {
  const first = words(phraseRow.text)[0];
  const head = words(phraseRow.head ?? '')[0] ?? null;
  const kind = phraseRow.reference_kind;
  const pushReference = (entity) => {
    if (!entity.last_mention_id) return;
    references.push({
      clause_id: clause.clause_id, antecedent_mention_id: entity.last_mention_id,
      resolved_entity_id: entity.entity_id, surface: phraseRow.text,
      start_offset: phraseRow.start_offset,
      resolution_source: 'deterministic_subject_memory',
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

  if (kind === 'pronoun') {
    const expected = PRONOUN_EXPECTED[first];
    if (!expected) return;
    let result = resolveTyped(state, { expected, page: clause.page_ref });
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
      if (!result.entity.last_mention_id) pushUnresolved(expected, 'candidate_without_mention');
      pushReference(result.entity); touch(state, result.entity, null, clause);
    }
    else if (result.status === 'ambiguous') pushAmbiguity(result.candidates, expected);
    else pushUnresolved(expected, 'no_candidate');
    return;
  }
  if (kind === 'possessive') {
    const ownerExpected = PRONOUN_EXPECTED[first];
    if (!ownerExpected) return;
    const owner = resolveTyped(state, { expected: ownerExpected, page: clause.page_ref });
    if (owner.status === 'ambiguous') { pushAmbiguity(owner.candidates, ownerExpected); return; }
    if (owner.status !== 'resolved') { pushUnresolved(ownerExpected, 'no_candidate'); return; }
    pushReference(owner.entity);
    touch(state, owner.entity, null, clause);
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
    const expected = head && (TRACKABLE_HEADS.has(head) || BUILDING_WORDS.has(head)) ? 'thing'
      : phraseRow.type === 'person' ? 'person' : phraseRow.type === 'group' ? 'group' : 'thing';
    // A definite phrase naming a known alias ("the Orczy House") resolves by
    // exact alias before any head-based candidate search.
    const aliasKey = phrase(String(phraseRow.text).replace(/^(?:the|this|that|these|those)\s+/iu, ''));
    const aliasMatches = [...(state.aliasIndex.get(aliasKey) ?? [])]
      .map((id) => state.entities.get(id))
      .filter((entity) => compatible(entity, expected));
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
    if (phrases.length) {
      const explicitSpans = clause.mention_ids.map((id) => mentionById.get(id)).filter(Boolean)
        .map((mention) => [mention.start_offset, mention.end_offset]);
      for (const phraseRow of phrases) {
        const overlapsExplicit = explicitSpans.some(([start, end]) => phraseRow.start_offset < end && phraseRow.end_offset > start);
        processLedgerPhrase({ state, clause, phraseRow, overlapsExplicit, references, ambiguities, ledgerMentions, unresolved });
      }
    } else {
      for (const expression of referenceExpressions(clause.text)) {
        const expected = expectedFor(expression.surface);
        let antecedent = pickFocus(state, expected, roleFor(expression.surface));
        // Plural "they" naturally covers plural things when no group exists.
        if (!antecedent?.last_mention_id && expected === 'group') antecedent = pickFocus(state, 'thing', null);
        if (!antecedent?.last_mention_id) continue;
        references.push({ clause_id: clause.clause_id, antecedent_mention_id: antecedent.last_mention_id, resolved_entity_id: antecedent.entity_id, surface: expression.surface, start_offset: clause.start_offset + expression.index, resolution_source: 'deterministic_subject_memory' });
      }
    }
    const candidates = clause.mention_ids.map((id) => mentionById.get(id)).filter(Boolean)
      .map((mention) => ({ mention, entity: state.entities.get(mention.subject_entity_id) }))
      .filter((row) => row.entity && focusable(row.entity) && (row.entity.entity_class === 'person' || row.entity.entity_class === 'thing' || row.entity.entity_class === 'group'))
      .sort((left, right) => left.mention.start_offset - right.mention.start_offset);
    // Prefer an early non-prepositional mention. A nearby place must not displace
    // a named narrator such as "In Buda, R. Efraim...".
    const subject = candidates.find(({ mention }) => !/\b(?:in|at|from|to|near|within|of)\s*$/iu.test(clause.text.slice(0, Math.max(0, mention.start_offset - clause.start_offset))))
      ?? candidates[0];
    if (subject) touch(state, subject.entity, subject.mention, clause);
    transitions.push({
      clause_id: clause.clause_id, page_ref: clause.page_ref, before_focus: before, after_focus: { ...state.focus },
      references: references.filter((row) => row.clause_id === clause.clause_id),
      ambiguous_references: ambiguities.filter((row) => row.clause_id === clause.clause_id),
    });
  }
  return { references, transitions, ambiguities, unresolved, ledgerMentions: [...ledgerMentions.values()] };
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
  entities: [...state.entities.values()].filter((entity) => (entity.last_page ?? -1) >= lastPage - 3).map((entity) => ({
    ...entity, aliases: [...entity.aliases].slice(0, 12), roles: [...entity.roles].slice(0, 8), mention_ids: (entity.mention_ids ?? []).slice(-12),
  })),
});
