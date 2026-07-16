/**
 * Deterministic Budapest address/street-reference extraction over the
 * reading-view text, with OCR-tolerant matching against the street gazetteer
 * (OpenStreetMap-derived modern names plus seeded historical renames).
 *
 * Facts only: this module records that the source text references a street or
 * address at exact offsets. It copies nothing from any third-party database
 * beyond street names, which are facts.
 */

const STREET_TYPE_CANONICAL = {
  utca: 'utca', u: 'utca',
  'út': 'út', ut: 'út', it: 'út', tt: 'út', gt: 'út',
  'tér': 'tér', ter: 'tér',
  'körút': 'körút', korut: 'körút', krt: 'körút',
  rakpart: 'rakpart',
  'köz': 'köz', koz: 'köz',
  sor: 'sor',
  fasor: 'fasor',
  'sétány': 'sétány', setany: 'sétány',
  liget: 'liget',
  lejtő: 'lejtő', lejto: 'lejtő',
};
// OCR-degraded type tokens that also occur as ordinary words; a reference
// using one must match the gazetteer or it is dropped.
const WEAK_TYPES = new Set(['it', 'tt', 'gt', 'u', 'ter', 'ut']);
const NAME_STOPWORDS = new Set(['the', 'in', 'on', 'at', 'of', 'a', 'an', 'and', 'or', 'from', 'to', 'near', 'this', 'that', 'old', 'new']);

export const normalizeStreetKey = (value) => String(value ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();

const editDistance = (left, right, cap) => {
  if (Math.abs(left.length - right.length) > cap) return cap + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > cap) return cap + 1;
    previous = current;
  }
  return previous[right.length];
};

/** Index a gazetteer document for exact, historical, and fuzzy lookup. */
export const buildStreetIndex = (gazetteer) => {
  const exact = new Map();
  const rows = [];
  for (const street of gazetteer.streets ?? []) {
    if (!street.key) continue;
    if (!exact.has(street.key)) exact.set(street.key, { street, matched_via: 'exact' });
    rows.push(street);
    for (const historical of street.historical ?? []) {
      if (historical.key && !exact.has(historical.key)) {
        exact.set(historical.key, { street, matched_via: 'historical', historical_name: historical.name });
      }
    }
  }
  return { exact, rows };
};

export const matchStreet = (index, rawName, canonicalType) => {
  const key = `${normalizeStreetKey(rawName)} ${normalizeStreetKey(canonicalType)}`.trim();
  const direct = index.exact.get(key);
  if (direct) return { ...direct, key };
  const cap = key.length >= 9 ? 2 : key.length >= 6 ? 1 : 0;
  if (!cap) return null;
  let best = null;
  for (const street of index.rows) {
    if (street.key[0] !== key[0]) continue;
    const distance = editDistance(key, street.key, cap);
    if (distance <= cap && (!best || distance < best.distance)) {
      best = { street, matched_via: 'fuzzy', distance, key };
      if (distance === 1) break;
    }
  }
  return best;
};

const STREET_PATTERN = /\b([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]*(?:\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]*){0,3})\s+([Uu]tca|[ÚúUu]t|[Ii]t|[Tt]t|[Gg]t|[Tt][ée]r|[Kk][öo]r[úu]t|[Kk]rt|[Rr]akpart|[Kk][öo]z|[Ss]or|[Ff]asor|[Ss][ée]t[áa]ny|[Ll]iget|[Ll]ejt[őo]|[Uu]\.)\b\.?(?:\s+(\d{1,3}(?:\s*[-/]\s*\d{1,3})?[a-z]?)(?![\d.]))?/gu;

/**
 * Extract street/address references from one page of reading text.
 * Returns rows with reading-relative offsets; the caller maps to raw offsets.
 */
export const extractAddressReferences = (readingText, index = null) => {
  const rows = [];
  for (const match of String(readingText ?? '').matchAll(STREET_PATTERN)) {
    const [, rawName, rawType, houseNumber] = match;
    const nameTokens = rawName.split(/\s+/u);
    if (nameTokens.every((token) => NAME_STOPWORDS.has(token.toLowerCase()))) continue;
    const typeToken = rawType.toLowerCase().replace(/\.$/u, '');
    const canonicalType = STREET_TYPE_CANONICAL[typeToken];
    if (!canonicalType) continue;
    const matched = index ? matchStreet(index, rawName, canonicalType) : null;
    // Weak/OCR type tokens must be confirmed by the gazetteer.
    if (WEAK_TYPES.has(typeToken) && !matched) continue;
    rows.push({
      street_raw: `${rawName} ${rawType}`,
      street_name_raw: rawName,
      street_type: canonicalType,
      house_number: houseNumber ? houseNumber.replace(/\s+/gu, '') : null,
      reading_start: match.index,
      reading_end: match.index + match[0].length,
      modern_street: matched?.street?.modern ?? null,
      street_key: matched?.key ?? null,
      matched_via: matched?.matched_via ?? null,
      historical_name: matched?.historical_name ?? null,
      center: matched?.street?.center ?? null,
    });
  }
  return rows;
};
