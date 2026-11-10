// Verification run for the Astrion capabilities film.
//   node verify.mjs [--out <dir>] [--viewports 1920x1080,390x844] [--skip-4k] [--skip-score] [--skip-play] [--merge]
// Renders every shot headless at each viewport, compares the bounding boxes of all visible text
// (watermark included) on a dense time sweep, samples contrast behind the text, analyses the
// rendered score, and plays the film through once to check that sound starts, holds sync and ends.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('@playwright/test')); }
const root = dirname(fileURLToPath(import.meta.url));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const has = n => process.argv.includes(n);
const outDir = arg('--out') || join(root, 'verify-out');
const url = pathToFileURL(join(root, 'astrion-capabilities-film.html')).href;
const pick = arg('--viewports');
const VIEWPORTS = [[1920, 1080], [1366, 768], [390, 844]].concat(has('--skip-4k') ? [] : [[3840, 2160]]).filter(([w, h]) => !pick || pick.split(',').includes(w + 'x' + h));
const sections = [];        // what this run covered, for --merge
const MIN = { headline: 64, support: 28, label: 20 };          // design pixels at 1920 by 1080
const failures = [], report = { file: url, generated: new Date().toISOString(), viewports: {}, timeline: {}, score: null, playback: null, failures };
const fail = (where, msg) => { failures.push(where + ': ' + msg); };

const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const BONE = [238, 237, 231];
const gapOf = (a, b) => { const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)); return dx === 0 && dy === 0 ? -1 : Math.max(dx, dy); };

// Geometry rules for one frame. Returns the smallest clearance found between two text elements.
function checkFrame(tag, snap, stats) {
  const { stage, boxes } = snap, u = stage.u, clear = 48 * u, eps = 0.6;
  const wm = boxes.find(b => b.kind === 'watermark'), others = boxes.filter(b => b.kind !== 'watermark');
  if (!wm) { fail(tag, 'watermark missing'); return; }
  if (wm.opacity < 0.55 || wm.opacity > 0.65) fail(tag, 'watermark opacity ' + wm.opacity);
  if (wm.fontPx < 14 - 0.01) fail(tag, 'watermark font ' + wm.fontPx + 'px');
  const zone = { x: 0, y: wm.y - clear, w: wm.x + wm.w + clear, h: stage.h - (wm.y - clear) };   // reserved lower-left corner
  for (const b of others) {
    if (b.x < -eps || b.y < -eps || b.x + b.w > stage.w + eps || b.y + b.h > stage.h + eps) fail(tag, b.id + ' leaves the stage');
    if (gapOf(b, zone) < 0) fail(tag, b.id + ' enters the reserved lower-left corner');
    const min = MIN[b.kind];
    if (min && b.fontPx < Math.max(14, min * u) - 0.02) fail(tag, b.id + ' font ' + b.fontPx.toFixed(2) + 'px is below the minimum ' + Math.max(14, min * u).toFixed(2) + 'px');
    if (b.kind !== 'logo' && b.fontPx < 14 - 0.01) fail(tag, b.id + ' renders below 14px');
  }
  let minGap = Infinity;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const g = gapOf(boxes[i], boxes[j]);
    if (g < 0) fail(tag, boxes[i].id + ' overlaps ' + boxes[j].id);
    else if (g < clear - eps) fail(tag, boxes[i].id + ' and ' + boxes[j].id + ' are ' + g.toFixed(1) + 'px apart, need ' + clear.toFixed(1) + 'px');
    if (g >= 0) minGap = Math.min(minGap, g);
  }
  const heads = others.filter(b => b.kind === 'headline').length, sups = others.filter(b => b.kind === 'support').length;
  if (heads > 1) fail(tag, heads + ' headlines on screen');
  if (sups > 1) fail(tag, sups + ' supporting lines on screen');
  const groups = [...new Set(others.map(b => b.group))];
  if (groups.length > 1) fail(tag, 'text from ' + groups.join(' and ') + ' on screen together');
  if (stats) { stats.minGapPx = Math.min(stats.minGapPx, minGap); stats.frames++; stats.maxTexts = Math.max(stats.maxTexts, boxes.length); }
  return { minGap, clear };
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(w, h, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...extra });
  const page = await ctx.newPage(), log = { errors: [], warnings: [], external: [] };
  page.setDefaultTimeout(300000);
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); else if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  page.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) log.external.push(r.url()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__film, null, { timeout: 30000 });
  return { ctx, page, log };
}
// Worst-case background luminance behind each box, read from a screenshot taken with the text hidden.
async function backgrounds(ctx, png, boxes) {
  const p = await ctx.newPage();
  const res = await p.evaluate(async ({ b64, boxes }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    return boxes.map(b => {
      const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y)), w = Math.min(img.width - x, Math.ceil(b.w)), h = Math.min(img.height - y, Math.ceil(b.h));
      if (w <= 0 || h <= 0) return null;
      const d = g.getImageData(x, y, w, h).data; let best = [0, 0, 0], bl = -1;
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; if (l > bl) { bl = l; best = [d[i], d[i + 1], d[i + 2]]; } }
      return best;
    });
  }, { b64: png.toString('base64'), boxes });
  await p.close();
  return res;
}

