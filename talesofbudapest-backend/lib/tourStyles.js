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
  underground: 'a Budavári Labirintus, a fürdőkultúra és a hidegháborús bunkerek',
  shadows: 'a második világháború és a kommunizmus nyomai, a zsidó negyed és az 1956-os forradalom',
  duel: 'a középkori Buda és a 19. századi Pest építészeti rivalizálása',
  architecture: 'a operaház, a bazilika és az országház korabeli pompája',
  liquid: 'a VII. kerület romkocsmái, a tokaji bor és az Unicum története',
  coffeehouse: 'Budapest nagy kávéházi kultúrája és az ott gyülekező írók',
};

export const TOUR_TOPICS = TOUR_TOPICS_EN;

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
