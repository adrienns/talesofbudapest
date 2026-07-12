import { DEFAULT_LOCALE, isAppLocale } from './locale.js';
import { applySpeechLexicon, buildSpeechLexicon } from './speechLexicon.js';

/**
 * Builds TTS input from a display script. HU (and other native locales) pass
 * through unchanged — the TTS model handles them. EN applies a locale-scoped
 * speech lexicon (static bootstrap + optional runtime entries from KG).
 *
 * @returns {{ displayScript: string, speechText: string }}
 */
export const prepareSpeechText = (displayScript, locale = DEFAULT_LOCALE, extraLexicon = []) => {
  const display = displayScript?.trim() ?? '';
  if (!display || locale === 'hu' || !isAppLocale(locale)) {
    return { displayScript: display, speechText: display };
  }

  const lexicon = buildSpeechLexicon(locale, extraLexicon);
  const speechText = applySpeechLexicon(display, lexicon);

  return { displayScript: display, speechText };
};
