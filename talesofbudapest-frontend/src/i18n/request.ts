import { getRequestConfig } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { isAppLocale } from '@/types/locale'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !isAppLocale(locale)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
