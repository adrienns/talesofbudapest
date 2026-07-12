export type LandmarkSource = 'budapest100' | 'muemlekem' | 'wikipedia' | 'iconic'

export type LandmarkType = 'house' | 'monument' | 'statue' | 'building' | 'iconic'

export type ImportanceTier = 'featured' | 'standard' | 'archive' | 'skip'

export type HistoryDepth = 'thin' | 'standard' | 'rich'

export type AppLocale = 'en' | 'hu'

export type LandmarkTranslationSeed = {
  locale: AppLocale
  name: string
  story_prompt: string
}

export type LandmarkSeed = {
  source: LandmarkSource
  external_id: string
  landmark_type: LandmarkType
  name: string
  lat: number
  lng: number
  story_prompt: string
  image_url: string | null
  images: { url: string; alt?: string }[]
  translations: LandmarkTranslationSeed[]
  importance_tier?: ImportanceTier
  importance_score?: number
  source_material?: string
  history_depth?: HistoryDepth
}

export const SOURCE_PRIORITY: Record<LandmarkSource, number> = {
  wikipedia: 4,
  iconic: 3,
  muemlekem: 2,
  budapest100: 1,
}

export const buildTranslations = (
  entries: LandmarkTranslationSeed[],
): LandmarkTranslationSeed[] => {
  const seen = new Set<AppLocale>()
  return entries.filter((entry) => {
    if (seen.has(entry.locale)) {
      return false
    }

    seen.add(entry.locale)
    return true
  })
}
