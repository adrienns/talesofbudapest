import { normalizeAddress } from '../cleaners/address.js'
import { parseArchitect } from '../cleaners/architect.js'
import { parseConstructionYear } from '../cleaners/constructionYear.js'
import { buildFortepanSearchUrl, fetchFortepanImages } from '../enrich/fortepan.js'
import { geocodeAddress } from '../enrich/geocode.js'
import type { Budapest100MapAnchor } from '../types/mapAnchor.js'
import { buildHouseUrl } from './constants.js'
import { extractHouseImages } from './extractHouseImages.js'
import { parseHousePageHtml } from './parseHousePage.js'

export type BuildAnchorOptions = {
  geocode: boolean
  fortepan: boolean
}

export const buildAnchorFromHtml = async (
  html: string,
  slug: string,
  options: BuildAnchorOptions,
): Promise<Budapest100MapAnchor> => {
  const sourceUrl = buildHouseUrl(slug)
  const preliminary = parseHousePageHtml(html, sourceUrl, slug, '')
  const address = normalizeAddress(slug, preliminary.name)
  const parsed = parseHousePageHtml(html, sourceUrl, slug, address)
  const storyText = parsed.historicalStories.join(' ')

  let lat: number | null = null
  let lng: number | null = null
  let geocodeStatus: Budapest100MapAnchor['geocodeStatus'] = 'skipped'
  let geocodeQuery = ''

  if (options.geocode) {
    const geocoded = await geocodeAddress(address)
    lat = geocoded.lat
    lng = geocoded.lng
    geocodeStatus = geocoded.geocodeStatus
    geocodeQuery = geocoded.geocodeQuery
  }

  const fortepanSearchUrl = buildFortepanSearchUrl(address)
  const fortepanImageUrls = options.fortepan ? await fetchFortepanImages(address) : []
  const imageUrls = extractHouseImages(html)

  return {
    sourceUrl,
    slug,
    address,
    name: parsed.name,
    constructionYear: parseConstructionYear(parsed.constructionYearLabel, storyText),
    architect: parseArchitect(parsed.architectLabel, storyText),
    historicalStories: parsed.historicalStories,
    openHouseYears: parsed.openHouseYears,
    imageUrls,
    scrapedAt: new Date().toISOString(),
    lat,
    lng,
    geocodeStatus,
    geocodeQuery,
    fortepanImageUrls,
    fortepanSearchUrl,
    importanceScore: 0,
    importanceTier: 'skip',
    importanceReasons: [],
  }
}
