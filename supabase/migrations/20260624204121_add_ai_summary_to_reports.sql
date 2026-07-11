alter table public.reports
  add column if not exists ai_summary text not null default '';;
