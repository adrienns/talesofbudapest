// Research/enrichment pass over auto-created "needs research" placeholder
// entities -- staged rows in kg_people / kg_locations / kg_events /
// kg_organisations that a relation endpoint named (e.g. a relation says "Ede
// Horn founded OMIKE") but the extraction never catalogued as its own
// record. They are auto-created with `metadata.needs_research = true`,
// `metadata.origin = 'relation_endpoint'`, `resolution_status = 'pending'`
// (see migration 019_kg_organisations_and_placeholders.sql and
// lib/kgPlaceholderHeuristic.js / cli/create-kg-placeholders.js, which own
// creating them -- this script only ever reads and researches them).
//
// This script sends each placeholder's bare NAME + kind hint to a
// knowledge-assisted OpenRouter model (Qwen Flash by default -- see
// lib/kgPlaceholderResearch.js's buildResearchPrompt) and turns the result
// into a metadata-enrichment or a rejection. See lib/kgPlaceholderResearch.js
// for why sending a name is safe even though these are RESTRICTED-corpus
// entities: only the book's page TEXT is restricted, not a person or
// organisation's bare name.
//
// This pass NEVER approves or publishes anything -- a confirmed placeholder
// stays `resolution_status: 'pending'` with an enriched metadata.research_*
// channel a human reviewer reads before promoting it; a rejected one becomes
// `resolution_status: 'rejected'`. Nothing here ever writes
// publication_status or review_status. --publish/--allow-restricted-public
// are refused outright, same as cli/resolve-kg-locations.js and
// cli/backfill-kg-alias-translations.js.
//
// Cache: ingest/corpus/restricted/experiments/kg-placeholder-research.cache.json,
// keyed `${model}${name}`. A cache hit is NEVER re-sent to the API -- the
// same "never pay twice" memo pattern as cli/embed-kg.js's embedding cache
// and cli/backfill-kg-alias-translations.js's suggestion cache. This matters
// more here than most: re-researching the same name twice is real money
// wasted, not just latency.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';
import { buildResearchPrompt, parseResearchResponse, planResearchUpdate } from '../lib/kgPlaceholderResearch.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option, numberOption } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_SOURCE = 'jewish-budapest-private';
const DEFAULT_CACHE = path.join(__dirname, '../../ingest/corpus/restricted/experiments/kg-placeholder-research.cache.json');
const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-placeholder-research-report.json');
const DEFAULT_MODEL = process.env.KG_RESEARCH_MODEL ?? 'qwen/qwen3.5-flash-02-23';

// Which staging table backs each placeholder kind, and which column holds
// its display name. Mirrors the column names in migration
// 014_knowledge_graph_staging.sql (kg_locations.name_en,
// kg_people.canonical_name_en, kg_events.title_en) and 019 (kg_organisations
// .canonical_name_en).
const TABLE_CONFIG = {
  person: { table: 'kg_people', nameColumn: 'canonical_name_en' },
  location: { table: 'kg_locations', nameColumn: 'name_en' },
  event: { table: 'kg_events', nameColumn: 'title_en' },
  organisation: { table: 'kg_organisations', nameColumn: 'canonical_name_en' },
};

