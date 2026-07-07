import { supabase } from './supabaseClient.js';
import { createChatCompletion, getOpenRouterApiKey } from './lib/openRouterClient.js';
import { synthesizeSpeech, uploadAudio } from './lib/ttsClient.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const STORAGE_BUCKET = 'audio-tours';

const SYSTEM_PROMPT =
  'You are an atmospheric AI audio tour guide. Tell dramatic stories under 45 seconds using vivid sensory details. Start directly with the narrative hook.';

const generateScript = async (location) => {
  const scriptCompletion = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Write a short script for someone standing right in front of this landmark:\nName: ${location.name}\nVibe: ${location.story_prompt}`,
      },
    ],
  });

  return scriptCompletion.choices[0]?.message?.content;
};

const buildAudioTourForLocation = async (location) => {
  console.log(`\n--- ${location.name} (id: ${location.id}) ---`);
  console.log('Generating tour script via OpenRouter...');

  const cleanScript = await generateScript(location);
  if (!cleanScript) {
    throw new Error('OpenRouter returned an empty script');
  }

  console.log(`Script complete:\n"${cleanScript}"\n`);
  console.log('Synthesizing speech via OpenRouter (Kokoro)...');

  const buffer = await synthesizeSpeech(cleanScript);
  const fileName = `${location.id}-tour.mp3`;
  const slug = location.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const outputFile = path.join(process.cwd(), `${slug || location.id}-tour.mp3`);

  fs.writeFileSync(outputFile, buffer);
  console.log(`Saved local copy to: ${outputFile}`);

  console.log(`Uploading to Supabase Storage bucket "${STORAGE_BUCKET}"...`);
  const publicUrl = await uploadAudio(supabase, fileName, buffer);

  const { error: updateError } = await supabase
    .from('locations')
    .update({ audio_url: publicUrl })
    .eq('id', location.id);

  if (updateError) {
    throw new Error(`Failed to update audio_url: ${updateError.message}`);
  }

  console.log(`Success! audio_url saved: ${publicUrl}`);
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
  const nameIndex = args.indexOf('--name');
  const name = nameIndex !== -1 ? args[nameIndex + 1] : null;

  return { all, name };
};

const run = async () => {
  const { all, name } = parseArgs();

  if (!getOpenRouterApiKey()) {
    console.error('OPENROUTER_API_KEY (or GROQ_API_KEY) is required in .env');
    process.exit(1);
  }

  try {
    if (all) {
      const locations = await fetchAllLocations();
      if (locations.length === 0) {
        console.error('No locations found. Run npm run seed first.');
        process.exit(1);
      }

      console.log(`Generating audio for ${locations.length} landmark(s)...`);
      for (const location of locations) {
        await buildAudioTourForLocation(location);
      }
      return;
    }

    const targetName = name ?? 'Hungarian Parliament Building';
    const location = await fetchLocationByName(targetName);
    await buildAudioTourForLocation(location);
  } catch (error) {
    console.error('Audio pipeline failed:', error.message);
    process.exit(1);
  }
};

run();
