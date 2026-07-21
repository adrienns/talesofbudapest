#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSafePersonShortAliases, correctSourceLocalPersonMentionTypes, resolveItemSubjectAttribution, buildSubjectEntityIndex, setPlacesGazetteerIndex, getPlaceRepairLog } from '../lib/historicalSubjectMemory.js';
import { loadPlacesIndex } from '../lib/budapestPlacesGazetteer.js';
import { canonicalEntityIdForAlias, entityPresentationExclusionReason } from '../lib/historicalEntityPresentation.js';
import { itemStructuralQualityReason } from '../lib/historicalItemQuality.js';
import { displayReadingText } from '../lib/historicalDisplayText.js';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(backend, '..');
const extractionDir = path.join(workspace, 'ingest/corpus/restricted/extractions');
const sourceFlag = process.argv.indexOf('--source');
const sourceId = sourceFlag >= 0 ? process.argv[sourceFlag + 1] : (process.env.HISTORICAL_SOURCE_ID || 'jewish-budapest');
const v3 = process.argv.includes('--v3');
const annotate = process.argv.includes('--annotate');
// An incomplete run is never a default browser input. This explicit mode is
// for human diagnosis only and stamps the resulting HTML as review-only.
const reviewIncomplete = process.argv.includes('--review-incomplete');
const outputFlag = process.argv.indexOf('--output');
const outputPath = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : path.join(extractionDir, v3 ? 'historical-facts-browser-v3.html' : 'historical-facts-browser.fragment.html');

const readJsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const fold = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(?:r|rabbi|dr|mr|mrs|saint|st)\.?\s+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const identityFold = (value) => fold(String(value ?? '').replace(/\br\s*\(\s*av\s*\)/giu, 'rav').replace(/\bb\s*\(\s*en\s*\)/giu, 'ben'));
const itemRows = readJsonl(path.join(extractionDir, v3 ? `${sourceId}.historical-items-v3.jsonl` : `${sourceId}.langextract-pilot.jsonl`));
const coverageRows = v3 ? readJsonl(path.join(extractionDir, `${sourceId}.historical-coverage-v3.jsonl`)) : [];
const experimentFlag = process.argv.indexOf('--experiment');
// --experiment accepts one id or a comma-separated list (e.g. base + retry).
const experimentIds = experimentFlag >= 0
  ? new Set(String(process.argv[experimentFlag + 1] ?? '').split(',').map((id) => id.trim()).filter(Boolean))
  : null;
const pagesFlag = process.argv.indexOf('--pages');
// --pages accepts "15-24" or "15,16,20". When set, every latest non-experiment
// record overlapping those pages is unioned into one browsable view so a
// multi-batch run (e.g. 15-19 + 20-24) shows as a single book stretch.
const pageFilter = pagesFlag >= 0 ? new Set(process.argv[pagesFlag + 1].split(',').flatMap((part) => {
  const range = part.match(/^(\d+)-(\d+)$/);
  if (!range) return [Number(part)];
  const out = [];
  for (let page = Number(range[1]); page <= Number(range[2]); page += 1) out.push(page);
  return out;
})) : null;
const statusPreferRank = (status) => {
  if (status === 'complete') return 3;
  if (status === 'failed_cost_gate') return 2;
  return 1;
};
const experimentPreferRank = (id) => (String(id ?? '').endsWith('-retry') ? 1 : 0);
// Prefer complete > failed_cost_gate > other; on tie prefer *-retry (gap recovery).
const preferV3Record = (current, candidate) => {
  const statusDiff = statusPreferRank(candidate.status) - statusPreferRank(current.status);
  if (statusDiff !== 0) return statusDiff > 0;
  const retryDiff = experimentPreferRank(candidate.experiment_id) - experimentPreferRank(current.experiment_id);
  if (retryDiff !== 0) return retryDiff > 0;
  return true; // later line wins when still tied
};

const mergeV3Runs = (records) => {
  const items = [];
  const mentions = [];
  const resolvedReferences = [];
  const ambiguousReferences = [];
  const unresolvedReferences = [];
  const unresolvedSubjects = [];
  const ambiguousSubjects = [];
  const protocolErrors = [];
  const entityById = new Map();
  const pages = new Set();
  const runIds = [];
  let usageCost = 0;
  let cacheHits = 0;
  for (const record of records) {
    for (const item of record.items ?? []) items.push(item);
    for (const mention of record.mentions ?? []) mentions.push(mention);
    for (const reference of record.resolved_references ?? []) resolvedReferences.push(reference);
    for (const reference of record.ambiguous_references ?? []) ambiguousReferences.push(reference);
    for (const reference of record.unresolved_references_log ?? []) unresolvedReferences.push(reference);
    for (const subject of record.unresolved_subjects_log ?? []) unresolvedSubjects.push(subject);
    for (const subject of record.ambiguous_subjects_log ?? []) ambiguousSubjects.push(subject);
    for (const error of record.protocol_errors_log ?? []) protocolErrors.push(error);
    for (const page of record.pdf_pages ?? []) pages.add(page);
    for (const entity of record.entity_aliases ?? []) {
      const existing = entityById.get(entity.entity_id);
      if (!existing) { entityById.set(entity.entity_id, { ...entity, aliases: [...(entity.aliases ?? [])], roles: [...(entity.roles ?? [])] }); continue; }
      existing.aliases = [...new Set([...existing.aliases, ...(entity.aliases ?? [])])];
      existing.roles = [...new Set([...existing.roles, ...(entity.roles ?? [])])];
    }
    usageCost += Number(record.usage?.cost ?? 0);
    cacheHits += Number(record.usage?.cache_hits ?? 0);
    runIds.push(record.run_id);
  }
  const pageList = [...pages].sort((a, b) => a - b);
  const supported = items.filter((item) => item.verification?.verdict === 'supported').length;
  return {
    run_id: runIds.join('+'), source_id: records[0].source_id, config: records[0].config,
    pdf_pages: pageList, items, mentions, entity_aliases: [...entityById.values()],
    resolved_references: resolvedReferences, ambiguous_references: ambiguousReferences, unresolved_references_log: unresolvedReferences,
    unresolved_subjects_log: unresolvedSubjects, ambiguous_subjects_log: ambiguousSubjects, protocol_errors_log: protocolErrors,
    review_subject_attribution: records.some((record) => record.review_subject_attribution),
    supported_item_count: supported,
    usage: { cost: usageCost, cache_hits: cacheHits, call_count: records.reduce((sum, record) => sum + Number(record.usage?.call_count ?? 0), 0) },
    average_cost_usd_per_page: pageList.length ? usageCost / pageList.length : 0,
    status: records.every((record) => record.status === 'complete') ? 'complete' : 'partial',
  };
};

const eligibleV3 = itemRows.filter((row) => (row.status === 'complete' || row.status === 'failed_cost_gate' || row.status === 'preflight' || (reviewIncomplete && row.status === 'incomplete_budget'))
  && (experimentIds ? experimentIds.has(row.experiment_id) : !row.experiment_id) && Array.isArray(row.items));
