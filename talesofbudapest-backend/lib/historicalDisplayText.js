/** Join only literal lowercase line-break hyphenation in presentation text. */
export const displayReadingText = (value) => String(value ?? '').replace(/(\p{L})-\s*\r?\n\s*(\p{Ll})/gu, '$1$2');

/**
 * Optional display-layer OCR polish for place names in presentation surfaces.
 * Prefer calling repairKnownOcrInText at build/export time (with places index);
 * this wrapper documents the display contract and applies hyphen joining first.
 *
 * Immutable pages.txt / JSONL evidence offsets stay untouched — callers must
 * stash ocr_* raw fields when rewriting display fields.
 */
export const polishDisplayPlaceOcr = (value, placesIndex = null, repairKnownOcrInText = null) => {
  const joined = displayReadingText(value);
  if (!placesIndex || typeof repairKnownOcrInText !== 'function') return joined;
  return repairKnownOcrInText(joined, placesIndex).text;
};
