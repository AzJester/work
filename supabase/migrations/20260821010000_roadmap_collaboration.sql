-- Per-roadmap collaboration without widening the browser's direct table access.
--
-- This migration is additive. Existing roadmap, share, and revision rows are
-- not rewritten or deleted. Collaboration remains behind SECURITY DEFINER
-- RPCs, matching the roadmap RPC-only cutover in 20260711193000.

create table if not exists public.roadmap_collaborators (
  id uuid primary key default gen_random_uuid(),
  roadmap_id text not null references public.roadmaps(id) on delete cascade,
  invite_email text not null,
  claimed_user_id uuid references auth.users(id) on delete set null,
  role text not null default 'editor',
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  revoked_at timestamptz,
  constraint roadmap_collaborators_role_check
    check (role in ('editor', 'viewer')),
  constraint roadmap_collaborators_email_normalized_check
    check (
      invite_email = pg_catalog.lower(pg_catalog.btrim(invite_email))
      and length(invite_email) between 3 and 320
    )
);

alter table public.roadmap_collaborators enable row level security;

-- No browser policies are created intentionally. The table is private and all
-- access is mediated by the audited RPCs below.
revoke all privileges on table public.roadmap_collaborators
  from public, anon, authenticated;

create index if not exists roadmap_collaborators_claimed_active_idx
  on public.roadmap_collaborators (claimed_user_id, roadmap_id)
  where claimed_user_id is not null and revoked_at is null;

-- A person can have only one effective role on a roadmap, even when their
-- Supabase sign-in email changes. The lookup-oriented index above remains
-- useful for portfolio reads; this second index is the authorization invariant.
create unique index if not exists roadmap_collaborators_active_user_key
  on public.roadmap_collaborators (roadmap_id, claimed_user_id)
  where claimed_user_id is not null and revoked_at is null;

create index if not exists roadmap_collaborators_pending_email_idx
  on public.roadmap_collaborators (invite_email, roadmap_id)
  where claimed_user_id is null and revoked_at is null;

create index if not exists roadmap_collaborators_owner_list_idx
  on public.roadmap_collaborators (roadmap_id, updated_at desc, id);

-- Only one effective grant exists for an email on a roadmap. Revoked rows are
-- deliberately outside this unique index so audit history remains append-like.
create unique index if not exists roadmap_collaborators_active_email_key
  on public.roadmap_collaborators (roadmap_id, invite_email)
  where revoked_at is null;

-- Deleting a Supabase Auth account must not turn its active grants back into
-- pending invitations through the claimed_user_id ON DELETE SET NULL action.
-- Revoke both grants already bound to the identity and still-pending grants for
-- its email. Covering the pending rows closes a concurrent claim/delete race;
-- the foreign key may then clear the deleted UUID without making access
-- reclaimable by a replacement account.
create or replace function public.roadmap_revoke_deleted_user_collaborations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_changed_at timestamptz := clock_timestamp();
begin
  update public.roadmap_collaborators c
     set revoked_at = v_changed_at,
         updated_at = v_changed_at
   where c.revoked_at is null
     and (
       c.claimed_user_id = old.id
       or (
         c.claimed_user_id is null
         and old.email is not null
         and c.invite_email = pg_catalog.lower(pg_catalog.btrim(old.email))
       )
     );

  return old;
end;
$$;

revoke all on function public.roadmap_revoke_deleted_user_collaborations()
  from public, anon, authenticated, service_role;

drop trigger if exists roadmap_revoke_deleted_user_collaborations on auth.users;
create trigger roadmap_revoke_deleted_user_collaborations
before delete on auth.users
for each row
execute function public.roadmap_revoke_deleted_user_collaborations();

