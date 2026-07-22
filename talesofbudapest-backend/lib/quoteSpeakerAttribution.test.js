import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentSpeechFrame,
  buildQuoteEntityLinks,
  personAliases,
  resolveQuoteSpeaker,
} from './quoteSpeakerAttribution.js';

test('adjacentSpeechFrame rejects paragraph break between frame and quote', () => {
  const page = [
    'According to the historian Bryan Cartledge, the number killed exceeded prior counts.',
    '',
    'The final blow occurred in June 1920. As far as France and Britain was concerned, Hungary was a defeated enemy.',
  ].join('\n');
  const quote = 'As far as France and Britain was concerned, Hungary was a defeated enemy.';
  assert.equal(adjacentSpeechFrame({ pageText: page, quote, maxGap: 200 }), null);
});

const szekely = {
  name_en: 'Gábor Székely',
  source_name: 'Professor Gábor Székely',
  role_en: 'political scientist',
  quote: 'The attitude of the political scientist Professor Gábor Székely…',
};

const page89 = [
  'The attitude of the political scientist Professor Gábor Székely, with whom the author spoke, illustrates the difficulties.',
  'As Székely explained:',
  '‘My position is that I accept my Jewishness when Jews are attacked, but I’m not religious.',
  'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.',
  'My own family shows some of the crosscurrents of Jewish life here.’',
].join('\n');

const quoteMid = 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.';

test('personAliases strips titles and keeps surname', () => {
  const aliases = personAliases(szekely);
  assert.ok(aliases.includes('Gábor Székely'));
  assert.ok(aliases.includes('Székely'));
  assert.ok(aliases.includes('Gábor'));
  assert.ok(!aliases.some((alias) => /^professor\b/iu.test(alias)));
});

test('As Székely explained: mid-quote I/my resolves to Gábor Székely', () => {
  const attribution = resolveQuoteSpeaker({
    quote: quoteMid,
    pageText: page89,
    people: [szekely],
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.reason, 'speech_frame_person');
  assert.equal(attribution.person.name_en, 'Gábor Székely');

  const links = buildQuoteEntityLinks({
    quote: quoteMid,
    pageText: page89,
    people: [szekely],
    speakerAttribution: attribution,
  });
  assert.ok(links.some((link) => link.kind === 'speaker' && link.person.name_en === 'Gábor Székely'));
  assert.ok(links.some((link) => link.kind === 'speaker_pronoun' && link.text === 'I'));
  assert.ok(links.some((link) => link.kind === 'speaker_pronoun' && link.text.toLowerCase() === 'my'));
  assert.ok(!links.some((link) => link.kind === 'pronoun'), 'he/him must not collapse onto speech-frame speaker');
});

test('surname-only frame expands from page name when people list omits them', () => {
  const attribution = resolveQuoteSpeaker({
    quote: quoteMid,
    pageText: page89,
    people: [],
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person?.name_en, 'Gábor Székely');
  assert.equal(attribution.reason, 'speech_frame_page_name');
  assert.equal(attribution.resolution_source, 'speech_frame_page');
});

test('inline X said, "…" resolves from same left context', () => {
  const page = 'Székely said, “I never saw the synagogue as a temple.”';
  const quote = 'I never saw the synagogue as a temple.';
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [szekely] });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Gábor Székely');
});

