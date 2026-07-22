import assert from 'node:assert/strict';
import test from 'node:test';
import { CURATED_TOURS, findCuratedTour, validateCuratedTours } from '../content/curated/index.js';

test('curated manifests include the bilingual flagship and two English specialist tours', () => {
  assert.equal(validateCuratedTours(), true);
  assert.equal(CURATED_TOURS.length, 4);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'en')?.version, 2);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'hu')?.version, 2);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'en')?.stops.length, 9);
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'hu')?.stops.length, 9);
  assert.equal(findCuratedTour('jewish-quarter-and-ruin-bars', 'en')?.version, 1);
  assert.equal(findCuratedTour('jewish-quarter-and-ruin-bars', 'en')?.stops.length, 9);
  assert.equal(findCuratedTour('communism-cold-war-history', 'en')?.version, 1);
  assert.equal(findCuratedTour('communism-cold-war-history', 'en')?.stops.length, 9);
  const coldWarTour = findCuratedTour('communism-cold-war-history', 'en');
  assert.ok(coldWarTour?.stops.every((stop) => stop.audioDirection));
  assert.equal(coldWarTour?.audioDesign.musicAsset.license, 'CC0-1.0');
  assert.equal(coldWarTour?.audioDesign.musicAsset.title, 'First Light Particles');
  assert.deepEqual(
    coldWarTour?.stops.filter((stop) => stop.audioDirection.music.enabled).map((stop) => stop.key),
    ['oktogon', 'liberty-square', 'astoria'],
  );
});

test('curated locale lookup never falls back to another language', () => {
  assert.equal(findCuratedTour('how-budapest-became-budapest', 'de'), null);
  assert.equal(findCuratedTour('jewish-quarter-and-ruin-bars', 'hu'), null);
  assert.equal(findCuratedTour('communism-cold-war-history', 'hu'), null);
  assert.equal(findCuratedTour('missing', 'en'), null);
});
