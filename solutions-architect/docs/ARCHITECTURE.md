# Architecture

## Runtime

The workbench is a static browser application published beneath
`/work/solutions-architect/`:

```text
index.html
  |-- styles.css       application shell and responsive presentation
  |-- app.js           views, interactions, persistence, imports, exports, and AI UI
  |-- engine.js        schema, validation, calculations, diagrams, and report builders
  |-- export-pdf.js    native PDF decision-package renderer
  |-- export-docx.js   dependency-free Word Open XML package renderer
  |-- export-xlsx.js   formatted decision workbook renderer
  |-- knowledge-base.js
  |                     separate catalog contract, validation, copy, and refresh
  |-- knowledge-import.js
  |                     bounded CSV/XLSX normalization and atomic import planning
  |-- capture.js       isolated capture-inbox contract and materialization
  |-- ingestion.js     bounded local source detection, extraction, and metadata
  |-- ingestion-worker.js
  |                     isolated Office/spreadsheet extraction and ZIP preflight
  `-- vendor/          pinned local PDF.js and PDF-LIB runtimes and licenses

../assets/vendor/supabase-js-2.110.2.umd.js
  `-- optional authentication client for AI access

../black-hat-agent/vendor/xlsx.full.min.js
  `-- pinned local spreadsheet runtime used for ingestion, catalog import, and export

Supabase Edge Function: solution-assist
  `-- optional authenticated, allowlisted, quota-bound model request
```

There is no application compile step and no cloud project-storage API. The vendor
copy task pins repository-owned browser dependencies for deployment. The core
application works with standard browser APIs, native SVG, canvas, workers, Blob
downloads, and `localStorage`.

## Workspace contract

The portable document uses schema `solution-workspace-v1` and schema version `1`.
It contains:

- workspace metadata, active solution, and bounded snapshots;
- solution mission segments, mission and proposal briefs;
- stakeholders, sourced customer hot buttons, outcomes, measures, requirements, and
  evidence;
- assessment criteria, candidates, scores, rationale, maturity values, and win
  themes;
- architecture views, elements, and connections;
- trades, decisions, risks, dependencies, assumptions, roadmap items, reviews, and transition
  actions;
- pending, accepted, and rejected AI drafts kept separate from authored records.

Assessment-score records contain a 0–5 or unknown value, rationale, and evidence
links. They do not contain a separate score-confidence field; confidence is an
attribute of each linked evidence record.

Every domain record carries one `solutionId`. Architecture elements and connections
also carry a `viewId`; connections reference source and target element IDs.
Requirements can reference customer hot buttons, evidence, and architecture elements.
Win themes reference customer hot buttons and supporting evidence. Assessment scores
can reference criteria and evidence. These relationships are validated before save,
import, recovery, or report generation.

`missionSegments` is a bounded multi-select containing only the six supported company
segment names. It is carried into decision-package output and stage-scoped AI payloads.

Evidence records may also carry backward-compatible optional provenance metadata:
`sourceType`, `meetingDate`, bounded `participants`, and canonical
`missionSegments`. Existing v1 evidence without these fields remains valid. Meeting
evidence uses the optional fields so decision packages can show which source and
company mission segments support an excerpt without changing the workspace schema
version.

Candidate records may carry backward-compatible optional `readinessBasis`,
`readinessAsOf`, and `catalogSource` metadata. Existing v1 candidates without those
fields remain valid;
when present, `readinessAsOf` must be empty or a valid `YYYY-MM-DD` calendar date.
TRL and MRL remain nullable integer summaries on their established 1–9 and 1–10
scales. IRL is a nullable integer on the 0–9 scale and should summarize the limiting
essential integration maturity, not imply a rating for every interface.

When a candidate is copied from the Knowledge Base, `catalogSource` records the
catalog item ID, revision, item name, import timestamp, review date, and safe source
URL. This is provenance for a point-in-time copy, not a live relationship.

The established `trades` collection also accepts backward-compatible optional AoA
metadata: `analysisType`, `baselineOptionId`, `scopeAndGroundRules`,
`evaluationApproach`, `sensitivityAnalysis`, `evidenceIds`, `owner`, and `date`.
Existing v1 trades without these fields remain normal trade studies. An AoA baseline
must reference one of its selected solution-scoped candidate options, and supporting
evidence must belong to the same solution.

