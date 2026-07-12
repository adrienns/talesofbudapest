create index if not exists locations_map_idx
  on public.locations (importance_tier, latitude, longitude);
