# Solution Architect Workbench

A browser-local workspace for shaping, assessing, architecting, proving, proposing,
and transitioning defense solutions. The workbench organizes the architect's ongoing
obligations around the solution rather than treating the job as a calendar or task
schedule.

**Status: UNDER DEVELOPMENT.**

**Live path:** `https://azjester.github.io/work/solutions-architect/`

## What the workbench covers

- **Discover** — mission problem, operational context, stakeholders, sourced customer
  hot buttons, company mission segments, outcomes, constraints, assumptions, and
  measures of effectiveness.
- **Shape** — requirements, nonfunctional requirements, authoritative evidence,
  acceptance methods, and traceability into architecture elements.
- **Assess** — reusable approved-unclassified offerings from a separate Knowledge
  Base plus weighted Technology Assessment for hardware, software, tools, vendors,
  platforms, and complete solution candidates. Unknown scores remain unknown.
- **Architect** — mission/context, operational-thread, system/interface, data-flow,
  and deployment/transition views using native SVG and accessible tables.
- **Prove** — trades, an optional Analysis of Alternatives, decisions, risks, external
  dependencies, review gates, evidence, and residual uncertainty.
- **Propose** — traceable win themes, CONOPS, technical approach, discriminators,
  requirement support checks, estimate assumptions, and delivery commitments.
- **Transition** — roadmap events, ownership, configuration, training, sustainment,
  receiving-team acceptance, and blockers.

These seven areas are iterative work lenses, not approval gates, a required sequence,
or a calendar. The selected stage records the current emphasis; teams can move among
the lenses as evidence, trades, and reviews change the solution.

Customer hot buttons can be added individually or ingested from a bounded pasted
list. Each remains a sourced customer signal with confidence and validation state;
those fields record the architect's judgment, not independent verification by the
app. A signal becomes part of the requirements baseline only when the architect
links it to a requirement that has its own authoritative evidence and acceptance
method.

The six company mission segments are available as multi-select domain tags:
Integrated Air and Missile Defense; Lifecycle Management and Cyber Warfare; Layered
Defense, Autonomous Warfare & Integrated Fires; Space Warfighting; Critical
Infrastructure Protection; and Exploration and Lunar Presence. The selected segments
carry into the decision package and the reviewed AI payload.

Every work area uses the same readable, responsive form system: larger controls and
labels, taller content-growing text areas, well-spaced record cards, wrapping linked
records, and narrow-screen card layouts for editable registers. The wider,
better-grouped side navigation and solution selector keep the lifecycle easy to scan
without crowding the work surface. Wide analytical tables scroll inside their own
panels instead of overlapping adjacent content.

The decision page previews a finished executive artifact. Standalone HTML uses the
active site theme and semantic sections. Native PDF uses a purpose-built Letter-size
layout with a designed cover, report headers, page numbers, controlled pagination,
and print-friendly architecture diagrams. Word and Excel use layouts tailored to
editable narrative and register-based analysis. Decision-package exports do not add
data markings, browser-storage text, or authorization or conformance disclaimers.

## Capture and local source intake

Use **Capture** (`Alt+Q`) to record an idea while it is fresh, then classify it in the
active solution's separate **Review** inbox. A reviewed item can become a customer hot
button, evidence, requirement, win theme, assumption, risk, or proposed decision, or
it can be ignored. Nothing in the inbox becomes an authoritative workspace record
until the user explicitly selects and commits it.

**Open local files** extracts reviewable text and metadata in the browser from TXT,
Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG, JPEG, and WebP sources.
Images receive a local preview and manual caption/transcription workflow; the app
does not perform OCR. Original binary bytes are transient: they are not placed in
browser storage, recovery points, JSON backups, decision packages, service-worker
caches, AI payloads, or cloud storage. Only user-approved bounded excerpts and source
metadata can enter the capture inbox.

**Meeting transcript or summary** intake is also local and selection-based. The user
records the meeting title, type, date, participants, and applicable company mission
segments, then stages no more than 20 deliberate excerpts of up to 6,000 characters
each. The complete pasted meeting text is cleared when the dialog closes and is never
written to workspace storage. Staged excerpts still pass through the Review inbox
before becoming evidence.

Source intake is deliberately bounded to 8 MB per file, 10 files and 25 MB per
session, 2,000 ZIP entries, 20 MB per expanded ZIP entry, 50 MB total expanded ZIP
content, 200 PDF pages, 200,000 extracted text characters, and a 20-second extraction
timeout. Unlisted legacy Word/PowerPoint formats, macro-enabled Office files, SVG,
HTML, and arbitrary ZIP archives are not accepted. Extraction makes content easier to review; it does not validate the
source, accuracy, authority, classification, or provenance.

The command view calculates unscheduled obligations such as missing evidence,
untraced requirements, unsupported assessment scores, incomplete interfaces,
unowned risks, unresolved decisions, incomplete reviews, and transition blockers.
Its percentages measure deterministic record coverage against the current workspace;
they are not engineering-maturity ratings, approval, certification, authority to
operate, a formal readiness review, or a substitute for engineering judgment.

## Workspace and exports

The app stores a versioned `solution-workspace-v1` document in this site's
`localStorage`. It supports multiple isolated solutions, bounded recovery points,
solution duplication, all-or-nothing import validation, and full-workspace JSON
export. Each solution's capture inbox is stored separately under the versioned
`solution-capture-inbox-v1` contract. Save failures stay visible; local storage and
local recovery points are not durable backups.

