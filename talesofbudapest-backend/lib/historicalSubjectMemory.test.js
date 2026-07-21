import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSubjectEntityIndex, correctSourceLocalPersonMentionTypes, createSubjectState, entityEligibilityReason, resolveItemSubjectAttribution, resolveSubjectReferences, serializeSubjectState } from './historicalSubjectMemory.js';

const mention = (id, page, start, text, type = 'person') => ({ mention_id: id, page, start_offset: start, end_offset: start + text.length, text, normalized_text: text, type });
const clause = (id, page, start, text, mentionIds) => ({ clause_id: id, page_ref: page, start_offset: start, end_offset: start + text.length, text, mention_ids: mentionIds });
const phrase = (page, start, text, head, { type = 'thing', kind = null, named = false } = {}) => ({
  page, start_offset: start, end_offset: start + text.length, text, head, type, named,
  reference: kind !== null, reference_kind: kind, number_hint: 'singular',
});

test('dates and bare collectives stay evidence, outside the source entity index', () => {
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: [
    mention('date', 1, 0, '1474', 'date'), mention('people', 1, 8, 'some people', 'group'), mention('name', 1, 24, 'Mendel'),
  ] });
  assert.equal(index.mentions.find((row) => row.mention_id === 'date').subject_entity_id, null);
  assert.equal(index.mentions.find((row) => row.mention_id === 'people').subject_entity_id, null);
  assert.ok(index.mentions.find((row) => row.mention_id === 'name').subject_entity_id);
  assert.deepEqual(index.entityEligibilityLog.map((row) => row.reason), ['non_identity_mention_type', 'generic_collective_not_identity']);
  assert.equal(entityEligibilityReason(mention('jew', 1, 0, 'the Jew')), 'generic_collective_not_identity');
  assert.equal(entityEligibilityReason(mention('movement', 1, 0, 'Jewish', 'movement')), 'non_identity_mention_type');
  const buildings = buildSubjectEntityIndex({ sourceId: 'book', mentions: [mention('building', 1, 0, 'The synagogue', 'building')] });
  assert.equal(buildings.entities.values().next().value.presentation_eligible, false);
});

test('keeps full name, first name, title, and pronouns on one source entity', () => {
  const raw = [mention('m1', 1, 0, 'Rabbi Moses Efraim'), mention('m2', 1, 40, 'Efraim')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  assert.equal(byId.get('m1').subject_entity_id, byId.get('m2').subject_entity_id);
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'Rabbi Moses Efraim wrote a book.', ['m1']),
    clause('c2', 1, 40, 'Efraim later revised it.', ['m2']),
    clause('c3', 2, 0, 'The rabbi said he kept his books.', []),
  ] });
  const c3 = result.references.filter((row) => row.clause_id === 'c3');
  assert.equal(c3.length, 3);
  assert.ok(c3.every((row) => row.antecedent_mention_id === 'm2'));
});

test('adds a unique short person alias but never merges an ambiguous short name', () => {
  const evliya = buildSubjectEntityIndex({ sourceId: 'book', mentions: [mention('e1', 1, 0, 'Evliya Chelebi')] });
  assert.ok([...evliya.entities.values()][0].aliases.has('evliya'));
  const shared = buildSubjectEntityIndex({ sourceId: 'book', mentions: [
    mention('a', 1, 0, 'Moses Efraim'), mention('b', 1, 30, 'Jacob Efraim'),
  ] });
  assert.ok([...shared.entities.values()].every((entity) => !entity.aliases.has('efraim')));
  const titled = buildSubjectEntityIndex({ sourceId: 'book', mentions: [mention('king', 1, 0, 'King Matthias')] });
  assert.ok(![...titled.entities.values()][0].aliases.has('king'));
  const placeCollision = buildSubjectEntityIndex({ sourceId: 'book', mentions: [
    mention('frederick', 1, 0, 'Frederick of Babenberg'), mention('babenberg', 1, 40, 'Babenberg', 'place'),
  ] });
  assert.ok(![...placeCollision.entities.values()].find((entity) => entity.entity_class === 'person').aliases.has('babenberg'));
});

