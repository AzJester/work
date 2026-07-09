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
| `ALLOWED_EMAILS` | no | — | Comma-separated allow-list of accounts that may use the AI builder (e.g. `you@example.com`). Leave unset to allow any signed-in account. |

The function is invoked with the project's publishable/anon key by the
signed-in client, so keep JWT verification at its default — no
`--no-verify-jwt` needed.

## Access control (protect your Anthropic credits)

The Anthropic key is yours, so the function only serves **signed-in, allow-listed**
callers. It validates the caller's Supabase user token (sent automatically by the
signed-in client) against GoTrue and rejects the anonymous publishable/anon key —
so a random visitor to the public page can't spend your credits. `SUPABASE_URL`
and `SUPABASE_ANON_KEY` are injected into every Edge Function automatically; you
don't set them.

To lock it to just you:

1. Set the allow-list secret and redeploy:
   ```bash
   supabase secrets set ALLOWED_EMAILS=you@example.com
   supabase functions deploy build-roadmap
   ```
   (Multiple people? Comma-separate: `ALLOWED_EMAILS=a@x.com,b@x.com`.)
2. **Turn off public sign-ups** so nobody can create an account:
   Supabase dashboard → **Authentication → Sign In / Providers → Email** (or
   **Auth → Settings**) → disable **Allow new users to sign up**. Create your own
   account first (or add it under **Authentication → Users**) if you haven't.

With sign-ups off and `ALLOWED_EMAILS` set to your address, only you can invoke
the AI builder even though the page itself stays public.

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
