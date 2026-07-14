# work
My Work Repository

## Map Builder

A browser application for building a branded geographic U.S. location map and exporting it as PNG or SVG. Version **3.2.3**, created by **Dr. Shane Turner**:

### [Open Map Builder](https://azjester.github.io/work/geopresence/)

- search 32,058 official 2025 Census places by stable GEOID/LSAD identity without collapsing duplicate names
- search 887 selectable public-reference military-installation anchors covering all 51 state/DC codes
- use compact progressive-disclosure Map settings: Quick setup opens immediately, while Map details, Advanced, and Project stay collapsed with concise live summaries
- use familiar generic teardrop pins with distinct interiors for eleven built-in types: Headquarters, Regional headquarters, Site, Contract site, Future site, Program office, Operations center, Customer site, Partner site, Test or range site, and Manufacturing facility
- combine repeated locations of one type behind a count badge and fan different pin types apart with leader lines
- adapt pin outlines for light, dark, and transparent exports; the legend uses identical pins, shows only types used on the map, and wraps automatically
- protect state initials, small-state callouts, counts, connectors, nearby pin groups, and place labels from overlap
- edit locations, confirm destructive changes, Undo recent actions, and recover the latest destructive snapshot
- upload as many as 1,000 locations from a UTF-8 CSV file, download a ready-to-fill template, validate the complete file before changing the map, and choose whether to append or replace locations
- save validated browser state and import or export portable JSON project files
- preview transparent output on checkerboard, light, dark, or custom destinations and select automatic, dark, or light text
- export guarded high-resolution PNG, metadata-clean SVG, or clipboard PNG
- inspect responsive maps with Fit, zoom, and full-screen controls using accessible forms and searchable comboboxes

Versioned same-origin catalogs reduce initial page parsing and are cached with the app shell for offline reopening after a successful hosted load. GitHub Pages deployment is gated by Node and Playwright tests and followed by a production smoke test.

The teardrop is generic application-rendered cartographic geometry, not Google Maps artwork or branding. The eleven built-in types use star, building, circle, briefcase, clock, document, network/gear, person, link, target, and factory interiors respectively. The metadata-driven pin renderer can support additional categories later.

The app requires no mapping service, charting library, account, API key, backend, runtime government connection, or government approval. City and installation catalogs are public reference data, not legal boundaries, exact building locations, or a complete military inventory. Optional samples are identified in the editor; the Huntsville Regional Headquarters and contract entries reflect user-provided information, while the other locations are demonstration examples.

## Weekly Status Tracker

A standalone, self-contained page for tracking your **weekly task status** and producing a
clean report to submit to leadership at the close of each week. Open it, fill in your tasks,
and export — nothing to install, no account, no server:

### → https://azjester.github.io/work/status.html

- **Editable task table** — per task: name, **Status** (On Track · At Risk · Blocked · Done,
  color-chipped), **Priority** (High · Med · Low), **Progress** (0–100%), and a free-text
  "Update this week". Add, delete, and reorder rows.
- **Report header** — your name/title and a **Week ending** date (defaults to the coming Friday).
- **Three ways to submit** — **Copy as text** (paste into email/Slack/Teams), **Download
  Markdown** (`weekly-status-YYYY-MM-DD.md`, a GitHub-style table for docs/wikis), or
  **Print / PDF** (a clean print stylesheet → *Save as PDF* for a tidy one-pager).
- **Saved in your browser** — everything persists to `localStorage` (this browser only).
  **Clear &amp; start new week** rolls the date forward and clears updates for the next report.

One file, **zero external dependencies** (no CDNs, web fonts, or network calls); light,
print-friendly executive styling with the system font stack.

### Distributable standalone — **Weekly Task Tracker**

`weekly-task-tracker.html` is a **single self-contained file** you can hand to anyone — no
account, server, or setup. It has **all the cloud app's features except AI** (and except the
features that fundamentally need a server: cross-device sign-in sync and the shared dashboard).
Everything runs locally, with the whole data layer backed by the browser's `localStorage`:

### → https://azjester.github.io/work/weekly-task-tracker.html

- **Full feature set, offline:** daily entry (carry-forward, collapse, **✎ Log today**, Alt+↑/↓
  jump), action items with reorder, rich-text comments & links, projects/due dates/sorting,
  **History**, **Completed archive + ↩ Recall**, **Kudos**, and an **interactive KPIs tab**
  (hover tooltips + click-to-open-week) — all computed in-browser from your saved weeks.
- **Exports:** Copy as text · Download Markdown · Print → PDF · CSV (history, completed, kudos).
- **To distribute:** send the **`weekly-task-tracker.html`** file directly (email, Teams, shared
  drive) or share the link above. Each person opens it in any modern browser — even straight
  from their Desktop (`file://`), fully offline. Their data lives only in *their* browser
  (`localStorage` key `weekly_task_tracker_v1`); nothing is shared or sent anywhere.
