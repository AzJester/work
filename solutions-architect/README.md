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

The **Knowledge base** is a permanent reusable catalog, separate from every
opportunity or solution workspace. It ships with the 28 products, applications,
platforms, technologies, solutions, and offerings from the provided **Solutions &
Offerings** list. A new browser catalog receives those choices automatically, and an
existing valid catalog receives any missing bundled choices once without replacing a
same-named item that is already maintained locally. Catalog records never carry a
solution ID, so they do not belong to the synthetic Expeditionary Sensor Node example
or to any other active solution.

The catalog remains browser-local and approved-unclassified/non-CUI. Users can add,
revise, archive, restore, permanently delete, import, and back up its items. Catalog
items can record provider and release, lifecycle status, capabilities,
mission-segment fit, deployment and interface notes, integration, cyber/safety, MOSA
and data-rights considerations, optional readiness levels and basis, source
information, review date, tags, and a change summary. These maintained catalog facts
are reusable input; they are not a mission-fit determination.

For bulk entry, use the Knowledge Base **Templates** control or download the
[Excel import template](./assets/solution-knowledge-base-import-template.xlsx)
directly. Microsoft
Excel (`.xlsx`) is preferred; UTF-8 CSV (`.csv`) is also accepted. Put one offering
on each row. **Name** is the only required field for a new offering. The complete
26-column layout is: Catalog ID, Expected Revision, Name, Offering Type, Provider /
Owner, Version / Release, Lifecycle Status, Summary, Capabilities, Mission Segments,
Deployment and Environment, Interfaces, Integration Considerations, Cyber and Safety
Considerations, MOSA and Data Rights, Technology Readiness Level, Manufacturing
Readiness Level, Integration Readiness Level, Readiness Basis, Readiness As Of, Source
Title, Source URL, Source Notes, Tags, Last Reviewed, and Change Summary. Separate
multi-value entries with semicolons or line breaks, use `YYYY-MM-DD` dates, and leave
a readiness level blank when it is unknown. Valid readiness ranges are 1–9 for
Technology, 1–10 for Manufacturing, and 0–9 for Integration. Use literal cell values
rather than formulas and keep the import sheet and used rows/columns visible. Files
are limited to 5 MB, and the resulting catalog is limited to 1,000 offerings.

Spreadsheet import merges approved rows into the existing catalog after an atomic
preview. New rows leave **Catalog ID** and **Expected Revision** blank. Updating an
existing item requires explicit add/update mode plus its exact Catalog ID, current
Expected Revision, and a Change Summary. The importer never updates by name. Any
validation, stale-revision, duplicate, or storage error prevents the entire Apply
operation from changing the catalog. The selected file is parsed locally in the
browser and is not uploaded.

Select **Add offerings** from Technology Assessment, **Add to solution** from the
Knowledge Base toolbar, or **Add to solution…** on one catalog card. The searchable
chooser has an explicit **Target opportunity / solution** field, checkbox cards,
**Select visible**, **Clear selection**, and one **Add N offerings** action. Changing
the target does not switch the active workspace shown in the left navigation. Items
already copied into the selected target are marked **Already added** and cannot be
duplicated there.

The batch action copies each selected catalog revision into the chosen target as a
new solution-scoped Technology Assessment candidate. The same catalog offering can
be copied once into each of many opportunities, and every copy receives its own ID,
status, scores, rationales, and evidence links. Saving a catalog edit increments its
revision; it never silently changes an existing solution copy or another solution.

When a newer catalog revision exists, **Refresh active copy** on the Knowledge Base
card explicitly updates the copy in the currently active workspace. Refresh preserves
the candidate's solution-specific status and its separate assessment scores,
rationales, and evidence links. Deleting or archiving a catalog item also leaves
existing solution copies intact; archived items are excluded from the chooser until
restored.

The catalog uses the separate `solution-knowledge-base-v1` contract and
`solution_architect_knowledge_base_v1` storage key. Spreadsheet import is for adding
or explicitly revising catalog rows; JSON backup/restore remains the exact portable
catalog format and replaces the catalog only after complete validation. A workspace
JSON export, workspace snapshot, solution duplication, and decision package do not
contain the catalog. Keep dated catalog and workspace JSON backups together when
moving work to another browser profile.

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
