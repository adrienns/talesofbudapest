import { BUDAPEST_BOUNDS } from './suggestions.js';

export const extractJsonPayload = (raw) => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? trimmed).trim();
};

export const validateCoordinates = (lat, lng) =>
  lat >= BUDAPEST_BOUNDS.minLat &&
  lat <= BUDAPEST_BOUNDS.maxLat &&
  lng >= BUDAPEST_BOUNDS.minLng &&
  lng <= BUDAPEST_BOUNDS.maxLng;

export const buildLandmarkPool = (landmarks) =>
  landmarks.map((landmark) => ({
    id: String(landmark.id),
    name: landmark.name,
    lat: landmark.latitude ?? landmark.lat,
    lng: landmark.longitude ?? landmark.lng,
    story_prompt: landmark.story_prompt,
  }));

export const withRetry = async (attempt, attempts = 2) => {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const approvedPrimaryMedia = (landmark) => (landmark.location_media ?? [])
  .filter((item) => item.review_status === 'approved' && item.commercial_use_allowed)
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null;

const mediaAttribution = (media) => media ? {
  author: media.author ?? 'Unknown author',
  license: media.license ?? 'Licence not specified',
  licenseUrl: media.license_url ?? null,
  sourceUrl: media.source_url ?? '',
} : null;

export const parseRoutePlan = (raw, landmarks, expectedStopCount = null) => {
  let parsed;
  try {
    parsed = JSON.parse(extractJsonPayload(raw));
  } catch {
    throw new Error('LLM returned malformed JSON for the route plan');
  }

  if (!parsed?.title || !Array.isArray(parsed.chapters) || parsed.chapters.length < 3) {
    throw new Error('LLM returned an invalid route structure');
  }

  const landmarkMap = new Map(landmarks.map((landmark) => [String(landmark.id), landmark]));
  let landmarkChapterCount = 0;
  let customChapterCount = 0;

  if (expectedStopCount !== null && parsed.chapters.length !== expectedStopCount) {
    throw new Error(`Route must include exactly ${expectedStopCount} stops`);
  }

  const chapters = parsed.chapters.map((chapter, index) => {
    if (chapter.landmark_id) {
      landmarkChapterCount += 1;
      const landmark = landmarkMap.get(String(chapter.landmark_id));

      if (!landmark) {
        throw new Error(`Unknown landmark_id: ${chapter.landmark_id}`);
      }

      const primaryMedia = approvedPrimaryMedia(landmark);
      return {
        chapterIndex: index,
        title: chapter.title || `Chapter ${index + 1}: ${landmark.name}`,
        lat: landmark.latitude ?? landmark.lat,
        lng: landmark.longitude ?? landmark.lng,
        script: chapter.script ?? null,
        hook: chapter.hook ?? chapter.script ?? '',
        locationId: String(landmark.id),
        landmarkId: String(landmark.id),
        imageUrl: primaryMedia?.url ?? null,
        imageAttribution: mediaAttribution(primaryMedia),
      };
    }

    if (chapter.custom_stop) {
      customChapterCount += 1;
      const { lat, lng, title, script } = chapter.custom_stop;

      if (!validateCoordinates(lat, lng)) {
        throw new Error('Custom stop coordinates are outside Budapest bounds');
      }

      if (!script) {
        throw new Error('Custom stop must include a script');
      }

      return {
        chapterIndex: index,
        title: title || `Chapter ${index + 1}`,
        lat,
        lng,
        script,
        locationId: null,
        landmarkId: null,
        imageUrl: null,
      };
    }

    throw new Error('Each chapter must have landmark_id or custom_stop');
  });

  if (landmarkChapterCount < 2) {
    throw new Error('Route must include at least 2 landmark stops');
  }

  if (customChapterCount > 1) {
    throw new Error('Route may include at most 1 custom stop');
  }

  return {
    title: parsed.title,
    chapters,
  };
};

export const parseReplacementChapter = (raw, landmarks, replaceIndex) => {
  let parsed;
  try {
    parsed = JSON.parse(extractJsonPayload(raw));
  } catch {
    throw new Error('LLM returned malformed JSON for the replacement stop');
  }

  if (!parsed?.landmark_id) {
    throw new Error('Replacement stop must reference a landmark_id');
  }

  const landmarkMap = new Map(landmarks.map((landmark) => [String(landmark.id), landmark]));
  const landmark = landmarkMap.get(String(parsed.landmark_id));

  if (!landmark) {
    throw new Error(`Unknown landmark_id: ${parsed.landmark_id}`);
  }

  const primaryMedia = approvedPrimaryMedia(landmark);
  return {
    chapterIndex: replaceIndex,
    title: parsed.title || `Chapter ${replaceIndex + 1}: ${landmark.name}`,
    lat: landmark.latitude ?? landmark.lat,
    lng: landmark.longitude ?? landmark.lng,
    script: parsed.script ?? null,
    hook: parsed.hook ?? parsed.script ?? '',
    locationId: String(landmark.id),
    landmarkId: String(landmark.id),
    imageUrl: primaryMedia?.url ?? null,
    imageAttribution: mediaAttribution(primaryMedia),
  };
};
