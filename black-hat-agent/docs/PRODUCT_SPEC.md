# Product Requirements and Design Decisions

## Objective

Provide a public, fully working competitive-analysis and Black Hat facilitation
workspace that visitors can use without creating an account or signing in. The
application should make a team's reasoning explicit, trace findings to entered
evidence, compare competitors against customer criteria, and produce reviewable
deliverables without a backend or AI service.

## Product principles

- **Evidence before assertion:** consequential claims should identify a source,
  confidence level, or clearly state that they are hypotheses.
- **Customer-centered comparison:** scoring is organized around stated customer
  priorities and evaluation criteria, not generic vendor rankings.
- **Transparent mechanics:** users can inspect the inputs, scores, templates, and
  report text that produced an output.
- **Human ownership:** the team enters the facts, judgments, scores, and notes and
  remains accountable for verification.
- **Portable work:** workspace backups and report exports do not require an account
  or hosted storage.

## Primary user journey

Portfolio -> opportunity framing -> customer priorities and criteria -> evidence
collection -> competitor hypotheses and scoring -> playbook selection -> facilitated
session -> deterministic report -> editing and review -> owned actions -> versioned
and portable output.

## Functional requirements

### Pursuits and customer context

- Anonymous entry with no sign-in redirect.
- Multiple isolated pursuits with create, read, update, duplicate, archive, and
  restore behavior.
- Opportunity summary, customer, stage, owner, next review, and lifecycle status.
- Customer priorities and weighted evaluation criteria suitable for comparison.
- Session participants, facilitator, question, and working notes.

### Evidence and competitors

- Evidence creation and editing with title, source or URL, type, confidence, note,
  and stable citation label.
- Optional local evidence attachment up to 300 KB, with bounded text-file excerpt
  ingestion and download.
- Explicit separation of evidence, inference, and unsupported hypothesis in the
  report.
- Competitor creation and editing with posture, likely strategy, strengths,
  weaknesses, and team rationale.
- Your team's and competitor scores against the pursuit's evaluation criteria.
- Score summaries that expose relative advantages, vulnerabilities, ties,
  low-confidence judgments, and incomplete scoring.
- Confidence-adjusted CPI and a bounded scenario planning estimate that is explicitly
  not presented as a statistical win forecast.

Scores are team-entered judgments, not independently calculated market facts. Any
derived total or ranking is a deterministic summary of those inputs.

### Local Excel and CSV import

- Accept `.xlsx`, `.xls`, and `.csv` files up to 5 MB.
- Parse Excel locally in a disposable, 20-second browser worker with
  repository-bundled SheetJS CE 0.20.3 under the Apache-2.0 license. Parse UTF-8 CSV
  as inert text, with no CDN, API, or upload.
- Preflight ZIP-based Excel files and enforce 50 MB expanded total, 20 MB per entry,
  2,000 ZIP entries, no ZIP64 or encryption, and no more than 50 worksheets.
- Let the user choose a visible worksheet, physical header row, destination, and
  import mode. Reject hidden/very hidden worksheets and hidden rows or columns in
  the selected imported range.
- Support pursuits, evaluation criteria, evidence, competitors, competitor scores,
  and actions as destinations.
- Suggest column mappings from headers while allowing every mapping to be reviewed
  and changed manually.
- Preview up to 100 creates, updates, skips, and replacements and show row/field
  diagnostics before any workspace change; disclose preview truncation and validate
  every row.
- Limit each import to 2,000 data rows, 100 columns, 100,000 total cells, and
  10,000 characters per cell.
- **Append** creates unmatched records and skips matches.
- **Upsert** creates unmatched records and updates matches.
- **Replace** is scoped to the active pursuit and is unavailable for pursuits and
  competitor scores.
- Treat the import as one atomic operation: any error blocks the complete commit.
- Create a recovery snapshot immediately before a valid import is committed.
- Never evaluate formulas; read only a cached displayed value when one exists.
- Never run macros or fetch external workbook links.
- Discard the original workbook after use. Persist only mapped values in
  `localStorage`, snapshots, and workspace exports.

