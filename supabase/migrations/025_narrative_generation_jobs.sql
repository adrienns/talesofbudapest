-- Durable, owner-scoped queue for long-running AI and TTS tour generation.

create table if not exists public.narrative_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  idempotency_key text not null,
  request_body jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  stage text not null default 'queued',
  progress_current integer not null default 0,
  progress_total integer not null default 0,
  narrative_id uuid references public.narratives(id) on delete set null,
  attempt_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists narrative_generation_jobs_queue_idx
  on public.narrative_generation_jobs (status, updated_at);

alter table public.narrative_generation_jobs enable row level security;

create or replace function public.claim_narrative_generation_job(p_job_id uuid)
returns setof public.narrative_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.narrative_generation_jobs
  set status = 'running',
      stage = 'planning',
      attempt_count = attempt_count + 1,
      error_message = null,
      updated_at = now()
  where id = p_job_id
    and attempt_count < 3
    and (
      status = 'queued'
      or (status = 'running' and updated_at < now() - interval '10 minutes')
    )
  returning *;
end;
$$;

revoke all on table public.narrative_generation_jobs from public, anon, authenticated;
revoke all on function public.claim_narrative_generation_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_narrative_generation_job(uuid) to service_role;

