# Getting started with the `time-savings` skill

A short guide for a new team member: how to install the skill, how to run it, and
what to have ready so the hours-saved and dollar figures come out accurate and
defensible. No technical background needed.

**What it does:** you tell it how long a task *would* have taken without Claude and
how long it *actually* took with Claude; it banks the difference as saved hours and
prices it at your billing rate. It rolls those up by day, week, and month. It uses
the same formula as our `time-savings-tracker.html`, so the numbers reconcile.

---

## 1. Install it (pick the one that matches how you use Claude)

### Option A — Claude.ai app (recommended for most of the team)

You need the skill file, `time-savings.skill` (your team lead has it; it was shared
from the setup session).

Easiest: when the `time-savings.skill` file is shared with you in a Claude
conversation, the file card has a **Save skill** button. Click it and the skill
installs into your account.

Or install it manually:

1. Open Claude at **claude.ai** (or the desktop app) and sign in with your work account.
2. Go to **Settings → Capabilities → Skills**.
3. Click **Upload skill** and choose the `time-savings.skill` file.
4. You'll see **time-savings** appear in your skills list. That's it.

> If you don't see a **Skills** section, your workspace admin hasn't enabled skills
> yet. Ask them to turn on Skills for the team, then come back to step 2.

### Option B — Claude Code (for anyone working in the `work` repo)

Nothing to install. The skill already lives in the repository at
`.claude/skills/time-savings/`, so any Claude Code session opened on that repo picks
it up automatically. Skip to **How to run it**.

### Option C — No install (works anywhere, even without the skill)

If you can't install skills, you can still get identical results by pasting a prompt.
See **Appendix: the no-install prompt** at the bottom. Dropping that prompt into a
shared **Claude Project** gives the whole team the same behavior without anyone
installing anything.

---

## 2. How to run it

You don't need a special command. Just describe the task in plain language and the
skill takes over. Any of these work:

- *"How much time did Claude save me? I did a contract review in 1 hour that would
  normally take 4, and I bill $350."*
- *"Tally what Claude saved the team this week."*
- *"Log a time savings: 3-hour research memo, done in 45 minutes."*

In Claude Code you can also type `/time-savings` to invoke it directly.

If it needs something to finish the math (most often your billing rate), it will ask.
Answer, and it completes the calculation.

---

## 3. What to have ready for an accurate number

The output is only as good as what you put in. Have these in hand:

1. **Your hourly billing rate.** The dollar value is `hours saved × your rate`, so an
   accurate rate matters. Different people (associate vs. paralegal) have different
   rates — give your own. The skill will never guess a rate; it asks.

2. **An honest "without Claude" estimate.** This is the baseline: how long the task
   would realistically have taken you by hand. Base it on your own past experience
   with similar work, not a best case or worst case. This single number drives the
   whole result, so keep it defensible — if someone later asks "would that really
   have taken ten hours?", the answer should be an easy yes.

3. **The actual "with Claude" time, including review.** Count the time you spent
   prompting, reading, checking, and correcting — not just the moment Claude was
   generating. Saved time is the honest difference, net of the effort you still put in.

4. **One task = one entry.** Log real, discrete pieces of work. Don't count the same
   task twice, and don't roll a whole day into one vague estimate.

5. **Units.** Give hours as decimals (1.5, 0.75) or just say minutes ("45 min") and it
   will convert. Be consistent.

6. **A date, if you want weekly or monthly totals.** If you don't give one, it assumes
   today. For a clean weekly or monthly rollup, tell it the date each task happened.

A quick gut check: hours saved can never be more than the task would have taken, and a
task that took longer with Claude saved nothing (it won't go negative). If a number
looks too good, revisit the "without Claude" estimate first.

---

## 4. What you get back

- A headline: **hours saved** and **dollar value** for the window you asked about.
- A short per-task table: *Task · Who · Without · With · Saved · Value*.
- A **total** row and a **leverage** figure (how many hours of work each hour spent in
  Claude returned, e.g. `4.0×`).
- On request, **CSV lines** you can paste straight into `time-savings-tracker.html`
  (Import), so the app and the skill always agree.

**Worked example**

> You: *"This week Jordan ($350) did a 4h→1h MSA redline and a 3h→1h research memo.
> Sam ($150) cleared six NDAs, 2h→0.5h. What did we save?"*
>
> Claude: **This week: 6.5 hrs saved · $1,975.**
>
> | Task | Who | Without | With | Saved | Value |
> |---|---|---|---|---|---|
> | MSA redline | Jordan | 4.0 | 1.0 | 3.0 | $1,050 |
> | Research memo | Jordan | 3.0 | 1.0 | 2.0 | $700 |
> | NDA batch (×6) | Sam | 2.0 | 0.5 | 1.5 | $225 |
>
> Leverage: 9.0 ÷ 2.5 = **3.6×**. Want these as CSV for the tracker?

---

## 5. How it fits with the tracker

The skill is the quick, conversational way to get a number. `time-savings-tracker.html`
is the durable record — it stores every entry in your browser, keeps per-person rates,
and shows day/week/month dashboards. Because both use the same formula, you can compute
in chat, then ask for the CSV and import it into the tracker to keep a running log. Use
whichever fits the moment; the totals will match.

---

## 6. Troubleshooting

- **No "Skills" option in Claude.ai settings.** Skills aren't enabled for your workspace
  yet. Ask your admin to enable them.
- **The skill didn't kick in.** Re-ask more explicitly, e.g. *"Use the time-savings skill
  to calculate…"*, or in Claude Code type `/time-savings`.
- **It asked for my rate and I don't want to share it in chat.** Give a blended or
  placeholder rate; the hours-saved figure is independent of the rate and stays correct.
- **The dollar value looks huge.** Check the "without Claude" estimate — that's almost
  always where an outlier comes from. Trim it to what you'd defend out loud.

---

## Appendix: the no-install prompt

Paste this at the top of a Claude chat (or into a shared Claude Project's custom
instructions) to get the same behavior without installing the skill:

```
You are a time-savings calculator for our legal team. When I give you tasks, compute how much
time and billable money Claude saved, using this exact method:

- Hours saved per task = (time it would have taken without Claude) − (time it actually took with
  Claude), never below 0.
- Value = hours saved × that person's hourly bill rate.
- Rates are per person. Ask me once for each person's rate, then remember it. Never guess a rate —
  if you don't have one, ask.
- Accept messy time inputs and convert to decimal hours (45 min = 0.75; "an hour and a half" = 1.5).
- Day/week/month totals are the sum of tasks in that window; assume today's date if I don't give one.
- Leverage = total hours-without ÷ total hours-with, shown like "4.0×".

Reply format: lead with the headline (hours saved + dollar value for the window I asked about), then
a compact per-task table (Task | Who | Without | With | Saved | Value), then the total row and
leverage. Round hours sensibly (no "3.00"). When I ask, output CSV lines with these columns so I can
paste them into our tracker:
Date,Member,Role,Task / matter,Task type,Hours without Claude,Hours with Claude,Hours saved,Bill rate,Value

These are estimates I provide, not measurements — if a "without Claude" number looks inflated, flag it
so the total stays defensible.

Start by asking me for this week's tasks.
```
