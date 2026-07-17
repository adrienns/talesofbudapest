import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

test('source-bearing tables have no public read policy or privileges', async () => {
  const sourcePolicyMigration = await readFile(
    path.join(root, 'supabase/migrations/028_lock_down_source_material.sql'),
    'utf8',
  );
  const privilegeMigration = await readFile(
    path.join(root, 'supabase/migrations/029_revoke_public_source_table_privileges.sql'),
    'utf8',
  );

  for (const table of ['locations', 'location_translations', 'location_audio_variants']) {
    assert.match(sourcePolicyMigration, new RegExp(`revoke select on table public\\.${table} from anon, authenticated`, 'i'));
    assert.match(privilegeMigration, new RegExp(`revoke all privileges on table public\\.${table} from anon, authenticated`, 'i'));
    assert.match(privilegeMigration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'));
  }
  assert.match(sourcePolicyMigration, /drop policy if exists "Public read locations"/);
  assert.match(sourcePolicyMigration, /drop policy if exists "Public read location_translations"/);
  assert.match(sourcePolicyMigration, /drop policy if exists "Public read location_audio_variants"/);
});

test('the migration runner executes the source-access lockdown', async () => {
  const runner = await readFile(path.join(root, 'talesofbudapest-backend/migrate.js'), 'utf8');
  assert.match(runner, /'028_lock_down_source_material\.sql'/);
  assert.match(runner, /'029_revoke_public_source_table_privileges\.sql'/);

  const dockerRunner = await readFile(path.join(root, 'infra/scripts/migrate.sh'), 'utf8');
  assert.match(dockerRunner, /028_lock_down_source_material\.sql/);
  assert.match(dockerRunner, /029_revoke_public_source_table_privileges\.sql/);
});

test('server Supabase clients do not fall back to an anon key', async () => {
  const helper = await readFile(
    path.join(root, 'talesofbudapest-frontend/src/lib/server/supabaseAdmin.ts'),
    'utf8',
  );

  assert.doesNotMatch(helper, /resolveSupabaseServiceRoleKey\(\) \?\?/);
  assert.match(helper, /Server API routes must not fall back to an anon key/);
});
