const matchingAudio = (chapter, script, requireMp3, requiredUrlMarker = null) => {
  if (!chapter?.audio_url || chapter.script !== script) return null;
  if (requireMp3 && !chapter.audio_url.endsWith('.mp3')) return null;
  if (requiredUrlMarker && !chapter.audio_url.includes(requiredUrlMarker)) return null;
  return chapter.audio_url;
};

const approvedPrimaryMedia = (location) => (location.location_media ?? [])
  .filter((item) => item.review_status === 'approved' && item.commercial_use_allowed)
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null;

export const chooseCuratedChapterAudio = ({
  currentChapter,
  previousChapter,
  script,
  freshAudio = false,
  requireMp3 = false,
  currentVersionAudioMarker = null,
}) => {
  const currentAudio = matchingAudio(
    currentChapter,
    script,
    requireMp3,
    freshAudio ? currentVersionAudioMarker : null,
  );
  if (currentAudio) return { audioUrl: currentAudio, source: 'current' };

  if (!freshAudio) {
    const inheritedAudio = matchingAudio(previousChapter, script, requireMp3);
    if (inheritedAudio) return { audioUrl: inheritedAudio, source: 'previous' };
  }

  return { audioUrl: null, source: 'missing' };
};

export const materializeCuratedChapterAudio = async ({
  currentChapter,
  previousChapter,
  script,
  freshAudio = false,
  requireMp3 = false,
  currentVersionAudioMarker = null,
  generateAndUpload = null,
}) => {
  const reusable = chooseCuratedChapterAudio({
    currentChapter,
    previousChapter,
    script,
    freshAudio,
    requireMp3,
    currentVersionAudioMarker,
  });
  if (reusable.audioUrl || !generateAndUpload) return reusable;
  return { audioUrl: await generateAndUpload(), source: 'generated' };
};

const fetchChapters = async (supabase, narrativeId) => {
  if (!narrativeId) return [];
  const { data, error } = await supabase
    .from('narrative_chapters')
    .select('*')
    .eq('narrative_id', narrativeId);
  if (error) throw new Error(error.message);
  return data ?? [];
};

const fetchPreviousNarrative = async (supabase, tour) => {
  const { data, error } = await supabase
    .from('narratives')
    .select('id, content_version')
    .eq('curated_slug', tour.slug)
    .eq('locale', tour.locale)
    .lt('content_version', tour.version)
    .order('content_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

export const seedCuratedTour = async ({
  supabase,
  tour,
  skipAudio = false,
  freshAudio = false,
  requireMp3 = false,
  synthesizeAudio,
  uploadAudio,
}) => {
  // Resolve the entire manifest before creating/updating any narrative so a
  // typo cannot leave a partially seeded curated tour.
  const locationsBySlug = await resolveLocationSlugs(
    supabase,
    tour.stops.map((item) => item.locationSlug),
  );

  const { data: existing, error: lookupError } = await supabase
    .from('narratives')
    .select('*')
    .eq('curated_slug', tour.slug)
    .eq('content_version', tour.version)
    .eq('locale', tour.locale)
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

  const [existingChapters, previousNarrative] = await Promise.all([
    fetchChapters(supabase, narrative.id),
    fetchPreviousNarrative(supabase, tour),
  ]);
  const previousChapters = await fetchChapters(supabase, previousNarrative?.id);
  const currentByIndex = new Map(existingChapters.map((item) => [item.chapter_index, item]));
  const previousByIndex = new Map(previousChapters.map((item) => [item.chapter_index, item]));
  const counts = { current: 0, previous: 0, generated: 0, missing: 0 };

  for (let index = 0; index < tour.stops.length; index += 1) {
    const item = tour.stops[index];
    const canonicalLocation = locationsBySlug.get(item.locationSlug);
    const primaryMedia = approvedPrimaryMedia(canonicalLocation);
    const resolvedImageUrl = item.imageUrl
      ? (primaryMedia?.url === item.imageUrl ? item.imageUrl : null)
      : (primaryMedia?.url ?? null);
    const result = await materializeCuratedChapterAudio({
      currentChapter: currentByIndex.get(index),
      previousChapter: previousByIndex.get(index),
      script: item.script,
      freshAudio,
      requireMp3,
      currentVersionAudioMarker: `/v${tour.version}/${tour.locale}/`,
      generateAndUpload: skipAudio ? null : async () => {
        if (!synthesizeAudio || !uploadAudio) {
          throw new Error('Audio synthesis and upload functions are required');
        }
        const { buffer, contentType, extension = 'mp3' } = await synthesizeAudio(item.script, tour.locale);
        const fileName = `curated/${tour.slug}/v${tour.version}/${tour.locale}/${String(index + 1).padStart(2, '0')}.${extension}`;
        return uploadAudio(fileName, buffer, contentType);
      },
    });
    counts[result.source] += 1;

    const { error } = await supabase.from('narrative_chapters').upsert({
      narrative_id: narrative.id,
      chapter_index: index,
      title: item.title,
      lat: item.lat,
      lng: item.lng,
      script: item.script,
      audio_url: result.audioUrl,
      location_id: canonicalLocation.id,
      landmark_id: canonicalLocation.id,
      image_url: resolvedImageUrl,
      image_attribution: primaryMedia ? {
        author: primaryMedia.author ?? 'Unknown author',
        license: primaryMedia.license ?? 'Licence not specified',
        licenseUrl: primaryMedia.license_url ?? null,
        sourceUrl: primaryMedia.source_url ?? '',
      } : null,
    }, { onConflict: 'narrative_id,chapter_index' });
    if (error) throw new Error(error.message);
  }

  const { error: cleanupError } = await supabase
    .from('narrative_chapters')
    .delete()
    .eq('narrative_id', narrative.id)
    .gte('chapter_index', tour.stops.length);
  if (cleanupError) throw new Error(cleanupError.message);

  return { narrative, counts, previousVersion: previousNarrative?.content_version ?? null };
};
import { resolveLocationSlugs } from './canonicalLocationSeeder.js';
