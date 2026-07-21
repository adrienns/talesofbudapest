#!/usr/bin/env node
/**
 * Bridge V3 extraction output to the tour app's knowledge-graph shape.
 *
 * Dry by default: writes <source>.kg-load-plan.json describing exactly what a
 * Supabase load would upsert, so the mapping is inspectable before any write.
 * App-safety rules enforced here:
 *  - facts carry our short paraphrases (statement_en) + page citations, never
 *    verbatim book quotes (those stay in the restricted JSONL, license red)
 *  - only supported items are eligible; everything keeps run_id provenance
 *  - entity ids are the stable source-local se_* hashes, identical across
 *    chapter batches, so repeated loads upsert instead of duplicating
 *  - address facts join items by page + offset overlap and carry OSM
 *    street-level coordinates (ODbL attribution included)
 *  - canonical_events are schema-constrained assemblies of supported claims;
 *    derived_relations are projections, not new source assertions
 *
 * Usage: node cli/transform-v3-to-kg.js [--source jewish-budapest] [--pages 46,47]
 *   [--pages 1-579]  (ranges and comma lists, same as build-langextract-browser)
 *   [--include-experiment fullbook-v2.12,fullbook-v2.12-retry]
 *
 * Default skips every row with experiment_id. With --include-experiment, matching
 * experiment rows are allowed when status is complete or failed_cost_gate; the
 * load plan is marked provisional so it is never confused with promoted publish.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleCanonicalEvents } from '../lib/historicalExtractionV2.js';
import { buildSubjectEntityIndex, setPlacesGazetteerIndex, getPlaceRepairLog, clearPlaceRepairLog } from '../lib/historicalSubjectMemory.js';
import { loadPlacesIndex } from '../lib/budapestPlacesGazetteer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

/** Parse `--pages` like the browser: "15-24" or "15,16,20" or "1-10,20,30-32". */
const parsePagesFlag = (raw) => new Set(String(raw).split(',').flatMap((part) => {
  const trimmed = part.trim();
  if (!trimmed) return [];
  const range = trimmed.match(/^(\d+)-(\d+)$/);
  if (!range) return [Number(trimmed)];
  const out = [];
  for (let page = Number(range[1]); page <= Number(range[2]); page += 1) out.push(page);
  return out;
}));

const SOURCE_ID = option('--source', 'jewish-budapest');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const OUTPUT = option('--output', path.join(EXTRACTIONS, `${SOURCE_ID}.kg-load-plan.json`));
const PAGE_FILTER = option('--pages') ? parsePagesFlag(option('--pages')) : null;
const INCLUDE_EXPERIMENT = option('--include-experiment')
  ? new Set(option('--include-experiment').split(',').map((id) => id.trim()).filter(Boolean))
  : null;
const EXPERIMENT_STATUSES = new Set(['complete', 'failed_cost_gate']);

const PLACE_TYPES = new Set(['place', 'building', 'business']);
const PERSON_TYPES = new Set(['person', 'family']);
const YEAR_PATTERN = /\b(1[0-9]{3}|20[0-2][0-9])\b/gu;