const reattributeReviewRecord = (record) => {
  if (!reviewIncomplete || record.status !== 'incomplete_budget') return record;
  const coverage = coverageRows.find((row) => row.run_id === record.run_id);
  if (!coverage?.clauses) throw new Error(`Review attribution requires coverage for incomplete run ${record.run_id}`);
  const mentionById = new Map((record.mentions ?? []).map((mention) => [mention.mention_id, mention]));
  const clauseById = new Map(coverage.clauses.map((clause) => [clause.clause_id, clause]));
  const state = { entities: new Map((record.entity_aliases ?? []).map((entity) => [entity.entity_id, { ...entity, aliases: new Set(entity.aliases ?? []), roles: new Set(entity.roles ?? []) }])) };
  addSafePersonShortAliases({ entities: state.entities });
  const unresolvedSubjects = [];
  const ambiguousSubjects = [];
  const items = record.items.map((item) => {
    const attribution = resolveItemSubjectAttribution({ item, clauseById, references: record.resolved_references ?? [], mentionById, state });
    if (attribution.status === 'unresolved') unresolvedSubjects.push({ item_id: item.item_id, clause_ids: item.clause_ids, reason: attribution.reason, candidate_entity_ids: [] });
    if (attribution.status === 'ambiguous') ambiguousSubjects.push({ item_id: item.item_id, clause_ids: item.clause_ids, reason: attribution.reason, candidate_entity_ids: attribution.candidate_entity_ids });
    return {
      ...item,
      subject_entity_id: attribution.status === 'resolved' ? attribution.entity_id : null,
      subject_resolution_source: attribution.status === 'resolved' ? attribution.resolution_source : null,
      literal_subject: attribution.status === 'resolved' ? attribution.literal_subject : null,
      discourse_chain: attribution.discourse_chain ?? [],
      subject_ambiguous: attribution.status === 'ambiguous' || item.subject_ambiguous === true,
      subject_attribution: attribution,
    };
  });
  return {
    ...record,
    items,
    entity_aliases: [...state.entities.values()].map((entity) => ({ ...entity, aliases: [...entity.aliases], roles: [...entity.roles] })),
    review_subject_attribution: true,
    unresolved_subjects_log: unresolvedSubjects,
    ambiguous_subjects_log: ambiguousSubjects,
  };
};
// Keep the preferred usable record per page-set (status, then retry, then later line).
const latestByPageSet = new Map();
for (const row of eligibleV3) {
  const key = (row.pdf_pages ?? []).join(',');
  const existing = latestByPageSet.get(key);
  if (!existing || preferV3Record(existing, row)) latestByPageSet.set(key, row);
}
let selectedV3 = [...latestByPageSet.values()];
if (pageFilter) {
  if (experimentIds) {
    // Experiment builds keep the preferred-per-page-set union (base + retry),
    // not a single exact-span run that would drop recovered gap batches.
    selectedV3 = selectedV3.filter((row) => (row.pdf_pages ?? []).some((page) => pageFilter.has(page)));
  } else {
    // Prefer one latest non-empty run that covers the requested span. Otherwise
    // retain the deliberate multi-batch union. Without this guard, a later full
    // review run is merged with its older constituent batches and duplicates
    // facts/people in the browser.
    const exact = [...eligibleV3].reverse().find((row) => (row.items?.length ?? 0) > 0 && [...pageFilter].every((page) => (row.pdf_pages ?? []).includes(page)));
    selectedV3 = exact ? [exact] : selectedV3.filter((row) => (row.pdf_pages ?? []).some((page) => pageFilter.has(page)));
  }
} else if (!experimentIds) {
  selectedV3 = selectedV3.slice(-1); // default non-experiment: most recent single record
}
// With --experiment and no --pages: keep the full preferred-per-page-set union.
selectedV3 = selectedV3.map(reattributeReviewRecord);

const run = v3
  ? (selectedV3.length ? mergeV3Runs(selectedV3) : null)
  : itemRows.find((row) => row.record_type === 'run');
const report = v3 ? null : JSON.parse(fs.readFileSync(path.join(extractionDir, `${sourceId}.langextract-pilot.report.json`), 'utf8'));
if (!run) throw new Error(`No V${v3 ? '3 extraction record' : ' run header'} for ${sourceId}`);
if (!v3 && report.run_id !== run.run_id) throw new Error(`Refusing to mix runs: JSONL=${run.run_id}, report=${report.run_id}. Regenerate both from the same extraction run.`);
const runPages = run.pdf_pages ?? run.pages ?? [];
const referencesByClause = new Map();
for (const reference of run.resolved_references ?? []) {
  const rows = referencesByClause.get(reference.clause_id) ?? [];
  rows.push(reference); referencesByClause.set(reference.clause_id, rows);
}
const unresolvedReferencesByClause = new Map();
for (const reference of run.unresolved_references_log ?? []) {
  const rows = unresolvedReferencesByClause.get(reference.clause_id) ?? [];
  rows.push(reference); unresolvedReferencesByClause.set(reference.clause_id, rows);
}
const qualityInput = (item) => ({
  ...item,
  clause_references: (item.clause_ids ?? []).flatMap((id) => referencesByClause.get(id) ?? []),
  clause_unresolved_references: (item.clause_ids ?? []).flatMap((id) => unresolvedReferencesByClause.get(id) ?? []),
});
// Keep citations/captions in JSONL for audit, but do not present pure source
// credits as historical facts. Older artifacts have no disposition and remain
// visible for backward compatibility.
const sourceItems = v3
  ? (run.items ?? []).filter((item) => item.verification?.verdict !== 'unsupported')
  : itemRows.filter((row) => row.record_type === 'item' && row.disposition !== 'reference_only' && row.verification?.verdict !== 'unsupported');
const itemQualityExclusions = sourceItems.flatMap((item) => {
  const reason = itemStructuralQualityReason(qualityInput(item));
  return reason ? [{ item_id: item.item_id, clause_ids: item.clause_ids ?? [], reason }] : [];
});
const items = sourceItems.filter((item) => !itemStructuralQualityReason(qualityInput(item)));
const mentionRuns = v3 ? [] : readJsonl(path.join(extractionDir, `${sourceId}.mentions.jsonl`));
const mentionRun = mentionRuns.filter((row) => (row.pdf_pages ?? []).some((page) => runPages.includes(page))).at(-1);
const typeCorrection = correctSourceLocalPersonMentionTypes(v3 ? (run.mentions ?? []) : (mentionRun?.mentions ?? []));
let localMentions = typeCorrection.mentions;
// Rebuild source-local identities with the places gazetteer so OCR forks
// (Dohdny/Dohany) merge on browser rebuild without a full-book re-extract.
let v3Entities = new Map((run.entity_aliases ?? []).map((entity) => [entity.entity_id, entity]));
let placeOcrRepairCount = 0;
if (v3) {
  try {
    const placesIndex = await loadPlacesIndex();
    setPlacesGazetteerIndex(placesIndex);
    const reindexed = buildSubjectEntityIndex({
      sourceId,
      mentions: localMentions.map((mention) => ({ ...mention, subject_entity_id: undefined })),
    });
    const idMap = new Map();
    for (let i = 0; i < localMentions.length; i += 1) {
      const previous = localMentions[i].subject_entity_id;
      const next = reindexed.mentions[i]?.subject_entity_id;
      if (previous && next && previous !== next) idMap.set(previous, next);
      localMentions[i] = reindexed.mentions[i];
    }
    for (const item of run.items ?? []) {
      if (item.subject_entity_id && idMap.has(item.subject_entity_id)) {
        item.subject_entity_id = idMap.get(item.subject_entity_id);
      }
      for (const participant of item.participants ?? []) {
        if (participant.resolved_entity_id && idMap.has(participant.resolved_entity_id)) {
          participant.resolved_entity_id = idMap.get(participant.resolved_entity_id);
        }
      }
    }
    v3Entities = reindexed.entities;
    placeOcrRepairCount = getPlaceRepairLog().length;
    if (placeOcrRepairCount) console.error(`Place OCR repairs applied at browser build: ${placeOcrRepairCount}`);
  } catch (error) {
    console.warn(`Places gazetteer unavailable for browser rebuild: ${error instanceof Error ? error.message : error}`);
  }
}
const SYNAGOGUE_PATTERN = /\bsynagog(?:ue|ues)\b/i;
const entityExclusions = [];
const excludedEntityKeys = new Set([...v3Entities.values()]
  .filter((entity) => entityPresentationExclusionReason(entity))
  .map((entity) => entity.entity_id));
