# Working agreements

## Push, merge and deploy without asking

Standing instruction from the repository owner, given 2026-11-12: always push, merge and deploy without asking first.

What that means here:

- Push finished work, open the pull request, and merge it to `main` in the same turn. Do not leave it waiting for a go-ahead.
- Merging to `main` starts the "Deploy to GitHub Pages" workflow, which is the deploy. Watch that run and report whether it succeeded.
- Verify before merging: run the tests that cover the change and load the page. A failing check is a reason to fix it first.
- Report after the fact what was merged and deployed, including anything worth a second look.

Interpretation, not stated by the owner: this covers work the session was asked to do. It does not extend to deleting data, rewriting history on branches other people use, or merging other people's pull requests.
