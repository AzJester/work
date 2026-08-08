# User Guide

Open **User Guide** in the application's **Help** navigation section for an in-app
version of the recommended workflow with direct links to each workspace area.

## Quick start

1. Open the site. No sign-in is presented or required.
2. Choose a synthetic pursuit or select **Create pursuit**.
3. Optionally use **Data Import** to map an Excel or CSV table into the workspace.
4. Complete the opportunity profile, customer priorities, and evaluation criteria.
5. Add customer, competitor, and market artifacts in **Evidence Room**.
6. Create competitor profiles and score your team and the competitors against the
   customer criteria.
7. Select a built-in facilitation lens or create a custom playbook.
8. Record the facilitator, participants, session question, and working notes.
9. Run the Black Hat session to generate a deterministic competitive-analysis
   report.
10. Review the evidence citations, edit the report, and save a report version.
11. Download the approved report as Markdown, standalone visual HTML, or a
    Word-compatible `.doc`, or use the print-ready view to save a PDF.
12. Use **Export workspace** to make a portable JSON backup.

## 1. Frame the pursuit

Use the opportunity workspace to record the name, customer, stage, status, owner,
next review, and summary. Add customer priorities in the language the customer uses
where possible.

Define the evaluation criteria the team expects the customer to apply. Give each
criterion a weight or relative importance. Keep priorities and criteria distinct:

- A **priority** is an outcome or concern important to the customer.
- An **evaluation criterion** is a dimension on which solutions or offerors will be
  compared.

Weights and scores are team judgments unless supported by a cited customer artifact.
Document the basis for any consequential assumption.

## 2. Build the evidence base

In **Evidence Room**, create one record for each useful artifact or observation.
Include a recognizable source name or URL, evidence type, confidence, and a concise
note explaining what the source supports.

Each evidence record receives a stable citation label. Generated reports use those
labels so a reviewer can trace a statement back to the local record. A citation does
not verify the source; the team must still confirm its accuracy and permitted use.

An evidence record can include an HTTPS source URL and one optional local attachment
up to 300 KB. Text, Markdown, CSV, and JSON attachments can populate an empty note
with a bounded excerpt; PDF and Word files are retained as attachments but are not
parsed. Attachments consume limited browser storage and are included in JSON workspace
exports.

Prefer separate records when one document supports unrelated claims. Mark indirect
or uncertain observations with a lower confidence rather than presenting them as
facts.

## 3. Profile and score competitors

In **Competitors**, record each plausible competitor's position, likely strategy,
strengths, weaknesses, and rationale. Include your team's own position in the
criterion-level comparison so the scorecard shows relative gaps.

Score each organization against the active pursuit's evaluation criteria using the
same scale. Use notes or rationale to explain important scores and connect them to
evidence where possible. The application summarizes the entered scores and weights;
it does not independently decide that one competitor is better.

The command center also shows a confidence-adjusted Competitive Position Index and,
when both criteria and competitors are scored, a scenario estimate with a broad
uncertainty range. The estimate is a planning aid based on entered scores, coverage,
confidence, and critical-gate gaps. It is explicitly not a statistical forecast.

Use the visual panels to compare:

- ranked CPI, coverage, and confidence across your team and competitors;
- team and competitor scores for each criterion;
- the strongest positive and negative criterion gaps;
- the scenario estimate, prior estimate, and uncertainty range;
- linked evidence, support/challenge conflicts, and evidence-to-criterion
  traceability;
- saved-run trends and the action-register mix.

Each visual includes **View accessible data table**. Use that table for exact values
or when a graphical encoding is not useful. **Unknown** means the workspace did not
contain a valid value; it is not treated as zero.

Before accepting a scorecard:

- challenge unsupported high and low scores;
- distinguish an incumbent advantage from a proven discriminator;
- look for missing, tied, or low-confidence criteria;
- test whether the customer's likely weighting differs from the team's weighting;
- record an action for information that could materially change the result.

