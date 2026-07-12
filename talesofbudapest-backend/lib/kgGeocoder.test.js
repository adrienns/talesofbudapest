import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createFileCache, createGeocoder, extractNominatimAddress, isAdministrativeResult, isStreetLevelQuery,
  normalizeGeocodeQuery, scoreConfidence, shapeBudapestQuery, swapGenericTerm,
} from './kgGeocoder.js';

const memoryCache = () => { const store = new Map(); return { get: (key) => store.get(key), set: (key, value) => store.set(key, value), store }; };
const noSleep = async () => {};
const streetResult = (overrides = {}) => ({
  lat: '47.4959', lon: '19.0605', display_name: 'Dohány utca 2, Budapest', osm_type: 'way', osm_id: 123,
  category: 'amenity', type: 'place_of_worship', importance: 0.6,
  address: { road: 'Dohány utca', house_number: '2', postcode: '1074', suburb: 'Erzsébetváros' },
  ...overrides,
});
const cityResult = (overrides = {}) => ({
  lat: '47.4979', lon: '19.0402', display_name: 'Budapest, Hungary', osm_type: 'relation', osm_id: 999,
  category: 'place', type: 'city', importance: 0.9, ...overrides,
});

test('cache-first: a repeated query never re-hits the network', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200, json: async () => [streetResult()] }; };
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const first = await geocoder.geocode('Dohány utca 2');
  const second = await geocoder.geocode('Dohány utca 2');
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
  assert.equal(geocoder.stats().cacheHits, 1);
  assert.equal(geocoder.stats().liveCalls, 1);
});

test('normalizeGeocodeQuery accent-folds, lowercases, and collapses whitespace', () => {
  assert.equal(normalizeGeocodeQuery('  Dohány   Utca  '), 'dohany utca');
  assert.equal(normalizeGeocodeQuery('Dohany utca'), normalizeGeocodeQuery('Dohány   utca'));
});

test('rate limiting: the sleep implementation is awaited between two live calls', async () => {
  const waits = [];
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [streetResult()] });
  let clock = 0;
  const geocoder = createGeocoder({
    fetchImpl, cache: memoryCache(), minIntervalMs: 1100,
    now: () => clock,
    sleepImpl: async (ms) => { waits.push(ms); clock += ms; },
  });
  await geocoder.geocode('Query One');
  await geocoder.geocode('Query Two');
  assert.deepEqual(waits, [1100]);
  assert.equal(geocoder.stats().liveCalls, 2);
});

test('requests include Budapest-biasing params and an identifying User-Agent', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => { requests.push({ url: new URL(url), init }); return { ok: true, status: 200, json: async () => [streetResult()] }; };
  const previousEmail = process.env.NOMINATIM_CONTACT_EMAIL;
  process.env.NOMINATIM_CONTACT_EMAIL = 'kg@example.com';
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  await geocoder.geocode('Dohány utca 2');
  process.env.NOMINATIM_CONTACT_EMAIL = previousEmail;
  const { url, init } = requests[0];
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('limit'), '3');
  assert.equal(url.searchParams.get('countrycodes'), 'hu');
  assert.equal(url.searchParams.get('accept-language'), 'hu,en');
  assert.equal(url.searchParams.get('bounded'), '1');
  assert.equal(url.searchParams.get('viewbox'), '18.92,47.62,19.20,47.35');
  assert.equal(url.searchParams.get('addressdetails'), '1');
  assert.match(url.searchParams.get('q'), /Budapest, Hungary$/);
  assert.match(init.headers['User-Agent'], /talesofbudapest-kg\/1\.0 \(contact: kg@example\.com\)/);
});

test('default User-Agent falls back to a placeholder when no contact email is set', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [streetResult()] });
  const previousEmail = process.env.NOMINATIM_CONTACT_EMAIL;
  delete process.env.NOMINATIM_CONTACT_EMAIL;
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  await geocoder.geocode('Dohány utca 2');
  process.env.NOMINATIM_CONTACT_EMAIL = previousEmail;
  assert.equal(geocoder.stats().liveCalls, 1);
});

test('shapeBudapestQuery only appends the city when not already mentioned', () => {
  assert.equal(shapeBudapestQuery('Dohány utca 2'), 'Dohány utca 2, Budapest, Hungary');
  assert.equal(shapeBudapestQuery('Dohány utca 2, Budapest'), 'Dohány utca 2, Budapest');
});

test('term-swap fallback triggers on an empty first response', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('q');
    seen.push(q);
    if (/street/i.test(q)) return { ok: true, status: 200, json: async () => [] };
    return { ok: true, status: 200, json: async () => [streetResult()] };
  };
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const result = await geocoder.geocode('Dohány Street');
  assert.equal(seen.length, 2);
  assert.match(seen[1], /utca/i);
  assert.equal(result.matched, true);
  assert.equal(result.matched_via, 'term_swap');
});

test('swapGenericTerm swaps in both directions and returns null with no match', () => {
  assert.equal(swapGenericTerm('Dohány Street'), 'Dohány utca');
  assert.equal(swapGenericTerm('Dohány utca'), 'Dohány street');
  assert.equal(swapGenericTerm('Kazinczy Synagogue'), 'Kazinczy zsinagóga');
  assert.equal(swapGenericTerm('Random Place Name'), null);
});

