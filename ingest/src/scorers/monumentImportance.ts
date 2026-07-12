import type { ImportanceTier } from './historicalImportance.js'
import type { MuemlekemDetail } from '../sources/muemlekem/parseMuemlekem.js'

export type MonumentImportanceResult = {
  score: number
  tier: ImportanceTier
  reasons: string[]
}

const CATEGORY_BONUS: Array<{ pattern: RegExp; points: number; label: string }> = [
  { pattern: /plasztika|szobor|emlékmű|kereszt/i, points: 20, label: 'category:sculpture' },
  { pattern: /szakrális|templom|bazilika|zsinagóga/i, points: 15, label: 'category:sacred' },
  { pattern: /középület|kastély|palota|múzeum/i, points: 12, label: 'category:public' },
  { pattern: /híd|állomás|pályaudvar/i, points: 10, label: 'category:infrastructure' },
]

const inferLandmarkType = (
  detail: MuemlekemDetail,
): 'monument' | 'statue' | 'building' => {
  const text = `${detail.category ?? ''} ${detail.name}`.toLowerCase()
  if (/plasztika|szobor|emlékmű|kereszt|szobor/i.test(text)) {
    return 'statue'
  }

  if (/emlék|tér|híd|park|terület/i.test(text)) {
    return 'monument'
  }

  return 'building'
}

export const scoreMonumentImportance = (
  detail: MuemlekemDetail,
  hasCoordinates: boolean,
): MonumentImportanceResult => {
  const reasons: string[] = []
  const description = `${detail.shortDescription} ${detail.longDescription}`.trim()
  const descriptionLength = description.length
  let score = 0

  if (!hasCoordinates) {
    return { score: 0, tier: 'skip', reasons: ['tier:skip (no coordinates)'] }
  }

  if (descriptionLength === 0) {
    return { score: 0, tier: 'skip', reasons: ['tier:skip (no description)'] }
  }

  if (descriptionLength > 1200) {
    score += 35
    reasons.push('description:rich')
  } else if (descriptionLength > 400) {
    score += 25
    reasons.push('description:detailed')
  } else if (descriptionLength > 120) {
    score += 15
    reasons.push('description:moderate')
  } else {
    score += 5
    reasons.push('description:thin')
  }

  if (/műemléki védelem/i.test(detail.protectionStatus ?? '')) {
    score += 15
    reasons.push('protection:state')
  } else if (/helyi védelem/i.test(detail.protectionStatus ?? '')) {
    score += 8
    reasons.push('protection:local')
  }

  for (const bonus of CATEGORY_BONUS) {
    if (bonus.pattern.test(`${detail.category ?? ''} ${detail.name}`)) {
      score += bonus.points
      reasons.push(bonus.label)
      break
    }
  }

  if (detail.imageUrls.length > 0) {
    score += 5
    reasons.push('images:present')
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

export { inferLandmarkType }
