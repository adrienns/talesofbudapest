import test from 'node:test';
import assert from 'node:assert/strict';
import { planNormalizationBackfill } from './kgAliasBackfill.js';

test('empty input plans nothing', () => {
  const plan = planNormalizationBackfill([]);
  assert.deepEqual(plan, { updates: [], deletions: [], collisions: [], unchanged_count: 0, total_rows: 0 });
});

test('a row whose normalized_alias already matches the shared normalizer is left unchanged', () => {
  const rows = [{ id: 'a1', entity_id: 'e1', alias: 'Dohany Street', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'approved' }];
  const plan = planNormalizationBackfill(rows);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.deletions, []);
  assert.equal(plan.unchanged_count, 1);
  assert.equal(plan.total_rows, 1);
});

test('a row whose old simple-fold normalized_alias differs from the shared normalizer is planned for update', () => {
  // Old kgPromotion.js normalizeAlias never canonicalized "utca" -> "street";
  // the shared normalizer does.
  const rows = [{ id: 'a1', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany utca', alias_kind: 'name', review_status: 'needs_review' }];
  const plan = planNormalizationBackfill(rows);
  assert.deepEqual(plan.updates, [{ id: 'a1', entity_id: 'e1', alias_kind: 'name', old_normalized_alias: 'dohany utca', new_normalized_alias: 'dohany street' }]);
  assert.deepEqual(plan.deletions, []);
  assert.equal(plan.unchanged_count, 0);
});

test('two rows for the same entity/alias_kind that collapse onto the same normalized_alias: higher review-status rank wins, loser is deleted', () => {
  const rows = [
    { id: 'a1', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany utca', alias_kind: 'name', review_status: 'draft' },
    { id: 'a2', entity_id: 'e1', alias: 'Dohany Street', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'approved' },
  ];
  const plan = planNormalizationBackfill(rows);
  assert.deepEqual(plan.updates, []); // the kept row (a2) already has the correct normalized_alias
  assert.equal(plan.deletions.length, 1);
  assert.equal(plan.deletions[0].id, 'a1');
  assert.equal(plan.deletions[0].kept_id, 'a2');
  assert.equal(plan.collisions.length, 1);
  assert.equal(plan.collisions[0].kept.id, 'a2');
  assert.deepEqual(plan.collisions[0].deleted.map((row) => row.id), ['a1']);
  assert.equal(plan.unchanged_count, 1);
});

test('review-status rank order is approved > needs_review > draft > rejected', () => {
  const pair = (statusA, statusB) => {
    const rows = [
      { id: 'lower', entity_id: 'e1', alias: 'X', normalized_alias: 'x', alias_kind: 'name', review_status: statusA },
      { id: 'higher', entity_id: 'e1', alias: 'x', normalized_alias: 'x', alias_kind: 'name', review_status: statusB },
    ];
    return planNormalizationBackfill(rows);
  };
  assert.equal(pair('draft', 'needs_review').collisions[0].kept.id, 'higher');
  assert.equal(pair('needs_review', 'approved').collisions[0].kept.id, 'higher');
  assert.equal(pair('rejected', 'draft').collisions[0].kept.id, 'higher');
  assert.equal(pair('rejected', 'approved').collisions[0].kept.id, 'higher');
});

test('a collision where the winner also needs its normalized_alias updated produces both an update and a deletion', () => {
  const rows = [
    { id: 'a1', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany utca', alias_kind: 'name', review_status: 'approved' },
    { id: 'a2', entity_id: 'e1', alias: 'Dohany utca', normalized_alias: 'dohany utca lowercase-variant', alias_kind: 'name', review_status: 'draft' },
  ];
  const plan = planNormalizationBackfill(rows);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, 'a1');
  assert.equal(plan.updates[0].new_normalized_alias, 'dohany street');
  assert.equal(plan.deletions.length, 1);
  assert.equal(plan.deletions[0].id, 'a2');
});

test('ties in review-status rank are broken deterministically by id', () => {
  const rows = [
    { id: 'zzz', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany utca', alias_kind: 'name', review_status: 'approved' },
    { id: 'aaa', entity_id: 'e1', alias: 'Dohany Street', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'approved' },
  ];
  const plan = planNormalizationBackfill(rows);
  assert.equal(plan.collisions[0].kept.id, 'aaa', 'lower id wins the tie, and the result is stable regardless of input order');
  const reversed = planNormalizationBackfill([...rows].reverse());
  assert.equal(reversed.collisions[0].kept.id, 'aaa');
});

test('different entity_id or alias_kind never collapses rows even with the same alias text', () => {
  const rows = [
    { id: 'a1', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'approved' },
    { id: 'a2', entity_id: 'e2', alias: 'Dohány utca', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'approved' },
    { id: 'a3', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany street', alias_kind: 'address', review_status: 'approved' },
  ];
  const plan = planNormalizationBackfill(rows);
  assert.deepEqual(plan.deletions, []);
  assert.deepEqual(plan.collisions, []);
  assert.equal(plan.unchanged_count, 3);
});

test('a three-way collision keeps exactly one winner and deletes the other two', () => {
  const rows = [
    { id: 'a1', entity_id: 'e1', alias: 'Dohány utca', normalized_alias: 'dohany utca', alias_kind: 'name', review_status: 'draft' },
    { id: 'a2', entity_id: 'e1', alias: 'Dohany Street', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'rejected' },
    { id: 'a3', entity_id: 'e1', alias: 'DOHANY STREET', normalized_alias: 'dohany street', alias_kind: 'name', review_status: 'needs_review' },
  ];
  const plan = planNormalizationBackfill(rows);
  assert.equal(plan.collisions.length, 1);
  assert.equal(plan.collisions[0].kept.id, 'a3');
  assert.deepEqual(plan.collisions[0].deleted.map((row) => row.id).sort(), ['a1', 'a2']);
  assert.equal(plan.deletions.length, 2);
});
