import crypto from 'node:crypto';
import { logOpenRouter, openRouterRequestId, summarizeUsage } from './openRouterLogger.js';
import { getOpenRouterHeaders, OPENROUTER_BASE_URL } from './openRouterHttp.js';

export const KG_EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_EMBEDDING_ENDPOINT = `${OPENROUTER_BASE_URL}/embeddings`;

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const embeddingCacheKey = (model, dimensions, input) => crypto
  .createHash('sha256')
  .update(`${model}\u001f${dimensions}\u001f${input}`)
  .digest('hex');

export const assertEmbedding = (embedding, dimensions = KG_EMBEDDING_DIMENSIONS) => {
  if (!Array.isArray(embedding) || embedding.length !== dimensions) {
    throw new Error(`Embedding dimension mismatch: expected ${dimensions}, received ${Array.isArray(embedding) ? embedding.length : 'non-array'}`);
  }
  if (!embedding.every(Number.isFinite)) throw new Error('Embedding contains a non-finite value');
  return embedding;
};

export const canonicalEntityEmbeddingText = (entity) => [
  `${compact(entity.entity_kind) || 'entity'}: ${compact(entity.canonical_name_en)}`,
  compact(entity.description_en),
  compact(entity.date_label_en),
  compact(entity.metadata?.address_en ?? entity.metadata?.address),
].filter(Boolean).join('. ');

export const aliasEmbeddingText = (alias, entity) => [
  `${compact(entity?.entity_kind) || 'entity'} alias: ${compact(alias.alias)}`,
  compact(entity?.canonical_name_en) && `canonical name: ${compact(entity.canonical_name_en)}`,
  compact(alias.alias_kind) === 'address' ? 'This alias is an address.' : '',
].filter(Boolean).join(' ');

export const stagingLocationEmbeddingText = (location) => [
  `Budapest location: ${compact(location.name_en)}`,
  compact(location.source_name_hu) && `Hungarian/source name: ${compact(location.source_name_hu)}`,
  compact(location.address_en) && `Address: ${compact(location.address_en)}`,
  compact(location.source_address_hu) && `Source address: ${compact(location.source_address_hu)}`,
  compact(location.location_kind) && `Type: ${compact(location.location_kind)}`,
].filter(Boolean).join('. ');

// "<entity name> — <claim_type>, <era or years>: <statement_en>", enriched
// context so embeddings stop blurring self-similar claims. `claim.era` is a
// string column another agent is adding to kg_claims; read it defensively
// (it may not exist yet) and fall back to start_year/end_year, then
// date_label_en. entity.canonical_name_en is the real kg_entities column
// (see supabase/migrations/015_knowledge_graph_canonical.sql); name_en/
// canonical_name are accepted defensively in case a caller passes either.
export const claimEmbeddingText = (claim = {}, entity = {}) => {
  const entityName = compact(entity.name_en) || compact(entity.canonical_name_en) || compact(entity.canonical_name);
  const claimType = compact(claim.claim_type);
  const timePart = compact(claim.era)
    || (claim.start_year != null
      ? (claim.end_year != null && claim.end_year !== claim.start_year ? `${claim.start_year}–${claim.end_year}` : `${claim.start_year}`)
      : compact(claim.date_label_en));
  const statement = compact(claim.statement_en);
  const namePart = entityName ? `Budapest claim about ${entityName}` : 'Budapest claim';
  const typeAndTime = [claimType, timePart].filter(Boolean).join(', ');
  const header = typeAndTime ? `${namePart} — ${typeAndTime}` : namePart;
  return statement ? `${header}: ${statement}` : header;
};

const chunks = (values, size) => Array.from(
  { length: Math.ceil(values.length / size) },
  (_, index) => values.slice(index * size, (index + 1) * size),
);

export const embedTexts = async (inputs, options = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  const endpoint = options.endpoint ?? process.env.OPENROUTER_EMBEDDING_ENDPOINT ?? DEFAULT_EMBEDDING_ENDPOINT;
  const model = options.model ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const dimensions = Number(options.dimensions ?? process.env.OPENROUTER_EMBEDDING_DIMENSIONS ?? KG_EMBEDDING_DIMENSIONS);
  const batchSize = Number(options.batchSize ?? 64);
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer');
  if (!Number.isInteger(dimensions) || dimensions < 1) throw new Error('dimensions must be a positive integer');

  const embeddings = [];
  const usage = { prompt_tokens: 0, total_tokens: 0, requests: 0 };
  for (const batch of chunks(inputs, batchSize)) {
    const requestId = openRouterRequestId();
    const startedAt = Date.now();
    logOpenRouter('request.started', { request_id: requestId, operation: 'embeddings', endpoint: '/embeddings', model, batch_size: batch.length });
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: getOpenRouterHeaders({ requireAuth: true }),
      body: JSON.stringify({ model, input: batch, dimensions }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logOpenRouter('request.failed', { request_id: requestId, operation: 'embeddings', endpoint: '/embeddings', model, status: response.status, duration_ms: Date.now() - startedAt, error_length: errorBody.length });
      throw new Error(`OpenRouter embeddings failed (${response.status}): ${errorBody}`);
    }
    const payload = await response.json();
    logOpenRouter('request.completed', { request_id: requestId, operation: 'embeddings', endpoint: '/embeddings', model, status: response.status, duration_ms: Date.now() - startedAt, batch_size: batch.length, usage: summarizeUsage(payload.usage) });
    const ordered = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) throw new Error(`OpenRouter returned ${ordered.length} embeddings for ${batch.length} inputs`);
    embeddings.push(...ordered.map((item) => assertEmbedding(item.embedding, dimensions)));
    usage.prompt_tokens += Number(payload.usage?.prompt_tokens ?? payload.usage?.input_tokens ?? 0);
    usage.total_tokens += Number(payload.usage?.total_tokens ?? payload.usage?.prompt_tokens ?? payload.usage?.input_tokens ?? 0);
    usage.requests += 1;
    options.onBatch?.({ completed: embeddings.length, total: inputs.length, usage: { ...usage } });
  }
  return { embeddings, usage, model, dimensions };
};

export const estimateEmbeddingCostUsd = (usage, inputCostPerMillion = 0.02) =>
  Number(((Number(usage?.prompt_tokens ?? 0) / 1_000_000) * Number(inputCostPerMillion)).toFixed(6));
