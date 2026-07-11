CREATE OR REPLACE FUNCTION public.shared_dashboard(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid;
  v_result json;
begin
  select user_id into v_user from public.shares where token = p_token and revoked = false limit 1;
  if v_user is null then return null; end if;

  select json_build_object(
    'prepared_by', (select prepared_by from public.reports where user_id = v_user order by week_ending desc limit 1),
    'weekly', coalesce((
      select json_agg(w) from (
        select week_ending, total_tasks, done, on_track, at_risk, blocked, completion_rate, avg_progress
        from public.kpi_weekly where user_id = v_user order by week_ending) w), '[]'::json),
    'carryover', coalesce((
      select json_agg(c) from (
        select week_ending, task, status, prior_weeks_seen
        from public.kpi_carryover where user_id = v_user order by prior_weeks_seen desc) c), '[]'::json),
    'kudos', coalesce((
      select json_agg(k) from (
        select kudos_date, source, title, details
        from public.kudos where user_id = v_user order by kudos_date desc nulls last, created_at desc) k), '[]'::json),
    'reports', coalesce((
      select json_agg(r) from (
        select rep.week_ending, rep.prepared_by, rep.ai_summary,
          coalesce((
            select json_agg(t) from (
              select task, status, priority, progress, note, position, project, due_date, items, started_on, completed_on
              from public.tasks where report_id = rep.id order by position) t), '[]'::json) as tasks
        from public.reports rep where rep.user_id = v_user order by rep.week_ending desc) r), '[]'::json)
  ) into v_result;

  return v_result;
end;
$function$;;
