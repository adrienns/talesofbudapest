import type { Landmark, LandmarkImage } from '@/types'

export type LocationRow = {
  id: string | number
  name: string
  latitude: number
  longitude: number
  story_prompt: string
  audio_url?: string | null
  image_url?: string | null
  images?: unknown
}

const parseImages = (value: unknown): LandmarkImage[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || !('url' in item)) {
      return []
    }

    const url = String(item.url)
    if (!url) {
      return []
    }

    const alt = 'alt' in item && item.alt != null ? String(item.alt) : undefined
    return [{ url, alt }]
  })
}

export const mapLocationToLandmark = (row: LocationRow): Landmark => ({
  id: String(row.id),
  name: row.name,
  lat: row.latitude,
  lng: row.longitude,
  story_prompt: row.story_prompt,
  audio_url: row.audio_url ?? null,
  image_url: row.image_url ?? null,
  images: parseImages(row.images),
})
