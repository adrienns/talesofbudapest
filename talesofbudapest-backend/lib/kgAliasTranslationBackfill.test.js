import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectBackfillTargets, buildTranslationPrompt, parseTranslationResponse,
  planTranslationAliasRows, crossEntityCollisions,
} from './kgAliasTranslationBackfill.js';

// --- selectBackfillTargets --------------------------------------------------

test('selects an entity missing a Hungarian name alias', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const aliasesByEntityId = new Map([
    ['e1', [{ alias_kind: 'name', language_code: 'en', review_status: 'approved' }]],
  ]);
  const targets = selectBackfillTargets(entities, aliasesByEntityId);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].missing, ['hu']);
});

test('selects an entity missing an English name alias', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Lánchíd' }];
  const aliasesByEntityId = new Map([
    ['e1', [{ alias_kind: 'name', language_code: 'hu', review_status: 'approved' }]],
  ]);
  const targets = selectBackfillTargets(entities, aliasesByEntityId);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].missing, ['en']);
});

test('an entity with both hu and en coverage is skipped entirely', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const aliasesByEntityId = new Map([
    ['e1', [
      { alias_kind: 'name', language_code: 'en', review_status: 'approved' },
      { alias_kind: 'translated_name', language_code: 'hu', review_status: 'approved' },
    ]],
  ]);
  assert.deepEqual(selectBackfillTargets(entities, aliasesByEntityId), []);
});

test('an entity carrying any wikidata-sourced alias is skipped, even if hu/en coverage is missing', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const aliasesByEntityId = new Map([
    ['e1', [{ alias_kind: 'identifier', language_code: null, review_status: 'needs_review', source: 'wikidata' }]],
  ]);
  assert.deepEqual(selectBackfillTargets(entities, aliasesByEntityId), []);
});

test('a null language_code alias never counts as hu or en coverage', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const aliasesByEntityId = new Map([
    ['e1', [{ alias_kind: 'name', language_code: null, review_status: 'approved' }]],
  ]);
  const targets = selectBackfillTargets(entities, aliasesByEntityId);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].missing, ['hu', 'en']);
});

test('a non-approved alias in a covering language does not count as coverage', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const aliasesByEntityId = new Map([
    ['e1', [{ alias_kind: 'name', language_code: 'hu', review_status: 'needs_review' }]],
  ]);
  const targets = selectBackfillTargets(entities, aliasesByEntityId);
  assert.deepEqual(targets[0].missing, ['hu', 'en']);
});

test('address and identifier alias kinds never establish coverage', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const aliasesByEntityId = new Map([
    ['e1', [
      { alias_kind: 'address', language_code: 'hu', review_status: 'approved' },
      { alias_kind: 'identifier', language_code: 'en', review_status: 'approved' },
    ]],
  ]);
  const targets = selectBackfillTargets(entities, aliasesByEntityId);
  assert.deepEqual(targets[0].missing, ['hu', 'en']);
});

test('non-location entity kinds are excluded by default (kinds option defaults to location only)', () => {
  const entities = [{ id: 'p1', entity_kind: 'person', canonical_name_en: 'Liszt Ferenc' }];
  assert.deepEqual(selectBackfillTargets(entities, new Map()), []);
});

test('kinds option opts a person entity into selection', () => {
  const entities = [{ id: 'p1', entity_kind: 'person', canonical_name_en: 'Liszt Ferenc' }];
  const targets = selectBackfillTargets(entities, new Map(), { kinds: ['person'] });
  assert.equal(targets.length, 1);
});

test('accepts a plain object in place of a Map for aliasesByEntityId', () => {
  const entities = [{ id: 'e1', entity_kind: 'location', canonical_name_en: 'Chain Bridge' }];
  const targets = selectBackfillTargets(entities, { e1: [{ alias_kind: 'name', language_code: 'en', review_status: 'approved' }] });
  assert.deepEqual(targets[0].missing, ['hu']);
});

// --- buildTranslationPrompt -------------------------------------------------

test('buildTranslationPrompt returns a system+user message pair with the batch embedded as JSON', () => {
  const messages = buildTranslationPrompt([{ canonical_name_en: 'Chain Bridge', kind_hint: 'location' }]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /JSON only/);
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /Chain Bridge/);
  const embedded = JSON.parse(messages[1].content.replace(/^Landmarks:\n/, ''));
  assert.deepEqual(embedded, [{ canonical_name_en: 'Chain Bridge', kind_hint: 'location' }]);
});

test('buildTranslationPrompt defaults a missing kind_hint to location', () => {
  const messages = buildTranslationPrompt([{ canonical_name_en: 'Chain Bridge' }]);
  const embedded = JSON.parse(messages[1].content.replace(/^Landmarks:\n/, ''));
  assert.equal(embedded[0].kind_hint, 'location');
});

// --- parseTranslationResponse ------------------------------------------------

