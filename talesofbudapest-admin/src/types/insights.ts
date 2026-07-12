export type Metric<T> = {
  value: T | null
  available: boolean
  truncated?: boolean
  note?: string
}

export type NamedCount = { name: string; count: number }

export type SourceInsight = {
  id: string
  title: string
  licenseVerdict: string
  pages: number | null
  extractedPages: number | null
  failedPages: number | null
  mentions: number | null
  stagingEntities: number | null
  facts: number | null
  relations: number | null
}

export type AdminInsights = {
  generatedAt: string
  totals: Record<string, Metric<number>>
  entityKinds: {
    canonical: Metric<NamedCount[]>
    staging: Metric<NamedCount[]>
  }
  pageStatuses: Metric<NamedCount[]>
  reviewStatuses: Record<'entities' | 'aliases' | 'claims' | 'edges', Metric<NamedCount[]>>
  publication: Record<'entities' | 'claims' | 'edges', Metric<NamedCount[]>>
  predicates: {
    canonical: Metric<NamedCount[]>
    staging: Metric<NamedCount[]>
  }
  claimDecades: Metric<NamedCount[]>
  claimEras: Metric<NamedCount[]>
  sources: Metric<SourceInsight[]>
  quality: {
    failedPages: Metric<number>
    unresolvedStagingEntities: Metric<number>
    unresolvedRelationEndpoints: Metric<number>
    canonicalItemsMissingEvidence: Metric<number>
    stagingItemsMissingEvidence: Metric<number>
  }
}

export type SafeCitation = {
  sourceId: string
  sourceTitle: string
  pageNumbers: number[]
  pageRefs: string[]
  publicCitation: string
  publicNote?: string | null
}

export type EntityConnection = {
  id: string
  predicate: string
  direction: 'outgoing' | 'incoming'
  neighborId: string
  neighborName: string
  neighborKind: string
  status?: string | null
  publicationStatus?: string | null
  startYear?: number | null
  endYear?: number | null
  dateLabel?: string | null
}

export type AdminEntityDetail = {
  source: 'canonical' | 'staging'
  identity: {
    id: string
    kind: string
    name: string
    sourceName?: string | null
    description?: string | null
    status?: string | null
    publicationStatus?: string | null
    startYear?: number | null
    endYear?: number | null
    dateLabel?: string | null
    sourceId?: string | null
  }
  aliases: Array<{ id: string; alias: string; languageCode?: string | null; kind?: string | null; status?: string | null }>
  claims: Array<{
    id: string
    statement: string
    claimType?: string | null
    status?: string | null
    publicationStatus?: string | null
    importance?: number | null
    startYear?: number | null
    endYear?: number | null
    dateLabel?: string | null
  }>
  connections: EntityConnection[]
  citations: SafeCitation[]
  truncated: boolean
}
