# Architecture

## Runtime

The site is a static application:

```text
GitHub Pages
  `-- index.html
      |-- styles.css
      |-- vendor/xlsx.full.min.js
      |-- engine.js: workspace validation and deterministic analysis
      |-- import-engine.js: tabular mapping, diagnostics, and import plans
      |-- import-wizard.js: local file, worksheet, mapping, and preview UI
      |-- spreadsheet-worker.js: bounded, isolated Excel parsing
      `-- app.js: views, report workflows, snapshots, and localStorage persistence
```

There is no backend, authentication provider, database, build step, model endpoint,
or application network API. The public GitHub Pages deployment therefore works
without accounts or secrets. Excel parsing uses the repository-bundled SheetJS CE
0.20.3 library under the Apache-2.0 license; it is not loaded from a CDN.

## Workspace model

The browser stores one workspace document. Its principal record groups are:

- **Pursuits** — opportunity framing, customer context, owner, lifecycle state,
  priorities, and evaluation criteria.
- **Evidence** — source name or URL, evidence type, confidence, observation, and a
  stable citation identifier used in reports.
- **Competitors** — competitive posture, strategy hypotheses, strengths,
  weaknesses, and evaluation-criterion scores with rationale.
- **Sessions** — facilitator, participants, notes, question, and selected playbook.
- **Playbooks** — built-in facilitation lenses and user-created playbooks.
- **Actions** — owner, due date, status, and follow-up work.
- **Reports/runs** — generated report text, creation metadata, edits, and retained
  versions.
- **Snapshots** — bounded point-in-time copies used for local recovery.
- **Workspace state** — active pursuit, current view, and supported schema version.

Pursuit-scoped records carry a pursuit identifier. Stable record identifiers keep
evidence citations and report versions meaningful when a report is reopened. A
workspace JSON export is the portable representation of this model.

## Deterministic analysis pipeline

Report generation is source-bounded and repeatable:

1. Read the opportunity summary, customer priorities, and weighted criteria.
2. Organize entered evidence and assign its stored citation labels.
3. Compare the team's scores with each competitor by criterion.
4. Surface score gaps, low-confidence areas, missing evidence, and unsupported
   assumptions.
5. Apply the selected playbook’s structured prompts and challenge lenses.
6. Incorporate session participants, notes, existing actions, and due dates.
7. Render a report with an executive summary, comparison table, competitive
   posture, vulnerabilities, counter-positioning, recommended actions, assumptions,
   citations, and a verification guardrail.

The pipeline uses templates, arithmetic, sorting, and explicit rules only. It does
not call an AI model, infer facts from the internet, or independently validate
entered claims.

It also derives a bounded scenario estimate from the configured baseline, CPI margin,
critical-gate gaps, evidence coverage, and confidence. The result includes a broad
uncertainty range and is labeled as a planning estimate rather than a forecast.

Small evidence attachments are stored as data URLs with a 300 KB per-file limit.
Text-like files may supply a bounded note excerpt. Binary PDF and Word files are
retained but not parsed. This avoids a document-parsing path for attachments, but
attachments share the browser's limited storage quota.

## Reports and exports

A generated run becomes an editable report. Saving an edit retains a report version
so earlier text can be reviewed or restored. Export formatting is performed in the
browser:

- Markdown preserves the plain-text report structure and citations.
- Word downloads an HTML-based, Word-compatible `.doc`; it is not a native `.docx`
  package.
- PDF opens a print-ready report and relies on the browser print dialog, where the
  user selects **Save as PDF**; the application does not create a PDF binary itself.

No report content is uploaded while generating or exporting these formats.

## Local Excel and CSV import

The import wizard accepts `.xlsx`, `.xls`, and `.csv` files and applies the following
local pipeline:

1. Reject files larger than 5 MB before import.
2. Parse Excel in a disposable browser worker with a 20-second deadline and the
   bundled SheetJS CE library. Preflight ZIP-based workbooks before parsing and
   reject more than 50 MB expanded, more than 20 MB in one entry, more than 2,000
   entries, ZIP64, encryption, or more than 50 worksheets. Parse CSV as strict UTF-8
   inert text. No file content is sent to a CDN, API, or server.
3. Let the user choose a visible worksheet and a physical header row. Hidden and
   very hidden worksheets are unavailable; a selected sheet with hidden imported
   rows or columns is rejected.
4. Enforce limits of 2,000 data rows, 100 columns, 100,000 total cells, and
   10,000 characters per cell.
5. Choose one destination: pursuits, criteria, evidence, competitors, competitor
   scores, or actions.
6. Suggest a header-to-field mapping and allow the user to adjust it manually.
7. Build a matching summary, the first 100 planned-change previews, and row/field
   diagnostics against a cloned workspace. Validate every row even when the visual
   preview is truncated.
8. Apply the chosen mode only if the complete plan has no errors.

**Append** creates unmatched records and skips matches. **Upsert** creates unmatched
records and updates matches. **Replace** first removes the selected destination's
records for the active pursuit and then imports the mapped rows. Replace is not
available for pursuits or competitor scores, and it never replaces records belonging
to another pursuit.

The import is atomic: any error prevents every row from being committed. Immediately
before a valid plan is committed, the application creates a recovery snapshot of the
current workspace. The original workbook is not retained after the wizard closes.
Only mapped values persist in `localStorage`, recovery snapshots, and later workspace
exports.

Spreadsheet formulas are never evaluated. If a workbook contains a cached displayed
value for a formula cell, that value may be read as ordinary input. Macros and
external workbook links are never run or fetched.

## Persistence, import, and recovery

Changes are serialized to `localStorage`. Before material workspace changes, the
application retains bounded local snapshots. Users can restore a snapshot after an
accidental edit, archive, reset, or import.

Workspace JSON import uses a validate-before-replace flow. The file must be parseable
JSON with a supported workspace shape and valid record collections and references.
Invalid files are rejected without replacing the current workspace. A successful
JSON import becomes the new local workspace only after validation and a recoverable
pre-import snapshot.

Excel and CSV import is a separate, mapped record-import flow. It can append, upsert,
or, where supported, replace one active-pursuit record type. It validates a cloned
workspace and commits once; it does not replace the entire workspace.

Snapshots live in the same browser storage as the working copy. A downloaded JSON
export is still required for durable backup or transfer between devices.

## Browser support

The application targets current Chrome, Edge, Firefox, and Safari. It uses standard
DOM APIs, `localStorage`, `Blob`, `FileReader`, the locally bundled SheetJS CE 0.20.3
parser, browser print/export capabilities, and `crypto.randomUUID` with a fallback
identifier generator. Browser privacy settings and popup/print settings can affect
downloads and PDF export.
