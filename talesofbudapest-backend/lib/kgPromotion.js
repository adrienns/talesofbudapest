import crypto from 'node:crypto';
import { eraForYears } from './kgEras.js';
import { normalizeLocationName, simpleFold } from './kgNormalize.js';

const UUID_NAMESPACE = 'tales-of-budapest-kg-promotion-v1';

// Edge signatures (see the stableUuid('edge-signature', ...) call below) must
// keep normalizing predicates with the OLD simple fold, never
// normalizeLocationName. normalizeLocationName's TYPE_WORDS/district/article
// canonicalization is expected to keep evolving as the resolver improves; if
// the edge signature normalizer moved with it, every such change would
// silently reassign every existing edge's stableUuid, and a re-promotion
// would duplicate rather than update those edges. simpleFold is deliberately
// frozen for this one purpose. See lib/kgPromotion.test.js's edge-signature
// snapshot test.
export const normalizePredicate = simpleFold;

export const stableUuid = (...parts) => {
  const bytes = crypto.createHash('sha256').update([UUID_NAMESPACE, ...parts].join('\u001f')).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const parseTemporal = (...values) => {
  const text = values.filter(Boolean).join(' ');
  const range = text.match(/\b(1[0-9]{3}|20[0-9]{2})\s*[–—-]\s*(1[0-9]{3}|20[0-9]{2})\b/);
  if (range) return { start_year: Number(range[1]), end_year: Number(range[2]), date_label_en: range[0] };
  const year = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return year ? { start_year: Number(year[1]), end_year: null, date_label_en: year[0] } : { start_year: null, end_year: null, date_label_en: null };
};

const statuses = (publish) => ({ review_status: publish ? 'approved' : 'needs_review', publication_status: publish ? 'public' : 'private' });
const importance = (value) => Number.isInteger(value) && value >= 1 && value <= 5 ? value : 3;
const entityId = (kind, sourceId, stagedId, publicLocationId) => kind === 'location' && publicLocationId
  ? stableUuid('entity', 'public-location', publicLocationId) : stableUuid('entity', kind, sourceId, stagedId);

const mergedStatuses = (existing, publish) => {
  const requested = statuses(publish);
  if (!existing) return requested;
  if (existing.review_status === 'rejected') return { review_status: 'rejected', publication_status: 'private' };
  const reviewRank = { draft: 0, needs_review: 1, approved: 2 };
  return {
    review_status: reviewRank[existing.review_status] > reviewRank[requested.review_status] ? existing.review_status : requested.review_status,
    publication_status: existing.publication_status === 'public' || requested.publication_status === 'public' ? 'public' : 'private',
  };
};

const makeEntity = ({ kind, staged, sourceId, publicLocation = null, existing = null, publish = false }) => {
  const temporal = kind === 'event' ? parseTemporal(staged.evidence?.date_label_en, staged.statement_en, staged.title_en) : { start_year: null, end_year: null, date_label_en: null };
  return {
    id: existing?.id ?? entityId(kind, sourceId, staged.id, publicLocation?.id), entity_kind: kind,
    canonical_name_en: existing?.canonical_name_en ?? (kind === 'location' ? publicLocation?.name ?? staged.name_en : kind === 'person' || kind === 'organisation' ? staged.canonical_name_en : staged.title_en),
    description_en: existing?.description_en ?? (kind === 'person' ? staged.role_en ?? null : kind === 'event' ? staged.statement_en ?? null : null),
    public_location_id: kind === 'location' ? publicLocation?.id ?? null : null,
    start_year: existing?.start_year ?? temporal.start_year, end_year: existing?.end_year ?? temporal.end_year,
    date_label_en: existing?.date_label_en ?? temporal.date_label_en,
    metadata: { ...(existing?.metadata ?? {}), promoted_from: { source_id: sourceId, staging_table: `kg_${kind === 'person' ? 'people' : `${kind}s`}`, staging_id: staged.id } },
    ...mergedStatuses(existing, publish),
  };
};

const mergedAliasReview = (existingStatus, requestedStatus) => {
  if (existingStatus === 'rejected') return 'rejected';
  const rank = { draft: 0, needs_review: 1, approved: 2 };
  return rank[existingStatus] > rank[requestedStatus] ? existingStatus : requestedStatus;
};

const aliasesFor = (entity, staged, existingAliases = []) => {
  const candidates = entity.entity_kind === 'location'
    ? [[entity.canonical_name_en, 'en', 'name'], [staged.name_en, 'en', 'name'], [staged.source_name_hu, 'hu', 'name'], [staged.address_en, 'en', 'address'], [staged.source_address_hu, 'hu', 'address']]
    : entity.entity_kind === 'person' || entity.entity_kind === 'organisation' ? [[staged.canonical_name_en, 'en', 'name'], [staged.source_name_hu, 'hu', 'name']]
      : [[staged.title_en, 'en', 'name']];
  const existingByKey = new Map(existingAliases.map((alias) => [`${alias.normalized_alias}\u001f${alias.alias_kind}`, alias]));
  const rowsByKey = new Map();
  for (const [alias, language_code, alias_kind] of candidates) {
    const normalizedAlias = normalizeLocationName(alias); if (!normalizedAlias) continue;
    const key = `${normalizedAlias}\u001f${alias_kind}`; if (rowsByKey.has(key)) continue;
    const existing = existingByKey.get(key);
    rowsByKey.set(key, {
      id: existing?.id ?? stableUuid('alias', entity.id, alias_kind, normalizedAlias), entity_id: entity.id,
      alias: existing?.alias ?? alias, normalized_alias: normalizedAlias,
      language_code: existing?.language_code ?? language_code, alias_kind,
      review_status: mergedAliasReview(existing?.review_status, entity.review_status),
    });
  }
  return [...rowsByKey.values()];
};

const endpoint = (relation, side, maps) => {
  for (const kind of ['location', 'person', 'event', 'organisation']) {
    const id = relation[`${side}_${kind}_id`];
    if (id && maps[kind].has(id)) return maps[kind].get(id);
  }
  return null;
};

export const buildPromotionPlan = ({ source, stagedLocation, publicLocation, existingCanonicalLocation = null, existingCanonicalAliases = [], facts = [], relations = [], people = [], events = [], locations = [], organisations = [], pagesByMention = new Map(), publish = false }) => {
  const selected = makeEntity({ kind: 'location', staged: stagedLocation, sourceId: source.id, publicLocation, existing: existingCanonicalLocation, publish });
  const maps = { location: new Map([[stagedLocation.id, selected]]), person: new Map(), event: new Map(), organisation: new Map() };
  for (const row of locations) if (!maps.location.has(row.id)) maps.location.set(row.id, makeEntity({ kind: 'location', staged: row, sourceId: source.id, publish }));
  for (const row of people) maps.person.set(row.id, makeEntity({ kind: 'person', staged: row, sourceId: source.id, publish }));
  for (const row of events) maps.event.set(row.id, makeEntity({ kind: 'event', staged: row, sourceId: source.id, publish }));
  for (const row of organisations) maps.organisation.set(row.id, makeEntity({ kind: 'organisation', staged: row, sourceId: source.id, publish }));
  const entities = [...maps.location.values(), ...maps.person.values(), ...maps.event.values(), ...maps.organisation.values()];
  const stagingRows = { location: [stagedLocation, ...locations], person: people, event: events, organisation: organisations };
  const aliases = entities.flatMap((entity) => aliasesFor(
    entity,
    stagingRows[entity.entity_kind].find((row) => row.id === entity.metadata.promoted_from.staging_id),
    entity.id === selected.id ? existingCanonicalAliases : [],
  ));
  const claims = facts.map((fact) => {
    const temporal = parseTemporal(fact.evidence?.date_label_en, fact.statement_en);
    return {
      id: stableUuid('claim', source.id, fact.id), subject_entity_id: selected.id, statement_en: fact.statement_en,
      claim_type: fact.claim_type ?? null, ...temporal, era: eraForYears(temporal.start_year, temporal.end_year), importance: importance(fact.importance),
      metadata: { source_fact_id: fact.id, temporal_status: fact.temporal_status }, ...statuses(publish),
    };
  });
  const skippedRelations = [];
  const edgeGroups = new Map(); const edgeIdByRelation = new Map();
  for (const relation of relations) {
    const subject = endpoint(relation, 'subject', maps); const object = endpoint(relation, 'object', maps);
    if (!subject || !object || subject.id === object.id) { skippedRelations.push({ id: relation.id, reason: !subject || !object ? 'unresolved_endpoint' : 'self_edge' }); continue; }
    const temporal = parseTemporal(relation.evidence?.date_label_en, relation.statement_en);
    const signature = [subject.id, normalizePredicate(relation.predicate), object.id, temporal.start_year ?? ''].join('\u001f');
    const edgeId = stableUuid('edge-signature', signature); edgeIdByRelation.set(relation.id, edgeId);
    const current = edgeGroups.get(signature);
    if (current) {
      current.importance = Math.max(current.importance, importance(relation.importance));
      current.metadata.source_relation_ids.push(relation.id);
      current.metadata.temporal_statuses = [...new Set([...current.metadata.temporal_statuses, relation.temporal_status].filter(Boolean))];
    } else edgeGroups.set(signature, {
      id: edgeId, subject_entity_id: subject.id, predicate: relation.predicate, object_entity_id: object.id,
      statement_en: relation.statement_en ?? null, ...temporal, importance: importance(relation.importance),
      metadata: { source_relation_ids: [relation.id], temporal_statuses: [relation.temporal_status].filter(Boolean) }, ...statuses(publish),
    });
  }
  const edges = [...edgeGroups.values()];
  const citation = (mentionId) => {
    const pages = pagesByMention.get(mentionId) ?? [];
    const pageNumbers = [...new Set(pages.map((page) => page.page_number).filter(Boolean))].sort((a, b) => a - b);
    const pageRefs = [...new Set(pages.map((page) => page.page_ref).filter(Boolean))];
    return { pageNumbers, pageRefs, text: `${source.title}${source.author ? `, ${source.author}` : ''}${pageNumbers.length ? `, page${pageNumbers.length === 1 ? '' : 's'} ${pageNumbers.join(', ')}` : ''}.` };
  };
  const evidence = [];
  const addEvidence = (targetKind, targetId, mentionId) => {
    if (!mentionId) return;
    const cited = citation(mentionId);
    evidence.push({
      id: stableUuid('evidence', targetKind, targetId, source.id, mentionId, ...cited.pageRefs), entity_id: targetKind === 'entity' ? targetId : null,
      edge_id: targetKind === 'edge' ? targetId : null, claim_id: targetKind === 'claim' ? targetId : null, source_id: source.id, mention_id: mentionId,
      page_numbers: cited.pageNumbers, page_refs: cited.pageRefs, public_citation_en: cited.text, public_note_en: null, raw_excerpt: null, extraction_model: null,
    });
  };
  addEvidence('entity', selected.id, stagedLocation.first_mention_id);
  for (const event of events) addEvidence('entity', maps.event.get(event.id).id, event.first_mention_id);
  for (const fact of facts) addEvidence('claim', stableUuid('claim', source.id, fact.id), fact.mention_id);
  for (const relation of relations) if (edgeIdByRelation.has(relation.id)) addEvidence('edge', edgeIdByRelation.get(relation.id), relation.mention_id);
  return { source, stagedLocation, publicLocation, entities, aliases, claims, edges, evidence, skippedRelations };
};

export const summarizePromotionPlan = (plan, mode) => ({
  mode, source: { id: plan.source.id, title: plan.source.title, license_verdict: plan.source.license_verdict },
  location_match: { staged_id: plan.stagedLocation.id, staged_name: plan.stagedLocation.name_en, public_id: plan.publicLocation.id, public_name: plan.publicLocation.name },
  counts: { entities: plan.entities.length, aliases: plan.aliases.length, claims: plan.claims.length, edges: plan.edges.length, evidence: plan.evidence.length, skipped_relations: plan.skippedRelations.length },
  entities: plan.entities.map(({ id, entity_kind, canonical_name_en, description_en, review_status, publication_status }) => ({ id, entity_kind, canonical_name_en, description_en, review_status, publication_status })),
  claims: plan.claims.map(({ id, statement_en, claim_type, start_year, importance }) => ({ id, statement_en, claim_type, start_year, importance })),
  edges: plan.edges.map(({ id, subject_entity_id, predicate, object_entity_id, statement_en, start_year, importance }) => ({ id, subject_entity_id, predicate, object_entity_id, statement_en, start_year, importance })),
  citations: plan.evidence.map(({ public_citation_en, page_numbers, page_refs }) => ({ public_citation_en, page_numbers, page_refs })), skipped_relations: plan.skippedRelations,
});

// Auto-link plan: the identity resolution half of a promotion only (the
// staged location <-> public location entity and its aliases), never facts,
// relations, people, or events. Those still require a human running
// promote-kg-location.js -- auto-link only ever resolves "which mapped
// landmark is this", never "which claims about it are safe to publish".
//
// The resulting entity is always private. review_status is 'approved'
// (never 'needs_review') to distinguish a high-confidence automatic
// resolution from a queued-for-manual-review one, per the design's decision
// table (score >= 0.90 AND exact alias or distance <= 50m). It never sets
// publication_status to 'public' and never touches an existing 'rejected'
// canonical location.
export const buildAutoLinkPlan = ({ source, stagedLocation, publicLocation, existingCanonicalLocation = null, existingCanonicalAliases = [], matchedVia, score }) => {
  if (existingCanonicalLocation?.review_status === 'rejected') {
    throw new Error(`Refusing to auto-link over a rejected canonical location (${existingCanonicalLocation.id})`);
  }
  const entity = makeEntity({ kind: 'location', staged: stagedLocation, sourceId: source.id, publicLocation, existing: existingCanonicalLocation, publish: false });
  entity.review_status = 'approved';
  entity.publication_status = existingCanonicalLocation?.publication_status === 'public' ? 'public' : 'private';
  entity.metadata = { ...entity.metadata, auto_link: { matched_via: matchedVia, score, linked_at: new Date().toISOString() } };
  const aliases = aliasesFor(entity, stagedLocation, existingCanonicalAliases)
    .map((alias) => ({ ...alias, review_status: alias.review_status === 'rejected' ? 'rejected' : 'approved' }));
  return { source, stagedLocation, publicLocation, entity, aliases, matchedVia, score };
};

export const summarizeAutoLinkPlan = (plan, mode) => ({
  mode, source: { id: plan.source.id, title: plan.source.title, license_verdict: plan.source.license_verdict },
  location_match: { staged_id: plan.stagedLocation.id, staged_name: plan.stagedLocation.name_en, public_id: plan.publicLocation.id, public_name: plan.publicLocation.name },
  matched_via: plan.matchedVia, score: plan.score,
  entity: { id: plan.entity.id, review_status: plan.entity.review_status, publication_status: plan.entity.publication_status },
  aliases: plan.aliases.map(({ alias, normalized_alias, alias_kind }) => ({ alias, normalized_alias, alias_kind })),
});
