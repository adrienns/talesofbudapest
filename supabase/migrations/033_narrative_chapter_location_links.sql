-- Dual-write chapter links while legacy clients still read landmark_id.

alter table public.narrative_chapters
  add column if not exists location_id uuid references public.locations(id) on delete restrict,
  add column if not exists location_candidate_id uuid references public.location_candidates(id) on delete set null,
  add column if not exists image_attribution jsonb;

update public.narrative_chapters chapter
set location_id = location.id
from public.locations location
where chapter.location_id is null
  and chapter.landmark_id is not null
  and chapter.landmark_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and location.id = chapter.landmark_id::uuid;

create index if not exists narrative_chapters_location_id_idx
  on public.narrative_chapters (location_id);
create index if not exists narrative_chapters_location_candidate_id_idx
  on public.narrative_chapters (location_candidate_id);
