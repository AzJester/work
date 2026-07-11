-- Final roadmap RPC-only cutover.
--
-- This migration changes privileges and row-level-security policy metadata
-- only. It does not modify roadmap, share, or revision rows. Abort before any
-- permission change unless every API used by the deployed sites is present.

do $$
declare
  v_signature text;
  v_proc_oid oid;
  v_safe_definer boolean;
begin
  foreach v_signature in array array[
    'public.roadmap_owner_portfolio(boolean)',
    'public.roadmap_save_atomic(text,jsonb,text,text,text,boolean,bigint,uuid)',
    'public.roadmap_soft_delete(text,bigint,uuid)',
    'public.roadmap_restore(text,bigint,uuid)',
    'public.roadmap_public_list()',
    'public.roadmap_public_get(text)',
    'public.roadmap_share_create(text,text,timestamptz)',
    'public.roadmap_share_list(text)',
    'public.roadmap_share_revoke(uuid)',
    'public.roadmap_shared_get(uuid)',
    'public.shared_roadmap(uuid)'
  ]
  loop
    v_proc_oid := pg_catalog.to_regprocedure(v_signature);
    if v_proc_oid is null then
      raise exception using
        errcode = '55000',
        message = format('roadmap RPC-only cutover aborted: missing %s', v_signature);
    end if;

    select p.prosecdef
           and (
             owner_role.rolbypassrls
             or (p.proowner = roadmap_table.relowner and p.proowner = share_table.relowner)
           )
      into v_safe_definer
      from pg_catalog.pg_proc p
      join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
      join pg_catalog.pg_class roadmap_table
        on roadmap_table.oid = 'public.roadmaps'::pg_catalog.regclass
      join pg_catalog.pg_class share_table
        on share_table.oid = 'public.roadmap_shares'::pg_catalog.regclass
     where p.oid = v_proc_oid;

    if not coalesce(v_safe_definer, false) then
      raise exception using
        errcode = '55000',
        message = format(
          'roadmap RPC-only cutover aborted: %s is not a safe SECURITY DEFINER',
          v_signature
        );
    end if;

    if not pg_catalog.has_function_privilege('authenticated', v_proc_oid, 'EXECUTE') then
      raise exception using
        errcode = '55000',
        message = format(
          'roadmap RPC-only cutover aborted: authenticated cannot execute %s',
          v_signature
        );
    end if;

    if v_signature = any(array[
      'public.roadmap_public_list()',
      'public.roadmap_public_get(text)',
      'public.roadmap_shared_get(uuid)',
      'public.shared_roadmap(uuid)'
    ]) and not pg_catalog.has_function_privilege('anon', v_proc_oid, 'EXECUTE') then
      raise exception using
        errcode = '55000',
        message = format(
          'roadmap RPC-only cutover aborted: anon cannot execute %s',
          v_signature
        );
    end if;
  end loop;
end;
$$;

-- Remove the legacy browser policies. The SECURITY DEFINER RPCs keep their
-- explicit EXECUTE grants and remain the only browser-facing data boundary.
drop policy if exists "read public roadmaps" on public.roadmaps;
drop policy if exists "own roadmaps" on public.roadmaps;
drop policy if exists roadmap_active_or_owner_read_guard on public.roadmaps;
drop policy if exists "own shares" on public.roadmap_shares;

-- Do not silently remove a production-only policy that was not part of the
-- tracked setup. Any such drift needs an explicit review before the cutover.
do $$
declare
  v_unexpected text;
begin
  select pg_catalog.string_agg(policy.polname, ', ' order by policy.polname)
    into v_unexpected
    from pg_catalog.pg_policy policy
   where policy.polrelid in (
     'public.roadmaps'::pg_catalog.regclass,
     'public.roadmap_shares'::pg_catalog.regclass
   );

  if v_unexpected is not null then
    raise exception using
      errcode = '55000',
      message = format(
        'roadmap RPC-only cutover aborted: unexpected policies remain: %s',
        v_unexpected
      );
  end if;
end;
$$;

revoke all privileges on table public.roadmaps
  from public, anon, authenticated;
revoke all privileges on table public.roadmap_shares
  from public, anon, authenticated;
