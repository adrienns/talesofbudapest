// Layer 7 of the KG matching pipeline: an LLM-suggested-alias backfill for
// the tail of canonical location entities the deterministic layers (curated
// lexicon expansion in cli/expand-kg-aliases.js, the public.locations /
// location_translations seed pass, and the Wikidata anchor import) never
// covered in Hungarian or English. See lib/kgAliasTranslationBackfill.js for
// the pure selection/prompt/parse/plan logic this CLI wires up to OpenRouter
// and Supabase.
//
// Every row this writes is born review_status 'needs_review' and source
// 'llm_translation' -- an LLM name suggestion is a judgment call, never a
// deterministic derivation, so it stays inert for auto-linking (the
// resolver only ever exact-matches 'approved' aliases -- see migration
// 018_kg_alias_exact_match.sql's match_kg_entity_exact) until a human
// reviews and approves it. This CLI never publishes and never approves;
// --publish/--allow-restricted-public are refused outright, same as
// cli/resolve-kg-locations.js.
//
// Cache: ingest/corpus/restricted/experiments/kg-alias-translations.cache.json,
// keyed `${model}${canonical_name_en}`. A cache hit is NEVER re-sent to the
// API -- this is the "never pay twice" memo pattern also used by
// cli/embed-kg.js's embedding cache, and is deliberately the same shape of
// idea as the eventual KG-14 memo table: a durable, keyed record of "we
// already asked the model this" that this script and any future one can
// consult before spending a call.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';
import {
  selectBackfillTargets, buildTranslationPrompt, parseTranslationResponse,
  planTranslationAliasRows, crossEntityCollisions,
} from '../lib/kgAliasTranslationBackfill.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option, numberOption } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_CACHE = path.join(__dirname, '../../ingest/corpus/restricted/experiments/kg-alias-translations.cache.json');
const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-alias-translation-backfill-report.json');
const DEFAULT_MODEL = process.env.KG_ALIAS_TRANSLATION_MODEL ?? 'google/gemini-2.5-flash-lite';
// PostgREST's fetch limit for the entities/aliases reads below -- large
// enough to cover the whole canonical table in one page for this project's
// size, independent of --limit (which caps how many BACKFILL TARGETS this
// run processes, not how many rows are read to compute them).
const FETCH_LIMIT = 20000;

