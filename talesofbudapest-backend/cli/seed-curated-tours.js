import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CURATED_TOURS, validateCuratedTours } from '../content/curated/index.js';
import { seedCuratedTour } from '../lib/curatedTourSeeder.js';
import { pcmToMp3, synthesizeSpeech, uploadAudio } from '../lib/ttsClient.js';
import { hasFlag, option } from './_shared/args.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: process.env.ENV_FILE
    ? resolve(process.cwd(), process.env.ENV_FILE)
    : join(__dirname, '..', '.env'),
});

const args = process.argv.slice(2);
const skipAudio = hasFlag(args, '--skip-audio');
const localAudio = hasFlag(args, '--local-audio');
const freshAudio = hasFlag(args, '--fresh-audio');
const selectedSlug = option(args, '--slug');
const selectedLocale = option(args, '--locale');
const explicitAudioProvider = option(args, '--audio-provider');
const audioProvider = explicitAudioProvider ?? 'gemini';
const supabaseUrl = process.env.STAGING_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const runFile = promisify(execFile);

if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL and server key are required');
if (skipAudio && localAudio) throw new Error('Use either --skip-audio or --local-audio, not both');
if (localAudio && explicitAudioProvider) throw new Error('--local-audio cannot be combined with --audio-provider');
if (selectedLocale && !['en', 'hu'].includes(selectedLocale)) throw new Error('--locale must be en or hu');
if (!['openrouter', 'gemini'].includes(audioProvider)) throw new Error('--audio-provider must be openrouter or gemini');
if (!skipAudio && !localAudio && audioProvider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required for OpenRouter audio');
}
if (!skipAudio && !localAudio && audioProvider === 'gemini' && !process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required for direct Gemini audio');
}

validateCuratedTours();
const supabase = createClient(supabaseUrl, serviceKey);
const selectedTours = CURATED_TOURS.filter((tour) =>
  (!selectedSlug || tour.slug === selectedSlug) && (!selectedLocale || tour.locale === selectedLocale));
if (!selectedTours.length) throw new Error('No curated tours matched --slug and --locale');

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

for (const tour of selectedTours) {
  const result = await seedCuratedTour({
    supabase,
    tour,
    skipAudio,
    freshAudio,
    requireMp3: localAudio,
    synthesizeAudio: localAudio
      ? synthesizeLocalSpeech
      : async (script, locale) => ({
        ...await synthesizeSpeech(script, locale, { provider: audioProvider }),
        extension: 'mp3',
      }),
    uploadAudio: (fileName, buffer, contentType) =>
      uploadAudio(supabase, fileName, buffer, contentType),
  });
  const { current, previous, generated, missing } = result.counts;
  console.log(
    `Seeded ${tour.locale}: ${tour.title} (${tour.stops.length} stops; `
    + `${generated} generated, ${current} resumed, ${previous} inherited, ${missing} without audio)`,
  );
}
