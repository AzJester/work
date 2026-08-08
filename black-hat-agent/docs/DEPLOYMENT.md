# Deployment and Operations

## GitHub Pages

The repository's existing Pages workflow publishes static content from the default
branch. This section requires no server, environment variable, secret, API key, or
workflow change and is available beneath:

`/work/black-hat-agent/`

Deploying these files does not create an AI service. Analysis remains deterministic
and is performed entirely in the visitor's browser.

## Vendored spreadsheet parser

Excel import uses the repository-bundled SheetJS CE 0.20.3 browser distribution
under the Apache-2.0 license. The application must load this checked-in asset from
`black-hat-agent/vendor/`; do not replace it with a CDN reference. Keep the vendored
license and version record with the distribution, and review functionality, license,
and security impact before upgrading the library. Keep
`black-hat-agent/spreadsheet-worker.js` alongside the application: Excel parsing is
required to run in that same-origin, time-limited worker.

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

1. Run `node --check` on `app.js`, `engine.js`, `import-wizard.js`, and
   `visualizations.js`, then run `npm test`.
2. Serve the repository locally and verify there is no sign-in or external request.
3. Create, edit, duplicate, archive, and restore a pursuit.
4. Add customer priorities and weighted evaluation criteria.
5. Add and edit evidence; confirm stable citations appear in generated reports.
6. Add competitors and complete criterion-by-criterion scores and rationales.
7. Create a custom playbook and select it for a session.
8. Record participants and notes, then generate a competitive-analysis report.
9. Edit the report, save a new version, and restore an earlier version.
10. Verify Markdown and standalone visual HTML downloads. Open the HTML-based `.doc`
    in Microsoft Word and confirm charts plus their data tables are present, then
    verify the print-ready report and browser **Save as PDF** flow.
11. Add or edit an action and confirm it appears in a regenerated report.
12. Export the JSON workspace and import it into a clean browser profile.
13. Attempt to import malformed and incomplete JSON plus duplicate or hostile IDs,
    invalid scores, cross-pursuit relationships, asymmetric evidence links, and
    unsafe attachment data URLs; confirm current data remains unchanged. Import a
    supported legacy workspace and confirm its relationships are migrated.
14. Import representative `.xlsx`, `.xls`, and `.csv` files. For Excel, verify
    worksheet selection; for all formats, verify header-row selection.
15. Verify automatic column mapping, manual remapping, preview operations, and
    row/field diagnostics for pursuits, criteria, evidence, competitors, competitor
    scores, and actions.
16. Exercise **Append** and confirm matching records are skipped. Exercise
    **Upsert** and confirm matching records are updated and unmatched records are
    created.
17. Exercise **Replace** for each supported active-pursuit destination. Confirm it
    does not affect another pursuit and is unavailable for pursuits and competitor
    scores.
18. Verify that one row or field error blocks the entire atomic import and leaves
    the workspace unchanged.
19. Verify the 5 MB file, 2,000 data-row, 100-column, 100,000-total-cell, and
    10,000-character cell limits at and beyond each boundary.
20. Verify an expanded ZIP total over 50 MB, a ZIP entry over 20 MB, more than 2,000
    entries, ZIP64, encryption, more than 50 worksheets, and parsing beyond 20
    seconds are rejected.
21. Verify hidden and very hidden worksheets cannot be selected and hidden rows or
    columns in the selected imported range block the import.
22. Test formula cells, macros, and external workbook links. Confirm formulas are
    not evaluated, only cached displayed values may be read, and macros and links
    never run or fetch remote content.
23. Inspect the browser network panel while opening, mapping, previewing, and
    committing Excel and CSV imports. Confirm the parser loads from the repository
    and no file content reaches a CDN, API, or upload endpoint.
24. Confirm the original workbook is not retained, mapped values appear in browser
    storage and a JSON workspace export, and a recovery snapshot is created
    immediately before a successful import.
25. Restore the pre-import snapshot and verify the complete workspace returns to its
    prior state.
26. Test quoted commas, embedded newlines, empty cells, and UTF-8 text in CSV files,
    plus a multi-sheet Excel workbook and a file with a non-first header row.
27. Verify desktop, keyboard-only, and narrow mobile layouts in current browsers.
    Confirm the mobile navigation drawer closes through its button, backdrop, and
    Escape key, and browser Back/Forward follows the URL fragment.
28. Exercise every chart with complete, sparse, and missing data. Confirm exact
    values match the accessible table and no missing value is presented as zero.
29. Generate a report, change the workspace, and confirm the prior report keeps its
    saved visual snapshot while a new report reflects the new data.
30. Force browser-storage failure and confirm the header shows a save error, the
    in-memory change rolls back, and no success message appears.

## Operational backup and recovery

- Export a dated workspace JSON file before an important Black Hat session, a large
  JSON or spreadsheet import, or browser maintenance.
- Use local snapshots for quick recovery from a recent mistake.
- Use a downloaded JSON export for durable backup, device transfer, or recovery
  after browser storage has been cleared.
- Treat Markdown, Word, and PDF reports as deliverables, not full workspace backups;
  they do not contain all editable application state.
- Do not treat the source spreadsheet as an application backup. The original file is
  not retained, and only successfully mapped values become workspace data.

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
