import type { DecisionInput, ReviewKind } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KINDS = new Set<ReviewKind>(['alias', 'entity', 'claim', 'edge', 'location_connection'])

export function parseDecisionInput(value: unknown): DecisionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A JSON decision object is required')
  const body = value as Record<string, unknown>
  if (!KINDS.has(body.kind as ReviewKind)) throw new Error('Unsupported review kind')
  if (body.decision !== 'approve' && body.decision !== 'reject') throw new Error('Decision must be explicitly approve or reject')
  if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new Error('A valid item id is required')
  if (body.kind === 'location_connection' && body.decision === 'approve') {
    if (typeof body.publicLocationId !== 'string' || !UUID.test(body.publicLocationId)) throw new Error('Location approval requires a valid publicLocationId')
  } else if (body.publicLocationId !== undefined) {
    throw new Error('publicLocationId is only allowed for location approval')
  }
  return { kind: body.kind as ReviewKind, id: body.id, decision: body.decision, ...(body.publicLocationId ? { publicLocationId: body.publicLocationId as string } : {}) }
}

export function cappedLimit(value: string | null, fallback = 50, max = 100) {
  const number = Number(value)
  return Number.isInteger(number) ? Math.max(1, Math.min(max, number)) : fallback
}

