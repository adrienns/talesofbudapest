import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeDomainText, canonicalizeDomainToken, findOcrDamage } from './historicalOcrLexicon.js';
import { buildSubjectEntityIndex } from './historicalSubjectMemory.js';

test('verified OCR damage folds to the canonical word', () => {
  assert.equal(canonicalizeDomainToken('synagoque'), 'synagogue');
  assert.equal(canonicalizeDomainToken('synagoge'), 'synagogue');
  assert.equal(canonicalizeDomainToken('ynagogue'), 'synagogue');
  assert.equal(canonicalizeDomainToken('syneagogue'), 'synagogue');
});

test('legitimate words are never "repaired"', () => {
  // The book-wide scan found these are real words or real plurals; folding them
  // by edit distance would corrupt 300+ correct tokens to fix ~18 damaged ones.
  for (const word of ['horse', 'horses', 'player', 'prater', 'schools', 'prayers', 'streets', 'yeshivah', 'analogue', 'dialogue']) {
    assert.equal(canonicalizeDomainToken(word), word, `${word} must be left alone`);
  }
});

test('capitalisation shape survives folding', () => {
  assert.equal(canonicalizeDomainText('The Synagoque on Castle Hill'), 'The Synagogue on Castle Hill');
  assert.equal(canonicalizeDomainText('the “great” synagoque (23)'), 'the “great” synagogue (23)');
  assert.equal(canonicalizeDomainText('a horse and a player'), 'a horse and a player');
});

test('damaged domain words are reported with their positions', () => {
  const rows = findOcrDamage('The “great” synagoque stood near a horse.');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token, 'synagoque');
  assert.equal(rows[0].canonical, 'synagogue');
  assert.equal(rows[0].reading_start, 12);
});

test('an OCR-damaged building is the same entity as its intact self', () => {
  const mentions = [
    { mention_id: 'm1', page: 21, start_offset: 100, end_offset: 109, text: 'synagogue', normalized_text: 'synagogue', type: 'building' },
    { mention_id: 'm2', page: 21, start_offset: 200, end_offset: 209, text: 'synagoque', normalized_text: 'synagoque', type: 'building' },
  ];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions });
  const ids = index.mentions.map((row) => row.subject_entity_id);
  assert.equal(ids[0], ids[1], 'synagoque must not fork a second building');
  const entity = [...index.entities.values()][0];
  assert.equal(entity.label, 'synagogue', 'display label reads canonically');
  assert.ok(entity.aliases.has('synagoque'), 'the damaged surface stays searchable');
  assert.ok(entity.roles.has('synagogue'), 'role survives the damage');
});

test('OCR folding still respects address identity', () => {
  const mentions = [
    { mention_id: 'm1', page: 21, start_offset: 100, end_offset: 109, text: 'synagogue', normalized_text: 'synagogue', type: 'building', address_anchor: { street: 'Táncsics Mihály utca', house_number: '26', display: 'Táncsics Mihály utca 26', key: 'tancsics mihaly utca 26' } },
    { mention_id: 'm2', page: 21, start_offset: 200, end_offset: 209, text: 'synagoque', normalized_text: 'synagoque', type: 'building', address_anchor: { street: 'Táncsics Mihály utca', house_number: '23', display: 'Táncsics Mihály utca 23', key: 'tancsics mihaly utca 23' } },
  ];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions });
  const ids = index.mentions.map((row) => row.subject_entity_id);
  assert.notEqual(ids[0], ids[1], 'different addresses stay different buildings');
  const labels = [...index.entities.values()].map((entity) => entity.label).sort();
  assert.deepEqual(labels, ['synagogue (Táncsics Mihály utca 23)', 'synagogue (Táncsics Mihály utca 26)']);
});