/* ---------- 1. every shot at every viewport ---------- */
let film = null;
for (const [w, h] of VIEWPORTS) {
  const key = w + 'x' + h, dir = join(outDir, key); mkdirSync(dir, { recursive: true }); sections.push(key);
  const { ctx, page, log } = await open(w, h);
  film = film || await page.evaluate(() => ({ DUR: __film.DUR, BEAT: __film.BEAT, BEATS: __film.BEATS, MASTER: __film.MASTER, scenes: __film.scenes, shots: __film.shots, cues: __film.cues, cutBeats: __film.cutBeats }));
  const vp = report.viewports[key] = { shots: [], sweep: null, gate: null, controls: null, console: log };
  // play screen
  const ui0 = await page.evaluate(() => ({ ui: __film.ui(), snap: __film.boxes() }));
  await page.screenshot({ path: join(dir, '00-play-screen.png') });
  {
    const u = ui0.snap.stage.u, wm = ui0.snap.boxes.find(b => b.kind === 'watermark'), g = ui0.ui.gate;
    const items = [['gate logo', g.logo], ['gate label', g.label], ['gate button', g.button]];
    const zone = { x: 0, y: wm.y - 48 * u, w: wm.x + wm.w + 48 * u, h: ui0.snap.stage.h };
    for (const [n, b] of items) { if (gapOf(b, zone) < 0) fail(key + ' play screen', n + ' enters the reserved corner'); if (b.fontPx && b.fontPx < 14 - 0.01) fail(key + ' play screen', n + ' text below 14px'); }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const gp = gapOf(items[i][1], items[j][1]); if (gp < 48 * u - 0.6) fail(key + ' play screen', items[i][0] + ' and ' + items[j][0] + ' are ' + gp.toFixed(1) + 'px apart'); }
    if (!g.visible) fail(key + ' play screen', 'play screen is not shown on load');
    vp.gate = { visible: g.visible, labelFontPx: g.label.fontPx, buttonFontPx: g.button.fontPx };
  }
  await page.evaluate(() => __film.lockScale(true));
  let first = true;
  for (const [i, shot] of film.shots.entries()) {
    const tag = key + ' ' + shot.id;
    let snap = await page.evaluate(t => __film.frame(t), shot.t);
    if (first) { await page.waitForTimeout(700); first = false; }
    await page.waitForTimeout(40);
    await page.screenshot({ path: join(dir, String(i + 1).padStart(2, '0') + '-' + shot.id + '.png') });
    snap = await page.evaluate(() => __film.boxes());
    const res = checkFrame(tag, snap) || {};
    if (snap.boxes.length < 2) fail(tag, 'no film text visible at the shot midpoint');
    // contrast
    await page.evaluate(() => __film.hideText(true));
    const png = await page.screenshot();
    await page.evaluate(() => __film.hideText(false));
    const bg = await backgrounds(ctx, png, snap.boxes);
    const texts = snap.boxes.map((b, k) => {
      const bgc = bg[k] || [0, 0, 0], a = b.opacity, fg = b.kind === 'logo' ? [255, 255, 255] : BONE, mix = fg.map((v, c) => v * a + bgc[c] * (1 - a));
      const ratio = (lum(mix) + 0.05) / (lum(bgc) + 0.05);
      if (ratio < 7) fail(tag, b.id + ' contrast ' + ratio.toFixed(2) + ':1 against its brightest background pixel');
      return { id: b.id, kind: b.kind, text: b.text, fontPx: +b.fontPx.toFixed(2), box: [b.x, b.y, b.w, b.h].map(v => +v.toFixed(1)), opacity: b.opacity, contrast: +ratio.toFixed(2) };
    });
    vp.shots.push({ id: shot.id, t: +shot.t.toFixed(3), beat: shot.beat, minGapPx: res.minGap === Infinity ? null : +res.minGap.toFixed(1), requiredGapPx: +(48 * snap.stage.u).toFixed(1), canvas: snap.canvas, texts });
  }
  // dense sweep of the whole timeline, text layer only
  const stats = { frames: 0, minGapPx: Infinity, maxTexts: 0, stepSeconds: 0.1 };
  const before = failures.length;
  const snaps = await page.evaluate(async ({ dur, step }) => { const out = []; for (let t = 0; t <= dur; t += step) out.push([t, __film.frame(t, { textOnly: true })]); return out; }, { dur: film.DUR, step: stats.stepSeconds });
  for (const [t, snap] of snaps) checkFrame(key + ' t=' + t.toFixed(1) + 's', snap, stats);
  stats.minGapPx = +stats.minGapPx.toFixed(1); stats.requiredGapPx = +(48 * snaps[0][1].stage.u).toFixed(1); stats.failures = failures.length - before;
  vp.sweep = stats;
  // controls: bottom right, clear of the corner, hidden after two seconds without input
  await page.evaluate(() => __film.frame(30));
  await page.mouse.move(w / 2, h / 2); await page.mouse.move(w / 2 + 5, h / 2 + 5);
  await page.waitForTimeout(350);
  const shown = await page.evaluate(() => ({ ui: __film.ui(), snap: __film.boxes() }));
  await page.waitForTimeout(2300);
  const hidden = await page.evaluate(() => __film.ui());
  {
    const u = shown.snap.stage.u, wm = shown.snap.boxes.find(b => b.kind === 'watermark'), zone = { x: 0, y: wm.y - 48 * u, w: wm.x + wm.w + 48 * u, h: shown.snap.stage.h }, c = shown.ui.controls;
    if (gapOf(c, zone) < 0) fail(key + ' controls', 'controls enter the reserved corner');
    if (c.x + c.w / 2 < shown.snap.stage.w / 2) fail(key + ' controls', 'controls are not on the right');
    if (shown.ui.buttons.length !== 4) fail(key + ' controls', 'expected play, restart, mute and full screen');
    if (shown.ui.buttons.some(b => b.w < 43.5 || b.h < 43.5)) fail(key + ' controls', 'a control is smaller than 44px');
    if (shown.ui.idle || shown.ui.controlsOpacity < 0.9) fail(key + ' controls', 'controls did not appear on input');
    if (!hidden.idle || hidden.controlsOpacity > 0.05) fail(key + ' controls', 'controls did not hide after two seconds');
    vp.controls = { box: [c.x, c.y, c.w, c.h].map(v => +v.toFixed(1)), gapToCornerZonePx: +gapOf(c, zone).toFixed(1), shownOnInput: !shown.ui.idle, hiddenAfter2s: hidden.idle };
  }
  if (log.errors.length) fail(key, log.errors.length + ' console errors: ' + log.errors.slice(0, 3).join(' | '));
  if (log.external.length) fail(key, 'external requests: ' + log.external.slice(0, 3).join(', '));
  if (w === 3840) { const cvs = vp.shots[0].canvas; if (cvs[0] !== 3840 || cvs[1] !== 2160) fail(key, 'canvas is ' + cvs.join('x') + ', expected the 3840x2160 master'); }
  await ctx.close();
  console.log(key, 'shots', vp.shots.length, 'sweep frames', stats.frames, 'min gap', stats.minGapPx, 'px (need', stats.requiredGapPx + ')', 'console errors', log.errors.length);
}

