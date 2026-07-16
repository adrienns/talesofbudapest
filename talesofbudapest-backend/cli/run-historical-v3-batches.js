#!/usr/bin/env node
/**
 * Whole-book V3 orchestrator: runs extraction chapter by chapter, in small
 * sequential batches, with one subject-memory state file per chapter (a
 * chapter break is a discourse break: focus cold-starts deliberately).
 *
 * Safety rails:
 * - hard per-batch cost cap, cumulative ledger, hard total cap: the run stops
 *   the moment any batch fails or the total budget is exhausted
 * - every batch is resumable; a rerun skips completed batches via --resume
 * - dry-run prints the exact plan without spending anything
 *
 * Usage:
 *   node cli/run-historical-v3-batches.js --dry-run
 *   node cli/run-historical-v3-batches.js --max-total-usd 2.00 [--batch-pages 4]
 *     [--start-chapter <slug>] [--primary-model ...] [--audit-model ...]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const CHAPTERS_PATH = option('--chapters', path.join(__dirname, `../data/${SOURCE_ID}.chapters.json`));
const OUTPUT_DIR = path.join(__dirname, '../../ingest/corpus/restricted/extractions');
const LEDGER = path.join(OUTPUT_DIR, `${SOURCE_ID}.v3-run-ledger.jsonl`);
const BATCH_PAGES = Number(option('--batch-pages', '4'));
const MAX_BATCH_USD = Number(option('--max-batch-usd', String(BATCH_PAGES * 0.005)));
const MAX_TOTAL_USD = Number(option('--max-total-usd', '2.00'));
const DRY_RUN = args.includes('--dry-run');
const START_CHAPTER = option('--start-chapter', null);
const PASS_THROUGH = ['--primary-model', '--audit-model', '--quality-model', '--primary-reasoning', '--audit-reasoning', '--experiment-id']
  .flatMap((name) => (option(name) ? [name, option(name)] : []));

const slugify = (value) => String(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/gu, '').replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 40);

const readLedger = async () => (await fs.readFile(LEDGER, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(JSON.parse);

const runBatch = ({ fromPage, pageCount, stateFile }) => new Promise((resolve) => {
  const cliArgs = [
    path.join(__dirname, 'extract-historical-book-v2.js'), '--v3',
    '--source', SOURCE_ID,
    '--from-page', String(fromPage),
    '--page-count', String(pageCount),
    '--max-cost-usd', String(MAX_BATCH_USD),
    '--state-file', stateFile,
    ...PASS_THROUGH,
  ];
  const child = spawn(process.execPath, cliArgs, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OPENROUTER_TIMEOUT_MS: process.env.OPENROUTER_TIMEOUT_MS ?? '300000' } });
  let tail = '';
  const keep = (chunk) => { tail = (tail + chunk).slice(-2000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('close', (code) => resolve({ code, tail }));
});

const latestBatchCost = async (fromPage, pageCount) => {
  const rows = (await fs.readFile(path.join(OUTPUT_DIR, `${SOURCE_ID}.historical-items-v3.jsonl`), 'utf8').catch(() => '')).split('\n').filter(Boolean).map(JSON.parse);
  const pages = Array.from({ length: pageCount }, (_, index) => fromPage + index);
  const row = rows.filter((entry) => JSON.stringify(entry.pdf_pages) === JSON.stringify(pages)).at(-1);
  return { status: row?.status ?? 'missing', cost: Number(row?.usage?.cost ?? 0), supported: row?.supported_item_count ?? 0, items: (row?.items ?? []).length };
};

const main = async () => {
  const chapterFile = JSON.parse(await fs.readFile(CHAPTERS_PATH, 'utf8'));
  const chapters = chapterFile.chapters ?? chapterFile;
  if (!Array.isArray(chapters) || !chapters.length) throw new Error(`No chapters in ${CHAPTERS_PATH}; create it from the detect-chapters candidates first`);
  const ledger = await readLedger();
  const done = new Set(ledger.filter((row) => row.status && !['incomplete_api', 'incomplete_budget', 'missing'].includes(row.status)).map((row) => `${row.from_page}:${row.page_count}`));
  let spent = ledger.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
  let started = !START_CHAPTER;

  for (const chapter of chapters) {
    const slug = slugify(chapter.title ?? `${chapter.from_page}-${chapter.to_page}`);
    if (!started) { if (slug === START_CHAPTER) started = true; else continue; }
    if (chapter.skip) { console.log(`skip chapter ${slug} (marked skip)`); continue; }
    const stateFile = path.join(OUTPUT_DIR, `${SOURCE_ID}.${slug}.subject-memory.json`);
    for (let fromPage = chapter.from_page; fromPage <= chapter.to_page; fromPage += BATCH_PAGES) {
      const pageCount = Math.min(BATCH_PAGES, chapter.to_page - fromPage + 1);
      const key = `${fromPage}:${pageCount}`;
      if (done.has(key)) { console.log(`skip ${slug} ${fromPage}+${pageCount} (already complete)`); continue; }
      if (spent + MAX_BATCH_USD > MAX_TOTAL_USD) {
        console.error(`stopping: total budget ${MAX_TOTAL_USD} would be exceeded (spent ${spent.toFixed(4)})`);
        process.exitCode = 1;
        return;
      }
      console.log(`${DRY_RUN ? 'PLAN' : 'RUN '} chapter=${slug} pages ${fromPage}-${fromPage + pageCount - 1} cap=$${MAX_BATCH_USD}`);
      if (DRY_RUN) continue;
      const result = await runBatch({ fromPage, pageCount, stateFile });
      const summary = await latestBatchCost(fromPage, pageCount);
      spent += summary.cost;
      const row = {
        chapter: slug, from_page: fromPage, page_count: pageCount, exit_code: result.code,
        ...summary, spent_total: Number(spent.toFixed(6)), at: new Date().toISOString(),
      };
      await fs.appendFile(LEDGER, `${JSON.stringify(row)}\n`, 'utf8');
      console.log(JSON.stringify(row));
      if (result.code !== 0 && !['failed_cost_gate'].includes(summary.status)) {
        console.error(`stopping on failed batch (${summary.status}). Tail:\n${result.tail.slice(-600)}`);
        process.exitCode = 1;
        return;
      }
    }
  }
  console.log(`${DRY_RUN ? 'plan complete' : 'book pass complete'}; total spent $${spent.toFixed(4)}`);
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
