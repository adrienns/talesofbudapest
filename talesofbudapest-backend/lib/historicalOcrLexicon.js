/**
 * OCR repair for high-value domain words, by curated lexicon only.
 *
 * A scan of this book found 27 tokens within edit distance 1 of a domain word,
 * but only ~18 occurrences were real OCR damage. The rest were legitimate:
 * `schools`/`prayers`/`streets` are plurals, `horse` and `player` and `Prater`
 * are ordinary words, `yeshivah` is a variant spelling. Repairing by edit
 * distance would corrupt 300+ correct words to fix 18, so nothing is repaired
 * by similarity: only these exact, verified-damaged forms are folded, and only
 * for entity identity. The source text and its offsets are never rewritten.
 */

// variant -> canonical. Every entry is a form actually observed in the corpus
// (or an unambiguous OCR sibling of one) that is NOT a word in its own right.
export const OCR_DOMAIN_CANONICAL = new Map([
  ['synagoque', 'synagogue'],
  ['synagoques', 'synagogues'],
  ['synagoge', 'synagogue'],
  ['synagoges', 'synagogues'],
  ['ynagogue', 'synagogue'],
  ['ynagogues', 'synagogues'],
  ['syneagogue', 'synagogue'],
  ['syneagogues', 'synagogues'],
  ['cemeterie', 'cemeteries'],
  ['cemetary', 'cemetery'],
  ['commmunity', 'community'],
  ['commnnity', 'community'],
  ['steet', 'street'],
  ['stret', 'street'],
  ['templ', 'temple'],
  ['schoo', 'school'],
  ['rabbl', 'rabbi'],
  ['tombstonc', 'tombstone'],
  ['gravestonc', 'gravestone'],
]);

/** Fold one lowercase token to its canonical domain form. */
export const canonicalizeDomainToken = (token) => OCR_DOMAIN_CANONICAL.get(String(token ?? '').toLowerCase()) ?? token;

/** Fold every damaged domain word in a display label, preserving spacing. */
export const canonicalizeDomainText = (value) => String(value ?? '').replace(/[A-Za-zÀ-ÿ]+/gu, (word) => {
  const canonical = OCR_DOMAIN_CANONICAL.get(word.toLowerCase());
  if (!canonical) return word;
  // Keep the original capitalisation shape: Synagoque -> Synagogue.
  return /^[A-ZÀ-Þ]/u.test(word) ? canonical[0].toUpperCase() + canonical.slice(1) : canonical;
});

/**
 * Report every damaged domain word in a page of reading text.
 *
 * The machine must not fail silently: OCR damage that we chose not to repair
 * in the text still has to be visible to a reviewer, with its exact position.
 */
export const findOcrDamage = (readingText) => {
  const rows = [];
  for (const match of String(readingText ?? '').matchAll(/[A-Za-zÀ-ÿ]+/gu)) {
    const canonical = OCR_DOMAIN_CANONICAL.get(match[0].toLowerCase());
    if (!canonical) continue;
    rows.push({ token: match[0], canonical, reading_start: match.index, reading_end: match.index + match[0].length });
  }
  return rows;
};
