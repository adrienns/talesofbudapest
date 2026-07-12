// Reciprocal rank fusion (RRF) and thin RPC wrappers for hybrid search over
// the canonical knowledge graph. See docs/VECTOR_DB_IMPROVEMENTS.md
// technique #2 and supabase/migrations/016_kg_hybrid_search.sql, which
// defines the match_kg_claims_hybrid / match_kg_entities_hybrid RPCs this
// module calls. rrfFuse itself has no supabase dependency and is exported
// standalone so it can be reused/tested independently of the DB.

import { normalizeLocationName } from './kgNormalize.js';

const idOf = (item) => (item && typeof item === 'object' ? item.id : item);

/**
 * Fuse N ranked lists into a single ranking via reciprocal rank fusion:
 * score(id) = sum over lists containing id of 1 / (k + rank), rank 1-based.
 * Rank-based fusion never needs to reconcile incompatible raw score scales
 * (ts_rank vs. trigram similarity vs. cosine distance).
 *
 * @param {Array<Array<string|{id: string}>>} rankedLists - each inner array
 *   is a ranking best-first; items may be bare ids or objects with an `id`.
 * @param {{k?: number}} options - RRF k constant (default 60; higher k
 *   flattens the influence of rank differences).
 * @returns {Array<{id: string, score: number, ranks: Array<number|null>}>}
 *   sorted by score desc, ties broken by first-appearance order (stable).
 */
export const rrfFuse = (rankedLists, { k = 60 } = {}) => {
  const lists = rankedLists ?? [];
  const order = [];
  const byId = new Map();

  lists.forEach((list, listIndex) => {
    (list ?? []).forEach((item, index) => {
      const id = idOf(item);
      if (id == null) return;
      const rank = index + 1;
      let entry = byId.get(id);
      if (!entry) {
        entry = { id, score: 0, ranks: new Array(lists.length).fill(null) };
        byId.set(id, entry);
        order.push(id);
      }
      // If an id appears more than once in the same list, keep its best
      // (lowest/first) rank rather than double-counting.
      if (entry.ranks[listIndex] == null) {
        entry.ranks[listIndex] = rank;
        entry.score += 1 / (k + rank);
      }
    });
  });

  const firstSeenIndex = new Map(order.map((id, index) => [id, index]));
  return [...byId.values()].sort((a, b) => b.score - a.score || firstSeenIndex.get(a.id) - firstSeenIndex.get(b.id));
};

/**
 * Thin wrapper over the match_kg_claims_hybrid RPC (016). Dependency-injected
 * supabase client, same style as lib/narrativePipeline.js. queryText is
 * canonicalized with normalizeLocationName before the call: the SQL trigram
 * arm compares against kg_entity_aliases.normalized_alias, which is written
 * with the same normalizer (lib/kgNormalize.js), so the query must be
 * canonicalized identically or the trigram arm compares apples to oranges.
 */
export const searchClaimsHybrid = async ({ supabase, queryText, queryEmbedding = null, matchCount = 20, rrfK = 60 }) => {
  const { data, error } = await supabase.rpc('match_kg_claims_hybrid', {
    query_text: normalizeLocationName(queryText),
    query_embedding: queryEmbedding,
    match_count: matchCount,
    rrf_k: rrfK,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
};

/** Thin wrapper over the match_kg_entities_hybrid RPC (016). Same conventions (including query_text canonicalization) as searchClaimsHybrid. */
export const searchEntitiesHybrid = async ({ supabase, queryText, queryEmbedding = null, matchCount = 20, rrfK = 60 }) => {
  const { data, error } = await supabase.rpc('match_kg_entities_hybrid', {
    query_text: normalizeLocationName(queryText),
    query_embedding: queryEmbedding,
    match_count: matchCount,
    rrf_k: rrfK,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
};
