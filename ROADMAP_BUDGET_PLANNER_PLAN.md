# Development Plan — Roadmap & Budget Planner

A single-file, browser-only planning app that combines a day-level Gantt timeline with
budget tracking: schedule cost blocks in color-coded lanes ("engines"), keep undated work
in a backlog, and see spent / planned / committed / remaining roll up by year and by
engine, all pro-rated by day against a movable as-of date.

This plan reverse-engineers the target from the reference screenshot and lays out how to
build it in this repository, following the house style already proven by `status.html`,
`weekly-task-tracker.html`, and `roadmap.html`: one self-contained HTML file, zero
external dependencies, `localStorage` persistence, Node unit tests plus Playwright
browser tests, deployed by the existing GitHub Pages workflow.

## Status

`budget-planner.html` is built. Milestones M0 through M4 are delivered in this branch; M5
completes when the branch merges and Pages publishes. Four decisions changed from the plan
below during the build:

- **Astrion 2026 brand replaces the reference's six lane colors.** The brand has no status
  or category palette, so lanes are told apart by their labeled rail and hairlines, blocks
  are Gunmetal panels (Bone on the light theme), and the as-of marker is the timeline's one
  Ion signal. The `engines[].color` field was dropped from the data model.
- **Committed by year is exact.** Each block's whole-dollar cost is allocated across years by
  largest remainder, so the committed column always equals the sum of scheduled costs; only
  the spent/planned split rounds (once per cell, with planned derived as committed minus spent).
- **Fonts are self-hosted, not system.** Archivo and JetBrains Mono ship in
  `assets/fonts/astrion/` under the SIL OFL, loaded by same-origin `@font-face` rules. The
  wordmark is the supplied outlined SVG, so Space Grotesk is not needed.
- **Seed dates were fitted to the reference totals.** Core, Horizon and Meridian reproduce
  the screenshot's spent and planned figures to the dollar; AI Initiative and Operations
  land within $40 because an exact match would need blocks that run into 2027, which the
  reference's empty 2027 column rules out.

Icons come from the provisional Astrion icon set and the page says so in its footer.

**Hours edition (added after the first build).** The document carries a `unit` (`USD` or
`hours`), and `budget-planner.html?unit=hours` (reached through `hours-planner.html`) opens a
separate saved plan with hours labels (Worked / Forecast / Total / Remaining, annual hours)
and no dollar figures. Blocks gained an optional `actual` (actual spend or hours logged to
date): when present it replaces the elapsed-schedule estimate as spent, spread over the
elapsed days by year, and the rest of the estimate is carried as planned over the remaining
days, so an overrun shows as spent above the estimate. The unit can also be switched under
Settings and travels with exported plans.

**Block management (follow-up).** A **+ Year** button in the timeline header extends the end
year one click at a time up to the ten-year cap, and the board's minimum width grows with the
number of months so month labels stay legible. A **Blocks** list under the backlog shows every
block with edit and delete buttons, the Delete key removes a focused block on the board or in
the backlog, and a caption under the timeline says so.

**Layout pass after review.** The wordmark is gone from the top bar by request, body text
runs the full width of the page (no 90ch cap on the explanation), and the paired tables sit in
equal halves that stack below 1200 px instead of a 3:4 split that clipped the by-year table on
mid-width screens. The by-year tables' corner header names the figure (Hours, Materials, Cost)
rather than repeating the heading above it.

