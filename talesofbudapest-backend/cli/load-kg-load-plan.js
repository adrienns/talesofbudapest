#!/usr/bin/env node
/**
 * Load a V3 kg-load-plan JSON into private staging + draft canonical KG tables.
 *
 * Dry by default. With --commit, upserts:
 *   - kg_sources / kg_mentions (synthetic window; no page raw_text)
 *   - staging: kg_locations, kg_people, kg_organisations, kg_events, kg_facts
 *   - canonical draft/private: kg_entities, kg_entity_aliases, kg_claims, kg_evidence, kg_edges
 *
 * Fail-closed:
 *   - provisional plans never publish or approve
 *   - never writes raw_excerpt / verbatim quotes (paraphrases only)
 *   - concept entities are not canonical kinds; facts without a loadable subject
 *     become draft event entities keyed by fact_id
 *   - refuses plans that look like they embed restricted quote payloads
 *
 * Usage:
 *   node cli/load-kg-load-plan.js [--input ...kg-load-plan-provisional.json]
 *   node cli/load-kg-load-plan.js --input ... --commit
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eraForYears } from '../lib/kgEras.js';
import { normalizeLocationName } from '../lib/kgNormalize.js';
import { stableUuid } from '../lib/kgPromotion.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option, hasFlag } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_INPUT = path.join(
  __dirname,
  '../../ingest/corpus/restricted/extractions/jewish-budapest.kg-load-plan-provisional.json',
);

const LOADABLE_KINDS = new Set(['location', 'person', 'organisation', 'event']);
const CHUNK = 100;

const chunks = (rows, size = CHUNK) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

const uniqueBy = (rows, keyOf) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyOf(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const assertNoVerbatimPayload = (plan) => {
  for (const fact of plan.facts ?? []) {
    if (fact.raw_excerpt || fact.verbatim || fact.quote || fact.evidence_quote) {
      throw new Error(`Refuse load: fact ${fact.fact_id} carries restricted quote fields`);
    }
  }
  for (const entity of plan.entities ?? []) {
    if (entity.raw_excerpt || entity.verbatim || entity.quote) {
      throw new Error(`Refuse load: entity ${entity.entity_id} carries restricted quote fields`);
    }
  }
};

const entityUuid = (sourceId, kind, sourceEntityId) =>
  stableUuid('entity', kind, sourceId, sourceEntityId);

const claimUuid = (sourceId, factId) => stableUuid('claim', sourceId, factId);

const aliasUuid = (entityId, aliasKind, normalized) =>
  stableUuid('alias', entityId, aliasKind, normalized);

const shortTitle = (statement, max = 120) => {
  const text = String(statement ?? '').trim().replace(/\s+/g, ' ');
  if (text.length <= max) return text || 'Untitled provisional fact';
  return `${text.slice(0, max - 1).trim()}…`;
};

const buildPlanRows = (plan) => {
  const provisional = plan.provisional === true;
  const sourceId = plan.source?.id;
  if (!sourceId) throw new Error('plan.source.id is required');
  if (plan.source?.license_verdict !== 'red') {
    throw new Error('Refuse load: expected license_verdict red for restricted corpus plans');
  }

  const source = {
    id: sourceId,
    title: 'Jewish Budapest: Monuments, Rites, History',
    author: 'Kinga Frojimovics et al.',
    source_url: 'private://restricted-corpus/jewish-budapest',
    license: 'Restricted user-provided research copy',
    license_verdict: 'red',
    attribution: provisional
      ? 'Jewish Budapest (private research corpus) — PROVISIONAL v3 load plan; not promoted'
      : 'Jewish Budapest: Monuments, Rites, History (private research corpus)',
  };

  const entitiesById = new Map((plan.entities ?? []).map((entity) => [entity.entity_id, entity]));
  const canonicalEntityId = new Map(); // source entity_id / fact_id / event_id -> uuid
  const entityRows = [];
  const aliasRows = [];
  const stagedLocations = [];
  const stagedPeople = [];
  const stagedOrganisations = [];
  const stagedEvents = [];

  const pushAliases = (entityId, names, languageHints = {}) => {
    for (const alias of names) {
      const normalized = normalizeLocationName(alias);
      if (!normalized) continue;
      aliasRows.push({
        id: aliasUuid(entityId, 'name', normalized),
        entity_id: entityId,
        alias: String(alias).trim(),
        normalized_alias: normalized,
        language_code: languageHints[alias] ?? null,
        alias_kind: 'name',
        review_status: 'draft',
      });
    }
  };

  for (const entity of plan.entities ?? []) {
    if (!LOADABLE_KINDS.has(entity.kind)) continue;
    const nameKey = normalizeLocationName(entity.label);
    if (!nameKey) continue;
    const id = entityUuid(sourceId, entity.kind, entity.entity_id);
    canonicalEntityId.set(entity.entity_id, id);
    entityRows.push({
      id,
      entity_kind: entity.kind,
      canonical_name_en: String(entity.label).trim(),
      description_en: entity.roles?.length ? entity.roles.join('; ') : null,
      public_location_id: null,
      start_year: null,
      end_year: null,
      date_label_en: null,
      metadata: {
        provisional,
        source_entity_id: entity.entity_id,
        source_type: entity.type,
        owner_entity_id: entity.owner_entity_id ?? null,
        include_experiment: plan.include_experiment ?? null,
        certification: provisional ? 'experiment_provisional' : 'v3_load_plan',
        load_plan_generated_at: plan.generated_at ?? null,
      },
      review_status: 'draft',
      publication_status: 'private',
    });
    pushAliases(id, [entity.label, ...(entity.aliases ?? [])].filter(Boolean));

    if (entity.kind === 'location') {
      stagedLocations.push({
        source_id: sourceId,
        name_key: nameKey,
        name_en: String(entity.label).trim(),
        source_name_hu: null,
        address_en: null,
        source_address_hu: null,
        location_kind: entity.type ?? null,
        evidence: { source_entity_id: entity.entity_id, provisional },
        resolution_status: 'pending',
        public_location_id: null,
        metadata: { provisional, source_entity_id: entity.entity_id, certification: 'experiment_provisional' },
      });
    } else if (entity.kind === 'person') {
      stagedPeople.push({
        source_id: sourceId,
        name_key: nameKey,
        canonical_name_en: String(entity.label).trim(),
        source_name_hu: null,
        role_en: entity.roles?.[0] ?? null,
        evidence: { source_entity_id: entity.entity_id, provisional },
        is_public_figure: false,
        resolution_status: 'pending',
        metadata: { provisional, source_entity_id: entity.entity_id },
      });
    } else if (entity.kind === 'organisation') {
      stagedOrganisations.push({
        source_id: sourceId,
        name_key: nameKey,
        canonical_name_en: String(entity.label).trim(),
        source_name_hu: null,
        org_kind: entity.type ?? null,
        evidence: { source_entity_id: entity.entity_id, provisional },
        metadata: { provisional, source_entity_id: entity.entity_id },
        resolution_status: 'pending',
      });
    }
  }

  for (const event of plan.canonical_events ?? []) {
    const id = entityUuid(sourceId, 'event', event.event_id);
    canonicalEntityId.set(event.event_id, id);
    const year = Number(String(event.time ?? '').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/)?.[1] ?? NaN);
    entityRows.push({
      id,
      entity_kind: 'event',
      canonical_name_en: shortTitle(event.event_type ? `${event.event_type}${event.time ? ` (${event.time})` : ''}` : event.event_id),
      description_en: null,
      public_location_id: null,
      start_year: Number.isFinite(year) ? year : null,
      end_year: null,
      date_label_en: event.time ?? null,
      metadata: {
        provisional,
        source_event_id: event.event_id,
        event_type: event.event_type ?? null,
        evidence_claim_ids: event.evidence_claim_ids ?? [],
        certification: provisional ? 'experiment_provisional' : 'v3_load_plan',
      },
      review_status: 'draft',
      publication_status: 'private',
    });
    pushAliases(id, [event.event_id, event.event_type].filter(Boolean));
    stagedEvents.push({
      source_id: sourceId,
      event_key: event.event_id,
      title_en: shortTitle(event.event_type ? `${event.event_type}${event.time ? ` (${event.time})` : ''}` : event.event_id),
      statement_en: shortTitle(event.event_type ?? event.event_id, 240),
      claim_type: event.event_type ?? null,
      temporal_status: 'historical_fact',
      importance: null,
      evidence: { provisional, evidence_claim_ids: event.evidence_claim_ids ?? [] },
      resolution_status: 'pending',
      metadata: { provisional, source_event_id: event.event_id },
    });
  }

  const factToEvent = new Map();
  for (const event of plan.canonical_events ?? []) {
    for (const factId of event.evidence_claim_ids ?? []) {
      if (!factToEvent.has(factId)) factToEvent.set(factId, event.event_id);
    }
  }

  const claimRows = [];
  const evidenceRows = [];
  const stagedFacts = [];
  const skipped = { concept_subjects: 0, empty_statements: 0, concepts_as_entities: (plan.entities ?? []).filter((e) => e.kind === 'concept').length };

  for (const fact of plan.facts ?? []) {
    const statement = String(fact.statement ?? '').trim();
    if (!statement) {
      skipped.empty_statements += 1;
      continue;
    }

    let subjectId = null;
    const subjectEntity = fact.subject_entity_id ? entitiesById.get(fact.subject_entity_id) : null;
    if (subjectEntity && LOADABLE_KINDS.has(subjectEntity.kind)) {
      subjectId = canonicalEntityId.get(fact.subject_entity_id);
    } else if (subjectEntity?.kind === 'concept') {
      skipped.concept_subjects += 1;
    }

    if (!subjectId && factToEvent.has(fact.fact_id)) {
      subjectId = canonicalEntityId.get(factToEvent.get(fact.fact_id));
    }

    if (!subjectId) {
      const syntheticKey = `fact-event:${fact.fact_id}`;
      const id = entityUuid(sourceId, 'event', syntheticKey);
      canonicalEntityId.set(syntheticKey, id);
      subjectId = id;
      const year = fact.year_hints?.[0] ?? null;
      entityRows.push({
        id,
        entity_kind: 'event',
        canonical_name_en: shortTitle(statement),
        description_en: statement,
        public_location_id: null,
        start_year: year,
        end_year: null,
        date_label_en: year ? String(year) : null,
        metadata: {
          provisional,
          source_fact_id: fact.fact_id,
          synthetic_from_fact: true,
          certification: provisional ? 'experiment_provisional' : 'v3_load_plan',
        },
        review_status: 'draft',
        publication_status: 'private',
      });
    }

    const years = [...new Set((fact.year_hints ?? []).filter((year) => Number.isInteger(year)))].sort((a, b) => a - b);
    const startYear = years[0] ?? null;
    const endYear = years.length > 1 ? years[years.length - 1] : null;
    const claimId = claimUuid(sourceId, fact.fact_id);
    claimRows.push({
      id: claimId,
      subject_entity_id: subjectId,
      statement_en: statement,
      claim_type: fact.canonical_type ?? fact.open_type ?? fact.kind ?? null,
      start_year: startYear,
      end_year: endYear && endYear !== startYear ? endYear : null,
      date_label_en: startYear ? String(startYear) : null,
      importance: 3,
      era: eraForYears(startYear, endYear),
      metadata: {
        provisional,
        source_fact_id: fact.fact_id,
        run_id: fact.run_id ?? null,
        experiment_id: fact.experiment_id ?? null,
        certification: fact.certification ?? (provisional ? 'experiment_provisional' : 'v3_load_plan'),
        pages: fact.pages ?? [],
        addresses: (fact.addresses ?? []).map((address) => ({
          street: address.street ?? null,
          house_number: address.house_number ?? null,
          center: address.center ?? null,
        })),
        polarity: fact.polarity ?? null,
        modality: fact.modality ?? null,
      },
      review_status: 'draft',
      publication_status: 'private',
    });

    const pages = [...new Set((fact.pages ?? []).filter((page) => Number.isInteger(page) && page > 0))];
    evidenceRows.push({
      id: stableUuid('evidence', 'claim', sourceId, fact.fact_id),
      claim_id: claimId,
      entity_id: null,
      edge_id: null,
      source_id: sourceId,
      mention_id: null,
      page_numbers: pages,
      page_refs: pages.map((page) => `${sourceId}:book:page-${page}`),
      public_citation_en: pages.length
        ? `Jewish Budapest, p. ${pages.join(', ')}`
        : 'Jewish Budapest (page citation pending)',
      public_note_en: provisional ? 'Provisional experiment load; not promoted.' : null,
      raw_excerpt: null,
      extraction_model: null,
    });

    stagedFacts.push({
      statement_en: statement,
      claim_type: fact.canonical_type ?? fact.open_type ?? fact.kind ?? null,
      temporal_status: 'historical_fact',
      importance: null,
      evidence: {
        provisional,
        source_fact_id: fact.fact_id,
        pages,
        year_hints: fact.year_hints ?? [],
        // Addresses only — never book quotes.
        addresses: fact.addresses ?? [],
      },
      status: 'pending',
      _subject_entity_id: fact.subject_entity_id ?? null,
    });
  }

  const edgeRows = [];
  for (const relation of plan.relations ?? []) {
    if (relation.relation !== 'owned_by') continue;
    const subject = canonicalEntityId.get(relation.from_entity_id);
    const object = canonicalEntityId.get(relation.to_entity_id);
    if (!subject || !object || subject === object) continue;
    edgeRows.push({
      id: stableUuid('edge', sourceId, relation.from_entity_id, 'owned_by', relation.to_entity_id),
      subject_entity_id: subject,
      predicate: 'owned_by',
      object_entity_id: object,
      statement_en: null,
      start_year: null,
      end_year: null,
      date_label_en: null,
      importance: 3,
      metadata: { provisional, run_id: relation.run_id ?? null },
      review_status: 'draft',
      publication_status: 'private',
    });
  }

  return {
    provisional,
    source,
    mentionPayload: {
      kind: 'v3_kg_load_plan',
      provisional,
      include_experiment: plan.include_experiment ?? null,
      generated_at: plan.generated_at ?? null,
      counts: plan.counts ?? null,
      // Intentional: no entities/facts/quotes in mention payload.
    },
    entityRows: uniqueBy(entityRows, (row) => row.id),
    aliasRows: uniqueBy(aliasRows, (row) => `${row.entity_id}\u001f${row.normalized_alias}\u001f${row.alias_kind}`),
    claimRows: uniqueBy(claimRows, (row) => row.id),
    evidenceRows: uniqueBy(evidenceRows, (row) => row.id),
    edgeRows: uniqueBy(edgeRows, (row) => row.id),
    stagedLocations: uniqueBy(stagedLocations, (row) => `${row.source_id}\u001f${row.name_key}`),
    stagedPeople: uniqueBy(stagedPeople, (row) => `${row.source_id}\u001f${row.name_key}`),
    stagedOrganisations: uniqueBy(stagedOrganisations, (row) => `${row.source_id}\u001f${row.name_key}`),
    stagedEvents: uniqueBy(stagedEvents, (row) => `${row.source_id}\u001f${row.event_key}`),
    stagedFacts,
    skipped,
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const commit = hasFlag(args, '--commit');
  const inputPath = path.resolve(option(args, '--input', DEFAULT_INPUT));
  const plan = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  assertNoVerbatimPayload(plan);
  const built = buildPlanRows(plan);

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    input: inputPath,
    provisional: built.provisional,
    source_id: built.source.id,
    planned: {
      entities: built.entityRows.length,
      aliases: built.aliasRows.length,
      claims: built.claimRows.length,
      evidence: built.evidenceRows.length,
      edges: built.edgeRows.length,
      staged_locations: built.stagedLocations.length,
      staged_people: built.stagedPeople.length,
      staged_organisations: built.stagedOrganisations.length,
      staged_events: built.stagedEvents.length,
      staged_facts: built.stagedFacts.length,
    },
    skipped: built.skipped,
    safety: {
      publication_status: 'private',
      review_status: 'draft',
      raw_excerpt: null,
      provisional_ne_promoted: true,
    },
  };

  if (!commit) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { restLegacy } = createRestClient(baseUrl, serviceKey);
  const upsert = async (table, rows, onConflict) => {
    if (!rows.length) return [];
    const out = [];
    for (const batch of chunks(rows)) {
      out.push(...await restLegacy(table, 'POST', batch, { on_conflict: onConflict }));
    }
    return out;
  };

  await upsert('kg_sources', [built.source], 'id');
  const [mention] = await upsert('kg_mentions', [{
    source_id: built.source.id,
    source_window_id: built.provisional ? 'v3-kg-load-plan-provisional' : 'v3-kg-load-plan',
    payload: built.mentionPayload,
    model: null,
    prompt_version: 'v3-kg-load-plan',
    extraction_usage: null,
    extracted_at: plan.generated_at ?? new Date().toISOString(),
  }], 'source_id,source_window_id');

  const locationRows = built.stagedLocations.map((row) => ({ ...row, first_mention_id: mention?.id ?? null }));
  const storedLocations = await upsert('kg_locations', locationRows, 'source_id,name_key');
  await upsert('kg_people', built.stagedPeople.map((row) => ({ ...row, metadata: row.metadata ?? {} })), 'source_id,name_key');
  await upsert('kg_organisations', built.stagedOrganisations.map((row) => ({ ...row, first_mention_id: mention?.id ?? null })), 'source_id,name_key');
  await upsert('kg_events', built.stagedEvents.map((row) => ({ ...row, first_mention_id: mention?.id ?? null })), 'source_id,event_key');

  const locationIdByEntity = new Map();
  for (const row of storedLocations) {
    if (row?.evidence?.source_entity_id) locationIdByEntity.set(row.evidence.source_entity_id, row.id);
  }

  const factRows = uniqueBy(
    built.stagedFacts.map((fact) => ({
      mention_id: mention.id,
      location_id: fact._subject_entity_id ? locationIdByEntity.get(fact._subject_entity_id) ?? null : null,
      statement_en: fact.statement_en,
      claim_type: fact.claim_type,
      temporal_status: fact.temporal_status,
      importance: fact.importance,
      evidence: fact.evidence,
      status: fact.status,
    })),
    (row) => `${row.mention_id}\u001f${row.statement_en}`,
  );
  await upsert('kg_facts', factRows, 'mention_id,statement_en');

  await upsert('kg_entities', built.entityRows, 'id');
  await upsert('kg_entity_aliases', built.aliasRows, 'entity_id,normalized_alias,alias_kind');
  await upsert('kg_claims', built.claimRows, 'id');
  await upsert('kg_evidence', built.evidenceRows, 'id');
  await upsert('kg_edges', built.edgeRows, 'id');

  console.log(JSON.stringify({
    ...summary,
    loaded: summary.planned,
    mention_id: mention?.id ?? null,
  }, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { buildPlanRows, assertNoVerbatimPayload };
