#!/usr/bin/env node
/**
 * Freeze a named gold split from usable V3 extracts on given pages.
 *
 * Default name=test pages=97,140,160,180 (legacy).
 * For a fresh probe set:
 *   node cli/seed-frozen-gold-split.js --name probe --pages 65,85,115,125 --force
 *
 * Policy: do not re-seed after freeze unless --force. Never stamp human-*.
 * Do not merge this split's FPs into development gold while tuning.
 * Metrics from frozen splits are freeze-replay agreement, not promotion.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collapseClauseSiblingItems, foldText } from '../lib/historicalExtractionV2.js';
import { groundPronominalStatement, itemStructuralQualityReason } from '../lib/historicalItemQuality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const FORCE = args.includes('--force');
const SPLIT_NAME = option('--name', 'test');
const DEFAULTS = {
  test: [97, 140, 160, 180],
  probe: [65, 85, 115, 125],
};
const PAGES = option('--pages')
  ? option('--pages').split(',').map(Number)
  : (DEFAULTS[SPLIT_NAME] ?? null);
if (!PAGES?.length) throw new Error('Provide --pages or a known --name with defaults');
const GOLD_SOURCE = option('--gold-source', `draft-auto-${SPLIT_NAME}`);
if (String(GOLD_SOURCE).startsWith('human')) throw new Error('refuses human-* gold_source');
const FIXTURE = option('--fixture', path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json'));
const ITEMS = option('--items', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl'));
const META_KEY = `${SPLIT_NAME}_split`;

const STOP = new Set(['the', 'and', 'that', 'this', 'his', 'her', 'was', 'were', 'with', 'from', 'into', 'during', 'after', 'before', 'their', 'they', 'him', 'had', 'has', 'have', 'for', 'but', 'not', 'are', 'who', 'which']);
const requiredTermsFromStatement = (statement) => {
  const years = [...new Set((String(statement).match(/\b(?:1[0-9]{3}|20[0-2][0-9])\b/gu) ?? []))];
  const tokens = foldText(statement).split(/\s+/u).filter((token) => token.length >= 4 && !STOP.has(token));
  return [...new Set([...years, ...tokens.slice(0, 4)])].slice(0, 6).map((term) => [term]);
};

const supportedOnPage = (row, page) => (row.items ?? []).some((item) => item.verification?.verdict === 'supported'
  && item.evidence?.some((evidence) => evidence.page_ref === page));

const freezePayloadHash = (meta, items) => {
  const ordered = [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      pages: [...(meta.pages ?? [])].sort((a, b) => a - b),
      gold_source: meta.gold_source ?? null,
      run_ids: [...(meta.run_ids ?? [])].sort(),
      source_run_ids: [...(meta.source_run_ids ?? [])].sort(),
      items: ordered.map((item) => ({
        id: item.id,
        page: item.page ?? null,
        pages: [...(item.pages ?? [])].sort((a, b) => a - b),
        kind: item.kind ?? null,
        assertion_kind: item.assertion_kind ?? null,
        canonical_type: item.canonical_type ?? null,
        open_type: item.open_type ?? null,
        polarity: item.polarity ?? null,
        clause_ids: [...(item.clause_ids ?? [])].sort(),
        required_terms: item.required_terms ?? [],
        statement_hint: item.statement_hint ?? null,
        tags: [...(item.tags ?? [])].sort(),
        gold_source: item.gold_source ?? null,
      })),
    }))
    .digest('hex');
};

const main = async () => {
  if (!/^[a-z][a-z0-9_]*$/u.test(SPLIT_NAME) || ['development', 'heldout', 'all'].includes(SPLIT_NAME)) {
    throw new Error('--name must be a lowercase split id other than development/heldout/all');
  }
  const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  if (fixture[META_KEY]?.frozen && !FORCE) {
    throw new Error(`${SPLIT_NAME} split already frozen at ${fixture[META_KEY].frozen_at}; pass --force to rebuild`);
  }

  // Never freeze from incomplete_api shells.
  const rows = (await fs.readFile(ITEMS, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
    .filter((row) => Array.isArray(row.items) && ['complete', 'failed_cost_gate'].includes(row.status)
      && !row.experiment_id);

  const latestByPage = new Map();
  for (const row of rows) {
    for (const page of PAGES) {
      if (!(row.pdf_pages ?? []).includes(page)) continue;
      const previous = latestByPage.get(page);
      const usable = supportedOnPage(row, page);
      const previousUsable = previous ? supportedOnPage(previous, page) : false;
      const complete = row.status === 'complete' ? 1 : 0;
      const previousComplete = previous?.status === 'complete' ? 1 : 0;
      const rescore = row.structural_rescore?.mode === 'hard_demote_no_dedupe' ? 1 : 0;
      const previousRescore = previous?.structural_rescore?.mode === 'hard_demote_no_dedupe' ? 1 : 0;
      if (!previous
        || (usable !== previousUsable ? usable
          : (complete !== previousComplete ? complete > previousComplete
            : (rescore !== previousRescore ? rescore : String(row.extracted_at ?? '') > String(previous.extracted_at ?? ''))))) {
        latestByPage.set(page, row);
      }
    }
  }

  const missing = PAGES.filter((page) => !supportedOnPage(latestByPage.get(page) ?? { items: [] }, page));
  if (missing.length) throw new Error(`no usable supported extracts for ${SPLIT_NAME} pages: ${missing.join(',')}`);

  const pageSet = new Set(PAGES);
  fixture.splits = fixture.splits ?? {};
  for (const key of Object.keys(fixture.splits)) {
    if (key === SPLIT_NAME) continue;
    fixture.splits[key] = (fixture.splits[key] ?? []).filter((page) => !pageSet.has(page));
  }
  fixture.splits[SPLIT_NAME] = [...PAGES].sort((a, b) => a - b);

  const kept = (fixture.items ?? []).filter((item) => !pageSet.has(item.page ?? item.pages?.[0]));
  const seeded = [];
  for (const page of fixture.splits[SPLIT_NAME]) {
    const row = latestByPage.get(page);
    const candidates = [];
    for (const item of row.items ?? []) {
      if (item.verification?.verdict !== 'supported') continue;
      if (!item.evidence?.some((evidence) => evidence.page_ref === page)) continue;
      const grounded = groundPronominalStatement(item);
      if (itemStructuralQualityReason(grounded)) continue;
      candidates.push(grounded);
    }
    for (const item of collapseClauseSiblingItems(candidates, { supportedOnly: true })) {
      seeded.push({
        id: item.item_id,
        page,
        kind: item.kind,
        assertion_kind: item.assertion_kind ?? null,
        canonical_type: item.canonical_type ?? null,
        open_type: item.open_type ?? null,
        clause_ids: item.clause_ids ?? [],
        required_terms: requiredTermsFromStatement(item.statement_en),
        tags: [`${SPLIT_NAME}_split`],
        statement_hint: item.statement_en,
        note: `frozen ${SPLIT_NAME}-split seed; fixture-fit / freeze-replay only — not independent human gold`,
        gold_source: GOLD_SOURCE,
      });
    }
  }

  fixture.items = [...kept, ...seeded].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || String(a.id).localeCompare(String(b.id)));
  const historyKey = `${META_KEY}_history`;
  const previous = fixture[META_KEY] ? { ...fixture[META_KEY] } : null;
  const rawHistory = fixture[historyKey] ?? [];
  const malformedHistory = rawHistory.filter((entry) => !entry?.content_sha256 || !Array.isArray(entry.item_ids) || !entry.item_ids.length);
  if (malformedHistory.length && !FORCE) {
    throw new Error(`${SPLIT_NAME} freeze history has ${malformedHistory.length} malformed entries; pass --force only after repairing or clearing ${historyKey}`);
  }
  // --force may reset broken history to a clean chain starting from a well-formed previous tip.
  const priorHistory = FORCE
    ? rawHistory.filter((entry) => entry?.content_sha256 && Array.isArray(entry.item_ids) && entry.item_ids.length)
    : rawHistory;
  if (FORCE && malformedHistory.length) {
    console.warn(JSON.stringify({ warning: 'malformed_freeze_history_dropped_on_force', split: SPLIT_NAME, dropped: malformedHistory.length }));
  }
  const generation = Number(previous?.freeze_generation ?? priorHistory.at(-1)?.freeze_generation ?? 0) + 1;
  const meta = {
    frozen: true,
    frozen_at: new Date().toISOString(),
    freeze_generation: generation,
    pages: fixture.splits[SPLIT_NAME],
    gold_source: GOLD_SOURCE,
    policy: `Do not re-seed without --force. Append-only history at ${historyKey}. Metrics are freeze-replay agreement, not promotion.`,
    run_ids: [...new Set([...latestByPage.values()].map((row) => row.structural_rescore?.from_run_id ?? row.run_id))],
    source_run_ids: [...new Set([...latestByPage.values()].map((row) => row.run_id))],
  };
  meta.content_sha256 = freezePayloadHash(meta, seeded);
  meta.item_ids = seeded.map((item) => item.id).sort();
  // Rebuild a clean chain: first retained entry is root (null parent).
  const history = priorHistory.map((entry, index) => ({
    ...entry,
    parent_content_sha256: index === 0 ? null : (entry.parent_content_sha256 ?? priorHistory[index - 1]?.content_sha256 ?? null),
  }));
  if (previous?.content_sha256 && Array.isArray(previous.item_ids) && previous.item_ids.length) {
    history.push({
      freeze_generation: previous.freeze_generation,
      frozen_at: previous.frozen_at,
      content_sha256: previous.content_sha256,
      pages: previous.pages,
      run_ids: previous.run_ids,
      source_run_ids: previous.source_run_ids,
      item_ids: previous.item_ids,
      parent_content_sha256: history.length ? history.at(-1).content_sha256 : null,
      superseded_at: meta.frozen_at,
    });
  }
  meta.parent_content_sha256 = history.at(-1)?.content_sha256 ?? null;
  fixture[historyKey] = history;
  fixture[META_KEY] = meta;
  if (SPLIT_NAME === 'test') fixture.test_split = fixture[META_KEY];

  await fs.writeFile(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    fixture: FIXTURE,
    split: SPLIT_NAME,
    pages: fixture.splits[SPLIT_NAME],
    seeded: seeded.length,
    by_page: Object.fromEntries(fixture.splits[SPLIT_NAME].map((page) => [page, seeded.filter((item) => item.page === page).length])),
    frozen_at: fixture[META_KEY].frozen_at,
    freeze_generation: generation,
    content_sha256: meta.content_sha256,
  }, null, 2));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
