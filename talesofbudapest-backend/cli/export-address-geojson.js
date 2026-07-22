#!/usr/bin/env node
/**
 * Export extracted address facts as GeoJSON for the app's own map rendering.
 *
 * The geometry comes from OpenStreetMap street centroids (ODbL — attribution
 * embedded below and required wherever this file is displayed). The facts
 * (which streets/addresses the book references, on which pages) are ours.
 * Nothing is copied from any historical map; a map drawn from this file is a
 * new work over an OSM base.
 *
 * Features include mention_samples: exact OCR surface + short context quote
 * sliced from immutable pages.txt around start_offset/end_offset.
 *
 * Usage:
 *   node cli/export-address-geojson.js
 *   node cli/export-address-geojson.js --include-experiment fullbook-v2.12,fullbook-v2.12-retry
 *   node cli/export-address-geojson.js --include-experiment ... --output ...provisional.geojson
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHistoricalPages } from '../lib/historicalExtractionV2.js';
import { loadPlacesIndex } from '../lib/budapestPlacesGazetteer.js';
import { repairKnownOcrInText } from '../lib/hungarianOcrGazetteer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const INPUT = option('--input', path.join(EXTRACTIONS, `${SOURCE_ID}.historical-addresses-v3.jsonl`));
const PAGES_TXT = option('--pages-txt', path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`));
const INCLUDE_EXPERIMENT = option('--include-experiment')
  ? new Set(option('--include-experiment').split(',').map((id) => id.trim()).filter(Boolean))
  : null;
const OUTPUT = option(
  '--output',
  path.join(
    EXTRACTIONS,
    INCLUDE_EXPERIMENT
      ? `${SOURCE_ID}.historical-map-provisional.geojson`
      : `${SOURCE_ID}.historical-map.geojson`,
  ),
);
// 0 / "all" = every mention (user wants full book text on click). Cap only when set.
const SAMPLE_CAP_RAW = option('--sample-cap', '0');
const SAMPLE_CAP = SAMPLE_CAP_RAW === 'all' || SAMPLE_CAP_RAW === '0'
  ? Number.POSITIVE_INFINITY
  : Math.max(1, Number(SAMPLE_CAP_RAW) || 0);
const CONTEXT_PAD = Math.max(20, Number(option('--context-pad', '120')) || 120);
const MAX_PAGE = Number(option('--max-page', '579')) || 579; // exclude index pp.580+

const isAllowedAddressRow = (row) => {
  if (!row.experiment_id) return true;
  return INCLUDE_EXPERIMENT?.has(row.experiment_id) ?? false;
};

const normalizeWs = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();

const contextQuote = (pageText, startOffset, endOffset, pad = CONTEXT_PAD) => {
  if (typeof pageText !== 'string') return null;
  const start = Number(startOffset);
  const end = Number(endOffset);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  const left = Math.max(0, start - pad);
  const right = Math.min(pageText.length, end + pad);
  const quote = normalizeWs(pageText.slice(left, right));
  return quote || null;
};

/** Prefer page diversity: round-robin across pages, then sort by page. */
const selectDiverseSamples = (samples, cap = SAMPLE_CAP) => {
  if (samples.length <= cap) {
    return [...samples].sort((a, b) => a.page - b.page || String(a.surface).localeCompare(String(b.surface)));
  }
  const byPage = new Map();
  for (const sample of samples) {
    const list = byPage.get(sample.page) ?? [];
    list.push(sample);
    byPage.set(sample.page, list);
  }
  const pages = [...byPage.keys()].sort((a, b) => a - b);
  const selected = [];
  let round = 0;
  while (selected.length < cap) {
    let added = false;
    for (const page of pages) {
      const list = byPage.get(page);
      if (round < list.length) {
        selected.push(list[round]);
        added = true;
        if (selected.length >= cap) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return selected.sort((a, b) => a.page - b.page || String(a.surface).localeCompare(String(b.surface)));
};

const main = async () => {
  const placesIndex = await loadPlacesIndex().catch(() => null);
  const polish = (value) => {
    const raw = normalizeWs(value) || null;
    if (!raw) return { display: null, ocr: null };
    if (!placesIndex) return { display: raw, ocr: raw };
    const repaired = repairKnownOcrInText(raw, placesIndex).text;
    return { display: repaired, ocr: raw };
  };
  const pageTextByRef = new Map(
    parseHistoricalPages(await fs.readFile(PAGES_TXT, 'utf8')).map((page) => [page.page, page.text]),
  );
  const rows = (await fs.readFile(INPUT, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  // Latest allowed record per page set wins. Default skips experiment runs;
  // --include-experiment mirrors transform-v3-to-kg.
  const latestByPages = new Map();
  for (const row of rows) {
    if (!isAllowedAddressRow(row)) continue;
    latestByPages.set((row.pdf_pages ?? []).join(','), row);
  }
  const byStreet = new Map();
  for (const record of latestByPages.values()) {
    for (const reference of record.address_references ?? []) {
      if (!reference.modern_street) continue;
      if (Number(reference.page_ref) > MAX_PAGE) continue; // index / back-matter dumps
      // Key on the canonical modern street so OCR variants of one street
      // collapse into a single feature.
      const key = `${reference.modern_street.toLowerCase()}\u001f${reference.house_number ?? ''}`;
      const entry = byStreet.get(key) ?? {
        modern_street: reference.modern_street,
        house_number: reference.house_number ?? null,
        center: reference.center ?? null,
        historical_names: new Set(),
        pages: new Set(),
        mentions: 0,
        experiment_ids: new Set(),
        samples: [],
      };
      entry.mentions += 1;
      entry.pages.add(reference.page_ref);
      if (reference.historical_name) entry.historical_names.add(reference.historical_name);
      if (!entry.center && reference.center) entry.center = reference.center;
      if (record.experiment_id) entry.experiment_ids.add(record.experiment_id);

      const surfaceRaw = normalizeWs(reference.street_raw) || null;
      const quoteRaw = contextQuote(
        pageTextByRef.get(reference.page_ref),
        reference.start_offset,
        reference.end_offset,
      );
      if (surfaceRaw || quoteRaw) {
        const surface = polish(surfaceRaw);
        const quote = polish(quoteRaw);
        entry.samples.push({
          page: reference.page_ref,
          surface: surface.display,
          ocr_surface: surface.ocr,
          house_number: reference.house_number ?? null,
          quote: quote.display,
          ocr_quote: quote.ocr,
        });
      }
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
      mention_samples: selectDiverseSamples(entry.samples, SAMPLE_CAP),
      mention_sample_total: entry.samples.length,
      precision: entry.center.precision ?? 'street',
      source_id: SOURCE_ID,
      provisional: Boolean(INCLUDE_EXPERIMENT),
      experiment_ids: [...entry.experiment_ids],
    },
  }));
  const collection = {
    type: 'FeatureCollection',
    attribution: 'Street geometry © OpenStreetMap contributors (ODbL). Historical facts extracted from source text.',
    generated_at: new Date().toISOString(),
    provisional: Boolean(INCLUDE_EXPERIMENT),
    include_experiment: INCLUDE_EXPERIMENT ? [...INCLUDE_EXPERIMENT] : null,
    max_page: MAX_PAGE,
    sample_cap: Number.isFinite(SAMPLE_CAP) ? SAMPLE_CAP : null,
    features,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(collection)}\n`, 'utf8');
  const unlocated = [...byStreet.values()].filter((entry) => !entry.center).length;
  const withSamples = features.filter((feature) => (feature.properties.mention_samples?.length ?? 0) > 0).length;
  console.log(JSON.stringify({
    output: OUTPUT,
    features: features.length,
    features_with_mention_samples: withSamples,
    unlocated_streets: unlocated,
    sample_cap: Number.isFinite(SAMPLE_CAP) ? SAMPLE_CAP : 'all',
    max_page: MAX_PAGE,
    provisional: Boolean(INCLUDE_EXPERIMENT),
    include_experiment: INCLUDE_EXPERIMENT ? [...INCLUDE_EXPERIMENT] : null,
  }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
