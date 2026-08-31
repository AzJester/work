# Product Requirements and Role Model

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
   maturity, integration, cyber/safety, openness, data rights, supply chain, cost,
   schedule, and sustainment.
5. **Capture and proposal support** — build a defensible CONOPS, technical approach,
   discriminators, compliance trace, estimate assumptions, and delivery commitments.
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

- explain the mission, decision, and intended operational effect;
- distinguish sourced customer signals from validated requirements and trace the
  signals that materially shape the solution;
- trace material requirements to sources, acceptance methods, and architecture;
- compare solution candidates without hiding unknowns;
- communicate the complete capability and its interfaces through decision-useful
  views;
- show why key trades and decisions were made and what evidence supports them;
- identify unresolved technical, business, review, and transition obligations;
- produce a reviewable decision package and portable workspace backup.

## Functional requirements

### Lifecycle and command view

- Guide the seven-stage Discover → Shape → Assess → Architect → Prove → Propose →
  Transition workflow.
- Calculate an unscheduled obligation list from deterministic workspace checks.
- Provide direct navigation from each obligation to its owning stage.

### Workspace

- Support multiple isolated solutions in one browser workspace.
- Persist validated changes locally and expose unsaved and failed-save states.
- Create bounded recovery points before destructive operations.
- Export the complete versioned JSON workspace and validate an entire import before
  replacing the active in-memory workspace. Report any final browser-storage failure
  visibly rather than claiming a successful save.

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
  integration, cyber/safety, MOSA/openness, data rights, supply chain, affordability,
  schedule, and sustainment.
- Accept scores from 0–5 plus explicit unknown, with rationale, confidence, evidence,
  and optional TRL/MRL/IRL values.
- Never convert an unknown or invalid score to zero.

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

- Assemble the mission brief, customer hot buttons, requirements traceability,
  assessments, architecture, trades, decisions, risks, dependencies, win themes,
  roadmap, evidence gaps, and transition plan.
- Export Markdown and standalone HTML.
- Provide a print-ready view for browser PDF generation.

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
- classified/CUI authorization or enterprise records management;
- arbitrary document ingestion or binary attachment storage;
- automatic research, source verification, DoDAF certification, ATO evidence, or
  engineering approval;
- cost-estimating, pricing, contract, requirements-management, digital-thread, PLM,
  MBSE, or configuration-management system replacement;
- complete evaluator-ready proposal-volume or PowerPoint generation;
- autonomous acceptance of AI output or automatic solution changes.

## Acceptance boundary

The release is acceptable when the schema and solution isolation are enforced,
unknowns stay explicit, import validation is all-or-nothing, storage failures stay
visible, readiness and exports are deterministic, diagrams have keyboard and tabular
alternatives, the public data warning remains visible, optional AI sends only a
reviewed bounded payload, and all static, browser, and production smoke checks pass.
