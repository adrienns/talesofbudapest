#!/usr/bin/env node
/**
 * Deduplicate gold items that are true duplicates: identical kind + identical
 * clause-id set + near-paraphrase statements. Distinct facts that only share
 * one clause id are kept.
 *
 * Preference: hi_* seeded from a run > draft-auto with statement_hint >
 * older g*_ / fable ids.
 *
 * Usage: node cli/dedupe-gold-clauses.js [--fixture path] [--dry-run]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanticTokenOverlap, statementsSamePolarity } from '../lib/historicalExtractionV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const DRY_RUN = args.includes('--dry-run');
const FIXTURE = option('--fixture', path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json'));

const rank = (item) => {
  const id = String(item.id ?? '');
  const human = String(item.gold_source ?? '').startsWith('human') ? 50 : 0;
  const seeded = id.startsWith('hi_') ? 3 : 0;
  const draft = String(item.gold_source ?? '').startsWith('draft') ? 1 : 0;
  const hint = item.statement_hint ? 1 : 0;
  const aligned = String(item.note ?? '').includes('aligned') || String(item.note ?? '').includes('seeded') ? 1 : 0;
  return human * 10 + seeded * 10 + draft * 3 + hint + aligned;
};

const clauseKey = (item) => [...(item.clause_ids ?? [])].sort().join('\u001f');
const hintText = (item) => String(item.statement_hint ?? item.note ?? '');

const areDuplicates = (left, right) => {
  if (left.kind !== right.kind) return false;
  if ((left.assertion_kind ?? null) !== (right.assertion_kind ?? null)) return false;
  if (clauseKey(left) !== clauseKey(right) || !clauseKey(left)) return false;
  const leftText = hintText(left);
  const rightText = hintText(right);
  if (!leftText || !rightText) {
    // Without statements, only collapse exact same required_terms.
    return JSON.stringify(left.required_terms ?? []) === JSON.stringify(right.required_terms ?? []);
  }
  return statementsSamePolarity(leftText, rightText)
    && semanticTokenOverlap(leftText, rightText) >= 0.72;
};

const main = async () => {
  const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  const byKey = new Map();
  for (const item of fixture.items ?? []) {
    const key = `${item.kind}\u001f${item.assertion_kind ?? ''}\u001f${clauseKey(item)}`;
    if (!key.endsWith('\u001f')) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    }
  }
  const drop = new Set();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const kept = [];
    const ranked = group.slice().sort((left, right) => rank(right) - rank(left) || String(left.id).localeCompare(String(right.id)));
    for (const item of ranked) {
      const twin = kept.find((other) => areDuplicates(other, item));
      if (twin) drop.add(item.id);
      else kept.push(item);
    }
  }
  const before = fixture.items.length;
  fixture.items = fixture.items.filter((item) => !drop.has(item.id));
  if (!DRY_RUN) await fs.writeFile(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    fixture: FIXTURE,
    dry_run: DRY_RUN,
    removed: before - fixture.items.length,
    removed_ids: [...drop].sort(),
    total_items: fixture.items.length,
  }, null, 2));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
