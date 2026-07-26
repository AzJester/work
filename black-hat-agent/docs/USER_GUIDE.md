# User Guide

## Quick start

1. Open the site. No sign-in is presented or required.
2. Choose a synthetic pursuit or select **Create pursuit**.
3. Complete the opportunity profile, customer priorities, and evaluation criteria.
4. Add customer, competitor, and market artifacts in **Evidence Room**.
5. Create competitor profiles and score your team and the competitors against the
   customer criteria.
6. Select a built-in facilitation lens or create a custom playbook.
7. Record the facilitator, participants, session question, and working notes.
8. Run the Black Hat session to generate a deterministic competitive-analysis
   report.
9. Review the evidence citations, edit the report, and save a report version.
10. Download the approved report as Markdown or a Word-compatible `.doc`, or use
    the print-ready view to save a PDF.
11. Use **Export workspace** to make a portable JSON backup.

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

The output center provides three report formats:

- **Markdown** for repositories, plain-text review, and later editing.
- **Word** downloads an HTML-based `.doc` for Microsoft Word review and
  incorporation into capture artifacts. It is not a native `.docx` package.
- **PDF** opens a print-ready report. In the browser print dialog, choose
  **Save as PDF** as the destination; the site does not directly download a PDF
  binary.

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

## Workspace import and export

- **Export workspace** downloads a JSON backup containing the editable workspace.
- **Import** validates a selected JSON file before replacing the current workspace.
- **Reset demo** replaces the working workspace with synthetic sample data.
- **Snapshots/recovery** restore recent local states without a downloaded file.

An invalid or incompatible import is rejected and should leave the current workspace
unchanged. After a successful import, verify the active pursuit, evidence citations,
scores, report versions, and actions before continuing.

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
- Export a dated workspace backup before major sessions.
- Use only synthetic, public, or otherwise approved information in this public site.
