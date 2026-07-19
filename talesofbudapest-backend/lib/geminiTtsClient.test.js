import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGeminiTtsRequest,
  createGeminiTtsClient,
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_GEMINI_TTS_VOICE,
  isTerminalGeminiTtsQuotaError,
  parseGeminiTtsResponse,
  retryAfterMs,
} from './geminiTtsClient.js';

const audioResponse = (value = 'pcm') => ({
  output_audio: {
    data: Buffer.from(value).toString('base64'),
    sample_rate: 24_000,
    channels: 1,
  },
});

test('Gemini TTS request uses the planned model, voice, and narration guardrails', () => {
  const request = buildGeminiTtsRequest({
    input: 'Welcome to Budapest.',
    model: DEFAULT_GEMINI_TTS_MODEL,
    voice: DEFAULT_GEMINI_TTS_VOICE,
  });

  assert.equal(request.model, 'gemini-3.1-flash-tts-preview');
  assert.deepEqual(request.response_format, { type: 'audio' });
  assert.deepEqual(request.generation_config.speech_config, [{ voice: 'Sulafat' }]);
  assert.match(request.input, /measured museum-guide pace/);
  assert.match(request.input, /Read only the transcript, exactly as written/);
  assert.match(request.input, /### TRANSCRIPT\nWelcome to Budapest\.$/);
});

test('Gemini TTS response parser returns raw PCM metadata', () => {
  const result = parseGeminiTtsResponse(audioResponse('audio bytes'));
  assert.deepEqual(result.buffer, Buffer.from('audio bytes'));
  assert.equal(result.format, 'pcm');
  assert.equal(result.sampleRate, 24_000);
  assert.equal(result.channels, 1);
});

test('Gemini TTS retries transient failures and then returns audio', async () => {
  let calls = 0;
  const waits = [];
  const client = {
    interactions: {
      create: async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('temporary'), { status: 500 });
        return audioResponse();
      },
    },
  };
  const tts = createGeminiTtsClient({
    client,
    requestIntervalMs: 0,
    maxAttempts: 3,
    sleepFn: async (milliseconds) => waits.push(milliseconds),
  });

  const result = await tts.createSpeech({ input: 'Retry this.', model: 'test', voice: 'Sulafat' });
  assert.equal(result.buffer.toString(), 'pcm');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2_000, 5_000]);
});

test('Gemini TTS throttles consecutive free-tier requests', async () => {
  let now = 1_000;
  const waits = [];
  const client = { interactions: { create: async () => audioResponse() } };
  const tts = createGeminiTtsClient({
    client,
    requestIntervalMs: 31_000,
    sleepFn: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
    nowFn: () => now,
  });

  await tts.createSpeech({ input: 'First.', model: 'test', voice: 'Sulafat' });
  await tts.createSpeech({ input: 'Second.', model: 'test', voice: 'Sulafat' });
  assert.deepEqual(waits, [31_000]);
});

test('Gemini TTS rejects missing audio without falling back to another provider', async () => {
  const client = { interactions: { create: async () => ({ output_text: 'not audio' }) } };
  const tts = createGeminiTtsClient({ client, requestIntervalMs: 0, maxAttempts: 1 });
  await assert.rejects(
    tts.createSpeech({ input: 'Audio only.', model: 'test', voice: 'Sulafat' }),
    /returned no audio data/,
  );
});

test('Gemini TTS respects Retry-After values longer than local backoff', () => {
  const error = { headers: new Headers({ 'retry-after': '30' }) };
  assert.equal(retryAfterMs(error, 0), 30_000);
});

test('Gemini TTS parses Google quota messages that say retry in N seconds', () => {
  const error = Object.assign(new Error('Please retry in 55.223157713s.'), { status: 429 });
  assert.equal(retryAfterMs(error, 0), 55_224);
});

test('depleted prepaid credits are terminal and are not retried', async () => {
  let calls = 0;
  const error = Object.assign(new Error('Your prepayment credits are depleted.'), { status: 429 });
  const client = {
    interactions: {
      create: async () => {
        calls += 1;
        throw error;
      },
    },
  };
  const tts = createGeminiTtsClient({ client, requestIntervalMs: 0, maxAttempts: 5 });

  assert.equal(isTerminalGeminiTtsQuotaError(error), true);
  await assert.rejects(
    tts.createSpeech({ input: 'Do not retry.', model: 'test', voice: 'Sulafat' }),
    /prepayment credits are depleted/,
  );
  assert.equal(calls, 1);
});
