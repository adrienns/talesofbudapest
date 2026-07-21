#!/usr/bin/env node
/**
 * Turn a V3 extraction run's supported items into annotation JSON for
 * merge-gold-annotations.js. Stamps gold_source as draft-auto (or override);
 * never stamps human-*.
 *
 * Usage:
 *   node cli/seed-gold-from-run.js --run-id <uuid> [--gold-source draft-auto]
 *   node cli/seed-gold-from-run.js --experiment-id gold-seed-dev [--pages 15,16,18,24,46]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldText } from '../lib/historicalExtractionV2.js';
import { itemStructuralQualityReason } from '../lib/historicalItemQuality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const ITEMS = option('--items', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl'));
const OUTPUT = option('--output', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.gold-seed-annotations.json'));
const RUN_ID = option('--run-id');
const EXPERIMENT_ID = option('--experiment-id');
const GOLD_SOURCE = option('--gold-source', 'draft-auto');
const PAGE_FILTER = option('--pages') ? new Set(option('--pages').split(',').map(Number)) : null;
const LIMIT = Number(option('--limit', '0')) || Infinity;

const STOP = new Set(['the', 'and', 'that', 'this', 'his', 'her', 'was', 'were', 'with', 'from', 'into', 'during', 'after', 'before', 'their', 'they', 'him', 'had', 'has', 'have', 'for', 'but', 'not', 'are', 'who', 'which']);

const requiredTermsFromStatement = (statement) => {
  const years = [...new Set((String(statement).match(/\b(?:1[0-9]{3}|20[0-2][0-9])\b/gu) ?? []))];
  const tokens = foldText(statement).split(/\s+/u).filter((token) => token.length >= 4 && !STOP.has(token));
  const picks = [...years, ...tokens.slice(0, 4)];
  return [...new Set(picks)].slice(0, 6).map((term) => [term]);
};

const main = async () => {
  if (String(GOLD_SOURCE).startsWith('human')) throw new Error('seed-gold-from-run refuses human-* gold_source; use browser adjudication');
  const rows = (await fs.readFile(ITEMS, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
    .filter((row) => Array.isArray(row.items) && ['complete', 'failed_cost_gate', 'incomplete_api'].includes(row.status));
  const selected = RUN_ID
    ? rows.filter((row) => row.run_id === RUN_ID)
    : EXPERIMENT_ID
      ? rows.filter((row) => row.experiment_id === EXPERIMENT_ID)
      : [];
  if (!selected.length) throw new Error('Provide --run-id or --experiment-id matching a V3 run');

  const annotations = [];
  const layoutZones = [];
  for (const row of selected) {
    for (const layoutPage of row.layout?.pages ?? []) {
      for (const block of layoutPage.masked_blocks ?? []) {
        layoutZones.push({
          page: layoutPage.page_ref,
          zone: block.zone,
          text_sha256: block.text_sha256 ?? null,
          x_min: block.x_min,
          y_min: block.y_min,
          x_max: block.x_max,
          y_max: block.y_max,
        });
      }
    }
    for (const item of row.items ?? []) {
      if (item.verification?.verdict !== 'supported') continue;
      const pages = [...new Set((item.evidence ?? []).map((entry) => entry.page_ref))];
      const page = pages[0];
      if (PAGE_FILTER && !pages.some((value) => PAGE_FILTER.has(value))) continue;
      const structural = itemStructuralQualityReason(item);
      if (structural) continue;
      annotations.push({
        item_id: item.item_id,
        verdict: 'accepted',
        page,
        kind: item.kind,
        assertion_kind: item.assertion_kind ?? null,
        canonical_type: item.canonical_type ?? null,
        clause_ids: item.clause_ids ?? [],
        required_terms: requiredTermsFromStatement(item.statement_en),
        tags: [],
        statement: item.statement_en,
        note: 'seeded from supported V3 item',
      });
      if (annotations.length >= LIMIT) break;
    }
    if (annotations.length >= LIMIT) break;
  }

  const byPage = annotations.reduce((map, row) => map.set(row.page, (map.get(row.page) ?? 0) + 1), new Map());
  const payload = {
    source_id: selected[0].source_id ?? 'jewish-budapest',
    run_ids: [...new Set(selected.map((row) => row.run_id))],
    gold_source: GOLD_SOURCE,
    generated_at: new Date().toISOString(),
    annotations,
    layout_zones: layoutZones,
    references: selected.flatMap((row) => (row.resolved_references ?? []).map((reference) => ({
      page: row.pdf_pages?.[0] ?? null,
      clause_id: reference.clause_id,
      surface: reference.surface,
      antecedent_mention_id: reference.antecedent_mention_id,
      resolved_entity_id: reference.resolved_entity_id ?? null,
    }))),
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: OUTPUT,
    annotations: annotations.length,
    pages: [...byPage.entries()].sort((a, b) => a[0] - b[0]),
    layout_zones: layoutZones.length,
    gold_source: GOLD_SOURCE,
  }, null, 2));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