test('nearest frame wins when page has multiple speakers', () => {
  const other = { name_en: 'Imre Kertész', source_name: 'Imre Kertész' };
  const page = [
    'As Kertész explained: ‘I write about Buchenwald.’',
    'Later, As Székely explained:',
    `‘${quoteMid}’`,
  ].join(' ');
  const attribution = resolveQuoteSpeaker({
    quote: quoteMid,
    pageText: page,
    people: [szekely, other],
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Gábor Székely');
});

test('bare first-person with no speech frame stays none', () => {
  const attribution = resolveQuoteSpeaker({
    quote: 'I look at the Great Synagogue every morning.',
    pageText: 'Walking downtown one finds many landmarks. I look at the Great Synagogue every morning.',
    people: [szekely],
  });
  assert.equal(attribution.status, 'none');
  assert.equal(attribution.reason, 'no_speech_frame');
  const links = buildQuoteEntityLinks({
    quote: 'I look at the Great Synagogue every morning.',
    pageText: 'Walking downtown one finds many landmarks. I look at the Great Synagogue every morning.',
    people: [szekely],
  });
  assert.ok(!links.some((link) => link.kind === 'speaker' || link.kind === 'speaker_pronoun'));
});

test('joint speakers are ambiguous', () => {
  const other = { name_en: 'Szabolcs Szita', source_name: 'Szita' };
  const attribution = resolveQuoteSpeaker({
    quote: quoteMid,
    pageText: `As Székely and Szita explained: ‘${quoteMid}’`,
    people: [szekely, other],
  });
  assert.equal(attribution.status, 'ambiguous');
  assert.equal(attribution.reason, 'joint_speakers');
});

test('non-person frame does not map to a person', () => {
  const attribution = resolveQuoteSpeaker({
    quote: 'I was built in 1859.',
    pageText: 'The inscription reads: “I was built in 1859.”',
    people: [szekely],
  });
  assert.equal(attribution.status, 'none');
  assert.equal(attribution.reason, 'non_person_frame');
});

test('unmatched frame surface stays none with confession reason', () => {
  const attribution = resolveQuoteSpeaker({
    quote: quoteMid,
    pageText: `As Kovács explained: ‘${quoteMid}’`,
    people: [szekely],
  });
  assert.equal(attribution.status, 'none');
  assert.equal(attribution.reason, 'frame_person_unmatched');
  assert.equal(attribution.surface, 'Kovács');
});

test('rejects clause-fragment false frames containing and', () => {
  const attribution = resolveQuoteSpeaker({
    quote: 'We had already left the family estate.',
    pageText: 'She lowered her voice and said: “We had already left the family estate.”',
    people: [szekely],
  });
  assert.equal(attribution.status, 'none');
  assert.notEqual(attribution.reason, 'joint_speakers');
});

test('rejects lowercase As easily be said false frame', () => {
  const attribution = resolveQuoteSpeaker({
    quote: 'Something could as easily be said of Pest.',
    pageText: 'Something could as easily be said of Pest.',
    people: [szekely],
  });
  assert.equal(attribution.status, 'none');
});

test('strips possessive gloss Vilmos’ recollections → Vilmos', () => {
  const vilmos = { name_en: 'Vilmos Vázsonyi', source_name: 'Vilmos' };
  const attribution = resolveQuoteSpeaker({
    quote: 'All ceilings were three and a half metres high.',
    pageText: 'According to Vilmos’ recollections: “All ceilings were three and a half metres high.”',
    people: [vilmos],
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Vilmos Vázsonyi');
});

test('third-person pronoun links prior named person, not speech-frame speaker', () => {
  const vilmos = { name_en: 'Vilmos Vázsonyi', source_name: 'Vilmos' };
  const page = 'Vilmos lived nearby. He loved the park.';
  const quote = 'He loved the park.';
  const links = buildQuoteEntityLinks({ quote, pageText: page, people: [vilmos, szekely] });
  const pronoun = links.find((link) => link.kind === 'pronoun');
  assert.ok(pronoun);
  assert.equal(pronoun.person.name_en, 'Vilmos Vázsonyi');
});

test('Name explained … in the following way: resolves the following quote', () => {
  const granasztoi = {
    name_en: 'György Granasztói',
    source_name: 'György Granasztói',
    role_en: 'historian',
  };
  const quote = 'After their definite rejection of the ideal of homo sovieticus, they reverted to the old Hungarian nationalism.';
  const page = [
    '‘They reverted to the old Hungarian nationalism that had been suppressed by the Communist regime.’',
    'Granasztói explained the process in the following way:',
    `‘${quote}’`,
  ].join('\n');
  const attribution = resolveQuoteSpeaker({
    quote,
    pageText: page,
    people: [granasztoi],
  });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'György Granasztói');
  assert.equal(attribution.reason, 'speech_frame_person');
});

test('pre-attribution quote is not claimed by later Granasztói explained cue', () => {
  const granasztoi = {
    name_en: 'György Granasztói',
    source_name: 'György Granasztói',
  };
  const quote = 'They reverted to the old Hungarian nationalism that had been suppressed by the Communist regime.';
  const page = [
    `‘${quote}’`,
    'Granasztói explained the process in the following way:',
    '‘After their definite rejection of the ideal of homo sovieticus, they reverted to the old Hungarian nationalism.’',
  ].join('\n');
  const attribution = resolveQuoteSpeaker({
    quote,
    pageText: page,
    people: [granasztoi],
  });
  assert.equal(attribution.status, 'none');
  assert.equal(attribution.reason, 'no_speech_frame');
});

test('quote at page start does not inherit later speech frames', () => {
  const quote = '‘They reverted to the old Hungarian nationalism, and that is causing some problems with their neighbours and the European Union.’';
  const page = [
    quote,
    '',
    'Granasztói explained the reappearance of Hungarian nationalism in the following way:',
    '',
    '‘After their definite rejection of the ideal of homo sovieticus, the Hungarian people seek to redefine their collective identity.’',
  ].join('\n');
  const attribution = resolveQuoteSpeaker({
    quote,
    pageText: page,
    people: [
      { name_en: 'György Granasztói', source_name: 'György Granasztói' },
      { name_en: 'Claudio Magris', source_name: 'Claudio Magris' },
    ],
  });
  assert.equal(attribution.status, 'none');
  assert.equal(attribution.reason, 'no_speech_frame');
  assert.equal(attribution.surface, null);
});

test('prior-page Magris frame does not leak without gold (no generic cross-page)', () => {
  const quote = '‘They reverted to the old Hungarian nationalism, and that is causing some problems with their neighbours and the European Union.’';
  // Only page 209 text — Magris cue lived on p208 and must not invent inheritance.
  const page209 = `${quote}\n\nGranasztói explained something else.`;
  const attribution = resolveQuoteSpeaker({
    quote,
    pageText: page209,
    people: [{ name_en: 'Claudio Magris', source_name: 'Claudio Magris' }],
  });
  assert.equal(attribution.status, 'none');
});

test('Name described … in the following way: resolves', () => {
  const person = { name_en: 'Melinda Turjányi Papp', source_name: 'Melinda Turjányi Papp' };
  const quote = 'This new Baroque town is more harmonious and calmer than its bustling medieval antecedent.';
  const page = `The cultural historian Melinda Turjányi Papp described the new Buda in the following way:\n‘${quote}’`;
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [person] });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Melinda Turjányi Papp');
});

test('Name (dates) writes … : resolves', () => {
  const person = { name_en: 'Viktor Széchényi', source_name: 'Viktor Széchényi' };
  const quote = 'I returned from St Matthias Church to our home at Uri utca 52.';
  const page = `Viktor Széchényi (1871–1945) writes in his diary:\n‘${quote}’`;
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [person] });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Viktor Széchényi');
});

