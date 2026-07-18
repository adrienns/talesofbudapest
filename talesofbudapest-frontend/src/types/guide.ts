export type GuideChatSource = {
  landmarkId: string
  name: string
}

export type GuideChatAction =
  | { type: 'show_landmark'; label: string; landmarkId: string }
  | { type: 'create_tour'; label: string; intent: string }

export type GuideChatContext = {
  locale: 'en' | 'hu'
  mapCenter?: { lat: number; lng: number }
  selectedLandmarkId?: string
  activeChapterId?: string
}

export type GuideChatResponse = {
  answer: string
  sources: GuideChatSource[]
  actions: GuideChatAction[]
}

export type GuideMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: GuideChatSource[]
  actions?: GuideChatAction[]
}
