'use client'

import { useCallback, useEffect, useState } from 'react'
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

  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable'>('idle')
  const requestLocation = useCallback(async () => new Promise<boolean>((resolve) => {
    if (!navigator.geolocation) { setLocationStatus('unavailable'); resolve(false); return }
    setLocationStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setContext((current) => ({ ...current, userLat: position.coords.latitude, userLng: position.coords.longitude }))
        setLocationStatus('ready'); resolve(true)
      },
      (error) => { setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'); resolve(false) },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  }), [])

  return { context, locationStatus, requestLocation }
}
