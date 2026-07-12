// Wikidata anchor loader (Layer 6): reads the CC0 "open place" records
// discovered by ingest/src/sources/wikidata/pollBudapest.ts
// (ingest/output/open/wikidata_budapest_offset_*.json) and anchors them onto
// already-existing canonical location entities via lib/kgWikidataAnchor.js's
// pure planner. Mirrors cli/resolve-kg-locations.js's CLI shape: dry-run by
// default, --commit to write, a JSON report either way.
//
// Never creates kg_entities rows: a landmark with no canonical entity yet
// must first go through `npm run embed:kg -- --seed-public-locations`
// (lib/kgPublicLocationSeeder.js). Never touches public.locations at all.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planWikidataAliasLinks } from '../lib/kgWikidataAnchor.js';
import { loadCliEnv } from './_shared/loadEnv.js';
import { option } from './_shared/args.js';
import { requireSupabaseEnv, createRestClient } from './_shared/supabaseRest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadCliEnv(import.meta.url);

const DEFAULT_INPUT_DIR = path.join(__dirname, '../../ingest/output/open');
const DEFAULT_REPORT = path.join(__dirname, '../../ingest/corpus/restricted/extractions/wikidata-alias-report.json');
const INPUT_FILE_PATTERN = /^wikidata_budapest_offset_\d+\.json$/;

const readRecordsFromFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : [];
};

// Default: every ingest/output/open/wikidata_budapest_offset_*.json batch
// file, sorted for a deterministic run order. --input overrides this with a
// single explicit file (useful for testing against one offset batch, or a
// hand-picked fixture).
const loadWikidataRecords = async (inputOverride) => {
  if (inputOverride) return readRecordsFromFile(inputOverride);
  let entries;
  try { entries = await fs.readdir(DEFAULT_INPUT_DIR); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const files = entries.filter((name) => INPUT_FILE_PATTERN.test(name)).sort();
  const records = [];
  for (const file of files) records.push(...await readRecordsFromFile(path.join(DEFAULT_INPUT_DIR, file)));
  return records;
};

// PostgREST reports an unknown column with a 4xx whose body names the column
// (typically PGRST204, "Could not find the 'source' column ..."; older
// PostgREST versions may instead surface Postgres' own 42703 "column ...
// does not exist"). Same defensive pattern as cli/expand-kg-aliases.js's
// insertAliases: try the write WITH `source` first (the common case once
// migration 018_kg_alias_exact_match.sql has run), and only on that specific
// failure retry the same batch without the column.
const UNKNOWN_COLUMN_ERROR = /could not find the '?source'? column|column .*source.* does not exist|PGRST204/i;

const upsertAliases = async (rest, rows) => {
  if (!rows.length) return { written: 0, sourceColumnAvailable: true };
  const write = async (batch) => {
    for (let index = 0; index < batch.length; index += 100) {
      await rest('kg_entity_aliases', {
        method: 'POST', body: batch.slice(index, index + 100),
        params: { on_conflict: 'id' }, prefer: 'resolution=merge-duplicates,return=minimal',
      });
    }
  };
  try {
    await write(rows);
    return { written: rows.length, sourceColumnAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!UNKNOWN_COLUMN_ERROR.test(message)) throw error;
    const withoutSource = rows.map(({ source, ...fields }) => fields);
    await write(withoutSource);
    return { written: withoutSource.length, sourceColumnAvailable: false };
  }
};

const applyEntityPatches = async (rest, patches) => {
  for (const patch of patches) {
    await rest('kg_entities', {
      method: 'PATCH', prefer: 'return=minimal',
      params: { id: `eq.${patch.entity_id}` },
      body: { metadata: patch.metadata, updated_at: new Date().toISOString() },
    });
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--publish') || args.includes('--allow-restricted-public')) {
    throw new Error('load-wikidata-aliases.js never publishes. It only writes private/needs-review alias links and merges Wikidata provenance into an existing canonical entity\'s metadata; run promote-kg-location.js --publish for a reviewed public promotion.');
  }
  const commit = args.includes('--commit');
  const reportPath = path.resolve(option(args, '--report', DEFAULT_REPORT));
  const inputOverride = option(args, '--input');
  const { baseUrl, serviceKey } = requireSupabaseEnv();
  const { rest, restAll } = createRestClient(baseUrl, serviceKey);

  const records = await loadWikidataRecords(inputOverride ? path.resolve(inputOverride) : null);

  const [publicLandmarks, entities, allAliases] = await Promise.all([
    restAll('locations', { select: 'id,name,latitude,longitude' }),
    restAll('kg_entities', { select: 'id,public_location_id,metadata', entity_kind: 'eq.location', public_location_id: 'not.is.null' }),
    restAll('kg_entity_aliases', { select: 'id,entity_id,alias,normalized_alias,language_code,alias_kind,review_status' }),
  ]);

  const entitiesByPublicLocationId = new Map(entities.map((entity) => [entity.public_location_id, entity]));
  const existingAliasesByEntityId = new Map();
  for (const row of allAliases) {
    if (!existingAliasesByEntityId.has(row.entity_id)) existingAliasesByEntityId.set(row.entity_id, []);
    existingAliasesByEntityId.get(row.entity_id).push(row);
  }

  const { aliasRows, entityPatches, summary } = planWikidataAliasLinks(records, publicLandmarks, entitiesByPublicLocationId, existingAliasesByEntityId);

  let aliasWriteResult = { written: 0, sourceColumnAvailable: true };
  if (commit && aliasRows.length) aliasWriteResult = await upsertAliases(rest, aliasRows);
  if (commit && entityPatches.length) await applyEntityPatches(rest, entityPatches);

  const fullSummary = {
    mode: commit ? 'commit' : 'dry-run',
    records_considered: records.length,
    public_landmarks: publicLandmarks.length,
    canonical_entities: entities.length,
    existing_aliases: allAliases.length,
    ...summary,
    alias_rows_planned: aliasRows.length,
    entity_patches_planned: entityPatches.length,
    alias_rows_written: commit ? aliasWriteResult.written : 0,
    source_column_available: commit ? aliasWriteResult.sourceColumnAvailable : null,
    safety: "Never creates kg_entities rows and never touches locations.source/external_id; only upserts kg_entity_aliases rows (source: 'wikidata') and merges wikidata_id/wikidata_anchor into an already-existing canonical location entity's metadata. Run `npm run embed:kg -- --seed-public-locations` first for any landmark reported under skipped_no_entity.",
  };

  const report = { generated_at: new Date().toISOString(), summary: fullSummary, alias_rows: aliasRows, entity_patches: entityPatches };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(fullSummary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!commit) console.log('\nPreview only. Re-run with --commit to write the alias rows and entity metadata patches listed above.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
