/**
 * Unique-hit Hungarian place OCR confusion repair against the Budapest
 * places gazetteer.
 *
 * Policy (2026-07-21): free edit-distance over reading text stays forbidden.
 * This module may fold location-like *identity keys and display labels* when
 * confusion candidates resolve to exactly one gazetteer target. Immutable OCR
 * evidence and offsets are never rewritten. Fail closed on ambiguity.
 * Person/family mentions must not call this against the street gazetteer.
 */
import {
  normalizePlaceKey,
  placeTokens,
} from './budapestPlacesGazetteer.js';
import { canonicalizeDomainToken, OCR_DOMAIN_CANONICAL } from './historicalOcrLexicon.js';

const LOCATION_TYPES = new Set(['place', 'building', 'business', 'organisation', 'organization', 'street', 'address', 'landmark']);
const PERSON_TYPES = new Set(['person', 'family']);

const STREET_TYPE_SURFACE = /\b(utca|út|ut|tér|ter|körút|korut|krt|rakpart|köz|koz|sor|fasor|sétány|setany|liget|street|square|avenue|road|boulevard)\b/iu;

export const isLocationLikeMention = (mention) => {
  const type = String(mention?.type ?? '').toLowerCase();
  if (PERSON_TYPES.has(type)) return false;
  if (LOCATION_TYPES.has(type)) return true;
  const label = String(mention?.normalized_text ?? mention?.text ?? mention?.label ?? '');
  return STREET_TYPE_SURFACE.test(label);
};

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

const distanceCap = (token) => {
  if (token.length >= 9) return 2;
  if (token.length >= 5) return 1;
  return 0;
};

/**
 * Corpus-observed Hungarian OCR siblings that are not independent words.
 * These are candidates only — a repair still requires a unique gazetteer hit.
 */
export const CORPUS_PLACE_CONFUSION = new Map([
  ['dohdny', 'dohany'],
  ['dohdany', 'dohany'],
  ['doheny', 'dohany'],
  ['dohdeny', 'dohany'],
  ['dohndnyi', 'dohanyi'],
  ['dohanyi', 'dohanyi'],
  ['kirdly', 'kiraly'],
  ['klauzdl', 'klauzal'],
  ['klauzal', 'klauzal'],
]);

const restoreCapitalization = (original, canonical) => {
  if (!original) return canonical;
  if (/^[A-ZÀ-Þ]/u.test(original) && /^[a-zà-ÿ]/u.test(canonical)) {
    return canonical[0].toUpperCase() + canonical.slice(1);
  }
  if (/^[A-ZÀ-Þ]+$/u.test(original)) return canonical.toUpperCase();
  return canonical;
};

const displayTokenFromOwner = (owner, foldedToken) => {
  if (!owner?.display) return foldedToken;
  const part = String(owner.display).split(/\s+/u).find((piece) => normalizePlaceKey(piece) === foldedToken);
  return part ?? foldedToken;
};

const uniqueTokenRepair = (folded, placesIndex) => {
  if (!folded || !placesIndex?.tokens) return null;
  const direct = placesIndex.tokens[folded];
  if (direct?.in_gazetteer) {
    const owner = placesIndex.entries?.[direct.owner_key];
    return {
      from: folded,
      to_key: folded,
      display_token: direct.display_token ?? displayTokenFromOwner(owner, folded),
      matched_via: 'exact_token',
      layer: owner?.layer ?? 'street',
      gazetteer_id: direct.owner_key,
    };
  }

  const corpusHint = CORPUS_PLACE_CONFUSION.get(folded);
  if (corpusHint && placesIndex.tokens[corpusHint]?.in_gazetteer) {
    const ownerKey = placesIndex.tokens[corpusHint].owner_key;
    const owner = placesIndex.entries?.[ownerKey];
    return {
      from: folded,
      to_key: corpusHint,
      display_token: placesIndex.tokens[corpusHint].display_token ?? displayTokenFromOwner(owner, corpusHint),
      matched_via: 'confusion_unique_hit',
      layer: owner?.layer ?? 'street',
      gazetteer_id: ownerKey,
      corpus_hint: corpusHint,
    };
  }

  // Free token edit-distance against the whole gazetteer is too eager (ordinary
  // English words in location labels). Prefer under-merge: only corpus-gated
  // token repairs above, plus phrase-level unique-hit below.
  return null;
};

const STREET_TYPE_IN_KEY = /\b(utca|ut|ter|korut|krt|rakpart|koz|sor|fasor|setany|liget|lejto|street|square|avenue|road|boulevard|bridge)\b/u;