test('corrects only exact adjacent person type drift and logs the correction', () => {
  const result = correctSourceLocalPersonMentionTypes([
    mention('person', 24, 10, 'Mendel', 'person'),
    mention('drift', 25, 20, 'Mendel', 'place'),
    mention('far', 30, 20, 'Mendel', 'place'),
    mention('fuzzy', 25, 40, 'Mendel Street', 'place'),
  ]);
  assert.equal(result.mentions.find((row) => row.mention_id === 'drift').type, 'person');
  assert.equal(result.mentions.find((row) => row.mention_id === 'far').type, 'place');
  assert.equal(result.mentions.find((row) => row.mention_id === 'fuzzy').type, 'place');
  assert.deepEqual(result.corrections.map((row) => row.mention_id), ['drift']);
});

test('treats R. Name as a rabbi role alias', () => {
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: [mention('m1', 1, 0, 'R. Efraim')] });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'R. Efraim taught there.', ['m1']),
    clause('c2', 2, 0, 'The rabbi later wrote a book.', []),
  ] });
  assert.equal(result.references.find((row) => row.clause_id === 'c2').antecedent_mention_id, 'm1');
});

test('merges title, fuller name, and possessive spelling', () => {
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: [
    mention('short', 1, 0, 'R. Efraim'),
    mention('full', 1, 20, 'R. Efraim haKohen'),
    mention('possessive', 1, 50, 'R. Efraim’s'),
  ] });
  assert.equal(new Set(index.mentions.map((row) => row.subject_entity_id)).size, 1);
  assert.ok([...index.entities.values()][0].roles.has('rabbi'));
});

test('normalizes printed r(av) title notation without OCR guessing', () => {
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: [
    mention('expanded', 1, 0, 'Rav Peter'), mention('printed', 1, 20, 'r(av) Peter'),
  ] });
  assert.equal(index.mentions[0].subject_entity_id, index.mentions[1].subject_entity_id);
});

test('keeps person owner while building stays separate focus', () => {
  const raw = [mention('p1', 1, 0, 'R. Efraim'), mention('b1', 2, 20, 'synagogue', 'building')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'R. Efraim died.', ['p1']),
    clause('c2', 2, 0, 'His tomb was visited.', []),
    clause('c3', 2, 20, 'The synagogue retained its stars.', ['b1']),
    clause('c4', 3, 0, 'It remained open.', []),
  ] });
  assert.equal(result.references.find((row) => row.clause_id === 'c2').antecedent_mention_id, 'p1');
  assert.equal(result.references.find((row) => row.clause_id === 'c4').antecedent_mention_id, 'b1');
});

test('does not merge a short name shared by two people', () => {
  const raw = [mention('a', 1, 0, 'Moses Efraim'), mention('b', 1, 30, 'Jacob Efraim'), mention('c', 1, 60, 'Efraim')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  assert.notEqual(byId.get('a').subject_entity_id, byId.get('b').subject_entity_id);
  assert.notEqual(byId.get('c').subject_entity_id, byId.get('a').subject_entity_id);
  assert.notEqual(byId.get('c').subject_entity_id, byId.get('b').subject_entity_id);
});

test('possessive creates owned object separate from owner and resolvable by later it', () => {
  const raw = [mention('p1', 1, 0, 'R. Efraim')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'R. Efraim died.', ['p1']),
    clause('c2', 2, 0, 'His tomb was visited by pilgrims.', []),
    clause('c3', 2, 40, 'It was restored later.', []),
  ], nounPhrases: [
    phrase(2, 0, 'His tomb', 'tomb', { kind: 'possessive' }),
    phrase(2, 40, 'It', 'it', { kind: 'pronoun' }),
  ] });
  const owner = result.references.find((row) => row.clause_id === 'c2');
  assert.equal(owner.antecedent_mention_id, 'p1');
  const efraimId = byId.get('p1').subject_entity_id;
  const tomb = [...state.entities.values()].find((entity) => entity.head === 'tomb');
  assert.ok(tomb, 'owned tomb entity exists');
  assert.equal(tomb.owner_entity_id, efraimId);
  assert.notEqual(tomb.entity_id, efraimId);
  assert.equal(tomb.presentation_eligible, false);
  const it = result.references.find((row) => row.clause_id === 'c3');
  assert.equal(it.resolved_entity_id, tomb.entity_id);
  assert.ok(result.ledgerMentions.some((row) => row.subject_entity_id === tomb.entity_id));
});

