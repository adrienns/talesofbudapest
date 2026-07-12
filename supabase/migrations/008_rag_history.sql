-- Budapest history RAG schema (pgvector)

create extension if not exists vector;

create table if not exists public.historical_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  latitude double precision,
  longitude double precision,
  district text,
  era_tags text[] default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.historical_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  era text,
  start_year int,
  end_year int,
  location_id uuid references public.historical_locations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  historical_location_id uuid references public.historical_locations(id) on delete set null,
  historical_event_id uuid references public.historical_events(id) on delete set null,
  created_at timestamptz default now(),
  unique (source_id, chunk_index)
);

create index if not exists document_chunks_source_id_idx
  on public.document_chunks (source_id);

create index if not exists document_chunks_metadata_idx
  on public.document_chunks using gin (metadata);

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.historical_locations enable row level security;
alter table public.historical_events enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "Public read historical locations" on public.historical_locations;
create policy "Public read historical locations"
  on public.historical_locations for select
  using (true);

drop policy if exists "Public read historical events" on public.historical_events;
create policy "Public read historical events"
  on public.historical_events for select
  using (true);

drop policy if exists "Public read document chunks" on public.document_chunks;
create policy "Public read document chunks"
  on public.document_chunks for select
  using (true);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  source_id text,
  chunk_index int,
  chunk_text text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    dc.id,
    dc.source_id,
    dc.chunk_index,
    dc.chunk_text,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and (filter = '{}'::jsonb or dc.metadata @> filter)
  order by dc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
