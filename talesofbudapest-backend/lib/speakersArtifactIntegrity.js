/**
 * Validate restricted speakers JSONL integrity before map/browser load.
 * Fail closed: missing version or evidence fields ⇒ reject default artifact.
 */

const EVIDENCE_KINDS = ['locations', 'facts', 'relations', 'events'];
const SPEAKER_STATUSES = new Set(['resolved', 'ambiguous', 'none']);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);

export const validateSpeakersArtifactRecord = (record, { line = null } = {}) => {
  const errors = [];
  const version = record?.speaker_attribution?.version;
  if (version !== 'quote-speaker-v2') {
    errors.push({
      line,
      reason: 'missing_or_stale_speaker_attribution_version',
      detail: version ?? null,
    });
  }
  const windowPages = new Set((record?.pdf_pages ?? []).map(Number).filter((page) => Number.isInteger(page)));
  for (const kind of EVIDENCE_KINDS) {
    for (const [index, item] of (record?.payload?.[kind] ?? []).entries()) {
      const quote = item?.evidence?.quote;
      if (!quote) continue;
      const evidence = item.evidence ?? {};
      if (!hasOwn(evidence, 'speaker') || evidence.speaker == null || typeof evidence.speaker !== 'object') {
        errors.push({ line, kind, index, reason: 'missing_speaker' });
        continue;
      }
      if (!SPEAKER_STATUSES.has(evidence.speaker.status)) {
        errors.push({
          line, kind, index, reason: 'invalid_speaker_status', detail: evidence.speaker.status ?? null,
        });
      }
      if (evidence.speaker.status === 'resolved') {
        const conf = evidence.speaker.confidence;
        if (conf !== 'high' && conf !== 'medium' && conf !== 'low') {
          errors.push({ line, kind, index, reason: 'missing_or_invalid_speaker_confidence', detail: conf ?? null });
        }
      }
      if (!hasOwn(evidence, 'quote_page')) {
        errors.push({ line, kind, index, reason: 'missing_quote_page' });
      } else if (evidence.quote_page != null && !Number.isInteger(evidence.quote_page)) {
        errors.push({ line, kind, index, reason: 'invalid_quote_page', detail: evidence.quote_page });
      } else if (
        (evidence.quote_page_reason === 'exact_unique'
          || evidence.quote_page_reason === 'exact_unique_cross_page')
        && (evidence.quote_page == null || !windowPages.has(evidence.quote_page))
      ) {
        errors.push({
          line, kind, index, reason: 'quote_page_outside_window', detail: evidence.quote_page,
        });
      }
      if (!hasOwn(evidence, 'quote_page_reason') || !evidence.quote_page_reason) {
        errors.push({ line, kind, index, reason: 'missing_quote_page_reason' });
      }
      if (!hasOwn(evidence, 'quote_zone')) {
        errors.push({ line, kind, index, reason: 'missing_quote_zone' });
      } else if (
        evidence.quote_zone != null
        && evidence.quote_zone !== 'direct_speech'
        && evidence.quote_zone !== 'prose'
        && evidence.quote_zone !== 'unknown'
        && evidence.quote_zone !== 'speech_frame_prose_adjacent'
      ) {
        errors.push({ line, kind, index, reason: 'invalid_quote_zone', detail: evidence.quote_zone });
      }
      if (!hasOwn(evidence, 'quote_zone_reason')) {
        errors.push({ line, kind, index, reason: 'missing_quote_zone_reason' });
      }
    }
  }
  return errors;
};

/**
 * @param {object[]} records
 * @returns {{ ok: true, rows: number, quotes: number } | never}
 */
export const assertSpeakersArtifactIntegrity = (records, { provenance = null } = {}) => {
  if (provenance === 'explicit_input') {
    return { ok: true, skipped: true, reason: 'explicit_input' };
  }
  const errors = [];
  let quotes = 0;
  records.forEach((record, line) => {
    for (const kind of EVIDENCE_KINDS) {
      for (const item of record?.payload?.[kind] ?? []) {
        if (item?.evidence?.quote) quotes += 1;
      }
    }
    errors.push(...validateSpeakersArtifactRecord(record, { line: line + 1 }));
  });
  if (errors.length) {
    const sample = errors.slice(0, 8);
    throw new Error(
      `Speakers artifact failed integrity gate (${errors.length} issues; provenance=${provenance ?? 'unknown'}). `
      + `Re-run: npm run annotate:restricted:speakers. Sample: ${JSON.stringify(sample)}`,
    );
  }
  return { ok: true, rows: records.length, quotes };
};
