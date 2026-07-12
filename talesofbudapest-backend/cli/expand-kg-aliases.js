// Offline lexicon expansion: for every canonical kg_entities row, take its
// already-APPROVED 'name'-kind aliases and derive additional 'translated_name'
// aliases from them via lib/kgNameLexicon.js's curated Hungarian<->English
// lexicon (lib/kgAliasExpansion.js's planLexiconExpansion is the pure planner
// this CLI runs; see that file for the full design rationale). The design
// rule: this is a DETERMINISTIC DERIVATION of an alias a human already
// approved, under a lexicon a human already curated -- not a new judgment
// call -- so every planned row is born review_status 'approved', same as
// cli/resolve-kg-locations.js's auto-linked aliases.
//
// Mirrors cli/resolve-kg-locations.js's CLI shape: dry-run by default,
// --commit to write, a JSON report either way.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planLexiconExpansion } from '../lib/kgAliasExpansion.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/kg-alias-expansion-report.json');

// PostgREST reports an unknown column with a 4xx whose body names the column
// (typically PGRST204, "Could not find the 'source' column ..."; older
// PostgREST versions may instead surface Postgres' own 42703 "column ...
// does not exist"). Rather than pre-checking the schema (an extra round trip
// this CLI would need on every run) or gating on a flag the caller has to
// remember to set correctly, this tries the insert WITH `source` first --
// the common case once migration 018_kg_alias_exact_match.sql has run -- and
// only on that specific failure retries the same batch without the column.
// This is the simplest approach that stays correct against both a
// pre-018 and a post-018 schema without any caller-visible flag.
const UNKNOWN_COLUMN_ERROR = /could not find the '?source'? column|column .*source.* does not exist|PGRST204/i;

const insertAliases = async (rest, rows) => {
  if (!rows.length) return { inserted: 0, sourceColumnAvailable: true };
  try {
    for (let index = 0; index < rows.length; index += 100) {
      await rest('kg_entity_aliases', { method: 'POST', body: rows.slice(index, index + 100), prefer: 'return=minimal' });
    }
    return { inserted: rows.length, sourceColumnAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!UNKNOWN_COLUMN_ERROR.test(message)) throw error;
    const withoutSource = rows.map(({ source, ...fields }) => fields);
    for (let index = 0; index < withoutSource.length; index += 100) {
      await rest('kg_entity_aliases', { method: 'POST', body: withoutSource.slice(index, index + 100), prefer: 'return=minimal' });
    }
    return { inserted: withoutSource.length, sourceColumnAvailable: false };
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const limit = Number(option(args, '--limit', '10000'));
  const entityKind = option(args, '--entity-kind');
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest } = createRestClient(baseUrl, serviceKey);

  const entityParams = { select: 'id,entity_kind,canonical_name_en', review_status: 'neq.rejected', limit: String(limit) };
  if (entityKind) entityParams.entity_kind = `eq.${entityKind}`;
  const [entities, aliases] = await Promise.all([
    rest('kg_entities', { params: entityParams }),
    rest('kg_entity_aliases', { params: { select: 'entity_id,alias,normalized_alias,alias_kind,review_status', limit: String(limit) } }),
  ]);

  const planned = planLexiconExpansion(entities, aliases);

  let insertResult = { inserted: 0, sourceColumnAvailable: true };
  if (commit && planned.length) insertResult = await insertAliases(rest, planned);

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const byEntity = new Map();
  for (const row of planned) {
    if (!byEntity.has(row.entity_id)) byEntity.set(row.entity_id, []);
    byEntity.get(row.entity_id).push(row.normalized_alias);
  }

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    entities_considered: entities.length,
    aliases_considered: aliases.length,
    aliases_planned: planned.length,
    entities_with_new_aliases: byEntity.size,
    aliases_written: commit ? insertResult.inserted : 0,
    source_column_available: commit ? insertResult.sourceColumnAvailable : null,
    review_status: 'approved',
    alias_kind: 'translated_name',
    safety: 'Deterministic lexicon derivation of already-approved aliases only; never touches kg_entities.review_status or publication_status, and never proposes a name the lexicon does not already enumerate.',
  };
  const report = {
    generated_at: new Date().toISOString(),
    summary,
    planned: planned.map((row) => ({
      entity_id: row.entity_id,
      canonical_name_en: entityById.get(row.entity_id)?.canonical_name_en ?? null,
      normalized_alias: row.normalized_alias,
    })),
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!commit) console.log('\nPreview only. Re-run with --commit to write the translated_name aliases listed above.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