test('Name gives a vivid description … : resolves', () => {
  const person = { name_en: 'John Lukács', source_name: 'John Lukács' };
  const quote = 'On a shining June day, Franz Josef arrived.';
  const page = `The historian John Lukács, in his seminal work, Budapest 1900, gives a vivid description of the key events of the festivities:\n‘${quote}’`;
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [person] });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'John Lukács');
});

test('Name, commented at the time: resolves', () => {
  const person = { name_en: 'Endre Ady', source_name: 'Endre Ady' };
  const quote = 'The Jews have made the Budapest of today, no doubt about that.';
  const page = `The well-known Hungarian poet Endre Ady, commented at the time:\n‘${quote}’`;
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [person] });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Endre Ady');
});

test('Name, has said: beats earlier distant frame', () => {
  const ash = { name_en: 'Timothy Garton Ash', source_name: 'Timothy Garton Ash' };
  const pope = { name_en: 'Pope', source_name: 'Pope' };
  const quote = 'Hungary now has a hybrid regime, neither a democracy nor a dictatorship.';
  const page = [
    'Pope said that:',
    '',
    '‘I think of a Europe that is not a hostage to its parts.’',
    '',
    'The English historian, Timothy Garton Ash, has said:',
    '',
    `‘${quote}’`,
  ].join('\n');
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [ash, pope] });
  assert.equal(attribution.status, 'resolved');
  assert.equal(attribution.person.name_en, 'Timothy Garton Ash');
});

test('rejects His son described without page person match', () => {
  const attribution = resolveQuoteSpeaker({
    quote: 'Having bourgeois features, like beautiful carpets.',
    pageText: 'His son described the building:\n‘Having bourgeois features, like beautiful carpets.’',
    people: [{ name_en: 'Vilmos Vázsonyi', source_name: 'Vilmos' }],
  });
  assert.equal(attribution.status, 'none');
});

test('rejects paragraph gap between named-intro frame and quote', () => {
  const person = { name_en: 'John Lukács', source_name: 'John Lukács' };
  const quote = 'In few cities had Jews prospered as freely.';
  const page = [
    'John Lukács describes this process in the following way:',
    '',
    'Narrator continues for a while.',
    '',
    `‘${quote}’`,
  ].join('\n');
  const attribution = resolveQuoteSpeaker({ quote, pageText: page, people: [person] });
  // Left-context nearest-frame still matches; gap gate is only on prose-adjacent reopen.
  assert.equal(attribution.status, 'resolved');
});
