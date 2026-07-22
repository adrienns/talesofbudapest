import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateRestrictedRecordSpeakers } from './annotateRestrictedSpeakers.js';

const pageMap = new Map([[89, [
  'As Székely explained:',
  '‘I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.’',
].join('\n')]]);

test('annotates location evidence.speaker without rewriting quote', () => {
  const quote = 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.';
  const record = {
    pdf_pages: [89, 90, 91],
    payload: {
      people: [{ name_en: 'Gábor Székely', source_name: 'Professor Gábor Székely', role_en: 'political scientist', evidence: { quote: 'Professor Gábor Székely' } }],
      locations: [{ name_en: 'Great Synagogue', source_name: 'Great Synagogue', evidence: { quote } }],
      facts: [],
      relations: [],
      events: [],
    },
  };
  const { record: next, stats } = annotateRestrictedRecordSpeakers(record, pageMap);
  assert.equal(next.payload.locations[0].evidence.quote, quote);
  assert.equal(next.payload.locations[0].evidence.speaker.status, 'resolved');
  assert.equal(next.payload.locations[0].evidence.speaker.name_en, 'Gábor Székely');
  assert.equal(next.payload.locations[0].evidence.quote_zone, 'direct_speech');
  assert.equal(stats.resolved, 1);
  assert.equal(next.speaker_attribution.version, 'quote-speaker-v2');
});

