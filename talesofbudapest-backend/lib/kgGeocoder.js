import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { districtFromPostcode, parseBudapestAddress } from './hungarianAddress.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIACRITICS = /[\u0300-\u036f]/g;

export const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const DEFAULT_CACHE_PATH = path.join(__dirname, '../../ingest/corpus/restricted/experiments/geocode.cache.json');
/** Nominatim usage policy: max 1 request/second for the public API. */
export const DEFAULT_MIN_INTERVAL_MS = 1100;
/** Budapest bounding box (lon/lat), used with bounded=1 to bias results toward the city. */
const BUDAPEST_VIEWBOX = '18.92,47.62,19.20,47.35';

const fold = (value) => String(value ?? '').normalize('NFKD').replace(DIACRITICS, '');

/** Cache key: accent-folded, lowercased, whitespace-collapsed. */
export const normalizeGeocodeQuery = (value) => fold(value)
  .toLocaleLowerCase('en')
  .replace(/\s+/g, ' ')
  .trim();

const BUDAPEST_MENTION_RE = /budapest/i;

/** English<->Hungarian generic-term swaps tried once when the first attempt returns zero results. */
const TERM_PAIRS = [
  { en: '(?:street|st)', hu: 'utca' },
  { en: 'square', hu: 'tér' },
  { en: 'boulevard', hu: 'körút' },
  { en: 'synagogue', hu: 'zsinagóga' },
  { en: 'cemetery', hu: 'temető' },
  { en: '(?:café|cafe)', hu: 'kávéház' },
  { en: 'baths', hu: 'fürdő' },
  { en: 'bridge', hu: 'híd' },
  { en: 'church', hu: 'templom' },
];

/** Returns the query with one generic term swapped English<->Hungarian, or null if no term matched. */
export const swapGenericTerm = (query) => {
  const text = String(query ?? '');
  for (const { en, hu } of TERM_PAIRS) {
    const enPattern = new RegExp(`\\b${en}\\b`, 'i');
    if (enPattern.test(text)) return text.replace(enPattern, hu);
  }
  for (const { en, hu } of TERM_PAIRS) {
    const huFolded = fold(hu);
    const huPattern = new RegExp(`\\b(?:${hu}|${huFolded})\\b`, 'i');
    if (huPattern.test(text)) return text.replace(huPattern, en.replace(/^\(\?:|\)$/g, '').split('|')[0]);
  }
  return null;
};

/** Appends ", Budapest, Hungary" unless the query already mentions Budapest. */
export const shapeBudapestQuery = (query) => BUDAPEST_MENTION_RE.test(query) ? query : `${query}, Budapest, Hungary`;

const STREET_LEVEL_WORDS = [
  'utca', 'ter', 'korut', 'zsinagoga', 'temeto', 'kavehaz', 'furdo', 'hid', 'templom',
  'street', 'square', 'boulevard', 'synagogue', 'cemetery', 'cafe', 'baths', 'bridge', 'church', 'avenue', 'road',
];

/** A query is "street-level" when it names a specific address/building rather than a bare place/district name. */
export const isStreetLevelQuery = (query) => {
  const folded = fold(query).toLowerCase();
  if (/\d/.test(folded)) return true;
  return STREET_LEVEL_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(folded));
};

const ADMIN_PLACE_TYPES = new Set([
  'city', 'town', 'village', 'suburb', 'borough', 'quarter', 'county', 'state', 'country', 'city_district', 'municipality', 'hamlet',
]);
const HIGH_PRECISION_CLASSES = new Set(['amenity', 'shop', 'tourism', 'historic', 'leisure', 'office', 'place_of_worship', 'railway']);

const classOf = (result) => result.category ?? result.class ?? null;

/**
 * Structured street/house-number/postcode/district ingredients read off
 * Nominatim's `addressdetails=1` response. Falls back to parsing the
 * district out of `display_name` (and then `suburb`) when the postcode is
 * missing or doesn't resolve to a district. Returns null when nothing
 * usable was found, so downstream merging can tell "no Nominatim address
 * signal" apart from "Nominatim confirmed no district".
 */
export const extractNominatimAddress = (result) => {
  const addr = result?.address ?? {};
  const street_name = addr.road ?? null;
  const house_number = addr.house_number ?? null;
  const postcode = addr.postcode ?? null;
  let district = postcode ? districtFromPostcode(postcode) : null;
  if (district === null) district = parseBudapestAddress(result?.display_name ?? '').district;
  if (district === null && addr.suburb) district = parseBudapestAddress(addr.suburb).district;
  if (!street_name && !house_number && !postcode && district === null) return null;
  return { street_name, house_number, postcode, district };
};

/** True for city/suburb/administrative-boundary results, which are too coarse for 50m linking. */
export const isAdministrativeResult = (result) => {
  const cls = classOf(result); const type = result.type;
  return (cls === 'boundary' && type === 'administrative') || (cls === 'place' && ADMIN_PLACE_TYPES.has(type));
};

/** 0..1 confidence blending Nominatim's importance with how address-precise the result's class/type is. */
export const scoreConfidence = (result) => {
  const cls = classOf(result); const type = result.type;
  const importance = Number.isFinite(Number(result.importance)) ? Number(result.importance) : 0.2;
  let classWeight = 0.5;
  if (isAdministrativeResult(result)) classWeight = 0.1;
  else if (cls === 'building' || type === 'house' || cls === 'highway') classWeight = 0.95;
  else if (HIGH_PRECISION_CLASSES.has(cls)) classWeight = 0.85;
  return Math.max(0, Math.min(1, importance * 0.5 + classWeight * 0.5));
};

