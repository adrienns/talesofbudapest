export const fetchLocationChronicle = async (supabase, locationId) => {
  const { data, error } = await supabase
    .from('kg_location_chronicle')
    .select('location_id, facts, events, people, relations, updated_at')
    .eq('location_id', locationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    facts: data.facts ?? [],
    events: data.events ?? [],
    people: data.people ?? [],
    relations: data.relations ?? [],
  };
};

export const fetchTranslation = async (supabase, locationId, locale) => {
  const { data, error } = await supabase
    .from('location_translations')
    .select('locale, name, story_prompt, historical_narrative, audio_url')
    .eq('location_id', locationId)
    .eq('locale', locale)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

/** Approved name aliases for chronicle entities — powers locale-aware person names. */
export const fetchEntityNameAliases = async (supabase, entityIds) => {
  const ids = [...new Set((entityIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from('kg_entity_aliases')
    .select('entity_id, alias, language_code, alias_kind, review_status')
    .in('entity_id', ids)
    .eq('review_status', 'approved')
    .in('alias_kind', ['name', 'translated_name']);

  if (error) {
    throw new Error(error.message);
  }

  const byEntity = new Map();
  for (const row of data ?? []) {
    const list = byEntity.get(row.entity_id) ?? [];
    list.push(row);
    byEntity.set(row.entity_id, list);
  }

  return byEntity;
};