test('prose zone blocks speaker attribution', () => {
  const map = new Map([[10, 'Budapest has dozens of coffee houses and bars that stay open long after midnight for locals and visitors alike.']]);
  const quote = 'Budapest has dozens of coffee houses and bars that stay open long after midnight for locals and visitors alike.';
  const record = {
    pdf_pages: [10],
    payload: {
      people: [{ name_en: 'Joe Hajdu', source_name: 'Joe' }],
      locations: [],
      facts: [{ text_en: 'Cafes', evidence: { quote } }],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.facts[0].evidence.quote_zone, 'prose');
  assert.equal(next.payload.facts[0].evidence.speaker.status, 'none');
  assert.equal(next.payload.facts[0].evidence.speaker.reason, 'non_dialogue_zone');
  assert.equal(next.payload.facts[0].evidence.quote_page, 10);
});

test('prose adjacent to As X explained reopens attribution at medium confidence', () => {
  const quote = 'Budapest has dozens of coffee houses and bars that stay open long after midnight.';
  const map = new Map([[61, [
    'As Smith explained:',
    quote,
  ].join('\n')]]);
  const record = {
    pdf_pages: [61],
    payload: {
      people: [{ name_en: 'Frank Berkeley Smith', source_name: 'Frank Berkeley Smith' }],
      locations: [],
      facts: [{ text_en: 'Cafes', evidence: { quote } }],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.facts[0].evidence.quote_zone, 'speech_frame_prose_adjacent');
  assert.equal(next.payload.facts[0].evidence.speaker.status, 'resolved');
  assert.equal(next.payload.facts[0].evidence.speaker.name_en, 'Frank Berkeley Smith');
  assert.equal(next.payload.facts[0].evidence.speaker.confidence, 'medium');
  assert.equal(next.payload.facts[0].evidence.speaker.needs_review, true);
});

test('distant speech frame does not reopen prose zone', () => {
  const quote = 'Budapest has dozens of coffee houses and bars that stay open long after midnight.';
  const filler = 'x'.repeat(250);
  const map = new Map([[61, [
    'As Smith explained: earlier remarks were long.',
    filler,
    quote,
  ].join('\n')]]);
  const record = {
    pdf_pages: [61],
    payload: {
      people: [{ name_en: 'Frank Berkeley Smith', source_name: 'Frank Berkeley Smith' }],
      locations: [],
      facts: [{ text_en: 'Cafes', evidence: { quote } }],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.facts[0].evidence.quote_zone, 'prose');
  assert.equal(next.payload.facts[0].evidence.speaker.status, 'none');
  assert.equal(next.payload.facts[0].evidence.speaker.reason, 'non_dialogue_zone');
});

test('bare first-person fact gets speaker.status none', () => {
  const record = {
    pdf_pages: [10],
    payload: {
      people: [{ name_en: 'Joe Hajdu', source_name: 'Joe Hajdu' }],
      locations: [],
      facts: [{ text_en: 'Author walks', evidence: { quote: 'I walk the city.' } }],
      relations: [],
      events: [],
    },
  };
  const map = new Map([[10, 'Elsewhere in town life continues. ‘I walk the city.’']]);
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.facts[0].evidence.speaker.status, 'none');
  assert.equal(next.payload.facts[0].evidence.speaker.reason, 'no_speech_frame');
  assert.equal(next.payload.facts[0].evidence.quote_zone, 'direct_speech');
});

test('unmatched quote page stays none with confession', () => {
  const record = {
    pdf_pages: [89],
    payload: {
      people: [{ name_en: 'Gábor Székely', source_name: 'Székely' }],
      locations: [{ name_en: 'Somewhere', evidence: { quote: 'I look at a place that is not on this page at all.' } }],
      facts: [],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, pageMap);
  assert.equal(next.payload.locations[0].evidence.speaker.status, 'none');
  assert.equal(next.payload.locations[0].evidence.speaker.reason, 'quote_page_unmatched');
  assert.equal(next.payload.locations[0].evidence.quote_page, null);
  assert.equal(next.payload.locations[0].evidence.quote_page_reason, 'quote_page_unmatched');
});

test('ambiguous duplicate quote pages refuse attribution', () => {
  const map = new Map([
    [10, 'I love this city forever and always in this chapter.'],
    [11, 'I love this city forever and always in this chapter.'],
  ]);
  const record = {
    pdf_pages: [10, 11],
    payload: {
      people: [{ name_en: 'Joe Hajdu', source_name: 'Joe' }],
      locations: [{ name_en: 'City', evidence: { quote: 'I love this city forever and always in this chapter.' } }],
      facts: [],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.locations[0].evidence.quote_page, null);
  assert.equal(next.payload.locations[0].evidence.quote_page_reason, 'quote_page_ambiguous');
  assert.equal(next.payload.locations[0].evidence.speaker.status, 'none');
});

test('unique exact quote_page is persisted', () => {
  const quote = 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.';
  const record = {
    pdf_pages: [89, 90, 91],
    payload: {
      people: [{ name_en: 'Gábor Székely', source_name: 'Professor Gábor Székely', role_en: 'political scientist', evidence: { quote: 'Professor Gábor Székely' } }],
      locations: [{ name_en: 'Great Synagogue', source_name: 'Great Synagogue', evidence: { quote } }],
      facts: [],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, pageMap);
  assert.equal(next.payload.locations[0].evidence.quote_page, 89);
  assert.equal(next.payload.locations[0].evidence.quote_page_reason, 'exact_unique');
});

test('cross-page exact quote attributes start page', () => {
  const map = new Map([
    [8, 'Even in the early 1960s, battle scars and bullet holes were a common sight, and the faces of the people were like a'],
    [9, 'parchment on which one could read the hardships of the past decades.'],
    [10, 'Unrelated later material about markets and bridges.'],
  ]);
  const quote = 'Even in the early 1960s, battle scars and bullet holes were a common sight, and the faces of the people were like a parchment on which one could read the hardships of the past decades.';
  const record = {
    pdf_pages: [8, 9, 10],
    payload: {
      people: [],
      locations: [],
      facts: [{ text_en: 'Battle scars', evidence: { quote } }],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.facts[0].evidence.quote_page, 8);
  assert.equal(next.payload.facts[0].evidence.quote_page_reason, 'exact_unique_cross_page');
});

test('cross-page concat with multiple hits stays ambiguous', () => {
  const phrase = 'the repeated bridge phrase spans onward carefully';
  const map = new Map([
    [1, 'AAA the repeated bridge'],
    [2, 'phrase spans onward carefully BBB the repeated bridge'],
    [3, 'phrase spans onward carefully CCC'],
  ]);
  const record = {
    pdf_pages: [1, 2, 3],
    payload: {
      people: [],
      locations: [],
      facts: [{ text_en: 'Dup', evidence: { quote: phrase } }],
      relations: [],
      events: [],
    },
  };
  const { record: next } = annotateRestrictedRecordSpeakers(record, map);
  assert.equal(next.payload.facts[0].evidence.quote_page, null);
  assert.equal(next.payload.facts[0].evidence.quote_page_reason, 'quote_page_ambiguous');
});

test('global people roster resolves frame when person is on another page', () => {
  const quote = 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.';
  const map = new Map([[89, [
    'As Székely explained:',
    `‘${quote}’`,
  ].join('\n')]]);
  const record = {
    pdf_pages: [89],
    payload: {
      people: [{ name_en: 'Szita', source_name: 'Szita' }],
      locations: [{ name_en: 'Great Synagogue', evidence: { quote } }],
      facts: [],
      relations: [],
      events: [],
    },
  };
  const globalPeople = [{
    name_en: 'Gábor Székely',
    source_name: 'Professor Gábor Székely',
    role_en: 'political scientist',
    years_hint: null,
    quote: null,
  }];
  const { record: next } = annotateRestrictedRecordSpeakers(record, map, { globalPeople });
  assert.equal(next.payload.locations[0].evidence.speaker.status, 'resolved');
  assert.equal(next.payload.locations[0].evidence.speaker.name_en, 'Gábor Székely');
  assert.equal(next.payload.locations[0].evidence.speaker.resolution_source, 'speech_frame_global');
  assert.equal(next.payload.locations[0].evidence.quote_zone, 'direct_speech');
});

test('global roster refuses bare first-name surface Tamás→Egedy', () => {
  const quote = 'We just sounded out a few dentists here in Budapest to see if they would be interested.';
  const map = new Map([[227, [
    'Tamás explained the modest beginnings of his dental venture:',
    `‘${quote}’`,
  ].join('\n')]]);
  const record = {
    pdf_pages: [227],
    payload: {
      people: [],
      locations: [],
      facts: [{ text_en: 'dentists', evidence: { quote } }],
      relations: [],
      events: [],
    },
  };
  const globalPeople = [{
    name_en: 'Tamás Egedy',
    source_name: 'Tamás Egedy',
    role_en: 'urban geographer',
  }];
  // No precision gold — must not invent Egedy from first-name frame.
  const { record: next } = annotateRestrictedRecordSpeakers(record, map, {
    globalPeople,
    precisionGold: { decisions: [] },
  });
  assert.equal(next.payload.facts[0].evidence.speaker.status, 'none');
  assert.notEqual(next.payload.facts[0].evidence.speaker.resolution_source, 'speech_frame_global');
  assert.notEqual(next.payload.facts[0].evidence.speaker.name_en, 'Tamás Egedy');
});

test('global roster stays ambiguous for shared surname Granasztói', () => {
  const quote = 'After their definite rejection of the ideal of homo sovieticus, they seek community.';
  const map = new Map([[209, [
    'Granasztói explained the reappearance of Hungarian nationalism in the following way:',
    `‘${quote}’`,
  ].join('\n')]]);
  const record = {
    pdf_pages: [209],
    payload: {
      people: [],
      locations: [],
      facts: [{ text_en: 'homo', evidence: { quote } }],
      relations: [],
      events: [],
    },
  };
  const globalPeople = [
    { name_en: 'Pál Granasztoi', source_name: 'Pál Granasztoi' },
    { name_en: 'György Granasztói', source_name: 'György Granasztói' },
  ];
  const { record: next } = annotateRestrictedRecordSpeakers(record, map, {
    globalPeople,
    precisionGold: { decisions: [] },
  });
  assert.equal(next.payload.facts[0].evidence.speaker.status, 'ambiguous');
  assert.equal(next.payload.facts[0].evidence.speaker.resolution_source, 'speech_frame_global');
  assert.equal(next.payload.facts[0].evidence.speaker.name_en, null);
});