const loadCache = async (cachePath) => {
  try { return JSON.parse(await fs.readFile(cachePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, results: {} }; throw error; }
};

const saveCache = async (cachePath, cache) => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(cache)}\n`, 'utf8');
  await fs.rename(tempPath, cachePath);
};

const cacheKeyFor = (model, name) => `${model}${name}`;

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
};

// Fetches every "needs research" pending placeholder for `sourceId` from one
// staging table and normalizes it to {table, id, name, kind, metadata}.
// PostgREST's jsonb `->>` operator reads metadata.needs_research as text, so
// `eq.true` matches the boolean `true` this pipeline always writes.
const fetchPlaceholders = async (restAll, kind, sourceId) => {
  const { table, nameColumn } = TABLE_CONFIG[kind];
  const rows = await restAll(table, {
    select: `id,${nameColumn},metadata`,
    source_id: `eq.${sourceId}`,
    'metadata->>needs_research': 'eq.true',
    resolution_status: 'eq.pending',
  });
  return rows.map((row) => ({
    table, id: row.id, name: row[nameColumn], kind, metadata: row.metadata ?? {},
  }));
};

const main = async () => {
  const args = process.argv.slice(2);
  // This pass only ever enriches metadata or sets resolution_status:'rejected'
  // on the staging row itself; it never approves or publishes a canonical
  // entity. Same refusal as cli/resolve-kg-locations.js and
  // cli/backfill-kg-alias-translations.js.
  if (args.includes('--publish') || args.includes('--allow-restricted-public')) {
    throw new Error('research-kg-placeholders.js never publishes. Confirmed placeholders stay resolution_status \'pending\' with enriched metadata; a human reviewer promotes them separately via promote-kg-location.js --publish.');
  }
  const commit = args.includes('--commit');
  const sourceId = option(args, '--source-id', DEFAULT_SOURCE);
  const limit = numberOption(args, '--limit', 40);
  const batchSize = numberOption(args, '--batch-size', 10);
  const model = option(args, '--model', DEFAULT_MODEL);
  const kindFilter = option(args, '--kind', null);
  const cachePath = path.resolve(option(args, '--cache', DEFAULT_CACHE));
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));

  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('--batch-size must be a positive integer');
  if (kindFilter && !TABLE_CONFIG[kindFilter]) {
    throw new Error(`--kind must be one of: ${Object.keys(TABLE_CONFIG).join(', ')}`);
  }
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest, restAll } = createRestClient(baseUrl, serviceKey);

  const kinds = kindFilter ? [kindFilter] : Object.keys(TABLE_CONFIG);
  const allPlaceholders = (await Promise.all(kinds.map((kind) => fetchPlaceholders(restAll, kind, sourceId)))).flat();
  const targets = allPlaceholders.slice(0, limit);

  const cache = await loadCache(cachePath);
  cache.version = 1; cache.results ??= {};

  const resultByTargetId = new Map();
  const uncached = [];
  for (const target of targets) {
    const hit = cache.results[cacheKeyFor(model, target.name)];
    if (hit) resultByTargetId.set(target.id, hit);
    else uncached.push(target);
  }
  const cacheHitsBeforeRun = resultByTargetId.size;

  let apiCallsMade = 0;
  if (commit && uncached.length) {
    if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required to call the research model');
    for (const batch of chunk(uncached, batchSize)) {
      const messages = buildResearchPrompt(batch.map((entity) => ({ name: entity.name, kind: entity.kind })));
      const completion = await createChatCompletion({
        operation: 'kg.placeholder_triage',
        model, messages, response_format: { type: 'json_object' }, temperature: 0,
        // Sized to the batch: enough headroom for a ~60-word sourced summary
        // per entity plus JSON structure overhead.
        max_tokens: Math.min(6000, 400 + batch.length * 250),
      });
      apiCallsMade += 1;
      const content = completion.choices?.[0]?.message?.content;
      const parsed = parseResearchResponse(content, batch.map((entity) => ({ name: entity.name, kind: entity.kind })));
      parsed.forEach((result, index) => {
        const entity = batch[index];
        cache.results[cacheKeyFor(model, entity.name)] = result;
        resultByTargetId.set(entity.id, result);
      });
      await saveCache(cachePath, cache);
    }
  }

  // Plan updates for every target we have a result for -- pre-existing cache
  // hits in both dry-run and --commit mode, plus (in --commit mode only)
  // whatever was just fetched above.
  let confirmed = 0; let rejected = 0;
  const patchesByTable = new Map();
  const targetReports = targets.map((target) => {
    const result = resultByTargetId.get(target.id) ?? null;
    if (!result) {
      return { table: target.table, id: target.id, name: target.name, kind: target.kind, status: 'would_call', result: null };
    }
    const patch = planResearchUpdate(target, result);
    const isConfirmed = !('resolution_status' in patch);
    if (isConfirmed) confirmed += 1; else rejected += 1;
    if (commit) {
      if (!patchesByTable.has(target.table)) patchesByTable.set(target.table, []);
      patchesByTable.get(target.table).push({ id: target.id, patch });
    }
    const cameFromThisRun = commit && uncached.some((entity) => entity.id === target.id);
    return {
      table: target.table, id: target.id, name: target.name, kind: target.kind,
      status: cameFromThisRun ? 'researched' : 'cache_hit',
      result, planned_status: isConfirmed ? 'confirmed' : 'rejected',
    };
  });

  let written = 0;
  if (commit) {
    for (const [table, entries] of patchesByTable) {
      for (const { id, patch } of entries) {
        await rest(table, { method: 'PATCH', params: { id: `eq.${id}` }, body: patch, prefer: 'return=minimal' });
        written += 1;
      }
    }
  }

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    source_id: sourceId,
    kind_filter: kindFilter,
    model,
    batch_size: batchSize,
    limit,
    placeholders_found: allPlaceholders.length,
    placeholders_processed: targets.length,
    cached_hits: cacheHitsBeforeRun,
    api_calls: apiCallsMade,
    api_calls_estimated: commit ? apiCallsMade : Math.ceil(uncached.length / batchSize),
    researched: resultByTargetId.size,
    confirmed,
    rejected,
    would_call: commit ? 0 : uncached.length,
    rows_updated: written,
    cache: cachePath,
    safety: 'Never publishes or approves. Confirmed placeholders stay resolution_status \'pending\' with enriched metadata.research_* fields for a human reviewer; rejected placeholders are marked resolution_status \'rejected\'. publication_status/review_status are never touched here.',
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, targets: targetReports }, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!commit) {
    console.log(uncached.length
      ? `\nPreview only. ${uncached.length} placeholder(s) would be sent to ${model} across ${summary.api_calls_estimated} call(s) (token charges apply; this route has no live web-search fee). Re-run with --commit to call the model and write updates.`
      : '\nPreview only. All selected placeholders were already cached; re-run with --commit to write the planned updates shown above. No new API calls would be made.');
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