test('possessive collective becomes an owned group and the fact binds to that group', () => {
  const raw = [mention('buda', 1, 0, 'Buda', 'place')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const clauses = [
    clause('c1', 1, 0, 'Buda was a city.', ['buda']),
    clause('c2', 1, 20, 'Its burghers were Germans.', []),
  ];
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses, nounPhrases: [
    phrase(1, 20, 'Its burghers', 'burgher', { type: 'group', kind: 'possessive' }),
  ] });
  for (const ledger of result.ledgerMentions) byId.set(ledger.mention_id, ledger);
  const owner = result.references.find((row) => row.clause_id === 'c2');
  const owned = [...state.entities.values()].find((entity) => entity.owner_entity_id === byId.get('buda').subject_entity_id);
  assert.equal(owner.resolved_entity_id, byId.get('buda').subject_entity_id);
  assert.equal(owned.type, 'group');
  assert.equal(owned.presentation_eligible, true);
  const attribution = resolveItemSubjectAttribution({
    item: { clause_ids: ['c2'], statement_en: 'Burghers were Germans.' },
    clauseById: new Map(clauses.map((row) => [row.clause_id, row])), references: result.references, mentionById: byId, state,
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.entity_id, owned.entity_id);
  assert.equal(attribution.resolution_source, 'deterministic_owned_subject');
});

test('former and latter require an explicit two-member coordinated pair', () => {
  const raw = [mention('buda', 1, 0, 'Buda', 'place'), mention('pest', 1, 9, 'Pest', 'place')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'Buda and Pest were contrasted.', ['buda', 'pest']),
    clause('c2', 1, 35, 'The latter grew faster.', []),
  ], nounPhrases: [phrase(1, 35, 'The latter', 'latter', { kind: 'ordinal' })] });
  const latter = result.references.find((row) => row.clause_id === 'c2');
  assert.equal(latter.resolved_entity_id, byId.get('pest').subject_entity_id);
  assert.equal(latter.resolution_source, 'deterministic_ordinal_pair');

  const emptyState = createSubjectState({ sourceId: 'book', ...buildSubjectEntityIndex({ sourceId: 'book', mentions: [] }) });
  const unresolved = resolveSubjectReferences({ state: emptyState, mentionById: new Map(), clauses: [
    clause('x', 1, 0, 'The former disappeared.', []),
  ], nounPhrases: [phrase(1, 0, 'The former', 'former', { kind: 'ordinal' })] });
  assert.equal(unresolved.references.length, 0);
  assert.equal(unresolved.unresolved[0].why, 'ordinal_pair_not_safely_bound');
});

test('definite description links named building across pages, and never person', () => {
  const raw = [mention('b1', 1, 0, 'Great Synagogue', 'building'), mention('p1', 1, 30, 'R. Efraim')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'The Great Synagogue opened; R. Efraim led prayers there.', ['b1', 'p1']),
    clause('c2', 2, 0, 'The synagogue was decorated with stars.', []),
    clause('c3', 2, 50, 'It drew many visitors.', []),
  ], nounPhrases: [
    phrase(2, 0, 'The synagogue', 'synagogue', { kind: 'definite' }),
    phrase(2, 50, 'It', 'it', { kind: 'pronoun' }),
  ] });
  const synagogueId = byId.get('b1').subject_entity_id;
  assert.equal(result.references.find((row) => row.clause_id === 'c2').resolved_entity_id, synagogueId);
  assert.equal(result.references.find((row) => row.clause_id === 'c3').resolved_entity_id, synagogueId);
});