test('parses a well-formed response aligned to the batch by name', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }, { canonical_name_en: 'Fisherman\'s Bastion' }];
  const content = JSON.stringify({
    results: [
      { name: 'Fisherman\'s Bastion', hu: ['Halászbástya'], en: [], de: [], historical: [] },
      { name: 'Chain Bridge', hu: ['Lánchíd'], en: [], de: ['Kettenbrücke'], historical: ['Széchenyi Chain Bridge'] },
    ],
  });
  const parsed = parseTranslationResponse(content, batch);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].canonical_name_en, 'Chain Bridge');
  assert.deepEqual(parsed[0].hu, ['Lánchíd']);
  assert.deepEqual(parsed[0].de, ['Kettenbrücke']);
  assert.deepEqual(parsed[0].historical, ['Széchenyi Chain Bridge']);
  assert.equal(parsed[1].canonical_name_en, 'Fisherman\'s Bastion');
  assert.deepEqual(parsed[1].hu, ['Halászbástya']);
});

test('throws a clear error on unparseable JSON content', () => {
  assert.throws(() => parseTranslationResponse('not json{{', [{ canonical_name_en: 'Chain Bridge' }]),
    /Failed to parse translation response as JSON/);
});

test('throws a clear error when the results array is missing', () => {
  assert.throws(() => parseTranslationResponse(JSON.stringify({ foo: 'bar' }), [{ canonical_name_en: 'Chain Bridge' }]),
    /missing a "results" array/);
});

test('a batch entry with no matching result name gets all-empty arrays instead of throwing', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }, { canonical_name_en: 'Buda Castle' }];
  const content = JSON.stringify({ results: [{ name: 'Chain Bridge', hu: ['Lánchíd'] }] });
  const parsed = parseTranslationResponse(content, batch);
  assert.deepEqual(parsed[1], { canonical_name_en: 'Buda Castle', hu: [], en: [], de: [], historical: [] });
});

test('tolerates missing language keys and extra unexpected keys on a result item', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }];
  const content = JSON.stringify({ results: [{ name: 'Chain Bridge', hu: ['Lánchíd'], commentary: 'a fine bridge' }] });
  const parsed = parseTranslationResponse(content, batch);
  assert.deepEqual(parsed[0].en, []);
  assert.deepEqual(parsed[0].de, []);
  assert.deepEqual(parsed[0].historical, []);
  assert.deepEqual(parsed[0].hu, ['Lánchíd']);
});

test('drops junk values: too short, too long, bare numbers, and values equal to the input name', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }];
  const content = JSON.stringify({
    results: [{
      name: 'Chain Bridge',
      hu: ['X', '42', 'Chain Bridge', 'a'.repeat(121), 'Lánchíd'],
      en: [], de: [], historical: [],
    }],
  });
  const parsed = parseTranslationResponse(content, batch);
  assert.deepEqual(parsed[0].hu, ['Lánchíd']);
});

test('drops non-string values and dedupes within a language array', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }];
  const content = JSON.stringify({
    results: [{ name: 'Chain Bridge', hu: ['Lánchíd', 'Lánchíd', 42, null, 'lanchid'], en: [], de: [], historical: [] }],
  });
  const parsed = parseTranslationResponse(content, batch);
  // 'Lánchíd' and 'lanchid' normalize to the same value -- only the first survives.
  assert.deepEqual(parsed[0].hu, ['Lánchíd']);
});

test('caps a language array at 4 entries even if the model returns more', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }];
  const content = JSON.stringify({
    results: [{ name: 'Chain Bridge', hu: ['A', 'BB', 'CC', 'DD', 'EE', 'FF'], en: [], de: [], historical: [] }],
  });
  const parsed = parseTranslationResponse(content, batch);
  assert.equal(parsed[0].hu.length, 4);
});

test('accepts an already-parsed object as content, not just a JSON string', () => {
  const batch = [{ canonical_name_en: 'Chain Bridge' }];
  const parsed = parseTranslationResponse({ results: [{ name: 'Chain Bridge', hu: ['Lánchíd'] }] }, batch);
  assert.deepEqual(parsed[0].hu, ['Lánchíd']);
});

// --- planTranslationAliasRows ------------------------------------------------

test('plans translated_name rows for hu/en/de and a former_name row for historical', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd'], en: [], de: ['Kettenbrücke'], historical: ['Old Bridge'] };
  const rows = planTranslationAliasRows(entity, suggestion, new Map());
  assert.equal(rows.length, 3);
  const hu = rows.find((r) => r.language_code === 'hu');
  assert.equal(hu.alias_kind, 'translated_name');
  assert.equal(hu.alias, 'Lánchíd');
  const de = rows.find((r) => r.language_code === 'de');
  assert.equal(de.alias_kind, 'translated_name');
  const historical = rows.find((r) => r.alias_kind === 'former_name');
  assert.equal(historical.alias, 'Old Bridge');
  assert.equal(historical.language_code, null);
});

