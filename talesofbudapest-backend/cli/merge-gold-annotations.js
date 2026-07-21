#!/usr/bin/env node
/**
 * Merge gold annotations into the V3 gold fixture.
 * human* and sol-* regenerate adjudication_manifest; other sources invalidate it.
 * Sol merges replace prior sol-* held-out rows (items + aux) so rebuilds do not accumulate.
 *
 * Usage:
 *   node cli/merge-gold-annotations.js --input <annotations.json> [--gold-source human-browser|sol-adjudication|fable-5]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldoutContentFingerprint } from '../lib/historicalGoldFingerprint.js';
import { isAdjudicatedSource, isHumanSource, isSolSource } from '../lib/historicalGoldProvenance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};

const INPUT = option('--input');
const FIXTURE = option('--fixture', path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json'));
const GOLD_SOURCE_OVERRIDE = option('--gold-source');
const ADJUDICATION = option('--adjudication-id', null);
const ADJUDICATOR = option('--adjudicator', null);

const adjudicationMeta = (goldSource, annotationsFile) => {
  if (!isAdjudicatedSource(goldSource)) return {};
  return {
    adjudication_id: ADJUDICATION ?? annotationsFile.adjudication_id,
    adjudicator: ADJUDICATOR ?? annotationsFile.adjudicator,
  };
};

const purgeSolHeldout = (fixture) => {
  const heldout = new Set(fixture.splits?.heldout ?? []);
  const isSolHeldoutRow = (row) => heldout.has(row.page) && isSolSource(row.gold_source);
  const beforeItems = fixture.items.length;
  fixture.items = fixture.items.filter((item) => !isSolHeldoutRow(item));
  let purgedAux = 0;
  for (const field of ['references', 'transitions', 'layout_zones', 'clauses', 'negative_items']) {
    const rows = fixture[field];
    if (!Array.isArray(rows)) continue;
    const next = rows.filter((row) => {
      if (field === 'negative_items') {
        return !(heldout.has(row.page) && isSolSource(row.gold_source));
      }
      return !isSolHeldoutRow(row);
    });
    purgedAux += rows.length - next.length;
    fixture[field] = next;
  }
  return { purged_items: beforeItems - fixture.items.length, purged_aux: purgedAux };
};

const main = async () => {
  if (!INPUT) throw new Error('Provide --input <annotations.json> (exported from the --annotate browser, Sol, or Fable gold)');
  const annotationsFile = JSON.parse(await fs.readFile(INPUT, 'utf8'));
  const fixture = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
  if (annotationsFile.source_id !== fixture.source_id) throw new Error('source_id mismatch between annotations and fixture');
  const goldSource = GOLD_SOURCE_OVERRIDE ?? annotationsFile.gold_source ?? 'unknown';
  if (isAdjudicatedSource(goldSource)) {
    const adjudicationId = ADJUDICATION ?? annotationsFile.adjudication_id ?? null;
    const adjudicator = ADJUDICATOR ?? annotationsFile.adjudicator ?? null;
    if (!adjudicationId || !adjudicator) {
      throw new Error('human*/sol-* gold_source requires --adjudication-id and --adjudicator (or matching fields in the annotations file)');
    }
  }
  const purge = isSolSource(goldSource) ? purgeSolHeldout(fixture) : { purged_items: 0, purged_aux: 0 };
  const existing = new Map(fixture.items.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const annotation of annotationsFile.annotations ?? annotationsFile.items ?? []) {
    if (annotation.verdict === 'rejected') {
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
      polarity: annotation.polarity ?? null,
      gold_source: goldSource,
      ...adjudicationMeta(goldSource, annotationsFile),
    };
    if (existing.has(id)) updated += 1; else added += 1;
    existing.set(id, row);
  }
  fixture.items = [...existing.values()].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || String(a.id).localeCompare(String(b.id)));
  for (const field of ['references', 'transitions', 'layout_zones', 'clauses']) {
    if (Array.isArray(annotationsFile[field]) && annotationsFile[field].length) {
      const current = new Map((fixture[field] ?? []).map((row) => [JSON.stringify([
        row.clause_id ?? row.page,
        row.surface ?? row.active_entity_id ?? row.zone ?? '',
        row.y_min ?? '',
        row.x_min ?? '',
        row.disposition ?? '',
      ]), row]));
      for (const row of annotationsFile[field]) {
        current.set(JSON.stringify([
          row.clause_id ?? row.page,
          row.surface ?? row.active_entity_id ?? row.zone ?? '',
          row.y_min ?? '',
          row.x_min ?? '',
          row.disposition ?? '',
        ]), {
          ...row,
          gold_source: goldSource,
          ...adjudicationMeta(goldSource, annotationsFile),
        });
      }
      fixture[field] = [...current.values()];
    }
  }
  if (Array.isArray(annotationsFile.negative_items) && annotationsFile.negative_items.length) {
    const current = new Map((fixture.negative_items ?? []).map((row) => [row.id, row]));
    for (const row of annotationsFile.negative_items) {
      current.set(row.id, {
        ...row,
        gold_source: goldSource,
        ...adjudicationMeta(goldSource, annotationsFile),
      });
    }
    fixture.negative_items = [...current.values()];
  }
  if (annotationsFile.heldout_dispositions && typeof annotationsFile.heldout_dispositions === 'object') {
    const incoming = annotationsFile.heldout_dispositions;
    if (isAdjudicatedSource(goldSource)) {
      fixture.heldout_dispositions = {
        ...incoming,
        gold_source: goldSource,
        ...adjudicationMeta(goldSource, annotationsFile),
      };
    } else {
      const { adjudication_id: _dropId, adjudicator: _dropWho, ...rest } = {
        ...(fixture.heldout_dispositions ?? {}),
        ...incoming,
        gold_source: goldSource,
      };
      fixture.heldout_dispositions = rest;
    }
  }
  if (annotationsFile.immutable_source_sha256) {
    fixture.immutable_source_sha256 = annotationsFile.immutable_source_sha256;
  }
  if (annotationsFile.locked_config && typeof annotationsFile.locked_config === 'object') {
    fixture.locked_config = { ...annotationsFile.locked_config };
  }
  if (annotationsFile.annotation_status) {
    fixture.annotation_status = annotationsFile.annotation_status;
  }
  if (annotationsFile.minimums && typeof annotationsFile.minimums === 'object') {
    fixture.minimums = { ...(fixture.minimums ?? {}), ...annotationsFile.minimums };
  }
  if (isAdjudicatedSource(goldSource)) {
    const certification = isSolSource(goldSource) ? 'sol_silver' : 'human';
    const approvedRunIds = [...new Set([
      ...(annotationsFile.approved_run_ids ?? []),
      ...(annotationsFile.adjudication_manifest?.approved_run_ids ?? []),
    ].filter(Boolean))];
    fixture.adjudication_manifest = {
      adjudication_id: ADJUDICATION ?? annotationsFile.adjudication_id,
      adjudicator: ADJUDICATOR ?? annotationsFile.adjudicator,
      gold_source: goldSource,
      certification,
      approved_run_ids: approvedRunIds,
      immutable_source_sha256: fixture.immutable_source_sha256
        ?? annotationsFile.immutable_source_sha256
        ?? null,
      content_sha256: null, // filled after all fields set
      note: isHumanSource(goldSource)
        ? 'content_sha256 from historicalGoldFingerprint; human merge'
        : 'content_sha256 from historicalGoldFingerprint; sol-silver merge (not human promotion)',
    };
    fixture.adjudication_manifest.content_sha256 = heldoutContentFingerprint(fixture);
  } else if (fixture.adjudication_manifest) {
    fixture.adjudication_manifest = {
      ...fixture.adjudication_manifest,
      content_sha256: null,
      invalidated_by: goldSource,
      invalidated_at: new Date().toISOString(),
      note: 'invalidated because a non-adjudicated merge changed the fixture; human or sol adjudication must regenerate',
    };
  }
  await fs.writeFile(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    fixture: FIXTURE,
    added,
    updated,
    purged_sol_heldout_items: purge.purged_items,
    purged_sol_heldout_aux: purge.purged_aux,
    total_items: fixture.items.length,
    gold_source: goldSource,
    certification: fixture.adjudication_manifest?.certification ?? null,
    adjudication_manifest: fixture.adjudication_manifest?.content_sha256 ?? null,
  }));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
