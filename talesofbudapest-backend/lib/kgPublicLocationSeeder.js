import { normalizeLocationName } from './kgLocationResolver.js';

const aliasKey = (entityId, normalizedAlias, aliasKind = 'name') => `${entityId}\u001f${normalizedAlias}\u001f${aliasKind}`;

export const planPublicLocationEntities = (publicLocations, existingEntities) => {
  const represented = new Set(existingEntities.map((entity) => entity.public_location_id).filter(Boolean));
  return publicLocations.filter((location) => !represented.has(location.id)).map((location) => ({
    entity_kind: 'location',
    canonical_name_en: String(location.name).trim(),
    public_location_id: location.id,
    metadata: {
      source: 'public.locations', latitude: location.latitude, longitude: location.longitude,
      landmark_type: location.landmark_type ?? null,
    },
    review_status: 'draft',
    publication_status: 'private',
  }));
};

// `translations` are public.location_translations rows ({location_id,
// locale, name}) -- see supabase/migrations/010_location_translations.sql.
// Per landmark this seeds up to three name aliases: the public location's
// own `name` (English, as before), its 'hu' translation row (always, when
// present), and its 'en' translation row only when it differs from
// `locations.name` (avoiding a duplicate write of the same string). All
// three share the same dedup key (entity_id, normalized_alias, alias_kind)
// as the rest of this module, so re-running the seeder is always idempotent
// and a translation that happens to normalize the same as the base name is
// silently skipped rather than double-written.
export const planPublicLocationAliases = (publicLocations, canonicalEntities, existingAliases, translations = []) => {
  const entityByLocation = new Map(canonicalEntities.map((entity) => [entity.public_location_id, entity]));
  const existing = new Set(existingAliases.map((alias) => aliasKey(alias.entity_id, alias.normalized_alias, alias.alias_kind)));
  const translationsByLocation = new Map();
  for (const row of translations) {
    if (!row?.location_id || !row?.locale) continue;
    if (!translationsByLocation.has(row.location_id)) translationsByLocation.set(row.location_id, []);
    translationsByLocation.get(row.location_id).push(row);
  }

  const planned = [];
  for (const location of publicLocations) {
    const entity = entityByLocation.get(location.id);
    if (!entity?.id) continue;

    const candidates = [{ alias: String(location.name ?? '').trim(), language_code: 'en' }];
    for (const row of translationsByLocation.get(location.id) ?? []) {
      if (row.locale !== 'hu' && row.locale !== 'en') continue;
      const alias = String(row.name ?? '').trim();
      if (!alias) continue;
      if (row.locale === 'en' && normalizeLocationName(alias) === normalizeLocationName(location.name)) continue;
      candidates.push({ alias, language_code: row.locale });
    }

    for (const { alias, language_code } of candidates) {
      if (!alias) continue; // junk guard: skip empty/whitespace-only names (mirrors the original name-alias behavior)
      const normalized = normalizeLocationName(alias);
      const key = aliasKey(entity.id, normalized, 'name');
      if (!normalized || existing.has(key)) continue;
      existing.add(key); // guards against the location's own translations colliding with each other in the same run
      planned.push({ entity_id: entity.id, alias, normalized_alias: normalized, language_code, alias_kind: 'name', review_status: 'approved' });
    }
  }
  return planned;
};

