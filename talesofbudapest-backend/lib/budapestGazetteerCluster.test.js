import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterCenters, normalizeStreetKey } from '../cli/build-budapest-gazetteer.js';

test('ways of one street collapse into a single centre', () => {
  const clusters = clusterCenters([
    { lat: 47.5033, lon: 19.0345 },
    { lat: 47.5039, lon: 19.0351 },
    { lat: 47.5028, lon: 19.0339 },
  ]);
  assert.equal(clusters.length, 1);
  assert.ok(Math.abs(clusters[0].lat - 47.5033) < 0.002);
  assert.equal(clusters[0].way_count, 3);
});

test('a name reused across districts yields several clusters, never an average', () => {
  // Castle district vs a far south-east street of the same name.
  const clusters = clusterCenters([
    { lat: 47.5033, lon: 19.0345 },
    { lat: 47.5036, lon: 19.0349 },
    { lat: 47.4459, lon: 19.1195 },
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].way_count, 2, 'largest cluster comes first');
  const averaged = { lat: 47.4843, lon: 19.063 };
  assert.ok(clusters.every((cluster) => Math.abs(cluster.lat - averaged.lat) > 0.01), 'no cluster sits at the meaningless average');
});

test('street key folds diacritics', () => {
  assert.equal(normalizeStreetKey('Táncsics Mihály utca'), 'tancsics mihaly utca');
});
