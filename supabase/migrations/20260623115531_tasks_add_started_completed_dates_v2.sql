alter table public.tasks add column if not exists started_on   date;
alter table public.tasks add column if not exists completed_on date;

-- Keep the existing column order, append the two new dates at the end.
create or replace view public.completed_tasks with (security_invoker = on) as
select
  r.user_id, r.week_ending,
  t.task, t.project, t.priority, t.progress, t.due_date, t.note, t.items, t.position,
  t.started_on, t.completed_on
from public.reports r
join public.tasks t on t.report_id = r.id
where t.status = 'Done';

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
              select task, status, priority, progress, note, position, project,
                     due_date, items, started_on, completed_on
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

revoke execute on function public.shared_dashboard(uuid) from public;
grant execute on function public.shared_dashboard(uuid) to anon, authenticated;;
