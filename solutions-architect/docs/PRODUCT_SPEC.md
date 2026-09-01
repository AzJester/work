# Product Requirements and Role Model

**Status: UNDER DEVELOPMENT.**

## Product intent

Solution Architect Workbench helps a practicing defense-contractor solution
architect maintain a coherent, defensible solution from mission discovery through
transition. It focuses on work that must remain complete and connected regardless of
the architect's meeting calendar or capture schedule.

The application is a single-user browser workspace. It coordinates specialist inputs
and exposes gaps; it is not a systems-engineering repository, requirements-management
system, proposal-production suite, pricing system, or authorized CUI environment.

## Role model

Defense solution architects commonly operate across six connected responsibilities:

1. **Mission discovery** — understand the customer mission, operational environment,
   stakeholders, sourced customer hot buttons, outcomes, constraints, and decision context.
2. **Solution shaping** — translate the mission into traceable functional and
   nonfunctional requirements, acceptance logic, and solution boundaries.
3. **End-to-end architecture** — integrate people, process, hardware, software,
   services, data, networks, facilities, environments, and external systems.
4. **Technology and business trades** — compare alternatives across performance,
   maturity, integration, cybersecurity/authorization, system safety, openness, data
   rights, supply chain, cost, schedule, and sustainment.
5. **Capture and proposal support** — build a defensible CONOPS, technical approach,
   discriminators, requirement support trace, estimate assumptions, and delivery
   commitments while maintaining formal solicitation compliance in its governed
   proposal system.
6. **Technical assurance and transition** — prove key claims, manage risks and
   decisions, pass review gates, and hand design intent plus residual risk into
   execution and sustainment.

This is an integrator and decision-support role, not unilateral authority over every
discipline. The architect must obtain accountable input and approval from the
responsible engineering, cyber, safety, test, pricing, contracts, logistics, security,
export-control, and mission-domain specialists.

The model is grounded in representative defense-contractor role descriptions
reviewed on August 31, 2026:

