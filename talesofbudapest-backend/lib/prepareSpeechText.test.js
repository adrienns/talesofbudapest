import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpeechText } from './prepareSpeechText.js';

test('respells known Hungarian names for English TTS', () => {
  const { displayScript, speechText } = prepareSpeechText(
    'Walk along Kazinczy Street toward the Dohány Synagogue.',
    'en',
  );

  assert.equal(displayScript, 'Walk along Kazinczy Street toward the Dohány Synagogue.');
  assert.match(speechText, /KAH-zin-tsee/);
  assert.match(speechText, /DOH-hahn/);
});

test('leaves Hungarian locale unchanged', () => {
  const input = 'A Kazinczy utcán sétálunk.';
  const { displayScript, speechText } = prepareSpeechText(input, 'hu');
  assert.equal(displayScript, input);
  assert.equal(speechText, input);
});
