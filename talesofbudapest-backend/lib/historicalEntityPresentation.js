const fold = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();

const GENERIC_COLLECTIVES = new Set(['people', 'person', 'persons', 'men', 'women', 'children', 'residents', 'inhabitants', 'citizens', 'visitors', 'jew', 'jews', 'elderly', 'nobles', 'burghers']);
const GENERIC_PREFIX = /^(?:a|an|some|the|these|those|many|most|all)\s+/u;
const GENERIC_COLLECTIVE_PHRASE = /^(?:(?:young|younger|old|older|elderly|metropolitan|city)\s+)?(?:people|persons|men|women|crowd|burghers|nobles)$/u;
const TEMPORAL_LABEL = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|night|evening))?$/u;
const GENERIC_BUILDING = /^(?:(?:a|an|the|this|that|these|those|its|their|new|old|small|large|former|other|no|jewish|orthodox)\s+)*(?:synagogue|synagogues|shul|building|buildings|cemetery|cemeteries|museum|museums|house|houses|prayer(?:\s+house)?|prayerhouses|temple|temples|school|schools|hospital|hospitals|church|churches|hall|halls|library|libraries|bimah|neshome)$/u;
const GENERIC_WORK = /^(?:a|an|the)?\s*(?:book|lithograph|text|document|manuscript)$/u;

export const isGenericCollectiveLabel = (value) => {
  const label = fold(value).replace(GENERIC_PREFIX, '');
  return GENERIC_COLLECTIVES.has(label) || GENERIC_COLLECTIVE_PHRASE.test(label);
};

/**
 * Browser entity cards are for source-local identities, not grammatical
 * collectives. Keep their mentions in the source artifact, but exclude an
 * entity only when every known alias is an unqualified generic collective.
 */
export const genericCollectiveExclusionReason = (entity) => {
  if (!['group', 'person'].includes(entity?.entity_class ?? entity?.type)) return null;
  const labels = [...new Set([entity.label, ...(entity.aliases ?? [])])].filter(Boolean);
  return labels.length > 0 && labels.every(isGenericCollectiveLabel) ? 'generic_collective_not_entity' : null;
};

export const entityPresentationExclusionReason = (entity) => {
  if (entity?.presentation_eligible === false || (entity?.origin === 'noun_ledger' && entity?.presentation_eligible !== true)) return 'discourse_placeholder_not_presentation_entity';
  if (entity?.type === 'date' || TEMPORAL_LABEL.test(fold(entity?.label))) return 'temporal_expression_not_entity';
  if (entity?.type === 'event') return 'non_identity_mention_type';
  if (entity?.type === 'movement') return 'classificatory_mention_not_entity';
  if (['building', 'organisation'].includes(entity?.type) && GENERIC_BUILDING.test(fold(entity?.label))) return 'generic_building_not_entity';
  if (entity?.type === 'business' && /^[a-z]/u.test(String(entity?.label ?? '')) && !entity?.address) return 'generic_business_not_identity';
  if (entity?.type === 'work' && GENERIC_WORK.test(fold(entity?.label))) return 'generic_work_not_identity';
  if (entity?.type === 'person' && /^[a-z]/u.test(String(entity?.label ?? '')) && !/^(?:ben\s+|r\s*\(av\)\s+)/u.test(String(entity.label))) return 'lowercase_person_candidate_not_identity';
  return genericCollectiveExclusionReason(entity);
};

/** Exact source aliases may collapse browser-only reference chips, never OCR guesses. */
export const canonicalEntityIdForAlias = (entities, value) => {
  const key = fold(value);
  if (!key) return null;
  const ids = [...entities]
    .filter((entity) => [entity.label, ...(entity.aliases ?? [])].some((alias) => fold(alias) === key))
    .map((entity) => entity.entity_id);
  return new Set(ids).size === 1 ? ids[0] : null;
};
