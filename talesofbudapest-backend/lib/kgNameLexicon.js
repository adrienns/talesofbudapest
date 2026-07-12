// ============================================================================
// KG name lexicon -- a curated "backup map" for Hungarian<->English landmark
// names that the shared normalizer (lib/kgNormalize.js) can't unify by itself.
//
// normalizeLocationName already canonicalizes GENERIC type-words in both
// languages ("utca"/"street" -> "street", "hid"/"bridge" -> "bridge", ...),
// so bilingual mentions of the SAME name already collide (Dohany utca /
// Dohany Street both normalize to "dohany street"). What normalization can't
// fix is a landmark whose Hungarian and English names are actually DIFFERENT
// WORDS -- "Erzsebet hid" vs "Elisabeth Bridge", "Orszaghaz" vs "Hungarian
// Parliament Building". That's what this file is for.
//
// ----------------------------------------------------------------------------
// HOW TO ADD A MISSING PAIR
// ----------------------------------------------------------------------------
// `npm run eval:kg-matching`'s exact_hit_rate failures ARE the to-do list:
// each failing translation-pair case names a mention and the public landmark
// it should have matched. To fix one:
//
//   1. Run both names through normalizeLocationName (import it, or read
//      lib/kgNormalize.test.js for examples) and use THOSE strings, not the
//      raw Hungarian/English text. Every key and value below is already
//      normalized: lowercase, diacritics folded, type-words canonicalized.
//      Example: "Matyas templom" normalizes to "matyas church" (the
//      "templom" is already gone) -- NOT "matyas templom".
//   2. Pick a tier (below) and add one array/entry. Every group is
//      automatically bidirectional -- never add the reverse direction
//      yourself.
//   3. Re-run `npm run eval:kg-matching -- --offline` and confirm the case
//      now passes and no negative broke.
//
// ----------------------------------------------------------------------------
// THE THREE TIERS (applied in this order by expandNameVariants)
// ----------------------------------------------------------------------------
//   1. FULL_NAME_GROUPS -- whole-name equivalence groups, highest precision.
//      Use this whenever word order changes between the two languages, the
//      translation is idiomatic (not a token-for-token swap), or a bare-word
//      substitution would risk a false positive elsewhere. Example: "var"
//      (castle) is deliberately NOT a bare token->"castle" substitution
//      below, because that would also fire on "Var utca" (a real, different
//      street literally named "Castle Street") -- every "var"-containing
//      landmark name is instead spelled out as a full-name group.
//   2. GIVEN_NAMES -- person given/regnal names, Hungarian <-> English,
//      applied token-by-token or phrase-by-phrase ("ferenc jozsef" is
//      substituted as one two-token unit, not word-by-word).
//   3. CONCEPT_WORDS -- ordinary-word equivalences, applied the same way as
//      GIVEN_NAMES. Kept conservative: only unambiguous, whole-word
//      translations that can't collide with an unrelated name.
//
// GIVEN_NAMES and CONCEPT_WORDS are merged into one substitution pass, so
// either can appear in the same name (e.g. "Szent Istvan-bazilika").
import { normalizeLocationName } from './kgNormalize.js';

