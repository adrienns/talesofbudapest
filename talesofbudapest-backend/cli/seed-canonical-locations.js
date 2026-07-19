import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { seedCanonicalCuratedLocations } from '../lib/canonicalLocationSeeder.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const result = await seedCanonicalCuratedLocations(createClient(supabaseUrl, serviceKey));
console.log(
  `Canonical catalog ready: ${result.total} places (${result.created} created, ${result.matched} matched); `
  + `${result.linkedChapters} curated chapters linked`,
);
