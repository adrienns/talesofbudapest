-- Add grounded AI Guide chat to the durable visitor/IP quota system.
create or replace function public.consume_expensive_request(
  p_actor_key text,
  p_action text,
  p_scope text
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  base_window_limit integer;
  base_daily_limit integer;
  window_limit integer;
  daily_limit integer;
  recent_count integer;
  daily_count integer;
  oldest_recent timestamptz;
begin
  if length(p_actor_key) < 8 or p_scope not in ('visitor', 'ip') then
    raise exception 'Invalid rate-limit identity';
  end if;

  select x.window_limit, x.daily_limit
    into base_window_limit, base_daily_limit
  from (values
    ('tour_plan', 6, 20),
    ('tour_replace', 10, 30),
    ('tour_generate', 3, 8),
    ('landmark_audio', 20, 80),
    ('walking_route', 12, 120),
    ('guide_chat', 12, 60)
  ) as x(action, window_limit, daily_limit)
  where x.action = p_action;

  if base_window_limit is null then
    raise exception 'Unknown expensive action';
  end if;

  window_limit := base_window_limit * case when p_scope = 'ip' then 4 else 1 end;
  daily_limit := base_daily_limit * case when p_scope = 'ip' then 4 else 1 end;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_key || ':' || p_action, 0));

  select count(*), min(created_at)
    into recent_count, oldest_recent
  from public.expensive_request_events
  where actor_key = p_actor_key
    and action = p_action
    and created_at > now() - interval '10 minutes';

  if recent_count >= window_limit then
    return query select false, greatest(
      1,
      ceil(extract(epoch from (oldest_recent + interval '10 minutes' - now())))::integer
    );
    return;
  end if;

  select count(*)
    into daily_count
  from public.expensive_request_events
  where actor_key = p_actor_key
    and action = p_action
    and created_at > now() - interval '24 hours';

  if daily_count >= daily_limit then
    return query select false, 3600;
    return;
  end if;

  insert into public.expensive_request_events (actor_key, action)
  values (p_actor_key, p_action);

  return query select true, 0;
end;
$$;

revoke all on function public.consume_expensive_request(text, text, text) from public, anon, authenticated;
grant execute on function public.consume_expensive_request(text, text, text) to service_role;
