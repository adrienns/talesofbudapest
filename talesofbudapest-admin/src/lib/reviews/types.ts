export type ReviewKind = 'alias' | 'entity' | 'claim' | 'edge' | 'location_connection'
export type ReviewDecision = 'approve' | 'reject'

export type ReviewQuestion = {
  id: string
  kind: ReviewKind
  question: string
  title: string
  detail: string | null
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

export type DecisionInput = {
  kind: ReviewKind
  id: string
  decision: ReviewDecision
  publicLocationId?: string
}

