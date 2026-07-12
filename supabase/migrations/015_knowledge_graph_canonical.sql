-- Canonical, reviewable knowledge graph built from the private staging tables.
-- Postgres is authoritative. Embeddings suggest candidates; they never resolve
-- identity or publish content without an explicit review decision.

create extension if not exists vector;

create table if not exists public.kg_entities (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('location', 'person', 'event', 'organisation')),
  canonical_name_en text not null,
  description_en text,
  public_location_id uuid references public.locations(id) on delete set null,
  start_year integer,
  end_year integer,
  date_label_en text,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  review_status text not null default 'draft'
    check (review_status in ('draft', 'needs_review', 'approved', 'rejected')),
  publication_status text not null default 'private'
    check (publication_status in ('private', 'public')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_year is null or end_year is null or start_year <= end_year),
  check (public_location_id is null or entity_kind = 'location'),
  check (publication_status = 'private' or review_status = 'approved')
);

create unique index if not exists kg_entities_public_location_key
  on public.kg_entities (public_location_id)
  where public_location_id is not null;

create index if not exists kg_entities_kind_review_idx
  on public.kg_entities (entity_kind, review_status, publication_status);

create index if not exists kg_entities_embedding_hnsw_idx
  on public.kg_entities using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.kg_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.kg_entities(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  language_code text,
  alias_kind text not null default 'name'
    check (alias_kind in ('name', 'former_name', 'translated_name', 'address', 'identifier')),
  embedding vector(1536),
  review_status text not null default 'draft'
    check (review_status in ('draft', 'needs_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (entity_id, normalized_alias, alias_kind)
);

create index if not exists kg_entity_aliases_normalized_idx
  on public.kg_entity_aliases (normalized_alias);

create index if not exists kg_entity_aliases_embedding_hnsw_idx
  on public.kg_entity_aliases using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.kg_edges (
  id uuid primary key default gen_random_uuid(),
  subject_entity_id uuid not null references public.kg_entities(id) on delete cascade,
  predicate text not null,
  object_entity_id uuid not null references public.kg_entities(id) on delete cascade,
  statement_en text,
  start_year integer,
  end_year integer,
  date_label_en text,
  importance smallint not null default 3 check (importance between 1 and 5),
  metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'draft'
    check (review_status in ('draft', 'needs_review', 'approved', 'rejected')),
  publication_status text not null default 'private'
    check (publication_status in ('private', 'public')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_entity_id <> object_entity_id),
  check (start_year is null or end_year is null or start_year <= end_year),
  check (publication_status = 'private' or review_status = 'approved'),
  unique (subject_entity_id, predicate, object_entity_id, start_year)
);

create index if not exists kg_edges_subject_idx
  on public.kg_edges (subject_entity_id, review_status, publication_status);

create index if not exists kg_edges_object_idx
  on public.kg_edges (object_entity_id, review_status, publication_status);

create table if not exists public.kg_claims (
  id uuid primary key default gen_random_uuid(),
  subject_entity_id uuid not null references public.kg_entities(id) on delete cascade,
  statement_en text not null,
  claim_type text,
  start_year integer,
  end_year integer,
  date_label_en text,
  importance smallint not null default 3 check (importance between 1 and 5),
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'draft'
    check (review_status in ('draft', 'needs_review', 'approved', 'rejected')),
  publication_status text not null default 'private'
    check (publication_status in ('private', 'public')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_year is null or end_year is null or start_year <= end_year),
  check (publication_status = 'private' or review_status = 'approved')
);

create index if not exists kg_claims_subject_idx
  on public.kg_claims (subject_entity_id, review_status, publication_status);

create index if not exists kg_claims_embedding_hnsw_idx
  on public.kg_claims using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Evidence is deliberately separate from public-facing claims. raw_excerpt is
-- available to reviewers only and is never selected by the Chronicle RPC.
create table if not exists public.kg_evidence (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.kg_entities(id) on delete cascade,
  edge_id uuid references public.kg_edges(id) on delete cascade,
  claim_id uuid references public.kg_claims(id) on delete cascade,
  source_id text not null references public.kg_sources(id) on delete restrict,
  mention_id uuid references public.kg_mentions(id) on delete set null,
  page_numbers integer[] not null default '{}',
  page_refs text[] not null default '{}',
  public_citation_en text not null,
  public_note_en text,
  raw_excerpt text,
  extraction_model text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(entity_id, edge_id, claim_id) = 1),
  check (array_position(page_numbers, 0) is null)
);

create index if not exists kg_evidence_entity_idx on public.kg_evidence (entity_id);
create index if not exists kg_evidence_edge_idx on public.kg_evidence (edge_id);
create index if not exists kg_evidence_claim_idx on public.kg_evidence (claim_id);
create index if not exists kg_evidence_source_idx on public.kg_evidence (source_id);

alter table public.kg_entities enable row level security;
alter table public.kg_entity_aliases enable row level security;
alter table public.kg_edges enable row level security;
alter table public.kg_claims enable row level security;
alter table public.kg_evidence enable row level security;

-- Candidate generation for the private resolver. Exact aliases should be
-- checked first by normalized_alias; vector similarity supplies the shortlist.
create or replace function public.match_kg_entity_candidates(
  query_embedding vector(1536),
  query_kind text default null,
  match_count integer default 10,
  min_similarity double precision default 0.65
)
returns table (
  entity_id uuid,
  entity_kind text,
  canonical_name_en text,
  public_location_id uuid,
  matched_alias text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ranked.entity_id,
    ranked.entity_kind,
    ranked.canonical_name_en,
    ranked.public_location_id,
    ranked.matched_alias,
    ranked.similarity
  from (
    select
      e.id as entity_id,
      e.entity_kind,
      e.canonical_name_en,
      e.public_location_id,
      a.alias as matched_alias,
      1 - (a.embedding <=> query_embedding) as similarity,
      row_number() over (
        partition by e.id order by a.embedding <=> query_embedding
      ) as alias_rank
    from public.kg_entity_aliases a
    join public.kg_entities e on e.id = a.entity_id
    where a.embedding is not null
      and a.review_status <> 'rejected'
      and e.review_status <> 'rejected'
      and (query_kind is null or e.entity_kind = query_kind)
  ) ranked
  where ranked.alias_rank = 1
    and ranked.similarity >= min_similarity
  order by ranked.similarity desc
  limit greatest(match_count, 1);
$$;

-- Stable app contract for GET /api/locations/:id/chronicle. This function is
-- SECURITY DEFINER so public clients can read the reviewed projection without
-- receiving table access. It returns no raw excerpts, staging payloads, source
-- text, model metadata, or unpublished records.
create or replace function public.get_location_chronicle(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with location_entity as (
    select e.*
    from public.kg_entities e
    where e.public_location_id = p_location_id
      and e.entity_kind = 'location'
      and e.review_status = 'approved'
      and e.publication_status = 'public'
    limit 1
  ),
  public_claims as (
    select
      c.id,
      c.statement_en,
      c.claim_type,
      c.start_year,
      c.end_year,
      c.date_label_en,
      c.importance,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'source_id', ev.source_id,
          'title', s.title,
          'author', s.author,
          'url', s.source_url,
          'license', s.license,
          'pages', ev.page_numbers,
          'page_refs', ev.page_refs,
          'citation', ev.public_citation_en
        ) order by ev.source_id, ev.page_numbers)
        from public.kg_evidence ev
        join public.kg_sources s on s.id = ev.source_id
        where ev.claim_id = c.id
      ), '[]'::jsonb) as citations
    from public.kg_claims c
    join location_entity le on le.id = c.subject_entity_id
    where c.review_status = 'approved'
      and c.publication_status = 'public'
  ),
  connected as (
    select
      edge.id as edge_id,
      edge.predicate,
      edge.statement_en,
      edge.start_year as edge_start_year,
      edge.end_year as edge_end_year,
      edge.date_label_en as edge_date_label_en,
      edge.importance,
      case when edge.subject_entity_id = le.id then 'subject' else 'object' end as location_role,
      other.id as entity_id,
      other.entity_kind,
      other.canonical_name_en,
      other.description_en,
      other.start_year as entity_start_year,
      other.end_year as entity_end_year,
      other.date_label_en as entity_date_label_en,
      other.public_location_id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'source_id', ev.source_id,
          'title', s.title,
          'author', s.author,
          'url', s.source_url,
          'license', s.license,
          'pages', ev.page_numbers,
          'page_refs', ev.page_refs,
          'citation', ev.public_citation_en
        ) order by ev.source_id, ev.page_numbers)
        from public.kg_evidence ev
        join public.kg_sources s on s.id = ev.source_id
        where ev.edge_id = edge.id or ev.entity_id = other.id
      ), '[]'::jsonb) as citations
    from public.kg_edges edge
    join location_entity le
      on le.id in (edge.subject_entity_id, edge.object_entity_id)
    join public.kg_entities other
      on other.id = case
        when edge.subject_entity_id = le.id then edge.object_entity_id
        else edge.subject_entity_id
      end
    where edge.review_status = 'approved'
      and edge.publication_status = 'public'
      and other.review_status = 'approved'
      and other.publication_status = 'public'
  )
  select case when not exists (select 1 from location_entity) then null else
    jsonb_build_object(
      'schema_version', 1,
      'location', (
        select jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'canonical_entity_id', le.id,
          'description', le.description_en
        )
        from location_entity le
        join public.locations l on l.id = le.public_location_id
      ),
      'facts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pc.id,
          'statement', pc.statement_en,
          'type', pc.claim_type,
          'start_year', pc.start_year,
          'end_year', pc.end_year,
          'date_label', pc.date_label_en,
          'importance', pc.importance,
          'citations', pc.citations
        ) order by pc.importance desc, pc.start_year nulls last, pc.id)
        from public_claims pc
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.entity_id,
          'name', c.canonical_name_en,
          'description', c.description_en,
          'relationship', c.predicate,
          'statement', c.statement_en,
          'start_year', coalesce(c.edge_start_year, c.entity_start_year),
          'end_year', coalesce(c.edge_end_year, c.entity_end_year),
          'date_label', coalesce(c.edge_date_label_en, c.entity_date_label_en),
          'importance', c.importance,
          'citations', c.citations
        ) order by coalesce(c.edge_start_year, c.entity_start_year) nulls last, c.importance desc, c.entity_id)
        from connected c where c.entity_kind = 'event'
      ), '[]'::jsonb),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.entity_id,
          'name', c.canonical_name_en,
          'description', c.description_en,
          'relationship', c.predicate,
          'statement', c.statement_en,
          'start_year', c.edge_start_year,
          'end_year', c.edge_end_year,
          'date_label', c.edge_date_label_en,
          'importance', c.importance,
          'citations', c.citations
        ) order by c.importance desc, c.canonical_name_en, c.entity_id)
        from connected c where c.entity_kind = 'person'
      ), '[]'::jsonb),
      'relations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.edge_id,
          'location_role', c.location_role,
          'predicate', c.predicate,
          'statement', c.statement_en,
          'related_entity_id', c.entity_id,
          'related_entity_kind', c.entity_kind,
          'related_entity_name', c.canonical_name_en,
          'related_location_id', c.public_location_id,
          'start_year', c.edge_start_year,
          'end_year', c.edge_end_year,
          'date_label', c.edge_date_label_en,
          'importance', c.importance,
          'citations', c.citations
        ) order by c.importance desc, c.canonical_name_en, c.entity_id)
        from connected c
      ), '[]'::jsonb)
    )
  end;
