import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FIELD, FT, estimateQnhOffset, flowVote, livePhase, llToLocal, modelKey, nToIcao, normalize, operatorOf, predict,
} from "../phx-digital-twin/adsb.js";
import { buildIndex } from "../phx-digital-twin/tools/build_index.mjs";
import {
  AREA, KEEP, corsHeaders, normalizeOrigins, originAllowed, pickFields, shapePayload, upstreamOrder, upstreamUrl, withSticky,
} from "../supabase/functions/adsb-relay/relay.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (p) => readFileSync(resolve(root, p), "utf8");
const airport = JSON.parse(read("phx-digital-twin/data/airport.json"));
const app = read("phx-digital-twin/app.js");
const fragment = read("phx-digital-twin/phx-twin.html");
const workflow = read(".github/workflows/pages.yml");
const relaySource = read("supabase/functions/adsb-relay/index.ts");

test("N-numbers convert to the FAA-allocated ICAO address", () => {
  assert.equal(nToIcao("N327QS"), "A389C0"); // the aircraft tagged in the reference video
  assert.equal(nToIcao("N1"), "A00001");
  assert.equal(nToIcao("N99999"), "ADF7C7");
  assert.equal(nToIcao("n327qs"), "A389C0");
});

test("live positions project onto the same grid as the airfield data", () => {
  // Runway 8 and 25L ends as published in the X-Plane airport file, against the preprocessed local coordinates.
  const ends = Object.fromEntries(airport.runways.flatMap((r) => r.ends.map((e) => [e.id, e.p])));
  for (const [id, lat, lon] of [["08", 33.4408612, -112.02979379], ["25L", 33.42884355, -112.00153904], ["25R", 33.43103717, -111.99334803]]) {
    const [x, n] = llToLocal(lat, lon);
    assert.ok(Math.hypot(x - ends[id][0], n - ends[id][1]) < 0.06, `${id} lands ${Math.hypot(x - ends[id][0], n - ends[id][1]).toFixed(3)} m off`);
  }
  assert.deepEqual(llToLocal(FIELD.lat0, FIELD.lon0).map((v) => Math.round(v * 1000)), [0, 0]);
});

test("altitude: geometric height is preferred, pressure altitude is corrected, ground is ground", () => {
  const fieldHaeFt = (FIELD.elevM + FIELD.geoidM) / FT; // ellipsoid height of the field
  const air = normalize({ hex: "a1b2c3", lat: 33.44, lon: -112.0, alt_geom: fieldHaeFt + 1000, alt_baro: 1800, gs: 140, track: 258, baro_rate: -700 }, 0);
  assert.ok(Math.abs(air.alt - 1000 * FT) < 0.01);
  assert.equal(air.altSrc, "geom");
  assert.ok(Math.abs(air.vs - (-700 * FT) / 60) < 1e-9);

  const baroOnly = normalize({ hex: "a1b2c3", lat: 33.44, lon: -112.0, alt_baro: 2131, gs: 140, track: 258 }, 50);
  assert.ok(Math.abs(baroOnly.alt - (2131 * FT + 50 - FIELD.elevM)) < 1e-6);
  assert.equal(baroOnly.altSrc, "baro");

  const ground = normalize({ hex: "a1b2c3", lat: 33.4343, lon: -112.0116, alt_baro: "ground", gs: 0.5, track: 133, true_heading: 90, baro_rate: 64 });
  assert.equal(ground.ground, true);
  assert.equal(ground.alt, 0);
  assert.equal(ground.vs, 0);
  assert.equal(ground.hdg, 90, "reported heading beats course-over-ground while parked");
  assert.equal(normalize({ hex: "a1b2c3", lat: 33.4, lon: -112, alt_baro: "ground", gs: 0.4, track: 200 }).hdg, null, "no trustworthy heading when stopped");

  assert.equal(estimateQnhOffset([{ alt_geom: 5300, alt_baro: 5000 }, { alt_geom: 3200, alt_baro: 3000 }, { alt_geom: 40000, alt_baro: 38000 }, { alt_baro: 900 }]),
    300 * FT - FIELD.geoidM);
  assert.equal(estimateQnhOffset([{ alt_baro: 900 }]), null);
});

