import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KG_EMBEDDING_DIMENSIONS, aliasEmbeddingText, canonicalEntityEmbeddingText, claimEmbeddingText,
  embedTexts, embeddingCacheKey, estimateEmbeddingCostUsd, stagingLocationEmbeddingText,
} from '../lib/kgEmbeddings.js';
import { planPublicLocationAliases, planPublicLocationEntities } from '../lib/kgPublicLocationSeeder.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option, numberOption } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_CACHE = path.join(__dirname, '../../ingest/corpus/restricted/experiments/kg-embeddings.cache.json');
const DEFAULT_CACHE_JSONL = path.join(__dirname, '../../ingest/corpus/restricted/experiments/kg-embeddings.cache.jsonl');
const DEFAULT_BASE_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.location-candidates.json');
const DEFAULT_VECTOR_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.location-vector-candidates.json');

const loadCache = async (cachePath) => {
  const embeddings = {};
  const jsonlPath = cachePath.endsWith('.jsonl') ? cachePath : `${cachePath}l`;
  try {
    const { createReadStream } = await import('node:fs');
    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      try {
        const row = JSON.parse(line);
        if (row?.key && Array.isArray(row.embedding)) embeddings[row.key] = row;
      } catch { /* skip bad line */ }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Legacy monolith JSON (may OOM on huge files — best-effort, skip if bak).
  try {
    const legacy = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    for (const [key, value] of Object.entries(legacy.embeddings ?? {})) {
      if (!embeddings[key] && value?.embedding) {
        embeddings[key] = { model: value.model, dimensions: value.dimensions, embedding: value.embedding };
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && !/Invalid string length|Unexpected|JSON/i.test(error.message)) throw error;
  }
  return { version: 2, embeddings, jsonlPath };
};

const appendCacheRows = async (jsonlPath, rows) => {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
  const lines = rows.map((row) => JSON.stringify({
    key: row.key,
    model: row.model,
    dimensions: row.dimensions,
    embedding: row.embedding,
  })).join('\n');
  await fs.appendFile(jsonlPath, `${lines}\n`, 'utf8');
};

const readBaseReport = async (reportPath) => {
  try { return JSON.parse(await fs.readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

const mapPool = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const main = async () => {
  const args = process.argv.slice(2);
  const seedPublicLocations = args.includes('--seed-public-locations');
  const targetWasSpecified = args.includes('--target');
  const target = option(args, '--target', 'all');
  const commit = args.includes('--commit');
  const force = args.includes('--force');
  const limit = numberOption(args, '--limit', 10000);
  const batchSize = numberOption(args, '--batch-size', 64);
  const matchCount = numberOption(args, '--match-count', 10);
  const minSimilarity = numberOption(args, '--min-similarity', 0.65);
  const model = option(args, '--model', process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small');
  const dimensions = numberOption(args, '--dimensions', KG_EMBEDDING_DIMENSIONS);
  const cachePath = path.resolve(option(args, '--cache', DEFAULT_CACHE));
  const baseReportPath = path.resolve(option(args, '--base-report', DEFAULT_BASE_REPORT));
  const vectorReportPath = path.resolve(option(args, '--report', DEFAULT_VECTOR_REPORT));
  const sourceId = option(args, '--source-id', null);
  if (!['canonical', 'staging', 'claims', 'all'].includes(target)) throw new Error('--target must be canonical, staging, claims, or all');
  if (dimensions !== KG_EMBEDDING_DIMENSIONS) throw new Error(`KG schema requires exactly ${KG_EMBEDDING_DIMENSIONS} dimensions`);
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest, restAll } = createRestClient(baseUrl, serviceKey);

  const fetchByIds = async (table, select, ids, idChunk = 100) => {
    const rows = [];
    for (let index = 0; index < ids.length; index += idChunk) {
      const chunk = ids.slice(index, index + idChunk);
      if (!chunk.length) continue;
      rows.push(...await rest(table, { params: { select, id: `in.(${chunk.join(',')})` } }));
    }
    return rows;
  };

  const cache = await loadCache(cachePath);
  cache.version = 2; cache.embeddings ??= {};
  const totals = { requested: 0, embedded: 0, cache_hits: 0, db_reused: 0, updated: 0, candidate_queries: 0, prompt_tokens: 0, requests: 0, cache_path: cache.jsonlPath };

  if (seedPublicLocations) {
    const publicLocations = await restAll('locations', { select: 'id,name,latitude,longitude,landmark_type' });
    let canonicalLocations = await restAll('kg_entities', { select: 'id,public_location_id', entity_kind: 'eq.location', public_location_id: 'not.is.null' });
    const entityRows = planPublicLocationEntities(publicLocations.slice(0, limit), canonicalLocations);
    if (commit && entityRows.length) {
      await rest('kg_entities', { method: 'POST', body: entityRows, prefer: 'return=minimal' });
      canonicalLocations = await restAll('kg_entities', { select: 'id,public_location_id', entity_kind: 'eq.location', public_location_id: 'not.is.null' });
    }
    const aliases = await restAll('kg_entity_aliases', { select: 'entity_id,normalized_alias,alias_kind' });
    const translations = await restAll('location_translations', { select: 'location_id,locale,name' });
    const aliasRows = planPublicLocationAliases(publicLocations.slice(0, limit), canonicalLocations, aliases, translations);
    if (commit && aliasRows.length) {
      for (let index = 0; index < aliasRows.length; index += 100) {
        await rest('kg_entity_aliases', { method: 'POST', body: aliasRows.slice(index, index + 100), prefer: 'return=minimal' });
      }
    }
    console.log(JSON.stringify({
      mode: commit ? 'seed-public-locations' : 'dry-run-seed-public-locations', public_locations: Math.min(publicLocations.length, limit),
      existing_canonical_entities: canonicalLocations.length - (commit ? entityRows.length : 0),
      canonical_entities_created_or_planned: entityRows.length,
      aliases_created_or_planned: commit ? aliasRows.length : planPublicLocationAliases(publicLocations.slice(0, limit), [...canonicalLocations, ...entityRows.map((row, index) => ({ ...row, id: `planned-${index}` }))], aliases, translations).length,
      review_status: 'draft', publication_status: 'private',
      safety: 'Seeds resolver candidates only; no Chronicle content is published.',
    }, null, 2));
    if (!targetWasSpecified) return;
  }

  const obtain = async (items) => {
    const results = new Map(); const missing = [];
    for (const item of items) {
      const cacheKey = embeddingCacheKey(model, dimensions, item.text);
      const cached = cache.embeddings[cacheKey];
      if (cached?.embedding?.length === dimensions) { results.set(item.key, cached.embedding); totals.cache_hits += 1; }
      else missing.push({ ...item, cacheKey });
    }
    totals.requested += items.length;
    const flushSize = Math.max(batchSize * 4, batchSize);
    for (let offset = 0; offset < missing.length; offset += flushSize) {
      const slice = missing.slice(offset, offset + flushSize);
      const response = await embedTexts(slice.map((item) => item.text), { model, dimensions, batchSize });
      const rows = [];
      response.embeddings.forEach((embedding, index) => {
        const item = slice[index];
        results.set(item.key, embedding);
        const row = { key: item.cacheKey, model, dimensions, embedding };
        cache.embeddings[item.cacheKey] = row;
        rows.push(row);
      });
      totals.embedded += slice.length;
      totals.prompt_tokens += response.usage.prompt_tokens;
      totals.requests += response.usage.requests;
      await appendCacheRows(cache.jsonlPath, rows);
    }
    return results;
  };

  if (target === 'canonical' || target === 'all') {
    const entities = (await restAll('kg_entities', { select: 'id,entity_kind,canonical_name_en,description_en,date_label_en,metadata,embedding' })).slice(0, limit);
    const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
    const aliases = (await restAll('kg_entity_aliases', { select: 'id,entity_id,alias,alias_kind,embedding' })).slice(0, limit);
    const entityWork = entities.filter((row) => force || row.embedding == null).map((row) => ({ key: `entity:${row.id}`, text: canonicalEntityEmbeddingText(row), row }));
    const aliasWork = aliases.filter((row) => force || row.embedding == null).map((row) => ({ key: `alias:${row.id}`, text: aliasEmbeddingText(row, entityMap.get(row.entity_id)), row }));
    totals.db_reused += entities.length + aliases.length - entityWork.length - aliasWork.length;
    const vectors = await obtain([...entityWork, ...aliasWork]);
    if (commit) {
      await mapPool(entityWork, 12, async (item) => {
        await rest('kg_entities', { method: 'PATCH', params: { id: `eq.${item.row.id}` }, body: { embedding: vectors.get(item.key) }, returnRepresentation: false });
        totals.updated += 1;
      });
      await mapPool(aliasWork, 12, async (item) => {
        await rest('kg_entity_aliases', { method: 'PATCH', params: { id: `eq.${item.row.id}` }, body: { embedding: vectors.get(item.key) }, returnRepresentation: false });
        totals.updated += 1;
      });
    }
  }

  if (target === 'claims' || target === 'all') {
    const claims = (await restAll('kg_claims', { select: 'id,subject_entity_id,statement_en,claim_type,start_year,end_year,date_label_en,embedding' })).slice(0, limit);
    const claimWork = claims.filter((row) => force || row.embedding == null);
    totals.db_reused += claims.length - claimWork.length;
    const subjectIds = [...new Set(claimWork.map((row) => row.subject_entity_id).filter(Boolean))];
    const subjectEntities = await fetchByIds('kg_entities', 'id,canonical_name_en', subjectIds);
    const entityMap = new Map(subjectEntities.map((entity) => [entity.id, entity]));
    const work = claimWork.map((row) => ({ key: `claim:${row.id}`, text: claimEmbeddingText(row, entityMap.get(row.subject_entity_id)), row }));
    const vectors = await obtain(work);
    if (commit) {
      await mapPool(work, 12, async (item) => {
        await rest('kg_claims', { method: 'PATCH', params: { id: `eq.${item.row.id}` }, body: { embedding: vectors.get(item.key) }, returnRepresentation: false });
        totals.updated += 1;
      });
    }
  }

  if (target === 'staging' || target === 'all') {
    const stagedParams = { select: 'id,source_id,name_key,name_en,source_name_hu,address_en,source_address_hu,location_kind,resolution_status', resolution_status: 'eq.pending' };
    if (sourceId) stagedParams.source_id = `eq.${sourceId}`;
    const locations = (await restAll('kg_locations', stagedParams)).slice(0, limit);
    const work = locations.map((row) => ({ key: `staging:${row.id}`, text: stagingLocationEmbeddingText(row), row }));
    const vectors = await obtain(work);
    const baseReport = await readBaseReport(baseReportPath);
    const deterministicByName = new Map((baseReport?.locations ?? []).map((item) => [item.name_key, item.candidates ?? []]));
    const reports = [];
    for (const item of work) {
      const vectorCandidates = await rest('rpc/match_kg_entity_candidates', {
        method: 'POST', body: { query_embedding: vectors.get(item.key), query_kind: 'location', match_count: matchCount, min_similarity: minSimilarity },
      });
      totals.candidate_queries += 1;
      reports.push({
        staging_location_id: item.row.id, source_id: item.row.source_id, name_key: item.row.name_key,
        name_en: item.row.name_en, address_en: item.row.address_en,
        deterministic_candidates: deterministicByName.get(item.row.name_key) ?? [], vector_candidates: vectorCandidates,
        resolution: 'pending', note: 'Vector candidates are suggestions only; no entity was resolved or linked.',
      });
    }
    await fs.mkdir(path.dirname(vectorReportPath), { recursive: true });
    await fs.writeFile(vectorReportPath, `${JSON.stringify({
      generated_at: new Date().toISOString(), model, dimensions, source_id: sourceId, locations: reports,
      safety: 'Candidate generation only. Vector similarity never auto-resolves identity.',
    }, null, 2)}\n`, 'utf8');
  }

  const inputCostPerMillion = Number(process.env.OPENROUTER_EMBEDDING_INPUT_COST_PER_MILLION ?? 0.02);
  console.log(JSON.stringify({
    mode: commit ? 'commit-canonical-embeddings' : 'dry-run', target, model, dimensions, ...totals,
    estimated_cost_usd: estimateEmbeddingCostUsd({ prompt_tokens: totals.prompt_tokens }, inputCostPerMillion),
    cost_basis_usd_per_million_input_tokens: inputCostPerMillion,
    cache: cache.jsonlPath, ...((target === 'staging' || target === 'all') ? { candidate_report: vectorReportPath } : {}),
    safety: 'Vector matches are report-only and never auto-resolve staging records.',
  }, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
