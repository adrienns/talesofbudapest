import test from 'node:test';
import assert from 'node:assert/strict';
import { planWikidataAliasLinks } from './kgWikidataAnchor.js';
import { normalizeLocationName } from './kgNormalize.js';

const entityMap = (...entities) => new Map(entities.map((entity) => [entity.public_location_id, entity]));
const emptyAliases = new Map();

test('both arms (exact label + <=50m distance) -> approved', () => {
  const landmarks = [{ id: 'loc-a', name: 'Buda Castle', latitude: 47.4961, longitude: 19.0398 }];
  const entities = entityMap({ id: 'entity-a', public_location_id: 'loc-a', metadata: {} });
  const records = [{
    externalId: 'Q1', sourceUrl: 'http://www.wikidata.org/entity/Q1', name: 'Buda Castle',
    labels: { hu: null, en: 'Buda Castle', de: null }, altLabels: [],
    coordinates: { lat: 47.4961, lng: 19.0398 },
  }];
  const { aliasRows, entityPatches, summary } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.matched_approved, 1);
  assert.equal(summary.matched_review, 0);
  assert.ok(aliasRows.length > 0);
  assert.ok(aliasRows.every((row) => row.review_status === 'approved' && row.source === 'wikidata' && row.entity_id === 'entity-a'));
  assert.equal(entityPatches.length, 1);
  assert.equal(entityPatches[0].entity_id, 'entity-a');
  assert.equal(entityPatches[0].metadata.wikidata_id, 'Q1');
  assert.equal(entityPatches[0].metadata.wikidata_anchor.decided, 'approved');
  assert.equal(entityPatches[0].metadata.wikidata_anchor.matched_via, 'exact_and_distance');
  assert.equal(entityPatches[0].metadata.wikidata_anchor.distance_m, 0);
});

test('exact label match only (candidate far away) -> needs_review', () => {
  const landmarks = [{ id: 'loc-a', name: 'Buda Castle', latitude: 47.4961, longitude: 19.0398 }];
  const entities = entityMap({ id: 'entity-a', public_location_id: 'loc-a', metadata: {} });
  const records = [{
    externalId: 'Q2', name: 'Buda Castle',
    labels: { hu: null, en: 'Buda Castle', de: null }, altLabels: [],
    coordinates: { lat: 47.5061, lng: 19.0398 }, // ~1.1km away, well past the 50m arm
  }];
  const { summary, entityPatches } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.matched_approved, 0);
  assert.equal(summary.matched_review, 1);
  assert.equal(entityPatches[0].metadata.wikidata_anchor.decided, 'needs_review');
  assert.equal(entityPatches[0].metadata.wikidata_anchor.matched_via, 'exact_alias');
});

test('<=50m distance only (no name match) -> needs_review', () => {
  const landmarks = [{ id: 'loc-b', name: 'Distinct Landmark Name', latitude: 47.51, longitude: 19.045 }];
  const entities = entityMap({ id: 'entity-b', public_location_id: 'loc-b', metadata: {} });
  const records = [{
    externalId: 'Q3', name: 'Something Completely Different',
    labels: { hu: null, en: 'Something Completely Different', de: null }, altLabels: [],
    coordinates: { lat: 47.51, lng: 19.045 }, // identical coords, 0m
  }];
  const { summary, entityPatches } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.matched_approved, 0);
  assert.equal(summary.matched_review, 1);
  assert.equal(entityPatches[0].metadata.wikidata_anchor.decided, 'needs_review');
  assert.equal(entityPatches[0].metadata.wikidata_anchor.matched_via, 'distance');
});

test('neither arm satisfied -> skipped, no rows planned', () => {
  const landmarks = [{ id: 'loc-c', name: 'Unrelated Place', latitude: 47.55, longitude: 19.10 }];
  const entities = entityMap({ id: 'entity-c', public_location_id: 'loc-c', metadata: {} });
  const records = [{
    externalId: 'Q4', name: 'Nothing Similar At All',
    labels: { hu: null, en: 'Nothing Similar At All', de: null }, altLabels: [],
    coordinates: { lat: 47.40, lng: 18.90 }, // far away, no name overlap
  }];
  const { aliasRows, entityPatches, summary } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.skipped_no_match, 1);
  assert.equal(summary.matched_approved, 0);
  assert.equal(summary.matched_review, 0);
  assert.equal(aliasRows.length, 0);
  assert.equal(entityPatches.length, 0);
});

test('ambiguous exact match (two landmarks share the label) -> downgraded to needs_review', () => {
  const landmarks = [
    { id: 'loc-d', name: 'Central Market', latitude: 47.4869, longitude: 19.0576 },
    { id: 'loc-e', name: 'Central Market', latitude: 47.4887, longitude: 19.0576 }, // ~200m away
  ];
  const entities = entityMap(
    { id: 'entity-d', public_location_id: 'loc-d', metadata: {} },
    { id: 'entity-e', public_location_id: 'loc-e', metadata: {} },
  );
  const records = [{
    externalId: 'Q5', name: 'Central Market',
    labels: { hu: null, en: 'Central Market', de: null }, altLabels: [],
    coordinates: { lat: 47.4869, lng: 19.0576 }, // exact loc-d coords -> loc-d ranks best
  }];
  const { summary, entityPatches } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.ambiguous_downgraded, 1);
  assert.equal(summary.matched_approved, 0);
  assert.equal(summary.matched_review, 1);
  assert.equal(entityPatches.length, 1);
  assert.equal(entityPatches[0].entity_id, 'entity-d');
  assert.equal(entityPatches[0].metadata.wikidata_anchor.decided, 'needs_review');
});

