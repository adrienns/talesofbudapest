-- Adds the `organisation` entity kind and a metadata channel for auto-created
-- "needs research" placeholder entities. Placeholders are relation endpoints
-- that name a real entity the extraction never catalogued as its own record;
-- they are created flagged + pending so the private staging/admin graph can
-- draw the relation today and a research pass can confirm/enrich/reject them
-- later. This migration does not create canonical kg_entities/kg_edges and
-- does not approve or publish anything.

create table if not exists public.kg_organisations (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_sources(id) on delete cascade,
  name_key text not null,
  canonical_name_en text not null,
  source_name_hu text,
  org_kind text,
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  first_mention_id uuid references public.kg_mentions(id) on delete set null,
  resolution_status text not null default 'pending' check (resolution_status in ('pending', 'resolved', 'rejected', 'quarantined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, name_key)
);
create index if not exists kg_organisations_source_idx on public.kg_organisations (source_id, resolution_status);

-- Placeholder/provenance metadata channel on the existing staged entity tables
-- (e.g. {"origin":"relation_endpoint","needs_research":true,"auto_created":true}).
alter table public.kg_locations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.kg_people    add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.kg_events    add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Organisation endpoints on staged relations, mirroring the location/person/event FKs.
alter table public.kg_staged_relations add column if not exists subject_organisation_id uuid references public.kg_organisations(id) on delete set null;
alter table public.kg_staged_relations add column if not exists object_organisation_id  uuid references public.kg_organisations(id) on delete set null;

-- Allow 'organisation' as a relation endpoint kind (drop+add keeps this idempotent).
alter table public.kg_staged_relations drop constraint if exists kg_staged_relations_subject_kind_check;
alter table public.kg_staged_relations add  constraint kg_staged_relations_subject_kind_check check (subject_kind in ('location', 'person', 'event', 'organisation', 'unknown'));
alter table public.kg_staged_relations drop constraint if exists kg_staged_relations_object_kind_check;
alter table public.kg_staged_relations add  constraint kg_staged_relations_object_kind_check check (object_kind in ('location', 'person', 'event', 'organisation', 'unknown'));
