import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocationName, simpleFold } from './kgNormalize.js';

test('normalizes Hungarian and English street aliases', () => {
  assert.equal(normalizeLocationName('Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('Dohany Street'), 'dohany street');
});

test('normalizes bidirectional Hungarian/English generic terms', () => {
  assert.equal(normalizeLocationName('Andrássy körút'), 'andrassy boulevard');
  assert.equal(normalizeLocationName('Andrassy Boulevard'), 'andrassy boulevard');
  assert.equal(normalizeLocationName('Erzsébet híd'), 'erzsebet bridge');
  assert.equal(normalizeLocationName('Erzsébet Bridge'), 'erzsebet bridge');
  assert.equal(normalizeLocationName('Rákóczi út'), 'rakoczi road');
  assert.equal(normalizeLocationName('Rakoczi Avenue'), 'rakoczi road');
  assert.equal(normalizeLocationName('Belgrád rakpart'), 'belgrad quay');
  assert.equal(normalizeLocationName('Belgrád Embankment'), 'belgrad quay');
  assert.equal(normalizeLocationName('Dohány utcai zsinagóga'), 'dohany street synagogue');
  assert.equal(normalizeLocationName('Dohány Street Synagogue'), 'dohany street synagogue');
  assert.equal(normalizeLocationName('Kozma utcai temető'), 'kozma street cemetery');
  assert.equal(normalizeLocationName('Kozma Street Cemetery'), 'kozma street cemetery');
  assert.equal(normalizeLocationName('Mátyás templom'), 'matyas church');
  assert.equal(normalizeLocationName('Matthias Church'), 'matthias church');
  assert.equal(normalizeLocationName('Gellért fürdő'), 'gellert baths');
  assert.equal(normalizeLocationName('Gellért Baths'), 'gellert baths');
  assert.equal(normalizeLocationName('Margit sziget'), 'margit island');
  assert.equal(normalizeLocationName('Margaret Island'), 'margaret island');
  assert.equal(normalizeLocationName('New York kávéház'), 'new york cafe');
  assert.equal(normalizeLocationName('New York Café'), 'new york cafe');
  assert.equal(normalizeLocationName('New York Coffee House'), 'new york cafe');
  assert.equal(normalizeLocationName('Zichy palota'), 'zichy palace');
  assert.equal(normalizeLocationName('Zichy Palace'), 'zichy palace');
});

test('strips ordinal/district prefixes and leading articles', () => {
  assert.equal(normalizeLocationName('VII. Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('VII. kerület, Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('7th district, Dohány utca'), 'dohany street');
  assert.equal(normalizeLocationName('The Dohány Street Synagogue'), 'dohany street synagogue');
  assert.equal(normalizeLocationName('Kazinczy utca 29–31'), 'kazinczy street 29 31');
  assert.equal(normalizeLocationName('Kazinczy utca 29-31'), 'kazinczy street 29 31');
});

test('empty/nullish input normalizes to an empty string', () => {
  assert.equal(normalizeLocationName(null), '');
  assert.equal(normalizeLocationName(undefined), '');
  assert.equal(normalizeLocationName(''), '');
  assert.equal(normalizeLocationName('   '), '');
});

test('simpleFold: diacritic strip + lowercase + non-alnum -> space, no TYPE_WORDS canonicalization', () => {
  assert.equal(simpleFold('Dohány–Street!'), 'dohany street');
  // Unlike normalizeLocationName, simpleFold never canonicalizes generic
  // terms across languages -- "utca" stays "utca", not "street".
  assert.equal(simpleFold('Dohány utca'), 'dohany utca');
  assert.equal(simpleFold('Dohany Street'), 'dohany street');
  assert.notEqual(simpleFold('Dohány utca'), simpleFold('Dohany Street'));
  assert.equal(simpleFold(null), '');
  assert.equal(simpleFold(undefined), '');
});
