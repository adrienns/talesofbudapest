import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalEntityIdForAlias, entityPresentationExclusionReason, genericCollectiveExclusionReason } from './historicalEntityPresentation.js';

test('bare people aliases never become an entity card', () => {
  assert.equal(genericCollectiveExclusionReason({ entity_class: 'group', label: 'a people', aliases: ['a people', 'people', 'People', 'some people'] }), 'generic_collective_not_entity');
  assert.equal(genericCollectiveExclusionReason({ type: 'group', label: 'some people', aliases: ['some people'] }), 'generic_collective_not_entity');
  assert.equal(genericCollectiveExclusionReason({ type: 'person', label: 'a Jew', aliases: ['a Jew'] }), 'generic_collective_not_entity');
});

test('named collectives remain entity cards', () => {
  assert.equal(genericCollectiveExclusionReason({ entity_class: 'group', label: 'Buda Jews', aliases: ['Buda Jews', 'the Buda Jews'] }), null);
});

test('reference chip maps to one exact canonical alias, not a shadow entity', () => {
  assert.equal(canonicalEntityIdForAlias([{ entity_id: 'person-1', label: 'King Matthias', aliases: ['Matthias'] }], 'Matthias'), 'person-1');
  assert.equal(canonicalEntityIdForAlias([{ entity_id: 'a', label: 'Jacob', aliases: [] }, { entity_id: 'b', label: 'Jacob', aliases: [] }], 'Jacob'), null);
});

test('dates stay evidence, never entity cards', () => {
  assert.equal(entityPresentationExclusionReason({ type: 'date', label: '1474' }), 'temporal_expression_not_entity');
  assert.equal(entityPresentationExclusionReason({ type: 'event', label: 'Friday night' }), 'temporal_expression_not_entity');
});

test('noun-ledger discourse placeholders never become entity cards', () => {
  assert.equal(entityPresentationExclusionReason({ type: 'building', label: 'synagogue', origin: 'noun_ledger', presentation_eligible: false }), 'discourse_placeholder_not_presentation_entity');
  assert.equal(entityPresentationExclusionReason({ type: 'group', label: 'Buda burghers', origin: 'noun_ledger', presentation_eligible: true }), null);
});

test('identity adjectives are evidence, not entity cards', () => {
  assert.equal(entityPresentationExclusionReason({ type: 'movement', label: 'Jewish' }), 'classificatory_mention_not_entity');
});

test('event mentions stay facts/evidence, not entity cards', () => {
  assert.equal(entityPresentationExclusionReason({ type: 'event', label: 'coronation' }), 'non_identity_mention_type');
});

test('unqualified buildings are evidence, while named buildings remain cards', () => {
  assert.equal(entityPresentationExclusionReason({ type: 'building', label: 'The synagogue' }), 'generic_building_not_entity');
  assert.equal(entityPresentationExclusionReason({ type: 'building', label: 'Moorish synagogue (Dohány utca)' }), null);
  assert.equal(entityPresentationExclusionReason({ type: 'organisation', label: 'Orthodox synagogue' }), 'generic_building_not_entity');
  assert.equal(entityPresentationExclusionReason({ type: 'business', label: 'foreign merchants' }), 'generic_business_not_identity');
  assert.equal(entityPresentationExclusionReason({ type: 'work', label: 'book' }), 'generic_work_not_identity');
  assert.equal(entityPresentationExclusionReason({ type: 'person', label: 'resh galuta' }), 'lowercase_person_candidate_not_identity');
  assert.equal(entityPresentationExclusionReason({ type: 'person', label: 'ben Virga' }), null);
});
