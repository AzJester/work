-- Roadmap data safety, optimistic concurrency, private history, and
-- least-privilege read APIs.
--
-- This migration is deliberately additive. It does not delete, rename, or
-- rewrite an existing roadmap document, roadmap ID, share row, or share token.
-- Existing roadmap rows are snapshotted byte-for-byte as revision 0 before
-- write triggers are installed. The legacy direct-table grants/policies remain
-- temporarily so the currently deployed roadmap.html keeps working during the
-- backend-first rollout; a follow-up migration can remove them after the
-- frontend has switched to the RPCs defined below.

-- ---------------------------------------------------------------------------
-- Add server-managed sync metadata without changing existing documents.
-- ---------------------------------------------------------------------------

-- Roadmap provisioning previously lived only in README instructions. These
-- definitions make a clean database reproducible while IF NOT EXISTS leaves
-- the recovered production tables and every row in them untouched.
create table if not exists public.roadmaps (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  title text,
  subtitle text,
  template_type text,
  public boolean not null default false,
  doc jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.roadmap_shares (
  token uuid primary key default gen_random_uuid(),
  roadmap_id text not null references public.roadmaps(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  label text,
  revoked boolean default false,
  created_at timestamptz default now()
);

alter table public.roadmaps enable row level security;
alter table public.roadmap_shares enable row level security;

alter table public.roadmaps
  add column if not exists revision bigint default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists last_mutation_id uuid,
  add column if not exists last_saved_by uuid;

update public.roadmaps
   set revision = 0
 where revision is null;

update public.roadmaps
   set created_at = coalesce(created_at, clock_timestamp()),
       updated_at = coalesce(updated_at, created_at, clock_timestamp())
 where created_at is null or updated_at is null;

alter table public.roadmaps
  alter column revision set default 0,
  alter column revision set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.roadmaps'::regclass
       and conname = 'roadmaps_revision_nonnegative'
  ) then
    alter table public.roadmaps
      add constraint roadmaps_revision_nonnegative check (revision >= 0);
  end if;
end;
$$;

create index if not exists roadmap_owner_active_updated_idx
  on public.roadmaps (user_id, updated_at desc, id)
  where deleted_at is null;

create index if not exists roadmap_public_active_updated_idx
  on public.roadmaps (updated_at desc, id)
  where public = true and deleted_at is null;

-- The legacy public policy remains for rollout compatibility, but it must
-- never make a soft-deleted row visible. Owners may still see their own trash
-- through the old direct-table UI until the RPC-only frontend is deployed.
drop policy if exists roadmap_active_or_owner_read_guard on public.roadmaps;
create policy roadmap_active_or_owner_read_guard
  on public.roadmaps
  as restrictive
  for select
  to anon, authenticated
  using (deleted_at is null or user_id = auth.uid());

alter table public.roadmap_shares
  add column if not exists expires_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- A legacy NULL was not accepted by the old `s.revoked = false` predicate, so
-- preserve that fail-closed behavior. Never turn an ambiguous token on.
update public.roadmap_shares
   set revoked = true,
       revoked_at = coalesce(revoked_at, updated_at, created_at, clock_timestamp()),
       updated_at = coalesce(updated_at, created_at, clock_timestamp())
 where revoked is null;

update public.roadmap_shares
   set created_at = coalesce(created_at, clock_timestamp()),
       updated_at = coalesce(updated_at, created_at, clock_timestamp()),
       revoked_at = case
         when revoked then coalesce(revoked_at, updated_at, created_at, clock_timestamp())
         else null
       end
 where created_at is null
    or updated_at is null
    or (revoked and revoked_at is null)
    or (not revoked and revoked_at is not null);

-- Keep every pre-existing share/token, but disable an invalid legacy share
-- whose recorded owner is not the roadmap owner. Such a row remains available
-- to its owner for audit/recovery and is never served to a bearer.
update public.roadmap_shares s
   set revoked = true,
       revoked_at = coalesce(s.revoked_at, clock_timestamp()),
       updated_at = clock_timestamp()
 where not exists (
   select 1
     from public.roadmaps r
    where r.id = s.roadmap_id
      and r.user_id = s.user_id
 )
   and not s.revoked;

alter table public.roadmap_shares
  alter column revoked set default false,
  alter column revoked set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists roadmap_shares_owner_updated_idx
  on public.roadmap_shares (user_id, updated_at desc, token);

create index if not exists roadmap_shares_active_token_idx
  on public.roadmap_shares (token)
  where revoked = false;

-- ---------------------------------------------------------------------------
-- Append-only private revision history. No FK is intentional: even an
-- operator-level accidental hard delete of the current row must not erase its
-- recovery history.
-- ---------------------------------------------------------------------------

create table if not exists public.roadmap_revisions (
  roadmap_id text not null,
  revision bigint not null,
  user_id uuid not null,
  title text,
  subtitle text,
  template_type text,
  public boolean not null,
  doc jsonb not null,
  deleted_at timestamptz,
  mutation_id uuid,
  operation text not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid,
  primary key (roadmap_id, revision),
  constraint roadmap_revisions_revision_nonnegative check (revision >= 0),
  constraint roadmap_revisions_operation_check check (
    operation in ('baseline', 'create', 'save', 'soft_delete', 'restore')
  )
);

alter table public.roadmap_revisions enable row level security;

drop policy if exists roadmap_revisions_owner_read on public.roadmap_revisions;
create policy roadmap_revisions_owner_read
  on public.roadmap_revisions
  for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists roadmap_revisions_owner_recorded_idx
  on public.roadmap_revisions (user_id, recorded_at desc, roadmap_id, revision desc);

-- The insert is idempotent and copies the complete current document without
-- normalization or sanitization. This is the recovery point for existing data.
insert into public.roadmap_revisions (
  roadmap_id,
  revision,
  user_id,
  title,
  subtitle,
  template_type,
  public,
  doc,
  deleted_at,
  mutation_id,
  operation,
  recorded_at,
  recorded_by
)
select
  r.id,
  r.revision,
  r.user_id,
  r.title,
  r.subtitle,
  r.template_type,
  r.public,
  r.doc,
  r.deleted_at,
  r.last_mutation_id,
  'baseline',
  r.updated_at,
  r.last_saved_by
from public.roadmaps r
on conflict (roadmap_id, revision) do nothing;

revoke all on table public.roadmap_revisions
  from public, anon, authenticated, service_role;
grant select on table public.roadmap_revisions to authenticated, service_role;

create or replace function public.roadmap_revisions_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'roadmap revision history is append-only';
end;
$$;

revoke all on function public.roadmap_revisions_append_only()
  from public, anon, authenticated, service_role;

drop trigger if exists roadmap_revisions_no_update_or_delete on public.roadmap_revisions;
create trigger roadmap_revisions_no_update_or_delete
before update or delete on public.roadmap_revisions
for each row execute function public.roadmap_revisions_append_only();

-- ---------------------------------------------------------------------------
-- Server-owned write fields and automatic revision capture. These triggers
-- also protect legacy direct upserts during the compatibility window.
-- ---------------------------------------------------------------------------

create or replace function public.roadmap_prepare_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.deleted_at := null;
    new.last_saved_by := coalesce(auth.uid(), new.user_id);
    return new;
  end if;

  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  new.last_saved_by := coalesce(auth.uid(), old.last_saved_by, old.user_id);

  -- Trash is never public, and every restore starts private even when it came
  -- through the temporary direct-table compatibility path.
  if new.deleted_at is not null
     or (old.deleted_at is not null and new.deleted_at is null) then
    new.public := false;
  end if;

  -- A legacy PATCH does not know this field, so NEW carries OLD unchanged.
  -- Clear it in that case to prevent an old mutation UUID from being mistaken
  -- for an idempotent retry after an unrelated legacy write.
  if new.last_mutation_id is not distinct from old.last_mutation_id then
    new.last_mutation_id := null;
  end if;

  return new;
end;
$$;

revoke all on function public.roadmap_prepare_write()
  from public, anon, authenticated, service_role;

create or replace function public.roadmap_record_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_operation text;
begin
  v_operation := case
    when tg_op = 'INSERT' then 'create'
    when old.deleted_at is null and new.deleted_at is not null then 'soft_delete'
    when old.deleted_at is not null and new.deleted_at is null then 'restore'
    else 'save'
  end;

  insert into public.roadmap_revisions (
    roadmap_id,
    revision,
    user_id,
    title,
    subtitle,
    template_type,
    public,
    doc,
    deleted_at,
    mutation_id,
    operation,
    recorded_at,
    recorded_by
  ) values (
    new.id,
    new.revision,
    new.user_id,
    new.title,
    new.subtitle,
    new.template_type,
    new.public,
    new.doc,
    new.deleted_at,
    new.last_mutation_id,
    v_operation,
    new.updated_at,
    new.last_saved_by
  );

  -- Enforce the invariant for both the RPC and the temporary legacy direct
  -- update path: every transition into Trash permanently revokes all tokens.
  if tg_op = 'UPDATE'
     and old.deleted_at is null
     and new.deleted_at is not null then
    update public.roadmap_shares s
       set revoked = true,
           revoked_at = coalesce(s.revoked_at, clock_timestamp())
     where s.roadmap_id = new.id
       and s.user_id = new.user_id
       and not s.revoked;
  end if;

  return new;
end;
$$;

revoke all on function public.roadmap_record_revision()
  from public, anon, authenticated, service_role;

create or replace function public.roadmap_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'roadmaps cannot be hard-deleted',
    hint = 'Use roadmap_soft_delete so the roadmap remains recoverable.';
end;
$$;

revoke all on function public.roadmap_prevent_hard_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists roadmap_prepare_write on public.roadmaps;
create trigger roadmap_prepare_write
before insert or update on public.roadmaps
for each row execute function public.roadmap_prepare_write();

drop trigger if exists roadmap_record_revision on public.roadmaps;
create trigger roadmap_record_revision
after insert or update on public.roadmaps
for each row execute function public.roadmap_record_revision();

drop trigger if exists roadmap_prevent_hard_delete on public.roadmaps;
create trigger roadmap_prevent_hard_delete
before delete on public.roadmaps
for each row execute function public.roadmap_prevent_hard_delete();

-- Share ownership and revocation are server-enforced even while the legacy
-- direct insert path remains available to the deployed frontend.
create or replace function public.roadmap_share_prepare_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_roadmap_deleted_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    new.token := old.token;
    new.roadmap_id := old.roadmap_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if old.revoked and not coalesce(new.revoked, false) then
      raise exception using
        errcode = '55000',
        message = 'a revoked roadmap share cannot be reactivated';
    end if;
  else
    new.created_at := clock_timestamp();
    new.last_used_at := null;
  end if;

  if tg_op = 'INSERT' then
    -- Match the roadmap-first lock order used by save/delete/share RPCs. This
    -- serializes even the transitional direct INSERT path with soft deletion.
    select r.deleted_at
      into v_roadmap_deleted_at
      from public.roadmaps r
     where r.id = new.roadmap_id
       and r.user_id = new.user_id
     for update;
  else
    -- Do not acquire the roadmap lock after a share-row lock on UPDATE; that
    -- inverse order could deadlock with roadmap deletion revoking its shares.
    select r.deleted_at
      into v_roadmap_deleted_at
      from public.roadmaps r
     where r.id = new.roadmap_id
       and r.user_id = new.user_id;
  end if;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'roadmap share owner must match roadmap owner';
  end if;

  if v_roadmap_deleted_at is not null
     and (tg_op = 'INSERT' or not coalesce(new.revoked, false)) then
    raise exception using
      errcode = '55000',
      message = 'a deleted roadmap cannot have an active share';
  end if;

  new.revoked := coalesce(new.revoked, false);
  if new.revoked then
    new.revoked_at := coalesce(new.revoked_at, clock_timestamp());
  else
    new.revoked_at := null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.roadmap_share_prepare_write()
  from public, anon, authenticated, service_role;

drop trigger if exists roadmap_share_prepare_write on public.roadmap_shares;
create trigger roadmap_share_prepare_write
before insert or update on public.roadmap_shares
for each row execute function public.roadmap_share_prepare_write();

create or replace function public.roadmap_prevent_share_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'roadmap shares cannot be hard-deleted',
    hint = 'Use roadmap_share_revoke so the token remains auditable.';
end;
$$;

revoke all on function public.roadmap_prevent_share_hard_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists roadmap_prevent_share_hard_delete on public.roadmap_shares;
create trigger roadmap_prevent_share_hard_delete
before delete on public.roadmap_shares
for each row execute function public.roadmap_prevent_share_hard_delete();

-- ---------------------------------------------------------------------------
-- Shared JSON builders and schema-allowlisted public-document sanitizer.
-- ---------------------------------------------------------------------------

create or replace function public.roadmap_owner_json(p_row public.roadmaps)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'title', left(coalesce(p_row.title, ''), 500),
    'subtitle', left(coalesce(p_row.subtitle, ''), 1000),
    'template_type', case
      when p_row.template_type in ('software', 'product', 'gtm', 'data', 'hiring', 'custom')
        then p_row.template_type
      else 'custom'
    end,
    'public', p_row.public,
    'doc', p_row.doc,
    'revision', p_row.revision,
    'deleted_at', p_row.deleted_at,
    'last_mutation_id', p_row.last_mutation_id,
    'last_saved_by', p_row.last_saved_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

revoke all on function public.roadmap_owner_json(public.roadmaps)
  from public, anon, authenticated, service_role;

create or replace function public.roadmap_public_safe_id(
  p_value text,
  p_fallback text
)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select case
    when coalesce(p_value, '') ~ '^[A-Za-z0-9_-]{1,96}$' then p_value
    else p_fallback
  end;
$$;

create or replace function public.roadmap_public_safe_text(
  p_object jsonb,
  p_key text,
  p_limit integer,
  p_default text
)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select left(
    case
      when jsonb_typeof(p_object->p_key) = 'string' then p_object->>p_key
      else coalesce(p_default, '')
    end,
    least(20000, greatest(0, coalesce(p_limit, 0)))
  );
$$;

create or replace function public.roadmap_public_safe_color(
  p_value text,
  p_fallback text
)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select case
    when lower(btrim(coalesce(p_value, ''))) ~ '^#[0-9a-f]{6}$'
      then lower(btrim(p_value))
    else p_fallback
  end;
$$;

create or replace function public.roadmap_public_safe_date(p_value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_date date;
begin
  if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  begin
    v_date := p_value::date;
  exception
    when others then return null;
  end;
  if to_char(v_date, 'YYYY-MM-DD') <> p_value then
    return null;
  end if;
  return p_value;
end;
$$;

-- This is a schema allowlist, not a recursive key denylist. Unknown data never
-- crosses the public/share boundary. The limits mirror the browser normalizer,
-- while invalid IDs/colors/statuses/dates receive safe presentation defaults.
create or replace function public.roadmap_sanitize_public_doc(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_doc jsonb := case when jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end;
  v_lane_source jsonb := case
    when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value->'lanes') = 'array'
      then p_value->'lanes'
    else '[]'::jsonb
  end;
  v_callout_source jsonb := case
    when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value->'callouts') = 'array'
      then p_value->'callouts'
    else '[]'::jsonb
  end;
  v_lane jsonb;
  v_lane_ordinal bigint;
  v_item_source jsonb;
  v_public_items jsonb;
  v_public_lanes jsonb := '[]'::jsonb;
  v_public_callouts jsonb := '[]'::jsonb;
  v_callout jsonb;
  v_callout_ordinal bigint;
  v_range_start text;
  v_range_end text;
  v_range jsonb := null;
  v_color_fallback text;
begin
  for v_lane, v_lane_ordinal in
    select candidate.value, candidate.ordinality
      from (
        select lane.value, lane.ordinality
          from jsonb_array_elements(v_lane_source) with ordinality lane(value, ordinality)
         where jsonb_typeof(lane.value) = 'object'
         order by lane.ordinality
         limit 100
      ) candidate
  loop
    v_item_source := case
      when jsonb_typeof(v_lane->'items') = 'array' then v_lane->'items'
      else '[]'::jsonb
    end;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', public.roadmap_public_safe_id(
            item.value->>'id',
            'it_' || v_lane_ordinal::text || '_' || item.ordinality::text
          ),
          'kind', case when item.value->>'kind' = 'milestone' then 'milestone' else 'bar' end,
          'label', public.roadmap_public_safe_text(item.value, 'label', 1000, ''),
          'date', case
            when item.value->>'kind' = 'milestone' then coalesce(
              public.roadmap_public_safe_date(item.value->>'date'),
              public.roadmap_public_safe_date(item.value->>'start')
            )
            else null
          end,
          'start', case
            when item.value->>'kind' is distinct from 'milestone'
              then public.roadmap_public_safe_date(item.value->>'start')
            else null
          end,
          'end', case
            when item.value->>'kind' is distinct from 'milestone'
              then public.roadmap_public_safe_date(item.value->>'end')
            else null
          end,
          'status', case
            when item.value->>'status' in (
              'planned', 'in_progress', 'complete', 'at_risk', 'blocked', 'on_hold'
            ) then item.value->>'status'
            else 'planned'
          end,
          'gate', coalesce(
            jsonb_typeof(item.value->'gate') = 'boolean'
              and item.value->>'gate' = 'true',
            false
          )
        )) order by item.ordinality
      ),
      '[]'::jsonb
    )
      into v_public_items
      from (
        select entry.value, entry.ordinality
          from jsonb_array_elements(v_item_source) with ordinality entry(value, ordinality)
         where jsonb_typeof(entry.value) = 'object'
         order by entry.ordinality
         limit 500
      ) item;

    v_color_fallback := case ((v_lane_ordinal - 1) % 10)::integer
      when 0 then '#0073ea'
      when 1 then '#00c875'
      when 2 then '#a25ddc'
      when 3 then '#fdab3d'
      when 4 then '#e2445c'
      when 5 then '#00d2d2'
      when 6 then '#ff642e'
      when 7 then '#579bfc'
      when 8 then '#037f4c'
      else '#9d50dd'
    end;

    v_public_lanes := v_public_lanes || jsonb_build_array(jsonb_build_object(
      'id', public.roadmap_public_safe_id(v_lane->>'id', 'lane_' || v_lane_ordinal::text),
      'name', coalesce(
        nullif(btrim(public.roadmap_public_safe_text(v_lane, 'name', 500, '')), ''),
        'Untitled lane'
      ),
      'color', public.roadmap_public_safe_color(v_lane->>'color', v_color_fallback),
      'contingency', coalesce(
        jsonb_typeof(v_lane->'contingency') = 'boolean'
          and v_lane->>'contingency' = 'true',
        false
      ),
      'sub', public.roadmap_public_safe_text(v_lane, 'sub', 2000, ''),
      'items', v_public_items
    ));
  end loop;

  for v_callout, v_callout_ordinal in
    select candidate.value, candidate.ordinality
      from (
        select callout.value, callout.ordinality
          from jsonb_array_elements(v_callout_source) with ordinality callout(value, ordinality)
         where jsonb_typeof(callout.value) = 'object'
         order by callout.ordinality
         limit 100
      ) candidate
  loop
    v_public_callouts := v_public_callouts || jsonb_build_array(jsonb_build_object(
      'id', public.roadmap_public_safe_id(v_callout->>'id', 'co_' || v_callout_ordinal::text),
      'title', public.roadmap_public_safe_text(v_callout, 'title', 500, ''),
      'body', public.roadmap_public_safe_text(v_callout, 'body', 10000, ''),
      'list', coalesce(
        jsonb_typeof(v_callout->'list') = 'boolean'
          and v_callout->>'list' = 'true',
        false
      )
    ));
  end loop;

  v_range_start := public.roadmap_public_safe_date(v_doc#>>'{range,start}');
  v_range_end := public.roadmap_public_safe_date(v_doc#>>'{range,end}');
  if v_range_start is not null
     and v_range_end is not null
     and v_range_start::date <= v_range_end::date then
    v_range := jsonb_build_object('start', v_range_start, 'end', v_range_end);
  end if;

  return jsonb_build_object(
    'id', public.roadmap_public_safe_id(v_doc->>'id', 'rm_public'),
    'title', coalesce(
      nullif(btrim(public.roadmap_public_safe_text(v_doc, 'title', 500, '')), ''),
      'Untitled roadmap'
    ),
    'subtitle', public.roadmap_public_safe_text(v_doc, 'subtitle', 1000, ''),
    'premise', public.roadmap_public_safe_text(v_doc, 'premise', 2000, ''),
    'public', coalesce(
      jsonb_typeof(v_doc->'public') = 'boolean' and v_doc->>'public' = 'true',
      false
    ),
    'archived', coalesce(
      jsonb_typeof(v_doc->'archived') = 'boolean' and v_doc->>'archived' = 'true',
      false
    ),
    'templateType', case
      when v_doc->>'templateType' in ('software', 'product', 'gtm', 'data', 'hiring', 'custom')
        then v_doc->>'templateType'
      else 'custom'
    end,
    'range', v_range,
    'lanes', v_public_lanes,
    'callouts', v_public_callouts
  );
end;
$$;

revoke all on function public.roadmap_public_safe_id(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_public_safe_text(jsonb, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_public_safe_color(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_public_safe_date(text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_sanitize_public_doc(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.roadmap_public_json(p_row public.roadmaps)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'title', coalesce(p_row.title, ''),
    'subtitle', coalesce(p_row.subtitle, ''),
    'template_type', coalesce(p_row.template_type, 'custom'),
    'doc', public.roadmap_sanitize_public_doc(p_row.doc),
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

revoke all on function public.roadmap_public_json(public.roadmaps)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Authenticated owner portfolio and optimistic-concurrency writes.
-- ---------------------------------------------------------------------------

create or replace function public.roadmap_owner_portfolio(
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'roadmap_owner_portfolio requires an authenticated user';
  end if;

  select coalesce(
    jsonb_agg(public.roadmap_owner_json(r) order by r.updated_at desc, r.id),
    '[]'::jsonb
  )
    into v_result
    from public.roadmaps r
   where r.user_id = v_user_id
     and (coalesce(p_include_deleted, false) or r.deleted_at is null);

  return v_result;
end;
$$;

create or replace function public.roadmap_save_atomic(
  p_id text,
  p_doc jsonb,
  p_title text,
  p_subtitle text,
  p_template_type text,
  p_public boolean,
  p_expected_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id text := btrim(coalesce(p_id, ''));
  v_row public.roadmaps%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'roadmap_save_atomic requires an authenticated user';
  end if;
  if v_id = '' or length(v_id) > 160 then
    raise exception using errcode = '22023', message = 'p_id must be 1 to 160 characters';
  end if;
  if v_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
    raise exception using errcode = '22023', message = 'p_id contains unsupported characters';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception using errcode = '22023', message = 'p_doc must be a JSON object';
  end if;
  if pg_column_size(p_doc) > 4194304 then
    raise exception using errcode = '22023', message = 'p_doc exceeds the 4 MiB safety limit';
  end if;
  if p_mutation_id is null then
    raise exception using errcode = '22023', message = 'p_mutation_id is required';
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'p_expected_revision cannot be negative';
  end if;

  select r.*
    into v_row
    from public.roadmaps r
   where r.id = v_id
   for update;

  if found then
    if v_row.user_id <> v_user_id then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'id_unavailable',
        'roadmap', null
      );
    end if;

    if v_row.last_mutation_id = p_mutation_id then
      return jsonb_build_object(
        'ok', true,
        'conflict', false,
        'reason', 'idempotent_replay',
        'roadmap', public.roadmap_owner_json(v_row)
      );
    end if;

    if v_row.deleted_at is not null then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'roadmap_deleted',
        'roadmap', public.roadmap_owner_json(v_row)
      );
    end if;

    if p_expected_revision is null or p_expected_revision <> v_row.revision then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'revision_mismatch',
        'expected_revision', p_expected_revision,
        'actual_revision', v_row.revision,
        'roadmap', public.roadmap_owner_json(v_row)
      );
    end if;

    update public.roadmaps r
       set title = left(coalesce(p_title, ''), 500),
           subtitle = left(coalesce(p_subtitle, ''), 1000),
           template_type = left(coalesce(nullif(btrim(p_template_type), ''), 'custom'), 100),
           public = coalesce(p_public, false),
           doc = p_doc,
           last_mutation_id = p_mutation_id
     where r.id = v_id
       and r.user_id = v_user_id
    returning r.* into v_row;

    return jsonb_build_object(
      'ok', true,
      'conflict', false,
      'reason', 'saved',
      'roadmap', public.roadmap_owner_json(v_row)
    );
  end if;

  if p_expected_revision is not null and p_expected_revision <> 0 then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'missing_server_row',
      'expected_revision', p_expected_revision,
      'actual_revision', null,
      'roadmap', null
    );
  end if;

  begin
    insert into public.roadmaps (
      id,
      user_id,
      title,
      subtitle,
      template_type,
      public,
      doc,
      last_mutation_id,
      last_saved_by
    ) values (
      v_id,
      v_user_id,
      left(coalesce(p_title, ''), 500),
      left(coalesce(p_subtitle, ''), 1000),
      left(coalesce(nullif(btrim(p_template_type), ''), 'custom'), 100),
      coalesce(p_public, false),
      p_doc,
      p_mutation_id,
      v_user_id
    )
    returning * into v_row;
  exception
    when unique_violation then
      -- A concurrent create won the ID. Read it after the conflicting insert
      -- statement is rolled back, then return a conflict instead of overwriting.
      select r.*
        into v_row
        from public.roadmaps r
       where r.id = v_id;

      if found and v_row.user_id = v_user_id and v_row.last_mutation_id = p_mutation_id then
        return jsonb_build_object(
          'ok', true,
          'conflict', false,
          'reason', 'idempotent_replay',
          'roadmap', public.roadmap_owner_json(v_row)
        );
      end if;

      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', case when found and v_row.user_id = v_user_id then 'concurrent_create' else 'id_unavailable' end,
        'actual_revision', case when found and v_row.user_id = v_user_id then v_row.revision else null end,
        'roadmap', case when found and v_row.user_id = v_user_id then public.roadmap_owner_json(v_row) else null end
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'reason', 'created',
    'roadmap', public.roadmap_owner_json(v_row)
  );
end;
$$;

create or replace function public.roadmap_soft_delete(
  p_id text,
  p_expected_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.roadmaps%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'roadmap_soft_delete requires an authenticated user';
  end if;
  if p_mutation_id is null then
    raise exception using errcode = '22023', message = 'p_mutation_id is required';
  end if;

  select r.*
    into v_row
    from public.roadmaps r
   where r.id = btrim(coalesce(p_id, ''))
     and r.user_id = v_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'conflict', false, 'reason', 'not_found', 'roadmap', null);
  end if;
  if v_row.last_mutation_id = p_mutation_id and v_row.deleted_at is not null then
    return jsonb_build_object('ok', true, 'conflict', false, 'reason', 'idempotent_replay', 'roadmap', public.roadmap_owner_json(v_row));
  end if;
  if p_expected_revision is null or p_expected_revision <> v_row.revision then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'revision_mismatch',
      'expected_revision', p_expected_revision,
      'actual_revision', v_row.revision,
      'roadmap', public.roadmap_owner_json(v_row)
    );
  end if;
  if v_row.deleted_at is not null then
    return jsonb_build_object('ok', true, 'conflict', false, 'reason', 'already_deleted', 'roadmap', public.roadmap_owner_json(v_row));
  end if;

  update public.roadmaps r
     set deleted_at = clock_timestamp(),
         public = false,
         last_mutation_id = p_mutation_id
   where r.id = v_row.id
     and r.user_id = v_user_id
  returning r.* into v_row;

  -- A deleted roadmap is never readable through an old bearer token. Tokens
  -- remain in place for owner audit, but are permanently revoked.
  update public.roadmap_shares s
     set revoked = true,
         revoked_at = coalesce(s.revoked_at, clock_timestamp())
   where s.roadmap_id = v_row.id
     and s.user_id = v_user_id
     and not s.revoked;

  return jsonb_build_object('ok', true, 'conflict', false, 'reason', 'deleted', 'roadmap', public.roadmap_owner_json(v_row));
end;
$$;

create or replace function public.roadmap_restore(
  p_id text,
  p_expected_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.roadmaps%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'roadmap_restore requires an authenticated user';
  end if;
  if p_mutation_id is null then
    raise exception using errcode = '22023', message = 'p_mutation_id is required';
  end if;

  select r.*
    into v_row
    from public.roadmaps r
   where r.id = btrim(coalesce(p_id, ''))
     and r.user_id = v_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'conflict', false, 'reason', 'not_found', 'roadmap', null);
  end if;
  if v_row.last_mutation_id = p_mutation_id and v_row.deleted_at is null then
    return jsonb_build_object('ok', true, 'conflict', false, 'reason', 'idempotent_replay', 'roadmap', public.roadmap_owner_json(v_row));
  end if;
  if p_expected_revision is null or p_expected_revision <> v_row.revision then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'revision_mismatch',
      'expected_revision', p_expected_revision,
      'actual_revision', v_row.revision,
      'roadmap', public.roadmap_owner_json(v_row)
    );
  end if;
  if v_row.deleted_at is null then
    return jsonb_build_object('ok', true, 'conflict', false, 'reason', 'already_active', 'roadmap', public.roadmap_owner_json(v_row));
  end if;

  update public.roadmaps r
     set deleted_at = null,
         public = false,
         last_mutation_id = p_mutation_id
   where r.id = v_row.id
     and r.user_id = v_user_id
  returning r.* into v_row;

  -- Restoration never silently republishes the roadmap or reactivates old
  -- bearer links; the owner can explicitly publish/create a new share later.
  return jsonb_build_object('ok', true, 'conflict', false, 'reason', 'restored', 'roadmap', public.roadmap_owner_json(v_row));
end;
$$;

-- ---------------------------------------------------------------------------
-- Public portfolio/detail RPCs. These are allow-listed envelopes around a
-- bounded, schema-allowlisted document and reveal no account identifiers.
-- ---------------------------------------------------------------------------

create or replace function public.roadmap_public_list()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    jsonb_agg(public.roadmap_public_json(r) order by r.updated_at desc, r.id),
    '[]'::jsonb
  )
    from (
      select current_row.*
        from public.roadmaps current_row
       where current_row.public = true
         and current_row.deleted_at is null
       order by current_row.updated_at desc, current_row.id
       limit 200
    ) r;
$$;

create or replace function public.roadmap_public_get(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.roadmap_public_json(r)
    from public.roadmaps r
   where r.id = btrim(coalesce(p_id, ''))
     and r.public = true
     and r.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Secure bearer-share lifecycle. A share is valid only when its user_id is the
-- same as its roadmap's owner, and when both share and roadmap are active.
-- ---------------------------------------------------------------------------

create or replace function public.roadmap_share_create(
  p_roadmap_id text,
  p_label text default '',
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_roadmap public.roadmaps%rowtype;
  v_share public.roadmap_shares%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'roadmap_share_create requires an authenticated user';
  end if;
  if p_expires_at is not null and p_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'p_expires_at must be in the future';
  end if;

  select r.*
    into v_roadmap
    from public.roadmaps r
   where r.id = btrim(coalesce(p_roadmap_id, ''))
     and r.user_id = v_user_id
     and r.deleted_at is null
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'share', null);
  end if;

  insert into public.roadmap_shares (
    roadmap_id,
    user_id,
    label,
    expires_at,
    revoked
  ) values (
    v_roadmap.id,
    v_user_id,
    left(coalesce(p_label, ''), 300),
    p_expires_at,
    false
  )
  returning * into v_share;

  return jsonb_build_object(
    'ok', true,
    'reason', 'created',
    'share', jsonb_build_object(
      'token', v_share.token,
      'roadmap_id', v_share.roadmap_id,
      'label', coalesce(v_share.label, ''),
      'revoked', v_share.revoked,
      'expires_at', v_share.expires_at,
      'last_used_at', v_share.last_used_at,
      'created_at', v_share.created_at,
      'updated_at', v_share.updated_at
    )
  );
end;
$$;

create or replace function public.roadmap_share_list(
  p_roadmap_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'roadmap_share_list requires an authenticated user';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'token', s.token,
        'roadmap_id', s.roadmap_id,
        'label', coalesce(s.label, ''),
        'revoked', s.revoked,
        'revoked_at', s.revoked_at,
        'expires_at', s.expires_at,
        'last_used_at', s.last_used_at,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ) order by s.created_at desc, s.token
    ),
    '[]'::jsonb
  )
    into v_result
    from public.roadmap_shares s
    join public.roadmaps r
      on r.id = s.roadmap_id
     and r.user_id = s.user_id
   where s.user_id = v_user_id
     and (p_roadmap_id is null or s.roadmap_id = p_roadmap_id);

  return v_result;
