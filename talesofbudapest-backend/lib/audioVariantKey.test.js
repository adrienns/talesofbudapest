import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicKey } from './audioVariantKey.js';

test('buildTopicKey sorts and joins topic ids', () => {
  assert.equal(buildTopicKey(['liquid', 'shadows']), 'liquid,shadows');
  assert.equal(buildTopicKey([]), 'default');
});
