// Pure planner for cli/load-wikidata-aliases.js: anchors CC0 Wikidata "open
// place" records (ingest/src/sources/wikidata/pollBudapest.ts) onto existing
// canonical location entities (kg_entities rows with a public_location_id,
// seeded by `npm run embed:kg -- --seed-public-locations` /
// lib/kgPublicLocationSeeder.js). This module NEVER creates entities -- a
// landmark with no canonical entity yet is skipped and counted
// (skipped_no_entity), the seeder must run first.
//
// Record shape ground truth: ingest/src/sources/wikidata/pollBudapest.ts's
// WikidataOpenPlace type. Current records carry `labels: {hu,en,de}`,
// `altLabels: [{lang,value}]`, a top-level `name` (already
// nameEn ?? nameHu ?? nameDe), and `coordinates: {lat,lng}` (NOT
// latitude/longitude -- that field-name mismatch is exactly why this module
// remaps them before calling the resolver). The committed sample file
// (ingest/output/open/wikidata_budapest_offset_0.json) predates `labels` /
// `altLabels` entirely; for those OLD-SHAPE records `name` is treated as the
// record's only label, with an unknown (null) language_code -- there is no
// way to recover which language `name` was written in for those rows.
import { normalizeLocationName } from './kgNormalize.js';
import { rankLocationCandidates } from './kgLocationResolver.js';
import { suppressAmbiguousExactMatches } from './kgAliasGuard.js';
import { stableUuid } from './kgPromotion.js';

// Same junk guard pollBudapest.ts's parseAltLabelsConcat applies at ingest
// time (isJunkAltLabel), re-implemented here defensively: this module must
// not trust that every input file was produced by the current poller (the
// committed sample predates the guard existing at all), and applies the same
// rule uniformly to labels too, not just altLabels.
const JUNK_LABEL = /^Q\d+$/;
const isJunkLabel = (value) => JUNK_LABEL.test(value) || value.length <= 1 || value.length > 120;

// Never downgrade an alias row that a human (or a higher-precedence pipeline)
// already reviewed. Mirrors lib/kgPromotion.js's mergedAliasReview exactly
// (not imported -- that helper isn't exported, and duplicating four lines is
// cheaper than widening kgPromotion.js's public surface for it).
const REVIEW_RANK = { draft: 0, needs_review: 1, approved: 2 };
const mergedAliasReview = (existingStatus, requestedStatus) => {
  if (existingStatus === 'rejected') return 'rejected';
  if (!existingStatus) return requestedStatus;
  return REVIEW_RANK[existingStatus] > REVIEW_RANK[requestedStatus] ? existingStatus : requestedStatus;
};

// Ownership map over the INPUT SET of public landmarks passed to this run
// (not a database-wide query) -- mirrors cli/resolve-kg-locations.js's
// buildAliasOwnership. A normalized name/alias owned by more than one
// landmark in that set makes an exact match to any of them ambiguous.
const buildAliasOwnership = (landmarks) => {
  const ownership = new Map();
  for (const landmark of landmarks) {
    const identities = new Set([landmark?.name, ...(landmark?.aliases ?? [])].map(normalizeLocationName).filter(Boolean));
    for (const normalized of identities) {
      const owners = ownership.get(normalized) ?? new Set();
      owners.add(landmark.id);
      ownership.set(normalized, owners);
    }
  }
  return ownership;
};

// [language_code, value] pairs for a record's labels. New-shape records
// carry a `labels` object (some entries possibly null); old-shape records
// have no `labels` field at all, so `name` is treated as the sole label with
// an unknown language.
const recordLabelPairs = (record) => {
  const labels = record?.labels;
  if (labels && typeof labels === 'object') {
    return [['hu', labels.hu], ['en', labels.en], ['de', labels.de]]
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0);
  }
  return typeof record?.name === 'string' && record.name.trim().length > 0 ? [[null, record.name]] : [];
};

const buildMention = (record, labelPairs) => {
  const altLabels = Array.isArray(record?.altLabels) ? record.altLabels : [];
  const aliasValues = [...labelPairs.map(([, value]) => value), ...altLabels.map((entry) => entry?.value)].filter(Boolean);
  return {
    name_en: record?.labels?.en ?? record?.labels?.hu ?? record?.name ?? null,
    aliases: aliasValues,
    latitude: Number(record?.coordinates?.lat),
    longitude: Number(record?.coordinates?.lng),
  };
};