const MATCH_CONFIDENCE_THRESHOLD = 0.35;

const normalizeResult = (query, results, { usedSwap = false } = {}) => {
  if (!results.length) return { query, matched: false };
  const best = results[0];
  const admin = isAdministrativeResult(best);
  const streetLevel = isStreetLevelQuery(query);
  const confidence = Number(scoreConfidence(best).toFixed(3));
  const tooCoarse = admin && streetLevel;
  const matched = !tooCoarse && confidence >= MATCH_CONFIDENCE_THRESHOLD;
  const result = {
    query, matched,
    lat: Number(best.lat), lon: Number(best.lon),
    display_name: best.display_name ?? null,
    osm_type: best.osm_type ?? null, osm_id: best.osm_id ?? null,
    category: classOf(best), type: best.type ?? null,
    importance: Number.isFinite(Number(best.importance)) ? Number(best.importance) : null,
    confidence,
  };
  if (tooCoarse) result.reason = 'administrative_result_for_street_level_query';
  if (usedSwap) result.matched_via = 'term_swap';
  const nominatimAddress = extractNominatimAddress(best);
  if (nominatimAddress) result.address = nominatimAddress;
  return result;
};

const defaultUserAgent = () => `talesofbudapest-kg/1.0 (contact: ${process.env.NOMINATIM_CONTACT_EMAIL || 'set NOMINATIM_CONTACT_EMAIL'})`;

/**
 * Free-tier Nominatim geocoder for one-time batch geocoding, biased toward
 * Budapest. Cache-first: a normalized query already present in `cache` never
 * touches the network. Live calls are paced at least `minIntervalMs` apart,
 * per Nominatim's public-API usage policy (max 1 request/second, identifying
 * User-Agent, aggressive caching of results).
 *
 * `cache` must implement `get(key)` / `set(key, value)`; see `createFileCache`.
 */
export const createGeocoder = ({
  fetchImpl = fetch,
  cache,
  userAgent,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  baseUrl = DEFAULT_NOMINATIM_URL,
  sleepImpl = (ms) => delay(ms),
  now = () => Date.now(),
  retryWaitMs = Math.max(minIntervalMs * 5, 5000),
} = {}) => {
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new Error('cache with get(key)/set(key, value) is required');
  }
  const resolvedUserAgent = userAgent ?? defaultUserAgent();
  const stats = { cacheHits: 0, liveCalls: 0, matched: 0, unmatched: 0, errors: 0 };
  let lastCallAt = null;

  const throttle = async () => {
    const wait = lastCallAt === null ? 0 : minIntervalMs - (now() - lastCallAt);
    if (wait > 0) await sleepImpl(wait);
    lastCallAt = now();
  };

  const buildUrl = (searchText) => {
    const url = new URL(baseUrl);
    url.searchParams.set('q', searchText);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '3');
    url.searchParams.set('countrycodes', 'hu');
    url.searchParams.set('accept-language', 'hu,en');
    url.searchParams.set('viewbox', BUDAPEST_VIEWBOX);
    url.searchParams.set('bounded', '1');
    url.searchParams.set('addressdetails', '1');
    return url;
  };

  const call = async (searchText) => {
    await throttle();
    stats.liveCalls += 1;
    return fetchImpl(buildUrl(searchText).toString(), { headers: { 'User-Agent': resolvedUserAgent } });
  };

  /** One live request, with a single retry-after-longer-wait on 429/5xx. */
  const request = async (searchText) => {
    let response = await call(searchText);
    if (response.status === 429 || response.status >= 500) {
      await sleepImpl(retryWaitMs);
      response = await call(searchText);
    }
    if (!response.ok) {
      stats.errors += 1;
      return { error: `nominatim_${response.status}` };
    }
    const body = await response.json();
    return { results: Array.isArray(body) ? body : [] };
  };

  const geocode = async (query) => {
    const trimmed = String(query ?? '').trim();
    if (!trimmed) return { query: trimmed, matched: false, error: 'empty_query' };
    const cacheKey = normalizeGeocodeQuery(trimmed);
    const cached = cache.get(cacheKey);
    if (cached) { stats.cacheHits += 1; return cached; }

    const record = (result) => { cache.set(cacheKey, result); return result; };

    const primary = await request(shapeBudapestQuery(trimmed));
    if (primary.error) { stats.unmatched += 1; return record({ query: trimmed, matched: false, error: primary.error }); }

    let results = primary.results;
    let usedSwap = false;
    if (results.length === 0) {
      const swapped = swapGenericTerm(trimmed);
      if (swapped) {
        usedSwap = true;
        const fallback = await request(shapeBudapestQuery(swapped));
        if (fallback.error) { stats.unmatched += 1; return record({ query: trimmed, matched: false, error: fallback.error }); }
        results = fallback.results;
      }
    }

    const result = normalizeResult(trimmed, results, { usedSwap });
    if (result.matched) stats.matched += 1; else stats.unmatched += 1;
    return record(result);
  };

  return { geocode, stats: () => ({ ...stats }) };
};

/**
 * Persistent JSON-file cache: loads the whole file into memory on creation
 * and flushes to disk on every `set` (or on demand via `save()`).
 */
export const createFileCache = (filePath = DEFAULT_CACHE_PATH) => {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  let store = {};
  if (fs.existsSync(resolved)) {
    try { store = JSON.parse(fs.readFileSync(resolved, 'utf8')); } catch { store = {}; }
  }
  const save = () => fs.writeFileSync(resolved, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return {
    get: (key) => store[key],
    set: (key, value) => { store[key] = value; save(); },
    save,
    entries: () => ({ ...store }),
    path: resolved,
  };
};
