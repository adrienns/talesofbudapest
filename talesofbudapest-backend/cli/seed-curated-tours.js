import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CURATED_TOURS, validateCuratedTours } from '../content/curated/index.js';
import { pcmToMp3, synthesizeSpeech, uploadAudio } from '../lib/ttsClient.js';

dotenv.config();

const skipAudio = process.argv.includes('--skip-audio');
const localAudio = process.argv.includes('--local-audio');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runFile = promisify(execFile);

if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
if (skipAudio && localAudio) throw new Error('Use either --skip-audio or --local-audio, not both');
if (!skipAudio && !localAudio && !process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required unless --skip-audio or --local-audio is used');
}

validateCuratedTours();
const supabase = createClient(supabaseUrl, serviceKey);

const extractWavePcm = (wave) => {
  if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Local speech renderer returned an invalid WAVE file');
  }

  let offset = 12;
  while (offset + 8 <= wave.length) {
    const chunkId = wave.toString('ascii', offset, offset + 4);
    const chunkSize = wave.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === 'data') return wave.subarray(dataStart, dataStart + chunkSize);
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  throw new Error('Local speech WAVE file has no data chunk');
};

const synthesizeLocalSpeech = async (script, locale) => {
  if (process.platform !== 'darwin') {
    throw new Error('--local-audio currently requires macOS and the built-in say command');
  }

  const voice = locale === 'hu' ? 'Tünde' : 'Daniel';
  const outputPath = join(tmpdir(), `tales-curated-${randomUUID()}.wav`);
  try {
    await runFile('/usr/bin/say', [
      '-v', voice,
      '--file-format=WAVE',
      '--data-format=LEI16@24000',
      '-o', outputPath,
      script,
    ]);
    const pcm = extractWavePcm(await readFile(outputPath));
    return {
      buffer: pcmToMp3(pcm, { sampleRate: 24000, channels: 1 }),
      contentType: 'audio/mpeg',
      extension: 'mp3',
    };
  } finally {
    await unlink(outputPath).catch(() => {});
  }
};

const seedTour = async (tour) => {
  const { data: existing, error: lookupError } = await supabase
    .from('narratives').select('*')
    .eq('curated_slug', tour.slug).eq('content_version', tour.version).eq('locale', tour.locale)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const narrativeValues = {
    title: tour.title,
    user_prompt: `curated:${tour.slug}:v${tour.version}:${tour.locale}`,
    context: {
      locale: tour.locale,
      curated: true,
      observationMinutes: tour.stops.reduce((total, item) => total + item.observationMinutes, 0),
    },
    curated_slug: tour.slug,
    content_version: tour.version,
    locale: tour.locale,
    walking_geometry: tour.walkingRoute.geometry,
    walking_distance_meters: tour.walkingRoute.distanceMeters,
    walking_duration_seconds: tour.walkingRoute.durationSeconds,
  };

  const write = existing
    ? supabase.from('narratives').update(narrativeValues).eq('id', existing.id)
    : supabase.from('narratives').insert(narrativeValues);
  const { data: narrative, error: narrativeError } = await write.select().single();
  if (narrativeError) throw new Error(narrativeError.message);

  const { data: existingChapters, error: chapterLookupError } = await supabase
    .from('narrative_chapters').select('*').eq('narrative_id', narrative.id);
  if (chapterLookupError) throw new Error(chapterLookupError.message);
  const byIndex = new Map((existingChapters ?? []).map((item) => [item.chapter_index, item]));

  for (let index = 0; index < tour.stops.length; index += 1) {
    const item = tour.stops[index];
    const prior = byIndex.get(index);
    const reusableAudio = !localAudio || prior?.audio_url?.endsWith('.mp3');
    let audioUrl = prior?.script === item.script && reusableAudio ? prior.audio_url : null;
    if (!audioUrl && !skipAudio) {
      const audio = localAudio
        ? await synthesizeLocalSpeech(item.script, tour.locale)
        : { ...await synthesizeSpeech(item.script, tour.locale), extension: 'mp3' };
      const { buffer, contentType, extension } = audio;
      const fileName = `curated/${tour.slug}/v${tour.version}/${tour.locale}/${String(index + 1).padStart(2, '0')}.${extension}`;
      audioUrl = await uploadAudio(supabase, fileName, buffer, contentType);
    }

    const { error } = await supabase.from('narrative_chapters').upsert({
      narrative_id: narrative.id,
      chapter_index: index,
      title: item.title,
      lat: item.lat,
      lng: item.lng,
      script: item.script,
      audio_url: audioUrl,
      landmark_id: null,
      image_url: item.imageUrl ?? null,
    }, { onConflict: 'narrative_id,chapter_index' });
    if (error) throw new Error(error.message);
  }

  const { error: cleanupError } = await supabase.from('narrative_chapters')
    .delete().eq('narrative_id', narrative.id).gte('chapter_index', tour.stops.length);
  if (cleanupError) throw new Error(cleanupError.message);
  const audioStatus = skipAudio ? 'scripts only' : localAudio ? 'local audio ready' : 'audio ready';
  console.log(`Seeded ${tour.locale}: ${tour.title} (${tour.stops.length} stops, ${audioStatus})`);
};

for (const tour of CURATED_TOURS) await seedTour(tour);
