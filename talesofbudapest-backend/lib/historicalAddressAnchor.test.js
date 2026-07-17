import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorBuildingMentions } from './historicalAddresses.js';
import { buildSubjectEntityIndex } from './historicalSubjectMemory.js';

test('same-named buildings at different addresses are different entities', () => {
  const mentions = [
    { mention_id: 'm1', page: 21, start_offset: 100, end_offset: 110, text: 'synagogue', normalized_text: 'synagogue', type: 'building' },
    { mention_id: 'm2', page: 21, start_offset: 200, end_offset: 210, text: 'synagogue', normalized_text: 'synagogue', type: 'building' },
  ];
  const addresses = [
    { page_ref: 21, start_offset: 112, end_offset: 135, modern_street: 'Táncsics Mihály utca', house_number: '26', center: { lat: 47.5, lon: 19.03 } },
    { page_ref: 21, start_offset: 212, end_offset: 235, modern_street: 'Táncsics Mihály utca', house_number: '23', center: { lat: 47.5, lon: 19.03 } },
  ];
  assert.equal(anchorBuildingMentions({ mentions, addresses }), 2);
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions });
  const ids = index.mentions.map((row) => row.subject_entity_id);
  assert.notEqual(ids[0], ids[1], 'synagogue at 26 must not equal synagogue at 23');
  const labels = [...index.entities.values()].map((entity) => entity.label).sort();
  assert.deepEqual(labels, ['synagogue (Táncsics Mihály utca 23)', 'synagogue (Táncsics Mihály utca 26)']);
  const withAddress = [...index.entities.values()].filter((entity) => entity.address?.house_number);
  assert.equal(withAddress.length, 2);
});

test('an unanchored building keeps its plain identity', () => {
  const mentions = [{ mention_id: 'm1', page: 21, start_offset: 100, end_offset: 110, text: 'synagogue', normalized_text: 'synagogue', type: 'building' }];
  assert.equal(anchorBuildingMentions({ mentions, addresses: [] }), 0);
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions });
  assert.equal([...index.entities.values()][0].label, 'synagogue');
});

test('a far-away address does not anchor', () => {
  const mentions = [{ mention_id: 'm1', page: 21, start_offset: 100, end_offset: 110, text: 'synagogue', normalized_text: 'synagogue', type: 'building' }];
  const addresses = [{ page_ref: 21, start_offset: 400, end_offset: 420, modern_street: 'Király utca', house_number: '77', center: null }];
  assert.equal(anchorBuildingMentions({ mentions, addresses }), 0);
});
