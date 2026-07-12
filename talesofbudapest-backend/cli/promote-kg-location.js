import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPromotionPlan, summarizePromotionPlan } from '../lib/kgPromotion.js';
import { normalizeLocationName } from '../lib/kgLocationResolver.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option, requiredOption } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

loadCliEnv(import.meta.url);

const one = (rows, label) => { if (rows.length !== 1) throw new Error(`${label}: expected one row, found ${rows.length}`); return rows[0]; };
const inFilter = (ids) => `in.(${[...new Set(ids)].join(',')})`;

export const loadPromotionContext = async (rest, { sourceId, stagedLocationId, stagedLocationName, publicLocationId }) => {
  const stagedFilter = stagedLocationId
    ? { id: `eq.${stagedLocationId}` }
    : { name_key: `eq.${normalizeLocationName(stagedLocationName)}` };
  const [sources, staged, publicRows, canonicalLocations] = await Promise.all([
    rest('kg_sources', { params: { id: `eq.${sourceId}`, select: '*' } }), rest('kg_locations', { params: { ...stagedFilter, source_id: `eq.${sourceId}`, select: '*' } }),
    rest('locations', { params: { id: `eq.${publicLocationId}`, select: 'id,name,latitude,longitude,landmark_type' } }),
    rest('kg_entities', { params: { public_location_id: `eq.${publicLocationId}`, entity_kind: 'eq.location', select: 'id,entity_kind,canonical_name_en,description_en,public_location_id,start_year,end_year,date_label_en,metadata,review_status,publication_status' } }),
  ]);
  const source = one(sources, 'source'); const stagedLocation = one(staged, 'staged location'); const publicLocation = one(publicRows, 'public location');
  const resolvedStagedLocationId = stagedLocation.id;
  if (canonicalLocations.length > 1) throw new Error(`canonical location: expected at most one row, found ${canonicalLocations.length}`);
  const existingCanonicalLocation = canonicalLocations[0] ?? null;
  const existingCanonicalAliases = existingCanonicalLocation ? await rest('kg_entity_aliases', {
    params: { entity_id: `eq.${existingCanonicalLocation.id}`, select: 'id,entity_id,alias,normalized_alias,language_code,alias_kind,review_status' },
  }) : [];
  const [facts, relations] = await Promise.all([
    rest('kg_facts', { params: { location_id: `eq.${resolvedStagedLocationId}`, select: '*' } }),
    rest('kg_staged_relations', { params: { or: `(subject_location_id.eq.${resolvedStagedLocationId},object_location_id.eq.${resolvedStagedLocationId})`, select: '*' } }),
  ]);
  const ids = (kind) => relations.flatMap((row) => [row[`subject_${kind}_id`], row[`object_${kind}_id`]]).filter(Boolean);
  const fetchIds = (table, rowIds) => rowIds.length ? rest(table, { params: { id: inFilter(rowIds), source_id: `eq.${sourceId}`, select: '*' } }) : Promise.resolve([]);
  const [people, events, locations] = await Promise.all([fetchIds('kg_people', ids('person')), fetchIds('kg_events', ids('event')), fetchIds('kg_locations', ids('location').filter((id) => id !== resolvedStagedLocationId))]);
  const mentionIds = [stagedLocation.first_mention_id, ...facts.map((row) => row.mention_id), ...relations.map((row) => row.mention_id), ...events.map((row) => row.first_mention_id)].filter(Boolean);
  const mentionPages = mentionIds.length ? await rest('kg_mention_pages', { params: { mention_id: inFilter(mentionIds), select: 'mention_id,page_id' } }) : [];
  const pageIds = mentionPages.map((row) => row.page_id);
  const pages = pageIds.length ? await rest('kg_pages', { params: { id: inFilter(pageIds), source_id: `eq.${sourceId}`, select: 'id,page_number,page_ref' } }) : [];
  const byId = new Map(pages.map((page) => [page.id, page])); const pagesByMention = new Map();
  for (const row of mentionPages) pagesByMention.set(row.mention_id, [...(pagesByMention.get(row.mention_id) ?? []), byId.get(row.page_id)].filter(Boolean));
  return { source, stagedLocation, publicLocation, existingCanonicalLocation, existingCanonicalAliases, facts, relations, people, events, locations, pagesByMention };
};
const upsertRows = async (rest, table, rows) => { if (rows.length) await rest(table, { method: 'POST', body: rows, params: { on_conflict: 'id' }, upsert: true }); };

const main = async () => {
  const args = process.argv.slice(2); const sourceId = requiredOption(args, '--source-id');
  const stagedLocationId = option(args, '--staged-location-id'); const stagedLocationName = option(args, '--staged-location-name');
  const publicLocationId = requiredOption(args, '--public-location-id');
  if (Boolean(stagedLocationId) === Boolean(stagedLocationName)) throw new Error('Provide exactly one of --staged-location-id or --staged-location-name');
  const commit = args.includes('--commit'); const publish = args.includes('--publish'); const allowRestricted = args.includes('--allow-restricted-public');
  if (publish && !commit) throw new Error('--publish requires --commit'); if (allowRestricted && !publish) throw new Error('--allow-restricted-public is only valid with --publish');
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest } = createRestClient(baseUrl, serviceKey);
  const context = await loadPromotionContext(rest, { sourceId, stagedLocationId, stagedLocationName, publicLocationId });
  if (context.stagedLocation.public_location_id && context.stagedLocation.public_location_id !== publicLocationId) throw new Error(`Staged location is already resolved to ${context.stagedLocation.public_location_id}`);
  if (publish && context.source.license_verdict === 'red' && !allowRestricted) throw new Error('Restricted source: --publish requires --allow-restricted-public');
  if (publish && context.source.license_verdict === 'red') console.error('WARNING: publishing facts derived from a RED/restricted source. Only English paraphrases and safe citations are written; raw excerpts remain private.');
  const plan = buildPromotionPlan({ ...context, publish });
  console.log(JSON.stringify(summarizePromotionPlan(plan, commit ? (publish ? 'commit-and-publish' : 'commit-private') : 'preview'), null, 2));
  if (!commit) { console.log('\nPreview only. Re-run with --commit to create private needs-review records.'); return; }
  await upsertRows(rest, 'kg_entities', plan.entities); await upsertRows(rest, 'kg_entity_aliases', plan.aliases); await upsertRows(rest, 'kg_claims', plan.claims); await upsertRows(rest, 'kg_edges', plan.edges); await upsertRows(rest, 'kg_evidence', plan.evidence);
  await rest('kg_locations', { method: 'PATCH', body: { public_location_id: publicLocationId, resolution_status: 'resolved', updated_at: new Date().toISOString() }, params: { id: `eq.${context.stagedLocation.id}`, source_id: `eq.${sourceId}` } });
  console.log(`\nCommitted idempotent ${publish ? 'public/approved' : 'private/needs-review'} canonical records.`);
};
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
