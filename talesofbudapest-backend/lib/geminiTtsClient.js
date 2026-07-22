import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const DEFAULT_GEMINI_TTS_VOICE = 'Sulafat';
export const DEFAULT_GEMINI_TTS_REQUEST_INTERVAL_MS = 31_000;
export const GEMINI_TTS_PCM_SAMPLE_RATE = 24_000;
export const GEMINI_TTS_PCM_CHANNELS = 1;

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];
const TERMINAL_QUOTA_PATTERNS = [
  /prepayment credits are depleted/i,
  /daily quota/i,
  /requests per day/i,
  /resource has been exhausted/i,
  /resource[_ -]?exhausted/i,
  /quota exceeded/i,
  /free[- ]tier quota/i,
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseNonNegativeInteger = (value, fallback, name) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
};

export const getGeminiApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for direct Gemini TTS');
  }
  return apiKey;
};

export const getGeminiTtsModel = () =>
  process.env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL;

export const getGeminiTtsVoice = () =>
  process.env.GEMINI_TTS_VOICE?.trim() || DEFAULT_GEMINI_TTS_VOICE;

export const getGeminiTtsRequestIntervalMs = () => parseNonNegativeInteger(
  process.env.GEMINI_TTS_REQUEST_INTERVAL_MS,
  DEFAULT_GEMINI_TTS_REQUEST_INTERVAL_MS,
  'GEMINI_TTS_REQUEST_INTERVAL_MS',
);

export const buildGeminiTtsPrompt = (transcript) => `Synthesize speech for the transcript below.

### AUDIO PROFILE
A warm, knowledgeable Budapest storyteller guiding an attentive visitor through the city.

### DIRECTOR'S NOTES
Use clear international English, a measured museum-guide pace, natural pauses, and restrained emotion. Be engaging but never theatrical. Adapt respectfully to serious historical material. Read only the transcript, exactly as written. Do not speak these instructions, headings, or any commentary.

### TRANSCRIPT
${transcript}`;

export const buildGeminiTtsRequest = ({
  input,
  model = getGeminiTtsModel(),
  voice = getGeminiTtsVoice(),
  locale,
}) => {
  const trimmed = input?.trim();
  if (!trimmed) throw new Error('TTS input text is empty');

  return {
    model,
    contents: buildGeminiTtsPrompt(trimmed),
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
        ...(locale ? { languageCode: locale } : {}),
      },
    },
  };
};

class RetryableGeminiTtsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RetryableGeminiTtsError';
    this.status = 500;
  }
}

export const parseGeminiTtsResponse = (response) => {
  const audioPart = response?.candidates?.[0]?.content?.parts
    ?.find((part) => part?.inlineData?.data);
  const encoded = audioPart?.inlineData?.data;
  if (typeof encoded !== 'string' || !encoded.trim()) {
    throw new RetryableGeminiTtsError('Gemini TTS returned no audio data');
  }

  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) {
    throw new RetryableGeminiTtsError('Gemini TTS returned empty audio data');
  }

  return {
    buffer,
    format: 'pcm',
    sampleRate: GEMINI_TTS_PCM_SAMPLE_RATE,
    channels: GEMINI_TTS_PCM_CHANNELS,
  };
};

const errorStatus = (error) => Number(error?.status ?? error?.statusCode ?? error?.response?.status);

const errorMessage = (error) => [
  error?.message,
  error?.error?.error?.message,
  error?.cause?.message,
  error?.body,
].filter(Boolean).join(' ');

export const isTerminalGeminiTtsQuotaError = (error) =>
  errorStatus(error) === 429 && TERMINAL_QUOTA_PATTERNS.some((pattern) => pattern.test(errorMessage(error)));

export class GeminiFreeTierQuotaError extends Error {
  constructor() {
    super('Gemini free-tier quota reached. Try again after the quota resets.');
    this.name = 'GeminiFreeTierQuotaError';
    this.status = 429;
  }
}

export const isRetryableGeminiTtsError = (error) =>
  !isTerminalGeminiTtsQuotaError(error)
  && (error instanceof RetryableGeminiTtsError || RETRYABLE_STATUSES.has(errorStatus(error)));

const parseRetryAfterValue = (value, nowMs) => {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const dateMs = Date.parse(String(value));
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
};

export const retryAfterMs = (error, nowMs = Date.now()) => {
  const direct = Number(error?.retryAfterMs);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const headers = error?.headers ?? error?.response?.headers;
  const headerValue = typeof headers?.get === 'function'
    ? headers.get('retry-after')
    : headers?.['retry-after'] ?? headers?.['Retry-After'];
  const fromHeader = parseRetryAfterValue(headerValue, nowMs);
  if (fromHeader != null) return fromHeader;

  const message = String(error?.message ?? '');
  const durationMatch = message.match(/retry(?:Delay|[- ]after|\s+in)[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  return durationMatch ? Math.ceil(Number(durationMatch[1]) * 1000) : null;
};

export const createGeminiTtsClient = ({
  apiKey,
  client = null,
  requestIntervalMs = getGeminiTtsRequestIntervalMs(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  sleepFn = sleep,
  nowFn = Date.now,
} = {}) => {
  const resolvedClient = client ?? new GoogleGenAI({ apiKey: apiKey ?? getGeminiApiKey() });
  let lastRequestStartedAt = null;

  const waitForRequestSlot = async () => {
    if (lastRequestStartedAt == null || requestIntervalMs === 0) return;
    const remaining = requestIntervalMs - (nowFn() - lastRequestStartedAt);
    if (remaining > 0) await sleepFn(remaining);
  };

  return {
    async createSpeech(options) {
      const request = buildGeminiTtsRequest(options);
      let lastError;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await waitForRequestSlot();
        lastRequestStartedAt = nowFn();

        try {
          const response = await resolvedClient.models.generateContent(request);
          return parseGeminiTtsResponse(response);
        } catch (error) {
          lastError = error;
          if (isTerminalGeminiTtsQuotaError(error)) {
            throw new GeminiFreeTierQuotaError();
          }
          if (!isRetryableGeminiTtsError(error) || attempt === maxAttempts - 1) throw error;

          const serverDelay = retryAfterMs(error, nowFn()) ?? 0;
          const backoff = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
          const delay = Math.max(serverDelay, backoff);
          if (delay > 0) await sleepFn(delay);
        }
      }

      throw lastError;
    },
  };
};

let defaultClient;

export const createGeminiSpeech = async (options) => {
  defaultClient ??= createGeminiTtsClient();
  return defaultClient.createSpeech(options);
};
