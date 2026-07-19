-- PostGIS map/routing points are additive. Scalar coordinates remain the
-- compatibility source until every query has migrated.

create extension if not exists postgis with schema extensions;

alter table public.locations
  add column if not exists map_point extensions.geography(Point, 4326);

create or replace function public.set_location_map_point()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.map_point := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;

update public.locations
set map_point = extensions.st_setsrid(
  extensions.st_makepoint(longitude, latitude), 4326
)::extensions.geography
where map_point is null;

alter table public.locations alter column map_point set not null;

drop trigger if exists locations_set_map_point on public.locations;
create trigger locations_set_map_point
before insert or update of latitude, longitude on public.locations
for each row execute function public.set_location_map_point();

create index if not exists locations_map_point_gist_idx
  on public.locations using gist (map_point);
