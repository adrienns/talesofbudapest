export const TOUR_STYLE_IDS = ['easy', 'storyteller', 'deep-dive'];

export const DEFAULT_TOUR_STYLE_ID = 'storyteller';

export const TOUR_STYLES = {
  easy: {
    id: 'easy',
    label: 'Easy & Visual',
    promptPhrase: 'light, visual',
    promptPhraseHu: 'könnyed, vizuális',
    lengthModifier: 0.75,
  },
  storyteller: {
    id: 'storyteller',
    label: 'The Storyteller',
    promptPhrase: 'vivid, story-driven',
    promptPhraseHu: 'élénk, történetmesélő',
    lengthModifier: 1,
  },
  'deep-dive': {
    id: 'deep-dive',
    label: 'Historian Deep Dive',
    promptPhrase: 'richly detailed, historian-grade',
    promptPhraseHu: 'részletes, történészi mélységű',
    lengthModifier: 1.25,
  },
};

const TOUR_TOPICS_EN = {
  'local-life': 'everyday Budapest, neighborhoods, and the lives behind the facades',
  'power-history': 'kings, politics, revolutions, and the forces that shaped Budapest',
  'jewish-budapest': 'Jewish community life, heritage, memory, and renewal in Budapest',
  'arts-culture': 'artists, writers, music, and Budapest cultural life',
  'food-nightlife': 'food, coffeehouses, wine, and nightlife with real local history',
  'danube-engineering': 'the Danube, bridges, engineering, and the city built around the river',
  'legends-mysteries': 'legends, scandals, mysteries, and surprising hidden stories',
  underground: 'the labyrinth beneath Buda Castle, thermal bath culture and Cold War bunkers',
  shadows:
    'the scars of WWII and communism, the Jewish Quarter and the 1956 revolution',
  duel: 'the architectural rivalry between royal medieval Buda and booming 19th-century Pest',
  architecture:
    'gilded age splendor from the Opera House and Basilica to the Parliament',
  liquid: "District VII's ruin bars born from abandoned WWII spaces, with Tokaj wine and Unicum lore",
  coffeehouse: "Budapest's grand coffeehouse culture and the writers who gathered there",
};

const TOUR_TOPICS_HU = {
  'local-life': 'a mindennapi Budapest, a városrészek és a homlokzatok mögötti életek',
  'power-history': 'királyok, politika, forradalmak és Budapestet formáló erők',
  'jewish-budapest': 'a budapesti zsidó közösség élete, öröksége, emlékezete és megújulása',
  'arts-culture': 'művészek, írók, zene és Budapest kulturális élete',
  'food-nightlife': 'étel, kávéházak, bor, éjszakai élet és hiteles helytörténet',
  'danube-engineering': 'a Duna, a hidak, a mérnöki teljesítmény és a folyó köré épült város',
  'legends-mysteries': 'legendák, botrányok, rejtélyek és meglepő titkos történetek',
  underground: 'a Budavári Labirintus, a fürdőkultúra és a hidegháborús bunkerek',
  shadows: 'a második világháború és a kommunizmus nyomai, a zsidó negyed és az 1956-os forradalom',
  duel: 'a középkori Buda és a 19. századi Pest építészeti rivalizálása',
  architecture: 'a operaház, a bazilika és az országház korabeli pompája',
  liquid: 'a VII. kerület romkocsmái, a tokaji bor és az Unicum története',
  coffeehouse: 'Budapest nagy kávéházi kultúrája és az ott gyülekező írók',
};

export const TOUR_TOPICS = TOUR_TOPICS_EN;

const formatMinutesForPrompt = (minutes) => {
  if (minutes % 30 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minutes`;
};

const joinPhrases = (phrases) =>
  phrases.length <= 1 ? (phrases[0] ?? '') : `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;

/**
 * Converts the browser's structured questionnaire values into the internal
 * route-planning request. Keep this on the server: wording is part of the
 * generation strategy, not a client-side contract.
 */
export const buildNarrativePrompt = ({ styleId, topicIds = [], timeBudgetMinutes = 90, intent = '' }, locale = 'en') => {
  const style = resolveTourStyle(styleId);
  const topics = locale === 'hu' ? TOUR_TOPICS_HU : TOUR_TOPICS_EN;
  const themes = joinPhrases(topicIds.map((id) => topics[id]).filter(Boolean));
  const sanitizedIntent = typeof intent === 'string' ? intent.trim() : '';
  const request = sanitizedIntent ? ` The visitor also requested: ${sanitizedIntent}.` : '';

  return `Create a ${locale === 'hu' ? style.promptPhraseHu : style.promptPhrase} Budapest audio walking tour exploring ${themes || 'the visitor’s stated interests'}, sized for about ${formatMinutesForPrompt(timeBudgetMinutes)} of walking and listening.${request}`;
};

export const CURATED_TOUR_REQUESTS = {
  'castle-royal': {
    styleId: 'storyteller', topicIds: ['duel'],
    prompt: 'Create a vivid, story-driven audio walking tour of the Buda Castle District — Buda Castle, Matthias Church, and Fisherman’s Bastion — full of royal history, sieges, and the legends that still haunt the hill. [v2]',
  },
  'jewish-quarter-ruin-bars': {
    styleId: 'storyteller', topicIds: ['shadows', 'liquid'],
    prompt: "Create a vivid, story-driven audio walking tour of District VII's Jewish Quarter — the Dohány Street Synagogue, Kazinczy Street, and the Gozsdu Passage — tracing its history and how its ruined WWII-era spaces became the world's first ruin bars. [v2]",
  },
  'hidden-pest': {
    styleId: 'deep-dive', topicIds: ['coffeehouse'],
    prompt: 'Create a richly detailed, historian-grade audio walking tour of downtown Pest that skips the famous landmarks in favor of lesser-known residential buildings, hidden courtyards, and golden-age coffeehouses with real, specific local history. [v2]',
  },
  'danube-golden-hour': {
    styleId: 'storyteller', topicIds: ['duel'],
    prompt: 'Create a vivid, story-driven evening audio walking tour along the Danube at golden hour, taking in the Chain Bridge and the view of Buda Castle across the water, with romantic and reflective storytelling. [v2]',
  },
};

export const curatedNarrativeRequest = (slug) => CURATED_TOUR_REQUESTS[slug] ?? null;

export const getStylePromptPhrase = (styleId, locale = 'en') => {
  const style = resolveTourStyle(styleId);
  return locale === 'hu' ? style.promptPhraseHu : style.promptPhrase;
};

export const isTourStyleId = (value) => TOUR_STYLE_IDS.includes(value);

export const resolveTourStyle = (styleId) =>
  TOUR_STYLES[isTourStyleId(styleId) ? styleId : DEFAULT_TOUR_STYLE_ID];

export const buildTopicLens = (topicIds = [], locale = 'en') => {
  const topics = locale === 'hu' ? TOUR_TOPICS_HU : TOUR_TOPICS_EN;
  const phrases = topicIds.map((id) => topics[id]).filter(Boolean);

  if (phrases.length === 0) {
    return '';
  }

  if (locale === 'hu') {
    return `Ha a tények alátámasztják, finoman hangsúlyozd ezeket a témákat: ${phrases.join('; ')}. Ne találj ki összefüggéseket.`;
  }

  return `When the facts support it, gently emphasize themes related to: ${phrases.join('; ')}. Do not invent connections.`;
};
