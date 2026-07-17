-- Legacy policy migration. Migration 023 removes anonymous writes once
-- visitor-owned private narratives are introduced.

drop policy if exists "Public insert narratives" on public.narratives;
create policy "Public insert narratives"
  on public.narratives for insert
  with check (true);

drop policy if exists "Public insert narrative chapters" on public.narrative_chapters;
create policy "Public insert narrative chapters"
  on public.narrative_chapters for insert
  with check (true);
