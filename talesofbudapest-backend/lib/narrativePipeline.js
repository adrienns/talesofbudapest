import { createChatCompletion } from './openRouterClient.js';
import { synthesizeSpeech, uploadAudio } from './ttsClient.js';
import { BUDAPEST_BOUNDS } from './suggestions.js';

const ROUTE_SYSTEM_PROMPT = `You are a master historian and audio tour guide in Budapest.
Plan a cohesive 3-4 stop walking narrative based on the user's mood.
Return ONLY valid JSON matching this schema:
{
  "title": "Evocative route title",
  "chapters": [
    {
      "landmark_id": "id from available landmarks",
      "title": "Chapter 1: ...",
      "script": "45-second dramatic narration script"
    },
    {
      "custom_stop": {
        "lat": 47.49,
        "lng": 19.04,
        "title": "Chapter 3: ...",
        "script": "45-second script"
      }
    }
  ]
}
Rules:
- Include exactly 3 or 4 chapters.
- At least 2 chapters MUST use landmark_id from the provided landmark pool.
- At most 1 chapter may use custom_stop with coordinates inside Budapest.
- Each script must be under 45 seconds when spoken (~80 words max).
- Scripts start with a narrative hook, no meta commentary.
- Chapters should form a logical walking order.`;

const validateCoordinates = (lat, lng) =>
  lat >= BUDAPEST_BOUNDS.minLat &&
  lat <= BUDAPEST_BOUNDS.maxLat &&
  lng >= BUDAPEST_BOUNDS.minLng &&
  lng <= BUDAPEST_BOUNDS.maxLng;

const extractJsonPayload = (raw) => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? trimmed).trim();
};

const parseRoutePlan = (raw, landmarks) => {
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

  const chapters = parsed.chapters.slice(0, 4).map((chapter, index) => {
    if (chapter.landmark_id) {
      landmarkChapterCount += 1;
      const landmark = landmarkMap.get(String(chapter.landmark_id));

      if (!landmark) {
        throw new Error(`Unknown landmark_id: ${chapter.landmark_id}`);
      }

      return {
        chapterIndex: index,
        title: chapter.title || `Chapter ${index + 1}: ${landmark.name}`,
        lat: landmark.latitude ?? landmark.lat,
        lng: landmark.longitude ?? landmark.lng,
        script: chapter.script,
        landmarkId: String(landmark.id),
        imageUrl: landmark.image_url ?? null,
      };
    }

    if (chapter.custom_stop) {
      customChapterCount += 1;
      const { lat, lng, title, script } = chapter.custom_stop;

      if (!validateCoordinates(lat, lng)) {
        throw new Error('Custom stop coordinates are outside Budapest bounds');
      }

      return {
        chapterIndex: index,
        title: title || `Chapter ${index + 1}`,
        lat,
        lng,
        script,
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

export const planNarrativeRoute = async ({ userPrompt, context, landmarks }) => {
  const landmarkPool = landmarks.map((landmark) => ({
    id: String(landmark.id),
    name: landmark.name,
    lat: landmark.latitude ?? landmark.lat,
    lng: landmark.longitude ?? landmark.lng,
    story_prompt: landmark.story_prompt,
  }));

  const completion = await createChatCompletion({
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.4,
    messages: [
      { role: 'system', content: ROUTE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          user_prompt: userPrompt,
          context,
          available_landmarks: landmarkPool,
          budapest_bounds: BUDAPEST_BOUNDS,
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty route plan');
  }

  return parseRoutePlan(content, landmarks);
};

export const generateNarrative = async ({ supabase, userPrompt, context, landmarks }) => {
  const routePlan = await planNarrativeRoute({ userPrompt, context, landmarks });

  const { data: narrativeRow, error: narrativeError } = await supabase
    .from('narratives')
    .insert({
      title: routePlan.title,
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

  for (const chapter of routePlan.chapters) {
    const buffer = await synthesizeSpeech(chapter.script);
    const fileName = `${narrativeId}-${chapter.chapterIndex}.mp3`;
    const audioUrl = await uploadAudio(supabase, fileName, buffer);

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
    title: routePlan.title,
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
