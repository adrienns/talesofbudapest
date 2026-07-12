import * as cheerio from 'cheerio'

const UPLOADS_PATH = '/wp-content/uploads/'

const isHousePhotoUrl = (url: string): boolean => {
  if (!url.includes(UPLOADS_PATH)) {
    return false
  }

  if (/favicon|cropped-|emoji|smiley/i.test(url)) {
    return false
  }

  return /\.(jpe?g|png|webp)(\?|$)/i.test(url)
}

const normalizeImageUrl = (url: string): string => {
  if (url.startsWith('//')) {
    return `https:${url}`
  }

  if (url.startsWith('/')) {
    return `https://budapest100.hu${url}`
  }

  return url
}

const collectFromImgTags = ($: cheerio.CheerioAPI, selector: string, urls: Set<string>) => {
  $(selector).each((_, element) => {
    const src = $(element).attr('src') ?? $(element).attr('data-src')
    if (!src) {
      return
    }

    const normalized = normalizeImageUrl(src)
    if (isHousePhotoUrl(normalized)) {
      urls.add(normalized)
    }
  })
}

export const extractHouseImages = (html: string): string[] => {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  collectFromImgTags($, '.hero-gallery img, .js-slick-hero-gallery img', urls)
  collectFromImgTags($, '.js-content-post img, .content-post img', urls)

  return [...urls]
}
