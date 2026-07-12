import 'server-only'

import { asSafeError, getAdminDb } from './adminDb'
import type { AdminEntityDetail, AdminInsights, Metric, NamedCount, SafeCitation } from '@/types/insights'

const COUNT_TABLES = [
  'locations', 'kg_sources', 'kg_pages', 'kg_mentions', 'kg_locations',
  'kg_people', 'kg_events', 'kg_facts', 'kg_staged_relations',
  'kg_entities', 'kg_entity_aliases', 'kg_claims', 'kg_edges', 'kg_evidence',
] as const

type TableCount = { table: string; count: number | null; available: boolean; error?: string }

async function countTable(table: string): Promise<TableCount> {
  const { count, error } = await getAdminDb().from(table).select('*', { count: 'exact', head: true })
  if (error) return { table, count: null, available: false, error: error.message }
  return { table, count: count ?? 0, available: true }
}

async function countStatus(table: string, column: string, value: string) {
  const { count, error } = await getAdminDb().from(table).select('*', { count: 'exact', head: true }).eq(column, value)
  return error ? null : count ?? 0
}

export async function getOverview() {
  const startedAt = Date.now()
  const [tables, statusValues, sourceResult] = await Promise.all([
    Promise.all(COUNT_TABLES.map(countTable)),
    Promise.all([
      countStatus('kg_locations', 'resolution_status', 'pending'), countStatus('kg_entities', 'review_status', 'needs_review'),
      countStatus('kg_entity_aliases', 'review_status', 'needs_review'), countStatus('kg_claims', 'review_status', 'needs_review'),
      countStatus('kg_edges', 'review_status', 'needs_review'), countStatus('kg_claims', 'publication_status', 'public'),
    ]),
    getAdminDb().from('kg_sources').select('id,title,license_verdict').order('title').limit(50),
  ])
  const [stagedLocationsPending, entitiesNeedReview, aliasesNeedReview, claimsNeedReview, edgesNeedReview, publicClaims] = statusValues
  const statuses = { stagedLocationsPending, entitiesNeedReview, aliasesNeedReview, claimsNeedReview, edgesNeedReview }
  const sources = await Promise.all((sourceResult.data ?? []).map(async (source) => {
    const [pages, extractedPages, approvedClaims] = await Promise.all([
      countStatus('kg_pages', 'source_id', source.id),
      countStatusForSource('kg_pages', source.id, 'status', 'extracted'),
      countApprovedClaimsForSource(source.id),
    ])
    return { id: source.id, title: source.title, licenseVerdict: source.license_verdict, pages, extractedPages, approvedClaims }
  }))
  const connected = tables.some((row) => row.available)
  const counts = Object.fromEntries(tables.map(({ table, count }) => [table, count]))
  return {
    health: {
      connected,
      state: connected ? (tables.every((row) => row.available) ? 'healthy' : 'degraded') : 'unavailable',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    },
    counts, statuses, sources,
    pipeline: {
      stagedRecords: ['kg_locations', 'kg_people', 'kg_events', 'kg_facts', 'kg_staged_relations'].reduce((sum, table) => sum + (counts[table] ?? 0), 0),
      reviewQueue: [stagedLocationsPending, entitiesNeedReview, aliasesNeedReview, claimsNeedReview, edgesNeedReview].reduce<number>((sum, count) => sum + (count ?? 0), 0),
      canonicalEntities: counts.kg_entities ?? null,
      publicClaims,
    },
    unavailableTables: tables.filter((row) => !row.available).map(({ table, error }) => ({ table, error })),
  }
}

async function countStatusForSource(table: string, sourceId: string, column: string, value: string) {
  const { count, error } = await getAdminDb().from(table).select('*', { count: 'exact', head: true }).eq('source_id', sourceId).eq(column, value)
  return error ? null : count ?? 0
}

async function countApprovedClaimsForSource(sourceId: string) {
  const { count, error } = await getAdminDb().from('kg_evidence')
    .select('id,claim:kg_claims!inner(id)', { count: 'exact', head: true })
    .eq('source_id', sourceId).not('claim_id', 'is', null).eq('claim.review_status', 'approved')
  return error ? null : count ?? 0
}