for (const mention of localMentions) {
  if (entityPresentationExclusionReason({ type: mention.type, label: mention.normalized_text ?? mention.text, aliases: [mention.normalized_text ?? mention.text] }) && mention.subject_entity_id) {
    excludedEntityKeys.add(mention.subject_entity_id);
  }
}

// Exact non-person labels with conflicting source types are one identity with
// an explicit type ambiguity, not two browser cards. Person collisions remain
// separate because two people can legitimately share a name.
const presentationKeyByEntityId = new Map([...v3Entities.keys()].map((id) => [id, id]));
const entityTypeAmbiguities = [];
const explicitNotationAliasMerges = [];
const explicitSlashAliasMerges = [];
const entitiesByNotation = new Map();
for (const entity of v3Entities.values()) {
  if (excludedEntityKeys.has(entity.entity_id)) continue;
  const rows = entitiesByNotation.get(identityFold(entity.label)) ?? []; rows.push(entity); entitiesByNotation.set(identityFold(entity.label), rows);
}
for (const [label, rows] of entitiesByNotation) {
  if (!label || rows.length < 2 || !rows.every((entity) => entity.entity_class === 'person')) continue;
  if (new Set(rows.map((entity) => fold(entity.label))).size < 2) continue;
  const canonical = [...rows].sort((left, right) => left.entity_id.localeCompare(right.entity_id))[0].entity_id;
  for (const entity of rows) presentationKeyByEntityId.set(entity.entity_id, canonical);
  explicitNotationAliasMerges.push({ label, entity_ids: rows.map((entity) => entity.entity_id), presentation_entity_id: canonical, reason: 'printed_title_notation_equivalence' });
}
const escapedLiteral = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+');
const evidenceQuotes = items.flatMap((item) => item.evidence ?? []).map((entry) => String(entry.quote ?? ''));
const people = [...v3Entities.values()].filter((entity) => entity.entity_class === 'person' && !excludedEntityKeys.has(entity.entity_id));
for (let leftIndex = 0; leftIndex < people.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < people.length; rightIndex += 1) {
    const pair = [people[leftIndex], people[rightIndex]].sort((left, right) => identityFold(right.label).split(' ').length - identityFold(left.label).split(' ').length);
    const lineage = (value) => identityFold(value).replace(/\b(?:ben|ibn)\b/gu, 'bn');
    const full = lineage(pair[0].label); const short = lineage(pair[1].label);
    if (short.split(' ').length < 2 || !full.endsWith(` ${short}`)) continue;
    const slash = new RegExp(`(?:${escapedLiteral(pair[0].label)}\\s*\\/\\s*${escapedLiteral(pair[1].label)}|${escapedLiteral(pair[1].label)}\\s*\\/\\s*${escapedLiteral(pair[0].label)})`, 'iu');
    if (!evidenceQuotes.some((quote) => slash.test(quote))) continue;
    const canonical = pair[0].entity_id;
    presentationKeyByEntityId.set(pair[0].entity_id, canonical);
    presentationKeyByEntityId.set(pair[1].entity_id, canonical);
    explicitSlashAliasMerges.push({ entity_ids: pair.map((entity) => entity.entity_id), presentation_entity_id: canonical, reason: 'explicit_slash_name_variant' });
  }
}
const entitiesByLabel = new Map();
for (const entity of v3Entities.values()) {
  if (excludedEntityKeys.has(entity.entity_id) || entity.entity_class === 'person') continue;
  const rows = entitiesByLabel.get(fold(entity.label)) ?? []; rows.push(entity); entitiesByLabel.set(fold(entity.label), rows);
}
for (const [label, rows] of entitiesByLabel) {
  const types = [...new Set(rows.map((entity) => entity.type))].sort();
  if (!label || rows.length < 2 || types.length < 2) continue;
  const canonical = [...rows].sort((left, right) => left.entity_id.localeCompare(right.entity_id))[0].entity_id;
  for (const entity of rows) presentationKeyByEntityId.set(entity.entity_id, canonical);
  entityTypeAmbiguities.push({ label, entity_ids: rows.map((entity) => entity.entity_id), types, presentation_entity_id: canonical });
}
const presentationKey = (key) => presentationKeyByEntityId.get(key) ?? key;

const entityGroups = new Map();
const displayLabelScore = (value) => (/^[A-ZÀ-Ž]/u.test(String(value ?? '')) ? 4 : 0) + (!/[()]/u.test(String(value ?? '')) ? 2 : 0) + Math.min(1, String(value ?? '').length / 100);
const upsertEntity = (key, label, type, alias, mention) => {
  if (!key) return;
  const group = entityGroups.get(key) ?? { key, label, types: new Set(), aliases: new Set(), mentions: new Map(), item_ids: new Set() };
  if (displayLabelScore(label) > displayLabelScore(group.label)) group.label = label;
  if (type) group.types.add(type);
  if (alias) group.aliases.add(alias);
  if (mention) {
    const mentionKey = [mention.page, mention.start, mention.end, mention.text].join(':');
    const current = group.mentions.get(mentionKey) ?? { ...mention, item_ids: new Set() };
    for (const itemId of mention.item_ids ?? []) current.item_ids.add(itemId);
    group.mentions.set(mentionKey, current);
  }
  entityGroups.set(key, group);
};

const mentionContext = (mention) => items.flatMap((item) => item.evidence ?? []).find((evidence) => (
  evidence.page_ref === mention.page
  && evidence.start_offset < mention.end_offset
  && evidence.end_offset > mention.start_offset
))?.quote ?? mention.text;

const addMentionEntities = (mention, itemIds = []) => {
  const label = mention.normalized_text ?? mention.text;
  if (!fold(label)) return;
  const evidence = {
    page: mention.page, start: mention.start_offset, end: mention.end_offset, text: mention.text,
    confidence: mention.confidence ?? null, quote: mentionContext(mention), item_ids: itemIds,
  };
  const entity = mention.subject_entity_id ? v3Entities.get(mention.subject_entity_id) : null;
  const exclusionReason = (mention.source === 'noun_ledger' && entity?.presentation_eligible !== true ? 'discourse_placeholder_not_presentation_entity' : null)
    ?? entityPresentationExclusionReason(entity)
    ?? entityPresentationExclusionReason({ type: mention.type, label, aliases: [label] });
  if (exclusionReason) {
    entityExclusions.push({ mention_id: mention.mention_id, entity_id: entity?.entity_id ?? mention.subject_entity_id ?? null, page_ref: mention.page, start_offset: mention.start_offset, surface: mention.text, reason: exclusionReason });
    return;
  }
  const key = presentationKey(mention.subject_entity_id ?? `mention::${fold(label)}`);
  upsertEntity(key, entity?.label ?? label, entity?.type ?? mention.type ?? 'entity', mention.text, evidence);
  if (entity) for (const alias of entity.aliases ?? []) upsertEntity(key, entity.label, entity.type, alias, null);
  // This is a type bucket, not a claim that all mentions are the same named
  // building. It gives a useful all-synagogues view without false resolution.
  if (SYNAGOGUE_PATTERN.test(label)) {
    upsertEntity('class::synagogue', 'Synagogue', 'building class', mention.text, evidence);
  }
};

for (const mention of localMentions.filter((mention) => runPages.includes(mention.page))) {
  addMentionEntities(mention);
}

