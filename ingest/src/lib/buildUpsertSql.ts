import type { LandmarkSeed } from '../types/landmark.js'
import { toLocationRow } from './upsertLandmark.js'

const escapeLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`

const sqlStringOrNull = (value: string | null | undefined): string => {
  if (value == null || value === '') {
    return 'null'
  }
  return escapeLiteral(value)
}

export const buildUpsertSql = (seed: LandmarkSeed): string => {
  const row = toLocationRow(seed)
  const imagesJson = JSON.stringify(row.images).replace(/'/g, "''")
  const imageUrl = row.image_url ? escapeLiteral(row.image_url) : 'null'

  return `
insert into public.locations (
  source, external_id, landmark_type, name, latitude, longitude, story_prompt,
  source_material, history_depth, image_url, images
)
values (
  ${escapeLiteral(row.source)},
  ${escapeLiteral(row.external_id)},
  ${escapeLiteral(row.landmark_type)},
  ${escapeLiteral(row.name)},
  ${row.latitude},
  ${row.longitude},
  ${escapeLiteral(row.story_prompt)},
  ${sqlStringOrNull(row.source_material)},
  ${sqlStringOrNull(row.history_depth)},
  ${imageUrl},
  '${imagesJson}'::jsonb
)
on conflict (name) do update set
  source = excluded.source,
  external_id = excluded.external_id,
  landmark_type = excluded.landmark_type,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  story_prompt = excluded.story_prompt,
  source_material = excluded.source_material,
  history_depth = excluded.history_depth,
  image_url = excluded.image_url,
  images = excluded.images
returning id, name, (xmax = 0) as inserted;
`.trim()
}