const safeLimit = (value: unknown, fallback = 100, max = 300) => {
  const parsed = Number(value)
  // Number(null) and Number('') are 0 (a valid integer), which without the
  // positivity guard collapsed to Math.max(1, 0) = 1 — so a missing ?limit
  // param silently capped every query at a single row.
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(max, parsed) : fallback
}

export async function getGraph(params: URLSearchParams) {
  const limit = safeLimit(params.get('limit'))
  const kind = allowed(params.get('kind'), ['location', 'person', 'event', 'organisation'])
  const review = allowed(params.get('reviewStatus'), ['draft', 'needs_review', 'approved', 'rejected'])
  const publication = allowed(params.get('publicationStatus'), ['private', 'public'])
  let entityQuery = getAdminDb().from('kg_entities')
    .select('id,entity_kind,canonical_name_en,description_en,public_location_id,start_year,end_year,date_label_en,review_status,publication_status,created_at,updated_at')
    .order('updated_at', { ascending: false }).limit(limit)
  if (kind) entityQuery = entityQuery.eq('entity_kind', kind)
  if (review) entityQuery = entityQuery.eq('review_status', review)
  if (publication) entityQuery = entityQuery.eq('publication_status', publication)
  const { data: entities, error: entityError } = await entityQuery
  if (entityError) throw new Error(entityError.message)
  const entityIds = (entities ?? []).map((row) => row.id)
  if (!entityIds.length) return { entities: [], edges: [], claims: [], truncated: false }

  let edgeQuery = getAdminDb().from('kg_edges')
    .select('id,subject_entity_id,predicate,object_entity_id,statement_en,start_year,end_year,date_label_en,importance,review_status,publication_status')
    .or(`subject_entity_id.in.(${entityIds.join(',')}),object_entity_id.in.(${entityIds.join(',')})`).limit(limit)
  let claimQuery = getAdminDb().from('kg_claims')
    .select('id,subject_entity_id,statement_en,claim_type,start_year,end_year,date_label_en,importance,review_status,publication_status')
    .in('subject_entity_id', entityIds).limit(limit)
  if (review) { edgeQuery = edgeQuery.eq('review_status', review); claimQuery = claimQuery.eq('review_status', review) }
  if (publication) { edgeQuery = edgeQuery.eq('publication_status', publication); claimQuery = claimQuery.eq('publication_status', publication) }
  const [edgeResult, claimResult] = await Promise.all([edgeQuery, claimQuery])
  if (edgeResult.error) throw new Error(edgeResult.error.message)
  if (claimResult.error) throw new Error(claimResult.error.message)
  // Hydrate the other ends of sampled edges. Previously the UI discarded an
  // otherwise valid edge whenever its neighbor was not in the first entity
  // page, making connected canonical records look isolated.
  const hydratedIds = new Set(entityIds)
  for (const edge of edgeResult.data ?? []) {
    hydratedIds.add(edge.subject_entity_id)
    hydratedIds.add(edge.object_entity_id)
  }
  const missingIds = [...hydratedIds].filter((id) => !entityIds.includes(id)).slice(0, limit)
  let neighbors: typeof entities = []
  if (missingIds.length) {
    const result = await getAdminDb().from('kg_entities')
      .select('id,entity_kind,canonical_name_en,description_en,public_location_id,start_year,end_year,date_label_en,review_status,publication_status,created_at,updated_at')
      .in('id', missingIds)
    if (result.error) throw new Error(result.error.message)
    neighbors = result.data ?? []
  }
  return {
    entities: [...(entities ?? []), ...(neighbors ?? [])], edges: edgeResult.data ?? [], claims: claimResult.data ?? [],
    truncated: (entities?.length ?? 0) === limit || (edgeResult.data?.length ?? 0) === limit || (claimResult.data?.length ?? 0) === limit,
  }
}

const allowed = <T extends string>(value: string | null, values: readonly T[]): T | null =>
  value && values.includes(value as T) ? value as T : null

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isUuid = (value: string | null): value is string => Boolean(value && uuidPattern.test(value))

