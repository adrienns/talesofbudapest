import type { LandmarkSeed } from '../../types/landmark.js'
import { buildTranslations } from '../../types/landmark.js'
import { computeHistoryDepth } from '../../lib/historyDepth.js'
import type { WikidataLandmark } from './fetchWikidata.js'
import { isInBudapestBounds, type CuratedLandmark } from './curatedLandmarks.js'

const buildStoryPrompt = (landmark: WikidataLandmark): string => {
  const parts: string[] = []

  if (landmark.inceptionYear) {
    parts.push(`Built or opened in ${landmark.inceptionYear}.`)
  }

  if (landmark.description) {
    parts.push(landmark.description)
  }

  if (landmark.wikipediaExtract) {
    parts.push(landmark.wikipediaExtract)
  }

  return parts.join('\n\n').trim()
}

export const toWikipediaLandmarkSeed = (
  landmark: WikidataLandmark,
  curated: CuratedLandmark,
): LandmarkSeed => {
  const imageUrl = landmark.wikipediaImageUrl ?? landmark.imageUrl
  const storyPrompt = buildStoryPrompt(landmark)
  const sourceMaterial = storyPrompt
  const historyDepth = computeHistoryDepth(sourceMaterial)
  const images = [landmark.wikipediaImageUrl, landmark.imageUrl]
    .filter((url): url is string => Boolean(url))
    .map((url) => ({ url, alt: landmark.name }))

  const translations = buildTranslations([
    {
      locale: 'en',
      name: landmark.nameEn ?? landmark.name,
      story_prompt: storyPrompt,
    },
    ...(landmark.nameHu
      ? [{ locale: 'hu' as const, name: landmark.nameHu, story_prompt: storyPrompt }]
      : []),
  ])

  return {
    source: 'wikipedia',
    external_id: landmark.qId,
    landmark_type: curated.landmarkType,
    name: landmark.nameEn ?? landmark.name,
    lat: landmark.lat,
    lng: landmark.lng,
    story_prompt: storyPrompt,
    source_material: sourceMaterial,
    history_depth: historyDepth,
    image_url: imageUrl,
    images,
    translations,
    importance_tier: 'featured',
    importance_score: 100,
  }
}
