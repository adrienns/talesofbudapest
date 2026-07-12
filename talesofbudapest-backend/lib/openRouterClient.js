import { logOpenRouter, openRouterRequestId, summarizeUsage } from './openRouterLogger.js';
import { getOpenRouterApiKey, getOpenRouterHeaders, OPENROUTER_BASE_URL } from './openRouterHttp.js';

/** Cheap OpenRouter model for dev/testing — override with OPENROUTER_MODEL */
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct'; // Fixed to the ultra-cheap text model

/** Multilingual TTS — Gemini Flash TTS handles Hungarian natively and is the most cost-effective on OpenRouter */
export const DEFAULT_OPENROUTER_TTS_MODEL = 'google/gemini-3.1-flash-tts-preview';

/** Kokoro preset voice — fallback for TTS models without a known default voice */
export const DEFAULT_OPENROUTER_TTS_VOICE = 'af_heart';

/**
 * Different TTS models support different response formats and voice name
 * spaces — Gemini's TTS only emits raw PCM and uses single-word voice names
 * (e.g. "Kore"), unlike Kokoro's mp3/wav output and "af_heart"-style presets.
 */
const TTS_MODEL_RESPONSE_FORMATS = {
  'google/gemini-3.1-flash-tts-preview': 'pcm',
};

const TTS_MODEL_DEFAULT_VOICES = {
  'google/gemini-3.1-flash-tts-preview': 'Kore',
};

/** Gemini's TTS output format — 16-bit signed PCM, mono, 24kHz. */
export const GEMINI_TTS_PCM_SAMPLE_RATE = 24000;
export const GEMINI_TTS_PCM_CHANNELS = 1;
export const GEMINI_TTS_PCM_BITS_PER_SAMPLE = 16;

export { getOpenRouterApiKey } from './openRouterHttp.js';

export const getOpenRouterModel = () =>
  process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;

export const getOpenRouterTtsModel = () =>
  process.env.OPENROUTER_TTS_MODEL ?? DEFAULT_OPENROUTER_TTS_MODEL;

export const getOpenRouterTtsVoice = (model = getOpenRouterTtsModel()) =>
  process.env.OPENROUTER_TTS_VOICE ?? TTS_MODEL_DEFAULT_VOICES[model] ?? DEFAULT_OPENROUTER_TTS_VOICE;

/** The response_format a given TTS model actually supports — not every model can emit mp3. */
export const getOpenRouterTtsResponseFormat = (model = getOpenRouterTtsModel()) =>
  process.env.OPENROUTER_TTS_RESPONSE_FORMAT ?? TTS_MODEL_RESPONSE_FORMATS[model] ?? 'mp3';

const getOpenRouterHeadersForRequest = () => getOpenRouterHeaders({ requireAuth: true });

const postChatCompletion = async (body, { operation, requestId }) => {
  const startedAt = Date.now();
  logOpenRouter('request.started', { request_id: requestId, operation, endpoint: '/chat/completions', model: body.model });
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getOpenRouterHeadersForRequest(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logOpenRouter('request.failed', { request_id: requestId, operation, endpoint: '/chat/completions', model: body.model, status: response.status, duration_ms: Date.now() - startedAt, error_length: errorBody.length });
    throw new Error(`OpenRouter request failed (${response.status}): ${errorBody}`);
  }
  const payload = await response.json();
  logOpenRouter('request.completed', { request_id: requestId, operation, endpoint: '/chat/completions', model: body.model, response_model: payload.model ?? null, status: response.status, duration_ms: Date.now() - startedAt, usage: summarizeUsage(payload.usage) });
  return payload;
};

export const createChatCompletion = async ({
  messages,
  model = getOpenRouterModel(),
  response_format,
  max_tokens,
  temperature,
  fallback_without_response_format = true,
  operation = 'chat.completion',
}) => {
  const body = { model, messages };
  if (response_format) {
    body.response_format = response_format;
  }
  if (max_tokens !== undefined) {
    body.max_tokens = max_tokens;
  }
  if (temperature !== undefined) {
    body.temperature = temperature;
  }

  const requestId = openRouterRequestId();
  try {
    return await postChatCompletion(body, { operation, requestId });
  } catch (error) {
    if (!response_format || !fallback_without_response_format) {
      throw error;
    }

    const { response_format: _removed, ...withoutJsonMode } = body;
    return postChatCompletion(withoutJsonMode, { operation: `${operation}.without_json_mode`, requestId: `${requestId}.fallback` });
  }
};

/** Returns `{ buffer, format }` — `format` is whatever was actually sent to the API, since not every model can emit every format. */
export const createSpeech = async ({
  input,
  model = getOpenRouterTtsModel(),
  voice = getOpenRouterTtsVoice(model),
  response_format = getOpenRouterTtsResponseFormat(model),
  operation = 'audio.speech',
}) => {
  const trimmed = input?.trim();
  if (!trimmed) {
    throw new Error('TTS input text is empty');
  }

  const requestId = openRouterRequestId();
  const startedAt = Date.now();
  logOpenRouter('request.started', { request_id: requestId, operation, endpoint: '/audio/speech', model });
  const response = await fetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: getOpenRouterHeadersForRequest(),
    body: JSON.stringify({
      model,
      input: trimmed,
      voice,
      response_format,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logOpenRouter('request.failed', { request_id: requestId, operation, endpoint: '/audio/speech', model, status: response.status, duration_ms: Date.now() - startedAt, error_length: errorBody.length });
    throw new Error(`OpenRouter TTS request failed (${response.status}): ${errorBody}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  logOpenRouter('request.completed', { request_id: requestId, operation, endpoint: '/audio/speech', model, status: response.status, duration_ms: Date.now() - startedAt, response_bytes: buffer.length });
  return { buffer, format: response_format };
};
