'use client'

import { useEffect, useState } from 'react'
import type { WalkingRoute } from '@/types/narrative'

type Point = { lat: number; lng: number }

export const requestWalkingRoute = async (points: Point[]): Promise<WalkingRoute> => {
  const response = await fetch('/api/directions/walking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  })
  const payload = await response.json()
  if (!response.ok || !Array.isArray(payload.geometry) || payload.geometry.length < 2) {
    throw new Error(payload.error ?? 'Walking route unavailable')
  }
  return payload as WalkingRoute
}

/** Debounced, abortable ORS request; callers keep their straight-line fallback on failure. */
export const useWalkingRoute = (points: Point[], delay = 450) => {
  const [route, setRoute] = useState<WalkingRoute | null>(null)
  const key = points.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join('|')

  useEffect(() => {
    if (points.length < 2) {
      setRoute(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/directions/walking', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }), signal: controller.signal,
        })
        const payload = await response.json()
        if (!response.ok || !Array.isArray(payload.geometry) || payload.geometry.length < 2) throw new Error()
        setRoute(payload as WalkingRoute)
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') setRoute(null)
      }
    }, delay)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  // Points are intentionally represented by value, not array identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay])

  return route
}
