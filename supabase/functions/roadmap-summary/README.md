# `roadmap-summary` Edge Function

Powers the **✨ Write narrative** button in the roadmap's *Progress summary* card.
The client computes the progress facts (% complete, status counts, in-progress,
next milestones, at-risk / blocked / overdue) and sends them here; this function
asks Claude to turn those facts into a short prose executive summary, calling
Anthropic server-side so the API key never reaches the browser. The model only
*phrases* the numbers we compute — it doesn't recompute them — so the summary
stays accurate.

If this function isn't deployed the rest of the page still works; only the
narrative button needs it (the computed summary is always shown for free).

## Deploy

```bash
supabase functions deploy roadmap-summary
```

It reuses the **same secrets** as `build-roadmap` (they're project-wide):

| Secret | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Your Anthropic key (already set for `build-roadmap`). |
| `ALLOWED_EMAILS` | no | Same allow-list — restricts who can run it. Set once, covers both functions. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-4-8`. |

## Access control

Identical to `build-roadmap`: the caller must be a **signed-in, allow-listed**
user (validated against GoTrue). Anonymous callers are rejected, so a public
visitor can't spend your Anthropic credits.

## Contract

**Request** (`POST`, JSON): `{ "facts": { title, subtitle, timeframe, totalItems,
percentComplete, completeCount, counts, inProgress, atRisk, blocked, onHold,
nextMilestones, overdue }, "today": "YYYY-MM-DD" }`

**Response** (`200`): `{ "summary": "…2-4 sentence prose…" }`. On failure, a non-2xx
`{ "error": "…" }`, surfaced inline under the summary.