const pronouns = new Set(['he', 'his', 'him', 'she', 'her', 'hers', 'they', 'their', 'them', 'it', 'its']);
const displayUnresolvedReference = (reference) => {
  if (!reference) return null;
  const head = String(reference.surface ?? '').trim().toLowerCase().replace(/^the\s+/u, '').replace(/s$/u, '');
  const role = new Set(['rabbi', 'scholar', 'author', 'writer', 'architect', 'doctor', 'teacher', 'mayor', 'ruler', 'king', 'queen']);
  return { ...reference, expected: role.has(head) ? 'person' : reference.expected };
};
const itemViews = items.map((item) => {
  const resolved = item.resolved_subject ?? v3Entities.get(item.subject_entity_id)?.label ?? null;
  const candidateSubjectKey = presentationKey(item.subject_entity_id ?? (resolved && !pronouns.has(fold(resolved)) ? `subject::${fold(resolved)}` : null));
  const subjectKey = candidateSubjectKey && !excludedEntityKeys.has(candidateSubjectKey) ? candidateSubjectKey : null;
  if (subjectKey) {
    for (const evidence of item.evidence ?? []) {
      upsertEntity(subjectKey, resolved, v3Entities.get(subjectKey)?.type ?? 'resolved subject', null, {
        page: evidence.page_ref, start: evidence.start_offset, end: evidence.end_offset,
        text: item.literal_subject ?? resolved, quote: evidence.quote, confidence: null, item_ids: [item.item_id],
      });
    }
    entityGroups.get(subjectKey).item_ids.add(item.item_id);
  }
  const antecedent = item.reference_antecedent ?? resolved;
  const localAliasKeys = antecedent ? [...entityGroups.values()]
    .filter((entity) => [entity.label, ...(entity.aliases ?? [])].some((alias) => fold(alias) === fold(antecedent)))
    .map((entity) => entity.key) : [];
  const rawReferenceKey = antecedent && !pronouns.has(fold(antecedent)) && !entityPresentationExclusionReason({ label: antecedent })
    ? canonicalEntityIdForAlias(v3Entities.values(), antecedent) ?? (new Set(localAliasKeys).size === 1 ? localAliasKeys[0] : null)
    : null;
  const referenceKey = rawReferenceKey && !excludedEntityKeys.has(rawReferenceKey) ? presentationKey(rawReferenceKey) : null;
  if (referenceKey) {
    for (const evidence of item.evidence ?? []) {
      upsertEntity(referenceKey, antecedent, v3Entities.get(referenceKey)?.type ?? 'reference antecedent', null, {
        page: evidence.page_ref, start: evidence.start_offset, end: evidence.end_offset,
        text: (item.literal_subject ?? '').match(/^[^\s]+/)?.[0] ?? item.literal_subject ?? antecedent,
        quote: evidence.quote, confidence: null, item_ids: [item.item_id],
      });
    }
    entityGroups.get(referenceKey).item_ids.add(item.item_id);
  }
  const unresolvedSubjectReference = item.subject_attribution?.status === 'unresolved'
    ? displayUnresolvedReference((item.clause_ids ?? []).flatMap((id) => unresolvedReferencesByClause.get(id) ?? []).sort((a, b) => a.start_offset - b.start_offset)[0] ?? null)
    : null;
  const evidence = (item.evidence ?? []).map((entry) => ({
    ...entry,
    entities: (() => {
      let cursor = 0;
      const mentions = localMentions.filter((mention) => mention.page === entry.page_ref && mention.start_offset < entry.end_offset && mention.end_offset > entry.start_offset)
        .sort((a, b) => a.start_offset - b.start_offset)
        .map((mention) => {
          const display = String(mention.normalized_text ?? mention.text).replace(/\s+/g, ' ').trim();
          const index = entry.quote.toLocaleLowerCase().indexOf(display.toLocaleLowerCase(), cursor);
          if (index >= 0) cursor = index + display.length;
          return {
            key: presentationKey(mention.subject_entity_id ?? (SYNAGOGUE_PATTERN.test(mention.normalized_text ?? mention.text) ? 'class::synagogue' : `mention::${fold(mention.normalized_text ?? mention.text)}`)),
            text: display, type: mention.type,
            // Evidence quotes are cleaned, so raw OCR offsets cannot position
            // highlights after a joined word such as syna-\ngogue.
            start: index >= 0 ? entry.start_offset + index : mention.start_offset,
            end: index >= 0 ? entry.start_offset + index + display.length : mention.end_offset,
          };
        });
      // Resolved pronouns/descriptions are not GLiNER mentions. Preserve them
      // as clickable evidence spans so a reader can inspect the real entity.
      const referenceSpans = (item.clause_ids ?? []).flatMap((id) => referencesByClause.get(id) ?? [])
        .filter((reference) => reference.resolved_entity_id && reference.start_offset < entry.end_offset && reference.start_offset + String(reference.surface ?? '').length > entry.start_offset)
        .map((reference) => ({ key: presentationKey(reference.resolved_entity_id), text: reference.surface, type: 'resolved reference', start: reference.start_offset, end: reference.start_offset + String(reference.surface ?? '').length }));
      const subjectEntity = item.subject_entity_id ? v3Entities.get(item.subject_entity_id) : null;
      const literalSubject = String(item.literal_subject ?? '').trim();
      const literalIndex = literalSubject && subjectEntity
        ? entry.quote.toLocaleLowerCase().indexOf(literalSubject.toLocaleLowerCase())
        : -1;
      const subjectSpans = literalIndex >= 0 && !mentions.some((mention) => mention.key === item.subject_entity_id && mention.start === entry.start_offset + literalIndex)
        ? [{ key: presentationKey(item.subject_entity_id), text: literalSubject, type: subjectEntity.type, start: entry.start_offset + literalIndex, end: entry.start_offset + literalIndex + literalSubject.length }]
        : [];
      return [...mentions, ...referenceSpans, ...subjectSpans];
    })(),
  }));
  return {
    id: item.item_id, kind: item.kind, type: item.open_type, polarity: item.polarity, modality: item.modality,
    statement: item.statement_en, literal_subject: item.literal_subject, resolved_subject: resolved,
    reference_antecedent: antecedent, reference_status: item.reference_status,
    risk_flags: item.risk_flags ?? [], subject_key: subjectKey, reference_key: referenceKey, evidence,
    subject_resolution_source: item.subject_resolution_source ?? item.reference_resolution_source ?? null,
    subject_ambiguous: item.subject_ambiguous ?? false,
    discourse_chain: item.discourse_chain ?? [],
    clause_ids: item.clause_ids ?? [],
    assertion_kind: item.assertion_kind ?? null,
    canonical_type: item.canonical_type ?? null,
    subject_attribution: item.subject_attribution ?? null,
    unresolved_subject_reference: unresolvedSubjectReference,
  };
});

