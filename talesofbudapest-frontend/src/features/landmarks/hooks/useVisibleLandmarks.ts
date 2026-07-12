'use client'

import { useMemo } from 'react'
import {
  filterLandmarksForZoom,
  partitionVisibleLandmarks,
  type MapBounds,
  type VisibleLandmarkEntry,
  CLUSTER_MAX_ZOOM,
} from '@/lib/map/visibleLandmarks'
import { useMapSettingsStore } from '@/stores/mapSettingsStore'
import type { MapPin } from '@/types/landmark'

type UseVisibleLandmarksResult = {
  prominent: VisibleLandmarkEntry[]
  clustered: VisibleLandmarkEntry[]
  showAllBuildings: boolean
}

export const useVisibleLandmarks = (
  landmarks: MapPin[],
  zoom: number,
  bounds: MapBounds | null,
  selectedLandmarkId: string | null,
): UseVisibleLandmarksResult => {
  const showAllBuildings = useMapSettingsStore((state) => state.showAllBuildings)

  const tierFiltered = useMemo(
    () => filterLandmarksForZoom(landmarks, zoom, showAllBuildings),
    [landmarks, zoom, showAllBuildings],
  )

  const clustered = useMemo(() => {
    if (zoom > CLUSTER_MAX_ZOOM) {
      return []
    }

    return tierFiltered
      .filter((landmark) => landmark.id !== selectedLandmarkId)
      .map((landmark) => ({
        landmark,
        variant: 'dot' as const,
        cluster: true,
      }))
  }, [selectedLandmarkId, tierFiltered, zoom])

  const prominent = useMemo(() => {
    if (zoom <= CLUSTER_MAX_ZOOM) {
      const selected = tierFiltered.find((landmark) => landmark.id === selectedLandmarkId)
      if (!selected) {
        return []
      }

      return [
        {
          landmark: selected,
          variant: 'photo' as const,
          cluster: false,
        },
      ]
    }

    return partitionVisibleLandmarks(
      landmarks,
      zoom,
      bounds,
      showAllBuildings,
      selectedLandmarkId,
    ).prominent
  }, [bounds, landmarks, selectedLandmarkId, showAllBuildings, tierFiltered, zoom])

  return { prominent, clustered, showAllBuildings }
}
