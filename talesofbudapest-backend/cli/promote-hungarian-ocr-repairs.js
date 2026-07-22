#!/usr/bin/env node
/**
 * Scan provisional/fullbook mentions for Hungarian place OCR damage and
 * append high-confidence unique-hit pairs into
 * config/hungarian-ocr-place-confusions.json.
 *
 * Never promotes blocked person/composer collisions (dohndnyi, dohnanyi, …).
 * Requires: damaged token + street-type neighbor in corpus, unique edit-distance
 * hit to a primary street-name gazetteer token.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlacesIndex, normalizePlaceKey } from '../lib/budapestPlacesGazetteer.js';
import {
  BLOCKED_PLACE_CONFUSIONS,
  CORPUS_PLACE_CONFUSION,
  DENYLIST_PLACE_CONFUSIONS,
  distanceCap,
  editDistance,
  isPrimaryStreetNameToken,
  placeConfusionsPath,
  reloadCorpusPlaceConfusion,
  STREET_TYPE_SURFACE,
  STREET_TYPE_TOKEN,
} from '../lib/hungarianOcrGazetteer.js';

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
const minCount = Math.max(1, Number(option('--min-count', '2')) || 2);
const dryRun = process.argv.includes('--dry-run');

const streetNameTokens = (placesIndex) => {
  const tokens = new Set();
  for (const [key, entry] of Object.entries(placesIndex.entries ?? {})) {
    if (entry?.layer !== 'street' || !entry.unique) continue;
    const parts = key.split(/\s+/u);
    for (const part of parts) {
      if (!part || part.length < 4) continue;
      if (/\b(utca|ut|ter|korut|krt|rakpart|koz|sor|fasor|setany|liget|park|hid)\b/u.test(part)) continue;
      if (BLOCKED_PLACE_CONFUSIONS.has(part)) continue;
      tokens.add(part);
    }
  }
  return [...tokens];
};

const uniqueEditHit = (folded, candidates, cap) => {
  const hits = [];
  for (const candidate of candidates) {
    if (Math.abs(candidate.length - folded.length) > cap) continue;
    const distance = editDistance(folded, candidate, cap);
    if (distance > 0 && distance <= cap) hits.push({ to: candidate, distance });
  }
  if (hits.length !== 1) return null;
  return hits[0];
};

const main = async () => {
  const placesIndex = await loadPlacesIndex();
  const streetTokens = streetNameTokens(placesIndex);
  const buckets = new Map();
  for (const token of streetTokens) {
    const list = buckets.get(token[0] ?? '') ?? [];
    list.push(token);
    buckets.set(token[0] ?? '', list);
  }

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

  /** Map damagedFolded → { count, to, distance, examples[] } */
  const discoveries = new Map();

  for (const row of prefer.values()) {
    for (const mention of row.mentions ?? []) {
      if (pageFilter && !pageFilter.has(mention.page)) continue;
      const text = String(mention.normalized_text ?? mention.text ?? '');
      const parts = text.match(/[A-Za-zÀ-ÿ]+/gu) ?? [];
      for (let i = 0; i < parts.length; i += 1) {
        const token = parts[i];
        const folded = normalizePlaceKey(token);
        if (!folded || folded.length < 5) continue;
        if (BLOCKED_PLACE_CONFUSIONS.has(folded)) continue;
        if (DENYLIST_PLACE_CONFUSIONS.has(folded)) continue;
        if (placesIndex.tokens?.[folded]?.in_gazetteer) continue;
        const next = parts[i + 1];
        if (!next || !STREET_TYPE_TOKEN.test(next)) continue;

        const cap = distanceCap(folded);
        if (!cap) continue;
        const hit = uniqueEditHit(folded, buckets.get(folded[0] ?? '') ?? [], cap);
        if (!hit) continue;
        // Prefer primary street-name targets; allow non-primary only at distance 1
        // with equal length (keeps Városligeti→városligeti, blocks városliget).
        const primary = isPrimaryStreetNameToken(hit.to, placesIndex);
        if (!primary && !(hit.distance === 1 && hit.to.length === folded.length)) continue;
        if (hit.distance > 1 && hit.to.length !== folded.length) continue;
        if (CORPUS_PLACE_CONFUSION.get(folded) === hit.to) continue;

        const entry = discoveries.get(folded) ?? {
          from: folded,
          to: hit.to,
          distance: hit.distance,
          count: 0,
          examples: [],
        };
        if (entry.to !== hit.to) {
          // Ambiguous across mentions — drop.
          discoveries.set(folded, { ...entry, to: null, count: entry.count + 1 });
          continue;
        }
        entry.count += 1;
        if (entry.examples.length < 3) {
          entry.examples.push({ page: mention.page, surface: text.slice(0, 80) });
        }
        discoveries.set(folded, entry);
      }
    }
  }

  const additions = [...discoveries.values()]
    .filter((row) => row.to && row.count >= minCount)
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

  const confusionsPath = placeConfusionsPath();
  let doc = { generated_at: new Date().toISOString(), note: 'Corpus-observed Hungarian place OCR siblings.', confusions: {} };
  try {
    doc = JSON.parse(fs.readFileSync(confusionsPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  doc.confusions = { ...(doc.confusions ?? {}) };

  const added = [];
  for (const row of additions) {
    if (BLOCKED_PLACE_CONFUSIONS.has(row.from) || BLOCKED_PLACE_CONFUSIONS.has(row.to)) continue;
    if (doc.confusions[row.from] === row.to) continue;
    if (doc.confusions[row.from] && doc.confusions[row.from] !== row.to) {
      console.warn(`skip conflict ${row.from}: existing=${doc.confusions[row.from]} discovered=${row.to}`);
      continue;
    }
    doc.confusions[row.from] = row.to;
    added.push(row);
  }

  // Strip blocked / denylisted keys if somehow present.
  for (const blocked of BLOCKED_PLACE_CONFUSIONS) delete doc.confusions[blocked];
  for (const denied of DENYLIST_PLACE_CONFUSIONS) delete doc.confusions[denied];

  doc.generated_at = new Date().toISOString();
  doc.updated_by = 'cli/promote-hungarian-ocr-repairs.js';

  if (!dryRun && added.length) {
    fs.writeFileSync(confusionsPath, `${JSON.stringify(doc, null, 2)}\n`);
    reloadCorpusPlaceConfusion();
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    confusions_path: confusionsPath,
    scanned_mentions: [...prefer.values()].reduce((n, row) => n + (row.mentions?.length ?? 0), 0),
    candidates: additions.length,
    added: added.map((row) => ({ from: row.from, to: row.to, count: row.count, distance: row.distance, examples: row.examples })),
    corpus_size: Object.keys(doc.confusions).length,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
