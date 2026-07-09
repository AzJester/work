# work
My Work Repository

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
  - **Models:** the weekly summary runs on **Opus 4.8** (`claude-opus-4-8`) for a more
    polished exec narrative — override with an `ANTHROPIC_SUMMARY_MODEL` secret. The
    high-volume note extractors (`extract-tasks`, `task-actions`) run on **Sonnet 4.6**
    (`claude-sonnet-4-6`) for speed/cost — override with `ANTHROPIC_MODEL`.
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
  Every **new link is automatically shortened** to a tidy `is.gd`/`tinyurl` URL that's easy to
  paste into an email or chat (older links keep a manual **⚡ Shorten** button). The shortening
  runs in a Supabase Edge Function (`shorten`) that only shortens your own dashboard links; if
  the shortener is ever unavailable, the full link is used instead.
- **Exec hero** — the shared dashboard opens with a polished headline panel: large KPI tiles
  (completion · avg progress · at-risk · blocked · total tasks · weeks tracked), each with a
  **week-over-week trend** arrow (green = better, red = worse) — designed to read cleanly for
  leadership.
- **Privacy** — your data is isolated to your account by Postgres **Row Level Security**;
  the page only carries a public *publishable* key (safe to expose). The signed-in email is
  **not shown anywhere** in the header, so nothing leaks in screen-shares or screenshots.

**One-time setup (≈30 seconds, once):** so login works instantly on a static page, open the
Supabase project → **Authentication → Providers → Email** and turn **off** *“Confirm email.”*
Then visit the page, choose **Create an account**, and you're in. (The app detects this
setting and reminds you if it's still on.)

The cloud page loads the `@supabase/supabase-js` client from a CDN — the one external
dependency that a database-backed page necessarily has.

### Shareable read-only dashboard (for your bosses)

From the cloud tracker, **Share dashboard ▾** gives you a secret link your leadership can open
with **no login** — a read-only view at `dashboard.html`:

- **KPIs** — the same completion, blocked/at-risk, velocity, and carryover charts.
  **Interactive** — hover (or tap, on touch) any chart for a crosshair guide, a highlighted
  data point, and a tooltip with that week's exact figures (colour-keyed to each series).
  **Click a week to drill down** — it opens and scrolls to that week's full report. Stat
  numbers and the exec-summary tiles show plain-English explanations on hover.
- **Weekly reports** — each week's status table, expandable, newest first.
- **Print / PDF** — matches the tracker's clean report: borderless tables, status shown as
  colored text (not filled pills), each task kept whole, and a section per page. A **“KPIs in
  PDF”** toggle prints the charts or, switched off, gives a **reports-only** PDF (remembered
  per browser).
- **Anyone with the link can view** (read-only). **Revoke &amp; regenerate** invalidates the old
  link instantly and issues a new one.

How it stays safe: the page only ever calls one **token-gated, read-only** database function
(`shared_dashboard`) that returns *only* the link owner's data. No write access is exposed, and
every table stays protected by Row Level Security — the share link is the single, revocable door.

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
- **Timeline** — inline-SVG Gantt: month gridlines, a dashed **Today** marker, color-coded status
  (Planned · In progress · Complete · At risk · Blocked · On hold) and outlined milestone diamonds,
  with a legend. **Zoom** the time axis 50–300% and scroll horizontally. Sliding light/dark toggle.
  New phases and milestones are added after the lane's last item so they don't overlap.
- **Statuses &amp; kinds** — each item is a **phase** (start→end bar) or a **milestone** (single
  date), each with one of six status chips. Lanes get cycling group colors.
- **Saved in your browser** — multiple roadmaps persist to `localStorage` (key
  `roadmap_builder_v1`); the Overview grid and a toolbar picker switch between them (New /
  Duplicate / Delete).
- **Exports** — **JSON** (round-trips via Import), **PNG** (the timeline as an image), and
  **Print / PDF** (timeline only, light theme).
- **Optional cloud (sign in)** — sync roadmaps to Supabase and create **read-only share links**
  (`roadmap.html?s=<token>`) for anyone to view without a login, reusing the same token-gated,
  read-only pattern as the leadership dashboard.

**One-time setup (only for the AI and cloud features — the template/form path needs none):**

