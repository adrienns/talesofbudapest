#!/usr/bin/env node
/**
 * Merge browser gold annotations (or Fable-generated gold) into the V3 gold
 * fixture. Every merged item carries gold_source; the eval harness refuses to
 * mark promotion gates passed unless held-out gold is human.
 *
 * Usage:
 *   node cli/merge-gold-annotations.js --input <annotations.json> [--gold-source human-browser|fable-5]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const INPUT = option('--input');
const FIXTURE = option('--fixture', path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json'));
const GOLD_SOURCE_OVERRIDE = option('--gold-source');

const main = async () => {
  if (!INPUT) throw new Error('Provide --input <annotations.json> (exported from the --annotate browser or Fable gold)');
  const annotationsFile = JSON.parse(await fs.readFile(INPUT, 'utf8'));
  const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  if (annotationsFile.source_id !== fixture.source_id) throw new Error('source_id mismatch between annotations and fixture');
  const goldSource = GOLD_SOURCE_OVERRIDE ?? annotationsFile.gold_source ?? 'unknown';
  const existing = new Map(fixture.items.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const annotation of annotationsFile.annotations ?? annotationsFile.items ?? []) {
    if (annotation.verdict === 'rejected') {
      // Rejections remove a previously merged gold item with the same id.
      if (existing.delete(annotation.item_id ?? annotation.id)) updated += 1;
      continue;
    }
    if (annotation.verdict && annotation.verdict !== 'accepted') continue;
    const id = annotation.item_id ?? annotation.id;
    const row = {
      id,
      page: annotation.page,
      kind: annotation.kind,
      assertion_kind: annotation.assertion_kind ?? null,
      canonical_type: annotation.canonical_type ?? null,
      clause_ids: annotation.clause_ids ?? [],
      required_terms: annotation.required_terms ?? [],
      tags: annotation.tags ?? [],
      statement_hint: annotation.statement ?? annotation.statement_hint ?? null,
      note: annotation.note ?? null,
      gold_source: goldSource,
    };
    if (existing.has(id)) updated += 1; else added += 1;
    existing.set(id, row);
  }
  fixture.items = [...existing.values()].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || String(a.id).localeCompare(String(b.id)));
  // References and transitions merge under the same gold_source when present.
  for (const field of ['references', 'transitions', 'layout_zones']) {
    if (Array.isArray(annotationsFile[field]) && annotationsFile[field].length) {
      const current = new Map((fixture[field] ?? []).map((row) => [JSON.stringify([row.clause_id, row.surface ?? row.active_entity_id ?? '']), row]));
      for (const row of annotationsFile[field]) {
        current.set(JSON.stringify([row.clause_id, row.surface ?? row.active_entity_id ?? '']), { ...row, gold_source: goldSource });
      }
      fixture[field] = [...current.values()];
    }
  }
  await fs.writeFile(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ fixture: FIXTURE, added, updated, total_items: fixture.items.length, gold_source: goldSource }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
