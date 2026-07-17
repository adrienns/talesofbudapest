import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

test('rate-limit identity ignores caller-controlled forwarding headers', async () => {
  const guard = await readFile(
    path.join(root, 'talesofbudapest-frontend/src/lib/server/expensiveRequestGuard.ts'),
    'utf8',
  );
  const trustedIp = await readFile(
    path.join(root, 'talesofbudapest-frontend/src/lib/server/trustedClientIp.ts'),
    'utf8',
  );
  const nginx = await readFile(path.join(root, 'infra/nginx/app.conf'), 'utf8');

  assert.match(guard, /trustedClientIp\(request\) \?\? 'proxy-ip-unavailable'/);
  assert.doesNotMatch(guard, /headers\.get\('x-forwarded-for'\)|headers\.get\('x-real-ip'\)/);
  assert.match(trustedIp, /x-tales-client-ip/);
  assert.match(trustedIp, /isIP\(value\)/);
  assert.match(nginx, /proxy_set_header X-Tales-Client-IP \$remote_addr/);
  assert.doesNotMatch(nginx, /proxy_add_x_forwarded_for/);
});
