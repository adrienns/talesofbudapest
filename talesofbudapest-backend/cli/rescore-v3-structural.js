#!/usr/bin/env node
/**
 * Re-apply structural quality + pronoun grounding to the latest V3 item rows
 * without a paid re-extract. Appends rescored runs so eval "latest by page"
 * picks them up.
 *
 * Policy matches extract-time: any non-null structural reason demotes; only
 * reason === null may restore a prior structural demotion, and only when
 * pre_structural_verification.verdict === 'supported' (never manufacture support).
 *
 * Usage: node cli/rescore-v3-structural.js [--source jewish-budapest] [--pages 46,47,48]
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groundPronominalStatement, itemStructuralQualityReason } from '../lib/historicalItemQuality.js';
import { collapseClauseSiblingItems } from '../lib/historicalExtractionV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const PAGE_FILTER = option('--pages') ? new Set(option('--pages').split(',').map(Number)) : null;
const ITEMS = path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-items-v3.jsonl`);
const ALLOWED_STATUS = new Set(['complete', 'failed_cost_gate']);

const readJsonl = async (file) => (await fs.readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(JSON.parse);
const appendJsonl = async (file, row) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(row)}\n`, 'utf8');
};

const main = async () => {
  const rows = await readJsonl(ITEMS);
  const latestByKey = new Map();
  for (const row of rows) {
    // Prefer original extracts with supported items. Include gold-seed / rebind
    // reference experiments; ignore prior rescored appends and incomplete shells.
    const isReference = row.experiment_id === 'gold-seed-dev' || row.experiment_id === 'gold-rebind-75';
    if ((!isReference && row.experiment_id) || row.structural_rescore || !Array.isArray(row.items) || !ALLOWED_STATUS.has(row.status)) continue;
    const supported = (row.items ?? []).filter((item) => item.verification?.verdict === 'supported').length;
    if (!supported) continue;
    const key = (row.pdf_pages ?? []).join(',');
    if (!key) continue;
    if (PAGE_FILTER && !(row.pdf_pages ?? []).some((page) => PAGE_FILTER.has(page))) continue;
    const previous = latestByKey.get(key);
    const previousReference = previous && (previous.experiment_id === 'gold-seed-dev' || previous.experiment_id === 'gold-rebind-75');
    if (!previous || (isReference !== previousReference ? isReference : String(row.extracted_at ?? '') > String(previous.extracted_at ?? ''))) {
      latestByKey.set(key, row);
    }
  }

  let rescoredRuns = 0;
  let demoted = 0;
  let restored = 0;
  let skippedRestore = 0;
  let grounded = 0;
  let beforeSupported = 0;
  let afterSupported = 0;

  for (const row of latestByKey.values()) {
    beforeSupported += (row.items ?? []).filter((item) => item.verification?.verdict === 'supported').length;
    let rowDemoted = 0;
    let rowRestored = 0;
    let rowSkippedRestore = 0;
    let rowGrounded = 0;
    const items = (row.items ?? []).map((item) => {
      const beforeGround = item;
      const next = groundPronominalStatement(item);
      if (next.statement_en !== beforeGround.statement_en && next.statement_grounded_from_pronoun) {
        grounded += 1;
        rowGrounded += 1;
      }
      const reason = itemStructuralQualityReason(next);
      const priorReason = String(item.verification?.reason ?? '');
      const wasStructuralDemote = item.verification?.verdict !== 'supported'
        && priorReason.startsWith('Structural item-quality gate:');
      const preserved = item.pre_structural_verification ?? null;
      const preservedBound = preserved
        && preserved.bound_run_id
        && preserved.bound_item_id === item.item_id
        && (preserved.bound_statement_en === next.statement_en
          || preserved.bound_grounded_statement_en === next.statement_en)
        && (preserved.bound_run_id === row.run_id
          || (row.structural_rescore?.run_id_ancestry ?? []).includes(preserved.bound_run_id));

      // Align with extract-time: any structural reason demotes; preserve verifier.
      if (reason) {
        if (next.verification?.verdict === 'supported') {
          demoted += 1;
          rowDemoted += 1;
        }
        return {
          ...next,
          pre_structural_verification: preserved ?? {
            ...(item.verification ?? {}),
            bound_run_id: row.run_id,
            bound_item_id: item.item_id,
            bound_statement_en: beforeGround.statement_en,
            bound_grounded_statement_en: next.statement_en,
          },
          verification: { verdict: 'unsupported', reason: `Structural item-quality gate: ${reason}` },
        };
      }
      // Restore only when gate clears AND bound pre-structural verifier said supported.
      if (wasStructuralDemote) {
        if (preservedBound && preserved?.verdict === 'supported') {
          restored += 1;
          rowRestored += 1;
          return {
            ...next,
            pre_structural_verification: preserved,
            verification: {
              verdict: 'supported',
              reason: 'Restored after structural gate revision (bound pre-structural verifier supported)',
            },
          };
        }
        skippedRestore += 1;
        rowSkippedRestore += 1;
        return { ...next, pre_structural_verification: preserved, verification: item.verification };
      }
      return next;
    });
    const collapsed = collapseClauseSiblingItems(items, { supportedOnly: true });
    afterSupported += collapsed.filter((item) => item.verification?.verdict === 'supported').length;
    const ancestry = [
      ...(row.structural_rescore?.run_id_ancestry ?? []),
      row.run_id,
    ].filter(Boolean);
    await appendJsonl(ITEMS, {
      ...row,
      run_id: crypto.randomUUID(),
      extracted_at: new Date().toISOString(),
      status: row.status === 'complete' ? 'complete' : row.status,
      items: collapsed,
      supported_item_count: collapsed.filter((item) => item.verification?.verdict === 'supported').length,
      structural_rescore: {
        from_run_id: row.run_id,
        run_id_ancestry: ancestry,
        demoted: rowDemoted,
        restored: rowRestored,
        skipped_restore_without_pre_supported: rowSkippedRestore,
        grounded: rowGrounded,
        clause_siblings_collapsed: items.filter((item) => item.verification?.verdict === 'supported').length
          - collapsed.filter((item) => item.verification?.verdict === 'supported').length,
        mode: 'hard_demote_no_dedupe',
        policy: 'demote_any_reason_restore_only_pre_supported',
      },
    });
    rescoredRuns += 1;
  }

  console.log(JSON.stringify({
    source_id: SOURCE_ID,
    rescored_runs: rescoredRuns,
    supported_before: beforeSupported,
    supported_after: afterSupported,
    demoted,
    restored,
    skipped_restore_without_pre_supported: skippedRestore,
    grounded,
  }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
