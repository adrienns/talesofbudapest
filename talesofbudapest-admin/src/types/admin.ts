export type ReviewKind = 'alias' | 'entity' | 'claim' | 'edge' | 'location_connection'
export type ReviewDecision = 'approve' | 'reject'

export type SourceCoverage = {
  id: string
  title: string
  licenseVerdict: 'green' | 'yellow' | 'red' | string
  pages: number | null
  extractedPages: number | null
  approvedClaims: number | null
}

export type AdminOverview = {
  health: {
    connected: boolean
    state: 'healthy' | 'degraded' | 'unavailable'
    checkedAt: string
    latencyMs?: number
  }
  counts: Record<string, number | null>
  statuses: {
    stagedLocationsPending: number | null
    entitiesNeedReview: number | null
    aliasesNeedReview: number | null
    claimsNeedReview: number | null
    edgesNeedReview: number | null
  }
  unavailableTables: Array<{ table: string; error?: string }>
  sources?: SourceCoverage[]
  pipeline: {
    stagedRecords: number
    reviewQueue: number
    canonicalEntities: number | null
    publicClaims: number | null
  }
}

export type ReviewCitation = {
  sourceId: string
  sourceTitle: string
  pageLabel?: string | null
  publicCitation?: string | null
  licenseVerdict?: string | null
}

export type ReviewCandidate = {
  id: string
  label: string
  detail?: string | null
  score?: number | null
}

export type ReviewItem = {
  id: string
  kind: ReviewKind
  question: string
  title: string
  detail?: string | null
  status: string
  publicationStatus?: string
  context?: Record<string, unknown>
  suggestions?: Array<{
    publicLocationId: string
    name: string
    score: number
    autoMatch: boolean
    matchedVia: string | null
    signals: Record<string, unknown>
  }>
}

export type AdminGraphNode = {
  id: string
  label: string
  kind: 'location' | 'person' | 'event' | 'organisation' | string
  status?: string | null
  x?: number | null
  y?: number | null
  needsResearch?: boolean
}

export type AdminGraphEdge = {
  id: string
  sourceId: string
  targetId: string
  label: string
  status?: string | null
}

export type AdminGraph = {
  entities: Array<{
    id: string
    entity_kind: string
    canonical_name_en: string
    description_en?: string | null
    review_status?: string | null
    publication_status?: string | null
    needs_research?: boolean
  }>
  edges: Array<{
    id: string
    subject_entity_id: string
    object_entity_id: string
    predicate: string
    review_status?: string | null
  }>
  claims: Array<Record<string, unknown>>
  truncated?: boolean
}
