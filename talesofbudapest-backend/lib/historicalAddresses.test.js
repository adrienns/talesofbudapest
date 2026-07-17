import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStreetIndex, extractAddressReferences, matchStreet, normalizeStreetKey, resolveAmbiguousStreets } from './historicalAddresses.js';

const gazetteer = {
  streets: [
    { modern: 'Király utca', key: 'kiraly utca', center: { lat: 47.5, lon: 19.06, precision: 'street' }, historical: [{ name: 'Majakovszkij utca', key: 'majakovszkij utca' }] },
  { modern: 'Táncsics Mihály utca', key: 'tancsics mihaly utca', center: { lat: 47.5, lon: 19.03, precision: 'street' }, historical: [] },
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

test('house number is captured in both Hungarian and English order', () => {
  const hungarian = extractAddressReferences('The shop at Király utca 77 closed.', index);
  assert.equal(hungarian[0].house_number, '77');
  const english = extractAddressReferences('The “small” synagogue (26 Táncsics Mihály utca) and the “great” synagogue (23 Táncsics Mihály utca).', index);
  assert.deepEqual(english.map((row) => row.house_number), ['26', '23']);
});

test('a year is never mistaken for a house number', () => {
  const rows = extractAddressReferences('In 1867 Király utca was paved.', index);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].house_number, null);
});

test('an ambiguous street is placed from unambiguous page context', () => {
  const rows = [
    { page_ref: 21, modern_street: 'Hess András tér', center: { lat: 47.5027, lon: 19.0331, precision: 'street' }, ambiguous_location: false },
    { page_ref: 21, modern_street: 'Táncsics Mihály utca', center: null, ambiguous_location: true, location_clusters: [
      { lat: 47.6024, lon: 19.0522, way_count: 9 },
      { lat: 47.5040, lon: 19.0321, way_count: 5 },
      { lat: 47.4289, lon: 19.0724, way_count: 9 },
    ] },
  ];
  assert.equal(resolveAmbiguousStreets({ rows }), 1);
  assert.equal(rows[1].disambiguated_by, 'page_context');
  // Castle-district cluster, not the larger northern one.
  assert.ok(Math.abs(rows[1].center.lat - 47.504) < 0.01, `expected castle cluster, got ${rows[1].center.lat}`);
});

test('without nearby context an ambiguous street stays unlocated', () => {
  const rows = [
    { page_ref: 30, modern_street: 'Táncsics Mihály utca', center: null, ambiguous_location: true, location_clusters: [
      { lat: 47.6024, lon: 19.0522, way_count: 9 },
    ] },
  ];
  assert.equal(resolveAmbiguousStreets({ rows }), 0);
  assert.equal(rows[0].center, null);
});
