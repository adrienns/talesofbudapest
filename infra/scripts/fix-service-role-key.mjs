#!/usr/bin/env node
/**
 * Regenerate SERVICE_ROLE_KEY to match JWT_SECRET + ANON_KEY in docker .env.
 * Updates docker .env and talesofbudapest-backend/.env, then prints restart instructions.
 */
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');
const dockerEnvPath = path.join(repoRoot, 'infra/supabase-upstream/docker/.env');
const backendEnvPath = path.join(repoRoot, 'talesofbudapest-backend/.env');

const replaceEnvValue = (contents, key, value) => {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) {
    return contents.replace(pattern, `${key}=${value}`);
  }
  return `${contents.trimEnd()}\n${key}=${value}\n`;
};

const dockerEnv = readFileSync(dockerEnvPath, 'utf8');
const jwtSecret = dockerEnv.match(/^JWT_SECRET=(.+)$/m)?.[1]?.trim();
const anonKey = dockerEnv.match(/^ANON_KEY=(.+)$/m)?.[1]?.trim();

if (!jwtSecret || !anonKey) {
  console.error('JWT_SECRET or ANON_KEY missing from', dockerEnvPath);
  process.exit(1);
}

const anonPayload = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString());

const signJwt = (payload) => {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const serviceRoleKey = signJwt({
  role: 'service_role',
  iss: 'supabase',
  iat: anonPayload.iat,
  exp: anonPayload.exp,
});

let updatedDockerEnv = replaceEnvValue(dockerEnv, 'SERVICE_ROLE_KEY', serviceRoleKey);
// Kong reads SERVICE_ROLE_KEY via compose (SUPABASE_SERVICE_KEY); stray line breaks nothing but confuses debugging.
updatedDockerEnv = updatedDockerEnv.replace(/^SUPABASE_SERVICE_KEY=.*\n?/m, '');
writeFileSync(dockerEnvPath, updatedDockerEnv);

const backendEnv = readFileSync(backendEnvPath, 'utf8');
writeFileSync(backendEnvPath, replaceEnvValue(backendEnv, 'SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey));

console.log('Updated SERVICE_ROLE_KEY in:');
console.log(' -', dockerEnvPath);
console.log(' -', backendEnvPath);
console.log('');
console.log('Recreate Kong so keyauth picks up the new key (restart alone is not enough):');
console.log(
  '  cd infra/supabase-upstream/docker && docker compose -f docker-compose.yml -f ../../../infra/docker-compose.override.yml up -d --force-recreate kong',
);
console.log('');
console.log('Then restart the Next.js dev server.');
