export type ImportanceTier = 'featured' | 'standard' | 'archive' | 'skip'

export type LandmarkSource = 'budapest100' | 'muemlekem' | 'wikipedia' | 'iconic'

export type MapTheme = 'history' | 'architecture'

export type LandmarkImage = {
  url: string
  alt?: string
}

/** Slim shape for map pins — no story text. */
export type MapPin = {
  id: string
  name: string
  lat: number
  lng: number
  audio_url: string | null
  image_url: string | null
  locale?: 'en' | 'hu'
  source?: LandmarkSource
  landmark_type?: string
  map_theme?: MapTheme
  importance_tier?: ImportanceTier
  importance_score?: number | null
}

/** Full landmark with narrative/audio fields (loaded on demand). */
export type Landmark = MapPin & {
  story_prompt: string
  images: LandmarkImage[]
}
