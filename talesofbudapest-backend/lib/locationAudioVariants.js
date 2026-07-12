export const fetchAudioVariant = async (supabase, locationId, locale, styleId) => {
  const { data, error } = await supabase
    .from('location_audio_variants')
    .select('audio_url, audio_script')
    .eq('location_id', locationId)
    .eq('locale', locale)
    .eq('style_id', styleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const upsertAudioVariant = async (
  supabase,
  locationId,
  locale,
  styleId,
  audioUrl,
  audioScript,
) => {
  const { error } = await supabase.from('location_audio_variants').upsert(
    {
      location_id: locationId,
      locale,
      style_id: styleId,
      audio_url: audioUrl,
      audio_script: audioScript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'location_id,locale,style_id' },
  );

  if (error) {
    throw new Error(`Failed to update audio variant: ${error.message}`);
  }
};

export const upsertTranslationAudio = async (
  supabase,
  locationId,
  locale,
  translation,
  audioUrl,
  audioScript,
) => {
  const { error } = await supabase.from('location_translations').upsert(
    {
      location_id: locationId,
      locale,
      name: translation.name,
      story_prompt: translation.story_prompt ?? '',
      historical_narrative: translation.historical_narrative ?? null,
      audio_url: audioUrl,
      audio_script: audioScript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'location_id,locale' },
  );

  if (error) {
    throw new Error(`Failed to update translation audio: ${error.message}`);
  }
};
