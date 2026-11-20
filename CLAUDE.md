# Working agreements

## Push, merge and deploy without asking

Standing instruction from the repository owner, given 2026-11-12: always push, merge and deploy without asking first.

What that means here:

- Push finished work, open the pull request, and merge it to `main` in the same turn. Do not leave it waiting for a go-ahead.
- Merging to `main` starts the "Deploy to GitHub Pages" workflow, which is the deploy. Watch that run and report whether it succeeded.
- Verify before merging: run the tests that cover the change and load the page. A failing check is a reason to fix it first.
- Report after the fact what was merged and deployed, including anything worth a second look.

Interpretation, not stated by the owner: this covers work the session was asked to do. It does not extend to deleting data, rewriting history on branches other people use, or merging other people's pull requests.

## Titles and subtitles take no closing period

Standing instruction from the repository owner, given 2026-11-20 while reviewing the Astrion agentic AI page: titles and subtitles do not have a period at the end.

Interpretation, not stated by the owner:

- It covers headings, display lines, and the one-line subtitle under a section title, on pages and in documents built here.
- A title made of two sentences is rewritten as one phrase or set as two lines, so no period is left in the middle.
- Body copy, such as an item description of one or more sentences, keeps its periods.
- On `mission-intelligence/` the rule is enforced by the "titles and subtitles carry no closing period" test in `tests/mission-intelligence.test.mjs`.
