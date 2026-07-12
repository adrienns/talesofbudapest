import type { SupabaseClient } from '@supabase/supabase-js'
import type { LandmarkSeed, LandmarkTranslationSeed } from '../types/landmark.js'

export type LocationRow = {
  source: string
  external_id: string
  landmark_type: string
  name: string
  latitude: number
  longitude: number
  story_prompt: string
  source_material: string | null
  history_depth: string | null
  image_url: string | null
  images: { url: string; alt?: string }[]
  importance_tier?: string | null
  importance_score?: number | null
}

export const resolveTranslations = (seed: LandmarkSeed): LandmarkTranslationSeed[] => {
  if (seed.translations?.length) {
    return seed.translations
  }

  return [{ locale: 'en', name: seed.name, story_prompt: seed.story_prompt }]
}

export const toLocationRow = (seed: LandmarkSeed): LocationRow => {
  const translations = resolveTranslations(seed)
  const primary =
    translations.find((translation) => translation.locale === 'en') ?? translations[0]

  const sourceMaterial =
    seed.source_material?.trim() ||
    primary?.story_prompt?.trim() ||
    seed.story_prompt?.trim() ||
    null

  return {
    source: seed.source,
    external_id: seed.external_id,
    landmark_type: seed.landmark_type,
    name: primary?.name ?? seed.name,
    latitude: seed.lat,
    longitude: seed.lng,
    story_prompt: primary?.story_prompt ?? seed.story_prompt,
    source_material: sourceMaterial,
    history_depth: seed.history_depth ?? null,
    image_url: seed.image_url,
    images: seed.images,
    importance_tier: seed.importance_tier ?? null,
    importance_score: seed.importance_score ?? null,
  }
}

const upsertTranslations = async (
  supabase: SupabaseClient,
  locationId: string,
  seed: LandmarkSeed,
) => {
  for (const translation of resolveTranslations(seed)) {
    const { error } = await supabase.from('location_translations').upsert(
      {
        location_id: locationId,
        locale: translation.locale,
        name: translation.name,
        story_prompt: translation.story_prompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'location_id,locale' },
    )

    if (error) {
      throw new Error(error.message)
    }
  }
}

export const upsertLandmark = async (
  supabase: SupabaseClient,
  seed: LandmarkSeed,
): Promise<{ id: string; name: string }> => {
  const row = toLocationRow(seed)

  const { data: existing, error: fetchError } = await supabase
    .from('locations')
    .select('id')
    .or(`and(source.eq.${row.source},external_id.eq.${row.external_id}),name.eq.${row.name}`)
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  if (existing) {
    const { data, error } = await supabase
      .from('locations')
      .update({
        source: row.source,
        external_id: row.external_id,
        landmark_type: row.landmark_type,
        name: row.name,
        latitude: row.latitude,
        longitude: row.longitude,
        story_prompt: row.story_prompt,
        source_material: row.source_material,
        history_depth: row.history_depth,
        image_url: row.image_url,
        images: row.images,
        importance_tier: row.importance_tier,
        importance_score: row.importance_score,
      })
      .eq('id', existing.id)
      .select('id, name')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    await upsertTranslations(supabase, data.id, seed)
    return data
  }

  const { data, error } = await supabase.from('locations').insert(row).select('id, name').single()

  if (error) {
    throw new Error(error.message)
  }

  await upsertTranslations(supabase, data.id, seed)
  return data
}