-- Internal JSON helpers. They inherit the effective identity of their calling
-- SECURITY DEFINER RPC and are not executable directly by browser roles.
create or replace function public.roadmap_access_json(
  p_row public.roadmaps,
  p_access_role text
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select public.roadmap_owner_json(p_row) || jsonb_build_object(
    'access_role', p_access_role,
    'owner_email', coalesce(
      (select u.email from auth.users u where u.id = p_row.user_id),
      ''
    )
  );
$$;

create or replace function public.roadmap_collaborator_json(
  p_row public.roadmap_collaborators
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'roadmap_id', p_row.roadmap_id,
    'invite_email', p_row.invite_email,
    'role', p_row.role,
    'status', case
      when p_row.revoked_at is not null then 'revoked'
      when p_row.claimed_user_id is null then 'pending'
      else 'active'
    end,
    'invited_by', p_row.invited_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at,
    'claimed_at', p_row.claimed_at,
    'revoked_at', p_row.revoked_at
  );
$$;

revoke all on function public.roadmap_access_json(public.roadmaps, text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_collaborator_json(public.roadmap_collaborators)
  from public, anon, authenticated, service_role;

-- Claim one pending current-email invitation after first serializing on the
-- roadmap row. The current-email grant supersedes every older active grant for
-- the same account, so a stale Editor role cannot outrank a newer Viewer role.
-- Callers may already hold the roadmap lock; PostgreSQL row locks are reentrant
-- within the transaction.
create or replace function public.roadmap_claim_pending_invitation(
  p_roadmap_id text,
  p_user_id uuid,
  p_user_email text
)
returns boolean
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_roadmap_id text := pg_catalog.btrim(coalesce(p_roadmap_id, ''));
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_user_email, '')));
  v_pending_id uuid;
  v_changed_at timestamptz := clock_timestamp();
begin
  if v_roadmap_id = '' or p_user_id is null or v_email = '' then
    return false;
  end if;

  -- Every normal writer locks roadmaps before roadmap_collaborators. Keeping
  -- that order here prevents claim/save/invite/revoke deadlocks.
  perform 1
    from public.roadmaps r
   where r.id = v_roadmap_id
     and r.user_id <> p_user_id
   for update;

  if not found then
    return false;
  end if;

  select c.id
    into v_pending_id
    from public.roadmap_collaborators c
   where c.roadmap_id = v_roadmap_id
     and c.invite_email = v_email
     and c.claimed_user_id is null
     and c.revoked_at is null
   for update;

  if not found then
    return false;
  end if;

  -- Revoke first so the partial unique active-user index cannot reject the
  -- subsequent claim. The pending current-email row and its role always win.
  update public.roadmap_collaborators c
     set revoked_at = v_changed_at,
         updated_at = v_changed_at
   where c.roadmap_id = v_roadmap_id
     and c.claimed_user_id = p_user_id
     and c.id <> v_pending_id
     and c.revoked_at is null;

  update public.roadmap_collaborators c
     set claimed_user_id = p_user_id,
         claimed_at = v_changed_at,
         updated_at = v_changed_at
   where c.id = v_pending_id
     and c.claimed_user_id is null
     and c.revoked_at is null;

  return true;
end;
$$;

revoke all on function public.roadmap_claim_pending_invitation(text, uuid, text)
  from public, anon, authenticated, service_role;

-- Return the caller's owned roadmaps plus active roadmaps shared with the
-- caller. A pending invitation is claimed atomically when the signed-in user's
-- normalized email matches its invite email.
create or replace function public.roadmap_accessible_portfolio(
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_pending_roadmap_id text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'roadmap_accessible_portfolio requires an authenticated user';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email))
    into v_user_email
    from auth.users u
   where u.id = v_user_id;

  if v_user_email is not null and v_user_email <> '' then
    -- Discover pending rows without locking them, then claim one roadmap at a
    -- time in stable order. The helper always takes the roadmap lock before a
    -- collaborator lock, matching save/invite/revoke.
    for v_pending_roadmap_id in
      select distinct c.roadmap_id
        from public.roadmap_collaborators c
       where c.invite_email = v_user_email
         and c.claimed_user_id is null
         and c.revoked_at is null
       order by c.roadmap_id
    loop
      perform public.roadmap_claim_pending_invitation(
        v_pending_roadmap_id,
        v_user_id,
        v_user_email
      );
    end loop;
  end if;

  select coalesce(
    jsonb_agg(accessible.payload order by accessible.updated_at desc, accessible.id),
    '[]'::jsonb
  )
    into v_result
    from (
      select public.roadmap_access_json(r, 'owner') as payload,
             r.updated_at,
             r.id
        from public.roadmaps r
       where r.user_id = v_user_id
         and (coalesce(p_include_deleted, false) or r.deleted_at is null)

      union all

      select public.roadmap_access_json(r, c.role) as payload,
             r.updated_at,
             r.id
        from public.roadmaps r
        join public.roadmap_collaborators c
          on c.roadmap_id = r.id
         and c.claimed_user_id = v_user_id
         and c.revoked_at is null
       where r.user_id <> v_user_id
         and r.deleted_at is null
    ) accessible;

  return v_result;