test('he never resolves to a place or building', () => {
  const raw = [mention('pl1', 1, 0, 'Buda', 'place')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'Buda fell in that year.', ['pl1']),
    clause('c2', 1, 30, 'He arrived soon after.', []),
  ], nounPhrases: [phrase(1, 30, 'He', 'he', { type: 'person', kind: 'pronoun' })] });
  assert.equal(result.references.filter((row) => row.clause_id === 'c2').length, 0);
});

test('the rabbi with two unfocused rabbi candidates is explicitly ambiguous', () => {
  const raw = [
    mention('a', 1, 0, 'Rabbi Moses Efraim'),
    mention('b', 1, 40, 'Rabbi Jacob Ashkenazi'),
    mention('c', 2, 0, 'Count Zichy'),
  ];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'Rabbi Moses Efraim taught in Buda.', ['a']),
    clause('c2', 1, 40, 'Rabbi Jacob Ashkenazi taught in Pest.', ['b']),
    clause('c3', 2, 0, 'Count Zichy visited the town.', ['c']),
    clause('c4', 2, 30, 'The rabbi objected.', []),
  ], nounPhrases: [phrase(2, 30, 'The rabbi', 'rabbi', { type: 'person', kind: 'definite' })] });
  assert.equal(result.references.filter((row) => row.clause_id === 'c4').length, 0);
  const ambiguity = result.ambiguities.find((row) => row.clause_id === 'c4');
  assert.ok(ambiguity, 'ambiguity recorded');
  assert.equal(ambiguity.candidate_entity_ids.length, 2);
});

test('subject switch then return keeps person focus recoverable', () => {
  const raw = [mention('p1', 1, 0, 'R. Efraim'), mention('b1', 1, 30, 'Great Synagogue', 'building')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'R. Efraim preached.', ['p1']),
    clause('c2', 1, 30, 'The Great Synagogue burned down.', ['b1']),
    clause('c3', 1, 70, 'He rebuilt the community.', []),
  ], nounPhrases: [phrase(1, 70, 'He', 'he', { type: 'person', kind: 'pronoun' })] });
  assert.equal(result.references.find((row) => row.clause_id === 'c3').antecedent_mention_id, 'p1');
});

test('owned entity survives serialization across sequential pages', () => {
  const raw = [mention('p1', 1, 0, 'R. Efraim')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'R. Efraim died.', ['p1']),
    clause('c2', 1, 20, 'His tomb was built in the cemetery.', []),
  ], nounPhrases: [phrase(1, 20, 'His tomb', 'tomb', { kind: 'possessive' })] });
  const persisted = JSON.parse(JSON.stringify(serializeSubjectState(state, 1)));
  const restored = createSubjectState({ sourceId: 'book', persisted });
  const result = resolveSubjectReferences({ state: restored, mentionById: new Map(), clauses: [
    clause('c3', 2, 0, 'It became a pilgrimage site.', []),
  ], nounPhrases: [phrase(2, 0, 'It', 'it', { kind: 'pronoun' })] });
  const reference = result.references.find((row) => row.clause_id === 'c3');
  const tomb = [...restored.entities.values()].find((entity) => entity.head === 'tomb');
  assert.equal(reference.resolved_entity_id, tomb.entity_id);
});

test('rejects pages processed out of ascending order', () => {
  const state = createSubjectState({ sourceId: 'book', persisted: { version: 1, source_id: 'book', last_page: 5, focus: {}, entities: [] } });
  assert.throws(() => resolveSubjectReferences({ state, mentionById: new Map(), clauses: [
    clause('c1', 4, 0, 'Earlier page text.', []),
  ] }), /ascending|advanced/iu);
});