// --- Tier 1: whole-name equivalence groups ---------------------------------
// Every array below is a group of interchangeable normalized full names for
// the SAME landmark. Add a new landmark by adding a new array; add a missing
// spelling/historical variant of an existing landmark by adding a string to
// its array.
export const FULL_NAME_GROUPS = [
  // Liberty Bridge and its pre-1945 names (honoring Franz Joseph I / Ferenc
  // Jozsef). "Szabadsag hid" -> "Liberty Bridge" is NOT here: that pair is a
  // plain word-for-word translation (szabadsag <-> liberty/freedom), handled
  // by CONCEPT_WORDS below instead.
  ['ferencz jozsef bridge', 'franz joseph bridge', 'francis joseph bridge', 'liberty bridge'],
  // Szechenyi Chain Bridge, including its everyday short name "Lanchid".
  ['lanchid', 'szechenyi lanchid', 'szechenyi chain bridge', 'chain bridge'],
  ['halaszbastya', 'fisherman s bastion'],
  // Buda Castle / the Royal Palace of Buda, plus its historical German name
  // ("Ofen" = Buda). Kept as full-name groups rather than a bare
  // "var" -> "castle" CONCEPT_WORD -- see the tier-1 note above.
  ['budai var', 'budai kiralyi var', 'budavari palace', 'castle of ofen', 'buda castle'],
  // Vajdahunyad Castle is a DIFFERENT castle from Buda Castle -- kept in its
  // own group so the two never merge.
  ['vajdahunyad vara', 'vajdahunyad castle'],
  ['hosok tere', 'heroes square'],
  ['vasarcsarnok', 'nagyvasarcsarnok', 'great market hall'],
  // "Nagy Zsinagoga" normalizes to "nagy synagogue", not "nagy zsinagoga":
  // normalizeLocationName already canonicalizes "zsinagoga" -> "synagogue".
  ['nagy synagogue', 'great synagogue'],
  ['belvarosi plebaniatemplom', 'inner city parish church'],
  ['orszaghaz', 'hungarian parliament building'],
  // Kept as a full-name group (not szent->st + istvan->stephen composition)
  // because "St. Stephen's Basilica" normalizes with a stray possessive
  // token ("st stephen s basilica") that a straight word-for-word
  // substitution of "Szent Istvan bazilika" would not reproduce.
  ['szent istvan bazilika', 'st stephen s basilica'],
  ['varosliget', 'city park'],
  ['sziklakorhaz atombunker muzeum', 'hospital in the rock nuclear bunker museum'],
  ['rudas baths', 'rudas thermal baths and swimming pool'],
  ['cipok a duna parton', 'shoes on the danube bank'],
  ['terror haza', 'house of terror museum'],
  // Word order shifts between "X tudomanyos akademia" and "X academy of
  // sciences", so this is a full-name group rather than composed tokens.
  ['magyar tudomanyos akademia', 'hungarian academy of sciences'],
];

// --- Tier 2: person given/regnal names --------------------------------------
// key -> one normalized alternative, or an array of alternatives.
export const GIVEN_NAMES = {
  erzsebet: ['elisabeth', 'elizabeth'],
  margit: 'margaret',
  istvan: 'stephen',
  'ferenc jozsef': ['franz joseph', 'francis joseph'],
  'ferencz jozsef': ['franz joseph', 'francis joseph'],
  matyas: 'matthias',
  karoly: ['charles', 'karl'],
  jozsef: 'joseph',
  sandor: 'alexander',
  laszlo: 'ladislaus',
  janos: 'john',
};

// --- Tier 3: ordinary-word equivalences -------------------------------------
// Conservative on purpose: only add a word here if it cannot plausibly mean
// something else inside an unrelated Budapest place name.
export const CONCEPT_WORDS = {
  szabadsag: ['liberty', 'freedom'],
  kiralyi: 'royal',
  hosok: 'heroes',
  vasarcsarnok: 'market hall',
  palyaudvar: 'railway station',
  szigete: 'island',
  magyar: 'hungarian',
  allami: 'state',
  operahaz: 'opera house',
  nemzeti: 'national',
  muzeum: 'museum',
  szobor: 'statue',
  // "vara" (its castle, a possessive/inflected form, e.g. "Vajdahunyad
  // vara") is distinct from the bare nominative token "var" -- see the
  // tier-1 note on why bare "var" is never substituted directly.
  vara: 'castle',
  szent: 'st',
};

// Combinatorics are capped here: a token/phrase substitution pass can fan
// out multiple options per slot, and the (optional) person order-swap step
// can double that again. 16 comfortably covers every case this file
// currently handles (the widest case is a 3-token name with one 2-way and
// one 3-way substitution slot = 6 combinations) while keeping
// expandNameVariants() cheap enough to call inside the resolver's
// O(mentions x candidates) scoring loop.
export const MAX_VARIANTS = 16;

