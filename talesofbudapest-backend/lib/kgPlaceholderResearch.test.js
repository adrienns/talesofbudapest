import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResearchPrompt, parseResearchResponse, planResearchUpdate,
  CONFIRM_CONFIDENCE_THRESHOLD, ALLOWED_KINDS,
} from './kgPlaceholderResearch.js';

// --- buildResearchPrompt ----------------------------------------------------

test('buildResearchPrompt returns a system + user message pair', () => {
  const messages = buildResearchPrompt([{ name: 'Ede Horn', kind: 'person' }]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
});

test('the system prompt contains the JSON results schema', () => {
  const [system] = buildResearchPrompt([{ name: 'OMIKE', kind: 'organisation' }]);
  assert.match(system.content, /"results"/);
  assert.match(system.content, /"is_real_entity"/);
  assert.match(system.content, /"summary_en"/);
  assert.match(system.content, /"confidence"/);
  assert.match(system.content, /"reject_reason"/);
});

test('the user message contains every batch entity name', () => {
  const [, user] = buildResearchPrompt([
    { name: 'Ede Horn', kind: 'person' },
    { name: 'OMIKE', kind: 'organisation' },
  ]);
  assert.match(user.content, /Ede Horn/);
  assert.match(user.content, /OMIKE/);
});

test('an unrecognized kind hint is normalized to unknown in the prompt payload', () => {
  const [, user] = buildResearchPrompt([{ name: 'Mystery Thing', kind: 'not-a-real-kind' }]);
  const parsed = JSON.parse(user.content.replace(/^Entities:\n/, ''));
  assert.equal(parsed[0].kind, 'unknown');
});

test('a missing kind hint defaults to unknown', () => {
  const [, user] = buildResearchPrompt([{ name: 'Mystery Thing' }]);
  const parsed = JSON.parse(user.content.replace(/^Entities:\n/, ''));
  assert.equal(parsed[0].kind, 'unknown');
});

// --- parseResearchResponse --------------------------------------------------

test('parses a well-formed response aligned to the batch', () => {
  const batch = [{ name: 'Ede Horn', kind: 'person' }];
  const content = JSON.stringify({
    results: [{
      name: 'Ede Horn', is_real_entity: true, kind: 'person',
      summary_en: 'A 19th-century Hungarian-Jewish writer and journalist.', confidence: 0.8, reject_reason: '',
    }],
  });
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.name, 'Ede Horn');
  assert.equal(result.is_real_entity, true);
  assert.equal(result.kind, 'person');
  assert.equal(result.confidence, 0.8);
  assert.equal(result.reject_reason, '');
  assert.match(result.summary_en, /writer/);
});

test('accepts an already-parsed object as well as a JSON string', () => {
  const batch = [{ name: 'OMIKE', kind: 'organisation' }];
  const content = { results: [{ name: 'OMIKE', is_real_entity: true, kind: 'organisation', summary_en: 'x', confidence: 0.9, reject_reason: '' }] };
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.name, 'OMIKE');
});

test('malformed JSON throws a clear error', () => {
  assert.throws(() => parseResearchResponse('not json{{{', [{ name: 'x' }]), /Failed to parse research response as JSON/);
});

test('JSON missing a results array throws a clear error', () => {
  assert.throws(() => parseResearchResponse(JSON.stringify({ foo: 'bar' }), [{ name: 'x' }]), /missing a "results" array/);
});

test('a raw result entry with no usable name is dropped as junk', () => {
  const batch = [{ name: 'Ede Horn' }];
  const content = JSON.stringify({
    results: [
      { is_real_entity: true, kind: 'person', summary_en: 'no name field', confidence: 0.9 }, // dropped: no name
      { name: 42, is_real_entity: true }, // dropped: name not a string
      { name: 'Ede Horn', is_real_entity: true, kind: 'person', summary_en: 'ok', confidence: 0.7, reject_reason: '' },
    ],
  });
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.is_real_entity, true);
  assert.equal(result.summary_en, 'ok');
});