### Playbooks, sessions, and actions

- Reusable built-in playbooks for common competitive-review lenses.
- User-created and editable custom playbooks.
- Session metadata for participants and notes.
- Action register with owner, due date, and status.
- Report recommendations that incorporate existing actions and flag unowned or
  undated follow-up work.

### Reports

- One-click deterministic generation from the active pursuit's stored records.
- Executive summary, customer priorities, evaluation criteria, score comparison,
  competitor-by-competitor posture, likely strategy, strengths, weaknesses,
  vulnerabilities, challenge themes, counter-positioning, actions, assumptions,
  missing information, evidence citations, confidence warnings, and a verification
  guardrail.
- Editable report content after generation.
- Saved report versions with the ability to inspect and restore an earlier version.
- Run history scoped to the active pursuit.
- Markdown download, HTML-based Word-compatible `.doc`, and a print-ready browser
  flow for **Save as PDF**.

### Portability and recovery

- Automatic browser-local persistence.
- JSON workspace export and validate-before-replace full-workspace import.
- Local Excel and CSV import for adding or updating mapped records without replacing
  the complete workspace.
- Import validation for the supported workspace structure, required collections,
  record types, and pursuit references.
- Recoverable pre-import or pre-reset state.
- Bounded local snapshots with list, restore, and cleanup behavior.
- Synthetic starter workspace that demonstrates every major workflow.

### Experience

- Static-host compatibility with no application network dependency.
- Responsive layout and keyboard-accessible native controls.
- Clear empty, validation, confirmation, and recovery states.
- Visible reminders that the site uses local storage and no AI model.

## Competitive-analysis method

The generator:

1. Orders customer priorities and evaluation criteria by their recorded weights.
2. Compares recorded team and competitor scores by criterion.
3. Uses entered strengths, weaknesses, strategies, and evidence to assemble
   competitor profiles.
4. Identifies score disadvantages, thin evidence, conflicting confidence, missing
   records, and unvalidated assumptions.
5. Applies the selected playbook's predefined challenge prompts.
6. Builds response themes and recommended actions from those explicit inputs.
7. Adds stable evidence citations and verification language.

This method provides a structured competitive assessment, not autonomous
competitive intelligence. Equal inputs and the same application version should
produce the same initial report.

## Design decisions

### Browser-local persistence

Selected to remove identity, backend, cost, secret, and availability dependencies.
The tradeoff is that work is not automatically synchronized between people or
devices. Snapshots improve local recoverability but do not replace downloaded
backups.

### Deterministic analysis

Selected so all functionality works on GitHub Pages without exposing an API key.
The output is reproducible, explainable, and bounded by recorded data. It is not
generated by an LLM and does not contain independently researched intelligence.

### Editable and versioned reports

Selected because generated text is a starting point for a team review. Users can
correct wording and add judgment while retaining prior versions for comparison and
recovery.

### Evidence citations

Selected to keep report claims traceable to workspace records. A citation proves
which local record informed a passage; it does not prove that the underlying source
is true or current.

### Repository-bundled spreadsheet parsing

Selected so Excel and CSV imports remain private and operational on static hosting.
SheetJS CE 0.20.3 and its Apache-2.0 license are stored with the repository. The
browser performs parsing, mapping, preview, and validation without a CDN, API, or
upload. The tradeoffs are a larger static download, browser memory and storage
limits, and no spreadsheet formula, macro, or external-link execution.

### Synthetic defaults

Starter records demonstrate the workflow without representing real pursuit data.

## Out of scope for this public edition

- AI or LLM-based analysis
- automatic web research, competitor discovery, or claim verification
- multi-user or real-time collaboration
- server-side file storage, databases, or document parsing
- live Excel, Microsoft 365, Google Sheets, or other spreadsheet synchronization
- spreadsheet formula calculation, macros, external-link retrieval, or preservation
  of the original workbook
- authentication, role-based access, or approval workflows
- access-controlled operational pursuit data
- enterprise audit, retention, or records-management guarantees
- claims that a generated score, ranking, recommendation, or report is authoritative
  intelligence
