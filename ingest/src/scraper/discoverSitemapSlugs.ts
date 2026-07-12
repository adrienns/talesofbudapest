import { extractSlugFromUrl } from './constants.js'
import { fetchPage } from './fetchPage.js'

const SITEMAP_URLS = [
  'https://budapest100.hu/house-sitemap.xml',
  'https://budapest100.hu/house-sitemap2.xml',
  'https://budapest100.hu/house-sitemap3.xml',
]

const looksLikeAddressSlug = (slug: string): boolean => {
  if (/^\d+(-\d+)?$/.test(slug)) {
    return false
  }

  return (
    /\d/.test(slug) ||
    /-utca-|-ut-|-ter-|-korut-|-koz-|-fasor-|-rakpart-/i.test(slug)
  )
}

export const parseHouseSlugsFromSitemapXml = (xml: string): string[] => {
  const slugs = new Set<string>()

  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = match[1]
    if (!url || url.includes('/en/house/')) {
      continue
    }

    const slug = extractSlugFromUrl(url)
    if (!slug || !looksLikeAddressSlug(slug)) {
      continue
    }

    slugs.add(slug)
  }

  return [...slugs]
}

export const fetchAllSitemapSlugs = async (): Promise<string[]> => {
  const slugs = new Set<string>()

  for (const sitemapUrl of SITEMAP_URLS) {
    const xml = await fetchPage(sitemapUrl)
    for (const slug of parseHouseSlugsFromSitemapXml(xml)) {
      slugs.add(slug)
    }
  }

  return [...slugs].sort()
}

export const pickSitemapSeeds = (
  allSlugs: string[],
  count: number,
  exclude: Set<string>,
): string[] => {
  const available = allSlugs.filter((slug) => !exclude.has(slug))
  if (available.length === 0 || count <= 0) {
    return []
  }

  if (available.length <= count) {
    return available
  }

  const step = available.length / count
  const picked: string[] = []

  for (let index = 0; index < count; index += 1) {
    const slug = available[Math.floor(index * step)]
    if (slug && !picked.includes(slug)) {
      picked.push(slug)
    }
  }

  return picked
}