$$;

-- Public/read-safe projection consumed by the backend. Keeping this as a
-- narrow view gives the API a stable contract while canonical storage evolves.
create or replace view public.kg_location_chronicle
with (security_barrier = true)
as
select
  e.public_location_id as location_id,
  coalesce(ch.payload -> 'facts', '[]'::jsonb) as facts,
  coalesce(ch.payload -> 'events', '[]'::jsonb) as events,
  coalesce(ch.payload -> 'people', '[]'::jsonb) as people,
  coalesce(ch.payload -> 'relations', '[]'::jsonb) as relations,
  greatest(
    e.updated_at,
    coalesce((
      select max(c.updated_at) from public.kg_claims c
      where c.subject_entity_id = e.id
        and c.review_status = 'approved'
        and c.publication_status = 'public'
    ), e.updated_at),
    coalesce((
      select max(edge.updated_at) from public.kg_edges edge
      where e.id in (edge.subject_entity_id, edge.object_entity_id)
        and edge.review_status = 'approved'
        and edge.publication_status = 'public'
    ), e.updated_at)
  ) as updated_at
from public.kg_entities e
cross join lateral (
  select public.get_location_chronicle(e.public_location_id) as payload
) ch
where e.entity_kind = 'location'
  and e.public_location_id is not null
  and e.review_status = 'approved'
  and e.publication_status = 'public'
  and ch.payload is not null;

revoke all on public.kg_entities from anon, authenticated;
revoke all on public.kg_entity_aliases from anon, authenticated;
revoke all on public.kg_edges from anon, authenticated;
revoke all on public.kg_claims from anon, authenticated;
revoke all on public.kg_evidence from anon, authenticated;
revoke all on function public.match_kg_entity_candidates(vector, text, integer, double precision) from public, anon, authenticated;
revoke all on function public.get_location_chronicle(uuid) from public;
revoke all on public.kg_location_chronicle from public;
grant execute on function public.get_location_chronicle(uuid) to anon, authenticated, service_role;
grant select on public.kg_location_chronicle to anon, authenticated, service_role;
grant execute on function public.match_kg_entity_candidates(vector, text, integer, double precision) to service_role;
grant select, insert, update, delete on public.kg_entities to service_role;
grant select, insert, update, delete on public.kg_entity_aliases to service_role;
grant select, insert, update, delete on public.kg_edges to service_role;
grant select, insert, update, delete on public.kg_claims to service_role;
grant select, insert, update, delete on public.kg_evidence to service_role;