test("targets that are not aircraft are dropped", () => {
  assert.equal(normalize({ hex: "~2f33a1", lat: 33.4, lon: -112, alt_baro: 4000 }), null, "TIS-B track without an ICAO address");
  assert.equal(normalize({ hex: "a0c2c2", lat: 33.4, lon: -112, alt_baro: "ground", category: "C2" }), null, "surface vehicle");
  assert.equal(normalize({ hex: "a0c2c2", alt_baro: 4000 }), null, "no position");
  assert.equal(normalize({ hex: "a0c2c2", lat: 33.4, lon: -112 }), null, "no altitude");
});

test("dead reckoning extrapolates along track and stops extrapolating a stale report", () => {
  const rep = { t: 100, x: 0, n: 0, alt: 500, vx: 70, vn: 0, vs: -3.5, ground: false };
  assert.deepEqual(predict(rep, 102), { x: 140, n: 0, alt: 493 });
  assert.deepEqual(predict(rep, 400), { x: 70 * 15, n: 0, alt: 465 }, "capped at 15 s of travel and 10 s of descent");
  assert.equal(predict({ ...rep, ground: true, alt: 0 }, 130).x, 70 * 6);
  assert.equal(predict({ ...rep, alt: 5 }, 110).alt, 0, "never below the field");
});

