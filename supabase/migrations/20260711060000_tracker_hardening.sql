-- Tracker persistence/security hardening.
--
-- Assumptions inherited from tracker.html:
--   * public.reports already has id, user_id, week_ending, prepared_by,
--     meeting_notes, and ai_summary, with one report per (user_id, week_ending).
--   * public.tasks already has report_id, position, task, status, priority,
--     progress, note, project, due_date, items, started_on, and completed_on.
--   * public.shares has user_id, token, and revoked when that optional feature
--     is provisioned.
--
-- The existing shared_dashboard() return shape is not versioned in this
-- repository. secure_shared_dashboard() below wraps it, enforces the link
-- lifecycle and data scope, and becomes the only anonymously executable RPC.
--
-- logical_id is identity of the same task across weekly snapshots. Existing
-- rows receive independent UUIDs because guessing identity from task titles
-- could merge unrelated work. Carry-forward clients should preserve it.
-- The legacy delete/reinsert client will still generate new logical IDs until
-- it switches to save_week_atomic().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Stable logical task identity, structured updates, and optimistic revisions
-- ---------------------------------------------------------------------------

alter table public.reports
  add column if not exists revision bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.reports set revision = 0 where revision is null;
update public.reports set updated_at = now() where updated_at is null;
alter table public.reports alter column revision set default 0;
alter table public.reports alter column revision set not null;
alter table public.reports alter column updated_at set default now();
alter table public.reports alter column updated_at set not null;

alter table public.tasks
  add column if not exists logical_id uuid,
  add column if not exists updates jsonb not null default '[]'::jsonb,
  add column if not exists blocked_by text not null default '',
  add column if not exists waiting_on text not null default '',
  add column if not exists follow_up_on date,
  add column if not exists updated_at timestamptz not null default now();

update public.tasks set logical_id = gen_random_uuid() where logical_id is null;
update public.tasks set updates = '[]'::jsonb where updates is null;
update public.tasks set blocked_by = '' where blocked_by is null;
update public.tasks set waiting_on = '' where waiting_on is null;
update public.tasks set updated_at = now() where updated_at is null;
alter table public.tasks alter column logical_id set default gen_random_uuid();
alter table public.tasks alter column logical_id set not null;
alter table public.tasks alter column updates set default '[]'::jsonb;
alter table public.tasks alter column updates set not null;
alter table public.tasks alter column blocked_by set default '';
alter table public.tasks alter column blocked_by set not null;
alter table public.tasks alter column waiting_on set default '';
alter table public.tasks alter column waiting_on set not null;
alter table public.tasks alter column updated_at set default now();
alter table public.tasks alter column updated_at set not null;

-- Required by the existing frontend's onConflict target and by atomic saves.
-- If either index creation finds duplicates, stop and reconcile them rather
-- than silently selecting a winner.
create unique index if not exists tracker_reports_user_week_uidx
  on public.reports (user_id, week_ending);
create unique index if not exists tracker_tasks_report_logical_uidx
  on public.tasks (report_id, logical_id);
create index if not exists tracker_tasks_report_position_idx
  on public.tasks (report_id, position);
create index if not exists tracker_tasks_logical_id_idx
  on public.tasks (logical_id);

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logical_id uuid not null,
  update_date date not null,
  body text not null check (length(btrim(body)) > 0),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_task_updates_user_task_date_idx
  on public.task_updates (user_id, logical_id, update_date desc, created_at desc);
create index if not exists tracker_task_updates_user_created_idx
  on public.task_updates (user_id, created_at desc);

-- Keep updated_at trustworthy. Direct/legacy report updates also advance the
-- revision; save_week_atomic supplies its own next revision and is not doubled.
create or replace function public.tracker_touch_report()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  if new.revision is not distinct from old.revision then
    new.revision := old.revision + 1;
  elsif new.revision <> old.revision + 1 then
    raise exception using
      errcode = '22023',
      message = 'report revision must advance by exactly one';
  end if;
  return new;
end;
$$;

drop trigger if exists tracker_touch_report on public.reports;
create trigger tracker_touch_report
before update on public.reports
for each row execute function public.tracker_touch_report();

create or replace function public.tracker_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists tracker_touch_task on public.tasks;
create trigger tracker_touch_task
before update on public.tasks
for each row execute function public.tracker_touch_updated_at();

drop trigger if exists tracker_touch_task_update on public.task_updates;
create trigger tracker_touch_task_update
before update on public.task_updates
for each row execute function public.tracker_touch_updated_at();

-- Remove independent update-log rows after the last weekly snapshot of a task
-- is deleted. Keeping an older weekly snapshot keeps its history intact.
create or replace function public.tracker_cleanup_orphan_updates()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is not null and not exists (
    select 1
      from public.tasks t
      join public.reports r on r.id = t.report_id
     where t.logical_id = old.logical_id
       and r.user_id = v_user_id
  ) then
    delete from public.task_updates tu
     where tu.user_id = v_user_id
       and tu.logical_id = old.logical_id;
  end if;
  return old;
