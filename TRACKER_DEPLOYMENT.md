# Tracker deployment

The tracker is a static GitHub Pages frontend backed by Supabase. Deploy the backend first;
publishing `tracker.html` before its database and Edge Function contracts are ready can make
saves, shares, and AI tools fail for existing users.

## Prerequisites

- Node.js 20+ and pnpm.
- Supabase CLI authenticated to project `hqqwlkmggwgaoiyzgrhy`.
- Supabase database credentials for migration deployment.
- GitHub CLI authenticated to `AzJester/work`.
- Supabase secrets:
  - `ANTHROPIC_API_KEY`
  - `AI_ALLOWED_ORIGINS=https://azjester.github.io`
  - `AI_ALLOWED_EMAILS` with the approved account emails (or the endpoint-specific
    `<PREFIX>_ALLOWED_EMAILS` variables).

Keep Supabase email confirmation enabled and public sign-ups disabled. Create or invite
approved users from the Supabase dashboard.

## 1. Verify the source

```sh
pnpm install --frozen-lockfile
pnpm run build:vendor
pnpm test
```

`build:vendor` copies the exact pinned Supabase UMD bundle from the installed package.
Commit the generated `assets/vendor/supabase-js-2.110.2.umd.js` file.

## 2. Apply the database migration

Run these read-only preflight queries in the Supabase SQL editor:

```sql
select column_name, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'shares'
  and column_name in ('token', 'scope', 'revoked');

select user_id, week_ending, count(*)
from public.reports group by user_id, week_ending having count(*) > 1;

select report_id, logical_id, count(*)
from public.tasks where logical_id is not null
group by report_id, logical_id having count(*) > 1;

select token, count(*)
from public.shares group by token having count(*) > 1;

select p.oid::regprocedure as signature,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege(current_user, p.oid, 'EXECUTE') as deployer_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'shared_dashboard';
```

Proceed only when `shares.token` is UUID/non-null, duplicate queries return no rows,
`shared_dashboard(uuid)` exists with the expected scalar JSON object, and the migration
role can execute it. Inspect any legacy text `scope` values beginning with `{` and repair
malformed JSON before conversion. The migration revokes every direct
`shared_dashboard` overload so only the scoped wrapper remains callable.

```sh
supabase login
supabase init --force
supabase link --project-ref hqqwlkmggwgaoiyzgrhy
supabase db push
```

The tracker hardening migration adds atomic/revisioned week saves, stable task identity,
structured updates, scoped/expiring share links, server-side share filtering, AI quotas,
RLS guards, and security-invoker reporting views.

If a unique-index step reports duplicate reports for one user/week, duplicate task logical
IDs, or duplicate share tokens, reconcile those rows before retrying. Do not bypass the
uniqueness checks.

The migration wraps the existing `shared_dashboard(uuid)` provider with
`secure_shared_dashboard(uuid)` and revokes anonymous access to the legacy function.
Confirm the legacy provider exists before publishing the dashboard.

## 3. Deploy the Edge Functions

These functions perform their own verified-user checks so browser preflight can run:

```sh
supabase functions deploy weekly-summary --no-verify-jwt
supabase functions deploy extract-tasks --no-verify-jwt
supabase functions deploy task-actions --no-verify-jwt
supabase functions deploy plan-day --no-verify-jwt
supabase functions deploy build-roadmap --no-verify-jwt
supabase functions deploy roadmap-summary --no-verify-jwt
```

Set tighter endpoint-specific origins, email allowlists, quotas, models, or timeouts with
`<PREFIX>_ALLOWED_ORIGINS`, `<PREFIX>_ALLOWED_EMAILS`,
`<PREFIX>_QUOTA_LIMIT`, `<PREFIX>_QUOTA_WINDOW_SECONDS`, and
`<PREFIX>_UPSTREAM_TIMEOUT_MS`. Approved quota windows are 60, 300, 900, 3600, 21600,
or 86400 seconds.

## 4. Smoke-test before publishing

- Sign in with an approved, verified account.
- Create and edit a week, reload it, then test a second-tab revision conflict.
- Take the browser offline, edit once, reconnect, and confirm the next save succeeds.
- Create a current-week share with a short expiry. Verify its scope, revoke it, and verify it
  no longer loads.
- Invoke each AI action once and confirm an unapproved origin/account receives 403.
- Check the tracker and dashboard at phone, tablet, and desktop widths.

Only after these checks should the frontend branch be merged to `main`; the existing Pages
workflow now deploys the pinned Supabase functions and migration before uploading the Pages
artifact. Configure the repository secrets `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_DB_PASSWORD` first. If either is absent—or a backend precondition fails—the
workflow stops before GitHub Pages changes, leaving the current live frontend in place.
