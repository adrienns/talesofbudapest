-- Hybrid search over the canonical knowledge graph: Postgres full-text search
-- (tsvector/tsquery) + trigram similarity (pg_trgm) + pgvector cosine
-- similarity, fused with reciprocal rank fusion (RRF). See
-- docs/VECTOR_DB_IMPROVEMENTS.md technique #2. Keyword search catches proper
-- nouns and dates embeddings blur; trigram survives OCR-mangled Hungarian.
-- RRF is rank-based so the three arms' incompatible score scales never need
-- reconciling. This never runs at page-render time — only from the private
-- resolver/retrieval tooling, so it is service_role-only like
-- match_kg_entity_candidates (015), not security definer like the public
-- chronicle RPC.
--
-- 'simple' text search config is deliberate, not an oversight: our corpus is
-- mixed Hungarian/English proper nouns ("Förster", "Dohány utca"), and the
-- 'english' config's stemmer would mangle or misfold those tokens.

create extension if not exists pg_trgm;

-- Expression GIN indexes for FTS. Postgres allows indexing
-- to_tsvector(<constant config>, <column>) directly (the config argument is
-- a literal, not read from the row), so no generated column is needed.
create index if not exists kg_claims_statement_en_fts_idx
  on public.kg_claims using gin (to_tsvector('simple', statement_en));

create index if not exists kg_entity_aliases_alias_fts_idx
  on public.kg_entity_aliases using gin (to_tsvector('simple', alias));

-- Trigram index for OCR/typo-tolerant fuzzy alias matching. Indexed on
-- normalized_alias (canonicalized at write time by lib/kgNormalize.js's
-- normalizeLocationName -- lowercased, diacritic-stripped, and with
-- Hungarian/English generic terms like "utca"/"street" folded onto the same
-- token) rather than raw alias. Query text must be run through the same
-- normalizeLocationName in JS before calling these RPCs (see
-- lib/kgHybridSearch.js), or the trigram arm compares apples to oranges.
create index if not exists kg_entity_aliases_normalized_alias_trgm_idx
  on public.kg_entity_aliases using gin (normalized_alias gin_trgm_ops);

