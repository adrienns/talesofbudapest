import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySpeakerPrecisionGold,
  loadSpeakerPrecisionGold,
} from './speakerPrecisionGold.js';

test('loads bundled precision gold', () => {
  const gold = loadSpeakerPrecisionGold();
  assert.ok(gold?.decisions?.length >= 23);
});

test('gold rejects Cartledge sticky citation', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'resolved',
    reason: 'speech_frame_person',
    resolution_source: 'speech_frame_prose_adjacent',
    surface: 'Bryan Cartledge',
    name_en: 'Bryan Cartledge',
    confidence: 'medium',
    needs_review: true,
  }, {
    quote: 'As far as France and Britain was concerned, Hungary was a defeated enemy and deserved harsh punishment. The peace treaty that was foisted onto Hungary reflected this belief.',
    quotePage: 62,
    gold,
  });
  assert.equal(next.status, 'none');
  assert.equal(next.reason, 'intervening_narration_after_citation');
});

test('gold accepts Székely synagogue quote at high confidence', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'resolved',
    reason: 'speech_frame_page_name',
    resolution_source: 'speech_frame_page',
    surface: 'Székely',
    name_en: 'Gábor Székely',
    confidence: 'low',
    needs_review: true,
  }, {
    quote: 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.',
    quotePage: 89,
    gold,
  });
  assert.equal(next.status, 'resolved');
  assert.equal(next.confidence, 'high');
  assert.equal(next.needs_review, false);
});

test('gold force-resolves Granasztói homo sovieticus from none', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'none',
    reason: 'ambiguous_person',
    resolution_source: null,
    surface: 'Granasztói',
    name_en: null,
  }, {
    quote: '‘After their definite rejection of the ideal of homo sovieticus, the Hungarian people seek to redefine their collective identity and seek a sense of community’ (p. 7).',
    quotePage: 209,
    gold,
  });
  assert.equal(next.status, 'resolved');
  assert.equal(next.name_en, 'György Granasztói');
  assert.equal(next.confidence, 'high');
  assert.equal(next.resolution_source, 'precision_gold');
});

test('gold remaps Tamás→Egedy dental quote to Tamás Antalffy', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'resolved',
    reason: 'speech_frame_person',
    resolution_source: 'speech_frame_global',
    surface: 'Tamás',
    name_en: 'Tamás Egedy',
    confidence: 'medium',
    needs_review: true,
  }, {
    quote: 'We just sounded out a few dentists here in Budapest to see if they would be interested.',
    quotePage: 227,
    gold,
  });
  assert.equal(next.status, 'resolved');
  assert.equal(next.name_en, 'Tamás Antalffy');
  assert.equal(next.confidence, 'high');
  assert.equal(next.resolution_source, 'precision_gold');
});

test('gold force-resolves Magris page-start continuation over Granasztói reject', () => {
  const gold = loadSpeakerPrecisionGold();
  const quote = '‘They reverted to the old Hungarian nationalism, and that is causing some problems with their neighbours and the European Union.’';
  const next = applySpeakerPrecisionGold({
    status: 'none',
    reason: 'no_speech_frame',
    resolution_source: null,
    surface: null,
    name_en: null,
  }, { quote, quotePage: 209, gold });
  assert.equal(next.status, 'resolved');
  assert.equal(next.name_en, 'Claudio Magris');
  assert.equal(next.confidence, 'high');
});

test('gold force-resolves Orbán straddle quote_zone_unknown', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'none',
    reason: 'quote_zone_unknown',
    resolution_source: null,
    surface: null,
    name_en: null,
  }, {
    quote: '‘It was the former Communists who, after 1990, handed over Hungary and the Hungarian people to the speculators and the international financial industry,’ Orbán said.',
    quotePage: 209,
    gold,
  });
  assert.equal(next.status, 'resolved');
  assert.equal(next.name_en, 'Viktor Orbán');
  assert.equal(next.confidence, 'high');
  assert.equal(next.resolution_source, 'precision_gold');
});

test('gold force-resolves Szita ambiguous to Szabolcs Szita', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'ambiguous',
    reason: 'multiple_person_matches',
    resolution_source: 'speech_frame_global',
    surface: 'Szita',
    name_en: null,
  }, {
    quote: 'The majority are secular, with no interest in religion, or at best some spasmodic observance of its rituals.',
    quotePage: 88,
    gold,
  });
  assert.equal(next.status, 'resolved');
  assert.equal(next.name_en, 'Szabolcs Szita');
  assert.equal(next.confidence, 'high');
});

test('gold force-resolves Tony ambiguous to Antal (Tony) Arató', () => {
  const gold = loadSpeakerPrecisionGold();
  const next = applySpeakerPrecisionGold({
    status: 'ambiguous',
    reason: 'multiple_person_matches',
    resolution_source: 'speech_frame_global',
    surface: 'Tony',
    name_en: null,
  }, {
    quote: 'There were occasions when father was away with his work brigade, and a drunken secret policeman would bang on the door in the middle of the night to check on us.',
    quotePage: 108,
    gold,
  });
  assert.equal(next.status, 'resolved');
  assert.equal(next.name_en, 'Antal (Tony) Arató');
  assert.equal(next.confidence, 'high');
});
