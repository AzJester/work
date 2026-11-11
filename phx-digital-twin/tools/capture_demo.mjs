// Renders the silent demo movie of the PHX twin, one scene per invocation, frame by frame.
//
//   node capture_demo.mjs <scene> <outDir>      scenes: A B C D E F
//   then encode all frames with ffmpeg (see README).
//
// It drives the real page in headless Chromium using the page's capture mode (window.__TWIN_CAPTURE): nothing in the
// page advances until the script steps it, so every frame is rendered fully however slow the renderer is. Live traffic
// is a replay of tools/_recording/feed.json.gz, a real session of the ADS-B relay recorded by the "PHX twin data" workflow.
// Clicks are real mouse clicks on the real controls; the pointer and captions are overlays added for the recording.
//
// Environment: PLAYWRIGHT (path to playwright), THREE_DIR (three@0.160.0 package dir), FONT_DIR (node_modules with
// @fontsource packages). No network access is needed.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ROOT = here("../");
const { chromium } = (await import(process.env.PLAYWRIGHT || "playwright")).default;
const THREE_DIR = process.env.THREE_DIR, FONT_DIR = process.env.FONT_DIR;
const FPS = +(process.env.FPS || 20), W = 1280, H = 720;
const REC = JSON.parse(zlib.gunzipSync(fs.readFileSync(here("./_recording/feed.json.gz"))));
const REC_EPOCH = Date.parse(REC.recorded);
const recIdx = (sec) => Math.max(0, Math.min(REC.frames.length - 1, Math.floor(sec * 1000 / REC.interval_ms)));
const recFrame = (sec) => REC.frames[recIdx(sec)];
const mst = new Date(REC_EPOCH - 7 * 3600e3);
const recLabel = `${mst.toISOString().slice(11, 16)} MST on ${mst.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mst.getUTCMonth()]} ${mst.getUTCFullYear()}`;

