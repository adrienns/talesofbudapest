import type {
  ChronicleCitation,
  ChronicleEvent,
  ChronicleFact,
  ChroniclePerson,
  ChronicleRelation,
  LocationChronicle,
} from '@/types/chronicle'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

const idValue = (value: unknown, fallback: string) => stringValue(value) ?? fallback

const safeUrl = (value: unknown): string | null => {
  const candidate = stringValue(value)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

const citations = (value: unknown): ChronicleCitation[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const title = stringValue(item.title ?? item.source_title)
    if (!title) return []

    const pages = Array.isArray(item.pages) ? item.pages : []
    const pageRefs = Array.isArray(item.page_refs) ? item.page_refs : []
    return [{
      sourceId: idValue(item.sourceId ?? item.source_id, `source-${index}`),
      title,
      author: stringValue(item.author),
      page: numberValue(item.page ?? item.page_number ?? pages[0]),
      pageRef: stringValue(item.pageRef ?? item.page_ref ?? pageRefs[0]),
      url: safeUrl(item.url ?? item.source_url),
      license: stringValue(item.license),
    }]
  })
}

const factItems = (value: unknown): ChronicleFact[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const statement = stringValue(item.statement ?? item.statement_en ?? item.text)
    if (!statement) return []
    return [{
      id: idValue(item.id, `fact-${index}`),
      statement,
      yearStart: numberValue(item.yearStart ?? item.year_start),
      yearEnd: numberValue(item.yearEnd ?? item.year_end),
      dateLabel: stringValue(item.dateLabel ?? item.date_label),
      importance: numberValue(item.importance),
      citations: citations(item.citations ?? item.sources),
    }]
  })
}

const eventItems = (value: unknown): ChronicleEvent[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const title = stringValue(item.title ?? item.title_en ?? item.name)
    if (!title) return []
    return [{
      id: idValue(item.id, `event-${index}`),
      title,
      description: stringValue(item.description ?? item.description_en ?? item.statement_en),
      yearStart: numberValue(item.yearStart ?? item.year_start),
      yearEnd: numberValue(item.yearEnd ?? item.year_end),
      dateLabel: stringValue(item.dateLabel ?? item.date_label),
      importance: numberValue(item.importance),
      citations: citations(item.citations ?? item.sources),
    }]
  })
}

const personItems = (value: unknown): ChroniclePerson[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const name = stringValue(item.name ?? item.canonical_name_en)
    if (!name) return []
    return [{
      id: idValue(item.id, `person-${index}`),
      name,
      summary: stringValue(item.summary ?? item.summary_en ?? item.description),
      relation: stringValue(item.relation ?? item.relation_en ?? item.relationship),
      yearStart: numberValue(item.yearStart ?? item.year_start),
      yearEnd: numberValue(item.yearEnd ?? item.year_end),
      portraitUrl: stringValue(item.portraitUrl ?? item.portrait_url),
      citations: citations(item.citations ?? item.sources),
    }]
  })
}

const relationItems = (value: unknown): ChronicleRelation[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const label = stringValue(item.label ?? item.predicate)
    const targetName = stringValue(
      item.targetName ?? item.target_name ?? item.object_name ?? item.related_entity_name,
    )
    if (!label || !targetName) return []
    const targetKind = stringValue(item.targetKind ?? item.target_kind ?? item.related_entity_kind)
    return [{
      id: idValue(item.id, `relation-${index}`),
      label,
      targetId: stringValue(item.targetId ?? item.target_id ?? item.related_entity_id),
      targetName,
      targetKind:
        targetKind === 'location' || targetKind === 'person' || targetKind === 'event'
          ? targetKind
          : 'unknown',
      citations: citations(item.citations ?? item.sources),
    }]
  })
}

export const emptyChronicle = (locationId: string): LocationChronicle => ({
  locationId,
  facts: [],
  events: [],
  people: [],
  relations: [],
  updatedAt: null,
})

export const mapChronicleRow = (locationId: string, value: unknown): LocationChronicle => {
  if (!isRecord(value)) return emptyChronicle(locationId)

  return {
    locationId,
    facts: factItems(value.facts),
    events: eventItems(value.events),
    people: personItems(value.people),
    relations: relationItems(value.relations),
    updatedAt: stringValue(value.updated_at ?? value.updatedAt),
  }
}
