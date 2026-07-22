import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlacesIndexDocument } from './budapestPlacesGazetteer.js';
import {
  BLOCKED_PLACE_CONFUSIONS,
  canonicalizeLocationText,
  CORPUS_PLACE_CONFUSION,
  isLocationLikeMention,
  repairKnownOcrInText,
} from './hungarianOcrGazetteer.js';
import {
  buildSubjectEntityIndex,
  clearPlaceRepairLog,
  getPlaceRepairLog,
  setPlacesGazetteerIndex,
} from './historicalSubjectMemory.js';

const fixtureIndex = buildPlacesIndexDocument({
  streets: [
    { modern: 'Dohány utca', key: 'dohany utca', center: { lat: 47.4959, lon: 19.0606, precision: 'street' }, historical: [] },
    { modern: 'Király utca', key: 'kiraly utca', center: { lat: 47.5, lon: 19.06, precision: 'street' }, historical: [] },
    { modern: 'Wesselényi utca', key: 'wesselenyi utca', historical: [] },
    { modern: 'Meddőhányó utca', key: 'meddohanyo utca', historical: [] },
    { modern: 'Dohnányi Ernő utca', key: 'dohnanyi erno utca', historical: [] },
  ],
  landmarks: [
    {
      id: 'lm:dohany-synagogue',
      name: 'Dohány Street Synagogue',
      key: 'dohany street synagogue',
      aliases: ['Dohány utcai zsinagóga', 'Great Synagogue'],
    },
  ],
  addresses: [],
  sources: [{ name: 'fixture' }],
});

test('Dohány / Dohany / Dohdny fold to the same location identity', () => {
  setPlacesGazetteerIndex(fixtureIndex);
  clearPlaceRepairLog();
  const mentions = [
    { mention_id: 'm1', page: 21, start_offset: 10, end_offset: 21, text: 'Dohány utca', normalized_text: 'Dohány utca', type: 'place' },
    { mention_id: 'm2', page: 22, start_offset: 10, end_offset: 21, text: 'Dohany utca', normalized_text: 'Dohany utca', type: 'place' },
    { mention_id: 'm3', page: 23, start_offset: 10, end_offset: 21, text: 'Dohdny utca', normalized_text: 'Dohdny utca', type: 'place' },
    { mention_id: 'm4', page: 24, start_offset: 10, end_offset: 22, text: 'Dohdany utca', normalized_text: 'Dohdany utca', type: 'place' },
  ];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions });
  const ids = index.mentions.map((row) => row.subject_entity_id);
  assert.equal(new Set(ids).size, 1, 'all Dohány OCR variants must share one entity id');
  const entity = [...index.entities.values()][0];
  assert.match(entity.label, /Dohány utca/u);
  assert.ok(entity.aliases.has('Dohdny utca'), 'damaged surface stays searchable');
  assert.ok(getPlaceRepairLog().some((row) => row.repaired && /dohdny/i.test(row.surface ?? row.from)));
  setPlacesGazetteerIndex(null);
});

test('confusion repair fails closed when multiple gazetteer tokens are equally close', () => {
  const ambiguous = buildPlacesIndexDocument({
    streets: [
      { modern: 'Alpha utca', key: 'alpha utca' },
      { modern: 'Alphi utca', key: 'alphi utca' },
    ],
  });
  // "Alpxx" is distance 2 from both alpha and alphi — must not repair.
  const result = canonicalizeLocationText('Alpxx utca', ambiguous);
  assert.equal(result.identity_key, 'alpxx utca');
  assert.equal(result.repairs.filter((row) => row.matched_via === 'confusion_unique_hit').length, 0);
});

test('person names are not location-like for street gazetteer repair', () => {
  assert.equal(isLocationLikeMention({ type: 'person', text: 'Dohdny' }), false);
  assert.equal(isLocationLikeMention({ type: 'place', text: 'Dohdny utca' }), true);
});

test('unrelated streets do not merge via Dohány confusion', () => {
  setPlacesGazetteerIndex(fixtureIndex);
  const mentions = [
    { mention_id: 'm1', page: 1, start_offset: 1, end_offset: 12, text: 'Dohány utca', normalized_text: 'Dohány utca', type: 'place' },
    { mention_id: 'm2', page: 1, start_offset: 20, end_offset: 32, text: 'Király utca', normalized_text: 'Király utca', type: 'place' },
    { mention_id: 'm3', page: 1, start_offset: 40, end_offset: 56, text: 'Wesselényi utca', normalized_text: 'Wesselényi utca', type: 'place' },
  ];
  const index = buildSubjectEntityIndex({ sourceId: 'book', mentions });
  assert.equal(new Set(index.mentions.map((row) => row.subject_entity_id)).size, 3);
  setPlacesGazetteerIndex(null);
});

test('canonicalizeLocationText repairs dohdny against unique street token', () => {
  const result = canonicalizeLocationText('Dohdny utca', fixtureIndex);
  assert.equal(result.identity_key, 'dohany utca');
  assert.match(result.text, /Dohány utca/u);
  assert.ok(result.repairs.some((row) => row.matched_via === 'confusion_unique_hit'));
});

test('repairKnownOcrInText polishes Dohdny / Kirdly in place-like prose', () => {
  const street = repairKnownOcrInText('Dohdny utca', fixtureIndex);
  assert.match(street.text, /Dohány utca/u);

  const quote = repairKnownOcrInText(
    'the Moorish synagogue on Dohdny Street was crowded',
    fixtureIndex,
  );
  assert.match(quote.text, /Dohány Street/u);
  assert.ok(quote.repairs.some((row) => row.from === 'dohdny'));

  const kiraly = repairKnownOcrInText('shops along Kirdly utca', fixtureIndex);
  assert.match(kiraly.text, /Király utca/u);
});

test('repairKnownOcrInText does not turn Ernő Dohnányi into Dohány', () => {
  assert.ok(BLOCKED_PLACE_CONFUSIONS.has('dohndnyi'));
  assert.equal(CORPUS_PLACE_CONFUSION.has('dohndnyi'), false);
  assert.equal(CORPUS_PLACE_CONFUSION.has('dohanyi'), false);

  const person = repairKnownOcrInText('Ernő Dohnányi conducted', fixtureIndex);
  assert.match(person.text, /Dohnányi/u);
  assert.doesNotMatch(person.text, /Dohány/u);
  assert.equal(person.repairs.length, 0);

  const damagedPerson = repairKnownOcrInText('composer Dohndnyi wrote', fixtureIndex);
  assert.equal(damagedPerson.text, 'composer Dohndnyi wrote');
  assert.equal(damagedPerson.repairs.length, 0);
});

test('diacritic polish: Dohany → Dohány when exact gazetteer token', () => {
  const result = repairKnownOcrInText('near Dohany market', fixtureIndex);
  assert.match(result.text, /Dohány/u);
});