- **Not included** (need a backend): AI summaries / note import, cross-device cloud sync, and
  the shareable read-only dashboard. For those, use the cloud `tracker.html` below.

### Cloud version (saves to a database + KPIs)

`status.html` is browser-only. When you need your reports **stored so you can refer back to
them and run KPIs**, use the cloud-backed version:

### → https://azjester.github.io/work/tracker.html

- **Sign in** (email + password) and every week is saved to a **Supabase (Postgres)**
  database — not just this browser. Edits auto-save.
- **Daily workflow** — built for entering work daily and updating it through the week:
  - **Week navigation** — ◀ / ▶ / **This week** to jump between weeks.
  - **Carry forward** — a new week pre-fills with last week's unfinished tasks (Done items
    drop off); keep them or **Start blank**.
  - **Today panel** — a triage strip above the task list: **N need updates · N due today ·
    N overdue · N blocked**. Click a chip to filter the list to just those tasks (click it
    again — or **✕ Show all** — to clear). Counts update live as you edit, so the morning
    routine is: open the page, glance at the strip, knock the chips down to zero.
  - **✔ Close out my day** (under **⋯ More ▾**) — a rapid-fire wizard that walks through only
    the tasks with no update yet today, one at a time: type a one-liner (saved as a dated
    update), adjust status/progress, tick action items, **Save & next**. Daily logging in
    about two minutes.
  - **Quick add — press N** — type `Send deck to Conn @AI Weekly !fri #high` and the task is
    filed with its **@project**, **!due date** (`!today !tomorrow !fri !+3 !7/15`) and
    **#priority** parsed straight from the text, with a live preview of what was understood.
  - **Command palette — Ctrl/Cmd+K** — jump to any task, tab, or action (add task, log today,
    plan my day, draft summary, toggle theme…) by typing a few letters.
  - **Drag to reorder** — in **Manual order** sort, drag a task's **⠿** handle to rearrange
    (the ▲/▼ buttons still work).
  - **Install it on your phone** — the tracker is a **PWA**: open it on your phone and choose
    **Add to Home Screen** (Safari) / **Install app** (Chrome). It opens full-screen under your
    signature icon, with touch-sized controls and a floating **＋** button for quick entry.
  - **Collapsible task list** — each task collapses to a one-line summary (project · ☑
    checklist count · due · latest note), so a week of tasks reads as a tidy scannable list;
    click a task (the ▸ caret) to expand and edit, or **⊟ Collapse all / ⊞ Expand all**.
    Which tasks you leave open is **remembered per week** (in this browser).
  - **Jump between tasks** — **Alt + ↑ / ↓** moves to the previous/next task, expands it, and
    drops your cursor straight into its comment box — so you can rip through a daily update
    without reaching for the mouse.
  - **Daily updates / comments** — a per-task notes box with **＋ today** to stamp a dated
    line, so the week's progress builds up without overwriting earlier notes. An **✎ Log
    today** button stamps today's line into every task that hasn't been updated yet, and an
    amber dot flags tasks **needing today's update** (green when done).
  - **Action items** — a checkable sub-list under each task; tick them off as you go
    (a ☑ counter shows progress), reorder them with **▲ / ▼**, and press **Enter** to add the
    next one. Date fields have **Today / +1 week** quick-buttons, and new rows auto-focus.
  - **Projects, due dates & sorting** — tag each task with a project/area and a due date
    (overdue ones flag red); sort the list **By status**, **By due date**, **By project /
    area**, or **Manual**. The chosen sort also drives the **Print / PDF**, **Copy as text**,
    and **Download Markdown** outputs, so you can hand leadership a report grouped by area.
  - **Start & completion dates** — auto-stamped (start when you first name a task, complete
    when you mark it Done) and editable.
- **History** tab — every past week, with at-a-glance counts; click **Open** to reload or
  re-export any week.
  - **Done moves to Completed** — marking a task Done removes it from the active editor and files
    it on the **Completed** tab, while it's still saved and reported as done in the week it was
    finished. A **Show done** toggle reveals/reopens them in the editor.
- **Completed** tab — a searchable archive of every finished task across all weeks, with the
  week, project, and start → completion dates (and how long it took). **⬇ CSV** to export it.
  **↩ Recall** any archived task to bring it back into the current week as an active task
  (with its notes and action items) — handy when something done needs revisiting (one-click
  **Undo** if you mis-tap).
- **KPIs** tab — computed across all your weeks:
  - **Completion & throughput** — tasks done per week and % completion rate
  - **Blocked & at-risk trend** — stacked counts over time
  - **Average progress / velocity** — mean progress % per week
  - **Carryover / aging** — open tasks repeating from earlier weeks, oldest first
  - **Cycle time** — avg/median days from Start to Done
  - **By project** — tasks and completion grouped by project/area
  - **Kudos & recognition** — count and recent praise from the Kudos tab
  - **Interactive** — hover (or tap) any trend chart for a crosshair, highlighted point, and a
    tooltip of that week's exact figures; **click a week to open it in the editor**.
