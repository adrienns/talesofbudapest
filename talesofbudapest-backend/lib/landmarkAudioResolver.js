import { synthesizeSpeech, uploadAudio } from './ttsClient.js';
import { audioTourFileSuffix, DEFAULT_LOCALE, isAppLocale } from './locale.js';
import { computeHistoryDepth, getWordTarget } from './historyDepth.js';
import { DEFAULT_TOUR_STYLE_ID, resolveTourStyle } from './tourStyles.js';
import { ensureHistorianNarrative } from './historianNarrative.js';
import { fetchLocationChronicle, fetchTranslation, fetchEntityNameAliases } from './locationChronicle.js';
import { buildNameGlossary } from './entityLocaleNames.js';
import {
  fetchAudioVariant,
  upsertAudioVariant,
  upsertTranslationAudio,
} from './locationAudioVariants.js';
import { generateLandmarkScript } from './landmarkScriptWriter.js';
import { rankSourceHighlights } from './sourceHighlights.js';

const countWords = (text) => text.trim().split(/\s+/).filter(Boolean).length;

const isStaleShortCache = (audioScript, historyDepth, styleId) => {
  if (!audioScript?.trim()) return true;
  const { min } = getWordTarget(historyDepth, styleId);
  return countWords(audioScript) < Math.floor(min * 0.6);
};

const hasCurrentAudio = (audioUrl, locale, styleId) =>
  typeof audioUrl === 'string' && audioUrl.includes(audioTourFileSuffix(locale, styleId));

export const resolveLocationSourceMaterial = (location, localeTranslation, huTranslation) => {
  const candidates = [
    location.source_material?.trim(),
    huTranslation?.story_prompt?.trim(),
    localeTranslation?.story_prompt?.trim(),
    location.story_prompt?.trim(),
  ].filter(Boolean);

  if (!candidates.length) return '';
  return [...candidates].sort((a, b) => b.length - a.length)[0];
};

const loadNameGlossary = async (supabase, chronicle, locale) => {
  const entityIds = (chronicle?.people ?? []).map((person) => person.id).filter(Boolean);
  if (!entityIds.length) return [];

  const aliasMap = await fetchEntityNameAliases(supabase, entityIds);
  return buildNameGlossary({ chronicle, locale, aliasMap });
};