The workbench starts in **Light** mode. Its compact theme toggle is a separate browser
setting, and **Use device theme** under Workspace tools restores automatic system
matching. Theme state does not travel with a workspace backup and does not alter
solution content.

Decision packages can be downloaded in five formats:

- Markdown for a portable editable narrative;
- standalone HTML for a self-contained executive report in the active Light or Dark
  theme;
- native PDF for a professionally paginated, directly downloaded report—no browser
  print dialog or Markdown rendering step;
- Microsoft Word (`.docx`) for an editable document with real headings, tables,
  header/footer content, and page numbering; and
- Microsoft Excel (`.xlsx`) for ten formatted sheets covering executive context,
  mission, customer and win themes, requirements and evidence, assessments,
  architecture and interfaces, decisions and risk, Analysis of Alternatives,
  delivery and transition, and gaps and readiness.

All five formats use the same validated active-solution facts and are generated
locally. Architecture views can also be downloaded separately as SVG or PNG.

### Reusable Knowledge Base

The **Knowledge base** is a separate browser-local catalog for approved unclassified,
non-CUI products, applications, software, services, platforms, integrated solutions,
and other offerings. Catalog items can record provider and release, lifecycle status,
capabilities, mission-segment fit, deployment and interface notes, integration,
cyber/safety, MOSA and data-rights considerations, optional readiness levels and
basis, source information, review date, tags, and a change summary.

Selecting **Use in active solution** copies the current catalog revision into that
solution as a new, solution-scoped Technology Assessment candidate. The copy receives
its own ID and can be scored, evidenced, and given a solution-specific status without
changing the reusable catalog item or any other solution. Saving a catalog edit
increments its revision; it never silently changes an existing solution copy.

When a newer catalog revision exists, **Refresh solution copy** explicitly updates the
copied name, category, provider, description, readiness summaries and basis, and
catalog provenance. Refresh preserves the candidate's solution-specific status and
its separate assessment scores, rationales, and evidence links. Deleting or retiring
a catalog item also leaves existing solution copies intact; retired items cannot be
copied into another solution.

The catalog uses the separate `solution-knowledge-base-v1` contract and
`solution_architect_knowledge_base_v1` storage key. **Export catalog** and **Import
catalog** use a separate validated JSON backup; a workspace JSON export, workspace
snapshot, solution duplication, and decision package do not contain the catalog.
Catalog import replaces the catalog only after complete validation. Keep dated
catalog and workspace backups together when moving work to another browser profile.

## Decision-support limits

Technology candidates use weighted 0–5 criteria plus optional TRL 1–9, MRL 1–10,
and IRL 0–9 values. The latter are candidate-level summaries; IRL should reflect the
limiting essential integration point, not imply that every interface has been rated.
The JSON contract can retain optional readiness-basis and as-of metadata. Candidate
ordering remains provisional because the weighted mean uses only scored criteria;
coverage and evidence coverage must be considered with the score.

An **Analysis of Alternatives (AoA)** is optional. Adding one extends an existing
solution-scoped trade record with a decision objective, at least two selected
candidates, a baseline, scope and ground rules, evaluation approach, sensitivity and
uncertainty, supporting evidence, owner/date/status, and recommendation. Its comparison
matrix reuses the current Technology Assessment scores, coverage, evidence coverage,
readiness summaries, and candidate status; it does not create a second scoring source.
If no AoA is created, AoA fields do not affect obligations or readiness. Once an AoA
is created, missing alternatives, baseline, scope, method, sensitivity, evidence, or
recommendation appear as Prove obligations. Completed AoA content is included in all
five decision-package formats.

The Propose view's Requirement support check only identifies whether a current
requirement has one linked source and an acceptance method. It is not a solicitation
compliance matrix and does not parse instructions, track every shall, assign response
locations, manage exceptions, or determine compliance. Likewise, requirements have
one direct source-evidence field and architecture exchanges do not have separate
structured owner, security-boundary, standard, or verification-method fields in v1.
Keep the governed authoritative artifacts in approved systems.

## Optional AI assistance

The core workbench does not require an account or AI service. Optional assistance is
provided by the authenticated `solution-assist` Supabase Edge Function.

Before a request is sent, the app displays the exact stage-bounded JSON payload and
requires three data-handling acknowledgments. The user must then sign in with an
approved account. AI output is validated, cited to known workspace record IDs, and
saved only after an explicit user action. It remains pending until separately
accepted or rejected and never overwrites authored records.

## Start locally

From the repository root:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/solutions-architect/`. Use an HTTP origin rather than
opening `index.html` directly because modules, downloads, browser storage, and the
optional authentication client behave differently on `file:` URLs.

## Documentation

- [Rendered user guide](guide.html) ([Markdown source](docs/USER_GUIDE.md))
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Security and data handling](docs/SECURITY.md)
- [Product requirements and role model](docs/PRODUCT_SPEC.md)

## Data boundary

The published release is approved-unclassified/non-CUI only. Use only synthetic,
public, or otherwise approved unclassified, non-CUI information,
including in the Knowledge Base, Quick Capture, source files, image captions, and
extracted excerpts.
That boundary also applies to meeting transcripts, summaries, participant names, and
selected meeting excerpts.
Do not enter classified, CUI, export-controlled, proprietary, or customer-restricted
information in this published release. A local file picker, browser storage,
authentication, or AI acknowledgment does not change that boundary.

GitHub Pages, browser storage, local snapshots, and downloaded files are convenience
features. They are not an authorization boundary, an enterprise system of record, or
a substitute for the contractor's security, records, configuration-management, and
export-control processes.
