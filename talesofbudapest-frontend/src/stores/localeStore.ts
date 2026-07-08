'use client'

import { useEffect } from 'react'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { AppLocale } from '@/types/locale'
import { create } from 'zustand'

type LocaleStoreState = {
  locale: AppLocale
  setLocaleState: (locale: AppLocale) => void
}

export const useLocaleStore = create<LocaleStoreState>((set) => ({
  locale: 'en',
  setLocaleState: (locale) => set({ locale }),
}))

export const useLocalePreference = () => {
  const router = useRouter()
  const pathname = usePathname()
  const activeLocale = useLocale() as AppLocale
  const setLocaleState = useLocaleStore((state) => state.setLocaleState)

  useEffect(() => {
    setLocaleState(activeLocale)
  }, [activeLocale, setLocaleState])

  const setLocale = (nextLocale: AppLocale) => {
    if (nextLocale === activeLocale) {
      return
    }

    setLocaleState(nextLocale)
    router.replace(pathname, { locale: nextLocale })
  }

  return { locale: activeLocale, setLocale }
}
