import type { Landmark, LandmarkImage, MapPin } from '@/types'
import type { AppLocale } from '@/types/locale'
import type { ImportanceTier, LandmarkSource } from '@/types/landmark'
import { audioTourFileSuffix, DEFAULT_LOCALE } from '@/types/locale'

export type LocationTranslationRow = {
  locale: string
  name: string
  story_prompt: string
  audio_url?: string | null
}

export type LocationRow = {
  id: string | number
  name: string
  latitude: number
  longitude: number
  story_prompt: string
  audio_url?: string | null
  image_url?: string | null
  images?: unknown
  source?: string | null
  landmark_type?: string | null
  importance_tier?: string | null
  importance_score?: number | null
  location_translations?: LocationTranslationRow[] | null
}

const parseImages = (value: unknown): LandmarkImage[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || !('url' in item)) {
      return []
    }

    const url = String(item.url)
    if (!url) {
      return []
    }

    const alt = 'alt' in item && item.alt != null ? String(item.alt) : undefined
    return [{ url, alt }]
  })
}

const normalizeAudioUrl = (audioUrl: string | null | undefined, locale: AppLocale): string | null => {
  const suffix = audioTourFileSuffix(locale)
  if (!audioUrl?.includes(suffix)) {
    return null
  }

  return audioUrl
}

const pickTranslation = <T extends { locale: string; name: string }>(
  translations: T[] | null | undefined,
  locale: AppLocale,
): T | null => {
  if (!translations?.length) {
    return null
  }

  const byLocale = new Map(
    translations.map((translation) => [translation.locale, translation] as const),
  )

  return (
    byLocale.get(locale) ??
    byLocale.get(DEFAULT_LOCALE) ??
    byLocale.get('hu') ??
    translations[0] ??
    null
  )
}

export type MapPinRow = {
  id: string | number
  name: string
  latitude: number
  longitude: number
  audio_url?: string | null
  image_url?: string | null
  source?: string | null
  landmark_type?: string | null
  importance_tier?: string | null
  importance_score?: number | null
  location_translations?: Pick<LocationTranslationRow, 'locale' | 'name' | 'audio_url'>[] | null
}

export const mapLocationToMapPin = (row: MapPinRow, locale: AppLocale = DEFAULT_LOCALE): MapPin => {
  const translation = pickTranslation(row.location_translations, locale)
  const name = translation?.name ?? row.name
  const audioUrl = normalizeAudioUrl(translation?.audio_url ?? row.audio_url, locale)

  return {
    id: String(row.id),
    name,
    lat: row.latitude,
    lng: row.longitude,
    audio_url: audioUrl,
    image_url: row.image_url ?? null,
    locale,
    source: (row.source as LandmarkSource | null) ?? undefined,
    landmark_type: row.landmark_type ?? undefined,
    importance_tier: (row.importance_tier as ImportanceTier | null) ?? undefined,
    importance_score: row.importance_score ?? undefined,
  }
}

export const mapLocationToLandmark = (row: LocationRow, locale: AppLocale = DEFAULT_LOCALE): Landmark => {
  const pin = mapLocationToMapPin(row, locale)
  const images = parseImages(row.images)
  const translation = pickTranslation(row.location_translations, locale)
  const storyPrompt = translation?.story_prompt ?? row.story_prompt

  return {
    ...pin,
    story_prompt: storyPrompt,
    image_url: pin.image_url ?? images[0]?.url ?? null,
    images,
  }
}
