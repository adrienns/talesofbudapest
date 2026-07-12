import axios from 'axios'
import { sleep } from '../../scraper/constants.js'
import { isInBudapestBounds } from './curatedLandmarks.js'

type WikidataEntity = {
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  claims?: Record<string, Array<{ mainsnak: { datavalue?: { value: unknown } } }>>
}

type WikidataResponse = {
  entities: Record<string, WikidataEntity>
}

type WikipediaSummary = {
  title: string
  extract?: string
  thumbnail?: { source: string }
  originalimage?: { source: string }
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIPEDIA_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary'
const API_HEADERS = {
  'User-Agent': 'TalesOfBudapest/1.0 (https://github.com/talesofbudapest; local-dev)',
  Accept: 'application/json',
}

const commonsFileUrl = (filename: string): string =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`

const readClaimString = (entity: WikidataEntity, property: string): string | null => {
  const claim = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value
  if (!claim || typeof claim !== 'object') {
    return null
  }

  if ('time' in claim && typeof (claim as { time?: string }).time === 'string') {
    const match = (claim as { time: string }).time.match(/([+-]?\d{4})/)
    return match?.[1] ?? null
  }

  if ('id' in claim && typeof (claim as { id?: string }).id === 'string') {
    return (claim as { id: string }).id
  }

  return null
}

const readCoordinates = (
  entity: WikidataEntity,
): { lat: number; lng: number } | null => {
  const value = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined

  if (value?.latitude == null || value?.longitude == null) {
    return null
  }

  return { lat: value.latitude, lng: value.longitude }
}

const readImageFilename = (entity: WikidataEntity): string | null => {
  const value = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  return typeof value === 'string' ? value : null
}

export const fetchWikidataEntities = async (qIds: string[]): Promise<WikidataResponse> => {
  const response = await axios.get<WikidataResponse>(WIKIDATA_API, {
    params: {
      action: 'wbgetentities',
      ids: qIds.join('|'),
      props: 'labels|descriptions|claims',
      languages: 'en|hu',
      format: 'json',
    },
    headers: API_HEADERS,
    timeout: 30_000,
  })

  return response.data
}

export const fetchWikipediaSummary = async (title: string): Promise<WikipediaSummary> => {
  const response = await axios.get<WikipediaSummary>(
    `${WIKIPEDIA_SUMMARY}/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    {
      headers: API_HEADERS,
      timeout: 30_000,
    },
  )

  return response.data
}

export type WikidataLandmark = {
  qId: string
  name: string
  nameEn: string | null
  nameHu: string | null
  description: string | null
  lat: number
  lng: number
  inceptionYear: string | null
  architecturalStyleQId: string | null
  imageUrl: string | null
  wikipediaExtract: string | null
  wikipediaImageUrl: string | null
}

export const buildWikidataLandmark = async (
  qId: string,
  wikiTitle: string,
): Promise<WikidataLandmark | null> => {
  const data = await fetchWikidataEntities([qId])
  const entity = data.entities[qId]
  if (!entity) {
    return null
  }

  const coords = readCoordinates(entity)
  if (!coords || !isInBudapestBounds(coords.lat, coords.lng)) {
    return null
  }

  const nameEn = entity.labels?.en?.value ?? null
  const nameHu = entity.labels?.hu?.value ?? null
  const name = nameEn ?? nameHu ?? wikiTitle
  const description = entity.descriptions?.en?.value ?? entity.descriptions?.hu?.value ?? null
  const imageFilename = readImageFilename(entity)
  const inceptionYear =
    readClaimString(entity, 'P571') ??
    readClaimString(entity, 'P1619') ??
    readClaimString(entity, 'P729')

  await sleep(800)
  let wikipediaExtract: string | null = null
  let wikipediaImageUrl: string | null = null

  try {
    const summary = await fetchWikipediaSummary(wikiTitle)
    wikipediaExtract = summary.extract ?? null
    wikipediaImageUrl = summary.originalimage?.source ?? summary.thumbnail?.source ?? null
  } catch {
    wikipediaExtract = null
  }

  return {
    qId,
    name,
    nameEn,
    nameHu,
    description,
    lat: coords.lat,
    lng: coords.lng,
    inceptionYear,
    architecturalStyleQId: readClaimString(entity, 'P149'),
    imageUrl: imageFilename ? commonsFileUrl(imageFilename) : null,
    wikipediaExtract,
    wikipediaImageUrl,
  }
}