- **AI (`build-roadmap`)** — deploy a Supabase Edge Function named `build-roadmap` and set an
  `ANTHROPIC_API_KEY` secret (reuses the same key/model env as `extract-tasks`; override the
  model with `ANTHROPIC_MODEL`). Like `extract-tasks`/`weekly-summary`, the **function source is
  not in this repo** — it lives in your Supabase project. Contract:
  - **Request** `{ prompt, today: "YYYY-MM-DD", templateHint }`
  - **Response** `{ roadmap: { title, subtitle?, lanes: [ { name, items: [
    {kind:"bar", label, start:"YYYY-MM-DD", end:"YYYY-MM-DD", status},
    {kind:"milestone", label, date:"YYYY-MM-DD", status} ] } ] } }`
  - `status` ∈ `planned | in_progress | complete | at_risk | blocked | on_hold`. Use Claude tool-use with a strict
    `input_schema` so the model returns exactly this shape (the client normalizes/repairs it too).
  - If the function isn't deployed the page degrades gracefully — the button shows a clear note
    and the offline paths keep working.
- **Cloud sync + share** — provision two tables + a token-gated read function (RLS on):
  ```sql
  create table roadmaps (
    id text primary key, user_id uuid not null references auth.users(id) default auth.uid(),
    title text, subtitle text, template_type text, doc jsonb not null,
    created_at timestamptz default now(), updated_at timestamptz default now());
  alter table roadmaps enable row level security;
  create policy "own roadmaps" on roadmaps for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

  create table roadmap_shares (
    token uuid primary key default gen_random_uuid(),
    roadmap_id text not null references roadmaps(id) on delete cascade,
    user_id uuid not null default auth.uid(), label text, revoked boolean default false,
    created_at timestamptz default now());
  alter table roadmap_shares enable row level security;
  create policy "own shares" on roadmap_shares for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

  -- token-gated, read-only: returns just the shared roadmap's doc
  create or replace function shared_roadmap(p_token uuid)
  returns table (doc jsonb) language sql security definer set search_path = public as $$
    select r.doc from roadmap_shares s join roadmaps r on r.id = s.roadmap_id
    where s.token = p_token and s.revoked = false;
  $$;
  grant execute on function shared_roadmap(uuid) to anon, authenticated;
  ```

The page loads the `@supabase/supabase-js` client from a CDN **only** when you use a cloud/AI
feature; the template, form, and export paths make **no network calls**.

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

## Files

| File | Purpose |
|------|---------|
| `status.html` | The standalone **Weekly Status Tracker** (browser-only; editable task table + Markdown/text/PDF export). |
| `weekly-task-tracker.html` | The **distributable standalone** — `status.html` rebranded as **Weekly Task Tracker** for handing to other users (single self-contained file, no account/server). |
| `tracker.html` | The **cloud** Weekly Status Tracker — sign-in, saves each week to Supabase/Postgres, History view, and a KPI dashboard. |
| `dashboard.html` | A **read-only shared dashboard** — opens a secret share link (no login) to KPIs + weekly reports for leadership. |
| `roadmap.html` | The **Roadmap Builder** — build project roadmaps from templates, a form, or a plain-language description; edit lanes/milestones/statuses on a timeline; export JSON/PNG/PDF; optional cloud sync + read-only share links. |
| `index.html` | The standalone LDAWIF site (the whole app). |
| `poster.png` / `poster.html` | A static 1200×630 banner image and its source. Used for link previews / social cards (those don't animate). |
| `poster.gif` / `poster-anim.html` | An **animated** 1000×525 banner (looping radar sweep, an intercept, and the F2T2EA chain lighting) and its source scene. Live at `https://azjester.github.io/work/poster.gif`. |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages on push to `main`. |
| `.github/workflows/supabase-ping.yml` | Daily scheduled job that pings the Supabase REST API (public publishable key) so the free project doesn't pause from inactivity. |
| `embed-snippet.html` | Optional `<a><img></a>` if you ever want to link to the site from elsewhere. |

> **Animated banner:** use `poster.gif` as a regular `<img>` wherever you want motion
> (it loops on its own). Note that social/link-preview cards (Open Graph / Twitter) show a
> *static* image, so those still point at `poster.png`. To re-render the GIF after editing
> `poster-anim.html`, capture its frames and encode with a GIF encoder (e.g. `gifenc`).
