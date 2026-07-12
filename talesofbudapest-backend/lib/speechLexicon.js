import { PRONUNCIATION_LEXICON, lexiconEntriesByLength } from './pronunciationLexicon.js';
import { DEFAULT_LOCALE, isAppLocale } from './locale.js';

/**
 * Locale-scoped grapheme → speakable form. Static lexicon is the bootstrap;
 * runtime entries (from KG metadata / curation) merge on top.
 *
 * Future: kg_entity_aliases rows with alias_kind 'spoken_form' and
 * language_code per locale — same pattern as translated_name, not HU-only.
 */

/** @typedef {{ grapheme: string, spoken: string, locales?: string[] }} SpeechLexiconEntry */

/** @param {SpeechLexiconEntry[]} extraEntries */
export const buildSpeechLexicon = (locale = DEFAULT_LOCALE, extraEntries = []) => {
  if (!isAppLocale(locale) || locale === 'hu') {
    return [];
  }

  const staticEntries = lexiconEntriesByLength().map(([grapheme, spoken]) => ({
    grapheme,
    spoken,
    locales: ['en'],
  }));

  const merged = [...staticEntries, ...extraEntries].filter(
    (entry) => !entry.locales?.length || entry.locales.includes(locale),
  );

  return merged.sort((a, b) => b.grapheme.length - a.grapheme.length);
};

/** @param {SpeechLexiconEntry[]} lexicon */
export const applySpeechLexicon = (text, lexicon) => {
  let speechText = text;
  for (const { grapheme, spoken } of lexicon) {
    if (!grapheme) continue;
    speechText = speechText.split(grapheme).join(spoken);
  }
  return speechText;
};

export const staticSpeechLexiconForLocale = (locale) => {
  if (locale === 'hu') return [];
  return Object.entries(PRONUNCIATION_LEXICON).map(([grapheme, spoken]) => ({
    grapheme,
    spoken,
    locales: ['en'],
  }));
};