end;
$$;

create or replace function public.roadmap_share_revoke(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.roadmap_shares%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'roadmap_share_revoke requires an authenticated user';
  end if;
  if p_token is null then
    raise exception using errcode = '22023', message = 'p_token is required';
  end if;

  select s.*
    into v_share
    from public.roadmap_shares s
    join public.roadmaps r
      on r.id = s.roadmap_id
     and r.user_id = s.user_id
   where s.token = p_token
     and s.user_id = v_user_id
   for update of s;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'share', null);
  end if;

  if not v_share.revoked then
    update public.roadmap_shares s
       set revoked = true,
           revoked_at = clock_timestamp()
     where s.token = v_share.token
    returning s.* into v_share;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', case when v_share.revoked then 'revoked' else 'revoked' end,
    'share', jsonb_build_object(
      'token', v_share.token,
      'roadmap_id', v_share.roadmap_id,
      'label', coalesce(v_share.label, ''),
      'revoked', v_share.revoked,
      'revoked_at', v_share.revoked_at,
      'expires_at', v_share.expires_at,
      'last_used_at', v_share.last_used_at,
      'created_at', v_share.created_at,
      'updated_at', v_share.updated_at
    )
  );
end;
$$;

create or replace function public.roadmap_shared_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_row public.roadmaps%rowtype;
begin
  if p_token is null then
    return null;
  end if;

  select r.*
    into v_row
    from public.roadmap_shares s
    join public.roadmaps r
      on r.id = s.roadmap_id
     and r.user_id = s.user_id
   where s.token = p_token
     and s.revoked = false
     and (s.expires_at is null or s.expires_at > clock_timestamp())
     and r.deleted_at is null
   for update of s;

  if not found then
    return null;
  end if;

  update public.roadmap_shares s
     set last_used_at = clock_timestamp()
   where s.token = p_token;

  return public.roadmap_public_json(v_row);
