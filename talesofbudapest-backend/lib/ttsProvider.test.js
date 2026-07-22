import assert from 'node:assert/strict';
import test from 'node:test';
import { getTtsSpeechCreator } from './ttsClient.js';

test('direct Gemini is the default TTS provider', () => {
  assert.equal(getTtsSpeechCreator().name, 'createGeminiSpeech');
});

test('OpenRouter stays available only by explicit provider selection', () => {
  assert.equal(getTtsSpeechCreator('openrouter').name, 'createSpeech');
  assert.throws(() => getTtsSpeechCreator('unknown'), /Unsupported TTS provider/);
});