end;
$$;

-- Owners can inspect both active and revoked collaborator records for audit.
create or replace function public.roadmap_collaborator_list(p_roadmap_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_roadmap_id text := pg_catalog.btrim(coalesce(p_roadmap_id, ''));
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'roadmap_collaborator_list requires an authenticated user';
  end if;

  if not exists (
    select 1
      from public.roadmaps r
     where r.id = v_roadmap_id
       and r.user_id = v_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'roadmap_collaborator_list requires roadmap ownership';
  end if;

  select coalesce(
    jsonb_agg(
      public.roadmap_collaborator_json(c)
      order by (c.revoked_at is not null), c.updated_at desc, c.id
    ),
    '[]'::jsonb
  )
    into v_result
    from public.roadmap_collaborators c
   where c.roadmap_id = v_roadmap_id;

  return v_result;
end;
$$;

-- Invite by normalized email. Reusing this RPC updates an active grant's role.
-- Re-inviting after revocation creates a new active row so the revoked record
-- remains an immutable audit fact.
create or replace function public.roadmap_collaborator_invite(
  p_roadmap_id text,
  p_email text,
  p_role text default 'editor'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_roadmap_id text := pg_catalog.btrim(coalesce(p_roadmap_id, ''));
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_role text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')));
  v_owner_email text;
  v_collaborator public.roadmap_collaborators%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'roadmap_collaborator_invite requires an authenticated user';
  end if;
  if v_email = '' or length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'p_email must be a valid email address';
  end if;
  if v_role not in ('editor', 'viewer') then
    raise exception using errcode = '22023', message = 'p_role must be editor or viewer';
  end if;

  perform 1
    from public.roadmaps r
   where r.id = v_roadmap_id
     and r.user_id = v_user_id
     and r.deleted_at is null
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'collaborator', null);
  end if;

  -- Compare only the caller's own Auth row to reject a self-invite. Looking up
  -- an arbitrary target email here would turn this RPC into an account-existence
  -- oracle. Targets claim their pending invitations on their next access sync.
  select pg_catalog.lower(pg_catalog.btrim(u.email))
    into v_owner_email
    from auth.users u
   where u.id = v_user_id;

  if v_owner_email is not null and v_email = v_owner_email then
    raise exception using errcode = '22023', message = 'the roadmap owner is not a collaborator';
  end if;

  -- The roadmap row lock above serializes owner invite changes for this
  -- roadmap. Updating an active row never rebinds it to a different account:
  -- after an auth-email change, a role edit must preserve the claimed identity.
  -- Re-inviting after revocation inserts a new row and leaves audit history.
  select c.*
    into v_collaborator
    from public.roadmap_collaborators c
   where c.roadmap_id = v_roadmap_id
     and c.invite_email = v_email
     and c.revoked_at is null
   for update;

  if found then
    update public.roadmap_collaborators c
       set role = v_role,
           invited_by = v_user_id,
           updated_at = clock_timestamp()
     where c.id = v_collaborator.id
    returning * into v_collaborator;
  else
    insert into public.roadmap_collaborators (
      roadmap_id,
      invite_email,
      role,
      invited_by,
      revoked_at
    ) values (
      v_roadmap_id,
      v_email,
      v_role,
      v_user_id,
      null
    )
    returning * into v_collaborator;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', case when v_collaborator.claimed_user_id is null then 'invited' else 'active' end,
    'collaborator', public.roadmap_collaborator_json(v_collaborator)
  );
end;
$$;

-- Revocation is soft and owner-only so the invitation remains auditable.
create or replace function public.roadmap_collaborator_revoke(p_collaborator_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_roadmap_id text;
  v_collaborator public.roadmap_collaborators%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'roadmap_collaborator_revoke requires an authenticated user';
  end if;
  if p_collaborator_id is null then
    raise exception using errcode = '22023', message = 'p_collaborator_id is required';
  end if;

  -- Lock the roadmap explicitly before its collaborator row, matching every
  -- claim/save/invite path. Once this RPC returns, an editor save authorized by
  -- this grant cannot still be waiting to commit behind the revocation.
  select r.id
    into v_roadmap_id
    from public.roadmaps r
    join public.roadmap_collaborators c
      on c.roadmap_id = r.id
   where r.user_id = v_user_id
     and c.id = p_collaborator_id
   for update of r;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'collaborator', null);
  end if;

  select c.*
    into v_collaborator
    from public.roadmap_collaborators c
   where c.id = p_collaborator_id
     and c.roadmap_id = v_roadmap_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'collaborator', null);
  end if;

  if v_collaborator.revoked_at is null then
    update public.roadmap_collaborators c
       set revoked_at = clock_timestamp(),
           updated_at = clock_timestamp()
     where c.id = v_collaborator.id
    returning * into v_collaborator;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', 'revoked',
    'collaborator', public.roadmap_collaborator_json(v_collaborator)
  );
