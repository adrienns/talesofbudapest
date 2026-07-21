#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { entityPresentationExclusionReason } from '../lib/historicalEntityPresentation.js';

const input = process.argv[2];
if (!input) throw new Error('usage: node cli/audit-historical-browser.mjs HTML [REPORT.json] [--strict]');
const reportPath = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const html = fs.readFileSync(path.resolve(input), 'utf8');
const encoded = html.match(/atob\('([^']+)'\)/u)?.[1];
if (!encoded) throw new Error('embedded browser data not found');
const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
const findings = [];
const add = (kind, details) => findings.push({ kind, ...details });
const fold = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
const anaphoricAlias = /^(?:he|him|his|she|her|hers|they|them|their|theirs|it|its|this|that|these|those|the\s+(?:old\s+)?(?:man|woman|king|queen|rabbi|author|writer|scholar|jew))$/iu;
const byKey = new Map(data.entities.map((entity) => [entity.key, entity]));
const explicitlyExcludedEntityIds = new Set((data.entity_exclusions ?? []).map((row) => row.entity_id).filter(Boolean));
const labels = new Map();

for (const entity of data.entities) {
  const exclusion = entityPresentationExclusionReason(entity);
  if (exclusion) add('presented_entity_should_be_excluded', { entity_id: entity.key, label: entity.label, type: entity.type, reason: exclusion });
  if (['date', 'event', 'movement', 'reference antecedent', 'resolved subject'].includes(entity.type)) add('non_identity_presentation_type', { entity_id: entity.key, label: entity.label, type: entity.type });
  if (entity.type === 'person' && /^[a-z]/u.test(entity.label)) add('lowercase_person_label_review', { entity_id: entity.key, label: entity.label });
  for (const alias of entity.aliases ?? []) if (anaphoricAlias.test(alias.trim())) add('anaphoric_entity_alias', { entity_id: entity.key, label: entity.label, alias });
  if (entity.owner_key && !byKey.has(entity.owner_key)) add('missing_owner_entity', { entity_id: entity.key, owner_entity_id: entity.owner_key });
  const key = fold(entity.label);
  const rows = labels.get(key) ?? []; rows.push(entity); labels.set(key, rows);
}

for (const [label, entities] of labels) {
  if (label && entities.length > 1) add('duplicate_entity_label', {
    label,
    entities: entities.map((entity) => ({ entity_id: entity.key, type: entity.type })),
  });
}

for (const item of data.items) {
  for (const [field, key] of [['subject_key', item.subject_key], ['reference_key', item.reference_key]]) {
    if (key && !byKey.has(key)) add('missing_item_entity_target', { item_id: item.id, field, entity_id: key });
  }
  for (const evidence of item.evidence ?? []) for (const span of evidence.entities ?? []) {
    if (span.key && !byKey.has(span.key) && !explicitlyExcludedEntityIds.has(span.key) && !entityPresentationExclusionReason({ type: span.type, label: span.text, aliases: [span.text] })) add('missing_evidence_entity_target', { item_id: item.id, entity_id: span.key });
  }
  if (item.subject_attribution?.status !== 'resolved') add('visible_unresolved_subject', { item_id: item.id, reason: item.subject_attribution?.reason ?? 'missing_subject_attribution' });
}

for (const correction of data.entity_type_corrections ?? []) add('entity_type_correction', correction);
for (const ambiguity of data.entity_type_ambiguities ?? []) add('entity_type_ambiguity', ambiguity);
for (const merge of data.explicit_notation_alias_merges ?? []) add('explicit_notation_alias_merge', merge);
for (const merge of data.explicit_slash_alias_merges ?? []) add('explicit_slash_alias_merge', merge);
for (const exclusion of data.item_quality_exclusions ?? []) add('item_quality_exclusion', exclusion);

const byKind = Object.fromEntries([...new Set(findings.map((row) => row.kind))].sort().map((kind) => [kind, findings.filter((row) => row.kind === kind).length]));
const report = {
  run_id: data.run.id,
  pages: data.run.pages,
  review_only: data.run.review_only,
  counts: { items: data.items.length, entities: data.entities.length, findings: findings.length },
  by_kind: byKind,
  findings,
};
if (reportPath) fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: reportPath ? path.resolve(reportPath) : null, ...report.counts, by_kind: byKind }));
if (process.argv.includes('--strict') && findings.some((row) => !['visible_unresolved_subject', 'item_quality_exclusion', 'entity_type_correction', 'lowercase_person_label_review', 'duplicate_entity_label', 'entity_type_ambiguity', 'explicit_notation_alias_merge', 'explicit_slash_alias_merge'].includes(row.kind))) process.exitCode = 1;
