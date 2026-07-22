import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRestrictedEntitiesInput } from './restrictedSpeakerInput.js';

test('explicit --input wins', () => {
  const result = resolveRestrictedEntitiesInput({
    source: 'budapest-joe-hajdu',
    extractionsDir: '/x',
    explicitInput: '/custom/in.jsonl',
    existsSync: () => false,
  });
  assert.equal(result.provenance, 'explicit_input');
  assert.equal(result.input, '/custom/in.jsonl');
});

test('prefers content.speakers.jsonl when present', () => {
  const result = resolveRestrictedEntitiesInput({
    source: 'budapest-joe-hajdu',
    extractionsDir: '/x',
    existsSync: (file) => file.endsWith('.entities.content.speakers.jsonl'),
  });
  assert.equal(result.provenance, 'content_speakers');
  assert.match(result.input, /speakers\.jsonl$/);
  assert.equal(result.warning, null);
});

test('missing speakers artifact hard-fails without explicit --input', () => {
  assert.throws(
    () => resolveRestrictedEntitiesInput({
      source: 'budapest-joe-hajdu',
      extractionsDir: '/x',
      existsSync: () => false,
    }),
    /Missing required speakers artifact/,
  );
});

test('legacy content path still requires explicit --input', () => {
  assert.throws(
    () => resolveRestrictedEntitiesInput({
      source: 'budapest-joe-hajdu',
      extractionsDir: '/x',
      existsSync: (file) => file.endsWith('.entities.content.jsonl'),
    }),
    /Missing required speakers artifact/,
  );
  const allowed = resolveRestrictedEntitiesInput({
    source: 'budapest-joe-hajdu',
    extractionsDir: '/x',
    explicitInput: '/x/budapest-joe-hajdu.entities.content.jsonl',
    existsSync: () => false,
  });
  assert.equal(allowed.provenance, 'explicit_input');
});
