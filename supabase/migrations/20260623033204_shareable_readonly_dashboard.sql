-- ============================================================
-- Shareable read-only dashboard.
-- A per-user secret token (in public.shares) unlocks a read-only
-- view of THAT user's data via a SECURITY DEFINER function the
-- anon role may call. No table grants are given to anon; the
-- function is the only door, it is read-only, and it returns a
-- single user's data scoped by the token. Owners can revoke.
-- ============================================================

create table public.shares (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null default '',
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index shares_user_idx on public.shares (user_id) where revoked = false;

alter table public.shares enable row level security;

-- Owners manage only their own share tokens. Anon gets no table access at all.
create policy "shares_select_own" on public.shares
  for select using (auth.uid() = user_id);
create policy "shares_insert_own" on public.shares
  for insert with check (auth.uid() = user_id);
create policy "shares_update_own" on public.shares
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shares_delete_own" on public.shares
  for delete using (auth.uid() = user_id);

-- Read-only payload for a valid, non-revoked token: prepared_by, weekly KPI
-- rollup, carryover/aging, and each week's report with its tasks. Returns
-- null when the token is unknown or revoked.
create or replace function public.shared_dashboard(p_token uuid)
returns json
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid;
  v_result json;
begin
  select user_id into v_user
  from public.shares
  where token = p_token and revoked = false
  limit 1;

  if v_user is null then
    return null;
  end if;

  select json_build_object(
    'prepared_by', (
      select prepared_by from public.reports
      where user_id = v_user order by week_ending desc limit 1
    ),
    'weekly', coalesce((
      select json_agg(w) from (
        select week_ending, total_tasks, done, on_track, at_risk, blocked,
               completion_rate, avg_progress
        from public.kpi_weekly
        where user_id = v_user
        order by week_ending
      ) w
    ), '[]'::json),
    'carryover', coalesce((
      select json_agg(c) from (
        select week_ending, task, status, prior_weeks_seen
        from public.kpi_carryover
        where user_id = v_user
        order by prior_weeks_seen desc
      ) c
    ), '[]'::json),
    'reports', coalesce((
      select json_agg(r) from (
        select rep.week_ending, rep.prepared_by,
          coalesce((
            select json_agg(t) from (
              select task, status, priority, progress, note, position
              from public.tasks
              where report_id = rep.id
              order by position
            ) t
          ), '[]'::json) as tasks
        from public.reports rep
        where rep.user_id = v_user
        order by rep.week_ending desc
      ) r
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

-- The anon (and signed-in) role may call the function; nothing else.
revoke execute on function public.shared_dashboard(uuid) from public;
grant execute on function public.shared_dashboard(uuid) to anon, authenticated;;
