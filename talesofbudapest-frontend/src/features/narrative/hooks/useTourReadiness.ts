'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MAP_STYLE_URL } from '@/constants/map'
import { saveOfflineTour } from '@/lib/narrative/offlineTour'
import type { NarrativeRoute } from '@/types/narrative'

export type TourReadinessStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'partial'
  | 'unavailable'
  | 'offline'

export const useTourReadiness = (route: NarrativeRoute | null) => {
  const [status, setStatus] = useState<TourReadinessStatus>('idle')
  const [cachedCount, setCachedCount] = useState(0)
  const urls = useMemo(
    () => [...new Set(route?.chapters.map((chapter) => chapter.audioUrl).filter((url): url is string => Boolean(url)) ?? [])],
    [route],
  )

  const prepare = useCallback(async () => {
    if (!route) return

    saveOfflineTour(route)
    if (urls.length === 0) {
      setStatus('unavailable')
      return
    }
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }

    setStatus('preparing')
    try {
      if ('caches' in window) {
        const checks = await Promise.all(urls.map((url) => caches.match(url, { ignoreVary: true })))
        const existingCount = checks.filter(Boolean).length
        if (existingCount === urls.length) {
          setCachedCount(existingCount)
          setStatus('ready')
          return
        }
      }

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/tour-sw.js')
        const readyRegistration = await navigator.serviceWorker.ready
        const worker = readyRegistration.active ?? registration.active ?? registration.waiting
        if (worker) {
          worker.postMessage({ type: 'CACHE_TOUR_AUDIO', tourId: route.id, urls, mapStyleUrl: MAP_STYLE_URL })
          return
        }
      }

      const results = await Promise.allSettled(urls.map((url) => fetch(url, { cache: 'force-cache' })))
      const count = results.filter((result) => result.status === 'fulfilled' && result.value.ok).length
      setCachedCount(count)
      setStatus(count === urls.length ? 'ready' : count > 0 ? 'partial' : 'unavailable')
    } catch {
      setStatus('unavailable')
    }
  }, [route, urls])

  useEffect(() => {
    if (!route) {
      setStatus('idle')
      setCachedCount(0)
      return
    }

    const onOffline = () => setStatus((current) => current === 'ready' ? current : 'offline')
    const onOnline = () => {
      void prepare()
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'TOUR_AUDIO_CACHED' || event.data?.tourId !== route.id) return
      const count = Number(event.data.cachedCount) || 0
      setCachedCount(count)
      setStatus(count === urls.length ? 'ready' : count > 0 ? 'partial' : 'unavailable')
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    void prepare()

    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [prepare, route, urls.length])

  return { status, cachedCount, totalCount: urls.length, prepare }
}
