#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dockerEnv = readFileSync(path.join(__dirname, '../supabase-upstream/docker/.env'), 'utf8');

const jwtSecret = dockerEnv.match(/^JWT_SECRET=(.+)$/m)?.[1]?.trim();
const anonKey = dockerEnv.match(/^ANON_KEY=(.+)$/m)?.[1]?.trim();

if (!jwtSecret || !anonKey) {
  console.error('JWT_SECRET or ANON_KEY not found in docker .env');
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

console.log(serviceRoleKey);
