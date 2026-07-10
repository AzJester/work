// "✨ Plan my day" for the weekly tracker: turns the week's open tasks into a
// prioritized plan for today. Custom auth (validates the caller's Supabase JWT)
// so verify_jwt is disabled at the platform level to allow CORS preflight.
// The Anthropic key never leaves the server.
//
// Model: day planning is quick and frequent, so it defaults to Sonnet 4.6 like
// the note extractors (ANTHROPIC_MODEL), with its own ANTHROPIC_PLAN_MODEL override.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildPrompt(b: any): string {
  const tasks = Array.isArray(b?.tasks) ? b.tasks : [];
  const L: string[] = [];
  L.push(`You are planning TODAY (${b?.today || ""}) for a busy professional, from the open tasks in their weekly tracker (week ending ${b?.week_ending || ""}).`);
  L.push("Produce a tight, realistic one-day plan in markdown:");
  L.push("1. **P1 — must move today** — 2–4 items max; overdue items, due-today items, and blockers to escalate come first. One line each: the task and the single concrete next action (use its remaining action items).");
  L.push("2. **P2 — if time allows** — a short list.");
  L.push("3. **Defer** — what explicitly should NOT be touched today, with a one-phrase reason (due later, waiting on someone, low priority).");
  L.push("4. **Focus blocks** — a simple morning / midday / afternoon split assigning the P1 items.");
  L.push("Ground every item in the data — never invent tasks or details. Weigh: Blocked and At Risk status, overdue and due-today dates, priority, progress %, and remaining action items. Keep the whole plan scannable in 30 seconds.");
  L.push("\nTASKS (JSON):");
  L.push(JSON.stringify(tasks));
  L.push("\nReturn only the plan (markdown).");
  return L.join("\n");
}

Deno.serve(async (req: Request) => {
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON || "" } });
    if (!who.ok) return json({ error: "Not authenticated" }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "AI day planning isn’t configured yet — add an ANTHROPIC_API_KEY secret to this Supabase project (Edge Functions → Secrets), then try again." }, 400);

    const body = await req.json().catch(() => ({}));
    const model = Deno.env.get("ANTHROPIC_PLAN_MODEL") || Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: "user", content: buildPrompt(body) }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "Anthropic API error: " + (data?.error?.message || ("HTTP " + r.status)), anthropic_status: r.status }, 502);
    const plan = (data?.content || []).map((c: any) => c?.text || "").join("").trim();
    return json({ plan, model });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
