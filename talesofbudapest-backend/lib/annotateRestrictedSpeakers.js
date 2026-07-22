/**
 * Offline post-pass: attach fail-closed speaker attribution beside restricted
 * evidence quotes. Does not rewrite quote text. Prefer this over re-prompting.
 */

import { adjacentSpeechFrame, foldPersonKey, resolveQuoteSpeaker } from './quoteSpeakerAttribution.js';
import { confidenceForSpeaker, speakerNeedsReview } from './speakerConfidence.js';
import { classifyQuoteZone } from './quoteZone.js';
import { applySpeakerPrecisionGold, loadSpeakerPrecisionGold } from './speakerPrecisionGold.js';

const SPEAKER_VERSION = 'quote-speaker-v2';
const PROSE_ADJACENT_ZONE = 'speech_frame_prose_adjacent';
const PROSE_ADJACENT_MAX_GAP = 200;
const DEFAULT_PRECISION_GOLD = loadSpeakerPrecisionGold();

const normalizeWs = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();

/**
 * Global-roster prefilter for one-token speech-frame surfaces.
 * Bare first names (Tamás) must not match via given-name aliases — only surnames
 * (last token of canonical name) qualify. Multi-token surfaces pass through unchanged.
 */
export const filterGlobalPeopleForFrameSurface = (surface, people) => {
  const list = Array.isArray(people) ? people : [];
  const tokens = foldPersonKey(surface).split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return list;
  const surname = tokens[0];
  return list.filter((person) => {
    for (const raw of [person?.name_en, person?.source_name]) {
      const parts = foldPersonKey(raw).split(/\s+/).filter(Boolean);
      if (parts.length && parts.at(-1) === surname) return true;
    }
    return false;
  });
};
const pagesFromText = (text) => {
  const map = new Map();
  for (const match of String(text ?? '').matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g)) {
    map.set(Number(match[1]), match[2].trim());
  }
  return map;
};