## 4. Prepare a session

Choose a built-in playbook in **Playbook Library**, or create a custom playbook for a
specific review lens. Custom playbooks should use focused prompts that can be answered
from the workspace, such as transition risk, evaluator simulation, incumbent defense,
or discriminator credibility.

In **Black Hat Session**, record:

- the facilitator and participants;
- the central question;
- working notes and dissenting views;
- the playbook to apply.

Participant names and notes are stored locally and may appear in workspace exports,
so follow the data-handling guidance for the site.

## 5. Generate and review the competitive analysis

Generate the report after the priorities, criteria, evidence, and competitor
scorecards are ready. The application deterministically assembles:

- executive and opportunity summaries;
- customer priorities and weighted evaluation criteria;
- comparative scores;
- competitor-by-competitor posture and likely strategy;
- strengths, weaknesses, vulnerabilities, and challenge themes;
- counter-positioning and win-theme prompts;
- existing and recommended actions;
- unsupported assumptions, confidence warnings, and missing information;
- evidence citations and a verification guardrail.

The generator uses no AI model and performs no web research. It reorganizes and
compares only the information entered in the workspace. Treat the first draft as a
facilitation product that requires human review.

## 6. Edit, version, and restore reports

Open a generated report in **Output Center** or **Run History**. Edit inaccurate
wording, add session judgment, or remove a claim that the evidence does not support.
Save changes as a new version so earlier report text remains available.

Use report history to inspect or restore a prior version. Restoring a version changes
the current report text; save or export the current version first if it must also be
retained.

Regenerating a report uses the latest workspace records. It does not silently update
an older report version, which preserves the review trail.

## 7. Export a report

The output center provides four report formats:

- **Markdown** for repositories, plain-text review, and later editing.
- **Visuals HTML** downloads a self-contained visual briefing with native SVG charts
  and accessible data tables. It needs no chart service or API.
- **Word** downloads an HTML-based `.doc` for Microsoft Word review and
  incorporation into capture artifacts. Visuals are embedded as local PNG images
  with their data tables. It is not a native `.docx` package.
- **PDF** opens a print-ready report. In the browser print dialog, choose
  **Save as PDF** as the destination; the site does not directly download a PDF
  binary. The print view includes the saved report visuals and tables.

Visuals in a generated report come from its saved visual snapshot. Later workspace
changes do not silently rewrite an older report's charts. Generate a new report to
capture the current scores, evidence, and actions. Large analyses retain the
report-time subset displayed by each chart and table and state the full record
totals whenever items were omitted. Reports created by an older application version
without a visual snapshot show **Analysis visuals unavailable** in the app and
exports; the application never combines an older report's text with current
workspace visuals.

Review the downloaded file before distribution. A report export is not a complete
workspace backup and may omit source-detail, snapshot, or version-history records.

## 8. Manage pursuits and recovery

Archive a pursuit to remove it from the active portfolio without deleting its
records. Use the archived-pursuit view to restore it. Restoring makes the pursuit
available for selection again.

The application saves changes in the browser and retains bounded snapshots for
recovery. Use the recovery controls to inspect and restore a recent snapshot after
an accidental edit, reset, or import. Because snapshots and the working copy share
the same browser storage, both disappear if the site's storage is cleared.

## 9. Import Excel or CSV

Use **Data Import** to add or update structured records from a local `.xlsx`, `.xls`,
or `.csv` file. The file must be no larger than 5 MB. A single import can contain at
most 2,000 data rows, 100 columns, 100,000 total cells, and 10,000 characters in
any cell.

The wizard can target:

- pursuits;
- evaluation criteria;
- evidence;
- competitors;
- competitor scores; or
- actions.

For criteria, evidence, competitors, competitor scores, and actions, first select the
pursuit that should receive the records. Replace operations affect only the active
pursuit.

### Import steps

