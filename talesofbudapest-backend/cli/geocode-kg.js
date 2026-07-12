import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parseBudapestAddress } from '../lib/hungarianAddress.js';
import { createFileCache, createGeocoder } from '../lib/kgGeocoder.js';
import { normalizeLocationName } from '../lib/kgLocationResolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const DEFAULT_INPUT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.entities.jsonl');

const option = (args, name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? fallback;
};

const GENERIC_NAMES = new Set(['budapest', 'hungary', 'magyarorszag']);
const DISTRICT_ONLY_RE = /^(district\s+[ivxlcdm]+|[ivxlcdm]+\s*kerulet)$/;

/** Accent-folded, punctuation-stripped form used only to detect obviously ungeocodable generics. */
const foldForGenericCheck = (value) => String(value ?? '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Bare city/country names and lone district labels ("Budapest", "Hungary", "VII. kerület") carry no geocodable detail. */
export const isObviouslyUngeocodable = (name) => {
  const folded = foldForGenericCheck(name);
  if (!folded) return true;
  if (GENERIC_NAMES.has(folded)) return true;
  if (DISTRICT_ONLY_RE.test(folded)) return true;
  return false;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-word containment — a plain substring check would treat "Buda" as already present in "...within Budapest". */
const containsWholeWord = (haystack, needle) => new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(haystack);

/** Prefer an explicit address (with the name prefixed, unless already redundant); fall back to the bare name. */
export const buildGeocodeQuery = (location) => {
  const name = String(location?.name_en ?? '').trim();
  const address = String(location?.address_en ?? location?.address_source ?? '').trim();
  if (!address) return name || null;
  if (name && !containsWholeWord(address, name)) return `${name}, ${address}`;
  return address;
};

const readJsonl = async (filePath) => {
  const text = await fs.readFile(filePath, 'utf8');
  return text.split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL at line ${index + 1} of ${filePath}`); }
  });
};

/**
 * Builds one geocode query per unique staged location name (same normalization
 * the rest of the KG pipeline uses), preferring the first mention that carries
 * an address. Returns the queries to run plus how many names were skipped as
 * obviously ungeocodable generics.
 */
export const collectUniqueLocationQueries = (records) => {
  const unique = new Map();
  let skipped = 0;
  for (const record of records) {
    const locations = record?.payload?.locations;
    if (!Array.isArray(locations)) continue;
    for (const location of locations) {
      const name = String(location?.name_en ?? '').trim();
      if (!name) continue;
      if (isObviouslyUngeocodable(name)) { skipped += 1; continue; }
      const query = buildGeocodeQuery(location);
      if (!query) continue;
      const dedupeKey = normalizeLocationName(name);
      const addressText = String(location?.address_en ?? location?.address_source ?? '').trim();
      const hasAddress = Boolean(addressText);
      const existing = unique.get(dedupeKey);
      if (existing) {
        existing.stagedNames.add(name);
        if (hasAddress && !existing.hasAddress) { existing.query = query; existing.hasAddress = true; existing.addressText = addressText; }
      } else {
        unique.set(dedupeKey, { query, stagedNames: new Set([name]), hasAddress, addressText: hasAddress ? addressText : '' });
      }
    }
  }
  return {
    queries: [...unique.values()].map(({ query, stagedNames, addressText }) => ({ query, staged_names: [...stagedNames], address_text: addressText })),
    skipped,
  };
};

/**
 * Merges the address classified from the staged text (`parseBudapestAddress`
 * on `address_en`/`source_address_hu`) with the address Nominatim returned
 * (`kgGeocoder.js extractNominatimAddress`, via `geocodeResult.address`).
 * Staged text wins for street/house-number (it's the historical source);
 * Nominatim wins for postcode/district (it's an independent, current-day
 * check). A district disagreement between the two is flagged rather than
 * silently resolved, since it's a strong signal the candidate doesn't
 * actually match (see kgLocationResolver.js scoreLocationCandidate).
 */
export const mergeAddressSources = (parsedStaged, nominatimAddress) => {
  const staged = parsedStaged ?? {};
  const nominatim = nominatimAddress ?? {};
  const hasStaged = Boolean(staged.street_name || staged.house_number || staged.district || staged.postcode);
  const hasNominatim = Boolean(nominatim.street_name || nominatim.house_number || nominatim.district || nominatim.postcode);
  const merged = {
    street_name: staged.street_name ?? nominatim.street_name ?? null,
    house_number: staged.house_number ?? nominatim.house_number ?? null,
    postcode: nominatim.postcode ?? staged.postcode ?? null,
    district: nominatim.district ?? staged.district ?? null,
    address_source: hasStaged && hasNominatim ? 'both' : hasStaged ? 'parsed' : hasNominatim ? 'nominatim' : null,
  };
  if (staged.district != null && nominatim.district != null && staged.district !== nominatim.district) merged.district_conflict = true;
  return merged;
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPath = path.resolve(option(args, '--input', DEFAULT_INPUT));
  const limitOption = option(args, '--limit');
  const limit = limitOption ? Number(limitOption) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
  const dryRun = args.includes('--dry-run');

  const records = await readJsonl(inputPath);
  const { queries, skipped } = collectUniqueLocationQueries(records);
  const batch = limit ? queries.slice(0, limit) : queries;

  console.log(`geocode-kg: ${dryRun ? 'DRY RUN' : 'LIVE'} — sends only place names/addresses to the public Nominatim API (nominatim.openstreetmap.org). No private page text, quotes, or citations leave this machine.`);
  console.log(`Input: ${inputPath}`);
  console.log(`Unique locations: ${queries.length} (skipped ${skipped} obviously ungeocodable generic name(s)); processing ${batch.length} this run.`);

  if (dryRun) {
    batch.forEach((item, index) => console.log(`[${index + 1}/${batch.length}] would query: "${item.query}"  (staged as: ${item.staged_names.join(' / ')})`));
    console.log('\nDry run — no network calls were made.');
    return;
  }

  const cache = createFileCache();
  const geocoder = createGeocoder({ cache });
  const results = [];
  for (const [index, item] of batch.entries()) {
    const { address: nominatimAddress, ...result } = await geocoder.geocode(item.query);
    const parsedStaged = parseBudapestAddress(item.address_text);
    const merged = mergeAddressSources(parsedStaged, nominatimAddress);
    results.push({ ...result, staged_names: item.staged_names, ...merged });
    const label = result.error ? `error (${result.error})` : result.matched ? `matched (confidence ${result.confidence})` : 'no match';
    console.log(`[${index + 1}/${batch.length}] ${label}: "${item.query}"`);
  }

  const base = path.basename(inputPath).replace(/\.entities\.jsonl$/i, '').replace(/\.jsonl$/i, '');
  const outputPath = path.join(path.dirname(inputPath), `${base}.geocoded.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  const stats = geocoder.stats();
  console.log('\nSummary:');
  console.log(`  total unique locations: ${queries.length}`);
  console.log(`  processed this run: ${batch.length}`);
  console.log(`  cache hits: ${stats.cacheHits}`);
  console.log(`  live calls: ${stats.liveCalls}`);
  console.log(`  matched: ${stats.matched}`);
  console.log(`  unmatched: ${stats.unmatched}`);
  console.log(`  errors: ${stats.errors}`);
  console.log(`Results: ${outputPath}`);
  console.log(`Cache: ${cache.path}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
