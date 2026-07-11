# `build-roadmap` Edge Function

Powers the **✨ Build from description** button in `roadmap.html`. It sends a
bounded project description to Anthropic server-side and returns a validated,
structured roadmap; the API key never reaches the browser.

The page's template and form workflows still work when this function is not
deployed. Only AI roadmap drafting depends on it.

## Prerequisites

- The Supabase project used by `roadmap.html`.
- The Supabase CLI.
- An Anthropic API key.
- The tracker-hardening database migration, which provides the authenticated
  `consume_ai_quota` RPC.
- [`../_shared/ai-edge.ts`](../_shared/ai-edge.ts), which is bundled with the
  function at deploy time.

## Deploy

From the repository root:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here AI_ALLOWED_EMAILS=you@example.com AI_ALLOWED_ORIGINS=https://azjester.github.io
supabase functions deploy build-roadmap --no-verify-jwt
supabase functions deploy roadmap-summary --no-verify-jwt
```

The functions verify the signed-in user against Supabase Auth themselves, then
consume a per-user quota before calling Anthropic. Keep the shared helper beside
the function sources when deploying through the dashboard editor as well.

## Configuration

| Secret | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Server-side Anthropic key. |
| `ANTHROPIC_ROADMAP_MODEL` | no | `ANTHROPIC_MODEL`, then `claude-opus-4-8` | Builder-only model override. |
| `ANTHROPIC_ROADMAP_SUMMARY_MODEL` | no | `ANTHROPIC_MODEL`, then `claude-opus-4-8` | Narrative-only model override. |
| `AI_ALLOWED_EMAILS` | yes* | — | Global account allowlist; the functions fail closed without this or an endpoint-specific/legacy fallback. |
| `ALLOWED_EMAILS` | no | — | Legacy global allowlist fallback. |
| `BUILD_ROADMAP_ALLOWED_EMAILS` | no | `AI_ALLOWED_EMAILS`, then `ALLOWED_EMAILS` | Builder-specific allowlist. |
| `ROADMAP_SUMMARY_ALLOWED_EMAILS` | no | `AI_ALLOWED_EMAILS`, then `ALLOWED_EMAILS` | Narrative-specific allowlist. |
| `ALLOWED_ORIGINS` | no | `https://azjester.github.io` | Comma-separated exact browser origins. |
| `BUILD_ROADMAP_ALLOWED_ORIGINS` | no | global origin setting | Builder-specific origin override. |
| `ROADMAP_SUMMARY_ALLOWED_ORIGINS` | no | global origin setting | Narrative-specific origin override. |
| `BUILD_ROADMAP_QUOTA_LIMIT` | no | `10` | Calls allowed per fixed window and user. |
| `ROADMAP_SUMMARY_QUOTA_LIMIT` | no | `20` | Narrative calls allowed per window and user. |
| `*_QUOTA_WINDOW_SECONDS` | no | `3600` | Endpoint-specific fixed quota window. |
| `*_UPSTREAM_TIMEOUT_MS` | no | `25000` | Anthropic timeout, clamped to 5–60 seconds. |

Set `AI_ALLOWED_EMAILS` to the permitted account addresses and disable public
sign-ups. Platform JWT verification is intentionally disabled at deployment so
browser preflight can run; each function verifies the bearer token itself.

## Builder contract

Request (`POST`, JSON):

```json
{
  "prompt": "Launch a mobile app over four months",
  "today": "2026-07-09",
  "templateHint": "software"
}
```

`templateHint` is optional and must be one of `software`, `product`, `gtm`,
`data`, or `hiring`.

Successful response:

```json
{
  "roadmap": {
    "title": "Mobile App Launch",
    "subtitle": "Q3–Q4",
    "lanes": [
      {
        "name": "Discovery",
        "items": [
          {
            "kind": "bar",
            "label": "Research & scope",
            "start": "2026-07-09",
            "end": "2026-08-06",
            "status": "in_progress",
            "note": "",
            "gate": false
          }
        ]
      }
    ]
  },
  "model": "claude-opus-4-8",
  "request_id": "…",
  "usage": {}
}
```

The frontend relies only on `roadmap`; model, request, and usage metadata are
additive. Status values are `planned`, `in_progress`, `complete`, `at_risk`,
`blocked`, or `on_hold`. Bars use `start` and `end`; milestones use `date`.

Failures use a non-2xx response with a safe `{ "error", "code", "request_id" }`
body. Provider details and secrets are logged only as non-sensitive event codes.
