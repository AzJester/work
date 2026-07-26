# Architecture

## Runtime

The site is a static application:

```text
GitHub Pages
  `-- index.html
      |-- styles.css
      `-- app.js
          |-- view and form rendering
          |-- local workspace validation
          |-- deterministic analysis and citation formatting
          |-- report editing, versioning, and export
          |-- snapshots and recovery
          `-- localStorage persistence
```

There is no backend, authentication provider, database, build step, model endpoint,
or application network API. The public GitHub Pages deployment therefore works
without accounts or secrets.

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
retained but not parsed. This keeps the application dependency-free, but attachments
share the browser's limited storage quota.

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

## Persistence, import, and recovery

Changes are serialized to `localStorage`. Before material workspace changes, the
application retains bounded local snapshots. Users can restore a snapshot after an
accidental edit, archive, reset, or import.

Import uses a validate-before-replace flow. The file must be parseable JSON with a
supported workspace shape and valid record collections and references. Invalid files
are rejected without replacing the current workspace. A successful import becomes
the new local workspace only after validation and a recoverable pre-import snapshot.

Snapshots live in the same browser storage as the working copy. A downloaded JSON
export is still required for durable backup or transfer between devices.

## Browser support

The application targets current Chrome, Edge, Firefox, and Safari. It uses standard
DOM APIs, `localStorage`, `Blob`, `FileReader`, browser print/export capabilities,
and `crypto.randomUUID` with a fallback identifier generator. Browser privacy
settings and popup/print settings can affect downloads and PDF export.
