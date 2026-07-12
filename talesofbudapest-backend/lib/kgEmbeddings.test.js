import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KG_EMBEDDING_DIMENSIONS, assertEmbedding, claimEmbeddingText, embedTexts, embeddingCacheKey,
  stagingLocationEmbeddingText,
} from './kgEmbeddings.js';

test('embedding cache key changes with model, dimensions, and input', () => {
  assert.notEqual(embeddingCacheKey('a', 3, 'x'), embeddingCacheKey('b', 3, 'x'));
  assert.notEqual(embeddingCacheKey('a', 3, 'x'), embeddingCacheKey('a', 4, 'x'));
  assert.equal(embeddingCacheKey('a', 3, 'x'), embeddingCacheKey('a', 3, 'x'));
});

test('staging text includes aliases, address, and kind', () => {
  const text = stagingLocationEmbeddingText({ name_en: 'Great Synagogue', source_name_hu: 'Nagy zsinagóga', address_en: 'Dohány Street 2', location_kind: 'synagogue' });
  assert.match(text, /Great Synagogue/); assert.match(text, /Nagy zsinagóga/); assert.match(text, /Dohány Street 2/); assert.match(text, /synagogue/);
});

test('embedTexts batches, orders indexed results, and sums usage', async () => {
  const calls = [];
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body); calls.push(body);
    return { ok: true, json: async () => ({
      data: body.input.map((_, index) => ({ index, embedding: Array(KG_EMBEDDING_DIMENSIONS).fill(index + calls.length) })).reverse(),
      usage: { prompt_tokens: body.input.length * 2, total_tokens: body.input.length * 2 },
    }) };
  };
  const result = await embedTexts(['a', 'b', 'c'], { apiKey: 'test', batchSize: 2, fetchImpl });
  assert.equal(calls.length, 2); assert.deepEqual(calls.map((call) => call.input), [['a', 'b'], ['c']]);
  assert.equal(result.embeddings.length, 3); assert.equal(result.usage.prompt_tokens, 6); assert.equal(result.usage.requests, 2);
});

test('dimension validation rejects incompatible vectors', () => {
  assert.throws(() => assertEmbedding([1, 2], KG_EMBEDDING_DIMENSIONS), /dimension mismatch/);
});

test('claim text with full fields composes name, type, years, and statement', () => {
  const claim = {
    claim_type: 'construction', start_year: 1854, end_year: 1859, statement_en: 'Built between 1854 and 1859.',
  };
  const entity = { canonical_name_en: 'Great Synagogue' };
  assert.equal(
    claimEmbeddingText(claim, entity),
    'Budapest claim about Great Synagogue — construction, 1854–1859: Built between 1854 and 1859.',
  );
});

test('claim text prefers era over start_year/end_year when era is present', () => {
  const claim = {
    claim_type: 'construction', era: 'Golden Age', start_year: 1854, end_year: 1859, statement_en: 'Built between 1854 and 1859.',
  };
  const entity = { canonical_name_en: 'Great Synagogue' };
  assert.equal(
    claimEmbeddingText(claim, entity),
    'Budapest claim about Great Synagogue — construction, Golden Age: Built between 1854 and 1859.',
  );
});

test('claim text falls back to years when only years are present', () => {
  const claim = { start_year: 1900, statement_en: 'A single-year claim.' };
  const entity = { canonical_name_en: 'Parliament' };
  assert.equal(
    claimEmbeddingText(claim, entity),
    'Budapest claim about Parliament — 1900: A single-year claim.',
  );
});

test('claim text falls back to date_label_en when years are absent', () => {
  const claim = { claim_type: 'daily_life', date_label_en: 'turn of the century', statement_en: 'Life went on.' };
  const entity = { canonical_name_en: 'Kazinczy Street' };
  assert.equal(
    claimEmbeddingText(claim, entity),
    'Budapest claim about Kazinczy Street — daily_life, turn of the century: Life went on.',
  );
});

test('claim text with minimal fields does not crash and still contains name and statement', () => {
  const text = claimEmbeddingText({ statement_en: 'Something happened.' }, { canonical_name_en: 'Dohány Street' });
  assert.match(text, /Dohány Street/);
  assert.match(text, /Something happened\./);
  assert.doesNotThrow(() => claimEmbeddingText());
  assert.doesNotThrow(() => claimEmbeddingText({}, {}));
});

test('claim text keeps stable part ordering regardless of which optional fields are present', () => {
  const entity = { canonical_name_en: 'Rumbach Street Synagogue' };
  const withType = claimEmbeddingText({ claim_type: 'religious', statement_en: 'A statement.' }, entity);
  const withYears = claimEmbeddingText({ start_year: 1872, end_year: 1873, statement_en: 'A statement.' }, entity);
  assert.equal(withType, 'Budapest claim about Rumbach Street Synagogue — religious: A statement.');
  assert.equal(withYears, 'Budapest claim about Rumbach Street Synagogue — 1872–1873: A statement.');
  // name always precedes type/time, which always precedes the statement
  assert.ok(withType.indexOf('Rumbach Street Synagogue') < withType.indexOf('religious'));
  assert.ok(withType.indexOf('religious') < withType.indexOf('A statement.'));
  assert.equal(claimEmbeddingText({ claim_type: 'religious', statement_en: 'A statement.' }, entity), withType);
});

