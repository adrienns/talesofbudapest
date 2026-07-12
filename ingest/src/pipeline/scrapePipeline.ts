import { readJson } from '../export/readJson.js'
import { writeJson } from '../export/writeJson.js'
import { toLandmarkSeeds } from '../mappers/toLandmarkSeed.js'
import { crawlHouses, type CrawlOptions } from '../scraper/crawlHouses.js'
import {
  fetchAllSitemapSlugs,
  pickSitemapSeeds,
} from '../scraper/discoverSitemapSlugs.js'
import type { ImportanceTier } from '../scorers/historicalImportance.js'
import type { Budapest100MapAnchor } from '../types/mapAnchor.js'

export type ScrapePipelineOptions = {
  seeds: string[]
  maxPages: number
  fetchDelayMs: number
  geocodeDelayMs: number
  geocode: boolean
  fortepan: boolean
  minTier: ImportanceTier
  sitemapSeeds: number
  append: boolean
  refreshExisting: boolean
  output: string
  seedsOutput: string
}

const TIER_RANK: Record<ImportanceTier, number> = {
  featured: 3,
  standard: 2,
  archive: 1,
  skip: 0,
}

const meetsMinTier = (tier: ImportanceTier, minTier: ImportanceTier): boolean =>
  TIER_RANK[tier] >= TIER_RANK[minTier]

const mergeAnchors = (
  existing: Budapest100MapAnchor[],
  scraped: Budapest100MapAnchor[],
): Budapest100MapAnchor[] => {
  const bySlug = new Map<string, Budapest100MapAnchor>()

  for (const anchor of existing) {
    bySlug.set(anchor.slug, anchor)
  }

  for (const anchor of scraped) {
    bySlug.set(anchor.slug, anchor)
  }

  return [...bySlug.values()].sort((a, b) => b.importanceScore - a.importanceScore)
}

export const runScrapePipeline = async (
  options: ScrapePipelineOptions,
): Promise<{ anchors: Budapest100MapAnchor[]; seeds: ReturnType<typeof toLandmarkSeeds> }> => {
  const existing = options.append ? await readJson<Budapest100MapAnchor[]>(options.output) : null
  const existingAnchors = existing ?? []
  const existingSlugs = new Set(existingAnchors.map((anchor) => anchor.slug))

  let seedSlugs = [...options.seeds]

  if (options.sitemapSeeds > 0) {
    console.log(`Fetching sitemap slugs (target ${options.sitemapSeeds} new seeds)...`)
    const allSitemapSlugs = await fetchAllSitemapSlugs()
    const sitemapSeeds = pickSitemapSeeds(allSitemapSlugs, options.sitemapSeeds, existingSlugs)
    seedSlugs = [...new Set([...seedSlugs, ...sitemapSeeds])]
    console.log(`Added ${sitemapSeeds.length} sitemap seed(s).`)
  }

  const refreshSlugs = options.refreshExisting
    ? new Set(existingAnchors.map((anchor) => anchor.slug))
    : undefined

  const crawlOptions: CrawlOptions = {
    seedSlugs,
    maxPages: options.maxPages,
    fetchDelayMs: options.fetchDelayMs,
    geocodeDelayMs: options.geocodeDelayMs,
    geocode: options.geocode,
    fortepan: options.fortepan,
    skipSlugs: options.append ? existingSlugs : undefined,
    refreshSlugs,
    onProgress: (slug, index, total) => {
      console.log(`Scraping ${slug} (${index}/${total})...`)
    },
  }

  const scraped = await crawlHouses(crawlOptions)
  const anchors = options.append ? mergeAnchors(existingAnchors, scraped) : scraped
  const eligible = anchors.filter((anchor) => meetsMinTier(anchor.importanceTier, options.minTier))

  await writeJson(options.output, anchors)

  const seeds = toLandmarkSeeds(eligible)
  await writeJson(options.seedsOutput, seeds)

  const withImages = anchors.filter((anchor) => anchor.imageUrls.length > 0).length
  console.log(`Wrote ${anchors.length} anchors (${withImages} with images) to ${options.output}`)
  console.log(`Wrote ${seeds.length} landmark seeds (tier >= ${options.minTier}) to ${options.seedsOutput}`)

  return { anchors, seeds }
}
