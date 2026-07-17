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
  /** Application coordinate order: [latitude, longitude]. */
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
  /** Structured questionnaire values; the server turns these into an LLM request. */
  timeBudgetMinutes?: number
  styleId?: string
  topicIds?: string[]
  /** Optional visitor wording that refines the structured questionnaire picks. */
  intent?: string
  /** User asked the tour to start from their current location. */
  nearMe?: boolean
}

export type NarrativeRequest = Pick<NarrativeContext, 'timeBudgetMinutes' | 'styleId' | 'topicIds' | 'intent' | 'nearMe'>

/** A single planned stop before audio has been synthesized. */
export type DraftChapter = {
  draftChapterIndex: number
  chapterIndex: number
  title: string
  lat: number
  lng: number
  hook?: string | null
  script?: string | null
  landmarkId: string | null
  imageUrl: string | null
}

/** The output of `/api/narratives/plan` — previewable, not yet persisted or narrated. */
export type DraftNarrative = {
  id: string
  title: string
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
  landmarkId?: string | null
  script?: string | null
  lat: number
  lng: number
}