1. Export a current workspace JSON backup before a consequential bulk import.
2. Open **Data Import** and select **Start local import**.
3. Choose a `.xlsx`, `.xls`, or UTF-8 `.csv` file. Excel runs in a disposable,
   20-second browser worker with the repository-bundled SheetJS CE 0.20.3 library;
   CSV is parsed as inert text. There is no CDN, API, or upload.
4. For an Excel workbook, select a visible worksheet. Hidden and very hidden
   worksheets are unavailable, and a selected sheet with hidden imported rows or
   columns is rejected. For every format, select the physical row containing the
   column headers.
5. Choose the destination and an available import mode:

   - **Append** creates unmatched records and skips matches.
   - **Upsert** creates unmatched records and updates matches.
   - **Replace** removes the selected destination's existing records for the active
     pursuit, then creates the imported records. Replace is not available for
     pursuits or competitor scores.

6. Review the suggested field mappings. Correct a mapping manually or leave an
   optional field unmapped as appropriate.
7. Review the record preview, create/update/skip summary, and every row or field
   diagnostic. For large imports, the interface shows the first 100 planned changes
   and states that the preview is truncated; every row is still validated. Select
   **Show all diagnostics** or download the diagnostics CSV when a large source needs
   offline correction.
8. Resolve all errors in the source file or mapping. Any error blocks the complete
   import; valid rows are not partially committed.
9. Confirm the import once the plan is valid. The application creates a recovery
   snapshot immediately before applying the complete change atomically.
10. Review the imported records in their destination and verify references, dates,
    scores, and classifications.

Spreadsheet formulas are never calculated by the application. If a workbook stores
a cached displayed value for a formula cell, that value may be read as ordinary
input. Macros are never run, and external workbook links are never fetched.

ZIP-based `.xlsx` files are also limited to 50 MB expanded, 20 MB in any one entry,
and 2,000 entries. ZIP64 and encrypted workbooks are rejected, and all Excel files
are limited to 50 worksheets.

The original workbook is not retained. Only successfully mapped values persist in
browser `localStorage`, recovery snapshots, and subsequent workspace JSON exports.
Canceling before confirmation leaves the workspace unchanged.

## Full-workspace JSON import and export

- **Export workspace** downloads a JSON backup containing the editable workspace.
- **Import** validates a selected JSON file up to 10 MB before replacing the full
  current workspace.
- **Reset demo** replaces the working workspace with synthetic sample data.
- **Snapshots/recovery** restore recent local states without a downloaded file.

An invalid or incompatible import is rejected and should leave the current workspace
unchanged. Legacy supported workspaces are migrated before use. Identifiers,
cross-pursuit references, evidence/criterion relationships, attachment encodings,
and score types are checked before the new workspace is saved. After a successful
import, verify the active pursuit, evidence citations, scores, report versions, and
actions before continuing.

JSON import restores or replaces the complete application workspace. Excel and CSV
import is different: it maps tabular rows into one selected destination using append,
upsert, or a supported active-pursuit replace operation.

Export a dated JSON backup before clearing browser storage, moving to another device,
performing a major import, or running a consequential session. Private/incognito
windows may discard all local data when closed.

## Recommended operating practice

- Do not treat hypotheses, rankings, or deterministic report language as facts.
- Give every consequential claim a recognizable source and confidence level.
- Record why a score was assigned, not only the number.
- Separate confirmed evidence, reasonable inference, conflicting evidence,
  unsupported hypothesis, and missing information.
- Ask session participants to challenge customer weights and internal bias.
- Assign owners and dates to validation gaps.
- Save a report version before material editing.
- Export a dated workspace backup before major sessions or bulk imports.
- Inspect spreadsheet mappings, skipped matches, and diagnostics before committing.
- Use the mobile **Menu** button on narrow screens; navigation preserves the active
  page in the URL so browser Back and Forward work as expected.
- If the header says **Unsaved changes** or **Save failed**, remain on the current
  form, correct the issue, and save before navigating elsewhere.
- Use only synthetic, public, or otherwise approved information in this public site.
