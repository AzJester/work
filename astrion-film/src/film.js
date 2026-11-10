/* Astrion capabilities film. Every frame is a pure function of film time:
   a shader plate, a layer of coded line work, and DOM type driven by one cue table.
   Timing is counted in beats so that cuts and text entrances sit on the score's grid. */
const AstrionFilm = (() => {
  'use strict';
  const BPM = 105, BEAT = 60 / BPM, BEATS = 164, DUR = BEATS * BEAT;   // 41 bars of 4/4
  const MASTER = [3840, 2160];                                          // 4K master; the stage scales down from it
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const sm = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const ease = u => u * u * (3 - 2 * u);
  const B = n => n * BEAT;
  const ION = '35,206,240', BONE = '238,237,231', FLARE = '226,253,255', STEEL = '138,143,153', CARBON = '11,13,16';

  /* ---------- structure ---------- */
  const SCENES = [
    { id: 'open', name: 'Cold open', b0: 0, b1: 16 },
    { id: 'descent', name: 'Domain descent', b0: 16, b1: 40 },
    { id: 'm1', name: 'Layered Defense, Autonomous Warfare + Integrated Fires', b0: 40, b1: 52 },
    { id: 'm2', name: 'Integrated Air + Missile Defense', b0: 52, b1: 64 },
    { id: 'm3', name: 'Lifecycle Management + Cyber Warfare', b0: 64, b1: 76 },
    { id: 'm4', name: 'Critical Infrastructure Resilience', b0: 76, b1: 88 },
    { id: 'm5', name: 'Space Warfighting', b0: 88, b1: 100 },
    { id: 'm6', name: 'Exploration + Lunar Presence', b0: 100, b1: 112 },
    { id: 'tech', name: 'Tech', b0: 112, b1: 120 },
    { id: 'orch', name: 'Orchestration', b0: 120, b1: 136 },
    { id: 'edge', name: 'Edge', b0: 136, b1: 144 },
    { id: 'close', name: 'Close', b0: 144, b1: 164 }
  ];
  const sceneAt = t => { for (const s of SCENES) if (t < B(s.b1)) return s; return SCENES[SCENES.length - 1]; };

  // Every text state, with the beat at which it is fully on screen (used by the verification run).
  const SHOTS = [
    ['open-logo', 5.6], ['open-headline', 11.5],
    ['descent-orbital', 17.9], ['descent-atmosphere', 21.9], ['descent-terrain', 25.9], ['descent-maritime', 29.9], ['descent-subsea', 33.9], ['descent-cyber', 37.9],
    ['mission-1', 46.5], ['mission-2', 58.5], ['mission-3', 70.5], ['mission-4', 82.5], ['mission-5', 94.5], ['mission-6', 106.5],
    ['tech', 115.8], ['orchestration-headline', 123.2], ['orchestration-diagram', 133.2], ['edge', 139.8],
    ['close-domains', 146.4], ['close-logo-tagline', 157.5]
  ].map(([id, b]) => ({ id, beat: b, t: B(b) }));

  // Cue table. `in` is always a whole beat. A cue is fully gone at out + fo.
  const CUES = [];
  const cue = (id, i, o, opt = {}) => CUES.push({ id, beatIn: i, tin: B(i), tout: B(o), fi: opt.fi == null ? 0.4 : opt.fi, fo: opt.fo == null ? 0.4 : opt.fo, group: opt.g || id, kind: opt.k || 'headline' });
  cue('logoA', 3, 6.75, { fi: 0.9, fo: 0.5, k: 'logo' });
  cue('hero', 8, 14.9);
  for (let k = 0; k < 6; k++) cue('d' + k, 16 + 4 * k, 19.1 + 4 * k, { fi: 0.3 });
  for (let m = 1; m <= 6; m++) {
    const b = 40 + 12 * (m - 1);
    cue('m' + m + 'h', b, b + 10.6, { g: 'm' + m });
    cue('m' + m + 's', b + 2, b + 10.6, { g: 'm' + m, k: 'support' });
  }
  cue('techk', 112, 118.7, { g: 'tech', k: 'support' }); cue('techh', 112, 118.7, { g: 'tech' });
  cue('orchk', 120, 125.6, { g: 'orch', k: 'support' }); cue('orchh', 120, 125.6, { g: 'orch' });
  cue('lc', 127, 134.7, { g: 'orchB', k: 'label' }); cue('lr', 129, 134.7, { g: 'orchB', k: 'label' }); cue('la', 131, 134.7, { g: 'orchB', k: 'label' });
  cue('edgek', 136, 142.7, { g: 'edge', k: 'support' }); cue('edgeh', 136, 142.7, { g: 'edge' });
  for (let k = 0; k < 6; k++) cue('z' + k, 144, 147.9, { g: 'closeA', k: 'label' });
  cue('logoB', 152, 160.25, { fi: 0.15, fo: 1.2, g: 'closeB', k: 'logo' });
  cue('tag', 154, 160.25, { fi: 0.5, fo: 1.2, g: 'closeB' });

  /* ---------- the world the camera descends through ---------- */
  const DKEYS = [[0, 4.30], [2, 3.80], [6, 2.25], [10, 0.48], [14, 0.06], [18, -1.20], [22, -2.42], [24, -2.50]];
  const dLin = b => {
    b = clamp(b, 0, 24);
    for (let i = 1; i < DKEYS.length; i++) if (b <= DKEYS[i][0]) { const p = DKEYS[i - 1], q = DKEYS[i]; return lerp(p[1], q[1], (b - p[0]) / (q[0] - p[0])); }
    return DKEYS[DKEYS.length - 1][1];
  };
  const descentCam = s => { const b = s / BEAT, n = 9, w = 1.3; let a = 0; for (let i = 0; i < n; i++) a += dLin(b + (i / (n - 1) * 2 - 1) * w); return a / n; };
  // The same folded-sine ridges and seabed the shader draws.
  const ridgeProfile = (x, k, seed) => { const xx = x * (1 + k * 0.55) + seed + k * 3.71; return 0.50 * (1 - Math.abs(Math.sin(xx * 1.13 + 0.4))) + 0.27 * (1 - Math.abs(Math.sin(xx * 2.71 + 1.9))) + 0.14 * (1 - Math.abs(Math.sin(xx * 5.93 + 0.7))) + 0.09 * (1 - Math.abs(Math.sin(xx * 12.7 + 2.3))); };
  const ridgeH = (sx, k, amp, seed) => amp * (0.78 - 0.2 * k) * (ridgeProfile(sx, k, seed) - 0.12) * sm(-0.75, 0.55, sx + 0.12 * k);
  const landTop = (sx, amp, seed) => Math.max(0, ridgeH(sx, 0, amp, seed), ridgeH(sx, 1, amp, seed), ridgeH(sx, 2, amp, seed));
  const seabed = wx => -2.62 + 0.05 * Math.sin(wx * 2.3 + 0.7) + 0.022 * Math.sin(wx * 6.1 + 2.0);

  /* ---------- shader parameters for every moment of the film ---------- */
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  // The planet with the sun on its limb. k: 0 high orbit, 1 skimming the atmosphere.
  const orbit = (k, t, sunK) => { const R = lerp(2.6, 6.5, Math.pow(k, 1.5)), top = lerp(-0.26, 0.06, k); return { A: [0, top - R, R, 0.5 + 0.012 * t], B: [lerp(0.10, 0.17, k), top + lerp(-0.02, 0.012, sunK), lerp(0.5, 1, sunK), 0.5], C: [...norm3([0.02, lerp(0.03, 0.10, k), -1]), 1] }; };
  const deckP = (b, t) => ({ A: [0, lerp(4.2, -0.4, sm(4.0, 8.0, b)), t * 0.8, -0.30], B: [0, 0, 0, 0], C: [0.035, sm(7.15, 7.95, b), 0, 0] });
  const landPitch = b => b < 12 ? lerp(-0.26, -0.10, sm(8, 12, b)) : lerp(-0.10, -0.02, sm(12, 16, b));
  const landP = b => ({ A: [lerp(3.5, -5.0, sm(8, 15, b)), b < 12 ? lerp(3.2, 1.3, sm(8, 12, b)) : lerp(1.3, 0.05, sm(12, 15.9, b)), 4 + (b - 8) * 1.1, landPitch(b)], B: [0.12, 1.0, 2.4, 0], C: [0.028, 1 - sm(8.0, 9.0, b), -0.25, 0] });
  const seaDepth = b => lerp(0.25, 8.9, sm(15.8, 23.5, b)), seaPitch = b => lerp(0.22, -0.30, sm(16.5, 20.5, b));
  const seaP = b => ({ A: [seaDepth(b), seaPitch(b), 10, sm(19.4, 20.6, b)], B: [lerp(3.3, -3.2, sm(16.3, 20.6, b)), lerp(-0.9, 1.7, sm(16.3, 20.6, b)), 5.6, sm(16.2, 16.8, b) * (1 - sm(20.1, 20.6, b))], C: [1, 0, 0, 0] });
  const Z4 = [0, 0, 0, 0], FLAT = { A: Z4, B: Z4, C: Z4 };
  function shot(id, s, t) {
    const b = s / BEAT;
    switch (id) {
      case 'descent':
        if (b < 4.8) return { m: 1, P: orbit(sm(0, 4.6, b), t, sm(0, 2.5, b)), m2: 2, P2: deckP(b, t), mix: sm(4.0, 4.8, b) };
        if (b < 8) return { m: 2, P: deckP(b, t) };
        if (b < 16.05) return { m: 3, P: landP(b), m2: 4, P2: seaP(b), mix: sm(15.75, 16.05, b) };
        return { m: 4, P: seaP(b) };
      case 'm1': return { m: 3, P: { A: [-2.2, 0.45, s * 0.15, -0.05], B: [0.42, 0.9, 4.3, 0], C: [0.030, 0, 0.05, 0] } };
      case 'm2': return { m: 3, P: { A: [-4.6, 0.85, s * 0.10, 0.05], B: [0.40, 1.5, 9.1, 3.0], C: [0.024, 0, -0.45, 0] } };
      case 'm5': return { m: 1, P: orbit(0.25, t, 1) };
      case 'm6': return { m: 5, P: { A: [0, 1.7, s * 0.25, -0.15], B: [0.25, 0.60, 0.30, 0.045], C: Z4 } };
      case 'edge': return { m: 3, P: { A: [3.6, 3.5, 20 + s * 0.30, -0.24], B: [0.10, 1.0, 15.7, 0], C: [0.026, 0, -0.20, 0] } };
      case 'm3': case 'tech': case 'orch': return { m: 6, P: FLAT };
      case 'm4': return { m: 7, P: FLAT };
      default: return { m: 0, P: FLAT };
    }
  }
  // Where a point in a renderer's world lands on the 1920 by 1080 grid (the inverse of the shader camera).
  const project = (w, pitch) => { const cp = Math.cos(pitch), sp = Math.sin(pitch), y = w[1] * cp - w[2] * sp, z = w[1] * sp + w[2] * cp; return z > 0.05 ? [960 + w[0] * 1.55 / z * 1080, 540 - y * 1.55 / z * 1080, z] : null; };
  const horizonY = pitch => 540 + 1674 * Math.tan(pitch);

  /* ---------- a small spacecraft model for the Tech scene ---------- */
  const MODEL = (() => {
    const V = [], E = [], F = [];
    const box = (x0, y0, z0, x1, y1, z1, tone) => {
      const b = V.length;
      for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) V.push([x, y, z]);
      [[0, 2, 3, 1], [4, 5, 7, 6], [0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3]].forEach(v => F.push({ v: v.map(i => b + i), tone }));
      [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(e => E.push([b + e[0], b + e[1]]));
    };
    const seg = (a, c) => { const b = V.length; V.push(a, c); E.push([b, b + 1]); };
    box(-0.42, -0.52, -0.42, 0.42, 0.52, 0.42, 0);
    for (const d of [-1, 1]) {
      box(d > 0 ? 0.56 : -1.82, -0.30, -0.02, d > 0 ? 1.82 : -0.56, 0.30, 0.02, 1);
      seg([d * 0.42, 0, 0], [d * 0.56, 0, 0]);
      for (const x of [0.98, 1.40]) seg([d * x, -0.30, -0.021], [d * x, 0.30, -0.021]);
    }
    seg([0, -0.52, 0], [0, -0.78, 0]);
    const ring = V.length, n = 14;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; V.push([Math.cos(a) * 0.30, -0.80 - Math.sin(a) * 0.09, Math.sin(a) * 0.28 - 0.05]); }
    for (let i = 0; i < n; i++) E.push([ring + i, ring + (i + 1) % n]);
    F.push({ v: Array.from({ length: n }, (_, i) => ring + i), tone: 0, two: true });
    seg([0, 0.52, 0], [0, 0.84, 0]);
    return { V, E, F };
  })();

  function create(stage) {
    const $ = id => document.getElementById(id);
    const glc = $('gl'), cv = $('fx'), scrim = $('scrim');
    const g = cv.getContext('2d');
    let gl = null, U = {};
    try {
      gl = glc.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (gl) {
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, ASTRION_FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uRes', 'uT', 'uMode', 'uMode2', 'uMix', 'uA', 'uB', 'uC', 'uA2', 'uB2', 'uC2', 'uFx']) U[n] = gl.getUniformLocation(prog, n);
      }
    } catch (e) { gl = null; console.warn('Shader plate unavailable, line work only.', e && e.message); }

    for (const c of CUES) { c.el = $('t-' + c.id); c.card = c.el.closest('.card'); c.o = -1; }
    const logoSrc = $('gate-logo').src; $('t-logoA').src = logoSrc; $('t-logoB').src = logoSrc;

    /* ---------- layout: everything that depends on real text metrics ---------- */
    let W = 0, H = 0, u = 1, S = 1, scale = 1;
    const L = { orch: null, closeY: [], closeGap: [], seamY: 510, edges: new Map() };
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      let w = Math.round(Math.min(stage.clientWidth * dpr, MASTER[0]) * scale); w = Math.max(320, w - w % 2);
      const h = Math.round(w * 9 / 32) * 2;
      for (const c of [cv, glc]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      if (gl) gl.viewport(0, 0, w, h);
      S = w / 1920;
    }
    function layout() {
      const sr = stage.getBoundingClientRect();
      W = sr.width; H = sr.height; u = W / 1920;
      if (!W) return;
      // left scrim edge for each left-aligned card
      const seen = new Set();
      for (const c of CUES) {
        if (!c.card || !c.card.classList.contains('left') || seen.has(c.card)) continue;
        seen.add(c.card);
        let right = 0;
        for (const k of c.card.children) right = Math.max(right, k.getBoundingClientRect().right - sr.left);
        L.edges.set(c.card, clamp((right + 56 * u) / W * 100, 10, 78));
      }
      // orchestration diagram: labels in a right-hand column, planes centred in what is left
      const lab = ['lc', 'lr', 'la'].map(id => $('t-' + id));
      const lw = Math.max(...lab.map(e => e.offsetWidth)), lh = lab[0].offsetHeight;
      const labelLeft = W - 120 * u - lw, areaL = 120 * u, areaR = labelLeft - 72 * u;
      const a = Math.min(0.20 * W, (areaR - areaL) / 2), b = a * 0.40, dy = Math.max(0.215 * H, lh + 60 * u);
      const cx = (areaL + areaR) / 2, cy = 0.5 * H;
      lab.forEach((e, i) => { e.style.left = labelLeft.toFixed(1) + 'px'; e.style.top = (cy + (1 - i) * dy - lh / 2).toFixed(1) + 'px'; });
      L.orch = { cx: cx / u, cy: cy / u, a: a / u, b: b / u, dy: dy / u, lx: labelLeft / u };
      // close: six strata, each named in a gap at the centre of its line
      L.closeY = []; L.closeGap = [];
      for (let k = 0; k < 6; k++) {
        const e = $('t-z' + k), y = H * (0.15 + 0.14 * k), w = e.offsetWidth, h = e.offsetHeight;
        e.style.left = (W / 2 - w / 2).toFixed(1) + 'px'; e.style.top = (y - h / 2).toFixed(1) + 'px';
        L.closeY.push(y / u); L.closeGap.push((w / 2 + 34 * u) / u);
      }
      const lb = $('t-logoB').getBoundingClientRect(), tg = $('t-tag').getBoundingClientRect();
      L.seamY = ((lb.bottom + tg.top) / 2 - sr.top) / u;
      for (const c of CUES) c.o = -1;
    }

    /* ---------- drawing helpers, in 1920 by 1080 design pixels ---------- */
    const rgba = (c, a) => 'rgba(' + c + ',' + clamp(a, 0, 1).toFixed(3) + ')';
    const lw = w => Math.max(1, w * S);
    function line(x1, y1, x2, y2, c, a, w = 1.5) { if (a <= 0.004) return; g.strokeStyle = rgba(c, a); g.lineWidth = lw(w); g.beginPath(); g.moveTo(x1 * S, y1 * S); g.lineTo(x2 * S, y2 * S); g.stroke(); }
    function poly(pts, c, a, w = 1.5, close = false, fill = null, fa = 0) {
      if (pts.length < 2) return;
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0] * S, p[1] * S) : g.moveTo(p[0] * S, p[1] * S)); if (close) g.closePath();
      if (fill && fa > 0.004) { g.fillStyle = rgba(fill, fa); g.fill(); }
      if (a > 0.004) { g.strokeStyle = rgba(c, a); g.lineWidth = lw(w); g.stroke(); }
    }
    function arc(x, y, r, a0, a1, c, a, w = 1.5) { if (a <= 0.004 || r <= 0) return; g.strokeStyle = rgba(c, a); g.lineWidth = lw(w); g.beginPath(); g.arc(x * S, y * S, r * S, a0, a1); g.stroke(); }
    function disc(x, y, r, c, a) { if (a <= 0.004) return; g.fillStyle = rgba(c, a); g.beginPath(); g.arc(x * S, y * S, Math.max(0.7, r * S), 0, TAU); g.fill(); }
    function glow(x, y, r, c, a) {
      if (a <= 0.004 || r <= 0) return;
      const gr = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.25, rgba(c, a * 0.45)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x * S, y * S, r * S, 0, TAU); g.fill();
    }
    function seam(cx, y, hw, a, c = ION) {     // the brand seam line: transparent, ion, transparent
      if (a <= 0.004 || hw <= 1) return;
      const gr = g.createLinearGradient((cx - hw) * S, 0, (cx + hw) * S, 0);
      gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(0.5, rgba(c, 1)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr;
      for (const [hh, al] of [[9, 0.07], [4, 0.14], [1, 0.85]]) { g.globalAlpha = GA * a * al; g.fillRect((cx - hw) * S, (y - hh) * S, 2 * hw * S, Math.max(1, 2 * hh * S)); }
      g.globalAlpha = GA;
    }
    function fadeLine(x1, y1, x2, y2, c, a, w = 1.5) {   // opaque at the first point, gone at the second
      if (a <= 0.004) return;
      const gr = g.createLinearGradient(x1 * S, y1 * S, x2 * S, y2 * S); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
      g.strokeStyle = gr; g.lineWidth = lw(w); g.beginPath(); g.moveTo(x1 * S, y1 * S); g.lineTo(x2 * S, y2 * S); g.stroke();
    }
    const dash = (a, b) => g.setLineDash(a ? [Math.max(1, a * S), Math.max(1, b * S)] : []);
    const qpt = (p0, p1, p2, k) => { const v = 1 - k; return [v * v * p0[0] + 2 * v * k * p1[0] + k * k * p2[0], v * v * p0[1] + 2 * v * k * p1[1] + k * k * p2[1]]; };
    function qcurve(p0, p1, p2, k0, k1, c, a, w = 1.5, n = 30) {
      if (a <= 0.004 || k1 <= k0) return;
      g.strokeStyle = rgba(c, a); g.lineWidth = lw(w); g.beginPath();
      for (let i = 0; i <= n; i++) { const q = qpt(p0, p1, p2, lerp(k0, k1, i / n)); i ? g.lineTo(q[0] * S, q[1] * S) : g.moveTo(q[0] * S, q[1] * S); }
      g.stroke();
    }
    function ring(x, y, r0, r1, k, c, a, w = 1.5) { if (k <= 0 || k >= 1) return; arc(x, y, lerp(r0, r1, ease(k)), 0, TAU, c, a * (1 - k), w); }
    function diamond(x, y, r, c, a, fill = CARBON) { poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], c, a, 1.5, true, fill, a); }
    function glyph(x, y, rot, sc, a, fn) {      // small line-art objects drawn in their own frame
      if (a <= 0.004) return;
      g.save(); g.translate(x * S, y * S); g.rotate(rot); g.scale(sc * S, sc * S);
      g.strokeStyle = rgba(BONE, a); g.fillStyle = rgba(CARBON, a); g.lineWidth = Math.max(1.4, 1 / (sc * S)); g.lineJoin = 'round';
      fn(); g.restore();
    }
    const satellite = (x, y, rot, sc, a) => glyph(x, y, rot, sc, a, () => {
      g.beginPath(); g.rect(-8, -8, 16, 16); g.fill(); g.stroke();
      for (const d of [-1, 1]) {
        const x0 = d > 0 ? 13 : -43;
        g.beginPath(); g.rect(x0, -6, 30, 12); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(d * 8, 0); g.lineTo(d * 13, 0); g.moveTo(x0 + 10, -6); g.lineTo(x0 + 10, 6); g.moveTo(x0 + 20, -6); g.lineTo(x0 + 20, 6); g.stroke();
      }
      g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -15); g.stroke(); g.beginPath(); g.arc(0, -19, 5, PI * 0.1, PI * 0.9); g.stroke();
    });
    const ship = (x, y, sc, a) => glyph(x, y, 0, sc, a, () => {
      g.beginPath(); g.moveTo(-104, 0); g.lineTo(-96, -15); g.lineTo(58, -15); g.lineTo(108, -22); g.lineTo(94, 0); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.rect(-46, -33, 52, 18); g.fill(); g.stroke();
      g.beginPath(); g.rect(-30, -44, 22, 11); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-18, -44); g.lineTo(-18, -70); g.moveTo(-28, -60); g.lineTo(-8, -60); g.moveTo(30, -15); g.lineTo(30, -24); g.lineTo(48, -27); g.stroke();
    });
    const uuv = (x, y, sc, a) => glyph(x, y, 0, sc, a, () => {
      g.beginPath(); g.moveTo(-58, -12); g.lineTo(52, -12); g.arc(52, 0, 12, -PI / 2, PI / 2); g.lineTo(-58, 12); g.quadraticCurveTo(-88, 0, -58, -12); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(56, -12); g.lineTo(72, -24); g.lineTo(72, -6); g.moveTo(56, 12); g.lineTo(72, 24); g.lineTo(72, 6); g.moveTo(-20, -12); g.lineTo(-20, 12); g.moveTo(20, -12); g.lineTo(20, 12); g.stroke();
    });
    const tower = (x, y, h, a) => glyph(x, y, 0, 1, a, () => {
      const w = h * 0.16;
      g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.22, -h); g.lineTo(w * 0.22, -h); g.lineTo(w, 0);
      for (let i = 1; i < 5; i++) { const k = i / 5, ww = lerp(w, w * 0.22, k), w2 = lerp(w, w * 0.22, k + 0.2); g.moveTo(-ww, -h * k); g.lineTo(w2, -h * (k + 0.2)); g.moveTo(ww, -h * k); g.lineTo(-w2, -h * (k + 0.2)); }
      for (const [yy, ww] of [[0.90, 0.36], [0.68, 0.30]]) { g.moveTo(-h * ww, -h * yy); g.lineTo(h * ww, -h * yy); }
      g.stroke();
    });
    let GA = 1;

    /* ---------- scenes: line work ---------- */
    function ovOpen(s) {
      const tp = B(3), k = s - tp;
      glow(960, 540, 10 + 5 * Math.sin(s * 3.2), BONE, 0.30 * sm(0.2, 1.4, s) * (1 - sm(tp - 0.04, tp + 0.05, s)));
      if (k >= 0) {
        const q = clamp(k / 2.4, 0, 1);
        arc(960, 540, 24 + 1050 * ease(q), 0, TAU, ION, 0.55 * (1 - q), 2);
        arc(960, 540, 16 + 640 * ease(q), 0, TAU, BONE, 0.22 * (1 - q), 1.2);
        glow(960, 540, 300 + 240 * k, ION, 0.40 * Math.exp(-k * 1.7));
        glow(960, 540, 90, FLARE, 0.9 * Math.exp(-k * 6));
        const sy = lerp(540, 792, sm(tp + 0.15, tp + 1.5, s));
        seam(960, sy, lerp(160, 1500, sm(tp, tp + 1.3, s)), 0.95 * sm(tp, tp + 0.12, s) * (1 - 0.35 * sm(tp + 1.5, tp + 3, s)));
      }
    }

    // A lit spacecraft, drawn from the same model the Tech scene builds.
    function craft(cx, cy, sc, yaw, pitch, a) {
      if (a <= 0.004) return;
      const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), f = 7;
      const R = MODEL.V.map(([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; });
      const Pp = R.map(([x, y, z]) => { const k = f / (f + z); return [cx + x * sc * k, cy + y * sc * k]; });
      const Ld = [0.25, -0.80, 0.55], faces = [];
      MODEL.F.forEach(fc => {
        const a0 = R[fc.v[0]], a1 = R[fc.v[1]], a2 = R[fc.v[2]];
        const ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2], vx = a2[0] - a0[0], vy = a2[1] - a0[1], vz = a2[2] - a0[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (nz > 0) { if (!fc.two) return; nx = -nx; ny = -ny; nz = -nz; }
        faces.push({ fc, zc: fc.v.reduce((q, i) => q + R[i][2], 0) / fc.v.length, sh: Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]), rim: Math.pow(1 + nz, 3) });
      });
      const ga = g.globalAlpha; g.globalAlpha = ga * a;
      faces.sort((p, q) => q.zc - p.zc).forEach(({ fc, sh, rim }) => {
        const k = 0.16 + 0.84 * sh, col = fc.tone ? [14 + 30 * k + 60 * rim, 30 + 60 * k + 80 * rim, 52 + 100 * k + 110 * rim] : [26 + 210 * k + 90 * rim, 26 + 196 * k + 80 * rim, 30 + 170 * k + 70 * rim];
        poly(fc.v.map(i => Pp[i]), BONE, 0.10 + 0.5 * rim, 1, true, col.map(v => Math.min(255, Math.round(v))).join(','), 1);
      });
      g.globalAlpha = ga;
    }

    function ovDescent(s) {
      const b = s / BEAT;
      if (b < 4.9) {                                    // orbital: a spacecraft crossing the limb
        const a = 1 - sm(4.0, 4.7, b);
        craft(lerp(1720, 1180, b / 4.8), lerp(250, 330, b / 4.8), 86, 0.5 + b * 0.10, 0.42, a);
        craft(lerp(1490, 1660, b / 4.8), lerp(640, 600, b / 4.8), 20, 2.2 - b * 0.06, 0.3, 0.9 * a);
      }
      if (b > 4.2 && b < 7.6) {                         // atmosphere: an aircraft far off, its trail catching the last light
        const k = (b - 4.2) / 3.4, x = lerp(1860, 1120, k), y = lerp(250, 300, k), a = sm(4.2, 5, b) * (1 - sm(7.0, 7.5, b));
        fadeLine(x + 10, y, x + 560, y - 26, '255,214,170', 0.55 * a, 2.2); disc(x, y, 2.6, FLARE, a);
      }
      if (b > 12.4 && b < 16) {                         // maritime: a ship on the horizon
        const hy = horizonY(landPitch(b)), a = sm(12.4, 13.4, b) * (1 - sm(15.5, 15.9, b)), x = 1390 + (b - 12) * 9, sc = lerp(0.42, 0.62, sm(12.4, 15.9, b));
        g.save(); g.globalAlpha = GA * a;
        glyph(x, hy + 1, 0, sc, 1, () => {
          g.fillStyle = 'rgb(6,7,9)'; g.strokeStyle = 'rgba(255,190,140,0.35)';
          g.beginPath(); g.moveTo(-104, 0); g.lineTo(-96, -15); g.lineTo(58, -15); g.lineTo(108, -22); g.lineTo(94, 0); g.closePath(); g.fill();
          g.fillRect(-46, -33, 52, 18); g.fillRect(-30, -44, 22, 11); g.fillRect(-19.2, -70, 2.4, 26); g.fillRect(-28, -61, 20, 2); g.fillRect(29, -24, 2, 9);
          g.beginPath(); g.moveTo(-96, -15); g.lineTo(58, -15); g.lineTo(108, -22); g.stroke();
        });
        disc(x - 18 * sc, hy - 70 * sc, 2.2, '255,220,180', 1); glow(x - 18 * sc, hy - 70 * sc, 14, '255,200,150', 0.5); disc(x + 60 * sc, hy - 18 * sc, 1.6, ION, 1);
        g.restore();
      }
      if (b > 19.2) {                                   // cyber: a lattice lifting off the cable on the seabed
        const dep = seaDepth(b), pit = seaPitch(b), by = -(10 - dep) + 0.06, cx = z => 0.95 + 0.55 * Math.sin(z * 0.33) + 0.2 * Math.sin(z * 0.9 + 1);
        const N = [[3.2, 0.55], [4.6, 1.05], [6.0, 0.70], [7.6, 1.45], [9.4, 0.95], [11.6, 1.70], [5.4, 1.75]].map(([z, h], i) => ({ base: project([cx(z), by, z], pit), top: project([cx(z) + (i % 2 ? 0.5 : -0.35), by + h, z], pit) }));
        const K = [[0, 1], [1, 2], [1, 6], [2, 3], [6, 3], [3, 4], [3, 5], [4, 5]];
        K.forEach(([i, j], n) => { const k = sm(B(20) + n * 0.09, B(20) + n * 0.09 + 0.45, s), p = N[i].top, q = N[j].top; if (p && q) line(p[0], p[1], lerp(p[0], q[0], k), lerp(p[1], q[1], k), ION, 0.55 * k, 1.5); });
        N.forEach((n, i) => {
          if (!n.top || !n.base) return;
          const a = sm(B(19.6) + i * 0.10, B(19.6) + i * 0.10 + 0.4, s), r = clamp(5.5 * 4 / n.top[2], 2.5, 7);
          line(n.top[0], n.top[1], n.base[0], n.base[1], ION, 0.35 * a, 1.3); glow(n.top[0], n.top[1], r * 6, ION, 0.4 * a); disc(n.top[0], n.top[1], r, FLARE, 0.95 * a);
          if (i === 3 || i === 5 || i === 6) fadeLine(n.top[0], n.top[1], n.top[0], n.top[1] - 620, ION, 0.45 * a, 1.3);
        });
      }
    }

    function ovM1(s) {      // layered arcs, autonomous platforms, integrated fires
      const P = [1560, 640], R = [170, 300, 450], b = s / BEAT;
      R.forEach((r, i) => {
        const on = sm(i * 0.6, i * 0.6 + 1, b);
        arc(P[0], P[1], r, PI * 1.02, PI * 1.98, BONE, 0.32 * on, 1.4);
        const sw = PI * (1.06 + 0.86 * ((s * 0.15 + i * 0.31) % 1));
        arc(P[0], P[1], r, sw - 0.18, sw, ION, 0.8 * on, 2.2);
      });
      line(P[0] - 34, P[1], P[0] + 34, P[1], BONE, 0.85, 2); line(P[0], P[1], P[0], P[1] - 34, BONE, 0.85, 1.6); disc(P[0], P[1] - 38, 4.5, ION, 0.95); glow(P[0], P[1] - 38, 22, ION, 0.4);
      const PL = [[0, 1.24], [0, 1.72], [1, 1.36], [1, 1.63], [2, 1.49]];
      const pos = PL.map(([l, a], i) => { const th = PI * (a + 0.03 * Math.sin(s * 0.8 + i * 1.7)); return [P[0] + R[l] * Math.cos(th), P[1] + R[l] * Math.sin(th)]; });
      const mesh = sm(2, 3.5, b);
      dash(7, 9); [[0, 2], [2, 4], [4, 3], [3, 1], [2, 3], [0, 1]].forEach(([i, j]) => line(pos[i][0], pos[i][1], pos[j][0], pos[j][1], BONE, 0.26 * mesh, 1.2)); dash();
      pos.forEach((p, i) => diamond(p[0], p[1], 9, BONE, 0.95 * sm(1 + i * 0.3, 1.8 + i * 0.3, b)));
      [[1.30, 5, P], [1.52, 7, pos[4]], [1.76, 9, pos[3]]].forEach(([a, fb, src], i) => {
        const th = PI * a, tHit = B(fb) + 0.55, rr = t => 700 - 34 * Math.max(0, t - B(2.5));
        const cr = rr(Math.min(s, tHit)), c = [P[0] + cr * Math.cos(th), P[1] + cr * Math.sin(th)];
        const app = sm(B(2.5) + i * 0.25, B(3.3) + i * 0.25, s);
        if (s < tHit) {
          arc(c[0], c[1], 8, 0, TAU, FLARE, 0.95 * app, 1.6);
          fadeLine(c[0], c[1], c[0] + 60 * Math.cos(th), c[1] + 60 * Math.sin(th), FLARE, 0.5 * app, 1.4);
        }
        const k = (s - B(fb)) / 0.55;
        if (k > 0) {
          const hr = rr(tHit), hit = [P[0] + hr * Math.cos(th), P[1] + hr * Math.sin(th)], ctrl = [(src[0] + hit[0]) / 2, Math.min(src[1], hit[1]) - 130];
          qcurve(src, ctrl, hit, 0, clamp(k, 0, 1), ION, 0.95 * (1 - sm(1.2, 3.4, k)), 2.2);
          if (k < 1) { const h = qpt(src, ctrl, hit, k); disc(h[0], h[1], 3.4, FLARE, 1); glow(h[0], h[1], 18, ION, 0.6); }
          ring(hit[0], hit[1], 6, 60, (k - 1) / 1.2, FLARE, 0.95, 2);
        }
      });
    }

    function ovM2(s) {      // radar fan, inbound tracks, intercepts
      const b = s / BEAT, gY = X => 836 - (X - 1230) * 0.07;
      for (const X of [1230, 1385, 1520, 1715]) { g.beginPath(); g.ellipse(X * S, gY(X) * S, 34 * S, 8 * S, 0, 0, TAU); g.strokeStyle = rgba(ION, 0.5); g.lineWidth = lw(1.3); g.stroke(); }
      const rad = [1230, gY(1230)], bm = [1385, gY(1385)], E = [[1520, gY(1520)], [1715, gY(1715)]];
      const rt = [rad[0], rad[1] - 44];
      line(rad[0], rad[1], rad[0], rad[1] - 30, BONE, 0.85, 2);
      poly([[rt[0] - 26, rt[1] + 12], [rt[0] - 12, rt[1] - 22], [rt[0] + 26, rt[1] - 12], [rt[0] + 12, rt[1] + 22]], BONE, 0.9, 1.5, true, CARBON, 0.95);
      [300, 520, 740].forEach((r, i) => arc(rt[0], rt[1], r, -PI * 0.93, -PI * 0.07, BONE, 0.17 * sm(i * 0.5, i * 0.5 + 1, b), 1.1));
      const ph = -PI / 2 + 1.05 * Math.sin(s * 1.25);
      for (let i = 0; i < 9; i++) { const a = ph - Math.sign(Math.cos(s * 1.25)) * i * 0.045; fadeLine(rt[0], rt[1], rt[0] + 800 * Math.cos(a), rt[1] + 800 * Math.sin(a), ION, 0.42 * (1 - i / 9), 1.6); }
      // sensor to battle management to effectors
      const chain = [rad, bm, E[0], E[1]], lk = sm(1, 3, b);
      for (let i = 0; i < 3; i++) { line(chain[i][0], chain[i][1] - 6, chain[i + 1][0], chain[i + 1][1] - 6, ION, 0.45 * lk, 1.3); const k = (s * 0.9 + i * 0.33) % 1; disc(lerp(chain[i][0], chain[i + 1][0], k), lerp(chain[i][1], chain[i + 1][1], k) - 6, 2.6, FLARE, 0.9 * lk); }
      diamond(bm[0], bm[1] - 16, 11, BONE, 0.95);
      E.forEach(e => { poly([[e[0] - 16, e[1]], [e[0] - 16, e[1] - 12], [e[0] + 16, e[1] - 12], [e[0] + 16, e[1]]], BONE, 0.9, 1.5, true, CARBON, 0.95); line(e[0] - 6, e[1] - 12, e[0] + 10, e[1] - 34, BONE, 0.9, 2.2); });
      const TH = [
        [[1900, 150], [1560, 100], [1300, gY(1300)], 6, 0.60, 0],
        [[1830, 30], [1680, 250], [1575, gY(1575)], 8, 0.62, 1],
        [[1130, 50], [1330, 190], [1450, gY(1450)], 10, 0.60, 0]
      ];
      TH.forEach(([p0, p1, p2, hb, q, ei]) => {
        const dur = 5.2, s0 = B(hb) - q * dur, k = clamp((s - s0) / dur, 0, q);
        if (s < s0) return;
        const done = s >= B(hb), fade = 1 - sm(B(hb) + 0.3, B(hb) + 1.6, s);
        dash(10, 9); qcurve(p0, p1, p2, 0, k, FLARE, 0.55 * fade, 1.5); dash();
        const h = qpt(p0, p1, p2, k), ip = qpt(p0, p1, p2, q);
        if (!done) { arc(h[0], h[1], 7, 0, TAU, FLARE, 0.95, 1.6); }
        const e = [E[ei][0] + 10, E[ei][1] - 34], li = (s - (B(hb) - 1.0)) / 1.0;
        if (li > 0) {
          const c = [(e[0] + ip[0]) / 2 + (ei ? 70 : -70), Math.min(e[1], ip[1]) - 60];
          qcurve(e, c, ip, 0, clamp(li, 0, 1), ION, 0.95 * fade, 2.2);
          if (li < 1) { const m = qpt(e, c, ip, li); disc(m[0], m[1], 3.4, FLARE, 1); glow(m[0], m[1], 18, ION, 0.6); }
          ring(ip[0], ip[1], 6, 64, (li - 1) / 1.1, FLARE, 0.95, 2);
          glow(ip[0], ip[1], 70, FLARE, 0.5 * Math.exp(-Math.max(0, li - 1) * 5) * (li > 1 ? 1 : 0));
        }
      });
    }

    // Lit boxes in a simple perspective, far faces first. Each box: [x0, y0, z0, x1, y1, z1, rgb, emissive].
    function solids(boxes, C, sc, yaw, pitch) {
      const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), f = 7, Ld = [-0.45, -0.72, -0.53], faces = [];
      const rot = ([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
      const prj = v => { const k = f / (f + v[2]); return [C[0] + v[0] * sc * k, C[1] + v[1] * sc * k]; };
      for (const bx of boxes) {
        const V = []; for (const z of [bx[2], bx[5]]) for (const y of [bx[1], bx[4]]) for (const x of [bx[0], bx[3]]) V.push(rot([x, y, z]));
        for (const q of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3]]) {
          const a0 = V[q[0]], a1 = V[q[1]], a2 = V[q[2]], ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2], vx = a2[0] - a0[0], vy = a2[1] - a0[1], vz = a2[2] - a0[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          if (nz >= 0) continue;
          faces.push({ pts: q.map(i => prj(V[i])), zc: (V[q[0]][2] + V[q[1]][2] + V[q[2]][2] + V[q[3]][2]) / 4, sh: Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]), bx });
        }
      }
      faces.sort((p, q) => q.zc - p.zc).forEach(({ pts, sh, bx }) => {
        const k = 0.10 + 0.90 * sh, e = bx[7] || 0, col = bx[6].map((v, i) => Math.min(255, Math.round(v * k + e * [35, 206, 240][i])));
        const gr = g.createLinearGradient(pts[0][0] * S, pts[0][1] * S, pts[2][0] * S, pts[2][1] * S);
        gr.addColorStop(0, 'rgb(' + col.map(v => Math.min(255, Math.round(v * 1.18 + 4))).join(',') + ')'); gr.addColorStop(1, 'rgb(' + col.map(v => Math.round(v * 0.72)).join(',') + ')');
        g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0] * S, p[1] * S) : g.moveTo(p[0] * S, p[1] * S)); g.closePath(); g.fillStyle = gr; g.fill();
        g.strokeStyle = rgba(e > 0.05 ? ION : BONE, e > 0.05 ? 0.8 : 0.16); g.lineWidth = lw(1); g.stroke();
      });
      return { rot, prj };
    }

    function ovM3(s) {      // a rugged chassis on the bench: one module is pulled, a fault is found, both are restored
      const C = [1440, 560], b = s / BEAT, sc = 250, yaw = -0.58 + 0.05 * Math.sin(s * 0.5), pitch = 0.30;
      const out = sm(2, 3.6, b) * (1 - sm(6.2, 7.8, b)), fresh = sm(6.2, 7.8, b), fault = sm(4.8, 5.1, b) * (1 - sm(8, 9.2, b));
      // soft pool of light and the reflection of the chassis on the bench
      const pool = g.createRadialGradient(C[0] * S, (C[1] + 215) * S, 0, C[0] * S, (C[1] + 215) * S, 560 * S);
      pool.addColorStop(0, 'rgba(120,140,160,0.16)'); pool.addColorStop(1, 'rgba(120,140,160,0)');
      g.save(); g.translate(0, (C[1] + 215) * S); g.scale(1, 0.24); g.translate(0, -(C[1] + 215) * S); g.fillStyle = pool; g.beginPath(); g.arc(C[0] * S, (C[1] + 215) * S, 560 * S, 0, TAU); g.fill(); g.restore();
      const steel = [74, 80, 88], dark = [30, 33, 38], face = [112, 118, 124], n = 6, w = 0.30, gap = 0.045, x0 = -(n * w + (n - 1) * gap) / 2;
      const boxes = [[-1.16, -0.50, -0.55, 1.16, 0.50, 0.75, dark], [-1.22, -0.56, -0.60, 1.22, -0.50, 0.80, steel], [-1.22, 0.50, -0.60, 1.22, 0.56, 0.80, steel], [-1.22, -0.50, -0.60, -1.16, 0.50, 0.80, steel], [1.16, -0.50, -0.60, 1.22, 0.50, 0.80, steel], [-1.30, 0.56, -0.66, 1.30, 0.60, 0.86, [18, 20, 23]]];
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (w + gap), pull = i === 3 ? 0.95 * out : 0, hot = i === 3 ? Math.max(out > 0.02 ? 0.22 : 0, 0.30 * fresh * (1 - sm(9.5, 11, b))) : 0;
        boxes.push([x, -0.44, -0.62 - pull, x + w, 0.44, -0.55 + (pull > 0 ? 0.35 : 0), face, hot]);
      }
      const M = solids(boxes, C, sc, yaw, pitch);
      for (let i = 0; i < n; i++) {       // faceplate detail: vents, a handle, a status light
        const x = x0 + i * (w + gap), pull = i === 3 ? 0.95 * out : 0, z = -0.621 - pull, P3 = (u, v) => M.prj(M.rot([x + u * w, v, z]));
        for (let j = 0; j < 5; j++) { const a = P3(0.2, -0.30 + j * 0.07), c = P3(0.8, -0.30 + j * 0.07); line(a[0], a[1], c[0], c[1], '8,9,11', 0.75, 2); }
        const h0 = P3(0.3, 0.30), h1 = P3(0.7, 0.30); line(h0[0], h0[1], h1[0], h1[1], BONE, 0.55, 2.4);
        const led = P3(0.5, 0.17), bad = i === 1 && fault > 0.02, lc = bad ? '255,120,90' : ION, la = bad ? 0.55 + 0.45 * Math.sin(s * 20) : 0.95;
        disc(led[0], led[1], 3.4, bad ? '255,170,140' : FLARE, la); glow(led[0], led[1], bad ? 34 : 18, lc, (bad ? 0.75 : 0.45) * la);
        if (bad) for (let j = 0; j < 5; j++) { const v = -0.40 + ((j * 0.19 + Math.floor(s * 14) * 0.13) % 0.5), a = P3(0.15, v), c = P3(0.85, v); line(a[0], a[1], c[0], c[1], '255,150,120', 0.6 * fault, 1.6); }
      }
      // the lifecycle: a marker that keeps turning while the work is done
      const R = 392, ma = -PI / 2 + TAU * (s / B(12));
      g.save(); g.translate(C[0] * S, (C[1] + 20) * S); g.scale(1, 0.42); g.translate(-C[0] * S, -(C[1] + 20) * S);
      for (let i = 0; i < 3; i++) { const a0 = s * 0.10 + i * TAU / 3 + 0.14; arc(C[0], C[1] + 20, R, a0, a0 + TAU / 3 - 0.28, BONE, 0.30 * sm(i * 0.5, i * 0.5 + 1, b), 2.4); }
      arc(C[0], C[1] + 20, R, ma - 0.7, ma, ION, 0.9, 4); disc(C[0] + R * Math.cos(ma), C[1] + 20 + R * Math.sin(ma), 7, FLARE, 1); glow(C[0] + R * Math.cos(ma), C[1] + 20 + R * Math.sin(ma), 40, ION, 0.6);
      g.restore();
    }

    function ovM4(s) {      // a grid in the rain: one span fails, the load reroutes
      const gy = 734, b = s / BEAT, T = [[1230, 280], [1500, 322], [1770, 280]];
      const top = i => [T[i][0], gy - T[i][1]];
      const cat = (p, q, sag, k0, k1, c, a, w) => qcurve(p, [(p[0] + q[0]) / 2, Math.max(p[1], q[1]) + sag * 2], q, k0, k1, c, a, w, 24);
      const hang = (i, lvl, side) => { const t = top(i), h = T[i][1]; return [t[0] + side * h * (lvl ? 0.30 : 0.36), t[1] + h * (lvl ? 0.32 : 0.10)]; };
      const fail = sm(4, 4.15, b), re = sm(5, 6, b);
      g.save(); g.translate(0, 2 * gy * S); g.scale(1, -0.55); g.translate(0, -gy * S * (1 - 1 / 0.55) * 0);   // wet-ground reflection
      g.restore();
      for (let pass = 0; pass < 2; pass++) {
        g.save();
        if (pass === 0) { g.translate(0, gy * S); g.scale(1, -0.5); g.translate(0, -gy * S); g.globalAlpha = GA * 0.16; }
        T.forEach((t, i) => tower(t[0], gy, t[1], 0.9));
        for (let lvl = 0; lvl < 2; lvl++) {
          for (let i = 0; i < 2; i++) {
            const broken = lvl === 0 && i === 1;
            const p = hang(i, lvl, 1), q = hang(i + 1, lvl, -1);
            if (broken && fail > 0) { dash(8, 12); cat(p, q, 26, 0, 1, STEEL, 0.30, 1.2); dash(); }
            else cat(p, q, 26, 0, 1, lvl === 1 && i === 1 ? ION : BONE, lvl === 1 && i === 1 ? lerp(0.42, 0.9, re) : 0.5, lvl === 1 && i === 1 ? lerp(1.3, 2.2, re) : 1.3);
          }
          const a = hang(0, lvl, -1), z = hang(2, lvl, 1);
          fadeLine(a[0], a[1], a[0] - 190, a[1] + 34, BONE, 0.45, 1.3); fadeLine(z[0], z[1], z[0] + 190, z[1] + 34, BONE, 0.45, 1.3);
        }
        const dn = sm(5, 5.6, b); line(hang(1, 0, 1)[0], hang(1, 0, 1)[1], hang(1, 1, 1)[0], lerp(hang(1, 0, 1)[1], hang(1, 1, 1)[1], dn), ION, 0.9 * dn, 2);
        g.restore();
      }
      for (let i = 0; i < 3; i++) {       // energy moving through the upper line, then down and along the lower one
        const k = (s * 0.42 + i / 3) % 1, seg = k < 0.5 ? 0 : 1, kk = (k % 0.5) * 2;
        const lvl = seg === 1 && fail > 0 ? 1 : 0;
        if (seg === 1 && fail > 0 && re < 0.3) continue;
        const p = hang(seg, lvl, 1), q = hang(seg + 1, lvl, -1), m = qpt(p, [(p[0] + q[0]) / 2, Math.max(p[1], q[1]) + 52], q, kk);
        glow(m[0], m[1], 22, ION, 0.7); disc(m[0], m[1], 3, FLARE, 1);
      }
      const mid = qpt(hang(1, 0, 1), [(hang(1, 0, 1)[0] + hang(2, 0, -1)[0]) / 2, hang(1, 0, 1)[1] + 52], hang(2, 0, -1), 0.5);
      ring(mid[0], mid[1], 4, 70, (b - 4) / 2.2, FLARE, 0.95, 2); glow(mid[0], mid[1], 90, FLARE, 0.7 * Math.exp(-Math.max(0, b - 4) * 2.4) * (b > 4 ? 1 : 0));
      const sx = 1500, ok = sm(6, 7, b);
      for (let i = 0; i < 3; i++) poly([[sx - 54 + i * 38, gy - 2], [sx - 54 + i * 38, gy - 34], [sx - 24 + i * 38, gy - 34], [sx - 24 + i * 38, gy - 2]], BONE, 0.7, 1.3, true, CARBON, 0.9);
      disc(sx - 39, gy - 18, 3, ok > 0.5 ? ION : FLARE, b > 4 && ok < 0.5 ? 0.5 + 0.5 * Math.sin(s * 16) : 0.95); glow(sx - 39, gy - 18, 16, ION, 0.5 * ok);
      line(1000, gy, 1910, gy, BONE, 0.26, 1.2);
    }

    function ovM5(s) {      // orbital shells, cross-links, custody of an unknown object
      const o5 = orbit(0.25, 0, 1).A, Rp = o5[2] * 1080, C = [960 + o5[0] * 1080, 540 - o5[1] * 1080], b = s / BEAT, R = [0.10, 0.19, 0.28].map(a => Rp + a * 1080);
      R.forEach((r, i) => arc(C[0], C[1], r, -PI / 2 - 0.36, -PI / 2 + 0.36, BONE, 0.20 * sm(i * 0.5, i * 0.5 + 1.2, b), 1.2));
      const SAT = [[0, 0.070, 0.0100], [0, 0.245, 0.0100], [1, 0.020, -0.0075], [1, 0.200, -0.0075], [2, 0.130, 0.0055], [2, 0.300, 0.0055]];
      const pos = SAT.map(([o, p0, w]) => { const a = -PI / 2 + p0 + w * s; return [C[0] + R[o] * Math.cos(a), C[1] + R[o] * Math.sin(a), a]; });
      const lk = sm(1.5, 3.5, b);
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]);
        if (d < 560) { g.lineDashOffset = -s * 40 * S; dash(6, 10); line(pos[i][0], pos[i][1], pos[j][0], pos[j][1], ION, 0.42 * lk * sm(560, 420, d), 1.3); dash(); g.lineDashOffset = 0; }
      }
      const gs = [C[0] + Rp * Math.sin(0.15), C[1] - Rp * Math.cos(0.15)];
      line(pos[1][0], pos[1][1], gs[0], gs[1], ION, 0.35 * lk, 1.2); line(gs[0] - 14, gs[1] + 3, gs[0] + 14, gs[1] - 3, BONE, 0.8, 2);
      const k = clamp(s / B(12), 0, 1), ob = [lerp(1840, 1150, k), lerp(250, 520, k)];
      const lock = sm(6, 6.6, b), d = lerp(48, 22, lock), col = lock > 0.5 ? ION : FLARE, app = sm(0.5, 1.5, b);
      fadeLine(ob[0], ob[1], ob[0] + 150, ob[1] - 59, FLARE, 0.45 * app, 1.3);
      disc(ob[0], ob[1], 3.6, FLARE, 0.95 * app);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { line(ob[0] + sx * d, ob[1] + sy * d, ob[0] + sx * (d - 12), ob[1] + sy * d, col, 0.95 * app, 1.8); line(ob[0] + sx * d, ob[1] + sy * d, ob[0] + sx * d, ob[1] + sy * (d - 12), col, 0.95 * app, 1.8); }
      ring(ob[0], ob[1], 22, 80, (b - 6) / 2, ION, 0.9, 1.8);
      if (lock > 0) [pos[3], pos[4]].forEach(p => line(p[0], p[1], lerp(p[0], ob[0], lock), lerp(p[1], ob[1], lock), ION, 0.75 * lock, 1.6));
      pos.forEach((p, i) => craft(p[0], p[1], i < 2 ? 30 : i < 4 ? 25 : 21, 0.6 + i * 0.9 + s * 0.05, 0.38, 0.97 * sm(i * 0.25, 0.8 + i * 0.25, b)));
    }

    function ovM6(s) {      // from Earth to a landing ellipse, then a site that stays
      const b = s / BEAT, E = [960 + 0.60 * 1080, 540 - 0.30 * 1080], site = [1370, 862], ctrl = [1150, 330];
      const k = sm(1, 8, b), down = sm(8, 8.4, b);
      dash(9, 9); qcurve(E, ctrl, site, 0.04, 1, BONE, 0.32 * sm(0, 1.2, b), 1.3, 40); dash();
      qcurve(E, ctrl, site, 0.04, Math.max(0.04, k), ION, 0.9, 2, 40);
      dash(6, 8); g.beginPath(); g.ellipse(site[0] * S, site[1] * S, 118 * S, 27 * S, 0, 0, TAU); g.strokeStyle = rgba(down > 0.5 ? ION : BONE, lerp(0.45, 0.9, down)); g.lineWidth = lw(1.5); g.stroke(); dash();
      line(site[0] - 150, site[1], site[0] - 124, site[1], BONE, 0.5, 1.2); line(site[0] + 124, site[1], site[0] + 150, site[1], BONE, 0.5, 1.2);
      for (let i = 0; i < 2; i++) { const q = ((b - 8) / 3 + i * 0.5) % 1; if (b > 8) { g.beginPath(); g.ellipse(site[0] * S, site[1] * S, lerp(30, 220, q) * S, lerp(7, 50, q) * S, 0, 0, TAU); g.strokeStyle = rgba(ION, 0.6 * (1 - q)); g.lineWidth = lw(1.4); g.stroke(); } }
      const p = qpt(E, ctrl, site, Math.max(0.04, k)), ly = p[1] - 16;
      poly([[p[0] - 12, ly + 8], [p[0] - 7, ly - 10], [p[0] + 7, ly - 10], [p[0] + 12, ly + 8]], BONE, 0.95, 1.6, true, CARBON, 0.95);
      line(p[0] - 12, ly + 8, p[0] - 19, ly + 16, BONE, 0.95, 1.6); line(p[0] + 12, ly + 8, p[0] + 19, ly + 16, BONE, 0.95, 1.6);
      if (k < 1 && k > 0.02) { fadeLine(p[0], ly + 10, p[0], ly + 34 + 8 * Math.sin(s * 30), FLARE, 0.9, 3); glow(p[0], ly + 14, 20, ION, 0.5); }
      const up = sm(8.6, 10, b);
      if (up > 0) {
        const hab = [site[0] - 96, site[1] + 6], mast = [site[0] + 92, site[1] + 2], rov = [site[0] + 176, site[1] - 6];
        line(hab[0], hab[1], mast[0], mast[1], BONE, 0.4 * up, 1.2); line(mast[0], mast[1], rov[0], rov[1], BONE, 0.4 * up, 1.2);
        g.beginPath(); g.arc(hab[0] * S, hab[1] * S, 20 * S, PI, TAU); g.closePath(); g.fillStyle = rgba(CARBON, 0.95 * up); g.fill(); g.strokeStyle = rgba(BONE, 0.9 * up); g.lineWidth = lw(1.5); g.stroke();
        line(mast[0], mast[1], mast[0], mast[1] - 52 * up, BONE, 0.9 * up, 1.8); disc(mast[0], mast[1] - 52 * up, 3, ION, up);
        poly([[rov[0] - 12, rov[1]], [rov[0] - 12, rov[1] - 10], [rov[0] + 12, rov[1] - 10], [rov[0] + 12, rov[1]]], BONE, 0.9 * up, 1.4, true, CARBON, 0.95 * up);
        const mt = [mast[0], mast[1] - 52];
        dash(3, 11); line(mt[0], mt[1], lerp(mt[0], E[0], up), lerp(mt[1], E[1], up), ION, 0.6 * up, 1.4); dash();
        for (let i = 0; i < 3; i++) { const q = (s * 0.5 + i / 3) % 1; disc(lerp(mt[0], E[0], q), lerp(mt[1], E[1], q), 2.6, FLARE, 0.9 * up * sm(10, 10.8, b)); }
      }
    }

    function ovTech(s) {    // a seam sweeps across: wireframe model on one side, working system on the other
      const b = s / BEAT, C = [1490, 548], sc = 204, yaw = -0.62 + s * 0.20, pitch = 0.36;
      const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), f = 6;
      const R = MODEL.V.map(([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; });
      const Pp = R.map(([x, y, z]) => { const k = f / (f + z); return [C[0] + x * sc * k, C[1] + y * sc * k]; });
      const seamX = lerp(1050, 1860, sm(1, 6.6, b)), top = 170, bot = 920;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(C[0] * S, (C[1] + 250) * S, (150 + i * 95) * S, (26 + i * 17) * S, 0, 0, TAU); g.strokeStyle = rgba(BONE, 0.13 - i * 0.02); g.lineWidth = lw(1); g.stroke(); }
      g.save(); g.beginPath(); g.rect(seamX * S, 0, cv.width, cv.height); g.clip();          // not yet built: the digital model
      dash(4, 7); MODEL.E.forEach(([i, j]) => line(Pp[i][0], Pp[i][1], Pp[j][0], Pp[j][1], ION, 0.75, 1.3)); dash();
      Pp.forEach(p => disc(p[0], p[1], 2.2, ION, 0.8));
      g.restore();
      g.save(); g.beginPath(); g.rect(0, 0, seamX * S, cv.height); g.clip();                  // behind the seam: the working system
      const Ld = [-0.50, -0.68, -0.54], faces = [];
      MODEL.F.forEach(fc => {
        const [a0, a1, a2] = [R[fc.v[0]], R[fc.v[1]], R[fc.v[2]]];
        const ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2], vx = a2[0] - a0[0], vy = a2[1] - a0[1], vz = a2[2] - a0[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (nz > 0) { if (!fc.two) return; nx = -nx; ny = -ny; nz = -nz; }
        const zc = fc.v.reduce((q, i) => q + R[i][2], 0) / fc.v.length;
        faces.push({ fc, zc, sh: Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]) });
      });
      faces.sort((p, q) => q.zc - p.zc).forEach(({ fc, sh }) => {
        const k = 0.16 + 0.84 * sh, col = fc.tone ? [18 + 30 * k, 44 + 70 * k, 58 + 92 * k] : [34 + 190 * k, 36 + 188 * k, 40 + 180 * k];
        poly(fc.v.map(i => Pp[i]), BONE, 0.55, 1.2, true, col.map(Math.round).join(','), 1);
      });
      MODEL.E.forEach(([i, j]) => { if (i >= 24 && i < 40) line(Pp[i][0], Pp[i][1], Pp[j][0], Pp[j][1], BONE, 0.5, 1.2); });
      g.restore();
      const sa2 = sm(0.6, 1.2, b) * (1 - sm(6.6, 7.4, b));
      const gr = g.createLinearGradient(0, top * S, 0, bot * S); gr.addColorStop(0, rgba(ION, 0)); gr.addColorStop(0.5, rgba(ION, 1)); gr.addColorStop(1, rgba(ION, 0));
      g.fillStyle = gr;
      for (const [hw, al] of [[10, 0.07], [4, 0.16], [1, 0.9]]) { g.globalAlpha = GA * sa2 * al; g.fillRect((seamX - hw) * S, top * S, Math.max(1, 2 * hw * S), (bot - top) * S); }
      g.globalAlpha = GA;
    }

    function ovOrch(s) {    // first the idea, then the three planes
      const b = s / BEAT, A = 1 - sm(5.5, 6.4, b);
      if (A > 0.004) {                                 // technology changes above a line that does not
        g.globalAlpha = GA * A;
        const x0 = 1215, sw = 124, gp = 34, by = 640, sh = 150;
        line(1180, by, 1850, by, BONE, 0.9, 2.4); line(1180, by - 9, 1180, by + 9, BONE, 0.9, 2); line(1850, by - 9, 1850, by + 9, BONE, 0.9, 2);
        const px = lerp(1180, 1850, (s * 0.34) % 1); glow(px, by, 26, ION, 0.7); disc(px, by, 3.4, FLARE, 1);
        const SW = [[1, 1], [3, 2.5], [0, 4]];
        for (let i = 0; i < 4; i++) {
          const x = x0 + i * (sw + gp), ev = SW.find(e => e[0] === i);
          const go = ev ? sm(ev[1], ev[1] + 0.9, b) : 0, come = ev ? sm(ev[1] + 0.7, ev[1] + 1.6, b) : 0;
          const box = (dy, c, a, fa) => poly([[x, by - sh + dy], [x + sw, by - sh + dy], [x + sw, by - 4 + dy], [x, by - 4 + dy]], c, a, 1.6, true, c, fa);
          if (go < 1) { box(-150 * go, BONE, 0.8 * (1 - go), 0.06 * (1 - go)); for (let j = 0; j < 3; j++) line(x + 16, by - sh + 26 + j * 20 - 150 * go, x + sw - 16, by - sh + 26 + j * 20 - 150 * go, BONE, 0.3 * (1 - go), 1.2); }
          if (come > 0) { box(-150 * (1 - come), ION, 0.95 * come, 0.12 * come); line(x + 16, by - sh + 30 - 150 * (1 - come), x + sw - 16, by - 30 - 150 * (1 - come), ION, 0.4 * come, 1.2); line(x + sw - 16, by - sh + 30 - 150 * (1 - come), x + 16, by - 30 - 150 * (1 - come), ION, 0.4 * come, 1.2); }
        }
        g.globalAlpha = GA;
      }
      const o = L.orch; if (!o || b < 6.6) return;
      const out = 1 - sm(14.7, 15.4, b), pa = i => sm(7 + 2 * i, 7.9 + 2 * i, b) * out, py = i => o.cy + (1 - i) * o.dy + 34 * (1 - sm(7 + 2 * i, 8.2 + 2 * i, b));
      const active = b < 9 ? 0 : b < 11 ? 1 : 2, a = o.a, bb = o.b;
      const plane = i => {
        const al = pa(i), y = py(i); if (al <= 0.004) return;
        const pts = [[o.cx - a, y], [o.cx, y - bb], [o.cx + a, y], [o.cx, y + bb]], hot = i === active;
        poly(pts, hot ? ION : BONE, (hot ? 0.95 : 0.6) * al, hot ? 2 : 1.4, true, hot ? '13,24,30' : CARBON, 0.93 * al);
        for (let j = 1; j < 4; j++) { const k = j / 4; line(lerp(o.cx - a, o.cx, k), lerp(y, y - bb, k), lerp(o.cx, o.cx + a, k), lerp(y + bb, y, k), BONE, 0.13 * al, 1); line(lerp(o.cx - a, o.cx, k), lerp(y, y + bb, k), lerp(o.cx, o.cx + a, k), lerp(y - bb, y, k), BONE, 0.13 * al, 1); }
        const n1 = [o.cx - a * 0.38, y - bb * 0.06], n2 = [o.cx + a * 0.34, y + bb * 0.10];
        line(n1[0], n1[1], n2[0], n2[1], hot ? ION : BONE, 0.5 * al, 1.3); disc(n1[0], n1[1], 5, hot ? ION : BONE, 0.95 * al); disc(n2[0], n2[1], 5, hot ? ION : BONE, 0.95 * al);
        line(o.cx + a + 10, y, o.lx - 22, y, BONE, 0.4 * al, 1.2);
      };
      const riser = i => {                             // flow from plane i up to plane i + 1
        const al = pa(i + 1); if (al <= 0.004) return;
        [-0.44, 0, 0.44].forEach((fx, n) => {
          const x = o.cx + a * fx, y0 = py(i) - bb * (1 - Math.abs(fx)) * 0.0, y1 = py(i + 1) + bb * (1 - Math.abs(fx));
          line(x, y0, x, y1, ION, 0.55 * al, 1.6);
          const k = (s * 0.9 + n * 0.31) % 1; disc(x, lerp(y0, y1, k), 3, FLARE, al);
        });
      };
      plane(0); riser(0); plane(1); riser(1); plane(2);
    }

    function ovEdge(s) {    // information arriving at the operator over links that come and go
      const b = s / BEAT, gY = X => 800 - (X - 1245) * 0.04;
      for (const X of [1500, 1245, 1840]) { g.beginPath(); g.ellipse(X * S, (gY(X) + (X === 1500 ? 0 : -3)) * S, 30 * S, 7 * S, 0, 0, TAU); g.strokeStyle = rgba(ION, 0.45); g.lineWidth = lw(1.2); g.stroke(); }
      const O = [1500, gY(1500) - 22], mast = [1548, gY(1548)];
      line(mast[0], mast[1], mast[0], mast[1] - 150, BONE, 0.85, 2); line(mast[0] - 14, mast[1] - 128, mast[0] + 14, mast[1] - 128, BONE, 0.85, 1.6); line(mast[0] - 9, mast[1] - 108, mast[0] + 9, mast[1] - 108, BONE, 0.85, 1.6);
      for (let i = 0; i < 3; i++) { const k = (s * 0.45 + i / 3) % 1; arc(mast[0], mast[1] - 150, 26 + 150 * k, -PI * 0.80, -PI * 0.20, ION, 0.45 * (1 - k), 1.3); }
      const N = [[1265, 300, 0], [1760, 250, 0], [1245, gY(1245) - 12, 1], [1840, gY(1840) - 12, 1], [1640, 440, 0]];
      const DOWN = [null, [3, 5], null, [5.4, 7], null];
      let hits = 0;
      N.forEach((n, i) => {
        const dn = DOWN[i] ? sm(DOWN[i][0], DOWN[i][0] + 0.3, b) * (1 - sm(DOWN[i][1], DOWN[i][1] + 0.4, b)) : 0, app = sm(i * 0.3, 0.9 + i * 0.3, b);
        dash(dn > 0.5 ? 3 : 12, dn > 0.5 ? 16 : 9); line(n[0], n[1], O[0], O[1], dn > 0.5 ? STEEL : ION, lerp(0.5, 0.22, dn) * app, 1.4); dash();
        if (n[2]) poly([[n[0] - 9, n[1] - 9], [n[0] + 9, n[1] - 9], [n[0] + 9, n[1] + 9], [n[0] - 9, n[1] + 9]], BONE, 0.95 * app, 1.5, true, CARBON, 0.95 * app); else diamond(n[0], n[1], 10, BONE, 0.95 * app);
        if (dn < 0.5) for (let j = 0; j < 2; j++) {
          const k = (s * (0.36 + i * 0.05) + i * 0.23 + j * 0.5) % 1; disc(lerp(n[0], O[0], k), lerp(n[1], O[1], k), 3, FLARE, app); glow(lerp(n[0], O[0], k), lerp(n[1], O[1], k), 14, ION, 0.5 * app);
          hits = Math.max(hits, sm(0.86, 1, k));
        }
      });
      arc(O[0], O[1], 28 + 16 * hits, 0, TAU, ION, 0.9 - 0.3 * hits, 2); arc(O[0], O[1], 54, 0, TAU, ION, 0.25, 1.2);
      glow(O[0], O[1], 70, ION, 0.25 + 0.3 * hits); disc(O[0], O[1], 6.5, FLARE, 1);
    }

    function ovClose(s) {   // six strata fall into one seam; the seam becomes the logo
      const b = s / BEAT, c = clamp((b - 4.6) / 3.4, 0, 1), cv2 = Math.pow(c, 2.4), hit = b >= 8, sy = L.seamY;
      if (!hit) {
        for (let k = 0; k < 6; k++) {
          const y = lerp(L.closeY[k], sy, cv2), ext = sm(0, 1.6, b + 0.0) * 860, gap = L.closeGap[k] * (1 - sm(0.02, 0.32, c));
          const a = 0.42 + 0.5 * cv2;
          for (const d of [-1, 1]) {
            const x0 = 960 + d * gap, x1 = 960 + d * Math.max(gap, ext);
            fadeLine(x0, y, x1, y, BONE, a, 1.4 + 1.2 * cv2);
            fadeLine(x0, y, x0 + d * 150, y, ION, 0.9 * (0.5 + 0.5 * cv2), 1.8 + 1.4 * cv2);
            if (gap > 2) line(x0, y - 7, x0, y + 7, ION, 0.9 * (1 - sm(0.02, 0.3, c)), 1.6);
          }
        }
        glow(960, sy, 240 * cv2, ION, 0.5 * cv2);
      } else {
        const k = s - B(8), out = 1 - sm(B(16.25), B(16.25) + 1.2, s);
        seam(960, sy, lerp(1900, 470, sm(0, 1.6, k)), (0.55 + 0.45 * Math.exp(-k * 1.4)) * out);
        glow(960, sy, 520, FLARE, 0.75 * Math.exp(-k * 4.5));
        glow(960, sy, 900, ION, 0.35 * Math.exp(-k * 1.6));
        arc(960, sy, 30 + 900 * ease(clamp(k / 1.8, 0, 1)), 0, TAU, ION, 0.5 * (1 - clamp(k / 1.8, 0, 1)), 2);
      }
    }
    const OV = { open: ovOpen, descent: ovDescent, m1: ovM1, m2: ovM2, m3: ovM3, m4: ovM4, m5: ovM5, m6: ovM6, tech: ovTech, orch: ovOrch, edge: ovEdge, close: ovClose };

    /* ---------- type ---------- */
    let maskA = 0, maskEdge = 40;
    function text(t) {
      let sa = 0, sc = null;
      for (const c of CUES) {
        const o = sm(c.tin, c.tin + c.fi, t) * (1 - sm(c.tout, c.tout + c.fo, t));
        if (o !== c.o) {
          c.o = o;
          const st = c.el.style;
          st.opacity = o.toFixed(3); st.visibility = o > 0.001 ? 'visible' : 'hidden';
          if (c.kind === 'logo') {
            const w = c.id === 'logoA' ? sm(c.tin + 0.15, c.tin + 1.5, t) : sm(c.tin + 0.05, c.tin + 1.1, t);
            st.clipPath = w >= 1 ? 'none' : 'inset(0 ' + ((1 - w) * 74.2).toFixed(2) + '% 0 0)';
          } else st.transform = o > 0.001 && o < 1 ? 'translate3d(0,' + ((1 - sm(c.tin, c.tin + c.fi + 0.2, t)) * 16 * u).toFixed(2) + 'px,0)' : 'none';
        }
        if (o > sa && c.card && L.edges.has(c.card)) { sa = o; sc = c.card; }
      }
      if (sc) { maskEdge = L.edges.get(sc); stage.style.setProperty('--se', maskEdge.toFixed(2) + '%'); }
      maskA = sa; scrim.style.opacity = sa.toFixed(3);
    }

    /* ---------- one frame ---------- */
    function plate(t, sc, s, dur) {
      const cut = sc.id === 'open' ? 0 : 0.085 * Math.exp(-s / 0.09), q = shot(sc.id, s, t), P = q.P, P2 = q.P2 || FLAT;
      let fade = 1 - 0.30 * sm(dur - 0.26, dur, s), flash = cut;
      const exp = 1 + 0.25 * Math.exp(-s / 0.22);
      if (sc.id === 'descent') fade *= sm(0, 0.5, s);
      if (sc.id === 'close') { const k = s - B(8); flash = k >= 0 ? 0.42 * Math.exp(-k / 0.16) : 0; fade = 1; }
      gl.uniform2f(U.uRes, glc.width, glc.height); gl.uniform1f(U.uT, t);
      gl.uniform1f(U.uMode, q.m); gl.uniform1f(U.uMode2, q.m2 || 0); gl.uniform1f(U.uMix, q.mix || 0);
      gl.uniform4fv(U.uA, P.A); gl.uniform4fv(U.uB, P.B); gl.uniform4fv(U.uC, P.C);
      gl.uniform4fv(U.uA2, P2.A); gl.uniform4fv(U.uB2, P2.B); gl.uniform4fv(U.uC2, P2.C);
      gl.uniform4f(U.uFx, fade, flash, 0.02, exp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function draw(t, opt = {}) {
      t = clamp(t, 0, DUR);
      if (!W) layout();
      size();
      const sc = sceneAt(t), s = t - B(sc.b0), dur = B(sc.b1 - sc.b0);
      text(t);
      if (!opt.textOnly) {
        if (gl) plate(t, sc, s, dur);
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
        g.lineCap = 'round'; g.setLineDash([]);
        GA = sc.id === 'open' || sc.id === 'close' ? 1 : sm(0, 0.22, s) * (1 - sm(dur - 0.24, dur - 0.02, s));
        g.globalAlpha = GA;
        OV[sc.id](s, dur, t);
        g.setLineDash([]);
        if (maskA > 0.004) {                         // keep line work out of the text block
          const x0 = maskEdge / 100 * cv.width, x1 = x0 + 0.08 * cv.width, gr = g.createLinearGradient(x0, 0, x1, 0);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.globalCompositeOperation = 'destination-out'; g.globalAlpha = maskA; g.fillStyle = gr; g.fillRect(0, 0, x1, cv.height);
          g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = 1;
      }
    }

    /* ---------- what the verification run reads ---------- */
    function boxes() {
      const sr = stage.getBoundingClientRect(), out = [];
      const add = (id, kind, group, el, o) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); out.push({ id, kind, group, opacity: +o.toFixed(3), x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height, fontPx: parseFloat(cs.fontSize), text: (el.textContent || '').trim().replace(/\s+/g, ' ') }); };
      for (const c of CUES) if (c.o > 0.01) add(c.id, c.kind, c.group, c.el, c.o);
      add('watermark', 'watermark', 'watermark', $('wm'), parseFloat(getComputedStyle($('wm')).opacity));
      return { stage: { w: sr.width, h: sr.height, u: sr.width / 1920 }, canvas: [cv.width, cv.height], boxes: out };
    }
    return { draw, layout, boxes, setScale: v => { scale = v; }, getScale: () => scale, hasGL: () => !!gl };
  }

  const fonts = () => document.fonts && document.fonts.load ? Promise.all(['800 78% 40px Archivo', '400 40px Archivo', '500 40px Archivo', '500 40px "JetBrains Mono"'].map(f => document.fonts.load(f, 'ASTRION 105').catch(() => null))) : Promise.resolve();
  return { BPM, BEAT, BEATS, DUR, MASTER, SCENES, SHOTS, CUES, B, create, fonts };
})();
