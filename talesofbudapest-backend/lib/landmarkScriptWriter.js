import { createChatCompletion, getOpenRouterModel } from './openRouterClient.js';
import { computeHistoryDepth, getWordTarget } from './historyDepth.js';
import {
  buildTopicLens,
  DEFAULT_TOUR_STYLE_ID,
  getStylePromptPhrase,
  resolveTourStyle,
} from './tourStyles.js';
import { formatHighlightsForPrompt } from './sourceHighlights.js';
import { formatNameGlossaryForPrompt } from './entityLocaleNames.js';
import { DEFAULT_LOCALE, isAppLocale } from './locale.js';

export const getAudioModel = () =>
  process.env.OPENROUTER_AUDIO_MODEL ?? getOpenRouterModel();

export const WORDS_PER_MINUTE = 150;
export const DEFAULT_STOP_MINUTES = 2;

export const SCRIPT_MAX_TOKENS = {
  thin: 400,
  standard: 600,
  rich: 900,
};

/** Reject scripts that drift into non-Latin writing systems. */
export const hasUnsupportedScript = (text) =>
  /[\u0370-\u03FF\u0400-\u04FF\u3040-\u9FFF\uAC00-\uD7AF]/.test(text);

/** Small models sometimes prepend "Here is the script:" or wrap the output in quotes. */
export const cleanScriptText = (text) =>
  text
    .replace(/^\s*(?:here(?:'s| is) (?:the |your )?script:?|script:)\s*/i, '')
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();

const SCRIPT_LOCALE = {
  en: {
    retryHint: 'Reply with clean English only, within the word target.',
    invalidError: 'OpenRouter returned an invalid English script',
    guideIntro: 'You are a Budapest audio tour guide narrating to someone standing in front of the landmark.',
    rules: [
      'Use only facts from the provided material. Do not invent dates, names, events, or legends.',
      'Open on the most specific highlight — a year, a name, or something visible — not "This building was constructed…".',
      'Use short, varied sentences suited to spoken audio. Name real people and dates when the source includes them.',
      'Prefer standard English names where they exist (Hungarian Parliament, Chain Bridge, St Stephen\'s Basilica).',
      'For personal names, use Western order (given name first) and the exact forms from the NAME GLOSSARY when provided.',
      'Do not pad thin sources with generic Budapest filler. No meta commentary about AI, apps, or tours.',
    ],
    factsLabel: 'FULL FACTS (only source of truth)',
    narrativeLabel: 'Historian narrative (distilled facts)',
    highlightsLabel: 'HIGHLIGHTS (lead with #1, weave in 2–3 more)',
    scriptRequest: (min, max) => `Write a spoken English tour script of ${min}–${max} words.`,
    tourLens: (hook) =>
      `Tour context: this stop fits the tour because ${hook}. Weave that connection only when supported by the facts.`,
  },
  hu: {
    retryHint: 'Válaszolj tiszta magyar nyelven, a szócél tartományon belül.',
    invalidError: 'Az OpenRouter érvénytelen magyar szöveget adott vissza',
    guideIntro: 'Budapesti hangos idegenvezető vagy, a látogató épp a látnivaló előtt áll.',
    rules: [
      'Csak a megadott anyagból indulj ki. Ne találj ki dátumokat, neveket, eseményeket vagy legendákat.',
      'Önálló, természetes magyar szöveget írj; ne angol mondatszerkezetek vagy fordulatok tükörfordítását.',
      'A legerősebb konkrét részlettel kezdj — évvel, névvel vagy látható elemmel.',
      'Rövid, változatos mondatok, felolvasásra szánt tempó.',
      'A magyar helynevek és közhasználatú történelmi elnevezések bevett magyar alakját használd.',
      'Ne töltsd ki vékony forrásokat általános budapesti töltelékszöveggel.',
      'Ne említs AI-t, alkalmazást vagy túrát.',
      'Személyneveknél a NÉVJEGYZÉK pontos alakját használd (családnév először).',
    ],
    factsLabel: 'TELJES TÉNYEK (egyetlen hiteles forrás)',
    landmarkLabel: 'Helyszín',
    narrativeLabel: 'Történészi narratíva (tények tömörítve)',
    highlightsLabel: 'KIEMELÉSEK (az 1-est vezeted, 2–3 további)',
    scriptRequest: (min, max) => `Írj felolvasásra szánt magyar hangos túra szöveget ${min}–${max} szóból.`,
    tourLens: (hook) =>
      `Túra kontextus: ez a megálló azért került ide, mert ${hook}. Csak akkor kösd a témához, ha a tények alátámasztják.`,
  },
};

const buildScriptSystemPrompt = (stylePhrase, topicLens, locale, plannerHook) => {
  const copy = SCRIPT_LOCALE[locale] ?? SCRIPT_LOCALE.en;
  const rules = copy.rules.map((rule) => `- ${rule}`).join('\n');
  const topicLine = topicLens ? `- ${topicLens}` : '';
  const tourLine = plannerHook ? `- ${copy.tourLens(plannerHook)}` : '';

  if (locale === 'hu') {
    return `${copy.guideIntro}
Írj ${stylePhrase} stílusban.

Szabályok:
${rules}
${topicLine}
${tourLine}`;
  }

  return `${copy.guideIntro}
Write in a ${stylePhrase} style.

Rules:
${rules}
${topicLine}
${tourLine}`;
};

const buildScriptUserPrompt = ({
  name,
  sourceMaterial,
  historicalNarrative,
  highlightsText,
  nameGlossaryText,
  wordTarget,
  locale,
}) => {
  const copy = SCRIPT_LOCALE[locale] ?? SCRIPT_LOCALE.en;
  const highlightsBlock = highlightsText
    ? `\n\n${copy.highlightsLabel}:\n${highlightsText}`
    : '';
  const glossaryBlock = nameGlossaryText ? `\n\n${nameGlossaryText}` : '';

  return `${copy.landmarkLabel ?? 'Landmark'}: ${name}

${copy.factsLabel}:
${sourceMaterial}

${copy.narrativeLabel}:
${historicalNarrative}${highlightsBlock}${glossaryBlock}

${copy.scriptRequest(wordTarget.min, wordTarget.max)}`;
};

export const generateLandmarkScript = async ({
  name,
  sourceMaterial,
  historicalNarrative,
  historyDepth,
  styleId = DEFAULT_TOUR_STYLE_ID,
  topicIds = [],
  locale = DEFAULT_LOCALE,
  highlights = [],
  nameGlossary = [],
  plannerHook,
}) => {
  if (!isAppLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const copy = SCRIPT_LOCALE[locale];
  const resolvedDepth = historyDepth ?? computeHistoryDepth(sourceMaterial ?? '');
  const stylePhrase = getStylePromptPhrase(styleId, locale);
  const wordTarget = getWordTarget(resolvedDepth, resolveTourStyle(styleId).id);
  const topicLens = buildTopicLens(topicIds, locale);
  const highlightsText = formatHighlightsForPrompt(highlights);
  const nameGlossaryText = formatNameGlossaryForPrompt(nameGlossary, locale);
  const systemPrompt = buildScriptSystemPrompt(stylePhrase, topicLens, locale, plannerHook);
  const userPrompt = buildScriptUserPrompt({
    name,
    sourceMaterial,
    historicalNarrative,
    highlightsText,
    nameGlossaryText,
    wordTarget,
    locale,
  });
  const maxTokens = SCRIPT_MAX_TOKENS[resolvedDepth] ?? SCRIPT_MAX_TOKENS.thin;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await createChatCompletion({
      operation: 'audio_script.generate',
      model: getAudioModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: attempt === 0 ? userPrompt : `${userPrompt}\n\n${copy.retryHint}`,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.55,
    });

    const script = cleanScriptText(completion.choices[0]?.message?.content ?? '');
    if (script && !hasUnsupportedScript(script)) {
      return script;
    }
  }

  throw new Error(copy.invalidError);
};

const CUSTOM_STOP_TARGETS = { min: 280, max: 400 };

export const generateCustomStopScript = async ({
  title,
  scriptSeed,
  tourTitle,
  userPrompt,
  locale = DEFAULT_LOCALE,
}) => {
  if (!isAppLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const copy = SCRIPT_LOCALE[locale];
  const { min, max } = CUSTOM_STOP_TARGETS;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await createChatCompletion({
      operation: 'audio_script.revise',
      model: getAudioModel(),
      max_tokens: 700,
      temperature: 0.55,
      messages: [
        {
          role: 'system',
          content: locale === 'hu' ? `${copy.guideIntro}
Írj egy tematikus budapesti gyalogos túra egyéni térképi megállójához felolvasásra szánt szöveget.
Szabályok:
- A seed anyagból következő tényeket használd; ne találj ki történelmi részleteket.
- A szöveg legyen önálló, természetes magyar, ne angol mondatok tükörfordítása.
- Erős, konkrét nyitással kezdj. Rövid mondatok, hangos felolvasásra.
- ${copy.scriptRequest(min, max)}` : `${copy.guideIntro}
Write a spoken script for a custom map pin on a themed Budapest walking tour.
Rules:
- Use only facts implied by the seed material. Do not invent history.
- Open with a vivid, specific hook. Short sentences for audio.
- ${copy.scriptRequest(min, max)}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            tour_title: tourTitle,
            user_prompt: userPrompt,
            stop_title: title,
            seed_material: scriptSeed,
          }),
        },
      ],
    });

    const script = cleanScriptText(completion.choices[0]?.message?.content ?? '');
    if (script && !hasUnsupportedScript(script)) {
      return script;
    }
  }

  throw new Error(copy.invalidError);
};
