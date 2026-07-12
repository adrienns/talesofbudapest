'use client'

import { useLocale } from 'next-intl'
import { useEffect } from 'react'

export const LocaleHtmlAttributes = () => {
  const locale = useLocale()

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return null
}
