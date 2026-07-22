import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateRestrictedRecordSpeakers, buildGlobalPeopleByPage } from './annotateRestrictedSpeakers.js';
import { buildQuoteEntityLinks } from './quoteSpeakerAttribution.js';

test('end-to-end: Székely speech frame persists and links I/my', () => {
  const pageMap = new Map([[89, [
    'As Székely explained:',
    '‘I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.’',
  ].join('\n')]]);
  const record = {
    pdf_pages: [89],
    payload: {
      people: [{
        name_en: 'Gábor Székely',
        source_name: 'Professor Gábor Székely',
        role_en: 'political scientist',
        evidence: { quote: 'Professor Gábor Székely' },
      }],
      locations: [{
        name_en: 'Great Synagogue',
        evidence: {
          quote: 'I look at the Great Synagogue, much as most other people of my ilk do, not as a place of worship, but as a cultural institution.',
        },
      }],
      facts: [],
      relations: [],
      events: [],
    },
  };
  const peopleByPage = buildGlobalPeopleByPage([record]);
  const { record: next } = annotateRestrictedRecordSpeakers(record, pageMap, { peopleByPage });
  const speaker = next.payload.locations[0].evidence.speaker;
  assert.equal(speaker.status, 'resolved');
  assert.equal(speaker.name_en, 'Gábor Székely');

  const links = buildQuoteEntityLinks({
    quote: next.payload.locations[0].evidence.quote,
    pageText: pageMap.get(89),
    people: peopleByPage.get(89),
    speakerAttribution: {
      status: speaker.status,
      reason: speaker.reason,
      resolution_source: speaker.resolution_source,
      person: {
        name_en: speaker.name_en,
        source_name: speaker.source_name,
        role_en: speaker.role_en,
      },
      surface: speaker.surface,
      frame: null,
    },
  });
  assert.ok(links.some((link) => link.kind === 'speaker'));
  assert.ok(links.some((link) => link.kind === 'speaker_pronoun' && link.text === 'I'));
});
