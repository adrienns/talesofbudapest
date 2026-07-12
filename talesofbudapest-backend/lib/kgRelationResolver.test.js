import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntityIndex, resolveEndpoint, resolveRelationFks } from './kgRelationResolver.js';

const entities = {
  locations: [{ id: 'loc-obuda', name_en: 'Óbuda', source_name_hu: 'Óbuda' }, { id: 'loc-liberty', name_en: 'Liberty Bridge', source_name_hu: 'Szabadság híd' }],
  people: [{ id: 'per-munz', canonical_name_en: 'Moshe Münz', source_name_hu: null }],
  events: [{ id: 'evt-conse', title_en: 'Consecration of the Óbuda synagogue' }],
  organisations: [{ id: 'org-omike', canonical_name_en: 'OMIKE', source_name_hu: null }],
};

test('exact normalized match across kinds', () => {
  const index = buildEntityIndex(entities);
  assert.deepEqual(resolveEndpoint('Óbuda', 'location', index), { kind: 'location', id: 'loc-obuda' });
  assert.deepEqual(resolveEndpoint('Moshe Münz', 'person', index), { kind: 'person', id: 'per-munz' });
});

test('Hungarian source name resolves to the English entity', () => {
  const index = buildEntityIndex(entities);
  assert.deepEqual(resolveEndpoint('Szabadság híd', 'location', index), { kind: 'location', id: 'loc-liberty' });
});

test('lexicon variant resolves (Szabadság -> Liberty)', () => {
  const index = buildEntityIndex(entities);
  // query is the English concept; entity is stored with the Hungarian source name
  assert.deepEqual(resolveEndpoint('Liberty Bridge', 'location', index), { kind: 'location', id: 'loc-liberty' });
});

test('unknown text stays null', () => {
  const index = buildEntityIndex(entities);
  assert.equal(resolveEndpoint('economic writer', 'unknown', index), null);
  assert.equal(resolveEndpoint('', 'person', index), null);
});

test('ambiguous name resolves to nothing', () => {
  const index = buildEntityIndex({ people: [{ id: 'a', canonical_name_en: 'John Smith' }, { id: 'b', canonical_name_en: 'John Smith' }], locations: [], events: [] });
  assert.equal(resolveEndpoint('John Smith', 'person', index), null);
});

test('resolveRelationFks fills only empty endpoints', () => {
  const index = buildEntityIndex(entities);
  const relation = {
    subject_text_en: 'Moshe Münz', subject_kind: 'person', subject_person_id: null, subject_location_id: null, subject_event_id: null,
    object_text_en: 'Óbuda', object_kind: 'location', object_person_id: null, object_location_id: null, object_event_id: null,
  };
  assert.deepEqual(resolveRelationFks(relation, index), { subject_person_id: 'per-munz', object_location_id: 'loc-obuda' });
});

test('organisation resolves and hasEndpoint honors the org FK', () => {
  const index = buildEntityIndex(entities);
  assert.deepEqual(resolveEndpoint('OMIKE', 'organisation', index), { kind: 'organisation', id: 'org-omike' });
  const relation = {
    subject_text_en: 'OMIKE', subject_kind: 'organisation', subject_person_id: null, subject_location_id: null, subject_event_id: null, subject_organisation_id: null,
    object_text_en: 'Óbuda', object_kind: 'location', object_person_id: null, object_location_id: null, object_event_id: null, object_organisation_id: null,
  };
  assert.deepEqual(resolveRelationFks(relation, index), { subject_organisation_id: 'org-omike', object_location_id: 'loc-obuda' });
});

test('already-resolved endpoint is left untouched', () => {
  const index = buildEntityIndex(entities);
  const relation = {
    subject_text_en: 'Moshe Münz', subject_kind: 'person', subject_person_id: 'existing', subject_location_id: null, subject_event_id: null,
    object_text_en: 'Óbuda', object_kind: 'location', object_person_id: null, object_location_id: null, object_event_id: null,
  };
  assert.deepEqual(resolveRelationFks(relation, index), { object_location_id: 'loc-obuda' });
});
