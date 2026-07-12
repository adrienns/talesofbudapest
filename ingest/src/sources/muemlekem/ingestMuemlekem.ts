import { geocodeAddress } from '../../enrich/geocode.js'
import type { LandmarkSeed } from '../../types/landmark.js'
import { buildTranslations } from '../../types/landmark.js'
import { computeHistoryDepth } from '../../lib/historyDepth.js'
import type { ImportanceTier } from '../../scorers/historicalImportance.js'
import {
  coordinatesFromDetail,
  fetchAllMuemlekemListItems,
  fetchMuemlekemDetail,
  type MuemlekemDetail,
} from './parseMuemlekem.js'
import { inferLandmarkType, scoreMonumentImportance } from '../../scorers/monumentImportance.js'
import { sleep } from '../../scraper/constants.js'

export type MuemlekemAnchor = {
  source: 'muemlekem'
  external_id: string
  name: string
  address: string
  city: string
  category: string | null
  protectionStatus: string | null
  shortDescription: string
  longDescription: string
  lat: number | null
  lng: number | null
  geocodeStatus: 'ok' | 'failed' | 'skipped'
  imageUrls: string[]
  landmark_type: LandmarkSeed['landmark_type']
  importanceScore: number
  importanceTier: ImportanceTier
  importanceReasons: string[]
  scrapedAt: string
}

const buildStoryPrompt = (detail: MuemlekemDetail): string => {
  const parts = [detail.shortDescription, detail.longDescription].filter(Boolean)
  if (detail.protectionStatus) {
    parts.unshift(`Protection status: ${detail.protectionStatus}.`)
  }

  if (detail.category) {
    parts.unshift(`Category: ${detail.category}.`)
  }

  return parts.join('\n\n').trim()
}

const buildSourceMaterial = (anchor: MuemlekemAnchor): string => {
  return [anchor.shortDescription, anchor.longDescription].filter(Boolean).join('\n\n').trim()
}

export const toMuemlekemLandmarkSeed = (anchor: MuemlekemAnchor): LandmarkSeed | null => {
  if (anchor.lat == null || anchor.lng == null) {
    return null
  }

  const storyPrompt = buildStoryPrompt({
      id: anchor.external_id,
      name: anchor.name,
      address: anchor.address,
      city: anchor.city,
      category: anchor.category,
      protectionStatus: anchor.protectionStatus,
      shortDescription: anchor.shortDescription,
      longDescription: anchor.longDescription,
      coordinateText: null,
      imageUrls: anchor.imageUrls,
    })
  const sourceMaterial = buildSourceMaterial(anchor)
  const historyDepth = computeHistoryDepth(sourceMaterial || storyPrompt)

  return {
    source: 'muemlekem',
    external_id: anchor.external_id,
    landmark_type: anchor.landmark_type,
    name: anchor.name,
    lat: anchor.lat,
    lng: anchor.lng,
    story_prompt: storyPrompt,
    source_material: sourceMaterial || undefined,
    history_depth: historyDepth,
    image_url: anchor.imageUrls[0] ?? null,
    images: anchor.imageUrls.map((url) => ({ url, alt: anchor.name })),
    translations: buildTranslations([
      { locale: 'hu', name: anchor.name, story_prompt: sourceMaterial || storyPrompt },
      { locale: 'en', name: anchor.name, story_prompt: storyPrompt },
    ]),
    importance_tier: anchor.importanceTier,
    importance_score: anchor.importanceScore,
  }
}

export const ingestMuemlekemCity = async (options: {
  city: string
  maxItems: number
  geocode: boolean
  fetchDelayMs: number
  existingIds?: Set<string>
  onProgress?: (current: number, total: number, name: string) => void
  onCheckpoint?: (anchors: MuemlekemAnchor[]) => Promise<void>
}): Promise<MuemlekemAnchor[]> => {
  const listItems = await fetchAllMuemlekemListItems(options.city, 100, 50)
  const selected = listItems
    .filter((item) => !options.existingIds?.has(item.id))
    .slice(0, options.maxItems > 0 ? options.maxItems : listItems.length)
  const anchors: MuemlekemAnchor[] = []

  for (const [index, listItem] of selected.entries()) {
    options.onProgress?.(index + 1, selected.length, listItem.name)

    try {
      const detail = await fetchMuemlekemDetail(listItem)
      let lat: number | null = null
      let lng: number | null = null
      let geocodeStatus: MuemlekemAnchor['geocodeStatus'] = 'skipped'

      const parsedCoords = coordinatesFromDetail(detail)
      if (parsedCoords) {
        lat = parsedCoords.lat
        lng = parsedCoords.lng
        geocodeStatus = 'ok'
      } else if (options.geocode && detail.address) {
        const geocoded = await geocodeAddress(`${detail.address}, ${options.city}, Hungary`)
        lat = geocoded.lat
        lng = geocoded.lng
        geocodeStatus = geocoded.geocodeStatus
        await sleep(options.fetchDelayMs)
      }

      const importance = scoreMonumentImportance(detail, geocodeStatus === 'ok')
      anchors.push({
        source: 'muemlekem',
        external_id: detail.id,
        name: detail.name,
        address: detail.address,
        city: detail.city,
        category: detail.category,
        protectionStatus: detail.protectionStatus,
        shortDescription: detail.shortDescription,
        longDescription: detail.longDescription,
        lat,
        lng,
        geocodeStatus,
        imageUrls: detail.imageUrls,
        landmark_type: inferLandmarkType(detail),
        importanceScore: importance.score,
        importanceTier: importance.tier,
        importanceReasons: importance.reasons,
        scrapedAt: new Date().toISOString(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Skipping ${listItem.name}: ${message}`)
    }

    await sleep(options.fetchDelayMs)

    if (options.onCheckpoint && (index + 1) % 25 === 0) {
      await options.onCheckpoint(anchors)
    }
  }

  return anchors.sort((a, b) => b.importanceScore - a.importanceScore)
}
