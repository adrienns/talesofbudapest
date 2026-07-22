export const RESTRICTED_EXTRACTION_MODEL_LADDER = [
  'google/gemini-2.5-flash',
  'deepseek/deepseek-v4-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-oss-120b',
];

export const RESTRICTED_EXTRACTION_PROMPT_VERSION = 'restricted-book-entities-p4';
/** p4: one PDF page per extract window so evidence quotes cannot span pages. */
export const RESTRICTED_EXTRACTION_PAGES_PER_WINDOW = 1;
export const RESTRICTED_EXTRACTION_MAX_ITEMS_PER_ARRAY = 10;
export const RESTRICTED_EXTRACTION_MAX_OUTPUT_TOKENS = 8000;
export const RESTRICTED_EXTRACTION_DEFAULT_MAX_COST_USD = 1;
export const RESTRICTED_EXTRACTION_QUOTE_MIN_CHARS = 80;
export const RESTRICTED_EXTRACTION_QUOTE_MAX_CHARS = 200;