## Knowledge Base contract

The reusable catalog is intentionally separate from the workspace and capture inbox:

- schema: `solution-knowledge-base-v1`;
- schema version: `1`;
- storage key: `solution_architect_knowledge_base_v1`; and
- bundled-default version key: `solution_architect_knowledge_defaults_version`; and
- portable shape: `schema`, `schemaVersion`, `savedAt`, and `items`.

Separation is an isolation and lifecycle design, not an authorization boundary. The
Knowledge Base has the same approved-unclassified/non-CUI limit as the workspace and
must not contain classified, CUI, export-controlled, proprietary, or
customer-restricted information.

Each item has a stable catalog ID and positive revision plus reusable facts for name,
offering type, provider, version, lifecycle status, summary, capabilities, company
mission segments, deployment/environment, interfaces, integration, cyber/safety,
MOSA/data rights, optional readiness levels and basis, source, tags, review date,
change summary, and creation/update timestamps. Allowed offering types are Product,
Application, Software, Service, Platform, Integrated solution, and Other offering;
lifecycle states are Current, Emerging, Legacy, and Retired.

The application bundle includes a versioned 28-item default catalog derived from the
provided Solutions & Offerings list. A missing catalog is created from those records.
When the bundled-default version advances, a valid existing catalog receives only
defaults whose stable ID and normalized name are both absent; a matching locally
maintained item is preserved. The synthetic legacy seed is removed during this
migration. The defaults-version marker is written only with a successful catalog
save, so the catalog and migration state do not claim success after a storage failure.
Later catalog edits, archives, additions, and deletions remain browser-local and are
not written back into the bundled source file.

The catalog is shared by all solutions within one browser profile and origin, but its
items never carry `solutionId`. Strict solution isolation starts at copy-on-use:

```text
Knowledge Base item revision N
  -> explicit Target opportunity / solution
  -> searchable checkbox selection of one or more eligible items
  -> one atomic workspace commit and one recovery point
  -> new target-scoped candidate IDs + catalogSource provenance
  -> independent status, scores, rationales, and evidence links per target
```

The chooser starts with the active solution as its target, but target selection is
separate state and never changes `workspace.activeSolutionId`. Duplicate detection is
computed for the selected target. Therefore one catalog item can materialize once in
each of many solutions, while a second copy in the same solution is unavailable. A
per-card **Add to solution…** action uses the same chooser with that item initially
selected; Technology Assessment and the Knowledge Base toolbar expose the full batch
chooser.

Editing a catalog item increments `revision`; it does not traverse candidate
provenance or write to a workspace. Deleting or retiring an item also leaves copied
candidates intact. A retired item cannot be newly materialized.

If the current catalog revision exceeds a candidate's recorded revision, the UI
offers **Refresh active copy** for the currently active solution. Refresh creates a
workspace recovery point, then
updates the candidate's catalog-derived name, category, vendor, description,
readiness basis/date/levels, and provenance. The candidate ID, solution ID, status,
and separately stored assessment scores, rationales, and evidence links are
preserved. There is no automatic refresh or background synchronization.

Catalog validation rejects unsupported schemas and fields, malformed IDs, duplicate
item IDs, unsupported types or lifecycle states, invalid readiness/date/URL values,
credential-bearing URLs, unsupported mission segments, oversized fields, more than
1,000 items, or an import over 5 MB. JSON restore validates the entire document and
writes it once before replacing the in-memory catalog. A rejected file or storage
failure leaves the current catalog in place.

### Knowledge Base spreadsheet import

The catalog has a second, merge-oriented import path for the downloadable Excel
template (`.xlsx`) and matching UTF-8 CSV (`.csv`). XLSX is preferred because it can
carry Instructions, Allowed Values, and Synthetic Example sheets beside the
importable Solutions sheet. CSV uses only the canonical header row. Both formats are
parsed locally; the source file and its bytes are not uploaded, persisted, cached, or
added to JSON backup.

The import contract uses one offering per row and these 26 canonical columns:

