import crypto from 'node:crypto';

const PERSON_TYPES = new Set(['person', 'family']);
const NONPERSON_TYPES = new Set(['building', 'business', 'organisation', 'work', 'movement', 'place']);
const TITLES = new Set(['r', 'rabbi', 'dr', 'mr', 'mrs', 'ms', 'professor', 'prof', 'saint', 'st']);
const ROLE_WORDS = new Set(['rabbi', 'scholar', 'author', 'writer', 'architect', 'doctor', 'teacher', 'mayor', 'ruler', 'king', 'queen']);
const BUILDING_WORDS = new Set(['synagogue', 'temple', 'school', 'building', 'house', 'hospital', 'cemetery', 'church', 'hall', 'museum', 'library', 'institute']);
const GROUP_WORDS = new Set(['community', 'family', 'group', 'people', 'they', 'followers', 'students', 'workers']);

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
const words = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
  .toLowerCase().match(/[a-z0-9]+/gu) ?? [];
const phrase = (value) => words(value).join(' ');
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
    const canonical = isNameLike(mention) ? canonicalForPerson(mention) : phrase(label);
    const id = entityId(sourceId, entityClass(type), canonical || `${mention.page}:${mention.start_offset}`);
    mention.subject_entity_id = id;
    let entity = entities.get(id);
    if (!entity) {
      entity = { entity_id: id, type, entity_class: entityClass(type), label: label || canonical, aliases: new Set(), roles: new Set(), mention_ids: [], last_mention_id: null, last_page: null, last_offset: null };
      entities.set(id, entity);
    }
    entity.aliases.add(label); entity.aliases.add(canonical);
    for (const token of words(label)) if (ROLE_WORDS.has(token)) entity.roles.add(token);
    if (/^\s*r\.\s+/iu.test(label)) entity.roles.add('rabbi');
    if (type === 'building' && /\bsynagog(?:ue|ues)\b/iu.test(label)) entity.roles.add('synagogue');
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

const compatible = (entity, expected) => entity && (!expected || entity.entity_class === expected || (expected === 'thing' && entity.entity_class === 'thing'));
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
  entity.last_mention_id = mention?.mention_id ?? entity.last_mention_id;
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

/** Process clauses in source order. References see prior clauses/pages only. */
export const resolveSubjectReferences = ({ state, clauses, mentionById }) => {
  const transitions = [];
  const references = [];
  for (const clause of [...clauses].sort((a, b) => a.page_ref - b.page_ref || a.start_offset - b.start_offset)) {
    const before = { ...state.focus };
    for (const expression of referenceExpressions(clause.text)) {
      const expected = expectedFor(expression.surface);
      const antecedent = pickFocus(state, expected, roleFor(expression.surface));
      if (!antecedent?.last_mention_id) continue;
      references.push({ clause_id: clause.clause_id, antecedent_mention_id: antecedent.last_mention_id, resolved_entity_id: antecedent.entity_id, surface: expression.surface, resolution_source: 'deterministic_subject_memory' });
    }
    const candidates = clause.mention_ids.map((id) => mentionById.get(id)).filter(Boolean)
      .map((mention) => ({ mention, entity: state.entities.get(mention.subject_entity_id) }))
      .filter((row) => row.entity && (row.entity.entity_class === 'person' || row.entity.entity_class === 'thing' || row.entity.entity_class === 'group'))
      .sort((left, right) => left.mention.start_offset - right.mention.start_offset);
    // Prefer an early non-prepositional mention. A nearby place must not displace
    // a named narrator such as "In Buda, R. Efraim...".
    const subject = candidates.find(({ mention }) => !/\b(?:in|at|from|to|near|within|of)\s*$/iu.test(clause.text.slice(0, Math.max(0, mention.start_offset - clause.start_offset))))
      ?? candidates[0];
    if (subject) touch(state, subject.entity, subject.mention, clause);
    transitions.push({ clause_id: clause.clause_id, page_ref: clause.page_ref, before_focus: before, after_focus: { ...state.focus }, references: references.filter((row) => row.clause_id === clause.clause_id) });
  }
  return { references, transitions };
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