- Same **Copy / Markdown / Print-PDF** exports for the week, plus **⬇ Download all as CSV**
  (full history) on the History tab.
- **Kudos** tab — log praise & recognition (date, source, what it was for, and the quote);
  it's tracked here and shown on your shared dashboard for leadership. **⬇ CSV** exports all
  kudos (date, source, for, details) for your records.
- **Undo deletes** — deleting a task, action item, week, or kudos shows an **Undo** toast so a
  wrong delete is one click to restore.
- **Rich text & links** — the **Comments & updates** and **Kudos details** fields are
  formatted editors: select text for **Bold / Italic / bullet list / Link** (Ctrl/Cmd+K),
  and pasted URLs auto-link. Stored HTML is sanitized (allowlist) so the public shared
  dashboard stays safe.
- **✨ AI weekly summary** — a **Draft summary** button turns the week's tasks, blockers, and
  kudos into a polished executive narrative (Accomplishments · Risks & blockers · Next week).
  The draft renders **formatted** (headings, bold, bullets) so it reads like the finished
  report; toggle **Edit** to tweak the wording, and **Copy** puts rich text on the clipboard
  for a clean paste into email. **📌 Send to dashboard** publishes the (edited) summary to your
  shared leadership dashboard — it shows as a featured **Executive summary** panel for the latest
  week and as a per-week summary inside each weekly report; **Remove** un-publishes it. The
  Anthropic call runs server-side in a Supabase **Edge Function** (`weekly-summary`) so the API
  key never reaches the browser.
  - **One-time setup:** add an `ANTHROPIC_API_KEY` secret to the Supabase project
    (Edge Functions → Secrets). It uses your Anthropic API credits.
  - **Models:** the weekly summary defaults to **Sonnet 4.6** (`claude-sonnet-4-6`) —
    override with an `ANTHROPIC_WEEKLY_MODEL` secret. The
    high-volume note extractors (`extract-tasks`, `task-actions`) run on **Sonnet 4.6**
    (`claude-sonnet-4-6`) for speed/cost — override with `ANTHROPIC_MODEL`.
- **✨ Plan my day** (under **⋯ More ▾**) — turns the week's open tasks (status, priority, due
  dates, remaining action items, latest note) into a prioritized plan for **today**: 2–4 **P1
  must-move** items each with the concrete next action, **P2 if time allows**, an explicit
  **Defer** list, and morning / midday / afternoon **focus blocks**. Renders formatted with a
  rich-text **Copy** button. Runs in a Supabase Edge Function
  ([`plan-day`](supabase/functions/plan-day/)) on the same `ANTHROPIC_API_KEY`; defaults to
  **Sonnet 4.6** (override with `ANTHROPIC_PLAN_MODEL`).
- **📝 Import notes (AI note taker → tasks)** — paste the summary or transcript from any AI
  note taker (Plaud, Soundcore, Otter, Fireflies, Zoom/Teams/Meet AI, …) and Claude extracts the action
  items as draft tasks — with project, priority, due date, a context note, and checkable
  sub-items. Review the list, uncheck any you don't want, and **add them to the week** in one
  click; the raw notes are also **saved to that week** for reference. The extraction runs in a
  Supabase **Edge Function** (`extract-tasks`, Claude tool-use) using the same
  `ANTHROPIC_API_KEY` — the key never reaches the browser.
  - **Per-task ✨ From notes** — on any existing task, the **✨ From notes** button (next to
    *Action items*) lets you paste *that meeting's* notes and have Claude pull the **action
    items for just that task** (added to its checklist) plus a **concise summary** (appended to
    its Comments & updates). Review and uncheck before adding. Runs in the `task-actions` edge
    function with the same key.
- **Dark mode** — a 🌙 toggle in the header (also on the shared dashboard).
- **Per-recipient share links** — create multiple labelled read-only links (one per person)
  from **Share dashboard ▾**; copy or **revoke any one** without affecting the others.
  Links are the **full, direct dashboard URL** — recipients land straight on the dashboard,
  with no third-party URL-shortener bounce page in between. (If you previously sent someone a
  shortened link that now shows an interstitial page, just re-copy the link here and re-send —
  the underlying token is unchanged, so their access carries over.)
- **Exec hero** — the shared dashboard opens with a polished headline panel: large KPI tiles
  (completion · avg progress · at-risk · blocked · total tasks · weeks tracked), each with a
  **week-over-week trend** arrow (green = better, red = worse) — designed to read cleanly for
  leadership.
- **Privacy** — your data is isolated to your account by Postgres **Row Level Security**;
  the page only carries a public *publishable* key (safe to expose). The signed-in email is
  **not shown anywhere** in the header, so nothing leaks in screen-shares or screenshots.