-- Hybrid search over kg_claims: FTS (statement_en) + trigram (subject
-- entity's aliases) + vector (claim embedding), fused with RRF. A null
-- query_embedding degrades gracefully to keyword-only fusion (the vector arm
-- CTE filters on "query_embedding is not null" and simply returns zero
-- rows). RRF sums 1/(rrf_k + rank) per arm and ignores raw per-arm scores,
-- so ts_rank/similarity/cosine-distance scales never need reconciling.
create or replace function public.match_kg_claims_hybrid(
  query_text text,
  query_embedding vector(1536),
  match_count integer default 20,
  rrf_k integer default 60
)
returns table (
  claim_id uuid,
  statement_en text,
  subject_entity_id uuid,
  rrf_score double precision,
  fts_rank integer,
  trgm_rank integer,
  vector_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with fts_scored as (
    select
      c.id as claim_id,
      ts_rank(to_tsvector('simple', c.statement_en), websearch_to_tsquery('simple', query_text)) as score
    from public.kg_claims c
    where c.review_status <> 'rejected'
      and query_text is not null
      and to_tsvector('simple', c.statement_en) @@ websearch_to_tsquery('simple', query_text)
  ),
  fts_matches as (
    select claim_id, (row_number() over (order by score desc))::integer as rnk
    from fts_scored
    order by score desc
    limit 50
  ),
  trgm_scored as (
    select
      c.id as claim_id,
      max(similarity(a.normalized_alias, lower(query_text))) as score
    from public.kg_claims c
    join public.kg_entity_aliases a on a.entity_id = c.subject_entity_id
    where c.review_status <> 'rejected'
      and a.review_status <> 'rejected'
      and query_text is not null
      and a.normalized_alias % lower(query_text)
    group by c.id
  ),
  trgm_matches as (
    select claim_id, (row_number() over (order by score desc))::integer as rnk
    from trgm_scored
    order by score desc
    limit 50
  ),
  vector_scored as (
    select
      c.id as claim_id,
      c.embedding <=> query_embedding as distance
    from public.kg_claims c
    where c.review_status <> 'rejected'
      and query_embedding is not null
      and c.embedding is not null
  ),
  vector_matches as (
    select claim_id, (row_number() over (order by distance))::integer as rnk
    from vector_scored
    order by distance
    limit 50
  ),
  fused as (
    select
      coalesce(f.claim_id, t.claim_id, v.claim_id) as claim_id,
      (coalesce(1.0 / (rrf_k + f.rnk), 0)
        + coalesce(1.0 / (rrf_k + t.rnk), 0)
        + coalesce(1.0 / (rrf_k + v.rnk), 0))::double precision as rrf_score,
      f.rnk as fts_rank,
      t.rnk as trgm_rank,
      v.rnk as vector_rank
    from fts_matches f
    full outer join trgm_matches t on t.claim_id = f.claim_id
    full outer join vector_matches v on v.claim_id = coalesce(f.claim_id, t.claim_id)
  )
  select
    c.id as claim_id,
    c.statement_en,
    c.subject_entity_id,
    fused.rrf_score,
    fused.fts_rank,
    fused.trgm_rank,
    fused.vector_rank
  from fused
  join public.kg_claims c on c.id = fused.claim_id
  order by fused.rrf_score desc, c.id
  limit greatest(match_count, 1);
$$;

-- Hybrid search over kg_entities via kg_entity_aliases: FTS (alias) +
-- trigram (normalized_alias) + vector (alias embedding, best alias per
-- entity), fused with RRF. Mirrors match_kg_entity_candidates' "best alias
-- per entity via row_number() partitioned by entity_id" pattern for the
-- vector arm; that function is left untouched.
create or replace function public.match_kg_entities_hybrid(
  query_text text,
  query_embedding vector(1536),
  match_count integer default 20,
  rrf_k integer default 60
)
returns table (
  entity_id uuid,
  canonical_name_en text,
  rrf_score double precision,
  fts_rank integer,
  trgm_rank integer,
  vector_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with fts_scored as (
    select
      a.entity_id,
      max(ts_rank(to_tsvector('simple', a.alias), websearch_to_tsquery('simple', query_text))) as score
    from public.kg_entity_aliases a
    join public.kg_entities e on e.id = a.entity_id
    where a.review_status <> 'rejected'
      and e.review_status <> 'rejected'
      and query_text is not null
      and to_tsvector('simple', a.alias) @@ websearch_to_tsquery('simple', query_text)
    group by a.entity_id
  ),
  fts_matches as (
    select entity_id, (row_number() over (order by score desc))::integer as rnk
    from fts_scored
    order by score desc
    limit 50
  ),
  trgm_scored as (
    select
      a.entity_id,
      max(similarity(a.normalized_alias, lower(query_text))) as score
    from public.kg_entity_aliases a
    join public.kg_entities e on e.id = a.entity_id
    where a.review_status <> 'rejected'
      and e.review_status <> 'rejected'
      and query_text is not null
      and a.normalized_alias % lower(query_text)
    group by a.entity_id
  ),
  trgm_matches as (
    select entity_id, (row_number() over (order by score desc))::integer as rnk
    from trgm_scored
    order by score desc
    limit 50
  ),
  vector_scored as (
    select
      ranked.entity_id,
      ranked.distance,
      row_number() over (partition by ranked.entity_id order by ranked.distance) as alias_rank
    from (
      select a.entity_id, a.embedding <=> query_embedding as distance
      from public.kg_entity_aliases a
      join public.kg_entities e on e.id = a.entity_id
      where a.review_status <> 'rejected'
        and e.review_status <> 'rejected'
        and query_embedding is not null
        and a.embedding is not null
    ) ranked
  ),
  vector_matches as (
    select entity_id, (row_number() over (order by distance))::integer as rnk
    from vector_scored
    where alias_rank = 1
    order by distance
    limit 50
  ),
  fused as (
    select
      coalesce(f.entity_id, t.entity_id, v.entity_id) as entity_id,
      (coalesce(1.0 / (rrf_k + f.rnk), 0)
        + coalesce(1.0 / (rrf_k + t.rnk), 0)
        + coalesce(1.0 / (rrf_k + v.rnk), 0))::double precision as rrf_score,
      f.rnk as fts_rank,
      t.rnk as trgm_rank,
      v.rnk as vector_rank
    from fts_matches f
    full outer join trgm_matches t on t.entity_id = f.entity_id
    full outer join vector_matches v on v.entity_id = coalesce(f.entity_id, t.entity_id)
  )
  select
    e.id as entity_id,
    e.canonical_name_en,
    fused.rrf_score,
    fused.fts_rank,
    fused.trgm_rank,
    fused.vector_rank
  from fused
  join public.kg_entities e on e.id = fused.entity_id
  order by fused.rrf_score desc, e.id
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_kg_claims_hybrid(text, vector, integer, integer) from public, anon, authenticated;
revoke all on function public.match_kg_entities_hybrid(text, vector, integer, integer) from public, anon, authenticated;
grant execute on function public.match_kg_claims_hybrid(text, vector, integer, integer) to service_role;
grant execute on function public.match_kg_entities_hybrid(text, vector, integer, integer) to service_role;
