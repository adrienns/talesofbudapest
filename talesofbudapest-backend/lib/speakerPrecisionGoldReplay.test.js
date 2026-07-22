import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpeakerPrecisionGold } from './speakerPrecisionGold.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const speakersPath = path.join(
  root,
  'ingest/corpus/restricted/extractions/budapest-joe-hajdu.entities.content.speakers.jsonl',
);

const normalize = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
const stripLeadingQuotes = (value) => normalize(value).replace(/^[‘’“”'"«»]+/u, '').trim();

const quoteMatchesGoldPrefix = (quote, decision) => {
  const raw = normalize(quote);
  const prefixRaw = normalize(decision.quote_prefix);
  const q = stripLeadingQuotes(quote);
  const prefix = stripLeadingQuotes(decision.quote_prefix);
  if (decision.force_resolve || decision.force_none) {
    return q.startsWith(prefix) || raw.startsWith(prefixRaw);
  }
  return raw.startsWith(prefixRaw)
    || q.startsWith(prefix)
    || q.includes(prefix.slice(0, Math.min(64, prefix.length)));
};

const collectEvidence = () => {
  const rows = [];
  for (const line of fs.readFileSync(speakersPath, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    for (const kind of ['locations', 'facts', 'relations', 'events']) {
      for (const item of record.payload?.[kind] ?? []) {
        const evidence = item.evidence ?? {};
        if (!evidence.quote) continue;
        rows.push({ kind, evidence });
      }
    }
  }
  return rows;
};

const matches = (decision, evidence) => {
  if (Number(evidence.quote_page) !== Number(decision.quote_page)) return false;
  if (!quoteMatchesGoldPrefix(evidence.quote, decision)) return false;
  if (decision.verdict === 'accept') {
    return evidence.speaker?.status === 'resolved'
      && normalize(evidence.speaker?.name_en) === normalize(decision.speaker_name_en);
  }
  // Reject: must not remain resolved to that speaker.
  if (evidence.speaker?.status === 'resolved'
    && normalize(evidence.speaker?.name_en) === normalize(decision.speaker_name_en)) {
    return false;
  }
  return true;
};

test('precision gold decisions hold on live Hajdu speakers artifact', {
  skip: !fs.existsSync(speakersPath),
}, () => {
  const gold = loadSpeakerPrecisionGold();
  assert.ok(gold?.decisions?.length);
  const evidenceRows = collectEvidence();
  const failures = [];
  for (const decision of gold.decisions) {
    const hits = evidenceRows.filter((row) => Number(row.evidence.quote_page) === Number(decision.quote_page)
      && quoteMatchesGoldPrefix(row.evidence.quote, decision));
    assert.ok(hits.length, `missing evidence for gold ${decision.id}`);
    for (const hit of hits) {
      if (!matches(decision, hit.evidence)) {
        failures.push({
          id: decision.id,
          verdict: decision.verdict,
          speaker: hit.evidence.speaker,
          quote_page: hit.evidence.quote_page,
        });
      }
    }
  }
  assert.equal(failures.length, 0, `gold regressions: ${JSON.stringify(failures)}`);
});
