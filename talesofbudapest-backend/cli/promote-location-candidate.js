import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { option } from './_shared/args.js';
import { promoteLocationCandidate } from '../lib/locationCandidatePromotion.js';

dotenv.config();
const args = process.argv.slice(2);
const candidateId = option(args, '--id');
if (!candidateId) throw new Error('--id is required');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const result = await promoteLocationCandidate({
  supabase: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY),
  candidateId,
  existingLocationSlug: option(args, '--location-slug'),
  slug: option(args, '--slug'),
  name: option(args, '--name'),
  placeKind: option(args, '--place-kind') ?? 'historical_site',
  storyPrompt: option(args, '--story') ?? '',
});
console.log(`Candidate ${result.candidateId} ${result.status} as ${result.locationSlug} (${result.locationId})`);
