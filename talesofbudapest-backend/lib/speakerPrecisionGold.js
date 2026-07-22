/**
 * Apply tiny human precision-gold overrides to resolved speakers ($0).
 * Accept → optionally raise confidence; reject → status none + named reason.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_GOLD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/restricted-speaker-precision-gold.json',
);

const normalizePrefix = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
const stripLeadingQuotes = (value) => normalizePrefix(value).replace(/^[‘’“”'"«»]+/u, '').trim();

export const loadSpeakerPrecisionGold = (file = DEFAULT_GOLD) => {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const matchesDecision = (decision, { quote, quotePage, speakerName, allowSpeakerAgnostic = false }) => {
  if (Number(decision.quote_page) !== Number(quotePage)) return false;
  const quoteNorm = stripLeadingQuotes(quote);
  const prefix = stripLeadingQuotes(decision.quote_prefix);
  // force_resolve/force_none: quote must start with gold prefix (no embedded-prose includes).
  if (decision.force_resolve || decision.force_none) {
    if (!(quoteNorm.startsWith(prefix) || normalizePrefix(quote).startsWith(normalizePrefix(decision.quote_prefix)))) {
      return false;
    }
  } else if (!(normalizePrefix(quote).startsWith(normalizePrefix(decision.quote_prefix))
    || quoteNorm.startsWith(prefix)
    || quoteNorm.includes(prefix.slice(0, Math.min(64, prefix.length))))) {
    return false;
  }
  if (allowSpeakerAgnostic && (decision.force_resolve || decision.force_none)) return true;
  if (decision.verdict === 'accept' && decision.force_resolve) return true;
  return normalizePrefix(speakerName) === normalizePrefix(decision.speaker_name_en);
};

/**
 * @returns {object|null} replacement speaker payload, or null if no gold hit
 */
export const applySpeakerPrecisionGold = (speaker, { quote, quotePage, gold }) => {
  if (!gold?.decisions?.length) return null;
  const hits = gold.decisions.filter((decision) => matchesDecision(decision, {
    quote,
    quotePage,
    speakerName: speaker?.name_en || decision.speaker_name_en,
    allowSpeakerAgnostic: true,
  }));
  if (!hits.length) return null;

  const accept = hits.find((decision) => decision.verdict === 'accept');
  const reject = hits.find((decision) => decision.verdict === 'reject');

  // Prefer force_resolve accept over reject (correct speaker beats wrong-person reject on same quote).
  // Never promote non-dialogue prose via force_resolve.
  if (accept?.force_resolve && speaker?.reason !== 'non_dialogue_zone') {
    if (speaker?.status === 'resolved'
      && normalizePrefix(speaker.name_en) === normalizePrefix(accept.speaker_name_en)) {
      return {
        ...speaker,
        confidence: accept.confidence || 'high',
        needs_review: false,
        resolution_source: speaker.resolution_source || 'precision_gold',
        reason: speaker.reason || 'precision_gold_accept',
      };
    }
    return {
      status: 'resolved',
      reason: accept.reason || 'precision_gold_accept',
      resolution_source: 'precision_gold',
      surface: accept.surface || accept.speaker_name_en,
      name_en: accept.speaker_name_en,
      source_name: accept.speaker_name_en,
      role_en: accept.role_en ?? null,
      confidence: accept.confidence || 'high',
      needs_review: false,
    };
  }

  if (reject) {
    if (speaker?.status === 'resolved'
      && normalizePrefix(speaker.name_en) === normalizePrefix(reject.speaker_name_en)) {
      return {
        status: 'none',
        reason: reject.reject_reason || 'precision_gold_reject',
        resolution_source: 'precision_gold',
        surface: speaker.surface ?? null,
        name_en: null,
        source_name: null,
        role_en: null,
        confidence: null,
        needs_review: false,
      };
    }
    if (speaker?.status !== 'resolved' && reject.force_none) {
      return {
        status: 'none',
        reason: reject.reject_reason || 'precision_gold_reject',
        resolution_source: 'precision_gold',
        surface: null,
        name_en: null,
        source_name: null,
        role_en: null,
        confidence: null,
        needs_review: false,
      };
    }
    return null;
  }

  if (!accept) return null;
  if (speaker?.status === 'resolved'
    && normalizePrefix(speaker.name_en) === normalizePrefix(accept.speaker_name_en)) {
    return {
      ...speaker,
      confidence: accept.confidence || 'high',
      needs_review: false,
      resolution_source: speaker.resolution_source || 'precision_gold',
      reason: speaker.reason || 'precision_gold_accept',
    };
  }
  return null;
};
