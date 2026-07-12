// The canonical normalizer lives in lib/kgNormalize.js (shared with
// kgPromotion.js's alias writes and kgHybridSearch.js's query-side
// canonicalization). Re-exported here so existing import sites
// (`from '../lib/kgLocationResolver.js'`) keep working unchanged.
import { normalizeLocationName } from './kgNormalize.js';
import { expandNameVariants } from './kgNameLexicon.js';

export { normalizeLocationName };

const GENERIC = new Set(['the', 'of', 'at', 'in', 'budapest', 'hungary']);
const FRONT_MATTER = /\b(publisher|publishing house|printer|isbn|copyright|editorial office|typeset|catalogue record|cover design|photo credit|contents|bibliography|index)\b/i;
const FOREIGN_ADDRESS = /\b(austria|germany|poland|romania|slovakia|ukraine|serbia|croatia|united states|new york|london|paris|berlin|vienna|prague)\b/i;
const OBVIOUS_NON_BUDAPEST = /\b(new york|highland lakes|plymouth|united kingdom|usa|vienna|prague|vatican|mainz|constantinople|salonika|vidin|sofia|kavala|safed|adrianople|istanbul|holy land|belgrade|eisenstadt|austria|bratislava|slovakia|bohemia|moravia|transylvania|brody|italy|pressburg|tubingen|notzingen)\b/i;
const BUDAPEST_SIGNAL = /\b(budapest|buda|pest|obuda|district\s+[ivxlcdm]+|hungary|utca|street|ter|square|synagogue|zsinagoga|cemetery|temeto)\b/i;

// Some p1 restricted-book extractions mistakenly put a page marker
// ("PDF Page 15") or a bare page number in `source_name` instead of the
// as-written name. Never let that leak into alias/exact-match comparisons -
// it would otherwise produce false exact-name auto-links between unrelated
// mentions that merely share a page. p2 extractions do not have this defect.
const JUNK_ALIAS = /^(?:pdf\s*page(?:\s*\d+)?|page\s*\d+|\d+)$/i;
const isUsableAliasSource = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 && !JUNK_ALIAS.test(trimmed);
};

// Type-word canonicalization already happens inside normalizeLocationName
// (see lib/kgNormalize.js's TYPE_WORDS), so a bilingual mention of the SAME
// name already collides here without any extra work ("Dohany utca" and
// "Dohany Street" both normalize to "dohany street"). What normalization
// can't do is translate a name into genuinely DIFFERENT words between
// languages ("Erzsebet hid" vs "Elisabeth Bridge") -- that's
// expandNameVariants' job (lib/kgNameLexicon.js), applied here to every
// normalized alias so both the mention and the candidate side of a
// comparison get the same lexicon-derived variants automatically.
export const locationAliases = (location) => {
  const values = [location?.name, location?.name_en, location?.source_name, location?.source_name_hu].filter(isUsableAliasSource);
  if (Array.isArray(location?.aliases)) values.push(...location.aliases.filter(isUsableAliasSource));
  const normalized = values.map(normalizeLocationName).filter(Boolean);
  const expanded = normalized.flatMap((name) => expandNameVariants(name, { entityKind: 'location' }));
  return [...new Set(expanded)];
};

const tokens = (value) => new Set(normalizeLocationName(value).split(' ').filter((token) => token && !GENERIC.has(token)));

export const tokenSimilarity = (left, right) => {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
};

export const haversineMeters = (a, b) => {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude); const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const compatibleKinds = (left, right) => {
  const a = normalizeLocationName(left); const b = normalizeLocationName(right);
  if (!a || !b) return null;
  if (['iconic', 'landmark', 'location', 'place', 'site'].includes(a) || ['iconic', 'landmark', 'location', 'place', 'site'].includes(b)) return null;
  if (a === b) return true;
  const groups = [['synagogue', 'religious building', 'place of worship'], ['street', 'road'], ['cemetery', 'burial ground']];
  return groups.some((group) => group.includes(a) && group.includes(b));
};

