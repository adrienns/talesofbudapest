'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import type { NarrativeContext } from '@/types/narrative'
import type { AppLocale } from '@/types/locale'

export const useNarrativeContext = () => {
  const locale = useLocale() as AppLocale
  const [context, setContext] = useState<NarrativeContext>({
    hour: new Date().getHours(),
    userLat: null,
    userLng: null,
    locale,
  })

  useEffect(() => {
    setContext((current) => ({ ...current, locale }))
  }, [locale])

  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setContext((current) => ({
          ...current,
          userLat: position.coords.latitude,
          userLng: position.coords.longitude,
        }))
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  return context
}