end;
$$;

-- Replace the existing same-signature atomic save RPC. Creation remains
-- owner-owned. Existing active rows may be changed by the owner or an active
-- editor. Viewers and outsiders receive the same non-enumerating rejection.
-- Editors cannot change publication, archive, deletion, or ownership state.
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
  v_user_email text;
  v_id text := pg_catalog.btrim(coalesce(p_id, ''));
  v_row public.roadmaps%rowtype;
  v_access_role text;
  v_doc_to_save jsonb := p_doc;
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

  select pg_catalog.lower(pg_catalog.btrim(u.email))
    into v_user_email
    from auth.users u
   where u.id = v_user_id;

  select r.*
    into v_row
    from public.roadmaps r
   where r.id = v_id
   for update;

  if found then
    if v_row.user_id = v_user_id then
      v_access_role := 'owner';
    else
      -- Claim a matching pending invite here too, so a deep-linked editor does
      -- not have to open the portfolio before the first authorized save.
      if v_user_email is not null and v_user_email <> '' then
        -- v_row is already locked, so the helper preserves the required
        -- roadmap-before-collaborator order while making the current-email role
        -- authoritative.
        perform public.roadmap_claim_pending_invitation(
          v_row.id,
          v_user_id,
          v_user_email
        );
      end if;

      select case
               when pg_catalog.bool_or(c.role = 'editor') then 'editor'
               when pg_catalog.count(*) > 0 then 'viewer'
               else null
             end
        into v_access_role
        from public.roadmap_collaborators c
       where c.roadmap_id = v_row.id
         and c.claimed_user_id = v_user_id
         and c.revoked_at is null;
    end if;

    if v_access_role not in ('owner', 'editor') or v_access_role is null then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'id_unavailable',
        'roadmap', null
      );
    end if;

    -- Only the owner may receive recovery details for a deleted roadmap.
    -- A former editor gets the same non-enumerating response as an outsider.
    if v_row.deleted_at is not null and v_access_role <> 'owner' then
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
        'roadmap', public.roadmap_access_json(v_row, v_access_role)
      );
    end if;

    if v_row.deleted_at is not null then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'roadmap_deleted',
        'roadmap', public.roadmap_access_json(v_row, v_access_role)
      );
    end if;

    if p_expected_revision is null or p_expected_revision <> v_row.revision then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'revision_mismatch',
        'expected_revision', p_expected_revision,
        'actual_revision', v_row.revision,
        'roadmap', public.roadmap_access_json(v_row, v_access_role)
      );
    end if;

    if v_access_role = 'editor' then
      v_doc_to_save := jsonb_set(
        jsonb_set(
          p_doc,
          '{public}',
          pg_catalog.to_jsonb(v_row.public),
          true
        ),
        '{archived}',
        case
          when jsonb_typeof(v_row.doc->'archived') = 'boolean' then v_row.doc->'archived'
          else 'false'::jsonb
        end,
        true
      );
    end if;

    update public.roadmaps r
       set title = left(coalesce(p_title, ''), 500),
           subtitle = left(coalesce(p_subtitle, ''), 1000),
           template_type = left(coalesce(nullif(pg_catalog.btrim(p_template_type), ''), 'custom'), 100),
           public = case
             when v_access_role = 'owner' then coalesce(p_public, false)
             else v_row.public
           end,
           doc = v_doc_to_save,
           last_mutation_id = p_mutation_id
     where r.id = v_id
    returning r.* into v_row;

    return jsonb_build_object(
      'ok', true,
      'conflict', false,
      'reason', 'saved',
      'roadmap', public.roadmap_access_json(v_row, v_access_role)
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
      left(coalesce(nullif(pg_catalog.btrim(p_template_type), ''), 'custom'), 100),
      coalesce(p_public, false),
      p_doc,
      p_mutation_id,
      v_user_id
    )
    returning * into v_row;
  exception
    when unique_violation then
      select r.*
        into v_row
        from public.roadmaps r
       where r.id = v_id;

      if found and v_row.user_id = v_user_id and v_row.last_mutation_id = p_mutation_id then
        return jsonb_build_object(
          'ok', true,
          'conflict', false,
          'reason', 'idempotent_replay',
          'roadmap', public.roadmap_access_json(v_row, 'owner')
        );
      end if;

      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', case when found and v_row.user_id = v_user_id then 'concurrent_create' else 'id_unavailable' end,
        'actual_revision', case when found and v_row.user_id = v_user_id then v_row.revision else null end,
        'roadmap', case
          when found and v_row.user_id = v_user_id then public.roadmap_access_json(v_row, 'owner')
          else null
        end
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'reason', 'created',
    'roadmap', public.roadmap_access_json(v_row, 'owner')
  );