**One application, hours and materials (v2).** The dollar and hours editions are merged. Every
block carries `hours`, `hoursActual`, `materials` and `materialsActual`; the document carries
`rate`, `hoursBudgets` (annual hours) and `budgets` (annual dollars), version 2. The engine
splits hours and materials separately at the as-of day (logged figures replace the elapsed
share, as before) and derives cost from the whole-number results: labor is hours at the rate,
materials are dollars as entered, so the Cost tables can be checked against the Hours and
Materials tables by hand. Three sections replace the old pair: Labor hours (by year with
editable annual hours, by engine), Materials (by year, by engine) and Cost (by year with the
editable annual budget, by engine, rate in the header). A budget that is not set shows
"Not set" rather than Over. `validateDoc` migrates version 1 documents (an hours plan carries
across; a dollar plan's labor cost becomes hours at the rate) and the app carries over
`hours_planner_v1` or `budget_planner_v1` from localStorage on first open; `hours-planner.html`
now redirects to the merged app.

**End-user interaction pass (follow-up).** Blocks move and resize by pointer drag (Pointer
Events with capture, a 4 px dead zone so a click still opens the editor, day snapping from the
lane's pixels-per-day, live date preview on the block, Escape cancels) and by keyboard (arrow
keys move by a day, Shift by a week, `+` and `-` change the end). Each render now remembers the
focused block and the board's horizontal scroll and restores both; the as-of marker is centered
on first render and whenever the as-of date changes. A sticky section bar marks the section in
view and shows the last save time. The Blocks list has a name or engine filter and clickable
rows, backlog cards a Schedule button, the block dialog a live duration readout, and a Help
dialog (Help button or `?`) lists every interaction; `N` and `B` open the add dialogs.

**Rate and materials (follow-up).** The document carries `rate` (dollars per hour, default
102.00, two decimals) and each block carries `materials` (whole dollars, default 0). The
hours edition prices the plan in a Cost section: labor is hours at the rate (logged hours
where they exist), materials pro-rate by day regardless of logged hours, and backlog cost is
backlog hours at the rate plus backlog materials. The rate is editable in the Cost header and
under Settings; the Materials field appears in the block dialog and the Blocks list in the
hours edition only (a dollar plan's cost already is money).

---

## 1. What the reference shows (feature spec)

### 1.1 Header bar

| Element | Behavior |
|---|---|
| Title + subtitle | "Roadmap & Budget Planner" · "2026 – 2027 · day-level · USD". Year span is derived from the planner's configured range. |
| **+ Add block** | Opens the block editor dialog (name, engine, start, end, cost). |
| **As-of date** | A date input plus a **Today** button. Drives the vertical marker on the timeline and every spent/planned split. |
| **Export / Import** | JSON download of the full document; import validates before replacing (same guarded pattern as the Map Builder / tracker). |
| **Clear all** | Confirm dialog, then wipe, with a one-click Undo toast (repo convention for destructive actions). |

### 1.2 Timeline (the Gantt board)

- Horizontal axis: two calendar years with month ticks (Jan–Dec twice), a thin separator
  at the year boundary, and a labeled vertical **"As of YYYY-MM-DD"** marker line.
- Left rail: one color-coded lane header per engine. The reference uses six:
  Core (green), Horizon (blue), Colossus (orange), Meridian (purple),
  AI Initiative (red), Operations (gray). Engines are user-editable data, not hardcoded.
- Blocks: rounded rectangles tinted with the lane color, showing **name** and
  **cost** (`$120,000`), positioned by day-level start/end dates.
- Stacking: blocks in one lane that overlap in time occupy separate sub-rows
  (see §4.3); the lane grows vertically to fit. An empty lane (Colossus in the
  reference) still renders at minimum height.
- Clicking a block opens the same editor dialog as **+ Add block**, with Delete and
  an **Unschedule → backlog** action.

### 1.3 Backlog (unscheduled)

- A card strip below the timeline: each card shows name, `Engine · $cost`, tinted with
  the engine color. Header shows the backlog total (`$201,000` in the reference) and a
  **+ Backlog item** button.
- Backlog items have an engine and a cost but **no dates**, so they sit outside the
  yearly totals entirely. Editing a backlog item and giving it dates moves it onto the
  timeline; removing dates from a block moves it back.

### 1.4 Budget by Year

A small table with one column per year plus Total:

- **Annual budget** — an editable numeric input per year.
- **Spent** — past portions of scheduled blocks (see §3).
- **Planned** — future portions.
- **Committed** — Spent + Planned (each block's full cost, split across years by day).
- **Remaining** — Annual budget − Committed; bold, red when negative
  (`$-239,230` in the reference).

The reference numbers confirm the model: 1,044,655 + 538,191 = 1,582,846 committed;
1,343,616 − 1,582,846 = −239,230 remaining.

### 1.5 Committed by Engine

One row per engine (color dot + name) with **Spent / Planned / Committed / Backlog**
columns. Backlog is the sum of that engine's unscheduled items and appears **only**
here and in the backlog strip, never in the yearly totals.

### 1.6 Footer

One-line explanation of the math, matching the reference: past portions count as spent,
future portions as planned, pro-rated by day; backlog items have no dates so they sit
outside the yearly totals; annual budget is editable.

---

## 2. Data model

Stored under one `localStorage` key, `budget_planner_v1`, and exported verbatim as JSON:

```jsonc
{
  "version": 1,
  "title": "Roadmap & Budget Planner",
  "currency": "USD",
  "startYear": 2026,
  "endYear": 2027,
  "asOf": "2026-07-17",              // ISO date; null ⇒ follow today
  "budgets": { "2026": 1343616, "2027": 0 },   // whole dollars, per year
  "engines": [
    { "id": "core", "name": "Core", "color": "#1e8e3e" },
    { "id": "horizon", "name": "Horizon", "color": "#1a8fe3" }
    // …order = lane order
  ],
  "blocks": [
    {
      "id": "uuid",
      "name": "CORE Foundation MVP",
      "engineId": "core",
      "cost": 120000,                 // whole dollars, integer
      "start": "2026-05-26",          // inclusive
      "end": "2026-08-07"             // inclusive; null start+end ⇒ backlog item
    }
  ]
}
```

Decisions baked in:

- **One array for blocks and backlog.** A backlog item is a block with
  `start: null, end: null`. Scheduling/unscheduling is a field edit, not a move
  between collections, so Undo and import/export stay trivial.
- **Whole-dollar integers** for costs and budgets. Pro-rated per-day slices are
  computed in floating point but summed then rounded **once per displayed cell**, so
  Spent + Planned always reconciles with Committed to the dollar (test-enforced).
- **Dates are ISO strings, day-level, interpreted in UTC** for all arithmetic
  (`Date.UTC` throughout). No timestamps, no DST edge cases.
- **Engines are data.** The six reference lanes ship as the seed document, but users
  can add/rename/recolor engines. Deleting an engine with blocks requires reassigning
  or deleting them first.

---

## 3. Budget math (the core engine)

All of this lives in pure functions with no DOM access, in one clearly delimited
`<script>` section, so Node tests can exercise them directly (same approach as
`tests/roadmap-hardening.test.mjs`).

Definitions, for a block with cost `C` spanning `D` inclusive days:

- **Daily rate** = `C / D`.
- A day `d` counts as **spent** when `d < asOf`, **planned** when `d ≥ asOf`.
  (The as-of day itself is planned: the marker reads "as of the morning of".)
- **Per-year allocation**: each day's slice accrues to that day's calendar year, so a
  block crossing the year boundary splits between the two columns automatically.
- **Committed(year)** = Σ spent(year) + Σ planned(year); **Committed(engine)**
  analogously over the engine's blocks (both years combined, matching the reference
  table).
- **Remaining(year)** = `budgets[year] − Committed(year)`.
- **Backlog(engine)** = Σ cost of that engine's undated blocks. Backlog never enters
  spent/planned/committed.
- Blocks partially outside the configured year range still count only the days that
  fall inside displayed years (edge case, tested).

Function surface (exact names matter because tests import them):

```
proRate(block, asOf)          → { spentByYear, plannedByYear }   // per-block
rollupByYear(doc)             → { [year]: {spent, planned, committed, remaining} , total }
rollupByEngine(doc)           → [ {engineId, spent, planned, committed, backlog} ]
backlogTotal(doc)             → number
validateDoc(json)             → { ok, errors[] }                 // import guard
```

---

## 4. UI architecture

### 4.1 One file, repo house style

`budget-planner.html` at repo root. Same skeleton as `roadmap.html`: strict CSP meta,
CSS custom properties with a `[data-theme="dark"]` block and a 🌙 toggle, system font
stack, `prefers-reduced-motion` respected, skip-link and `sr-only` utilities. No
canvas, no SVG library, no CDN.

### 4.2 Timeline rendering: absolutely positioned DOM over a CSS grid

Rejected alternative: inline SVG (what `roadmap.html` uses). DOM blocks win here
because every block carries editable text, needs a natural click/focus target, and
later gets drag handles; HTML also reflows the two-line label (name + cost) for free.

- The scale is linear: `x(date) = (daysSince(rangeStart, date) / totalDays) * 100%`.
  Blocks are `position:absolute` children of their lane row, with `left`/`width` in
  percentages so the board is resolution-independent and horizontally scrollable on
  narrow screens (board keeps a min-width; the page never scrolls sideways).
- Month/year gridlines are one background element per month cell (CSS grid), which
  also provides the Jan…Dec header row. The as-of marker is a single absolutely
  positioned rule with a pill label, `pointer-events:none`.
- Each block is a `<button>` (keyboard-focusable, opens the editor). Lane headers and
  blocks get their engine color via inline `--lane-color` custom property.

### 4.3 Lane stacking algorithm

Greedy interval partitioning per lane: sort the lane's blocks by start date, keep an
array of sub-rows each remembering its last end date, place each block in the first
sub-row whose last end is strictly before the block's start, else open a new sub-row.
Deterministic, O(n·rows), and matches the reference layout (Horizon shows three
sub-rows). Pure function, unit-tested.

### 4.4 Editor dialogs

Native `<dialog>` elements (already the repo norm for modern-browser-only pages):

- **Block editor** — name, engine `<select>`, cost, start, end, Delete,
  Unschedule/Schedule toggle. Validation: end ≥ start, cost ≥ 0, name required.
- **Backlog item editor** — same minus dates.
- **Settings** (year range, engines add/rename/recolor) can land in M4; the seed
  covers the reference layout before then.

### 4.5 Rerender strategy

Single `render(doc)` that rebuilds timeline, backlog strip, and both tables from
state on every mutation. The dataset is dozens of blocks, not thousands; no need for
diffing. Every mutation goes through `commit(next)` which persists to `localStorage`,
pushes an undo snapshot (capped ring buffer), and rerenders.

---

## 5. Milestones

### M0 — Skeleton + static render (foundation)
- File scaffold with CSP, theme variables, header bar, empty regions.
- Seed document reproducing the reference screenshot (6 engines, 12 scheduled blocks,
  7 backlog items, budgets, as-of 2026-07-17).
- Read-only render: timeline with stacking, backlog strip, both tables, footer.
- **Exit criteria:** the rendered page visually matches the reference and the four
  Budget-by-Year figures match it to the dollar.

### M1 — Budget engine + unit tests
- Implement §3's pure functions; extract-and-eval them in
  `tests/budget-planner.test.mjs` (pattern: `roadmap-hardening.test.mjs`).
- Tests: single-year block split at as-of; block straddling the year boundary;
  as-of before/after all blocks; 1-day block; reconciliation
  (spent+planned = committed per year, per engine, and overall); rounding drift;
  backlog exclusion; `validateDoc` rejects malformed imports.
- **Exit criteria:** `npm test` green; reference dataset reproduces all screenshot
  totals from the raw block list, not hand-entered numbers.

### M2 — Editing + persistence
- Add/edit/delete blocks and backlog items via dialogs; schedule/unschedule.
- Editable annual budgets (inline inputs with thousands separators).
- As-of date input + Today button; marker and totals update live.
- `localStorage` persistence, undo ring, Clear all with confirm + Undo toast.
- **Exit criteria:** every number on screen is derived; reload restores state.

### M3 — Import / Export / print
- Export JSON (`budget-planner-YYYY-MM-DD.json`), guarded Import (validate fully
  before replacing, offer replace only, no merge in v1), print stylesheet
  (timeline + tables on one landscape page, matching the tracker's clean print look).
- **Exit criteria:** export → clear → import round-trips byte-identical documents.

### M4 — Polish, a11y, browser tests
- Dark mode pass, responsive layout (board scrolls in its own container; tables
  stack), keyboard path for every action, focus management in dialogs, ARIA labels
  on blocks ("CORE Foundation MVP, Core, $120,000, May 26 to Aug 7 2026").
- Engine management UI (add/rename/recolor) and year-range setting.
- `tests/browser/budget-planner.spec.mjs`: seed load, add block, move to/from
  backlog, as-of change updates Remaining, clear-all undo, import/export, dark
  toggle, axe-style a11y smoke (match existing `responsive-accessibility.spec.mjs`).
- **Exit criteria:** `npm run test:browser` green.

### M5 — Ship
- README section (following the existing per-app format) + Files table row.
- Push to `main`; `pages.yml` publishes to
  `https://azjester.github.io/work/budget-planner.html`.
- **Exit criteria:** production smoke test passes against the live URL.

Rough effort: M0 1d · M1 1d · M2 1.5d · M3 0.5d · M4 1.5d · M5 0.5d ≈ **6 working days**.

---

## 6. Explicitly out of scope for v1 (candidate v2 items)

- **Drag to move/resize blocks** on the timeline (v1 edits dates in the dialog).
- **Supabase sync + share links** — the repo already has the full pattern
  (revision-aware RPCs, RLS, share tokens) in `roadmap.html`; port it once the local
  app is stable.
- **AI "build from description"** via a Supabase Edge Function, reusing the
  `build-roadmap` access-control setup.
- CSV export of the rollup tables; multi-currency; month/quarter zoom levels;
  per-block actuals (recording real spend against the pro-rated estimate).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Rounding drift makes tables disagree | Sum raw daily slices, round once per cell; reconciliation is a hard unit test, not a hope. |
| Date bugs (DST, off-by-one at year boundary, inclusive ends) | All math in UTC day counts; boundary cases are named unit tests written before the UI uses them. |
| Timeline layout breaks on narrow screens | Board is its own `overflow-x:auto` container with a min-width; Playwright viewport test at 390px. |
| Import of hostile/malformed JSON | `validateDoc` allow-lists every field and type before anything is persisted (same posture as the Map Builder importer). |
| Scope creep toward the Roadmap Builder | This app owns **money over time**; statuses, milestones-as-diamonds, and AI drafting stay in `roadmap.html`. |
