import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSubjectEntityIndex, createSubjectState, resolveSubjectReferences } from './historicalSubjectMemory.js';

const mention = (id, page, start, text, type = 'person') => ({ mention_id: id, page, start_offset: start, end_offset: start + text.length, text, normalized_text: text, type });
const clause = (id, page, start, text, mentionIds) => ({ clause_id: id, page_ref: page, start_offset: start, text, mention_ids: mentionIds });

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