/* ---------- 2. the timeline itself ---------- */
if (!film) { const { ctx, page } = await open(640, 360); film = await page.evaluate(() => ({ DUR: __film.DUR, BEAT: __film.BEAT, BEATS: __film.BEATS, MASTER: __film.MASTER, scenes: __film.scenes, shots: __film.shots, cues: __film.cues, cutBeats: __film.cutBeats })); await ctx.close(); }
{
  sections.push('timeline');
  const whole = v => Math.abs(v - Math.round(v)) < 1e-9, tl = report.timeline;
  tl.bpm = 60 / film.BEAT; tl.beats = film.BEATS; tl.seconds = film.DUR;
  tl.sceneCutsOnBeat = film.scenes.every(s => whole(s.b0) && whole(s.b1));
  tl.textEntrancesOnBeat = film.cues.every(c => whole(c.beatIn));
  tl.cuts = film.scenes.map(s => ({ scene: s.id, beat: s.b0, t: +(s.b0 * film.BEAT).toFixed(3) }));
  tl.entrances = film.cues.map(c => ({ id: c.id, beat: c.beatIn, t: +c.tin.toFixed(3), goneBy: +(c.tout + c.fo).toFixed(3) }));
  if (!tl.sceneCutsOnBeat) fail('timeline', 'a scene cut is off the beat grid');
  if (!tl.textEntrancesOnBeat) fail('timeline', 'a text entrance is off the beat grid');
  let worst = Infinity;
  for (const a of film.cues) for (const b of film.cues) if (a.group !== b.group && b.tin >= a.tin) { const g = b.tin - (a.tout + a.fo); if (g < 0) fail('timeline', b.id + ' fades in before ' + a.id + ' has gone'); worst = Math.min(worst, g < 0 ? g : Math.max(g, 0)); }
  tl.smallestGapBetweenTextsSeconds = +worst.toFixed(3);
  const tag = film.cues.find(c => c.id === 'tag'); tl.taglineHoldSeconds = +(tag.tout - (tag.tin + tag.fi)).toFixed(2);
  if (tl.taglineHoldSeconds < 3) fail('timeline', 'tagline holds for ' + tl.taglineHoldSeconds + 's');
  if (Math.abs(film.scenes[film.scenes.length - 1].b1 * film.BEAT - film.DUR) > 1e-9) fail('timeline', 'last scene does not end with the film');
}

