#!/usr/bin/env node
/**
 * Hungaricana lookup assist + provenance ledger.
 *
 * Deliberately NOT a scraper. Hungaricana is free to browse, but its scans
 * and curated databases carry provider rights; bulk extraction would also hit
 * the EU sui generis database right. This tool only:
 *  1. builds targeted search URLs for a human to open and read, and
 *  2. records human-confirmed verifications (facts + the URL that supports
 *     them) into a provenance ledger our pipeline can cite.
 *
 * Facts recorded here (names, dates, addresses, existence of a source) are
 * not copyrightable; the scans themselves are never copied.
 *
 * Usage:
 *   node cli/hungaricana-lookup.js --query "Király utca 77" [--year 1908]
 *   node cli/hungaricana-lookup.js --confirm "<fact>" --url "<hungaricana url>" \
 *     [--entity <entity_id>] [--page <book page>] [--note "..."]
 *   node cli/hungaricana-lookup.js --list
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(__dirname, '../../ingest/provenance/hungaricana-verifications.jsonl');

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const QUERY = option('--query');
const YEAR = option('--year');
const CONFIRM = option('--confirm');
const URL_ARG = option('--url');
const LIST = args.includes('--list');

const searchUrls = (query, year) => {
  const q = encodeURIComponent(query);
  const urls = [
    { name: 'Library full-text (books, periodicals, address directories)', url: `https://library.hungaricana.hu/en/search/results/?query=SZO%3D(${q})` },
    { name: 'Budapest address directories 1880-1928', url: `https://library.hungaricana.hu/en/collection/fszek_budapesti_czim_es_lakasjegyzek/?query=SZO%3D(${q})` },
    { name: 'Maps portal (georeferenced historical maps)', url: `https://maps.hungaricana.hu/en/search/?q=${q}` },
    { name: 'Budapest Time Machine (1837/1873/1908/1937 lot-level)', url: 'https://maps.hungaricana.hu/en/BFLTerkeptar/' },
    { name: 'Archives (Budapest City Archives records)', url: `https://archives.hungaricana.hu/en/search/?q=${q}` },
  ];
  if (year) urls.push({ name: `Directory volume near ${year}`, url: `https://library.hungaricana.hu/en/collection/fszek_budapesti_czim_es_lakasjegyzek/?query=SZO%3D(${q})+DATE%3D(${encodeURIComponent(year)})` });
  return urls;
};

const main = async () => {
  if (LIST) {
    const rows = await fs.readFile(LEDGER, 'utf8').then((text) => text.split('\n').filter(Boolean).map(JSON.parse)).catch(() => []);
    console.log(JSON.stringify({ ledger: LEDGER, count: rows.length, verifications: rows }, null, 2));
    return;
  }
  if (CONFIRM) {
    if (!URL_ARG || !/^https:\/\/[a-z]+\.hungaricana\.hu\//u.test(URL_ARG)) {
      throw new Error('--confirm requires --url pointing at a hungaricana.hu page a human actually checked');
    }
    const row = {
      fact: CONFIRM,
      source_url: URL_ARG,
      entity_id: option('--entity'),
      book_page: option('--page') ? Number(option('--page')) : null,
      note: option('--note'),
      verified_by: 'human',
      verified_at: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(LEDGER), { recursive: true });
    await fs.appendFile(LEDGER, `${JSON.stringify(row)}\n`, 'utf8');
    console.log(JSON.stringify({ recorded: row, ledger: LEDGER }));
    return;
  }
  if (!QUERY) throw new Error('Provide --query "<text>" (or --confirm/--list). This tool never fetches Hungaricana pages itself.');
  console.log(`Open these searches for "${QUERY}"${YEAR ? ` around ${YEAR}` : ''} and verify by eye:`);
  for (const { name, url } of searchUrls(QUERY, YEAR)) console.log(`- ${name}\n  ${url}`);
  console.log('\nRecord a verified fact with:\n  node cli/hungaricana-lookup.js --confirm "<fact>" --url "<page url>" [--entity se_x] [--page N] [--note "..."]');
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
