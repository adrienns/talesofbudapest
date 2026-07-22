import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedCanonicalCuratedLocations } from '../lib/canonicalLocationSeeder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: process.env.ENV_FILE
    ? resolve(process.cwd(), process.env.ENV_FILE)
    : join(__dirname, '..', '.env'),
});

const supabaseUrl = process.env.STAGING_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Supabase URL and server key are required');
}

const result = await seedCanonicalCuratedLocations(createClient(supabaseUrl, serviceKey));
console.log(
  `Canonical catalog ready: ${result.total} places (${result.created} created, ${result.matched} matched); `
  + `${result.linkedChapters} curated chapters linked`,
);
