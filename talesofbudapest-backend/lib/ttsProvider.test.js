import assert from 'node:assert/strict';
import test from 'node:test';
import { getTtsSpeechCreator } from './ttsClient.js';

test('OpenRouter remains the default TTS provider', () => {
  assert.equal(getTtsSpeechCreator().name, 'createSpeech');
});

test('direct Gemini TTS must be selected explicitly', () => {
  assert.equal(getTtsSpeechCreator('gemini').name, 'createGeminiSpeech');
  assert.throws(() => getTtsSpeechCreator('unknown'), /Unsupported TTS provider/);
});
