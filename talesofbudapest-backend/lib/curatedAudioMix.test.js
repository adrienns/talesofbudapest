import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCuratedMusicFilter,
  CURATED_MUSIC_CUE_SECONDS,
  mixCuratedNarrationAudio,
} from './curatedAudioMix.js';

test('curated music cue is short, faded, and substantially quieter than narration', () => {
  const filter = buildCuratedMusicFilter();
  assert.match(filter, new RegExp(`atrim=duration=${CURATED_MUSIC_CUE_SECONDS}`));
  assert.match(filter, /volume=0\.0631/);
  assert.match(filter, /\[music-bed\]afade/);
  assert.match(filter, /afade=t=in/);
  assert.match(filter, /afade=t=out/);
  assert.match(filter, /amix=inputs=2:duration=first/);
});

test('sensitive chapters keep the original narration without invoking FFmpeg', async () => {
  let invoked = false;
  const narration = Buffer.from('dry narration');
  const output = await mixCuratedNarrationAudio({
    narrationBuffer: narration,
    musicAsset: { localFileUrl: new URL('file:///music.wav') },
    enabled: false,
    execFileFn: async () => { invoked = true; },
  });
  assert.equal(output, narration);
  assert.equal(invoked, false);
});
