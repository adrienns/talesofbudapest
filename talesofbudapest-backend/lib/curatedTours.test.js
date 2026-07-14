import assert from 'node:assert/strict';
import test from 'node:test';
import { CURATED_TOURS, findCuratedTour, validateCuratedTours } from '../content/curated/index.js';

test('curated flagship has matching, valid English and Hungarian manifests', () => {
  assert.equal(validateCuratedTours(), true);
  assert.equal(CURATED_TOURS.length, 2);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'en')?.stops.length, 9);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'hu')?.stops.length, 9);
});

test('curated locale lookup never falls back to another language', () => {
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'de'), null);
  assert.equal(findCuratedTour('missing', 'en'), null);
});

