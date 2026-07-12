import { logOpenRouter, openRouterRequestId } from './openRouterLogger.js';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_MODELS_URL = `${OPENROUTER_BASE_URL}/models`;

export const getOpenRouterApiKey = () => process.env.OPENROUTER_API_KEY ?? null;

export const getOpenRouterHeaders = ({ requireAuth = true } = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    'HTTP-Referer':
      process.env.OPENROUTER_SITE_URL
      ?? process.env.OPENROUTER_HTTP_REFERER
      ?? 'http://localhost:3000',
    'X-Title': process.env.OPENROUTER_APP_NAME ?? process.env.OPENROUTER_X_TITLE ?? 'Tales of Budapest',
  };

  if (!requireAuth) {
    return headers;
  }

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  return {
    ...headers,
    Authorization: `Bearer ${apiKey}`,
  };
};

export const fetchOpenRouterModels = async ({
  operation = 'models.catalog',
  authenticated = false,
  timeoutMs = 30_000,
  fetchImpl = fetch,
} = {}) => {
  const requestId = openRouterRequestId();
  const startedAt = Date.now();
  logOpenRouter('request.started', {
    request_id: requestId,
    operation,
    endpoint: '/models',
    authenticated,
  });

  let response;
  try {
    response = await fetchImpl(OPENROUTER_MODELS_URL, {
      headers: getOpenRouterHeaders({ requireAuth: authenticated }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logOpenRouter('request.failed', {
      request_id: requestId,
      operation,
      endpoint: '/models',
      authenticated,
      duration_ms: Date.now() - startedAt,
      error_type: error?.name ?? 'fetch_error',
    });
    throw error;
  }

  if (!response.ok) {
    logOpenRouter('request.failed', {
      request_id: requestId,
      operation,
      endpoint: '/models',
      authenticated,
      status: response.status,
      duration_ms: Date.now() - startedAt,
    });
    throw new Error(`OpenRouter models request failed (${response.status})`);
  }

  const payload = await response.json();
  logOpenRouter('request.completed', {
    request_id: requestId,
    operation,
    endpoint: '/models',
    authenticated,
    status: response.status,
    duration_ms: Date.now() - startedAt,
    model_count: payload?.data?.length ?? 0,
  });

  if (!Array.isArray(payload?.data)) {
    throw new Error('OpenRouter models response returned an invalid catalog');
  }

  return payload.data;
};
