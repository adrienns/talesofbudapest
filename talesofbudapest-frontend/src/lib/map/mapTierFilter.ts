import type { ImportanceTier, LandmarkSource } from '@/types/landmark'

export const HIGH_PRIORITY_SOURCES = new Set<LandmarkSource>(['wikipedia', 'iconic'])

export type MapPinLike = {
  source?: LandmarkSource
  landmark_type?: string
  importance_tier?: ImportanceTier
}

export const isHighPrioritySource = (pin: MapPinLike): boolean =>
  Boolean(pin.source && HIGH_PRIORITY_SOURCES.has(pin.source))

export const isCityLandmark = (pin: MapPinLike): boolean =>
  isHighPrioritySource(pin) ||
  pin.source === 'muemlekem' ||
  (pin.landmark_type != null && pin.landmark_type !== 'house')

export const isTierAllowedAtZoom = (
  pin: MapPinLike,
  zoom: number,
  showAll: boolean,
): boolean => {
  const tier = pin.importance_tier ?? 'archive'

  if (tier === 'skip') {
    return false
  }

  if (showAll) {
    return true
  }

  if (zoom <= 13) {
    return isCityLandmark(pin)
  }

  if (zoom <= 15) {
    return tier !== 'archive' || isHighPrioritySource(pin)
  }

  return true
}
