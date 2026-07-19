-- Exact-first alias matching for the entity resolver. 015 gave the resolver
-- a vector shortlist (match_kg_entity_candidates); this migration gives it a
-- deterministic exact lookup by normalized_alias, plus the provenance and
-- ambiguity signal cli/resolve-kg-locations.js and lib/kgAliasGuard.js need
-- to decide whether an exact match is safe to auto-link.

-- source records where an alias row came from: the promotion pipeline
-- (kgPromotion.js aliasesFor), the public.locations seed pass
-- (kgPublicLocationSeeder.js), the offline lexicon expansion CLI
-- (expand-kg-aliases.js), a Wikidata import, or an LLM-generated
-- translation. Deliberately no CHECK constraint: this is a small, evolving
-- set of producer tags, not a closed domain -- a CHECK would turn every new
-- alias source into a migration instead of a config/code change.
alter table public.kg_entity_aliases add column if not exists source text;

comment on column public.kg_entity_aliases.source is
  'Provenance tag for how this alias row was produced. Expected values (not '
  'enforced by a CHECK -- see migration comment): promotion, public_seed, '
  'lexicon, wikidata, llm_translation.';

-- Deterministic exact-alias lookup for the private resolver. Checked before
-- (and independently of) the vector shortlist in match_kg_entity_candidates
-- below: an exact normalized_alias hit on an approved alias is a much
-- stronger identity signal than any embedding similarity score.
--
-- query_normalized MUST be computed in JS by lib/kgNormalize.js's
-- normalizeLocationName before calling this function -- this SQL never
-- re-implements normalization, it only compares already-normalized text
-- against the already-normalized normalized_alias column.
--
-- ambiguous is true when the same normalized_alias is an approved alias of
-- more than one distinct entity (e.g. two different landmarks both carry an
-- approved alias "Citadella"). Callers should treat an ambiguous result as
-- unsafe to auto-link even though it is an exact match -- see
-- lib/kgAliasGuard.js's suppressAmbiguousExactMatches, which enforces this
-- same rule in JS for the resolver's own alias-ownership map.
create or replace function public.match_kg_entity_exact(
  query_normalized text,
  query_kind text default null
)
returns table (
  entity_id uuid,
  entity_kind text,
  canonical_name_en text,
  public_location_id uuid,
  matched_alias text,
  alias_kind text,
  ambiguous boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with matches as (
    select
      e.id as entity_id,
      e.entity_kind,
      e.canonical_name_en,
      e.public_location_id,
      a.alias as matched_alias,
      a.alias_kind
    from public.kg_entity_aliases a
    join public.kg_entities e on e.id = a.entity_id
    where a.normalized_alias = query_normalized
      and a.review_status = 'approved'
      and e.review_status <> 'rejected'
      and (query_kind is null or e.entity_kind = query_kind)
  )
  select
    matches.entity_id,
    matches.entity_kind,
    matches.canonical_name_en,
    matches.public_location_id,
    matches.matched_alias,
    matches.alias_kind,
    (select count(distinct candidate.entity_id) from matches candidate) > 1 as ambiguous
  from matches
  order by matches.entity_id, matches.alias_kind, matches.matched_alias;
$$;

-- Candidate generation for the private resolver. Exact matching lives in
-- match_kg_entity_exact above; this function is the vector shortlist only,
-- for the cases an exact alias lookup misses (OCR noise, paraphrase,
-- translation). Body is unchanged from 015_knowledge_graph_canonical.sql.
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

revoke all on function public.match_kg_entity_exact(text, text) from public, anon, authenticated;
grant execute on function public.match_kg_entity_exact(text, text) to service_role;
