alter table public.locations
  add column if not exists map_theme text;

alter table public.locations
  drop constraint if exists locations_map_theme_check;

alter table public.locations
  add constraint locations_map_theme_check
  check (map_theme in ('history', 'architecture'));

update public.locations
set map_theme = case
  when landmark_type in ('monument', 'statue', 'iconic') then 'history'
  else 'architecture'
end
where map_theme is null;

alter table public.locations
  alter column map_theme set not null;

create index if not exists locations_map_theme_idx
  on public.locations (map_theme);
