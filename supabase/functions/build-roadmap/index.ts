// Supabase Edge Function: build-roadmap
// Turns a natural-language project description into a structured roadmap by
// calling the Anthropic Messages API server-side (the API key never reaches
// the browser). Invoked by roadmap.html via `sb.functions.invoke("build-roadmap")`.
//
// Deploy:  supabase functions deploy build-roadmap
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (Optional) override the model with the ANTHROPIC_MODEL secret.
//
// Runtime: Deno (Supabase Edge Functions). No npm install, no build step.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";
const STATUSES = ["planned", "in_progress", "complete", "at_risk", "blocked", "on_hold"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// The client normalizes/repairs the output too, so this schema stays permissive:
// bar fields (start/end) and the milestone field (date) are conditional on `kind`,
// which is why the tool is NOT `strict` (strict requires every property up-front).
const ROADMAP_TOOL = {
  name: "emit_roadmap",
  description:
    "Return the finished project roadmap as structured data. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short roadmap title, e.g. \"Mobile App Launch\"." },
      subtitle: { type: "string", description: "Optional one-line subtitle or timeframe." },
      lanes: {
        type: "array",
        description:
          "Swimlanes / workstreams, in order. Each lane groups the phases and milestones for one track of work (e.g. Discovery, Design, Build, Launch).",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Lane / workstream name." },
            items: {
              type: "array",
              description: "Phases (bars) and milestones (diamonds) inside this lane, in date order.",
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["bar", "milestone"],
                    description: "\"bar\" for a phase that spans a date range; \"milestone\" for a single-date marker.",
                  },
                  label: { type: "string", description: "Short label for the phase or milestone." },
                  start: { type: "string", description: "Bars only. Start date, YYYY-MM-DD." },
                  end: { type: "string", description: "Bars only. End date, YYYY-MM-DD (must be >= start)." },
                  date: { type: "string", description: "Milestones only. The milestone date, YYYY-MM-DD." },
                  status: {
                    type: "string",
                    enum: STATUSES,
                    description: "Status of this item.",
                  },
                  note: { type: "string", description: "Optional short note." },
                },
                required: ["kind", "label", "status"],
              },
            },
          },
          required: ["name", "items"],
        },
      },
    },
    required: ["title", "lanes"],
  },
};

function systemPrompt(today: string, hint: string | null): string {
  const hints: Record<string, string> = {
    software: "Software delivery (Agile / SDLC): Discovery, Design, Build (sprints), QA / Hardening, Launch.",
    product: "Product development: Concept, Validation, Design, Prototype, Testing, Pilot, Launch.",
    gtm: "Business development / go-to-market campaign: Research, Positioning, Collateral, Outreach / Pipeline, Demos, Close / Onboard.",
    data: "Data & analytics program: Data inventory, Source of truth, Pipeline, Dashboard build, Go-live.",
    hiring: "Hiring / team build: Requisition, Sourcing, Screening, Interviews, Offer, Onboarding.",
  };
  const hintLine = hint && hints[hint]
    ? `\nThe user chose a template hint. Shape the lanes around this kind of project unless their description clearly says otherwise: ${hints[hint]}`
    : "";
  return [
    "You are a project planning assistant. Turn the user's description into a clear, realistic project roadmap and return it by calling the emit_roadmap tool.",
    `Today's date is ${today}. All dates you emit must be absolute YYYY-MM-DD strings.`,
    "",
    "Guidelines:",
    "- Break the work into 3-6 lanes (workstreams / phases). Give each lane a few phases (bars) and the key milestones (single-date markers) that belong to it.",
    "- A \"bar\" needs a start and an end (end on or after start). A \"milestone\" needs a single date. Never mix: bars use start/end, milestones use date.",
    "- Infer sensible durations and sequencing from the description. If the user gives concrete dates or durations, honor them; otherwise schedule forward from today so the roadmap lands around the present.",
    "- Set status realistically: items clearly in the past can be \"complete\" or \"in_progress\"; future work is usually \"planned\". Use at_risk / blocked / on_hold only when the description implies it.",
    "- Keep labels short (2-5 words). Order items within a lane by date.",
    `- status must be one of: ${STATUSES.join(", ")}.`,
    hintLine,
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(
      { error: "ANTHROPIC_API_KEY is not set. Add it as a secret in your Supabase project (Edge Functions → Secrets)." },
      500,
    );
  }
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  let payload: { prompt?: string; today?: string; templateHint?: string | null };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }
  const prompt = (payload.prompt || "").trim();
  if (!prompt) return json({ error: "Describe the project first." }, 400);
  const today = payload.today && /^\d{4}-\d{2}-\d{2}$/.test(payload.today)
    ? payload.today
    : new Date().toISOString().slice(0, 10);
  const hint = payload.templateHint || null;

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt(today, hint),
        tools: [ROADMAP_TOOL],
        tool_choice: { type: "tool", name: "emit_roadmap" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return json({ error: "Couldn't reach the Anthropic API: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text();
    let msg = `Anthropic API error (${anthropicRes.status}).`;
    try {
      const j = JSON.parse(detail);
      if (j?.error?.message) msg = j.error.message;
    } catch { /* keep default */ }
    return json({ error: msg }, anthropicRes.status === 401 ? 401 : 502);
  }

  const data = await anthropicRes.json();
  const block = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string; name?: string }) => c.type === "tool_use" && c.name === "emit_roadmap")
    : null;
  if (!block?.input) {
    return json({ error: "The model didn't return a roadmap. Try adding more detail to your description." }, 502);
  }

  return json({ roadmap: block.input }, 200);
});