test('definite phrase naming a known alias resolves exactly, not by head class', () => {
  const raw = [mention('h1', 1, 0, 'Orczy House', 'building'), mention('h2', 1, 30, 'Heusler House', 'building')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'The Orczy House and the Heusler House stood in Pest.', ['h1', 'h2']),
    clause('c2', 2, 0, 'The Orczy House hosted a prayer room.', []),
  ], nounPhrases: [phrase(2, 0, 'The Orczy House', 'house', { kind: 'definite', named: true })] });
  const reference = result.references.find((row) => row.clause_id === 'c2');
  assert.equal(reference.resolved_entity_id, byId.get('h1').subject_entity_id);
  assert.equal(result.ambiguities.length, 0);
});

test('a prior same-clause name beats stale person focus for he and his', () => {
  const raw = [mention('king', 1, 0, 'King Matthias'), mention('mendel', 2, 20, 'Mendel')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'King Matthias ruled.', ['king']),
    clause('c2', 2, 20, 'Mendel said his office proved that he led the community.', ['mendel']),
  ], nounPhrases: [
    phrase(2, 32, 'his office', 'office', { kind: 'possessive' }),
    phrase(2, 60, 'he', 'he', { type: 'person', kind: 'pronoun' }),
  ] });
  const mendelId = byId.get('mendel').subject_entity_id;
  const c2 = result.references.filter((row) => row.clause_id === 'c2');
  assert.equal(c2[0].resolved_entity_id, mendelId);
  assert.equal(c2[0].resolution_source, 'deterministic_local_clause');
  assert.equal(c2[1].resolved_entity_id, mendelId);
  assert.equal(result.unresolved.filter((row) => row.clause_id === 'c2').length, 0);
});

test('definite king is typed as a person despite a thing tag', () => {
  const raw = [mention('king', 1, 0, 'King Matthias')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'King Matthias ruled.', ['king']),
    clause('c2', 2, 0, 'The king occupied a new palace.', []),
  ], nounPhrases: [phrase(2, 0, 'The king', 'king', { type: 'thing', kind: 'definite' })] });
  assert.equal(result.references.find((row) => row.clause_id === 'c2').resolved_entity_id, byId.get('king').subject_entity_id);
});

test('unbound definite king confesses a missing person, never a missing thing', () => {
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: [] });
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: new Map(), clauses: [
    clause('c1', 1, 0, 'The king occupied a new palace.', []),
  ], nounPhrases: [phrase(1, 0, 'The king', 'king', { type: 'thing', kind: 'definite' })] });
  assert.deepEqual(result.unresolved.map((row) => ({ expected: row.expected, why: row.why })), [{ expected: 'person', why: 'no_candidate' }]);
});

test('unique exact institution alias resolves despite a thing tag', () => {
  const raw = [mention('museum', 1, 0, 'Budapest Historical Museum', 'organisation')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'Budapest Historical Museum holds the collection.', ['museum']),
    clause('c2', 2, 0, 'The Budapest Historical Museum displayed it.', []),
  ], nounPhrases: [phrase(2, 0, 'The Budapest Historical Museum', 'museum', { type: 'thing', kind: 'definite', named: true })] });
  assert.equal(result.references.find((row) => row.clause_id === 'c2').resolved_entity_id, byId.get('museum').subject_entity_id);
});

