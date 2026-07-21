import assert from 'node:assert/strict';
import test from 'node:test';
import { displayReadingText } from './historicalDisplayText.js';

test('joins literal lowercase line-break hyphenation for display', () => {
  assert.equal(displayReadingText('Hun-\ngarian'), 'Hungarian');
  assert.equal(displayReadingText('transac- \ntions'), 'transactions');
});

test('does not erase ordinary hyphens or join an uppercase next line', () => {
  assert.equal(displayReadingText('mid-eighteenth century'), 'mid-eighteenth century');
  assert.equal(displayReadingText('Buda-\nPest'), 'Buda-\nPest');
});
