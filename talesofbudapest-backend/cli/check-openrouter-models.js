// Standalone health check for the model IDs the restricted-extraction ladder (and other
// hardcoded model references) depend on. Queries OpenRouter's PUBLIC model catalog
// (GET /api/v1/models — no auth, no cost) and reports whether each id still exists and whether
// any id expected to be free (":free" suffix) still has $0 pricing. Free-tier ids and pricing
// churn on OpenRouter without notice, so this is meant to be run periodically (or in CI/cron)
// to catch drift before a real extraction run hits it.

import { RESTRICTED_EXTRACTION_MODEL_LADDER } from '../lib/restrictedExtractionConfig.js';
import { fetchOpenRouterModels, OPENROUTER_MODELS_URL } from '../lib/openRouterHttp.js';
import { option } from './_shared/args.js';
import { loadCliEnv } from './_shared/loadEnv.js';

loadCliEnv(import.meta.url);

const DEFAULT_IDS = [
  ...RESTRICTED_EXTRACTION_MODEL_LADDER,
  // Extra spot-checks
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat',
];

const args = process.argv.slice(2);

const idsToCheck = () => {
  const raw = option(args, '--ids');
  if (!raw) return DEFAULT_IDS;
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
};

/** Per-million-token price string ("0", "0.0000001", ...) -> a human $/M number, or null if absent. */
const perMillion = (priceStr) => {
  if (priceStr === undefined || priceStr === null) return null;
  const price = Number(priceStr);
  if (!Number.isFinite(price)) return null;
  return price * 1_000_000;
};

const formatUsd = (value) => (value === null ? 'n/a' : `$${value.toFixed(4)}/M`);

const fetchCatalog = () =>
  fetchOpenRouterModels({ operation: 'models.health_check', authenticated: false });

const checkModel = (id, catalog) => {
  const entry = catalog.find((model) => model.id === id);
  if (!entry) {
    return { id, found: false, warnings: [`NOT FOUND in current OpenRouter catalog`] };
  }

  const promptPrice = entry.pricing?.prompt;
  const completionPrice = entry.pricing?.completion;
  const requestPrice = entry.pricing?.request;
  const inputPerM = perMillion(promptPrice);
  const outputPerM = perMillion(completionPrice);
  const perRequest = requestPrice === undefined || requestPrice === null ? null : Number(requestPrice);
  const hasInvalidPrice = [inputPerM, outputPerM, perRequest].some((price) => price === null || !Number.isFinite(price) || price < 0);
  const isFree = !hasInvalidPrice && inputPerM === 0 && outputPerM === 0 && perRequest === 0;
  const expectedFree = id.endsWith(':free');

  const warnings = [];
  if (hasInvalidPrice) {
    warnings.push('catalog is missing a valid prompt, completion, or request price');
  }
  if (expectedFree && !isFree) {
    warnings.push(`expected free (":free" id) but pricing is no longer $0`);
  }

  return {
    id,
    found: true,
    isFree,
    expectedFree,
    inputPerM,
    outputPerM,
    requestPrice: perRequest,
    contextLength: entry.context_length ?? null,
    warnings,
  };
};

const printTable = (results) => {
  const rows = results.map((result) => {
    if (!result.found) {
      return { id: result.id, status: 'NOT FOUND', free: '-', input: '-', output: '-', request: '-', context: '-' };
    }
    return {
      id: result.id,
      status: result.isFree ? 'free' : 'paid',
      free: result.expectedFree ? (result.isFree ? 'yes' : 'NO (was free)') : (result.isFree ? 'yes (unexpected)' : 'no'),
      input: formatUsd(result.inputPerM),
      output: formatUsd(result.outputPerM),
      request: result.requestPrice === null ? 'n/a' : `$${result.requestPrice.toFixed(4)}/req`,
      context: result.contextLength ?? 'n/a',
    };
  });

  console.table(rows);
};

const main = async () => {
  const ids = idsToCheck();
  console.log(`Checking ${ids.length} model id(s) against the live OpenRouter catalog: ${OPENROUTER_MODELS_URL}`);
  const catalog = await fetchCatalog();
  console.log(`Fetched ${catalog.length} models from the catalog.\n`);

  const results = ids.map((id) => checkModel(id, catalog));
  printTable(results);

  const allWarnings = results.flatMap((result) => result.warnings.map((warning) => `${result.id}: ${warning}`));
  console.log('');
  if (allWarnings.length === 0) {
    console.log('No warnings — all checked model ids exist, and all ":free" ids are still $0.');
    process.exit(0);
  }

  for (const warning of allWarnings) {
    console.log(`⚠ WARNING: ${warning}`);
  }
  process.exit(1);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
