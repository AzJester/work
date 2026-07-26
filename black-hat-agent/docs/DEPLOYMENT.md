# Deployment and Operations

## GitHub Pages

The repository's existing Pages workflow publishes static content from the default
branch. This section requires no server, environment variable, secret, API key, or
workflow change and is available beneath:

`/work/black-hat-agent/`

Deploying these files does not create an AI service. Analysis remains deterministic
and is performed entirely in the visitor's browser.

## Local verification

From the repository root:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/black-hat-agent/`. Test through an HTTP origin
rather than by double-clicking `index.html`; download, print, and browser-storage
behavior can differ for `file:` URLs.

## Release validation

Before release:

1. Run `node --check black-hat-agent/app.js`.
2. Serve the repository locally and verify there is no sign-in or external request.
3. Create, edit, duplicate, archive, and restore a pursuit.
4. Add customer priorities and weighted evaluation criteria.
5. Add and edit evidence; confirm stable citations appear in generated reports.
6. Add competitors and complete criterion-by-criterion scores and rationales.
7. Create a custom playbook and select it for a session.
8. Record participants and notes, then generate a competitive-analysis report.
9. Edit the report, save a new version, and restore an earlier version.
10. Verify the Markdown download and HTML-based `.doc` in Microsoft Word, then
    verify the print-ready report and browser **Save as PDF** flow.
11. Add or edit an action and confirm it appears in a regenerated report.
12. Export the JSON workspace and import it into a clean browser profile.
13. Attempt to import malformed and incomplete JSON; confirm current data remains
    unchanged.
14. Create a snapshot, change data, restore the snapshot, and verify recovery.
15. Verify desktop, keyboard-only, and narrow mobile layouts in current browsers.

## Operational backup and recovery

- Export a dated workspace JSON file before an important Black Hat session, a large
  import, or browser maintenance.
- Use local snapshots for quick recovery from a recent mistake.
- Use a downloaded JSON export for durable backup, device transfer, or recovery
  after browser storage has been cleared.
- Treat Markdown, Word, and PDF reports as deliverables, not full workspace backups;
  they do not contain all editable application state.

Snapshots and workspace data share the same browser origin storage. Clearing site
data removes both.

## Application rollback

The deployment has no server state. Revert the application commit to restore a
previous static version. Before rolling back across a workspace-schema change, export
the current workspace and verify that the target version accepts the exported schema.
Application rollback does not restore or remove data already stored in a visitor's
browser.

## Cache behavior

GitHub Pages may briefly cache changed static assets. File names are intentionally
stable for simple maintenance. If aggressive cache invalidation becomes necessary,
add matching query-version parameters to stylesheet and script references.
