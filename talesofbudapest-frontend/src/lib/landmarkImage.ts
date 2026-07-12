import type { Landmark, LandmarkImage } from '@/types'

export const getLandmarkImageUrl = (
  imageUrl: string | null | undefined,
  images: LandmarkImage[] = [],
): string | null => imageUrl ?? images[0]?.url ?? null

export const getLandmarkMarkerImageUrl = (
  landmark: { image_url: string | null; images?: { url: string }[] },
): string | null => getLandmarkImageUrl(landmark.image_url, landmark.images ?? [])

export const getLandmarkInitial = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return '?'
  }

  return trimmed.charAt(0).toLocaleUpperCase()
}