// A hard ceiling on the intermediate cartesian product generated while
// building combinations, independent of MAX_VARIANTS -- a safety net against
// a pathological future entry (e.g. many multi-way slots in one name) making
// this loop expensive, not a value callers should ever see reflected in
// their results.
const CARTESIAN_HARD_LIMIT = 64;

const buildEquivalenceMap = (entries) => {
  const map = new Map();
  for (const [key, rawValues] of entries) {
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    const group = new Set([key, ...values]);
    for (const member of group) map.set(member, group);
  }
  return map;
};

const buildGroupMap = (groups) => {
  const map = new Map();
  for (const group of groups) {
    const groupSet = new Set(group);
    for (const member of group) map.set(member, groupSet);
  }
  return map;
};

const FULL_NAME_MAP = buildGroupMap(FULL_NAME_GROUPS);
const WORD_EQUIVALENCE_MAP = buildEquivalenceMap([
  ...Object.entries(GIVEN_NAMES),
  ...Object.entries(CONCEPT_WORDS),
]);

// Splits `name` into slots (each either a fixed single token, or a 1- or
// 2-token span that has known equivalents), then returns every combination
// of picking one option per slot, joined back into a normalized string.
// Longest-match-first: a 2-token phrase key ("ferenc jozsef") is checked
// before treating either half as an independent single-token key.
const tokenSubstitutionVariants = (name, equivalenceMap) => {
  const tokens = name.split(' ').filter(Boolean);
  const slots = [];
  for (let i = 0; i < tokens.length;) {
    if (i + 1 < tokens.length) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      const group = equivalenceMap.get(phrase);
      if (group) { slots.push([...group]); i += 2; continue; }
    }
    const group = equivalenceMap.get(tokens[i]);
    slots.push(group ? [...group] : [tokens[i]]);
    i += 1;
  }

  let combos = [[]];
  for (const options of slots) {
    const next = [];
    outer:
    for (const combo of combos) {
      for (const option of options) {
        next.push([...combo, option]);
        if (next.length >= CARTESIAN_HARD_LIMIT) break outer;
      }
    }
    combos = next;
    if (combos.length >= CARTESIAN_HARD_LIMIT) break;
  }
  return combos.map((parts) => parts.join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
};

// Expands a normalized location/person name into every normalized variant
// the lexicon knows about (including the input itself). `entityKind` only
// changes behavior for 'person': in addition to the tier-2/3 substitutions
// applied to every kind, a two-token person name also gets its word order
// swapped ("liszt ferenc" <-> "ferenc liszt") both before and after
// given-name translation.
export const expandNameVariants = (normalizedName, { entityKind = 'location' } = {}) => {
  const seed = String(normalizedName ?? '').trim();
  if (!seed) return [];
  const variants = new Set([seed]);

  const fullNameGroup = FULL_NAME_MAP.get(seed);
  if (fullNameGroup) for (const member of fullNameGroup) variants.add(member);

  const addAll = (names) => {
    for (const name of names) {
      for (const generated of tokenSubstitutionVariants(name, WORD_EQUIVALENCE_MAP)) {
        variants.add(generated);
        if (variants.size >= MAX_VARIANTS) return true;
      }
    }
    return variants.size >= MAX_VARIANTS;
  };

  if (!addAll([...variants])) {
    if (entityKind === 'person') {
      const swapped = [];
      for (const name of [...variants]) {
        const tokens = name.split(' ').filter(Boolean);
        if (tokens.length !== 2) continue;
        const flipped = `${tokens[1]} ${tokens[0]}`;
        variants.add(flipped);
        swapped.push(flipped);
        if (variants.size >= MAX_VARIANTS) break;
      }
      if (variants.size < MAX_VARIANTS) addAll(swapped);
    }
  }

  return [...variants].slice(0, MAX_VARIANTS);
};

// Re-exported for convenience so callers that already import normalization
// helpers from this module don't need a second import line.
export { normalizeLocationName };