const [sceneId, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- storyboard
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const SCENES = {
  A: { rec: 4, dur: 7, captions: [[0.4, 6.8, "Phoenix Sky Harbor · 3D digital twin", "Real aerial photography · live ADS-B traffic · runs in a browser"]],
    cam: (t) => { const k = ease(t / 7); return { pos: [lerp(3300, 2700, k), lerp(5600, 1450, k), lerp(7200, 2900, k)], tgt: [300, 0, -80] }; } },
  B: { rec: 33.5, dur: 8.5, captions: [[0.3, 8.2, "Every tagged aircraft is real", `Live ADS-B positions, recorded ${recLabel}. American 543 departs runway 7L.`]],
    track: { callsign: "AAL543", back: 130, side: 100, up: 34, lead: 50 } },
  C: { rec: 42, dur: 9.5, captions: [[0.3, 9.2, "Tower cab view", "Looking out from the 326 ft control tower as American 2121 lands on runway 8."]],
    cam: (t) => (t < 0.9 ? { pos: [980, 190, 330], tgt: [553, 85, -122] } : null),
    events: [{ t: 0.15, move: '[data-cam="tower"]', dur: 0.6 }, { t: 0.9, click: true }, { t: 1.4, move: [640, 470], dur: 0.8 }],
    tower: { from: 0.95, callsign: "AAL2121", fov: 7 } },
  D: { rec: 96, dur: 9.5, captions: [[0.3, 9.2, "Zoom in anywhere", "30 cm aerial photography loads around the view. Tagged aircraft at the gates are live."]],
    cam: (t) => (t < 1.0 ? { pos: [1950, 900, 1150], tgt: [1060, 0, 110] } : { orbit: 4.4 / FPS }),
    events: [{ t: 0.3, move: "#zin", dur: 0.6 }, { t: 1.0, click: true }, { t: 1.6, click: true }, { t: 2.2, click: true }, { t: 2.8, click: true }, { t: 3.4, click: true }, { t: 4.2, move: [700, 430], dur: 0.9 }] },
  E: { rec: 132.5, dur: 13, captions: [[0.3, 12.7, "Click any aircraft", "Identity, altitude, speed and position source. Follow keeps the camera on Southwest 3828 as it lands on runway 8."]],
    cam: (t) => (t < 2.9 ? { pos: [-1900, 420, 300], tgt: [-1700, 0, -720] } : null),
    events: [{ t: 0.4, move: { tag: "SWA3828" }, dur: 0.9 }, { t: 1.5, click: true }, { t: 1.9, move: "#d-follow", dur: 0.8 }, { t: 2.9, click: true }, { t: 3.3, move: [700, 500], dur: 0.8 }],
    follow: { from: 2.95, back: 150, side: 110, up: 48 } },
  F: { rec: 160, dur: 14, captions: [[0.3, 9.4, "Simulated traffic for any time of day", "Switch from live to the built-in simulator, set the clock, and the airfield lights come on."], [9.9, 13.8, "azjester.github.io/work/phx-digital-twin", "Unofficial visualization · imagery USDA NAIP · traffic adsb.lol community receivers"]],
    cam: (t) => (t < 6.2 ? { pos: [2500, 700, 1700], tgt: [700, 0, -50] } : null),
    events: [{ t: 0.3, move: "#mode-sim", dur: 0.7 }, { t: 1.1, click: true }, { t: 1.6, move: { slider: 12.25 }, dur: 0.6 }, { t: 2.3, drag: [12.25, 20.25], dur: 2.6 },
      { t: 5.1, move: '[data-spd="4"]', dur: 0.5 }, { t: 5.7, click: true }, { t: 5.9, move: '[data-cam="tour"]', dur: 0.4 }, { t: 6.3, click: true, then: "tour" }, { t: 6.8, move: [820, 420], dur: 0.8 }] },
};
const S = SCENES[sceneId];
if (!S) throw new Error(`unknown scene ${sceneId}`);
const PRE = 7; // seconds of feed replayed before the first captured frame, so tracks and smoothing are settled

// ---------------------------------------------------------------- browser
const mime = (p) => (p.endsWith(".html") ? "text/html" : p.endsWith(".js") || p.endsWith(".mjs") ? "text/javascript" : p.endsWith(".jpg") ? "image/jpeg" : p.endsWith(".json") ? "application/json" : p.endsWith(".woff2") ? "font/woff2" : "text/plain");
const FONT_CSS = [["Barlow", "barlow", [400, 500, 600]], ["Barlow Condensed", "barlow-condensed", [500, 600, 700]], ["IBM Plex Mono", "ibm-plex-mono", [400, 500]]]
  .flatMap(([fam, pkg, ws]) => ws.map((w) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(http://twin.local/__fonts/${pkg}/files/${pkg}-latin-${w}-normal.woff2) format('woff2')}`)).join("\n");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.addInitScript((epoch) => {
  window.__TWIN_OPTS = { shadow: 2048, terrainStep: 2, aniso: 8, tiles: 8, air: "full" };
  window.__TWIN_CAPTURE = { epoch };
}, REC_EPOCH + (S.rec - PRE) * 1000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === "twin.local") {
    if (u.pathname.startsWith("/__fonts/")) return r.fulfill({ body: fs.readFileSync(path.join(FONT_DIR, "@fontsource", u.pathname.slice(9))), contentType: "font/woff2", headers: { "access-control-allow-origin": "*" } });
    const p = u.pathname === "/" ? "index.html" : u.pathname.slice(1), f = path.join(ROOT, p);
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: mime(p) }) : r.fulfill({ status: 404 });
  }
  if (u.hostname === "cdn.jsdelivr.net") { const m = u.pathname.match(/three@0\.160\.0\/(.*)$/); if (m) return r.fulfill({ body: fs.readFileSync(path.join(THREE_DIR, m[1])), contentType: "text/javascript" }); }
  if (u.hostname === "fonts.googleapis.com") return r.fulfill({ body: FONT_CSS, contentType: "text/css" });
  return r.abort();
});
await page.goto("http://twin.local/");
await page.waitForFunction(() => document.querySelector("#loading")?.hidden === true && window.__twin?.step, { timeout: 240000 });

// recording overlays: captions and a pointer (the page itself is untouched)
await page.addStyleTag({ content: `
  .panel{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(9,17,21,.9)!important}
  .chip::before{animation:none!important}
  #demo-cap{position:absolute;left:626px;bottom:86px;transform:translateX(-50%);z-index:20;text-align:center;padding:10px 20px 11px;border-radius:6px;background:rgba(6,12,15,.88);border:1px solid rgba(242,181,58,.5);width:max-content;max-width:588px;box-sizing:border-box;pointer-events:none}
  #demo-cap b{display:block;font:700 27px/1.1 'Barlow Condensed','Arial Narrow',sans-serif;color:#fff;letter-spacing:.01em}
  #demo-cap span{display:block;margin-top:4px;font:500 15px/1.3 'Barlow',system-ui,sans-serif;color:#d5dde1}
  #demo-cur{position:absolute;left:0;top:0;width:26px;height:26px;z-index:30;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
  #demo-ring{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f2b53a;z-index:29;pointer-events:none;opacity:0}` });
