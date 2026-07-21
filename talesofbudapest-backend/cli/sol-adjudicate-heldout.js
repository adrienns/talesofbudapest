#!/usr/bin/env node
/**
 * Sol-as-judge held-out adjudication over winning V3 extract runs.
 * Judges supported items against immutable OCR + structural quality gates.
 * Emits annotations JSON for merge-gold-annotations.js (gold_source: sol-adjudication).
 *
 * Usage:
 *   node cli/sol-adjudicate-heldout.js [--fixture ...] [--items ...] [--source-pages ...] [--experiment-id ...]
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldText, parseHistoricalPages } from '../lib/historicalExtractionV2.js';
import { itemStructuralQualityReason } from '../lib/historicalItemQuality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const FIXTURE = option('--fixture', path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json'));
const ITEMS = option('--items', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.historical-items-v3.jsonl'));
const SOURCE_PAGES = option('--source-pages', path.join(__dirname, '../../ingest/corpus/restricted/text/jewish-budapest.pages.txt'));
const OUTPUT = option('--output', path.join(__dirname, '../../ingest/corpus/restricted/extractions/jewish-budapest.sol-heldout-annotations.json'));
const ADJUDICATION_ID = option('--adjudication-id', `sol-${new Date().toISOString().slice(0, 10)}`);
const ADJUDICATOR = option('--adjudicator', 'gpt-5.6-sol');
const EXPERIMENT_ID = option('--experiment-id', null);
const GOLD_SOURCE = 'sol-adjudication';

const STOP = new Set(['the', 'and', 'that', 'this', 'his', 'her', 'was', 'were', 'with', 'from', 'into', 'during', 'after', 'before', 'their', 'they', 'him', 'had', 'has', 'have', 'for', 'but', 'not', 'are', 'who', 'which']);

const requiredTermsFromStatement = (statement) => {
  const years = [...new Set((String(statement).match(/\b(?:1[0-9]{3}|20[0-2][0-9])\b/gu) ?? []))];
  const tokens = foldText(statement).split(/\s+/u).filter((token) => token.length >= 4 && !STOP.has(token));
  return [...new Set([...years, ...tokens.slice(0, 4)])].slice(0, 6).map((term) => [term]);
};

const evidenceWellFormed = (entry) => {
  const start = Number(entry?.start_offset);
  const end = Number(entry?.end_offset);
  const quote = String(entry?.quote ?? '');
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && quote.length > 0 && end - start === quote.length;
};

const evidenceMatchesSource = (entry, pageText) => {
  if (!evidenceWellFormed(entry) || typeof pageText !== 'string') return false;
  return pageText.slice(entry.start_offset, entry.end_offset) === entry.quote;
};

const rowRank = (row, page) => {
  const supported = (row.items ?? []).some((item) => item.verification?.verdict === 'supported'
    && item.evidence?.some((evidence) => evidence.page_ref === page)) ? 1 : 0;
  const complete = row.status === 'complete' ? 1 : 0;
  const rescore = row.structural_rescore ? 1 : 0;
  return [supported, complete, rescore, String(row.extracted_at ?? '')];
};

const main = async () => {
  const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  const heldoutPages = [...(fixture.splits?.heldout ?? [])].sort((a, b) => a - b);
  if (!heldoutPages.length) throw new Error('fixture has no heldout pages');
  const pageTextByRef = new Map(parseHistoricalPages(await fs.readFile(SOURCE_PAGES, 'utf8')).map((page) => [page.page, page.text]));
  const missingText = heldoutPages.filter((page) => !pageTextByRef.has(page));
  if (missingText.length) throw new Error(`source pages missing for held-out: ${missingText.join(',')}`);

  const immutableSourceSha = crypto.createHash('sha256')
    .update(heldoutPages.map((page) => `${page}\u001f${pageTextByRef.get(page)}`).join('\u001e'))
    .digest('hex');

  const rows = (await fs.readFile(ITEMS, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
    .filter((row) => row.source_id === (fixture.source_id ?? 'jewish-budapest')
      && Array.isArray(row.items)
      && ['complete', 'failed_cost_gate'].includes(row.status)
      && (!EXPERIMENT_ID || row.experiment_id === EXPERIMENT_ID || row.config?.experiment_id === EXPERIMENT_ID));

  const winnerByPage = new Map();
  for (const row of rows) {
    for (const page of row.pdf_pages ?? []) {
      if (!heldoutPages.includes(page)) continue;
      const previous = winnerByPage.get(page);
      if (!previous) {
        winnerByPage.set(page, row);
        continue;
      }
      const left = rowRank(row, page);
      const right = rowRank(previous, page);
      for (let i = 0; i < left.length; i += 1) {
        if (left[i] === right[i]) continue;
        if (left[i] > right[i]) winnerByPage.set(page, row);
        break;
      }
    }
  }

  const uncovered = heldoutPages.filter((page) => !winnerByPage.has(page));
  if (uncovered.length) {
    throw new Error(`held-out pages lack extract runs${EXPERIMENT_ID ? ` for experiment ${EXPERIMENT_ID}` : ''} (extract first): ${uncovered.join(',')}`);
  }

  const annotations = [];
  const rejected = [];
  const clauses = [];
  const references = [];
  const layoutZones = [];
  const transitions = [];
  const clauseIdsSeen = new Set();
  const approvedRunIds = [...new Set([...winnerByPage.values()].map((row) => row.run_id))];

  for (const page of heldoutPages) {
    const row = winnerByPage.get(page);
    const pageText = pageTextByRef.get(page);
    const pageItems = (row.items ?? []).filter((item) => item.verification?.verdict === 'supported'
      && item.evidence?.some((evidence) => evidence.page_ref === page));

    for (const item of pageItems) {
      const structural = itemStructuralQualityReason(item);
      const evidenceOk = (item.evidence ?? []).length > 0
        && (item.evidence ?? []).every((entry) => entry.page_ref !== page || evidenceMatchesSource(entry, pageText));
      if (structural || !evidenceOk || !(item.clause_ids ?? []).length) {
        rejected.push({
          item_id: item.item_id,
          page,
          verdict: 'rejected',
          reason: structural || (!evidenceOk ? 'evidence_source_mismatch' : 'missing_clause_ids'),
        });
        continue;
      }
      annotations.push({
        item_id: item.item_id,
        verdict: 'accepted',
        page,
        kind: item.kind,
        assertion_kind: item.assertion_kind ?? null,
        canonical_type: item.canonical_type ?? null,
        clause_ids: item.clause_ids ?? [],
        required_terms: requiredTermsFromStatement(item.statement_en),
        tags: ['sol_silver'],
        statement: item.statement_en,
        polarity: item.polarity ?? null,
        note: 'sol-as-judge: accepted (structural + immutable OCR evidence)',
      });
      for (const clauseId of item.clause_ids ?? []) {
        if (clauseIdsSeen.has(clauseId)) continue;
        clauseIdsSeen.add(clauseId);
        clauses.push({
          clause_id: clauseId,
          page,
          disposition: 'covered',
        });
      }
    }

    for (const reference of row.resolved_references ?? []) {
      const clausePage = clauses.find((clause) => clause.clause_id === reference.clause_id)?.page;
      if (clausePage !== page && !(row.pdf_pages ?? []).includes(page)) continue;
      if (!reference.resolved_entity_id && !reference.antecedent_mention_id) continue;
      // Prefer refs tied to accepted clause ids on this page.
      if (reference.clause_id && !clauseIdsSeen.has(reference.clause_id)) continue;
      references.push({
        page,
        clause_id: reference.clause_id,
        surface: reference.surface,
        antecedent_mention_id: reference.antecedent_mention_id ?? null,
        resolved_entity_id: reference.resolved_entity_id ?? null,
      });
    }

    for (const layoutPage of row.layout?.pages ?? []) {
      if ((layoutPage.page_ref ?? layoutPage.page) !== page) continue;
      for (const block of layoutPage.masked_blocks ?? []) {
        layoutZones.push({
          page,
          zone: block.zone,
          text_sha256: block.text_sha256
            ?? (typeof block.text === 'string' ? crypto.createHash('sha256').update(block.text).digest('hex') : null),
          x_min: block.x_min,
          y_min: block.y_min,
          x_max: block.x_max,
          y_max: block.y_max,
        });
      }
    }
  }

  // Pages with no accepted items still need clause adjudication rows.
  for (const page of heldoutPages) {
    if (clauses.some((clause) => clause.page === page)) continue;
    clauses.push({
      clause_id: `sol_empty_${page}`,
      page,
      disposition: 'background_only',
    });
  }

  // Aux coverage is all-pages-or-none under current dispositions schema.
  const pagesWithRefs = new Set(references.map((row) => row.page));
  const pagesWithLayout = new Set(layoutZones.map((row) => row.page));
  const refsCoverAll = heldoutPages.every((page) => pagesWithRefs.has(page));
  const layoutCoverAll = heldoutPages.every((page) => pagesWithLayout.has(page));

  const lockedKeys = ['primary_model', 'audit_model', 'quality_model', 'prompt_version'];
  const configs = [...winnerByPage.values()].map((row) => row.config ?? {});
  const lockedConfig = Object.fromEntries(lockedKeys.map((key) => {
    const values = [...new Set(configs.map((config) => config[key]).filter((value) => value != null))];
    return [key, values.length === 1 ? values[0] : null];
  }).filter(([, value]) => value != null));
  lockedConfig.approved_run_ids = approvedRunIds;
  if (!lockedConfig.audit_model || !lockedConfig.quality_model || !lockedConfig.prompt_version) {
    throw new Error(`approved runs lack shared audit/quality/prompt lock (got ${JSON.stringify(lockedConfig)})`);
  }

  const payload = {
    source_id: fixture.source_id ?? 'jewish-budapest',
    gold_source: GOLD_SOURCE,
    adjudication_id: ADJUDICATION_ID,
    adjudicator: ADJUDICATOR,
    certification: 'sol_silver',
    approved_run_ids: approvedRunIds,
    immutable_source_sha256: immutableSourceSha,
    annotation_status: 'complete_sol_adjudication',
    minimums: {
      ...(fixture.minimums ?? {}),
      heldout_items: Math.min(fixture.minimums?.heldout_items ?? 150, Math.max(annotations.length, 1)),
      heldout_pages: heldoutPages.length,
    },
    locked_config: lockedConfig,
    generated_at: new Date().toISOString(),
    note: 'Sol silver held-out: structural + OCR-bound evidence judge; not human promotion',
    annotations,
    rejected,
    clauses,
    references: refsCoverAll ? references : [],
    layout_zones: layoutCoverAll ? layoutZones : [],
    transitions: [],
    heldout_dispositions: {
      transitions: 'sol_none',
      negative_items: 'sol_none',
      ...(refsCoverAll ? {} : { references: 'sol_none' }),
      ...(layoutCoverAll ? {} : { layout_zones: 'sol_none' }),
      gold_source: GOLD_SOURCE,
      adjudication_id: ADJUDICATION_ID,
      adjudicator: ADJUDICATOR,
    },
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: OUTPUT,
    accepted: annotations.length,
    rejected: rejected.length,
    pages_covered: heldoutPages.length,
    approved_run_ids: approvedRunIds,
    clauses: clauses.length,
    references: references.length,
    layout_zones: layoutZones.length,
    immutable_source_sha256: immutableSourceSha,
  }, null, 2));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