const loadCache = async (cachePath) => {
  try { return JSON.parse(await fs.readFile(cachePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, suggestions: {} }; throw error; }
};

const saveCache = async (cachePath, cache) => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(cache)}\n`, 'utf8');
  await fs.rename(tempPath, cachePath);
};

const cacheKeyFor = (model, canonicalNameEn) => `${model}${canonicalNameEn}`;

// Same defensive pattern as cli/expand-kg-aliases.js's insertAliases: try the
// upsert WITH `source` first (the common case once migration
// 018_kg_alias_exact_match.sql has run) and only on an unknown-column error
// retry the same batch without it, so this works against both a pre- and
// post-018 schema without a caller-visible flag.
const UNKNOWN_COLUMN_ERROR = /could not find the '?source'? column|column .*source.* does not exist|PGRST204/i;

const upsertAliases = async (rest, rows) => {
  if (!rows.length) return { written: 0, sourceColumnAvailable: true };
  try {
    for (let index = 0; index < rows.length; index += 100) {
      await rest('kg_entity_aliases', {
        method: 'POST', body: rows.slice(index, index + 100),
        params: { on_conflict: 'id' }, prefer: 'resolution=merge-duplicates,return=minimal',
      });
    }
    return { written: rows.length, sourceColumnAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!UNKNOWN_COLUMN_ERROR.test(message)) throw error;
    const withoutSource = rows.map(({ source, ...fields }) => fields);
    for (let index = 0; index < withoutSource.length; index += 100) {
      await rest('kg_entity_aliases', {
        method: 'POST', body: withoutSource.slice(index, index + 100),
        params: { on_conflict: 'id' }, prefer: 'resolution=merge-duplicates,return=minimal',
      });
    }
    return { written: withoutSource.length, sourceColumnAvailable: false };
  }
};

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
};

const main = async () => {
  const args = process.argv.slice(2);
  // This layer only ever writes needs_review/llm_translation rows; it never
  // publishes and never approves. Same refusal as cli/resolve-kg-locations.js.
  if (args.includes('--publish') || args.includes('--allow-restricted-public')) {
    throw new Error('backfill-kg-alias-translations.js never publishes. Planned aliases are always needs_review/private; a human reviewer approves them separately.');
  }
  const commit = args.includes('--commit');
  const limit = numberOption(args, '--limit', 50);
  const batchSize = numberOption(args, '--batch-size', 15);
  const model = option(args, '--model', DEFAULT_MODEL);
  const kind = option(args, '--kind', 'location');
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('--batch-size must be a positive integer');
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest } = createRestClient(baseUrl, serviceKey);

  const [entities, allAliases] = await Promise.all([
    rest('kg_entities', {
      params: { select: 'id,entity_kind,canonical_name_en', entity_kind: `eq.${kind}`, review_status: 'neq.rejected', limit: String(FETCH_LIMIT) },
    }),
    rest('kg_entity_aliases', {
      params: { select: 'entity_id,normalized_alias,alias_kind,language_code,review_status,source', limit: String(FETCH_LIMIT) },
    }),
  ]);

  const aliasesByEntityId = new Map();
  for (const row of allAliases) {
    if (!aliasesByEntityId.has(row.entity_id)) aliasesByEntityId.set(row.entity_id, []);
    aliasesByEntityId.get(row.entity_id).push(row);
  }

  // Ambiguity ownership map for crossEntityCollisions: built from every
  // entity's EXISTING approved aliases only, same convention as
  // lib/kgAliasGuard.js's buildAliasOwnership -- only an approved alias
  // really "owns" an identity.
  const aliasOwnership = new Map();
  for (const row of allAliases) {
    if (row.review_status !== 'approved' || !row.normalized_alias) continue;
    const owners = aliasOwnership.get(row.normalized_alias) ?? new Set();
    owners.add(row.entity_id);
    aliasOwnership.set(row.normalized_alias, owners);
  }

  const allTargets = selectBackfillTargets(entities, aliasesByEntityId, { kinds: [kind] });
  const targets = allTargets.slice(0, limit);

  const cachePath = DEFAULT_CACHE;
  const cache = await loadCache(cachePath);
  cache.version = 1; cache.suggestions ??= {};

  const cached = [];
  const uncached = [];
  for (const target of targets) {
    const cacheKey = cacheKeyFor(model, target.canonical_name_en);
    const hit = cache.suggestions[cacheKey];
    if (hit) cached.push({ target, suggestion: hit });
    else uncached.push(target);
  }

  let apiCallsMade = 0;
  if (commit && uncached.length) {
    if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required to call the translation model');
    for (const batch of chunk(uncached, batchSize)) {
      const messages = buildTranslationPrompt(batch.map((entity) => ({ canonical_name_en: entity.canonical_name_en, kind_hint: entity.entity_kind })));
      const completion = await createChatCompletion({
        operation: 'kg.alias_translation_backfill',
        model, messages, response_format: { type: 'json_object' }, temperature: 0,
        // Sized to the batch: enough headroom for up to 4 names in each of
        // 4 languages per landmark, plus JSON structure overhead.
        max_tokens: Math.min(8000, 500 + batch.length * 300),
      });
      apiCallsMade += 1;
      const content = completion.choices?.[0]?.message?.content;
      const parsed = parseTranslationResponse(content, batch);
      parsed.forEach((suggestion, index) => {
        const entity = batch[index];
        cache.suggestions[cacheKeyFor(model, entity.canonical_name_en)] = suggestion;
        cached.push({ target: entity, suggestion });
      });
      await saveCache(cachePath, cache);
    }
  }

  // In dry-run mode `cached` only ever holds pre-existing cache hits (no API
  // calls were made to add to it); in --commit mode it also holds every
  // suggestion just fetched this run, so planning always covers every
  // target that has a known suggestion.
  const plannedByEntity = new Map();
  const allPlannedRows = [];
  for (const { target, suggestion } of cached) {
    const rows = planTranslationAliasRows(target, suggestion, aliasesByEntityId);
    plannedByEntity.set(target.id, rows);
    allPlannedRows.push(...rows);
  }

  const collisions = crossEntityCollisions(allPlannedRows, aliasOwnership);

  let writeResult = { written: 0, sourceColumnAvailable: true };
  if (commit && allPlannedRows.length) writeResult = await upsertAliases(rest, allPlannedRows);

  const targetReports = targets.map((target) => {
    const cacheHit = cached.find((entry) => entry.target.id === target.id);
    const status = cacheHit ? (uncached.some((entity) => entity.id === target.id) ? 'called' : 'cache_hit') : 'would_call';
    const rows = plannedByEntity.get(target.id) ?? [];
    return {
      entity_id: target.id,
      canonical_name_en: target.canonical_name_en,
      missing: target.missing,
      status,
      suggestion: cacheHit?.suggestion ?? null,
      aliases_planned: rows.length,
    };
  });

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    kind,
    model,
    batch_size: batchSize,
    limit,
    entities_considered: entities.length,
    backfill_targets_total: allTargets.length,
    backfill_targets_processed: targets.length,
    cache_hits: cached.length - (commit ? uncached.length : 0),
    api_calls_made: apiCallsMade,
    api_calls_estimated: commit ? apiCallsMade : Math.ceil(uncached.length / batchSize),
    would_call: commit ? 0 : uncached.length,
    aliases_planned: allPlannedRows.length,
    aliases_written: commit ? writeResult.written : 0,
    source_column_available: commit && allPlannedRows.length ? writeResult.sourceColumnAvailable : null,
    cross_entity_collisions: collisions.length,
    review_status: 'needs_review',
    source: 'llm_translation',
    cache: cachePath,
    safety: 'Every planned alias is born review_status \'needs_review\' and source \'llm_translation\' -- always inert for auto-linking until a human reviewer approves it. This script never publishes, never approves, and never touches kg_entities.review_status or publication_status.',
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({
    generated_at: new Date().toISOString(), summary, targets: targetReports, cross_entity_collisions: collisions,
  }, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!commit) {
    console.log(uncached.length
      ? `\nPreview only. ${uncached.length} entit${uncached.length === 1 ? 'y' : 'ies'} would be sent to ${model} across ${summary.api_calls_estimated} call(s). Re-run with --commit to call the model and write the needs_review aliases.`
      : '\nPreview only. All selected targets were already cached; re-run with --commit to write the needs_review aliases shown above.');
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
