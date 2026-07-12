// Pure parsing of Budapest address strings staged from the KG pipeline
// (name_en / source_name / address_en / source_address_hu). No I/O — this
// module only classifies free text into { street_name, street_type,
// house_number, district, postcode }, all nullable. It is deliberately
// conservative: ambiguous or name-only text yields nulls rather than a
// guess, since a wrong guess would poison downstream auto-link scoring.

const ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** Standard subtractive-notation roman numeral -> integer. Returns null for non-roman input. */
const romanToInt = (roman) => {
  const s = String(roman ?? '').toUpperCase();
  if (!/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_VALUES[s[i]];
    const next = ROMAN_VALUES[s[i + 1]];
    total += next && cur < next ? -cur : cur;
  }
  return total;
};

const romanToDistrict = (roman) => {
  const n = romanToInt(roman);
  return n !== null && n >= 1 && n <= 23 ? n : null;
};

const arabicToDistrict = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 23 ? n : null;
};

const ROMAN_DISTRICT_TABLE = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Integer 1-23 -> roman numeral district label (e.g. 7 -> "VII"). Returns null outside that range. */
export const formatDistrictRoman = (district) => {
  const n = Number(district);
  if (!Number.isInteger(n) || n < 1 || n > 23) return null;
  let remaining = n;
  let out = '';
  for (const [value, symbol] of ROMAN_DISTRICT_TABLE) {
    while (remaining >= value) { out += symbol; remaining -= value; }
  }
  return out;
};

/**
 * Budapest postal codes are 1XXY: the district is the 2nd+3rd digit (01-23).
 * Returns null for non-Budapest or malformed codes.
 */
export const districtFromPostcode = (postcode) => {
  const s = String(postcode ?? '').trim();
  if (!/^\d{4}$/.test(s) || s[0] !== '1') return null;
  const mid = Number(s.slice(1, 3));
  return mid >= 1 && mid <= 23 ? mid : null;
};

const KERULET_RE = '(?:ker[üu]let|ker\\.)';

