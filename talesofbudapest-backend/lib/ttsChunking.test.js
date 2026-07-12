import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkTextForTts, TTS_MAX_WORDS_PER_CHUNK } from './ttsChunking.js';

test('returns a single chunk for short scripts', () => {
  const text = 'One short sentence.';
  assert.deepEqual(chunkTextForTts(text), [text]);
});

test('splits long scripts on sentence boundaries under the word cap', () => {
  const sentence = 'This is a medium sentence with enough words to count toward the chunk limit.';
  const text = Array.from({ length: 6 }, () => sentence).join(' ');
  const chunks = chunkTextForTts(text, 40);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    const words = chunk.split(/\s+/).filter(Boolean).length;
    assert.ok(words <= TTS_MAX_WORDS_PER_CHUNK || words <= 40);
  }
  assert.equal(chunks.join(' '), text);
});
