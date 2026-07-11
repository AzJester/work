-- ============================================================
-- Weekly Status Tracker schema
-- One report per user per week; many tasks per report.
-- Row Level Security restricts every row to its owner.
-- ============================================================

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  prepared_by text not null default '',
  week_ending date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_ending)
);

create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  position   int  not null default 0,
  task       text not null default '',
  status     text not null default 'On Track' check (status in ('On Track','At Risk','Blocked','Done')),
  priority   text not null default 'Med'      check (priority in ('High','Med','Low')),
  progress   int  not null default 0          check (progress between 0 and 100),
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index reports_user_week_idx on public.reports (user_id, week_ending desc);
create index tasks_report_id_idx   on public.tasks (report_id, position);

-- keep updated_at fresh on edits
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger reports_touch
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- ---------------- Row Level Security ----------------
alter table public.reports enable row level security;
alter table public.tasks   enable row level security;

create policy "reports_select_own" on public.reports
  for select using (auth.uid() = user_id);
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = user_id);
create policy "reports_update_own" on public.reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reports_delete_own" on public.reports
  for delete using (auth.uid() = user_id);

create policy "tasks_select_own" on public.tasks
  for select using (exists (
    select 1 from public.reports r where r.id = tasks.report_id and r.user_id = auth.uid()));
create policy "tasks_insert_own" on public.tasks
  for insert with check (exists (
    select 1 from public.reports r where r.id = tasks.report_id and r.user_id = auth.uid()));
create policy "tasks_update_own" on public.tasks
  for update using (exists (
    select 1 from public.reports r where r.id = tasks.report_id and r.user_id = auth.uid()));
create policy "tasks_delete_own" on public.tasks
  for delete using (exists (
    select 1 from public.reports r where r.id = tasks.report_id and r.user_id = auth.uid()));

-- ---------------- KPI views (run with caller's RLS) ----------------
-- Per-week rollup: throughput, completion rate, status mix, avg progress.
create view public.kpi_weekly with (security_invoker = on) as
select
  r.user_id,
  r.week_ending,
  count(t.id)                                              as total_tasks,
  count(*) filter (where t.status = 'Done')               as done,
  count(*) filter (where t.status = 'On Track')           as on_track,
  count(*) filter (where t.status = 'At Risk')            as at_risk,
  count(*) filter (where t.status = 'Blocked')            as blocked,
  round(100.0 * count(*) filter (where t.status = 'Done')
        / nullif(count(t.id), 0), 0)                      as completion_rate,
  round(avg(t.progress)::numeric, 0)                      as avg_progress
from public.reports r
left join public.tasks t on t.report_id = r.id
group by r.user_id, r.week_ending;

-- Carryover / aging: for each non-blank task, how many prior weeks the same
-- task text appeared for that user (prior_weeks_seen > 0 means it carried over).
create view public.kpi_carryover with (security_invoker = on) as
with t as (
  select r.user_id, r.week_ending, r.id as report_id,
         tk.task, tk.status, lower(btrim(tk.task)) as task_key
  from public.reports r
  join public.tasks tk on tk.report_id = r.id
  where btrim(tk.task) <> ''
)
select
  cur.user_id,
  cur.week_ending,
  cur.task,
  cur.status,
  count(prev.report_id) as prior_weeks_seen
from t cur
left join t prev
  on  prev.user_id = cur.user_id
  and prev.task_key = cur.task_key
  and prev.week_ending < cur.week_ending
group by cur.user_id, cur.week_ending, cur.task, cur.status;;
