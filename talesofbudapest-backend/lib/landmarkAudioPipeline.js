import { DEFAULT_LOCALE, isAppLocale } from './locale.js';
import { DEFAULT_TOUR_STYLE_ID, resolveTourStyle } from './tourStyles.js';
import { resolveLandmarkAudio } from './landmarkAudioResolver.js';

export { generateLandmarkScript, getAudioModel } from './landmarkScriptWriter.js';

export const generateLandmarkAudio = async ({
  supabase,
  location,
  locale = DEFAULT_LOCALE,
  translation,
  styleId = DEFAULT_TOUR_STYLE_ID,
  topicIds = [],
  force = false,
  ttsProvider = 'gemini',
}) => {
  if (!isAppLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const resolvedStyleId = resolveTourStyle(styleId).id;

  return resolveLandmarkAudio({
    supabase,
    location,
    locale,
    translation,
    styleId: resolvedStyleId,
    topicIds,
    force,
    ttsProvider,
    persistLegacy: resolvedStyleId === DEFAULT_TOUR_STYLE_ID,
  });
};
