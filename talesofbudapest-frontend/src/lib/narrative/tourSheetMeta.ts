import { haversineKm, type GeoPoint } from '@/lib/narrative/routeLogistics'
import type { NarrativeRoute } from '@/types/narrative'
import type { TourSheetMeta } from '@/types/tourSheet'

const WALK_KMH = 4.3

export const buildTourChapterMeta = (
  route: NarrativeRoute | null | undefined,
  chapterIndex: number,
): TourSheetMeta | undefined => {
  if (!route?.chapters.length) {
    return undefined
  }

  const chapter = route.chapters[chapterIndex]
  const next = route.chapters[chapterIndex + 1]

  if (!chapter) {
    return undefined
  }

  if (!next) {
    return {
      locationLine: chapter.title,
      timingLine: null,
      distanceLine: null,
    }
  }

  const distanceKm = haversineKm(
    { lat: chapter.lat, lng: chapter.lng },
    { lat: next.lat, lng: next.lng },
  )
  const walkMinutes = Math.max(1, Math.round((distanceKm / WALK_KMH) * 60))

  return {
    locationLine: chapter.title,
    timingLine: String(walkMinutes),
    distanceLine: distanceKm.toFixed(1),
  }
}

export const buildLandmarkMeta = (landmarkName: string): TourSheetMeta => ({
  locationLine: landmarkName,
  timingLine: null,
  distanceLine: null,
})

export type { GeoPoint }
