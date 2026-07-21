#!/usr/bin/env node
/**
 * Rebind V3 gold clause_ids to a fresh extraction run.
 *
 * For each gold item, rematch to supported items on the same page by
 * required_terms + statement overlap. Never invents clause IDs: unmatched
 * items get note=needs_review and appear in the confession report.
 *
 * Usage:
 *   node cli/rebind-gold-clause-ids.js \
 *     --run-id <uuid> [--fixture fixtures/historical-book-items-golden-v3.json] \
 *     [--experiment-id gold-rebind-75] [--dry-run]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldText, semanticTokenOverlap } from '../lib/historicalExtractionV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const DRY_RUN = args.includes('--dry-run');

const FIXTURE = option('--fixture', path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json'));
const ITEMS = option('--items', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl'));
const RUN_ID = option('--run-id');
const EXPERIMENT_ID = option('--experiment-id');
const REPORT = option('--report', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.gold-rebind-report.json'));

const alternatives = (term) => (Array.isArray(term) ? term : [term]).map(foldText);

const termsMatch = (requiredTerms, text) => (requiredTerms ?? []).every((term) => alternatives(term).some((candidate) => text.includes(candidate)));

const scoreCandidate = (gold, item) => {
  const pages = new Set(gold.pages ?? (gold.page ? [gold.page] : []));
  if (pages.size && !item.evidence?.some((evidence) => pages.has(evidence.page_ref))) return -1;
  const haystack = foldText([
    item.statement_en,
    item.open_type,
    ...(item.evidence ?? []).map((evidence) => evidence.quote),
  ].join(' '));
  if (!termsMatch(gold.required_terms, haystack)) return -1;
  // Kind/assertion mismatches are soft penalties: Fable gold often labeled
  // event where the current pipeline emits assertion (or the reverse).
  const kindPenalty = gold.kind && gold.kind !== item.kind ? -3 : 0;
  const assertionPenalty = gold.assertion_kind && gold.assertion_kind !== item.assertion_kind ? -2 : 0;
  const hint = gold.statement_hint ? semanticTokenOverlap(gold.statement_hint, item.statement_en) : semanticTokenOverlap((gold.required_terms ?? []).flat().join(' '), item.statement_en);
  const clauseBonus = (gold.clause_ids ?? []).some((id) => item.clause_ids?.includes(id)) ? 10 : 0;
  return Math.max(0, clauseBonus + hint * 20 + (gold.required_terms?.length ?? 0) + kindPenalty + assertionPenalty);
};

const main = async () => {
  const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  const rows = (await fs.readFile(ITEMS, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
    .filter((row) => Array.isArray(row.items) && ['complete', 'failed_cost_gate'].includes(row.status));
  let run = null;
  if (RUN_ID) run = rows.find((row) => row.run_id === RUN_ID) ?? null;
  else if (EXPERIMENT_ID) {
    run = rows.filter((row) => row.experiment_id === EXPERIMENT_ID)
      .sort((left, right) => String(right.extracted_at ?? '').localeCompare(String(left.extracted_at ?? '')))[0] ?? null;
  }
  if (!run) throw new Error('Provide a matching --run-id or --experiment-id with a complete/failed_cost_gate V3 row');

  const supported = (run.items ?? []).filter((item) => item.verification?.verdict === 'supported');
  const confession = [];
  let rebound = 0;
  const nextItems = fixture.items.map((gold) => {
    const ranked = supported
      .map((item) => ({ item, score: scoreCandidate(gold, item) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score || left.item.item_id.localeCompare(right.item.item_id));
    const best = ranked[0]?.item;
    if (!best) {
      confession.push({ id: gold.id, page: gold.page, why: 'no_candidate', required_terms: gold.required_terms });
      return { ...gold, note: 'needs_review', gold_source: gold.gold_source ?? 'fable-5' };
    }
    const same = JSON.stringify(gold.clause_ids ?? []) === JSON.stringify(best.clause_ids ?? []);
    if (!same) rebound += 1;
    return {
      ...gold,
      clause_ids: [...(best.clause_ids ?? [])],
      statement_hint: gold.statement_hint ?? best.statement_en,
      note: same ? gold.note : (gold.note ? `${gold.note}; rebound` : 'rebound'),
      gold_source: gold.gold_source ?? 'fable-5',
    };
  });

  const report = {
    run_id: run.run_id,
    experiment_id: run.experiment_id ?? null,
    extracted_at: run.extracted_at ?? null,
    total_gold: fixture.items.length,
    rebound,
    unmatched: confession.length,
    confession,
    generated_at: new Date().toISOString(),
  };

  if (!DRY_RUN) {
    fixture.items = nextItems;
    await fs.writeFile(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  }
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ fixture: FIXTURE, report: REPORT, dry_run: DRY_RUN, ...report }, null, 2));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
