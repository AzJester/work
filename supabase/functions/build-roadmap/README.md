# `build-roadmap` Edge Function

Powers the **✨ Build from description** button in `roadmap.html`. It takes a
natural-language project description and returns a structured roadmap, calling
Anthropic server-side so the API key never reaches the browser.

If this function isn't deployed the page still works — the template and form
paths need no network. Only the AI drafting button needs it.

## Prerequisites

- A Supabase project (the same one `roadmap.html` points at via `SUPABASE_URL`).
- The [Supabase CLI](https://supabase.com/docs/guides/cli): `npm i -g supabase`.
- An Anthropic API key (`sk-ant-…`) from https://console.anthropic.com.

## Deploy (three commands)

From the repo root:

```bash
# 1. Link the CLI to your project (once). Find <project-ref> in your
#    Supabase dashboard URL: https://supabase.com/dashboard/project/<project-ref>
supabase link --project-ref <project-ref>

# 2. Store your Anthropic key as a secret (the function reads it at runtime).
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here

# 3. Deploy the function.
supabase functions deploy build-roadmap
```

That's it. Reload `roadmap.html`, sign in, and click **✨ Build from
description** — it now calls the deployed function.

### No CLI? Deploy from the dashboard

1. Supabase dashboard → **Edge Functions** → **Create a function**, name it
   exactly `build-roadmap`.
2. Paste the contents of [`index.ts`](./index.ts) and **Deploy**.
3. **Edge Functions → Secrets** → add `ANTHROPIC_API_KEY` = your key.

## Configuration

| Secret | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Your Anthropic key. Uses your Anthropic credits. |
| `ANTHROPIC_MODEL` | no | `claude-opus-4-8` | Override the model (reuses the same env name as the tracker's `extract-tasks`). |

The function is invoked with the project's publishable/anon key by the
signed-in client, so keep JWT verification at its default — no
`--no-verify-jwt` needed.

## Contract

**Request** (`POST`, JSON):

```json
{ "prompt": "Launch a mobile app over four months…", "today": "2026-07-09", "templateHint": "software" }
```

`templateHint` is optional (`software | product | gtm | data | hiring`, or omitted).

**Response** (`200`):

```json
{
  "roadmap": {
    "title": "Mobile App Launch",
    "subtitle": "Q3–Q4",
    "lanes": [
      { "name": "Discovery", "items": [
        { "kind": "bar", "label": "Research & scope", "start": "2026-07-09", "end": "2026-08-06", "status": "in_progress" },
        { "kind": "milestone", "label": "Kickoff", "date": "2026-07-09", "status": "complete" }
      ] }
    ]
  }
}
```

`status` ∈ `planned | in_progress | complete | at_risk | blocked | on_hold`.
Bars carry `start` + `end`; milestones carry a single `date`. The function uses
Claude tool-use so the model returns exactly this shape; `roadmap.html`
normalizes and repairs it again on the client.

**On failure** the function returns a non-2xx status with `{ "error": "…" }`,
which the page surfaces inline (the current roadmap is left untouched).
