import type { AppLocale } from '@/types/locale'
import type { MapPin } from '@/types/landmark'
import { isTierAllowedAtZoom } from '@/lib/map/mapTierFilter'

export type MapLandmarksQuery = {
  south: number
  west: number
  north: number
  east: number
  zoom: number
  locale: AppLocale
  showAll: boolean
}

export const parseBboxParam = (
  value: string | null,
): { south: number; west: number; north: number; east: number } | null => {
  if (!value) {
    return null
  }

  const parts = value.split(',').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return null
  }

  const [south, west, north, east] = parts
  return { south, west, north, east }
}

export const filterMapPins = (
  pins: MapPin[],
  zoom: number,
  showAll: boolean,
): MapPin[] => {
  const filtered = pins.filter((pin) => isTierAllowedAtZoom(pin, zoom, showAll))
  return filtered.slice(0, 500)
}
