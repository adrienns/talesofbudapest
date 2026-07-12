// Heuristic placeholder-creation pass over staged relations. A relation's
// subject/object text sometimes names a real, specific entity that the
// extraction never catalogued as its own kg_locations/kg_people/kg_events/
// kg_organisations row (e.g. a relation says "Ede Horn founded OMIKE" but
// neither "Ede Horn" nor "OMIKE" appear as a standalone extracted entity).
// Left alone, that relation can never resolve and the edge never draws.
//
// This script creates a flagged, "needs research" placeholder row for every
// such endpoint that LOOKS like a specific named entity (see
// lib/kgPlaceholderHeuristic.js for the acceptance heuristic -- it is
// deliberately conservative, since a false placeholder is review noise) and
// links the originating relation's FK to it, so the graph draws the edge
// today. cli/research-kg-placeholders.js (owned separately) later
// enriches/confirms or rejects each placeholder via a knowledge-assistance
// model; a
// human promotes confirmed ones via promote-kg-location.js --publish. This
// script itself never approves or publishes anything -- placeholders are
// always created with resolution_status: 'pending'.
//
// Mirrors cli/resolve-kg-relations.js's shape: REST helpers, restAll
// pagination, dry-run/--commit/--report.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEntityIndex, resolveEndpoint } from '../lib/kgRelationResolver.js';
import { normalizeLocationName } from '../lib/kgNormalize.js';
import { isPlaceholderCandidate, placeholderTable } from '../lib/kgPlaceholderHeuristic.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_SOURCE = 'jewish-budapest-private';
const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-placeholder-report.json');
const CONCURRENCY = 8;

// Which staging table backs each relation-endpoint kind, and how to build a
// row for it. Mirrors migration 014_knowledge_graph_staging.sql's columns
// (kg_locations.name_en/name_key, kg_people.canonical_name_en/name_key,
// kg_events.title_en/statement_en/event_key) and 019's kg_organisations
// (canonical_name_en/name_key).
const ON_CONFLICT = { kg_locations: 'source_id,name_key', kg_people: 'source_id,name_key', kg_organisations: 'source_id,name_key', kg_events: 'source_id,event_key' };

// Matches cli/load-restricted-kg.js's event_key hash exactly (same
// separator), so a placeholder event and a later real extraction of the same
// title/statement collide onto the same row instead of duplicating it.
const hash = (...values) => crypto.createHash('sha256').update(values.join('')).digest('hex');
const placeholderMetadata = () => ({ origin: 'relation_endpoint', needs_research: true, auto_created: true });

const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

// Builds the insert row for a placeholder in `table` from the endpoint's raw
// text and the originating relation (for first_mention_id provenance).
// kg_events has no name_key column -- its identity/conflict key is
// event_key, built the same way the loader builds it (hash of the
// normalized title + statement + when), with title_en === statement_en ===
// the raw endpoint text since that's all a relation endpoint gives us.
const placeholderRow = (table, sourceId, text, relation) => {
  const trimmed = text.trim();
  const nameKey = normalizeLocationName(trimmed);
  const metadata = placeholderMetadata();
  switch (table) {
    case 'kg_locations': return { source_id: sourceId, name_key: nameKey, name_en: trimmed, evidence: {}, metadata, resolution_status: 'pending', first_mention_id: relation.mention_id };
    // kg_people has no first_mention_id column (unlike kg_locations, kg_events,
    // and kg_organisations) -- see migration 014_knowledge_graph_staging.sql.
    case 'kg_people': return { source_id: sourceId, name_key: nameKey, canonical_name_en: trimmed, evidence: {}, metadata, resolution_status: 'pending' };
    case 'kg_organisations': return { source_id: sourceId, name_key: nameKey, canonical_name_en: trimmed, evidence: {}, metadata, resolution_status: 'pending', first_mention_id: relation.mention_id };
    case 'kg_events': return { source_id: sourceId, event_key: hash(nameKey, nameKey, ''), title_en: trimmed, statement_en: trimmed, evidence: {}, metadata, resolution_status: 'pending', first_mention_id: relation.mention_id };
    default: throw new Error(`Unhandled placeholder table: ${table}`);
  }
};

const dedupKeyFor = (table, row) => `${table}:${table === 'kg_events' ? row.event_key : row.name_key}`;

const hasEndpoint = (relation, side) => Boolean(relation[`${side}_location_id`] || relation[`${side}_person_id`] || relation[`${side}_event_id`] || relation[`${side}_organisation_id`]);
const isComplete = (relation) => hasEndpoint(relation, 'subject') && hasEndpoint(relation, 'object');

