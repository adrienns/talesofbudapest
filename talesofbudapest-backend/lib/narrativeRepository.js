/** Cache lookup by exact prompt text — powers instant repeat-taps on curated starters. */
const mapWalkingRoute = (narrative) => narrative.walking_geometry?.length > 1 ? {
  geometry: narrative.walking_geometry,
  distanceMeters: narrative.walking_distance_meters ?? 0,
  durationSeconds: narrative.walking_duration_seconds ?? 0,
} : null;

const mapChapter = (row) => ({
  id: row.id,
  chapterIndex: row.chapter_index,
  title: row.title,
  lat: row.lat,
  lng: row.lng,
  script: row.script ?? null,
  audioUrl: row.audio_url,
  imageUrl: row.image_url,
  landmarkId: row.landmark_id,
});

export const findNarrativeByPrompt = async (supabase, userPrompt, ownerId) => {
  if (!ownerId) return null;

  const { data: narrative, error: narrativeError } = await supabase
    .from('narratives')
    .select('*')
    .eq('user_prompt', userPrompt)
    .eq('owner_id', ownerId)
    .is('curated_slug', null)
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
    walkingRoute: mapWalkingRoute(narrative),
    chapters: chapters.map(mapChapter),
  };
};

export const fetchNarrativeById = async (supabase, id, requestedLocale = null, ownerId = null) => {
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

  const isCurated = Boolean(narrative.curated_slug);
  if (!isCurated && (!ownerId || narrative.owner_id !== ownerId)) {
    return null;
  }

  const narrativeLocale = narrative.locale ?? narrative.context?.locale ?? null;
  if (requestedLocale && narrativeLocale && narrativeLocale !== requestedLocale) {
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
    curatedSlug: narrative.curated_slug ?? null,
    userPrompt: narrative.user_prompt,
    createdAt: narrative.created_at,
    locale: narrativeLocale,
    walkingRoute: mapWalkingRoute(narrative),
    chapters: (chapters ?? []).map(mapChapter),
  };
};

export const findNarrativeByIdempotencyKey = async (supabase, ownerId, idempotencyKey) => {
  if (!ownerId || !idempotencyKey) return null;

  const { data, error } = await supabase
    .from('narratives')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('idempotency_key', idempotencyKey)
    .is('curated_slug', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? fetchNarrativeById(supabase, data.id, null, ownerId) : null;
};

export const fetchCuratedNarrative = async (supabase, { slug, version, locale }) => {
  const { data: narrative, error } = await supabase
    .from('narratives')
    .select('*')
    .eq('curated_slug', slug)
    .eq('content_version', version)
    .eq('locale', locale)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!narrative) return null;
  return fetchNarrativeById(supabase, narrative.id, locale);
};

export const fetchAllNarratives = async (supabase, requestedLocale = null, ownerId = null) => {
  if (!ownerId) return [];

  const { data: narratives, error } = await supabase
    .from('narratives')
    .select('id, title, user_prompt, context, locale, created_at, narrative_chapters(id)')
    .eq('owner_id', ownerId)
    .is('curated_slug', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (narratives ?? [])
    .filter((row) => {
      if (!requestedLocale) return true;
      const rowLocale = row.locale ?? row.context?.locale ?? null;
      return !rowLocale || rowLocale === requestedLocale;
    })
    .map((row) => ({
    id: row.id,
    title: row.title,
    userPrompt: row.user_prompt,
    createdAt: row.created_at,
    chapterCount: row.narrative_chapters?.length ?? 0,
  }));
};