- [Leidos](https://careers.leidos.com/jobs/18152413-solutions-architect) covers
  discovery, end-to-end architecture, options and trade studies, nonfunctional
  requirements, estimates, delivery assurance, and transition.
- [Booz Allen](https://careers.boozallen.com/jobs/JobDetail/McLean-Defense-Solutions-Architect-R0246764/128700)
  covers mission-needs translation, capture shaping, executable architectures, win
  themes, technical volumes, compliance matrices, competitive differentiation,
  estimates, partners, and cross-functional proposal reviews.
- [SAIC](https://jobs.saic.com/jobs/18122502-solutions-architect) covers customer
  discovery, CONOPS, end-to-end design, demonstrations, pre-sales support, and
  coordination with engineering, product, and delivery teams.

These postings are point-in-time evidence and may expire. They support the broad
integrator role above; they do not define one universal job description or transfer
authority from the accountable specialists named above.

## Primary user and success criteria

The primary user is a solution architect working on an approved unclassified defense
capability, capture, internal research, or transition effort.

A successful workspace lets that user:

- explain the mission, applicable company mission segments, decision, and intended
  operational effect;
- capture approved information quickly, then review and classify it without silently
  changing authoritative solution records;
- extract bounded, reviewable content from supported local documents, spreadsheets,
  and images without retaining the original binary;
- distinguish sourced customer signals from validated requirements and trace the
  signals that materially shape the solution;
- maintain a reusable browser-local catalog of approved unclassified offerings and
  copy a chosen catalog revision into a solution without coupling later changes;
- trace material requirements to sources, acceptance methods, and architecture;
- compare solution candidates without hiding unknowns;
- document a full Analysis of Alternatives when the decision warrants one, without
  making that artifact mandatory for every solution;
- communicate the complete capability and its interfaces through decision-useful
  views;
- show why key trades and decisions were made and what evidence supports them;
- identify unresolved technical, business, review, and transition obligations;
- produce a reviewable decision package and portable workspace backup.

## Functional requirements

### Lifecycle and command view

- Guide the seven-lens Discover → Shape → Assess → Architect → Prove → Propose →
  Transition workflow. Treat the lenses as iterative areas of work, not approval
  gates, a required sequence, or a calendar; stage records current emphasis only.
- Calculate an unscheduled obligation list from deterministic workspace checks.
- Provide direct navigation from each obligation to its owning stage.
- Describe all percentages as record-coverage indicators, not engineering maturity,
  approval, certification, authority to operate, or formal readiness-review results.

### Workspace

- Support multiple isolated solutions in one browser workspace.
- Persist validated changes locally and expose unsaved and failed-save states.
- Create bounded recovery points before destructive operations.
- Export the complete versioned JSON workspace and validate an entire import before
  replacing the active in-memory workspace. Report any final browser-storage failure
  visibly rather than claiming a successful save.
- Default to the Light theme and offer a compact theme toggle in the left navigation.
  Provide **Use device theme** under Workspace tools. Theme state must not alter or
  travel with workspace content.
- Use one readable, responsive form system across every work area: consistent
  16-pixel controls, larger labels and targets, taller content-growing text areas,
  separated record cards, wrapping relationship names, and layouts that stack
  before controls overlap. Keep wide analytical tables scrollable within their own
  panels.
- Keep lifecycle navigation grouped and legible, with a sufficiently wide solution
  selector and touch-sized navigation targets.

### Knowledge Base

- Provide a separate browser-local catalog under the versioned
  `solution-knowledge-base-v1` contract for approved unclassified, non-CUI products,
  applications, software, services, platforms, integrated solutions, and other
  offerings. The catalog is reusable across solutions in the same browser profile;
  it is not embedded in `solution-workspace-v1`.
- Let users search and filter by name or catalog text, offering type, lifecycle
  status, and company mission segment. Catalog records must support provider,
  version/release, lifecycle status, summary, capabilities, mission segments,
  deployment/environment, interfaces, integration, cyber/safety, MOSA/data-rights,
  optional TRL/MRL/IRL with basis and as-of date, source information, tags, review
  date, and change summary.
- Increment an item's catalog revision whenever it is edited. Show the revision used
  by an existing solution copy and identify when a newer revision is available.
- Implement copy-on-use: **Use in active solution** creates a new candidate ID bound
  only to the active solution and records catalog item ID, revision, item name,
  import time, review date, and safe source URL as provenance. Catalog edits,
  retirement, or deletion must never silently mutate or delete existing solution
  copies.
- Require an explicit **Refresh solution copy** action before applying a newer
  catalog revision. Refresh reusable identity, description, readiness, and provenance
  fields while preserving the candidate's solution-specific status and its separate
  assessment scores, rationales, and evidence links. Create a recovery point before
  copy or refresh.
- Prevent a retired catalog item from being newly copied while leaving prior solution
  copies usable. Prevent a second copy of the same item in one solution; open the
  existing assessment instead.
- Provide downloadable Knowledge Base templates for preferred Microsoft Excel
  (`.xlsx`) and UTF-8 CSV (`.csv`) list intake. Use one offering per row and the 26
  canonical columns documented in the user guide. Require only Name for a new item;
  accept semicolon- or line-break-separated lists, `YYYY-MM-DD` dates, nullable
  readiness values within Technology 1–9, Manufacturing 1–10, and Integration 0–9,
  and the catalog's existing allowed-value and field bounds.
- Preview spreadsheet changes before Apply and commit them atomically as a merge into
  the current catalog. Default to add-only. Permit an explicit update only when the
  row supplies the exact Catalog ID, current Expected Revision, and nonblank Change
  Summary. Never update by name. Reject unknown or duplicate IDs, stale revisions,
  logical duplicates, invalid rows, changed base state, or storage failures without
  applying any row. Process the source file locally and do not persist or upload its
  bytes.
- Export and restore the catalog through a separate validated JSON file. JSON is the
  exact backup/transfer contract, not the spreadsheet merge contract. Validate the
  complete restore before replacing catalog storage, reject unsupported versions
  and malformed or duplicate items, bound inputs to 5 MB and 1,000 records, and leave
  the current catalog unchanged on rejection or storage failure.
- Keep the Knowledge Base out of workspace snapshots, workspace JSON backups,
  decision-package exports, capture inboxes, and AI payloads. Make clear that moving
  work between browsers requires both a workspace backup and a catalog backup.

### Company mission segments

- Provide a multi-select classification for Integrated Air and Missile Defense;
  Lifecycle Management and Cyber Warfare; Layered Defense, Autonomous Warfare &
  Integrated Fires; Space Warfighting; Critical Infrastructure Protection; and
  Exploration and Lunar Presence.
- Require only supported segment values and keep selections solution-scoped.
- Carry the selections into the mission brief, decision package, coverage checks,
  and exact stage-scoped AI payload preview.
- Treat selection as company mission alignment, not proof of a solution's mission
  contribution, contract scope, or organizational ownership.

### Quick Capture and Review inbox

- Make Quick Capture available from every stage with a visible control and `Alt+Q`
  shortcut.
- Lock each capture to the active solution and preserve bounded source provenance.
- Store pending entries in a separate versioned `solution-capture-inbox-v1` envelope,
  not in the authoritative workspace.
- Let a reviewer classify and edit an item as a customer hot button, evidence,
  requirement, win theme, assumption, risk, or decision, or ignore it.
- Use conservative initial states: unverified/captured hot buttons and assumptions,
  low-confidence evidence, draft requirements and win themes, open risks with Unknown
  likelihood/impact, and proposed decisions.
- Never materialize an item without explicit selection. Validate dependent evidence
  and hot-button proposals together and keep commit retries idempotent.
- Keep inboxes separate by solution. Do not include them in workspace snapshots,
  decision packages, or JSON workspace backups.
- Allow a separate active-inbox JSON download for reference. Do not imply that v1 can
  import that artifact or that it replaces committing reviewed workspace records.

### Local source ingestion

- Provide **Open local files** for TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS,
  XLSX, ODS, PNG, JPEG, and WebP.
- Extract and preview content entirely in the browser before creating capture-inbox
  proposals. Opening a file must not call Supabase, AI, or another cloud service.
- Provide local image preview plus manual caption/transcription and make clear that
  the product does not perform OCR.
- Reject unlisted legacy Word/PowerPoint formats, macro-enabled Office files, SVG,
  HTML, arbitrary ZIP archives, and unlisted or renamed formats.
- Enforce 8 MB per file; 10 files and 25 MB per session; 2,000 ZIP entries; 20 MB per
  expanded entry; 50 MB total expanded ZIP content; 200 PDF pages; 200,000 extracted
  text characters; and a 20-second extraction timeout.
- Never store, export, service-worker-cache, log, or send original file bytes. Only a
  user-approved bounded excerpt and source metadata may persist to the Review inbox
  and later to an authoritative record.
- Present extraction as an aid, not source validation. Require the user to verify
  accuracy, completeness, authority, provenance, and data handling.

### Meeting transcript and summary intake

- Provide a dedicated paste workflow for a meeting transcript or summary from Quick
  Capture, Open local files, and Workspace tools.
- Collect meeting title, transcript-versus-summary type, optional valid date,
  bounded participant names or roles, and one or more canonical company mission
  segments.
- Keep the complete pasted meeting text transient. Do not place it in localStorage,
  workspace snapshots, inbox exports, decision packages, service-worker caches,
  logs, AI payloads, or network requests.
- Require deliberate excerpt selection for transcripts. Permit a whole summary only
  when it is no more than 6,000 characters. Limit a session to 20 excerpts and
  200,000 pasted characters.
- Stage excerpts only as low-confidence evidence proposals in the solution-specific
  Review inbox. Preserve source type, date, participants, mission segments, and a
  line-oriented locator when the evidence is committed.
- Treat meeting statements as evidence, not automatic contractual direction,
  requirements, customer hot buttons, decisions, or commitments.

### Customer hot buttons

- Add customer priorities, concerns, sensitivities, and decision drivers individually
  or ingest up to 50 newline-separated signals from bounded pasted text.
- Preserve source, detail, confidence, and validation status for each signal.
- Make clear that source, confidence, and validation are user-maintained assertions;
  the application does not verify what the customer said or whether a source is
  authoritative.
- Treat a hot button as a customer signal rather than a contractual requirement.
- Surface missing source, user validation, or requirement links as unscheduled
  obligations. Link a signal to a requirement only when it genuinely influences that
  requirement; do not invent a requirement merely to clear an obligation.
- Include the source and trace in the decision package and stage-scoped AI payloads.

### Technology Assessment

- Provide weighted default criteria covering mission fit, performance, maturity,
  integration, cybersecurity/authorization, system safety, MOSA/openness, data
  rights, supply chain, affordability, schedule, and sustainment. Keep the default
  weights at 100 percent.
- Accept scores from 0–5 plus explicit unknown, with rationale, confidence, evidence,
  and optional TRL/MRL/IRL values. Display an in-context key that expands these as
  Technology, Manufacturing, and Integration Readiness Levels and explains the
  accepted scales: TRL 1–9, MRL 1–10, and IRL 0–9.
- Store TRL/MRL/IRL as candidate-level summaries. The basis should conservatively
  reflect the least-mature essential technology, manufacturing path, or integration
  point; IRL is a limiting integration-maturity summary, not an interface-by-interface
  assessment. Permit optional `readinessBasis` and `readinessAsOf` candidate metadata
  without making those fields mandatory for existing v1 workspaces.
- Label any candidate ordering provisional. A weighted result is calculated only
  over scored criteria and must be interpreted with assessment and evidence coverage.
- Never convert an unknown or invalid score to zero.

### Optional Analysis of Alternatives

- Provide **Analysis of Alternatives (AoA)** as an optional enhanced trade record in
  Prove rather than a required lifecycle gate or a second assessment collection.
- Let an architect record an analysis title, decision objective, at least two
  solution-scoped candidate alternatives, a baseline alternative, scope and ground
  rules, evaluation approach, sensitivity and uncertainty, supporting evidence,
  owner, analysis date, status, and recommendation.
- Derive the comparison matrix from the existing Technology Assessment candidate
  status, weighted score, assessment coverage, evidence coverage, and TRL/MRL/IRL
  summaries. Do not copy scores into the AoA or create another scoring source.
- Keep all AoA references in the same solution and reject a baseline that is not one
  of the selected alternatives.
- When no AoA exists, create no AoA obligation and do not change readiness or
  coverage. Once an AoA is created, surface missing alternatives, baseline, scope,
  evaluation approach, sensitivity, evidence, or recommendation as deterministic
  Prove obligations.
- Include every used AoA and its derived comparison in Markdown, standalone HTML,
  native PDF, Microsoft Word, and Microsoft Excel decision-package exports. Include
  the AoA acronym in the package key only when an AoA is present.

### Architecture

- Model all required element and interface types.
- Provide five guided view templates, deterministic auto-layout, drag and keyboard
  positioning, and accessible table alternatives.
- Export separate SVG and PNG views.
- Describe the output as decision-focused and informed by DoDAF viewpoints and its
  fit-for-purpose presentation guidance, without claiming automatic conformance. The
  workbench does not implement the DM2/PES conditions that the official framework
  identifies for DoDAF conformance. See the official
  [DoDAF overview](https://dodcio.defense.gov/DoDAF/) and
  [viewpoints and models](https://dodcio.defense.gov/Library/DoD-Architecture-Framework/dodaf20_viewpoints/dodaf20_project.aspx).

### MOSA

Treat modular open systems approaches as an integrated technical and business
strategy: modular boundaries, open and well-defined interfaces, consensus-based
standards, upgrade paths, competition, sustainment, and necessary data rights. Use the
[DoD MOSA Reference Framework](https://ac.cto.mil/wp-content/uploads/2020/06/MOSA-Ref-Frame-May2020.pdf)
as a reference, not as a certification automatically produced by the app.

### Decision package

- Assemble selected company mission segments, the mission brief, customer hot
  buttons, requirements traceability,
  assessments, architecture, trades, optional Analyses of Alternatives, decisions,
  risks, dependencies, win themes,
  roadmap, evidence gaps, and transition plan.
- Export Markdown and self-contained themed HTML.
- Generate and directly download a native, Letter-size PDF with a designed cover,
  page headers and numbers, controlled pagination, tables, and print-friendly
  architecture diagrams; do not rely on a browser print dialog.
- Generate a valid editable Microsoft Word `.docx` package with document styles,
  headings, tables, headers, footers, and page fields.
- Generate a valid Microsoft Excel `.xlsx` workbook with separate, formatted sheets
  for executive context, mission and outcomes, customer and win themes, requirements
  and evidence, Technology Assessment, architecture and interfaces, decisions and
  risk, delivery and transition, and gaps and readiness.
- Build every format locally from the same validated selected-solution records.
  Exclude pending inbox entries, original sources, full meeting text, snapshots, and
  unaccepted AI drafts. Do not add workspace data-boundary or browser notices to the
  decision-package content.

### Requirement support check

- Report whether each current requirement has one direct source-evidence link and an
  acceptance method.
- Do not call this lightweight check a solicitation compliance matrix or imply that
  it parses instructions/evaluation criteria, tracks every shall, assigns proposal
  response locations and owners, manages exceptions, or determines compliance.
- Direct teams to maintain the authoritative solicitation matrix in the approved
  proposal system.

### Win themes

- Make win themes first-class, solution-scoped records rather than proposal slogans.
- Connect every active theme to customer value, one or more sourced customer hot
  buttons, a differentiating approach, a proof narrative, and linked evidence.
- Surface themes with missing customer relevance, discriminator, proof, or evidence
  as proposal-stage obligations.
- Include substantiation status and trace links in proposal support, AI scoping, and
  the exported decision package.
- Treat substantiation status as an architect-controlled assertion. The app surfaces
  missing links and evidence but does not independently prove that a theme will win.

### AI assistance

- Limit actions to `draft_artifact`, `critique_artifact`, `find_gaps`,
  `generate_review_questions`, and `propose_architecture_view`.
- Show the exact stage-bounded payload and require explicit acknowledgments before
  transmission.
- Require an authenticated and allowlisted user.
- Return structured drafts, findings, assumptions, warnings, and citations to active
  workspace record IDs.
- Never overwrite authored content; saving creates a separate pending draft, and
  acceptance changes only that draft's review status.

## Non-goals for v1

- shared real-time editing or cloud project storage;
- a cloud-synchronized, centrally governed, or live-linked enterprise product catalog;
- classified/CUI authorization or enterprise records management;
- arbitrary or unsupported document ingestion, OCR, source-document retention, or
  binary attachment storage;
- automatic research, source verification, DoDAF certification, ATO evidence, or
  engineering approval;
- cost-estimating, pricing, contract, requirements-management, digital-thread, PLM,
  MBSE, or configuration-management system replacement;
- a many-source requirement-authority model, per-component/per-interface readiness
  model, or fully structured interface ownership, security-boundary, standards, and
  verification model;
- a solicitation compliance matrix or automated compliance determination;
- complete evaluator-ready proposal-volume or PowerPoint generation;
- autonomous acceptance of AI output or automatic solution changes; and
- automatic propagation of Knowledge Base edits into active solutions or automatic
  replacement of solution-specific assessment judgments.

## Acceptance boundary

The release is acceptable when the schema and solution isolation are enforced,
unknowns stay explicit, import validation is all-or-nothing, storage failures stay
visible, coverage checks and exports are deterministic, diagrams have keyboard and tabular
alternatives, themes remain separate from content, capture never bypasses review,
source binaries remain transient, Knowledge Base copy and refresh preserve solution
isolation, separate workspace and catalog backups validate before replacement, an
unused AoA creates no readiness requirement, the public data warning remains visible,
optional AI sends only a reviewed bounded payload, and all static, browser, and
production smoke checks pass.
