alter table public.reports
  add column if not exists meeting_notes text not null default '';;