// Ordered district-marker extractors. Each returns { district, remaining }
// on success or null. Only these specific shapes count as a district marker
// — a bare "II." followed by a name (e.g. "II. János Pál pápa tér", where
// the roman numeral is part of a papal name) matches none of them.
const DISTRICT_EXTRACTORS = [
  // Leading "VII., ..." position pattern.
  (text) => {
    const m = text.match(/^\s*([IVXLCDM]{1,6})\.,\s*/i);
    if (!m) return null;
    const district = romanToDistrict(m[1]);
    if (district === null) return null;
    return { district, remaining: text.slice(m[0].length) };
  },
  // Parenthesized roman numeral, e.g. "(VII)".
  (text) => {
    const m = text.match(/\(\s*([IVXLCDM]{1,6})\s*\)/i);
    if (!m) return null;
    const district = romanToDistrict(m[1]);
    if (district === null) return null;
    return { district, remaining: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}` };
  },
  // "District VII".
  (text) => {
    const m = text.match(/\bdistrict\s+([IVXLCDM]{1,6})\b/i);
    if (!m) return null;
    const district = romanToDistrict(m[1]);
    if (district === null) return null;
    return { district, remaining: text.replace(m[0], ' ') };
  },
  // "7th district".
  (text) => {
    const m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+district\b/i);
    if (!m) return null;
    const district = arabicToDistrict(m[1]);
    if (district === null) return null;
    return { district, remaining: text.replace(m[0], ' ') };
  },
  // "VII. kerület" / "VII kerület".
  (text) => {
    const m = text.match(new RegExp(`\\b([IVXLCDM]{1,6})\\.?\\s*${KERULET_RE}\\b`, 'i'));
    if (!m) return null;
    const district = romanToDistrict(m[1]);
    if (district === null) return null;
    return { district, remaining: text.replace(m[0], ' ') };
  },
  // "7. kerület" / "7 kerület".
  (text) => {
    const m = text.match(new RegExp(`\\b(\\d{1,2})\\.?\\s*${KERULET_RE}\\b`, 'i'));
    if (!m) return null;
    const district = arabicToDistrict(m[1]);
    if (district === null) return null;
    return { district, remaining: text.replace(m[0], ' ') };
  },
];

const extractDistrictMarker = (text) => {
  for (const extractor of DISTRICT_EXTRACTORS) {
    const result = extractor(text);
    if (result) return result;
  }
  return null;
};

// Leading "1074 Budapest, ..." — the only postcode position seen in staged
// text; postcode is otherwise indistinguishable from a house number.
const POSTCODE_LEADING_RE = /^(\d{4})[,\s]+budapest\b[,\s]*/i;

const extractPostcode = (text) => {
  const m = text.match(POSTCODE_LEADING_RE);
  if (!m) return null;
  return { postcode: m[1], remaining: text.slice(m[0].length) };
};

// Hungarian abbreviations that only count as a street-type token with their
// dot present (a bare "u" is too ambiguous to treat as "utca").
const DOTTED_ABBR = { 'u.': 'utca', 'krt.': 'körút', 'rkp.': 'rakpart', 'stny.': 'sétány' };

// Full words (Hungarian + English), matched with trailing punctuation
// stripped. Values are normalized/expanded within their own language —
// Hungarian abbreviations expand to the full Hungarian word, English words
// stay English (lowercased) — never translated across languages.
const FULL_WORDS = {
  utca: 'utca',
  körút: 'körút', kőrút: 'körút',
  rakpart: 'rakpart',
  tér: 'tér', tere: 'tér',
  útja: 'út', út: 'út',
  sétány: 'sétány',
  street: 'street', square: 'square', boulevard: 'boulevard', quay: 'quay',
};

/** Returns the canonical street_type for a single word token, or null if it isn't one. */
const matchStreetType = (rawWord) => {
  const lower = String(rawWord ?? '').trim().toLocaleLowerCase('hu');
  if (DOTTED_ABBR[lower]) return DOTTED_ABBR[lower];
  const bare = lower.replace(/[.,;:]+$/, '');
  return FULL_WORDS[bare] ?? null;
};

/**
 * Classifies the token immediately following a street-type word.
 * `consumed: true` means the token belongs to the address (even when it
 * carries no usable numeric value, e.g. a range or a plot reference);
 * `consumed: false` means the token is unrelated trailing text (e.g. a
 * building descriptor like "Synagogue"), which disqualifies the whole
 * street-type match — see parseStreetPortion.
 */
const classifyHouseNumberToken = (token) => {
  const t = String(token ?? '').trim();
  if (!t) return { consumed: false, value: null };
  if (/^\d+[–—-]\d+\.?$/.test(t)) return { consumed: true, value: null }; // range: 29-31 / 29–31
  if (/^\d+\/[a-zA-Z]\.?$/.test(t)) return { consumed: true, value: null }; // 2/a
  if (/^\d+[a-zA-Z]\.?$/.test(t)) return { consumed: true, value: null }; // 2b
  if (/^hrsz\.?$/i.test(t)) return { consumed: true, value: null }; // bare plot-ref keyword
  if (/^\d+\/\d+$/.test(t)) return { consumed: true, value: null }; // plot number, e.g. 0195/3
  if (/^\d+\.?$/.test(t)) return { consumed: true, value: t.replace(/\.$/, '') }; // plain house number
  return { consumed: false, value: null };
};

const isIgnorableTrailingWord = (word) => !word || word === ',' || /^budapest,?$/i.test(word);

/** Parses the street name/type/house number out of address text that has already had postcode and district markers removed. */
const parseStreetPortion = (text) => {
  const cleaned = text.replace(/^[\s,;:-]+/, '').replace(/[\s,;:-]+$/, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { street_name: null, street_type: null, house_number: null };

  const words = cleaned.split(' ');
  for (let i = 0; i < words.length; i++) {
    const streetType = matchStreetType(words[i]);
    if (!streetType) continue;

    const streetName = words.slice(0, i).join(' ').replace(/,\s*$/, '').trim();
    if (!streetName) continue; // a bare type word with no name isn't a real address

    const rest = words.slice(i + 1);
    let houseNumber = null;
    let consumedCount = 0;
    if (rest.length >= 2 && /^\d+\/\d+$/.test(rest[0]) && /^hrsz\.?$/i.test(rest[1])) {
      consumedCount = 2; // "<plot> hrsz." two-token plot reference
    } else if (rest.length > 0) {
      const classified = classifyHouseNumberToken(rest[0].replace(/,$/, ''));
      if (classified.consumed) { houseNumber = classified.value; consumedCount = 1; }
    }

    const leftover = rest.slice(consumedCount).filter((word) => !isIgnorableTrailingWord(word));
    if (leftover.length > 0) continue; // trailing words (e.g. "Synagogue") mean this wasn't an address after all

    return { street_name: streetName, street_type: streetType, house_number: houseNumber };
  }
  return { street_name: null, street_type: null, house_number: null };
};

/**
 * Classifies free-form Budapest location text into structured address
 * fields. Handles Hungarian and English street-type forms, district
 * prefixes/suffixes (roman or arabic, several phrasings), Budapest
 * postcodes, and common house-number variants (ranges, letter suffixes,
 * plot references) which are recognized but intentionally yield no
 * house_number value. Name-only input (no recognizable street form) and
 * junk input (empty, page markers, bare city names) yield all nulls.
 */
export const parseBudapestAddress = (text) => {
  const empty = { street_name: null, street_type: null, house_number: null, district: null, postcode: null };
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return empty;

  let working = trimmed;
  let postcode = null;
  let district = null;

  const postcodeMatch = extractPostcode(working);
  if (postcodeMatch) {
    postcode = postcodeMatch.postcode;
    working = postcodeMatch.remaining;
    district = districtFromPostcode(postcode);
  }

  const districtMatch = extractDistrictMarker(working);
  if (districtMatch) {
    district = districtMatch.district; // explicit marker overrides postcode-derived district
    working = districtMatch.remaining;
  }

  const street = parseStreetPortion(working);
  return { ...street, district, postcode };
};
