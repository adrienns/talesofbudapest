import assert from 'node:assert/strict';
import test from 'node:test';
import { planPublicLocationAliases, planPublicLocationEntities } from './kgPublicLocationSeeder.js';

test('public location entity seeding is private, draft, and idempotent', () => {
  const locations = [{ id: 'l1', name: 'Dohány Street Synagogue', latitude: 47.4959, longitude: 19.0606, landmark_type: 'synagogue' }];
  const planned = planPublicLocationEntities(locations, []);
  assert.equal(planned.length, 1); assert.equal(planned[0].publication_status, 'private'); assert.equal(planned[0].review_status, 'draft');
  assert.deepEqual(planPublicLocationEntities(locations, [{ id: 'e1', public_location_id: 'l1' }]), []);
});

test('public location alias is normalized and not duplicated', () => {
  const locations = [{ id: 'l1', name: 'Dohány Street Synagogue' }];
  const entities = [{ id: 'e1', public_location_id: 'l1' }];
  const planned = planPublicLocationAliases(locations, entities, []);
  assert.equal(planned[0].normalized_alias, 'dohany street synagogue'); assert.equal(planned[0].review_status, 'approved');
  assert.deepEqual(planPublicLocationAliases(locations, entities, [{ entity_id: 'e1', normalized_alias: planned[0].normalized_alias, alias_kind: 'name' }]), []);
});

test('a hu location_translations row becomes an approved hu-language alias', () => {
  // "Budai Vár" is a deliberately chosen hu name that normalizes to a
  // DIFFERENT string than "Buda Castle" -- unlike, say, "Dohány utcai
  // zsinagóga" vs "Dohány Street Synagogue", which normalize identically
  // once type-words are canonicalized (see lib/kgNormalize.js) and would
  // therefore collapse into a single deduped alias, not two.
  const locations = [{ id: 'l1', name: 'Buda Castle' }];
  const entities = [{ id: 'e1', public_location_id: 'l1' }];
  const translations = [{ location_id: 'l1', locale: 'hu', name: 'Budai Vár' }];
  const planned = planPublicLocationAliases(locations, entities, [], translations);
  assert.equal(planned.length, 2, 'the base en name plus the hu translation');
  const hu = planned.find((row) => row.language_code === 'hu');
  assert.ok(hu, 'hu translation row was planned');
  assert.equal(hu.normalized_alias, 'budai var');
  assert.equal(hu.alias_kind, 'name');
  assert.equal(hu.review_status, 'approved');
  assert.equal(hu.alias, 'Budai Vár');
});

test('an en location_translations row identical to locations.name is not double-written', () => {
  const locations = [{ id: 'l1', name: 'Dohány Street Synagogue' }];
  const entities = [{ id: 'e1', public_location_id: 'l1' }];
  const translations = [{ location_id: 'l1', locale: 'en', name: 'Dohány Street Synagogue' }];
  const planned = planPublicLocationAliases(locations, entities, [], translations);
  assert.equal(planned.length, 1, 'the duplicate en translation must not produce a second row');
});

test('an en location_translations row that differs from locations.name is still planned', () => {
  const locations = [{ id: 'l1', name: 'Dohány Street Synagogue' }];
  const entities = [{ id: 'e1', public_location_id: 'l1' }];
  const translations = [{ location_id: 'l1', locale: 'en', name: 'The Great Synagogue' }];
  const planned = planPublicLocationAliases(locations, entities, [], translations);
  assert.equal(planned.length, 2);
  const differing = planned.find((row) => row.normalized_alias === 'great synagogue');
  assert.ok(differing);
  assert.equal(differing.language_code, 'en');
});

test('re-running with the previously planned aliases already existing plans nothing new', () => {
  const locations = [{ id: 'l1', name: 'Dohány Street Synagogue' }];
  const entities = [{ id: 'e1', public_location_id: 'l1' }];
  const translations = [{ location_id: 'l1', locale: 'hu', name: 'Dohány utcai zsinagóga' }];
  const firstRun = planPublicLocationAliases(locations, entities, [], translations);
  const existingAliases = firstRun.map((row) => ({ entity_id: row.entity_id, normalized_alias: row.normalized_alias, alias_kind: row.alias_kind }));
  assert.deepEqual(planPublicLocationAliases(locations, entities, existingAliases, translations), []);
});