test('a local subject never steals an object pronoun from prior focus', () => {
  const raw = [mention('king', 1, 0, 'King Matthias'), mention('mendel', 2, 20, 'Mendel')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const result = resolveSubjectReferences({ state, mentionById: byId, clauses: [
    clause('c1', 1, 0, 'King Matthias arrived.', ['king']),
    clause('c2', 2, 20, 'Mendel greeted him.', ['mendel']),
  ], nounPhrases: [phrase(2, 35, 'him', 'him', { type: 'person', kind: 'pronoun' })] });
  const reference = result.references.find((row) => row.clause_id === 'c2');
  assert.equal(reference.resolved_entity_id, byId.get('king').subject_entity_id);
});

test('item attribution uses source subject evidence, never an object reference', () => {
  const raw = [mention('king', 1, 0, 'King Matthias'), mention('mendel', 2, 20, 'Mendel')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const itemClause = clause('c2', 2, 20, 'Mendel greeted him.', ['mendel']);
  const attribution = resolveItemSubjectAttribution({
    item: { clause_ids: ['c2'], statement_en: 'Mendel greeted King Matthias.' },
    clauseById: new Map([['c2', itemClause]]),
    mentionById: byId,
    references: [{ clause_id: 'c2', start_offset: 35, surface: 'him', resolved_entity_id: byId.get('king').subject_entity_id, antecedent_mention_id: 'king', resolution_source: 'deterministic_subject_memory' }],
    state,
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.entity_id, byId.get('mendel').subject_entity_id);
  assert.equal(attribution.resolution_source, 'deterministic_explicit_source_alias');
});

test('item attribution rejects an object alias introduced by “referred to as”', () => {
  const raw = [mention('street', 1, 31, 'Juden Gasse', 'place')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const itemClause = clause('c1', 1, 0, 'The latter was referred to as Juden Gasse.', ['street']);
  const attribution = resolveItemSubjectAttribution({
    item: { clause_ids: ['c1'], statement_en: 'Juden Gasse was used.' },
    clauseById: new Map([['c1', itemClause]]), mentionById: byId, references: [], state,
  });
  assert.equal(attribution.status, 'unresolved');
});

test('item attribution accepts a unique short person alias in reporting syntax', () => {
  const raw = [mention('evliya', 1, 0, 'Evliya Chelebi')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const itemClause = clause('c1', 1, 20, 'In those times, as Evliya notes, its population was Bosnian.', []);
  const attribution = resolveItemSubjectAttribution({
    item: { clause_ids: ['c1'], statement_en: 'Evliya notes population was mostly Bosnian.' },
    clauseById: new Map([['c1', itemClause]]), mentionById: byId, references: [], state,
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.entity_id, byId.get('evliya').subject_entity_id);
  assert.equal(attribution.literal_subject, 'evliya');
});

test('a clause-leading subject does not leak into a different fact from that clause', () => {
  const raw = [mention('het', 1, 0, 'letter het', 'work'), mention('alef', 1, 30, 'letter alef', 'work')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const itemClause = clause('c1', 1, 0, 'The letter het and letter alef were discussed.', ['het', 'alef']);
  const attribution = resolveItemSubjectAttribution({
    item: { clause_ids: ['c1'], statement_en: 'Letter alef could stand for a name.' },
    clauseById: new Map([['c1', itemClause]]), mentionById: byId,
    references: [{ clause_id: 'c1', start_offset: 0, surface: 'The letter het', resolved_entity_id: byId.get('het').subject_entity_id, antecedent_mention_id: 'het', resolution_source: 'deterministic_subject_memory' }],
    state,
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.entity_id, byId.get('alef').subject_entity_id);
  assert.notEqual(attribution.entity_id, byId.get('het').subject_entity_id);
});

test('a carried-focus pronoun without a named subject is left unresolved', () => {
  const raw = [mention('king', 1, 0, 'King Matthias')];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions: raw });
  const byId = new Map(index.mentions.map((row) => [row.mention_id, row]));
  const state = createSubjectState({ sourceId: 'book', ...index });
  const itemClause = clause('c2', 2, 20, 'He made a decision.', []);
  const attribution = resolveItemSubjectAttribution({
    item: { clause_ids: ['c2'], statement_en: 'He made a decision.' },
    clauseById: new Map([['c2', itemClause]]), mentionById: byId,
    references: [{ clause_id: 'c2', start_offset: 20, surface: 'He', resolved_entity_id: byId.get('king').subject_entity_id, antecedent_mention_id: 'king', resolution_source: 'deterministic_subject_memory' }],
    state,
  });
  assert.equal(attribution.status, 'unresolved');
  assert.equal(attribution.reason, 'no_safe_subject_binding');
});
