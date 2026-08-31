# Deployment and Operations

## Static frontend

The repository's Pages workflow publishes the application from the default branch at:

`https://azjester.github.io/work/solutions-architect/`

The workflow copies `solutions-architect/` recursively into the Pages artifact. The
frontend needs no build command, cloud project database, or server-rendered runtime.

## Optional AI backend

AI assistance uses the `solution-assist` Supabase Edge Function in project
`hqqwlkmggwgaoiyzgrhy`. The core browser-local workspace remains usable when the
function is unavailable.

Before enabling AI, confirm:

- the new migration has added `solution-assist` to the fail-closed
  `consume_ai_quota` endpoint allowlist;
- `ANTHROPIC_API_KEY` is configured;
- `AI_ALLOWED_ORIGINS=https://azjester.github.io` is configured;
- `AI_ALLOWED_EMAILS` contains at least one approved account so the shared deployment
  preflight can pass; approved database allowlist rows may extend that secret-backed
  list at runtime;
- public sign-up is disabled and approved users are verified;
- repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are present.

Optional endpoint-specific settings use the `SOLUTION_ASSIST_` prefix:

- `SOLUTION_ASSIST_ALLOWED_ORIGINS`
- `SOLUTION_ASSIST_ALLOWED_EMAILS`
- `SOLUTION_ASSIST_QUOTA_LIMIT`
- `SOLUTION_ASSIST_QUOTA_WINDOW_SECONDS`
- `SOLUTION_ASSIST_UPSTREAM_TIMEOUT_MS`

The function performs its own caller verification and is deployed with:

```sh
supabase functions deploy solution-assist --no-verify-jwt
```

The shared production workflow performs migration preflight/application and deploys
the bounded Edge Functions before it uploads the new Pages artifact. A backend
failure therefore leaves the current frontend in place.

## Local verification

From the repository root:

```powershell
npm ci
python -m http.server 8000
```

Open `http://localhost:8000/solutions-architect/`. Do not validate through `file:`.

Run focused checks:

```powershell
node --check solutions-architect/app.js
node --check solutions-architect/engine.js
node --test tests/solutions-architect.test.mjs tests/solution-assist-contract.test.mjs
npm run test:browser -- tests/browser/solutions-architect.spec.mjs
```

Then run the complete pre-release suites:

```powershell
npm test
npm run test:browser
```

## Release checklist

1. Create a clean solution and verify reload persistence.
2. Confirm another solution's records never appear in the active solution.
3. Export JSON and import it into a clean browser profile.
4. Reject malformed, oversized, duplicate-ID, dangling-reference, and
   cross-solution imports without changing current data.
5. Create and restore a recovery point; force a storage failure and confirm a visible
   error rather than a false success.
6. Complete and compare assessments with complete, partial, and unknown scores.
7. Ingest sourced customer hot buttons, reject duplicates, trace them to requirements,
   and confirm unvalidated or untraced signals remain visible obligations.
8. Create a win theme linked to customer signals and evidence; confirm missing
   customer value, discriminator, proof, or evidence remains a proposal obligation.
9. Create every architecture template; verify drag, keyboard movement, auto-layout,
   accessible tables, and SVG/PNG downloads.
10. Verify Markdown and standalone HTML downloads, then open the separate print view
    and create a PDF with the browser print workflow.
11. Test current desktop and narrow-phone layouts, keyboard-only operation, reduced
   motion, long content, and page-level horizontal overflow.
12. Mock AI unauthenticated, unauthorized, quota, timeout, malformed-output, and
   unavailable-service responses. Confirm payload cancellation sends nothing and an
   accepted result remains a draft.
13. With an approved production account, send one safe synthetic payload and confirm
   origin, allowlist, quota metadata, citations, and content-free operational logs.
14. After merging to `main`, wait for **Deploy to GitHub Pages** and run the production
   smoke checks against the final URL and Application Library link.

The existing workflow does not publish feature-branch preview environments. Validate
the branch locally and in review; merging to `main` is the production release event.

## Rollback

The frontend has no server-side project state. Revert the application commit and let
the Pages workflow republish the previous static version. Before rolling back across
a workspace-schema change, export a current JSON backup and verify compatibility with
the target version.

Rollback of the static frontend does not erase browser workspaces, downloaded
exports, Supabase authentication sessions, quota records, or accepted AI draft data
already stored in the browser. Roll back the Edge Function separately only after
confirming its API contract remains compatible with the restored frontend.
