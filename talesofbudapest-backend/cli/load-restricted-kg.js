import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRestrictedLocation, normalizeLocationName, rankLocationCandidates } from '../lib/kgLocationResolver.js';
import { buildEntityIndex, resolveRelationFks } from '../lib/kgRelationResolver.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const SOURCE_ID = 'jewish-budapest-private';
const VOLUME = 'book';
const INPUT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.entities.jsonl');
const PAGES = path.join(__dirname, '../../ingest/corpus/restricted/text/jewish-budapest.pages.txt');
const REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.location-candidates.json');
const SOURCE = {
  id: SOURCE_ID,
  title: 'Jewish Budapest: Monuments, Rites, History',
  author: 'Kinga Frojimovics et al.',
  source_url: 'private://restricted-corpus/jewish-budapest',
  license: 'Restricted user-provided research copy',
  license_verdict: 'red',
  attribution: 'Jewish Budapest: Monuments, Rites, History (private research corpus)',
};

const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
// A single window can restate the same fact/relation (esp. under the uncapped
// p3 prompt). Postgres rejects an upsert batch that touches one on-conflict row
// twice, so collapse duplicates by their conflict key before upserting.
const uniqueBy = (rows, keyOf) => { const seen = new Set(); return rows.filter((row) => { const key = keyOf(row); if (seen.has(key)) return false; seen.add(key); return true; }); };
const hash = (...values) => crypto.createHash('sha256').update(values.join('\u001f')).digest('hex');
const importance = (value) => Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
const temporal = (value) => ['historical_fact', 'as_described_in_1939', 'planned_as_of_1939'].includes(value) ? value : 'historical_fact';
const allowedKind = (value) => ['location', 'person', 'event', 'organisation'].includes(value) ? value : 'unknown';
const metadata = (value) => /\b(publisher|publishing house|printer|isbn|copyright|contents|bibliography|index|photo credit)\b/i.test(value);

// prompt_version p1 payloads have four arrays (no facts); p2 payloads add a
// fifth top-level `facts` array. Records are validated by payload shape, not
// by which model produced them -- extraction has moved off Qwen, and gating
// on /qwen/i.test(record.model) rejected every legitimate non-Qwen record
// (e.g. google/gemini-2.5-flash, prompt_version restricted-book-entities-p2).
const CORE_PAYLOAD_ARRAYS = ['locations', 'people', 'events', 'relations'];

export const parseRecords = (text) => text.split('\n').filter(Boolean).map((line, index) => {
  let record;
  try { record = JSON.parse(line); } catch { throw new Error(`Invalid JSONL at line ${index + 1}`); }
  if (!record.window_id || !Array.isArray(record.pdf_pages) || !record.payload) throw new Error(`Incomplete record at line ${index + 1}`);
  const payload = record.payload;
  if (!CORE_PAYLOAD_ARRAYS.every((key) => Array.isArray(payload[key]))) {
    throw new Error(`Invalid payload shape at line ${index + 1}: expected locations/people/events/relations arrays`);
  }
  if (payload.facts !== undefined && !Array.isArray(payload.facts)) {
    throw new Error(`Invalid payload shape at line ${index + 1}: facts must be an array when present`);
  }
  return record;
});

export const parsePages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ page_number: Number(match[1]), raw_text: match[2].trim() }));

export const sanitizePayload = (payload) => {
  const rejectedLocations = [];
  const locations = list(payload.locations).filter((location) => {
    const classification = classifyRestrictedLocation(location);
    if (!classification.accept) rejectedLocations.push({ name: location?.name_en ?? null, reason: classification.reason });
    return classification.accept;
  });
  const hasBudapestContext = locations.length > 0;
  const keepContextual = (item) => {
    const text = `${item?.name_en ?? ''} ${item?.title_en ?? ''} ${item?.statement_en ?? ''} ${Object.values(object(item?.evidence)).join(' ')}`;
    return !metadata(text) && (hasBudapestContext || /\b(budapest|buda|pest|obuda|hungar)/i.test(text));
  };
  // p2-only: top-level facts reference their location by location_source_name
  // rather than name_en, so they get their own contextual check.
  const keepFactContextual = (item) => {
    const text = `${item?.text_en ?? ''} ${item?.location_source_name ?? ''} ${Object.values(object(item?.evidence)).join(' ')}`;
    return !metadata(text) && (hasBudapestContext || /\b(budapest|buda|pest|obuda|hungar)/i.test(text));
  };
  return {
    payload: {
      locations,
      people: list(payload.people).filter(keepContextual),
      events: list(payload.events).filter(keepContextual),
      relations: list(payload.relations).filter(keepContextual),
      facts: list(payload.facts).filter(keepFactContextual),
    },
    rejectedLocations,
  };
};

const chunks = (rows, size = 100) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

