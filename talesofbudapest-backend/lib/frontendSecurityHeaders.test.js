import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

test('visitor frontend defines browser security headers and a CSP', async () => {
  const config = await readFile(
    path.join(root, 'talesofbudapest-frontend/next.config.ts'),
    'utf8',
  );

  assert.match(config, /poweredByHeader: false/);
  assert.match(config, /key: 'Content-Security-Policy'/);
  assert.match(config, /"default-src 'self'"/);
  assert.match(config, /"object-src 'none'"/);
  assert.match(config, /"frame-ancestors 'none'"/);
  assert.match(config, /worker-src 'self' blob:/);
  assert.match(config, /https:\/\/tiles\.openfreemap\.org/);
  assert.match(config, /key: 'X-Content-Type-Options'/);
  assert.match(config, /key: 'X-Frame-Options'/);
  assert.match(config, /key: 'Referrer-Policy'/);
  assert.match(config, /geolocation=\(self\)/);
  assert.match(config, /key: 'Strict-Transport-Security'/);
});
