create table if not exists public.location_translations (
  location_id uuid not null references public.locations(id) on delete cascade,
  locale text not null check (locale in ('hu', 'en')),
  name text not null,
  story_prompt text not null default '',
  audio_url text,
  audio_script text,
  updated_at timestamptz default now(),
  primary key (location_id, locale)
);

insert into public.location_translations (location_id, locale, name, story_prompt, audio_url)
select
  id,
  'en',
  name,
  story_prompt,
  case when audio_url like '%-tour-hu.mp3' then null else audio_url end
from public.locations
on conflict do nothing;

insert into public.location_translations (location_id, locale, name, story_prompt, audio_url)
select id, 'hu', name, story_prompt, null
from public.locations
where source in ('muemlekem', 'budapest100')
on conflict do nothing;

update public.location_translations t
set audio_url = l.audio_url
from public.locations l
where t.location_id = l.id
  and t.locale = 'hu'
  and l.audio_url like '%-tour-hu.mp3';

alter table public.location_translations enable row level security;

drop policy if exists "Public read location_translations" on public.location_translations;

create policy "Public read location_translations"
  on public.location_translations for select
  using (true);
