import * as cheerio from 'cheerio'
import { extractSlugFromUrl } from './constants.js'

const BOILERPLATE_PATTERNS = [
  /tudsz valamit erről a házról/i,
  /do you know something about this house/i,
  /budapest100@kek\.org\.hu/i,
  /please let us know, if you can contribute/i,
  /this content is not yet translated/i,
]

const isBoilerplate = (text: string): boolean =>
  BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text))

const parseOpenHouseYears = (text: string): number[] => {
  const matches = text.matchAll(/(?:nyitott ház|open house)\s*@?\s*([\d,\s]+)/gi)
  const years = new Set<number>()

  for (const match of matches) {
    const chunk = match[1] ?? ''
    for (const yearMatch of chunk.matchAll(/\d{4}/g)) {
      years.add(Number(yearMatch[0]))
    }
  }

  return [...years].sort((a, b) => a - b)
}

const findLabeledValue = ($: cheerio.CheerioAPI, label: string): string | null => {
  const normalizedLabel = label.toLowerCase()

  const dtMatch = $('dt')
    .filter((_, element) => $(element).text().trim().toLowerCase().includes(normalizedLabel))
    .first()

  if (dtMatch.length > 0) {
    const value = dtMatch.next('dd').text().trim()
    return value || null
  }

  const rowMatch = $('tr')
    .filter((_, element) => {
      const firstCell = $(element).find('th, td').first().text().trim().toLowerCase()
      return firstCell.includes(normalizedLabel)
    })
    .first()

  if (rowMatch.length > 0) {
    const value = rowMatch.find('td').last().text().trim()
    return value || null
  }

  return null
}

const extractHistoricalStories = ($: cheerio.CheerioAPI): string[] => {
  const stories: string[] = []
  const headings = $('h2, h3').filter((_, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim().toLowerCase()
    return text.includes('adatok és leírás') || text.includes('data and description')
  })

  if (headings.length > 0) {
    headings.each((_, heading) => {
      const section = $(heading).closest('.js-collapse-section')
      const contentRoot =
        section.find('.js-content-post, .content-post').first().length > 0
          ? section.find('.js-content-post, .content-post').first()
          : $(heading).parent().parent().find('.js-content-post, .content-post').first()

      contentRoot.find('p').each((__, paragraph) => {
        const text = $(paragraph).text().replace(/\s+/g, ' ').trim()
        if (text.length > 0 && text !== '-' && !isBoilerplate(text)) {
          stories.push(text)
        }
      })
    })

    if (stories.length > 0) {
      return stories
    }
  }

  $('.js-content-post p, .content-post p').each((_, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim()
    if (text.length > 80 && !isBoilerplate(text)) {
      stories.push(text)
    }
  })

  return stories
}

export const discoverNearbySlugs = (html: string): string[] => {
  const $ = cheerio.load(html)
  const slugs = new Set<string>()

  $('a[href*="/house/"]').each((_, element) => {
    const href = $(element).attr('href')
    if (!href) {
      return
    }

    const absolute = href.startsWith('http') ? href : `https://budapest100.hu${href}`
    const slug = extractSlugFromUrl(absolute)
    if (slug) {
      slugs.add(slug)
    }
  })

  return [...slugs]
}

export const parseHousePageHtml = (
  html: string,
  _sourceUrl: string,
  _slug: string,
  address: string,
): {
  name: string
  constructionYearLabel: string | null
  architectLabel: string | null
  historicalStories: string[]
  openHouseYears: number[]
} => {
  const $ = cheerio.load(html)
  const name = $('h1').first().text().replace(/\s+/g, ' ').trim()
  const bodyText = $('body').text()
  const historicalStories = extractHistoricalStories($)
  const storyText = historicalStories.join(' ')

  return {
    name: name || address,
    constructionYearLabel: findLabeledValue($, 'építés éve'),
    architectLabel: findLabeledValue($, 'tervező'),
    historicalStories,
    openHouseYears: parseOpenHouseYears(bodyText || storyText),
  }
}
