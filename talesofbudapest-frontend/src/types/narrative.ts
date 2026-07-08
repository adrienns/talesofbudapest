export type NarrativeChapter = {
  id: string
  chapterIndex: number
  title: string
  lat: number
  lng: number
  audioUrl: string | null
  imageUrl: string | null
}

export type NarrativeRoute = {
  id: string
  title: string
  chapters: NarrativeChapter[]
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
}

export type NarrativeFlowState = 'idle' | 'eliciting' | 'generating' | 'ready' | 'error'

export type PlaybackItem = {
  id: string
  title: string
  subtitle?: string
  chapterLabel?: string
  audioUrl: string | null
  imageUrl: string | null
  imageAlt?: string
  lat: number
  lng: number
}
