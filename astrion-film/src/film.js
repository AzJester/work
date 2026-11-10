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
  cue('logoA', 3, 6.6, { fi: 1.2, fo: 0.7, k: 'logo' });
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
  cue('logoB', 152, 160.25, { fi: 1.0, fo: 1.2, g: 'closeB', k: 'logo' });
  cue('tag', 154, 160.25, { fi: 0.5, fo: 1.2, g: 'closeB' });

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
  // What the shader draws at scene time s. P: camera and light. D, E: the scene's object and its clock.
  function shot(id, s, t, L) {
    const b = s / BEAT;
    switch (id) {
      case 'descent':
        if (b < 4.8) return { m: 1, P: orbit(sm(0, 4.6, b), t, sm(0, 2.5, b)), m2: 2, P2: deckP(b, t), mix: sm(4.0, 4.8, b), D: [lerp(0.60, 0.22, b / 4.8), lerp(0.19, 0.12, b / 4.8), 0.105, 0.5 + b * 0.10], E: [b, 0, 0.42, 1 - sm(3.9, 4.6, b)] };
        if (b < 8) return { m: 2, P: deckP(b, t) };
        if (b < 16.05) return { m: 3, P: landP(b), m2: 4, P2: seaP(b), mix: sm(15.75, 16.05, b), D: [-1.2 + 0.05 * (b - 12), 0, 19, 0.25], E: [b, b > 11 ? 3 : 0, 0, 0] };
        return { m: 4, P: seaP(b) };
      case 'm1': return { m: 3, P: { A: [-2.2, 0.45, s * 0.15, -0.05], B: [0.15, 0.9, 4.3, 0], C: [0.030, 0, -0.35, 0] }, D: [-1.35, 0, 4.9 + s * 0.15, 0.3], E: [b, 1, 0, 0] };
      case 'm2': return { m: 3, P: { A: [-4.6, 0.85, s * 0.10, 0.05], B: [0.25, 1.5, 9.1, 3.0], C: [0.024, 0, -1.40, 0] }, D: [-0.91, 0, 6.8, -2.07], E: [b, 2, 0, 0] };
      case 'm3': return { m: 6, P: FLAT, E: [b, 1, 0, 0] };
      case 'm4': return { m: 7, P: FLAT, E: [b, 0, 0, 0] };
      case 'm5': return { m: 1, P: orbit(0.25, t, 1), D: [0.44 - 0.035 * b / 12, 0.13 + 0.02 * b / 12, 0.135, 0.6 + s * 0.06], E: [b, 0, 0.40, sm(0, 0.8, b)] };
      case 'm6': return { m: 5, P: { A: [0, 1.7, s * 0.25, -0.15], B: [0.25, 0.60, 0.30, 0.045], C: Z4 }, D: [3.6, 5 * Math.pow(1 - clamp((b - 1) / 7, 0, 1), 2.2), 6.8, 1], E: [b, 0, 0, 0] };
      case 'tech': return { m: 6, P: FLAT, E: [b, 2, 0, 0] };
      case 'orch': { const o = L.orch || { cx: 1100, cy: 540, dy: 230, a: 380 }; return { m: 6, P: FLAT, D: [(o.cx - 960) / 1080, (540 - o.cy) / 1080, o.dy / 1080, o.a / 1080], E: [b, 3, 0, 0] }; }
      case 'edge': return { m: 3, P: { A: [3.6, 3.5, 20 + s * 0.30, -0.24], B: [0.10, 1.0, 15.7, 0], C: [0.026, 0, -0.20, 0] }, D: [5.9, 0, 27.8, 0.4], E: [b, 4, 0, 0] };
      case 'close':
        if (b < 8) return { m: 8, P: { A: [Math.pow(clamp((b - 4.6) / 3.4, 0, 1), 2.4), 0.5 - L.seamY / 1080, t, sm(0, 1.2, b)], B: [sm(0, 0.7, b) * (1 - sm(3.9, 4.6, b)), 0, 0, 0], C: Z4 } };
        return { m: 0, P: FLAT };
      default: return { m: 0, P: FLAT };
    }
  }
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
        for (const n of ['uRes', 'uT', 'uMode', 'uMode2', 'uMix', 'uA', 'uB', 'uC', 'uA2', 'uB2', 'uC2', 'uD', 'uE', 'uFx']) U[n] = gl.getUniformLocation(prog, n);
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

    /* ---------- light drawn over the picture: only the pulse of the open and the seam of the close ---------- */
    const rgba = (c, a) => 'rgba(' + c + ',' + clamp(a, 0, 1).toFixed(3) + ')';
    const lw = w => Math.max(1, w * S);
    let GA = 1;
    function arc(x, y, r, a0, a1, c, a, w = 1.5) { if (a <= 0.004 || r <= 0) return; g.strokeStyle = rgba(c, a); g.lineWidth = lw(w); g.beginPath(); g.arc(x * S, y * S, r * S, a0, a1); g.stroke(); }
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
    function ovOpen(s) {
      const tp = B(3), k = s - tp;
      glow(960, 540, 10 + 5 * Math.sin(s * 3.2), BONE, 0.30 * sm(0.2, 1.4, s) * (1 - sm(tp - 0.04, tp + 0.05, s)));
      if (k >= 0) {
        const q = clamp(k / 2.6, 0, 1);
        arc(960, 540, 24 + 1050 * ease(q), 0, TAU, ION, 0.50 * (1 - q) * (1 - q), 2);
        glow(960, 540, 300 + 240 * k, ION, 0.36 * Math.exp(-k * 1.5));
        glow(960, 540, 90, FLARE, 0.9 * Math.exp(-k * 5));
        seam(960, lerp(540, 792, sm(tp + 0.15, tp + 1.9, s)), lerp(160, 1500, sm(tp, tp + 1.6, s)), 0.95 * sm(tp, tp + 0.2, s) * (1 - 0.35 * sm(tp + 1.5, tp + 3, s)));
      }
    }
    function ovClose(s) {   // after the six strips have fallen into one seam
      const k = s - B(8); if (k < 0) return;
      const out = 1 - sm(B(16.25), B(16.25) + 1.2, s), sy = L.seamY;
      seam(960, sy, lerp(1900, 470, sm(0, 1.8, k)), (0.55 + 0.45 * Math.exp(-k * 1.3)) * out);
      glow(960, sy, 520, FLARE, 0.70 * Math.exp(-k * 4));
      glow(960, sy, 900, ION, 0.32 * Math.exp(-k * 1.5));
    }
    const OV = { open: ovOpen, close: ovClose };

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
            const w = sm(c.tin, c.tin + 1.9, t), life = clamp((t - c.tin) / (c.tout + c.fo - c.tin), 0, 1);
            const m = 'linear-gradient(90deg,#000 ' + (w * 150 - 50).toFixed(2) + '%,rgba(0,0,0,0) ' + (w * 150).toFixed(2) + '%)';
            st.webkitMaskImage = m; st.maskImage = m;
            st.transform = 'translate3d(0,0,0) scale(' + (0.972 + 0.050 * life).toFixed(5) + ')';
          } else st.transform = o > 0.001 && o < 1 ? 'translate3d(0,' + ((1 - sm(c.tin, c.tin + c.fi + 0.2, t)) * 16 * u).toFixed(2) + 'px,0)' : 'none';
        }
        if (o > sa && c.card && L.edges.has(c.card)) { sa = o; sc = c.card; }
      }
      if (sc) { maskEdge = L.edges.get(sc); stage.style.setProperty('--se', maskEdge.toFixed(2) + '%'); }
      maskA = sa; scrim.style.opacity = sa.toFixed(3);
    }

    /* ---------- one frame ---------- */
    function plate(t, sc, s, dur) {
      const cut = sc.id === 'open' ? 0 : 0.085 * Math.exp(-s / 0.09), q = shot(sc.id, s, t, L), P = q.P, P2 = q.P2 || FLAT;
      let fade = 1 - 0.30 * sm(dur - 0.26, dur, s), flash = cut;
      const exp = 1 + 0.25 * Math.exp(-s / 0.22);
      if (sc.id === 'descent') fade *= sm(0, 0.5, s);
      if (sc.id === 'close') { const k = s - B(8); flash = k >= 0 ? 0.42 * Math.exp(-k / 0.16) : 0; fade = 1; }
      gl.uniform2f(U.uRes, glc.width, glc.height); gl.uniform1f(U.uT, t);
      gl.uniform1f(U.uMode, q.m); gl.uniform1f(U.uMode2, q.m2 || 0); gl.uniform1f(U.uMix, q.mix || 0);
      gl.uniform4fv(U.uA, P.A); gl.uniform4fv(U.uB, P.B); gl.uniform4fv(U.uC, P.C);
      gl.uniform4fv(U.uA2, P2.A); gl.uniform4fv(U.uB2, P2.B); gl.uniform4fv(U.uC2, P2.C);
      gl.uniform4fv(U.uD, q.D || Z4); gl.uniform4fv(U.uE, q.E || Z4);
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
        if (OV[sc.id]) OV[sc.id](s, dur, t);
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
