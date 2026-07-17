import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNarrativePrompt, curatedNarrativeRequest } from './tourStyles.js';

test('buildNarrativePrompt owns questionnaire wording and ignores unknown topics', () => {
  const prompt = buildNarrativePrompt({
    styleId: 'deep-dive',
    topicIds: ['power-history', 'not-a-topic'],
    timeBudgetMinutes: 120,
    intent: '  include 1956  ',
  });

  assert.equal(
    prompt,
    'Create a richly detailed, historian-grade Budapest audio walking tour exploring kings, politics, revolutions, and the forces that shaped Budapest, sized for about 2 hours of walking and listening. The visitor also requested: include 1956.',
  );
});

test('curated requests stay server-only and are selected by opaque slug', () => {
  const request = curatedNarrativeRequest('castle-royal');
  assert.equal(request?.styleId, 'storyteller');
  assert.match(request?.prompt ?? '', /Buda Castle District/);
  assert.equal(curatedNarrativeRequest('not-a-tour'), null);
});
