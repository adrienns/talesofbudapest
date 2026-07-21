import assert from 'node:assert/strict';
import test from 'node:test';
import {
  certificationForSources,
  isAdjudicatedSource,
  isHumanSource,
  isSolSource,
} from './historicalGoldProvenance.js';

test('provenance prefixes', () => {
  assert.equal(isHumanSource('human-browser'), true);
  assert.equal(isSolSource('sol-adjudication'), true);
  assert.equal(isAdjudicatedSource('draft-auto'), false);
  assert.equal(isAdjudicatedSource('sol-adjudication'), true);
});

test('certificationForSources detects mix', () => {
  assert.equal(certificationForSources(['sol-adjudication']), 'sol_silver');
  assert.equal(certificationForSources(['human']), 'human');
  assert.equal(certificationForSources(['human', 'sol-adjudication']), 'mixed');
  assert.equal(certificationForSources(['draft-auto']), null);
});
