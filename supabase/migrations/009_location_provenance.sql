alter table public.locations add column if not exists source text;
alter table public.locations add column if not exists external_id text;
alter table public.locations add column if not exists landmark_type text;

update public.locations
set
  source = 'iconic',
  external_id = 'iconic-' || md5(name),
  landmark_type = 'iconic'
where source is null;

create unique index if not exists locations_source_external_id_key
  on public.locations (source, external_id)
  where source is not null and external_id is not null;