test('results are matched back to the batch by normalized name, tolerant of reordering', () => {
  const batch = [{ name: 'Ede Horn' }, { name: 'OMIKE' }];
  const content = JSON.stringify({
    results: [
      { name: 'OMIKE', is_real_entity: true, kind: 'organisation', summary_en: 'org summary', confidence: 0.6, reject_reason: '' },
      { name: 'Ede Horn', is_real_entity: true, kind: 'person', summary_en: 'person summary', confidence: 0.9, reject_reason: '' },
    ],
  });
  const [first, second] = parseResearchResponse(content, batch);
  assert.equal(first.name, 'Ede Horn');
  assert.equal(first.summary_en, 'person summary');
  assert.equal(second.name, 'OMIKE');
  assert.equal(second.summary_en, 'org summary');
});

test('name matching tolerates diacritic/case differences via normalizeLocationName', () => {
  const batch = [{ name: 'Ignác Goldziher' }];
  const content = JSON.stringify({
    results: [{ name: 'ignac goldziher', is_real_entity: true, kind: 'person', summary_en: 'scholar', confidence: 0.85, reject_reason: '' }],
  });
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.summary_en, 'scholar');
});

test('a batch entry with no matching result gets a synthetic not-found result rather than being dropped', () => {
  const batch = [{ name: 'Ede Horn' }, { name: 'Nobody Returned' }];
  const content = JSON.stringify({
    results: [{ name: 'Ede Horn', is_real_entity: true, kind: 'person', summary_en: 'x', confidence: 0.9, reject_reason: '' }],
  });
  const results = parseResearchResponse(content, batch);
  assert.equal(results.length, 2);
  assert.equal(results[1].name, 'Nobody Returned');
  assert.equal(results[1].is_real_entity, false);
  assert.equal(results[1].confidence, 0);
  assert.match(results[1].reject_reason, /no research result returned/);
});

test('an extra unmatched result in the response is simply ignored', () => {
  const batch = [{ name: 'Ede Horn' }];
  const content = JSON.stringify({
    results: [
      { name: 'Ede Horn', is_real_entity: true, kind: 'person', summary_en: 'x', confidence: 0.9, reject_reason: '' },
      { name: 'Someone Else Entirely', is_real_entity: true, kind: 'person', summary_en: 'y', confidence: 0.9, reject_reason: '' },
    ],
  });
  const results = parseResearchResponse(content, batch);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Ede Horn');
});

test('an unrecognized kind coerces to unknown', () => {
  const batch = [{ name: 'X' }];
  const content = JSON.stringify({ results: [{ name: 'X', is_real_entity: true, kind: 'spaceship', summary_en: 'x', confidence: 0.5, reject_reason: '' }] });
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.kind, 'unknown');
});

for (const kind of ALLOWED_KINDS) {
  test(`allowed kind "${kind}" passes through unchanged`, () => {
    const batch = [{ name: 'X' }];
    const content = JSON.stringify({ results: [{ name: 'X', is_real_entity: true, kind, summary_en: 'x', confidence: 0.5, reject_reason: '' }] });
    const [result] = parseResearchResponse(content, batch);
    assert.equal(result.kind, kind);
  });
}

test('confidence is clamped to [0, 1] and non-numeric confidence becomes 0', () => {
  const batch = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  const content = JSON.stringify({
    results: [
      { name: 'A', is_real_entity: true, kind: 'person', summary_en: 'x', confidence: 5, reject_reason: '' },
      { name: 'B', is_real_entity: true, kind: 'person', summary_en: 'x', confidence: -3, reject_reason: '' },
      { name: 'C', is_real_entity: true, kind: 'person', summary_en: 'x', confidence: 'high', reject_reason: '' },
    ],
  });
  const [a, b, c] = parseResearchResponse(content, batch);
  assert.equal(a.confidence, 1);
  assert.equal(b.confidence, 0);
  assert.equal(c.confidence, 0);
});

test('is_real_entity:false always yields a non-empty reject_reason, defaulting when the model omits one', () => {
  const batch = [{ name: 'the committee' }];
  const content = JSON.stringify({ results: [{ name: 'the committee', is_real_entity: false, kind: 'unknown', summary_en: '', confidence: 0.9 }] });
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.is_real_entity, false);
  assert.match(result.reject_reason, /not a real researchable entity/);
});

