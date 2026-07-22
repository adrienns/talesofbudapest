import { supabase } from './supabaseClient.js';
import { generateLandmarkAudio } from './lib/landmarkAudioPipeline.js';
import { DEFAULT_TOUR_STYLE_ID, isTourStyleId } from './lib/tourStyles.js';
import { DEFAULT_LOCALE } from './lib/locale.js';
import dotenv from 'dotenv';

dotenv.config();

const fetchTranslation = async (locationId, locale) => {
  const { data, error } = await supabase
    .from('location_translations')
    .select('*')
    .eq('location_id', locationId)
    .eq('locale', locale)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const buildAudioTourForLocation = async (location, { force, styleId, locale, ttsProvider }) => {
  console.log(`\n--- ${location.name} (id: ${location.id}) ---`);

  const translation = await fetchTranslation(location.id, locale);

  if (translation?.audio_url && !force) {
    console.log(`Already has translation audio: ${translation.audio_url}`);
  }

  console.log(`Generating tour (locale=${locale}, style=${styleId}${force ? ', force' : ''})...`);
  const result = await generateLandmarkAudio({
    supabase,
    location,
    locale,
    translation,
    styleId,
    force,
    ttsProvider,
  });

  if (result.cached) {
    console.log(`Using cached variant: ${result.audioUrl}`);
    return;
  }

  if (result.script) {
    console.log(`Script complete:\n"${result.script}"\n`);
  }

  console.log(`Success! audio_url saved: ${result.audioUrl}`);
};

const fetchLocationByName = async (name) => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('name', name)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Location not found: ${name}`);
  }

  return data;
};

const fetchLocationById = async (id) => {
  const { data, error } = await supabase.from('locations').select('*').eq('id', id).single();

  if (error || !data) {
    throw new Error(error?.message ?? `Location not found: ${id}`);
  }

  return data;
};

const fetchAllLocations = async () => {
  const { data, error } = await supabase.from('locations').select('*').order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const force = args.includes('--force');
  const nameIndex = args.indexOf('--name');
  const name = nameIndex !== -1 ? args[nameIndex + 1] : null;
  const idIndex = args.indexOf('--id');
  const id = idIndex !== -1 ? args[idIndex + 1] : null;
  const styleIndex = args.indexOf('--style');
  const styleRaw = styleIndex !== -1 ? args[styleIndex + 1] : DEFAULT_TOUR_STYLE_ID;
  const styleId = isTourStyleId(styleRaw) ? styleRaw : DEFAULT_TOUR_STYLE_ID;
  const localeIndex = args.indexOf('--locale');
  const locale = localeIndex !== -1 ? args[localeIndex + 1] : DEFAULT_LOCALE;
  const providerIndex = args.indexOf('--audio-provider');
  const ttsProvider = providerIndex !== -1 ? args[providerIndex + 1] : 'gemini';
  if (!['gemini', 'openrouter'].includes(ttsProvider)) {
    throw new Error('--audio-provider must be gemini or openrouter');
  }

  return { all, force, name, id, styleId, locale, ttsProvider };
};

const run = async () => {
  const { all, force, name, id, styleId, locale, ttsProvider } = parseArgs();

  if (ttsProvider === 'gemini' && !process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is required in .env for direct Gemini narration');
    process.exit(1);
  }
  if (ttsProvider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is required when --audio-provider openrouter is selected');
    process.exit(1);
  }

  const options = { force, styleId, locale, ttsProvider };

  try {
    if (all) {
      const locations = await fetchAllLocations();
      if (locations.length === 0) {
        console.error('No locations found. Run npm run seed first.');
        process.exit(1);
      }

      console.log(`Generating audio for ${locations.length} landmark(s)...`);
      for (const location of locations) {
        await buildAudioTourForLocation(location, options);
      }
      return;
    }

    if (id) {
      const location = await fetchLocationById(id);
      await buildAudioTourForLocation(location, options);
      return;
    }

    const targetName = name ?? 'Hungarian Parliament Building';
    const location = await fetchLocationByName(targetName);
    await buildAudioTourForLocation(location, options);
  } catch (error) {
    console.error('Audio pipeline failed:', error.message);
    process.exit(1);
  }
};

run();
