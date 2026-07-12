export const SUPPORTED_LOCALES = ['en', 'hu'];

/** @typedef {'en' | 'hu'} AppLocale */

export const DEFAULT_LOCALE = 'en';

export const isAppLocale = (value) => SUPPORTED_LOCALES.includes(value);

export const audioTourFileSuffix = (locale, styleId = 'storyteller') =>
  `-tour-${locale}-v2-${styleId}.mp3`;