test('a city-level result for a street-level query is not matched', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [cityResult()] });
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const result = await geocoder.geocode('Dohány utca 2');
  assert.equal(result.matched, false);
  assert.equal(result.reason, 'administrative_result_for_street_level_query');
  assert.equal(isAdministrativeResult(cityResult()), true);
  assert.equal(isStreetLevelQuery('Dohány utca 2'), true);
});

test('scoreConfidence favors address-precise results over administrative ones', () => {
  assert.ok(scoreConfidence(streetResult()) > scoreConfidence(cityResult()));
});

test('extractNominatimAddress reads road/house_number/postcode from addressdetails and derives district from the postcode', () => {
  assert.deepEqual(extractNominatimAddress(streetResult()), {
    street_name: 'Dohány utca', house_number: '2', postcode: '1074', district: 7,
  });
});

test('extractNominatimAddress falls back to parsing display_name for district when the postcode is missing', () => {
  const result = extractNominatimAddress({
    address: { road: 'Dob utca' },
    display_name: 'Dob utca, VII. kerület, Budapest, Hungary',
  });
  assert.equal(result.street_name, 'Dob utca');
  assert.equal(result.postcode, null);
  assert.equal(result.district, 7);
});

test('extractNominatimAddress falls back to parsing the suburb when display_name has no district either', () => {
  const result = extractNominatimAddress({
    address: { road: 'Dob utca', suburb: 'VII. kerület' },
    display_name: 'Dob utca, Erzsébetváros, Budapest, Hungary',
  });
  assert.equal(result.district, 7);
});

test('extractNominatimAddress returns null when the result carries no usable address ingredients', () => {
  assert.equal(extractNominatimAddress(cityResult()), null);
  assert.equal(extractNominatimAddress(undefined), null);
});

test('geocode() attaches the extracted Nominatim address onto the result for a matched street-level query', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [streetResult()] });
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const result = await geocoder.geocode('Dohány utca 2');
  assert.deepEqual(result.address, { street_name: 'Dohány utca', house_number: '2', postcode: '1074', district: 7 });
});

test('geocode() carries no address field when Nominatim returns nothing usable', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [cityResult({ importance: 0.95 })] });
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const result = await geocoder.geocode('Óbuda');
  assert.equal(result.address, undefined);
});

test('a bare place-name query without street-level signals can still match a city result', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [cityResult({ importance: 0.95 })] });
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const result = await geocoder.geocode('Óbuda');
  assert.equal(isStreetLevelQuery('Óbuda'), false);
  assert.equal(result.matched, true);
});

test('429 triggers one retry after a longer wait, then records a failure in the cache without hammering the API', async () => {
  let calls = 0;
  const waits = [];
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 429, json: async () => [] }; };
  const cache = memoryCache();
  const geocoder = createGeocoder({
    fetchImpl, cache, sleepImpl: async (ms) => waits.push(ms), retryWaitMs: 5000, minIntervalMs: 1100,
  });
  const result = await geocoder.geocode('Dohány utca 2');
  assert.equal(calls, 2, 'exactly one retry after the initial 429');
  assert.equal(waits.includes(5000), true, 'waits the longer retry interval before retrying');
  assert.equal(result.matched, false);
  assert.equal(result.error, 'nominatim_429');
  assert.equal(geocoder.stats().errors, 1);

  calls = 0;
  const second = await geocoder.geocode('Dohány utca 2');
  assert.equal(calls, 0, 'a cached failure must not re-hit the network');
  assert.deepEqual(second, result);
});

test('5xx responses are retried the same way as 429', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 503, json: async () => [] }; };
  const geocoder = createGeocoder({ fetchImpl, cache: memoryCache(), sleepImpl: noSleep });
  const result = await geocoder.geocode('Dohány utca 2');
  assert.equal(calls, 2);
  assert.equal(result.error, 'nominatim_503');
});

test('file cache round-trips through a fresh createGeocoder instance', async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kg-geocode-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cachePath = path.join(dir, 'nested', 'geocode.cache.json');

  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200, json: async () => [streetResult()] }; };
  const firstCache = createFileCache(cachePath);
  const firstGeocoder = createGeocoder({ fetchImpl, cache: firstCache, sleepImpl: noSleep });
  const first = await firstGeocoder.geocode('Dohány utca 2');
  assert.equal(calls, 1);
  assert.ok(fs.existsSync(cachePath), 'cache file is flushed on write');

  const reloadedCache = createFileCache(cachePath);
  const reloadedGeocoder = createGeocoder({ fetchImpl, cache: reloadedCache, sleepImpl: noSleep });
  const second = await reloadedGeocoder.geocode('Dohány utca 2');
  assert.equal(calls, 1, 'a fresh geocoder backed by the same cache file must not re-hit the network');
  assert.deepEqual(second, first);

  const onDisk = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  assert.equal(onDisk[normalizeGeocodeQuery('Dohány utca 2')].matched, true);
});
