-- Canonical place identity and normalized supporting records.
-- Existing map rows remain published and tour eligible.

alter table public.locations
  add column if not exists slug text,
  add column if not exists place_kind text,
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists publication_status text not null default 'published';

update public.locations
set slug = coalesce(nullif(lower(source), ''), 'location')
  || '-' || left(replace(id::text, '-', ''), 12)
where slug is null or btrim(slug) = '';

update public.locations
set place_kind = case
  when landmark_type in ('house', 'building', 'iconic') then 'building'
  when landmark_type = 'monument' then 'monument'
  when landmark_type = 'statue' then 'monument'
  else 'historical_site'
end
where place_kind is null;

alter table public.locations
  alter column slug set not null,
  alter column place_kind set not null,
  alter column tour_eligible set default false;

alter table public.locations drop constraint if exists locations_name_key;
drop index if exists public.locations_name_key;

create unique index if not exists locations_slug_key on public.locations (slug);
create index if not exists locations_name_idx on public.locations (lower(name));
create index if not exists locations_public_tour_idx
  on public.locations (publication_status, tour_eligible)
  where publication_status = 'published' and tour_eligible = true;

do $$ begin
  alter table public.locations add constraint locations_place_kind_check check (
    place_kind in ('building', 'religious_site', 'monument', 'square', 'street', 'bridge', 'venue', 'historical_site')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.locations add constraint locations_lifecycle_status_check check (
    lifecycle_status in ('active', 'demolished', 'ruined', 'relocated')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.locations add constraint locations_publication_status_check check (
    publication_status in ('draft', 'published', 'archived')
  );
exception when duplicate_object then null; end $$;

create table if not exists public.location_aliases (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  locale text,
  alias_kind text not null default 'alternative'
    check (alias_kind in ('primary', 'alternative', 'former', 'multilingual')),
  created_at timestamptz not null default now(),
  unique (location_id, normalized_alias, alias_kind)
);

create index if not exists location_aliases_normalized_idx
  on public.location_aliases (normalized_alias);

create table if not exists public.location_identifiers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  provider text not null,
  external_id text not null,
  source_url text,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists location_identifiers_location_idx
  on public.location_identifiers (location_id);

insert into public.location_identifiers (location_id, provider, external_id)
select id, source, external_id
from public.locations
where source is not null and external_id is not null
on conflict (provider, external_id) do update set location_id = excluded.location_id;

insert into public.location_aliases (location_id, alias, normalized_alias, alias_kind)
select id, name, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), 'primary'
from public.locations
on conflict (location_id, normalized_alias, alias_kind) do nothing;

insert into public.location_aliases (location_id, alias, normalized_alias, locale, alias_kind)
select location_id, name, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), locale, 'multilingual'
from public.location_translations
on conflict (location_id, normalized_alias, alias_kind) do nothing;

create table if not exists public.location_media (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  media_kind text not null default 'image' check (media_kind in ('image', 'video')),
  url text not null,
  alt_text text,
  author text,
  source_url text,
  license text,
  license_url text,
  attribution text,
  sort_order smallint not null default 0,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  commercial_use_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, url)
);

create index if not exists location_media_selection_idx
  on public.location_media (location_id, review_status, commercial_use_allowed, sort_order);

-- Preserve legacy image metadata, but do not automatically approve unknown rights.
insert into public.location_media (location_id, url, sort_order)
select id, image_url, 0
from public.locations
where image_url is not null and btrim(image_url) <> ''
on conflict (location_id, url) do nothing;

create table if not exists public.location_candidates (
  id uuid primary key default gen_random_uuid(),
  proposed_name text not null,
  normalized_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  originating_narrative_id uuid references public.narratives(id) on delete cascade,
  deduplication_result jsonb not null default '{}'::jsonb,
  matched_location_id uuid references public.locations(id) on delete restrict,
  promoted_location_id uuid references public.locations(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'matched', 'promoted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists location_candidates_status_idx
  on public.location_candidates (status, created_at);
create index if not exists location_candidates_origin_idx
  on public.location_candidates (originating_narrative_id);

alter table public.location_aliases enable row level security;
alter table public.location_identifiers enable row level security;
alter table public.location_media enable row level security;
alter table public.location_candidates enable row level security;

drop policy if exists "Public read location aliases" on public.location_aliases;
create policy "Public read location aliases" on public.location_aliases
  for select using (true);

drop policy if exists "Public read location identifiers" on public.location_identifiers;
create policy "Public read location identifiers" on public.location_identifiers
  for select using (true);

drop policy if exists "Public read approved commercial location media" on public.location_media;
create policy "Public read approved commercial location media" on public.location_media
  for select using (review_status = 'approved' and commercial_use_allowed = true);

-- There is deliberately no public policy for the private review queue.
