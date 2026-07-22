import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteSystemPrompt } from './narrativeRoutePlanner.js';

test('Hungarian route plans are authored in Hungarian from the first model call', () => {
  const prompt = buildRouteSystemPrompt(7, 'hu');

  assert.match(prompt, /Kizárólag természetes, idiomatikus magyarul/);
  assert.match(prompt, /Hangulatos magyar címet/);
  assert.match(prompt, /Pontosan 7 fejezet/);
  assert.doesNotMatch(prompt, /Plan a cohesive/);
});

test('English route plans retain the English planning brief', () => {
  const prompt = buildRouteSystemPrompt(4, 'en');

  assert.match(prompt, /Plan a cohesive 3-4 stop walking narrative/);
  assert.match(prompt, /Include exactly 4 chapters/);
});
