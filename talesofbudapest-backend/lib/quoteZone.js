/**
 * Text-only quote zone classification for restricted speaker gating.
 * Taxonomy: direct_speech | prose | unknown (Sol 2026-07-22).
 */

const OPENERS = new Set(['\u2018', '\u201c', '"']); // ‘ “ "
const CLOSERS = new Set(['\u2019', '\u201d', '"']); // ’ ” "

const isLetter = (ch) => ch != null && /\p{L}/u.test(ch);

/** Apostrophe inside a word (I’m), not a closing quote. */
const isWordApostrophe = (text, index) => {
  const ch = text[index];
  if (ch !== '\u2019' && ch !== "'") return false;
  return isLetter(text[index - 1]) && isLetter(text[index + 1]);
};

/**
 * Collect [start, endExclusive) spans of balanced quoted runs on a page.
 * Double-quote " pairs; curly ‘…’ / “…” with apostrophe-aware closers.
 */
export const findQuotedRuns = (pageText) => {
  const text = String(pageText ?? '');
  const runs = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (!OPENERS.has(ch) || isWordApostrophe(text, i)) {
      i += 1;
      continue;
    }
    const opener = ch;
    const wantCloser = opener === '\u2018' ? '\u2019'
      : opener === '\u201c' ? '\u201d'
      : '"';
    let j = i + 1;
    let found = -1;
    while (j < text.length) {
      const cj = text[j];
      if (cj === wantCloser && !isWordApostrophe(text, j)) {
        found = j;
        break;
      }
      // Nested opposite curly open — skip conservatively to unknown later if needed.
      if (opener !== '"' && OPENERS.has(cj) && cj !== opener && !isWordApostrophe(text, j)) {
        break;
      }
      j += 1;
    }
    if (found < 0) {
      i += 1;
      continue;
    }
    runs.push({ start: i, end: found + 1 });
    i = found + 1;
  }
  return runs;
};

const locateQuoteSpan = (pageText, quote) => {
  const page = String(pageText ?? '');
  const q = String(quote ?? '');
  if (!page || !q) return null;
  let at = page.indexOf(q);
  if (at >= 0) return { start: at, end: at + q.length };
  const pageFold = page.toLowerCase();
  const qFold = q.toLowerCase();
  at = pageFold.indexOf(qFold);
  if (at >= 0) return { start: at, end: at + q.length };
  // Soft prefix for truncated evidence quotes still inside a speech block.
  const prefix = q.slice(0, Math.min(48, q.length));
  if (prefix.length >= 12) {
    at = page.indexOf(prefix);
    if (at < 0) at = pageFold.indexOf(prefix.toLowerCase());
    if (at >= 0) return { start: at, end: at + prefix.length };
  }
  return null;
};

/**
 * @returns {{ zone: 'direct_speech'|'prose'|'unknown', reason: string }}
 */
export const classifyQuoteZone = (pageText, quote) => {
  const span = locateQuoteSpan(pageText, quote);
  if (!span) {
    return { zone: 'unknown', reason: 'quote_span_unlocated' };
  }
  const runs = findQuotedRuns(pageText);
  if (!runs.length) {
    return { zone: 'prose', reason: 'no_quoted_runs' };
  }
  const containing = runs.filter((run) => span.start >= run.start && span.end <= run.end);
  if (containing.length === 1) {
    return { zone: 'direct_speech', reason: 'inside_quoted_run' };
  }
  if (containing.length > 1) {
    return { zone: 'unknown', reason: 'overlapping_quoted_runs' };
  }
  const straddling = runs.some((run) => span.start < run.end && span.end > run.start);
  if (straddling) {
    return { zone: 'unknown', reason: 'straddles_quoted_run' };
  }
  return { zone: 'prose', reason: 'outside_quoted_runs' };
};
