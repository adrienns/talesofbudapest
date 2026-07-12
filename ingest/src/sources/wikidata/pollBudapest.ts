import axios from 'axios'

const WIKIDATA_QUERY_SERVICE = 'https://query.wikidata.org/sparql'
const WIKIDATA_LICENSE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'
const WIKIDATA_LICENSE_EVIDENCE_URL = 'https://www.wikidata.org/wiki/Wikidata:Licensing'
const BUDAPEST_LONGITUDE = 19.0402
const BUDAPEST_LATITUDE = 47.4979

// Unit Separator (ASCII 0x1F): joins GROUP_CONCAT'd "lang|value" altLabel
// entries. Chosen because it cannot appear in a Wikidata label/altLabel
// string, unlike "|" or ",".
const ALT_LABEL_SEPARATOR = ''

export type OpenPlaceLanguage = 'hu' | 'en' | 'de'

const SUPPORTED_ALT_LABEL_LANGUAGES: readonly OpenPlaceLanguage[] = ['hu', 'en', 'de']

type SparqlBinding = {
  type: string
  value: string
}

type SparqlResponse = {
  results: {
    bindings: Array<Record<string, SparqlBinding | undefined>>
  }
}

export type WikidataOpenPlaceAltLabel = {
  lang: OpenPlaceLanguage
  value: string
}

export type WikidataOpenPlace = {
  source: 'wikidata'
  externalId: string
  sourceUrl: string
  name: string | null
  labels: {
    hu: string | null
    en: string | null
    de: string | null
  }
  altLabels: WikidataOpenPlaceAltLabel[]
  description: string | null
  coordinates: { lat: number; lng: number }
  imageFilename: string | null
  inceptionYear: string | null
  modifiedAt: string | null
  license: {
    identifier: 'CC0-1.0'
    url: string
    evidenceUrl: string
  }
  retrievedAt: string
}

const entityIdFromUrl = (url: string): string => url.split('/').at(-1) ?? url

const isSupportedAltLabelLanguage = (value: string): value is OpenPlaceLanguage =>
  (SUPPORTED_ALT_LABEL_LANGUAGES as readonly string[]).includes(value)

const isJunkAltLabel = (value: string): boolean =>
  /^Q\d+$/.test(value) || value.length <= 1 || value.length > 120

/**
 * Parses the GROUP_CONCAT'd altLabel field produced by
 * buildBudapestOpenPlacesQuery back into per-language alt labels.
 *
 * Each entry in the concatenated string has the shape `${lang}|${value}`
 * and entries are joined by ALT_LABEL_SEPARATOR. Malformed entries (missing
 * "|", unsupported language, or junk values such as bare Q-ids) are
 * dropped, and duplicate (lang, value) pairs are removed.
 */
export const parseAltLabelsConcat = (concat: string | null | undefined): WikidataOpenPlaceAltLabel[] => {
  if (!concat) {
    return []
  }

  const seen = new Set<string>()
  const altLabels: WikidataOpenPlaceAltLabel[] = []

  for (const entry of concat.split(ALT_LABEL_SEPARATOR)) {
    if (!entry) {
      continue
    }

    const separatorIndex = entry.indexOf('|')
    if (separatorIndex === -1) {
      continue
    }

    const lang = entry.slice(0, separatorIndex)
    const value = entry.slice(separatorIndex + 1).trim()

    if (!isSupportedAltLabelLanguage(lang) || value.length === 0 || isJunkAltLabel(value)) {
      continue
    }

    const dedupeKey = `${lang}|${value}`
    if (seen.has(dedupeKey)) {
      continue
    }

    seen.add(dedupeKey)
    altLabels.push({ lang, value })
  }

  return altLabels
}

const coordinateFromWkt = (wkt: string): { lat: number; lng: number } | null => {
  const match = wkt.match(/^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/)
  if (!match) {
    return null
  }

  return { lng: Number(match[1]), lat: Number(match[2]) }
}

