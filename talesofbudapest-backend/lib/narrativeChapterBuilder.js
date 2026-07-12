import { synthesizeSpeech, uploadAudio } from './ttsClient.js';
import { DEFAULT_LOCALE } from './locale.js';
import { resolveLandmarkScript, resolveLandmarkAudio } from './landmarkAudioResolver.js';
import { generateCustomStopScript } from './landmarkScriptWriter.js';
import { planNarrativeRoute } from './narrativeRoutePlanner.js';

const LOCATION_SELECT_FOR_AUDIO =
  'id, name, story_prompt, source_material, history_depth, audio_url';

const resolveTourLocale = (context) =>
  context?.locale === 'hu' || context?.locale === 'en' ? context.locale : DEFAULT_LOCALE;

/**
 * Fills in grounded scripts for landmark chapters (custom stops keep the
 * planner's script — there is no source material for them). Preview only — no TTS.
 */
export const finalizeChapterScripts = async ({
  supabase,
  chapters,
  landmarksById,
  tourTitle,
  userPrompt,
  context,
}) => {
  const locale = resolveTourLocale(context);
  const styleId = context?.styleId;
  const topicIds = context?.topicIds ?? [];

  return Promise.all(
    chapters.map(async (chapter) => {
      if (!chapter.landmarkId) {
        if (!chapter.script?.trim()) {
          return chapter;
        }

        try {
          const script = await generateCustomStopScript({
            title: chapter.title,
            scriptSeed: chapter.script,
            tourTitle,
            userPrompt,
            locale,
          });
          return { ...chapter, script };
        } catch {
          return chapter;
        }
      }

      const landmark = landmarksById.get(String(chapter.landmarkId));
      if (!landmark) {
        return { ...chapter, script: chapter.script ?? chapter.hook ?? '' };
      }

      try {
        const result = await resolveLandmarkScript({
          supabase,
          location: landmark,
          locale,
          styleId,
          topicIds,
          plannerHook: chapter.hook,
        });
        return { ...chapter, script: result.script };
      } catch {
        return { ...chapter, script: chapter.script ?? chapter.hook ?? '' };
      }
    }),
  );
};

/** Synthesizes audio for planned chapters and persists the narrative. Expensive — call once per confirmed tour. */
export const synthesizeNarrative = async ({ supabase, title, userPrompt, context, chapters }) => {
  const locale = resolveTourLocale(context);
  const styleId = context?.styleId;
  const topicIds = context?.topicIds ?? [];

  const { data: narrativeRow, error: narrativeError } = await supabase
    .from('narratives')
    .insert({
      title,
      user_prompt: userPrompt,
      context: context ?? {},
    })
    .select()
    .single();

  if (narrativeError || !narrativeRow) {
    throw new Error(narrativeError?.message ?? 'Failed to create narrative');
  }

  const narrativeId = narrativeRow.id;
  const savedChapters = [];

  for (const chapter of chapters) {
    let audioUrl = chapter.audioUrl ?? null;
    let script = chapter.script?.trim() ?? '';

    if (!audioUrl && chapter.landmarkId) {
      const { data: location, error: locationError } = await supabase
        .from('locations')
        .select(LOCATION_SELECT_FOR_AUDIO)
        .eq('id', chapter.landmarkId)
        .maybeSingle();

      if (locationError) {
        throw new Error(locationError.message);
      }

      if (location) {
        const result = await resolveLandmarkAudio({
          supabase,
          location,
          locale,
          styleId,
          topicIds,
          plannerHook: chapter.hook,
          existingScript: script || undefined,
        });
        audioUrl = result.audioUrl;
        script = result.script ?? script;
      }
    }

    if (!audioUrl) {
      if (!script) {
        throw new Error(`Chapter ${chapter.chapterIndex} is missing a script`);
      }

      const { buffer, contentType } = await synthesizeSpeech(script, locale);
      const fileName = `${narrativeId}-${chapter.chapterIndex}.mp3`;
      audioUrl = await uploadAudio(supabase, fileName, buffer, contentType);
    }

    const { data: chapterRow, error: chapterError } = await supabase
      .from('narrative_chapters')
      .insert({
        narrative_id: narrativeId,
        chapter_index: chapter.chapterIndex,
        title: chapter.title,
        lat: chapter.lat,
        lng: chapter.lng,
        script: chapter.script,
        audio_url: audioUrl,
        landmark_id: chapter.landmarkId,
        image_url: chapter.imageUrl,
      })
      .select()
      .single();

    if (chapterError || !chapterRow) {
      throw new Error(chapterError?.message ?? 'Failed to save chapter');
    }

    savedChapters.push(chapterRow);
  }

  return {
    id: narrativeId,
    title,
    chapters: savedChapters
      .sort((a, b) => a.chapter_index - b.chapter_index)
      .map((row) => ({
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

/**
 * Plan + write scripts + synthesize in one call — used when there's no preview
 * step. `fullLandmarks` should carry untruncated story_prompt texts for script
 * grounding; falls back to the (possibly excerpted) planning pool.
 */
export const generateNarrative = async ({ supabase, userPrompt, context, landmarks, fullLandmarks }) => {
  const routePlan = await planNarrativeRoute({ userPrompt, context, landmarks });
  const landmarksById = new Map((fullLandmarks ?? landmarks).map((row) => [String(row.id), row]));
  const chapters = await finalizeChapterScripts({
    chapters: routePlan.chapters,
    landmarksById,
    tourTitle: routePlan.title,
    userPrompt,
    context,
    supabase,
  });

  return synthesizeNarrative({
    supabase,
    title: routePlan.title,
    userPrompt,
    context,
    chapters,
  });
};
