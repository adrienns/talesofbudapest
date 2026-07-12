import crypto from 'node:crypto';

const enabled = () => process.env.OPENROUTER_LOGS !== '0';

export const openRouterRequestId = () => crypto.randomUUID();

export const summarizeUsage = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  return {
    prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
    completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    cost: usage.cost ?? null,
  };
};

export const logOpenRouter = (event, details = {}) => {
  if (!enabled()) return;
  const record = {
    timestamp: new Date().toISOString(),
    service: 'talesofbudapest',
    event: `openrouter.${event}`,
    ...details,
  };
  // Never include prompts, source text, API keys, response bodies, or audio payloads.
  console.log(JSON.stringify(record));
};
