import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoLinkMatchReason, normalizeLocationName, rankLocationCandidates } from '../lib/kgLocationResolver.js';
import { buildAutoLinkPlan, summarizeAutoLinkPlan } from '../lib/kgPromotion.js';
import { suppressAmbiguousExactMatches } from '../lib/kgAliasGuard.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-auto-link-report.json');
const DEFAULT_AUTO_MATCH_THRESHOLD = 0.9;

// Canonical location entities are linked to public.locations rows via
// kg_entities.public_location_id (015_knowledge_graph_canonical.sql). Their
// approved kg_entity_aliases rows are the aliases the resolver is allowed to
// exact-match against -- non-approved rows are inert by construction (never
// fetched here at all).
const loadPublicLocationAliases = async (restAll) => {
  const [canonicalLocationEntities, approvedAliases] = await Promise.all([
    restAll('kg_entities', { select: 'id,public_location_id', entity_kind: 'eq.location', public_location_id: 'not.is.null' }),
    restAll('kg_entity_aliases', { select: 'entity_id,alias', review_status: 'eq.approved' }),
  ]);
  const publicLocationIdByEntityId = new Map(canonicalLocationEntities.map((entity) => [entity.id, entity.public_location_id]));
  const aliasesByPublicLocationId = new Map();
  let aliasesAttached = 0;
  for (const row of approvedAliases) {
    const publicLocationId = publicLocationIdByEntityId.get(row.entity_id);
    if (!publicLocationId) continue;
    const list = aliasesByPublicLocationId.get(publicLocationId) ?? [];
    list.push(row.alias);
    aliasesByPublicLocationId.set(publicLocationId, list);
    aliasesAttached += 1;
  }
  return { aliasesByPublicLocationId, aliasesAttached };
};

// Global ownership map for the ambiguity guard (lib/kgAliasGuard.js): every
// candidate's own name plus its attached aliases, normalized, mapped to the
// set of candidate ids that carry that normalized form. Built once per run,
// independent of any single mention -- an exact match against a normalized
// alias owned by more than one candidate is ambiguous no matter which
// mention triggered it.
const buildAliasOwnership = (publicLocations) => {
  const ownership = new Map();
  for (const candidate of publicLocations) {
    const identities = new Set([candidate.name, ...(candidate.aliases ?? [])].map(normalizeLocationName).filter(Boolean));
    for (const normalized of identities) {
      const owners = ownership.get(normalized) ?? new Set();
      owners.add(candidate.id);
      ownership.set(normalized, owners);
    }
  }
  return ownership;
};

const upsert = (rest, table, rows) => rows.length
  ? rest(table, { method: 'POST', body: rows, params: { on_conflict: 'id' }, prefer: 'resolution=merge-duplicates,return=minimal' })
  : Promise.resolve();

