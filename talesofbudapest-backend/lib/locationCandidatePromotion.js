import { normalizePlaceName } from './locationCandidateResolver.js';

export const promoteLocationCandidate = async ({
  supabase,
  candidateId,
  existingLocationSlug = null,
  slug = null,
  name = null,
  placeKind = 'historical_site',
  storyPrompt = '',
}) => {
  const { data: candidate, error: candidateError } = await supabase
    .from('location_candidates').select('*').eq('id', candidateId).maybeSingle();
  if (candidateError) throw new Error(candidateError.message);
  if (!candidate) throw new Error('Location candidate not found');
  if (!['pending', 'matched'].includes(candidate.status)) {
    throw new Error(`Location candidate is already ${candidate.status}`);
  }

  let location;
  if (existingLocationSlug) {
    const { data, error } = await supabase.from('locations').select('*')
      .eq('slug', existingLocationSlug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Canonical location not found: ${existingLocationSlug}`);
    location = data;
  } else {
    if (!slug) throw new Error('A new canonical location requires --slug');
    const canonicalName = name ?? candidate.proposed_name;
    const { data, error } = await supabase.from('locations').insert({
      slug,
      name: canonicalName,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      story_prompt: storyPrompt || `Reviewed Budapest location: ${canonicalName}.`,
      planning_summary: storyPrompt || `Reviewed Budapest location: ${canonicalName}.`,
      source: 'curated',
      external_id: slug,
      landmark_type: placeKind === 'religious_site' ? 'building' : placeKind,
      map_theme: ['building', 'religious_site', 'venue'].includes(placeKind) ? 'architecture' : 'history',
      place_kind: placeKind,
      lifecycle_status: 'active',
      publication_status: 'published',
      importance_tier: 'standard',
      importance_score: 50,
      history_depth: 'thin',
      tour_eligible: true,
    }).select().single();
    if (error || !data) throw new Error(error?.message ?? 'Failed to create canonical location');
    location = data;

    const { error: aliasError } = await supabase.from('location_aliases').insert({
      location_id: location.id,
      alias: canonicalName,
      normalized_alias: normalizePlaceName(canonicalName),
      alias_kind: 'primary',
    });
    if (aliasError) throw new Error(aliasError.message);
  }

  const { error: chapterError } = await supabase.from('narrative_chapters').update({
    location_id: location.id,
    landmark_id: location.id,
    location_candidate_id: null,
  }).eq('location_candidate_id', candidate.id);
  if (chapterError) throw new Error(chapterError.message);

  const status = existingLocationSlug ? 'matched' : 'promoted';
  const { error: updateError } = await supabase.from('location_candidates').update({
    status,
    matched_location_id: existingLocationSlug ? location.id : null,
    promoted_location_id: existingLocationSlug ? null : location.id,
    updated_at: new Date().toISOString(),
  }).eq('id', candidate.id);
  if (updateError) throw new Error(updateError.message);
  return { candidateId: candidate.id, locationId: location.id, locationSlug: location.slug, status };
};