const available = <T>(value: T, truncated = false): Metric<T> => ({ value, available: true, ...(truncated ? { truncated } : {}) })
const unavailable = <T>(note: string): Metric<T> => ({ value: null, available: false, note })

async function exactCount(table: string, configure?: (query: any) => any): Promise<Metric<number>> {
  try {
    let query: any = getAdminDb().from(table).select('*', { count: 'exact', head: true })
    if (configure) query = configure(query)
    const { count, error } = await query
    return error ? unavailable(error.message) : available(count ?? 0)
  } catch (error) { return unavailable(asSafeError(error)) }
}

async function grouped(table: string, column: string, limit = 5000): Promise<Metric<NamedCount[]>> {
  const { data, error } = await getAdminDb().from(table).select(column).limit(limit).returns<Array<Record<string, unknown>>>()
  if (error) return unavailable(error.message)
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const name = String(row[column] ?? 'unknown')
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return available([...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), (data?.length ?? 0) === limit)
}

async function groupedCombined(parts: Array<[string, string, string]>, limit = 5000): Promise<Metric<NamedCount[]>> {
  const results = await Promise.all(parts.map(([table, column, label]) => grouped(table, column, limit).then((metric) => ({ metric, label }))))
  if (!results.some(({ metric }) => metric.available)) return unavailable('All staging entity tables are unavailable')
  const values = results.flatMap(({ metric, label }) => metric.available ? [{ name: label, count: metric.value?.reduce((sum, item) => sum + item.count, 0) ?? 0 }] : [])
  return available(values, results.some(({ metric }) => metric.truncated))
}

async function countMissingEvidence(): Promise<Metric<number>> {
  const cap = 5000
  const [entities, claims, edges, evidence] = await Promise.all([
    getAdminDb().from('kg_entities').select('id').limit(cap),
    getAdminDb().from('kg_claims').select('id').limit(cap),
    getAdminDb().from('kg_edges').select('id').limit(cap),
    getAdminDb().from('kg_evidence').select('entity_id,claim_id,edge_id').limit(cap * 3),
  ])
  const failed = [entities, claims, edges, evidence].find((result) => result.error)
  if (failed?.error) return unavailable(failed.error.message)
  const covered = new Set<string>()
  for (const row of evidence.data ?? []) for (const key of ['entity_id', 'claim_id', 'edge_id'] as const) if (row[key]) covered.add(row[key]!)
  const records = [...(entities.data ?? []), ...(claims.data ?? []), ...(edges.data ?? [])]
  return available(records.filter((row) => !covered.has(row.id)).length, records.length >= cap * 3 || (evidence.data?.length ?? 0) >= cap * 3)
}

async function countStagingMissingEvidence(): Promise<Metric<number>> {
  const cap = 5000
  const specs = [['kg_locations', 'evidence'], ['kg_people', 'evidence'], ['kg_events', 'evidence'], ['kg_facts', 'evidence'], ['kg_staged_relations', 'evidence']] as const
  const results = await Promise.all(specs.map(([table, column]) => getAdminDb().from(table).select(`id,${column}`).limit(cap).returns<Array<Record<string, unknown>>>() ))
  if (results.every((result) => result.error)) return unavailable('Staging evidence metrics are unavailable')
  let count = 0
  for (const result of results) for (const row of result.data ?? []) {
    const evidence = row.evidence
    if (!evidence || (typeof evidence === 'object' && Object.keys(evidence as object).length === 0)) count++
  }
  return available(count, results.some((result) => (result.data?.length ?? 0) === cap))
}

async function sourceCountsThroughMentions(table: 'kg_facts' | 'kg_staged_relations') {
  const counts = new Map<string, number>()
  const pageSize = 1000
  const cap = 20_000
  for (let from = 0; from < cap; from += pageSize) {
    const { data, error } = await getAdminDb().from(table)
      .select('mention:kg_mentions!inner(source_id)')
      .range(from, from + pageSize - 1)
      .returns<Array<{ mention: { source_id: string } }>>()
    if (error) return { counts: null, error: error.message, truncated: false }
    for (const row of data ?? []) counts.set(row.mention.source_id, (counts.get(row.mention.source_id) ?? 0) + 1)
    if ((data?.length ?? 0) < pageSize) return { counts, error: null, truncated: false }
  }
  return { counts, error: null, truncated: true }
}