const entities = [...entityGroups.values()].map((group) => {
  const sourceEntities = [...v3Entities.values()].filter((entity) => presentationKey(entity.entity_id) === group.key);
  return ({
  key: group.key,
  label: group.label,
  type: [...group.types].sort().join(' / ') || 'entity',
  aliases: [...group.aliases].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  item_ids: [...group.item_ids],
  owner_key: presentationKey(sourceEntities.find((entity) => entity.owner_entity_id)?.owner_entity_id ?? null),
  roles: [...new Set(sourceEntities.flatMap((entity) => entity.roles ?? []))],
  origin: sourceEntities.find((entity) => entity.origin)?.origin ?? null,
  address: sourceEntities.find((entity) => entity.address)?.address ?? null,
  // One occurrence in the book must appear once. A name span (954-963) and the
  // clause evidence span (954-1083) quoting the same sentence are the same
  // occurrence: collapse by page + quote, keep the tightest span, union the
  // linked facts.
  mentions: (() => {
    const byQuote = new Map();
    for (const mention of group.mentions.values()) {
      const quoteKey = `${mention.page}${String(mention.quote ?? '').replace(/\s+/g, ' ').trim()}`;
      const current = byQuote.get(quoteKey);
      const itemIds = new Set([...(current?.item_ids ?? []), ...mention.item_ids]);
      const tighter = !current || (mention.end - mention.start) < (current.end - current.start) ? mention : current;
      byQuote.set(quoteKey, { ...tighter, item_ids: itemIds, confidence: tighter.confidence ?? current?.confidence ?? null });
    }
    return [...byQuote.values()].map((mention) => ({ ...mention, item_ids: [...mention.item_ids] }))
      .sort((a, b) => a.page - b.page || a.start - b.start);
  })(),
  });
}).sort((a, b) => b.mentions.length - a.mentions.length || String(a.label ?? '').localeCompare(String(b.label ?? '')));

// Ambiguities are first-class: a chip must say when identity is not settled.
const ambiguousReferences = v3 ? (run.ambiguous_references ?? []) : [];

const data = {
  run: {
    id: run.run_id, source: run.source_id, pages: runPages, model: run.model ?? run.config?.primary_model, cost: run.usage?.cost ?? 0,
    review_only: reviewIncomplete,
    review_subject_attribution: Boolean(run.review_subject_attribution),
    average_cost: v3 ? run.average_cost_usd_per_page ?? 0 : (report.usage.average_uncached_equivalent_cost_usd_per_page ?? report.usage.average_total_cost_usd_per_page ?? report.usage.average_cost_usd_per_page),
    actual_average_cost: v3 ? run.average_cost_usd_per_page ?? 0 : (report.usage.average_total_cost_usd_per_page ?? report.usage.average_cost_usd_per_page),
    cache_hits: v3 ? Number(run.usage?.cache_hits ?? 0) : Number(report.usage.cache_hits ?? 0) + Number(report.reference_resolution?.usage?.cache_hits ?? 0),
    grounding_rate: v3 ? 1 : report.extraction.grounded_rate, schema_rate: v3 ? 1 : report.extraction.schema_valid_rate,
    unresolved: v3 ? (run.unresolved_references_log ?? []).length : report.extraction.unresolved_references,
    ambiguous_references: ambiguousReferences.length,
  },
  items: itemViews,
  entities,
  entity_exclusions: entityExclusions,
  entity_type_corrections: typeCorrection.corrections,
  entity_type_ambiguities: entityTypeAmbiguities,
  explicit_notation_alias_merges: explicitNotationAliasMerges,
  explicit_slash_alias_merges: explicitSlashAliasMerges,
  item_quality_exclusions: itemQualityExclusions,
  annotate,
};
const encodedData = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
const displayReadingSource = displayReadingText.toString();
const provisionalFullbook = Boolean(experimentIds && [...experimentIds].some((id) => id.includes('fullbook')));
const pageSpanLabel = runPages.length
  ? (runPages.length > 2 ? `${runPages[0]}–${runPages.at(-1)}` : runPages.join('–'))
  : '—';
const excludesIndex = Boolean(pageFilter) && ![...pageFilter].some((page) => page >= 580);
const documentTitle = provisionalFullbook
  ? `Historical facts · ${run.source_id} · provisional full book · pages ${pageSpanLabel}`
  : `Historical facts · ${run.source_id} · pages ${pageSpanLabel}`;
const pageLabel = pageSpanLabel;
const provisionalBanner = provisionalFullbook
  ? excludesIndex
    ? 'Provisional full-book view (experiment extracts). Not a promoted corpus — gaps may remain where batches failed or were recovered by retry. Excludes index pp.580–615 (personal names / cities / street addresses). Bibliography pp.560–579 still included. Location OCR identity folds unique-hit gazetteer repairs (e.g. Dohdny→Dohány); immutable evidence quotes unchanged.'
    : 'Provisional full-book view (experiment extracts). Not a promoted corpus — gaps may remain where batches failed or were recovered by retry.'
  : '';

const fragment = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
  <title>${documentTitle}</title>
</head>
<body>
<main id="langextract-facts-browser">
  <div class="viz-grid lfb-stats" aria-label="Extraction summary">
    <div class="card viz-stat"><div class="text-muted">Extracted facts</div><div class="viz-stat-value" id="lfb-total"></div><div class="text-small">pages ${pageLabel}</div></div>
    <div class="card viz-stat"><div class="text-muted">Exact grounding</div><div class="viz-stat-value" id="lfb-grounding"></div><div class="text-small" id="lfb-schema"></div></div>
    <div class="card viz-stat"><div class="text-muted">New-page cost</div><div class="viz-stat-value" id="lfb-cost"></div><div class="text-small" id="lfb-unresolved"></div></div>
  </div>

  <div class="viz-controls lfb-controls" aria-label="Browser controls">
    <button type="button" class="btn btn-primary" id="lfb-facts-tab" aria-pressed="true">Facts</button>
    <button type="button" class="btn" id="lfb-entities-tab" aria-pressed="false">Entities</button>
    <button type="button" class="btn" id="lfb-people-tab" aria-pressed="false">People</button>
    <button type="button" class="btn" id="lfb-locations-tab" aria-pressed="false">Locations</button>
    <label class="form-label lfb-search">Search
      <input class="form-control" id="lfb-search" type="search" placeholder="Person, place, event, quote…">
    </label>
    <label class="form-label">Kind
      <select class="form-select" id="lfb-kind"><option value="all">All kinds</option><option value="event">Events</option><option value="assertion">Assertions</option></select>
    </label>
    <label class="form-label">Page
      <select class="form-select" id="lfb-page"><option value="all">All pages</option></select>
    </label>
  </div>

  ${annotate ? '<div class="lfb-annotate-bar"><button type="button" class="btn btn-primary" id="lfb-gold-export-btn">Export gold annotations</button><textarea id="lfb-gold-export" hidden rows="6" class="form-control"></textarea></div>' : ''}
  ${reviewIncomplete ? '<div class="lfb-review-warning">Review-only: extraction stopped at its budget cap. This HTML is not a promoted corpus; unresolved subjects and protocol errors remain in the restricted run log.</div>' : ''}
  ${provisionalBanner ? `<div class="lfb-review-warning">${provisionalBanner}</div>` : ''}
  <div class="text-small text-muted lfb-meta" id="lfb-meta"></div>
  <div class="lfb-results" id="lfb-results" aria-live="polite"></div>

  <dialog id="lfb-dialog" aria-labelledby="lfb-dialog-title">
    <div class="card lfb-dialog-panel">
      <div class="lfb-dialog-head">
        <div><h3 id="lfb-dialog-title"></h3><div class="text-small text-muted" id="lfb-dialog-meta"></div></div>
        <button type="button" class="btn" id="lfb-dialog-close">Close</button>
      </div>
      <div class="lfb-dialog-body">
        <div class="lfb-tags" id="lfb-dialog-aliases"></div>
        <div id="lfb-dialog-mentions"></div>
      </div>
    </div>
  </dialog>
</main>