const main = async () => {
  const args = process.argv.slice(2);
  // This pass only ever creates flagged, pending placeholder rows and links
  // relation FKs to them -- it never approves or publishes a canonical
  // entity. Same refusal as cli/resolve-kg-locations.js,
  // cli/backfill-kg-alias-translations.js, and cli/research-kg-placeholders.js.
  if (args.includes('--publish') || args.includes('--allow-restricted-public')) {
    throw new Error('create-kg-placeholders.js never publishes. Placeholders are always created private with resolution_status \'pending\'; a human reviewer promotes confirmed entities separately via promote-kg-location.js --publish.');
  }
  const commit = args.includes('--commit');
  const sourceId = option(args, '--source-id', DEFAULT_SOURCE);
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest, restAll } = createRestClient(baseUrl, serviceKey);

  const [locations, people, events, organisations] = await Promise.all([
    restAll('kg_locations', { select: 'id,name_en,source_name_hu', source_id: `eq.${sourceId}` }),
    restAll('kg_people', { select: 'id,canonical_name_en,source_name_hu', source_id: `eq.${sourceId}` }),
    restAll('kg_events', { select: 'id,title_en', source_id: `eq.${sourceId}` }),
    restAll('kg_organisations', { select: 'id,canonical_name_en,source_name_hu', source_id: `eq.${sourceId}` }),
  ]);
  const index = buildEntityIndex({ locations, people, events, organisations });

  // Relations carry no source_id; scope them via their mention, same as
  // cli/resolve-kg-relations.js.
  const relations = await restAll('kg_staged_relations', {
    select: 'id,mention_id,subject_text_en,subject_kind,object_text_en,object_kind,subject_location_id,subject_person_id,subject_event_id,subject_organisation_id,object_location_id,object_person_id,object_event_id,object_organisation_id,kg_mentions!inner(source_id)',
    'kg_mentions.source_id': `eq.${sourceId}`,
  });

  const completeBefore = relations.filter(isComplete).length;

  // dedupKey -> { table, row, origins: [{ relationId, side, kind }] }
  const placeholders = new Map();
  const counts = { already_resolved: 0, already_resolvable: 0, unknown_kind: 0, not_candidate: 0, candidates: 0 };

  for (const relation of relations) {
    for (const side of ['subject', 'object']) {
      if (hasEndpoint(relation, side)) { counts.already_resolved += 1; continue; }
      const text = relation[`${side}_text_en`];
      const kind = relation[`${side}_kind`];
      if (resolveEndpoint(text, kind, index)) { counts.already_resolvable += 1; continue; }
      const table = placeholderTable(kind);
      if (!table) { counts.unknown_kind += 1; continue; }
      if (!isPlaceholderCandidate(text, kind)) { counts.not_candidate += 1; continue; }
      counts.candidates += 1;
      const row = placeholderRow(table, sourceId, text, relation);
      const dedupKey = dedupKeyFor(table, row);
      if (!placeholders.has(dedupKey)) placeholders.set(dedupKey, { table, row, origins: [] });
      placeholders.get(dedupKey).origins.push({ relationId: relation.id, side, kind });
    }
  }

  const candidatesByTable = {};
  for (const { table } of placeholders.values()) candidatesByTable[table] = (candidatesByTable[table] ?? 0) + 1;

  const summary = {
    mode: commit ? 'commit' : 'dry-run', source_id: sourceId,
    entities: { locations: locations.length, people: people.length, events: events.length, organisations: organisations.length },
    relations_total: relations.length, complete_before: completeBefore,
    endpoints: { already_resolved: counts.already_resolved, already_resolvable: counts.already_resolvable, unknown_kind: counts.unknown_kind, not_candidate: counts.not_candidate, candidates: counts.candidates },
    placeholders_planned: placeholders.size, candidates_by_table: candidatesByTable,
  };

  if (!commit) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, placeholders: [...placeholders.values()].map(({ table, row, origins }) => ({ table, row, origins })) }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nPreview only. Re-run with --commit to create ${placeholders.size} placeholder row(s) and link relation endpoints. Report: ${reportPath}`);
    return;
  }

  // Upsert placeholders per table, then map each dedup group to its written id.
  const idByDedupKey = new Map();
  const byTable = new Map();
  for (const [dedupKey, entry] of placeholders) {
    if (!byTable.has(entry.table)) byTable.set(entry.table, []);
    byTable.get(entry.table).push({ dedupKey, row: entry.row });
  }
  let created = 0;
  for (const [table, entries] of byTable) {
    for (const batch of chunks(entries, 100)) {
      const written = await rest(table, { method: 'POST', body: batch.map((entry) => entry.row), params: { on_conflict: ON_CONFLICT[table] }, prefer: 'resolution=merge-duplicates,return=representation' });
      const writtenByConflictKey = new Map(written.map((row) => [table === 'kg_events' ? row.event_key : row.name_key, row.id]));
      for (const { dedupKey, row } of batch) {
        const conflictValue = table === 'kg_events' ? row.event_key : row.name_key;
        const id = writtenByConflictKey.get(conflictValue);
        if (id) { idByDedupKey.set(dedupKey, id); created += 1; }
      }
    }
  }

  // Combine both endpoints of a single relation into one PATCH body.
  const patchByRelationId = new Map();
  for (const [dedupKey, entry] of placeholders) {
    const id = idByDedupKey.get(dedupKey);
    if (!id) continue;
    for (const origin of entry.origins) {
      if (!patchByRelationId.has(origin.relationId)) patchByRelationId.set(origin.relationId, {});
      patchByRelationId.get(origin.relationId)[`${origin.side}_${origin.kind}_id`] = id;
    }
  }

  let linked = 0;
  const patchEntries = [...patchByRelationId.entries()];
  for (let i = 0; i < patchEntries.length; i += CONCURRENCY) {
    await Promise.all(patchEntries.slice(i, i + CONCURRENCY).map(async ([relationId, patch]) => {
      await rest('kg_staged_relations', { method: 'PATCH', params: { id: `eq.${relationId}` }, body: patch, prefer: 'return=minimal' });
      linked += 1;
    }));
  }

  const relationById = new Map(relations.map((relation) => [relation.id, relation]));
  const newlyComplete = [...patchByRelationId.entries()].filter(([relationId, patch]) => isComplete({ ...relationById.get(relationId), ...patch })).length;

  summary.placeholders_created = created;
  summary.relations_linked = linked;
  summary.relations_newly_complete = newlyComplete;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, placeholders: [...placeholders.values()].map(({ table, row, origins }) => ({ table, id: idByDedupKey.get(dedupKeyFor(table, row)) ?? null, row, origins })) }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nCommitted: ${created} placeholder(s) created, ${linked} relation(s) patched, ${newlyComplete} became fully-resolved. Report: ${reportPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
