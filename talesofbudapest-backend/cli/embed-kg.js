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
const DEFAULT_BASE_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.location-candidates.json');
const DEFAULT_VECTOR_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.location-vector-candidates.json');

const loadCache = async (cachePath) => {
  try { return JSON.parse(await fs.readFile(cachePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, embeddings: {} }; throw error; }
};

const saveCache = async (cachePath, cache) => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(cache)}\n`, 'utf8');
  await fs.rename(tempPath, cachePath);
};

const readBaseReport = async (reportPath) => {
  try { return JSON.parse(await fs.readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
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
  const { rest } = createRestClient(baseUrl, serviceKey);

  const cache = await loadCache(cachePath);
  cache.version = 1; cache.embeddings ??= {};
  const totals = { requested: 0, embedded: 0, cache_hits: 0, db_reused: 0, updated: 0, candidate_queries: 0, prompt_tokens: 0, requests: 0 };

  if (seedPublicLocations) {
    const publicLocations = await rest('locations', { params: { select: 'id,name,latitude,longitude,landmark_type', limit: String(limit) } });
    let canonicalLocations = await rest('kg_entities', { params: { select: 'id,public_location_id', entity_kind: 'eq.location', public_location_id: 'not.is.null', limit: String(limit) } });
    const entityRows = planPublicLocationEntities(publicLocations, canonicalLocations);
    if (commit && entityRows.length) {
      await rest('kg_entities', { method: 'POST', body: entityRows, prefer: 'return=minimal' });
      canonicalLocations = await rest('kg_entities', { params: { select: 'id,public_location_id', entity_kind: 'eq.location', public_location_id: 'not.is.null', limit: String(limit) } });
    }
    const aliases = await rest('kg_entity_aliases', { params: { select: 'entity_id,normalized_alias,alias_kind', limit: String(limit) } });
    const translations = await rest('location_translations', { params: { select: 'location_id,locale,name', limit: String(limit) } });
    const aliasRows = planPublicLocationAliases(publicLocations, canonicalLocations, aliases, translations);
    if (commit && aliasRows.length) {
      for (let index = 0; index < aliasRows.length; index += 100) {
        await rest('kg_entity_aliases', { method: 'POST', body: aliasRows.slice(index, index + 100), prefer: 'return=minimal' });
      }
    }
    console.log(JSON.stringify({
      mode: commit ? 'seed-public-locations' : 'dry-run-seed-public-locations', public_locations: publicLocations.length,
      existing_canonical_entities: canonicalLocations.length - (commit ? entityRows.length : 0),
      canonical_entities_created_or_planned: entityRows.length,
      aliases_created_or_planned: commit ? aliasRows.length : planPublicLocationAliases(publicLocations, [...canonicalLocations, ...entityRows.map((row, index) => ({ ...row, id: `planned-${index}` }))], aliases, translations).length,
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
    if (missing.length) {
      const response = await embedTexts(missing.map((item) => item.text), { model, dimensions, batchSize });
      response.embeddings.forEach((embedding, index) => {
        const item = missing[index]; results.set(item.key, embedding);
        cache.embeddings[item.cacheKey] = { model, dimensions, input: item.text, embedding };
      });
      totals.embedded += missing.length; totals.prompt_tokens += response.usage.prompt_tokens; totals.requests += response.usage.requests;
      await saveCache(cachePath, cache);
    }
    return results;
  };

  if (target === 'canonical' || target === 'all') {
    const entities = await rest('kg_entities', { params: { select: 'id,entity_kind,canonical_name_en,description_en,date_label_en,metadata,embedding', limit: String(limit) } });
    const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
    const aliases = await rest('kg_entity_aliases', { params: { select: 'id,entity_id,alias,alias_kind,embedding', limit: String(limit) } });
    const entityWork = entities.filter((row) => force || row.embedding == null).map((row) => ({ key: `entity:${row.id}`, text: canonicalEntityEmbeddingText(row), row }));
    const aliasWork = aliases.filter((row) => force || row.embedding == null).map((row) => ({ key: `alias:${row.id}`, text: aliasEmbeddingText(row, entityMap.get(row.entity_id)), row }));
    totals.db_reused += entities.length + aliases.length - entityWork.length - aliasWork.length;
    const vectors = await obtain([...entityWork, ...aliasWork]);
    if (commit) {
      for (const item of entityWork) { await rest('kg_entities', { method: 'PATCH', params: { id: `eq.${item.row.id}` }, body: { embedding: vectors.get(item.key) }, returnRepresentation: false }); totals.updated += 1; }
      for (const item of aliasWork) { await rest('kg_entity_aliases', { method: 'PATCH', params: { id: `eq.${item.row.id}` }, body: { embedding: vectors.get(item.key) }, returnRepresentation: false }); totals.updated += 1; }
    }
  }

  if (target === 'claims' || target === 'all') {
    const claims = await rest('kg_claims', { params: { select: 'id,subject_entity_id,statement_en,claim_type,start_year,end_year,date_label_en,embedding', limit: String(limit) } });
    const claimWork = claims.filter((row) => force || row.embedding == null);
    totals.db_reused += claims.length - claimWork.length;
    const subjectIds = [...new Set(claimWork.map((row) => row.subject_entity_id))];
    const subjectEntities = subjectIds.length
      ? await rest('kg_entities', { params: { select: 'id,canonical_name_en', id: `in.(${subjectIds.join(',')})` } })
      : [];
    const entityMap = new Map(subjectEntities.map((entity) => [entity.id, entity]));
    const work = claimWork.map((row) => ({ key: `claim:${row.id}`, text: claimEmbeddingText(row, entityMap.get(row.subject_entity_id)), row }));
    const vectors = await obtain(work);
    if (commit) {
      for (const item of work) { await rest('kg_claims', { method: 'PATCH', params: { id: `eq.${item.row.id}` }, body: { embedding: vectors.get(item.key) }, returnRepresentation: false }); totals.updated += 1; }
    }
  }

  if (target === 'staging' || target === 'all') {
    const params = { select: 'id,source_id,name_key,name_en,source_name_hu,address_en,source_address_hu,location_kind,resolution_status', resolution_status: 'eq.pending', limit: String(limit) };
    if (sourceId) params.source_id = `eq.${sourceId}`;
    const locations = await rest('kg_locations', { params });
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
  await saveCache(cachePath, cache);
  console.log(JSON.stringify({
    mode: commit ? 'commit-canonical-embeddings' : 'dry-run', target, model, dimensions, ...totals,
    estimated_cost_usd: estimateEmbeddingCostUsd({ prompt_tokens: totals.prompt_tokens }, inputCostPerMillion),
    cost_basis_usd_per_million_input_tokens: inputCostPerMillion,
    cache: cachePath, ...((target === 'staging' || target === 'all') ? { candidate_report: vectorReportPath } : {}),
    safety: 'Vector matches are report-only and never auto-resolve staging records.',
  }, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
