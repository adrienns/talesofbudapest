import { scoreHistoricalImportance } from '../scorers/historicalImportance.js'
import type { Budapest100MapAnchor } from '../types/mapAnchor.js'
import { buildAnchorFromHtml } from './buildAnchor.js'
import { buildHouseUrl, sleep } from './constants.js'
import { fetchPage } from './fetchPage.js'
import { discoverNearbySlugs } from './parseHousePage.js'

export type CrawlOptions = {
  seedSlugs: string[]
  maxPages: number
  fetchDelayMs: number
  geocodeDelayMs: number
  geocode: boolean
  fortepan: boolean
  skipSlugs?: Set<string>
  refreshSlugs?: Set<string>
  onProgress?: (slug: string, index: number, total: number) => void
}

export const crawlHouses = async (options: CrawlOptions): Promise<Budapest100MapAnchor[]> => {
  const queue = [...options.seedSlugs, ...(options.refreshSlugs ? [...options.refreshSlugs] : [])]
  const visited = new Set<string>(options.skipSlugs ?? [])
  const anchors: Budapest100MapAnchor[] = []
  const targetCount = options.maxPages + (options.refreshSlugs?.size ?? 0)

  while (queue.length > 0 && anchors.length < targetCount) {
    const slug = queue.shift()
    if (!slug) {
      continue
    }

    const isRefresh = options.refreshSlugs?.has(slug) ?? false
    if (!isRefresh && visited.has(slug)) {
      continue
    }

    visited.add(slug)
    const index = anchors.length + 1
    options.onProgress?.(slug, index, targetCount)

    let html: string
    try {
      html = await fetchPage(buildHouseUrl(slug))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Skipping ${slug}: ${message}`)
      continue
    }

    const nearby = discoverNearbySlugs(html)

    if (!isRefresh) {
      for (const nextSlug of nearby) {
        if (!visited.has(nextSlug) && !queue.includes(nextSlug)) {
          queue.push(nextSlug)
        }
      }
    }

    const anchor = await buildAnchorFromHtml(html, slug, {
      geocode: options.geocode,
      fortepan: options.fortepan,
    })

    const importance = scoreHistoricalImportance(anchor)
    anchors.push({
      ...anchor,
      importanceScore: importance.score,
      importanceTier: importance.tier,
      importanceReasons: importance.reasons,
    })

    if (options.geocode && options.geocodeDelayMs > 0) {
      await sleep(options.geocodeDelayMs)
    }

    if (options.fetchDelayMs > 0) {
      await sleep(options.fetchDelayMs)
    }
  }

  return anchors.sort((a, b) => b.importanceScore - a.importanceScore)
}
