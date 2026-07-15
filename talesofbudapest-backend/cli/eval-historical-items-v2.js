import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldText } from '../lib/historicalExtractionV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const SOURCE_ID = option('--source', 'jewish-budapest');
const SPLIT = option('--split', 'heldout');
const GOLD = option('--golden', path.join(__dirname, '../fixtures/historical-book-items-golden-v2.json'));
const ITEMS = option('--items', path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-items-v2.jsonl`));
const ALLOW_INCOMPLETE = args.includes('--allow-incomplete');
const REPORT_ONLY = args.includes('--report-only');

const readJsonl = (text) => text.split('\n').filter(Boolean).map(JSON.parse);
const alternatives = (term) => (Array.isArray(term) ? term : [term]).map(foldText);

const metric = ({ gold, predicted, matches }) => {
  const truePositive = matches.length;
  const falsePositive = predicted.length - new Set(matches.map((match) => match.prediction_id)).size;
  const falseNegative = gold.length - new Set(matches.map((match) => match.gold_id)).size;
  return {
    expected: gold.length,
    predicted: predicted.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    precision: truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0,
    recall: gold.length ? truePositive / gold.length : 0,
  };
};

const matchScore = (gold, item) => {
  if (gold.kind !== item.kind) return -1;
  if (gold.assertion_kind && gold.assertion_kind !== item.assertion_kind) return -1;
  if (gold.canonical_type && gold.canonical_type !== item.canonical_type) return -1;
  if (gold.open_type && foldText(gold.open_type) !== foldText(item.open_type)) return -1;
  const goldClauses = new Set(gold.clause_ids ?? []);
  const clauseOverlap = item.clause_ids?.some((id) => goldClauses.has(id)) ?? false;
  if (goldClauses.size && !clauseOverlap) return -1;
  const pages = new Set(gold.pages ?? (gold.page ? [gold.page] : []));
  if (pages.size && !item.evidence?.some((evidence) => pages.has(evidence.page_ref))) return -1;
  const text = foldText([
    item.statement_en,
    item.open_type,
    item.canonical_type,
    ...(item.participants ?? []).map((participant) => participant.role),
    ...(item.evidence ?? []).map((evidence) => evidence.quote),
  ].join(' '));
  if (!(gold.required_terms ?? []).every((term) => alternatives(term).some((candidate) => text.includes(candidate)))) return -1;
  return (clauseOverlap ? 20 : 0) + (gold.canonical_type === item.canonical_type ? 5 : 0) + (gold.required_terms?.length ?? 0);
};

const maximumMatch = (gold, predicted) => {
  const candidates = gold.flatMap((expected) => predicted.flatMap((item) => {
    const score = matchScore(expected, item);
    return score < 0 ? [] : [{ gold_id: expected.id, prediction_id: item.prediction_id, score }];
  }));
  const byGold = new Map(gold.map((item) => [item.id, candidates.filter((candidate) => candidate.gold_id === item.id).sort((left, right) => right.score - left.score)]));
  const predictionToGold = new Map();
  const edgeByPair = new Map(candidates.map((candidate) => [`${candidate.gold_id}\u001f${candidate.prediction_id}`, candidate]));
  const augment = (goldId, seenPredictions) => {
    for (const candidate of byGold.get(goldId) ?? []) {
      if (seenPredictions.has(candidate.prediction_id)) continue;
      seenPredictions.add(candidate.prediction_id);
      const previousGold = predictionToGold.get(candidate.prediction_id);
      if (!previousGold || augment(previousGold, seenPredictions)) {
        predictionToGold.set(candidate.prediction_id, goldId);
        return true;
      }
    }
    return false;
  };
  [...byGold].sort((left, right) => left[1].length - right[1].length).forEach(([goldId]) => augment(goldId, new Set()));
  return [...predictionToGold].map(([predictionId, goldId]) => edgeByPair.get(`${goldId}\u001f${predictionId}`));
};

const main = async () => {
  if (!['development', 'heldout', 'all'].includes(SPLIT)) throw new Error('--split must be development, heldout, or all');
  const fixture = JSON.parse(await fs.readFile(GOLD, 'utf8'));
  if (fixture.source_id !== SOURCE_ID || !fixture.splits || !Array.isArray(fixture.items)) throw new Error('V2 gold fixture source/splits/items mismatch');
  const selectedPages = new Set(SPLIT === 'all' ? [...fixture.splits.development, ...fixture.splits.heldout] : fixture.splits[SPLIT]);
  const gold = fixture.items.filter((item) => selectedPages.has(item.page ?? item.pages?.[0]));
  const heldoutGold = fixture.items.filter((item) => fixture.splits.heldout.includes(item.page ?? item.pages?.[0]));
  const blockers = [];
  if (fixture.annotation_status !== 'complete') blockers.push('annotation_status is not complete');
  if (fixture.items.length < fixture.minimums.total_items) blockers.push(`gold has ${fixture.items.length}/${fixture.minimums.total_items} required items`);
  if (heldoutGold.length < fixture.minimums.heldout_items) blockers.push(`heldout has ${heldoutGold.length}/${fixture.minimums.heldout_items} required items`);
  if (fixture.items.some((item) => !Array.isArray(item.clause_ids) || !item.clause_ids.length)) blockers.push('one or more gold items lack clause_ids');
  if (!fixture.locked_config) blockers.push('held-out extraction configuration is not locked');
  const adjudicatedPages = new Set((fixture.clauses ?? []).map((clause) => clause.page));
  const missingAdjudicatedPages = [...selectedPages].filter((page) => !adjudicatedPages.has(page));
  if (missingAdjudicatedPages.length) blockers.push(`${missingAdjudicatedPages.length} selected pages lack clause-level gold adjudication`);
  if ((fixture.clauses ?? []).some((clause) => !clause.clause_id || !['covered', 'background_only', 'reference_only', 'ambiguous'].includes(clause.disposition))) blockers.push('one or more gold clauses lack a valid disposition');
  if (blockers.length && !ALLOW_INCOMPLETE) {
    console.log(JSON.stringify({ source_id: SOURCE_ID, split: SPLIT, gate: { eligible: false, passed: false }, blockers }, null, 2));
    process.exitCode = 1;
    return;
  }

  const rows = readJsonl(await fs.readFile(ITEMS, 'utf8')).filter((row) => row.source_id === SOURCE_ID && Array.isArray(row.pdf_pages) && ['complete', 'failed_cost_gate'].includes(row.status));
  const latestByPage = new Map();
  for (const row of rows) {
    for (const page of row.pdf_pages) {
      if (!selectedPages.has(page)) continue;
      const previous = latestByPage.get(page);
      if (!previous || String(row.extracted_at ?? '') > String(previous.extracted_at ?? '')) latestByPage.set(page, row);
    }
  }
  const selectedRows = [...new Set(latestByPage.values())];
  if (fixture.locked_config && selectedRows.some((row) => Object.entries(fixture.locked_config).some(([key, value]) => row.config?.[key] !== value))) blockers.push('one or more extraction rows do not match locked_config');
  const predictedMap = new Map();
  for (const row of selectedRows) {
    for (const item of row.items ?? []) {
      if (item.verification?.verdict !== 'supported' || !item.evidence?.some((evidence) => selectedPages.has(evidence.page_ref))) continue;
      predictedMap.set(item.item_id, { ...item, prediction_id: item.item_id });
    }
  }
  const predicted = [...predictedMap.values()];
  const matches = maximumMatch(gold, predicted);
  const overall = metric({ gold, predicted, matches });
  const layers = {};
  for (const kind of ['event', 'assertion']) {
    const kindGold = gold.filter((item) => item.kind === kind);
    const kindPredicted = predicted.filter((item) => item.kind === kind);
    layers[kind] = metric({ gold: kindGold, predicted: kindPredicted, matches: matches.filter((match) => kindGold.some((item) => item.id === match.gold_id)) });
  }
  const slices = {};
  for (const tag of ['cross_page', 'negation', 'attribution', 'ocr', 'other']) {
    const sliceGold = gold.filter((item) => item.tags?.includes(tag));
    if (!sliceGold.length) continue;
    const sliceIds = new Set(sliceGold.map((item) => item.id));
    const sliceMatches = matches.filter((match) => sliceIds.has(match.gold_id));
    slices[tag] = { expected: sliceGold.length, matched: sliceMatches.length, recall: sliceMatches.length / sliceGold.length };
  }
  const coveredPages = new Set(latestByPage.keys());
  const totalCost = selectedRows.reduce((sum, row) => sum + Number(row.usage?.cost ?? 0), 0);
  const averageCost = coveredPages.size ? totalCost / coveredPages.size : 0;
  const enoughPerLayer = ['event', 'assertion'].every((kind) => layers[kind].expected < 50 || (layers[kind].precision > 0.95 && layers[kind].recall > 0.95));
  const eligible = blockers.length === 0 && coveredPages.size === selectedPages.size && SPLIT !== 'development';
  const passed = eligible && overall.precision > 0.95 && overall.recall > 0.95 && enoughPerLayer && averageCost <= 0.002;
  const matchedGold = new Set(matches.map((match) => match.gold_id));
  const matchedPredictions = new Set(matches.map((match) => match.prediction_id));
  const report = {
    source_id: SOURCE_ID,
    split: SPLIT,
    annotation_status: fixture.annotation_status,
    evaluated_pages: [...selectedPages].sort((a, b) => a - b),
    covered_pages: [...coveredPages].sort((a, b) => a - b),
    overall,
    layers,
    slices,
    cost: { total_usd: totalCost, average_usd_per_page: averageCost, gate: 0.002 },
    gate: { eligible, precision: '>0.95', recall: '>0.95', cost_per_page: '<=0.002', passed },
    blockers,
    misses: gold.filter((item) => !matchedGold.has(item.id)).map((item) => ({ id: item.id, page: item.page, kind: item.kind })),
    unmatched_predictions: predicted.filter((item) => !matchedPredictions.has(item.prediction_id)).map((item) => ({ item_id: item.item_id, kind: item.kind, statement_en: item.statement_en })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!REPORT_ONLY && !passed) process.exitCode = 1;
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
