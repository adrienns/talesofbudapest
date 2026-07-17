-- Server-owned route previews. The browser receives display data, but never
-- sends generated scripts or the assembled LLM prompt back for synthesis.
create table if not exists public.narrative_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  payload jsonb not null,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists narrative_drafts_owner_expiry_idx
  on public.narrative_drafts (owner_id, expires_at);

alter table public.narrative_drafts enable row level security;
revoke all on table public.narrative_drafts from public, anon, authenticated;
