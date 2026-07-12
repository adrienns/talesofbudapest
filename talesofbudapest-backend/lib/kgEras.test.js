import test from 'node:test'; import assert from 'node:assert/strict';
import { ERAS, eraForYears, erasForRange, eraLabel } from './kgEras.js';

test('ERAS is ordered, contiguous, and open at both ends', () => {
  assert.equal(ERAS[0].id, 'early'); assert.equal(ERAS[0].startYear, null);
  assert.equal(ERAS.at(-1).id, 'contemporary'); assert.equal(ERAS.at(-1).endYear, null);
  for (let i = 1; i < ERAS.length; i += 1) {
    assert.equal(ERAS[i].startYear, ERAS[i - 1].endYear + 1, `${ERAS[i - 1].id} -> ${ERAS[i].id} must be contiguous`);
  }
});

test('reform era / absolutism boundary: 1848 vs 1849', () => {
  assert.equal(eraForYears(1848, null), 'reform_era');
  assert.equal(eraForYears(1849, null), 'absolutism');
});

test('dualism / wwi boundary: 1913 vs 1914', () => {
  assert.equal(eraForYears(1913, null), 'dualism');
  assert.equal(eraForYears(1914, null), 'wwi');
});

test('wwi / interwar boundary: 1918 vs 1919', () => {
  assert.equal(eraForYears(1918, null), 'wwi');
  assert.equal(eraForYears(1919, null), 'interwar');
});

test('interwar / wwii boundary: 1938 vs 1939', () => {
  assert.equal(eraForYears(1938, null), 'interwar');
  assert.equal(eraForYears(1939, null), 'wwii_holocaust');
});

test('wwii / state socialism boundary: 1945 vs 1946', () => {
  assert.equal(eraForYears(1945, null), 'wwii_holocaust');
  assert.equal(eraForYears(1946, null), 'state_socialism');
});

test('state socialism / contemporary boundary: 1989 vs 1990', () => {
  assert.equal(eraForYears(1989, null), 'state_socialism');
  assert.equal(eraForYears(1990, null), 'contemporary');
});

test('open-ended edges clamp far-out years', () => {
  assert.equal(eraForYears(1750, null), 'early');
  assert.equal(eraForYears(2026, null), 'contemporary');
});

test('eraForYears prefers startYear, falls back to endYear, and handles nulls', () => {
  assert.equal(eraForYears(1900, 1950), 'dualism', 'startYear wins even when endYear is in a later era');
  assert.equal(eraForYears(null, 1930), 'interwar', 'falls back to endYear when startYear is null');
  assert.equal(eraForYears(null, null), null);
  assert.equal(eraForYears(undefined, undefined), null);
});

test('eraForYears handles exact-single-year claims', () => {
  assert.equal(eraForYears(1859, 1859), 'absolutism');
  assert.equal(eraForYears(1867, 1867), 'dualism');
});

test('erasForRange returns every era a range overlaps, in order', () => {
  assert.deepEqual(erasForRange(1860, 1875), ['absolutism', 'dualism']);
  assert.deepEqual(erasForRange(1859, 1859), ['absolutism']);
  assert.deepEqual(erasForRange(1910, 1920), ['dualism', 'wwi', 'interwar']);
});

test('erasForRange handles nulls and single-sided ranges', () => {
  assert.deepEqual(erasForRange(null, null), []);
  assert.deepEqual(erasForRange(1900, null), ['dualism']);
  assert.deepEqual(erasForRange(null, 1900), ['dualism']);
});

test('erasForRange spanning the full open edges still resolves', () => {
  assert.deepEqual(erasForRange(1700, 1830), ['early', 'reform_era']);
  assert.deepEqual(erasForRange(1995, 2026), ['contemporary']);
});

test('eraLabel returns locale-specific labels and null for unknown ids', () => {
  assert.equal(eraLabel('reform_era'), 'Reform Era');
  assert.equal(eraLabel('reform_era', 'en'), 'Reform Era');
  assert.equal(eraLabel('reform_era', 'hu'), 'Reformkor');
  assert.equal(eraLabel('not_a_real_era'), null);
});