/** Normalize-only fold for quote↔page exact match. No alnum strip (ambiguous regressions). */
const foldForMatch = (value) => String(value ?? '')
  // Join literal lowercase line-break hyphenation before whitespace collapse.
  .replace(/(\p{L})-[\t ]*\r?\n[\t ]*(\p{Ll})/gu, '$1$2')
  .replace(/\s+/gu, ' ')
  .trim()
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
  .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
  .replace(/[\u00a0\u202f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Reading-order concat of folded page texts with page-start offsets.
 * Joins cross-page hyphenation (`finan-` + `cial` → `financial`).
 */
const foldWindowConcat = (pages, pageTextMap) => {
  let concat = '';
  const offsets = [];
  for (const page of pages) {
    const chunk = foldForMatch(pageTextMap.get(page) ?? '');
    if (!chunk) {
      offsets.push({ page, start: concat.length });
      continue;
    }
    if (concat.endsWith('-') && /^\p{L}/u.test(chunk)) {
      const start = concat.length - 1;
      concat = `${concat.slice(0, -1)}${chunk}`;
      offsets.push({ page, start });
      continue;
    }
    if (concat) concat += ' ';
    offsets.push({ page, start: concat.length });
    concat += chunk;
  }
  return { concat, offsets };
};

const startPageForConcatIndex = (offsets, index, fallbackPage) => {
  let startPage = fallbackPage;
  for (const offset of offsets) {
    if (offset.start <= index) startPage = offset.page;
    else break;
  }
  return startPage;
};

const countSubstringHits = (haystack, needle) => {
  if (!haystack || !needle) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + 1;
  }
  return count;
};

const attributePage = (quote, windowPages, pageTextMap) => {
  const pages = (windowPages ?? []).map(Number).filter((page) => Number.isInteger(page) && page >= 1);
  if (!pages.length) return { page: null, matched: false, reason: 'no_window_pages' };
  const needle = foldForMatch(quote);
  if (!needle || needle.length < 12) {
    return { page: null, matched: false, reason: 'quote_too_short' };
  }
  const hits = pages.filter((page) => foldForMatch(pageTextMap.get(page) ?? '').includes(needle));
  if (hits.length === 1) return { page: hits[0], matched: true, reason: 'exact_unique' };
  if (hits.length > 1) return { page: null, matched: false, reason: 'quote_page_ambiguous' };

  // Cross-page: whole folded quote exactly once in ordered window concat.
  const { concat, offsets } = foldWindowConcat(pages, pageTextMap);
  const concatHits = countSubstringHits(concat, needle);
  if (concatHits === 1) {
    const at = concat.indexOf(needle);
    return {
      page: startPageForConcatIndex(offsets, at, pages[0]),
      matched: true,
      reason: 'exact_unique_cross_page',
    };
  }
  if (concatHits > 1) return { page: null, matched: false, reason: 'quote_page_ambiguous' };
  return { page: null, matched: false, reason: 'quote_page_unmatched' };
};

const personEntry = (person) => ({
  name_en: normalizeWs(person.name_en) || normalizeWs(person.source_name),
  source_name: normalizeWs(person.source_name) || null,
  role_en: normalizeWs(person.role_en) || null,
  years_hint: person.years_hint ?? null,
  quote: normalizeWs(person.evidence?.quote) || null,
});

const speakerPayload = (attribution) => {
  const base = {
    status: attribution.status,
    reason: attribution.reason,
    resolution_source: attribution.resolution_source,
    surface: attribution.surface,
    name_en: attribution.person?.name_en ?? null,
    source_name: attribution.person?.source_name ?? null,
    role_en: attribution.person?.role_en ?? null,
  };
  const confidence = confidenceForSpeaker(base);
  return {
    ...base,
    confidence,
    needs_review: speakerNeedsReview(base),
  };
};

const unmatchedSpeaker = (reason) => ({
  status: 'none',
  reason,
  resolution_source: null,
  surface: null,
  name_en: null,
  source_name: null,
  role_en: null,
  confidence: null,
  needs_review: false,
});

const annotateEvidenceItem = (item, { pageText, people, globalPeople = null, pageMatch, precisionGold = null }) => {
  const quote = item?.evidence?.quote;
  if (!quote) return { item, changed: false };
  let zoneInfo = pageMatch?.matched
    ? classifyQuoteZone(pageText, quote)
    : { zone: null, reason: null };
  if (zoneInfo.zone === 'prose') {
    const adjacent = adjacentSpeechFrame({ pageText, quote, maxGap: PROSE_ADJACENT_MAX_GAP });
    if (adjacent) {
      zoneInfo = {
        zone: PROSE_ADJACENT_ZONE,
        reason: `speech_frame_within_${adjacent.gap}_chars`,
      };
    }
  }
  let nextSpeaker;
  if (!pageMatch?.matched) {
    nextSpeaker = unmatchedSpeaker(pageMatch?.reason || 'quote_page_unmatched');
  } else if (zoneInfo.zone === 'prose') {
    nextSpeaker = unmatchedSpeaker('non_dialogue_zone');
  } else if (zoneInfo.zone === 'unknown') {
    nextSpeaker = unmatchedSpeaker('quote_zone_unknown');
  } else {
    let attribution = resolveQuoteSpeaker({ quote, pageText, people });
    // One-page windows often extract the named person on a neighboring page.
    // Fail-closed global fallback: only when page-local is frame_person_unmatched
    // and the frame surface uniquely matches one corpus person.
    if (
      attribution.status === 'none'
      && attribution.reason === 'frame_person_unmatched'
      && Array.isArray(globalPeople)
      && globalPeople.length
    ) {
      const roster = filterGlobalPeopleForFrameSurface(attribution.surface, globalPeople);
      if (roster.length) {
        const globalHit = resolveQuoteSpeaker({ quote, pageText, people: roster });
        if (globalHit.status === 'resolved') {
          attribution = {
            ...globalHit,
            resolution_source: 'speech_frame_global',
            reason: 'speech_frame_person',
          };
        } else if (globalHit.status === 'ambiguous') {
          attribution = {
            ...globalHit,
            resolution_source: 'speech_frame_global',
          };
        }
      }
    }
    nextSpeaker = speakerPayload(attribution);
    // Prose-adjacent reopenings are always medium confidence / needs review.
    if (zoneInfo.zone === PROSE_ADJACENT_ZONE && nextSpeaker.status === 'resolved') {
      nextSpeaker = {
        ...nextSpeaker,
        confidence: 'medium',
        needs_review: true,
        resolution_source: nextSpeaker.resolution_source === 'speech_frame'
          ? 'speech_frame_prose_adjacent'
          : nextSpeaker.resolution_source,
      };
    }
  }
  if (pageMatch?.matched) {
    const goldHit = applySpeakerPrecisionGold(nextSpeaker, {
      quote,
      quotePage: pageMatch.page,
      gold: precisionGold ?? DEFAULT_PRECISION_GOLD,
    });
    if (goldHit) nextSpeaker = goldHit;
  }
  const prev = item.evidence?.speaker;
  const same = prev
    && prev.status === nextSpeaker.status
    && prev.reason === nextSpeaker.reason
    && prev.name_en === nextSpeaker.name_en
    && prev.surface === nextSpeaker.surface
    && prev.confidence === nextSpeaker.confidence
    && item.evidence?.quote_page === (pageMatch?.matched ? pageMatch.page : null)
    && item.evidence?.quote_page_reason === (pageMatch?.reason ?? 'quote_page_unmatched')
    && item.evidence?.quote_zone === zoneInfo.zone
    && item.evidence?.quote_zone_reason === zoneInfo.reason;
  if (same) return { item, changed: false };
  return {
    item: {
      ...item,
      evidence: {
        ...item.evidence,
        speaker: nextSpeaker,
        quote_page: pageMatch?.matched ? pageMatch.page : null,
        quote_page_reason: pageMatch?.reason ?? 'quote_page_unmatched',
        quote_zone: zoneInfo.zone,
        quote_zone_reason: zoneInfo.reason,
      },
    },
    changed: true,
  };
};

/**
 * Annotate one restricted extract window record.
 * @param {object} record
 * @param {Map<number, string>} pageTextMap
 * @param {{ peopleByPage?: Map<number, object[]>, globalPeople?: object[] }} [options]
 * @returns {{ record: object, stats: object }}
 */
export const annotateRestrictedRecordSpeakers = (record, pageTextMap, options = {}) => {
  const windowPages = (record.pdf_pages ?? []).map(Number).filter((page) => Number.isInteger(page));
  const localPeople = (record.payload?.people ?? []).map(personEntry).filter((person) => person.name_en);
  const globalPeopleByPage = options.peopleByPage ?? null;
  const globalPeople = options.globalPeople ?? null;
  const precisionGold = options.precisionGold ?? DEFAULT_PRECISION_GOLD;

  const peopleForPage = (page) => {
    if (page == null) return localPeople;
    if (globalPeopleByPage?.has(page)) return globalPeopleByPage.get(page);
    return localPeople;
  };

  const stats = {
    locations: 0,
    facts: 0,
    relations: 0,
    events: 0,
    resolved: 0,
    ambiguous: 0,
    none: 0,
    changed: 0,
    unmatched_page: 0,
  };

  const annotateArray = (key) => {
    const rows = record.payload?.[key] ?? [];
    if (!Array.isArray(rows) || !rows.length) return rows;
    return rows.map((item) => {
      const quote = item?.evidence?.quote;
      const pageMatch = attributePage(quote, windowPages, pageTextMap);
      if (!pageMatch.matched) stats.unmatched_page += 1;
      const pageText = pageMatch.page != null ? (pageTextMap.get(pageMatch.page) ?? '') : '';
      const { item: next, changed } = annotateEvidenceItem(item, {
        pageText,
        people: peopleForPage(pageMatch.page),
        globalPeople,
        pageMatch,
        precisionGold,
      });
      stats[key] += 1;
      if (changed) stats.changed += 1;
      const status = next.evidence?.speaker?.status;
      if (status === 'resolved') stats.resolved += 1;
      else if (status === 'ambiguous') stats.ambiguous += 1;
      else if (status === 'none') stats.none += 1;
      return next;
    });
  };

  const payload = {
    ...record.payload,
    locations: annotateArray('locations'),
    facts: annotateArray('facts'),
    relations: annotateArray('relations'),
    events: annotateArray('events'),
  };

  return {
    record: {
      ...record,
      payload,
      speaker_attribution: {
        version: SPEAKER_VERSION,
        annotated_at: new Date().toISOString(),
      },
    },
    stats,
  };
};

/** Build global people-by-page index across all windows (alias collisions stay as multiple rows). */
export const buildGlobalPeopleByPage = (records) => {
  const byPage = new Map();
  for (const record of records) {
    const windowPages = (record.pdf_pages ?? []).map(Number).filter((page) => Number.isInteger(page));
    const people = (record.payload?.people ?? []).map(personEntry).filter((person) => person.name_en);
    for (const page of windowPages) {
      const list = byPage.get(page) ?? [];
      for (const person of people) {
        if (!list.some((row) => foldPersonKey(row.name_en) === foldPersonKey(person.name_en))) {
          list.push(person);
        }
      }
      byPage.set(page, list);
    }
  }
  return byPage;
};

/** Deduped corpus-wide people roster for fail-closed cross-page speaker fallback. */
export const buildGlobalPeopleRoster = (records) => {
  const roster = [];
  for (const record of records) {
    for (const person of (record.payload?.people ?? []).map(personEntry).filter((row) => row.name_en)) {
      if (!roster.some((row) => foldPersonKey(row.name_en) === foldPersonKey(person.name_en))) {
        roster.push(person);
      }
    }
  }
  return roster;
};

export const loadPagesTextMap = (pagesTxt) => pagesFromText(pagesTxt);

export { pagesFromText, attributePage, speakerPayload, unmatchedSpeaker, SPEAKER_VERSION };
