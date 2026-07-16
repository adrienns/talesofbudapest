import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStreetIndex, extractAddressReferences, matchStreet, normalizeStreetKey } from './historicalAddresses.js';

const gazetteer = {
  streets: [
    { modern: 'Király utca', key: 'kiraly utca', center: { lat: 47.5, lon: 19.06, precision: 'street' }, historical: [{ name: 'Majakovszkij utca', key: 'majakovszkij utca' }] },
    { modern: 'Laborc utca', key: 'laborc utca', center: { lat: 47.54, lon: 19.02, precision: 'street' }, historical: [] },
    { modern: 'Bécsi út', key: 'becsi ut', center: { lat: 47.53, lon: 19.02, precision: 'street' }, historical: [] },
    { modern: 'Andrássy út', key: 'andrassy ut', center: { lat: 47.5, lon: 19.07, precision: 'street' }, historical: [{ name: 'Sugárút', key: 'sugarut' }, { name: 'Sugár út', key: 'sugar ut' }] },
    { modern: 'Pálvölgyi út', key: 'palvolgyi ut', center: null, historical: [] },
    { modern: 'Rumbach Sebestyén utca', key: 'rumbach sebestyen utca', center: { lat: 47.49, lon: 19.06, precision: 'street' }, historical: [{ name: 'Rombach utca', key: 'rombach utca' }] },
  ],
};
const index = buildStreetIndex(gazetteer);

test('extracts a plain address with house number and exact match', () => {
  const rows = extractAddressReferences('The shop stood at Király utca 77 for decades.', index);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modern_street, 'Király utca');
  assert.equal(rows[0].house_number, '77');
  assert.equal(rows[0].matched_via, 'exact');
});

test('repairs OCR-degraded street and type tokens', () => {
  const rows = extractAddressReferences('A radical change in Kirdly utca occurred after the flood.', index);
  assert.equal(rows[0].modern_street, 'Király utca');
  assert.equal(rows[0].matched_via, 'fuzzy');
  const corner = extractAddressReferences('at the corner of Bécsi it and Laborc utca, on the left', index);
  assert.deepEqual(corner.map((row) => row.modern_street), ['Bécsi út', 'Laborc utca']);
});

test('weak OCR type tokens without a gazetteer match are dropped', () => {
  const rows = extractAddressReferences('Whatever It was, the Committee it formed dissolved.', index);
  assert.equal(rows.length, 0);
});

test('historical names resolve to the modern street', () => {
  const rows = extractAddressReferences('They walked down Rombach utca to the prayer house.', index);
  assert.equal(rows[0].modern_street, 'Rumbach Sebestyén utca');
  assert.equal(rows[0].matched_via, 'historical');
  assert.equal(rows[0].historical_name, 'Rombach utca');
});

test('OCR-mangled Sugar Gt resolves via historical alias fuzzily', () => {
  const rows = extractAddressReferences('Only after the magnificent Sugar Gt was opened did it lose position.', index);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modern_street, 'Andrássy út');
});

test('normalizeStreetKey folds diacritics and punctuation', () => {
  assert.equal(normalizeStreetKey('Pálvölgyi  út'), 'palvolgyi ut');
  assert.equal(matchStreet(index, 'Palvolgyi', 'ut').street.modern, 'Pálvölgyi út');
});
