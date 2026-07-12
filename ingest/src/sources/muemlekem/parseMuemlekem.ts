import * as cheerio from 'cheerio'
import { parseHungarianCoordinateString } from '../../cleaners/coordinates.js'
import { fetchPage } from '../../scraper/fetchPage.js'

export type MuemlekemListItem = {
  id: string
  name: string
  address: string
  city: string
  coordinateText: string | null
}

const LIST_BASE = 'https://muemlekem.hu/muemlek'

const parseListRow = (rowHtml: string): MuemlekemListItem | null => {
  const $ = cheerio.load(rowHtml)
  const link = $('a[href*="/muemlek/show/"]').first()
  const href = link.attr('href')
  if (!href) {
    return null
  }

  const idMatch = href.match(/\/muemlek\/show\/(-?\d+)/)
  if (!idMatch) {
    return null
  }

  const firstCell = $('td').first().text().replace(/\s+/g, ' ').trim()
  const city = $('td').eq(1).text().replace(/\s+/g, ' ').trim()
  const name = link.text().replace(/\s+/g, ' ').trim()
  const addressMatch = firstCell.match(/Cím:\s*(.+?)(?:\s+Koordináta:|$)/i)
  const coordinateMatch = firstCell.match(/Koordináta:\s*(.+)$/i)

  return {
    id: idMatch[1],
    name: name || firstCell,
    address: addressMatch?.[1]?.trim() ?? '',
    city,
    coordinateText: coordinateMatch?.[1]?.trim() ?? null,
  }
}

export const parseMuemlekemListHtml = (html: string): MuemlekemListItem[] =>
  cheerio
    .load(html)('table tr')
    .toArray()
    .slice(1)
    .map((row) => parseListRow(cheerio.load(row).html() ?? ''))
    .filter((item): item is MuemlekemListItem => item !== null)

export const fetchMuemlekemListPage = async (
  page: number,
  perPage: number,
  city: string,
): Promise<MuemlekemListItem[]> => {
  const params = new URLSearchParams({
    'szuro[helyseg_nev]': city,
    lap: String(page),
    egylapon: String(perPage),
    ob: 'nev',
  })

  const html = await fetchPage(`${LIST_BASE}?${params.toString()}`)
  return parseMuemlekemListHtml(html)
}

export const fetchAllMuemlekemListItems = async (
  city: string,
  perPage = 100,
  maxPages = 100,
): Promise<MuemlekemListItem[]> => {
  const items = new Map<string, MuemlekemListItem>()

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchMuemlekemListPage(page, perPage, city)
    if (batch.length === 0) {
      break
    }

    for (const item of batch) {
      items.set(item.id, item)
    }

    if (batch.length < perPage) {
      break
    }
  }

  return [...items.values()]
}

export type MuemlekemDetail = {
  id: string
  name: string
  address: string
  city: string
  category: string | null
  protectionStatus: string | null
  shortDescription: string
  longDescription: string
  coordinateText: string | null
  imageUrls: string[]
}

const readLabelValue = ($: cheerio.CheerioAPI, label: string): string | null => {
  const row = $('.row').filter((_, element) =>
    $(element).find('.col-sm-4').first().text().trim().toLowerCase().includes(label.toLowerCase()),
  )

  if (row.length === 0) {
    return null
  }

  const value = row.first().find('.col-sm-8').text().replace(/\s+/g, ' ').trim()
  return value || null
}

export const parseMuemlekemDetailHtml = (
  html: string,
  listItem: MuemlekemListItem,
): MuemlekemDetail => {
  const $ = cheerio.load(html)
  const shortDescription = readLabelValue($, 'rövid leírás') ?? ''
  const longDescription = readLabelValue($, 'külső leírás') ?? ''
  const imageUrls = new Set<string>()

  $('img[src]').each((_, element) => {
    const src = $(element).attr('src')
    if (src && /upload|foto|photo|jelentes/i.test(src)) {
      imageUrls.add(src.startsWith('http') ? src : `https://muemlekem.hu${src}`)
    }
  })

  const ogImage = $('meta[property="og:image"]').attr('content')
  if (ogImage) {
    imageUrls.add(ogImage)
  }

  return {
    id: listItem.id,
    name: $('h1').first().text().replace(/\s+/g, ' ').trim() || listItem.name,
    address: readLabelValue($, 'cím') ?? listItem.address,
    city: listItem.city,
    category: readLabelValue($, 'kategória') ?? readLabelValue($, 'jelleg'),
    protectionStatus: readLabelValue($, 'védelem'),
    shortDescription,
    longDescription,
    coordinateText:
      readLabelValue($, 'koordináta') ??
      listItem.coordinateText ??
      ($('body').text().match(/Koordináta:\s*(N[^<\n]+)/i)?.[1] ?? null),
    imageUrls: [...imageUrls],
  }
}

export const fetchMuemlekemDetail = async (
  listItem: MuemlekemListItem,
): Promise<MuemlekemDetail> => {
  const html = await fetchPage(`https://muemlekem.hu/muemlek/show/${listItem.id}`)
  return parseMuemlekemDetailHtml(html, listItem)
}

export const coordinatesFromDetail = (
  detail: MuemlekemDetail,
): { lat: number; lng: number } | null => {
  if (!detail.coordinateText) {
    return null
  }

  return parseHungarianCoordinateString(detail.coordinateText)
}
