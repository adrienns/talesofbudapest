import assert from 'node:assert/strict';
import test from 'node:test';
import { findConfidentLocationMatch, normalizePlaceName } from './locationCandidateResolver.js';

test('normalizes accents and punctuation for place matching', () => {
  assert.equal(normalizePlaceName('  Dohány Street—Synagogue '), 'dohany street synagogue');
});

test('matches a reviewed alias near the proposed custom stop', () => {
  const result = findConfidentLocationMatch(
    { name: 'Dohany Street Synagogue', lat: 47.4959, lng: 19.0607 },
    [{
      id: 'canonical', name: 'Great Synagogue', latitude: 47.49591, longitude: 19.06069,
      location_aliases: [{ alias: 'Dohány Street Synagogue' }],
    }],
  );
  assert.equal(result?.location.id, 'canonical');
  assert.equal(result?.reason, 'alias-and-spatial');
});

test('does not force an ambiguous spatial match', () => {
  const result = findConfidentLocationMatch(
    { name: 'A custom courtyard', lat: 47.5, lng: 19.06 },
    [
      { id: 'one', name: 'One', latitude: 47.50005, longitude: 19.06 },
      { id: 'two', name: 'Two', latitude: 47.49995, longitude: 19.06 },
    ],
  );
  assert.equal(result, null);
});
