'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { haversineKm } from '@/lib/geo/haversine'

type Target = { id: string; lat: number; lng: number; title?: string } | null

/** Low-power next-stop proximity check; never follows visitors in the background. */
export const useArrivalDetection = (target: Target, onArrival: (target: NonNullable<Target>) => void) => {
  const arrivedId = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'requesting' | 'tracking' | 'weak' | 'paused' | 'denied' | 'unavailable'>('idle')
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!target) {
      setStatus('idle')
      return
    }
    if (!navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    arrivedId.current = null
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
        setAccuracyMeters(position.coords.accuracy)
        setStatus(position.coords.accuracy > 100 ? 'weak' : 'tracking')
        const distanceMeters = haversineKm(
          { lat: position.coords.latitude, lng: position.coords.longitude }, target,
        ) * 1000
        if (distanceMeters <= 50 && arrivedId.current !== target.id) {
          arrivedId.current = target.id
          onArrival(target)
          setStatus('tracking')
          stop()
        }
      }, (error) => {
        stop()
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied')
          return
        }

        // iOS may briefly report POSITION_UNAVAILABLE / "location unknown"
        // while Core Location acquires a fresh fix. Keep trying while this
        // visible tour remains open instead of treating it as a hard failure.
        setStatus('unavailable')
        if (document.visibilityState === 'visible') {
          retryTimer = window.setTimeout(() => {
            retryTimer = null
            start()
          }, 4_000)
        }
      }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 })
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
  return { status, accuracyMeters, retry }
}
