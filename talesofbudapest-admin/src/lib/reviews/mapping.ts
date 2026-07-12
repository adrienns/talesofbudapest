import type { ReviewQuestion } from './types'

export const entityQuestion = (row: Record<string, any>): ReviewQuestion => ({
  id: row.id, kind: 'entity', question: `Is “${row.canonical_name_en}” a valid canonical ${row.entity_kind}?`,
  title: row.canonical_name_en, detail: row.description_en ?? null, status: row.review_status,
  publicationStatus: row.publication_status, context: { entityKind: row.entity_kind, years: [row.start_year, row.end_year] },
})

export const aliasQuestion = (row: Record<string, any>): ReviewQuestion => ({
  id: row.id, kind: 'alias', question: `Should “${row.alias}” be an approved alias for “${row.entity?.canonical_name_en ?? 'this entity'}”?`,
  title: row.alias, detail: row.entity?.canonical_name_en ?? null, status: row.review_status,
  context: { languageCode: row.language_code, aliasKind: row.alias_kind, entityId: row.entity_id },
})

export const claimQuestion = (row: Record<string, any>): ReviewQuestion => ({
  id: row.id, kind: 'claim', question: `Is this claim accurate and useful: “${row.statement_en}”?`, title: row.statement_en,
  detail: row.subject?.canonical_name_en ?? null, status: row.review_status, publicationStatus: row.publication_status,
  context: { subjectEntityId: row.subject_entity_id, claimType: row.claim_type, years: [row.start_year, row.end_year], importance: row.importance },
})

export const edgeQuestion = (row: Record<string, any>): ReviewQuestion => ({
  id: row.id, kind: 'edge', question: `Is “${row.subject?.canonical_name_en ?? 'entity'} ${row.predicate} ${row.object?.canonical_name_en ?? 'entity'}” a valid connection?`,
  title: row.statement_en ?? row.predicate, detail: null, status: row.review_status, publicationStatus: row.publication_status,
  context: { subjectEntityId: row.subject_entity_id, objectEntityId: row.object_entity_id, predicate: row.predicate, years: [row.start_year, row.end_year] },
})

export const locationQuestion = (row: Record<string, any>, suggestions: ReviewQuestion['suggestions']): ReviewQuestion => ({
  id: row.id, kind: 'location_connection', question: `Which existing map location is the same place as “${row.name_en}”?`,
  title: row.name_en, detail: row.address_en ?? null, status: row.resolution_status,
  context: { sourceId: row.source_id, sourceNameHu: row.source_name_hu, locationKind: row.location_kind }, suggestions,
})