test("type designators map to a model the renderer can build", () => {
  const known = new Set([...app.matchAll(/\b([A-Z][A-Z0-9]{2,3}): \['(?:nb|wb|tri|rj|bj|quad|ga|tp|heli)'/g)].map((m) => m[1]));
  assert.ok(known.size >= 35, `found ${known.size} models in app.js`);
  assert.equal(modelKey("B738", "A3", known), "B738");
  assert.equal(modelKey("E75L", "A3", known), "E175");
  assert.equal(modelKey("B39M", "A3", known), "B739");
  assert.equal(modelKey("A359", "A5", known), "A359");
  assert.equal(modelKey("", "A5", known), "B772");
  assert.equal(modelKey("ZZZZ", "A1", known), "C172");
  assert.equal(modelKey("B407", "A7", known), "EC35");
  assert.equal(modelKey("", "", known), "B738");
  for (const target of ["E175", "CRJ7", "CRJ9", "B789", "B77W", "A333", "A359", "B744", "C172", "SR22", "PC12", "BE20", "DH8D", "AT72", "H60", "EC35"]) {
    assert.ok(known.has(target), `${target} must exist in app.js TYPES`);
  }
});

test("operators come from the callsign, and military or private traffic is not painted as an airline", () => {
  assert.deepEqual(operatorOf("SWA2214", "N8710M", false), { code: "SWA", name: "Southwest Airlines", liv: "SWA" });
  assert.equal(operatorOf("ENY3920", "", false).liv, "AAL");
  assert.equal(operatorOf("RCH871", "", true).liv, "MIL");
  assert.equal(operatorOf("N172SP", "N172SP", false).code, "GA");
  assert.equal(operatorOf("XYZ12", "", false).liv, "GEN");
  assert.equal(operatorOf("", "", false).code, "UNK");
});

test("runway flow is inferred only from low descending traffic on a runway heading", () => {
  const base = { ground: false, alt: 400, vs: -3.5, x: 6000, n: -600, track: 258 };
  assert.equal(flowVote(base), "west");
  assert.equal(flowVote({ ...base, track: 80 }), "east");
  assert.equal(flowVote({ ...base, track: 180 }), null);
  assert.equal(flowVote({ ...base, vs: 6 }), null, "departures do not vote");
  assert.equal(flowVote({ ...base, alt: 3000 }), null);
  assert.equal(flowVote({ ...base, ground: true }), null);
});

test("an aircraft rolling on a runway is on the runway even while its transponder still says airborne", () => {
  const on = () => true, off = () => false;
  assert.equal(livePhase({ ground: false, gs: 72, vs: -0.9 }, 2, on), "roll", "touchdown, airborne bit not yet cleared");
  assert.equal(livePhase({ ground: false, gs: 40, vs: 0 }, 0, on), "roll", "takeoff roll reported as airborne");
  assert.equal(livePhase({ ground: false, gs: 72, vs: -3.5 }, 8, on), "arr", "still descending over the threshold");
  assert.equal(livePhase({ ground: false, gs: 80, vs: 6 }, 5, on), "climb", "lifted off");
  assert.equal(livePhase({ ground: false, gs: 60, vs: 0 }, 300, on), "lvl", "level flight above the field");
  assert.equal(livePhase({ ground: false, gs: 60, vs: 0 }, 5, off), "lvl", "low and level but not over a runway");
  assert.equal(livePhase({ ground: true, gs: 30, vs: 0 }, 0, on), "roll");
  assert.equal(livePhase({ ground: true, gs: 8, vs: 0 }, 0, off), "taxi");
  assert.equal(livePhase({ ground: true, gs: 0.4, vs: 0 }, 0, off), "stop");
  let calls = 0;
  livePhase({ ground: false, gs: 120, vs: -4 }, 900, () => { calls += 1; return true; });
  assert.equal(calls, 0, "the runway lookup is skipped when it cannot change the answer");
});

test("relay only reaches fixed upstreams for one fixed area", () => {
  assert.equal(upstreamUrl("adsb.lol"), `https://api.adsb.lol/v2/point/${AREA.lat}/${AREA.lon}/${AREA.radiusNm}`);
  assert.throws(() => upstreamUrl("example.com"));
  assert.deepEqual(upstreamOrder(""), ["adsb.lol", "adsb.fi"]);
  assert.equal(upstreamUrl("adsb.fi"), `https://opendata.adsb.fi/api/v2/lat/${AREA.lat}/lon/${AREA.lon}/dist/${AREA.radiusNm}`);
  assert.deepEqual(withSticky(["adsb.lol", "adsb.fi"], "adsb.fi"), ["adsb.fi", "adsb.lol"], "the upstream that last answered goes first");
  assert.deepEqual(withSticky(["adsb.lol", "adsb.fi"], "example.com"), ["adsb.lol", "adsb.fi"]);
  assert.deepEqual(withSticky(["adsb.lol", "adsb.fi"], null), ["adsb.lol", "adsb.fi"]);
  assert.deepEqual(upstreamOrder("airplanes.live, https://evil.example/x ,adsb.lol"), ["airplanes.live", "adsb.lol"]);
  // the function must not build an upstream URL from anything in the request
  assert.doesNotMatch(relaySource, /searchParams|req\.url|await req\.(json|text)\(/);
  assert.match(relaySource, /upstreamUrl\(name\)/);
  assert.doesNotMatch(relaySource, /SERVICE_ROLE|ANTHROPIC|apikey|Authorization/i, "the relay carries no credentials");
});

test("relay CORS allow-list and payload trimming", () => {
  const allowed = normalizeOrigins(["https://azjester.github.io/work/", "not a url"]);
  assert.deepEqual(allowed, ["https://azjester.github.io"]);
  assert.equal(originAllowed("https://azjester.github.io", allowed), true);
  assert.equal(originAllowed("https://evil.example", allowed), false);
  assert.equal(originAllowed(null, allowed), true);
  assert.equal(corsHeaders("https://azjester.github.io", allowed)["Access-Control-Allow-Origin"], "https://azjester.github.io");
  assert.equal(corsHeaders("https://evil.example", allowed)["Access-Control-Allow-Origin"], undefined);

  const trimmed = pickFields({ hex: "a1b2c3", lat: 1, lon: 2, nav_modes: ["x"], rssi: -3, alt_baro: "ground", flight: null });
  assert.deepEqual(trimmed, { hex: "a1b2c3", lat: 1, lon: 2, alt_baro: "ground" });
  assert.ok(KEEP.includes("alt_geom") && KEEP.includes("true_heading") && KEEP.includes("seen_pos"));

  const shaped = shapePayload({ ac: [{ hex: "a", lat: 1, lon: 2, junk: 1 }, { hex: "b" }], total: 2 }, "adsb.lol", 1234);
  assert.deepEqual(shaped, { now: 1234, src: "adsb.lol", area: "KPHX", ac: [{ hex: "a", lat: 1, lon: 2 }] });
  assert.equal(shapePayload({ now: 1794421442, aircraft: [{ hex: "a", lat: 1, lon: 2 }], resultCount: 1, ptime: 0 }, "adsb.fi", 1).ac.length, 1, "accepts the adsb.fi and aircraft.json shape");
  assert.throws(() => shapePayload({ msg: "rate limited" }, "x", 1));
});

test("the hosted page is generated from the artifact page and deployed with its data and relay", () => {
  assert.equal(read("phx-digital-twin/index.html"), buildIndex(fragment), "run node phx-digital-twin/tools/build_index.mjs");
  for (const file of ["app.js", "adsb.js", "data/airport.json", "data/imagery.jpg", "data/terrain.b64.txt", "data/buildings.b64.txt"]) {
    assert.ok(existsSync(resolve(root, "phx-digital-twin", file)), `${file} is missing`);
  }
  assert.match(workflow, /cp -R[^\n]*phx-digital-twin\/index\.html[^\n]*phx-digital-twin\/adsb\.js[^\n]*phx-digital-twin\/data[^\n]*_site\/phx-digital-twin\//);
  assert.match(workflow, /supabase functions deploy adsb-relay [^\n]*--no-verify-jwt/);
  assert.match(app, /functions\/v1\/adsb-relay/);
});

test("the demo movie is deployed, starts playing before it has fully downloaded, and has no audio track", () => {
  assert.match(workflow, /cp -R[^\n]*phx-digital-twin\/phx-twin-demo\.mp4[^\n]*_site\/phx-digital-twin\//);
  const movie = readFileSync(resolve(root, "phx-digital-twin/phx-twin-demo.mp4"));
  assert.ok(movie.length < 50 * 1024 * 1024, "keep the movie under GitHub's 50 MB warning size");
  const head = movie.subarray(0, 1024 * 1024).toString("latin1"); // the track index (moov) leads the file when encoded with -movflags +faststart
  assert.ok(head.includes("moov") && head.includes("vide"), "encode with -movflags +faststart");
  assert.ok(!head.includes("soun"), "the movie must not carry an audio track");
});

test("aerial photography is baked, described and matches the script that fetches it", () => {
  const info = JSON.parse(read("phx-digital-twin/data/photo_tiles/index.json"));
  const report = JSON.parse(read("phx-digital-twin/tools/imagery_report.json"));
  assert.equal(info.cols * info.rows, 40);
  assert.equal(info.x0, airport.meta.plane[0]);
  assert.equal(info.n1, airport.meta.plane[3]);
  assert.ok(Math.abs(info.cols * info.tile_m - (airport.meta.plane[1] - airport.meta.plane[0])) < 1e-6, "tiles span the airfield plane exactly");
  assert.equal(info.s2_match.gain.length, 3);
  assert.match(info.flown, /^\d{4}-\d{2}-\d{2}$/);
  for (let r = 0; r < info.rows; r++) for (let c = 0; c < info.cols; c++) assert.ok(existsSync(resolve(root, `phx-digital-twin/data/photo_tiles/${r}_${c}.jpg`)), `tile ${r}_${c} is missing`);
  for (const f of ["photo_airfield.jpg", "photo_airfield_4k.jpg", "photo_metro.jpg"]) assert.ok(existsSync(resolve(root, "phx-digital-twin/data", f)), `${f} is missing`);
  assert.ok(report.airfield_clip_pct < 1 && report.metro_clip_pct < 1, "photos must not be blown out");
  // The pull-request job skips the bake when this matches; a script edit without a re-bake would leave stale imagery.
  const sha = createHash("sha256").update(readFileSync(resolve(root, "phx-digital-twin/tools/fetch_imagery.py"))).update(readFileSync(resolve(root, "phx-digital-twin/tools/imagery.config.json"))).digest("hex").slice(0, 16);
  assert.equal(report.inputs_sha, sha, "fetch_imagery.py or its config changed since the imagery was baked");
  assert.match(app, /function paintAirfield\(\)/, "the painted airfield stays as the fallback when photos are missing");
  const dataWorkflow = read(".github/workflows/phx-twin-data.yml");
  assert.match(dataWorkflow, /check-deployment/);
  assert.match(dataWorkflow, /FORCE_BAKE/);
  assert.doesNotMatch(dataWorkflow, /paths:[\s\S]*phx-twin-data\.yml/, "editing the workflow must not trigger a re-bake");
});

test("zoom and data-source controls exist and the page states what it is", () => {
  for (const id of ["zin", "zout", "zhome", "mode-sim", "mode-live", "feed-note", "chip-mode", "d-src", "d-age"]) {
    assert.match(fragment, new RegExp(`id="${id}"`), `#${id} is missing`);
  }
  assert.match(fragment, /aria-label="Zoom in"/);
  // layout regressions seen on the live page: the flight card overlapped the clock panel, and tags painted over panels
  assert.match(fragment, /<div id="rightcol">\s*<section id="ops"[\s\S]*?<\/section>\s*<section id="detail"/, "clock panel and flight card must share the stacking column");
  assert.doesNotMatch(fragment, /#detail\{[^}]*top:calc\(160px/, "the flight card must not be pinned at a fixed offset");
  assert.match(fragment, /#labels\{[^}]*isolation:isolate/);
  assert.match(fragment, /not for navigation or operational use/);
  assert.match(app, /addEventListener\('wheel'/);
});
