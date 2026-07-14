'use client'

import { useEffect, useRef } from 'react'
import { haversineKm } from '@/lib/geo/haversine'

type Target = { id: string; lat: number; lng: number; title?: string } | null

/** Low-power next-stop proximity check; never follows visitors in the background. */
export const useArrivalDetection = (target: Target, onArrival: (target: NonNullable<Target>) => void) => {
  const arrivedId = useRef<string | null>(null)

  useEffect(() => {
    if (!target || !navigator.geolocation) return
    arrivedId.current = null
    let watchId: number | null = null

    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    const start = () => {
      if (document.visibilityState !== 'visible' || watchId !== null) return
      watchId = navigator.geolocation.watchPosition((position) => {
        const distanceMeters = haversineKm(
          { lat: position.coords.latitude, lng: position.coords.longitude }, target,
        ) * 1000
        if (distanceMeters <= 50 && arrivedId.current !== target.id) {
          arrivedId.current = target.id
          onArrival(target)
          stop()
        }
      }, () => {}, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 })
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [target, onArrival])
}
