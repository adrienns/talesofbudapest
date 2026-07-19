const EARTH_METERS = 6_371_000;

export const normalizePlaceName = (value = '') => value
  .normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('en')
  .replace(/[^a-z0-9]+/gu, ' ')
  .trim();

export const distanceMeters = (a, b) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.sqrt(h));
};

export const findConfidentLocationMatch = (proposed, locations) => {
  const normalized = normalizePlaceName(proposed.name);
  const scored = locations.map((location) => {
    const names = [location.name, ...(location.location_aliases ?? []).map((item) => item.alias)];
    return {
      location,
      distance: distanceMeters(proposed, { lat: location.latitude, lng: location.longitude }),
      exactName: names.some((name) => normalizePlaceName(name) === normalized),
    };
  }).filter((item) => item.distance <= 120);

  const exact = scored.filter((item) => item.exactName && item.distance <= 120);
  if (exact.length === 1) return { location: exact[0].location, reason: 'alias-and-spatial' };

  const veryClose = scored.filter((item) => item.distance <= 20);
  if (veryClose.length === 1) return { location: veryClose[0].location, reason: 'very-close-spatial' };
  return null;
};

export const resolveConfirmedCustomStop = async ({ supabase, narrativeId, chapter }) => {
  const latDelta = 0.0012;
  const lngDelta = 0.0018;
  const { data: nearby, error } = await supabase.from('locations')
    .select('id, name, latitude, longitude, location_aliases(alias)')
    .eq('publication_status', 'published')
    .gte('latitude', chapter.lat - latDelta)
    .lte('latitude', chapter.lat + latDelta)
    .gte('longitude', chapter.lng - lngDelta)
    .lte('longitude', chapter.lng + lngDelta);
  if (error) throw new Error(error.message);

  const match = findConfidentLocationMatch(
    { name: chapter.title, lat: chapter.lat, lng: chapter.lng },
    nearby ?? [],
  );
  if (match) {
    return { locationId: match.location.id, candidateId: null, result: match.reason };
  }

  const normalizedName = normalizePlaceName(chapter.title);
  const { data: existingCandidate, error: candidateLookupError } = await supabase
    .from('location_candidates')
    .select('id')
    .eq('originating_narrative_id', narrativeId)
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  if (candidateLookupError) throw new Error(candidateLookupError.message);
  if (existingCandidate) {
    return { locationId: null, candidateId: existingCandidate.id, result: 'existing-candidate' };
  }

  const { data: candidate, error: insertError } = await supabase.from('location_candidates').insert({
    proposed_name: chapter.title,
    normalized_name: normalizedName,
    latitude: chapter.lat,
    longitude: chapter.lng,
    originating_narrative_id: narrativeId,
    deduplication_result: {
      nearbyLocationIds: (nearby ?? []).map((item) => item.id),
      decision: 'no-confident-match',
    },
    status: 'pending',
  }).select('id').single();
  if (insertError || !candidate) throw new Error(insertError?.message ?? 'Failed to create location candidate');
  return { locationId: null, candidateId: candidate.id, result: 'new-candidate' };
};