end;
$$;

-- Preserve the legacy function signature used by already-issued links, but
-- route it through the secure/sanitized implementation immediately. This is a
-- compatible security fix: callers still receive TABLE(doc jsonb).
create or replace function public.shared_roadmap(p_token uuid)
returns table(doc jsonb)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select payload->'doc'
    from (select public.roadmap_shared_get(p_token) as payload) secure
   where payload is not null;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege RPC execution grants.
-- ---------------------------------------------------------------------------

revoke all on function public.roadmap_owner_portfolio(boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_save_atomic(text, jsonb, text, text, text, boolean, bigint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_soft_delete(text, bigint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_restore(text, bigint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_public_list()
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_public_get(text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_share_create(text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_share_list(text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_share_revoke(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_shared_get(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.shared_roadmap(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.roadmap_owner_portfolio(boolean) to authenticated;
grant execute on function public.roadmap_save_atomic(text, jsonb, text, text, text, boolean, bigint, uuid) to authenticated;
grant execute on function public.roadmap_soft_delete(text, bigint, uuid) to authenticated;
grant execute on function public.roadmap_restore(text, bigint, uuid) to authenticated;
grant execute on function public.roadmap_share_create(text, text, timestamptz) to authenticated;
grant execute on function public.roadmap_share_list(text) to authenticated;
grant execute on function public.roadmap_share_revoke(uuid) to authenticated;

grant execute on function public.roadmap_public_list() to anon, authenticated;
grant execute on function public.roadmap_public_get(text) to anon, authenticated;
grant execute on function public.roadmap_shared_get(uuid) to anon, authenticated;
grant execute on function public.shared_roadmap(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tamper-resistant temporary-password acknowledgement.
--
-- app_metadata is intentionally authoritative in the browser. A user cannot
-- clear raw_app_meta_data directly, so remove the flag in the same database
-- transaction in which GoTrue actually changes encrypted_password. Merely
-- editing user_metadata or resubmitting the existing password hash cannot
-- clear it. This trigger does not read, store, or log a plaintext password.
-- ---------------------------------------------------------------------------

create or replace function public.roadmap_clear_password_change_requirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password
     and coalesce(old.raw_app_meta_data->>'must_change_password', 'false') = 'true'
     and coalesce(new.raw_app_meta_data->>'must_change_password', 'false') = 'true' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      - 'must_change_password';
  end if;
  return new;
end;
$$;

revoke all on function public.roadmap_clear_password_change_requirement()
  from public, anon, authenticated, service_role;

drop trigger if exists roadmap_clear_password_change_requirement on auth.users;
create trigger roadmap_clear_password_change_requirement
before update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function public.roadmap_clear_password_change_requirement();

comment on column public.roadmaps.revision is
  'Server-managed optimistic concurrency token returned by roadmap RPCs.';
comment on column public.roadmaps.deleted_at is
  'Soft-delete timestamp; non-null rows remain recoverable but are excluded from active/public reads.';
comment on column public.roadmaps.last_mutation_id is
  'Client-generated UUID used to make an atomic save/delete/restore retry idempotent.';
comment on table public.roadmap_revisions is
  'Append-only, owner-readable full snapshots. Existing roadmaps begin at revision 0.';
comment on function public.roadmap_save_atomic(text, jsonb, text, text, text, boolean, bigint, uuid) is
  'Creates or saves an owner roadmap with optimistic concurrency; never overwrites a stale revision.';
comment on function public.roadmap_sanitize_public_doc(jsonb) is
  'Builds a bounded public roadmap from an explicit presentation-field allowlist; unknown/private keys are never returned.';
comment on function public.roadmap_clear_password_change_requirement() is
  'Clears app_metadata.must_change_password only in a transaction that actually changes auth.users.encrypted_password.';

-- Compatibility note for the follow-up cleanup migration (deploy only after
-- roadmap.html exclusively uses these RPCs):
--   * revoke direct table access on roadmaps/roadmap_shares from anon and
--     authenticated, then grant only any narrowly required owner operations;
--   * drop the permissive "read public roadmaps" table policy;
--   * keep shared_roadmap only for legacy links, or remove it after all clients
--     use roadmap_shared_get.
