import axios from 'axios'

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

type CommonsPage = {
  title: string
  imageinfo?: Array<{
    url?: string
    descriptionurl?: string
    extmetadata?: Record<string, { value?: string }>
  }>
}

type CommonsResponse = {
  continue?: { gcmcontinue?: string }
  query?: { pages?: Record<string, CommonsPage> }
}

export type CommonsOpenMedia = {
  source: 'wikimedia-commons'
  title: string
  sourceUrl: string
  originalUrl: string
  license: {
    name: string
    url: string | null
    evidence: string
  }
  creator: string | null
  retrievedAt: string
}

const stripMarkup = (value: string | undefined): string | null => {
  if (!value) {
    return null
  }
  const text = value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text || null
}

const isExplicitlyOpen = (license: string): boolean => {
  const normalized = license.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalized.includes('noncommercial') || normalized.includes('no derivatives')) {
    return false
  }

  return (
    normalized.includes('public domain') ||
    normalized.includes('cc0') ||
    /^cc by(?:[- ]sa)?(?: \d(?:\.\d)?)?$/.test(normalized) ||
    /^cc-by(?:-sa)?-\d(?:\.\d)?$/.test(normalized)
  )
}

export const pollOpenCommonsCategory = async (options: {
  category: string
  limit: number
  continuation?: string
  userAgent: string
}): Promise<{ records: CommonsOpenMedia[]; continuation: string | null }> => {
  const response = await axios.get<CommonsResponse>(COMMONS_API, {
    params: {
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: `Category:${options.category}`,
      gcmtype: 'file',
      gcmlimit: options.limit,
      gcmcontinue: options.continuation,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      format: 'json',
      formatversion: 2,
    },
    headers: { 'User-Agent': options.userAgent },
    timeout: 60_000,
  })
  const retrievedAt = new Date().toISOString()
  const records = Object.values(response.data.query?.pages ?? {}).flatMap((page) => {
    const image = page.imageinfo?.[0]
    const metadata = image?.extmetadata
    const license = stripMarkup(metadata?.LicenseShortName?.value)
    const evidence = stripMarkup(metadata?.License?.value)
    const sourceUrl = image?.descriptionurl
    const originalUrl = image?.url
    if (!license || !evidence || !sourceUrl || !originalUrl || !isExplicitlyOpen(license)) {
      return []
    }

    return [{
      source: 'wikimedia-commons' as const,
      title: page.title,
      sourceUrl,
      originalUrl,
      license: {
        name: license,
        url: stripMarkup(metadata?.LicenseUrl?.value),
        evidence,
      },
      creator: stripMarkup(metadata?.Artist?.value),
      retrievedAt,
    }]
  })

  return { records, continuation: response.data.continue?.gcmcontinue ?? null }
}
