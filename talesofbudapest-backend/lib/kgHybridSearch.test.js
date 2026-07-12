import test from 'node:test';
import assert from 'node:assert/strict';
import { rrfFuse, searchClaimsHybrid, searchEntitiesHybrid } from './kgHybridSearch.js';
import { normalizeLocationName } from './kgNormalize.js';

test('rrfFuse: agreement across lists outranks a single top-1 hit', () => {
  // B is rank 2 in two lists; A is rank 1 in one list only.
  // score(A) = 1/(60+1) ≈ 0.01639
  // score(B) = 2 * 1/(60+2) ≈ 0.03226
  const fused = rrfFuse([['A', 'B'], ['B', 'C']]);
  const byId = Object.fromEntries(fused.map((entry) => [entry.id, entry]));
  assert.ok(byId.B.score > byId.A.score, 'item ranked in two lists should outscore a single-list top hit');
  assert.equal(fused[0].id, 'B');
  assert.equal(byId.A.ranks.length, 2);
  assert.deepEqual(byId.A.ranks, [1, null]);
  assert.deepEqual(byId.B.ranks, [2, 1]);
});

test('rrfFuse: mid-ranked in three lists beats top-ranked in only one', () => {
  // X: rank 1 in list A only -> 1/61
  // Y: rank 3 in lists B, C, D -> 3/63
  const fused = rrfFuse([
    ['X', 'other1', 'other2'],
    ['other3', 'other4', 'Y'],
    ['other5', 'other6', 'Y'],
    ['other7', 'other8', 'Y'],
  ]);
  const byId = Object.fromEntries(fused.map((entry) => [entry.id, entry]));
  assert.ok(byId.Y.score > byId.X.score);
  assert.equal(fused[0].id, 'Y');
});

test('rrfFuse: k sensitivity — larger k flattens rank-based score differences', () => {
  const lists = [['first', 'second']];
  const small = rrfFuse(lists, { k: 1 });
  const large = rrfFuse(lists, { k: 1000 });
  const ratioAt = (fused) => {
    const byId = Object.fromEntries(fused.map((entry) => [entry.id, entry.score]));
    return byId.second / byId.first;
  };
  const smallRatio = ratioAt(small);
  const largeRatio = ratioAt(large);
  assert.ok(largeRatio > smallRatio, 'a larger k should narrow the gap between rank 1 and rank 2 scores');
  assert.ok(largeRatio < 1 && smallRatio < 1, 'rank 2 never outscores rank 1 within the same single list');
});

test('rrfFuse: default k is 60', () => {
  const fused = rrfFuse([['only']]);
  assert.equal(fused[0].score, 1 / 61);
});

test('rrfFuse: empty input produces empty output', () => {
  assert.deepEqual(rrfFuse([]), []);
  assert.deepEqual(rrfFuse([[], []]), []);
  assert.deepEqual(rrfFuse(undefined), []);
});

test('rrfFuse: accepts bare ids and {id} objects interchangeably', () => {
  const fromIds = rrfFuse([['a', 'b'], ['b', 'a']]);
  const fromObjects = rrfFuse([[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }]]);
  assert.deepEqual(fromIds.map((entry) => [entry.id, entry.score]), fromObjects.map((entry) => [entry.id, entry.score]));
});

test('rrfFuse: mixed bare-id and object items in the same call resolve to the same id', () => {
  const fused = rrfFuse([['a'], [{ id: 'a' }]]);
  assert.equal(fused.length, 1);
  assert.equal(fused[0].id, 'a');
  assert.deepEqual(fused[0].ranks, [1, 1]);
});

test('rrfFuse: ties are broken by stable first-appearance order', () => {
  // Neither item appears in any shared list, so both get an identical
  // single-list rank-1 score; insertion order must decide the tie.
  const fused = rrfFuse([['first-declared'], ['second-declared']]);
  assert.equal(fused[0].score, fused[1].score);
  assert.equal(fused[0].id, 'first-declared');
  assert.equal(fused[1].id, 'second-declared');
});

