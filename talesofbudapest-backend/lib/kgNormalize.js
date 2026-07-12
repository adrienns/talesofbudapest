// Canonical text normalization for the knowledge graph. Two normalizers live
// here on purpose, each solving a different problem:
//
// - normalizeLocationName: the "real" normalizer used everywhere identity
//   matters (alias rows, exact-name comparisons, the resolver's scoring).
//   NFKD + diacritic fold + lowercase + phrase collapse + saint/st fold +
//   district-noise strip + Hungarian<->English generic-term canonicalization
//   (TYPE_WORDS) so "Dohány utca" and "Dohany Street" land on the same
//   normalized string.
// - simpleFold: the older, simpler fold (diacritic strip + lowercase +
//   non-alnum -> space) with no TYPE_WORDS canonicalization. Kept alive only
//   for callers that must NOT change behavior when normalizeLocationName's
//   canonicalization logic evolves -- notably lib/kgPromotion.js's edge
//   signature hashing, where a changed normalized value produces a different
//   stableUuid and therefore a duplicate edge on re-promotion. See
//   lib/kgPromotion.js normalizePredicate for the one caller that must keep
//   using simpleFold rather than normalizeLocationName.
const DIACRITICS = /[\u0300-\u036f]/g;

// Hungarian<->English generic-term equivalence. Every value is itself a key so
// both languages collapse onto the same canonical English token regardless of
// which direction the mention or the public location name came from.
export const TYPE_WORDS = new Map([
  ['utca', 'street'], ['utcai', 'street'], ['u', 'street'], ['street', 'street'], ['strasse', 'street'], ['gasse', 'street'],
  ['ter', 'square'], ['square', 'square'], ['platz', 'square'],
  ['korut', 'boulevard'], ['boulevard', 'boulevard'], ['ring', 'boulevard'],
  ['ut', 'road'], ['road', 'road'], ['avenue', 'road'],
  ['hid', 'bridge'], ['bridge', 'bridge'], ['brucke', 'bridge'],
  ['rakpart', 'quay'], ['quay', 'quay'], ['embankment', 'quay'],
  ['zsinagoga', 'synagogue'], ['synagogue', 'synagogue'], ['temple', 'synagogue'],
  ['temeto', 'cemetery'], ['cemetery', 'cemetery'],
  ['templom', 'church'], ['church', 'church'],
  ['furdo', 'baths'], ['baths', 'baths'], ['bath', 'baths'],
  ['sziget', 'island'], ['island', 'island'],
  ['kavehaz', 'cafe'], ['cafe', 'cafe'], ['coffeehouse', 'cafe'],
  ['palota', 'palace'], ['palace', 'palace'],
]);

// Multi-word phrases collapsed onto a single canonical token before splitting,
// so "coffee house" / "coffee-house" / "coffeehouse" all normalize the same
// way as Hungarian "kávéház".
export const PHRASE_WORDS = [[/\bcoffee[\s-]?house\b/g, 'cafe']];

// Roman-numeral or arabic district prefixes ("VII.", "7th district",
// "district VII", "7. kerulet") carry no identity signal and are stripped.
export const LEADING_ROMAN_DISTRICT = /^([ivxlcdm]{1,6})\.\s+/;
export const DISTRICT_NOISE = /\b(?:[ivxlcdm]{1,6}\.?\s*(?:ker\.?|kerulet)\.?|\d{1,2}\.?\s*(?:ker\.?|kerulet)\.?|\d{1,2}(?:st|nd|rd|th)\s*district|district\s*(?:\d{1,2}|[ivxlcdm]{1,6}))\b/gi;
export const LEADING_ARTICLE = /^the\s+/;

export const normalizeLocationName = (value) => {
  let text = String(value ?? '').normalize('NFKD').replace(DIACRITICS, '').toLocaleLowerCase('en');
  for (const [pattern, replacement] of PHRASE_WORDS) text = text.replace(pattern, replacement);
  text = text
    .replace(/\b(saint|st\.)\b/g, 'st')
    .replace(DISTRICT_NOISE, ' ')
    .replace(LEADING_ROMAN_DISTRICT, '')
    .replace(LEADING_ARTICLE, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!text) return '';
  return text.split(/\s+/).filter(Boolean).map((token) => TYPE_WORDS.get(token) ?? token).join(' ');
};

// The old, simpler fold: NFKD + diacritic strip + lowercase + non-alnum -> space.
// No TYPE_WORDS canonicalization, no district/article stripping. This is
// exactly lib/kgPromotion.js's pre-unification `normalizeAlias` behavior,
// preserved verbatim as a named export for callers that depend on its exact
// (simpler, more stable) output.
export const simpleFold = (value) => String(value ?? '').normalize('NFKD').replace(DIACRITICS, '')
  .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();
