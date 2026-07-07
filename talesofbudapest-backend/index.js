import { supabase } from './supabaseClient.js';
import { withLandmarkMedia } from './data/landmarkImages.js';

const landmarks = [
  {
    name: 'Hungarian Parliament Building',
    latitude: 47.5071,
    longitude: 19.0456,
    story_prompt:
      'Neo-Gothic architectural icon sitting right on the Danube. Completed in 1904. Needs a majestic, grand historical narrative tone.',
  },
  {
    name: 'Buda Castle',
    latitude: 47.4962,
    longitude: 19.0396,
    story_prompt:
      'Historic palace complex of the Hungarian kings. Heavy medieval history, subterranean caves, and legendary battles.',
  },
  {
    name: "Fisherman's Bastion",
    latitude: 47.5029,
    longitude: 19.0344,
    story_prompt:
      'Fairytale terraces overlooking the Danube. Neo-Romanesque spires built for panoramic views and romantic legends.',
  },
  {
    name: "St. Stephen's Basilica",
    latitude: 47.5008,
    longitude: 19.0536,
    story_prompt:
      'Neoclassical cathedral crowned with a dome that mirrors the Parliament. Home to Hungary\'s sacred relic, the Holy Right Hand.',
  },
];

const upsertLandmark = async (landmark) => {
  const { data: existing, error: fetchError } = await supabase
    .from('locations')
    .select('id')
    .eq('name', landmark.name)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    const { data, error } = await supabase
      .from('locations')
      .update({
        latitude: landmark.latitude,
        longitude: landmark.longitude,
        story_prompt: landmark.story_prompt,
        image_url: landmark.image_url,
        images: landmark.images,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase.from('locations').insert(landmark).select().single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const seedLandmarks = async () => {
  console.log('Seeding Budapest landmarks into Supabase...');

  try {
    const rows = [];

    for (const landmark of landmarks.map(withLandmarkMedia)) {
      const row = await upsertLandmark(landmark);
      rows.push(row);
    }

    console.log('Success! Landmarks upserted.');
    console.log('Rows:', rows);
  } catch (error) {
    console.error('Failed to seed data:', error.message);
  }
};

seedLandmarks();
