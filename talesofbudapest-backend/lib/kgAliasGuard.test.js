import test from 'node:test';
import assert from 'node:assert/strict';
import { suppressAmbiguousExactMatches } from './kgAliasGuard.js';

const exactResult = (candidate, autoMatch = true) => ({
  candidate, score: 0.95, autoMatch, deterministic: true, autoLinkEligible: true,
  signals: { exactName: true, nameSimilarity: 1, kindMatch: true, addressSimilarity: 0, distanceMeters: null, vectorSimilarity: 0, districtAgreement: null, districtConflict: false, streetNumberMatch: false },
});

const nonExactResult = (candidate) => ({
  candidate, score: 0.5, autoMatch: false, deterministic: false, autoLinkEligible: false,
  signals: { exactName: false, nameSimilarity: 0.4, kindMatch: null, addressSimilarity: 0, distanceMeters: null, vectorSimilarity: 0, districtAgreement: null, districtConflict: false, streetNumberMatch: false },
});

test('a candidate whose alias is owned by only itself passes through unchanged', () => {
  const candidate = { id: 'loc-1', name: 'Citadella', aliases: [] };
  const results = [exactResult(candidate)];
  const aliasOwnership = new Map([['citadella', new Set(['loc-1'])]]);
  const filtered = suppressAmbiguousExactMatches(results, aliasOwnership);
  assert.deepEqual(filtered, results);
  assert.equal(filtered[0].autoMatch, true);
  assert.equal(filtered[0].reason, undefined);
});

test('a candidate whose alias is owned by more than one candidate id is suppressed', () => {
  const candidate = { id: 'loc-1', name: 'Citadella', aliases: [] };
  const results = [exactResult(candidate)];
  const aliasOwnership = new Map([['citadella', new Set(['loc-1', 'loc-2'])]]);
  const filtered = suppressAmbiguousExactMatches(results, aliasOwnership);
  assert.equal(filtered[0].autoMatch, false);
  assert.equal(filtered[0].reason, 'ambiguous_exact_alias');
  assert.equal(filtered[0].score, 0.95, 'score is preserved so the result still lands in the review tier');
  assert.equal(filtered[0].candidate, candidate, 'candidate reference is untouched');
});

test('a non-exact result is never touched even when its aliases are ambiguous', () => {
  const candidate = { id: 'loc-1', name: 'Citadella', aliases: [] };
  const results = [nonExactResult(candidate)];
  const aliasOwnership = new Map([['citadella', new Set(['loc-1', 'loc-2'])]]);
  const filtered = suppressAmbiguousExactMatches(results, aliasOwnership);
  assert.deepEqual(filtered, results);
  assert.equal(filtered[0].reason, undefined);
});

test('an empty ownership map is a no-op regardless of exactName', () => {
  const candidate = { id: 'loc-1', name: 'Citadella', aliases: ['Citadel'] };
  const results = [exactResult(candidate)];
  const filtered = suppressAmbiguousExactMatches(results, new Map());
  assert.deepEqual(filtered, results);
  assert.equal(filtered[0].autoMatch, true);
});

test('ambiguity is detected via a stored alias, not just the primary name', () => {
  const candidate = { id: 'loc-1', name: 'Citadella', aliases: ['Fellegvar'] };
  const results = [exactResult(candidate)];
  const aliasOwnership = new Map([
    ['citadella', new Set(['loc-1'])],
    ['fellegvar', new Set(['loc-1', 'loc-2'])],
  ]);
  const filtered = suppressAmbiguousExactMatches(results, aliasOwnership);
  assert.equal(filtered[0].autoMatch, false);
  assert.equal(filtered[0].reason, 'ambiguous_exact_alias');
});

test('multiple results in the same list are filtered independently', () => {
  const unique = { id: 'loc-1', name: 'Vajdahunyad Castle', aliases: [] };
  const shared = { id: 'loc-2', name: 'Citadella', aliases: [] };
  const results = [exactResult(unique), exactResult(shared)];
  const aliasOwnership = new Map([
    ['vajdahunyad castle', new Set(['loc-1'])],
    ['citadella', new Set(['loc-2', 'loc-3'])],
  ]);
  const filtered = suppressAmbiguousExactMatches(results, aliasOwnership);
  assert.equal(filtered[0].autoMatch, true);
  assert.equal(filtered[0].reason, undefined);
  assert.equal(filtered[1].autoMatch, false);
  assert.equal(filtered[1].reason, 'ambiguous_exact_alias');
});

test('null/undefined rankedResults and aliasOwnership degrade gracefully', () => {
  assert.deepEqual(suppressAmbiguousExactMatches(null, null), []);
  assert.deepEqual(suppressAmbiguousExactMatches(undefined, undefined), []);
  assert.deepEqual(suppressAmbiguousExactMatches([], new Map()), []);
});
