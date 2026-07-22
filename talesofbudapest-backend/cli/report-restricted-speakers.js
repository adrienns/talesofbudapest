#!/usr/bin/env node
/**
 * Emit a compact speaker + quote_page confession report for a speakers JSONL.
 *
 * Usage:
 *   node cli/report-restricted-speakers.js --source budapest-joe-hajdu
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const OUTPUT = path.resolve(option('--output', path.join(EXTRACTIONS, `${SOURCE}.speaker-report.json`)));

const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };

const pagesFromText = (text) => {
  const map = new Map();
  for (const match of String(text ?? '').matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g)) {
    map.set(Number(match[1]), match[2].trim());
  }
  return map;
};

const fold = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const main = async () => {
  const lines = (await fs.readFile(INPUT, 'utf8')).split('\n').filter(Boolean);
  let pageTextMap = new Map();
  try { pageTextMap = pagesFromText(await fs.readFile(PAGES_TXT, 'utf8')); }
  catch { /* optional diagnostic */ }

  const status = {};
  const reasons = {};
  const quotePageReasons = {};
  const resolved = [];
  const unmatched = [];
  let softWouldHit = 0;
  let hardMiss = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    const windowPages = (row.pdf_pages ?? []).map(Number).filter((page) => Number.isInteger(page));
    for (const kind of ['locations', 'facts', 'relations', 'events']) {
      for (const item of row.payload?.[kind] ?? []) {
        const evidence = item.evidence ?? {};
        const speaker = evidence.speaker ?? {};
        if (speaker.status) bump(status, speaker.status);
        if (speaker.reason) bump(reasons, speaker.reason);
        if (evidence.quote_page_reason) bump(quotePageReasons, evidence.quote_page_reason);
        if (speaker.status === 'resolved' && resolved.length < 25) {
          resolved.push({
            kind,
            label: item.name_en || item.text_en || item.title_en || null,
            speaker: speaker.name_en,
            quote_page: evidence.quote_page ?? null,
          });
        }
        if (evidence.quote_page_reason === 'quote_page_unmatched') {
          const quote = String(evidence.quote ?? '');
          const needle = fold(quote);
          const prefix = needle.slice(0, Math.min(40, needle.length));
          const softHits = windowPages.filter((page) => prefix && fold(pageTextMap.get(page) ?? '').includes(prefix));
          if (softHits.length) softWouldHit += 1;
          else hardMiss += 1;
          if (unmatched.length < 15) {
            unmatched.push({
              kind,
              pages: row.pdf_pages ?? [],
              soft_prefix_pages: softHits,
              quote: quote.slice(0, 120),
            });
          }
        }
      }
    }
  }
  const report = {
    source: SOURCE,
    input: INPUT,
    generated_at: new Date().toISOString(),
    status_counts: status,
    reason_counts: reasons,
    quote_page_reasons: quotePageReasons,
    unmatched_diagnostics: {
      soft_prefix_would_hit: softWouldHit,
      hard_miss: hardMiss,
      note: 'soft_prefix is intentionally NOT used for attribution; diagnostic only',
    },
    resolved_sample: resolved,
    unmatched_sample: unmatched,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output: OUTPUT,
    ...status,
    quote_page_reasons: quotePageReasons,
    unmatched_diagnostics: report.unmatched_diagnostics,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
