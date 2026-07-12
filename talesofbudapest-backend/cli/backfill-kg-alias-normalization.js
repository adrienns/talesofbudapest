import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planNormalizationBackfill } from '../lib/kgAliasBackfill.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-alias-normalization-backfill-report.json');

// This backfill recomputes kg_entity_aliases.normalized_alias from `alias`
// using the shared lib/kgNormalize.js normalizeLocationName (see
// lib/kgAliasBackfill.js for the pure planning logic). It exists because
// lib/kgPromotion.js's alias-writing path (aliasesFor) used to normalize with
// a simpler fold (bare diacritic-strip + lowercase, no Hungarian/English
// generic-term canonicalization) before the kgNormalize.js unification; rows
// written before that change carry stale normalized_alias values that this
// script brings in line.
const main = async () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const limit = Number(option(args, '--limit', '20000'));
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest } = createRestClient(baseUrl, serviceKey);

  const rows = await rest('kg_entity_aliases', {
    params: { select: 'id,entity_id,alias,normalized_alias,alias_kind,review_status', limit: String(limit) },
  });

  const plan = planNormalizationBackfill(rows);

  if (commit) {
    // Delete collision losers first so the subsequent PATCH of the winner's
    // normalized_alias never collides with a row still occupying that
    // unique(entity_id, normalized_alias, alias_kind) slot.
    for (const deletion of plan.deletions) {
      await rest('kg_entity_aliases', { method: 'DELETE', prefer: 'return=minimal', params: { id: `eq.${deletion.id}` } });
    }
    for (const update of plan.updates) {
      await rest('kg_entity_aliases', {
        method: 'PATCH', prefer: 'return=minimal',
        params: { id: `eq.${update.id}` },
        body: { normalized_alias: update.new_normalized_alias },
      });
    }
  }

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    total_rows: plan.total_rows,
    updates_planned: plan.updates.length,
    deletions_planned: plan.deletions.length,
    collisions: plan.collisions.length,
    unchanged: plan.unchanged_count,
    embeddings: 'NOT invalidated by this backfill. kg_entity_aliases.embedding is keyed on `alias` (see lib/kgEmbeddings.js aliasEmbeddingText/embeddingCacheKey), which this script never reads or writes -- only `normalized_alias` is recomputed, and collision losers are deleted outright rather than merged, so no alias text changes underneath an existing embedding.',
    safety: 'Recomputes normalized_alias from alias using the shared lib/kgNormalize.js normalizeLocationName only. Never touches alias, embedding, language_code, or entity linkage. On a collision (two rows recomputing to the same entity_id/alias_kind/normalized_alias), the row with the higher review_status rank (approved > needs_review > draft > rejected; ties by id) is kept and the other is deleted -- see lib/kgAliasBackfill.js.',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, updates: plan.updates, deletions: plan.deletions, collisions: plan.collisions }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!commit) console.log('\nPreview only. Re-run with --commit to apply the normalized_alias updates and collision deletions listed above.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
