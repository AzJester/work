// Post-deploy check, run from a machine with open internet (workflow "PHX twin data", task check-deployment).
// Confirms the public page and its data are being served and that the relay returns live aircraft the twin can parse.
// Exits 1 when the page is not served; a relay problem is reported but does not fail the job (the page then simulates).
import { estimateQnhOffset, normalize } from "../adsb.js";

const SITE = process.env.TWIN_URL || "https://azjester.github.io/work/phx-digital-twin/";
const RELAY = process.env.TWIN_RELAY || "https://hqqwlkmggwgaoiyzgrhy.supabase.co/functions/v1/adsb-relay";
const ORIGIN = new URL(SITE).origin;
let bad = false;

console.log(`== page ${SITE}`);
for (const path of ["", "app.js", "adsb.js", "data/airport.json", "data/imagery.jpg", "data/photo_airfield.jpg", "data/photo_metro.jpg", "data/photo_tiles/index.json", "data/photo_tiles/2_4.jpg"]) {
  try {
    const res = await fetch(SITE + path, { signal: AbortSignal.timeout(30000) });
    const bytes = (await res.arrayBuffer()).byteLength;
    console.log(`  ${res.status} ${(bytes / 1e6).toFixed(2).padStart(6)} MB  ${path || "index.html"}`);
    if (!res.ok && !path.startsWith("data/photo")) bad = true;
  } catch (err) { console.log(`  FAILED ${path}: ${err?.message || err}`); if (!path.startsWith("data/photo")) bad = true; }
}

console.log(`\n== relay ${RELAY}`);
for (const [label, origin] of [["from the Pages origin", ORIGIN], ["from another origin (must be refused)", "https://example.com"]]) {
  try {
    const t0 = Date.now();
    const res = await fetch(RELAY, { headers: { Origin: origin }, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    console.log(`  ${label}: ${res.status} in ${Date.now() - t0} ms, allow-origin: ${res.headers.get("access-control-allow-origin") || "none"}`);
    if (origin !== ORIGIN) continue;
    if (!res.ok) { console.log("   ", text.slice(0, 300)); continue; }
    const j = JSON.parse(text), list = j.ac || [];
    const qnh = estimateQnhOffset(list) ?? 0, norm = list.map((a) => normalize(a, qnh)).filter(Boolean);
    const near = norm.filter((a) => Math.hypot(a.x, a.n) < 6000);
    console.log(`    source ${j.src}; ${list.length} aircraft, ${norm.length} accepted, ${norm.filter((a) => a.ground).length} on the ground, ${near.length} within 6 km of the field`);
    for (const a of near.slice(0, 6)) console.log(`      ${a.hex} ${a.flight || "-"} ${a.type || "-"} ${a.ground ? "GND" : Math.round(a.mslFt) + " ft"} ${Math.round(a.gs / 0.514444)} kt`);
  } catch (err) { console.log(`  ${label}: FAILED ${err?.message || err}`); }
}
process.exit(bad ? 1 : 0);
