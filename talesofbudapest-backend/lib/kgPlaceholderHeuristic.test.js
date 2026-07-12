import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderCandidate, placeholderTable } from './kgPlaceholderHeuristic.js';

test('accepts specific named entities', () => {
  assert.equal(isPlaceholderCandidate('Ede Horn', 'person'), true);
  assert.equal(isPlaceholderCandidate('OMIKE', 'organisation'), true);
  assert.equal(isPlaceholderCandidate('Emperor Francis I of Austria', 'person'), true);
});

test('rejects generic roles, categories, and clauses', () => {
  assert.equal(isPlaceholderCandidate('Jews', 'person'), false);
  assert.equal(isPlaceholderCandidate('architect', 'person'), false);
  assert.equal(isPlaceholderCandidate('Architect', 'person'), false);
  assert.equal(isPlaceholderCandidate('Minister of Interior', 'person'), false);
  assert.equal(isPlaceholderCandidate('Jewish community', 'organisation'), false);
  assert.equal(isPlaceholderCandidate("internment of Jews of 'unclear citizenship'", 'event'), false);
});

test('rejects bare role titles used alone', () => {
  for (const role of ['Emperor', 'King', 'Baron', 'Rabbi', 'Minister']) {
    assert.equal(isPlaceholderCandidate(role, 'person'), false, `${role} should be rejected alone`);
  }
});

test('rejects other known noise seen in this corpus', () => {
  assert.equal(isPlaceholderCandidate('Jewish community of Buda', 'organisation'), false);
  assert.equal(isPlaceholderCandidate('Jewish community of Pest', 'organisation'), false);
  assert.equal(isPlaceholderCandidate('Jewish community of Óbuda', 'organisation'), false);
  assert.equal(isPlaceholderCandidate('traditional Jewish life', 'event'), false);
  assert.equal(isPlaceholderCandidate('detention centers', 'location'), false);
  assert.equal(isPlaceholderCandidate('Jewish secondary school', 'location'), false);
});

test('rejects overly long clause-like text and empty/short/lowercase-leading text', () => {
  assert.equal(isPlaceholderCandidate('This is a very long descriptive clause about several unrelated things', 'event'), false);
  assert.equal(isPlaceholderCandidate('', 'person'), false);
  assert.equal(isPlaceholderCandidate('Ab', 'person'), false);
  assert.equal(isPlaceholderCandidate('lowercase start', 'person'), false);
  assert.equal(isPlaceholderCandidate(null, 'person'), false);
  assert.equal(isPlaceholderCandidate(undefined, 'person'), false);
});

test('placeholderTable maps kinds to staging tables and routes unknown to null', () => {
  assert.equal(placeholderTable('location'), 'kg_locations');
  assert.equal(placeholderTable('person'), 'kg_people');
  assert.equal(placeholderTable('event'), 'kg_events');
  assert.equal(placeholderTable('organisation'), 'kg_organisations');
  assert.equal(placeholderTable('unknown'), null);
  assert.equal(placeholderTable(undefined), null);
});
