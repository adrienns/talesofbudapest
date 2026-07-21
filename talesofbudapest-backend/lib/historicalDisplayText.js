/** Join only literal lowercase line-break hyphenation in presentation text. */
export const displayReadingText = (value) => String(value ?? '').replace(/(\p{L})-\s*\r?\n\s*(\p{Ll})/gu, '$1$2');
