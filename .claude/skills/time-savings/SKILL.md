---
name: time-savings
description: >-
  Calculate how much time and billable money Claude saves on legal work. Use
  this whenever someone wants to log or tally the hours Claude saved them, asks
  "how much time did Claude save me", "what's our time savings this week/month",
  wants to turn saved hours into dollars at their billing rate, or is preparing a
  value/ROI story about using Claude for the legal team. Trigger it even when the
  request is casual ("I did a contract review in 1 hour that'd normally take 4,
  what did that save?") or when they just want to plug in some numbers and see the
  saved hours and dollar value. Mirrors the math in the team's
  time-savings-tracker.html so the numbers reconcile.
---

# Claude time-savings calculator

Turn "this took me less time because I used Claude" into defensible saved hours
and billable dollars, then roll it up by day, week, and month. This is the
conversational companion to the team's `time-savings-tracker.html`; it uses the
exact same formula so a number computed here matches a number logged there.

## The formula (keep it identical to the tracker)

For each task:

- **Hours saved** = `time_without_claude − time_with_claude`, floored at 0.
  (If the with-Claude time is somehow higher, the task saved nothing — never
  report a negative.)
- **Value saved** = `hours_saved × that person's hourly bill rate`.

Across many tasks:

- **Totals** for any window (day / week / month / all-time) are just the sums of
  the tasks that fall inside it.
- **Leverage** = `sum(time_without) ÷ sum(time_with)` — how many hours of work
  each hour spent in Claude returned. Report it as e.g. `4.0×`. Skip it if
  total with-Claude time is 0.

Rates are **per person**, because an associate and a paralegal bill differently.
When you value a task, use that person's rate. If someone changes their rate
partway through a session, keep already-computed entries at the rate that was in
effect when they were logged — that keeps historical totals honest, which is the
whole point of a defensible number.

## What to gather

You need enough to run the formula. Ask only for what's missing; don't
interrogate. Per task:

1. **Who** did it, and their **hourly bill rate** (ask once per person, then
   remember it for the rest of the conversation).
2. **Time without Claude** — their honest estimate of the manual effort, in hours.
3. **Time with Claude** — actual time spent, including review, in hours.
4. *(optional)* **Task / matter** and **task type** (contract review, memo,
   research, discovery, NDA, etc.) — useful for the breakdown, not required.
5. *(optional)* **Date** — assume today if unstated. Only matters when they want
   day/week/month splits.

Accept messy input. People will say "an hour and a half" (1.5), "45 min" (0.75),
"half a day" (ask if that's 4 hours). Convert minutes to decimal hours. If a rate
is given as "$350" treat it as per hour.

If someone invokes this with no numbers at all, show them the quick template
below and invite them to fill it in:

```
Person (rate/hr) | task | without Claude | with Claude
e.g. Jordan ($350) | Acme MSA redline | 4h | 1h
```

## How to respond

Lead with the answer, then show the work compactly. For a single task, one or two
lines is enough:

> **Acme MSA redline** — saved **3.0 hrs**, worth **$1,050** (3.0 × $350/hr), a 4.0× speedup.

For multiple tasks, give a short per-task table then the rollup that the person
actually asked for. Don't dump every possible cut; match the window they asked
about (if they said "this week", lead with the week total). Always include the
all-time/session total and the dollar figure, since the dollars are the point.

Use this shape for a multi-task summary:

```
Task                     Who       W/o    With   Saved   Value
Acme MSA redline         Jordan    4.0    1.0    3.0     $1,050
NDA batch (x6)           Sam       2.0    0.5    1.5       $225
─────────────────────────────────────────────────────────────
Total                              6.0    1.5    4.5     $1,275   ·  4.0× leverage
```

Then, if they asked for periods, add just those rollups:

```
This week:  4.5 hrs · $1,275
This month: 4.5 hrs · $1,275
```

Round hours to a sensible precision (whole, tenth, or hundredth — don't show
`3.00`). Format money with the person's currency (default USD, no cents on totals,
cents on single-task values if it helps precision).

## Connecting to the tracker

These numbers are meant to live in `time-savings-tracker.html`. After computing,
offer the fastest way to get them there, and pick the format that fits:

- **CSV line(s)** they can paste, matching the tracker's export columns:
  `Date,Member,Role,Task / matter,Task type,Hours without Claude,Hours with Claude,Hours saved,Bill rate,Value`
- A **copy-paste summary** (the block above) for a status update or email.
- If they want an ongoing record and there's a repo/file to write to, offer to
  keep a running CSV or markdown log rather than re-deriving each time.

Don't force this — if they just wanted the number, give the number.

## Guardrails that keep the number credible

- These are **estimates the user provides**, not measurements. If a "without
  Claude" estimate looks inflated for the task (e.g. 40 hours to answer one
  email), gently sanity-check it — an indefensible input makes the whole tally
  easy to dismiss.
- Never invent times or rates. If you don't have a rate, ask; don't guess a
  market rate.
- Count only real, task-level work. Don't tally the same task twice.
- Saved time is capped at the manual estimate — you can't save more time than the
  task would have taken.

## Worked examples

**Example 1 — single task, casual ask**
Input: "I did a contract review in 1 hour that'd normally take me 4. I bill $350."
Output:
> Saved **3.0 hrs**, worth **$1,050** (3.0 × $350/hr) — a 4.0× speedup on that review.

**Example 2 — batch with a weekly ask**
Input: "This week: Jordan ($350) did a 4h→1h MSA redline and a 3h→1h research memo. Sam ($150) did six NDAs, 2h→0.5h total. What did we save this week?"
Output:
> **This week: 6.5 hrs saved · $1,975.**
> | Task | Who | W/o | With | Saved | Value |
> |---|---|---|---|---|---|
> | MSA redline | Jordan | 4.0 | 1.0 | 3.0 | $1,050 |
> | Research memo | Jordan | 3.0 | 1.0 | 2.0 | $700 |
> | NDA batch (×6) | Sam | 2.0 | 0.5 | 1.5 | $225 |
> Leverage: 9.0 ÷ 2.5 = **3.6×**. Want these as CSV to paste into the tracker?

**Example 3 — missing rate**
Input: "How much did I save doing discovery review in 3 hours instead of 12?"
Output: Compute hours saved (9.0) immediately, then ask for the one missing input:
> That's **9 hours saved** on the review. What's your hourly bill rate so I can put a dollar value on it?
