-- Source material, prompt text, and generated scripts must never be readable
-- through Supabase's public anon/authenticated roles. Public app reads go
-- through the server's deliberately column-limited API routes instead.

drop policy if exists "Public read locations" on public.locations;
drop policy if exists "Public read location_translations" on public.location_translations;
drop policy if exists "Public read location_audio_variants" on public.location_audio_variants;

revoke select on table public.locations from anon, authenticated;
revoke select on table public.location_translations from anon, authenticated;
revoke select on table public.location_audio_variants from anon, authenticated;

-- Explicitly retain server-side access. The service role is used only in API
-- routes and background jobs, never in browser code.
grant select, insert, update, delete on table public.locations to service_role;
grant select, insert, update, delete on table public.location_translations to service_role;
grant select, insert, update, delete on table public.location_audio_variants to service_role;
