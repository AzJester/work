alter table public.shares
  add column if not exists short_url text not null default '';;
