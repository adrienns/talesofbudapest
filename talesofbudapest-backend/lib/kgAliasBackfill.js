// Pure decision logic for cli/backfill-kg-alias-normalization.js: given the
// current kg_entity_aliases rows, recompute normalized_alias from alias
// using the shared lib/kgNormalize.js normalizer and decide what to write.
//
// Two rows can recompute to the same (entity_id, alias_kind,
// normalized_alias) key even though their OLD normalized_alias values
// differed (that's the whole point of unifying the normalizer -- it merges
// distinctions the old simpler fold used to preserve). That collides with
// the unique(entity_id, normalized_alias, alias_kind) constraint, so one row
// per collision group must be deleted. The row with the highest
// review-status rank survives; ties are broken by id for determinism.
import { normalizeLocationName } from './kgNormalize.js';

const REVIEW_STATUS_RANK = { approved: 3, needs_review: 2, draft: 1, rejected: 0 };
const rankOf = (status) => REVIEW_STATUS_RANK[status] ?? -1;

const groupKey = (row, newNormalizedAlias) => [row.entity_id, row.alias_kind, newNormalizedAlias].join('');

/**
 * @param {Array<{id:string, entity_id:string, alias:string, normalized_alias:string, alias_kind:string, review_status:string}>} rows
 * @returns {{
 *   updates: Array<{id, entity_id, alias_kind, old_normalized_alias, new_normalized_alias}>,
 *   deletions: Array<{id, entity_id, alias_kind, alias, review_status, new_normalized_alias, kept_id}>,
 *   collisions: Array<{entity_id, alias_kind, normalized_alias, kept, deleted}>,
 *   unchanged_count: number,
 *   total_rows: number,
 * }}
 */
export const planNormalizationBackfill = (rows) => {
  const groups = new Map();
  for (const row of rows ?? []) {
    const newNormalizedAlias = normalizeLocationName(row.alias);
    const key = groupKey(row, newNormalizedAlias);
    const list = groups.get(key) ?? [];
    list.push({ ...row, new_normalized_alias: newNormalizedAlias });
    groups.set(key, list);
  }

  const updates = [];
  const deletions = [];
  const collisions = [];
  let unchangedCount = 0;

  for (const list of groups.values()) {
    // Deterministic order within a group regardless of input order: highest
    // review-status rank first, ties broken by id.
    const sorted = [...list].sort((a, b) => rankOf(b.review_status) - rankOf(a.review_status) || String(a.id).localeCompare(String(b.id)));
    const [kept, ...losers] = sorted;

    if (kept.new_normalized_alias === kept.normalized_alias) unchangedCount += 1;
    else updates.push({
      id: kept.id, entity_id: kept.entity_id, alias_kind: kept.alias_kind,
      old_normalized_alias: kept.normalized_alias, new_normalized_alias: kept.new_normalized_alias,
    });

    if (!losers.length) continue;

    for (const loser of losers) deletions.push({
      id: loser.id, entity_id: loser.entity_id, alias_kind: loser.alias_kind, alias: loser.alias,
      review_status: loser.review_status, new_normalized_alias: loser.new_normalized_alias, kept_id: kept.id,
    });
    collisions.push({
      entity_id: kept.entity_id, alias_kind: kept.alias_kind, normalized_alias: kept.new_normalized_alias,
      kept: { id: kept.id, alias: kept.alias, review_status: kept.review_status },
      deleted: losers.map((loser) => ({ id: loser.id, alias: loser.alias, review_status: loser.review_status })),
    });
  }

  return { updates, deletions, collisions, unchanged_count: unchangedCount, total_rows: (rows ?? []).length };
};
