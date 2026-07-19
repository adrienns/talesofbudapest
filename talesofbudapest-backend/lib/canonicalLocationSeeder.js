import {
  CANONICAL_CURATED_LOCATIONS,
  CURATED_CHAPTER_LOCATION_SLUGS,
} from '../data/canonicalCuratedLocations.js';

const normalize = (value) => value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');

const locationValues = (item) => ({
  name: item.name,
  slug: item.slug,
  latitude: item.lat,
  longitude: item.lng,
  story_prompt: item.story,
  planning_summary: item.story,
  source_material: item.story,
  source: 'curated',
  external_id: item.slug,
  landmark_type: item.placeKind === 'religious_site' ? 'building' : item.placeKind,
  map_theme: ['building', 'religious_site', 'venue'].includes(item.placeKind) ? 'architecture' : 'history',
  place_kind: item.placeKind,
  lifecycle_status: item.lifecycleStatus ?? 'active',
  publication_status: 'published',
  importance_tier: 'featured',
  importance_score: 100,
  history_depth: 'standard',
  tour_eligible: true,
  image_url: item.media?.url ?? null,
});

const findExistingLocation = async (supabase, item) => {
  const { data: bySlug, error: slugError } = await supabase
    .from('locations').select('*').eq('slug', item.slug).maybeSingle();
  if (slugError) throw new Error(slugError.message);
  if (bySlug) return bySlug;

  const names = item.matchNames ?? [];
  if (!names.length) return null;
  const { data: byName, error: nameError } = await supabase
    .from('locations').select('*').in('name', names);
  if (nameError) throw new Error(nameError.message);
  if ((byName ?? []).length > 1) {
    throw new Error(`Ambiguous canonical match for ${item.slug}: ${byName.map((row) => row.id).join(', ')}`);
  }
  return byName?.[0] ?? null;
};

const seedTranslations = async (supabase, item, locationId) => {
  const rows = [
    { location_id: locationId, locale: 'en', name: item.name, story_prompt: item.story },
    { location_id: locationId, locale: 'hu', name: item.huName, story_prompt: item.story },
  ];
  const { error } = await supabase.from('location_translations')
    .upsert(rows, { onConflict: 'location_id,locale' });
  if (error) throw new Error(error.message);
};

const seedAliasesAndIdentifiers = async (supabase, item, locationId) => {
  const aliases = [
    { location_id: locationId, alias: item.name, normalized_alias: normalize(item.name), locale: 'en', alias_kind: 'primary' },
    { location_id: locationId, alias: item.huName, normalized_alias: normalize(item.huName), locale: 'hu', alias_kind: 'multilingual' },
    ...(item.matchNames ?? []).filter((name) => name !== item.name).map((name) => ({
      location_id: locationId, alias: name, normalized_alias: normalize(name), locale: null, alias_kind: 'alternative',
    })),
  ];
  const { error: aliasError } = await supabase.from('location_aliases')
    .upsert(aliases, { onConflict: 'location_id,normalized_alias,alias_kind' });
  if (aliasError) throw new Error(aliasError.message);

  const { error: identifierError } = await supabase.from('location_identifiers').upsert({
    location_id: locationId,
    provider: 'curated',
    external_id: item.slug,
  }, { onConflict: 'provider,external_id' });
  if (identifierError) throw new Error(identifierError.message);
};

const seedMediaAndFacets = async (supabase, item, locationId) => {
  if (item.media) {
    const { error } = await supabase.from('location_media').upsert({
      location_id: locationId,
      media_kind: 'image',
      url: item.media.url,
      alt_text: item.name,
      author: item.media.author,
      source_url: item.media.sourceUrl,
      license: item.media.license,
      license_url: item.media.licenseUrl,
      attribution: `${item.media.author} · ${item.media.license}`,
      sort_order: 0,
      review_status: 'approved',
      commercial_use_allowed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'location_id,url' });
    if (error) throw new Error(error.message);
  }

  const facets = Object.entries(item.facets ?? {}).map(([categoryId, relevanceScore]) => ({
    location_id: locationId,
    category_id: categoryId,
    relevance_score: relevanceScore,
    evidence_summary: `Reviewed canonical facet for ${item.name}`,
    reviewed: true,
    content_version: 1,
  }));
  if (facets.length) {
    const { error } = await supabase.from('location_tour_facets')
      .upsert(facets, { onConflict: 'location_id,category_id' });
    if (error) throw new Error(error.message);
  }
};

export const resolveLocationSlugs = async (supabase, slugs) => {
  const uniqueSlugs = [...new Set(slugs)];
  const { data, error } = await supabase.from('locations').select(
    'id, slug, image_url, location_media(url,author,source_url,license,license_url,sort_order,review_status,commercial_use_allowed)',
  )
    .in('slug', uniqueSlugs);
  if (error) throw new Error(error.message);
  const bySlug = new Map((data ?? []).map((row) => [row.slug, row]));
  const missing = uniqueSlugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw new Error(`Missing canonical locations: ${missing.join(', ')}`);
  return bySlug;
};

export const backfillCuratedChapterLocations = async (supabase) => {
  const allSlugs = Object.values(CURATED_CHAPTER_LOCATION_SLUGS).flat();
  const locationBySlug = await resolveLocationSlugs(supabase, allSlugs);
  const { data: narratives, error } = await supabase.from('narratives')
    .select('id, curated_slug, narrative_chapters(id, chapter_index)')
    .not('curated_slug', 'is', null);
  if (error) throw new Error(error.message);

  let linked = 0;
  for (const narrative of narratives ?? []) {
    const mapping = CURATED_CHAPTER_LOCATION_SLUGS[narrative.curated_slug];
    if (!mapping) continue;
    for (const chapter of narrative.narrative_chapters ?? []) {
      const slug = mapping[chapter.chapter_index];
      if (!slug) throw new Error(`No explicit mapping for ${narrative.curated_slug} chapter ${chapter.chapter_index}`);
      const locationId = locationBySlug.get(slug).id;
      const { error: updateError } = await supabase.from('narrative_chapters').update({
        location_id: locationId,
        landmark_id: locationId,
      }).eq('id', chapter.id);
      if (updateError) throw new Error(updateError.message);
      linked += 1;
    }
  }
  return linked;
};

export const seedCanonicalCuratedLocations = async (supabase) => {
  const idsBySlug = new Map();
  let created = 0;
  let matched = 0;

  for (const item of CANONICAL_CURATED_LOCATIONS) {
    const existing = await findExistingLocation(supabase, item);
    let location;
    if (existing) {
      const values = locationValues(item);
      // An existing registry point is canonical; tour meeting points must not overwrite it.
      delete values.latitude;
      delete values.longitude;
      delete values.source;
      delete values.external_id;
      if (!item.media) delete values.image_url;
      const { data, error } = await supabase.from('locations').update(values)
        .eq('id', existing.id).select().single();
      if (error) throw new Error(error.message);
      location = data;
      matched += 1;
    } else {
      const { data, error } = await supabase.from('locations').insert(locationValues(item))
        .select().single();
      if (error) throw new Error(error.message);
      location = data;
      created += 1;
    }

    idsBySlug.set(item.slug, location.id);
    await seedTranslations(supabase, item, location.id);
    await seedAliasesAndIdentifiers(supabase, item, location.id);
    await seedMediaAndFacets(supabase, item, location.id);
  }

  const linkedChapters = await backfillCuratedChapterLocations(supabase);
  return { created, matched, total: idsBySlug.size, linkedChapters, idsBySlug };
};