const uniquePhraseRepair = (foldedPhrase, placesIndex) => {
  if (!foldedPhrase || !placesIndex?.entries) return null;
  const exact = placesIndex.entries[foldedPhrase];
  if (exact?.unique) {
    return {
      from: foldedPhrase,
      to_key: exact.key ?? foldedPhrase,
      display: exact.display,
      matched_via: 'exact_phrase',
      layer: exact.layer,
      gazetteer_id: exact.id,
    };
  }
  // Phrase-level unique-hit confusion only for street-like phrases (prefer under-merge).
  if (foldedPhrase.length > 40 || !STREET_TYPE_IN_KEY.test(foldedPhrase)) return null;
  const cap = distanceCap(foldedPhrase.replace(/\s+/gu, ''));
  if (!cap) return null;
  if (!placesIndex._phraseBuckets) {
    const buckets = new Map();
    for (const key of Object.keys(placesIndex.entries)) {
      if (!placesIndex.entries[key]?.unique) continue;
      if (!STREET_TYPE_IN_KEY.test(key)) continue;
      const bucket = key[0] ?? '';
      const list = buckets.get(bucket) ?? [];
      list.push(key);
      buckets.set(bucket, list);
    }
    placesIndex._phraseBuckets = buckets;
  }
  const hits = [];
  for (const key of placesIndex._phraseBuckets.get(foldedPhrase[0] ?? '') ?? []) {
    if (Math.abs(key.length - foldedPhrase.length) > cap) continue;
    const distance = editDistance(foldedPhrase, key, cap);
    if (distance > 0 && distance <= cap) hits.push({ key, entry: placesIndex.entries[key], distance });
  }
  if (hits.length !== 1) return null;
  const [hit] = hits;
  return {
    from: foldedPhrase,
    to_key: hit.key,
    display: hit.entry.display,
    matched_via: 'confusion_unique_hit',
    layer: hit.entry.layer,
    gazetteer_id: hit.entry.id,
    distance: hit.distance,
  };
};

/**
 * Canonicalize a location-like label for identity + display.
 * Returns { text, identity_key, repairs[] }. Raw evidence is untouched by caller.
 */
export const canonicalizeLocationText = (value, placesIndex = null, { log = null } = {}) => {
  const original = String(value ?? '');
  if (!original.trim()) return { text: original, identity_key: '', repairs: [] };

  // Domain English OCR first (synagogue etc.), then place gazetteer.
  const domainFolded = original.replace(/[A-Za-zÀ-ÿ]+/gu, (word) => {
    const canonical = OCR_DOMAIN_CANONICAL.get(word.toLowerCase());
    if (!canonical) return word;
    return restoreCapitalization(word, canonical);
  });

  if (!placesIndex) {
    const identity_key = placeTokens(domainFolded).map((token) => canonicalizeDomainToken(token)).join(' ');
    return { text: domainFolded, identity_key, repairs: [] };
  }

  const phraseKey = normalizePlaceKey(domainFolded);
  const phraseHit = uniquePhraseRepair(phraseKey, placesIndex);
  if (phraseHit?.display) {
    const isConfusion = phraseHit.matched_via === 'confusion_unique_hit';
    const repair = { ...phraseHit, repaired: isConfusion, surface: original };
    if (isConfusion) log?.push(repair);
    return {
      text: phraseHit.display,
      identity_key: phraseHit.to_key,
      repairs: isConfusion ? [repair] : [],
    };
  }

  const repairs = [];
  const identityParts = [];
  const displayParts = [];
  for (const word of domainFolded.match(/[A-Za-zÀ-ÿ]+|[^\p{L}]+/gu) ?? [domainFolded]) {
    if (!/^[A-Za-zÀ-ÿ]+$/u.test(word)) {
      displayParts.push(word);
      continue;
    }
    const domain = canonicalizeDomainToken(word.toLowerCase());
    const folded = normalizePlaceKey(domain);
    const hit = uniqueTokenRepair(folded, placesIndex);
    if (hit && hit.to_key !== folded) {
      const repair = { ...hit, repaired: true, surface: word };
      repairs.push(repair);
      log?.push(repair);
      identityParts.push(hit.to_key);
      displayParts.push(restoreCapitalization(word, hit.display_token));
    } else if (hit?.matched_via === 'exact_token' && hit.display_token) {
      // Exact gazetteer token: prefer diacritic display, same identity key.
      // Do not stamp repair provenance for pure diacritic polish.
      identityParts.push(folded);
      displayParts.push(restoreCapitalization(word, hit.display_token));
    } else {
      identityParts.push(folded || domain);
      displayParts.push(domain === word.toLowerCase() ? word : restoreCapitalization(word, domain));
    }
  }

  // Re-check full repaired phrase for a unique street/landmark display.
  const repairedIdentity = identityParts.join(' ').replace(/\s+/gu, ' ').trim();
  const repairedPhrase = uniquePhraseRepair(repairedIdentity, placesIndex);
  let text = displayParts.join('');
  if (repairedPhrase?.display && repairedPhrase.matched_via === 'exact_phrase') {
    text = repairedPhrase.display;
  } else if (repairedPhrase?.matched_via === 'confusion_unique_hit' && repairedPhrase.display) {
    text = repairedPhrase.display;
    const repair = { ...repairedPhrase, repaired: true, surface: original };
    repairs.push(repair);
    log?.push(repair);
  }

  return { text, identity_key: repairedPhrase?.to_key ?? repairedIdentity, repairs };
};

/** Token-level helper mirroring canonicalizeDomainToken for place contexts. */
export const canonicalizeLocationToken = (token, placesIndex = null) => {
  const domain = canonicalizeDomainToken(token);
  if (!placesIndex) return domain;
  const hit = uniqueTokenRepair(normalizePlaceKey(domain), placesIndex);
  return hit?.to_key ?? normalizePlaceKey(domain) ?? domain;
};

export { normalizePlaceKey, LOCATION_TYPES, PERSON_TYPES };
