import { fetchOpenRouterModels } from './openRouterHttp.js';

const priceNumber = (value, label, modelId) => {
  // A missing catalog field is not evidence that a billing dimension is free. The extraction
  // preflight is intentionally fail-closed: OpenRouter must explicitly report every price as a
  // finite, non-negative number (normally the string "0" for a free dimension).
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing OpenRouter ${label} price for ${modelId}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid OpenRouter ${label} price for ${modelId}`);
  }
  return number;
};

export const validateExtractionLimit = ({ limitRaw, confirmFullBook }) => {
  if (limitRaw === null) {
    if (!confirmFullBook) {
      throw new Error('Refusing to run unbounded: this would silently re-extract the entire book. Pass --limit <n> (optionally with --from-page) to bound this run, or pass --confirm-full-book to intentionally run the whole book.');
    }
    return 0;
  }

  const limit = Number(limitRaw);
  // `--limit 0` used to reach `limit === 0 ? windows : ...`, making it an accidental second
  // spelling of an unbounded run while bypassing the explicit confirmation guard.
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer; omit it and pass --confirm-full-book for an intentional unbounded run');
  }
  return limit;
};

export const fetchOpenRouterCatalog = async () =>
  fetchOpenRouterModels({ operation: 'models.catalog_preflight', authenticated: false });

export const pricingForModels = (modelIds, catalog) => modelIds.map((modelId) => {
  const model = catalog.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Refusing extraction: ${modelId} is missing from the live OpenRouter catalog`);
  const pricing = {
    modelId,
    prompt: priceNumber(model.pricing?.prompt, 'prompt', modelId),
    completion: priceNumber(model.pricing?.completion, 'completion', modelId),
    request: priceNumber(model.pricing?.request, 'request', modelId),
  };
  if (modelId.endsWith(':free') && (pricing.prompt !== 0 || pricing.completion !== 0 || pricing.request !== 0)) {
    throw new Error(`Refusing extraction: ${modelId} is no longer free in the live OpenRouter catalog`);
  }
  return pricing;
});

// UTF-8 bytes are deliberately used as a conservative token ceiling. Normal prose uses fewer
// tokens than bytes, so this reserves more money than the request should be able to consume.
export const conservativeInputTokenCeiling = (text) => Buffer.byteLength(text, 'utf8');

export const estimateExtractionCeiling = ({ requests, modelPricing, maxOutputTokens }) => {
  const byModel = modelPricing.map((pricing) => {
    const inputTokens = requests.reduce((sum, request) => sum + conservativeInputTokenCeiling(request), 0);
    const outputTokens = requests.length * maxOutputTokens;
    const usd = (inputTokens * pricing.prompt) + (outputTokens * pricing.completion) + (requests.length * pricing.request);
    return { modelId: pricing.modelId, inputTokens, outputTokens, usd };
  });
  return { byModel, usd: byModel.reduce((sum, model) => sum + model.usd, 0) };
};

export const formatUsd = (usd) => `$${usd.toFixed(4)}`;