```text
Catalog ID | Expected Revision | Name | Offering Type | Provider / Owner |
Version / Release | Lifecycle Status | Summary | Capabilities | Mission Segments |
Deployment and Environment | Interfaces | Integration Considerations |
Cyber and Safety Considerations | MOSA and Data Rights |
Technology Readiness Level | Manufacturing Readiness Level |
Integration Readiness Level | Readiness Basis | Readiness As Of | Source Title |
Source URL | Source Notes | Tags | Last Reviewed | Change Summary
```

Name is the only required value for a new row. Multi-value cells accept semicolons or
line breaks. Dates use `YYYY-MM-DD`. Readiness fields are nullable integers with
Technology 1–9, Manufacturing 1–10, and Integration 0–9 bounds; blank means unknown.
Normal field lengths, URL rules, mission-segment allowlists, offering types,
lifecycle states, 5 MB input limit, and 1,000-item catalog bound still apply. Formula
cells and hidden selected sheets, rows, or columns are rejected so preview reflects
the literal visible table the user reviewed.

Spreadsheet import is plan-then-commit rather than row-at-a-time mutation:

```text
local XLSX/CSV bytes
  -> bounded parse and canonical header mapping
  -> row normalization and complete catalog validation
  -> preview additions, updates, no-ops, and errors
  -> user Apply against the same base catalog `savedAt` state
  -> one storage write and one in-memory replacement
```

Add-only is the default. A new row leaves Catalog ID and Expected Revision blank.
Explicit add/update mode permits an existing item to change only when the row carries
its exact Catalog ID, its current Expected Revision, and a nonblank Change Summary.
There is no update-by-name behavior. Unknown or duplicate IDs, stale revisions,
duplicate logical offerings, invalid fields, a changed base catalog, or storage
failure rejects the entire Apply operation. Valid rows are never partially committed.

The merge result changes only the reusable catalog. It does not traverse
`catalogSource` provenance or update candidates already copied into solutions. Those
point-in-time copies continue to require the separate **Refresh active copy**
action.

**JSON backup** produces or restores the Knowledge Base's exact portable JSON.
Spreadsheet import is a merge workflow and is not a replacement for backup/restore.
Workspace JSON, workspace snapshots, solution duplication, capture-inbox export,
decision packages, and AI payloads exclude the catalog. Moving reusable and active
work therefore requires two artifacts: a workspace backup and a catalog backup.

## Capture-inbox contract

Fast capture is intentionally separate from the authoritative workspace. Each
solution has a versioned `solution-capture-inbox-v1` envelope stored under a key
derived from `solution_architect_capture_inbox_v1:<solutionId>`. The envelope contains
only solution-bound provenance metadata, bounded excerpts, proposed fields,
preallocated target IDs, and review state. It does not contain binary files.

Inbox entries can propose a customer hot button, evidence item, requirement, win
theme, assumption, risk, or decision, or be marked ignored. They never appear in the
authoritative workspace until the user explicitly selects them. Materialization
clones the workspace and inbox, resolves dependent evidence and hot-button proposals,
builds conservative initial records, validates both contracts, and persists the
workspace before replacing active in-memory state. Preallocated IDs make a retry
idempotent instead of duplicating records.

Capture inboxes are intentionally not embedded in `solution-workspace-v1`, recovery
snapshots, or workspace JSON backup/export. They are a review queue, not a source
repository or authoritative record set. The UI can download the active inbox JSON as
a separate reference artifact; v1 does not provide an inbox-import workflow.

## Local source-ingestion pipeline

**Open local files** is a browser-local preprocessing flow:

```text
user-selected File objects
  -> type, count, and size checks
  -> isolated local extraction or image preview
  -> bounded text/metadata preview
  -> user selection and manual image caption where needed
  -> solution-specific capture inbox
  -> explicit review and materialization
  -> authoritative solution-workspace-v1 records
```

Supported formats are TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS,
PNG, JPEG, and WebP. Text is decoded as strict UTF-8; JSON is parsed before preview;
PDF text uses the pinned local PDF.js module; OOXML and spreadsheet formats run in a
terminable worker after ZIP preflight; and images receive only a local preview,
dimensions/hash metadata, and a user-authored caption or transcription. There is no
OCR. Unlisted legacy Word/PowerPoint formats, macro-enabled Office files, SVG, HTML,
and arbitrary ZIP files are not accepted.