test('rrfFuse: a repeated id within one list keeps its best rank and does not double-count', () => {
  const fused = rrfFuse([['dup', 'other', 'dup']]);
  const byId = Object.fromEntries(fused.map((entry) => [entry.id, entry]));
  assert.equal(byId.dup.score, 1 / 61);
  assert.deepEqual(byId.dup.ranks, [1]);
});

const fakeSupabase = (result) => {
  const calls = [];
  return {
    calls,
    rpc: (name, params) => {
      calls.push({ name, params });
      return Promise.resolve(result);
    },
  };
};

test('searchClaimsHybrid: calls match_kg_claims_hybrid with mapped params, query_text canonicalized', async () => {
  const supabase = fakeSupabase({ data: [{ claim_id: 'c1', rrf_score: 0.05 }], error: null });
  const rows = await searchClaimsHybrid({ supabase, queryText: 'Förster', queryEmbedding: [0.1, 0.2], matchCount: 10, rrfK: 30 });
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, 'match_kg_claims_hybrid');
  assert.deepEqual(supabase.calls[0].params, {
    query_text: 'forster', query_embedding: [0.1, 0.2], match_count: 10, rrf_k: 30,
  });
  assert.equal(supabase.calls[0].params.query_text, normalizeLocationName('Förster'));
  assert.deepEqual(rows, [{ claim_id: 'c1', rrf_score: 0.05 }]);
});

test('searchClaimsHybrid: query_text is normalized the same way normalized_alias is written (Hungarian/English generic terms canonicalize)', async () => {
  const supabase = fakeSupabase({ data: [], error: null });
  await searchClaimsHybrid({ supabase, queryText: 'Kazinczy utca 29' });
  assert.equal(supabase.calls[0].params.query_text, 'kazinczy street 29');
});

test('searchClaimsHybrid: null/omitted queryEmbedding passes through as null (keyword-only)', async () => {
  const supabase = fakeSupabase({ data: [], error: null });
  await searchClaimsHybrid({ supabase, queryText: 'Kazinczy utca 29' });
  assert.equal(supabase.calls[0].params.query_embedding, null);
  assert.equal(supabase.calls[0].params.match_count, 20);
  assert.equal(supabase.calls[0].params.rrf_k, 60);
});

test('searchClaimsHybrid: throws on RPC error and does not swallow it', async () => {
  const supabase = fakeSupabase({ data: null, error: { message: 'function does not exist' } });
  await assert.rejects(
    () => searchClaimsHybrid({ supabase, queryText: 'x' }),
    /function does not exist/,
  );
});

test('searchClaimsHybrid: null data resolves to an empty array', async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  const rows = await searchClaimsHybrid({ supabase, queryText: 'x' });
  assert.deepEqual(rows, []);
});

test('searchEntitiesHybrid: calls match_kg_entities_hybrid with mapped params, query_text canonicalized', async () => {
  const supabase = fakeSupabase({ data: [{ entity_id: 'e1', rrf_score: 0.02 }], error: null });
  const rows = await searchEntitiesHybrid({ supabase, queryText: 'Dohány', queryEmbedding: null, matchCount: 5, rrfK: 60 });
  assert.equal(supabase.calls[0].name, 'match_kg_entities_hybrid');
  assert.deepEqual(supabase.calls[0].params, {
    query_text: 'dohany', query_embedding: null, match_count: 5, rrf_k: 60,
  });
  assert.deepEqual(rows, [{ entity_id: 'e1', rrf_score: 0.02 }]);
});

test('searchEntitiesHybrid: throws on RPC error', async () => {
  const supabase = fakeSupabase({ data: null, error: { message: 'permission denied' } });
  await assert.rejects(
    () => searchEntitiesHybrid({ supabase, queryText: 'x' }),
    /permission denied/,
  );
});
