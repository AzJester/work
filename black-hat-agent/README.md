# Black Hat Agent

A public, anonymous, browser-only workspace for structured competitive analysis and
Black Hat facilitation. It turns information entered by a capture team into
evidence-cited scorecards, challenge themes, actions, and versioned reports.

**Live path:** `https://azjester.github.io/work/black-hat-agent/`

## What works

- pursuit creation, editing, duplication, search, archive, and archive restore
- customer priorities and weighted evaluation criteria
- session participants, facilitator context, and working notes
- evidence records with source details, confidence, and stable report citations
- optional small local evidence attachments and source URLs
- competitor profiles, strengths, weaknesses, likely strategies, and
  criterion-by-criterion scoring
- built-in and user-created Black Hat playbooks
- deterministic, evidence-grounded competitive-analysis generation
- confidence-adjusted CPI, comparative margin, and a clearly labeled scenario estimate
- editable report drafts with saved versions and run history
- action-register creation and maintenance
- Markdown download, Word-compatible `.doc`, and print-ready PDF output
- local `.xlsx`, `.xls`, and `.csv` import with mapping, preview, and diagnostics
- validated JSON workspace import/export
- automatic local snapshots and manual recovery
- responsive desktop and mobile layouts

No account, API key, database, cookies, or hosted AI service is required. Workspace
data is stored in the current browser using `localStorage`.

## What “analysis” means in this edition

The application compares the customer priorities, evaluation criteria, evidence,
competitor scorecards, and team judgments recorded in the workspace. Its rules
produce a repeatable report with score comparisons, vulnerabilities, likely
competitive themes, counter-positioning, actions, citations, confidence warnings,
and information gaps.

The application does **not** use an AI model, research the web, discover competitors,
or independently verify a claim. The quality of a report depends on the quality and
completeness of the information the team enters.

## Local spreadsheet import

The browser-only import wizard accepts `.xlsx`, `.xls`, and `.csv` files up to 5 MB.
Each import is limited to 2,000 data rows, 100 columns, 100,000 total cells, and
10,000 characters in any one cell.
It can import pursuits, evaluation criteria, evidence, competitors, competitor
scores, and actions. Choose a worksheet and header row, accept or adjust the
suggested column mapping, and review the preview and diagnostics before committing.

Three import modes are available where supported:

- **Append** creates new records and skips records that match existing data.
- **Upsert** creates new records and updates records that match existing data.
- **Replace** replaces only the selected record type for the active pursuit. Replace
  is not available for pursuits or competitor scores.

Any validation error blocks the entire import, so no partial change is applied. The
application creates a recovery snapshot immediately before a successful atomic
commit.

Excel parsing runs in a 20-second, disposable browser worker using the
repository-bundled SheetJS CE 0.20.3 library under the Apache-2.0 license. ZIP-based
workbooks are preflighted before parsing and limited to 50 MB expanded, 20 MB per
entry, 2,000 entries, and 50 worksheets. Encrypted and ZIP64 workbooks are rejected.
Hidden worksheets cannot be selected, and a selected sheet with hidden imported rows
or columns is rejected. CSV uses a strict local UTF-8 parser. There is no CDN, API,
or upload. The original file is not retained; only mapped values are saved to
browser storage and included in later workspace exports.

## Start locally

From the repository root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/black-hat-agent/`.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Security and data handling](docs/SECURITY.md)
- [Product requirements and design decisions](docs/PRODUCT_SPEC.md)

## Data handling

This public static application is suitable for synthetic, public, or otherwise
approved information only. Browser storage, snapshots, and downloaded exports are
convenience features, not enterprise records management or an authorization
boundary. Imported spreadsheet values are subject to the same limits and are stored
in the same browser workspace. See the [security guide](docs/SECURITY.md) before
entering or importing pursuit data.
