export type NarrativeChapter = {
  id: string
  chapterIndex: number
  title: string
  lat: number
  lng: number
  audioUrl: string | null
  imageUrl: string | null
  landmarkId?: string | null
  script?: string | null
}

export type WalkingRoute = {
  /** Leaflet coordinate order: [latitude, longitude]. */
  geometry: [number, number][]
  distanceMeters: number
  durationSeconds: number
}

export type NarrativeRoute = {
  id: string
  title: string
  chapters: NarrativeChapter[]
  walkingRoute?: WalkingRoute | null
}

export type NarrativeSummary = {
  id: string
  title: string
  userPrompt: string
  createdAt: string
  chapterCount: number
}

export type NarrativeContext = {
  hour?: number
  userLat?: number | null
  userLng?: number | null
  locale?: 'en' | 'hu'
  /** Questionnaire picks — forwarded verbatim into the LLM prompt context. */
  timeBudgetMinutes?: number
  styleId?: string
  topicIds?: string[]
  /** User asked the tour to start from their current location. */
  nearMe?: boolean
}

/** A single planned stop before audio has been synthesized. */
export type DraftChapter = {
  chapterIndex: number
  title: string
  lat: number
  lng: number
  script: string
  landmarkId: string | null
  imageUrl: string | null
}

/** The output of `/api/narratives/plan` — previewable, not yet persisted or narrated. */
export type DraftNarrative = {
  title: string
  userPrompt: string
  context: NarrativeContext
  chapters: DraftChapter[]
  walkingRoute?: WalkingRoute | null
}

export type NarrativeFlowState =
  | 'idle'
  | 'eliciting'
  | 'planning'
  | 'previewing'
  | 'generating'
  | 'ready'
  | 'error'

export type PlaybackItem = {
  id: string
  title: string
  subtitle?: string
  chapterLabel?: string
  audioUrl: string | null
  imageUrl: string | null
  imageAlt?: string
  script?: string | null
  lat: number
  lng: number
}
