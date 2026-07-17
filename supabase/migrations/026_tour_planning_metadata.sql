-- Compact, reusable metadata for deterministic tour construction.  Full source
-- material remains on locations and is loaded only after a route is approved.

alter table public.locations
  add column if not exists planning_summary text,
  add column if not exists tour_eligible boolean not null default true,
  add column if not exists typical_visit_minutes smallint not null default 3,
  add column if not exists content_version integer not null default 1;

create table if not exists public.tour_categories (
  id text primary key,
  active boolean not null default true,
  sort_order smallint not null
);

insert into public.tour_categories (id, sort_order) values
  ('architecture', 10),
  ('local-life', 20),
  ('power-history', 30),
  ('jewish-budapest', 40),
  ('arts-culture', 50),
  ('food-nightlife', 60),
  ('danube-engineering', 70),
  ('legends-mysteries', 80)
on conflict (id) do update set sort_order = excluded.sort_order;

create table if not exists public.location_tour_facets (
  location_id uuid not null references public.locations(id) on delete cascade,
  category_id text not null references public.tour_categories(id),
  relevance_score smallint not null check (relevance_score between 0 and 100),
  evidence_summary text not null,
  reviewed boolean not null default false,
  content_version integer not null default 1,
  primary key (location_id, category_id)
);

create index if not exists location_tour_facets_category_score_idx
  on public.location_tour_facets (category_id, relevance_score desc);

create index if not exists locations_tour_coordinates_idx
  on public.locations (latitude, longitude)
  where tour_eligible = true;

create table if not exists public.historical_context_blocks (
  id uuid primary key default gen_random_uuid(),
  context_key text not null unique,
  year_start integer,
  year_end integer,
  sensitivity_level text,
  source_references jsonb not null default '[]'::jsonb,
  content_version integer not null default 1,
  reviewed boolean not null default false
);

create table if not exists public.historical_context_translations (
  context_block_id uuid not null references public.historical_context_blocks(id) on delete cascade,
  locale text not null check (locale in ('en', 'hu')),
  title text not null,
  teaser text not null,
  script text not null,
  estimated_seconds integer not null check (estimated_seconds > 0),
  primary key (context_block_id, locale)
);

create table if not exists public.historical_context_audio (
  context_block_id uuid not null references public.historical_context_blocks(id) on delete cascade,
  locale text not null check (locale in ('en', 'hu')),
  content_version integer not null,
  script_hash text not null,
  audio_url text not null,
  created_at timestamptz not null default now(),
  primary key (context_block_id, locale, content_version)
);

alter table public.location_audio_variants
  add column if not exists content_version integer,
  add column if not exists script_hash text;
