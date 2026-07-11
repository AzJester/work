-- Archive of every finished task across all weeks (review-only). Done tasks
-- remain in their week's report (for the status report + KPIs); this view just
-- gathers them for easy historical review. security_invoker keeps RLS in force.
create or replace view public.completed_tasks with (security_invoker = on) as
select
  r.user_id,
  r.week_ending,
  t.task,
  t.project,
  t.priority,
  t.progress,
  t.due_date,
  t.note,
  t.items,
  t.position
from public.reports r
join public.tasks t on t.report_id = r.id
where t.status = 'Done';;
