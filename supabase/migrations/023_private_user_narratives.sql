-- Curated tours are public. AI-generated visitor tours are private and are
-- only served by owner-scoped API routes using the service role.

alter table public.narratives
  add column if not exists owner_id uuid;

create index if not exists narratives_owner_created_at_idx
  on public.narratives (owner_id, created_at desc)
  where owner_id is not null and curated_slug is null;

drop policy if exists "Public read narratives" on public.narratives;
drop policy if exists "Public read narrative chapters" on public.narrative_chapters;
drop policy if exists "Public insert narratives" on public.narratives;
drop policy if exists "Public insert narrative chapters" on public.narrative_chapters;
drop policy if exists "Public read curated narratives" on public.narratives;
drop policy if exists "Public read curated narrative chapters" on public.narrative_chapters;

create policy "Public read curated narratives"
  on public.narratives for select
  using (curated_slug is not null);

create policy "Public read curated narrative chapters"
  on public.narrative_chapters for select
  using (
    exists (
      select 1
      from public.narratives
      where narratives.id = narrative_chapters.narrative_id
        and narratives.curated_slug is not null
    )
  );

