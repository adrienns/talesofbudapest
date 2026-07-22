import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_TOURS, validateCuratedTours } from '../content/curated/index.js';
import { option } from './_shared/args.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The source remains the local project. Load the staging file afterwards so
// only its STAGING_* values are added and local source credentials stay intact.
dotenv.config({ path: join(__dirname, '..', '.env') });
if (process.env.ENV_FILE) {
  dotenv.config({ path: resolve(process.cwd(), process.env.ENV_FILE) });
}

const sourceUrl = process.env.SOURCE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.STAGING_SUPABASE_URL;
const targetKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const selectedSlug = option(process.argv.slice(2), '--slug');

if (!sourceUrl || !sourceKey) {
  throw new Error('Source credentials are required (SOURCE_SUPABASE_* or the local SUPABASE_* values).');
}
if (!targetUrl || !targetKey) {
  throw new Error('STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY are required.');
}

const source = createClient(sourceUrl, sourceKey);
const target = createClient(targetUrl, targetKey);

const getStoragePath = (audioUrl) => {
  const marker = '/storage/v1/object/public/';
  const parsed = new URL(audioUrl);
  const publicPath = parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length);
  const [bucket, ...path] = publicPath.split('/');

  if (!parsed.pathname.includes(marker) || bucket !== 'audio-tours' || path.length === 0) {
    throw new Error(`Expected a public audio-tours URL, received: ${audioUrl}`);
  }

  return { bucket, path: path.join('/') };
};

const getNarrative = async (client, tour) => {
  const { data, error } = await client
    .from('narratives')
    .select('id')
    .eq('curated_slug', tour.slug)
    .eq('content_version', tour.version)
    .eq('locale', tour.locale)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const getChapters = async (client, narrativeId) => {
  const { data, error } = await client
    .from('narrative_chapters')
    .select('id, chapter_index, audio_url')
    .eq('narrative_id', narrativeId)
    .order('chapter_index');
  if (error) throw new Error(error.message);
  return data ?? [];
};

validateCuratedTours();
const tours = CURATED_TOURS.filter((tour) => !selectedSlug || tour.slug === selectedSlug);
if (!tours.length) throw new Error('No curated tour matched --slug.');

let copied = 0;
let skipped = 0;

for (const tour of tours) {
  const [sourceNarrative, targetNarrative] = await Promise.all([
    getNarrative(source, tour),
    getNarrative(target, tour),
  ]);

  if (!sourceNarrative || !targetNarrative) {
    console.warn(`Skipping ${tour.slug} (${tour.locale}): seed it in both source and staging first.`);
    skipped += tour.stops.length;
    continue;
  }

  const [sourceChapters, targetChapters] = await Promise.all([
    getChapters(source, sourceNarrative.id),
    getChapters(target, targetNarrative.id),
  ]);
  const targetsByIndex = new Map(targetChapters.map((chapter) => [chapter.chapter_index, chapter]));

  for (const chapter of sourceChapters) {
    const destination = targetsByIndex.get(chapter.chapter_index);
    if (!destination || !chapter.audio_url) {
      console.warn(`Skipping ${tour.slug} ${tour.locale} stop ${chapter.chapter_index + 1}: audio is not ready in the source.`);
      skipped += 1;
      continue;
    }

    const { bucket, path } = getStoragePath(chapter.audio_url);
    const { data: audio, error: downloadError } = await source.storage.from(bucket).download(path);
    if (downloadError) throw new Error(`Could not download ${path}: ${downloadError.message}`);

    const { error: uploadError } = await target.storage.from(bucket).upload(
      path,
      Buffer.from(await audio.arrayBuffer()),
      { contentType: 'audio/mpeg', upsert: true },
    );
    if (uploadError) throw new Error(`Could not upload ${path}: ${uploadError.message}`);

    const { data: publicUrl } = target.storage.from(bucket).getPublicUrl(path);
    const { error: chapterError } = await target
      .from('narrative_chapters')
      .update({ audio_url: publicUrl.publicUrl })
      .eq('id', destination.id);
    if (chapterError) throw new Error(chapterError.message);
    copied += 1;
  }
}

console.log(`Copied ${copied} curated audio files to staging; skipped ${skipped}.`);