test('every planned row is born needs_review with source llm_translation, regardless of language or kind', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd'], en: ['Chain of the Danube'], de: ['Kettenbrücke'], historical: ['Old Bridge'] };
  const rows = planTranslationAliasRows(entity, suggestion, new Map());
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.review_status, 'needs_review');
    assert.equal(row.source, 'llm_translation');
  }
});

test('a historical name identical (once normalized) to a suggested hu/en/de name inherits that language code', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd'], en: [], de: [], historical: ['lanchid'] };
  const rows = planTranslationAliasRows(entity, suggestion, new Map());
  // 'lanchid' normalizes the same as 'Lánchíd' but is a different alias_kind
  // (former_name vs translated_name), so it is not deduped away -- it is
  // planned as its own row, and inherits the 'hu' language code from the
  // matching hu suggestion rather than staying null.
  const former = rows.find((r) => r.alias_kind === 'former_name');
  assert.ok(former, 'expected a former_name row to be planned');
  assert.equal(former.language_code, 'hu');
});

test('dedups against an existing alias for the entity by (normalized_alias, alias_kind)', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd'], en: [], de: [], historical: [] };
  const existing = new Map([
    ['e1', [{ normalized_alias: 'lanchid', alias_kind: 'translated_name' }]],
  ]);
  const rows = planTranslationAliasRows(entity, suggestion, existing);
  assert.deepEqual(rows, []);
});

test('a suggestion whose normalized form matches an existing alias of a DIFFERENT kind is still planned (kind is part of the dedup key)', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd'], en: [], de: [], historical: [] };
  const existing = new Map([
    ['e1', [{ normalized_alias: 'lanchid', alias_kind: 'address' }]],
  ]);
  const rows = planTranslationAliasRows(entity, suggestion, existing);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].alias_kind, 'translated_name');
});

test('two suggested names that normalize to the same (kind, normalized_alias) are only planned once', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd', 'lanchid'], en: [], de: [], historical: [] };
  const rows = planTranslationAliasRows(entity, suggestion, new Map());
  assert.equal(rows.length, 1);
});

test('row ids are stable and match kgPromotion.js\'s alias id scheme', async () => {
  const { stableUuid } = await import('./kgPromotion.js');
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  const suggestion = { hu: ['Lánchíd'], en: [], de: [], historical: [] };
  const rows = planTranslationAliasRows(entity, suggestion, new Map());
  assert.equal(rows[0].id, stableUuid('alias', 'e1', 'translated_name', 'lanchid'));
});

test('an empty or missing suggestion plans nothing', () => {
  const entity = { id: 'e1', canonical_name_en: 'Chain Bridge' };
  assert.deepEqual(planTranslationAliasRows(entity, {}, new Map()), []);
  assert.deepEqual(planTranslationAliasRows(entity, undefined, new Map()), []);
});

// --- crossEntityCollisions ---------------------------------------------------

test('reports no collisions when planned rows touch disjoint normalized aliases', () => {
  const planned = [
    { entity_id: 'e1', normalized_alias: 'lanchid' },
    { entity_id: 'e2', normalized_alias: 'halaszbastya' },
  ];
  assert.deepEqual(crossEntityCollisions(planned, new Map()), []);
});

test('reports a collision when two planned rows for different entities share a normalized alias', () => {
  const planned = [
    { entity_id: 'e1', normalized_alias: 'citadella' },
    { entity_id: 'e2', normalized_alias: 'citadella' },
  ];
  const collisions = crossEntityCollisions(planned, new Map());
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].normalized_alias, 'citadella');
  assert.deepEqual(collisions[0].entity_ids, ['e1', 'e2']);
});

test('reports a collision when a planned row matches an alias already owned by another entity', () => {
  const planned = [{ entity_id: 'e2', normalized_alias: 'citadella' }];
  const aliasOwnership = new Map([['citadella', new Set(['e1'])]]);
  const collisions = crossEntityCollisions(planned, aliasOwnership);
  assert.equal(collisions.length, 1);
  assert.deepEqual(collisions[0].entity_ids, ['e1', 'e2']);
});

test('two planned rows for the SAME entity sharing a normalized alias is not a collision', () => {
  const planned = [
    { entity_id: 'e1', normalized_alias: 'citadella' },
    { entity_id: 'e1', normalized_alias: 'citadella' },
  ];
  assert.deepEqual(crossEntityCollisions(planned, new Map()), []);
});

test('never mutates the aliasOwnership map passed in', () => {
  const aliasOwnership = new Map([['citadella', new Set(['e1'])]]);
  crossEntityCollisions([{ entity_id: 'e2', normalized_alias: 'citadella' }], aliasOwnership);
  assert.deepEqual([...aliasOwnership.get('citadella')], ['e1']);
});

test('accepts a plain object for aliasOwnership', () => {
  const planned = [{ entity_id: 'e2', normalized_alias: 'citadella' }];
  const collisions = crossEntityCollisions(planned, { citadella: new Set(['e1']) });
  assert.equal(collisions.length, 1);
});