// Optional coordinates source produced by cli/geocode-kg.js:
// ingest/corpus/restricted/extractions/<basename>.geocoded.json, an array of
// { query, matched, lat, lon, confidence, staged_names } entries. When
// supplied, staged mentions whose name matches one of a geocoded entry's
// staged_names get latitude/longitude attached before scoring, which can
// satisfy the distance <= 50m arm of the auto-link rule. kg_locations has no
// coordinate columns of its own, so without this flag only the exact-alias
// arm can ever fire.
const loadGeocodedCoordinates = async (geocodedPath) => {
  const byStagedName = new Map();
  if (!geocodedPath) return byStagedName;
  let raw;
  try { raw = JSON.parse(await fs.readFile(geocodedPath, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return byStagedName; throw error; }
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : Object.values(raw ?? {});
  for (const entry of entries) {
    const lat = Number(entry?.lat); const lon = Number(entry?.lon);
    const hasCoords = Boolean(entry?.matched) && Number.isFinite(lat) && Number.isFinite(lon);
    const address = {};
    if (entry?.district != null) address.district = entry.district;
    if (entry?.street_name != null) address.street_name = entry.street_name;
    if (entry?.house_number != null) address.house_number = entry.house_number;
    // Unmatched entries can still carry a parsed street/district, which the
    // resolver uses for agreement scoring and the district-conflict veto.
    if (!hasCoords && Object.keys(address).length === 0) continue;
    const names = Array.isArray(entry?.staged_names) ? entry.staged_names : [entry?.staged_names].filter(Boolean);
    for (const name of names) {
      const key = normalizeLocationName(name);
      if (key) byStagedName.set(key, { ...(hasCoords ? { latitude: lat, longitude: lon } : {}), ...address, confidence: entry.confidence ?? null });
    }
  }
  return byStagedName;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--publish') || args.includes('--allow-restricted-public')) {
    throw new Error('resolve-kg-locations.js never publishes. Auto-linked rows are always private; run promote-kg-location.js --publish for a reviewed public promotion.');
  }
  const commit = args.includes('--commit');
  const sourceId = option(args, '--source-id');
  const limit = Number(option(args, '--limit', '10000'));
  const autoMatchThreshold = Number(option(args, '--auto-match-threshold', String(DEFAULT_AUTO_MATCH_THRESHOLD)));
  const geocodedPath = option(args, '--geocoded');
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  if (!Number.isFinite(autoMatchThreshold) || autoMatchThreshold < 0 || autoMatchThreshold > 1) throw new Error('--auto-match-threshold must be a number between 0 and 1');
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest, restAll } = createRestClient(baseUrl, serviceKey);

  const geocoded = await loadGeocodedCoordinates(geocodedPath ? path.resolve(geocodedPath) : null);

  const stagedParams = { select: '*', resolution_status: 'eq.pending', limit: String(limit) };
  if (sourceId) stagedParams.source_id = `eq.${sourceId}`;
  const [stagedLocations, publicLocations, { aliasesByPublicLocationId, aliasesAttached }] = await Promise.all([
    rest('kg_locations', { params: stagedParams }),
    rest('locations', { params: { select: 'id,name,latitude,longitude,landmark_type', limit: String(limit) } }),
    loadPublicLocationAliases(restAll),
  ]);
  for (const candidate of publicLocations) candidate.aliases = aliasesByPublicLocationId.get(candidate.id) ?? [];
  const aliasOwnership = buildAliasOwnership(publicLocations);

  const eligible = [];
  let reviewOnlyCount = 0;
  let geocodedApplied = 0;
  let ambiguousSuppressedCount = 0;
  for (const staged of stagedLocations) {
    const geo = geocoded.get(normalizeLocationName(staged.name_en));
    const mention = geo ? { ...staged, ...geo } : staged;
    if (geo) geocodedApplied += 1;
    const ranked = rankLocationCandidates(mention, publicLocations, new Map(), 1, { autoMatchThreshold });
    const [best] = suppressAmbiguousExactMatches(ranked, aliasOwnership);
    if (best?.reason === 'ambiguous_exact_alias') ambiguousSuppressedCount += 1;
    if (best?.autoMatch) eligible.push({ staged, candidate: best.candidate, score: best.score, matchedVia: autoLinkMatchReason(best), signals: best.signals });
    else if (best) reviewOnlyCount += 1;
  }

  const sourceCache = new Map();
  const getSource = async (id) => {
    if (sourceCache.has(id)) return sourceCache.get(id);
    const [row] = await rest('kg_sources', { params: { id: `eq.${id}`, select: '*' } });
    sourceCache.set(id, row ?? null);
    return row ?? null;
  };

  const results = [];
  for (const item of eligible) {
    const entry = {
      staged_location_id: item.staged.id, source_id: item.staged.source_id, name_en: item.staged.name_en,
      public_location_id: item.candidate.id, public_name: item.candidate.name,
      score: item.score, matched_via: item.matchedVia, signals: item.signals, status: 'planned',
    };
    if (item.staged.public_location_id && item.staged.public_location_id !== item.candidate.id) {
      entry.status = 'skipped'; entry.reason = `staged location is already resolved to ${item.staged.public_location_id}`;
      results.push(entry); continue;
    }
    if (!commit) { results.push(entry); continue; }
    try {
      const source = await getSource(item.staged.source_id);
      if (!source) { entry.status = 'skipped'; entry.reason = 'source not found'; results.push(entry); continue; }
      const [existingCanonicalLocation = null] = await rest('kg_entities', {
        params: {
          public_location_id: `eq.${item.candidate.id}`, entity_kind: 'eq.location',
          select: 'id,entity_kind,canonical_name_en,description_en,public_location_id,start_year,end_year,date_label_en,metadata,review_status,publication_status',
        },
      });
      const existingCanonicalAliases = existingCanonicalLocation ? await rest('kg_entity_aliases', {
        params: { entity_id: `eq.${existingCanonicalLocation.id}`, select: 'id,entity_id,alias,normalized_alias,language_code,alias_kind,review_status' },
      }) : [];
      const plan = buildAutoLinkPlan({
        source, stagedLocation: item.staged, publicLocation: item.candidate,
        existingCanonicalLocation, existingCanonicalAliases, matchedVia: item.matchedVia, score: item.score,
      });
      await upsert(rest, 'kg_entities', [plan.entity]);
      await upsert(rest, 'kg_entity_aliases', plan.aliases);
      await rest('kg_locations', {
        method: 'PATCH', prefer: 'return=minimal',
        params: { id: `eq.${item.staged.id}`, source_id: `eq.${item.staged.source_id}` },
        body: { public_location_id: item.candidate.id, resolution_status: 'resolved', updated_at: new Date().toISOString() },
      });
      entry.status = 'linked'; entry.entity_id = plan.entity.id;
      console.log(JSON.stringify(summarizeAutoLinkPlan(plan, 'commit')));
    } catch (error) {
      entry.status = 'skipped'; entry.reason = error instanceof Error ? error.message : String(error);
    }
    results.push(entry);
  }

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    source_id: sourceId ?? 'all',
    auto_match_threshold: autoMatchThreshold,
    pending_staged_locations: stagedLocations.length,
    geocoded_coordinates_applied: geocodedApplied,
    aliases_attached: aliasesAttached,
    ambiguous_suppressed: ambiguousSuppressedCount,
    auto_link_eligible: eligible.length,
    linked: results.filter((row) => row.status === 'linked').length,
    planned: results.filter((row) => row.status === 'planned').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    review_only: reviewOnlyCount,
    safety: 'Creates private canonical location links only (entity + aliases); never public. Facts, relations, events, and people still require promote-kg-location.js.',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, auto_links: results }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!commit) console.log('\nPreview only. Re-run with --commit to write the private canonical links listed above.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
