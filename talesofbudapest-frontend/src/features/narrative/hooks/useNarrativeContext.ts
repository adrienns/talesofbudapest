'use client'

import { useEffect, useState } from 'react'
import type { NarrativeContext } from '@/types/narrative'

export const useNarrativeContext = () => {
  const [context, setContext] = useState<NarrativeContext>({
    hour: new Date().getHours(),
    userLat: null,
    userLng: null,
  })

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
