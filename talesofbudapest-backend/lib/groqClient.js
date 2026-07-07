/** @deprecated Use openRouterClient.js — kept for backward-compatible imports */
export {
  createChatCompletion,
  DEFAULT_OPENROUTER_MODEL,
  getOpenRouterApiKey,
  getOpenRouterModel,
} from './openRouterClient.js';

export const getGroqClient = () => {
  throw new Error(
    'getGroqClient() is deprecated. Use createChatCompletion() from openRouterClient.js instead.',
  );
};