const readJsonl = async (file) => (await fs.readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(JSON.parse);

const isAllowedItemRow = (row) => {
  if (!Array.isArray(row.items)) return false;
  if (row.experiment_id) {
    if (!INCLUDE_EXPERIMENT?.has(row.experiment_id)) return false;
    return EXPERIMENT_STATUSES.has(row.status);
  }
  return row.status !== 'preflight';
};

const isAllowedAddressRow = (row) => {
  if (!row.experiment_id) return true;
  return INCLUDE_EXPERIMENT?.has(row.experiment_id) ?? false;
};

const main = async () => {
  const itemRows = await readJsonl(path.join(EXTRACTIONS, `${SOURCE_ID}.historical-items-v3.jsonl`));
  const addressRows = await readJsonl(path.join(EXTRACTIONS, `${SOURCE_ID}.historical-addresses-v3.jsonl`));
  // Latest allowed row per page set wins (non-experiment, or listed experiment).
  const latest = new Map();
  for (const row of itemRows) {
    if (!isAllowedItemRow(row)) continue;
    latest.set((row.pdf_pages ?? []).join(','), row);
  }
  const latestAddresses = new Map();
  for (const row of addressRows) {
    if (!isAllowedAddressRow(row)) continue;
    latestAddresses.set((row.pdf_pages ?? []).join(','), row);
  }

  let placesIndex = null;
  try {
    placesIndex = await loadPlacesIndex();
    setPlacesGazetteerIndex(placesIndex);
  } catch {
    setPlacesGazetteerIndex(null);
  }

  const entities = new Map();
  const facts = [];
  const relations = [];
  const addressFacts = [];
  const supportedForEvents = [];
  let placeRepairs = 0;

  for (const [key, run] of latest) {
    const runPages = run.pdf_pages ?? [];
    // Drop index-only (or otherwise out-of-range) page sets entirely so their
    // entity aliases cannot pollute mention-sorted graphs.
    if (PAGE_FILTER && !runPages.some((page) => PAGE_FILTER.has(page))) continue;
    const addresses = (latestAddresses.get(key)?.address_references ?? [])
      .filter((address) => !PAGE_FILTER || PAGE_FILTER.has(address.page_ref));

    let entityRows = run.entity_aliases ?? [];
    let items = run.items ?? [];
    if (placesIndex && (run.mentions ?? []).length) {
      clearPlaceRepairLog();
      const reindexed = buildSubjectEntityIndex({
        sourceId: SOURCE_ID,
        mentions: (run.mentions ?? []).map((mention) => ({ ...mention, subject_entity_id: undefined })),
      });
      placeRepairs += getPlaceRepairLog().length;
      const idMap = new Map();
      for (let i = 0; i < (run.mentions ?? []).length; i += 1) {
        const previous = run.mentions[i].subject_entity_id;
        const next = reindexed.mentions[i]?.subject_entity_id;
        if (previous && next && previous !== next) idMap.set(previous, next);
      }
      entityRows = [...reindexed.entities.values()].map((entity) => ({
        ...entity,
        aliases: [...entity.aliases],
        roles: [...entity.roles],
      }));
      items = items.map((item) => ({
        ...item,
        subject_entity_id: idMap.get(item.subject_entity_id) ?? item.subject_entity_id,
        participants: (item.participants ?? []).map((participant) => ({
          ...participant,
          resolved_entity_id: idMap.get(participant.resolved_entity_id) ?? participant.resolved_entity_id,
        })),
      }));
    }

    for (const entity of entityRows) {
      const existing = entities.get(entity.entity_id);
      const merged = existing ?? { entity_id: entity.entity_id, label: entity.label, type: entity.type, kind: PERSON_TYPES.has(entity.type) ? 'person' : PLACE_TYPES.has(entity.type) ? 'location' : entity.type === 'organisation' ? 'organisation' : 'concept', aliases: new Set(), roles: new Set(), owner_entity_id: entity.owner_entity_id ?? null };
      for (const alias of entity.aliases ?? []) merged.aliases.add(alias);
      for (const role of entity.roles ?? []) merged.roles.add(role);
      entities.set(entity.entity_id, merged);
      if (entity.owner_entity_id) {
        relations.push({ from_entity_id: entity.entity_id, relation: 'owned_by', to_entity_id: entity.owner_entity_id, run_id: run.run_id });
      }
    }
    for (const item of items) {
      if (item.verification?.verdict !== 'supported') continue;
      const evidence = item.evidence ?? [];
      const pages = [...new Set(evidence.map((entry) => entry.page_ref))];
      if (PAGE_FILTER && !pages.some((page) => PAGE_FILTER.has(page))) continue;
      const years = [...new Set((item.statement_en.match(YEAR_PATTERN) ?? []).map(Number))];
      const overlapping = evidence.flatMap((entry) => addresses.filter((address) => address.page_ref === entry.page_ref
        && address.start_offset < entry.end_offset && address.end_offset > entry.start_offset));
      const fact = {
        fact_id: item.item_id,
        statement: item.statement_en,
        kind: item.kind,
        assertion_kind: item.assertion_kind ?? null,
        open_type: item.open_type,
        canonical_type: item.canonical_type ?? null,
        polarity: item.polarity,
        modality: item.modality,
        attribution: item.attribution ?? null,
        subject_entity_id: item.subject_entity_id ?? null,
        participant_entity_ids: [...new Set((item.participants ?? []).map((participant) => participant.resolved_entity_id).filter(Boolean))],
        pages,
        year_hints: years,
        addresses: overlapping.map((address) => ({ street: address.modern_street, house_number: address.house_number, center: address.center })),
        run_id: run.run_id,
        source_id: `${SOURCE_ID}-private`,
        ...(run.experiment_id ? {
          certification: 'experiment_provisional',
          source_status: run.status,
          experiment_id: run.experiment_id,
        } : {}),
      };
      facts.push(fact);
      supportedForEvents.push(item);
      if (fact.subject_entity_id) relations.push({ from_entity_id: fact.subject_entity_id, relation: 'subject_of_fact', to_entity_id: fact.fact_id, run_id: run.run_id });
    }
    for (const address of addresses) {
      if (!address.modern_street || !address.center) continue;
      addressFacts.push({ street: address.modern_street, house_number: address.house_number, historical_name: address.historical_name, center: address.center, page: address.page_ref });
    }
  }

  const canonicalEvents = assembleCanonicalEvents(supportedForEvents);
  for (const event of canonicalEvents) {
    for (const derived of event.derived_relations ?? []) {
      relations.push({ ...derived, run_id: 'projection' });
    }
  }

  const plan = {
    ...(INCLUDE_EXPERIMENT ? {
      provisional: true,
      include_experiment: [...INCLUDE_EXPERIMENT],
      place_ocr_repairs: placeRepairs,
    } : {}),
    source: {
      id: `${SOURCE_ID}-private`,
      license_verdict: 'red',
      note: 'Fact statements are original short paraphrases and app-displayable; verbatim evidence quotes remain in the restricted extraction JSONL and must never ship to clients.',
      geometry_attribution: 'Street coordinates © OpenStreetMap contributors (ODbL)',
    },
    counts: {
      entities: entities.size,
      people: [...entities.values()].filter((entity) => entity.kind === 'person').length,
      locations: [...entities.values()].filter((entity) => entity.kind === 'location').length,
      facts: facts.length,
      facts_with_years: facts.filter((fact) => fact.year_hints.length).length,
      facts_with_addresses: facts.filter((fact) => fact.addresses.length).length,
      canonical_events: canonicalEvents.length,
      relations: relations.length,
      address_points: addressFacts.length,
      place_ocr_repairs: placeRepairs,
    },
    entities: [...entities.values()].map((entity) => ({ ...entity, aliases: [...entity.aliases].slice(0, 20), roles: [...entity.roles] })),
    facts,
    canonical_events: canonicalEvents,
    relations,
    address_points: addressFacts,
    generated_at: new Date().toISOString(),
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(plan, null, 1)}\n`, 'utf8');
  console.log(JSON.stringify({ output: OUTPUT, ...plan.counts }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
