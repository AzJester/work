// Records the live ADS-B relay for a few minutes so a session can be replayed offline (used to capture the demo movie).
// Run by the "PHX twin data" workflow, task record-feed. Writes tools/_recording/feed.json.gz:
//   { recorded: ISO time, interval_ms, source, frames: [{ t: ms since start, ac: [...] }] }
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const RELAY = process.env.TWIN_RELAY || "https://hqqwlkmggwgaoiyzgrhy.supabase.co/functions/v1/adsb-relay";
const ORIGIN = "https://azjester.github.io";
const SECONDS = Number(process.env.RECORD_SECONDS || 200), EVERY = 2000;
const out = fileURLToPath(new URL("./_recording/feed.json.gz", import.meta.url));

const frames = [], started = Date.now();
let src = "", fails = 0;
while (Date.now() - started < SECONDS * 1000) {
  const tick = Date.now();
  try {
    const res = await fetch(RELAY, { headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    src = j.src || src;
    frames.push({ t: tick - started, ac: j.ac || [] });
  } catch (err) { fails++; console.log("poll failed:", err?.message || err); }
  await new Promise((r) => setTimeout(r, Math.max(0, EVERY - (Date.now() - tick))));
}
if (!frames.length) { console.log("No frames recorded."); process.exit(1); }
mkdirSync(fileURLToPath(new URL("./_recording/", import.meta.url)), { recursive: true });
const body = JSON.stringify({ recorded: new Date(started).toISOString(), interval_ms: EVERY, source: src, frames });
writeFileSync(out, gzipSync(body));
const counts = frames.map((f) => f.ac.length);
console.log(`recorded ${frames.length} frames over ${Math.round((Date.now() - started) / 1000)} s from ${src}; ${Math.min(...counts)}-${Math.max(...counts)} aircraft per frame; ${fails} failed polls; ${(body.length / 1e6).toFixed(1)} MB raw`);
