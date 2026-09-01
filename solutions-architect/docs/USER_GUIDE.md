# Solution Architect Workbench User Guide

**Status: UNDER DEVELOPMENT.**

This guide is a working playbook: start a solution, capture information without
breaking concentration, turn source material into reviewed records, build a
traceable solution, and produce a decision package.

## Find what you need

- [Start a useful solution in ten minutes](#quick-start-build-a-useful-solution-in-ten-minutes)
- [Choose the right capture or ingestion path](#choose-the-fastest-safe-intake-path)
- [Ingest a meeting transcript or summary](#ingest-a-meeting-transcript-or-summary)
- [Open permitted local files](#open-local-files-for-ingestion)
- [Use the readable work-area layout](#use-the-readable-work-area-layout)
- [Build and reuse the Knowledge Base](#build-and-reuse-the-knowledge-base)
- [Add a Knowledge Base offering from Technology Assessment](#add-a-knowledge-base-offering-from-technology-assessment)
- [Archive, restore, or permanently delete an offering](#archive-restore-or-permanently-delete-an-offering)
- [Import Knowledge Base offerings from Excel or CSV](#import-a-list-from-excel-or-csv)
- [Work the iterative solution lifecycle](#work-the-solution-lifecycle)
- [Run an optional Analysis of Alternatives](#run-an-optional-analysis-of-alternatives)
- [Produce the decision package](#produce-and-review-the-decision-package)
- [Back up, recover, or move work](#back-up-recover-and-move-work)
- [Use optional AI safely](#use-optional-ai-assistance-safely)
- [Troubleshoot common problems](#when-something-goes-wrong)

## The two rules to remember

1. **Use only approved unclassified, non-CUI information.** The published release is
   not authorized for classified, CUI, export-controlled, proprietary,
   competition-sensitive, or customer-restricted content. An account, local file
   picker, Knowledge Base, browser storage, or AI acknowledgment does not change that
   boundary.
2. **Capture is not acceptance.** A note, extracted passage, score, or AI suggestion
   is a lead to review. It becomes part of the solution only after a person verifies
   the source, meaning, provenance, and correct record type.

The workbench coordinates specialist inputs. It does not replace the responsible
cyber, safety, systems engineering, test, pricing, contracts, logistics, legal,
security, export-control, or mission-domain authorities.

## Quick start: build a useful solution in ten minutes

1. Open **Workspace tools → Create a new solution** and give the effort a concise
   name.
2. Open **Discover** and select every applicable **Company mission segment**.
3. State the mission problem, operational context, desired effect, decision, and
   decision owner.
4. Press `Alt+Q` or select **Capture**. Record the most important customer concern or
   unknown, name its source, and save it to the inbox.
5. Select **Inbox** in the header or **Workspace tools → Review capture inbox**,
   verify the item, classify it as a customer hot button, requirement, evidence, win
   theme, assumption, risk, or decision, and commit it.
6. Open **Command**. Resolve the highest-value obligation instead of trying to fill
   every screen at once.
7. Open **Decision package** to see what the current solution can already explain and
   what is still missing.

**What to do next:** create a downloaded JSON backup before an important review or
after a substantial working session. Resolve or commit useful capture-inbox items
first because the separate inbox is not included in the workspace JSON backup.
If you also maintain the Knowledge Base, export its separate catalog JSON.

## Set up the workspace for how you work

### Choose a visual theme

Use the compact theme toggle on the left side of the workbench. Turn it on for the
Dark theme and off for the Light theme. The standalone guide has the same toggle in
its header.

Light is the default when this browser has no saved theme. Changing the toggle saves
an explicit Dark or Light choice. A previously stored **System** preference is still
honored: it follows the operating-system preference until you use the toggle. To
restore automatic operating-system behavior later, open **Workspace
tools** and choose **Use device theme**.

The setting does not change the solution, appear in exports, or travel with a JSON
backup. If browser storage is unavailable, the choice lasts only for the current
session.

### Use the readable work-area layout

The same visual system now applies across Command, Discover, Shape, Assess,
Architect, Prove, Propose, Transition, and Decision package:

- the left navigation uses larger labels and targets, clear grouping, and a wider
  solution selector;
- inputs, menus, buttons, and field labels use a consistent, readable size;
- narrative text boxes start taller and expand with their content to a bounded
  height, then scroll internally for unusually long entries—ordinary editing does
  not require dragging a resize handle;
- editable records are separated into cards with consistent spacing, headings, and
  remove controls rather than running together as dense rows;
- long labels and linked-record names wrap instead of covering adjacent controls;
- editable governance and architecture registers become labeled cards where space
  is limited, while wide analytical tables stay inside a scrollable panel; and
- desktop, tablet, and phone layouts stack controls before they become too narrow.

Use the browser zoom control if you need additional magnification. The responsive
layout will reflow, although complex assessment or report tables may still require
horizontal scrolling within their own panel.

### Understand the synthetic example

The first launch contains a clearly synthetic defense-integration example. Use it to
learn the lifecycle, assessment, architecture, and export workflows. Create a new
solution before beginning real approved work.

### Keep solutions isolated

Every workspace record and every capture-inbox item belongs to one solution. The
solution selector changes the active context. **Duplicate active solution** creates
an independent copy with new identifiers. Deleting a solution removes its bound
records after creating a recovery point; it does not remove another solution.

## Classify the company mission segment

In **Discover**, select all segments the solution supports:

- Integrated Air and Missile Defense
- Lifecycle Management and Cyber Warfare
- Layered Defense, Autonomous Warfare & Integrated Fires
- Space Warfighting
- Critical Infrastructure Protection
- Exploration and Lunar Presence

This is a multi-select classification, not an exclusive program label. Choose only
the segments the solution materially supports. The selections appear in the mission
brief and decision package and are included in the exact, reviewed AI payload.

**What to do next:** explain how the solution contributes to the selected segments in
the mission problem, desired state, outcomes, and measures. A checked box without a
mission connection is not a strategy.

## Capture now, classify after the conversation

### Choose the fastest safe intake path

| What you have | Start here | What is retained |
|---|---|---|
| One fact, concern, decision, or idea | **Capture** or `Alt+Q` | A pending, solution-bound proposal |
| A meeting transcript or summary | **Capture → Meeting transcript or summary** | Only the excerpts you select, plus meeting metadata |
| A permitted document, spreadsheet, or image | **Workspace tools → Open local files** | Only selected excerpts or a manual image caption, plus source metadata |
| A list of reusable solution offerings | **Knowledge base → Import list** | Validated additions or explicit revision-controlled updates to the reusable catalog |
| A short list of customer signals | **Discover → Customer hot buttons → Ingest** | One unverified customer-signal record per accepted line |
| A complete prior workbench backup | **Workspace tools → Import JSON backup** | The fully validated workspace, replacing current browser data only after validation |

Do not use workspace JSON import for source research, and do not use source-file
intake to restore a workspace. Each path has a different validation and review
boundary.

Use **Capture** for a short fact, concern, decision, question, or idea that should not
interrupt the current meeting or analysis. `Alt+Q` opens the capture flow. The active
solution is fixed for the capture so a note cannot silently move into another
solution.

Record enough context to make the note useful later:

- a specific title rather than “customer issue”;
- the exact observation or excerpt;
- the source or interaction;
- the most likely destination record type.

Use `Ctrl+Enter` on Windows/Linux or `Command+Enter` on macOS to save and continue
capturing when the dialog advertises that shortcut. Otherwise use its visible Save
control.

Captured items enter the separate **Review** inbox. They do not immediately change
requirements, evidence, risks, decisions, or proposal claims.

### Review the inbox

Select **Inbox** in the header or **Workspace tools → Review capture inbox**. Work
each pending item deliberately:

| Destination | Use it for | Initial posture after commit |
|---|---|---|
| Customer hot button | A customer priority, concern, sensitivity, or decision driver | Captured and Unverified |
| Evidence | A bounded observation or source excerpt | Low confidence unless raised by the reviewer |
| Requirement | A need that should enter the requirements workflow | Draft; acceptance and authority still need review |
| Win theme | A possible customer-value claim | Draft; discriminator and proof remain incomplete |
| Assumption | Something the solution currently depends on | Unverified |
| Risk | A possible adverse condition or consequence | Open with Unknown likelihood and impact |
| Decision | A choice that needs accountable review | Proposed |
| Ignore | Duplicate, irrelevant, or unsafe material | Kept out of the workspace |

Edit the proposed title and excerpt, confirm the source, and select only the items you
intend to commit. Related evidence and the record that cites it should be committed
together when the review UI identifies that dependency. A failed validation or
browser-storage write leaves the authoritative workspace unchanged.

**Download inbox JSON** creates a separate reference copy of the active solution's
capture envelope. It is not part of the workspace backup and the current UI does not
import it, so commit reviewed records before relying on a workspace transfer or
recovery workflow.

**What to do next:** go to the destination stage and complete the record. For example,
give a captured risk an owner and mitigation; add an acceptance method and source to
a draft requirement; or connect a draft win theme to a validated hot button and
supporting evidence.

### Worked capture-to-decision example

Suppose an approved customer working session produces the statement, “Avoid a
single-vendor upgrade path.”

1. Use Quick Capture to preserve the exact statement, working-session source, and
   surrounding context as a proposed customer hot button.
2. In the inbox, correct the wording and commit it as **Captured / Unverified**. Validate
   it through the responsible customer or capture authority before raising confidence.
3. In Shape, create the defensible requirement from its authoritative source—for
   example, a governed modular interface and necessary interface/data rights—and link
   the hot button as a customer driver rather than pretending it is the authority.
4. In Architect, show the modular boundary, exchanged data, standard, owner, and
   conformance point.
5. In Assess, score candidates against MOSA/openness, integration, data rights,
   sustainment, and affordability using evidence and explicit unknowns.
6. In Prove, record the trade and proposed decision, including rationale, owner,
   evidence, risks, and residual uncertainty.
7. In Propose, turn the connected facts into a win theme only if the approach is
   truly differentiating and provable.
8. In Transition, assign delivery of the interface package, conformance evidence,
   configuration ownership, and upgrade-path acceptance.

That chain preserves what the customer said, distinguishes it from requirement
authority, and makes the final decision and proposal claim auditable.

## Ingest a meeting transcript or summary

Use **Capture → Meeting transcript or summary** when an approved working session,
review, interview, or customer conversation produced text that may inform the
solution. This workflow is available from Quick Capture and Workspace tools.

1. Confirm the meeting content is inside the published app's approved-unclassified,
   non-CUI boundary.
   Also disable any browser/OS enhanced spellcheck, translation, extension, or input
   service that organizational policy does not permit for the source. The app turns
   off ordinary spellcheck and autocomplete on the full-text field but cannot control
   the managed endpoint around it.
2. Enter a specific meeting title, choose **Transcript** or **Summary**, add the
   meeting date, and list participants by name or role.
3. Select every company mission segment that the meeting informs. The active
   solution's segment selections are preselected and can be changed for this source.
4. Paste the meeting text. The complete text remains only in the open dialog.
5. For a transcript, highlight the exact passage you need and select **Add highlighted
   excerpt**. Repeat for up to 20 excerpts, each no more than 6,000 characters.
6. For a short summary of 6,000 characters or fewer, you may select **Use whole short
   summary**. A longer summary must be divided into deliberate excerpts.
7. Review the excerpt list and select **Stage excerpts for review**. Closing or
   canceling the dialog discards the complete pasted text.
8. Open **Inbox**, verify each excerpt against the authorized source, and commit only
   the evidence you intend to use.

The committed evidence preserves source type, date, participants, mission segments,
and a line-oriented locator. It does not retain the rest of the transcript or
summary. Meeting statements remain evidence—not an automatic requirement, customer
commitment, contractual direction, or validated hot button. Create those downstream
records only through the normal review and traceability workflow.

**Worked example:** a permitted integration-review transcript discusses both
Integrated Air and Missile Defense and Lifecycle Management and Cyber Warfare.
Select those two segments, preserve the bounded passage that describes the interface
concern, and commit it as low-confidence meeting evidence. Then create or update a
requirement only after identifying its authoritative source; link the meeting
evidence as context rather than presenting the conversation as contractual authority.

**Privacy check:** before closing the dialog, the browser contains both the pasted
text and selected excerpts in memory. After staging, only selected excerpts and
metadata enter the separate review inbox. Neither the complete meeting text nor an
audio/video recording is stored, exported, cached, logged, or sent to AI by this
workflow.

## Open local files for ingestion

Open **Workspace tools → Open local files** to extract reviewable content without
uploading the source to a cloud service. The browser reads the file locally, displays
extracted text or an image preview, and lets the user choose bounded excerpts or
metadata for the active solution's capture inbox.

### Supported formats

| Format | Local behavior |
|---|---|
| TXT, Markdown, CSV | Strict UTF-8 text extraction and preview |
| JSON | Strict UTF-8 parsing and a bounded readable preview |
| PDF | Local text extraction, up to 200 pages |
| DOCX | Local extraction from the supported Word Open XML document |
| PPTX | Local extraction from the supported PowerPoint Open XML presentation |
| XLS, XLSX, ODS | Local spreadsheet parsing into bounded reviewable content |
| PNG, JPEG, WebP | Local image preview, dimensions/hash metadata, and manual caption or transcription |

Image ingestion does **not** perform OCR. A screenshot or scanned page therefore
needs a human-supplied caption or transcription. A scanned PDF with no embedded text
may have the same limitation.

The workbench does not accept legacy Word/PowerPoint formats, macro-enabled Office
files, SVG, HTML, arbitrary ZIP archives, or any other unlisted format. Rename tricks
do not make an unsupported format safe or supported.

### Intake limits

- 8 MB per file
- 10 files and 25 MB total per intake session
- 2,000 entries per ZIP-based Office document
- 20 MB per expanded ZIP entry
- 50 MB total expanded ZIP content
- 200 PDF pages
- 200,000 extracted text characters per source
- 20-second local extraction timeout

These limits reduce browser lockups and decompression abuse; they are not a security
classification control.

### Safe ingestion sequence

1. Confirm the source is allowed in this public browser application.
2. Open **Workspace tools → Open local files** and choose only the needed sources.
3. Inspect the reported filename, type, size, hash/locator, warnings, and extraction
   result.
4. For an image, write a concise manual caption or transcription. Do not infer text
   or meaning that is not visible.
5. Select only the passage or metadata needed for the solution.
6. Add it to **Review**; no authoritative solution record is created yet.
7. In **Inbox**, verify the excerpt against the original, correct the proposed
   record type, and commit only the useful items.
8. In the destination stage, complete source authority, confidence, acceptance,
   ownership, and trace links.

Original file bytes are transient. They are never stored in the workspace,
localStorage, recovery points, JSON backups, decision packages, service-worker cache,
AI payloads, or a cloud database. Only user-approved bounded excerpts and source
metadata can persist in the separate capture inbox and, after review, the workspace.

Extraction is not source validation. The user must verify that the text is complete,
accurate, current, authoritative, correctly attributed, and allowed for the intended
use. Complex layouts, formulas, charts, speaker notes, tracked changes, handwriting,
scans, and embedded objects may be missing or flattened.

**What to do next:** retain the authorized original in the organization's approved
record system. This workbench stores neither the original nor a durable evidentiary
attachment.

### Worked document-to-decision example

For a permitted PDF concept brief, select only the paragraph that defines a required
operational effect. Map it to **Requirement** during source review. The app proposes a
separate evidence item for the excerpt and a linked draft requirement. Review and
commit both together, then add the source's actual authority, an acceptance method,
architecture links, and the decision that uses the requirement. The PDF itself is
discarded from the intake session and must remain in the organization's approved
record system.

## Build and reuse the Knowledge Base

Open **Knowledge base** in the left navigation to manage the catalog, or select **Add
offering** from Assess to choose from it. This is a separate browser-local catalog for reusable approved
unclassified, non-CUI products, applications, software, services, platforms,
integrated solutions, and other offerings. It is shared across solutions in this
browser profile, but it is not a cloud library or an enterprise system of record.

### Add or revise an offering

1. Select **Add offering**.
2. Record the reusable facts: name, offering type, provider, product version/release,
   lifecycle status, summary, capabilities, mission segments, deployment and
   environment, interfaces, integration considerations, cyber and safety,
   MOSA/data-rights considerations, optional TRL/MRL/IRL and basis, source, tags, and
   review date.
3. Add a concise **Change summary** and save.
4. For a later update, select **Edit**, change the reusable facts, update the product
   version/release if appropriate, describe the change, and select **Save new
   revision**.

The product **Version / release** is a fact supplied by the provider or catalog
maintainer. The Knowledge Base **Revision** is the workbench's integer history marker;
it increases every time an item is edited, even when the provider's product version
did not change. A revision number records change order, not approval, configuration
control, or technical maturity.

Use **Current**, **Emerging**, **Legacy**, and **Retired** as catalog lifecycle values.
The interface labels Retired offerings as **Archived**. The Knowledge Base opens with
**Active offerings** selected, so Current, Emerging, and Legacy offerings are shown
while archived offerings stay out of normal selection. Use the **Availability** filter
to show **Archived offerings** only or **All offerings** together.

### Archive, restore, or permanently delete an offering

1. Select **Archive offering** to remove an obsolete offering from active results.
   Archiving creates a new revision; the offering cannot be copied into a solution or
   used to refresh a solution copy while it is archived.
2. To return it to use, choose **Archived offerings** in the Availability filter,
   select **Restore offering**, and restore it as Current, Emerging, or Legacy.
   Restoring also creates a new revision.
3. To remove it from the catalog entirely, archive it first and then select
   **Delete permanently**. Type the offering's exact name when prompted. Permanent
   deletion cannot be undone unless you restore a Knowledge Base JSON backup.

Archiving, restoring, or permanently deleting a catalog item never deletes an
existing solution copy. That candidate remains independent and usable in its
solution. An archived copy cannot receive catalog refreshes until the offering is
restored; after permanent deletion, its catalog management and refresh link is gone.
Download a Knowledge Base JSON backup before permanently deleting an offering.

### Import a list from Excel or CSV

Use the Knowledge Base **Templates** control before preparing a large list. The
[Excel import template](../assets/solution-knowledge-base-import-template.xlsx)
is also available directly. Microsoft
Excel (`.xlsx`) is the preferred format because its Instructions and Allowed Values
sheets preserve the field guidance. A UTF-8 CSV (`.csv`) with the same header row is
also accepted. The spreadsheet is processed locally in the browser; the selected
file is not uploaded or added to the catalog backup.

Use one offering per row. **Name** is the only required field for a new offering.
Keep **Catalog ID** and **Expected Revision** blank when adding a new item. Use
semicolons or line breaks between values in Capabilities, Mission Segments, and
Tags. Enter Interfaces as a plain-text interface summary. Use `YYYY-MM-DD` for dates.
Leave a readiness level blank when
it is unknown; valid values are 1–9 for Technology Readiness Level, 1–10 for
Manufacturing Readiness Level, and 0–9 for Integration Readiness Level.

Enter literal values rather than formulas. Keep the Solutions sheet and every used
row and column visible; the separate Instructions, Allowed Values, and Synthetic
Example sheets are guidance and are not offering rows. Each file is limited to 5 MB,
and the resulting catalog cannot exceed 1,000 offerings.

The canonical columns, in order, are:

| # | Column | Entry rule |
|---:|---|---|
| 1 | Catalog ID | Blank for a new item; exact existing ID for an explicit update |
| 2 | Expected Revision | Blank for a new item; current positive revision for an update |
| 3 | Name | Required for a new item |
| 4 | Offering Type | Product, Application, Software, Service, Platform, Integrated solution, or Other offering |
| 5 | Provider / Owner | Organization responsible for the reusable offering information |
| 6 | Version / Release | Provider's product or release identifier |
| 7 | Lifecycle Status | Current, Emerging, Legacy, or Retired |
| 8 | Summary | Reusable description, not mission-specific assessment rationale |
| 9 | Capabilities | Semicolon- or line-break-separated list |
| 10 | Mission Segments | Semicolon- or line-break-separated supported company segment names |
| 11 | Deployment and Environment | Hosting, platform, facility, network, or operating context |
| 12 | Interfaces | Plain-text summary of physical, electrical, RF, network, API, data, and process interfaces |
| 13 | Integration Considerations | Dependencies, constraints, adapters, and integration effort |
| 14 | Cyber and Safety Considerations | Known reusable cyber, authorization, and safety facts |
| 15 | MOSA and Data Rights | Modular boundaries, open interfaces, standards, competition, and necessary rights |
| 16 | Technology Readiness Level | Integer 1–9, or blank for unknown |
| 17 | Manufacturing Readiness Level | Integer 1–10, or blank for unknown |
| 18 | Integration Readiness Level | Integer 0–9, or blank for unknown |
| 19 | Readiness Basis | Scope, evidence, and limiting condition behind the readiness summaries |
| 20 | Readiness As Of | `YYYY-MM-DD`, or blank |
| 21 | Source Title | Human-readable source name |
| 22 | Source URL | Safe `http://` or `https://` locator without embedded credentials |
| 23 | Source Notes | Provenance, authority, limitations, and review notes |
| 24 | Tags | Semicolon- or line-break-separated search terms |
| 25 | Last Reviewed | `YYYY-MM-DD`, or blank |
| 26 | Change Summary | Required for an explicit update; recommended for new items |

After selecting **Import list**, review the preview before applying it. The preview
shows proposed additions, updates, unchanged rows, and any errors. The default mode
adds new items only. To revise existing items in one file, deliberately choose the
add/update mode and supply **Catalog ID**, **Expected Revision**, and **Change
Summary** for every update row. Names are never used as update keys. An unknown ID,
stale revision, duplicate ID or logical duplicate, invalid field, or storage failure
cancels the whole Apply operation; successfully validated rows are not partly saved.

Spreadsheet import merges rows into the current catalog. Existing candidates already
copied into solutions remain point-in-time copies and do not refresh automatically.
Review each **Update available** notice and use **Refresh solution copy** explicitly
when the changed reusable facts apply to that solution.

### Add a Knowledge Base offering from Technology Assessment

Use this path when you are building a solution and want to choose from the complete
active catalog without leaving the assessment:

1. Confirm the correct active solution in the left-side solution selector.
2. Open **Assess → Technology Assessment** and select **Add offering**. The **Add
   offering to active solution** chooser opens.
3. Use **Search offerings** to narrow the list by offering name, provider, capability,
   tag, version, type, or other displayed catalog details. The chooser shows every
   active Knowledge Base offering, including the offerings previously imported from
   Excel or CSV.
4. Select **Add to solution** on each offering you want. The workbench creates and
   selects a Technology Assessment candidate in the background while keeping the
   chooser open so you can add more. An item already copied into this solution is
   marked **Added** and cannot be duplicated.
5. If the offering does not exist yet, select **Create new offering** in the chooser,
   record its reusable catalog facts, and save it. The workbench returns to the
   chooser with the new item available; select **Add to solution** to copy it into the
   active solution. Saving the catalog item alone does not add it to a solution.
6. Select **Done** or close the chooser to return to Technology Assessment and work
   with the selected candidate.

Use **Custom candidate** only for a one-off candidate that should belong to this
solution without becoming a reusable Knowledge Base offering.

Archived offerings are deliberately excluded from the chooser. Restore an offering
from **Knowledge base → Archived offerings** before using it in another solution.
The chooser prevents duplicate copies by marking a catalog item **Added** when its
candidate is already in the active solution.

Adding an offering uses the same copy-on-use rule as the Knowledge Base page. The new
candidate belongs only to the active solution. Later catalog edits do not silently
change its scores, rationale, evidence, status, trades, or decisions; review and apply
an available catalog refresh deliberately.

### Copy an offering into a solution

You can also start from **Knowledge base** when you want to inspect or maintain the
catalog before using an item:

1. Confirm the correct active solution in the left-side selector.
2. Search or filter the Knowledge Base by offering type, availability, or company
   mission segment. Active offerings are shown by default.
3. Review the source, review date, readiness basis, interfaces, and integration
   limitations. Catalog content is reusable input, not proof that the offering fits
   this mission.
4. Select **Use in active solution**.
5. Open Assess and add solution-specific status, scores, rationales, and supporting
   evidence to the new candidate.

Copy-on-use creates a new candidate ID bound only to the active solution. The
candidate records the source catalog item and revision, but it is not live-linked.
Editing, retiring, deleting, or importing the catalog does not silently change that
candidate or any assessment in another solution. If the same catalog item is already
present in the active solution, the control opens the existing assessment rather
than creating a duplicate.

### Refresh an existing solution copy

When an active item has a newer catalog revision, its card shows **Update available**
and **Refresh solution copy**. Archived offerings cannot refresh solution copies.

1. Review the catalog change summary and the candidate's current solution-specific
   assessment.
2. Select **Refresh solution copy** only when you want the newer reusable facts.
3. Recheck the refreshed candidate before using it in a trade, AoA, decision, or
   export.

Refresh creates a recovery point and updates catalog-derived name, category,
provider, description, readiness levels/basis/as-of date, and catalog provenance. It
preserves the candidate's solution-specific status and its assessment scores,
rationales, and evidence links. Any manual edits to the copied name, description, or
readiness fields are catalog-derived and will be replaced, so move truly
solution-specific reasoning into score rationales, evidence, trades, decisions, or
risks before refreshing.

### Back up the catalog separately

- **JSON backup** downloads or restores a validated
  `solution-knowledge-base-v1` JSON file. Restore validates the whole file and then
  replaces the current catalog; it does not merge items.
- **Import list** accepts the Knowledge Base Excel template or a matching UTF-8 CSV
  and merges its validated additions or explicit updates into the catalog.
- Download a catalog JSON backup before a large spreadsheet Apply when you may need
  to reverse the change.
- Download a catalog JSON backup before permanent deletion; it is the only recovery
  path after the exact-name confirmation is accepted.
- A workspace JSON backup, recovery point, solution duplicate, capture-inbox export,
  decision package, and AI payload do not include the Knowledge Base.

To move the full browser-local setup, download both the workspace JSON and the
Knowledge Base JSON, then import each into the destination browser. Original source
documents and images are not included in either backup.

## Work the solution lifecycle

Treat Discover, Shape, Assess, Architect, Prove, Propose, and Transition as iterative
work lenses—not approval gates, a required sequence, or a calendar. The selected
stage records the team's current emphasis. Move between lenses whenever new evidence,
a trade, or a review changes the solution. Formal technical, program, customer, and
authority reviews remain governed processes outside the app.

### 1. Discover — establish the decision context

Define the mission problem, current and desired operational states, stakeholders,
outcomes, measures of effectiveness, constraints, customer hot buttons, company
mission segments, and the decision owner.

Use **Ingest list** under **Customer hot buttons** when you already have a short approved
plain-text list: one signal per line, up to 50. Name the actual interaction and review
confidence and validation status. Bullets and numbered-list prefixes are removed and
exact duplicates are skipped. Use **Workspace tools → Open local files** for supported
documents, spreadsheets, or images that need source preview and the separate review
step.

A hot button is a sourced customer signal, not an authoritative requirement. The
source, confidence, and validation fields record the architect's judgment; the app
does not independently verify what the customer said.

**What to do next:** retire a signal that should no longer shape the solution, or link
it to a requirement only when it genuinely drives that requirement.

### 2. Shape — turn mission need into traceable requirements

For every material requirement:

- link authoritative source evidence;
- link relevant validated customer hot buttons while keeping those signals distinct
  from requirement authority;
- define an acceptance or verification method;
- trace the requirement to architecture elements;
- preserve unknowns instead of filling gaps with unsupported certainty.

Each requirement is presented as a separate readable card. The requirement statement
and acceptance method expand automatically as you type, up to a generous bounded
height; you do not need to drag a resize handle for ordinary content. The selected
source is repeated in full below its menu. Customer-driver and architecture links use
wrapping chips plus an expandable checkbox list, so long names remain visible on
desktop, tablet, and phone layouts.

Evidence should identify the source, observation, type, date, confidence, and a safe
HTTP(S) reference when appropriate. A URL is a locator, not proof that the source is
authoritative or current.

**What to do next:** use Command to find missing evidence, untraced requirements, and
absent acceptance methods before comparing solution candidates.

### 3. Assess — compare complete solution candidates

Compare integrated options, not isolated products stripped of their integration and
sustainment consequences. The default weighted criteria cover mission fit,
performance, maturity, integration, cybersecurity and authorization, system safety,
MOSA and openness, data rights, supply chain, affordability, schedule, and
sustainment.

Select **Add offering** to open the searchable list of all active Knowledge Base
items. Use **Add to solution** for every reusable option you want to assess, or
**Create new offering** to add a missing reusable item to the catalog before selecting
it. Use **Custom candidate** for a one-off, solution-only option. See [Add a Knowledge
Base offering from Technology Assessment](#add-a-knowledge-base-offering-from-technology-assessment)
for the complete workflow.

Enter a 0–5 score only when it has defensible rationale and evidence confidence. Link
supporting evidence. Use optional TRL, MRL, and IRL values only when the team has an
agreed basis. An empty score remains **Unknown** and does not silently become zero.

- **TRL — Technology Readiness Level (1–9):** how mature the technology itself is,
  from early research through proven use in an operational environment.
- **MRL — Manufacturing Readiness Level (1–10):** how ready the team and industrial
  base are to produce it consistently at the needed quality, rate, and cost.
- **IRL — Integration Readiness Level (0–9):** how ready the technology is to connect
  and operate with the other components, interfaces, and processes in the complete
  solution.

The workbench stores one TRL, MRL, and IRL value per candidate. Treat each as a
candidate-level summary and use the least-mature essential technology, manufacturing
path, or integration point as the limiting basis. In particular, IRL summarizes the
limiting integration maturity; it is not a separate assessment of every interface.
Record the assessment basis and as-of date when known. The v1 JSON contract can
retain optional `readinessBasis` and `readinessAsOf` metadata without making them
mandatory for older v1 workspaces. Use the visible basis/scope and as-of fields, score
rationales, and linked evidence to make the summary reviewable.

The displayed candidate order is provisional. The weighted score uses only criteria
that have a number, so an option with many **Unknown** values can appear stronger or
weaker as coverage changes. Compare assessment coverage, evidence coverage, weights,
and consequential criteria before making a recommendation.

**What to do next:** investigate unsupported scores and criteria with high weight but
low confidence. Carry consequential differences into a trade or decision.

### 4. Architect — show how the complete capability works

Create only the views needed to support the decision:

- mission or system context;
- operational mission thread;
- system and platform interfaces;
- data and information flow;
- deployment and transition.

Model people and organizations, mission activities, hardware, software, services,
data stores, networks, facilities, environments, and external systems. Connect them
with physical, electrical, RF, network, API, data, or human/process exchanges.

Use **Auto-layout** for a repeatable starting position. Drag an element or select it
and use the arrow keys for 10-pixel movement; hold Shift for 1-pixel movement. The
**Accessible architecture data** tables expose the same elements and exchanges
without requiring diagram interaction. Download SVG for scalable use or PNG for a
presentation image.

The views are decision-focused products informed by DoDAF fit-for-purpose guidance.
The app is not a DM2/PES repository and does not certify DoDAF conformance.

**What to do next:** make every consequential interface explicit—owner, protocol or
standard, data or physical exchange, security boundary, and verification approach.

### 5. Prove — make uncertainty and accountability visible

Record alternatives, trades, proposed and accepted decisions, risks, dependencies,
assumptions, reviews, demonstrations, and residual uncertainty. Give material risks
and reviews accountable owners. Distinguish a planned review from one that is truly
ready or complete.

#### Run an optional Analysis of Alternatives

Use a normal trade study for a lightweight comparison. Select **Add analysis** in the
optional **Analysis of Alternatives** panel only when the decision needs a more
deliberate, reviewable comparison. An AoA is not required for every solution: when
you do not create one, it adds no obligation and does not change readiness or coverage.

1. Build and assess at least two complete candidates in Assess. Unknown values can
   remain unknown; document why they matter instead of inventing scores.
2. In Prove, select **Add analysis** and state the analysis title and decision
   objective.
3. Select the alternatives and identify the baseline. The baseline must be one of the
   selected candidates.
4. Record scope and ground rules so reviewers know what is inside the comparison,
   the scenario and time horizon, the constraints, and which assumptions are held
   constant.
5. Explain the evaluation approach. The matrix automatically reuses current weighted
   Technology Assessment score, assessed coverage, evidence coverage, readiness
   summaries, and candidate status; do not create a separate set of scores.
6. Link supporting evidence, name the owner and analysis date, and document
   sensitivity and uncertainty—especially whether a changed weight, assumption,
   performance result, cost/schedule input, or interface constraint could change the
   recommendation.
7. Record the recommendation and move the status from **In analysis** to **Ready for
   decision** or **Closed** only when the accountable review supports that state.

Once an AoA exists, Command surfaces missing alternatives, baseline, scope, method,
sensitivity, evidence, or recommendation as Prove obligations. Deleting the AoA
removes those AoA-specific obligations; it does not delete the underlying candidates,
assessment records, evidence, or ordinary trade studies.

All decision-package formats include a used AoA's objective, baseline, ground rules,
method, sensitivity, evidence, owner/date/status, recommendation, and derived
alternative comparison. The acronym key adds **AoA — Analysis of Alternatives** only
when one is present.

**What to do next:** confirm each decision cites evidence and each risk has an owner,
mitigation, and transition disposition.

### 6. Propose — build substantiated win themes

Use this trace chain:

**company mission segment → mission need → customer hot button → customer value → our
discriminator → proof → supporting evidence → requirement/architecture/decision**

Example using synthetic content:

> **Hot button:** demonstrate integration without locking the customer to one vendor.
> **Customer value:** faster capability insertion with competitive upgrade paths.
> **Discriminator:** governed modular boundaries and published interface contracts.
> **Proof:** a synthetic integration demonstration plus an evidence-backed data-rights
> and conformance plan.

The four lines are not enough by themselves. Link the real source hot button, relevant
requirements, evidence, architecture interfaces, trade rationale, and delivery
commitments. Mark a theme substantiated only when the reason to believe is defensible.
Status is a user assertion; the app does not prove that a theme is differentiated or
likely to win.

Build the CONOPS, technical approach, discriminators, estimate assumptions, and
delivery commitments from the same facts. V1 supports proposal inputs; it is not a
complete evaluator-ready proposal-volume generator.

The **Requirement support check** reports whether each current requirement has a
linked source and acceptance method. It is not a solicitation compliance matrix: it
does not parse solicitation instructions or evaluation criteria, track every shall,
assign proposal response locations and owners, manage exceptions, or determine
compliance. Maintain the governed solicitation matrix in the approved proposal
system and use this check only to find missing internal support.

**What to do next:** read the win theme backward. If proof does not support the
discriminator, or the discriminator does not create the stated customer value,
revise it before export.

### 7. Transition — preserve design intent into delivery

Sequence assessments, integrations, demonstrations, reviews, and handoff events.
Record receiving-team acceptance, configuration, interface ownership, training,
sustainment, residual risks, and blockers. A transition action is incomplete until
the accountable receiver and acceptance target are clear.

**What to do next:** walk the transition package with the receiving team and capture
their acceptance evidence or remaining blockers.

### Know the current field limits

V1 intentionally keeps several records lightweight:

- a requirement has one direct source-evidence field, not a many-source authority
  model;
- TRL, MRL, and IRL are candidate-level summaries, not maturity records for every
  component, manufacturing process, or integration point;
- an assessment score has rationale and evidence links, but no separate score-level
  confidence field; inspect the confidence of its linked evidence;
- an architecture exchange has type, label, protocol, and description fields, but
  owner, standard, security boundary, and verification method are not separate
  structured fields;
- evidence provenance is user-entered and the app does not verify source authority,
  freshness, authenticity, or customer approval;
- the Requirement support check is not a solicitation compliance matrix.

Keep the detailed authoritative artifacts in the organization's approved systems and
reference only permitted evidence here. Do not fill a missing field with unsupported
certainty simply to improve coverage.

## Use Command as the daily work queue

Command shows coverage indicators and unscheduled obligations such as missing
evidence, untraced requirements, unsupported scores, incomplete interfaces, unowned
risks, unresolved decisions, incomplete reviews, weak win themes, and transition
blockers. Select **Resolve** to go to the owning stage.

The percentages measure deterministic record coverage from the current workspace.
They are not engineering-maturity ratings, a formal readiness review, or a probability
of contract award, mission success, technical approval, authority to operate, or
design certification. A formal review can identify issues no automated rule sees.

## Produce and review the decision package

Open **Decision package** to assemble the selected company mission segments, mission
brief, stakeholders, outcomes and measures, customer signals, requirements trace,
assessments, proposal approach, architecture elements and interfaces, trades,
optional Analyses of Alternatives, decisions, risks, dependencies, assumptions,
reviews, roadmap, transition actions, meeting-evidence context, coverage indicators,
and evidence gaps.

- **Download Markdown** creates an editable narrative.
- **Standalone HTML** creates a self-contained, themed executive report with a cover,
  section navigation, semantic headings, wrapping records, tables, and embedded
  architecture diagrams. It preserves the current light or dark site theme.
- **Word** downloads a real Microsoft Word `.docx` document with an editable cover,
  heading hierarchy, page header and footer, page numbers, formatted tables, and the
  complete architecture and interface register.
- **Excel** downloads a formatted `.xlsx` workbook with ten purpose-built sheets:
  Executive Summary; Mission & Outcomes; Customer & Win Themes; Requirements &
  Evidence; Technology Assessment; Architecture & Interfaces; Decisions & Risk;
  Analysis of Alternatives; Delivery & Transition; and Gaps & Readiness. The sheets use wrapped text, frozen
  headings, useful column widths, and no formulas or macros.
- **PDF** downloads a native, professionally formatted PDF directly. It uses a
  designed cover, Letter-size pages, repeated report headers, page numbers, wrapping
  tables, controlled pagination, and embedded print-friendly architecture diagrams.
  It does not open a browser print window or place Markdown inside a PDF page.
- The Architect screen's **SVG** and **PNG** controls download separate diagram files.

Every decision-package format is generated locally from the same validated,
selected-solution records. Pending inbox items, original source files, full meeting
text, snapshots, and unaccepted AI drafts are not included. The exported decision
package also excludes the reusable Knowledge Base itself; only candidates copied into
the active solution can appear. It does not add a data marking, browser-storage
language, or authorization or conformance disclaimers. Add any organization-required
cover, handling, approval, or distribution content through the governed publishing
process that applies to the final artifact.

Review the complete export before sharing it. A downloaded artifact can outlive the
browser workspace and may have additional distribution, records, and destruction
requirements.

### Other useful export additions

The current release provides Markdown, standalone HTML, native PDF, Microsoft Word,
Microsoft Excel, and separate SVG/PNG diagrams. The most useful next additions are:

| Priority | Format | Best use |
| --- | --- | --- |
| 1 | PowerPoint (`.pptx`) | Decision briefing: mission, customer hot buttons, win themes, architecture, trade recommendation, risks, roadmap, and decision requested |
| 2 | CSV registers | Portable requirements, risk, interface, evidence, and trace-matrix handoffs for systems that do not accept a workbook |
| 3 | Review-package ZIP | The selected solution's report, briefing, workbook, diagrams, workspace JSON, and a manifest with hashes |

Every future format should render the same validated, selected-solution package so
content cannot drift between files. It should include committed workspace records
only—not pending inbox items, original source files, full meeting text, snapshots,
or unaccepted AI drafts—and it should generate locally without macros, formulas,
remote images, external relationships, or cloud conversion.

## Back up, recover, and move work

Open **Workspace tools**:

- **Export JSON backup** downloads the complete editable `solution-workspace-v1`
  workspace and every solution it contains.
- **Import JSON backup** validates the entire file before replacing browser data.
- **Create recovery point** keeps a bounded local snapshot.
- **Recovery** restores a selected snapshot after first preserving the current state.

The Knowledge Base is a second local data store. In **Knowledge base**, use **JSON
backup** to download or restore its separate `solution-knowledge-base-v1` JSON.
Restore validates and replaces the catalog; **Import list** instead merges validated
Excel or CSV rows. The workspace backup does not contain the catalog, and the catalog
backup does not contain solutions, assessments, or recovery points. Keep both dated
JSON files when you need the full setup on another browser or device.

The per-solution review inbox is stored separately and is not part of the workspace
JSON export or recovery snapshots. **Download inbox JSON** can preserve a separate
reference copy, but the current UI does not import it. Commit useful items before a
workspace backup or transfer, and do not treat the inbox as a durable source
repository.

Working data, Knowledge Base items, inboxes, theme preference, and automatic snapshots
all depend on the current browser profile. Clearing site data removes them. Downloaded
workspace and catalog JSON files are the durable backup and transfer formats for their
respective records; neither contains original ingested files.

## Use optional AI assistance safely

1. Open **Workspace tools → AI assist**, then choose an allowed action, lifecycle
   stage, and optional focus.
2. Select **Prepare exact payload**.
3. Inspect every fact and record ID in the JSON preview. Selected company mission
   segments appear with the scoped mission facts.
4. Complete all three data acknowledgments.
5. Sign in with an approved account.
6. Send only the displayed payload.
7. Review findings, assumptions, warnings, and workspace citations.
8. Save a useful response as a pending draft.
9. In **Prove**, explicitly accept or reject the draft.

The allowed actions are drafting an artifact, critiquing an artifact, finding gaps,
generating review questions, and proposing an architecture view. AI output is
untrusted draft material. Saving or accepting a draft does not overwrite mission
facts, requirements, scores, architecture, decisions, or commitments.

Opening a local file does not call AI and does not upload the source. A file excerpt
can reach AI only after the user approves it into the workspace and then separately
reviews and acknowledges an AI payload that contains it.

## Keyboard, touch, and accessibility

- `Alt+Q` opens Quick Capture.
- Use normal Tab and Shift+Tab navigation through controls and dialogs.
- Use visible buttons for all capture, ingestion, review, and export actions; drag is
  not the only way to work.
- Move a selected diagram element with an arrow key; hold Shift for 1-pixel movement.
- Use **Accessible architecture data** as a table alternative to the diagram.
- The interface starts in Light, offers a compact theme toggle, honors a legacy
  System preference, and respects reduced-motion preferences.
- On touch devices, use Capture and Inbox in the header, use Workspace tools for
  Open local files and other grouped actions, and use the visible diagram controls;
  no hover-only action is required.

## Common pitfalls

| Pitfall | Better practice |
|---|---|
| Treating extracted text as authoritative | Compare it to the allowed original and record source confidence |
| Assuming images are OCR'd | Add a careful manual caption or transcription |
| Turning every hot button into a requirement | Preserve the signal; create a requirement only from the proper authority |
| Using a score to hide uncertainty | Leave it Unknown until rationale and evidence exist |
| Writing a generic win-theme slogan | Trace customer value, discriminator, proof, and evidence |
| Selecting a mission segment without showing contribution | Connect the segment to outcomes, measures, architecture, and transition |
| Keeping the only copy in browser storage | Download dated JSON backups |
| Expecting one JSON backup to include the workspace, Knowledge Base, pending inbox, and source files | Export workspace and catalog separately, commit reviewed inbox items, and retain authorized originals elsewhere |
| Assuming a catalog item is live-linked to a solution | Treat copy-on-use as a revisioned snapshot; refresh explicitly after reviewing changes |
| Refreshing after customizing catalog-derived candidate text | Move solution-specific reasoning into assessments, evidence, trades, decisions, and risks before refresh |
| Creating an AoA for every effort | Use it only when the decision warrants the additional comparison and governance |
| Copying Technology Assessment scores into an AoA | Use the derived matrix so the assessment remains the single scoring source |
| Pasting an entire transcript and assuming it is saved | Select and stage the needed excerpts; the complete meeting text is discarded on close |
| Treating a meeting statement as contractual direction | Preserve it as evidence, then validate authority before creating a requirement or commitment |
| Assuming login makes restricted data safe | Apply the data-handling boundary before capture, ingestion, export, or AI use |
| Assuming local intake controls browser/OS services | Disable unapproved enhanced spellcheck, translation, extensions, and input services before opening source content |
| Treating workspace coverage as approval | Use it as a completeness aid and still conduct accountable reviews |

## When something goes wrong

- **Extraction failed or timed out:** use a smaller allowed source, export its needed
  content to supported UTF-8 text, or capture a short verified passage manually.
- **A scanned PDF has no text:** enter a manual transcription only if the source is
  approved; the app has no OCR.
- **Review commit failed:** correct the cited field or dependency and retry. The
  authoritative workspace should remain unchanged.
- **Save failed:** stop adding content and export the current in-memory JSON backup.
- **A Knowledge Base list import was rejected:** correct every preview error and try
  again. No row is applied when any row fails. Confirm that dates use `YYYY-MM-DD`,
  lists use semicolons or line breaks, and an update has the exact Catalog ID,
  current Expected Revision, and a Change Summary.
- **An imported offering does not appear under Assess → Add offering:** clear the
  **Search offerings** value and confirm the item is active. The chooser includes
  Current, Emerging, and Legacy items but deliberately excludes Archived offerings.
  Restore an archived item from the Knowledge Base before selecting it.
- **A Knowledge Base JSON restore was rejected:** correct the first validation error
  or use the last exported catalog JSON. A rejected restore leaves the current
  catalog in place; JSON restore replaces rather than merges after validation.
- **A solution copy says Update available:** review the catalog change summary, then
  refresh explicitly if the new generic facts apply. Scores and solution status are
  retained, but catalog-derived name, description, and readiness fields are replaced.
- **A file may contain restricted information:** cancel intake and follow the
  organization's approved handling process. Do not “test” it in the app.
- **An export did not download:** retry from Decision package, confirm the browser is
  allowed to download files from this site, and verify that the active solution is
  valid. PDF, Word, and Excel generation stays local and does not require a pop-up or
  cloud conversion service.
- **Browser data disappeared:** restore the most recent downloaded JSON backup.
  Local recovery points and capture inboxes cannot survive cleared site data.