await page.evaluate(() => {
  const app = document.querySelector("#app");
  app.insertAdjacentHTML("beforeend", '<div id="demo-cap" style="opacity:0"><b></b><span></span></div><div id="demo-ring"></div><svg id="demo-cur" viewBox="0 0 24 24" style="opacity:0"><path d="M4 2l15 9-7 1.6L8.6 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  const T = window.__twin, st = { off: null };
  const find = (cs) => T.SIM.ac.find((a) => a.callsign === cs);
  window.__demo = (o) => {
    const cam = T.camera, ctl = T.controls, K = (base) => 1 - Math.pow(1 - base, o.dt * 20); // per-frame easing rates are written for 20 fps
    if (o.cam && o.cam.pos) { ctl.target.set(...o.cam.tgt); cam.position.set(...o.cam.pos); }
    if (o.cam && o.cam.orbit) { const d = cam.position.clone().sub(ctl.target), a = o.cam.orbit * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); cam.position.set(ctl.target.x + d.x * c - d.z * s, cam.position.y, ctl.target.z + d.x * s + d.z * c); }
    const rel = (ac, back, side, up) => { const h = ac.hdg * Math.PI / 180, fx = Math.sin(h), fz = -Math.cos(h); return [-fx * back - fz * side, up, -fz * back + fx * side]; };
    if (o.track) { // free camera pacing an aircraft
      const ac = find(o.track.callsign);
      if (ac) { const p = ac.obj.position, r = rel(ac, o.track.back, o.track.side, o.track.up), h = ac.hdg * Math.PI / 180;
        const want = [p.x + r[0], p.y + r[1], p.z + r[2]];
        if (!st.cam) st.cam = want; st.cam = st.cam.map((v, i) => v + (want[i] - v) * K(0.12));
        ctl.target.set(p.x + Math.sin(h) * o.track.lead, p.y + 6, p.z - Math.cos(h) * o.track.lead); cam.position.set(...st.cam); }
    }
    if (o.follow) { // the page's own Follow mode moves the camera; ease its offset to a chase view
      const ac = T.SIM.ac.find((a) => a.lblEl.classList.contains("sel"));
      if (ac) { const want = rel(ac, o.follow.back, o.follow.side, o.follow.up), cur = cam.position.clone().sub(ctl.target);
        const k = K(0.07); cam.position.set(ctl.target.x + cur.x + (want[0] - cur.x) * k, ctl.target.y + cur.y + (want[1] - cur.y) * k, ctl.target.z + cur.z + (want[2] - cur.z) * k); }
    }
    if (o.tower) { // look from the cab toward an aircraft, narrowing the field of view
      const ac = find(o.tower.callsign);
      if (ac) { const d = ac.obj.position.clone().sub(ctl.target); d.y += 4; d.normalize();
        if (!st.dir) st.dir = d.clone(); st.dir.lerp(d, K(0.1)).normalize();
        cam.position.copy(ctl.target).addScaledVector(st.dir, -0.8);
        cam.fov += (o.tower.fov - cam.fov) * K(0.09); cam.updateProjectionMatrix(); }
    }
    if (o.slider !== undefined) { const tod = document.querySelector("#tod"); tod.value = String(o.slider); tod.dispatchEvent(new Event("input")); }
    if (o.feed) T.liveIngest(o.feed);
    T.step(o.dt, o.draw !== false);
    if (o.draw === false) return;
    const cap = document.querySelector("#demo-cap"); cap.style.opacity = o.cap ? o.cap[2] : 0;
    if (o.cap) { cap.children[0].textContent = o.cap[0]; cap.children[1].textContent = o.cap[1]; }
    const cur = document.querySelector("#demo-cur"), ring = document.querySelector("#demo-ring");
    cur.style.opacity = o.cur ? 1 : 0; if (o.cur) cur.style.transform = `translate(${o.cur[0] - 4}px,${o.cur[1] - 2}px)`;
    ring.style.opacity = o.ring ? o.ring[2] : 0; if (o.ring) ring.style.transform = `translate(${o.ring[0]}px,${o.ring[1]}px) scale(${o.ring[3]})`;
  };
});

