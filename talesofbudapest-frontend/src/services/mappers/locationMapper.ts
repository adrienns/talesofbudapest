import type { Landmark, LandmarkImage, MapPin } from '@/types'
import type { AppLocale } from '@/types/locale'
import type { ImportanceTier, LandmarkSource, MapTheme } from '@/types/landmark'
import { DEFAULT_LOCALE } from '@/types/locale'

export type LocationTranslationRow = {
  locale: string
  name: string
  story_prompt?: string
  audio_url?: string | null
  audio_script?: string | null
  historical_narrative?: string | null
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

export type LocationAudioVariantRow = {
  locale: string
  style_id: string
  audio_script?: string | null
  audio_url?: string | null
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
  location_audio_variants?: LocationAudioVariantRow[] | null
}

const normalizeAudioUrl = (audioUrl: string | null | undefined, locale: AppLocale): string | null => {
  if (!audioUrl) {
    return null
  }

  const escapedLocale = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const filePattern = new RegExp(`-tour-${escapedLocale}(?:-v\\d+-[a-z0-9-]+)?\\.mp3(?:$|[?#])`, 'iu')
  return filePattern.test(audioUrl) ? audioUrl : null
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
  location_translations?: LocationTranslationRow[] | null
  location_media?: LocationMediaRow[] | null
  location_audio_variants?: LocationAudioVariantRow[] | null
}

const primaryApprovedMedia = (row: { location_media?: LocationMediaRow[] | null }) =>
  (row.location_media ?? [])
    .filter((item) => item.review_status === 'approved' && item.commercial_use_allowed)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null

const parseImages = (value: unknown): LandmarkImage[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || !('url' in item)) return []
    const url = normalizeLegacyImageUrl(String(item.url))
    if (!url) return []
    const alt = 'alt' in item && item.alt != null ? String(item.alt) : undefined
    return [{ url, alt }]
  })
}

const normalizeLegacyImageUrl = (url: string | null | undefined) => {
  if (!url) return null
  return url.replace(/^http:\/\/budapest100\.hu\//iu, 'https://budapest100.hu/')
}

const legacyImageAttribution = (row: { source?: string | null; image_url?: string | null }) => {
  const sourceUrl = normalizeLegacyImageUrl(row.image_url)
  if (!sourceUrl) return undefined
  const author = row.source === 'budapest100'
    ? 'Budapest100'
    : row.source === 'wikipedia'
      ? 'Wikipedia / Wikimedia source'
      : row.source === 'muemlekem'
        ? 'Műemlékem'
        : 'Legacy landmark source'
  return {
    author,
    license: row.source === 'budapest100' ? 'Permission pending' : 'Licence review pending',
    sourceUrl,
  }
}

const resolveLocationAudio = (row: MapPinRow, locale: AppLocale) => {
  const translation = pickTranslation(row.location_translations, locale)
  const variants = (row.location_audio_variants ?? []).filter((item) => item.locale === locale && item.audio_url)
  const preferredVariant = variants.find((item) => item.style_id === 'storyteller')
  const fallbackVariant = variants.find((item) => item.style_id === 'easy') ?? variants[0]
  const candidates = [preferredVariant?.audio_url, translation?.audio_url, row.audio_url, fallbackVariant?.audio_url]
  const audioUrl = candidates.map((item) => normalizeAudioUrl(item, locale)).find(Boolean) ?? null
  const selectedVariant = variants.find((item) => item.audio_url === audioUrl) ?? null
  return { audioUrl, audioScript: selectedVariant?.audio_script ?? null, translation }
}

export const mapLocationToMapPin = (row: MapPinRow, locale: AppLocale = DEFAULT_LOCALE): MapPin => {
  const { audioUrl, translation } = resolveLocationAudio(row, locale)
  const name = translation?.name ?? row.name
  const media = primaryApprovedMedia(row)
  const imageUrl = media?.url ?? normalizeLegacyImageUrl(row.image_url)

  return {
    id: String(row.id),
    name,
    lat: row.latitude,
    lng: row.longitude,
    audio_url: audioUrl,
    image_url: imageUrl,
    image_attribution: media ? {
      author: media.author ?? 'Unknown author',
      license: media.license ?? 'Licence not specified',
      licenseUrl: media.license_url ?? undefined,
      sourceUrl: media.source_url ?? '',
    } : legacyImageAttribution(row),
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
  const { audioScript, translation } = resolveLocationAudio(row, locale)
  const storyPrompt = audioScript
    ?? translation?.audio_script
    ?? translation?.historical_narrative
    ?? translation?.story_prompt
    ?? row.story_prompt
    ?? ''
  const legacyImages = parseImages(row.images)
  const imageUrl = media?.url ?? normalizeLegacyImageUrl(row.image_url) ?? legacyImages[0]?.url ?? null

  return {
    ...pin,
    story_prompt: storyPrompt,
    image_url: imageUrl,
    images: media ? [{ url: media.url, alt: media.alt_text ?? undefined }] : legacyImages,
  }
}
