# Solution Architect Workbench

A browser-local workspace for shaping, assessing, architecting, proving, proposing,
and transitioning defense solutions. The workbench organizes the architect's ongoing
obligations around the solution rather than treating the job as a calendar or task
schedule.

**Live path:** `https://azjester.github.io/work/solutions-architect/`

## What the workbench covers

- **Discover** — mission problem, operational context, stakeholders, sourced customer
  hot buttons, company mission segments, outcomes, constraints, assumptions, and
  measures of effectiveness.
- **Shape** — requirements, nonfunctional requirements, authoritative evidence,
  acceptance methods, and traceability into architecture elements.
- **Assess** — weighted Technology Assessment for hardware, software, tools, vendors,
  platforms, and complete solution candidates. Unknown scores remain unknown.
- **Architect** — mission/context, operational-thread, system/interface, data-flow,
  and deployment/transition views using native SVG and accessible tables.
- **Prove** — trades, decisions, risks, external dependencies, review gates, evidence, and
  residual uncertainty.
- **Propose** — traceable win themes, CONOPS, technical approach, discriminators,
  compliance trace, estimate assumptions, and delivery commitments.
- **Transition** — roadmap events, ownership, configuration, training, sustainment,
  receiving-team acceptance, and blockers.

Customer hot buttons can be added individually or ingested from a bounded pasted
list. Each remains a sourced customer signal with confidence and validation state;
those fields record the architect's judgment, not independent verification by the
app. A signal becomes part of the requirements baseline only when the architect
links it to a requirement that has its own authoritative evidence and acceptance
method.

The six company mission segments are available as a multi-select classification:
Integrated Air and Missile Defense; Lifecycle Management and Cyber Warfare; Layered
Defense, Autonomous Warfare & Integrated Fires; Space Warfighting; Critical
Infrastructure Protection; and Exploration and Lunar Presence. The selected segments
carry into the decision package and the reviewed AI payload.

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
These are deterministic checks against the current workspace; they are not a formal
review or a substitute for engineering judgment.

## Workspace and exports

The app stores a versioned `solution-workspace-v1` document in this site's
`localStorage`. It supports multiple isolated solutions, bounded recovery points,
solution duplication, all-or-nothing import validation, and full-workspace JSON
export. Each solution's capture inbox is stored separately under the versioned
`solution-capture-inbox-v1` contract. Save failures stay visible; local storage and
local recovery points are not durable backups.

The workbench starts in **Light** mode. Its compact **Dark mode** switch is a separate
browser setting, and **Use device theme** under Workspace tools restores automatic
system matching. Theme state does not travel with a workspace backup and does not
alter solution content.

Decision packages can be downloaded as Markdown or standalone HTML. **Print / Save PDF**
opens a separate print-ready view and requests the browser print dialog; if the
dialog does not appear, use the browser's Print command. Choose **Save as PDF**
where supported. The app does not generate or retain a PDF itself.
Architecture views can be downloaded separately as SVG or PNG.

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
including in Quick Capture, source files, image captions, and extracted excerpts.
That boundary also applies to meeting transcripts, summaries, participant names, and
selected meeting excerpts.
Do not enter classified, CUI, export-controlled, proprietary, or customer-restricted
information in this published release. A local file picker, browser storage,
authentication, or AI acknowledgment does not change that boundary.

GitHub Pages, browser storage, local snapshots, and downloaded files are convenience
features. They are not an authorization boundary, an enterprise system of record, or
a substitute for the contractor's security, records, configuration-management, and
export-control processes.
