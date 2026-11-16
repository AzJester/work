-- Register the Solution Architect assistant with the existing fail-closed,
-- per-user AI quota function. This replaces only the function body; the usage
-- table and its owner-read policy remain unchanged.
create or replace function public.consume_ai_quota(
  p_function text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_function text := lower(btrim(coalesce(p_function, '')));
  v_window_start timestamptz;
  v_used integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'consume_ai_quota requires an authenticated user';
  end if;
  if v_function not in (
    'weekly-summary',
    'extract-tasks',
    'task-actions',
    'plan-day',
    'build-roadmap',
    'roadmap-summary',
    'solution-assist'
  ) then
    raise exception using errcode = '22023', message = 'p_function is not an approved AI endpoint';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'p_limit must be between 1 and 1000';
  end if;
  if p_window_seconds is null or p_window_seconds not in (60, 300, 900, 3600, 21600, 86400) then
    raise exception using errcode = '22023', message = 'p_window_seconds must use an approved quota window';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.ai_usage as usage (
    user_id, function_name, window_seconds, window_start, used, updated_at
  ) values (
    v_user_id, v_function, p_window_seconds, v_window_start, 1, clock_timestamp()
  )
  on conflict (user_id, function_name, window_seconds, window_start) do update
    set used = usage.used + 1,
        updated_at = clock_timestamp()
    where usage.used < p_limit
  returning usage.used into v_used;

  delete from public.ai_usage
   where user_id = v_user_id
     and window_start < clock_timestamp() - interval '90 days';

  return v_used is not null;
end;
$$;

revoke all on function public.consume_ai_quota(text, integer, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated;

comment on function public.consume_ai_quota(text, integer, integer) is
  'Consumes one fixed-window, per-user allowance for an approved AI Edge Function.';
