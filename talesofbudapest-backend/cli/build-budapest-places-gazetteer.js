#!/usr/bin/env node
/**
 * Build Budapest landmarks + address points + a compact places index for OCR
 * unique-hit repair. Streets refresh optionally (reuse cache on Overpass failure).
 *
 * Licensing: OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0.
 * Seed merges: Budapest100 / műemlékem / Wikidata stamps retained per row.
 *
 * Resume: if Overpass rate-limits, re-run with --skip-streets / --skip-addresses
 * after backoff; cached streets remain usable.
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ADDRESSES_PATH,
  ADDRESSES_GZ_PATH,
  GAZETTEER_DIR,
  LANDMARKS_PATH,
  PLACES_INDEX_PATH,
  STREETS_PATH,
  buildPlacesIndexDocument,
  normalizePlaceKey,
} from '../lib/budapestPlacesGazetteer.js';
import { clusterCenters, normalizeStreetKey } from './build-budapest-gazetteer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, '../..');
const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const BBOX = '47.35,18.92,47.62,19.34';
const USER_AGENT = 'talesofbudapest-places-gazetteer/1.0 (historical tour; ODbL attribution retained)';

const hasFlag = (name) => process.argv.includes(name);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const overpassFetch = async (query, { attempts = 5 } = {}) => {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(300_000),
      });
      if (response.status === 429 || response.status === 504 || response.status === 502) {
        const wait = Math.min(120_000, 5_000 * 2 ** (attempt - 1));
        console.error(`Overpass ${response.status}; backoff ${wait}ms (attempt ${attempt}/${attempts})`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Overpass failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const wait = Math.min(120_000, 5_000 * 2 ** (attempt - 1));
      console.error(`Overpass error: ${error instanceof Error ? error.message : error}; backoff ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastError ?? new Error('Overpass failed');
};

const LANDMARK_QUERY = `[out:json][timeout:240];
(
  node["name"]["tourism"~"attraction|museum|gallery|viewpoint|zoo|theme_park|hotel"](${BBOX});
  node["name"]["historic"](${BBOX});
  node["name"]["amenity"~"place_of_worship|theatre|cinema|library|university|college|school|hospital|community_centre|townhall|arts_centre|synagogue"](${BBOX});
  way["name"]["tourism"~"attraction|museum|gallery|viewpoint|zoo|theme_park|hotel"](${BBOX});
  way["name"]["historic"](${BBOX});
  way["name"]["amenity"~"place_of_worship|theatre|cinema|library|university|college|school|hospital|community_centre|townhall|arts_centre|synagogue"](${BBOX});
  way["name"]["building"~"church|cathedral|synagogue|mosque|temple|chapel|civic|public|train_station"](${BBOX});
  relation["name"]["historic"](${BBOX});
  relation["name"]["tourism"~"attraction|museum"](${BBOX});
);
out tags center;`;

const ADDRESS_QUERY = `[out:json][timeout:300];
(
  node["addr:street"]["addr:housenumber"](${BBOX});
  way["addr:street"]["addr:housenumber"](${BBOX});
);
out tags center;`;

const loadSeedLandmarks = async () => {
  const rows = [];
  const pushSeed = (row, fallbackSource) => {
    const name = row.name ?? row.address;
    if (!name) return;
    const aliases = [...new Set([row.address, row.name, row.name_en, row.name_hu].filter(Boolean))]
      .filter((alias) => normalizePlaceKey(alias) !== normalizePlaceKey(name));
    rows.push({
      id: `seed:${row.source ?? fallbackSource}:${row.external_id ?? row.slug ?? normalizePlaceKey(name)}`,
      name,
      key: normalizePlaceKey(name),
      aliases,
      landmark_type: row.landmark_type ?? row.category ?? null,
      center: row.lat != null && (row.lng != null || row.lon != null)
        ? { lat: row.lat, lon: row.lng ?? row.lon, precision: 'landmark' }
        : null,
      sources: [{ name: row.source ?? fallbackSource, external_id: row.external_id ?? row.slug ?? null, url: row.sourceUrl ?? null }],
    });
  };

  for (const file of [
    path.join(workspace, 'ingest/output/landmark_seeds.json'),
    path.join(workspace, 'ingest/output/wikipedia_landmarks.json'),
  ]) {
    if (!fsSync.existsSync(file)) continue;
    const payload = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const row of payload) pushSeed(row, path.basename(file, '.json'));
  }
  for (const file of [
    path.join(workspace, 'ingest/output/budapest100_map_anchors.json'),
    path.join(workspace, 'ingest/output/muemlekem_anchors.json'),
  ]) {
    if (!fsSync.existsSync(file)) continue;
    const payload = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const row of payload) pushSeed(row, path.basename(file, '.json'));
  }
  return rows;
};

const osmElementCenter = (element) => {
  if (element.center) return { lat: element.center.lat, lon: element.center.lon, precision: 'landmark' };
  if (element.lat != null && element.lon != null) return { lat: element.lat, lon: element.lon, precision: 'landmark' };
  return null;
};

const buildLandmarksFromOsm = (elements) => {
  const byKey = new Map();
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = tags.name;
    if (!name) continue;
    const key = normalizePlaceKey(name);
    if (!key) continue;
    const aliases = [tags['name:en'], tags['name:hu'], tags.alt_name, tags.old_name, tags.loc_name]
      .flatMap((value) => String(value ?? '').split(';'))
      .map((value) => value.trim())
      .filter(Boolean);
    const id = `osm:${element.type}/${element.id}`;
    const existing = byKey.get(key);
    const center = osmElementCenter(element);
    if (!existing) {
      byKey.set(key, {
        id,
        name,
        key,
        aliases: [...new Set(aliases.filter((alias) => normalizePlaceKey(alias) !== key))],
        landmark_type: tags.tourism ?? tags.historic ?? tags.amenity ?? tags.building ?? null,
        center,
        sources: [{ name: 'OpenStreetMap', osm_type: element.type, osm_id: element.id, license: 'ODbL 1.0' }],
      });
      continue;
    }
    for (const alias of aliases) {
      if (normalizePlaceKey(alias) !== key) existing.aliases.push(alias);
    }
    existing.aliases = [...new Set(existing.aliases)];
    if (!existing.center && center) existing.center = center;
    existing.sources.push({ name: 'OpenStreetMap', osm_type: element.type, osm_id: element.id, license: 'ODbL 1.0' });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const mergeLandmarkRows = (osmRows, seedRows) => {
  const byKey = new Map(osmRows.map((row) => [row.key, { ...row, aliases: [...(row.aliases ?? [])] }]));
  for (const seed of seedRows) {
    const existing = byKey.get(seed.key);
    if (!existing) {
      byKey.set(seed.key, seed);
      continue;
    }
    for (const alias of seed.aliases ?? []) {
      if (normalizePlaceKey(alias) !== existing.key) existing.aliases.push(alias);
    }
    if (seed.name && normalizePlaceKey(seed.name) !== existing.key) existing.aliases.push(seed.name);
    existing.aliases = [...new Set(existing.aliases)];
    if (!existing.center && seed.center) existing.center = seed.center;
    existing.sources = [...(existing.sources ?? []), ...(seed.sources ?? [])];
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const writeAddressesJsonl = async (rows, outPath) => {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const handle = await fs.open(outPath, 'w');
  try {
    for (const row of rows) {
      await handle.write(`${JSON.stringify(row)}\n`);
    }
  } finally {
    await handle.close();
  }
  // gzip companion for repos that prefer compressed storage
  await pipeline(createReadStream(outPath), createGzip(), createWriteStream(`${outPath}.gz`));
};

const buildAddressesFromOsm = (elements) => {
  const rows = [];
  for (const element of elements) {
    const street = element.tags?.['addr:street'];
    const housenumber = element.tags?.['addr:housenumber'];
    if (!street || !housenumber) continue;
    const center = osmElementCenter(element);
    const key = normalizePlaceKey(`${street} ${housenumber}`);
    rows.push({
      id: `osm:${element.type}/${element.id}`,
      street,
      housenumber: String(housenumber).trim(),
      key,
      lat: center?.lat ?? null,
      lon: center?.lon ?? null,
      osm_type: element.type,
      osm_id: element.id,
    });
  }
  return rows;
};

const refreshStreets = async () => {
  console.error('Refreshing streets from Overpass...');
  const QUERY = `[out:json][timeout:180];
way["highway"]["name"](${BBOX});
out tags center;`;
  const payload = await overpassFetch(QUERY);
  const elements = payload.elements ?? [];
  if (!elements.length) throw new Error('Overpass returned no street elements');
  const byName = new Map();
  for (const element of elements) {
    const name = element.tags?.name;
    if (!name) continue;
    const key = normalizeStreetKey(name);
    if (!key) continue;
    const entry = byName.get(key) ?? { modern: name, key, way_count: 0, centers: [] };
    entry.way_count += 1;
    if (element.center) entry.centers.push({ lat: element.center.lat, lon: element.center.lon });
    byName.set(key, entry);
  }
  const renamesPath = path.join(__dirname, '../data/budapest-street-renames.json');
  const renameTable = JSON.parse(await fs.readFile(renamesPath, 'utf8'));
  const renamesByKey = new Map(renameTable.renames.map((row) => [normalizeStreetKey(row.modern), row.historical ?? []]));
  const streets = [...byName.values()].map((entry) => {
    const clusters = clusterCenters(entry.centers);
    const center = clusters.length === 1 ? { lat: clusters[0].lat, lon: clusters[0].lon, precision: 'street' } : null;
    return {
      modern: entry.modern,
      key: entry.key,
      center,
      ambiguous_location: clusters.length > 1 ? true : undefined,
      location_clusters: clusters.length > 1 ? clusters : undefined,
      historical: (renamesByKey.get(entry.key) ?? []).map((row) => ({
        ...row,
        key: normalizeStreetKey(row.name),
      })),
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
  for (const [modernKey, historical] of renamesByKey) {
    if (byName.has(modernKey) || !historical.length) continue;
    const modern = renameTable.renames.find((row) => normalizeStreetKey(row.modern) === modernKey)?.modern;
    streets.push({ modern, key: modernKey, center: null, historical: historical.map((row) => ({ ...row, key: normalizeStreetKey(row.name) })) });
  }
  const gazetteer = {
    generated_at: new Date().toISOString(),
    sources: [
      { name: 'OpenStreetMap', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
      { name: 'Seeded historical renames', license: 'facts', file: 'data/budapest-street-renames.json' },
    ],
    street_count: streets.length,
    streets,
  };
  await fs.mkdir(GAZETTEER_DIR, { recursive: true });
  await fs.writeFile(STREETS_PATH, `${JSON.stringify(gazetteer, null, 1)}\n`, 'utf8');
  console.error(`Wrote ${streets.length} streets → ${STREETS_PATH}`);
  return gazetteer;
};

const main = async () => {
  await fs.mkdir(GAZETTEER_DIR, { recursive: true });
  let streetsDoc = null;
  if (!hasFlag('--skip-streets')) {
    try {
      streetsDoc = await refreshStreets();
    } catch (error) {
      console.error(`Street refresh failed (${error instanceof Error ? error.message : error}); using cache.`);
      streetsDoc = JSON.parse(await fs.readFile(STREETS_PATH, 'utf8'));
    }
  } else {
    streetsDoc = JSON.parse(await fs.readFile(STREETS_PATH, 'utf8'));
    console.error(`Using cached streets (${streetsDoc.street_count ?? streetsDoc.streets?.length})`);
  }

  let landmarks = [];
  if (!hasFlag('--skip-landmarks')) {
    console.error('Fetching landmarks from Overpass...');
    try {
      const payload = await overpassFetch(LANDMARK_QUERY);
      landmarks = buildLandmarksFromOsm(payload.elements ?? []);
      console.error(`OSM landmarks: ${landmarks.length}`);
    } catch (error) {
      console.error(`Landmark Overpass failed: ${error instanceof Error ? error.message : error}; seeds only.`);
      landmarks = [];
    }
    const seeds = await loadSeedLandmarks();
    landmarks = mergeLandmarkRows(landmarks, seeds);
    const landmarksDoc = {
      generated_at: new Date().toISOString(),
      sources: [
        { name: 'OpenStreetMap', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
        { name: 'Budapest100 / műemlékem / Wikidata seeds', file: 'ingest/output/*_anchors.json, landmark_seeds.json, wikipedia_landmarks.json' },
      ],
      landmark_count: landmarks.length,
      landmarks,
    };
    await fs.writeFile(LANDMARKS_PATH, `${JSON.stringify(landmarksDoc, null, 1)}\n`, 'utf8');
    console.error(`Wrote ${landmarks.length} landmarks → ${LANDMARKS_PATH}`);
  } else if (fsSync.existsSync(LANDMARKS_PATH)) {
    landmarks = JSON.parse(await fs.readFile(LANDMARKS_PATH, 'utf8')).landmarks ?? [];
  }

  let addresses = [];
  if (!hasFlag('--skip-addresses')) {
    console.error('Fetching address points from Overpass (may be large)...');
    try {
      const payload = await overpassFetch(ADDRESS_QUERY);
      addresses = buildAddressesFromOsm(payload.elements ?? []);
      await writeAddressesJsonl(addresses, ADDRESSES_PATH);
      // Prefer keeping gzip in repo; drop uncompressed if huge (>40MB)
      const stat = await fs.stat(ADDRESSES_PATH);
      if (stat.size > 40 * 1024 * 1024) {
        await fs.unlink(ADDRESSES_PATH);
        console.error(`Dropped uncompressed addresses (${stat.size} bytes); kept ${ADDRESSES_GZ_PATH}`);
      }
      console.error(`Wrote ${addresses.length} addresses`);
    } catch (error) {
      console.error(`Address Overpass failed: ${error instanceof Error ? error.message : error}`);
      addresses = [];
      await fs.writeFile(path.join(GAZETTEER_DIR, 'budapest-addresses.RESUME.md'), `# Resume addresses

Overpass address fetch failed at ${new Date().toISOString()}.

\`\`\`bash
cd talesofbudapest-backend
node cli/build-budapest-places-gazetteer.js --skip-streets --skip-landmarks
\`\`\`

Cached streets/landmarks remain valid. Attribution: © OpenStreetMap contributors, ODbL.
`);
    }
  } else {
    // Load a sample for index if file exists — full address layer is optional for OCR token repair
    console.error('Skipping address fetch (--skip-addresses)');
  }

  const index = buildPlacesIndexDocument({
    streets: streetsDoc.streets ?? [],
    landmarks,
    // Indexing every address key balloons the JSON; keep street+landmark keys
    // for OCR identity. Address JSONL remains the load path for geocoding.
    addresses: [],
    sources: [
      ...(streetsDoc.sources ?? []),
      { name: 'landmarks+index', file: 'budapest-landmarks.json / budapest-places-index.json' },
      { name: 'addresses', file: 'budapest-addresses.jsonl.gz', load: 'lib/budapestPlacesGazetteer.js#loadAddresses' },
    ],
  });
  // Attach address count without loading all into index entries
  index.counts.addresses = addresses.length || index.counts.addresses;
  if (!addresses.length && (fsSync.existsSync(ADDRESSES_GZ_PATH) || fsSync.existsSync(ADDRESSES_PATH))) {
    // count lines cheaply
    try {
      const { spawnSync } = await import('node:child_process');
      const file = fsSync.existsSync(ADDRESSES_GZ_PATH) ? ADDRESSES_GZ_PATH : ADDRESSES_PATH;
      const counted = spawnSync('bash', ['-lc', file.endsWith('.gz') ? `gzip -dc ${JSON.stringify(file)} | wc -l` : `wc -l < ${JSON.stringify(file)}`], { encoding: 'utf8' });
      index.counts.addresses = Number(String(counted.stdout).trim()) || 0;
    } catch { /* ignore */ }
  }
  await fs.writeFile(PLACES_INDEX_PATH, `${JSON.stringify(index)}\n`, 'utf8');
  console.log(JSON.stringify({
    streets: streetsDoc.street_count ?? streetsDoc.streets?.length,
    landmarks: landmarks.length,
    addresses: index.counts.addresses,
    places_index_keys: index.counts.keys,
    places_index_tokens: index.counts.tokens,
    outputs: { STREETS_PATH, LANDMARKS_PATH, ADDRESSES_PATH, ADDRESSES_GZ_PATH, PLACES_INDEX_PATH },
  }, null, 2));
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
