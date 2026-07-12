import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { buildEntityIndex, resolveRelationFks } from '../lib/kgRelationResolver.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_SOURCE = 'jewish-budapest-private';
const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-relation-resolution-report.json');
const CONCURRENCY = 8;

const main = async () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const sourceId = option(args, '--source-id', DEFAULT_SOURCE);
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest, restAll } = createRestClient(baseUrl, serviceKey);

  const [locations, people, events] = await Promise.all([
    restAll('kg_locations', { select: 'id,name_en,source_name_hu', source_id: `eq.${sourceId}` }),
    restAll('kg_people', { select: 'id,canonical_name_en,source_name_hu', source_id: `eq.${sourceId}` }),
    restAll('kg_events', { select: 'id,title_en', source_id: `eq.${sourceId}` }),
  ]);
  const index = buildEntityIndex({ locations, people, events });

  // Relations carry no source_id; scope them via their mention.
  const relations = await restAll('kg_staged_relations', {
    select: 'id,subject_text_en,subject_kind,object_text_en,object_kind,subject_location_id,subject_person_id,subject_event_id,object_location_id,object_person_id,object_event_id,kg_mentions!inner(source_id)',
    'kg_mentions.source_id': `eq.${sourceId}`,
  });

  const hasEndpoint = (r, side) => r[`${side}_location_id`] || r[`${side}_person_id`] || r[`${side}_event_id`];
  const complete = (r) => hasEndpoint(r, 'subject') && hasEndpoint(r, 'object');

  let subjectFilled = 0, objectFilled = 0;
  const patches = [];
  for (const relation of relations) {
    const patch = resolveRelationFks(relation, index);
    if (!Object.keys(patch).length) continue;
    if (Object.keys(patch).some((k) => k.startsWith('subject_'))) subjectFilled += 1;
    if (Object.keys(patch).some((k) => k.startsWith('object_'))) objectFilled += 1;
    patches.push({ id: relation.id, patch, nowComplete: complete({ ...relation, ...patch }) });
  }

  const before = { total: relations.length, complete: relations.filter(complete).length };
  const after = { complete: relations.filter((r) => complete({ ...r, ...(patches.find((p) => p.id === r.id)?.patch ?? {}) })).length };
  const summary = {
    mode: commit ? 'commit' : 'dry-run', source_id: sourceId, entities: { locations: locations.length, people: people.length, events: events.length },
    relations_total: before.total, complete_before: before.complete, complete_after: after.complete,
    newly_complete: after.complete - before.complete, endpoints_filled: subjectFilled + objectFilled, subject_filled: subjectFilled, object_filled: objectFilled,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ summary, sample: patches.slice(0, 30) }, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  if (!commit) { console.log(`\nPreview only. Re-run with --commit to write ${patches.length} relation endpoint links. Report: ${reportPath}`); return; }

  let written = 0;
  for (let i = 0; i < patches.length; i += CONCURRENCY) {
    await Promise.all(patches.slice(i, i + CONCURRENCY).map(async ({ id, patch }) => {
      await rest('kg_staged_relations', { method: 'PATCH', params: { id: `eq.${id}` }, body: patch, prefer: 'return=minimal' });
      written += 1;
    }));
  }
  console.log(`\nCommitted: ${written} relations updated. ${summary.newly_complete} became fully-resolved graph edges.`);
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
