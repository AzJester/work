# Architecture

## Runtime

The workbench is a static browser application published beneath
`/work/solutions-architect/`:

```text
index.html
  |-- styles.css       application shell and responsive presentation
  |-- app.js           views, interactions, persistence, imports, exports, and AI UI
  |-- engine.js        schema, validation, calculations, diagrams, and report builders
  |-- capture.js       isolated capture-inbox contract and materialization
  |-- ingestion.js     bounded local source detection, extraction, and metadata
  |-- ingestion-worker.js
  |                     isolated Office/spreadsheet extraction and ZIP preflight
  `-- vendor/          pinned local PDF.js runtime and license

../assets/vendor/supabase-js-2.110.2.umd.js
  `-- optional authentication client for AI access

../black-hat-agent/vendor/xlsx.full.min.js
  `-- pinned local spreadsheet parser loaded only inside the ingestion worker

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

Candidate records may carry backward-compatible optional `readinessBasis` and
`readinessAsOf` metadata. Existing v1 candidates without those fields remain valid;
when present, `readinessAsOf` must be empty or a valid `YYYY-MM-DD` calendar date.
TRL and MRL remain nullable integer summaries on their established 1–9 and 1–10
scales. IRL is a nullable integer on the 0–9 scale and should summarize the limiting
essential integration maturity, not imply a rating for every interface.

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

## Persistence and recovery

The current workspace is serialized under `solution_architect_workspace_v1` in
`localStorage`. UI changes are validated before a debounced save. Save failures remain
visible and the user is directed to export a backup.

Snapshots contain bounded point-in-time workspace copies without recursively nesting
older snapshots. Restoring a snapshot validates it and first creates a
**Before recovery restore** point. Snapshots are convenient local recovery, while a
downloaded JSON workspace is the durable backup and transfer mechanism.

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

## Architecture views

Architecture views retain explicit width, height, element coordinates, and typed
connections. Deterministic auto-layout provides stable starting positions. The native
SVG renderer escapes user content and is reused for:

- the interactive diagram;
- accessible element/exchange tables;
- standalone SVG download;
- local canvas-based PNG download;
- standalone and print-ready decision packages.

The templates use DoDAF's decision-focused, fit-for-purpose presentation idea and
selected viewpoint concepts as guidance. They are not DoDAF-described Models, a DM2
repository, or a PES exchange implementation. Because DoDAF conformance depends on
the underlying data and exchange conditions—not the number or appearance of
diagrams—the workbench does not claim conformance.

## Decision-package pipeline

Markdown generation reads only records scoped to the selected solution and assembles
the selected company mission segments, mission brief, customer signals,
traceability, assessments, architecture
inventory, trades, decisions, risks, dependencies, win themes, roadmap, transition,
coverage indicators, and evidence gaps. Standalone HTML escapes the Markdown and embeds locally
generated SVG diagrams. **Print / Save PDF** opens this HTML in a separate browser view
and requests the browser print dialog; the user can invoke Print manually if the
dialog does not appear. JavaScript does not create or store a PDF binary.

## AI request boundary

`buildAiPayload` selects only the collections permitted for the chosen lifecycle
stage and emits stable workspace record IDs for citations. The user sees the exact
payload before transmission.

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