end;
$$;

drop trigger if exists tracker_cleanup_orphan_updates on public.tasks;
create trigger tracker_cleanup_orphan_updates
after delete on public.tasks
for each row execute function public.tracker_cleanup_orphan_updates();

revoke all on function public.tracker_touch_report() from public;
revoke all on function public.tracker_touch_updated_at() from public;
revoke all on function public.tracker_cleanup_orphan_updates() from public;

-- ---------------------------------------------------------------------------
-- Atomic whole-week save with ownership and revision/conflict enforcement
-- ---------------------------------------------------------------------------

create or replace function public.save_week_atomic(
  p_week_ending date,
  p_prepared_by text,
  p_meeting_notes text,
  p_ai_summary text,
  p_expected_revision bigint,
  p_tasks jsonb,
  p_deleted_updates jsonb,
  p_expected_report_id uuid,
  p_delete_week boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_report record;
  v_next_revision bigint;
  v_report_exists boolean;
  v_ledger_only boolean := false;
  v_tasks jsonb := coalesce(p_tasks, '[]'::jsonb);
  v_deleted_groups jsonb := coalesce(p_deleted_updates, '[]'::jsonb);
  v_deleted_group jsonb;
  v_deleted_total integer := 0;
  v_item jsonb;
  v_ordinal bigint;
  v_logical_text text;
  v_logical_id uuid;
  v_seen_ids uuid[] := array[]::uuid[];
  v_position_text text;
  v_position integer;
  v_progress_text text;
  v_progress integer;
  v_due_text text;
  v_started_text text;
  v_completed_text text;
  v_follow_up_text text;
  v_items jsonb;
  v_updates jsonb;
  v_deleted_updates jsonb;
  v_deleted_update_id_text text;
  v_deleted_update_id uuid;
  v_touched_report_ids text[] := array[]::text[];
  v_affected_report_ids text[];
  v_update jsonb;
  v_update_id_text text;
  v_update_id uuid;
  v_update_date_text text;
  v_update_date date;
  v_update_body text;
  v_update_source text;
  v_row_count bigint;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'save_week_atomic requires an authenticated user';
  end if;
  if p_week_ending is null then
    raise exception using errcode = '22023', message = 'p_week_ending is required';
  end if;
  if jsonb_typeof(v_tasks) <> 'array' then
    raise exception using errcode = '22023', message = 'p_tasks must be a JSON array';
  end if;
  if jsonb_array_length(v_tasks) > 500 then
    raise exception using errcode = '22023', message = 'p_tasks exceeds the 500-task limit';
  end if;
  if jsonb_typeof(v_deleted_groups) <> 'array' then
    raise exception using errcode = '22023', message = 'p_deleted_updates must be a JSON array';
  end if;
  if jsonb_array_length(v_deleted_groups) > 500 then
    raise exception using errcode = '22023', message = 'p_deleted_updates exceeds the 500-group limit';
  end if;

  select r.id, r.revision
    into v_report
    from public.reports r
   where r.user_id = v_user_id
     and r.week_ending = p_week_ending
   for update;
  v_report_exists := found;

  if coalesce(p_delete_week, false) then
    v_ledger_only := p_expected_report_id is null
      or not v_report_exists
      or v_report.id <> p_expected_report_id;
  end if;

  if not v_ledger_only then
  if not v_report_exists then
    if p_expected_report_id is not null
       or (p_expected_revision is not null and p_expected_revision <> 0) then
      raise exception using
        errcode = '40001',
        message = 'save_week_atomic revision conflict',
        detail = jsonb_build_object(
          'expected_report_id', p_expected_report_id,
          'actual_report_id', null,
          'expected_revision', p_expected_revision,
          'actual_revision', null,
          'week_ending', p_week_ending
        )::text;
    end if;

    insert into public.reports (
      user_id, week_ending, prepared_by, meeting_notes, ai_summary, revision, updated_at
    ) values (
      v_user_id,
      p_week_ending,
      coalesce(p_prepared_by, ''),
      coalesce(p_meeting_notes, ''),
      coalesce(p_ai_summary, ''),
      0,
      clock_timestamp()
    )
    on conflict (user_id, week_ending) do nothing
    returning id, revision into v_report;

    if not found then
      -- Another transaction created this week after our first lookup. Do not
      -- turn a create into a blind overwrite.
      select r.id, r.revision
        into v_report
        from public.reports r
       where r.user_id = v_user_id
         and r.week_ending = p_week_ending
       for update;
      raise exception using
        errcode = '40001',
        message = 'save_week_atomic revision conflict',
        detail = jsonb_build_object(
          'expected_revision', p_expected_revision,
          'actual_revision', v_report.revision,
          'week_ending', p_week_ending
        )::text;
    end if;
  else
    -- NULL is valid only for a create. Existing reports require the revision
    -- and immutable report ID returned by load/save so stale tabs and devices
    -- cannot overwrite a replacement report whose revision restarted.
    if p_expected_report_id is null
       or p_expected_report_id <> v_report.id
       or p_expected_revision is null
       or p_expected_revision <> v_report.revision then
      raise exception using
        errcode = '40001',
        message = 'save_week_atomic revision conflict',
        detail = jsonb_build_object(
          'expected_report_id', p_expected_report_id,
          'actual_report_id', v_report.id,
          'expected_revision', p_expected_revision,
          'actual_revision', v_report.revision,
          'week_ending', p_week_ending
        )::text;
    end if;
  end if;

  for v_item, v_ordinal in
    select value, ordinality
      from jsonb_array_elements(v_tasks) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'every p_tasks item must be an object';
    end if;

    v_logical_text := nullif(btrim(coalesce(v_item->>'logical_id', '')), '');
    if v_logical_text is null then
      v_logical_id := gen_random_uuid();
    elsif v_logical_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_logical_id := v_logical_text::uuid;
    else
      raise exception using errcode = '22023', message = 'task logical_id is not a valid UUID';
    end if;

    if v_logical_id = any(v_seen_ids) then
      raise exception using errcode = '22023', message = 'p_tasks contains a duplicate logical_id';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_logical_id);

    v_position_text := nullif(btrim(coalesce(v_item->>'position', '')), '');
    if v_position_text is null then
      v_position := (v_ordinal - 1)::integer;
    elsif v_position_text ~ '^[0-9]+$' then
      v_position := v_position_text::integer;
    else
      raise exception using errcode = '22023', message = 'task position must be a non-negative integer';
    end if;

    v_progress_text := nullif(btrim(coalesce(v_item->>'progress', v_item->>'prog', '')), '');
    if v_progress_text is null then
      v_progress := 0;
    elsif v_progress_text ~ '^-?[0-9]+$' then
      v_progress := least(100, greatest(0, v_progress_text::integer));
    else
      raise exception using errcode = '22023', message = 'task progress must be an integer';
    end if;

    v_due_text := nullif(btrim(coalesce(v_item->>'due_date', v_item->>'due', '')), '');
    v_started_text := nullif(btrim(coalesce(v_item->>'started_on', v_item->>'started', '')), '');
    v_completed_text := nullif(btrim(coalesce(v_item->>'completed_on', v_item->>'completed', '')), '');
    v_follow_up_text := nullif(btrim(coalesce(v_item->>'follow_up_on', '')), '');
    v_items := case when jsonb_typeof(v_item->'items') = 'array' then v_item->'items' else '[]'::jsonb end;
    v_updates := case when jsonb_typeof(v_item->'updates') = 'array' then v_item->'updates' else '[]'::jsonb end;
    v_deleted_updates := case when jsonb_typeof(v_item->'deleted_update_ids') = 'array' then v_item->'deleted_update_ids' else '[]'::jsonb end;
    if jsonb_array_length(v_deleted_updates) > 100 then
      raise exception using errcode = '22023', message = 'task deleted_update_ids exceeds the 100-item limit';
    end if;

    insert into public.tasks (
      report_id,
      logical_id,
      position,
      task,
      status,
      priority,
      progress,
      note,
      project,
      due_date,
      items,
      started_on,
      completed_on,
      updates,
      blocked_by,
      waiting_on,
      follow_up_on,
      updated_at
    ) values (
      v_report.id,
      v_logical_id,
      v_position,
      coalesce(v_item->>'task', ''),
      coalesce(v_item->>'status', 'On Track'),
      coalesce(v_item->>'priority', v_item->>'pri', 'Med'),
      v_progress,
      coalesce(v_item->>'note', ''),
      coalesce(v_item->>'project', ''),
      v_due_text::date,
      v_items,
      v_started_text::date,
      v_completed_text::date,
      v_updates,
      coalesce(v_item->>'blocked_by', v_item->>'blocker', ''),
      coalesce(v_item->>'waiting_on', ''),
      v_follow_up_text::date,
      clock_timestamp()
    )
    on conflict (report_id, logical_id) do update set
      position = excluded.position,
      task = excluded.task,
      status = excluded.status,
      priority = excluded.priority,
      progress = excluded.progress,
      note = excluded.note,
      project = excluded.project,
      due_date = excluded.due_date,
      items = excluded.items,
      started_on = excluded.started_on,
      completed_on = excluded.completed_on,
      updates = excluded.updates,
      blocked_by = excluded.blocked_by,
      waiting_on = excluded.waiting_on,
      follow_up_on = excluded.follow_up_on,
      updated_at = excluded.updated_at;

    -- Mirror well-formed structured updates into an account-owned log. Update
    -- objects are {id?, date|update_date, text|body, source?}. If id is absent,
    -- a deterministic UUID makes repeated saves idempotent. Explicit client
    -- tombstones below provide a precise, account-scoped global delete.
    for v_update in select value from jsonb_array_elements(v_updates)
    loop
      if jsonb_typeof(v_update) <> 'object' then
        raise exception using errcode = '22023', message = 'task updates must contain objects';
      end if;
      v_update_body := btrim(coalesce(v_update->>'text', v_update->>'body', ''));
      if v_update_body = '' then
        continue;
      end if;
      v_update_date_text := nullif(btrim(coalesce(v_update->>'date', v_update->>'update_date', '')), '');
      if v_update_date_text is null or v_update_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = 'task update date must be YYYY-MM-DD';
      end if;
      v_update_date := v_update_date_text::date;
      v_update_source := coalesce(nullif(btrim(coalesce(v_update->>'source', '')), ''), 'manual');
      v_update_id_text := nullif(btrim(coalesce(v_update->>'id', v_update->>'update_id', '')), '');
      if v_update_id_text is null then
        v_update_id := md5(concat_ws(
          chr(31),
          v_user_id::text,
          v_logical_id::text,
          v_update_date::text,
          v_update_body,
          v_update_source
        ))::uuid;
      elsif v_update_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        v_update_id := v_update_id_text::uuid;
      else
        raise exception using errcode = '22023', message = 'task update id is not a valid UUID';
      end if;

      insert into public.task_updates as tu (
        id, user_id, logical_id, update_date, body, source, updated_at
      ) values (
        v_update_id,
        v_user_id,
        v_logical_id,
        v_update_date,
        v_update_body,
        v_update_source,
        clock_timestamp()
      )
      on conflict (id) do update set
        logical_id = excluded.logical_id,
        update_date = excluded.update_date,
        body = excluded.body,
        source = excluded.source,
        updated_at = excluded.updated_at
      where tu.user_id = v_user_id;
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception using errcode = '42501', message = 'task update id belongs to another user';
      end if;
    end loop;

    for v_deleted_update_id_text in
      select value from jsonb_array_elements_text(v_deleted_updates)
    loop
      if v_deleted_update_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'deleted update id is not a valid UUID';
      end if;
      v_deleted_update_id := v_deleted_update_id_text::uuid;

      -- Remove the update from every snapshot of the same logical task so a
      -- user's Delete action does not leave the text in an older shared week.
      with changed as (
        update public.tasks t
           set updates = coalesce((
             select jsonb_agg(u.value order by u.ordinality)
               from jsonb_array_elements(
                 case when jsonb_typeof(t.updates) = 'array' then t.updates else '[]'::jsonb end
               ) with ordinality u(value, ordinality)
              where lower(coalesce(u.value->>'id', '')) <> lower(v_deleted_update_id_text)
           ), '[]'::jsonb)
          from public.reports r
         where r.id = t.report_id
           and r.user_id = v_user_id
           and t.logical_id = v_logical_id
           and exists (
             select 1
               from jsonb_array_elements(
                 case when jsonb_typeof(t.updates) = 'array' then t.updates else '[]'::jsonb end
               ) existing
              where lower(coalesce(existing.value->>'id', '')) = lower(v_deleted_update_id_text)
           )
        returning t.report_id::text as report_id
      )
      select coalesce(array_agg(distinct report_id), array[]::text[])
        into v_affected_report_ids
        from changed;
      select coalesce(array_agg(distinct report_id), array[]::text[])
        into v_touched_report_ids
        from unnest(v_touched_report_ids || v_affected_report_ids) as touched(report_id);

      delete from public.task_updates tu
       where tu.id = v_deleted_update_id
         and tu.user_id = v_user_id
         and tu.logical_id = v_logical_id;
    end loop;
  end loop;
  end if;

  -- Process update tombstones independently of current task rows. This ledger
  -- preserves a deletion even when the user removes its task before a queued
  -- save reaches the server.
  for v_deleted_group in select value from jsonb_array_elements(v_deleted_groups)
  loop
    if jsonb_typeof(v_deleted_group) <> 'object' then
      raise exception using errcode = '22023', message = 'every p_deleted_updates item must be an object';
    end if;
    v_logical_text := nullif(btrim(coalesce(v_deleted_group->>'logical_id', '')), '');
    if v_logical_text is null or v_logical_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'deleted update group logical_id is not a valid UUID';
    end if;
    v_logical_id := v_logical_text::uuid;
    v_deleted_updates := case when jsonb_typeof(v_deleted_group->'update_ids') = 'array' then v_deleted_group->'update_ids' else '[]'::jsonb end;
    if jsonb_array_length(v_deleted_updates) > 100 then
      raise exception using errcode = '22023', message = 'deleted update group exceeds the 100-item limit';
    end if;
    v_deleted_total := v_deleted_total + jsonb_array_length(v_deleted_updates);
    if v_deleted_total > 500 then
      raise exception using errcode = '22023', message = 'p_deleted_updates exceeds the 500-id limit';
    end if;

    for v_deleted_update_id_text in select value from jsonb_array_elements_text(v_deleted_updates)
    loop
      if v_deleted_update_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'deleted update id is not a valid UUID';
      end if;
      v_deleted_update_id := v_deleted_update_id_text::uuid;

      with changed as (
        update public.tasks t
           set updates = coalesce((
             select jsonb_agg(u.value order by u.ordinality)
               from jsonb_array_elements(
                 case when jsonb_typeof(t.updates) = 'array' then t.updates else '[]'::jsonb end
               ) with ordinality u(value, ordinality)
              where lower(coalesce(u.value->>'id', '')) <> lower(v_deleted_update_id_text)
           ), '[]'::jsonb)
          from public.reports r
         where r.id = t.report_id
           and r.user_id = v_user_id
           and t.logical_id = v_logical_id
           and exists (
             select 1
               from jsonb_array_elements(
                 case when jsonb_typeof(t.updates) = 'array' then t.updates else '[]'::jsonb end
               ) existing
              where lower(coalesce(existing.value->>'id', '')) = lower(v_deleted_update_id_text)
           )
        returning t.report_id::text as report_id
      )
      select coalesce(array_agg(distinct report_id), array[]::text[])
        into v_affected_report_ids
        from changed;
      select coalesce(array_agg(distinct report_id), array[]::text[])
        into v_touched_report_ids
        from unnest(v_touched_report_ids || v_affected_report_ids) as touched(report_id);

      delete from public.task_updates tu
       where tu.id = v_deleted_update_id
         and tu.user_id = v_user_id
         and tu.logical_id = v_logical_id;
    end loop;
  end loop;

  -- Cross-week tombstones mutate older task snapshots. Advance each affected
  -- report once so an already-open stale week conflicts instead of restoring
  -- a deleted update. The current report advances in the normal save below.
  update public.reports r
     set revision = r.revision + 1,
         updated_at = clock_timestamp()
   where r.user_id = v_user_id
     and r.id::text = any(v_touched_report_ids)
     and (v_ledger_only or r.id <> v_report.id);

  if coalesce(p_delete_week, false) then
    if v_ledger_only then
      v_next_revision := null;
      if v_report_exists then
        select r.revision into v_next_revision from public.reports r where r.id = v_report.id and r.user_id = v_user_id;
      end if;
      return jsonb_build_object(
        'report_id', null,
        'revision', null,
        'deleted', true,
        'target_deleted', false,
        'preserved_report_id', case when v_report_exists then v_report.id else null end,
        'preserved_revision', v_next_revision
      );
    end if;
    delete from public.reports r
     where r.id = p_expected_report_id
       and r.user_id = v_user_id;
    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception using errcode = '42501', message = 'report ownership changed during delete';
    end if;
    return jsonb_build_object('report_id', null, 'revision', null, 'deleted', true, 'target_deleted', true);
  end if;

  -- Remove only omitted physical rows for this report. The entire RPC is one
  -- transaction, so an insert/validation failure rolls this deletion back.
  delete from public.tasks t
   where t.report_id = v_report.id
     and not (t.logical_id = any(v_seen_ids));

  v_next_revision := v_report.revision + 1;
  update public.reports r
     set prepared_by = coalesce(p_prepared_by, ''),
         meeting_notes = coalesce(p_meeting_notes, ''),
         ai_summary = coalesce(p_ai_summary, ''),
         revision = v_next_revision,
         updated_at = clock_timestamp()
   where r.id = v_report.id
     and r.user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'report ownership changed during save';
  end if;

  return jsonb_build_object('report_id', v_report.id, 'revision', v_next_revision);
