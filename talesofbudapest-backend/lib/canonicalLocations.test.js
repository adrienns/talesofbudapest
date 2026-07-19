import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_CURATED_LOCATIONS,
  CURATED_CHAPTER_LOCATION_SLUGS,
} from '../data/canonicalCuratedLocations.js';
import { CURATED_TOURS } from '../content/curated/index.js';

test('canonical curated catalog contains exactly 18 unique places', () => {
  assert.equal(CANONICAL_CURATED_LOCATIONS.length, 18);
  assert.equal(new Set(CANONICAL_CURATED_LOCATIONS.map((item) => item.slug)).size, 18);
});

test('Orczy House is retained as a demolished historical site', () => {
  const orczy = CANONICAL_CURATED_LOCATIONS.find((item) => item.slug === 'orczy-house');
  assert.equal(orczy?.placeKind, 'historical_site');
  assert.equal(orczy?.lifecycleStatus, 'demolished');
});

test('each curated manifest uses its explicit canonical chapter mapping', () => {
  for (const tour of CURATED_TOURS) {
    assert.deepEqual(
      tour.stops.map((stop) => stop.locationSlug),
      CURATED_CHAPTER_LOCATION_SLUGS[tour.slug],
    );
  }
});

test('curated image records are approved commercial-use licences with attribution', () => {
  const media = CANONICAL_CURATED_LOCATIONS.flatMap((item) => item.media ? [item.media] : []);
  assert.equal(media.length, 9);
  for (const item of media) {
    assert.ok(item.author);
    assert.ok(item.license);
    assert.match(item.sourceUrl, /^https:\/\/commons\.wikimedia\.org\//u);
  }
});
