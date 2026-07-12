import { normalizeLocationName } from './kgNormalize.js';
import { expandNameVariants } from './kgNameLexicon.js';

// Global endpoint resolution for staged relations. The loader historically
// matched a relation's subject/object text only against entities extracted in
// the SAME 3-page window, so cross-window references (the same person or place
// recurring through a book) never linked. This module builds one index across
// all staged entities of a source and resolves endpoints against it, reusing
// the same normalization + Hungarian<->English lexicon used for locations.
//
// Ambiguous names (one normalized form pointing at two different entities) are
// deliberately left unresolved rather than linked to an arbitrary one.

const KIND_ENTITY = { location: 'location', person: 'person', event: 'event', organisation: 'organisation' };

// entities: { locations:[{id,name_en,source_name_hu}], people:[{id,canonical_name_en,source_name_hu}], events:[{id,title_en}], organisations:[{id,canonical_name_en,source_name_hu}] }
export const buildEntityIndex = (entities) => {
  const byVariant = new Map(); // normalized variant -> Map(entityKey -> {kind,id})
  const add = (name, kind, id) => {
    const norm = normalizeLocationName(name);
    if (!norm) return;
    const variants = new Set([norm, ...expandNameVariants(norm, { entityKind: KIND_ENTITY[kind] })]);
    for (const variant of variants) {
      if (!byVariant.has(variant)) byVariant.set(variant, new Map());
      byVariant.get(variant).set(`${kind}:${id}`, { kind, id });
    }
  };
  for (const row of entities.locations ?? []) { add(row.name_en, 'location', row.id); add(row.source_name_hu, 'location', row.id); }
  for (const row of entities.people ?? []) { add(row.canonical_name_en, 'person', row.id); add(row.source_name_hu, 'person', row.id); }
  for (const row of entities.events ?? []) { add(row.title_en, 'event', row.id); }
  for (const row of entities.organisations ?? []) { add(row.canonical_name_en, 'organisation', row.id); add(row.source_name_hu, 'organisation', row.id); }
  // Collapse to unambiguous single matches; drop variants that resolve to more
  // than one distinct entity so we never link to the wrong one.
  const index = new Map();
  for (const [variant, owners] of byVariant) if (owners.size === 1) index.set(variant, [...owners.values()][0]);
  return index;
};

// text -> {kind,id} | null. hintKind biases the lexicon expansion (name-order
// swaps for people) but the index match itself carries the true kind.
export const resolveEndpoint = (text, hintKind, index) => {
  const norm = normalizeLocationName(text);
  if (!norm) return null;
  if (index.has(norm)) return index.get(norm);
  for (const variant of expandNameVariants(norm, { entityKind: KIND_ENTITY[hintKind] ?? 'location' })) {
    if (index.has(variant)) return index.get(variant);
  }
  return null;
};

// Given a staged relation row, return the FK column assignments for whichever
// endpoints resolve. Only null-valued FKs are filled — existing links are kept.
export const resolveRelationFks = (relation, index) => {
  const patch = {};
  const apply = (side, match) => {
    if (!match) return;
    if (match.kind === 'location' && !relation[`${side}_location_id`]) patch[`${side}_location_id`] = match.id;
    if (match.kind === 'person' && !relation[`${side}_person_id`]) patch[`${side}_person_id`] = match.id;
    if (match.kind === 'event' && !relation[`${side}_event_id`]) patch[`${side}_event_id`] = match.id;
    if (match.kind === 'organisation' && !relation[`${side}_organisation_id`]) patch[`${side}_organisation_id`] = match.id;
  };
  const hasEndpoint = (side) => relation[`${side}_location_id`] || relation[`${side}_person_id`] || relation[`${side}_event_id`] || relation[`${side}_organisation_id`];
  if (!hasEndpoint('subject')) apply('subject', resolveEndpoint(relation.subject_text_en, relation.subject_kind, index));
  if (!hasEndpoint('object')) apply('object', resolveEndpoint(relation.object_text_en, relation.object_kind, index));
  return patch;
};