The limits are 8 MB per file, 10 files and 25 MB per session, 2,000 ZIP entries, 20 MB
per expanded entry, 50 MB expanded ZIP content, 200 PDF pages, 200,000 extracted text
characters per source, and 20 seconds per extraction. These are denial-of-service and
usability bounds, not a data-authorization control.

Original `File`, `ArrayBuffer`, image Blob URL, and PDF/Office/spreadsheet bytes live
only for the intake session and are released after review or cancellation. Binary
bytes are never written to localStorage, workspace snapshots, JSON backups,
decision-package exports, the service-worker cache, an AI payload, Supabase, or any
other network destination. Only user-approved bounded excerpts and source metadata
can persist.

## Meeting-text intake pipeline

Meeting intake uses the same Review boundary without accepting an audio/video file or
persisting a complete transcript:

```text
transient pasted transcript or summary
  -> title, date, participants, and mission-segment tagging
  -> user-selected excerpts (20 maximum, 6,000 characters each)
  -> solution-specific capture inbox as evidence proposals
  -> explicit review and materialization
  -> evidence with optional meeting provenance metadata
```

The complete pasted text exists only in the in-memory intake session and dialog DOM.
Closing, canceling, or successfully staging the session clears it. Only selected
excerpts and metadata enter localStorage. The meeting workflow does not call AI,
upload a source, retain a recording, or infer requirements and customer commitments.

## Isolation and validation

Identifiers use a bounded safe character set. Validation rejects unsupported schema
versions, missing collections, duplicate IDs, unsafe or oversized fields, invalid
scores, malformed diagrams, dangling references, and cross-solution relationships.

Full-workspace import parses and validates the entire file before replacement. A
rejected file does not change the active workspace. For a valid file, the app creates
a pre-import recovery point and attempts one `localStorage` write before committing
the in-memory replacement. A storage-write failure leaves the current workspace in
place and remains visible; browser storage still does not provide transactional
durability. Duplicating a solution remaps all
solution-scoped IDs and relationships so the copy is independent.

Knowledge Base reuse does not weaken this boundary. Materialization always assigns a
new candidate ID and the explicitly selected target `solutionId`. The chooser's
target is validated immediately before the batch commit, and that commit stamps only
the target solution's update time without changing `activeSolutionId`. Refresh locates
only the active solution's matching copy; its catalog provenance cannot be used as a
cross-solution reference.
AoA alternatives, baseline, and evidence also pass the existing same-solution
relationship checks.

## Persistence and recovery

The current workspace is serialized under `solution_architect_workspace_v1` in
`localStorage`. UI changes are validated before a debounced save. Save failures remain
visible and the user is directed to export a backup.

Snapshots contain bounded point-in-time workspace copies without recursively nesting
older snapshots. Restoring a snapshot validates it and first creates a
**Before recovery restore** point. Snapshots are convenient local recovery, while a
downloaded JSON workspace is the durable backup and transfer mechanism.

The Knowledge Base is serialized independently under
`solution_architect_knowledge_base_v1`. It is not included in workspace recovery
points or workspace JSON. Its **JSON backup** is the exact portable catalog backup;
JSON restore replaces only the catalog after complete validation and does not create
a workspace snapshot. Spreadsheet import merges validated rows but is not a durable
backup. Back up both stores before clearing site data or moving to another browser
profile.

The application does not encrypt workspace values inside `localStorage`, synchronize
them to another device, or guarantee persistence across browser policies, private
browsing, site-data clearing, storage pressure, profile loss, or device loss.

The color preference is stored separately under
`solution_architect_theme_v1`. Missing or invalid state defaults to `light`; the
compact switch stores `light` or `dark` as an explicit override. **Use device theme**
stores `system`, which resolves through `prefers-color-scheme`. Theme selection is
device/profile state, not solution data, so it is excluded from workspace validation,
snapshots, imports, and exports.

## Deterministic decision support

The engine calculates weighted assessment results, traceability, evidence coverage,
element-connectivity coverage, transition-action coverage, an aggregate coverage
indicator, and the unscheduled obligation list from the stored records. Missing scores
remain unknown; the engine does not coerce them to zero or invent rationale. Candidate
ordering is provisional because the weighted mean uses only scored criteria and must
be read with assessment and evidence coverage.