// Auto-link rule (docs/KG_APP_SYSTEM.md "Entity resolution"): score >= 0.90
// AND (exact normalized alias/name match OR distance <= 50m). Vector
// similarity alone can never satisfy either arm of that OR, so it can never
// push a candidate into auto-link territory by itself.
const AUTO_LINK_DISTANCE_METERS = 50;
const DEFAULT_AUTO_MATCH_THRESHOLD = 0.9;

// district/street_name/house_number are optional fields a mention or
// candidate may carry from KG staging metadata (`kg_locations`) or from a
// `cli/geocode-kg.js` `.geocoded.json` report (see `hungarianAddress.js`
// `parseBudapestAddress` and `kgGeocoder.js` `extractNominatimAddress`).
// Absent on either side => neutral, never a penalty.
const compareDistricts = (mentionDistrict, candidateDistrict) => {
  const a = Number.isInteger(mentionDistrict) ? mentionDistrict : null;
  const b = Number.isInteger(candidateDistrict) ? candidateDistrict : null;
  if (a === null || b === null) return null;
  return a === b;
};

// Deterministic address-level corroboration: the same normalized street name
// AND the same house number. Neither side merely "close" — an exact street
// name match with differing house numbers is not evidence these are the same
// building, so it does not count.
const streetAndHouseNumberAgree = (mention, candidate) => {
  const mentionStreet = normalizeLocationName(mention?.street_name);
  const candidateStreet = normalizeLocationName(candidate?.street_name);
  if (!mentionStreet || !candidateStreet || mentionStreet !== candidateStreet) return false;
  const mentionHouse = String(mention?.house_number ?? '').trim();
  const candidateHouse = String(candidate?.house_number ?? '').trim();
  return Boolean(mentionHouse) && mentionHouse === candidateHouse;
};