export async function getInsights(): Promise<AdminInsights> {
  const totalTables = ['kg_sources', 'kg_pages', 'kg_mentions', 'kg_locations', 'kg_people', 'kg_events', 'kg_facts', 'kg_staged_relations', 'kg_entities', 'kg_entity_aliases', 'kg_claims', 'kg_edges']
  const totalEntries = await Promise.all(totalTables.map(async (table) => [table, await exactCount(table)] as const))
  const [canonicalKinds, stagingKinds, pageStatuses, entityReviews, aliasReviews, claimReviews, edgeReviews, entityPublication, claimPublication, edgePublication, canonicalPredicates, stagingPredicates, failedPages, unresolvedLocations, unresolvedPeople, unresolvedEvents, unresolvedSubject, unresolvedObject, missingCanonicalEvidence, missingStagingEvidence, claimYears, claimEras, sourceResult, factSourcesResult, relationSourcesResult] = await Promise.all([
    grouped('kg_entities', 'entity_kind'), groupedCombined([['kg_locations', 'id', 'location'], ['kg_people', 'id', 'person'], ['kg_events', 'id', 'event']]), grouped('kg_pages', 'status'),
    grouped('kg_entities', 'review_status'), grouped('kg_entity_aliases', 'review_status'), grouped('kg_claims', 'review_status'), grouped('kg_edges', 'review_status'),
    grouped('kg_entities', 'publication_status'), grouped('kg_claims', 'publication_status'), grouped('kg_edges', 'publication_status'),
    grouped('kg_edges', 'predicate'), grouped('kg_staged_relations', 'predicate'), exactCount('kg_pages', (q) => q.eq('status', 'failed')),
    exactCount('kg_locations', (q) => q.eq('resolution_status', 'pending')), exactCount('kg_people', (q) => q.eq('resolution_status', 'pending')), exactCount('kg_events', (q) => q.eq('resolution_status', 'pending')),
    exactCount('kg_staged_relations', (q) => q.is('subject_location_id', null).is('subject_person_id', null).is('subject_event_id', null)),
    exactCount('kg_staged_relations', (q) => q.is('object_location_id', null).is('object_person_id', null).is('object_event_id', null)),
    countMissingEvidence(), countStagingMissingEvidence(), getAdminDb().from('kg_claims').select('start_year').not('start_year', 'is', null).limit(5000), grouped('kg_claims', 'era'),
    getAdminDb().from('kg_sources').select('id,title,license_verdict').order('title').limit(50),
    sourceCountsThroughMentions('kg_facts'),
    sourceCountsThroughMentions('kg_staged_relations'),
  ])
  const decadeCounts = new Map<string, number>()
  for (const row of claimYears.data ?? []) {
    const decade = `${Math.floor(Number(row.start_year) / 10) * 10}s`
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1)
  }
  const factsBySource = factSourcesResult.counts ?? new Map<string, number>()
  const relationsBySource = relationSourcesResult.counts ?? new Map<string, number>()
  const sources = sourceResult.error ? unavailable<any[]>(sourceResult.error.message) : available(await Promise.all((sourceResult.data ?? []).map(async (source) => {
    const [pages, extracted, failed, mentions, locations, people, events] = await Promise.all([
      exactCount('kg_pages', (q) => q.eq('source_id', source.id)), exactCount('kg_pages', (q) => q.eq('source_id', source.id).eq('status', 'extracted')), exactCount('kg_pages', (q) => q.eq('source_id', source.id).eq('status', 'failed')),
      exactCount('kg_mentions', (q) => q.eq('source_id', source.id)), exactCount('kg_locations', (q) => q.eq('source_id', source.id)), exactCount('kg_people', (q) => q.eq('source_id', source.id)), exactCount('kg_events', (q) => q.eq('source_id', source.id)),
    ])
    const stage = [locations.value, people.value, events.value]
    return { id: source.id, title: source.title, licenseVerdict: source.license_verdict, pages: pages.value, extractedPages: extracted.value, failedPages: failed.value, mentions: mentions.value, stagingEntities: stage.every((v) => v !== null) ? stage.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null, facts: factSourcesResult.error ? null : factsBySource.get(source.id) ?? 0, relations: relationSourcesResult.error ? null : relationsBySource.get(source.id) ?? 0 }
  })), (sourceResult.data?.length ?? 0) === 50 || factSourcesResult.truncated || relationSourcesResult.truncated)
  const unresolvedValues = [unresolvedLocations.value, unresolvedPeople.value, unresolvedEvents.value]
  const unresolved = unresolvedValues.every((v) => v !== null) ? available(unresolvedValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : unavailable<number>('One or more staging entity tables are unavailable')
  const endpointValues = [unresolvedSubject.value, unresolvedObject.value]
  const endpointCount = endpointValues.every((v) => v !== null) ? available(endpointValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : unavailable<number>('Staged relation endpoints are unavailable')
  return {
    generatedAt: new Date().toISOString(), totals: Object.fromEntries(totalEntries),
    entityKinds: { canonical: canonicalKinds, staging: stagingKinds }, pageStatuses,
    reviewStatuses: { entities: entityReviews, aliases: aliasReviews, claims: claimReviews, edges: edgeReviews },
    publication: { entities: entityPublication, claims: claimPublication, edges: edgePublication },
    predicates: { canonical: canonicalPredicates, staging: stagingPredicates },
    claimDecades: claimYears.error ? unavailable(claimYears.error.message) : available([...decadeCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)), (claimYears.data?.length ?? 0) === 5000), claimEras,
    sources,
    quality: { failedPages, unresolvedStagingEntities: unresolved, unresolvedRelationEndpoints: endpointCount, canonicalItemsMissingEvidence: missingCanonicalEvidence, stagingItemsMissingEvidence: missingStagingEvidence },
  }
}

