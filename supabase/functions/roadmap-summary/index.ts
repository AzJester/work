// Supabase Edge Function: roadmap-summary
// Turns the roadmap's computed progress facts into a short prose executive
// summary by calling the Anthropic Messages API server-side (the API key never
// reaches the browser). Invoked by roadmap.html via sb.functions.invoke.
//
// Like build-roadmap, this runs on the project owner's Anthropic key, so it is
// restricted to signed-in, allow-listed accounts (ALLOWED_EMAILS). The client
// only sends already-computed facts, so the model phrases them — it doesn't
// recompute numbers — keeping the summary accurate.
//
// Deploy:  supabase functions deploy roadmap-summary
// Secrets: ANTHROPIC_API_KEY (required), ALLOWED_EMAILS (optional allow-list),
//          ANTHROPIC_MODEL (optional). SUPABASE_URL / SUPABASE_ANON_KEY are
//          injected automatically.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Restrict to signed-in, allow-listed callers (see build-roadmap for the rationale).
async function authorizeCaller(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const DENY = { ok: false as const, status: 401, error: "Please sign in to use the AI summary." };
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !supaUrl || !anonKey) return DENY;
  let user: { email?: string; role?: string } | null = null;
  try {
    const r = await fetch(supaUrl + "/auth/v1/user", { headers: { Authorization: "Bearer " + token, apikey: anonKey } });
    if (r.ok) user = await r.json();
  } catch { /* unauthenticated */ }
  if (!user || !user.email || user.role === "anon") return DENY;
  const allow = (Deno.env.get("ALLOWED_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(user.email.toLowerCase())) {
    return { ok: false, status: 403, error: "This account isn't allowed to use the AI summary." };
  }
  return { ok: true };
}

function factsToText(f: Record<string, unknown>): string {
  const list = (v: unknown) => Array.isArray(v) && v.length ? (v as unknown[]).join(", ") : "none";
  const counts = (f.counts || {}) as Record<string, number>;
  const miles = Array.isArray(f.nextMilestones)
    ? (f.nextMilestones as Array<{ label?: string; date?: string }>).map((m) => `${m.label} (${m.date})`).join(", ")
    : "";
  return [
    `Title: ${f.title || "Untitled"}`,
    f.subtitle ? `Subtitle: ${f.subtitle}` : "",
    `Timeframe: ${f.timeframe || "n/a"}`,
    `Overall: ${f.percentComplete ?? 0}% complete (${f.completeCount ?? 0} of ${f.totalItems ?? 0} items)`,
    `Status counts: ${Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}`,
    `In progress: ${list(f.inProgress)}`,
    `Next milestones: ${miles || "none"}`,
    `At risk: ${list(f.atRisk)}`,
    `Blocked: ${list(f.blocked)}`,
    `On hold: ${list(f.onHold)}`,
    `Overdue: ${list(f.overdue)}`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const gate = await authorizeCaller(req);
  if (!gate.ok) return json({ error: gate.error }, gate.status);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not set (Edge Functions → Secrets)." }, 500);
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  let payload: { facts?: Record<string, unknown>; today?: string };
  try { payload = await req.json(); } catch { return json({ error: "Request body must be JSON." }, 400); }
  const facts = payload.facts;
  if (!facts || typeof facts !== "object") return json({ error: "No roadmap facts provided." }, 400);

  const system = [
    "You are a program manager writing a brief status update for leadership.",
    "Given structured facts about a project roadmap, write a concise executive summary of progress and outlook.",
    "Rules: 2-4 sentences, flowing prose (no bullet points, no headings, no markdown). Professional and plain.",
    "Use ONLY the facts provided — do not invent items, dates, or numbers. If something is 'none', don't mention it.",
    "Lead with overall progress, then call out what's in motion, upcoming milestones, and any risks/blockers.",
  ].join(" ");

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: factsToText(facts) }],
      }),
    });
  } catch (e) {
    return json({ error: "Couldn't reach the Anthropic API: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    let msg = `Anthropic API error (${res.status}).`;
    try { const j = JSON.parse(detail); if (j?.error?.message) msg = j.error.message; } catch { /* keep default */ }
    return json({ error: msg }, res.status === 401 ? 401 : 502);
  }

  const data = await res.json();
  const text = Array.isArray(data?.content)
    ? data.content.filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join("").trim()
    : "";
  if (!text) return json({ error: "The model returned an empty summary." }, 502);
  return json({ summary: text }, 200);
});
