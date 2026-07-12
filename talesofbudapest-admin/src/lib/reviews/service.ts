import 'server-only'

import { getAdminDb } from '../db/adminDb'
import { aliasQuestion, claimQuestion, edgeQuestion, entityQuestion, locationQuestion } from './mapping'
import type { DecisionInput, ReviewQuestion } from './types'

// Shared production matcher/promotion rules. These are plain JS modules in the
// sibling backend package, therefore their returned shapes are checked here.
// @ts-expect-error sibling backend package is JavaScript
import { autoLinkMatchReason, rankLocationCandidates } from '../../../../talesofbudapest-backend/lib/kgLocationResolver.js'
// @ts-expect-error sibling backend package is JavaScript
import { buildAutoLinkPlan } from '../../../../talesofbudapest-backend/lib/kgPromotion.js'

const reviewSelects = {
  entity: 'id,entity_kind,canonical_name_en,description_en,public_location_id,start_year,end_year,review_status,publication_status',
  alias: 'id,entity_id,alias,language_code,alias_kind,review_status,entity:kg_entities!entity_id(canonical_name_en)',
  claim: 'id,subject_entity_id,statement_en,claim_type,start_year,end_year,importance,review_status,publication_status,subject:kg_entities!subject_entity_id(canonical_name_en)',
  edge: 'id,subject_entity_id,predicate,object_entity_id,statement_en,start_year,end_year,review_status,publication_status,subject:kg_entities!subject_entity_id(canonical_name_en),object:kg_entities!object_entity_id(canonical_name_en)',
} as const

async function suggestionsFor(staged: Record<string, any>) {
  const db = getAdminDb()
  const [{ data: publicLocations }, { data: canonical }, { data: approvedAliases }] = await Promise.all([
    db.from('locations').select('id,name,latitude,longitude,landmark_type').limit(750),
    db.from('kg_entities').select('id,public_location_id').eq('entity_kind', 'location').not('public_location_id', 'is', null).limit(1000),
    db.from('kg_entity_aliases').select('entity_id,alias').eq('review_status', 'approved').limit(3000),
  ])
  const publicByEntity = new Map((canonical ?? []).map((row) => [row.id, row.public_location_id]))
  const aliases = new Map<string, string[]>()
  for (const row of approvedAliases ?? []) {
    const publicId = publicByEntity.get(row.entity_id)
    if (!publicId) continue
    aliases.set(publicId, [...(aliases.get(publicId) ?? []), row.alias])
  }
  const candidates = (publicLocations ?? []).map((row) => ({ ...row, aliases: aliases.get(row.id) ?? [] }))
  return rankLocationCandidates(staged, candidates, new Map(), 3).map((match: any) => ({
    publicLocationId: match.candidate.id, name: match.candidate.name, score: match.score,
    autoMatch: match.autoMatch, matchedVia: autoLinkMatchReason(match), signals: match.signals,
  }))
}

export async function getReviewQuestions(limit: number, kind?: string | null): Promise<ReviewQuestion[]> {
  const db = getAdminDb()
  const wanted = new Set(kind ? [kind] : ['entity', 'alias', 'claim', 'edge', 'location_connection'])
  const jobs: Array<PromiseLike<ReviewQuestion[]>> = []
  if (wanted.has('entity')) jobs.push(db.from('kg_entities').select(reviewSelects.entity).eq('review_status', 'needs_review').limit(limit).then(({ data, error }) => {
    if (error) throw error; return (data ?? []).map(entityQuestion)
  }))
  if (wanted.has('alias')) jobs.push(db.from('kg_entity_aliases').select(reviewSelects.alias).eq('review_status', 'needs_review').limit(limit).then(({ data, error }) => {
    if (error) throw error; return (data ?? []).map(aliasQuestion)
  }))
  if (wanted.has('claim')) jobs.push(db.from('kg_claims').select(reviewSelects.claim).eq('review_status', 'needs_review').limit(limit).then(({ data, error }) => {
    if (error) throw error; return (data ?? []).map(claimQuestion)
  }))
  if (wanted.has('edge')) jobs.push(db.from('kg_edges').select(reviewSelects.edge).eq('review_status', 'needs_review').limit(limit).then(({ data, error }) => {
    if (error) throw error; return (data ?? []).map(edgeQuestion)
  }))
  if (wanted.has('location_connection')) jobs.push(db.from('kg_locations')
    .select('id,source_id,name_en,source_name_hu,address_en,location_kind,resolution_status')
    .eq('resolution_status', 'pending').limit(Math.min(limit, 30)).then(async ({ data, error }) => {
      if (error) throw error
      return Promise.all((data ?? []).map(async (row) => locationQuestion(row, await suggestionsFor(row))))
    }))
  return (await Promise.all(jobs)).flat().slice(0, limit)
}

const decisionTable: Record<string, string> = { alias: 'kg_entity_aliases', entity: 'kg_entities', claim: 'kg_claims', edge: 'kg_edges' }

