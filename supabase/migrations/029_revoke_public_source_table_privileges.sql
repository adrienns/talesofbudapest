-- RLS denies writes without policies, but remove legacy table grants as well.
-- This makes source-bearing tables deny-by-default at both permission layers.
revoke all privileges on table public.locations from anon, authenticated;
revoke all privileges on table public.location_translations from anon, authenticated;
revoke all privileges on table public.location_audio_variants from anon, authenticated;

grant select, insert, update, delete on table public.locations to service_role;
grant select, insert, update, delete on table public.location_translations to service_role;
grant select, insert, update, delete on table public.location_audio_variants to service_role;
