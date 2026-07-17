import { isTierAllowedAtZoom } from '@/lib/map/mapTierFilter'
import type { MapPin } from '@/types/landmark'

/** MapLibre clusters through this integer zoom, matching the legacy map behavior. */
export const CLUSTER_MAX_ZOOM = 15
export const PIN_REVEAL_ZOOM = CLUSTER_MAX_ZOOM + 1

export type MapBounds = {
  south: number
  west: number
  north: number
  east: number
}

export type VisibleLandmarkEntry = {
  landmark: MapPin
  variant: 'dot' | 'photo'
  cluster: boolean
}

const isInBounds = (landmark: MapPin, bounds: MapBounds | null): boolean => {
  if (!bounds) {
    return true
  }

  return (
    landmark.lat >= bounds.south &&
    landmark.lat <= bounds.north &&
    landmark.lng >= bounds.west &&
    landmark.lng <= bounds.east
  )
}

const markerVariant = (zoom: number, isSelected: boolean): 'dot' | 'photo' =>
  isSelected || zoom >= PIN_REVEAL_ZOOM ? 'photo' : 'dot'

const shouldCluster = (zoom: number, isSelected: boolean): boolean => {
  if (isSelected) {
    return false
  }

  return zoom < PIN_REVEAL_ZOOM
}

/** Tier/zoom filter only — no viewport culling (used for stable cluster layer). */
export const filterLandmarksForZoom = (
  landmarks: MapPin[],
  zoom: number,
  showAll: boolean,
): MapPin[] =>
  landmarks.filter((landmark) => isTierAllowedAtZoom(landmark, zoom, showAll))

export const partitionVisibleLandmarks = (
  landmarks: MapPin[],
  zoom: number,
  bounds: MapBounds | null,
  showAll: boolean,
  selectedLandmarkId: string | null,
): { prominent: VisibleLandmarkEntry[]; clustered: VisibleLandmarkEntry[] } => {
  const tierFiltered = filterLandmarksForZoom(landmarks, zoom, showAll)
  const prominent: VisibleLandmarkEntry[] = []
  const clustered: VisibleLandmarkEntry[] = []

  for (const landmark of tierFiltered) {
    const isSelected = landmark.id === selectedLandmarkId
    const entry: VisibleLandmarkEntry = {
      landmark,
      variant: markerVariant(zoom, isSelected),
      cluster: shouldCluster(zoom, isSelected),
    }

    if (entry.cluster) {
      clustered.push(entry)
      continue
    }

    if (isInBounds(landmark, bounds)) {
      prominent.push(entry)
    }
  }

  return { prominent, clustered }
}