const main = async () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const inputPath = path.resolve(option(args, '--input') ?? INPUT);
  const pagesPath = path.resolve(option(args, '--pages') ?? PAGES);
  const reportPath = path.resolve(option(args, '--report') ?? REPORT);
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { restLegacy } = createRestClient(baseUrl, serviceKey);

  const [recordText, pageText] = await Promise.all([fs.readFile(inputPath, 'utf8'), fs.readFile(pagesPath, 'utf8')]);
  const records = parseRecords(recordText);
  const pages = parsePages(pageText);
  const sanitized = records.map((record) => ({ record, ...sanitizePayload(object(record.payload)) }));
  const rejected = sanitized.flatMap((entry) => entry.rejectedLocations);
  const upsert = (table, rows, onConflict) => restLegacy(table, 'POST', rows, { on_conflict: onConflict });
  const publicLocations = await restLegacy('locations', 'GET', undefined, { select: 'id,name,latitude,longitude,landmark_type', limit: '10000' });

  const uniqueMentions = new Map();
  for (const entry of sanitized) for (const location of entry.payload.locations) {
    const nameKey = normalizeLocationName(location.name_en);
    if (nameKey && !uniqueMentions.has(nameKey)) uniqueMentions.set(nameKey, location);
  }
  const candidates = [...uniqueMentions.entries()].map(([name_key, mention]) => ({
    name_key,
    name_en: mention.name_en,
    address_en: mention.address_en ?? null,
    location_kind: mention.kind ?? null,
    candidates: rankLocationCandidates(mention, publicLocations).map(({ candidate, ...match }) => ({
      public_location_id: candidate.id, public_name: candidate.name, ...match,
      recommendation: match.autoMatch ? 'high_confidence_review' : 'manual_review',
    })),
  }));
  const summary = {
    mode: commit ? 'commit' : 'dry-run', source_id: SOURCE_ID, extraction_windows: records.length, pages: pages.length,
    accepted_locations: sanitized.reduce((sum, entry) => sum + entry.payload.locations.length, 0),
    accepted_facts: sanitized.reduce((sum, entry) => sum + entry.payload.facts.length, 0),
    unique_locations: uniqueMentions.size, rejected_locations: rejected.length,
    candidate_locations: candidates.filter((item) => item.candidates.length).length,
    high_confidence_candidates: candidates.filter((item) => item.candidates.some((candidate) => candidate.autoMatch)).length,
    privacy: 'restricted-staging-only; no public locations are created or linked automatically',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, rejected, locations: candidates }, null, 2)}\n`, 'utf8');

  if (commit) {
    await upsert('kg_sources', SOURCE, 'id');
    const pageRows = pages.map((page) => ({ source_id: SOURCE_ID, volume: VOLUME, page_number: page.page_number, page_ref: `${SOURCE_ID}:${VOLUME}:page-${page.page_number}`, raw_text: page.raw_text }));
    const storedPages = [];
    for (const batch of chunks(pageRows, 50)) storedPages.push(...await upsert('kg_pages', batch, 'source_id,volume,page_number'));
    const pageIds = new Map(storedPages.map((page) => [page.page_number, page.id]));

    // Relation endpoints must resolve against ALL staged entities of the source,
    // not just the ones in the same 3-page window. Collect entities and raw
    // relation rows across every window, then resolve + upsert relations once
    // the full index exists (see the post-loop pass below).
    const allStagedLocations = []; const allStagedPeople = []; const allStagedEvents = []; const pendingRelations = [];

    for (const entry of sanitized) {
      const { record, payload } = entry;
      const [mention] = await upsert('kg_mentions', {
        source_id: SOURCE_ID, source_window_id: record.window_id, payload, model: record.model,
        prompt_version: record.prompt_version ?? null, extraction_usage: object(record.usage), extracted_at: record.extracted_at ?? null,
      }, 'source_id,source_window_id');
      const mentionPages = list(record.pdf_pages).map((number) => pageIds.get(number)).filter(Boolean).map((page_id) => ({ mention_id: mention.id, page_id }));
      if (mentionPages.length) await upsert('kg_mention_pages', mentionPages, 'mention_id,page_id');

      const locations = new Map(); const locationsBySourceName = new Map(); const people = new Map(); const events = new Map();
      for (const item of payload.locations) {
        const nameKey = normalizeLocationName(item.name_en); if (!nameKey) continue;
        const [row] = await upsert('kg_locations', {
          source_id: SOURCE_ID, name_key: nameKey, name_en: item.name_en.trim(), source_name_hu: item.source_name_hu ?? item.source_name ?? null,
          address_en: item.address_en ?? null, source_address_hu: item.source_address_hu ?? item.address_source ?? null, location_kind: item.kind ?? null,
          evidence: object(item.evidence), first_mention_id: mention.id, resolution_status: 'pending', public_location_id: null,
        }, 'source_id,name_key');
        if (row) {
          locations.set(nameKey, row.id);
          allStagedLocations.push({ id: row.id, name_en: item.name_en, source_name_hu: item.source_name_hu ?? item.source_name ?? null });
          // facts (p2) reference their location by the as-written source name,
          // not name_en, so index both keys.
          const sourceNameKey = normalizeLocationName(item.source_name_hu ?? item.source_name);
          if (sourceNameKey && !locationsBySourceName.has(sourceNameKey)) locationsBySourceName.set(sourceNameKey, row.id);
        }
      }
      for (const item of payload.people) {
        const nameKey = normalizeLocationName(item.name_en); if (!nameKey) continue;
        const [row] = await upsert('kg_people', {
          source_id: SOURCE_ID, name_key: nameKey, canonical_name_en: item.name_en.trim(), source_name_hu: item.source_name_hu ?? item.source_name ?? null,
          role_en: item.role_en ?? null,
          evidence: {
            ...object(item.evidence),
            ...(item.partial_name === true ? { partial_name: true } : {}),
            ...(item.years_hint ? { years_hint: item.years_hint } : {}),
          },
          is_public_figure: item.is_public_figure === true, resolution_status: 'pending',
        }, 'source_id,name_key');
        if (row) { people.set(nameKey, row.id); allStagedPeople.push({ id: row.id, canonical_name_en: item.name_en, source_name_hu: item.source_name_hu ?? item.source_name ?? null }); }
      }
      for (const item of payload.events) {
        if (!item?.title_en?.trim() || !item?.statement_en?.trim()) continue;
        const eventKey = hash(normalizeLocationName(item.title_en), normalizeLocationName(item.statement_en), String(item.when ?? ''));
        const [row] = await upsert('kg_events', {
          source_id: SOURCE_ID, event_key: eventKey, title_en: item.title_en.trim(), statement_en: item.statement_en.trim(),
          claim_type: item.claim_type ?? item.type ?? null, temporal_status: temporal(item.temporal_status), importance: importance(item.importance),
          evidence: { ...object(item.evidence), ...(item.when ? { when: item.when } : {}) }, first_mention_id: mention.id, resolution_status: 'pending',
        }, 'source_id,event_key');
        if (row) { events.set(normalizeLocationName(item.title_en), row.id); allStagedEvents.push({ id: row.id, title_en: item.title_en }); }
      }
      // p2-only: top-level facts, resolved to a staged location by
      // location_source_name when possible. kg_facts.location_id is
      // nullable, so an unresolved reference is stored without one rather
      // than dropped.
      const factRows = list(payload.facts).filter((item) => item?.text_en?.trim()).map((item) => {
        const factLocationKey = normalizeLocationName(item.location_source_name);
        return {
          mention_id: mention.id,
          location_id: locationsBySourceName.get(factLocationKey) ?? locations.get(factLocationKey) ?? null,
          statement_en: item.text_en.trim(),
          claim_type: item.category ?? null,
          temporal_status: temporal(item.temporal_status),
          importance: importance(item.interestingness),
          evidence: {
            ...object(item.evidence),
            location_source_name: item.location_source_name ?? null,
            year: item.year ?? null,
            year_approx: item.year_approx === true,
            confidence: item.confidence ?? null,
          },
          status: 'pending',
        };
      });
      const uniqueFactRows = uniqueBy(factRows, (row) => row.statement_en);
      if (uniqueFactRows.length) await upsert('kg_facts', uniqueFactRows, 'mention_id,statement_en');
      const relationRows = payload.relations.filter((item) => item?.subject_en && item?.predicate && item?.object_en).map((item) => ({
        mention_id: mention.id, subject_text_en: item.subject_en.trim(), subject_kind: allowedKind(item.subject_kind), predicate: item.predicate.trim(),
        object_text_en: item.object_en.trim(), object_kind: allowedKind(item.object_kind), statement_en: item.statement_en ?? null,
        temporal_status: temporal(item.temporal_status), importance: importance(item.importance), evidence: object(item.evidence), status: 'pending',
        subject_location_id: null, subject_person_id: null, subject_event_id: null, subject_organisation_id: null,
        object_location_id: null, object_person_id: null, object_event_id: null, object_organisation_id: null,
      }));
      const uniqueRelationRows = uniqueBy(relationRows, (row) => `${row.subject_text_en}${row.predicate}${row.object_text_en}`);
      pendingRelations.push(...uniqueRelationRows);
    }

    // Post-loop: resolve every relation's endpoints against the GLOBAL entity
    // index (all windows), then upsert. Fixes the per-window scoping that left
    // cross-window references — a person and a place named in different windows —
    // permanently unlinked.
    // The extraction has no top-level organisations array, so nothing is
    // staged into kg_organisations at load time -- organisations only ever
    // come from cli/create-kg-placeholders.js. Pass organisations: [] so the
    // index signature matches buildEntityIndex's full shape.
    const relationIndex = buildEntityIndex({ locations: allStagedLocations, people: allStagedPeople, events: allStagedEvents, organisations: [] });
    for (const relation of pendingRelations) Object.assign(relation, resolveRelationFks(relation, relationIndex));
    for (const batch of chunks(pendingRelations, 200)) await upsert('kg_staged_relations', batch, 'mention_id,subject_text_en,predicate,object_text_en');
  }
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Candidate report: ${reportPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
