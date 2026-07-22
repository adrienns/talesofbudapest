#!/usr/bin/env node
/**
 * Precision audit for resolved speakers — especially roster/page-name fallbacks.
 *
 * Usage:
 *   node cli/report-restricted-speaker-precision.js --source budapest-joe-hajdu
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confidenceForSpeaker, speakerNeedsReview } from '../lib/speakerConfidence.js';
import { leftContextBeforeQuote } from '../lib/quoteSpeakerAttribution.js';
import { loadPagesTextMap } from '../lib/annotateRestrictedSpeakers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE = option('--source', 'budapest-joe-hajdu');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const TEXT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/text');
const INPUT = path.resolve(option('--input', path.join(EXTRACTIONS, `${SOURCE}.entities.content.speakers.jsonl`)));
const PAGES_TXT = path.resolve(option('--pages-txt', path.join(TEXT_DIR, `${SOURCE}.pages.txt`)));
const OUTPUT = path.resolve(option('--output', path.join(EXTRACTIONS, `${SOURCE}.speaker-precision.json`)));

const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };

const main = async () => {
  const lines = (await fs.readFile(INPUT, 'utf8')).split('\n').filter(Boolean);
  const pageTextMap = loadPagesTextMap(await fs.readFile(PAGES_TXT, 'utf8'));
  const byConfidence = {};
  const bySource = {};
  const reviewSamples = [];
  const highSamples = [];
  let resolved = 0;

  for (const line of lines) {
    const row = JSON.parse(line);
    for (const kind of ['locations', 'facts', 'relations', 'events']) {
      for (const item of row.payload?.[kind] ?? []) {
        const evidence = item.evidence ?? {};
        const speaker = evidence.speaker ?? {};
        if (speaker.status !== 'resolved') continue;
        resolved += 1;
        const confidence = speaker.confidence ?? confidenceForSpeaker(speaker);
        bump(byConfidence, confidence ?? 'unknown');
        bump(bySource, speaker.resolution_source ?? 'null');
        const page = evidence.quote_page;
        const pageText = page != null ? (pageTextMap.get(page) ?? '') : '';
        const left = leftContextBeforeQuote(pageText, evidence.quote).slice(-220);
        const sample = {
          kind,
          label: item.name_en || item.text_en || item.title_en || item.statement_en || null,
          quote_page: page ?? null,
          speaker: speaker.name_en,
          surface: speaker.surface,
          reason: speaker.reason,
          resolution_source: speaker.resolution_source,
          confidence,
          needs_review: speaker.needs_review ?? speakerNeedsReview(speaker),
          left_context: left,
          quote: String(evidence.quote ?? '').slice(0, 160),
        };
        if (sample.needs_review && reviewSamples.length < 40) reviewSamples.push(sample);
        if (confidence === 'high' && highSamples.length < 10) highSamples.push(sample);
      }
    }
  }

  const report = {
    source: SOURCE,
    input: INPUT,
    generated_at: new Date().toISOString(),
    resolved,
    confidence_counts: byConfidence,
    resolution_source_counts: bySource,
    review_queue: reviewSamples,
    high_confidence_sample: highSamples,
    note: 'Review queue prioritizes medium/low fallbacks (global roster + page-name expansion). Fail-closed: do not auto-promote low→high.',
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output: OUTPUT,
    resolved,
    confidence_counts: byConfidence,
    resolution_source_counts: bySource,
    review_queue_size: reviewSamples.length,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