These calculations are transparent completeness and comparison aids. They do not
represent engineering maturity, formal readiness review, certification, authority to
operate, or predict mission success, technical approval, acquisition outcome, or
contract award.

AoA is opt-in. With no trade marked `Analysis of Alternatives`, it adds no obligation
and changes no readiness or coverage result. Once present, deterministic checks flag
fewer than two alternatives and missing baseline, scope/ground rules, evaluation
approach, sensitivity analysis, evidence, or recommendation. The AoA comparison is
derived at render/export time from current Technology Assessment results; no scores
are persisted twice.

## Architecture views

Architecture views retain explicit width, height, element coordinates, and typed
connections. Deterministic auto-layout provides stable starting positions. The native
SVG renderer escapes user content and is reused for:

- the interactive diagram;
- accessible element/exchange tables;
- standalone SVG download;
- local canvas-based PNG download;
- standalone HTML and native PDF decision packages.

The templates use DoDAF's decision-focused, fit-for-purpose presentation idea and
selected viewpoint concepts as guidance. They are not DoDAF-described Models, a DM2
repository, or a PES exchange implementation. Because DoDAF conformance depends on
the underlying data and exchange conditions—not the number or appearance of
diagrams—the workbench does not claim conformance.

## Decision-package pipeline

All decision-package builders validate the workspace, select one solution, and
resolve relationships to readable names instead of exposing raw IDs. Markdown
generation assembles an editable narrative. The standalone HTML path renders the
same committed records independently as semantic HTML: an executive cover, section
navigation, mission and customer context, requirement cards, assessment tables,
proposal narrative, architecture figures and interface register, decisions,
governance, transition, evidence, obligations, and an acronym key. It embeds locally
generated SVG diagrams, bundles its report styles, uses no external resources or
scripts, and retains the Light or Dark theme active when exported.

The PDF path uses the pinned local PDF-LIB runtime to create a PDF binary directly.
Its report renderer owns Letter-size pagination, cover composition, repeated report
headers, page numbers, text wrapping, table splitting, and print-palette architecture
images. It does not open an HTML print view or depend on the browser print system.

The Word path builds a standards-based WordprocessingML ZIP package with document
styles, fixed table geometry, headings, numbering, header/footer parts, and page
fields. The Excel path uses the pinned spreadsheet runtime to create nine styled
worksheets with wrapped cells, frozen headings, bounded column widths, print setup,
and no formulas or macros. Neither Office export requires a cloud conversion
service.

Pending inbox records, original source files, full meeting text, snapshots, and
unaccepted AI drafts are excluded from every decision-package format. The reusable
Knowledge Base is also excluded; only candidates already copied into the selected
solution can appear. When an AoA exists, its objective, selected alternatives,
baseline, ground rules, method, sensitivity, evidence, owner/date/status,
recommendation, and derived candidate comparison appear in Markdown, HTML, PDF,
Word, and Excel output.

Decision outputs do not add the workspace's data-handling banner, solution
classification field, browser-storage language, or authorization or conformance
disclaimers.

## AI request boundary

`buildAiPayload` selects only the collections permitted for the chosen lifecycle
stage and emits stable workspace record IDs for citations. The user sees the exact
payload before transmission. It selects from the active workspace only; the separate
Knowledge Base is never searched or transmitted automatically.

The browser sends the approved payload and Supabase access token only to the exact
`solution-assist` endpoint. The Edge Function must independently enforce origin,
verified-user authentication, email allowlisting, request-size limits, an action
allowlist, quotas, upstream timeout, and structured output. The client validates the
response shape and confirms every citation belongs to the active solution before it
can be accepted as a draft.

Local file selection and extraction do not invoke the Edge Function and do not change
its contract. An excerpt from an ingested source can reach AI only after the user
materializes it into the workspace and then separately reviews and acknowledges an
AI payload containing that record. Mission-segment selections are ordinary scoped
workspace facts and appear in that exact payload preview.

## Browser and dependency policy

The target is current Chrome, Edge, Firefox, and Safari. Repository-bundled assets are
used instead of CDNs. The content security policy permits same-origin scripts,
styles, and workers; local/data/blob images needed for preview and exports; and only
the exact Supabase origin for network requests. The service worker caches application
code and pinned runtimes, never user-selected files or extracted source content.
