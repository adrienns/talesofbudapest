import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSourceHighlights } from './sourceHighlights.js';

test('prefers dramatic mid-text event over construction opening', () => {
  const sourceMaterial = [
    'Built in 1894. Architect: Example Person.',
    'During the 1956 revolution, residents sheltered refugees in the basement for three weeks.',
    'The facade was restored in 2003.',
  ].join('\n\n');

  const highlights = rankSourceHighlights({ sourceMaterial, topicIds: ['shadows'] });

  assert.ok(highlights.length >= 1);
  assert.match(highlights[0].text, /1956|revolution|refugees/i);
});

test('includes chronicle facts with high scores', () => {
  const highlights = rankSourceHighlights({
    sourceMaterial: 'Built in 1900.',
    chronicle: {
      facts: [{ statement: 'Nobel laureate lived here in 1923.', importance: 4 }],
      events: [],
      people: [],
    },
  });

  assert.equal(highlights[0].text, 'Nobel laureate lived here in 1923.');
});
