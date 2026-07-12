create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  latitude double precision not null,
  longitude double precision not null,
  story_prompt text not null,
  audio_url text,
  created_at timestamptz default now()
);

alter table public.locations add column if not exists audio_url text;
alter table public.locations add column if not exists created_at timestamptz default now();

alter table public.locations enable row level security;

drop policy if exists "Public read locations" on public.locations;

create policy "Public read locations"
  on public.locations for select
  using (true);
