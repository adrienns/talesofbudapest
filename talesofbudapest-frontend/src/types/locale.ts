export const SUPPORTED_LOCALES = ['en', 'hu'] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'en'

export const isAppLocale = (value: string): value is AppLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value)

export const audioTourFileSuffix = (locale: AppLocale) => `-tour-${locale}.mp3`
