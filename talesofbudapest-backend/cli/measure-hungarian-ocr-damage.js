#!/usr/bin/env node
/**
 * Phase 0: scan provisional/fullbook entity labels (and mentions) for Hungarian
 * OCR place-name damage (esp. dohdny-class). Writes a small report JSON under
 * extractions/. Does not rewrite evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlacesIndex, normalizePlaceKey } from '../lib/budapestPlacesGazetteer.js';
import { canonicalizeLocationText, CORPUS_PLACE_CONFUSION } from '../lib/hungarianOcrGazetteer.js';
import { buildSubjectEntityIndex, setPlacesGazetteerIndex } from '../lib/historicalSubjectMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, '../..');
const extractionDir = path.join(workspace, 'ingest/corpus/restricted/extractions');
const sourceId = 'jewish-budapest';

const option = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const readJsonl = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
};

const parsePages = (value) => {
  if (!value) return null;
  const set = new Set();
  for (const part of String(value).split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (!range) { set.add(Number(part)); continue; }
    for (let page = Number(range[1]); page <= Number(range[2]); page += 1) set.add(page);
  }
  return set;
};

const experimentIds = new Set(String(option('--experiment', 'fullbook-v2.12,fullbook-v2.12-retry')).split(',').map((id) => id.trim()).filter(Boolean));
const pageFilter = parsePages(option('--pages', '1-579'));

const DOH_PATTERN = /^doh/i;
const editDistance = (left, right) => {
  const a = String(left); const b = String(right);
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
};

const main = async () => {
  const placesIndex = await loadPlacesIndex();
  setPlacesGazetteerIndex(placesIndex);

  const itemRows = readJsonl(path.join(extractionDir, `${sourceId}.historical-items-v3.jsonl`))
    .filter((row) => experimentIds.has(row.experiment_id) && Array.isArray(row.mentions));

  const prefer = new Map();
  for (const row of itemRows) {
    const key = JSON.stringify(row.pages ?? row.pdf_pages ?? []);
    const current = prefer.get(key);
    const rank = (status) => (status === 'complete' ? 3 : status === 'failed_cost_gate' ? 2 : 1);
    const retryBoost = String(row.experiment_id).endsWith('-retry') ? 1 : 0;
    if (!current
      || rank(row.status) > rank(current.status)
      || (rank(row.status) === rank(current.status) && retryBoost > (String(current.experiment_id).endsWith('-retry') ? 1 : 0))) {
      prefer.set(key, row);
    }
  }

  const mentions = [];
  for (const row of prefer.values()) {
    for (const mention of row.mentions ?? []) {
      if (pageFilter && !pageFilter.has(mention.page)) continue;
      mentions.push(mention);
    }
  }

  const tokenCounts = new Map();
  const dohVariants = new Map();
  for (const mention of mentions) {
    const text = String(mention.normalized_text ?? mention.text ?? '');
    for (const match of text.matchAll(/[A-Za-zÀ-ÿ]+/gu)) {
      const token = match[0];
      const folded = normalizePlaceKey(token);
      tokenCounts.set(folded, (tokenCounts.get(folded) ?? 0) + 1);
      if (DOH_PATTERN.test(token)) dohVariants.set(folded, (dohVariants.get(folded) ?? 0) + 1);
    }
  }

  // Before: distinct location entity keys containing doh* without gazetteer repair
  setPlacesGazetteerIndex(null);
  const unrepairedIndex = buildSubjectEntityIndex({
    sourceId,
    mentions: mentions.map((mention) => ({ ...mention })),
  });
  setPlacesGazetteerIndex(placesIndex);
  const afterIndex = buildSubjectEntityIndex({
    sourceId,
    mentions: mentions.map((mention) => ({ ...mention })),
  });

  const locationEntities = (entities) => [...entities.values()].filter((entity) => {
    const label = normalizePlaceKey(entity.label);
    const aliases = entity.aliases ?? [];
    const aliasList = aliases instanceof Set ? [...aliases] : aliases;
    return /doh/.test(label) || aliasList.some((alias) => /doh/.test(normalizePlaceKey(alias)));
  });

  const beforeDoh = locationEntities(unrepairedIndex.entities);
  const afterDoh = locationEntities(afterIndex.entities);

  const confusionCandidates = [];
  for (const [token, count] of dohVariants) {
    if (token === 'dohany') continue;
    const repaired = canonicalizeLocationText(token, placesIndex);
    confusionCandidates.push({
      token,
      count,
      distance_to_dohany: editDistance(token, 'dohany'),
      corpus_hint: CORPUS_PLACE_CONFUSION.get(token) ?? null,
      repair: repaired.repairs[0] ?? null,
      repaired_identity: repaired.identity_key,
    });
  }

  const topLocations = [...afterIndex.entities.values()]
    .filter((entity) => ['place', 'building', 'business', 'organisation'].includes(entity.type))
    .map((entity) => ({ label: entity.label, mentions: entity.mention_ids?.length ?? 0, type: entity.type }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 25);

  const report = {
    generated_at: new Date().toISOString(),
    source_id: sourceId,
    experiment_ids: [...experimentIds],
    pages: option('--pages', '1-579'),
    mention_count: mentions.length,
    doh_variants: Object.fromEntries([...dohVariants.entries()].sort((a, b) => b[1] - a[1])),
    before: {
      doh_related_entities: beforeDoh.length,
      labels: beforeDoh.map((entity) => entity.label).sort(),
    },
    after: {
      doh_related_entities: afterDoh.length,
      labels: afterDoh.map((entity) => entity.label).sort(),
    },
    confusion_candidates: confusionCandidates.sort((a, b) => b.count - a.count),
    gazetteer_counts: placesIndex.counts ?? null,
    top_locations: topLocations,
    note: 'Identity repair only; immutable OCR evidence unchanged. See docs/superpowers/specs/2026-07-21-hungarian-ocr-gazetteer-design.md',
  };

  const outPath = path.join(extractionDir, 'hungarian-ocr-gazetteer-phase0-report.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outPath,
    doh_variants: report.doh_variants,
    before_doh_entities: report.before.doh_related_entities,
    after_doh_entities: report.after.doh_related_entities,
    gazetteer_counts: report.gazetteer_counts,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
