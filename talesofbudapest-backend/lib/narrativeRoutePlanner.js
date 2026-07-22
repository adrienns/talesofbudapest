import { createChatCompletion } from './openRouterClient.js';
import { BUDAPEST_BOUNDS } from './suggestions.js';
import {
  buildLandmarkPool,
  parseReplacementChapter,
  parseRoutePlan,
  withRetry,
} from './narrativeParsing.js';

export const buildRouteSystemPrompt = (stopCount, locale = 'en') => {
  if (locale === 'hu') {
    return `Tapasztalt budapesti történész és hangos idegenvezető vagy.
Kizárólag természetes, idiomatikus magyarul gondolkodj és írj; ne angol szöveg fordítását készítsd.
Tervezz összefüggő, ${stopCount} megállós gyalogos narratívát a látogató hangulata és kérése alapján.
CSAK az alábbi sémának megfelelő érvényes JSON-t adj vissza:
{
  "title": "Hangulatos magyar címet adj az útvonalnak",
  "chapters": [
    {
      "landmark_id": "azonosító a megadott helyszínek közül",
      "title": "1. fejezet: ...",
      "hook": "Egy mondat: melyik, az anyagban szereplő konkrét részlet teszi a helyszínt a túra részévé."
    },
    {
      "custom_stop": {
        "lat": 47.49,
        "lng": 19.04,
        "title": "3. fejezet: ...",
        "script": "2–3 perces, felolvasásra szánt magyar szöveg (kb. 300 szó)"
      }
    }
  ]
}
Szabályok:
- Pontosan ${stopCount} fejezet legyen.
- Legalább ${Math.max(2, stopCount - 1)} fejezetben a megadott helyszínlista landmark_id-ját használd.
- Csak olyan helyszínt válassz, amelynek megadott anyaga valóban alátámasztja a témát; a hook konkrét, valós részletet említsen, ne általánosságot.
- Legfeljebb 1 egyéni megálló lehet Budapest határain belüli koordinátákkal; a szövege kb. 2–3 perces, erős konkrét nyitással indul, és nem tartalmaz metakommentárt.
- A fejezetek logikus gyalogos sorrendet kövessenek.`;
  }

  return `You are a master historian and audio tour guide in Budapest.
Plan a cohesive 3-4 stop walking narrative based on the user's mood.
Return ONLY valid JSON matching this schema:
{
  "title": "Evocative route title",
  "chapters": [
    {
      "landmark_id": "id from available landmarks",
      "title": "Chapter 1: ...",
      "hook": "One sentence: which real detail from this landmark's material makes it belong in this tour."
    },
    {
      "custom_stop": {
        "lat": 47.49,
        "lng": 19.04,
        "title": "Chapter 3: ...",
        "script": "2-3 minute spoken script (~300 words)"
      }
    }
  ]
}
Rules:
- Include exactly ${stopCount} chapters.
- At least ${Math.max(2, stopCount - 1)} chapters MUST use landmark_id from the provided landmark pool.
- Pick landmarks whose provided material genuinely supports the requested theme — the hook must cite a real detail, not a generic connection.
- At most 1 chapter may use custom_stop with coordinates inside Budapest; its script must be about 2-3 minutes when spoken (~300 words), start with a narrative hook, no meta commentary.
- Chapters should form a logical walking order.`;
};

const stopCountForContext = (context = {}) => {
  const minutes = Number(context.timeBudgetMinutes) || 90;
  const style = context.styleId || 'storyteller';
  const base = minutes <= 45 ? 4 : minutes <= 60 ? 5 : minutes <= 90 ? 7 : minutes <= 120 ? 9 : 12;
  if (style === 'easy') return Math.min(14, base + 1);
  if (style === 'deep-dive') return Math.max(4, base - (minutes >= 90 ? 1 : 0));
  return base;
};

const replaceStopSystemPrompt = (locale = 'en') => {
  if (locale === 'hu') {
    return `Tapasztalt budapesti történész és hangos idegenvezető vagy.
Kizárólag természetes, idiomatikus magyarul gondolkodj és írj; ne angol szöveg fordítását készítsd.
A látogató a gyalogos túrája EGY megállóját szeretné másikra cserélni.
CSAK az alábbi sémának megfelelő érvényes JSON-t adj vissza:
{
  "landmark_id": "azonosító a megadott helyszínek közül",
  "title": "N. fejezet: ...",
  "hook": "Egy mondat: melyik, az anyagban szereplő konkrét részlet teszi a helyszínt a túra részévé."
}
Szabályok:
- A landmark_id a megadott helyszínlistából származzon, és ne ismételjen a túra más megállóival.
- A hook valós, a helyszín anyagában szereplő részletet említsen, ne általánosságot.
- A megálló maradjon tematikusan és földrajzilag is összhangban a túra többi részével.`;
  }

  return `You are a master historian and audio tour guide in Budapest.
The traveler wants ONE stop of their walking tour replaced with something different.
Return ONLY valid JSON matching this schema:
{
  "landmark_id": "id from available landmarks",
  "title": "Chapter N: ...",
  "hook": "One sentence: which real detail from this landmark's material makes it belong in this tour."
}
Rules:
- landmark_id MUST come from the provided landmark pool and must not repeat any landmark already used elsewhere in the tour.
- The hook must cite a real detail from the landmark's provided material, not a generic connection.
- Keep it thematically and geographically consistent with the rest of the tour.`;
};

/** Plans a route (one LLM call, no TTS, nothing persisted) — cheap and fast. */
export const planNarrativeRoute = async ({ userPrompt, context, landmarks }) =>
  withRetry(async () => {
    const stopCount = stopCountForContext(context);
    const completion = await createChatCompletion({
      operation: 'narrative.route_plan',
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0.4,
      messages: [
        { role: 'system', content: buildRouteSystemPrompt(stopCount, context?.locale) },
        {
          role: 'user',
          content: JSON.stringify({
            user_prompt: userPrompt,
            context,
            available_landmarks: buildLandmarkPool(landmarks),
            budapest_bounds: BUDAPEST_BOUNDS,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned an empty route plan');
    }

    return parseRoutePlan(content, landmarks, stopCount);
  });

/**
 * Plans a single replacement stop for an existing draft — used by the route
 * preview's "swap this stop" action. `landmarks` should already exclude any
 * landmark_id used elsewhere in the tour.
 */
export const planReplacementStop = async ({
  userPrompt,
  context,
  landmarks,
  existingChapters,
  replaceIndex,
}) =>
  withRetry(async () => {
    const completion = await createChatCompletion({
      operation: 'narrative.replace_stop',
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      temperature: 0.6,
      messages: [
        { role: 'system', content: replaceStopSystemPrompt(context?.locale) },
        {
          role: 'user',
          content: JSON.stringify({
            user_prompt: userPrompt,
            context,
            available_landmarks: buildLandmarkPool(landmarks),
            other_stops: existingChapters
              .filter((_, index) => index !== replaceIndex)
              .map((chapter) => ({ title: chapter.title, lat: chapter.lat, lng: chapter.lng })),
            stop_index: replaceIndex,
            budapest_bounds: BUDAPEST_BOUNDS,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned an empty replacement stop');
    }

    return parseReplacementChapter(content, landmarks, replaceIndex);
  });
