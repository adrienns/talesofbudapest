export const NARRATIVE_GREETINGS = [
  'What narrative shall we weave?',
  'What secrets shall we uncover?',
  'Where shall our story begin today?',
] as const

export const GENERATING_MESSAGES = [
  'Weaving your custom narrative…',
  'Baking neural voice stream…',
  'Tracing footsteps through history…',
  'Summoning the master historian…',
] as const

export const PROMPT_BAR_PLACEHOLDER = 'Weave a new historical narrative…'

export const LAST_NARRATIVE_STORAGE_KEY = 'tob:lastNarrativeId'

/** Per-narrative chapter progress, so resuming picks up where you left off. */
export const lastNarrativeChapterKey = (narrativeId: string): string =>
  `tob:lastChapterIndex:${narrativeId}`

/** Per-stop audio position, so a visitor can continue a story after reopening the app. */
export const narrativePlaybackPositionKey = (narrativeId: string, chapterId: string): string =>
  `tob:playbackPosition:${narrativeId}:${chapterId}`
