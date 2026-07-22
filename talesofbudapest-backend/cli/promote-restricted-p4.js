#!/usr/bin/env node
/**
 * Promote a fresh restricted extract JSONL into the content + speakers pipeline.
 *
 * Usage:
 *   node cli/promote-restricted-p4.js --source budapest-joe-hajdu \
 *     --input …/budapest-joe-hajdu.entities.p4.jsonl \
 *     --max-page 294
 *
 * Writes:
 *   *.entities.content.jsonl  (pdf_pages ⊆ 1..max-page)
 *   *.entities.content.speakers.jsonl (annotate post-pass)
 */
import { spawnSync } from 'node:child_process';
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
const INPUT = path.resolve(option('--input', path.join(EXTRACTIONS, `${SOURCE}.entities.p4.jsonl`)));
const MAX_PAGE = Math.max(1, Number(option('--max-page', '294')) || 294);
const CONTENT = path.resolve(option('--content-output', path.join(EXTRACTIONS, `${SOURCE}.entities.content.jsonl`)));
const SPEAKERS = path.resolve(option('--speakers-output', path.join(EXTRACTIONS, `${SOURCE}.entities.content.speakers.jsonl`)));
const BACKUP_SUFFIX = option('--backup-suffix', new Date().toISOString().replace(/[:.]/g, '-'));

const readJsonl = async (file) => (await fs.readFile(file, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL at line ${index + 1}`); }
  });

const backupIfExists = async (file) => {
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  const dest = `${file}.bak-${BACKUP_SUFFIX}`;
  await fs.copyFile(file, dest);
  return dest;
};

const main = async () => {
  const rows = await readJsonl(INPUT);
  const content = rows.filter((row) => {
    const pages = (row.pdf_pages ?? []).map(Number);
    return pages.length && pages.every((page) => Number.isInteger(page) && page >= 1 && page <= MAX_PAGE);
  });
  const contentBackup = await backupIfExists(CONTENT);
  const speakersBackup = await backupIfExists(SPEAKERS);
  await fs.writeFile(CONTENT, `${content.map((row) => JSON.stringify(row)).join('\n')}\n`);

  const annotate = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'annotate-restricted-speakers.js'),
      '--source', SOURCE,
      '--input', CONTENT,
      '--output', SPEAKERS,
    ],
    { stdio: 'inherit' },
  );
  if (annotate.status !== 0) {
    throw new Error(`annotate-restricted-speakers failed with status ${annotate.status}`);
  }

  console.log(JSON.stringify({
    input: INPUT,
    content: CONTENT,
    speakers: SPEAKERS,
    max_page: MAX_PAGE,
    windows_in: rows.length,
    windows_content: content.length,
    content_backup: contentBackup,
    speakers_backup: speakersBackup,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
