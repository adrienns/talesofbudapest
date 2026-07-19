import type { Landmark, MapPin } from '@/types'
import type { AppLocale } from '@/types/locale'
import type { ImportanceTier, LandmarkSource, MapTheme } from '@/types/landmark'
import { audioTourFileSuffix, DEFAULT_LOCALE } from '@/types/locale'

export type LocationTranslationRow = {
  locale: string
  name: string
  story_prompt?: string
  audio_url?: string | null
}

export type LocationMediaRow = {
  url: string
  alt_text?: string | null
  author?: string | null
  source_url?: string | null
  license?: string | null
  license_url?: string | null
  sort_order?: number | null
  review_status: string
  commercial_use_allowed: boolean
}

export type LocationRow = {
  id: string | number
  name: string
  latitude: number
  longitude: number
  story_prompt?: string
  audio_url?: string | null
  image_url?: string | null
  images?: unknown
  source?: string | null
  landmark_type?: string | null
  map_theme?: string | null
  importance_tier?: string | null
  importance_score?: number | null
  location_translations?: LocationTranslationRow[] | null
  location_media?: LocationMediaRow[] | null
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
  map_theme?: string | null
  importance_tier?: string | null
  importance_score?: number | null
  location_translations?: Pick<LocationTranslationRow, 'locale' | 'name' | 'audio_url'>[] | null
  location_media?: LocationMediaRow[] | null
}

const primaryApprovedMedia = (row: { location_media?: LocationMediaRow[] | null }) =>
  (row.location_media ?? [])
    .filter((item) => item.review_status === 'approved' && item.commercial_use_allowed)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null

export const mapLocationToMapPin = (row: MapPinRow, locale: AppLocale = DEFAULT_LOCALE): MapPin => {
  const translation = pickTranslation(row.location_translations, locale)
  const name = translation?.name ?? row.name
  const audioUrl = normalizeAudioUrl(translation?.audio_url ?? row.audio_url, locale)
  const media = primaryApprovedMedia(row)

  return {
    id: String(row.id),
    name,
    lat: row.latitude,
    lng: row.longitude,
    audio_url: audioUrl,
    image_url: media?.url ?? null,
    image_attribution: media ? {
      author: media.author ?? 'Unknown author',
      license: media.license ?? 'Licence not specified',
      licenseUrl: media.license_url ?? undefined,
      sourceUrl: media.source_url ?? '',
    } : undefined,
    locale,
    source: (row.source as LandmarkSource | null) ?? undefined,
    landmark_type: row.landmark_type ?? undefined,
    map_theme: (row.map_theme as MapTheme | null) ?? undefined,
    importance_tier: (row.importance_tier as ImportanceTier | null) ?? undefined,
    importance_score: row.importance_score ?? undefined,
  }
}

export const mapLocationToLandmark = (row: LocationRow, locale: AppLocale = DEFAULT_LOCALE): Landmark => {
  const pin = mapLocationToMapPin(row, locale)
  const media = primaryApprovedMedia(row)
  const translation = pickTranslation(row.location_translations, locale)
  const storyPrompt = translation?.story_prompt ?? row.story_prompt ?? ''

  return {
    ...pin,
    story_prompt: storyPrompt,
    image_url: media?.url ?? null,
    images: media ? [{ url: media.url, alt: media.alt_text ?? undefined }] : [],
  }
}
