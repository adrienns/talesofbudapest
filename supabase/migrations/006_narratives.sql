-- Custom AI-generated walking narratives and their chapter stops.

create table if not exists public.narratives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  user_prompt text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.narrative_chapters (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives(id) on delete cascade,
  chapter_index int not null,
  title text not null,
  lat double precision not null,
  lng double precision not null,
  script text not null,
  audio_url text,
  landmark_id text,
  image_url text,
  created_at timestamptz default now()
);

create index if not exists narrative_chapters_narrative_id_idx
  on public.narrative_chapters (narrative_id, chapter_index);

alter table public.narratives enable row level security;
alter table public.narrative_chapters enable row level security;

drop policy if exists "Public read narratives" on public.narratives;
create policy "Public read narratives"
  on public.narratives for select
  using (true);

drop policy if exists "Public read narrative chapters" on public.narrative_chapters;
create policy "Public read narrative chapters"
  on public.narrative_chapters for select
  using (true);
