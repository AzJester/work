# Astrion Black Hat Agent

A public, anonymous, browser-only competitive assessment workspace based on the
published GPT Site prototype.

**Live path:** `https://azjester.github.io/work/astrion-blackhat-agent/`

## What works

- pursuit creation, editing, duplication, selection, search, and archive
- evidence, competitor, and action-register entry
- reusable Black Hat playbooks
- deterministic, evidence-grounded local assessment generation
- run history and Markdown output center
- JSON workspace import/export and Markdown output download
- responsive desktop/mobile layout

No account, API key, database, cookies, or hosted AI service is required. Workspace
data is stored in the current browser using `localStorage`.

## Start locally

From the repository root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/astrion-blackhat-agent/`.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Security and data handling](docs/SECURITY.md)
- [Product requirements and design decisions](docs/PRODUCT_SPEC.md)

## Important limitation

The assessment generator is deliberately deterministic. It organizes locally entered
evidence, competitor hypotheses, readiness gaps, and actions into a facilitation
output. It does not claim to be an autonomous intelligence source and does not send
content to an external model.