async function decideCanonical(input: DecisionInput) {
  const db = getAdminDb(); const table = decisionTable[input.kind]
  const select = input.kind === 'alias' ? 'id,review_status' : 'id,review_status,publication_status'
  const { data: rawExisting, error: readError } = await db.from(table).select(select).eq('id', input.id).maybeSingle()
  const existing = rawExisting as null | { id: string; review_status: string; publication_status?: string }
  if (readError) throw readError
  if (!existing) throw new Error('Review item was not found')
  if (!['draft', 'needs_review'].includes(existing.review_status)) throw new Error(`Item is already ${existing.review_status}`)
  const review_status = input.decision === 'approve' ? 'approved' : 'rejected'
  const update: Record<string, unknown> = { review_status }
  if (input.kind !== 'alias') {
    update.reviewed_at = new Date().toISOString()
    update.reviewed_by = 'admin'
    update.publication_status = input.decision === 'reject' ? 'private' : (existing.publication_status ?? 'private')
  }
  const { data, error } = await db.from(table).update(update).eq('id', input.id).eq('review_status', existing.review_status).select('id,review_status').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Decision conflicted with another update; refresh and try again')
  return { kind: input.kind, id: input.id, decision: input.decision, status: data.review_status, publicationStatus: update.publication_status ?? null }
}

async function decideLocation(input: DecisionInput) {
  const db = getAdminDb()
  const { data: staged, error } = await db.from('kg_locations').select('*').eq('id', input.id).maybeSingle()
  if (error) throw error
  if (!staged) throw new Error('Staged location was not found')
  if (staged.resolution_status !== 'pending') throw new Error(`Location is already ${staged.resolution_status}`)
  if (input.decision === 'reject') {
    const { data, error: rejectError } = await db.from('kg_locations').update({ resolution_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', input.id).eq('resolution_status', 'pending').select('id').maybeSingle()
    if (rejectError) throw rejectError
    if (!data) throw new Error('Decision conflicted with another update; refresh and try again')
    return { kind: input.kind, id: input.id, decision: input.decision, status: 'rejected', publicationStatus: null }
  }
  const publicId = input.publicLocationId as string
  if (staged.public_location_id && staged.public_location_id !== publicId) throw new Error(`Staged location is already linked to ${staged.public_location_id}`)
  const [{ data: source }, { data: publicLocation }, { data: canonical }] = await Promise.all([
    db.from('kg_sources').select('*').eq('id', staged.source_id).single(),
    db.from('locations').select('id,name,latitude,longitude,landmark_type').eq('id', publicId).single(),
    db.from('kg_entities').select('id,entity_kind,canonical_name_en,description_en,public_location_id,start_year,end_year,date_label_en,metadata,review_status,publication_status')
      .eq('entity_kind', 'location').eq('public_location_id', publicId).maybeSingle(),
  ])
  if (!source || !publicLocation) throw new Error('Source or public location was not found')
  const { data: aliases } = canonical ? await db.from('kg_entity_aliases').select('id,entity_id,alias,normalized_alias,language_code,alias_kind,review_status').eq('entity_id', canonical.id) : { data: [] }
  const ranked = rankLocationCandidates(staged, [{ ...publicLocation, aliases: (aliases ?? []).filter((a: any) => a.review_status === 'approved').map((a: any) => a.alias) }], new Map(), 1)
  const score = ranked[0]?.score ?? 0
  const plan = buildAutoLinkPlan({ source, stagedLocation: staged, publicLocation, existingCanonicalLocation: canonical, existingCanonicalAliases: aliases ?? [], matchedVia: ranked[0] ? (autoLinkMatchReason(ranked[0]) ?? 'manual_review') : 'manual_review', score })
  plan.entity.publication_status = canonical?.publication_status === 'public' ? 'public' : 'private'
  const entityWrite = await db.from('kg_entities').upsert(plan.entity, { onConflict: 'id' })
  if (entityWrite.error) throw entityWrite.error
  if (plan.aliases.length) { const aliasWrite = await db.from('kg_entity_aliases').upsert(plan.aliases, { onConflict: 'id' }); if (aliasWrite.error) throw aliasWrite.error }
  const { data: linked, error: linkError } = await db.from('kg_locations')
    .update({ public_location_id: publicId, resolution_status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', input.id).eq('resolution_status', 'pending').select('id').maybeSingle()
  if (linkError) throw linkError
  if (!linked) throw new Error('Location decision conflicted with another update; refresh and verify the canonical link')
  return { kind: input.kind, id: input.id, decision: input.decision, status: 'resolved', publicationStatus: plan.entity.publication_status, entityId: plan.entity.id, publicLocationId: publicId }
}

export const applyDecision = (input: DecisionInput) => input.kind === 'location_connection' ? decideLocation(input) : decideCanonical(input)