/* ---------- 3. the score, rendered offline at 48 kHz ---------- */
if (!has('--skip-score')) {
  sections.push('score');
  const { ctx, page, log } = await open(1280, 720);
  const a = await page.evaluate(() => __film.renderScore());
  report.score = a;
  if (Math.abs(a.seconds - film.DUR) > 1 / a.sampleRate) fail('score', 'length ' + a.seconds + 's, film ' + film.DUR + 's');
  if (a.peak >= 1 || a.samplesAtCeiling > 0) fail('score', 'clipping: peak ' + a.peak + ', ' + a.samplesAtCeiling + ' samples at the ceiling');
  if (a.last50msDb > -60) fail('score', 'score does not end in silence: ' + a.last50msDb + ' dB');
  for (const c of a.cuts) if (c.jumpDb <= 0) fail('score', 'no hit on the cut at beat ' + c.beat);
  if (log.errors.length) fail('score', log.errors.join(' | '));
  await ctx.close();
  console.log('score', a.seconds.toFixed(3) + 's', 'peak', a.peakDb, 'dBFS', 'rms', a.rmsDb, 'dB', 'at ceiling', a.samplesAtCeiling);
}

/* ---------- 4. play it: controls, then the whole film once ---------- */
if (!has('--skip-play')) {
  sections.push('playback');
  const { ctx, page, log } = await open(640, 360);
  const pb = report.playback = {};
  const st = () => page.evaluate(() => __film.state());
  await page.click('#gate-play');                         // a real user gesture, as a viewer would give
  await page.waitForFunction(() => { const s = __film.state(); return s.audio && s.audio.ctx === 'running' && s.t > 0.3; }, null, { timeout: 8000 }).catch(() => {});
  let s = await st();
  pb.audioStarted = !!(s.audio && s.audio.ctx === 'running'); pb.sampleRate = s.audio && s.audio.sampleRate;
  if (!pb.audioStarted) fail('playback', 'audio did not start on Play');
  await page.mouse.move(320, 180); await page.click('#b-play'); await page.waitForTimeout(300);
  const p1 = await st(); await page.waitForTimeout(600); const p2 = await st();
  pb.pauseHolds = p1.state === 'paused' && p1.audio.ctx === 'suspended' && Math.abs(p2.t - p1.t) < 1e-6;
  if (!pb.pauseHolds) fail('playback', 'pause does not hold picture and sound');
  await page.mouse.move(322, 182); await page.click('#b-play'); await page.waitForTimeout(700);
  s = await st(); pb.resumes = s.state === 'playing' && s.audio.ctx === 'running' && s.t > p2.t;
  if (!pb.resumes) fail('playback', 'resume failed');
  await page.waitForFunction(() => __film.state().t > 10.5, null, { timeout: 30000 });
  const lv1 = (await st()).audio.level;
  await page.mouse.move(324, 184); await page.click('#b-mute'); await page.waitForTimeout(500);
  const lv2 = (await st()).audio.level; s = await st();
  pb.mute = { levelBefore: +lv1.toFixed(4), levelMuted: +lv2.toFixed(5), pressed: await page.getAttribute('#b-mute', 'aria-pressed') };
  if (!(lv1 > 0.003 && lv2 < lv1 * 0.05 && pb.mute.pressed === 'true')) fail('playback', 'mute toggle did not silence the score');
  await page.click('#b-mute'); await page.waitForTimeout(200);
  await page.mouse.move(326, 186); await page.click('#b-restart');
  await page.waitForFunction(() => { const q = __film.state(); return q.state === 'playing' && q.audio && q.audio.ctx === 'running' && q.t > 0.2 && q.t < 3; }, null, { timeout: 8000 }).catch(() => fail('playback', 'restart did not return to the start'));
  // full run, sampled from inside the page
  const samples = await page.evaluate(() => new Promise(res => {
    const out = [], t0 = performance.now();
    const id = setInterval(() => {
      const q = __film.state();
      out.push({ wall: (performance.now() - t0) / 1000, t: q.t, state: q.state, audio: q.audio ? q.audio.filmTime : null, ctx: q.audio ? q.audio.ctx : null, level: q.audio ? q.audio.level : null });
      if (q.state === 'ended' || performance.now() - t0 > 130000) { clearInterval(id); res(out); }
    }, 250);
  }));
  const run = samples.filter(x => x.state === 'playing' && x.audio != null), a0 = run[0], last = samples[samples.length - 1];
  const drift = run.map(x => (x.audio - a0.audio) - (x.wall - a0.wall)), offs = run.map(x => Math.abs(x.audio - x.t)).sort((p, q) => p - q);
  const sounding = run.filter(x => x.audio > 3 && x.audio < 92);
  pb.samples = run.length;
  pb.audioClockDriftSeconds = { min: +Math.min(...drift).toFixed(3), max: +Math.max(...drift).toFixed(3) };
  pb.pictureBehindAudioSeconds = { median: +offs[Math.floor(offs.length / 2)].toFixed(3), max: +offs[offs.length - 1].toFixed(3), note: 'picture time is read from the audio clock on every frame; the offset seen here is the age of the last painted frame in a software renderer' };
  pb.fractionOfSamplesWithSound = +(sounding.filter(x => x.level > 0.0005).length / Math.max(1, sounding.length)).toFixed(3);
  pb.lastAudioTime = +run[run.length - 1].audio.toFixed(2); pb.filmSeconds = +film.DUR.toFixed(3);
  pb.ended = last.state === 'ended'; pb.pictureTimeAtEnd = +last.t.toFixed(3);
  const end = await page.evaluate(() => ({ st: __film.state(), ui: __film.ui(), label: document.getElementById('gate-play-text').textContent }));
  pb.audioClosedAtEnd = end.st.audio === null; pb.replayOffered = end.ui.gate.visible && end.label === 'Replay'; pb.playedSilent = end.st.silent;
  if (!pb.ended) fail('playback', 'film did not reach its end');
  if (Math.abs(last.t - film.DUR) > 1e-6) fail('playback', 'picture ended at ' + last.t + 's, film is ' + film.DUR + 's');
  if (pb.playedSilent) fail('playback', 'film fell back to silent playback');
  if (Math.max(...drift.map(Math.abs)) > 0.25) fail('playback', 'audio clock drifted ' + JSON.stringify(pb.audioClockDriftSeconds) + ' against the wall clock');
  if (pb.fractionOfSamplesWithSound < 0.9) fail('playback', 'sound present in only ' + pb.fractionOfSamplesWithSound + ' of samples');
  if (pb.lastAudioTime < film.DUR - 1.5) fail('playback', 'audio stopped at ' + pb.lastAudioTime + 's, before the picture');
  if (!pb.audioClosedAtEnd || !pb.replayOffered) fail('playback', 'end state is wrong');
  pb.console = log;
  if (log.errors.length) fail('playback', log.errors.length + ' console errors: ' + log.errors.slice(0, 3).join(' | '));
  await ctx.close();
  console.log('playback', JSON.stringify({ started: pb.audioStarted, drift: pb.audioClockDriftSeconds, sound: pb.fractionOfSamplesWithSound, ended: pb.ended }));
}
await browser.close();

mkdirSync(outDir, { recursive: true });
const reportPath = join(root, 'verify-report.json');
if (has('--merge') && existsSync(reportPath)) {       // fold this run into the earlier report, section by section
  const old = JSON.parse(readFileSync(reportPath, 'utf8')), mine = t => sections.some(k => t.startsWith(k + ' ') || t.startsWith(k + ':'));
  report.viewports = { ...old.viewports, ...report.viewports };
  if (!sections.includes('score')) report.score = old.score;
  if (!sections.includes('playback')) report.playback = old.playback;
  const kept = (old.failures || []).filter(t => !mine(t)); failures.unshift(...kept);
}
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(failures.length ? '\nFAILED: ' + failures.length + '\n' + failures.slice(0, 60).join('\n') : '\nPASS: no overlap, zone, size, contrast, console or audio failures');
process.exit(failures.length ? 1 : 0);
