import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldText, parseHistoricalPages, semanticTokenOverlap, statementsSamePolarity } from '../lib/historicalExtractionV2.js';
import { heldoutContentFingerprint } from '../lib/historicalGoldFingerprint.js';
import { LAYOUT_IOU_MIN, matchLayoutZones, referenceTargetKey } from '../lib/historicalEvalGates.js';
import {
  certificationForSources,
  isAdjudicatedSource,
  isSolSource,
} from '../lib/historicalGoldProvenance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const V3 = args.includes('--v3');
const SOURCE_ID = option('--source', 'jewish-budapest');
const SPLIT = option('--split', 'heldout');
const GOLD = option('--golden', path.join(__dirname, `../fixtures/historical-book-items-golden-${V3 ? 'v3' : 'v2'}.json`));
const ITEMS = option('--items', path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-items-${V3 ? 'v3' : 'v2'}.jsonl`));
const TRANSITIONS = option('--transitions', path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.historical-subject-transitions-v3.jsonl`));
const SOURCE_PAGES = option('--source-pages', path.join(__dirname, `../../ingest/corpus/restricted/text/${SOURCE_ID}.pages.txt`));
const ALLOW_INCOMPLETE = args.includes('--allow-incomplete');
const REPORT_ONLY = args.includes('--report-only');
const DIFF_OUTPUT = option('--diff-output', path.join(__dirname, `../../ingest/corpus/restricted/extractions/${SOURCE_ID}.gold-diff-${SPLIT}.json`));
const EXPERIMENT_ID = option('--experiment-id', null);
const APPROVED_RUN_ID = option('--approved-run-id', null);

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
  const goldText = String(gold.statement_hint ?? '');
  if (goldText && !statementsSamePolarity(goldText, item.statement_en)) return -1;
  if (gold.polarity && item.polarity && gold.polarity !== item.polarity) return -1;
  const goldClauses = new Set(gold.clause_ids ?? []);
  const clauseOverlap = item.clause_ids?.some((id) => goldClauses.has(id)) ?? false;
  if (goldClauses.size && !clauseOverlap) return -1;
  const pages = new Set(gold.pages ?? (gold.page ? [gold.page] : []));
  if (pages.size && !item.evidence?.some((evidence) => pages.has(evidence.page_ref))) return -1;
  // Statement-only term matching (evidence quotes can include sibling sentences).
  const statementText = foldText([
    item.statement_en,
    item.open_type,
    item.canonical_type,
    ...(item.participants ?? []).map((participant) => participant.role),
  ].join(' '));
  if (!(gold.required_terms ?? []).every((term) => alternatives(term).some((candidate) => statementText.includes(candidate)))) return -1;
  const statementHint = foldText(goldText);
  const statementBonus = statementHint && foldText(item.statement_en) === statementHint
    ? 50
    : statementHint && semanticTokenOverlap(gold.statement_hint, item.statement_en) >= 0.85
      ? 25
      : 0;
  return (clauseOverlap ? 20 : 0) + (gold.canonical_type === item.canonical_type ? 5 : 0) + (gold.required_terms?.length ?? 0) + statementBonus;
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

const isParaphraseSiblingOfGold = (item, matchableGold) => matchableGold.some((gold) => {
  if (gold.kind !== item.kind) return false;
  if (!(item.clause_ids ?? []).some((id) => (gold.clause_ids ?? []).includes(id))) return false;
  const goldText = String(gold.statement_hint ?? '');
  if (!goldText) return false;
  if (!statementsSamePolarity(goldText, item.statement_en)) return false;
  return semanticTokenOverlap(goldText, item.statement_en) >= 0.68;
});

const trimItemToPages = (item, pages) => {
  const evidence = (item.evidence ?? []).filter((entry) => pages.has(entry.page_ref));
  if (!evidence.length) return null;
  return { ...item, evidence, prediction_id: item.item_id };
};

const ancestryRunIds = (row) => {
  const ids = new Set([row.run_id]);
  for (const id of row.structural_rescore?.run_id_ancestry ?? []) ids.add(id);
  if (row.structural_rescore?.from_run_id) ids.add(row.structural_rescore.from_run_id);
  return [...ids].filter(Boolean);
};

