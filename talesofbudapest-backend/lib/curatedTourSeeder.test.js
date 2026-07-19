import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseCuratedChapterAudio,
  materializeCuratedChapterAudio,
} from './curatedTourSeeder.js';

const chapter = (audioUrl, script = 'Same script') => ({ audio_url: audioUrl, script });

test('fresh curated audio still resumes a completed current-version chapter', () => {
  const result = chooseCuratedChapterAudio({
    currentChapter: chapter('https://storage/v2/en/01.mp3'),
    previousChapter: chapter('https://storage/v1/en/01.mp3'),
    script: 'Same script',
    freshAudio: true,
    currentVersionAudioMarker: '/v2/en/',
  });
  assert.deepEqual(result, { audioUrl: 'https://storage/v2/en/01.mp3', source: 'current' });
});

test('fresh curated audio blocks inheritance from a previous content version', () => {
  const result = chooseCuratedChapterAudio({
    previousChapter: chapter('https://storage/v1/en/01.mp3'),
    script: 'Same script',
    freshAudio: true,
    currentVersionAudioMarker: '/v2/en/',
  });
  assert.deepEqual(result, { audioUrl: null, source: 'missing' });
});

test('fresh audio replaces an older-version URL temporarily inherited into the current record', () => {
  const result = chooseCuratedChapterAudio({
    currentChapter: chapter('https://storage/v1/en/01.mp3'),
    script: 'Same script',
    freshAudio: true,
    currentVersionAudioMarker: '/v2/en/',
  });
  assert.deepEqual(result, { audioUrl: null, source: 'missing' });
});

test('unchanged previous-version audio is inherited without generating TTS', async () => {
  let generated = false;
  const result = await materializeCuratedChapterAudio({
    previousChapter: chapter('https://storage/v1/hu/01.mp3'),
    script: 'Same script',
    generateAndUpload: async () => {
      generated = true;
      return 'https://storage/v2/hu/01.mp3';
    },
  });
  assert.deepEqual(result, { audioUrl: 'https://storage/v1/hu/01.mp3', source: 'previous' });
  assert.equal(generated, false);
});

test('missing curated audio is generated and returned', async () => {
  const result = await materializeCuratedChapterAudio({
    script: 'New script',
    generateAndUpload: async () => 'https://storage/v2/en/01.mp3',
  });
  assert.deepEqual(result, { audioUrl: 'https://storage/v2/en/01.mp3', source: 'generated' });
});
