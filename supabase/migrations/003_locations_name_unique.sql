-- Required for seed upsert onConflict: 'name'
create unique index if not exists locations_name_key on public.locations (name);
