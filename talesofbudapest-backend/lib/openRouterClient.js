const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Cheap OpenRouter model for dev/testing — override with OPENROUTER_MODEL */
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct';

/** Cheapest OpenRouter TTS model — override with OPENROUTER_TTS_MODEL */
export const DEFAULT_OPENROUTER_TTS_MODEL = 'hexgrad/kokoro-82m';

/** Kokoro preset voice — override with OPENROUTER_TTS_VOICE */
export const DEFAULT_OPENROUTER_TTS_VOICE = 'af_heart';

export const getOpenRouterApiKey = () =>
  process.env.OPENROUTER_API_KEY ?? process.env.GROQ_API_KEY ?? null;

export const getOpenRouterModel = () =>
  process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;

export const getOpenRouterTtsModel = () =>
  process.env.OPENROUTER_TTS_MODEL ?? DEFAULT_OPENROUTER_TTS_MODEL;

export const getOpenRouterTtsVoice = () =>
  process.env.OPENROUTER_TTS_VOICE ?? DEFAULT_OPENROUTER_TTS_VOICE;

const getOpenRouterHeaders = () => {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY (or GROQ_API_KEY) is not configured');
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
    'X-Title': 'Tales of Budapest',
  };
};

const postChatCompletion = async (body) => {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getOpenRouterHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${errorBody}`);
  }

  return response.json();
};

export const createChatCompletion = async ({
  messages,
  model = getOpenRouterModel(),
  response_format,
  max_tokens,
  temperature,
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

  try {
    return await postChatCompletion(body);
  } catch (error) {
    if (!response_format) {
      throw error;
    }

    const { response_format: _removed, ...withoutJsonMode } = body;
    return postChatCompletion(withoutJsonMode);
  }
};

export const createSpeech = async ({
  input,
  model = getOpenRouterTtsModel(),
  voice = getOpenRouterTtsVoice(),
  response_format = 'mp3',
}) => {
  const trimmed = input?.trim();
  if (!trimmed) {
    throw new Error('TTS input text is empty');
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: getOpenRouterHeaders(),
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
    throw new Error(`OpenRouter TTS request failed (${response.status}): ${errorBody}`);
  }

  return Buffer.from(await response.arrayBuffer());
};
