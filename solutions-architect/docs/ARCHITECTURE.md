# Architecture

## Runtime

The workbench is a static browser application published beneath
`/work/solutions-architect/`:

```text
index.html
  |-- styles.css       application shell and responsive presentation
  |-- app.js           views, interactions, persistence, imports, exports, and AI UI
  `-- engine.js        schema, validation, calculations, diagrams, and report builders

../assets/vendor/supabase-js-2.110.2.umd.js
  `-- optional authentication client for AI access

Supabase Edge Function: solution-assist
  `-- optional authenticated, allowlisted, quota-bound model request
```

There is no build step and no cloud project-storage API. The core application works
with standard browser APIs, native SVG, canvas, Blob downloads, and `localStorage`.

## Workspace contract

The portable document uses schema `solution-workspace-v1` and schema version `1`.
It contains:

- workspace metadata, active solution, and bounded snapshots;
- solution mission and proposal briefs;
- stakeholders, sourced customer hot buttons, outcomes, measures, requirements, and
  evidence;
- assessment criteria, candidates, scores, rationale, maturity values, and win
  themes;
- architecture views, elements, and connections;
- trades, decisions, risks, dependencies, assumptions, roadmap items, reviews, and transition
  actions;
- pending, accepted, and rejected AI drafts kept separate from authored records.

Every domain record carries one `solutionId`. Architecture elements and connections
also carry a `viewId`; connections reference source and target element IDs.
Requirements can reference customer hot buttons, evidence, and architecture elements.
Win themes reference customer hot buttons and supporting evidence. Assessment scores
can reference criteria and evidence. These relationships are validated before save,
import, recovery, or report generation.

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

## Deterministic decision support

The engine calculates weighted assessment results, traceability, evidence coverage,
interface completeness, transition completeness, readiness, and the unscheduled
obligation list from the stored records. Missing scores remain unknown; the engine
does not coerce them to zero or invent rationale.

These calculations are transparent completeness and comparison aids. They do not
predict mission success, technical approval, acquisition outcome, or contract award.

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
the mission brief, customer signals, traceability, assessments, architecture
inventory, trades, decisions, risks, dependencies, win themes, roadmap, transition,
readiness, and evidence gaps. Standalone HTML escapes the Markdown and embeds locally
generated SVG diagrams. **Print / PDF** opens this HTML in a separate browser view
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

## Browser and dependency policy

The target is current Chrome, Edge, Firefox, and Safari. Repository-bundled assets are
used instead of CDNs. The content security policy permits same-origin scripts and
styles, local/data/blob images needed for exports, and only the exact Supabase origin
for network requests.
