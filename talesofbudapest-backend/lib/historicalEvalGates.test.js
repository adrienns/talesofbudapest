import assert from 'node:assert/strict';
import test from 'node:test';
import { heldoutContentFingerprint } from './historicalGoldFingerprint.js';
import { boxIoU, matchLayoutZones, referenceTargetKey } from './historicalEvalGates.js';

test('referenceTargetKey rejects empty targets and prefers entity id', () => {
  assert.equal(referenceTargetKey({}), null);
  assert.equal(referenceTargetKey({ resolved_entity_id: 'e1', antecedent_mention_id: 'm1' }), 'entity:e1');
  assert.equal(referenceTargetKey({ antecedent_mention_id: 'm1' }), 'mention:m1');
  assert.equal(referenceTargetKey({ antecedent_label: 'The House' }), 'label:the house');
});

test('matchLayoutZones requires page+zone+IoU and respects multiplicity', () => {
  const gold = [
    { page: 1, zone: 'footer', x_min: 0, y_min: 0, x_max: 10, y_max: 10 },
    { page: 1, zone: 'footer', x_min: 20, y_min: 0, x_max: 30, y_max: 10 },
  ];
  const predicted = [
    { page: 1, zone: 'footer', x_min: 0, y_min: 0, x_max: 10, y_max: 10 },
  ];
  const one = matchLayoutZones(gold, predicted);
  assert.equal(one.matched, 1);
  assert.equal(one.expected, 2);
  assert.equal(one.predicted, 1);
  // One arbitrary block must not satisfy both gold zones.
  assert.ok(boxIoU(gold[0], predicted[0]) >= 0.5);
  assert.ok(boxIoU(gold[1], predicted[0]) < 0.5);
});

test('matchLayoutZones requires gold text_sha256 when set', () => {
  const gold = [{ page: 1, zone: 'footer', x_min: 0, y_min: 0, x_max: 10, y_max: 10, text_sha256: 'abc' }];
  const omitHash = [{ page: 1, zone: 'footer', x_min: 0, y_min: 0, x_max: 10, y_max: 10 }];
  const wrongHash = [{ page: 1, zone: 'footer', x_min: 0, y_min: 0, x_max: 10, y_max: 10, text_sha256: 'zzz' }];
  const rightHash = [{ page: 1, zone: 'footer', x_min: 0, y_min: 0, x_max: 10, y_max: 10, text_sha256: 'abc' }];
  assert.equal(matchLayoutZones(gold, omitHash).matched, 0);
  assert.equal(matchLayoutZones(gold, wrongHash).matched, 0);
  assert.equal(matchLayoutZones(gold, rightHash).matched, 1);
});

test('heldout fingerprint binds split membership, antecedent_label, and gate fields', () => {
  const base = {
    annotation_status: 'complete',
    minimums: { total_items: 1, heldout_items: 1, heldout_pages: 1 },
    splits: { heldout: [10, 20] },
    items: [],
    clauses: [],
    references: [{ clause_id: 'c1', page: 10, surface: 'It', antecedent_label: 'School', gold_source: 'human' }],
    transitions: [],
    layout_zones: [],
    negative_items: [],
  };
  const a = heldoutContentFingerprint(base);
  const b = heldoutContentFingerprint({
    ...base,
    references: [{ ...base.references[0], antecedent_label: 'Other' }],
  });
  const c = heldoutContentFingerprint({
    ...base,
    splits: { heldout: [10, 30] },
  });
  const d = heldoutContentFingerprint({
    ...base,
    annotation_status: 'draft',
  });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});
