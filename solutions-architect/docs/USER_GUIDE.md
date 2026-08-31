# User Guide

## Before entering information

The banner at the top of every workspace states the operating boundary. Use the app
only for approved unclassified, non-CUI information. Browser storage does not make a
public web application suitable for classified, CUI, export-controlled, proprietary,
or customer-restricted content.

The workbench coordinates solution information and specialist inputs. It does not
replace the responsible cyber, safety, systems engineering, test, pricing, contracts,
logistics, legal, security, export-control, or mission-domain authorities.

## Begin with a solution

The first launch includes a clearly synthetic defense-integration example. Use it to
understand the lifecycle, assessment, architecture, and decision-package views.

To begin separate work:

1. Select **New solution**.
2. Give the solution a concise name.
3. In **Discover**, replace the empty brief with the mission problem and exact
   decision that the work must support.
4. Use the solution selector in the sidebar to move between solutions.

Each record is bound to one solution. **Duplicate active solution** creates an
independent copy with new identifiers. Deleting a solution removes all of its bound
records after creating a recovery point; it does not affect another solution.

## Use the command view

The command view is the daily starting point. It shows four readiness indicators and
the highest-priority unscheduled obligations. Follow **Resolve** to the relevant
lifecycle stage.

Readiness is a deterministic completeness signal, not a probability of contract
award, mission success, authority to operate, technical approval, or design
certification. A formal review can still identify issues that no automated rule sees.

## Work the lifecycle

### 1. Discover

Define the mission problem, current and desired operational states, constraints,
stakeholders, customer hot buttons, outcomes, and measurable effects. State the
decision and decision owner clearly enough that the later architecture and trades can
be judged against it.

Use **Ingest** under **Customer hot buttons** to paste up to 50 newline-separated
customer priorities, concerns, sensitivities, or decision drivers. Name the actual
source interaction, then review each signal's detail, confidence, and validation
state. Bullets and numbered-list prefixes are removed and exact duplicates are
skipped. This is structured paste intake, not document ingestion.

A hot button is a customer signal—not an authoritative requirement. Preserve what
was heard, where it came from, and how confident the team is before using it as a
discriminator or decision driver. The source, confidence, and validation fields record
your assessment; the app does not independently verify the signal.

### 2. Shape

Translate the need into requirements and nonfunctional requirements. For every
material requirement:

- link the source evidence;
- link relevant validated customer hot buttons while keeping the authoritative source
  evidence separate;
- record an acceptance or verification method;
- identify the architecture elements that satisfy it;
- preserve unknowns instead of filling gaps with unsupported certainty.

Evidence should identify the source, observation, type, date, confidence, and a safe
HTTP(S) source URL when appropriate. A link is a reference, not proof that the source
is authoritative or current.

The command view flags each non-retired hot button that is not linked to a
requirement. Link it only when it genuinely influences that requirement. If a signal
should no longer drive the solution, retire it instead of inventing a requirement to
clear the obligation.

### 3. Assess

Add complete solution candidates rather than comparing isolated products without
their integration consequences. The default criteria cover mission fit, performance,
maturity, integration, cyber and safety, MOSA and openness, data rights, supply chain,
affordability, schedule, and sustainment.

For each criterion:

1. Keep the default weight or adjust it for the decision.
2. Enter a 0–5 score only when the team can support it.
3. Record rationale and evidence confidence.
4. Link supporting evidence.
5. Use optional TRL, MRL, and IRL values only when the team has a defensible basis.

An unentered score remains **Unknown** and does not silently become zero. A score
without rationale or support creates an obligation.

### 4. Architect

Create only the views needed to support the decision:

- Mission / system context
- Operational mission thread
- System and platform interfaces
- Data and information flow
- Deployment and transition

Add people or organizations, mission activities, hardware, software, services, data
stores, networks, facilities, environments, and external systems. Connect them with
physical, electrical, RF, network, API, data, or human/process exchanges.

Use **Auto-layout** for a repeatable starting position. Drag an element to reposition
it, or select it and use the arrow keys for 10-pixel movement; hold Shift for 1-pixel
movement. The **Accessible architecture data** section exposes the same elements and
exchanges in tables.

Download the selected view as SVG for scalable editing or PNG for presentation use.
The views are decision-focused products informed by DoDAF's fit-for-purpose
presentation guidance. The app is not a DM2/PES implementation and does not certify
DoDAF conformance.

### 5. Prove

Record the alternatives considered, decision rationale, risks, dependencies, assumptions, and
review gates. Give material risks and reviews accountable owners. Use entry evidence
and status to distinguish a planned review from one that is genuinely ready or
complete.

### 6. Propose

Build each win theme as a traceable chain: **customer hot button → customer value →
our discriminator → proof**. Link the source customer signals and supporting evidence,
then mark the theme substantiated only when the reason to believe is defensible. The
proof narrative and linked evidence are separate: record both. Status is your
assertion; the app surfaces gaps but does not verify that a theme is competitively
differentiated or likely to win.

Build the CONOPS, technical approach, discriminators, estimate assumptions, and
delivery commitments from those themes and the same solution evidence. The compliance trace surfaces
requirements without source evidence or acceptance methods. V1 supports proposal
inputs; it is not a complete evaluator-ready proposal-volume generator.

### 7. Transition

Sequence assessments, integrations, demonstrations, reviews, and handoff events.
Record receiving-team acceptance, configuration, training, sustainment, ownership,
and blockers. A transition action is incomplete until the accountable receiver and
acceptance target are clear.

## Produce a decision package

Open **Decision package** to review the assembled mission brief, customer hot buttons,
requirements trace, assessments, architecture summary, trades, decisions, risks,
dependencies, win themes, roadmap, transition actions, readiness, and evidence gaps.

- **Download Markdown** creates an editable narrative artifact.
- **Standalone HTML** includes printable content and architecture diagrams.
- **Print / PDF** opens a separate print-ready browser view and requests the browser
  print dialog. Allow the pop-up; if the dialog does not appear, use the browser's
  Print command. Choose **Save as PDF** where supported. The app does not create or
  retain a PDF automatically.
- Use the Architect view's **SVG** and **PNG** controls for separate diagram files.

Review every exported artifact before sharing it. An export can outlive browser data
and may inherit additional handling or records-management requirements.

## Back up and recover

Open the workspace tools menu:

- **Export JSON backup** downloads the complete editable workspace.
- **Import JSON backup** validates the complete file before replacing current data.
- **Create recovery point** keeps a bounded local snapshot.
- **Recovery** restores a selected snapshot after first preserving the current state.

Automatic snapshots and the working copy share browser storage. Clearing site data
removes both, so downloaded JSON is the durable backup and transfer format.

## Use AI assistance safely

1. Choose **AI assist**, an allowed action, lifecycle stage, and optional focus.
2. Select **Prepare exact payload**.
3. Inspect every field and record ID in the JSON preview.
4. Complete all three data acknowledgments.
5. Sign in with an approved account.
6. Send the selected facts.
7. Review findings, assumptions, warnings, and workspace citations.
8. Save the response as a pending draft only if it is useful and correctly grounded.
9. In **Prove**, review that saved draft and explicitly accept or reject it.

The five supported actions are drafting an artifact, critiquing an artifact, finding
gaps, generating review questions, and proposing an architecture view. AI output is
untrusted draft material. Saving creates a pending draft; accepting it changes only
that draft's review status. Neither action changes the underlying mission,
requirements, scores, architecture, decisions, or commitments.