const ENTITY_DETAIL_LIMIT = 100

async function safeCitationsForCanonical(entityId: string, claimIds: string[], edgeIds: string[]): Promise<SafeCitation[]> {
  const clauses = [`entity_id.eq.${entityId}`]
  if (claimIds.length) clauses.push(`claim_id.in.(${claimIds.join(',')})`)
  if (edgeIds.length) clauses.push(`edge_id.in.(${edgeIds.join(',')})`)
  const { data, error } = await getAdminDb().from('kg_evidence')
    .select('source_id,page_numbers,page_refs,public_citation_en,public_note_en')
    .or(clauses.join(',')).limit(ENTITY_DETAIL_LIMIT)
  if (error || !data?.length) return []
  const sourceIds = [...new Set(data.map((row) => row.source_id))]
  const sourceResult = await getAdminDb().from('kg_sources').select('id,title').in('id', sourceIds)
  const titles = new Map((sourceResult.data ?? []).map((row) => [row.id, row.title]))
  return data.map((row) => ({
    sourceId: row.source_id, sourceTitle: titles.get(row.source_id) ?? row.source_id,
    pageNumbers: row.page_numbers ?? [], pageRefs: row.page_refs ?? [],
    publicCitation: row.public_citation_en, publicNote: row.public_note_en,
  }))
}

async function safeCitationsForMentions(mentionIds: string[]): Promise<SafeCitation[]> {
  if (!mentionIds.length) return []
  const { data: links, error } = await getAdminDb().from('kg_mention_pages')
    .select('mention_id,page_id').in('mention_id', [...new Set(mentionIds)].slice(0, ENTITY_DETAIL_LIMIT)).limit(ENTITY_DETAIL_LIMIT * 3)
  if (error || !links?.length) return []
  const pageIds = [...new Set(links.map((row) => row.page_id))]
  const { data: pages, error: pageError } = await getAdminDb().from('kg_pages')
    .select('id,source_id,page_number,page_ref').in('id', pageIds).limit(ENTITY_DETAIL_LIMIT * 3)
  if (pageError || !pages?.length) return []
  const sourceIds = [...new Set(pages.map((row) => row.source_id))]
  const { data: sources } = await getAdminDb().from('kg_sources').select('id,title').in('id', sourceIds)
  const titles = new Map((sources ?? []).map((row) => [row.id, row.title]))
  return pages.map((page) => ({
    sourceId: page.source_id, sourceTitle: titles.get(page.source_id) ?? page.source_id,
    pageNumbers: [page.page_number], pageRefs: [page.page_ref], publicCitation: `${titles.get(page.source_id) ?? page.source_id}, p. ${page.page_number}`,
  }))
}

