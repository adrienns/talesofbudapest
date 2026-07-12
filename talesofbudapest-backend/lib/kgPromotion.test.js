import test from 'node:test'; import assert from 'node:assert/strict';
import { buildAutoLinkPlan, buildPromotionPlan, normalizePredicate, parseTemporal, stableUuid, summarizeAutoLinkPlan } from './kgPromotion.js';
const fixture = () => ({
  source: { id: 'private-book', title: 'Private Book', author: 'Historian', license_verdict: 'red' },
  stagedLocation: { id: 'l1', name_en: 'Great Synagogue', source_name_hu: 'Nagy zsinagóga', address_en: 'Dohány Street', first_mention_id: 'm1' }, publicLocation: { id: 'public1', name: 'Dohány Street Synagogue' },
  facts: [{ id: 'f1', mention_id: 'm1', statement_en: 'The synagogue opened in 1859.', claim_type: 'opening', importance: 5, temporal_status: 'historical_fact' }],
  relations: [{ id: 'r1', mention_id: 'm1', subject_location_id: 'l1', object_person_id: 'p1', predicate: 'designed_by', statement_en: 'Ludwig Förster designed the synagogue.', importance: 5 }],
  people: [{ id: 'p1', canonical_name_en: 'Ludwig Förster', role_en: 'Architect' }], events: [], locations: [], pagesByMention: new Map([['m1', [{ page_number: 42, page_ref: 'book:page-42' }]]]),
});
test('normalization, dates, and IDs are deterministic', () => { assert.equal(normalizePredicate('Dohány–Street!'), 'dohany street'); assert.deepEqual(parseTemporal('built 1854–1859'), { start_year: 1854, end_year: 1859, date_label_en: '1854–1859' }); assert.equal(stableUuid('x'), stableUuid('x')); });

// Snapshot guard: normalizePredicate (the edge-signature-only normalizer)
// must stay pinned to the old simple fold forever, even as
// lib/kgNormalize.js's normalizeLocationName keeps evolving for the
// resolver's identity matching. If this UUID ever changes, every existing
// canonical edge in the DB gets a new id on the next promotion run and
// re-promotion duplicates edges instead of updating them in place. Computed
// against the code as it stood immediately before the kgNormalize.js
// unification (2026-07-11) and asserted to survive it.
test('edge signature UUID for a known relation is pinned and survives the normalizer unification', () => {
  const plan = buildPromotionPlan(fixture());
  assert.equal(plan.edges[0].id, '1d767923-9a08-5ffb-9f4b-3954163ab162');
});
test('default plan is private, safely cited, and idempotent', () => { const first = buildPromotionPlan(fixture()); assert.deepEqual(first, buildPromotionPlan(fixture())); assert.equal(first.entities.length, 2); assert.ok(first.entities.every((row) => row.review_status === 'needs_review' && row.publication_status === 'private')); assert.equal(first.claims[0].start_year, 1859); assert.equal(first.edges[0].predicate, 'designed_by'); assert.ok(first.evidence.every((row) => row.raw_excerpt === null && row.public_citation_en.includes('page 42'))); });
test('stamps claims with the era derived from their years', () => {
  const input = fixture();
  input.facts.push({ id: 'f2', mention_id: 'm1', statement_en: 'Restoration work finished in 1991.', claim_type: 'restoration', importance: 3, temporal_status: 'historical_fact' });
  input.facts.push({ id: 'f3', mention_id: 'm1', statement_en: 'No date is known for this detail.', claim_type: 'note', importance: 2, temporal_status: 'uncertain' });
  const plan = buildPromotionPlan(input);
  const opened = plan.claims.find((claim) => claim.metadata.source_fact_id === 'f1');
  const restored = plan.claims.find((claim) => claim.metadata.source_fact_id === 'f2');
  const undated = plan.claims.find((claim) => claim.metadata.source_fact_id === 'f3');
  assert.equal(opened.start_year, 1859); assert.equal(opened.era, 'absolutism');
  assert.equal(restored.start_year, 1991); assert.equal(restored.era, 'contemporary');
  assert.equal(undated.start_year, null); assert.equal(undated.era, null);
});
test('publish plan approves public rows but keeps evidence safe', () => { const plan = buildPromotionPlan({ ...fixture(), publish: true }); assert.ok([...plan.entities, ...plan.claims, ...plan.edges].every((row) => row.review_status === 'approved' && row.publication_status === 'public')); assert.ok(plan.evidence.every((row) => row.raw_excerpt === null)); });
test('reuses a seeded canonical location without losing metadata or downgrading status', () => {
  const existingCanonicalLocation = {
    id: 'db-generated-location-id', entity_kind: 'location', canonical_name_en: 'Seeded Synagogue', description_en: 'Existing description',
    public_location_id: 'public1', metadata: { seeded_by: 'public-location-seeder', retained: true }, review_status: 'approved', publication_status: 'public',
  };
  const existingCanonicalAliases = [{
    id: 'db-generated-alias-id', entity_id: existingCanonicalLocation.id, alias: 'Seeded synagogue alias',
    normalized_alias: 'seeded synagogue', language_code: 'en', alias_kind: 'name', review_status: 'approved',
  }];
  const input = fixture(); input.stagedLocation.name_en = 'Seeded Synagogue';
  const plan = buildPromotionPlan({ ...input, existingCanonicalLocation, existingCanonicalAliases }); const location = plan.entities.find((row) => row.entity_kind === 'location');
  assert.equal(location.id, existingCanonicalLocation.id); assert.equal(location.canonical_name_en, 'Seeded Synagogue');
  assert.equal(location.description_en, 'Existing description'); assert.equal(location.metadata.seeded_by, 'public-location-seeder');
  assert.equal(location.metadata.retained, true); assert.equal(location.metadata.promoted_from.staging_id, 'l1');
  assert.equal(location.review_status, 'approved'); assert.equal(location.publication_status, 'public');
  assert.ok(plan.claims.every((claim) => claim.subject_entity_id === existingCanonicalLocation.id));
  assert.ok(plan.edges.some((edge) => edge.subject_entity_id === existingCanonicalLocation.id));
  const reusedAlias = plan.aliases.find((alias) => alias.normalized_alias === 'seeded synagogue' && alias.alias_kind === 'name');
  assert.equal(reusedAlias.id, 'db-generated-alias-id'); assert.equal(reusedAlias.review_status, 'approved');
  assert.equal(plan.aliases.filter((alias) => alias.normalized_alias === 'seeded synagogue' && alias.alias_kind === 'name').length, 1);
});
test('deduplicates canonical edges and retains evidence from every staged mention', () => {
  const input = fixture();
  input.relations.push({ ...input.relations[0], id: 'r2', mention_id: 'm2', statement_en: 'The synagogue was designed by Ludwig Förster.', importance: 4 });
  input.pagesByMention.set('m2', [{ page_number: 43, page_ref: 'book:page-43' }]);
  const plan = buildPromotionPlan(input);
  assert.equal(plan.edges.length, 1); assert.deepEqual(plan.edges[0].metadata.source_relation_ids, ['r1', 'r2']);
  const edgeEvidence = plan.evidence.filter((row) => row.edge_id === plan.edges[0].id);
  assert.equal(edgeEvidence.length, 2); assert.deepEqual(edgeEvidence.map((row) => row.page_numbers[0]).sort(), [42, 43]);
  assert.deepEqual(edgeEvidence.map((row) => row.mention_id).sort(), ['m1', 'm2']);
});