export const scoreLocationCandidate = (mention, candidate, options = {}) => {
  const mentionAliases = locationAliases(mention); const candidateAliases = locationAliases(candidate);
  const exactName = mentionAliases.some((alias) => candidateAliases.includes(alias));
  const nameSimilarity = Math.max(0, ...mentionAliases.flatMap((a) => candidateAliases.map((b) => tokenSimilarity(a, b))));
  const kindMatch = compatibleKinds(mention?.kind ?? mention?.location_kind, candidate?.kind ?? candidate?.landmark_type);
  const mentionAddress = normalizeLocationName(mention?.address_en ?? mention?.address);
  const candidateAddress = normalizeLocationName(candidate?.address_en ?? candidate?.address);
  const addressSimilarity = mentionAddress && candidateAddress ? tokenSimilarity(mentionAddress, candidateAddress) : 0;
  const distanceMeters = haversineMeters(mention, candidate);
  const proximity = distanceMeters === null ? 0 : distanceMeters <= AUTO_LINK_DISTANCE_METERS ? 1 : distanceMeters <= 150 ? 0.7 : distanceMeters <= 500 ? 0.25 : 0;
  const vectorSimilarity = Math.max(0, Math.min(1, Number(options.vectorSimilarity) || 0));
  const closeEnough = distanceMeters !== null && distanceMeters <= AUTO_LINK_DISTANCE_METERS;

  // true = both known and equal, false = both known and different, null = at
  // least one side unknown (neutral evidence, no bonus or penalty).
  const districtAgreement = compareDistricts(mention?.district, candidate?.district);
  const districtConflict = districtAgreement === false;
  const streetNumberMatch = streetAndHouseNumberAgree(mention, candidate);

  // `deterministic` is the broader "this needs a human, not a vector guess"
  // signal used for review triage. `autoLinkEligible` is the narrower design
  // rule that actually gates automatic linking: an exact normalized name/alias
  // match, or coordinates within 50m of each other. Address-token similarity
  // and street+house-number agreement contribute to score but are deliberately
  // excluded from the auto-link gate. A district conflict is a strong enough
  // negative signal (the same street name recurs across many districts) that
  // it vetoes auto-link eligibility outright — even over an exact name match.
  const deterministic = exactName || addressSimilarity >= 0.6 || proximity >= 0.7 || streetNumberMatch;
  const autoLinkEligible = (exactName || closeEnough) && !districtConflict;

  let score;
  if (exactName) {
    // An exact normalized name/alias match is the strong deterministic signal
    // the design calls for: it alone clears the 0.90 auto-link bar, and a
    // kind-field mismatch (often just noisy landmark_type data) can only pull
    // it down to the threshold, never below it. A district conflict does not
    // need to crater the score too — autoLinkEligible above already vetoes
    // auto-link regardless of how high the score is — but it still counts as
    // a real negative so a conflicting candidate never outranks a clean one.
    score = 0.93
      + (kindMatch === true ? 0.05 : kindMatch === false ? -0.02 : 0)
      + addressSimilarity * 0.03 + proximity * 0.03 + vectorSimilarity * 0.01
      + (districtAgreement === true ? 0.02 : districtConflict ? -0.1 : 0)
      + (streetNumberMatch ? 0.02 : 0);
  } else {
    score = nameSimilarity * 0.4 + (kindMatch === true ? 0.08 : kindMatch === false ? -0.08 : 0)
      + addressSimilarity * 0.18 + proximity * 0.27 + vectorSimilarity * 0.13
      + (districtAgreement === true ? 0.1 : districtConflict ? -0.25 : 0)
      + (streetNumberMatch ? 0.15 : 0);
  }
  score = Math.max(0, Math.min(1, score));
  const autoMatch = autoLinkEligible && score >= (options.autoMatchThreshold ?? DEFAULT_AUTO_MATCH_THRESHOLD);
  return {
    score: Number(score.toFixed(4)), autoMatch, deterministic, autoLinkEligible,
    signals: {
      exactName, nameSimilarity: Number(nameSimilarity.toFixed(4)), kindMatch, addressSimilarity: Number(addressSimilarity.toFixed(4)),
      distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters), vectorSimilarity,
      districtAgreement, districtConflict, streetNumberMatch,
    },
  };
};

// Provenance for an auto-linked candidate: which arm of the auto-link OR
// condition actually justified it. Returns null when the candidate is not
// auto-link eligible at all.
export const autoLinkMatchReason = (result) => {
  if (!result?.autoLinkEligible) return null;
  if (result?.signals?.exactName) return 'exact_alias';
  if (result?.signals?.distanceMeters !== null && result?.signals?.distanceMeters !== undefined && result.signals.distanceMeters <= AUTO_LINK_DISTANCE_METERS) return 'distance';
  return null;
};

export const classifyRestrictedLocation = (location) => {
  const name = String(location?.name_en ?? '').trim();
  const address = String(location?.address_en ?? '');
  const evidence = Object.values(location?.evidence ?? {}).join(' ');
  const combined = `${name} ${address} ${evidence}`;
  if (!name) return { accept: false, reason: 'missing_name' };
  if (FRONT_MATTER.test(combined)) return { accept: false, reason: 'front_matter_or_metadata' };
  if ((FOREIGN_ADDRESS.test(address) || OBVIOUS_NON_BUDAPEST.test(name)) && !/budapest/i.test(address)) return { accept: false, reason: 'explicitly_non_budapest' };
  return { accept: true, reason: BUDAPEST_SIGNAL.test(combined) ? 'budapest_signal' : 'requires_location_review' };
};

export const rankLocationCandidates = (mention, candidates, vectorSimilarities = new Map(), limit = 5, options = {}) => candidates
  .map((candidate) => ({
    candidate,
    ...scoreLocationCandidate(mention, candidate, { vectorSimilarity: vectorSimilarities.get(candidate.id), autoMatchThreshold: options.autoMatchThreshold }),
  }))
  .filter((result) => result.score >= 0.2)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);