export async function getCanonicalEntityDetail(id: string): Promise<AdminEntityDetail | null> {
  const { data: entity, error } = await getAdminDb().from('kg_entities')
    .select('id,entity_kind,canonical_name_en,description_en,start_year,end_year,date_label_en,review_status,publication_status')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!entity) return null
  const [aliasResult, claimResult, edgeResult] = await Promise.all([
    getAdminDb().from('kg_entity_aliases').select('id,alias,language_code,alias_kind,review_status').eq('entity_id', id).limit(ENTITY_DETAIL_LIMIT),
    getAdminDb().from('kg_claims').select('id,statement_en,claim_type,review_status,publication_status,importance,start_year,end_year,date_label_en').eq('subject_entity_id', id).order('importance', { ascending: false }).limit(ENTITY_DETAIL_LIMIT),
    getAdminDb().from('kg_edges').select('id,subject_entity_id,predicate,object_entity_id,review_status,publication_status,start_year,end_year,date_label_en').or(`subject_entity_id.eq.${id},object_entity_id.eq.${id}`).limit(ENTITY_DETAIL_LIMIT),
  ])
  for (const result of [aliasResult, claimResult, edgeResult]) if (result.error) throw new Error(result.error.message)
  const edges = edgeResult.data ?? []
  const neighborIds = [...new Set(edges.map((edge) => edge.subject_entity_id === id ? edge.object_entity_id : edge.subject_entity_id))]
  const neighborResult = neighborIds.length ? await getAdminDb().from('kg_entities').select('id,canonical_name_en,entity_kind').in('id', neighborIds) : { data: [], error: null }
  if (neighborResult.error) throw new Error(neighborResult.error.message)
  const neighbors = new Map((neighborResult.data ?? []).map((row) => [row.id, row]))
  const citations = await safeCitationsForCanonical(id, (claimResult.data ?? []).map((row) => row.id), edges.map((row) => row.id))
  return {
    source: 'canonical',
    identity: { id: entity.id, kind: entity.entity_kind, name: entity.canonical_name_en, description: entity.description_en, status: entity.review_status, publicationStatus: entity.publication_status, startYear: entity.start_year, endYear: entity.end_year, dateLabel: entity.date_label_en },
    aliases: (aliasResult.data ?? []).map((row) => ({ id: row.id, alias: row.alias, languageCode: row.language_code, kind: row.alias_kind, status: row.review_status })),
    claims: (claimResult.data ?? []).map((row) => ({ id: row.id, statement: row.statement_en, claimType: row.claim_type, status: row.review_status, publicationStatus: row.publication_status, importance: row.importance, startYear: row.start_year, endYear: row.end_year, dateLabel: row.date_label_en })),
    connections: edges.map((edge) => {
      const outgoing = edge.subject_entity_id === id
      const neighborId = outgoing ? edge.object_entity_id : edge.subject_entity_id
      const neighbor = neighbors.get(neighborId)
      return { id: edge.id, predicate: edge.predicate, direction: outgoing ? 'outgoing' as const : 'incoming' as const, neighborId, neighborName: neighbor?.canonical_name_en ?? '(unavailable)', neighborKind: neighbor?.entity_kind ?? 'unknown', status: edge.review_status, publicationStatus: edge.publication_status, startYear: edge.start_year, endYear: edge.end_year, dateLabel: edge.date_label_en }
    }),
    citations,
    truncated: (aliasResult.data?.length ?? 0) === ENTITY_DETAIL_LIMIT || (claimResult.data?.length ?? 0) === ENTITY_DETAIL_LIMIT || edges.length === ENTITY_DETAIL_LIMIT || citations.length === ENTITY_DETAIL_LIMIT,
  }
}

