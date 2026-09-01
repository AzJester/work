# Deployment and Operations

## Static frontend

The repository's Pages workflow publishes the application from the default branch at:

`https://azjester.github.io/work/solutions-architect/`

The workflow copies `solutions-architect/` recursively into the Pages artifact. The
frontend needs no build command, cloud project database, or server-rendered runtime.
Pinned PDF and spreadsheet parsing assets are repository-owned and published with the
static site; production source ingestion does not depend on a CDN.

the Light-default theme toggle, Quick Capture, the per-solution Review inbox, company
mission segments, and local source extraction are frontend-only capabilities. They
add no cloud upload endpoint, Supabase table, storage bucket, migration, or new Edge
Function. Original selected files remain in the browser intake session and are never
part of the deploy artifact or backend request.

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
npm run build:vendor
python -m http.server 8000
```

Open `http://localhost:8000/solutions-architect/`. Do not validate through `file:`.

Run focused checks:

```powershell
node --check solutions-architect/app.js
node --check solutions-architect/engine.js
node --check solutions-architect/capture.js
node --check solutions-architect/ingestion.js
node --check solutions-architect/ingestion-worker.js
node --test tests/solutions-architect.test.mjs tests/solutions-architect-capture.test.mjs tests/solutions-architect-ingestion.test.mjs tests/solutions-architect-mission-segments.test.mjs tests/solutions-architect-meeting-evidence.test.mjs tests/solutions-architect-export-pdf.test.mjs tests/solutions-architect-docx-export.test.mjs tests/solutions-architect-xlsx.test.mjs tests/solution-assist-contract.test.mjs
npm run test:browser -- tests/browser/solutions-architect.spec.mjs tests/browser/solutions-architect-theme.spec.mjs tests/browser/solutions-architect-mission-segments.spec.mjs tests/browser/solutions-architect-capture-ingestion.spec.mjs tests/browser/solutions-architect-meeting-capture.spec.mjs tests/browser/solutions-architect-readability.spec.mjs
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
7. Select multiple company mission segments; confirm they persist, export in the
   decision package, appear in reviewed AI payload scope, and stay isolated by
   solution.
8. Confirm a fresh browser starts in the Light theme. Use the compact toggle in the
   left navigation, then use **Use device theme** under Workspace tools. Confirm explicit
   preferences persist separately from workspace content, System responds to the
   operating-system preference, and native dropdown options remain readable in Dark.
9. Use Quick Capture and the Review inbox across two solutions. Confirm no capture
   crosses solutions, no item changes the workspace before explicit commit, dependent
   records commit atomically, and failed validation/storage leaves current data in
   place.
10. Open supported TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG,
    JPEG, and WebP sources. Confirm local preview, manual image captioning with no OCR,
    explicit excerpt review, and no network request or persisted binary bytes.
11. Reject unsupported, renamed, malformed, encrypted, macro-enabled, oversized, and
    ZIP-bomb-like sources. Exercise the 8 MB/file, 10 file/25 MB session, 2,000 entry,
    20 MB entry, 50 MB expanded, 200 page, 200,000 character, and 20-second bounds.
12. Paste a synthetic meeting transcript and summary. Tag each to one or more mission
    segments, stage only highlighted/short-summary excerpts, and confirm the complete
    text never appears in localStorage, cache storage, workspace export, logs, or a
    network request. Commit an excerpt and confirm its type, date, participants,
    segments, and locator appear in evidence and the decision package.
13. Ingest sourced customer hot buttons, reject duplicates, trace them to requirements,
   and confirm unvalidated or untraced signals remain visible obligations.
14. Create a win theme linked to customer signals and evidence; confirm missing
   customer value, discriminator, proof, or evidence remains a proposal obligation.
15. Create every architecture template; verify drag, keyboard movement, auto-layout,
   accessible tables, and SVG/PNG downloads.
16. Verify Markdown, standalone HTML, native PDF, Word `.docx`, and Excel `.xlsx`
    downloads. Open every file and confirm the active solution is isolated, the
    expected sections are present, and long content wraps without clipping. Confirm
    PDF downloads directly without opening a print or pop-up window.
17. Test every work area at current desktop and narrow-phone sizes. Confirm larger
    controls and labels, content-growing text areas, record cards, navigation,
    keyboard-only operation, Quick Capture's shortcut, touch intake/review, reduced
    motion, long content, and absence of page-level horizontal overflow. Wide
    analytical tables may scroll only inside their own panels.
18. Mock AI unauthenticated, unauthorized, quota, timeout, malformed-output, and
   unavailable-service responses. Confirm payload cancellation sends nothing and an
   accepted result remains a draft. Confirm selected mission segments appear and
   source binaries never do.
19. With an approved production account, send one safe synthetic payload and confirm
   origin, allowlist, quota metadata, citations, and content-free operational logs.
20. After merging to `main`, wait for **Deploy to GitHub Pages** and run the production
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
