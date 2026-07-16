import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSubjectEntityIndex, createSubjectState, resolveSubjectReferences, serializeSubjectState } from './historicalSubjectMemory.js';

const mention = (id, page, start, text, type = 'person') => ({ mention_id: id, page, start_offset: start, end_offset: start + text.length, text, normalized_text: text, type });
const clause = (id, page, start, text, mentionIds) => ({ clause_id: id, page_ref: page, start_offset: start, end_offset: start + text.length, text, mention_ids: mentionIds });
const phrase = (page, start, text, head, { type = 'thing', kind = null, named = false } = {}) => ({
  page, start_offset: start, end_offset: start + text.length, text, head, type, named,
  reference: kind !== null, reference_kind: kind, number_hint: 'singular',
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
  const it = result.references.find((row) => row.clause_id === 'c3');
  assert.equal(it.resolved_entity_id, tomb.entity_id);
  assert.ok(result.ledgerMentions.some((row) => row.subject_entity_id === tomb.entity_id));
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