**Account setup:** keep email confirmation enabled and disable public sign-ups in Supabase.
Provision or invite each approved user from the Supabase dashboard. The tracker intentionally
shows sign-in and password-reset flows only; it does not offer unrestricted browser sign-up.

The cloud page serves an exact-version `@supabase/supabase-js` bundle from this repository,
so authentication does not depend on a third-party CDN. Before publishing a tracker change,
follow [TRACKER_DEPLOYMENT.md](TRACKER_DEPLOYMENT.md); database migrations and Edge Functions
must be deployed before the GitHub Pages frontend.

### Consolidated multi-project tracking — **Projects · Portfolio · recurring checklists**

The tracker isn't just a weekly status list — it's your **one place for everything you do across
projects** (AI Weekly, Road Maps, and anything else). Two new tabs turn the free-text "project"
tag into a first-class thing, without changing how the weekly workflow feels:

- **Projects tab** — a registry of everything you run. Give each project a **colour**, **type**,
  **status**, a **cadence** (Weekly / Biweekly / Monthly), an **owner**, and **links** (to a
  roadmap, a Drive folder, a repo). Each task's *Project* field is now a **combobox** that
  autocompletes from this registry (with a colour dot), so names stay consistent instead of
  fragmenting into `Roadmap` / `Road Maps` / `roadmaps`. Typing a brand-new name registers it
  automatically.
  - **Recurring checklists (templates).** Give a project a reusable set of steps (e.g. *collect →
    draft → review → publish*), each with its own action items and a due-date offset. Click
    **▶ Start this week** (on the Projects tab or a Portfolio card) and those steps drop into the
    current week as tasks, pre-filled with their action items and due dates. It de-dupes, so
    starting twice won't double-add. Two projects come **seeded** — *AI Weekly* (empty checklist,
    add your own steps) and *Road Maps* (a three-step starter). Checklists are only ever added
    when **you click the button** — nothing is inserted into a week automatically.
- **Portfolio tab** — every project rolled up **across all your weeks** as a card grid: **%
  complete** (all-time), a status bar and **open / at-risk / blocked / overdue / done** counts for
  the latest week it appears in, **next due date**, **last active** week, and its links. Filter by
  **Active / All / Archived**. Below the grid, a **Road Maps** section reads your **Roadmap
  Builder** portfolio from the same Supabase project and shows each roadmap's **% complete** and
  **next milestone** — so your roadmaps and your weekly work finally live in one view.

**Storage & setup.** The registry saves to a new `projects` table (and mirrors to `localStorage`
so it keeps working if the table isn't there yet — it just won't sync across devices). Provision it
once (RLS on, scoped to each account, same pattern as the other tables):

```sql
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  doc jsonb not null default '{}'::jsonb,   -- { color, type, status, cadence, owner, links[], template:{items[]}, archived }
  created_at timestamptz default now(),
  updated_at timestamptz default now());
alter table public.projects enable row level security;
create policy "own projects" on public.projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists projects_user_idx on public.projects(user_id);
```

A task still stores its project as the plain `project` **name** (unchanged column), so existing
weeks, the offline file, the KPI *By project* view, and the shared dashboard all keep working — the
registry just adds the colour, cadence, links and checklist on top. The Road Maps section reuses the
`roadmaps` table the Roadmap Builder already writes to; no extra setup.

### Shareable read-only dashboard (for your bosses)

From the cloud tracker, **Share dashboard ▾** gives you a secret link your leadership can open
with **no login** — a read-only view at `dashboard.html`:

- **KPIs** — the same completion, blocked/at-risk, velocity, and carryover charts.
  **Interactive** — hover (or tap, on touch) any chart for a crosshair guide, a highlighted
  data point, and a tooltip with that week's exact figures (colour-keyed to each series).
  **Click a week to drill down** — it opens and scrolls to that week's full report. Stat
  numbers and the exec-summary tiles show plain-English explanations on hover. Keyboard users
  can tab through each week, and every chart has an expandable semantic data table.
- **Weekly reports** — each week's status table, expandable, newest first.
- **Print / PDF** — matches the tracker's clean report: borderless tables, status shown as
  colored text (not filled pills), each task kept whole, and a section per page. A **“KPIs in
  PDF”** toggle prints the charts or, switched off, gives a **reports-only** PDF (remembered
  per browser).
- **Anyone with a valid link can view** (read-only). Each recipient link has its own expiry,
  week range, kudos/summary scope, last-used timestamp, and revoke control.

How it stays safe: the page only ever calls one **token-gated, read-only** database function
(<code>secure_shared_dashboard</code>) that enforces expiry/revocation and returns an allow-listed,
scope-filtered object. No table write access is exposed, and every base table remains protected
by Row Level Security — the capability link is the single, revocable door.

## Roadmap Builder