test('organisation entities are promoted and relation endpoints resolve to them', () => {
  const input = fixture();
  input.organisations = [{ id: 'org1', canonical_name_en: 'OMIKE', source_name_hu: null }];
  input.relations.push({ id: 'r3', mention_id: 'm1', subject_person_id: 'p1', object_organisation_id: 'org1', predicate: 'member_of', statement_en: 'Ludwig Förster was a member of OMIKE.', importance: 3 });
  const plan = buildPromotionPlan(input);
  const org = plan.entities.find((entity) => entity.entity_kind === 'organisation');
  assert.ok(org, 'organisation entity should be promoted');
  assert.equal(org.canonical_name_en, 'OMIKE');
  const edge = plan.edges.find((row) => row.predicate === 'member_of');
  assert.ok(edge, 'edge to the organisation should be built');
  assert.equal(edge.object_entity_id, org.id);
  // Original fixture's edge signature must stay untouched by adding organisations.
  assert.equal(plan.edges.find((row) => row.predicate === 'designed_by').id, '1d767923-9a08-5ffb-9f4b-3954163ab162');
});

test('auto-link plan resolves identity only, stays private, and marks provenance', () => {
  const { source, stagedLocation, publicLocation } = fixture();
  const plan = buildAutoLinkPlan({ source, stagedLocation, publicLocation, matchedVia: 'exact_alias', score: 0.98 });
  assert.equal(plan.entity.entity_kind, 'location');
  assert.equal(plan.entity.public_location_id, publicLocation.id);
  assert.equal(plan.entity.review_status, 'approved', 'auto-link is a stronger signal than needs_review');
  assert.equal(plan.entity.publication_status, 'private', 'auto-link must never publish');
  assert.deepEqual(plan.entity.metadata.auto_link, { matched_via: 'exact_alias', score: 0.98, linked_at: plan.entity.metadata.auto_link.linked_at });
  assert.ok(plan.aliases.length > 0);
  assert.ok(plan.aliases.every((alias) => alias.review_status === 'approved'));
  const summary = summarizeAutoLinkPlan(plan, 'commit');
  assert.equal(summary.mode, 'commit');
  assert.equal(summary.matched_via, 'exact_alias');
  assert.equal(summary.entity.publication_status, 'private');
});

test('auto-link never republishes and never resurrects a rejected canonical location', () => {
  const { source, stagedLocation, publicLocation } = fixture();
  const alreadyPublic = {
    id: 'existing-public-entity', entity_kind: 'location', canonical_name_en: 'Dohány Street Synagogue',
    public_location_id: publicLocation.id, metadata: {}, review_status: 'approved', publication_status: 'public',
  };
  const publicPlan = buildAutoLinkPlan({ source, stagedLocation, publicLocation, existingCanonicalLocation: alreadyPublic, matchedVia: 'exact_alias', score: 0.95 });
  assert.equal(publicPlan.entity.publication_status, 'public', 'auto-link must not downgrade an already-public row');
  assert.equal(publicPlan.entity.id, alreadyPublic.id);

  const rejected = { ...alreadyPublic, id: 'existing-rejected-entity', review_status: 'rejected', publication_status: 'private' };
  assert.throws(() => buildAutoLinkPlan({ source, stagedLocation, publicLocation, existingCanonicalLocation: rejected, matchedVia: 'exact_alias', score: 0.95 }), /rejected/);
});
