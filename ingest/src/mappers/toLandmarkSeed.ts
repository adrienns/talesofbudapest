import type { Budapest100MapAnchor } from '../types/mapAnchor.js'
import type { LandmarkSeed } from '../types/landmark.js'
import { buildTranslations } from '../types/landmark.js'
import { computeHistoryDepth } from '../lib/historyDepth.js'

const buildStoryPrompt = (anchor: Budapest100MapAnchor): string => {
  const parts: string[] = []

  if (anchor.constructionYear) {
    parts.push(`Built in ${anchor.constructionYear}.`)
  }

  if (anchor.architect) {
    parts.push(`Architect: ${anchor.architect}.`)
  }

  if (anchor.historicalStories.length > 0) {
    parts.push(anchor.historicalStories.join('\n\n'))
  }

  return parts.join(' ').trim()
}

const buildSourceMaterial = (anchor: Budapest100MapAnchor): string => {
  const parts: string[] = []

  if (anchor.constructionYear) {
    parts.push(`Építés éve: ${anchor.constructionYear}`)
  }

  if (anchor.architect) {
    parts.push(`Építész: ${anchor.architect}`)
  }

  if (anchor.historicalStories.length > 0) {
    parts.push(anchor.historicalStories.join('\n\n'))
  }

  return parts.join('\n\n').trim()
}

const collectImageUrls = (anchor: Budapest100MapAnchor): string[] => {
  const seen = new Set<string>()
  const urls: string[] = []

  for (const url of [...anchor.imageUrls, ...anchor.fortepanImageUrls]) {
    if (!seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }

  return urls
}

export const toLandmarkSeed = (anchor: Budapest100MapAnchor): LandmarkSeed | null => {
  if (anchor.lat == null || anchor.lng == null) {
    return null
  }

  const imageUrls = collectImageUrls(anchor)

  const storyPrompt = buildStoryPrompt(anchor)
  const sourceMaterial = buildSourceMaterial(anchor)
  const historyDepth = computeHistoryDepth(sourceMaterial || storyPrompt)

  return {
    source: 'budapest100',
    external_id: anchor.slug,
    landmark_type: 'house',
    name: anchor.name,
    lat: anchor.lat,
    lng: anchor.lng,
    story_prompt: storyPrompt,
    source_material: sourceMaterial || undefined,
    history_depth: historyDepth,
    image_url: imageUrls[0] ?? null,
    images: imageUrls.map((url) => ({
      url,
      alt: anchor.name,
    })),
    translations: buildTranslations([
      { locale: 'hu', name: anchor.name, story_prompt: sourceMaterial || storyPrompt },
      { locale: 'en', name: anchor.name, story_prompt: storyPrompt },
    ]),
    importance_tier: anchor.importanceTier,
    importance_score: anchor.importanceScore,
  }
}

export const toLandmarkSeeds = (anchors: Budapest100MapAnchor[]): LandmarkSeed[] =>
  anchors.flatMap((anchor) => {
    const seed = toLandmarkSeed(anchor)
    return seed ? [seed] : []
  })
