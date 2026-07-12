'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { getAllMapPins } from '@/services/repositories/landmarksRepository'
import { fetchMapLandmarks } from '@/services/mapLandmarksService'
import { queryKeys } from '@/services/queryKeys'
import { useMapSettingsStore } from '@/stores/mapSettingsStore'
import type { MapBounds } from '@/lib/map/visibleLandmarks'
import type { AppLocale } from '@/types/locale'
import type { MapPin } from '@/types/landmark'

type UseMapPinsResult = {
  pins: MapPin[]
  isLoading: boolean
  error: string | null
}

export const useMapPins = (
  bounds: MapBounds | null,
  zoom: number,
): UseMapPinsResult => {
  const locale = useLocale() as AppLocale
  const showAllBuildings = useMapSettingsStore((state) => state.showAllBuildings)

  const { data, isLoading, error } = useQuery({
    queryKey: bounds
      ? queryKeys.pinsViewport(locale, bounds, zoom, showAllBuildings)
      : queryKeys.pins(locale),
    queryFn: () =>
      bounds
        ? fetchMapLandmarks(bounds, zoom, locale, showAllBuildings)
        : getAllMapPins(locale),
    placeholderData: keepPreviousData,
  })

  return {
    pins: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}
