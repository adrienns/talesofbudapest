-- Safe additive migration for existing locations tables (integer or uuid id).
alter table public.locations add column if not exists audio_url text;