type StagingKind = 'location' | 'person' | 'event' | 'organisation'
export const isStagingKind = (value: string | null): value is StagingKind => Boolean(value && ['location', 'person', 'event', 'organisation'].includes(value))

export async function getStagingEntityDetail(id: string, kind: StagingKind): Promise<AdminEntityDetail | null> {
  const config = {
    location: { table: 'kg_locations', select: 'id,source_id,name_en,source_name_hu,address_en,location_kind,resolution_status,metadata', name: 'name_en', sourceName: 'source_name_hu' },
    person: { table: 'kg_people', select: 'id,source_id,canonical_name_en,source_name_hu,role_en,resolution_status,metadata', name: 'canonical_name_en', sourceName: 'source_name_hu' },
    event: { table: 'kg_events', select: 'id,source_id,title_en,statement_en,claim_type,importance,resolution_status,first_mention_id,metadata', name: 'title_en', sourceName: null },
    organisation: { table: 'kg_organisations', select: 'id,source_id,canonical_name_en,source_name_hu,org_kind,resolution_status,metadata', name: 'canonical_name_en', sourceName: 'source_name_hu' },
  }[kind]
  const result = await getAdminDb().from(config.table).select(config.select).eq('id', id).maybeSingle().returns<Record<string, any>>()
  if (result.error) throw new Error(result.error.message)
  const entity = result.data
  if (!entity) return null
  const fk = `${kind}_id`
  const relationSelect = 'id,mention_id,predicate,status,importance,subject_text_en,subject_kind,object_text_en,object_kind,subject_location_id,subject_person_id,subject_event_id,subject_organisation_id,object_location_id,object_person_id,object_event_id,object_organisation_id'
  const relationResult = await getAdminDb().from('kg_staged_relations').select(relationSelect).or(`subject_${fk}.eq.${id},object_${fk}.eq.${id}`).limit(ENTITY_DETAIL_LIMIT).returns<Array<Record<string, any>>>()
  if (relationResult.error) throw new Error(relationResult.error.message)
  const relations = relationResult.data ?? []
  let facts: Array<Record<string, any>> = []
  if (kind === 'location') {
    const factResult = await getAdminDb().from('kg_facts').select('id,mention_id,statement_en,claim_type,importance,status').eq('location_id', id).order('importance', { ascending: false }).limit(ENTITY_DETAIL_LIMIT).returns<Array<Record<string, any>>>()
    if (factResult.error) throw new Error(factResult.error.message)
    facts = factResult.data ?? []
  } else if (kind === 'event') {
    facts = [{ id: entity.id, mention_id: entity.first_mention_id, statement_en: entity.statement_en, claim_type: entity.claim_type, importance: entity.importance, status: entity.resolution_status }]
  }
  const mentionIds = [...facts, ...relations].map((row) => row.mention_id).filter(Boolean)
  const citations = await safeCitationsForMentions(mentionIds)
  return {
    source: 'staging',
    identity: { id: entity.id, kind, name: entity[config.name], sourceName: config.sourceName ? entity[config.sourceName] : null, description: kind === 'location' ? entity.address_en : kind === 'person' ? entity.role_en : kind === 'organisation' ? entity.org_kind : null, status: entity.resolution_status, sourceId: entity.source_id },
    aliases: config.sourceName && entity[config.sourceName] && entity[config.sourceName] !== entity[config.name] ? [{ id: `${id}-source-name`, alias: entity[config.sourceName], languageCode: 'hu', kind: 'source_name' }] : [],
    claims: facts.map((fact) => ({ id: fact.id, statement: fact.statement_en, claimType: fact.claim_type, status: fact.status, importance: fact.importance })),
    connections: relations.map((relation) => {
      const outgoing = relation[`subject_${kind}_id`] === id
      return { id: relation.id, predicate: relation.predicate, direction: outgoing ? 'outgoing' as const : 'incoming' as const, neighborId: outgoing ? (relation[`object_${relation.object_kind}_id`] ?? '') : (relation[`subject_${relation.subject_kind}_id`] ?? ''), neighborName: outgoing ? relation.object_text_en : relation.subject_text_en, neighborKind: outgoing ? relation.object_kind : relation.subject_kind, status: relation.status }
    }),
    citations,
    truncated: relations.length === ENTITY_DETAIL_LIMIT || facts.length === ENTITY_DETAIL_LIMIT || citations.length >= ENTITY_DETAIL_LIMIT * 3,
  }
}

