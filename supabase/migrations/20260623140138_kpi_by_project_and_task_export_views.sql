-- Per-project rollup for the KPIs tab.
create or replace view public.kpi_by_project with (security_invoker = on) as
select
  r.user_id,
  coalesce(nullif(btrim(t.project), ''), '— No project —') as project,
  count(*)                                        as total_tasks,
  count(*) filter (where t.status = 'Done')       as done
from public.reports r
join public.tasks t on t.report_id = r.id
group by r.user_id, coalesce(nullif(btrim(t.project), ''), '— No project —');

-- Flat, one-row-per-task export feed for CSV download.
create or replace view public.task_export with (security_invoker = on) as
select
  r.user_id, r.week_ending, r.prepared_by,
  t.position, t.task, t.project, t.status, t.priority, t.progress,
  t.due_date, t.started_on, t.completed_on, t.note, t.items
from public.reports r
join public.tasks t on t.report_id = r.id;;