A standalone page for building **project roadmaps** — pick a starter template, fill out a form,
or describe the project in plain language and let Claude draft it — then edit lanes, milestones,
statuses and dates on a clean Monday-style timeline. Works offline out of the box; sign-in adds
cloud sync and shareable links.

### → https://azjester.github.io/work/roadmap.html

- **Two ways to build:**
  - **Templates / form** — five starter roadmaps (**Software Dev (Agile/SDLC)**, **Product
    Development**, **Business Dev / GTM Campaign**, **Data &amp; Analytics program**, **Hiring /
    team build**) pre-fill phases and milestones dated relative to today. Add/edit/reorder
    lanes, phases (bars), and milestones (diamonds) inline. No account, no server.
  - **✨ Build from description** — type what you're planning (phases, rough dates) and Claude
    returns a structured roadmap you can edit or discard. Runs server-side in a Supabase Edge
    Function (`build-roadmap`) so the API key never reaches the browser.
- **Portfolio overview** — an **Overview** tab shows every roadmap at once as a card grid, each
  with a mini-timeline preview, a % complete, a per-status breakdown, date range, and last-updated
  time — so you can track several programs side by side. Click a card to open it; **Editor** tab
  edits the active one. Toggle views from the header.
- **Archive completed roadmaps** — the ⋯ menu (or the 🗄 button on an Overview card) moves a
  finished roadmap into a collapsed **Archived** section below the active grid; it stays openable
  and restorable (↩ Unarchive) and is grouped under "Archived" in the roadmap picker. The header
  count reads e.g. "4 roadmaps · 2 archived".
- **Timeline** — inline-SVG Gantt: month gridlines, a dashed **Today** marker, color-coded status
  (Planned · In progress · Complete · At risk · Blocked · On hold) and outlined milestone diamonds,
  with a legend. **Zoom** the time axis 50–300% and scroll horizontally. Sliding light/dark toggle.
  New phases and milestones are added after the lane's last item so they don't overlap.
- **Statuses &amp; kinds** — each item is a **phase** (start→end bar) or a **milestone** (single
  date), each with one of six status chips. Lanes get cycling group colors.
- **Saved and recoverable in your browser** — the original `roadmap_builder_v1` value is retained
  untouched as a recovery source. Each signed-in account works from its own verified
  `roadmap_builder_v2:<user-id>` copy, with persistent pending-sync operations, Trash, and Undo
  snapshots. The app stops destructive changes if the recovery snapshot cannot be verified.
- **Exports** — **JSON** (one roadmap), **Full portfolio backup** (every active, archived, and
  trashed roadmap plus sync metadata), **HTML** (a self-contained, magazine-style
  page with the full Gantt, stat chips, summary and analysis cards), **PNG** (the timeline as
  an image), and **Print / PDF**.
- **Import from Jira (CSV)** — *Import ▾ → Jira CSV…* takes Jira's built-in issue export
  (any Jira: **Export → CSV**, current or all fields) and builds a roadmap deterministically —
  no credentials, works offline, nothing leaves the browser:
  - **Epics → lanes.** Other issues land in their epic's lane (via *Epic Link* or *Parent*),
    else in a per-project lane.
  - **Dates:** *Start date* + *Due date* → a phase bar; a single date (or a "Milestone" issue
    type) → a milestone diamond. Undated issues are skipped and counted. Jira's `22/Jul/26`,
    ISO, and US-locale dates are all understood.
  - **Statuses** map onto the six chips (Done/Closed → Complete; In Progress/In Review →
    In progress; Blocked; On Hold/Waiting; anything with "risk" → At risk; else Planned).
  - A **`gate` label** in Jira marks the item as a gate (dashed line + GATE flag); each item's
    note keeps its issue key (e.g. `SH-11`).
  - Prefer AI shaping instead? Paste the raw issue list into **✨ Build from description**.
- **Optional cloud (sign in)** — revision-aware Supabase RPCs synchronize the complete portfolio.
  Every mutation has a durable UUID and expected revision, so a network retry is idempotent and
  a stale device cannot overwrite a newer one. Divergent copies are retained as clearly labeled
  recovered roadmaps. Soft-deleted roadmaps appear in cross-device **Trash** and remain restorable.
- **Managed read-only share links** — new links use URL fragments, expire after 30 days, can be
  listed/revoked in the app, and continue accepting legacy `?s=<token>` URLs. The server validates
  share ownership and returns a strict presentation-only document.
- **Sign-in-gated editing + public portfolio** — visitors who aren't signed in get a **read-only**
  view: they can browse the roadmaps you've marked **public** (🌐 *Make public* in the toolbar) but
  can't edit anything. Only the signed-in owner can create or change roadmaps. Sessions **persist
  across refreshes** until you sign out. Public and bearer-share RPCs remove private notes, AI
  prompts/hints, identities, tokens, secrets, and unknown fields before returning any document.
