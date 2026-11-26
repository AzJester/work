# Proposal War Room

One place to run a proposal from RFP release to submission. Enter the due date and the review schedule is planned
back from it in business days. The app tracks section owners and page budgets, keeps the compliance matrix, and
uses Claude to read Section L and Section M text and pre-fill the outline.

Live: https://azjester.github.io/work/proposal-war-room/

## What it does

| Screen | What it holds |
|---|---|
| Dashboard | Countdown to the due date and the next milestone, page budget by volume, compliance coverage, overdue sections by owner, open questions for the contracting officer, a computed "Needs attention today" list, and "Draft status update" |
| Pursuit setup | Name, agency, solicitation number, release date, due date with time and zone, submission method, Q&A deadline, capture and proposal managers, volumes. Export, import, duplicate and delete |
| Schedule | Ten milestones planned back from internal submit. Timeline with a today marker, list with editable dates, change log, planning rules. Exports as `.ics` and CSV |
| Outline | Volume, section, subsection, each with L and M references, owner, reviewer, page allocation, status, due date and notes. Drag or Up and Down to reorder. Filter by owner. My assignments |
| Page budget | Page limit and allocations by volume, current counts by hand or from a word count, exclusions, and the Section L format rules as a checklist |
| Compliance | The matrix, the Gold team readiness gate, coverage by volume, the L-to-M crosswalk. Exports as `.xlsx` and CSV |
| L/M parser | Paste text or upload a PDF, a Word file or a text file. Review every extracted item against its quote, then apply |
| Team | Roster: name, email, role |
| Settings | Theme, words per page, account and storage |

## Scheduling rules

- Business days skip weekends, United States federal holidays and the pursuit's own blackout days. A Saturday
  holiday is observed on Friday and a Sunday holiday on Monday, for any year.
- Internal submit is the due date less one business day. The buffer can be changed or turned off.
- Proportional mode (default) puts storyboards at 15 percent of the window from kickoff to internal submit, Pink at
  35, Red at 65 and Gold at 85. Fixed mode counts business days back from internal submit: 22, 16, 8 and 3.
- A review session takes at least 1 business day, each recovery at least 2, and production at least 2, ending the
  business day before internal submit.
- When the window cannot hold those minimums, the schedule keeps the standard dates, flags each problem, and offers
  compressed plans with the exact list of what each one drops, shortens or moves. Nothing moves until one is applied.
  With fewer than 3 business days of drafting before Pink, the recommended plan folds Pink into Red. That threshold is
  a working default.
- Changing a date locks that milestone. Re-planning moves only unlocked milestones, and a locked date that breaks the
  order is flagged where it sits.
- A new due date is an amendment: every date is shown before and after, and the amendment number and date go into
  the change log when it is confirmed.
- Kickoff defaults to the RFP release date, or to today once that has passed. It stays put until someone moves it.

## Accounts, storage and Claude

- **Signed in:** pursuits save to the account in this repository's Supabase project, in `public.proposal_pursuits`,
  one row per pursuit. Row level security limits every row to the account that owns it. Accounts are issued by the
  workspace owner. There is no public sign-up.
- **This device only:** no account. Pursuits stay in the browser's local storage, and the two Claude features are off.
- **Claude** is called from a server-side route, the Edge Function `supabase/functions/proposal-assist`. The Anthropic
  key is a secret in the function's environment and never reaches the browser. The route does two jobs, with the
  prompts held on the server: the Section L/M parser and the status email. It checks the caller's account against the
  AI allowlist and a per-account hourly quota, like the other assistants in this repository.
- The parser sends the pasted text. The status email sends figures and names from the dashboard, never requirement text.
- **Keep to released solicitation text and planning data.** The site is on a public address. Nothing classified,
  controlled unclassified, export controlled or proprietary belongs in it.

## Brand

The app follows the `astrion-brand-2026` skill (Astrion Brand Kit v1.0) and draws every icon from the
`astrion-icons` sprite, which is a provisional set and says so in Settings.

- Colors come from `src/assets/astrion-web-tokens.css`, copied from the kit unchanged. Opacity appears on hairlines only.
- Astrion has no status colors, so the app has none. Every status is a word, with an icon where the set has one.
  Status styles route through `--status-*-ink` tokens, so an approved palette is one change.
- One Ion element in each screen region: the alert, the today marker, the next-milestone countdown, or that region's
  primary button.
- Archivo and JetBrains Mono, served from the kit's own WOFF2 files in `public/fonts/` with their licenses.
- Table text is set in points, from 8 to 10. Titles and headers carry no closing period.

## Develop

```bash
cd proposal-war-room
npm ci
npm run dev
```

```bash
npm run build
```

The deploy copies `dist/` as it is and runs no build, so **the build is committed**. `npm run build` type-checks,
builds, and writes `dist/build-manifest.json` with a hash of the sources. `tests/proposal-war-room-brand.test.mjs`
fails when the sources have changed since that build.

Logic lives in `src/lib/` as plain TypeScript with no browser or React imports. The repository's test runner loads
those files directly (Node 22.18 or later), so the unit tests run before a deploy with no install in this folder.

| Test file | What it holds |
|---|---|
| `tests/proposal-war-room-schedule.test.mjs` | Federal holidays, business-day arithmetic, both scheduling modes, locks, compressed plans, exports |
| `tests/proposal-war-room-data.test.mjs` | Pursuit files, outline, page budget, compliance matrix, workbook, uploads, dashboard, status email |
| `tests/proposal-war-room-parser.test.mjs` | The server route's contract and prompts, storage and quota migrations, parsing, merging and applying |
| `tests/proposal-war-room-brand.test.mjs` | Palette, corners, typefaces, icons, wordmark, titles, and that `dist/` matches the sources |
| `tests/browser/proposal-war-room.spec.mjs` | The built page, driven end to end, with the brand rules read from computed styles on every screen |

`fixtures/` holds the sample excerpt, the reply Claude gave for it (recorded, and used wherever a test needs the
parser's output), the reply Claude gave for the status email, and a worked sample pursuit built from them.