<style>
  :root { color-scheme: dark; --lfb-bg: #101113; --lfb-panel: #1a1c20; --lfb-panel-hover: #23262c; --lfb-text: #f4f4f5; --lfb-muted: #a1a1aa; --lfb-border: #30343b; --lfb-blue: #7dc1ff; --lfb-blue-bg: #082e50; --lfb-focus: #94caff; }
  html, body { background: var(--lfb-bg); color: var(--lfb-text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100%; }
  #langextract-facts-browser, #langextract-facts-browser * { box-sizing: border-box; }
  #langextract-facts-browser { color: var(--lfb-text); margin: 0 auto; max-width: 78rem; padding: 1.5rem; }
  #langextract-facts-browser .viz-grid { display: grid; gap: .8rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  #langextract-facts-browser .card { background: var(--lfb-panel); border: 1px solid var(--lfb-border); border-radius: .8rem; }
  #langextract-facts-browser .viz-stat { display: grid; gap: .2rem; min-height: 7rem; padding: 1rem; }
  #langextract-facts-browser .viz-stat-value { font-size: 1.8rem; font-variant-numeric: tabular-nums; font-weight: 700; }
  #langextract-facts-browser .text-muted { color: var(--lfb-muted); }
  #langextract-facts-browser .text-small { font-size: .875rem; }
  #langextract-facts-browser .viz-controls { display: grid; gap: .75rem; grid-template-columns: auto auto auto minmax(15rem, 1fr) minmax(9rem, .7fr) minmax(9rem, .7fr); }
  #langextract-facts-browser .form-label { color: var(--lfb-text); display: grid; font-size: .875rem; font-weight: 600; gap: .35rem; }
  #langextract-facts-browser .form-control, #langextract-facts-browser .form-select { background: var(--lfb-panel); border: 1px solid var(--lfb-border); border-radius: .55rem; color: var(--lfb-text); font: inherit; min-height: 2.5rem; padding: .45rem .65rem; width: 100%; }
  #langextract-facts-browser .form-control:focus, #langextract-facts-browser .form-select:focus, #langextract-facts-browser .btn:focus-visible { border-color: var(--lfb-focus); box-shadow: 0 0 0 2px rgb(148 202 255 / .25); outline: 0; }
  #langextract-facts-browser .btn { background: var(--lfb-panel); border: 1px solid var(--lfb-border); border-radius: .55rem; color: var(--lfb-text); cursor: pointer; font: inherit; min-height: 2.5rem; padding: .45rem .7rem; }
  #langextract-facts-browser .btn:hover { background: var(--lfb-panel-hover); }
  #langextract-facts-browser .btn-primary, #langextract-facts-browser .viz-badge { background: var(--lfb-blue-bg); border-color: transparent; color: var(--lfb-blue); }
  #langextract-facts-browser .btn-ghost { background: transparent; color: var(--lfb-blue); display: inline; min-height: auto; padding: .05rem .2rem; text-align: left; }
  #langextract-facts-browser .viz-badge { border-radius: 999px; display: inline-block; font-size: .82rem; font-weight: 650; line-height: 1.35; padding: .2rem .55rem; }
  #langextract-facts-browser .lfb-stats { margin-bottom: 1rem; }
  #langextract-facts-browser .lfb-controls { align-items: end; margin-bottom: .75rem; }
  #langextract-facts-browser .lfb-search { flex: 1 1 16rem; }
  #langextract-facts-browser .lfb-meta { margin: .5rem 0; }
  #langextract-facts-browser .lfb-review-warning { background: #4a2700; border: 1px solid #a56818; border-radius: .55rem; color: #ffe1a9; margin: .6rem 0; padding: .7rem .8rem; }
  #langextract-facts-browser .lfb-results { border-top: 1px solid var(--lfb-border); }
  #langextract-facts-browser details { border-bottom: 1px solid var(--lfb-border); padding: .7rem 0; }
  #langextract-facts-browser summary { cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; align-items: start; }
  #langextract-facts-browser summary::marker { color: var(--lfb-muted); }
  #langextract-facts-browser .lfb-statement { font-weight: 500; overflow-wrap: anywhere; }
  #langextract-facts-browser .lfb-detail { display: grid; gap: .65rem; padding: .75rem 0 .2rem; }
  #langextract-facts-browser .lfb-label { color: var(--lfb-muted); margin-right: .35rem; }
  #langextract-facts-browser .lfb-tags, #langextract-facts-browser .lfb-entity-line { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
  #langextract-facts-browser .lfb-evidence { border-left: 2px solid var(--lfb-blue); padding-left: .75rem; }
  #langextract-facts-browser .lfb-quote { white-space: pre-wrap; overflow-wrap: anywhere; }
  #langextract-facts-browser .lfb-empty { padding: 2rem 0; color: var(--lfb-muted); text-align: center; }
  #langextract-facts-browser .lfb-entity-row { border-bottom: 1px solid var(--lfb-border); display: grid; gap: .4rem; padding: .7rem 0; }
  #langextract-facts-browser dialog { background: transparent; border: 0; color: var(--lfb-text); margin: auto; max-height: none; max-width: min(42rem, calc(100% - 2rem)); overflow: visible; padding: 0; width: 100%; }
  #langextract-facts-browser dialog::backdrop { background: rgb(0 0 0 / .58); }
  #langextract-facts-browser .lfb-dialog-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: min(42rem, calc(100vh - 2rem)); overflow: hidden; padding: 0; }
  #langextract-facts-browser .lfb-dialog-head { align-items: start; border-bottom: 1px solid var(--lfb-border); display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr) auto; padding: 1rem; }
  #langextract-facts-browser .lfb-dialog-head h3 { margin: 0 0 .25rem; overflow-wrap: anywhere; }
  #langextract-facts-browser .lfb-dialog-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: .75rem 1rem 1rem; }
  #langextract-facts-browser .lfb-mention { border-bottom: 1px solid var(--lfb-border); display: grid; gap: .35rem; padding: .75rem 0; }
  #langextract-facts-browser .lfb-mention:last-child { border-bottom: 0; }
  #langextract-facts-browser mark { background: #245377; color: var(--lfb-text); }
  #langextract-facts-browser .lfb-annotate { display: flex; gap: .4rem; align-items: center; }
  #langextract-facts-browser .lfb-annotate .lfb-gold-note { max-width: 22rem; }
  #langextract-facts-browser .lfb-annotate-bar { margin: .5rem 0; display: grid; gap: .4rem; }
  @media (max-width: 760px) { #langextract-facts-browser { padding: 1rem; } #langextract-facts-browser .viz-grid, #langextract-facts-browser .viz-controls { grid-template-columns: 1fr; } #langextract-facts-browser summary { grid-template-columns: 1fr; } }
</style>

<script>
(() => {
  const root = document.getElementById('langextract-facts-browser');
  const DATA = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encodedData}'), (char) => char.charCodeAt(0))));
  const byEntity = new Map(DATA.entities.map((entity) => [entity.key, entity]));
  const byItem = new Map(DATA.items.map((item) => [item.id, item]));
  const els = {
    results: root.querySelector('#lfb-results'), search: root.querySelector('#lfb-search'), kind: root.querySelector('#lfb-kind'), page: root.querySelector('#lfb-page'),
    factsTab: root.querySelector('#lfb-facts-tab'), entitiesTab: root.querySelector('#lfb-entities-tab'), peopleTab: root.querySelector('#lfb-people-tab'), locationsTab: root.querySelector('#lfb-locations-tab'), meta: root.querySelector('#lfb-meta'),
    dialog: root.querySelector('#lfb-dialog'), dialogTitle: root.querySelector('#lfb-dialog-title'), dialogMeta: root.querySelector('#lfb-dialog-meta'),
    dialogAliases: root.querySelector('#lfb-dialog-aliases'), dialogMentions: root.querySelector('#lfb-dialog-mentions'), dialogClose: root.querySelector('#lfb-dialog-close'),
  };
  let view = 'facts';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  // Reading-only normalization: join a word broken across a physical line.
  // Raw evidence and offsets remain unchanged in DATA/artifacts.
  const displayReading = ${displayReadingSource};
  const label = (value) => String(value ?? '').replaceAll('_', ' ');
  const pages = [...new Set(DATA.items.flatMap((item) => item.evidence.map((entry) => entry.page_ref)))].sort((a, b) => a - b);
  pages.forEach((page) => els.page.insertAdjacentHTML('beforeend', '<option value="' + page + '">' + page + '</option>'));
  root.querySelector('#lfb-total').textContent = DATA.items.length;
  root.querySelector('#lfb-grounding').textContent = Math.round(DATA.run.grounding_rate * 100) + '%';
  root.querySelector('#lfb-schema').textContent = Math.round(DATA.run.schema_rate * 100) + '% compact-schema valid';
  root.querySelector('#lfb-cost').textContent = '$' + Number(DATA.run.average_cost).toFixed(4);
  root.querySelector('#lfb-unresolved').textContent = DATA.run.cache_hits
    ? '$' + Number(DATA.run.actual_average_cost).toFixed(4) + '/page paid in last cached run · ' + DATA.run.cache_hits + ' cache hits'
    : DATA.run.unresolved + ' references need fallback';

  const entityButton = (key, text) => key && byEntity.has(key)
    ? '<button type="button" class="btn btn-ghost" data-entity-key="' + esc(key) + '">' + esc(displayReading(text)) + '</button>'
    : '<span>' + esc(displayReading(text || '—')) + '</span>';
  const highlightedQuote = (entry) => {
    const quote = String(entry.quote ?? '');
    const refs = [...(entry.entities ?? [])].sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = 0;
    let html = '';
    for (const ref of refs) {
      const start = Math.max(0, ref.start - entry.start_offset);
      const end = Math.min(quote.length, ref.end - entry.start_offset);
      if (start < cursor || end <= start) continue;
      html += esc(displayReading(quote.slice(cursor, start)));
      html += entityButton(ref.key, displayReading(quote.slice(start, end) || ref.text));
      cursor = end;
    }
    return html + esc(displayReading(quote.slice(cursor)));
  };
  const renderFact = (item) => {
    const subject = item.subject_key
      ? '<div class="lfb-entity-line"><span class="lfb-label">Subject</span>' + entityButton(item.subject_key, item.resolved_subject) + '<span class="text-small text-muted">literal: ' + esc(displayReading(item.literal_subject || '—')) + '</span></div>'
      : item.unresolved_subject_reference
        ? '<div><span class="lfb-label">Subject</span><strong>unresolved</strong> · ' + esc(displayReading(item.unresolved_subject_reference.surface)) + ' <span class="text-small text-muted">expected ' + esc(item.unresolved_subject_reference.expected) + ' · ' + esc(label(item.unresolved_subject_reference.why)) + '</span></div>'
        : '<div><span class="lfb-label">Subject</span>' + esc(displayReading(item.literal_subject || '—')) + ' <span class="text-small text-muted">' + esc(label(item.reference_status)) + '</span></div>';
    const reference = item.reference_key
      ? '<div class="lfb-entity-line"><span class="lfb-label">Reference</span><span>' + esc(displayReading((item.literal_subject || '').match(/^[^\\s]+/)?.[0] || item.literal_subject || '—')) + ' →</span>' + entityButton(item.reference_key, item.reference_antecedent) + '</div>'
      : item.reference_status === 'ambiguous' ? '<div><span class="lfb-label">Reference</span>needs fallback</div>' : '';
    const evidence = item.evidence.map((entry) => '<div class="lfb-evidence"><div class="text-small"><span class="lfb-label">Page</span>' + esc(entry.page_ref) + ' · offsets ' + esc(entry.start_offset) + '–' + esc(entry.end_offset) + '</div><div class="lfb-quote">' + highlightedQuote(entry) + '</div></div>').join('');
    return '<details><summary><span class="lfb-statement">' + esc(item.statement) + '</span><span class="viz-badge">' + esc(label(item.kind)) + '</span></summary><div class="lfb-detail"><div class="lfb-tags"><span class="viz-badge">' + esc(label(item.type)) + '</span><span class="viz-badge">' + esc(label(item.modality)) + '</span>' + (item.polarity === 'negated' ? '<span class="viz-badge">negated</span>' : '') + (item.reference_status === 'ambiguous' ? '<span class="viz-badge">needs reference fallback</span>' : '') + (item.subject_ambiguous ? '<span class="viz-badge">ambiguous subject</span>' : '') + (item.unresolved_subject_reference ? '<span class="viz-badge">unresolved subject</span>' : '') + (item.subject_resolution_source ? '<span class="viz-badge">' + esc(label(item.subject_resolution_source)) + '</span>' : '') + '</div>' + subject + reference + evidence + annotationControls(item) + '<div class="text-small text-muted">' + esc(item.id) + '</div></div></details>';
  };
  const renderEntity = (entity) => '<div class="lfb-entity-row"><div class="lfb-entity-line">' + entityButton(entity.key, entity.label) + '<span class="viz-badge">' + esc(label(entity.type)) + '</span><span class="text-small text-muted">' + entity.mentions.length + ' mentions · ' + entity.item_ids.length + ' facts</span></div><div class="text-small text-muted">' + esc(displayReading(entity.aliases.join(' · ') || entity.label)) + '</div></div>';
  const isPerson = (entity) => entity.type === 'person';
  const PLACE_TYPES = new Set(['place', 'building', 'business']);
  const isLocation = (entity) => PLACE_TYPES.has(entity.type);
  const openEntity = (key) => {
    const entity = byEntity.get(key);
    if (!entity) return;
    els.dialogTitle.textContent = displayReading(entity.label);
    els.dialogMeta.textContent = label(entity.type) + ' · ' + entity.mentions.length + ' mentions · ' + entity.item_ids.length + ' linked facts'
      + (entity.address ? ' · ' + entity.address.display : '')
      + (entity.origin === 'noun_ledger' ? ' · provisional (noun ledger)' : '');
    els.dialogAliases.innerHTML = entity.aliases.map((alias) => '<span class="viz-badge">' + esc(displayReading(alias)) + '</span>').join('')
      + (entity.roles ?? []).filter((role) => !entity.aliases.includes(role)).map((role) => '<span class="viz-badge">role: ' + esc(displayReading(role)) + '</span>').join('')
      + (entity.owner_key && byEntity.has(entity.owner_key) ? '<span class="lfb-entity-line"><span class="lfb-label">owned by</span>' + entityButton(entity.owner_key, byEntity.get(entity.owner_key).label) + '</span>' : '');
    els.dialogMentions.innerHTML = entity.mentions.map((mention) => {
      const statements = [...new Set(mention.item_ids.map((id) => byItem.get(id)?.statement).filter(Boolean))];
      return '<div class="lfb-mention"><div><span class="viz-badge">page ' + esc(mention.page) + '</span> <span class="viz-badge">offsets ' + esc(mention.start) + '–' + esc(mention.end) + '</span></div><div class="lfb-quote">' + esc(displayReading(mention.quote)) + '</div><div class="text-small text-muted">mention: ' + esc(displayReading(mention.text)) + (mention.confidence == null ? '' : ' · confidence ' + Number(mention.confidence).toFixed(3)) + '</div>' + (statements.length ? '<div>' + statements.map((statement) => esc(displayReading(statement))).join('<br>') + '</div>' : '') + '</div>';
    }).join('') || '<div class="lfb-empty">No grounded mentions</div>';
    els.dialog.showModal();
  };
  // --- Gold annotation mode (only active with --annotate) ---
  const goldKey = 'lfb-gold-' + DATA.run.source + '-' + DATA.run.id;
  const goldState = (() => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(goldKey) || '{}'))); } catch { return new Map(); } })();
  const saveGold = () => { try { localStorage.setItem(goldKey, JSON.stringify(Object.fromEntries(goldState))); } catch {} };
  const annotationControls = (item) => {
    if (!DATA.annotate) return '';
    const verdict = goldState.get(item.id)?.verdict ?? '';
    return '<div class="lfb-annotate" data-item-id="' + esc(item.id) + '">'
      + '<button type="button" class="btn' + (verdict === 'accepted' ? ' btn-primary' : '') + '" data-gold="accepted">Accept</button>'
      + '<button type="button" class="btn' + (verdict === 'rejected' ? ' btn-primary' : '') + '" data-gold="rejected">Reject</button>'
      + '<input class="form-control lfb-gold-note" placeholder="note / correction" value="' + esc(goldState.get(item.id)?.note ?? '') + '">'
      + '</div>';
  };
  const exportGold = () => {
    const annotations = DATA.items.flatMap((item) => {
      const state = goldState.get(item.id);
      if (!state?.verdict) return [];
      return [{
        item_id: item.id, verdict: state.verdict, note: state.note ?? null,
        page: item.evidence?.[0]?.page_ref ?? null, kind: item.kind,
        assertion_kind: item.assertion_kind, canonical_type: item.canonical_type,
        clause_ids: item.clause_ids, statement: item.statement,
      }];
    });
    const payload = JSON.stringify({ source_id: DATA.run.source, run_id: DATA.run.id, gold_source: 'human-browser', generated_at: new Date().toISOString(), annotations }, null, 1);
    const area = root.querySelector('#lfb-gold-export');
    area.value = payload; area.hidden = false; area.focus(); area.select();
    try {
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      anchor.download = DATA.run.source + '.gold-annotations.json';
      anchor.click();
    } catch {}
  };
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-gold]');
    if (!button || !root.contains(button)) return;
    const wrap = button.closest('[data-item-id]');
    const current = goldState.get(wrap.dataset.itemId) ?? {};
    goldState.set(wrap.dataset.itemId, { ...current, verdict: button.dataset.gold });
    saveGold(); render();
  });
  root.addEventListener('input', (event) => {
    const note = event.target.closest('.lfb-gold-note');
    if (!note || !root.contains(note)) return;
    const wrap = note.closest('[data-item-id]');
    const current = goldState.get(wrap.dataset.itemId) ?? {};
    goldState.set(wrap.dataset.itemId, { ...current, note: note.value });
    saveGold();
  });
  const render = () => {
    const query = els.search.value.trim().toLowerCase();
    const queryTerms = query === 'synagogue' ? ['synagogue', 'synagogues'] : [query];
    const page = els.page.value;
    if (view === 'facts') {
      const rows = DATA.items.filter((item) => (els.kind.value === 'all' || item.kind === els.kind.value) && (page === 'all' || item.evidence.some((entry) => String(entry.page_ref) === page)) && (!query || queryTerms.some((term) => [item.statement, item.type, item.literal_subject, item.resolved_subject, item.reference_antecedent, ...item.evidence.map((entry) => entry.quote)].filter(Boolean).join(' ').toLowerCase().includes(term))));
      els.meta.textContent = rows.length + ' facts shown · ' + DATA.run.source + ' · run ' + DATA.run.id.slice(0, 8);
      els.results.innerHTML = rows.length ? rows.map(renderFact).join('') : '<div class="lfb-empty">No matching facts</div>';
    } else {
      const rows = DATA.entities.filter((entity) => (view !== 'people' || isPerson(entity)) && (view !== 'locations' || isLocation(entity)) && (!query || [entity.label, entity.type, ...entity.aliases].join(' ').toLowerCase().includes(query)) && (page === 'all' || entity.mentions.some((mention) => String(mention.page) === page)));
      els.meta.textContent = rows.length + (view === 'people' ? ' people shown · click a person for every grounded mention and linked fact' : view === 'locations' ? ' locations shown · click a place for every grounded mention and linked fact' : ' entity groups shown · provisional until cross-document resolution');
      els.results.innerHTML = rows.length ? rows.map(renderEntity).join('') : '<div class="lfb-empty">No matching entities</div>';
    }
  };
  const setView = (next) => {
    view = next;
    els.factsTab.classList.toggle('btn-primary', next === 'facts');
    els.entitiesTab.classList.toggle('btn-primary', next === 'entities');
    els.peopleTab.classList.toggle('btn-primary', next === 'people');
    els.locationsTab.classList.toggle('btn-primary', next === 'locations');
    els.factsTab.setAttribute('aria-pressed', String(next === 'facts'));
    els.entitiesTab.setAttribute('aria-pressed', String(next === 'entities'));
    els.peopleTab.setAttribute('aria-pressed', String(next === 'people'));
    els.locationsTab.setAttribute('aria-pressed', String(next === 'locations'));
    render();
  };
  [els.search, els.kind, els.page].forEach((control) => control.addEventListener('input', render));
  els.factsTab.addEventListener('click', () => setView('facts'));
  els.entitiesTab.addEventListener('click', () => setView('entities'));
  els.peopleTab.addEventListener('click', () => setView('people'));
  els.locationsTab.addEventListener('click', () => setView('locations'));
  root.addEventListener('click', (event) => { const button = event.target.closest('[data-entity-key]'); if (button && root.contains(button)) openEntity(button.dataset.entityKey); });
  els.dialogClose.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (event) => { if (event.target === els.dialog) els.dialog.close(); });
  root.querySelector('#lfb-gold-export-btn')?.addEventListener('click', exportGold);
  render();
})();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fragment);
if (v3) {
  const reportPath = path.join(extractionDir, `${sourceId}.historical-v3${reviewIncomplete ? '.review' : ''}.report.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify({
    run_id: run.run_id,
    source_id: run.source_id,
    status: run.status,
    pages: runPages,
    item_count: (run.items ?? []).length,
    supported_item_count: run.supported_item_count ?? 0,
    entity_count: entities.length,
    resolved_reference_count: (run.resolved_references ?? []).length,
    deterministic_reference_count: (run.resolved_references ?? []).filter((row) => row.resolution_source === 'deterministic_subject_memory').length,
    ambiguous_reference_count: ambiguousReferences.length,
    unresolved_subject_count: (run.unresolved_subjects_log ?? []).length,
    item_quality_exclusion_count: itemQualityExclusions.length,
    ambiguous_subject_count: (run.ambiguous_subjects_log ?? []).length,
    entity_exclusions: entityExclusions,
    entity_type_corrections: typeCorrection.corrections,
    entity_type_ambiguities: entityTypeAmbiguities,
    explicit_notation_alias_merges: explicitNotationAliasMerges,
    explicit_slash_alias_merges: explicitSlashAliasMerges,
    protocol_error_count: (run.protocol_errors_log ?? []).length,
    review_only: reviewIncomplete,
    review_subject_attribution: run.review_subject_attribution === true,
    adjudication_requests: run.adjudication_requests ?? [],
    subject_memory_cold_start: run.subject_memory_cold_start ?? null,
    budget: run.budget ?? null,
    usage: run.usage ?? null,
    average_cost_usd_per_page: run.average_cost_usd_per_page ?? null,
    generated_at: new Date().toISOString(),
  }, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, report: reportPath, items: items.length, entities: entities.length, bytes: Buffer.byteLength(fragment) }));
} else {
  console.log(JSON.stringify({ output: outputPath, items: items.length, entities: entities.length, bytes: Buffer.byteLength(fragment) }));
}
