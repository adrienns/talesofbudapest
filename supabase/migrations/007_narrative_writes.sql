-- Allow server-side narrative creation via anon key when service role is unavailable (dev/MVP).
-- API routes should prefer SUPABASE_SERVICE_ROLE_KEY in production.

drop policy if exists "Public insert narratives" on public.narratives;
create policy "Public insert narratives"
  on public.narratives for insert
  with check (true);

drop policy if exists "Public insert narrative chapters" on public.narrative_chapters;
create policy "Public insert narrative chapters"
  on public.narrative_chapters for insert
  with check (true);
