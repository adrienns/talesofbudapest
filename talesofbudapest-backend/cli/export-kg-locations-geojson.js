#!/usr/bin/env node
/**
 * Export location entities from a V3 kg-load-plan as GeoJSON.
 *
 * Coordinates prefer (in order):
 *   1) centers already joined onto facts.addresses in the load plan
 *   2) address_points in the load plan (street match)
 *   3) places gazetteer landmark/street centers when unique
 *
 * Each feature carries mention_samples:
 *   - Prefer evidence quotes from historical-items-v3.jsonl for supported items
 *     whose subject_entity_id or participants match the location entity
 *   - Fall back to load-plan fact statements + pages when no evidence exists
 *
 * OSM geometry attribution (ODbL) is embedded. Provisional plans stay tagged.
 *
 * Usage:
 *   node cli/export-kg-locations-geojson.js
 *   node cli/export-kg-locations-geojson.js --input ...kg-load-plan-provisional.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlacesIndex, loadStreetGazetteer, loadJsonIfExists, LANDMARKS_PATH, normalizePlaceKey } from '../lib/budapestPlacesGazetteer.js';
import { repairKnownOcrInText } from '../lib/hungarianOcrGazetteer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const INPUT = option('--input', path.join(EXTRACTIONS, 'jewish-budapest.kg-load-plan-provisional.json'));
const OUTPUT = option('--output', path.join(EXTRACTIONS, 'jewish-budapest.locations-map-provisional.geojson'));
const ITEMS = option('--items', path.join(EXTRACTIONS, 'jewish-budapest.historical-items-v3.jsonl'));
const SAMPLE_CAP_RAW = option('--sample-cap', '0');
const SAMPLE_CAP = SAMPLE_CAP_RAW === 'all' || SAMPLE_CAP_RAW === '0'
  ? Number.POSITIVE_INFINITY
  : Math.max(1, Number(SAMPLE_CAP_RAW) || 0);
const MAX_PAGE = Math.max(1, Number(option('--max-page', '579')) || 579);
const EXPERIMENT_STATUSES = new Set(['complete', 'failed_cost_gate']);

const normalizeWs = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();

const polishSampleFields = (sample, placesIndex) => {
  const polish = (value) => {
    const raw = normalizeWs(value) || null;
    if (!raw) return { display: null, ocr: null };
    if (!placesIndex) return { display: raw, ocr: raw };
    return { display: repairKnownOcrInText(raw, placesIndex).text, ocr: raw };
  };
  const quote = polish(sample.quote);
  const statement = polish(sample.statement);
  return {
    ...sample,
    quote: quote.display,
    ocr_quote: quote.ocr,
    statement: statement.display,
    ocr_statement: statement.ocr,
  };
};
const nearKey = (quote) => normalizeWs(quote).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').slice(0, 120);

const selectDiverseDeduped = (samples, cap = SAMPLE_CAP) => {
  const seen = new Set();
  const unique = [];
  for (const sample of samples) {
    const key = nearKey(sample.quote || sample.statement || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(sample);
  }
  if (unique.length <= cap) {
    return unique.sort((a, b) => a.page - b.page || String(a.quote || a.statement).localeCompare(String(b.quote || b.statement)));
  }
  const byPage = new Map();
  for (const sample of unique) {
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
  return selected.sort((a, b) => a.page - b.page || String(a.quote || a.statement).localeCompare(String(b.quote || b.statement)));
};

const entityIdsForItem = (item) => {
  const ids = new Set();
  if (item.subject_entity_id) ids.add(item.subject_entity_id);
  for (const participant of item.participants ?? []) {
    if (participant?.resolved_entity_id) ids.add(participant.resolved_entity_id);
  }
  return ids;
};

const loadEvidenceByEntity = async (itemsPath, experimentIds) => {
  const byEntity = new Map();
  const allowedExperiments = experimentIds?.length ? new Set(experimentIds) : null;
  const text = await fs.readFile(itemsPath, 'utf8').catch(() => '');
  for (const line of text.split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (!Array.isArray(row.items)) continue;
    if (row.experiment_id) {
      if (!allowedExperiments?.has(row.experiment_id)) continue;
      if (!EXPERIMENT_STATUSES.has(row.status)) continue;
    } else if (allowedExperiments) {
      // When filtering to experiment runs, skip non-experiment rows.
      continue;
    }
    for (const item of row.items) {
      if (item.verification?.verdict !== 'supported') continue;
      const statement = normalizeWs(item.statement_en || item.statement) || null;
      const evidence = (item.evidence ?? []).filter((entry) => {
        const page = Number(entry.page_ref);
        return Number.isInteger(page) && page >= 1 && page <= MAX_PAGE && normalizeWs(entry.quote);
      });
      if (!evidence.length) continue;
      const ids = entityIdsForItem(item);
      if (!ids.size) continue;
      for (const entityId of ids) {
        const list = byEntity.get(entityId) ?? [];
        for (const entry of evidence) {
          list.push({
            page: entry.page_ref,
            quote: normalizeWs(entry.quote),
            statement,
          });
        }
        byEntity.set(entityId, list);
      }
    }
  }
  return byEntity;
};

const factSamplesByEntity = (plan) => {
  const byEntity = new Map();
  for (const fact of plan.facts ?? []) {
    const statement = normalizeWs(fact.statement) || null;
    const pages = (fact.pages ?? []).filter((page) => Number(page) >= 1 && Number(page) <= MAX_PAGE);
    if (!statement || !pages.length) continue;
    const ids = [fact.subject_entity_id, ...(fact.participant_entity_ids ?? [])].filter(Boolean);
    for (const entityId of ids) {
      const list = byEntity.get(entityId) ?? [];
      for (const page of pages) {
        list.push({
          page,
          quote: null,
          statement,
        });
      }
      byEntity.set(entityId, list);
    }
  }
  return byEntity;
};

const main = async () => {
  const plan = JSON.parse(await fs.readFile(INPUT, 'utf8'));
  const locations = (plan.entities ?? []).filter((entity) => entity.kind === 'location');
  const experimentIds = plan.include_experiment
    ?? (option('--include-experiment')
      ? option('--include-experiment').split(',').map((id) => id.trim()).filter(Boolean)
      : ['fullbook-v2.12', 'fullbook-v2.12-retry']);

  const evidenceByEntity = await loadEvidenceByEntity(ITEMS, experimentIds);
  const factsByEntity = factSamplesByEntity(plan);

  const centersByEntity = new Map();
  for (const fact of plan.facts ?? []) {
    const addr = (fact.addresses ?? []).find((address) => address?.center?.lat != null && address?.center?.lon != null);
    if (!addr) continue;
    const ids = [fact.subject_entity_id, ...(fact.participant_entity_ids ?? [])].filter(Boolean);
    for (const id of ids) {
      if (!centersByEntity.has(id)) {
        centersByEntity.set(id, {
          center: addr.center,
          street: addr.street ?? null,
          house_number: addr.house_number ?? null,
          source: 'fact_address',
        });
      }
    }
  }

  const streetCenters = new Map();
  for (const point of plan.address_points ?? []) {
    if (!point?.center?.lat || !point?.modern_street) continue;
    const key = normalizePlaceKey(`${point.street} ${point.house_number ?? ''}`);
    if (key && !streetCenters.has(key)) {
      streetCenters.set(key, { center: point.center, street: point.street, house_number: point.house_number ?? null, source: 'address_point' });
    }
    const streetKey = normalizePlaceKey(point.street);
    if (streetKey && !streetCenters.has(streetKey)) {
      streetCenters.set(streetKey, { center: point.center, street: point.street, house_number: null, source: 'address_point_street' });
    }
  }

  let placesIndex = null;
  let streets = [];
  let landmarks = [];
  try {
    placesIndex = await loadPlacesIndex();
    const streetsDoc = await loadStreetGazetteer();
    streets = streetsDoc?.streets ?? [];
    landmarks = (await loadJsonIfExists(LANDMARKS_PATH))?.landmarks ?? [];
  } catch {
    placesIndex = null;
  }

  const landmarkCenterByKey = new Map();
  for (const landmark of landmarks) {
    const center = landmark.center ?? (landmark.lat != null && landmark.lon != null
      ? { lat: landmark.lat, lon: landmark.lon, precision: 'landmark' }
      : null);
    if (!center) continue;
    const key = landmark.key ?? normalizePlaceKey(landmark.name);
    if (key) landmarkCenterByKey.set(key, center);
    for (const alias of landmark.aliases ?? []) {
      const aliasKey = normalizePlaceKey(alias);
      if (aliasKey && !landmarkCenterByKey.has(aliasKey)) landmarkCenterByKey.set(aliasKey, center);
    }
  }

  const streetCenterByKey = new Map();
  for (const street of streets) {
    if (!street?.center) continue;
    const key = street.key ?? normalizePlaceKey(street.modern);
    if (key) streetCenterByKey.set(key, street.center);
  }

  const features = [];
  let withCoords = 0;
  let withoutCoords = 0;
  let withEvidenceSamples = 0;
  let withFactFallback = 0;

  for (const entity of locations) {
    let hit = centersByEntity.get(entity.entity_id) ?? null;
    if (!hit) {
      for (const alias of [entity.label, ...(entity.aliases ?? [])]) {
        const key = normalizePlaceKey(alias);
        if (!key) continue;
        if (streetCenters.has(key)) { hit = streetCenters.get(key); break; }
        if (landmarkCenterByKey.has(key)) {
          hit = { center: landmarkCenterByKey.get(key), street: null, house_number: null, source: 'gazetteer_landmark' };
          break;
        }
        if (streetCenterByKey.has(key)) {
          hit = { center: streetCenterByKey.get(key), street: alias, house_number: null, source: 'gazetteer_street' };
          break;
        }
        const entry = placesIndex?.entries?.[key];
        if (entry?.unique && entry.layer === 'landmark' && landmarkCenterByKey.has(entry.key ?? entry.id)) {
          hit = { center: landmarkCenterByKey.get(entry.key ?? entry.id), street: null, house_number: null, source: 'places_index' };
          break;
        }
      }
    }

    const evidenceSamples = evidenceByEntity.get(entity.entity_id) ?? [];
    let mentionSamples = selectDiverseDeduped(evidenceSamples, SAMPLE_CAP)
      .map((sample) => polishSampleFields(sample, placesIndex));
    let sampleSource = mentionSamples.length ? 'evidence' : null;
    if (!mentionSamples.length) {
      mentionSamples = selectDiverseDeduped(factsByEntity.get(entity.entity_id) ?? [], SAMPLE_CAP)
        .map((sample) => polishSampleFields(sample, placesIndex));
      if (mentionSamples.length) sampleSource = 'fact_statement';
    }
    if (sampleSource === 'evidence') withEvidenceSamples += 1;
    if (sampleSource === 'fact_statement') withFactFallback += 1;

    if (hit?.center?.lat != null && hit?.center?.lon != null) {
      withCoords += 1;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [hit.center.lon, hit.center.lat] },
        properties: {
          entity_id: entity.entity_id,
          label: entity.label,
          type: entity.type,
          kind: entity.kind,
          aliases: entity.aliases ?? [],
          coord_source: hit.source,
          street: hit.street ?? null,
          house_number: hit.house_number ?? null,
          precision: hit.center.precision ?? null,
          mention_samples: mentionSamples,
          mention_sample_total: Math.max(evidenceSamples.length, (factsByEntity.get(entity.entity_id) ?? []).length),
          mention_sample_source: sampleSource,
          provisional: plan.provisional === true,
          source_id: plan.source?.id ?? null,
        },
      });
    } else {
      withoutCoords += 1;
    }
  }

  const collection = {
    type: 'FeatureCollection',
    attribution: 'Street/landmark geometry © OpenStreetMap contributors (ODbL). Entity labels from provisional KG paraphrases. Book quotes from immutable OCR evidence.',
    generated_at: new Date().toISOString(),
    provisional: plan.provisional === true,
    include_experiment: plan.include_experiment ?? experimentIds,
    sample_cap: Number.isFinite(SAMPLE_CAP) ? SAMPLE_CAP : null,
    max_page: MAX_PAGE,
    counts: {
      location_entities: locations.length,
      with_coordinates: withCoords,
      without_coordinates: withoutCoords,
      with_evidence_samples: withEvidenceSamples,
      with_fact_fallback_samples: withFactFallback,
    },
    features,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(collection)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: OUTPUT,
    ...collection.counts,
    features: features.length,
    sample_cap: Number.isFinite(SAMPLE_CAP) ? SAMPLE_CAP : 'all',
  }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