test('old-shape record (no labels/altLabels field) still anchors via name', () => {
  const landmarks = [{ id: 'loc-f', name: 'Ferdinánd híd', latitude: 47.51361084, longitude: 19.06222153 }];
  const entities = entityMap({ id: 'entity-f', public_location_id: 'loc-f', metadata: {} });
  const records = [{
    source: 'wikidata', externalId: 'Q1000411', sourceUrl: 'http://www.wikidata.org/entity/Q1000411',
    name: 'Ferdinánd híd', description: 'bridge in Budapest, Hungary',
    coordinates: { lng: 19.06222153, lat: 47.51361084 },
    imageFilename: null, inceptionYear: null, modifiedAt: '2025-03-12T23:20:49Z',
    license: { identifier: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', evidenceUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing' },
    retrievedAt: '2026-07-10T07:44:30.192Z',
    // deliberately no `labels` / `altLabels` fields
  }];
  const { aliasRows, summary } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.matched_approved, 1);
  const nameRow = aliasRows.find((row) => row.alias_kind === 'name');
  assert.ok(nameRow, 'expected a name alias row derived from the old-shape `name` field');
  assert.equal(nameRow.normalized_alias, normalizeLocationName('Ferdinánd híd'));
  assert.equal(nameRow.language_code, null);
});

test('junk altLabels (bare Q-id, length <=1) are dropped, valid ones kept', () => {
  const landmarks = [{ id: 'loc-g', name: 'Test Landmark', latitude: 47.50, longitude: 19.05 }];
  const entities = entityMap({ id: 'entity-g', public_location_id: 'loc-g', metadata: {} });
  const records = [{
    externalId: 'Q700', name: 'Test Landmark',
    labels: { hu: null, en: 'Test Landmark', de: null },
    altLabels: [
      { lang: 'en', value: 'Q700' }, // junk: bare Q-id
      { lang: 'de', value: 'X' }, // junk: length <= 1
      { lang: 'hu', value: 'Valid Alt Name' },
    ],
    coordinates: { lat: 47.50, lng: 19.05 },
  }];
  const { aliasRows, summary } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.junk_dropped, 2);
  assert.ok(!aliasRows.some((row) => row.alias === 'Q700' || row.alias === 'X'));
  const validAlt = aliasRows.find((row) => row.alias_kind === 'translated_name');
  assert.ok(validAlt, 'expected the valid altLabel to survive the junk filter');
  assert.equal(validAlt.normalized_alias, normalizeLocationName('Valid Alt Name'));
});

test('landmark with no canonical entity is skipped (skipped_no_entity)', () => {
  const landmarks = [{ id: 'loc-h', name: 'Ghost Landmark', latitude: 47.52, longitude: 19.02 }];
  const entities = new Map(); // no entity for loc-h
  const records = [{
    externalId: 'Q8', name: 'Ghost Landmark',
    labels: { hu: null, en: 'Ghost Landmark', de: null }, altLabels: [],
    coordinates: { lat: 47.52, lng: 19.02 },
  }];
  const { aliasRows, entityPatches, summary } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  assert.equal(summary.skipped_no_entity, 1);
  assert.equal(summary.matched_approved, 0);
  assert.equal(summary.matched_review, 0);
  assert.equal(aliasRows.length, 0);
  assert.equal(entityPatches.length, 0);
});

test('dedup against an existing alias reuses its id instead of minting a new one', () => {
  const landmarks = [{ id: 'loc-a', name: 'Buda Castle', latitude: 47.4961, longitude: 19.0398 }];
  const entities = entityMap({ id: 'entity-a', public_location_id: 'loc-a', metadata: {} });
  const existingAliases = new Map([[
    'entity-a',
    [{ id: 'existing-uuid-123', entity_id: 'entity-a', normalized_alias: normalizeLocationName('Buda Castle'), alias_kind: 'name', language_code: 'en', review_status: 'approved' }],
  ]]);
  const records = [{
    externalId: 'Q1', name: 'Buda Castle',
    labels: { hu: null, en: 'Buda Castle', de: null }, altLabels: [],
    coordinates: { lat: 47.4961, lng: 19.0398 },
  }];
  const { aliasRows } = planWikidataAliasLinks(records, landmarks, entities, existingAliases);
  const nameRow = aliasRows.find((row) => row.alias_kind === 'name' && row.normalized_alias === normalizeLocationName('Buda Castle'));
  assert.ok(nameRow);
  assert.equal(nameRow.id, 'existing-uuid-123');
});

test('a Wikidata Q-id is always planned as an identifier alias, lowercase-normalized as-is', () => {
  const landmarks = [{ id: 'loc-a', name: 'Buda Castle', latitude: 47.4961, longitude: 19.0398 }];
  const entities = entityMap({ id: 'entity-a', public_location_id: 'loc-a', metadata: {} });
  const records = [{
    externalId: 'Q42', name: 'Buda Castle',
    labels: { hu: null, en: 'Buda Castle', de: null }, altLabels: [],
    coordinates: { lat: 47.4961, lng: 19.0398 },
  }];
  const { aliasRows } = planWikidataAliasLinks(records, landmarks, entities, emptyAliases);
  const idRow = aliasRows.find((row) => row.alias_kind === 'identifier');
  assert.ok(idRow);
  assert.equal(idRow.alias, 'wikidata:Q42');
  assert.equal(idRow.normalized_alias, 'wikidata:q42');
  assert.equal(idRow.language_code, null);
});
