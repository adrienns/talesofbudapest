import assert from 'node:assert/strict';
import test from 'node:test';
import { CURATED_TOURS, findCuratedTour, validateCuratedTours } from '../content/curated/index.js';

test('curated manifests include the bilingual flagship and English Jewish Quarter tour', () => {
  assert.equal(validateCuratedTours(), true);
  assert.equal(CURATED_TOURS.length, 3);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'en')?.version, 2);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'hu')?.version, 2);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'en')?.stops.length, 9);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'hu')?.stops.length, 9);
  assert.equal(findCuratedTour('jewish-quarter-and-ruin-bars', 'en')?.version, 1);
  assert.equal(findCuratedTour('jewish-quarter-and-ruin-bars', 'en')?.stops.length, 9);
});

test('curated locale lookup never falls back to another language', () => {
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'de'), null);
  assert.equal(findCuratedTour('jewish-quarter-and-ruin-bars', 'hu'), null);
  assert.equal(findCuratedTour('missing', 'en'), null);
});
