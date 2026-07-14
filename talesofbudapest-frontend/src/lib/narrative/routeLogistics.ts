/** Honest walking-tour logistics — real distance/time from stop coordinates, not a guess. */

import { haversineKm, type GeoPoint } from '@/lib/geo/haversine'
import type { WalkingRoute } from '@/types/narrative'

export type { GeoPoint }
export { haversineKm }

type LogisticsChapter = GeoPoint & { script?: string | null }

export type RouteLogistics = {
  totalDistanceKm: number
  walkingMinutes: number
  listeningMinutes: number
  totalMinutes: number
  stopCount: number
}

/** Average adult walking pace in a city (~4.3 km/h, slower than open-road pace). */
const WALK_KMH = 4.3
const WORDS_PER_MINUTE = 150
/** Used when script text is unavailable — matches rich storyteller midpoint (~2 min). */
const FALLBACK_MINUTES_PER_STOP = 2

/**
 * Greedy nearest-neighbor walking order starting from `start` (or the first
 * chapter if no start point is known). Good enough for 3-4 stops — an exact
 * TSP solve would be overkill at this scale.
 */
export const orderChaptersForWalking = <T extends LogisticsChapter>(
  chapters: T[],
  start?: GeoPoint | null,
): T[] => {
  if (chapters.length <= 1) {
    return [...chapters]
  }

  const remaining = [...chapters]
  const ordered: T[] = []
  let cursor: GeoPoint

  if (start) {
    cursor = start
  } else {
    cursor = remaining[0]
    ordered.push(remaining.shift()!)
  }

  while (remaining.length > 0) {
    let nearestIndex = 0
    let nearestDist = Infinity

    for (let i = 0; i < remaining.length; i += 1) {
      const dist = haversineKm(cursor, remaining[i])
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIndex = i
      }
    }

    const [next] = remaining.splice(nearestIndex, 1)
    ordered.push(next)
    cursor = next
  }

  return ordered
}

const estimateListeningMinutes = (chapter: LogisticsChapter): number => {
  if (!chapter.script) {
    return FALLBACK_MINUTES_PER_STOP
  }

  const wordCount = chapter.script.trim().split(/\s+/).filter(Boolean).length
  return wordCount / WORDS_PER_MINUTE
}

/** Computes honest distance/time for a walking order (does not reorder — call `orderChaptersForWalking` first). */
export const computeRouteLogistics = <T extends LogisticsChapter>(
  orderedChapters: T[],
  start?: GeoPoint | null,
  walkingRoute?: WalkingRoute | null,
): RouteLogistics => {
  let totalDistanceKm = 0
  let cursor: GeoPoint | null = start ?? null

  for (const chapter of orderedChapters) {
    if (cursor) {
      totalDistanceKm += haversineKm(cursor, chapter)
    }
    cursor = chapter
  }

  const listeningMinutes = orderedChapters.reduce(
    (total, chapter) => total + estimateListeningMinutes(chapter),
    0,
  )
  const hasWalkingRoute = Boolean(walkingRoute && walkingRoute.distanceMeters > 0 && walkingRoute.durationSeconds > 0)
  if (hasWalkingRoute) totalDistanceKm = walkingRoute!.distanceMeters / 1000
  const walkingMinutes = hasWalkingRoute
    ? walkingRoute!.durationSeconds / 60
    : (totalDistanceKm / WALK_KMH) * 60

  return {
    totalDistanceKm,
    walkingMinutes,
    listeningMinutes,
    totalMinutes: walkingMinutes + listeningMinutes,
    stopCount: orderedChapters.length,
  }
}

/** "2.3 km · ~45 min" — compact logistics label for the preview header. */
export const formatLogistics = (logistics: RouteLogistics): string => {
  const km = logistics.totalDistanceKm.toFixed(1)
  const minutes = Math.max(1, Math.round(logistics.totalMinutes))
  const stops = `${logistics.stopCount} stop${logistics.stopCount === 1 ? '' : 's'}`
  return `${stops} · ${km} km · ~${minutes} min`
}
