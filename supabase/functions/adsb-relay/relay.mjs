// Pure helpers for the adsb-relay Edge Function, kept separate so node tests can import them.

// The relay serves one fixed area. It is not a general proxy: no caller-supplied host, path or coordinates.
export const AREA = Object.freeze({ name: "KPHX", lat: 33.4343, lon: -112.0116, radiusNm: 40 });

export const UPSTREAMS = Object.freeze({
  "adsb.lol": ({ lat, lon, radiusNm }) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`,
  "airplanes.live": ({ lat, lon, radiusNm }) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusNm}`,
  "adsb.fi": ({ lat, lon, radiusNm }) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`,
});

export const DEFAULT_UPSTREAMS = Object.freeze(["adsb.lol"]);
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["https://azjester.github.io"]);

// Fields the twin uses. Everything else from upstream is dropped to keep responses small.
export const KEEP = Object.freeze([
  "hex", "type", "flight", "r", "t", "category", "lat", "lon", "alt_baro", "alt_geom", "gs", "track", "true_heading",
  "baro_rate", "geom_rate", "squawk", "emergency", "seen", "seen_pos", "dbFlags",
]);

export function parseList(value, fallback) {
  const items = String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : [...fallback];
}

export function upstreamOrder(value) {
  return parseList(value, DEFAULT_UPSTREAMS).filter((name) => Object.hasOwn(UPSTREAMS, name));
}

export function upstreamUrl(name) {
  if (!Object.hasOwn(UPSTREAMS, name)) throw new Error(`unknown upstream ${name}`);
  return UPSTREAMS[name](AREA);
}

export function normalizeOrigins(list) {
  return [...new Set(list.flatMap((entry) => {
    try { return [new URL(entry).origin]; } catch { return []; }
  }))];
}

// No Origin header (curl, server-side) is allowed; a browser Origin must be on the list.
export function originAllowed(origin, allowed) {
  if (!origin) return true;
  try { return allowed.includes(new URL(origin).origin); } catch { return false; }
}

export function corsHeaders(origin, allowed) {
  const headers = { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
  if (origin && originAllowed(origin, allowed)) headers["Access-Control-Allow-Origin"] = new URL(origin).origin;
  return headers;
}

export function pickFields(aircraft) {
  const out = {};
  for (const key of KEEP) if (aircraft[key] !== undefined && aircraft[key] !== null) out[key] = aircraft[key];
  return out;
}

// Accepts the v2 API shape ({ac: [...]}) and a receiver's aircraft.json ({aircraft: [...]}).
export function shapePayload(upstream, name, nowMs) {
  const list = Array.isArray(upstream?.ac) ? upstream.ac : Array.isArray(upstream?.aircraft) ? upstream.aircraft : null;
  if (!list) throw new Error("upstream response has no aircraft list");
  return { now: nowMs, src: name, area: AREA.name, ac: list.filter((a) => a && typeof a.lat === "number" && typeof a.lon === "number").map(pickFields) };
}
