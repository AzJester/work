// Supabase Edge Function: adsb-relay
// Read-only relay for live ADS-B traffic around Phoenix Sky Harbor, used by
// phx-digital-twin. Public ADS-B APIs do not send CORS headers, so a browser
// page cannot call them directly. This function fetches one fixed area
// server-side, trims the payload and returns it to allowed origins.
//
// It holds no secrets and stores nothing. Platform JWT verification is off so
// the page can call it without a session; the origin allow-list and the
// fixed upstream URL keep it from being used as a general proxy.
//
// Optional controls: ADSB_RELAY_ALLOWED_ORIGINS (comma list),
// ADSB_RELAY_UPSTREAMS (ordered subset of adsb.lol, airplanes.live, adsb.fi;
// default adsb.lol then adsb.fi),
// ADSB_RELAY_CACHE_MS, ADSB_RELAY_TIMEOUT_MS.

import {
  corsHeaders,
  DEFAULT_ALLOWED_ORIGINS,
  normalizeOrigins,
  originAllowed,
  parseList,
  shapePayload,
  upstreamOrder,
  upstreamUrl,
  withSticky,
} from "./relay.mjs";

const envInt = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(Deno.env.get(name) || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const CACHE_MS = envInt("ADSB_RELAY_CACHE_MS", 2000, 1000, 30_000);
const TIMEOUT_MS = envInt("ADSB_RELAY_TIMEOUT_MS", 4000, 1000, 20_000);
const STICKY_MS = 5 * 60_000;
const STALE_MS = 20_000;

let cached: { at: number; body: string } | null = null;
let inflight: Promise<string> | null = null;
let sticky: { name: string; until: number } | null = null;

async function fetchUpstream(): Promise<string> {
  const errors: string[] = [];
  const order = upstreamOrder(Deno.env.get("ADSB_RELAY_UPSTREAMS"));
  for (const name of withSticky(order, sticky && sticky.until > Date.now() ? sticky.name : null)) {
    try {
      const res = await fetch(upstreamUrl(name), {
        headers: { "Accept": "application/json", "User-Agent": "airport-twin-relay/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = JSON.stringify(shapePayload(await res.json(), name, Date.now()));
      if (!sticky || sticky.name !== name || sticky.until <= Date.now()) sticky = { name, until: Date.now() + STICKY_MS };
      return body;
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(errors.join("; ") || "no upstream configured");
}

async function current(): Promise<{ body: string; stale: boolean }> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return { body: cached.body, stale: false };
  try {
    inflight ??= fetchUpstream().finally(() => { inflight = null; });
    const body = await inflight;
    cached = { at: Date.now(), body };
    return { body, stale: false };
  } catch (err) {
    if (cached && now - cached.at < STALE_MS) return { body: cached.body, stale: true };
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  const allowed = normalizeOrigins(parseList(Deno.env.get("ADSB_RELAY_ALLOWED_ORIGINS"), DEFAULT_ALLOWED_ORIGINS));
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin, allowed);
  const json = (status: number, body: string, extra: Record<string, string> = {}) =>
    new Response(body, { status, headers: { ...cors, ...extra, "Content-Type": "application/json", "Cache-Control": "no-store" } });

  if (!originAllowed(origin, allowed)) return json(403, JSON.stringify({ error: "Origin is not allowed.", code: "origin_not_allowed" }));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json(405, JSON.stringify({ error: "Use GET.", code: "method_not_allowed" }), { "Allow": "GET, OPTIONS" });

  try {
    const { body, stale } = await current();
    return json(200, body, stale ? { "X-Relay-Stale": "1" } : {});
  } catch (err) {
    console.error(JSON.stringify({ event: "adsb_relay_upstream_failed", detail: err instanceof Error ? err.message : String(err) }));
    return json(502, JSON.stringify({ error: "The ADS-B source did not answer.", code: "upstream_unavailable" }));
  }
});
