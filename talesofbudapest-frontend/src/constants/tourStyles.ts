export const TOUR_STYLE_IDS = ['easy', 'storyteller', 'deep-dive'] as const

export type TourStyleId = (typeof TOUR_STYLE_IDS)[number]

export const DEFAULT_TOUR_STYLE_ID: TourStyleId = 'storyteller'

export const isTourStyleId = (value: string): value is TourStyleId =>
  (TOUR_STYLE_IDS as readonly string[]).includes(value)
