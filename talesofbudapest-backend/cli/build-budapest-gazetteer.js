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
    const entry = byName.get(key) ?? { modern: name, key, way_count: 0, lat_sum: 0, lon_sum: 0, center_count: 0 };
    entry.way_count += 1;
    if (element.center) {
      entry.lat_sum += element.center.lat;
      entry.lon_sum += element.center.lon;
      entry.center_count += 1;
    }
    byName.set(key, entry);
  }

  const renameTable = JSON.parse(await fs.readFile(RENAMES, 'utf8'));
  const renamesByKey = new Map(renameTable.renames.map((row) => [normalizeStreetKey(row.modern), row.historical ?? []]));

  const streets = [...byName.values()].map((entry) => ({
    modern: entry.modern,
    key: entry.key,
    center: entry.center_count ? {
      lat: Number((entry.lat_sum / entry.center_count).toFixed(6)),
      lon: Number((entry.lon_sum / entry.center_count).toFixed(6)),
      precision: 'street',
    } : null,
    historical: (renamesByKey.get(entry.key) ?? []).map((row) => ({
      ...row,
      key: normalizeStreetKey(row.name),
    })),
  })).sort((a, b) => a.key.localeCompare(b.key));

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
