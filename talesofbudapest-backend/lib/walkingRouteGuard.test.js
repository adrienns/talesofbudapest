import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

test('walking route proxy is quota-protected and constrained to Budapest', async () => {
  const route = await readFile(
    path.join(root, 'talesofbudapest-frontend/src/app/api/directions/walking/route.ts'),
    'utf8',
  );
  const migration = await readFile(
    path.join(root, 'supabase/migrations/030_walking_route_rate_limit.sql'),
    'utf8',
  );

  assert.match(route, /readJsonBody\(request, 8_192\)/);
  assert.match(route, /action: 'walking_route'/);
  assert.match(route, /BUDAPEST_BOUNDS/);
  assert.match(route, /requestGuardResponse\(error\)/);
  assert.match(migration, /\('walking_route', 12, 120\)/);
});
