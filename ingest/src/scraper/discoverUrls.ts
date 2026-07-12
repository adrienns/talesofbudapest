import { buildHouseUrl } from './constants.js'

export const collectSlugsBfs = async (
  seedSlugs: string[],
  maxPages: number,
  fetchHtml: (url: string) => Promise<string>,
  extractNearby: (html: string) => string[],
): Promise<string[]> => {
  const queue = [...seedSlugs]
  const visited = new Set<string>()
  const collected: string[] = []

  while (queue.length > 0 && collected.length < maxPages) {
    const slug = queue.shift()
    if (!slug || visited.has(slug)) {
      continue
    }

    visited.add(slug)
    collected.push(slug)

    const html = await fetchHtml(buildHouseUrl(slug))
    const nearby = extractNearby(html)

    for (const nextSlug of nearby) {
      if (!visited.has(nextSlug) && !queue.includes(nextSlug)) {
        queue.push(nextSlug)
      }
    }
  }

  return collected
}