end;
$$;

revoke all on function public.save_week_atomic(date, text, text, text, bigint, jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.save_week_atomic(date, text, text, text, bigint, jsonb, jsonb, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-user, per-function fixed-window AI quota
-- ---------------------------------------------------------------------------

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  window_seconds integer not null check (window_seconds between 60 and 2592000),
  window_start timestamptz not null,
  used integer not null default 0 check (used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, function_name, window_seconds, window_start)
);

create index if not exists tracker_ai_usage_window_cleanup_idx
  on public.ai_usage (window_start);

create or replace function public.consume_ai_quota(
  p_function text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_function text := lower(btrim(coalesce(p_function, '')));
  v_window_start timestamptz;
  v_used integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'consume_ai_quota requires an authenticated user';
  end if;
  if v_function not in (
    'weekly-summary',
    'extract-tasks',
    'task-actions',
    'plan-day',
    'build-roadmap',
    'roadmap-summary'
  ) then
    raise exception using errcode = '22023', message = 'p_function is not an approved AI endpoint';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'p_limit must be between 1 and 1000';
  end if;
  if p_window_seconds is null or p_window_seconds not in (60, 300, 900, 3600, 21600, 86400) then
    raise exception using errcode = '22023', message = 'p_window_seconds must use an approved quota window';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.ai_usage as usage (
    user_id, function_name, window_seconds, window_start, used, updated_at
  ) values (
    v_user_id, v_function, p_window_seconds, v_window_start, 1, clock_timestamp()
  )
  on conflict (user_id, function_name, window_seconds, window_start) do update
    set used = usage.used + 1,
        updated_at = clock_timestamp()
    where usage.used < p_limit
  returning usage.used into v_used;

  -- Bound storage without touching another account's usage records.
  delete from public.ai_usage
   where user_id = v_user_id
     and window_start < clock_timestamp() - interval '90 days';

  return v_used is not null;
end;
$$;

revoke all on function public.consume_ai_quota(text, integer, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Share lifecycle metadata
-- ---------------------------------------------------------------------------

do $shares$
declare
  v_scope_type text;
  v_token_type text;
begin
  if to_regclass('public.shares') is not null then
    alter table public.shares
      add column if not exists expires_at timestamptz,
      add column if not exists last_used_at timestamptz,
      add column if not exists revoked boolean default false;

    select c.udt_name
      into v_token_type
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'shares'
       and c.column_name = 'token';
    if v_token_type is distinct from 'uuid' then
      raise exception using errcode = '42804', message = 'public.shares.token must be uuid before tracker hardening';
    end if;
    if exists (select 1 from public.shares where token is null) then
      raise exception using errcode = '23502', message = 'public.shares contains a null token';
    end if;
    if exists (select 1 from public.shares group by token having count(*) > 1) then
      raise exception using errcode = '23505', message = 'public.shares contains duplicate tokens';
    end if;

    select c.udt_name
      into v_scope_type
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'shares'
       and c.column_name = 'scope';

    if v_scope_type is null then
      alter table public.shares add column scope jsonb;
    elsif v_scope_type <> 'jsonb' then
      alter table public.shares alter column scope drop default;
      execute $convert$
        alter table public.shares alter column scope type jsonb
        using case
          when scope is null then null
          when left(btrim(scope::text), 1) = '{' then scope::text::jsonb
          else jsonb_build_object(
            'weeks', 'all',
            'include_kudos', true,
            'include_summaries', true
          )
        end
      $convert$;
    end if;

    update public.shares
       set scope = jsonb_build_object(
         'weeks', 'all',
         'include_kudos', true,
         'include_summaries', true
       )
     where scope is null or jsonb_typeof(scope) <> 'object';

    update public.shares set revoked = false where revoked is null;

    alter table public.shares
      alter column scope set default '{"weeks":"current","include_kudos":false,"include_summaries":true}'::jsonb,
      alter column scope set not null,
      alter column token set not null,
      alter column revoked set default false,
      alter column revoked set not null;
  end if;
end;
$shares$;

do $$
begin
  if to_regclass('public.shares') is not null then
    execute 'create unique index if not exists tracker_shares_token_uidx on public.shares (token)';
    execute 'create index if not exists tracker_shares_owner_active_idx on public.shares (user_id, expires_at, created_at) where revoked = false';
    execute 'create index if not exists tracker_shares_token_active_idx on public.shares (token) where revoked = false';
  end if;
end;
$$;

-- Lightweight bearer-token preflight for dashboard.html. It returns no owner
-- data and records successful use. Client-side scope checking improves normal
-- app behavior, but is not a substitute for enforcing the same predicates
-- inside shared_dashboard(), which a caller can invoke directly.
create or replace function public.validate_share_access(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_scope jsonb;
  v_expires_at timestamptz;
begin
  if p_token is null then
    return jsonb_build_object('valid', false, 'scope', null, 'expires_at', null);
  end if;

  update public.shares s
     set last_used_at = clock_timestamp()
   where s.token = p_token
     and coalesce(s.revoked, false) = false
     and (s.expires_at is null or s.expires_at > clock_timestamp())
     and jsonb_typeof(s.scope) = 'object'
  returning s.scope, s.expires_at into v_scope, v_expires_at;

  if not found then
    return jsonb_build_object('valid', false, 'scope', null, 'expires_at', null);
  end if;

  return jsonb_build_object(
    'valid', true,
    'scope', v_scope,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.validate_share_access(uuid) from public;
grant execute on function public.validate_share_access(uuid) to anon, authenticated;

-- Enforce expiry, revocation, and least-privilege data scope on the server.
-- The legacy shared_dashboard(uuid) RPC is invoked dynamically so this
-- migration also applies in a clean schema before that optional RPC exists.
create or replace function public.secure_shared_dashboard(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_scope jsonb;
  v_payload jsonb;
  v_reports jsonb;
  v_weekly jsonb;
  v_carryover jsonb;
  v_week_limit integer;
  v_weeks text[] := array[]::text[];
  v_include_kudos boolean;
  v_include_summaries boolean;
begin
  if p_token is null then
    return null;
  end if;

  update public.shares s
     set last_used_at = clock_timestamp()
   where s.token = p_token
     and coalesce(s.revoked, false) = false
     and (s.expires_at is null or s.expires_at > clock_timestamp())
     and jsonb_typeof(s.scope) = 'object'
  returning s.scope into v_scope;

  if not found then
    return null;
  end if;

  begin
    execute 'select to_jsonb(public.shared_dashboard($1))'
       into v_payload
      using p_token;
  exception
    when undefined_function then
      raise exception using
        errcode = '42883',
        message = 'shared dashboard data provider is not installed';
  end;

  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return null;
  end if;

  v_reports := case when jsonb_typeof(v_payload->'reports') = 'array' then v_payload->'reports' else '[]'::jsonb end;
  v_weekly := case when jsonb_typeof(v_payload->'weekly') = 'array' then v_payload->'weekly' else '[]'::jsonb end;
  v_carryover := case when jsonb_typeof(v_payload->'carryover') = 'array' then v_payload->'carryover' else '[]'::jsonb end;

  v_week_limit := case lower(coalesce(v_scope->>'weeks', 'current'))
    when 'all' then 2147483647
    when 'recent4' then 4
    else 1
  end;
  v_include_kudos := lower(coalesce(v_scope->>'include_kudos', 'false')) = 'true';
  v_include_summaries := lower(coalesce(v_scope->>'include_summaries', 'true')) <> 'false';

  select coalesce(array_agg(candidate.week_ending order by candidate.week_ending desc), array[]::text[])
    into v_weeks
    from (
      select weeks.week_ending
        from (
          select distinct e.value->>'week_ending' as week_ending
            from jsonb_array_elements(v_reports) e
          union
          select distinct e.value->>'week_ending' as week_ending
            from jsonb_array_elements(v_weekly) e
        ) weeks
       where weeks.week_ending is not null
       order by weeks.week_ending desc
       limit v_week_limit
    ) candidate;

  v_payload := jsonb_set(
    v_payload,
    '{reports}',
    coalesce((
      select jsonb_agg(
        case
          when v_include_summaries then e.value
          else (e.value - 'ai_summary') || jsonb_build_object('ai_summary', '')
        end
        order by e.ordinality
      )
        from jsonb_array_elements(v_reports)
             with ordinality e(value, ordinality)
       where e.value->>'week_ending' = any(v_weeks)
    ), '[]'::jsonb),
    true
  );

  v_payload := jsonb_set(
    v_payload,
    '{weekly}',
    coalesce((
      select jsonb_agg(e.value order by e.ordinality)
        from jsonb_array_elements(v_weekly)
             with ordinality e(value, ordinality)
       where e.value->>'week_ending' = any(v_weeks)
    ), '[]'::jsonb),
    true
  );

  v_payload := jsonb_set(
    v_payload,
    '{carryover}',
    coalesce((
      select jsonb_agg(e.value order by e.ordinality)
        from jsonb_array_elements(v_carryover)
             with ordinality e(value, ordinality)
       where e.value->>'week_ending' = any(v_weeks)
    ), '[]'::jsonb),
    true
  );

  if not v_include_kudos then
    v_payload := jsonb_set(v_payload, '{kudos}', '[]'::jsonb, true);
  end if;

  -- Return a fresh allow-listed object rather than forwarding unknown keys
  -- that a legacy provider may add in the future.
  return jsonb_build_object(
    'prepared_by', coalesce(v_payload->>'prepared_by', ''),
    'reports', coalesce(v_payload->'reports', '[]'::jsonb),
    'weekly', coalesce(v_payload->'weekly', '[]'::jsonb),
    'carryover', coalesce(v_payload->'carryover', '[]'::jsonb),
    'kudos', coalesce(v_payload->'kudos', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.secure_shared_dashboard(uuid) from public;
grant execute on function public.secure_shared_dashboard(uuid) to anon, authenticated;

-- Remove the bypass: callers must use the scoped wrapper above. The owner of
-- the legacy function retains implicit execute rights for the wrapper call.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'shared_dashboard'
  loop
    execute format(
      'revoke all on function public.%I(%s) from public, anon, authenticated',
      v_function.proname,
      v_function.arguments
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS defense in depth and invoker-rights views
-- ---------------------------------------------------------------------------

alter table public.reports enable row level security;
alter table public.tasks enable row level security;
alter table public.task_updates enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists tracker_reports_owner_access on public.reports;
create policy tracker_reports_owner_access
  on public.reports as permissive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists tracker_reports_owner_guard on public.reports;
create policy tracker_reports_owner_guard
  on public.reports as restrictive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tracker_tasks_owner_access on public.tasks;
create policy tracker_tasks_owner_access
  on public.tasks as permissive for all to authenticated
  using (exists (
    select 1 from public.reports r
     where r.id = tasks.report_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.reports r
     where r.id = tasks.report_id and r.user_id = auth.uid()
  ));
drop policy if exists tracker_tasks_owner_guard on public.tasks;
create policy tracker_tasks_owner_guard
  on public.tasks as restrictive for all to authenticated
  using (exists (
    select 1 from public.reports r
     where r.id = tasks.report_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.reports r
     where r.id = tasks.report_id and r.user_id = auth.uid()
  ));

drop policy if exists tracker_task_updates_owner_access on public.task_updates;
create policy tracker_task_updates_owner_access
  on public.task_updates as permissive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists tracker_task_updates_owner_guard on public.task_updates;
create policy tracker_task_updates_owner_guard
  on public.task_updates as restrictive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tracker_ai_usage_owner_read on public.ai_usage;
create policy tracker_ai_usage_owner_read
  on public.ai_usage for select to authenticated
  using (user_id = auth.uid());

-- Optional tracker tables are hardened only when provisioned. Restrictive
-- guards remain effective even if an older permissive policy is too broad.
do $$
begin
  if to_regclass('public.shares') is not null then
    execute 'alter table public.shares enable row level security';
    execute 'drop policy if exists tracker_shares_owner_access on public.shares';
    execute 'create policy tracker_shares_owner_access on public.shares as permissive for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'drop policy if exists tracker_shares_owner_guard on public.shares';
    execute 'create policy tracker_shares_owner_guard on public.shares as restrictive for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'drop policy if exists tracker_shares_anon_active_guard on public.shares';
    execute 'revoke all on public.shares from public, anon';
  end if;

  if to_regclass('public.kudos') is not null then
    execute 'alter table public.kudos enable row level security';
    execute 'drop policy if exists tracker_kudos_owner_access on public.kudos';
    execute 'create policy tracker_kudos_owner_access on public.kudos as permissive for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'drop policy if exists tracker_kudos_owner_guard on public.kudos';
    execute 'create policy tracker_kudos_owner_guard on public.kudos as restrictive for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'create index if not exists tracker_kudos_user_date_idx on public.kudos (user_id, kudos_date desc, created_at desc)';
    execute 'revoke all on public.kudos from public, anon';
  end if;

  if to_regclass('public.projects') is not null then
    execute 'alter table public.projects enable row level security';
    execute 'drop policy if exists tracker_projects_owner_access on public.projects';
    execute 'create policy tracker_projects_owner_access on public.projects as permissive for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'drop policy if exists tracker_projects_owner_guard on public.projects';
    execute 'create policy tracker_projects_owner_guard on public.projects as restrictive for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'create index if not exists tracker_projects_user_updated_idx on public.projects (user_id, updated_at desc)';
    execute 'revoke all on public.projects from public, anon';
  end if;
end;
$$;

-- Base tables are never anonymous API surfaces; the token-gated dashboard RPC
-- should be SECURITY DEFINER with a fixed search_path and narrowly granted.
revoke all on public.reports, public.tasks, public.task_updates, public.ai_usage from public, anon;
grant select, insert, update, delete on public.task_updates to authenticated;
revoke all on public.ai_usage from authenticated;
grant select on public.ai_usage to authenticated;

-- PostgreSQL 15+/current Supabase supports security_invoker views. This makes
-- the underlying table RLS apply to authenticated reads of KPI/export views.
do $$
declare
  v_view text;
begin
  for v_view in
    select unnest(array[
      'task_export',
      'completed_tasks',
      'kpi_weekly',
      'kpi_carryover',
      'kpi_by_project'
    ])
  loop
    if exists (
      select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = v_view
         and c.relkind = 'v'
    ) then
      execute format('alter view public.%I set (security_invoker = true)', v_view);
      execute format('revoke all on public.%I from public, anon', v_view);
    end if;
  end loop;
end;
$$;

comment on column public.reports.revision is
  'Optimistic concurrency token. Pass the loaded value to save_week_atomic.';
comment on column public.tasks.logical_id is
  'Stable task identity preserved across weekly snapshots and atomic saves.';
comment on column public.tasks.updates is
  'Structured update snapshot; save_week_atomic also mirrors dated entries to task_updates.';
comment on table public.task_updates is
  'Account-owned append/history log keyed by stable task logical_id, independent of physical weekly rows.';
comment on table public.ai_usage is
  'Fixed-window per-user AI usage counters. Mutate only through consume_ai_quota.';
comment on function public.consume_ai_quota(text, integer, integer) is
  'Atomically consumes one authenticated user quota unit; true=allowed, false=exhausted.';
comment on function public.validate_share_access(uuid) is
  'Checks bearer share expiry/revocation, returns scope metadata, and records successful use.';
comment on function public.secure_shared_dashboard(uuid) is
  'Returns only the weeks, summaries, and kudos permitted by an active bearer share.';
comment on function public.save_week_atomic(date, text, text, text, bigint, jsonb, jsonb, uuid, boolean) is
  'Atomically upserts a week, task snapshot, and independent update-deletion ledger; rejects stale expected revisions.';
