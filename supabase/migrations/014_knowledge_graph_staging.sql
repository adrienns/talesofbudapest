-- Private staging knowledge graph. Nothing in these tables is published to
-- public.locations until it has passed source, entity, and claim review.

create table if not exists public.kg_sources (
  id text primary key,
  title text not null,
  author text,
  source_url text not null,
  license text not null,
  license_verdict text not null check (license_verdict in ('green', 'yellow', 'red')),
  attribution text not null,
  license_evidence_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.kg_pages (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_sources(id) on delete cascade,
  volume text not null,
  page_number integer not null check (page_number > 0),
  page_ref text not null,
  raw_text text not null,
  status text not null default 'pending' check (status in ('pending', 'extracted', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, volume, page_number),
  unique (source_id, page_ref)
);

create table if not exists public.kg_mentions (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_sources(id) on delete cascade,
  source_window_id text not null,
  payload jsonb not null,
  model text,
  prompt_version text,
  extraction_usage jsonb,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected', 'quarantined')),
  extracted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, source_window_id)
);

create table if not exists public.kg_mention_pages (
  mention_id uuid not null references public.kg_mentions(id) on delete cascade,
  page_id uuid not null references public.kg_pages(id) on delete cascade,
  primary key (mention_id, page_id)
);

create table if not exists public.kg_locations (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_sources(id) on delete cascade,
  name_key text not null,
  name_en text not null,
  source_name_hu text,
  address_en text,
  source_address_hu text,
  location_kind text,
  evidence jsonb not null default '{}'::jsonb,
  first_mention_id uuid references public.kg_mentions(id) on delete set null,
  resolution_status text not null default 'pending' check (resolution_status in ('pending', 'resolved', 'rejected', 'quarantined')),
  public_location_id uuid references public.locations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, name_key)
);

create table if not exists public.kg_people (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_sources(id) on delete cascade,
  name_key text not null,
  canonical_name_en text not null,
  source_name_hu text,
  role_en text,
  evidence jsonb not null default '{}'::jsonb,
  is_public_figure boolean not null default false,
  resolution_status text not null default 'pending' check (resolution_status in ('pending', 'resolved', 'rejected', 'quarantined')),
  wikidata_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, name_key)
);

create table if not exists public.kg_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_sources(id) on delete cascade,
  event_key text not null,
  title_en text not null,
  statement_en text not null,
  claim_type text,
  temporal_status text not null default 'historical_fact' check (temporal_status in ('historical_fact', 'as_described_in_1939', 'planned_as_of_1939')),
  importance integer check (importance between 1 and 5),
  evidence jsonb not null default '{}'::jsonb,
  first_mention_id uuid references public.kg_mentions(id) on delete set null,
  resolution_status text not null default 'pending' check (resolution_status in ('pending', 'resolved', 'rejected', 'quarantined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, event_key)
);

create table if not exists public.kg_facts (
  id uuid primary key default gen_random_uuid(),
  mention_id uuid not null references public.kg_mentions(id) on delete cascade,
  location_id uuid references public.kg_locations(id) on delete set null,
  statement_en text not null,
  claim_type text,
  temporal_status text not null default 'historical_fact' check (temporal_status in ('historical_fact', 'as_described_in_1939', 'planned_as_of_1939')),
  importance integer check (importance between 1 and 5),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'active', 'disputed', 'quarantined', 'rejected')),
  created_at timestamptz not null default now(),
  unique (mention_id, statement_en)
);

create table if not exists public.kg_staged_relations (
  id uuid primary key default gen_random_uuid(),
  mention_id uuid not null references public.kg_mentions(id) on delete cascade,
  subject_text_en text not null,
  subject_kind text not null default 'unknown' check (subject_kind in ('location', 'person', 'event', 'unknown')),
  predicate text not null,
  object_text_en text not null,
  object_kind text not null default 'unknown' check (object_kind in ('location', 'person', 'event', 'unknown')),
  statement_en text,
  temporal_status text not null default 'historical_fact' check (temporal_status in ('historical_fact', 'as_described_in_1939', 'planned_as_of_1939')),
  importance integer check (importance between 1 and 5),
  evidence jsonb not null default '{}'::jsonb,
  subject_location_id uuid references public.kg_locations(id) on delete set null,
  subject_person_id uuid references public.kg_people(id) on delete set null,
  subject_event_id uuid references public.kg_events(id) on delete set null,
  object_location_id uuid references public.kg_locations(id) on delete set null,
  object_person_id uuid references public.kg_people(id) on delete set null,
  object_event_id uuid references public.kg_events(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected', 'quarantined')),
  created_at timestamptz not null default now(),
  unique (mention_id, subject_text_en, predicate, object_text_en)
);

create index if not exists kg_pages_source_status_idx on public.kg_pages (source_id, status, page_number);
create index if not exists kg_mentions_status_idx on public.kg_mentions (source_id, status);
create index if not exists kg_locations_name_idx on public.kg_locations (name_en);
create index if not exists kg_people_name_idx on public.kg_people (canonical_name_en);
create index if not exists kg_events_title_idx on public.kg_events (title_en);
create index if not exists kg_facts_location_idx on public.kg_facts (location_id);
create index if not exists kg_relations_status_idx on public.kg_staged_relations (status);

alter table public.kg_sources enable row level security;
alter table public.kg_pages enable row level security;
alter table public.kg_mentions enable row level security;
alter table public.kg_mention_pages enable row level security;
alter table public.kg_locations enable row level security;
alter table public.kg_people enable row level security;
alter table public.kg_events enable row level security;
alter table public.kg_facts enable row level security;
alter table public.kg_staged_relations enable row level security;
