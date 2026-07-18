import type { NarrativeRoute } from '@/types/narrative'

const OFFLINE_TOUR_KEY_PREFIX = 'tales:offline-tour:'

const isOfflineTour = (value: unknown): value is NarrativeRoute => {
  if (!value || typeof value !== 'object') return false
  const route = value as Partial<NarrativeRoute>
  return typeof route.id === 'string'
    && typeof route.title === 'string'
    && Array.isArray(route.chapters)
    && route.chapters.every((chapter) =>
      chapter
      && typeof chapter.id === 'string'
      && typeof chapter.title === 'string'
      && Number.isFinite(chapter.lat)
      && Number.isFinite(chapter.lng),
    )
}

const keyFor = (tourId: string) => `${OFFLINE_TOUR_KEY_PREFIX}${tourId}`

/** Stores the route, stops, and walking geometry so an already-downloaded tour can resume offline. */
export const saveOfflineTour = (route: NarrativeRoute) => {
  try {
    localStorage.setItem(keyFor(route.id), JSON.stringify(route))
  } catch {
    // Audio caching can still work when local storage is unavailable or full.
  }
}

export const loadOfflineTour = (tourId: string): NarrativeRoute | null => {
  try {
    const raw = localStorage.getItem(keyFor(tourId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isOfflineTour(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const hasOfflineTour = (tourId: string): boolean => Boolean(loadOfflineTour(tourId))
