#!/usr/bin/env node
/**
 * Offline post-pass: persist fail-closed speaker attribution on restricted
 * extract evidence (locations/facts/relations/events). Quote text unchanged.
 *
 * Also persists unique exact evidence.quote_page (+ quote_page_reason),
 * including exact_unique_cross_page for quotes that span ordered window pages.
 * Map/browser default to the speakers artifact and hard-fail if missing
 * (legacy JSONL only via explicit --input).
 *
 * Usage:
 *   node cli/annotate-restricted-speakers.js --source budapest-joe-hajdu
 *   node cli/annotate-restricted-speakers.js --input … --pages-txt … --output …
 *   node cli/annotate-restricted-speakers.js --source budapest-joe-hajdu --in-place
 *
 * Then:
 *   npm run export:restricted:map -- --source budapest-joe-hajdu
 *   npm run build:restricted:browser -- --source budapest-joe-hajdu --pages 1-294
 *   npm run report:restricted:speakers -- --source budapest-joe-hajdu
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  annotateRestrictedRecordSpeakers,
  buildGlobalPeopleByPage,
  buildGlobalPeopleRoster,
  loadPagesTextMap,
} from '../lib/annotateRestrictedSpeakers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const flag = (name) => args.includes(name);

const SOURCE = option('--source', 'budapest-joe-hajdu');
const EXTRACTIONS = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const TEXT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/text');
const INPUT = path.resolve(option('--input', path.join(EXTRACTIONS, `${SOURCE}.entities.content.jsonl`)));
const PAGES_TXT = path.resolve(option('--pages-txt', path.join(TEXT_DIR, `${SOURCE}.pages.txt`)));
const inPlace = flag('--in-place');
const OUTPUT = path.resolve(
  option('--output', inPlace ? INPUT : path.join(EXTRACTIONS, `${SOURCE}.entities.content.speakers.jsonl`)),
);

const readJsonl = async (file) => (await fs.readFile(file, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL at line ${index + 1}`); }
  });

const main = async () => {
  const records = await readJsonl(INPUT);
  const pageTextMap = loadPagesTextMap(await fs.readFile(PAGES_TXT, 'utf8'));
  const peopleByPage = buildGlobalPeopleByPage(records);
  const globalPeople = buildGlobalPeopleRoster(records);
  const totals = {
    windows: records.length,
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
  const out = [];
  for (const record of records) {
    const { record: next, stats } = annotateRestrictedRecordSpeakers(record, pageTextMap, {
      peopleByPage,
      globalPeople,
    });
    out.push(next);
    for (const key of Object.keys(totals)) {
      if (key === 'windows') continue;
      totals[key] += stats[key] ?? 0;
    }
  }
  await fs.writeFile(OUTPUT, `${out.map((row) => JSON.stringify(row)).join('\n')}\n`);
  console.log(JSON.stringify({
    input: INPUT,
    output: OUTPUT,
    pages_txt: PAGES_TXT,
    ...totals,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
