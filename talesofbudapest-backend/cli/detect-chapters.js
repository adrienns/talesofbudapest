#!/usr/bin/env node
/**
 * Propose chapter boundaries for a paged source text. Heuristic only: emits a
 * CANDIDATE list for a human to trim into data/<source>.chapters.json.
 * Chapter boundaries matter because the V3 subject memory should cold-start
 * at each chapter: discourse focus does not survive a chapter break.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHistoricalPages } from '../lib/historicalExtractionV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const SOURCE_ID = option('--source', 'jewish-budapest');
const INPUT = path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`);
const OUTPUT = option('--output', path.join(__dirname, `../data/${SOURCE_ID}.chapters.candidates.json`));

const isHeadingLike = (line) => {
  const text = line.trim();
  if (text.length < 4 || text.length > 60) return false;
  if (/[.;:,]$/u.test(text)) return false;
  if (!/^[A-ZÀ-Ž"“]/u.test(text)) return false;
  const words = text.split(/\s+/u);
  if (words.length > 9) return false;
  const capitalish = words.filter((word) => /^[A-ZÀ-Ž"“(]/u.test(word) || /^(?:of|the|and|in|a|an|to|for)$/iu.test(word));
  return capitalish.length === words.length;
};

const main = async () => {
  const pages = parseHistoricalPages(await fs.readFile(INPUT, 'utf8'));
  const candidates = [];
  for (const page of pages) {
    const lines = page.text.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const [index, line] of lines.slice(0, 3).entries()) {
      if (!isHeadingLike(line)) continue;
      const next = lines[index + 1] ?? '';
      candidates.push({ page: page.page, line_index: index, heading: line, next_line_preview: next.slice(0, 60) });
      break;
    }
  }
  const payload = {
    source_id: SOURCE_ID,
    note: 'CANDIDATES ONLY. A human must trim this into data/<source>.chapters.json with entries {title, from_page, to_page}. Batch runner cold-starts subject memory at each chapter.',
    generated_at: new Date().toISOString(),
    candidate_count: candidates.length,
    candidates,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');
  console.log(JSON.stringify({ output: OUTPUT, candidates: candidates.length, pages: pages.length }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
