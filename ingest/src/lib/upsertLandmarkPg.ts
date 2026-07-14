import pg from 'pg'
import type { LandmarkSeed } from '../types/landmark.js'
import { resolveTranslations, toLocationRow } from './upsertLandmark.js'

const upsertTranslationsPg = async (
  pool: pg.Pool,
  locationId: string,
  seed: LandmarkSeed,
): Promise<void> => {
  for (const translation of resolveTranslations(seed)) {
    await pool.query(
      `insert into public.location_translations (
         location_id, locale, name, story_prompt, updated_at
       )
       values ($1, $2, $3, $4, now())
       on conflict (location_id, locale) do update set
         name = excluded.name,
         story_prompt = excluded.story_prompt,
         updated_at = now()`,
      [locationId, translation.locale, translation.name, translation.story_prompt],
    )
  }
}

export const upsertLandmarkPg = async (
  pool: pg.Pool,
  seed: LandmarkSeed,
): Promise<{ id: string; name: string; inserted: boolean }> => {
  const row = toLocationRow(seed)

  const existing = await pool.query<{ id: string }>(
    `select id from public.locations
     where (source = $1 and external_id = $2) or name = $3
     limit 1`,
    [row.source, row.external_id, row.name],
  )

  if (existing.rows[0]) {
    const updated = await pool.query<{ id: string; name: string }>(
      `update public.locations
       set source = $2,
           external_id = $3,
           landmark_type = $4,
           map_theme = $5,
           name = $6,
           latitude = $7,
           longitude = $8,
           story_prompt = $9,
           source_material = $10,
           history_depth = $11,
           image_url = $12,
           images = $13::jsonb,
           importance_tier = $14,
           importance_score = $15
       where id = $1
       returning id, name`,
      [
        existing.rows[0].id,
        row.source,
        row.external_id,
        row.landmark_type,
        row.map_theme,
        row.name,
        row.latitude,
        row.longitude,
        row.story_prompt,
        row.source_material,
        row.history_depth,
        row.image_url,
        JSON.stringify(row.images),
        row.importance_tier,
        row.importance_score,
      ],
    )

    await upsertTranslationsPg(pool, updated.rows[0].id, seed)
    return { ...updated.rows[0], inserted: false }
  }

  const inserted = await pool.query<{ id: string; name: string }>(
    `insert into public.locations (
       source, external_id, landmark_type, map_theme, name, latitude, longitude, story_prompt,
       source_material, history_depth, image_url, images,
       importance_tier, importance_score
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
     returning id, name`,
    [
      row.source,
      row.external_id,
      row.landmark_type,
      row.map_theme,
      row.name,
      row.latitude,
      row.longitude,
      row.story_prompt,
      row.source_material,
      row.history_depth,
      row.image_url,
      JSON.stringify(row.images),
      row.importance_tier,
      row.importance_score,
    ],
  )

  await upsertTranslationsPg(pool, inserted.rows[0].id, seed)
  return { ...inserted.rows[0], inserted: true }
}
