import type { AppLocale } from '@/types/locale'
import type { MapBounds } from '@/lib/map/visibleLandmarks'

export const queryKeys = {
  pins: (locale: AppLocale) => ['pins', locale] as const,
  pinsViewport: (locale: AppLocale, bbox: MapBounds, zoom: number, showAll: boolean) =>
    ['pins', 'viewport', locale, bbox, zoom, showAll] as const,
  landmarkDetail: (id: string, locale: AppLocale) => ['landmarkDetail', id, locale] as const,
  landmarkSearch: (locale: AppLocale, query: string) => ['landmarkSearch', locale, query] as const,
  chronicle: (locationId: string) => ['chronicle', locationId] as const,
}
