/** Cache lookup by exact prompt text — powers instant repeat-taps on curated starters. */
export const findNarrativeByPrompt = async (supabase, userPrompt) => {
  const { data: narrative, error: narrativeError } = await supabase
    .from('narratives')
    .select('*')
    .eq('user_prompt', userPrompt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (narrativeError) {
    throw new Error(narrativeError.message);
  }

  if (!narrative) {
    return null;
  }

  const { data: chapters, error: chaptersError } = await supabase
    .from('narrative_chapters')
    .select('*')
    .eq('narrative_id', narrative.id)
    .order('chapter_index');

  if (chaptersError) {
    throw new Error(chaptersError.message);
  }

  if (!chapters?.length) {
    return null;
  }

  return {
    id: narrative.id,
    title: narrative.title,
    chapters: chapters.map((row) => ({
      id: row.id,
      chapterIndex: row.chapter_index,
      title: row.title,
      lat: row.lat,
      lng: row.lng,
      audioUrl: row.audio_url,
      imageUrl: row.image_url,
      landmarkId: row.landmark_id,
    })),
  };
};

export const fetchNarrativeById = async (supabase, id) => {
  const { data: narrative, error: narrativeError } = await supabase
    .from('narratives')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (narrativeError) {
    throw new Error(narrativeError.message);
  }

  if (!narrative) {
    return null;
  }

  const { data: chapters, error: chaptersError } = await supabase
    .from('narrative_chapters')
    .select('*')
    .eq('narrative_id', id)
    .order('chapter_index');

  if (chaptersError) {
    throw new Error(chaptersError.message);
  }

  return {
    id: narrative.id,
    title: narrative.title,
    userPrompt: narrative.user_prompt,
    createdAt: narrative.created_at,
    chapters: (chapters ?? []).map((row) => ({
      id: row.id,
      chapterIndex: row.chapter_index,
      title: row.title,
      lat: row.lat,
      lng: row.lng,
      audioUrl: row.audio_url,
      imageUrl: row.image_url,
      landmarkId: row.landmark_id,
    })),
  };
};

export const fetchAllNarratives = async (supabase) => {
  const { data: narratives, error } = await supabase
    .from('narratives')
    .select('id, title, user_prompt, created_at, narrative_chapters(id)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (narratives ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    userPrompt: row.user_prompt,
    createdAt: row.created_at,
    chapterCount: row.narrative_chapters?.length ?? 0,
  }));
};
