-- Proposal War Room storage: one row per pursuit, readable and writable only by the account that owns it.
--
-- The whole pursuit (setup, schedule, outline, page budget, compliance matrix, change log) is one JSON document,
-- so it saves, exports and imports as a unit. `revision` gives optimistic concurrency: the browser updates the row
-- it read, and an update that names an older revision changes nothing, which the browser reports as a conflict.
-- This migration is additive. It creates one table, one trigger function and four policies, and touches nothing else.

create table if not exists public.proposal_pursuits (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null default '' check (char_length(name) <= 200),
  solicitation_number text not null default '' check (char_length(solicitation_number) <= 120),
  due_date date,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 4194304),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.proposal_pursuits is
  'Proposal War Room pursuits. One JSON document per pursuit, owned by one account and guarded by row level security.';

create index if not exists proposal_pursuits_owner_updated_idx
  on public.proposal_pursuits (owner_id, updated_at desc);

-- The owner, the creation time and the update time are set here, never by the browser.
create or replace function public.proposal_pursuits_before_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(auth.uid(), new.owner_id);
    new.created_at := clock_timestamp();
    new.revision := 1;
    if (select count(*) from public.proposal_pursuits where owner_id = new.owner_id) >= 200 then
      raise exception using errcode = '54000', message = 'This account already holds 200 pursuits. Delete or export one first.';
    end if;
  else
    new.id := old.id;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.proposal_pursuits_before_write() from public, anon, authenticated;

drop trigger if exists proposal_pursuits_before_write on public.proposal_pursuits;
create trigger proposal_pursuits_before_write
  before insert or update on public.proposal_pursuits
  for each row execute function public.proposal_pursuits_before_write();

alter table public.proposal_pursuits enable row level security;

revoke all on table public.proposal_pursuits from public, anon;
grant select, insert, update, delete on table public.proposal_pursuits to authenticated;

drop policy if exists proposal_pursuits_owner_select on public.proposal_pursuits;
create policy proposal_pursuits_owner_select on public.proposal_pursuits
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists proposal_pursuits_owner_insert on public.proposal_pursuits;
create policy proposal_pursuits_owner_insert on public.proposal_pursuits
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists proposal_pursuits_owner_update on public.proposal_pursuits;
create policy proposal_pursuits_owner_update on public.proposal_pursuits
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists proposal_pursuits_owner_delete on public.proposal_pursuits;
create policy proposal_pursuits_owner_delete on public.proposal_pursuits
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