- **Multi-user portfolios** — each account has an isolated browser key and owner-only server RPCs.
  Provisioned temporary-password accounts must choose a compliant password (≥12 chars · upper ·
  lower · number · special) before the editor unlocks.

**One-time setup (only for the AI and cloud features — the template/form path needs none):**

- **AI (`build-roadmap`)** — the function source **is** in this repo at
  [`supabase/functions/build-roadmap/`](supabase/functions/build-roadmap/) (with its own
  step-by-step README). Deploy it and set an `ANTHROPIC_API_KEY` secret:
  ```bash
  supabase link --project-ref <your-project-ref>
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy build-roadmap
  ```
  It runs on **Opus 4.8** (`claude-opus-4-8`) by default; override with an `ANTHROPIC_MODEL`
  secret (the same env name the tracker's `extract-tasks` uses).
  - **Access control:** the function only serves **signed-in, allow-listed** accounts, so a
    random visitor to the public page can't spend your Anthropic credits. Set
    `ALLOWED_EMAILS=you@example.com` (comma-separated for more) and turn off public sign-ups
    in Supabase Auth — see the function's
    [README](supabase/functions/build-roadmap/README.md).

  Contract:
  - **Request** `{ prompt, today: "YYYY-MM-DD", templateHint }`
  - **Response** `{ roadmap: { title, subtitle?, lanes: [ { name, items: [
    {kind:"bar", label, start:"YYYY-MM-DD", end:"YYYY-MM-DD", status},
    {kind:"milestone", label, date:"YYYY-MM-DD", status} ] } ] } }`
  - `status` ∈ `planned | in_progress | complete | at_risk | blocked | on_hold`. Uses Claude
    tool-use so the model returns exactly this shape (the client normalizes/repairs it too).
  - If the function isn't deployed the page degrades gracefully — the button shows a clear note
    and the offline paths keep working.
- **AI narrative (`roadmap-summary`)** — powers the **✨ Write narrative** button in the
  *Progress summary* card: it turns the computed progress facts into a short prose exec summary.
  Deploy `supabase functions deploy roadmap-summary`; it reuses the **same** `ANTHROPIC_API_KEY`
  and `ALLOWED_EMAILS` secrets as `build-roadmap` (set once, covers both). See its
  [README](supabase/functions/roadmap-summary/README.md). The free computed summary shows without it.
- **Cloud sync + share** — do not paste ad-hoc table policies or grants into the SQL editor.
  The tracked migrations are the source of truth:
  - `20260711180000_roadmap_data_safety.sql` provisions or upgrades the tables without replacing
    existing IDs/documents/tokens, records every existing row as revision 0, adds append-only
    history, atomic save/delete/restore RPCs, soft-delete Trash, and sanitized public/share APIs.
  - The post-cutover RPC-only migration revokes browser table access after the v2 frontend is live.
  GitHub Pages runs `supabase db push --dry-run` and then `supabase db push` before publishing the
  matching frontend, so the browser never gets ahead of its database contract.

### Multiple users, each with their own portfolio

Keep public sign-ups disabled and provision approved accounts in Supabase Authentication. Every
owner query explicitly uses `auth.uid()` inside a narrowly granted `SECURITY DEFINER` RPC; public
and bearer-share callers receive only the bounded presentation schema. AI access remains separately
fail-closed through `AI_ALLOWED_EMAILS` and `AI_ALLOWED_ORIGINS` Edge Function secrets.

### Temporary passwords & forced reset on first login

Supabase has no native "temp password / must-change-on-first-login" flag, so the app implements
it. To hand a new user a starter password that they must replace on first sign-in:

1. **Enforce complexity server-side (authoritative):** **Authentication → Policies → Password
   settings →** set **Minimum length = 12** and **Required characters = “Lowercase, uppercase
   letters, digits and symbols.”** This is checked on every password set (including the reset),
   so the temporary password must itself comply (e.g. `Welcome2Roadmap!`).
2. **Create the account with the temp password + an authoritative flag.** A few users:
   **Authentication → Users → Add user** — set email + temp password and tick **Auto Confirm
   User**. Set **App Metadata** `{ "must_change_password": true }` through an admin-only path.
   Many users: use the Admin API (service-role key,
   from a script/edge function — never the browser):
   ```js
   await supabaseAdmin.auth.admin.createUser({
     email: "alice@example.com",
     password: "Welcome2Roadmap!",
     email_confirm: true,
     app_metadata: { must_change_password: true }
   });
   ```
3. **First login.** When the user signs in, `roadmap.html` detects the flag and shows a
   mandatory **Create your password** screen (a live checklist: ≥12 chars · lowercase ·
   uppercase · number · special) before anything is editable. On submit it calls
   `updateUser({ password, data: { must_change_password: false } })` and reloads — the flag is
   now acknowledged and never prompts again. The database clears the app-metadata flag only in
   the same transaction that actually changes `auth.users.encrypted_password`, then the client
   refreshes its session. (Keep the client `PW_RULES` aligned with the Supabase password policy.)

The page loads the pinned, repository-owned `assets/vendor/supabase-js-2.110.2.umd.js` bundle.
The template, form, import, backup, and export paths remain usable from the cached offline shell;
cloud sync, public browsing, and AI features naturally require the network.

## Astrion Division Landing Page (team review build)

A rebuilt, publish-ready version of `LDAWIF/astrion-division-landing.html` — same
HUD design, with the ambient C-UAS radar engagement playing behind the hero, official
leadership headshots served as optimized files from `astrion-division/assets/`, and the
prototype's accessibility/cross-browser/content issues fixed:

### → https://azjester.github.io/work/astrion-division/ldawif/

Marked `noindex` while under review.

## LDAWIF — All-Domain Kill Web

A standalone, self-contained web app for the LDAWIF concept (Layered Defense ·
Autonomous Warfare · Integrated Fires), **deployed straight from this repo via GitHub
Pages**. It's a destination page — open or share the link, nothing to embed:

### → https://azjester.github.io/work/

## What it shows

A tactical **layered-defense scope** drawn as a warfighter would picture it: concentric
engagement rings (surveillance 120 km → area defense 80 km → point 40 km) around a
defended asset, all-domain sensor/shooter nodes (space, air, maritime, ground, cyber)
meshed by an **AI / CJADC2 core** — *any sensor, best shooter*.

Run the engagement and a **multi-axis raid** (AIR, UAS, ASCM, AIR) comes inbound. Each
track is carried through **F2T2EA** (Find · Fix · Track · Target · Engage · Assess) at
machine speed:

- AI fuses all-domain sensors into one track picture and runs combat ID
- AI pairs the **best shooter per threat** across domains (Air SAM, Ground SAM, Maritime
  SM) and checks ROE/CDE; a **human grants release authority**
- effectors engage in depth; a **leaker** (the ASCM) is re-engaged by point-defense HEL
- battle-damage assessment confirms the raid defeated and feeds the learning loop

A live **track table**, a command & authority panel, and the six-step F2T2EA rail update
as the engagement runs. A friendly CAP track is held but never engaged — combat-ID
discrimination in action.

## Drive it

- **Scenario picker** — *Single*, *Raid*, *Swarm*, or *Mixed* (TBM, sea-skimming cruise,
  UAS, and air, each routed to a class-appropriate layer). Pause/replay any run.
- **Break the kill web** — click any sensor or shooter on the scope to take it
  **offline**; the AI re-routes to the best *remaining* shooter and keeps fighting.
- **Jam comms** — contest the datalink; edge nodes keep engaging **autonomously**
  (mission command). A jamming track also degrades a radar mid-fight while fusion holds
  custody from the other domains.
- **Narration** — a running plain-English caption explains each phase and event, so it
  briefs itself to non-experts.
- **Deep-link a scenario** — `…/work/?scenario=swarm` (or `single` / `raid` / `mixed`)
  opens straight into that run.
- **MIL-STD-2525 symbology** — hostile tracks use the air-affiliation caret frame, friendly
  the dome, with a class amplifier (A air · U uas · M cruise/ASCM · B ballistic).
- **Sound cues** (off by default) — subtle synth pings for detect / launch / kill / alert.
- **Download AAR** — after an engagement, export a one-page after-action report (PNG):
  outcome, tracks by class, interceptors expended, time-to-defeat, datalink and node
  status, with a scope snapshot and a NOTIONAL banner.
- **Guided tour** (Tour ▸) — auto-walks a first-time viewer through every capability
  (F2T2EA, human-on-the-loop HOLD, contested comms, node-offline re-routing, swarm
  saturation), with Next / Skip controls.
- **Doctrine &amp; methodology footer** — cites F2T2EA, CJADC2, DoDD 3000.09, and
  MIL-STD-2525, with a methodology note and an explicit notional/illustrative disclaimer
  for stakeholders.

## How it's deployed

- `.github/workflows/pages.yml` publishes the repo to GitHub Pages on every push to
  `main`. The repo is public and Pages is enabled, so the live URL above stays current.
- **To update it:** edit `index.html`, commit, and push to `main` — the workflow
  redeploys automatically (about a minute). Check **Actions → Deploy to GitHub Pages**
  for the green run.

## Build notes

One file, **zero external dependencies** (no CDNs, no web fonts, no network calls).
System fonts only; the scope is canvas-rendered. Responsive — the side panels and
F2T2EA rail stack below the scope on narrow screens, and sensor labels are placed so
nothing clips at any width. Respects `prefers-reduced-motion` (resolves to a static
"raid defeated" picture instead of animating).

The track IDs, classes, Pk values, and timings are illustrative for the demo — not real
system performance. By doctrine, AI assists and accelerates the kill chain; a human
retains release authority over the use of force.

## How a Radar Measures Distance — guided radar signal-chain explainer

A standalone, self-contained page that **teaches the pulsed-radar signal chain by
following one pulse end to end** — and actually runs the math, not just an animation.
The DSP underneath is real: an LFM chirp, digital up-conversion, a delay-and-noise
channel, digital down-conversion, and a working matched filter, all recomputed live
from the sliders:

### → https://azjester.github.io/work/radar-signal-chain.html

**Guided story (the default)** — 9 stages, each with plain-English narration, large
live plots, a live-computed key formula, and only the 1–2 sliders that matter there:

1. **Design the pulse** — why a chirp (energy *and* bandwidth), what I/Q is, ΔR = c/2B
   computed live from your B.
2. **Up-convert digitally** — the DUC, a just-in-time Nyquist explainer, and why an
   intermediate frequency exists at all.
3. **Make it physical** — DAC staircase → reconstruction filter → mixer/LO → PA, with
   the staircase coarsening live as you drop f<sub>s</sub>.
4. **Transmit** — T/R switch, PRF, and the listening window that sets unambiguous range.
5. **The echo** — the delay *is* the measurement (6.7 µs/km); the echo is drawn buried
   in real noise inside a highlighted "it's in here" band.
6. **Down-convert & digitize** — the receive mirror, plus an invited failure: drag
   f<sub>s</sub> low and a red **alias ghost** appears in the live FFT.
7. **Back to baseband** — DDC, with sent-vs-received spectra overlaid and the
   still-invisible echo in the time domain.
8. **Pulse compression** — the payoff: an **animated correlation scrubber** slides the
   known chirp along the noisy signal while the match strength traces out the spike
   (auto-plays, scrubbable, replayable).
9. **Read the range** — A-scope with true vs estimated markers, and the loop closed
   back to stage 1's bandwidth choice.

Stages are deep-linkable (`?step=8`), navigable by arrow keys or the clickable stage
rail, and remember your slider settings across stages (with a "your settings" chip row
and one-tap reset). On phones the active plot stays pinned above its slider so cause
and effect share the screen.

**Explore mode** (toggle, or `?mode=explore`) — the full dashboard for after the tour:
animated block diagram matching the classic signal-chain reference figure, 8 spectrum
checkpoints (real FFTs at baseband/digital-IF — receive side shows the true noisy
samples; to-scale schematic bumps at analog-IF/RF), the chirp scope and dB A-scope,
and every derived readout (f<sub>LO</sub>, PRF, K/M, ΔR, ADC Nyquist check) with
explanatory tooltips.

One file, **zero external dependencies**, dark HUD styling consistent with the LDAWIF
page above. Frequencies, sample rates, and the range estimate are illustrative/educational
— not a specification for any real radar system.

## Files

| File | Purpose |
|------|---------|
| `status.html` | The standalone **Weekly Status Tracker** (browser-only; editable task table + Markdown/text/PDF export). |
| `weekly-task-tracker.html` | The **distributable standalone** — `status.html` rebranded as **Weekly Task Tracker** for handing to other users (single self-contained file, no account/server). |
| `tracker.html` | The **cloud** Weekly Status Tracker — sign-in, saves each week to Supabase/Postgres, History view, and a KPI dashboard. |
| `dashboard.html` | A **read-only shared dashboard** — opens a secret share link (no login) to KPIs + weekly reports for leadership. |
| `roadmap.html` | The **Roadmap Builder** — build project roadmaps from templates, a form, or a plain-language description; edit lanes/milestones/statuses on a timeline; export JSON/PNG/PDF; optional cloud sync + read-only share links. |
| `index.html` | The standalone LDAWIF site (the whole app). |
| `radar-signal-chain.html` | **How a Radar Measures Distance** — a guided, 9-stage interactive explainer that follows one pulse through a real (toy-scale) radar DSP chain (chirp → up/down conversion → matched filter → range), with an animated correlation scrubber and a full Explore dashboard mode. |
| `poster.png` / `poster.html` | A static 1200×630 banner image and its source. Used for link previews / social cards (those don't animate). |
| `poster.gif` / `poster-anim.html` | An **animated** 1000×525 banner (looping radar sweep, an intercept, and the F2T2EA chain lighting) and its source scene. Live at `https://azjester.github.io/work/poster.gif`. |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages on push to `main`. |
| `.github/workflows/supabase-ping.yml` | Daily scheduled job that pings the Supabase REST API (public publishable key) so the free project doesn't pause from inactivity. |
| `embed-snippet.html` | Optional `<a><img></a>` if you ever want to link to the site from elsewhere. |

> **Animated banner:** use `poster.gif` as a regular `<img>` wherever you want motion
> (it loops on its own). Note that social/link-preview cards (Open Graph / Twitter) show a
> *static* image, so those still point at `poster.png`. To re-render the GIF after editing
> `poster-anim.html`, capture its frames and encode with a GIF encoder (e.g. `gifenc`).
