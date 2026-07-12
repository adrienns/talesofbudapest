import type { Budapest100MapAnchor } from '../types/mapAnchor.js'

export type ImportanceTier = 'featured' | 'standard' | 'archive' | 'skip'

export type ImportanceResult = {
  score: number
  tier: ImportanceTier
  reasons: string[]
}

const CENTENNIAL_YEAR_MIN = 1916
const CENTENNIAL_YEAR_MAX = 1926

const EVENT_PATTERNS = [
  /háború/i,
  /megszállás/i,
  /forradalom/i,
  /műemlék/i,
  /építész/i,
  /egyetem/i,
  /kórház/i,
  /Steindl/i,
  /Lechner/i,
  /Hauszmann/i,
  /Pollack/i,
]

const isPlausibleArchitect = (architect: string | null): boolean => {
  if (!architect) {
    return false
  }

  if (architect.length > 60) {
    return false
  }

  if (/\.|adatok alapján|lakóházat az a/i.test(architect)) {
    return false
  }

  return true
}

const scoreStoryDepth = (storyChars: number, reasons: string[]): number => {
  if (storyChars === 0) {
    return 0
  }

  if (storyChars > 1500) {
    reasons.push('story:rich (>1500 chars)')
    return 35
  }

  if (storyChars > 800) {
    reasons.push('story:detailed (>800 chars)')
    return 25
  }

  if (storyChars > 300) {
    reasons.push('story:moderate (>300 chars)')
    return 15
  }

  reasons.push('story:thin')
  return 5
}

const scoreEventKeywords = (storyText: string, reasons: string[]): number => {
  const hits = EVENT_PATTERNS.filter((pattern) => pattern.test(storyText)).length
  if (hits === 0) {
    return 0
  }

  const points = Math.min(hits * 5, 20)
  reasons.push(`events:${hits} keyword hits`)
  return points
}

export const scoreHistoricalImportance = (anchor: Budapest100MapAnchor): ImportanceResult => {
  const reasons: string[] = []
  const storyText = anchor.historicalStories.join(' ')
  const storyChars = storyText.length

  let score = 0
  score += scoreStoryDepth(storyChars, reasons)

  if (isPlausibleArchitect(anchor.architect)) {
    score += 15
    reasons.push(`architect:${anchor.architect}`)
  }

  const openHousePoints = Math.min(anchor.openHouseYears.length * 5, 10)
  if (openHousePoints > 0) {
    score += openHousePoints
    reasons.push(`openHouse:${anchor.openHouseYears.length} years`)
  }

  score += scoreEventKeywords(storyText, reasons)

  if (
    anchor.constructionYear != null &&
    anchor.constructionYear >= CENTENNIAL_YEAR_MIN &&
    anchor.constructionYear <= CENTENNIAL_YEAR_MAX
  ) {
    score += 10
    reasons.push(`era:centennial (${anchor.constructionYear})`)
  }

  if (anchor.geocodeStatus === 'ok') {
    score += 10
    reasons.push('geocode:ok')
  }

  if (storyChars === 0) {
    score = Math.min(score, 10)
    reasons.push('penalty:no story')
  }

  if (anchor.geocodeStatus !== 'ok') {
    return { score, tier: 'skip', reasons: [...reasons, 'tier:skip (no geocode)'] }
  }

  if (score >= 70) {
    return { score, tier: 'featured', reasons: [...reasons, 'tier:featured'] }
  }

  if (score >= 40) {
    return { score, tier: 'standard', reasons: [...reasons, 'tier:standard'] }
  }

  if (score >= 15) {
    return { score, tier: 'archive', reasons: [...reasons, 'tier:archive'] }
  }

  return { score, tier: 'skip', reasons: [...reasons, 'tier:skip (low score)'] }
}
