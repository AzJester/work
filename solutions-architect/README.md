# Solution Architect Workbench

A browser-local workspace for shaping, assessing, architecting, proving, proposing,
and transitioning defense solutions. The workbench organizes the architect's ongoing
obligations around the solution rather than treating the job as a calendar or task
schedule.

**Live path:** `https://azjester.github.io/work/solutions-architect/`

## What the workbench covers

- **Discover** — mission problem, operational context, stakeholders, sourced customer
  hot buttons, outcomes, constraints, assumptions, and measures of effectiveness.
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

The command view calculates unscheduled obligations such as missing evidence,
untraced requirements, unsupported assessment scores, incomplete interfaces,
unowned risks, unresolved decisions, incomplete reviews, and transition blockers.
These are deterministic checks against the current workspace; they are not a formal
review or a substitute for engineering judgment.

## Workspace and exports

The app stores a versioned `solution-workspace-v1` document in this site's
`localStorage`. It supports multiple isolated solutions, bounded recovery points,
solution duplication, all-or-nothing import validation, and full-workspace JSON
export. Save failures stay visible; local storage and local recovery points are not
durable backups.

Decision packages can be downloaded as Markdown or standalone HTML. **Print / PDF**
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

- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Security and data handling](docs/SECURITY.md)
- [Product requirements and role model](docs/PRODUCT_SPEC.md)

## Data boundary

Use only synthetic, public, or otherwise approved unclassified, non-CUI information.
Do not enter classified, CUI, export-controlled, proprietary, or customer-restricted
information unless the organization has separately authorized this application,
device, browser, storage, network path, AI service, and export workflow for that
information.

GitHub Pages, browser storage, local snapshots, and downloaded files are convenience
features. They are not an authorization boundary, an enterprise system of record, or
a substitute for the contractor's security, records, configuration-management, and
export-control processes.