// ---------------------------------------------------------------- run
await page.evaluate((f) => { const T = window.__twin; T.setCam("orbit"); T.startLive(f); T.syncModeUi(); }, { src: REC.source, ac: recFrame(S.rec - PRE).ac });
let fed = recIdx(S.rec - PRE);
const feedFor = (sec) => { const k = recIdx(sec); if (k === fed) return null; fed = k; return { src: REC.source, ac: REC.frames[k].ac }; };
const tilesIdle = () => page.waitForFunction(() => window.__twin.DETAIL.busy === 0, null, { timeout: 60000 }); // photo tiles load in real time; let them land before the next frame
for (let i = 0, n = Math.round(PRE / 0.05); i < n; i++) {
  const t = -PRE + i * 0.05;
  await page.evaluate((o) => window.__demo(o), { dt: 0.05, draw: i === n - 1, feed: feedFor(S.rec + t + 0.05), cam: S.cam ? S.cam(0) : null, track: S.track });
  if (i % 4 === 3) await tilesIdle();
}

const center = async (sel) => page.evaluate((s) => {
  let el;
  if (typeof s === "string") el = document.querySelector(s);
  else if (s.row) el = [...document.querySelectorAll("#tlist li button")].find((b) => b.children[0].textContent === s.row);
  else if (s.tag) el = window.__twin.SIM.ac.find((a) => a.callsign === s.tag)?.lblEl.querySelector(".cs"); // the aircraft's tag in the 3D view; it moves
  if (!el) return null;
  if (!s.tag) el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null;
}, sel);
const sliderX = async (v) => page.evaluate((val) => { const r = document.querySelector("#tod").getBoundingClientRect(); return [r.left + 8 + (r.width - 16) * val / 24, r.top + r.height / 2]; }, v);

const target = async (m) => (Array.isArray(m) ? m : m.slider !== undefined ? sliderX(m.slider) : center(m));
let lastSel = null, cur = [W * 0.55, H * 0.6], showCur = (S.events || []).length > 0, move = null, drag = null, ring = null, tourOn = false;
const N = Math.round(S.dur * FPS), t0 = Date.now();
for (let f = 0; f < N; f++) {
  const t = f / FPS;
  for (const ev of S.events || []) {
    if (ev.done || t < ev.t) continue;
    ev.done = true;
    if (ev.move) { const to = await target(ev.move); if (to) { move = { from: [...cur], to, sel: ev.move, t0: t, dur: ev.dur }; lastSel = Array.isArray(ev.move) ? null : ev.move; } }
    if (ev.drag) drag = { ...ev, t0: t };
    if (ev.click) { // a click always lands on the target of the move before it, wherever that target is now
      if (lastSel) cur = (await target(lastSel)) || cur;
      move = null; await page.mouse.click(cur[0], cur[1]); ring = { at: [...cur], t0: t }; if (ev.then === "tour") tourOn = true;
    }
  }
  if (move) {
    if (move.sel.tag) move.to = (await target(move.sel)) || move.to;
    const k = ease((t - move.t0) / move.dur); cur = [lerp(move.from[0], move.to[0], k), lerp(move.from[1], move.to[1], k)];
    if (k >= 1) move = null;
  } else if (lastSel && lastSel.tag) cur = (await target(lastSel)) || cur; // rest on a moving tag
  let slider;
  if (drag) { const k = Math.min(1, (t - drag.t0) / drag.dur); slider = Math.round(lerp(drag.drag[0], drag.drag[1], ease(k)) * 4) / 4; cur = await sliderX(slider); if (k >= 1) drag = null; }
  const cap = (S.captions || []).find((c) => t >= c[0] && t <= c[1]);
  const o = {
    dt: 1 / FPS, feed: feedFor(S.rec + t + 1 / FPS), slider,
    cam: tourOn ? null : S.cam ? S.cam(t) : null,
    track: S.track, follow: S.follow && t >= S.follow.from ? S.follow : null, tower: S.tower && t >= S.tower.from ? S.tower : null,
    cap: cap ? [cap[2], cap[3], Math.min(1, (t - cap[0]) / 0.35, (cap[1] - t) / 0.35)] : null,
    cur: showCur ? cur : null,
    ring: ring && t - ring.t0 < 0.45 ? [ring.at[0], ring.at[1], 1 - (t - ring.t0) / 0.45, 0.35 + (t - ring.t0) * 2.2] : null,
  };
  await tilesIdle();
  await page.evaluate((x) => window.__demo(x), o);
  await page.screenshot({ path: path.join(outDir, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 94, timeout: 180000 });
  if (f % FPS === 0) console.log(`scene ${sceneId}: frame ${f}/${N}, ${((Date.now() - t0) / 1000 / (f + 1)).toFixed(2)} s per frame`);
}
if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
await browser.close();
console.log(`scene ${sceneId} done: ${N} frames in ${Math.round((Date.now() - t0) / 1000)} s`);