end;
$$;

-- Explicitly expose only the RPC surface to authenticated clients.
revoke all on function public.roadmap_accessible_portfolio(boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_collaborator_list(text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_collaborator_invite(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_collaborator_revoke(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.roadmap_save_atomic(text, jsonb, text, text, text, boolean, bigint, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.roadmap_accessible_portfolio(boolean) to authenticated;
grant execute on function public.roadmap_collaborator_list(text) to authenticated;
grant execute on function public.roadmap_collaborator_invite(text, text, text) to authenticated;
grant execute on function public.roadmap_collaborator_revoke(uuid) to authenticated;
grant execute on function public.roadmap_save_atomic(text, jsonb, text, text, text, boolean, bigint, uuid) to authenticated;

comment on table public.roadmap_collaborators is
  'Private per-roadmap editor/viewer grants, including pending email invitations and soft-revocation history.';
comment on function public.roadmap_accessible_portfolio(boolean) is
  'Claims pending email invitations and returns the caller''s owned and active shared roadmaps with access_role and owner_email.';
comment on function public.roadmap_collaborator_list(text) is
  'Owner-only collaborator and invitation audit list for one roadmap.';
comment on function public.roadmap_collaborator_invite(text, text, text) is
  'Owner-only invitation, audit-preserving re-invitation, and editor/viewer role update by normalized email.';
comment on function public.roadmap_collaborator_revoke(uuid) is
  'Owner-only soft revocation of a roadmap collaborator grant.';
comment on function public.roadmap_save_atomic(text, jsonb, text, text, text, boolean, bigint, uuid) is
  'Optimistic atomic roadmap save for owners and active editors; editors cannot change publication, archive, deletion, or ownership state.';