test('is_real_entity:false ignores any summary_en the model supplied', () => {
  const batch = [{ name: 'the rabbi' }];
  const content = JSON.stringify({ results: [{ name: 'the rabbi', is_real_entity: false, kind: 'unknown', summary_en: 'should be dropped', confidence: 0.9, reject_reason: 'generic role' }] });
  const [result] = parseResearchResponse(content, batch);
  assert.equal(result.summary_en, '');
  assert.equal(result.reject_reason, 'generic role');
});

// --- planResearchUpdate -----------------------------------------------------

test('a confirmed real entity above the confidence threshold patches metadata only, leaving resolution_status untouched', () => {
  const entity = { metadata: { origin: 'relation_endpoint', needs_research: true } };
  const result = { is_real_entity: true, kind: 'person', summary_en: 'A journalist.', confidence: 0.8, reject_reason: '' };
  const patch = planResearchUpdate(entity, result);
  assert.deepEqual(patch, {
    metadata: {
      origin: 'relation_endpoint',
      needs_research: false,
      researched: true,
      research_summary: 'A journalist.',
      research_kind: 'person',
      research_confidence: 0.8,
    },
  });
  assert.equal('resolution_status' in patch, false);
});

test('confirmation requires confidence exactly at the threshold to pass', () => {
  const entity = { metadata: {} };
  const result = { is_real_entity: true, kind: 'location', summary_en: 'x', confidence: CONFIRM_CONFIDENCE_THRESHOLD, reject_reason: '' };
  const patch = planResearchUpdate(entity, result);
  assert.equal(patch.metadata.researched, true);
  assert.equal('resolution_status' in patch, false);
});

test('a not-real entity is rejected with the model reject_reason preserved', () => {
  const entity = { metadata: { origin: 'relation_endpoint', needs_research: true } };
  const result = { is_real_entity: false, kind: 'unknown', summary_en: '', confidence: 0.1, reject_reason: 'generic role, not a named entity' };
  const patch = planResearchUpdate(entity, result);
  assert.deepEqual(patch, {
    resolution_status: 'rejected',
    metadata: {
      origin: 'relation_endpoint',
      needs_research: false,
      researched: true,
      research_reject_reason: 'generic role, not a named entity',
    },
  });
});

test('confidence gating: a real entity below the threshold is rejected, not confirmed', () => {
  const entity = { metadata: {} };
  const result = { is_real_entity: true, kind: 'person', summary_en: 'maybe someone', confidence: 0.2, reject_reason: '' };
  const patch = planResearchUpdate(entity, result);
  assert.equal(patch.resolution_status, 'rejected');
  assert.equal(patch.metadata.researched, true);
  assert.match(patch.metadata.research_reject_reason, /confidence below threshold/);
  assert.equal('research_summary' in patch.metadata, false);
});

test('planResearchUpdate never sets a publication_status or review_status field', () => {
  for (const result of [
    { is_real_entity: true, kind: 'person', summary_en: 'x', confidence: 0.9, reject_reason: '' },
    { is_real_entity: false, kind: 'unknown', summary_en: '', confidence: 0, reject_reason: 'no evidence' },
  ]) {
    const patch = planResearchUpdate({ metadata: {} }, result);
    assert.equal('publication_status' in patch, false);
    assert.equal('publication_status' in patch.metadata, false);
    assert.equal('review_status' in patch, false);
    assert.equal('review_status' in patch.metadata, false);
  }
});

test('planResearchUpdate preserves unrelated existing metadata keys', () => {
  const entity = { metadata: { origin: 'relation_endpoint', auto_created: true, needs_research: true, some_other_key: 42 } };
  const patch = planResearchUpdate(entity, { is_real_entity: true, kind: 'organisation', summary_en: 'x', confidence: 0.9, reject_reason: '' });
  assert.equal(patch.metadata.origin, 'relation_endpoint');
  assert.equal(patch.metadata.auto_created, true);
  assert.equal(patch.metadata.some_other_key, 42);
});

test('planResearchUpdate handles an entity with no metadata at all', () => {
  const patch = planResearchUpdate({}, { is_real_entity: false, kind: 'unknown', summary_en: '', confidence: 0, reject_reason: 'no evidence found' });
  assert.equal(patch.metadata.needs_research, false);
  assert.equal(patch.metadata.researched, true);
});
