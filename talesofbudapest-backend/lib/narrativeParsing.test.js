import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractJsonPayload,
  parseReplacementChapter,
  parseRoutePlan,
  validateCoordinates,
} from './narrativeParsing.js';

const landmarks = [
  {
    id: '1',
    name: 'Parliament',
    latitude: 47.507,
    longitude: 19.045,
    story_prompt: 'Neo-Gothic riverside parliament.',
    image_url: 'https://example.com/parliament.jpg',
  },
  {
    id: '2',
    name: 'Chain Bridge',
    latitude: 47.498,
    longitude: 19.043,
    story_prompt: 'First permanent bridge across the Danube.',
    image_url: null,
  },
  {
    id: '3',
    name: 'St Stephen Basilica',
    latitude: 47.501,
    longitude: 19.054,
    story_prompt: 'Neoclassical basilica dome.',
    image_url: null,
  },
];

test('extractJsonPayload unwraps fenced JSON', () => {
  const raw = '```json\n{"title":"Tour"}\n```';
  assert.equal(extractJsonPayload(raw), '{"title":"Tour"}');
});

test('validateCoordinates accepts central Budapest', () => {
  assert.equal(validateCoordinates(47.5, 19.05), true);
});

test('parseRoutePlan maps landmark and custom chapters', () => {
  const raw = JSON.stringify({
    title: 'Danube Stories',
    chapters: [
      { landmark_id: '1', title: 'Chapter 1: Parliament', hook: 'Neo-Gothic facade' },
      { landmark_id: '2', title: 'Chapter 2: Bridge', hook: 'Lion statues' },
      {
        custom_stop: {
          lat: 47.49,
          lng: 19.04,
          title: 'Chapter 3: Riverside',
          script: 'A short riverside pause.',
        },
      },
    ],
  });

  const plan = parseRoutePlan(raw, landmarks);
  assert.equal(plan.title, 'Danube Stories');
  assert.equal(plan.chapters.length, 3);
  assert.equal(plan.chapters[0].landmarkId, '1');
  assert.equal(plan.chapters[2].landmarkId, null);
  assert.equal(plan.chapters[2].script, 'A short riverside pause.');
});

test('parseRoutePlan rejects routes with fewer than two landmark stops', () => {
  const raw = JSON.stringify({
    title: 'Too few landmarks',
    chapters: [
      { landmark_id: '1', title: 'Only one', hook: 'detail' },
      {
        custom_stop: {
          lat: 47.49,
          lng: 19.04,
          title: 'Custom',
          script: 'script',
        },
      },
      {
        custom_stop: {
          lat: 47.491,
          lng: 19.041,
          title: 'Another custom',
          script: 'script two',
        },
      },
    ],
  });

  assert.throws(() => parseRoutePlan(raw, landmarks), /at least 2 landmark stops/);
});

test('parseReplacementChapter maps a landmark stop', () => {
  const raw = JSON.stringify({
    landmark_id: '2',
    title: 'Chapter 2: Chain Bridge',
    hook: 'Lion guardians',
  });

  const chapter = parseReplacementChapter(raw, landmarks, 1);
  assert.equal(chapter.chapterIndex, 1);
  assert.equal(chapter.landmarkId, '2');
  assert.equal(chapter.title, 'Chapter 2: Chain Bridge');
});