const freezePayloadHash = (meta, items) => {
  const ordered = [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      pages: [...(meta?.pages ?? [])].sort((a, b) => a - b),
      gold_source: meta?.gold_source ?? null,
      run_ids: [...(meta?.run_ids ?? [])].sort(),
      source_run_ids: [...(meta?.source_run_ids ?? [])].sort(),
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

const evidenceWellFormed = (entry) => {
  const start = Number(entry?.start_offset);
  const end = Number(entry?.end_offset);
  const quote = String(entry?.quote ?? '');
  return Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 0
    && end > start
    && quote.length > 0
    && end - start === quote.length;
};

const pushBlocker = (blockers, code, message) => {
  blockers.push({ code, message });
};

const main = async () => {
  if (!/^(?:development|heldout|test|probe|all|[a-z][a-z0-9_]*)$/u.test(SPLIT)) throw new Error('--split must be development, heldout, test, probe, all, or a custom fixture split name');
  const fixture = JSON.parse(await fs.readFile(GOLD, 'utf8'));
  if (fixture.source_id !== SOURCE_ID || !fixture.splits || !Array.isArray(fixture.items)) throw new Error(`${V3 ? 'V3' : 'V2'} gold fixture source/splits/items mismatch`);
  const selectedPages = new Set(
    SPLIT === 'all'
      ? Object.values(fixture.splits ?? {}).flat()
      : (fixture.splits[SPLIT] ?? []),
  );
  if (!selectedPages.size) throw new Error(`gold fixture has no pages for split=${SPLIT}`);
  const gold = fixture.items.filter((item) => selectedPages.has(item.page ?? item.pages?.[0]));
  const heldoutGold = fixture.items.filter((item) => (fixture.splits.heldout ?? []).includes(item.page ?? item.pages?.[0]));
  const blockers = [];
  if (fixture.annotation_status !== 'complete' && fixture.annotation_status !== 'complete_sol_adjudication') {
    pushBlocker(blockers, 'annotation_incomplete', 'annotation_status is not complete (or complete_sol_adjudication)');
  }  if (fixture.items.length < fixture.minimums.total_items) pushBlocker(blockers, 'total_items_short', `gold has ${fixture.items.length}/${fixture.minimums.total_items} required items`);
  if (heldoutGold.length < fixture.minimums.heldout_items) pushBlocker(blockers, 'heldout_items_short', `heldout has ${heldoutGold.length}/${fixture.minimums.heldout_items} required items`);
  if (fixture.minimums?.heldout_pages && (fixture.splits.heldout ?? []).length < fixture.minimums.heldout_pages) {
    pushBlocker(blockers, 'heldout_pages_short', `heldout has ${(fixture.splits.heldout ?? []).length}/${fixture.minimums.heldout_pages} required pages`);
  }
  if (fixture.items.some((item) => !Array.isArray(item.clause_ids) || !item.clause_ids.length)) pushBlocker(blockers, 'missing_clause_ids', 'one or more gold items lack clause_ids');
  if (!fixture.locked_config || typeof fixture.locked_config !== 'object' || !Object.keys(fixture.locked_config).length) {
    pushBlocker(blockers, 'locked_config_missing', 'held-out extraction configuration is not locked (non-empty locked_config required)');
  } else if (V3 && SPLIT === 'heldout') {
    const requiredKeys = ['primary_model', 'audit_model', 'quality_model', 'prompt_version'];
    const missingKeys = requiredKeys.filter((key) => fixture.locked_config[key] == null);
    // Sol silver may omit primary_model when approved_run_ids bind heterogeneous stacks.
    const solOmitsPrimary = isSolSource(fixture.adjudication_manifest?.gold_source)
      && missingKeys.length === 1
      && missingKeys[0] === 'primary_model'
      && (fixture.adjudication_manifest?.approved_run_ids ?? []).length > 0;
    if (missingKeys.length && !solOmitsPrimary) {
      pushBlocker(blockers, 'locked_config_incomplete', `locked_config missing required keys: ${missingKeys.join(',')} (must match extract config field names)`);
    }
  }
  if (V3 && SPLIT === 'heldout') {
    const nonHumanClauses = (fixture.clauses ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)
      && (!isAdjudicatedSource(row.gold_source) || !row.adjudication_id || !row.adjudicator));
    if (nonHumanClauses.length) pushBlocker(blockers, 'heldout_clauses_not_adjudicated', `${nonHumanClauses.length} held-out clauses lack human*/sol-* provenance + adjudication metadata`);
    const heldoutPages = fixture.splits.heldout ?? [];
    const dispositions = fixture.heldout_dispositions ?? {};
    for (const field of ['references', 'transitions', 'layout_zones', 'negative_items', 'clauses']) {
      const rows = fixture[field] ?? [];
      const heldoutRows = rows.filter((row) => heldoutPages.includes(row.page));
      const covered = new Set(heldoutRows.map((row) => row.page).filter((page) => page != null));
      const missing = heldoutPages.filter((page) => !covered.has(page));
      const explicitNone = dispositions[field] === 'human_none' || dispositions[field] === 'sol_none';
      if (explicitNone) {
        if (!isAdjudicatedSource(dispositions.gold_source) || !dispositions.adjudication_id || !dispositions.adjudicator) {
          pushBlocker(blockers, 'heldout_aux_coverage_missing', `heldout_dispositions.${field}=${dispositions[field]} requires adjudicated gold_source + adjudication metadata`);
        }
        if (heldoutRows.length) {
          pushBlocker(blockers, 'heldout_aux_coverage_contradiction', `heldout_dispositions.${field}=${dispositions[field]} but ${heldoutRows.length} held-out ${field} rows exist`);
        }
      } else if (missing.length) {
        pushBlocker(blockers, 'heldout_aux_coverage_missing', `held-out ${field} lack per-page coverage for ${missing.length} pages (or set heldout_dispositions.${field}=human_none|sol_none)`);
      }
    }
  }
  const adjudicatedPages = new Set((fixture.clauses ?? []).map((clause) => clause.page));
  const missingAdjudicatedPages = [...selectedPages].filter((page) => !adjudicatedPages.has(page));
  if (missingAdjudicatedPages.length) pushBlocker(blockers, 'clause_adjudication_missing', `${missingAdjudicatedPages.length} selected pages lack clause-level gold adjudication`);
  if ((fixture.clauses ?? []).some((clause) => !clause.clause_id || !['covered', 'background_only', 'reference_only', 'ambiguous'].includes(clause.disposition))) {
    pushBlocker(blockers, 'clause_disposition_invalid', 'one or more gold clauses lack a valid disposition');
  }
  if (V3 && SPLIT === 'heldout') {
    const nonAdjudicated = heldoutGold.filter((item) => !isAdjudicatedSource(item.gold_source) || !item.adjudication_id || !item.adjudicator);
    if (nonAdjudicated.length) pushBlocker(blockers, 'heldout_items_not_adjudicated', `${nonAdjudicated.length} held-out gold items lack human*/sol-* gold_source + adjudication metadata`);
    for (const field of ['references', 'transitions', 'layout_zones', 'negative_items']) {
      const rows = fixture[field] ?? [];
      const heldoutRows = rows.filter((row) => (fixture.splits.heldout ?? []).includes(row.page));
      if (heldoutRows.some((row) => !isAdjudicatedSource(row.gold_source) || !row.adjudication_id || !row.adjudicator)) {
        pushBlocker(blockers, `heldout_${field}_not_adjudicated`, `held-out ${field} lack human*/sol-* provenance + adjudication metadata`);
      }
    }
    const provenanceSources = [
      ...heldoutGold.map((item) => item.gold_source),
      ...(fixture.clauses ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.references ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.transitions ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.layout_zones ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.negative_items ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      fixture.adjudication_manifest?.gold_source,
      fixture.heldout_dispositions?.gold_source,
    ].filter(Boolean);
    const certification = certificationForSources(provenanceSources);
    if (certification === 'mixed') {
      pushBlocker(blockers, 'heldout_provenance_mixed', 'held-out mixes human* and sol-* gold_source; choose one certification path');
    }
    if (EXPERIMENT_ID) pushBlocker(blockers, 'heldout_experiment_forbidden', '--experiment-id is forbidden for held-out promotion scoring');
    const manifestApprovedRuns = [...(fixture.adjudication_manifest?.approved_run_ids
      ?? fixture.locked_config?.approved_run_ids
      ?? [])].filter(Boolean);
    if (!manifestApprovedRuns.length) {
      pushBlocker(blockers, 'heldout_approved_run_unbound', 'held-out requires adjudication_manifest.approved_run_ids (or locked_config.approved_run_ids)');
    }
    if (!APPROVED_RUN_ID) {
      pushBlocker(blockers, 'heldout_approved_run_required', 'held-out promotion requires --approved-run-id exact match to selected rows');
    } else if (manifestApprovedRuns.length && !manifestApprovedRuns.includes(APPROVED_RUN_ID)) {
      pushBlocker(blockers, 'heldout_approved_run_not_manifest', '--approved-run-id is not in manifest-bound approved_run_ids');
    }
    const manifest = fixture.adjudication_manifest ?? null;
    if (!manifest?.content_sha256 || !manifest?.adjudication_id || !manifest?.adjudicator) {
      pushBlocker(blockers, 'adjudication_manifest_missing', 'held-out requires adjudication_manifest with content_sha256 + adjudication_id + adjudicator');
    } else if (manifest.content_sha256 !== heldoutContentFingerprint(fixture)) {
      pushBlocker(blockers, 'adjudication_manifest_mismatch', 'adjudication_manifest.content_sha256 does not match current held-out fixture fingerprint');
    }
  }
  const frozenMeta = fixture[`${SPLIT}_split`] ?? (SPLIT === 'test' ? fixture.test_split : null);
  const freezeHistory = fixture[`${SPLIT}_split_history`] ?? [];
  if (V3 && ['test', 'probe'].includes(SPLIT) && frozenMeta?.frozen && !(frozenMeta.source_run_ids ?? []).length) {
    pushBlocker(blockers, 'freeze_source_runs_missing', `${SPLIT} freeze lacks source_run_ids`);
  }
  if (V3 && ['test', 'probe'].includes(SPLIT) && !frozenMeta?.frozen) {
    console.log(JSON.stringify({
      source_id: SOURCE_ID,
      split: SPLIT,
      gate: { eligible: false, passed: false, diagnostic_ok: false },
      blockers: [{ code: 'freeze_missing', message: `${SPLIT} split is not frozen` }],
      diagnostic_ok: false,
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (V3 && ['test', 'probe'].includes(SPLIT) && frozenMeta?.frozen) {
    if (!frozenMeta.content_sha256) {
      pushBlocker(blockers, 'freeze_hash_mismatch', `${SPLIT} freeze lacks required content_sha256`);
    } else {
      const expected = freezePayloadHash(frozenMeta, gold);
      if (expected !== frozenMeta.content_sha256) {
        pushBlocker(blockers, 'freeze_hash_mismatch', `${SPLIT} freeze content_sha256 mismatch (fixture mutated after freeze)`);
      }
    }
  }
  if (V3 && ['test', 'probe'].includes(SPLIT) && freezeHistory.length) {
    for (let index = 0; index < freezeHistory.length; index += 1) {
      const entry = freezeHistory[index];
      if (!entry?.content_sha256 || !Array.isArray(entry.item_ids) || !entry.item_ids.length) {
        pushBlocker(blockers, 'freeze_history_invalid', `${SPLIT} freeze history generation ${entry?.freeze_generation ?? index} lacks content_sha256/item_ids`);
        break;
      }
      if (index === 0 && entry.parent_content_sha256) {
        pushBlocker(blockers, 'freeze_history_invalid', `${SPLIT} freeze history root must have null parent_content_sha256`);
        break;
      }
      if (index > 0) {
        if (!entry.parent_content_sha256) {
          pushBlocker(blockers, 'freeze_history_invalid', `${SPLIT} freeze history generation ${entry.freeze_generation} missing parent_content_sha256`);
          break;
        }
        if (entry.parent_content_sha256 !== freezeHistory[index - 1].content_sha256) {
          pushBlocker(blockers, 'freeze_history_invalid', `${SPLIT} freeze history parent hash chain broken at generation ${entry.freeze_generation}`);
          break;
        }
      }
    }
    if (frozenMeta?.parent_content_sha256 && freezeHistory.at(-1)?.content_sha256
      && frozenMeta.parent_content_sha256 !== freezeHistory.at(-1).content_sha256) {
      pushBlocker(blockers, 'freeze_history_invalid', `${SPLIT} current freeze parent_content_sha256 does not match latest history entry`);
    }
  }
  if (V3 && !(fixture.references ?? []).length && fixture.heldout_dispositions?.references !== 'human_none' && fixture.heldout_dispositions?.references !== 'sol_none') {
    pushBlocker(blockers, 'references_missing', 'V3 gold has no adjudicated reference chains');
  }
  if (V3 && !(fixture.transitions ?? []).length && fixture.heldout_dispositions?.transitions !== 'human_none' && fixture.heldout_dispositions?.transitions !== 'sol_none') {
    pushBlocker(blockers, 'transitions_missing', 'V3 gold has no adjudicated subject transitions');
  }
  if (V3 && !(fixture.layout_zones ?? []).length && fixture.heldout_dispositions?.layout_zones !== 'human_none' && fixture.heldout_dispositions?.layout_zones !== 'sol_none') {
    pushBlocker(blockers, 'layout_zones_missing', 'V3 gold has no adjudicated layout zones');
  }
  // Typed hard blockers: never bypassable by --allow-incomplete.
  const HARD_ALWAYS = new Set(['freeze_missing', 'freeze_hash_mismatch', 'freeze_source_runs_missing', 'freeze_history_invalid', 'duplicate_prediction_ids']);
  const HARD_HELDOUT = new Set([
    'heldout_items_not_adjudicated',
    'heldout_references_not_adjudicated',
    'heldout_transitions_not_adjudicated',
    'heldout_layout_zones_not_adjudicated',
    'heldout_negative_items_not_adjudicated',
    'heldout_clauses_not_adjudicated',
    'heldout_provenance_mixed',
    'heldout_experiment_forbidden',
    'heldout_approved_run_required',
    'heldout_items_short',
    'heldout_pages_short',
    'locked_config_missing',
    'locked_config_incomplete',
    'locked_config_mismatch',
    'annotation_incomplete',
    'missing_clause_ids',
    'clause_adjudication_missing',
    'clause_disposition_invalid',
    'heldout_aux_coverage_missing',
    'adjudication_manifest_missing',
    'adjudication_manifest_mismatch',
    'missing_usage_cost',
    'negative_usage_cost',
    'duplicate_gold_references',
    'incomplete_gold_references',
    'incomplete_predicted_references',
    'immutable_source_missing',
    'immutable_source_incomplete',
    'immutable_source_unbound',
    'immutable_source_hash_mismatch',
    'heldout_approved_run_unbound',
    'heldout_approved_run_not_manifest',
    'heldout_aux_coverage_contradiction',
    'duplicate_clause_id_pages',
  ]);
  const isHard = (blocker) => HARD_ALWAYS.has(blocker.code)
    || (SPLIT === 'heldout' && HARD_HELDOUT.has(blocker.code));
  const hardBlockers = blockers.filter(isHard);
  if (hardBlockers.length || (blockers.length && !ALLOW_INCOMPLETE)) {
    const shown = hardBlockers.length && ALLOW_INCOMPLETE ? hardBlockers : blockers;
    if (shown.length) {
      console.log(JSON.stringify({
        source_id: SOURCE_ID,
        split: SPLIT,
        gate: { eligible: false, passed: false, diagnostic_ok: false },
        blockers: shown,
        diagnostic_ok: false,
        freeze_history_generations: freezeHistory.map((row) => row.freeze_generation),
      }, null, 2));
      process.exitCode = 1;
      return;
    }
  }

  const DEV_REFERENCE_EXPERIMENTS = new Set(['gold-seed-dev', 'gold-rebind-75']);
  const allowDevReferences = SPLIT === 'development';
  const INCLUDE_RESCORE = !args.includes('--ignore-rescore');
  const PROMOTION_STATUSES = new Set(['complete', 'failed_cost_gate']);
  // Diagnostic splits prefer complete; failed_cost_gate only if --allow-failed-cost.
  // Held-out also accepts failed_cost_gate so over-budget finished runs remain scorable;
  // gate.passed still requires measured cost ≤ $0.002/page.
  const ALLOW_FAILED_COST = args.includes('--allow-failed-cost');
  const DIAGNOSTIC_STATUSES = ALLOW_FAILED_COST
    ? new Set(['complete', 'failed_cost_gate'])
    : new Set(['complete']);
  const allowedStatuses = SPLIT === 'heldout' ? PROMOTION_STATUSES : DIAGNOSTIC_STATUSES;
  const rows = readJsonl(await fs.readFile(ITEMS, 'utf8')).filter((row) => row.source_id === SOURCE_ID && Array.isArray(row.items) && allowedStatuses.has(row.status)
    && (INCLUDE_RESCORE || !row.structural_rescore)
    && (SPLIT === 'heldout' && APPROVED_RUN_ID
      ? (
        // Manifest-bound multi-run sets: keep every approved run; CLI id must be in the set.
        (fixture.adjudication_manifest?.approved_run_ids ?? fixture.locked_config?.approved_run_ids ?? []).length
          ? (fixture.adjudication_manifest?.approved_run_ids ?? fixture.locked_config?.approved_run_ids ?? []).includes(row.run_id)
            && (fixture.adjudication_manifest?.approved_run_ids ?? fixture.locked_config?.approved_run_ids ?? []).includes(APPROVED_RUN_ID)
          : row.run_id === APPROVED_RUN_ID
      )
      : EXPERIMENT_ID
        ? (SPLIT === 'development' && row.experiment_id === EXPERIMENT_ID)
        : (!row.experiment_id || (allowDevReferences && DEV_REFERENCE_EXPERIMENTS.has(row.experiment_id)))));
  // Bind freeze splits to exact frozen source run IDs only.
  const frozenRunIds = new Set([...(frozenMeta?.source_run_ids ?? [])].filter(Boolean));
  const rowsForSplit = ['test', 'probe'].includes(SPLIT) && frozenRunIds.size
    ? rows.filter((row) => frozenRunIds.has(row.run_id))
    : rows;
  if (['test', 'probe'].includes(SPLIT) && frozenRunIds.size) {
    const present = new Set(rowsForSplit.map((row) => row.run_id));
    const missing = [...frozenRunIds].filter((id) => !present.has(id));
    if (missing.length) pushBlocker(blockers, 'freeze_source_runs_missing', `${SPLIT} freeze source_run_ids missing from items jsonl: ${missing.slice(0, 5).join(',')}${missing.length > 5 ? '…' : ''}`);
  }
  const supportedOnPage = (row, page) => (row.items ?? []).some((item) => item.verification?.verdict === 'supported'
    && item.evidence?.some((evidence) => evidence.page_ref === page));
  const rowRank = (row, page) => {
    const usable = supportedOnPage(row, page) ? 1 : 0;
    const complete = row.status === 'complete' ? 1 : 0;
    const reference = allowDevReferences && DEV_REFERENCE_EXPERIMENTS.has(row.experiment_id) ? 1 : 0;
    const rescoreBoost = row.structural_rescore?.mode === 'hard_demote_no_dedupe' ? 1 : 0;
    return [usable, complete, reference, rescoreBoost, String(row.extracted_at ?? '')];
  };
  const isBetter = (candidate, previous, page) => {
    if (!previous) return true;
    const left = rowRank(candidate, page);
    const right = rowRank(previous, page);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] === right[index]) continue;
      return left[index] > right[index];
    }
    return false;
  };
  const latestByPage = new Map();
  for (const row of rowsForSplit) {
    for (const page of row.pdf_pages ?? []) {
      if (!selectedPages.has(page)) continue;
      const previous = latestByPage.get(page);
      if (isBetter(row, previous, page)) latestByPage.set(page, row);
    }
  }
  const wonPagesByRow = new Map();
  for (const [page, row] of latestByPage) {
    if (!wonPagesByRow.has(row)) wonPagesByRow.set(row, new Set());
    wonPagesByRow.get(row).add(page);
  }
  const selectedRows = [...wonPagesByRow.keys()];
  if (['test', 'probe'].includes(SPLIT) && frozenRunIds.size) {
    const selectedIds = new Set(selectedRows.map((row) => row.run_id));
    const extra = [...selectedIds].filter((id) => !frozenRunIds.has(id));
    const missingSelected = [...frozenRunIds].filter((id) => !selectedIds.has(id));
    if (extra.length || missingSelected.length) {
      pushBlocker(blockers, 'freeze_source_runs_missing', `${SPLIT} selected run set must exactly equal freeze source_run_ids (extra=${extra.length}, missing=${missingSelected.length})`);
    }
  }
  if (fixture.locked_config && Object.keys(fixture.locked_config).length
    && selectedRows.some((row) => Object.entries(fixture.locked_config)
      .filter(([key]) => key !== 'approved_run_ids')
      .some(([key, value]) => row.config?.[key] !== value))) {
    pushBlocker(blockers, 'locked_config_mismatch', 'one or more extraction rows do not match locked_config');
  }
  const predictedMap = new Map();
  const duplicatePredictionIds = new Set();
  for (const [row, pages] of wonPagesByRow) {
    for (const item of row.items ?? []) {
      if (item.verification?.verdict !== 'supported') continue;
      const trimmed = trimItemToPages(item, pages);
      if (!trimmed) continue;
      if (!item.item_id) {
        pushBlocker(blockers, 'duplicate_prediction_ids', 'supported prediction missing item_id');
        continue;
      }
      if (predictedMap.has(item.item_id)) duplicatePredictionIds.add(item.item_id);
      predictedMap.set(item.item_id, trimmed);
    }
  }
  if (duplicatePredictionIds.size) {
    pushBlocker(blockers, 'duplicate_prediction_ids', `${duplicatePredictionIds.size} duplicate prediction item_id values across selected rows`);
  }
  const predicted = [...predictedMap.values()];

  const negativeItems = (fixture.negative_items ?? []).filter((item) => selectedPages.has(item.page));
  const negativeHits = [];
  for (const negative of negativeItems) {
    const patterns = (negative.forbidden_patterns ?? []).map((pattern) => new RegExp(pattern, 'iu'));
    for (const item of predicted.filter((row) => row.evidence?.some((evidence) => evidence.page_ref === negative.page))) {
      const haystack = [item.statement_en, ...(item.evidence ?? []).map((evidence) => evidence.quote)].join('\n');
      if (patterns.some((pattern) => pattern.test(haystack))) {
        negativeHits.push({
          negative_id: negative.id,
          page: negative.page,
          tags: negative.tags ?? [],
          item_id: item.item_id,
          statement_en: item.statement_en,
        });
      }
    }
  }
  const negatives = {
    expected: negativeItems.length,
    hits: negativeHits.length,
    clean: negativeItems.length ? negativeHits.length === 0 : null,
    by_id: Object.fromEntries(negativeItems.map((negative) => [
      negative.id,
      negativeHits.filter((hit) => hit.negative_id === negative.id).length,
    ])),
  };
  const goldClauseIds = new Set(gold.flatMap((item) => item.clause_ids ?? []));
  const predictedClauseIds = new Set(predicted.flatMap((item) => item.clause_ids ?? []));
  const staleClauseIds = [...goldClauseIds].filter((id) => id && !predictedClauseIds.has(id));

  const matchableGold = gold.filter((item) => (item.clause_ids ?? []).length);
  const goldPagesWithItems = new Set(matchableGold.map((item) => item.page ?? item.pages?.[0]).filter((page) => page != null));
  // Adjudicated pages with zero gold items: every supported prediction there is an FP for promotion.
  const adjudicatedZeroGoldPages = new Set([...adjudicatedPages].filter((page) => selectedPages.has(page) && !goldPagesWithItems.has(page)));
  const predictedOnGoldPages = predicted.filter((item) => item.evidence?.some((evidence) => goldPagesWithItems.has(evidence.page_ref)));
  const predictedForPromotion = SPLIT === 'heldout'
    ? predicted.filter((item) => item.evidence?.some((evidence) => goldPagesWithItems.has(evidence.page_ref) || adjudicatedZeroGoldPages.has(evidence.page_ref)))
    : predictedOnGoldPages;
  const matches = maximumMatch(matchableGold, predicted);
  const matchedPredictionIds = new Set(matches.map((match) => match.prediction_id));
  const isParaphraseSibling = (item) => ALLOW_INCOMPLETE && isParaphraseSiblingOfGold(item, matchableGold);
  const predictedSiblingAdjusted = predictedForPromotion.filter((item) => matchedPredictionIds.has(item.prediction_id) || !isParaphraseSibling(item));
  const overallAllPages = metric({ gold: matchableGold, predicted, matches });
  const overall = metric({ gold: matchableGold, predicted: predictedForPromotion, matches });
  const overallSiblingAdjusted = ALLOW_INCOMPLETE
    ? metric({ gold: matchableGold, predicted: predictedSiblingAdjusted, matches })
    : null;
  const layers = {};
  for (const kind of ['event', 'assertion']) {
    const kindGold = matchableGold.filter((item) => item.kind === kind);
    const kindPredicted = predictedForPromotion.filter((item) => item.kind === kind);
    layers[kind] = metric({ gold: kindGold, predicted: kindPredicted, matches: matches.filter((match) => kindGold.some((item) => item.id === match.gold_id)) });
  }
  const slices = {};
  for (const tag of ['cross_page', 'negation', 'attribution', 'ocr', 'other', 'layout_caption', 'layout_title', 'quote_nosplit', 'quote_speaker']) {
    const sliceGold = matchableGold.filter((item) => item.tags?.includes(tag));
    if (!sliceGold.length) continue;
    const sliceIds = new Set(sliceGold.map((item) => item.id));
    const sliceMatches = matches.filter((match) => sliceIds.has(match.gold_id));
    slices[tag] = { expected: sliceGold.length, matched: sliceMatches.length, recall: sliceMatches.length / sliceGold.length };
  }
  let referenceMetric = null;
  let transitionAccuracy = null;
  if (V3) {
    // Authoritative clause→page from gold clauses only (prediction page/page_ref ignored).
    const clauseIdToPage = new Map();
    for (const clause of fixture.clauses ?? []) {
      if (clause.clause_id == null || clause.page == null) continue;
      const prior = clauseIdToPage.get(clause.clause_id);
      if (prior != null && prior !== clause.page) {
        pushBlocker(blockers, 'duplicate_clause_id_pages', `clause_id ${clause.clause_id} maps to multiple pages`);
        break;
      }
      clauseIdToPage.set(clause.clause_id, clause.page);
    }
    const predictedReferencesRaw = [...wonPagesByRow].flatMap(([row, pages]) => (row.resolved_references ?? [])
      .map((reference, index) => {
        const page = clauseIdToPage.get(reference.clause_id) ?? null;
        return {
          ...reference,
          page,
          prediction_key: `${row.run_id}\u001f${index}\u001f${reference.clause_id}\u001f${referenceTargetKey(reference) ?? ''}`,
        };
      })
      .filter((reference) => reference.page != null && pages.has(reference.page)));
    const goldReferencesRaw = (fixture.references ?? []).filter((row) => selectedPages.has(row.page));
    const incompleteGoldRefs = goldReferencesRaw.filter((row) => !referenceTargetKey(row));
    const incompletePredRefs = predictedReferencesRaw.filter((row) => !referenceTargetKey(row));
    if (incompleteGoldRefs.length) {
      pushBlocker(blockers, 'incomplete_gold_references', `${incompleteGoldRefs.length} gold references lack a stable target identity`);
    }
    if (incompletePredRefs.length) {
      pushBlocker(blockers, 'incomplete_predicted_references', `${incompletePredRefs.length} predicted references lack a stable target identity`);
    }
    const goldReferencesWithTarget = goldReferencesRaw.filter((row) => referenceTargetKey(row));
    const predictedReferences = predictedReferencesRaw.filter((row) => referenceTargetKey(row));
    const goldReferenceKeys = goldReferencesWithTarget.map((row) => `${row.clause_id}\u001f${referenceTargetKey(row)}`);
    if (new Set(goldReferenceKeys).size !== goldReferenceKeys.length) {
      pushBlocker(blockers, 'duplicate_gold_references', 'gold references contain duplicate clause/entity keys');
    }
    const goldReferences = [...new Map(goldReferencesWithTarget.map((row, index) => [goldReferenceKeys[index], row])).values()];
    const usedPredictions = new Set();
    const referenceMatches = [];
    for (const goldRow of goldReferences) {
      const goldTarget = referenceTargetKey(goldRow);
      const hit = predictedReferences.find((row) => {
        if (usedPredictions.has(row.prediction_key)) return false;
        return row.clause_id === goldRow.clause_id
          && row.page === goldRow.page
          && referenceTargetKey(row) === goldTarget;
      });
      if (hit) {
        usedPredictions.add(hit.prediction_key);
        referenceMatches.push(goldRow);
      }
    }
    referenceMetric = {
      expected: goldReferences.length + incompleteGoldRefs.length,
      predicted: predictedReferences.length + incompletePredRefs.length,
      matched: referenceMatches.length,
      incomplete_gold: incompleteGoldRefs.length,
      incomplete_predicted: incompletePredRefs.length,
      precision: (predictedReferences.length + incompletePredRefs.length)
        ? referenceMatches.length / (predictedReferences.length + incompletePredRefs.length)
        : 0,
      recall: (goldReferences.length + incompleteGoldRefs.length)
        ? referenceMatches.length / (goldReferences.length + incompleteGoldRefs.length)
        : 0,
    };
    const transitionRunIds = new Set(selectedRows.flatMap((row) => ancestryRunIds(row)));
    const transitionRows = readJsonl(await fs.readFile(TRANSITIONS, 'utf8').catch(() => '')).filter((row) => transitionRunIds.has(row.run_id));
    const predictedActive = new Map(transitionRows.flatMap((row) => row.transitions ?? []).map((row) => [row.clause_id, row.after_focus?.active ?? null]));
    const goldTransitions = (fixture.transitions ?? []).filter((row) => selectedPages.has(row.page));
    const transitionMatches = goldTransitions.filter((row) => predictedActive.get(row.clause_id) === row.active_entity_id);
    transitionAccuracy = { expected: goldTransitions.length, matched: transitionMatches.length, accuracy: goldTransitions.length ? transitionMatches.length / goldTransitions.length : 0 };
  }
  const coveredPages = new Set(latestByPage.keys());
  const costOf = (row) => {
    const value = row.usage?.cost;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const missingCostRows = selectedRows.filter((row) => costOf(row) == null);
  const negativeCostRows = selectedRows.filter((row) => {
    const value = costOf(row);
    return value != null && value < 0;
  });
  if (SPLIT === 'heldout' && missingCostRows.length) pushBlocker(blockers, 'missing_usage_cost', `${missingCostRows.length} selected runs lack numeric finite usage.cost`);
  if (SPLIT === 'heldout' && negativeCostRows.length) pushBlocker(blockers, 'negative_usage_cost', `${negativeCostRows.length} selected runs have negative usage.cost`);
  const totalCost = selectedRows.reduce((sum, row) => sum + Math.max(0, costOf(row) ?? 0), 0);
  const averageCost = coveredPages.size ? totalCost / coveredPages.size : 0;
  const enoughPerLayer = ['event', 'assertion'].every((kind) => {
    if (layers[kind].expected === 0) return SPLIT !== 'heldout';
    if (layers[kind].expected < 50 && SPLIT === 'heldout') return layers[kind].precision >= 0.95 && layers[kind].recall >= 0.95;
    return layers[kind].expected < 50 || (layers[kind].precision > 0.95 && layers[kind].recall > 0.95);
  });
  const layoutZonesSelected = (fixture.layout_zones ?? []).filter((row) => selectedPages.has(row.page));
  const predictedLayoutBlocks = [];
  for (const [row, pages] of wonPagesByRow) {
    for (const layoutPage of row.layout?.pages ?? []) {
      const page = layoutPage.page_ref ?? layoutPage.page;
      if (!pages.has(page)) continue;
      for (const block of layoutPage.masked_blocks ?? []) {
        predictedLayoutBlocks.push({
          page,
          zone: block.zone,
          x_min: block.x_min,
          y_min: block.y_min,
          x_max: block.x_max,
          y_max: block.y_max,
          text_sha256: block.text_sha256
            ?? (typeof block.text === 'string' ? crypto.createHash('sha256').update(block.text).digest('hex') : null),
        });
      }
    }
  }
  const layoutMatch = matchLayoutZones(layoutZonesSelected, predictedLayoutBlocks);
  const layoutCoverage = {
    expected_pages: selectedPages.size,
    pages_with_zones: new Set(layoutZonesSelected.map((row) => row.page)).size,
    recall: selectedPages.size ? new Set(layoutZonesSelected.map((row) => row.page)).size / selectedPages.size : 0,
    note: 'gold layout-zone page coverage (diagnostic)',
  };
  const layoutPr = {
    expected: layoutMatch.expected,
    predicted: layoutMatch.predicted,
    true_positive: layoutMatch.matched,
    precision: layoutMatch.predicted ? layoutMatch.matched / layoutMatch.predicted : 0,
    recall: layoutMatch.expected ? layoutMatch.matched / layoutMatch.expected : 0,
    note: `1:1 zone match by page+zone+IoU>=${LAYOUT_IOU_MIN} (+ text_sha256 when both set)`,
  };
  // Immutable OCR pages only — never trust text embedded on prediction rows.
  // Held-out binds the file hash via fixture.immutable_source_sha256 / manifest.
  let pageTextByRef = new Map();
  let immutableSourceSha = null;
  let immutableSourceError = null;
  const expectedImmutableSha = fixture.immutable_source_sha256
    ?? fixture.adjudication_manifest?.immutable_source_sha256
    ?? null;
  try {
    const sourcePages = parseHistoricalPages(await fs.readFile(SOURCE_PAGES, 'utf8'));
    pageTextByRef = new Map(sourcePages.map((page) => [page.page, page.text]));
    const selectedSource = sourcePages
      .filter((page) => selectedPages.has(page.page))
      .sort((a, b) => a.page - b.page);
    immutableSourceSha = crypto.createHash('sha256')
      .update(selectedSource.map((page) => `${page.page}\u001f${page.text}`).join('\u001e'))
      .digest('hex');
    const missingSourcePages = [...selectedPages].filter((page) => !pageTextByRef.has(page));
    if (missingSourcePages.length) {
      pushBlocker(blockers, 'immutable_source_incomplete', `${missingSourcePages.length} selected pages missing from --source-pages`);
    }
    if (SPLIT === 'heldout' && !expectedImmutableSha) {
      pushBlocker(blockers, 'immutable_source_unbound', 'held-out requires fixture.immutable_source_sha256 (or adjudication_manifest.immutable_source_sha256)');
    } else if (expectedImmutableSha && expectedImmutableSha !== immutableSourceSha) {
      pushBlocker(blockers, 'immutable_source_hash_mismatch', 'loaded --source-pages hash does not match adjudicated immutable_source_sha256');
    }
  } catch (error) {
    immutableSourceError = error instanceof Error ? error.message : String(error);
    pageTextByRef = new Map();
    pushBlocker(blockers, 'immutable_source_missing', `failed to load immutable source pages: ${immutableSourceError}`);
  }
  const evidenceSourceVerified = (entry) => {
    if (!evidenceWellFormed(entry)) return false;
    const text = pageTextByRef.get(entry.page_ref);
    if (typeof text !== 'string') return false;
    return text.slice(entry.start_offset, entry.end_offset) === entry.quote;
  };
  const exactGrounding = {
    supported: predicted.length,
    with_offsets: predicted.filter((item) => (item.evidence ?? []).length > 0 && (item.evidence ?? []).every(evidenceWellFormed)).length,
    source_verified: predicted.filter((item) => (item.evidence ?? []).length > 0 && (item.evidence ?? []).every(evidenceSourceVerified)).length,
    pages_with_text: pageTextByRef.size,
    immutable_source_sha256: immutableSourceSha,
    immutable_source_path: SOURCE_PAGES,
  };
  exactGrounding.rate = exactGrounding.supported ? exactGrounding.with_offsets / exactGrounding.supported : 0;
  exactGrounding.source_verified_rate = exactGrounding.supported ? exactGrounding.source_verified / exactGrounding.supported : 0;
  exactGrounding.note = pageTextByRef.size
    ? (expectedImmutableSha && expectedImmutableSha === immutableSourceSha
      ? 'source_verified_rate uses adjudicated immutable --source-pages (hash-bound)'
      : 'source_verified_rate uses --source-pages text; hash unbound or mismatched (fail-closed for promotion)')
    : 'immutable source pages unavailable; source_verified_rate stays 0 (fail-closed for promotion)';
  const dispositions = fixture.heldout_dispositions ?? {};
  const refGateWaived = dispositions.references === 'human_none' || dispositions.references === 'sol_none';
  const transitionGateWaived = dispositions.transitions === 'human_none' || dispositions.transitions === 'sol_none';
  const layoutGateWaived = dispositions.layout_zones === 'human_none' || dispositions.layout_zones === 'sol_none';
  const v3GatesPass = !V3 || (
    (refGateWaived || (referenceMetric && referenceMetric.precision > 0.95 && referenceMetric.recall > 0.95 && referenceMetric.precision <= 1))
    && (transitionGateWaived || (transitionAccuracy && transitionAccuracy.accuracy > 0.95))
    && (layoutGateWaived || (layoutPr.precision > 0.98 && layoutPr.recall > 0.98))
    && exactGrounding.source_verified_rate >= 1
    && pageTextByRef.size > 0
    && expectedImmutableSha != null
    && expectedImmutableSha === immutableSourceSha
  );
  const lateHardBlockers = blockers.filter(isHard);
  const eligible = blockers.length === 0 && coveredPages.size === selectedPages.size && SPLIT === 'heldout';
  const passed = eligible && overall.precision > 0.95 && overall.recall > 0.95 && enoughPerLayer && v3GatesPass && averageCost <= 0.002
    && (negatives.expected === 0 || negatives.clean)
    && missingCostRows.length === 0
    && negativeCostRows.length === 0;
  // Diagnostic acceptance: freeze/dev report metrics without claiming promotion.
  const diagnostic_ok = SPLIT !== 'heldout'
    && lateHardBlockers.length === 0
    && (negatives.expected === 0 || negatives.clean === true || negatives.clean === null)
    && coveredPages.size > 0;
  const selected_run_summary = selectedRows.map((row) => ({
    run_id: row.run_id,
    status: row.status,
    experiment_id: row.experiment_id ?? null,
    structural_rescore: Boolean(row.structural_rescore),
    pages: [...(wonPagesByRow.get(row) ?? [])].sort((a, b) => a - b),
    usage_cost: costOf(row),
  }));
  const matchedGold = new Set(matches.map((match) => match.gold_id));
  const matchedPredictions = matchedPredictionIds;
  const falseNegatives = matchableGold.filter((item) => !matchedGold.has(item.id)).map((item) => ({ id: item.id, page: item.page, kind: item.kind, note: item.note ?? null }));
  const falsePositives = predictedForPromotion.filter((item) => !matchedPredictions.has(item.prediction_id)).map((item) => ({
    item_id: item.item_id,
    kind: item.kind,
    statement_en: item.statement_en,
    pages: [...new Set((item.evidence ?? []).map((entry) => entry.page_ref))],
    paraphrase_sibling: isParaphraseSibling(item),
  }));
  const paraphraseSiblingCount = falsePositives.filter((item) => item.paraphrase_sibling).length;
  const heldoutCertification = SPLIT === 'heldout'
    ? certificationForSources([
      ...heldoutGold.map((item) => item.gold_source),
      ...(fixture.clauses ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.references ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.transitions ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.layout_zones ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      ...(fixture.negative_items ?? []).filter((row) => (fixture.splits.heldout ?? []).includes(row.page)).map((row) => row.gold_source),
      fixture.adjudication_manifest?.gold_source,
      fixture.heldout_dispositions?.gold_source,
    ].filter(Boolean))
    : null;
  const metricHonesty = {
    label: SPLIT === 'heldout'
      ? (heldoutCertification === 'sol_silver' ? 'sol_silver_certification' : heldoutCertification === 'human' ? 'human_heldout_promotion' : 'heldout_incomplete')
      : 'fixture_fit_or_freeze_replay',
    certification: heldoutCertification,
    claim_allowed: SPLIT === 'heldout' && heldoutCertification === 'sol_silver'
      ? (passed
        ? 'sol-silver held-out certification agreement only — not human promotion or historical truth'
        : 'sol-silver held-out metrics (not passed; often cost >$0.002/page) — not human promotion or historical truth')
      : SPLIT === 'heldout' && passed && heldoutCertification === 'human'
        ? 'human-held-out promotion metrics'
        : 'auto-derived fixture-fit / freeze-replay agreement only — not promotion',
    claim_forbidden: [
      'promotion readiness from development/test/probe',
      'human held-out P/R without human* gold',
      'historical truth from sol-silver agreement',
      'independent generalization from freeze replay',
      ...(heldoutCertification === 'sol_silver' ? ['calling sol_silver certification human promotion'] : []),
    ],
  };
  const report = {
    source_id: SOURCE_ID,
    split: SPLIT,
    annotation_status: fixture.annotation_status,
    certification: heldoutCertification ?? undefined,
    evaluated_pages: [...selectedPages].sort((a, b) => a - b),
    covered_pages: [...coveredPages].sort((a, b) => a - b),
    gold_pages: [...goldPagesWithItems].sort((a, b) => a - b),
    adjudicated_zero_gold_pages: [...adjudicatedZeroGoldPages].sort((a, b) => a - b),
    experiment_id: EXPERIMENT_ID,
    approved_run_id: APPROVED_RUN_ID,
    metric_honesty: metricHonesty,
    selected_run_summary,
    diagnostic_ok,
    overall,
    overall_paraphrase_sibling_adjusted: overallSiblingAdjusted ?? undefined,
    overall_sibling_adjusted: overallSiblingAdjusted ?? undefined,
    overall_all_split_pages: overallAllPages,
    paraphrase_siblings_among_fp: ALLOW_INCOMPLETE ? paraphraseSiblingCount : 0,
    clause_siblings_among_fp: ALLOW_INCOMPLETE ? paraphraseSiblingCount : 0,
    layers,
    slices,
    negatives,
    references: referenceMetric ?? undefined,
    subject_transitions: transitionAccuracy ?? undefined,
    layout_coverage: layoutCoverage,
    layout_pr: layoutPr,
    exact_grounding: exactGrounding,
    cost: {
      total_usd: totalCost,
      average_usd_per_page: averageCost,
      gate: 0.002,
      missing_usage_cost_runs: missingCostRows.length,
    },
    gate: {
      eligible,
      certification: heldoutCertification ?? undefined,
      precision: '>0.95',
      recall: '>0.95',
      ...(V3 ? { reference_pr: '>0.95', transition_accuracy: '>0.95' } : {}),
      cost_per_page: '<=0.002',
      passed,
      diagnostic_ok,
    },
    blockers,
    misses: falseNegatives,
    unmatched_predictions: falsePositives,
  };
  const diff = {
    source_id: SOURCE_ID,
    split: SPLIT,
    experiment_id: EXPERIMENT_ID,
    generated_at: new Date().toISOString(),
    false_negatives: falseNegatives,
    false_positives: falsePositives,
    negative_hits: negativeHits,
    stale_clause_id_count: staleClauseIds.length,
    stale_clause_ids: staleClauseIds.slice(0, 100),
    overall,
    overall_all_split_pages: overallAllPages,
    negatives,
    blockers,
    metric_honesty: metricHonesty,
  };
  await fs.mkdir(path.dirname(DIFF_OUTPUT), { recursive: true });
  await fs.writeFile(DIFF_OUTPUT, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, diff_output: DIFF_OUTPUT }, null, 2));
  const finalHard = blockers.filter(isHard);
  if (!REPORT_ONLY) {
    if (finalHard.length) process.exitCode = 1;
    else if (SPLIT === 'heldout') {
      if (!passed) process.exitCode = 1;
    } else if (!diagnostic_ok) {
      process.exitCode = 1;
    }
  }
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
