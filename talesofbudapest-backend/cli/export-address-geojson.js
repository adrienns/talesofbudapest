#!/usr/bin/env node
/**
 * Export extracted address facts as GeoJSON for the app's own map rendering.
 *
 * The geometry comes from OpenStreetMap street centroids (ODbL — attribution
 * embedded below and required wherever this file is displayed). The facts
 * (which streets/addresses the book references, on which pages) are ours.
 * Nothing is copied from any historical map; a map drawn from this file is a
 * new work over an OSM base.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const INPUT = option('--input', path.join(EXTRACTIONS, `${SOURCE_ID}.historical-addresses-v3.jsonl`));
const OUTPUT = option('--output', path.join(EXTRACTIONS, `${SOURCE_ID}.historical-map.geojson`));

const main = async () => {
  const rows = (await fs.readFile(INPUT, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  // Latest record per page set wins; experiment runs are excluded.
  const latestByPages = new Map();
  for (const row of rows) {
    if (row.experiment_id) continue;
    latestByPages.set((row.pdf_pages ?? []).join(','), row);
  }
  const byStreet = new Map();
  for (const record of latestByPages.values()) {
    for (const reference of record.address_references ?? []) {
      if (!reference.modern_street) continue;
      // Key on the canonical modern street so OCR variants of one street
      // collapse into a single feature.
      const key = `${reference.modern_street.toLowerCase()}${reference.house_number ?? ''}`;
      const entry = byStreet.get(key) ?? {
        modern_street: reference.modern_street,
        house_number: reference.house_number ?? null,
        center: reference.center ?? null,
        historical_names: new Set(),
        pages: new Set(),
        mentions: 0,
      };
      entry.mentions += 1;
      entry.pages.add(reference.page_ref);
      if (reference.historical_name) entry.historical_names.add(reference.historical_name);
      if (!entry.center && reference.center) entry.center = reference.center;
      byStreet.set(key, entry);
    }
  }
  const features = [...byStreet.values()].filter((entry) => entry.center).map((entry) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [entry.center.lon, entry.center.lat] },
    properties: {
      street: entry.modern_street,
      house_number: entry.house_number,
      historical_names: [...entry.historical_names],
      source_pages: [...entry.pages].sort((a, b) => a - b),
      mention_count: entry.mentions,
      precision: entry.center.precision ?? 'street',
      source_id: SOURCE_ID,
    },
  }));
  const collection = {
    type: 'FeatureCollection',
    attribution: 'Street geometry © OpenStreetMap contributors (ODbL). Historical facts extracted from source text.',
    generated_at: new Date().toISOString(),
    features,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(collection, null, 1)}\n`, 'utf8');
  const unlocated = [...byStreet.values()].filter((entry) => !entry.center).length;
  console.log(JSON.stringify({ output: OUTPUT, features: features.length, unlocated_streets: unlocated }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
