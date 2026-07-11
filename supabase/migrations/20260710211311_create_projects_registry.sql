-- Consolidated tracker: first-class Projects registry (name + metadata/template in doc jsonb)
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  doc jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.projects enable row level security;
drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists projects_user_idx on public.projects(user_id);;
