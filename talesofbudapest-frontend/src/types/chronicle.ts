export type ChronicleCitation = {
  sourceId: string
  title: string
  author?: string | null
  page?: number | null
  pageRef?: string | null
  url?: string | null
  license?: string | null
}

export type ChronicleFact = {
  id: string
  statement: string
  yearStart?: number | null
  yearEnd?: number | null
  dateLabel?: string | null
  importance?: number | null
  citations: ChronicleCitation[]
}

export type ChronicleEvent = {
  id: string
  title: string
  description?: string | null
  yearStart?: number | null
  yearEnd?: number | null
  dateLabel?: string | null
  importance?: number | null
  citations: ChronicleCitation[]
}

export type ChroniclePerson = {
  id: string
  name: string
  summary?: string | null
  relation?: string | null
  yearStart?: number | null
  yearEnd?: number | null
  portraitUrl?: string | null
  citations: ChronicleCitation[]
}

export type ChronicleRelation = {
  id: string
  label: string
  targetId?: string | null
  targetName: string
  targetKind: 'location' | 'person' | 'event' | 'unknown'
  citations: ChronicleCitation[]
}

export type LocationChronicle = {
  locationId: string
  facts: ChronicleFact[]
  events: ChronicleEvent[]
  people: ChroniclePerson[]
  relations: ChronicleRelation[]
  updatedAt?: string | null
}
