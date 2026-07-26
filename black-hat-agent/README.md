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
boundary. See the [security guide](docs/SECURITY.md) before entering pursuit data.
