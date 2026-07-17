import type { Landmark, MapPin } from '@/types'
import type { AppLocale } from '@/types/locale'
import { DEFAULT_LOCALE } from '@/types/locale'

const readJson = async <T>(response: Response, fallback: string): Promise<T> => {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? fallback)
  return body as T
}

export const getAllMapPins = async (locale: AppLocale = DEFAULT_LOCALE): Promise<MapPin[]> => {
  const response = await fetch(`/api/landmarks/map?locale=${encodeURIComponent(locale)}`)
  const body = await readJson<{ pins: MapPin[] }>(response, 'Failed to load landmarks')
  return body.pins
}

export const getMapPinsInBbox = async (
  bbox: { south: number; west: number; north: number; east: number },
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<MapPin[]> => {
  const params = new URLSearchParams({
    bbox: [bbox.south, bbox.west, bbox.north, bbox.east].join(','),
    locale,
  })
  const response = await fetch(`/api/landmarks/map?${params}`)
  const body = await readJson<{ pins: MapPin[] }>(response, 'Failed to load landmarks')
  return body.pins
}

export const getLandmarkById = async (
  id: string,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<Landmark | null> => {
  const response = await fetch(`/api/landmarks/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`)
  if (response.status === 404) return null
  const body = await readJson<{ landmark: Landmark }>(response, 'Failed to load landmark')
  return body.landmark
}

/** @deprecated Use getAllMapPins for map display */
export const getAllLandmarks = async (locale: AppLocale = DEFAULT_LOCALE): Promise<Landmark[]> => {
  const pins = await getAllMapPins(locale)
  return pins.map((pin) => ({
    ...pin,
    story_prompt: '',
    images: pin.image_url ? [{ url: pin.image_url, alt: pin.name }] : [],
  }))
}
