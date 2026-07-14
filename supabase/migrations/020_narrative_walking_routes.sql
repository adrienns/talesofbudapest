-- Cached ORS output for a saved tour. Coordinates are landmark-to-landmark only.
alter table public.narratives
  add column if not exists walking_geometry jsonb,
  add column if not exists walking_distance_meters double precision,
  add column if not exists walking_duration_seconds double precision;
