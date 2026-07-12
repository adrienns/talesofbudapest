import type { AppLocale } from '@/types/locale'
import type { MapPin } from '@/types/landmark'
import type { MapBounds } from '@/lib/map/visibleLandmarks'

export const fetchMapLandmarks = async (
  bounds: MapBounds,
  zoom: number,
  locale: AppLocale,
  showAll: boolean,
): Promise<MapPin[]> => {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].join(',')
  const params = new URLSearchParams({
    bbox,
    zoom: String(zoom),
    locale,
    showAll: String(showAll),
  })

  const response = await fetch(`/api/landmarks/map?${params.toString()}`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to load map landmarks')
  }

  const body = (await response.json()) as { pins: MapPin[] }
  return body.pins
}
