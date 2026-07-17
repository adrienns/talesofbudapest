#!/usr/bin/env node
/**
 * Build the Budapest street gazetteer from OpenStreetMap (Overpass API) plus
 * the seeded historical rename table.
 *
 * Data provenance and licensing:
 * - Street names and centroids come from OpenStreetMap (© OpenStreetMap
 *   contributors, ODbL). The gazetteer is a derived database: keep the
 *   attribution field intact wherever this data is displayed, and treat the
 *   geodata portion as share-alike under ODbL.
 * - Historical rename periods are plain facts (not copyrightable); entries are
 *   seeded from well-documented renames and extended only by human-verified
 *   lookups (see cli/hungaricana-lookup.js). No third-party database is bulk
 *   harvested.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '../../ingest/gazetteer/budapest-streets.json');
const RENAMES = path.join(__dirname, '../data/budapest-street-renames.json');
const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

// Bounding box slightly larger than Budapest proper; nearby-town streets are
// harmless for name matching and the bbox query is far cheaper for Overpass
// than administrative-area resolution.
const QUERY = `[out:json][timeout:180];
way["highway"]["name"](47.35,18.92,47.62,19.34);
out tags center;`;

export const normalizeStreetKey = (value) => String(value ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();

const KILOMETRES_PER_DEGREE = 111;
const distanceKm = (left, right) => Math.hypot(
  (left.lat - right.lat) * KILOMETRES_PER_DEGREE,
  (left.lon - right.lon) * KILOMETRES_PER_DEGREE * Math.cos((left.lat * Math.PI) / 180),
);

/**
 * Group a street's way centres into geographic clusters.
 *
 * Budapest reuses street names across districts (there are several
 * `Táncsics Mihály utca`). Averaging them produces a confident point in the
 * wrong place, which is worse for a tour than no point at all, so a name whose
 * ways form more than one cluster is reported as ambiguous instead.
 */
export const clusterCenters = (centers, radiusKm = 1.2) => {
  const clusters = [];
  for (const center of centers) {
    const hit = clusters.find((cluster) => distanceKm(cluster.seed, center) <= radiusKm);
    if (hit) hit.members.push(center);
    else clusters.push({ seed: center, members: [center] });
  }
  return clusters.map((cluster) => ({
    lat: Number((cluster.members.reduce((sum, row) => sum + row.lat, 0) / cluster.members.length).toFixed(6)),
    lon: Number((cluster.members.reduce((sum, row) => sum + row.lon, 0) / cluster.members.length).toFixed(6)),
    way_count: cluster.members.length,
  })).sort((left, right) => right.way_count - left.way_count);
};

const main = async () => {
  console.error('Fetching Budapest streets from Overpass (OpenStreetMap, ODbL)...');
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'talesofbudapest-gazetteer/1.0 (historical tour project; one-off street-name build)',
    },
    body: `data=${encodeURIComponent(QUERY)}`,
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`Overpass request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
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

  const renameTable = JSON.parse(await fs.readFile(RENAMES, 'utf8'));
  const renamesByKey = new Map(renameTable.renames.map((row) => [normalizeStreetKey(row.modern), row.historical ?? []]));

  const streets = [...byName.values()].map((entry) => {
    const clusters = clusterCenters(entry.centers);
    // One cluster: a usable street point. Several: the name is reused across
    // districts, so refuse a centre and hand the caller the candidates.
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

  // Historical names whose modern street was not found in OSM still belong in
  // the gazetteer so OCR matching can find them.
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
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(gazetteer, null, 1)}\n`, 'utf8');
  console.log(JSON.stringify({ output: OUTPUT, streets: streets.length, with_center: streets.filter((row) => row.center).length }));
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