export const buildBudapestOpenPlacesQuery = (options: {
  limit: number
  offset: number
  modifiedSince?: string
}): string => {
  const modifiedFilter = options.modifiedSince
    ? `FILTER(?modified >= "${options.modifiedSince}T00:00:00Z"^^xsd:dateTime)`
    : ''

  return `
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?item
       (SAMPLE(?labelHu) AS ?nameHu)
       (SAMPLE(?labelEn) AS ?nameEn)
       (SAMPLE(?labelDe) AS ?nameDe)
       (SAMPLE(?descriptionValue) AS ?description)
       (SAMPLE(?coordinate) AS ?coordinate)
       (SAMPLE(?image) AS ?image)
       (SAMPLE(?inception) AS ?inception)
       (SAMPLE(?modified) AS ?modified)
       (GROUP_CONCAT(DISTINCT CONCAT(LANG(?altLabel), "|", STR(?altLabel)); separator="${ALT_LABEL_SEPARATOR}") AS ?altLabelsConcat)
WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coordinate.
    bd:serviceParam wikibase:center "Point(${BUDAPEST_LONGITUDE} ${BUDAPEST_LATITUDE})"^^geo:wktLiteral.
    bd:serviceParam wikibase:radius "15".
  }
  OPTIONAL {
    ?item rdfs:label ?labelHu.
    FILTER(LANG(?labelHu) = "hu")
  }
  OPTIONAL {
    ?item rdfs:label ?labelEn.
    FILTER(LANG(?labelEn) = "en")
  }
  OPTIONAL {
    ?item rdfs:label ?labelDe.
    FILTER(LANG(?labelDe) = "de")
  }
  OPTIONAL {
    ?item schema:description ?descriptionValue.
    FILTER(LANG(?descriptionValue) IN ("hu", "en"))
  }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item schema:dateModified ?modified. }
  OPTIONAL {
    ?item skos:altLabel ?altLabel.
    FILTER(LANG(?altLabel) IN ("hu", "en", "de"))
  }
  ${modifiedFilter}
}
GROUP BY ?item
ORDER BY STR(?item)
LIMIT ${options.limit}
OFFSET ${options.offset}
`.trim()
}

export const pollBudapestOpenPlaces = async (options: {
  limit: number
  offset: number
  modifiedSince?: string
  userAgent: string
}): Promise<{ query: string; records: WikidataOpenPlace[] }> => {
  const query = buildBudapestOpenPlacesQuery(options)
  const response = await axios.get<SparqlResponse>(WIKIDATA_QUERY_SERVICE, {
    params: { format: 'json', query },
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': options.userAgent,
    },
    timeout: 60_000,
  })
  const retrievedAt = new Date().toISOString()

  const records = response.data.results.bindings.flatMap((binding) => {
    const coordinate = binding.coordinate?.value
      ? coordinateFromWkt(binding.coordinate.value)
      : null
    const item = binding.item?.value
    if (!coordinate || !item) {
      return []
    }

    const nameHu = binding.nameHu?.value ?? null
    const nameEn = binding.nameEn?.value ?? null
    const nameDe = binding.nameDe?.value ?? null

    return [{
      source: 'wikidata' as const,
      externalId: entityIdFromUrl(item),
      sourceUrl: item,
      name: nameEn ?? nameHu ?? nameDe,
      labels: {
        hu: nameHu,
        en: nameEn,
        de: nameDe,
      },
      altLabels: parseAltLabelsConcat(binding.altLabelsConcat?.value),
      description: binding.description?.value ?? null,
      coordinates: coordinate,
      imageFilename: binding.image?.value ?? null,
      inceptionYear: binding.inception?.value?.match(/[+-]?\d{4}/)?.[0] ?? null,
      modifiedAt: binding.modified?.value ?? null,
      license: {
        identifier: 'CC0-1.0' as const,
        url: WIKIDATA_LICENSE_URL,
        evidenceUrl: WIKIDATA_LICENSE_EVIDENCE_URL,
      },
      retrievedAt,
    }]
  })

  return { query, records }
}
