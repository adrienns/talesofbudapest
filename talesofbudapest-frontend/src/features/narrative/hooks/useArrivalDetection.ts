'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { haversineKm, type GeoPoint } from '@/lib/geo/haversine'

type Target = { id: string; lat: number; lng: number; title?: string } | null

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 30_000,
  timeout: 20_000,
}

export const useArrivalDetection = (target: Target, onArrival: (target: NonNullable<Target>) => void) => {
  const arrivedId = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'requesting' | 'tracking' | 'weak' | 'paused' | 'denied' | 'unavailable'>('idle')
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [userPosition, setUserPosition] = useState<GeoPoint | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!target) {
      setStatus('idle')
      setDistanceMeters(null)
      setUserPosition(null)
      return
    }
    if (!navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    arrivedId.current = null
    setDistanceMeters(null)
    setUserPosition(null)
    let watchId: number | null = null
    let retryTimer: number | null = null

    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      retryTimer = null
    }
    const start = () => {
      if (document.visibilityState !== 'visible' || watchId !== null || retryTimer !== null) return
      setStatus('requesting')
      watchId = navigator.geolocation.watchPosition((position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude }
        setUserPosition(coords)
        setAccuracyMeters(position.coords.accuracy)
        setStatus(position.coords.accuracy > 100 ? 'weak' : 'tracking')
        const distance = haversineKm(coords, target) * 1000
        setDistanceMeters(distance)
        if (distance <= 50 && arrivedId.current !== target.id) {
          arrivedId.current = target.id
          onArrival(target)
        }
      }, (error) => {
        stop()
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied')
          return
        }

        setStatus('unavailable')
        if (document.visibilityState === 'visible') {
          retryTimer = window.setTimeout(() => {
            retryTimer = null
            start()
          }, 2_500)
        }
      }, GEO_OPTIONS)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start()
      else {
        stop()
        setStatus('paused')
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [target, onArrival, retryKey])

  const retry = useCallback(() => setRetryKey((value) => value + 1), [])
  return { status, accuracyMeters, distanceMeters, userPosition, retry }
}
