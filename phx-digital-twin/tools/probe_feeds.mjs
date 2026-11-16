// Checks, from a machine with open internet, what the public ADS-B APIs actually return for the KPHX area
// and whether the twin's parser accepts it. Run by .github/workflows/phx-twin-data.yml. Always exits 0: it reports.
import { estimateQnhOffset, normalize } from "../adsb.js";
import { AREA, UPSTREAMS, shapePayload } from "../../supabase/functions/adsb-relay/relay.mjs";

for (const [name, build] of Object.entries(UPSTREAMS)) {
  const url = build(AREA);
  console.log(`\n== ${name}  ${url}`);
  try {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "airport-twin-relay/1.0", Origin: "https://azjester.github.io" }, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    console.log(`status ${res.status} in ${Date.now() - t0} ms, ${text.length} bytes`);
    for (const h of ["content-type", "access-control-allow-origin", "cache-control", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "server"]) {
      if (res.headers.get(h)) console.log(`  ${h}: ${res.headers.get(h)}`);
    }
    console.log(`  CORS for browsers: ${res.headers.get("access-control-allow-origin") ? "yes" : "no header, a relay is required"}`);
    if (!res.ok) { console.log("  body:", text.slice(0, 300)); continue; }
    const json = JSON.parse(text);
    console.log("  top-level keys:", Object.keys(json).join(", "), "| now:", json.now);
    const shaped = shapePayload(json, name, Date.now());
    const qnh = estimateQnhOffset(shaped.ac) ?? 0;
    const norm = shaped.ac.map((a) => normalize(a, qnh)).filter(Boolean);
    const ground = norm.filter((a) => a.ground), near = norm.filter((a) => Math.hypot(a.x, a.n) < 6000);
    console.log(`  aircraft: ${shaped.ac.length} with position, ${norm.length} accepted by the twin, ${ground.length} on the ground, ${near.length} within 6 km of the field`);
    console.log(`  pressure-to-true altitude correction: ${qnh.toFixed(0)} m; with type code: ${norm.filter((a) => a.type).length}; with callsign: ${norm.filter((a) => a.flight).length}; position sources: ${[...new Set(shaped.ac.map((a) => a.type))].join(", ")}`);
    const keys = new Set(); for (const a of json.ac || json.aircraft || []) for (const k of Object.keys(a)) keys.add(k);
    console.log("  fields seen:", [...keys].sort().join(" "));
    const show = (a) => `${a.hex} ${a.flight || "-"} ${a.type || "-"} ${a.ground ? "GND" : Math.round(a.mslFt) + "ft"} gs=${Math.round(a.gs / 0.514444)}kt trk=${Math.round(a.track)} x=${Math.round(a.x)} n=${Math.round(a.n)} src=${a.src} age=${a.seenPos}s`;
    for (const a of [...ground.slice(0, 4), ...norm.filter((a) => !a.ground).slice(0, 4)]) console.log("   ", show(a));
  } catch (err) {
    console.log("  FAILED:", err?.message || err);
  }
}
