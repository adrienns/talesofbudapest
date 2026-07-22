/**
 * Fail-closed evidence-quote checks for restricted-book extraction (p4+).
 * Quotes must be contiguous substrings of the supplied page text after fold.
 */

import {
  RESTRICTED_EXTRACTION_QUOTE_MAX_CHARS,
  RESTRICTED_EXTRACTION_QUOTE_MIN_CHARS,
} from './restrictedExtractionConfig.js';

const EVIDENCE_KINDS = ['locations', 'people', 'events', 'facts', 'relations'];

export const foldQuoteMatch = (value) => String(value ?? '')
  .replace(/(\p{L})-[\t ]*\r?\n[\t ]*(\p{Ll})/gu, '$1$2')
  .replace(/\s+/gu, ' ')
  .trim()
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
  .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
  .replace(/[\u00a0\u202f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const quoteAlignmentReason = (quote, pageText, {
  minChars = RESTRICTED_EXTRACTION_QUOTE_MIN_CHARS,
  maxChars = RESTRICTED_EXTRACTION_QUOTE_MAX_CHARS,
} = {}) => {
  const raw = String(quote ?? '').trim();
  if (!raw) return 'empty_quote';
  if (raw.length < minChars) return 'quote_too_short';
  if (raw.length > maxChars) return 'quote_too_long';
  const needle = foldQuoteMatch(raw);
  if (!needle || needle.length < 12) return 'quote_too_short';
  if (!foldQuoteMatch(pageText).includes(needle)) return 'quote_not_on_page';
  return null;
};

/**
 * Drop evidence items whose quote fails alignment / length. Mutates a copy.
 * @returns {{ payload: object, dropped: object[] }}
 */
export const filterPayloadEvidenceQuotes = (payload, pageText, options = {}) => {
  const dropped = [];
  const next = { ...(payload ?? {}) };
  for (const kind of EVIDENCE_KINDS) {
    const rows = Array.isArray(next[kind]) ? next[kind] : [];
    next[kind] = rows.filter((item) => {
      const quote = item?.evidence?.quote;
      const reason = quoteAlignmentReason(quote, pageText, options);
      if (!reason) return true;
      dropped.push({ kind, reason, quote: String(quote ?? '').slice(0, 120) });
      return false;
    });
  }
  return { payload: next, dropped };
};
