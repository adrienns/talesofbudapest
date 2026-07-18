import type { AppLocale } from '@/types/locale'
import type { MapPin } from '@/types/landmark'

export const searchLandmarks = async (
  query: string,
  locale: AppLocale,
  signal?: AbortSignal,
): Promise<MapPin[]> => {
  const params = new URLSearchParams({ q: query, locale })
  const response = await fetch(`/api/landmarks/search?${params}`, { signal })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? 'Failed to search landmarks')
  return (body as { pins: MapPin[] }).pins
}