// Staging graph: the raw extracted network before promotion. Unlike the
// canonical graph (which starts near-empty), staging holds the full book
// extraction. We drive from kg_staged_relations (the edges) and then fetch
// only the entities those edges connect, so the returned graph is actually
// connected rather than a field of isolated nodes. Subject/object are resolved
// via whichever entity FK the loader populated (person/location/event).
export async function getStagingGraph(params: URLSearchParams) {
  // Fetch broadly: most staged relations have an unresolved (null-FK) endpoint
  // and get dropped, so a small limit surfaces very few connected edges.
  const limit = safeLimit(params.get('limit'), 800, 2000)
  const kind = params.get('kind')

  const { data: relations, error: relError } = await getAdminDb().from('kg_staged_relations')
    .select('id,predicate,status,importance,subject_person_id,subject_location_id,subject_event_id,subject_organisation_id,object_person_id,object_location_id,object_event_id,object_organisation_id')
    .order('importance', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<Array<Record<string, unknown>>>()
  if (relError) throw new Error(relError.message)

  const endpoint = (row: Record<string, unknown>, side: 'subject' | 'object') => {
    if (row[`${side}_person_id`]) return { id: row[`${side}_person_id`] as string, kind: 'person' as const }
    if (row[`${side}_location_id`]) return { id: row[`${side}_location_id`] as string, kind: 'location' as const }
    if (row[`${side}_event_id`]) return { id: row[`${side}_event_id`] as string, kind: 'event' as const }
    if (row[`${side}_organisation_id`]) return { id: row[`${side}_organisation_id`] as string, kind: 'organisation' as const }
    return null
  }

  const wanted = { location: new Set<string>(), person: new Set<string>(), event: new Set<string>(), organisation: new Set<string>() }
  const resolvedEdges: Array<{ id: string; subject_entity_id: string; object_entity_id: string; predicate: string; review_status?: string | null }> = []
  for (const row of relations ?? []) {
    const subject = endpoint(row, 'subject')
    const object = endpoint(row, 'object')
    if (!subject || !object) continue
    wanted[subject.kind].add(subject.id)
    wanted[object.kind].add(object.id)
    resolvedEdges.push({ id: row.id as string, subject_entity_id: subject.id, object_entity_id: object.id, predicate: row.predicate as string, review_status: row.status as string })
  }

  const fetchEntities = async (table: string, nameColumn: string, entityKind: string, ids: Set<string>) => {
    if (!ids.size) return []
    const { data, error } = await getAdminDb().from(table)
      .select(`id,${nameColumn},resolution_status,metadata`).in('id', [...ids])
      .returns<Array<Record<string, unknown>>>()
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string, entity_kind: entityKind,
      canonical_name_en: (row[nameColumn] as string) ?? '(unnamed)', review_status: (row.resolution_status as string) ?? null,
      needs_research: (row.metadata as Record<string, unknown> | null)?.needs_research === true,
    }))
  }

  const [locations, people, events, organisations] = await Promise.all([
    fetchEntities('kg_locations', 'name_en', 'location', wanted.location),
    fetchEntities('kg_people', 'canonical_name_en', 'person', wanted.person),
    fetchEntities('kg_events', 'title_en', 'event', wanted.event),
    fetchEntities('kg_organisations', 'canonical_name_en', 'organisation', wanted.organisation),
  ])
  let entities = [...locations, ...people, ...events, ...organisations]
  if (kind) entities = entities.filter((entity) => entity.entity_kind === kind)
  const entityIds = new Set(entities.map((entity) => entity.id))
  const edges = resolvedEdges.filter((edge) => entityIds.has(edge.subject_entity_id) && entityIds.has(edge.object_entity_id))

  return { entities, edges, claims: [], truncated: (relations?.length ?? 0) === limit }
}

export async function safely<T>(work: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try { return { data: await work(), error: null } }
  catch (error) { return { data: null, error: asSafeError(error) } }
}
