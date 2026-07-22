-- Older hosted projects used bigint primary keys for locations. The current
-- catalog and curated-tour schema use UUIDs, so retain the legacy identifier
-- for audit/debugging while moving the application identity to UUID.
do $$
declare
  location_id_type text;
  primary_key_name text;
begin
  select data_type into location_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'locations'
    and column_name = 'id';

  if location_id_type = 'bigint' then
    alter table public.locations
      add column if not exists legacy_uuid uuid;

    update public.locations
    set legacy_uuid = gen_random_uuid()
    where legacy_uuid is null;

    -- Legacy chapters stored a location id as text. Keep them connected to the
    -- same place after its primary key changes type.
    if to_regclass('public.narrative_chapters') is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'narrative_chapters'
          and column_name = 'landmark_id'
      ) then
      update public.narrative_chapters chapter
      set landmark_id = location.legacy_uuid::text
      from public.locations location
      where chapter.landmark_id = location.id::text;
    end if;

    select constraint_name into primary_key_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'locations'
      and constraint_type = 'PRIMARY KEY';

    if primary_key_name is not null then
      execute format('alter table public.locations drop constraint %I', primary_key_name);
    end if;

    alter table public.locations rename column id to legacy_id;
    alter table public.locations rename column legacy_uuid to id;
    alter table public.locations alter column id set default gen_random_uuid();
    alter table public.locations alter column id set not null;
    alter table public.locations add primary key (id);
  end if;
end $$;
