alter table public.locations
  add column if not exists source_material text,
  add column if not exists history_depth text check (history_depth in ('thin', 'standard', 'rich'));

alter table public.location_translations
  add column if not exists historical_narrative text;

create table if not exists public.location_audio_variants (
  location_id uuid not null references public.locations(id) on delete cascade,
  locale text not null check (locale in ('hu', 'en')),
  style_id text not null check (style_id in ('easy', 'storyteller', 'deep-dive')),
  audio_script text,
  audio_url text,
  updated_at timestamptz default now(),
  primary key (location_id, locale, style_id)
);

update public.locations
set source_material = story_prompt
where coalesce(source_material, '') = ''
  and coalesce(story_prompt, '') <> '';

update public.locations
set history_depth = case
  when length(coalesce(source_material, '')) < 400 then 'thin'
  when length(coalesce(source_material, '')) < 1500 then 'standard'
  else 'rich'
end
where history_depth is null;

alter table public.location_audio_variants enable row level security;

drop policy if exists "Public read location_audio_variants" on public.location_audio_variants;

create policy "Public read location_audio_variants"
  on public.location_audio_variants for select
  using (true);
