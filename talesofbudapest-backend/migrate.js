import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.ENV_FILE
  ? path.resolve(process.cwd(), process.env.ENV_FILE)
  : path.join(__dirname, '.env');
dotenv.config({ path: envFile });

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const migrationFiles = [
  '001_locations.sql',
  '001_alter_only.sql',
  '002_storage.sql',
  '003_locations_name_unique.sql',
  '004_landmark_images.sql',
  '005_storage_landmark_images.sql',
  '006_narratives.sql',
  '007_narrative_writes.sql',
  '008_rag_history.sql',
  '009_location_provenance.sql',
  '009a_upgrade_legacy_location_ids.sql',
  '010_location_translations.sql',
  '011_location_importance.sql',
  '012_locations_map_index.sql',
  '013_location_history.sql',
  '014_knowledge_graph_staging.sql',
  '015_knowledge_graph_canonical.sql',
  '016_kg_hybrid_search.sql',
  '017_kg_claim_era.sql',
  '018_kg_alias_exact_match.sql',
  '019_kg_organisations_and_placeholders.sql',
  '020_narrative_walking_routes.sql',
  '021_curated_narratives.sql',
  '022_locations_map_theme.sql',
  '023_private_user_narratives.sql',
  '024_expensive_endpoint_guards.sql',
  '025_narrative_generation_jobs.sql',
  '026_tour_planning_metadata.sql',
  '027_narrative_drafts.sql',
  '028_lock_down_source_material.sql',
  '029_revoke_public_source_table_privileges.sql',
  '030_walking_route_rate_limit.sql',
  '031_ai_guide_rate_limit.sql',
  '032_canonical_locations.sql',
  '033_narrative_chapter_location_links.sql',
  '034_location_map_points.sql',
];

const normalizeConnectionString = (value) => {
  const match = value.match(/^(postgres(?:ql)?:\/\/)([^:/]+):(.+)@([^/]+)(\/.*)$/iu);
  if (match) {
    const [, scheme, username, password, host, databasePath] = match;
    let decodedPassword;
    try {
      decodedPassword = decodeURIComponent(password);
    } catch {
      decodedPassword = password;
    }

    // Normalise both a raw password and an already percent-encoded password.
    // This avoids #, @, and similar characters being parsed as URL syntax.
    return `${scheme}${username}:${encodeURIComponent(decodedPassword)}@${host}${databasePath}`;
  }

  try {
    new URL(value);
    return value;
  } catch {
    // Supabase displays a URI template, and it is easy to paste a database
    // password containing @, #, or similar characters without URL encoding.
    // Preserve the password while encoding only that URI component.
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection URI. Copy it again from Supabase Connect.');
  }
};

const runMigration = async () => {
  const connectionString = process.env.DATABASE_URL ?? process.env.STAGING_DATABASE_URL;

  if (!connectionString) {
    console.error(`DATABASE_URL is not set in ${envFile}`);
    console.error('');
    console.error('How to get it:');
    console.error('  1. Supabase Dashboard → your project → Project Settings → Database');
    console.error('  2. Under "Connection string", choose URI');
    console.error('  3. Copy the Session pooler string (port 5432) and replace [YOUR-PASSWORD]');
    console.error('  4. Add DATABASE_URL (or STAGING_DATABASE_URL) to the selected env file');
    console.error('');
    console.error('Then run from repo root: npm run db:migrate');
    process.exit(1);
  }

  let client;

  try {
    const normalizedConnectionString = normalizeConnectionString(connectionString);
    client = new pg.Client({
      connectionString: normalizedConnectionString,
      ssl: normalizedConnectionString.includes('localhost') || normalizedConnectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    });
    await client.connect();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Running ${file}...`);
      await client.query(sql);
      console.log(`  ${file} complete`);
    }

    console.log('All migrations complete');
  } catch (error) {
    console.error('Migration failed:', error.message);
    if (
      error.message.includes('ENOIDENTIFIER') ||
      error.message.includes('tenant identifier')
    ) {
      console.error('');
      console.error(
        'Local Docker maps port 5432 to Supavisor. Run migrations inside the DB container instead:',
      );
      console.error('  bash infra/scripts/migrate.sh');
    }
    process.exit(1);
  } finally {
    await client?.end();
  }
};

runMigration();