export const planWikidataAliasLinks = (records, publicLandmarks, entitiesByPublicLocationId, existingAliasesByEntityId) => {
  const landmarks = publicLandmarks ?? [];
  const aliasOwnership = buildAliasOwnership(landmarks);

  const summary = {
    matched_approved: 0, matched_review: 0, skipped_no_entity: 0,
    skipped_no_match: 0, junk_dropped: 0, ambiguous_downgraded: 0,
  };

  // Keyed by `${entity_id}${normalized_alias}${alias_kind}` so
  // (a) repeated Wikidata records that happen to resolve to the same entity
  // never emit two rows for the same identity, and (b) an existing DB row's
  // id is always reused instead of minting a fresh one.
  const rowsByKey = new Map();
  const entityPatchByEntityId = new Map();

  for (const record of records ?? []) {
    const labelPairs = recordLabelPairs(record);
    const mention = buildMention(record, labelPairs);

    const [ranked] = rankLocationCandidates(mention, landmarks, new Map(), 1, {});
    if (!ranked) { summary.skipped_no_match += 1; continue; }
    const [best] = suppressAmbiguousExactMatches([ranked], aliasOwnership);

    const exactOk = Boolean(best.signals.exactName);
    const distanceOk = best.signals.distanceMeters !== null && best.signals.distanceMeters !== undefined && best.signals.distanceMeters <= 50;
    const ambiguous = best.reason === 'ambiguous_exact_alias';

    let decided;
    if (exactOk && distanceOk) {
      decided = ambiguous ? 'needs_review' : 'approved';
      if (ambiguous) summary.ambiguous_downgraded += 1;
    } else if (exactOk || distanceOk) {
      decided = 'needs_review';
    } else {
      summary.skipped_no_match += 1;
      continue;
    }

    const landmark = best.candidate;
    const entity = entitiesByPublicLocationId?.get(landmark.id);
    if (!entity) { summary.skipped_no_entity += 1; continue; }

    if (decided === 'approved') summary.matched_approved += 1; else summary.matched_review += 1;

    const matchedVia = exactOk && distanceOk ? 'exact_and_distance' : exactOk ? 'exact_alias' : 'distance';

    if (!entityPatchByEntityId.has(entity.id)) {
      entityPatchByEntityId.set(entity.id, {
        entity_id: entity.id,
        metadata: {
          ...(entity.metadata ?? {}),
          wikidata_id: record.externalId,
          wikidata_anchor: { matched_via: matchedVia, distance_m: best.signals.distanceMeters, decided },
        },
      });
    }

    const existingForEntity = existingAliasesByEntityId?.get(entity.id) ?? [];
    const existingByKey = new Map(existingForEntity.map((row) => [`${row.normalized_alias}${row.alias_kind}`, row]));

    const addAliasRow = (rawValue, aliasKind, languageCode) => {
      if (typeof rawValue !== 'string') return;
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      if (isJunkLabel(trimmed)) { summary.junk_dropped += 1; return; }
      // Identifier rows ("wikidata:Q123") are not names -- normalizing them
      // through normalizeLocationName would strip/rewrite characters that
      // are meaningful in an identifier (it's built for place-name text, not
      // opaque ids). They're instead normalized as trimmed lowercase, as-is.
      const normalized = aliasKind === 'identifier' ? trimmed.toLowerCase() : normalizeLocationName(trimmed);
      if (!normalized) return;
      const dedupeKey = `${entity.id}${normalized}${aliasKind}`;
      if (rowsByKey.has(dedupeKey)) return;
      const existing = existingByKey.get(`${normalized}${aliasKind}`);
      rowsByKey.set(dedupeKey, {
        id: existing?.id ?? stableUuid('alias', entity.id, aliasKind, normalized),
        entity_id: entity.id,
        alias: existing?.alias ?? trimmed,
        normalized_alias: normalized,
        language_code: existing?.language_code ?? languageCode ?? null,
        alias_kind: aliasKind,
        review_status: mergedAliasReview(existing?.review_status, decided),
        source: 'wikidata',
      });
    };

    for (const [lang, value] of labelPairs) addAliasRow(value, 'name', lang);
    for (const alt of (Array.isArray(record?.altLabels) ? record.altLabels : [])) addAliasRow(alt?.value, 'translated_name', alt?.lang ?? null);
    if (typeof record?.externalId === 'string' && record.externalId) addAliasRow(`wikidata:${record.externalId}`, 'identifier', null);
  }

  return { aliasRows: [...rowsByKey.values()], entityPatches: [...entityPatchByEntityId.values()], summary };
};