/** Script only — used at tour preview (no TTS). */
export const resolveLandmarkScript = async ({
  supabase,
  location,
  locale = DEFAULT_LOCALE,
  styleId = DEFAULT_TOUR_STYLE_ID,
  topicIds = [],
  plannerHook,
}) => {
  if (!isAppLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const resolvedStyleId = resolveTourStyle(styleId).id;

  const [huTranslation, localeTranslation, chronicle] = await Promise.all([
    fetchTranslation(supabase, location.id, 'hu'),
    fetchTranslation(supabase, location.id, locale),
    fetchLocationChronicle(supabase, location.id),
  ]);

  const sourceMaterial = resolveLocationSourceMaterial(
    location,
    localeTranslation,
    huTranslation,
  );
  const historyDepth = sourceMaterial.trim()
    ? computeHistoryDepth(sourceMaterial)
    : (location.history_depth ?? computeHistoryDepth(sourceMaterial));

  const historicalNarrative = await ensureHistorianNarrative({
    supabase,
    location,
    translation: huTranslation,
    locale: 'hu',
  });

  const displayName =
    localeTranslation?.name ??
    (locale === 'hu' ? huTranslation?.name : null) ??
    location.name;

  const highlights = rankSourceHighlights({
    sourceMaterial,
    historicalNarrative,
    chronicle,
    topicIds,
  });

  const nameGlossary = await loadNameGlossary(supabase, chronicle, locale);

  const script = await generateLandmarkScript({
    name: displayName,
    sourceMaterial,
    historicalNarrative,
    historyDepth,
    styleId: resolvedStyleId,
    topicIds,
    locale,
    highlights,
    nameGlossary,
    plannerHook,
  });

  return { script, historyDepth, locale, styleId: resolvedStyleId };
};

/** Script + TTS + variant cache — map pin and tour confirm. */
export const resolveLandmarkAudio = async ({
  supabase,
  location,
  locale = DEFAULT_LOCALE,
  translation,
  styleId = DEFAULT_TOUR_STYLE_ID,
  topicIds = [],
  plannerHook,
  force = false,
  existingScript,
  ttsProvider = 'gemini',
  persistLegacy = false,
}) => {
  if (!isAppLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const resolvedStyleId = resolveTourStyle(styleId).id;

  const [huTranslation, localeTranslation, cachedVariant, chronicle] = await Promise.all([
    fetchTranslation(supabase, location.id, 'hu'),
    translation ? Promise.resolve(translation) : fetchTranslation(supabase, location.id, locale),
    fetchAudioVariant(supabase, location.id, locale, resolvedStyleId),
    fetchLocationChronicle(supabase, location.id),
  ]);

  const sourceMaterial = resolveLocationSourceMaterial(
    location,
    localeTranslation,
    huTranslation,
  );
  const historyDepth = sourceMaterial.trim()
    ? computeHistoryDepth(sourceMaterial)
    : (location.history_depth ?? computeHistoryDepth(sourceMaterial));

  const historicalNarrative = await ensureHistorianNarrative({
    supabase,
    location,
    translation: huTranslation,
    locale: 'hu',
  });

  const displayName =
    localeTranslation?.name ??
    (locale === 'hu' ? huTranslation?.name : null) ??
    location.name;

  const resolvedTranslation = {
    name: displayName,
    story_prompt:
      localeTranslation?.story_prompt ??
      (locale === 'hu' ? huTranslation?.story_prompt : location.story_prompt) ??
      '',
    historical_narrative: historicalNarrative,
    audio_url: localeTranslation?.audio_url ?? null,
  };

  if (
    cachedVariant?.audio_url &&
    cachedVariant?.audio_script &&
    hasCurrentAudio(cachedVariant.audio_url, locale, resolvedStyleId) &&
    !isStaleShortCache(cachedVariant.audio_script, historyDepth, resolvedStyleId) &&
    !force &&
    !existingScript
  ) {
    return {
      audioUrl: cachedVariant.audio_url,
      cached: true,
      script: cachedVariant.audio_script,
      locale,
      styleId: resolvedStyleId,
      historyDepth,
    };
  }

  const highlights = rankSourceHighlights({
    sourceMaterial,
    historicalNarrative,
    chronicle,
    topicIds,
  });

  const nameGlossary = await loadNameGlossary(supabase, chronicle, locale);

  const script =
    existingScript?.trim() ||
    (await generateLandmarkScript({
      name: displayName,
      sourceMaterial,
      historicalNarrative,
      historyDepth,
      styleId: resolvedStyleId,
      topicIds,
      locale,
      highlights,
      nameGlossary,
      plannerHook,
    }));

  const { buffer, contentType } = await synthesizeSpeech(script, locale, { provider: ttsProvider });
  const fileName = `${location.id}${audioTourFileSuffix(locale, resolvedStyleId)}`;
  const publicUrl = await uploadAudio(supabase, fileName, buffer, contentType);

  const writes = [
    upsertAudioVariant(supabase, location.id, locale, resolvedStyleId, publicUrl, script),
  ];

  if (persistLegacy && resolvedStyleId === DEFAULT_TOUR_STYLE_ID) {
    writes.push(
      upsertTranslationAudio(
        supabase,
        location.id,
        locale,
        resolvedTranslation,
        publicUrl,
        script,
      ),
      supabase
        .from('locations')
        .update({ audio_url: publicUrl })
        .eq('id', location.id)
        .then(({ error }) => {
          if (error) {
            throw new Error(`Failed to update audio_url: ${error.message}`);
          }
        }),
    );
  }

  await Promise.all(writes);

  return {
    audioUrl: publicUrl,
    cached: false,
    script,
    locale,
    styleId: resolvedStyleId,
    historyDepth,
  };
};
