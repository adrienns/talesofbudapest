#!/usr/bin/env node
import { createHmac, randomBytes } from 'node:crypto';

const base64url = (value) => Buffer.from(value).toString('base64url');

const signJwt = (payload, secret) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const postgresPassword = randomBytes(18).toString('base64url');
const jwtSecret = randomBytes(32).toString('hex');
const issuedAt = Math.floor(Date.now() / 1000);
const expiresAt = issuedAt + 60 * 60 * 24 * 365 * 10;

const anonKey = signJwt(
  { role: 'anon', iss: 'supabase', iat: issuedAt, exp: expiresAt },
  jwtSecret,
);
const serviceRoleKey = signJwt(
  { role: 'service_role', iss: 'supabase', iat: issuedAt, exp: expiresAt },
  jwtSecret,
);

const encodedPassword = encodeURIComponent(postgresPassword);

console.log('# Paste into infra/supabase-upstream/docker/.env');
console.log(`POSTGRES_PASSWORD=${postgresPassword}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ANON_KEY=${anonKey}`);
console.log(`SERVICE_ROLE_KEY=${serviceRoleKey}`);
console.log('');
console.log('# App .env (talesofbudapest-backend + frontend)');
console.log('SUPABASE_URL=http://localhost:8000');
console.log('NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000');
console.log(`SUPABASE_ANON_KEY=${anonKey}`);
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);
console.log(`DATABASE_URL=postgresql://postgres:${encodedPassword}@localhost:5432/postgres`);
