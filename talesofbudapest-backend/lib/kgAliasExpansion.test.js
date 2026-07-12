import test from 'node:test';
import assert from 'node:assert/strict';
import { planLexiconExpansion } from './kgAliasExpansion.js';

test('derives a translated_name alias from an approved name alias via the lexicon', () => {
  const entities = [{ id: 'e1', entity_kind: 'location' }];
  const aliases = [{ entity_id: 'e1', alias: 'Erzsébet híd', normalized_alias: 'erzsebet bridge', alias_kind: 'name', review_status: 'approved' }];
  const planned = planLexiconExpansion(entities, aliases);
  const row = planned.find((r) => r.normalized_alias === 'elisabeth bridge');
  assert.ok(row, 'expected an elisabeth bridge row');
  assert.equal(row.entity_id, 'e1');
  assert.equal(row.alias, 'elisabeth bridge');
  assert.equal(row.alias_kind, 'translated_name');
  assert.equal(row.review_status, 'approved');
  assert.equal(row.source, 'lexicon');
  assert.equal(row.language_code, null);
});

test('never proposes a variant identical to its own seed alias', () => {
  const entities = [{ id: 'e1', entity_kind: 'location' }];
  const aliases = [{ entity_id: 'e1', alias: 'Buda Castle', normalized_alias: 'buda castle', alias_kind: 'name', review_status: 'approved' }];
  const planned = planLexiconExpansion(entities, aliases);
  assert.ok(!planned.some((r) => r.normalized_alias === 'buda castle'));
});

test('skips a variant that duplicates any existing alias for the entity, regardless of that alias\'s kind', () => {
  const entities = [{ id: 'e1', entity_kind: 'location' }];
  const aliases = [
    { entity_id: 'e1', alias: 'Erzsébet híd', normalized_alias: 'erzsebet bridge', alias_kind: 'name', review_status: 'approved' },
    // Already present as a *different* kind -- must still block the duplicate.
    { entity_id: 'e1', alias: 'Elisabeth Bridge', normalized_alias: 'elisabeth bridge', alias_kind: 'former_name', review_status: 'approved' },
  ];
  const planned = planLexiconExpansion(entities, aliases);
  assert.ok(!planned.some((r) => r.normalized_alias === 'elisabeth bridge'));
});

test('only approved name-kind aliases seed expansion -- draft and non-name aliases are ignored', () => {
  const entities = [{ id: 'e1', entity_kind: 'location' }];
  const aliases = [
    { entity_id: 'e1', alias: 'Margit híd', normalized_alias: 'margit bridge', alias_kind: 'name', review_status: 'draft' },
    { entity_id: 'e1', alias: 'Margit híd', normalized_alias: 'margit bridge', alias_kind: 'address', review_status: 'approved' },
  ];
  const planned = planLexiconExpansion(entities, aliases);
  assert.deepEqual(planned, []);
});

test('two seed aliases that expand to the same variant only emit it once', () => {
  const entities = [{ id: 'e1', entity_kind: 'location' }];
  const aliases = [
    { entity_id: 'e1', alias: 'Ferencz József híd', normalized_alias: 'ferencz jozsef bridge', alias_kind: 'name', review_status: 'approved' },
    { entity_id: 'e1', alias: 'Liberty Bridge', normalized_alias: 'liberty bridge', alias_kind: 'name', review_status: 'approved' },
  ];
  const planned = planLexiconExpansion(entities, aliases);
  const libertyRows = planned.filter((r) => r.normalized_alias === 'liberty bridge');
  assert.equal(libertyRows.length, 0, 'liberty bridge is already a seed alias, not a new proposal');
  const ferenczRows = planned.filter((r) => r.normalized_alias === 'ferencz jozsef bridge');
  assert.equal(ferenczRows.length, 0, 'ferencz jozsef bridge is already a seed alias, not a new proposal');
});

test('aliases belonging to other entities never leak into this entity\'s plan', () => {
  const entities = [{ id: 'e1', entity_kind: 'location' }, { id: 'e2', entity_kind: 'location' }];
  const aliases = [
    { entity_id: 'e1', alias: 'Erzsébet híd', normalized_alias: 'erzsebet bridge', alias_kind: 'name', review_status: 'approved' },
    { entity_id: 'e2', alias: 'Margit híd', normalized_alias: 'margit bridge', alias_kind: 'name', review_status: 'approved' },
  ];
  const planned = planLexiconExpansion(entities, aliases);
  assert.ok(planned.every((r) => r.entity_id === 'e1' || r.entity_id === 'e2'));
  assert.ok(planned.some((r) => r.entity_id === 'e1' && r.normalized_alias === 'elisabeth bridge'));
  assert.ok(planned.some((r) => r.entity_id === 'e2' && r.normalized_alias === 'margaret bridge'));
});

test('person entity_kind reaches the order-swap variants too', () => {
  const entities = [{ id: 'p1', entity_kind: 'person' }];
  const aliases = [{ entity_id: 'p1', alias: 'Liszt Ferenc', normalized_alias: 'liszt ferenc', alias_kind: 'name', review_status: 'approved' }];
  const planned = planLexiconExpansion(entities, aliases);
  assert.ok(planned.some((r) => r.normalized_alias === 'ferenc liszt'));
});

test('empty inputs plan nothing', () => {
  assert.deepEqual(planLexiconExpansion([], []), []);
  assert.deepEqual(planLexiconExpansion([{ id: 'e1' }], []), []);
});
