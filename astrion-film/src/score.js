/* The score: D minor at 105 beats a minute, synthesised in the Web Audio API.
   No samples and no audio files. It is scheduled in beats from the same grid as the picture,
   so every cut and every text entrance lands on a beat, and it is exactly as long as the film. */
const AstrionScore = (() => {
  'use strict';
  const { BEAT, BEATS, DUR, B } = AstrionFilm;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const hz = n => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); return 440 * Math.pow(2, (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) - 9 + (+m[3] - 4) * 12) / 12); };
  const notes = s => s.split(' ').map(hz);

  // Harmony. One root per mission scene, a rising ostinato cell for each.
  const MISSION = [
    { root: 'D2', sub: 'D1', pad: 'D2 A2 D3 F3 A3', cell: 'D3 A3 D4 A3 F3 A3 D4 A3' },
    { root: 'Bb1', sub: 'Bb0', pad: 'Bb1 F2 Bb2 D3 F3', cell: 'F3 Bb3 D4 Bb3 F3 Bb3 F4 Bb3' },
    { root: 'F2', sub: 'F1', pad: 'F2 C3 F3 A3 C4', cell: 'A3 C4 F4 C4 A3 C4 F4 C4' },
    { root: 'C2', sub: 'C1', pad: 'C2 G2 C3 E3 G3', cell: 'C4 E4 G4 E4 C4 E4 G4 E4' },
    { root: 'G1', sub: 'G1', pad: 'G1 D2 G2 Bb2 D3', cell: 'D4 G4 Bb4 G4 D4 G4 Bb4 G4' },
    { root: 'A1', sub: 'A1', pad: 'A1 E2 A2 C#3 E3', cell: 'E4 A4 C#5 A4 E4 A4 E5 A4' }
  ];
  const DESCENT = [
    ['D2', 'D2 A2 D3 F3 A3'], ['C2', 'C2 G2 C3 E3 G3'], ['Bb1', 'Bb1 F2 Bb2 D3 F3'],
    ['A1', 'A1 E2 A2 D3 E3'], ['G1', 'G1 D2 G2 Bb2 D3'], ['A1', 'A1 E2 A2 C#3 E3']
  ];
  const DESCENT_HITS = [[0], [0, 3.5], [0, 2, 3.5], [0, 2, 3, 3.5], [0, 1.5, 2, 3, 3.5], [0, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75]];
  // Beats on which a major cut lands and a braam is struck: [beat, root, weight]
  const BRAAMS = [[16, 'D2', 1], [40, 'D2', 1], [52, 'Bb1', 0.95], [64, 'F2', 0.95], [76, 'C2', 0.95], [88, 'G1', 1], [100, 'A1', 1], [112, 'D2', 0.85], [120, 'Bb1', 0.85], [136, 'A1', 0.95], [144, 'D2', 1]];
  const CUT_BEATS = [16, 40, 52, 64, 76, 88, 100, 112, 120, 136, 144, 152];
  const MIX = 0.47;                                 // pre-gain into the master bus

  function build(ctx, dest, T0 = 0, from = 0) {
    const at = t => Math.max(0, T0 + t - from);
    const sr = ctx.sampleRate;
    const P = p => ({ set: (v, t) => p.setValueAtTime(v, at(t)), lin: (v, t) => p.linearRampToValueAtTime(v, at(t)), exp: (v, t) => p.exponentialRampToValueAtTime(Math.max(v, 1e-4), at(t)) });
    const gain = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const shaper = k => { const n = ctx.createWaveShaper(), c = new Float32Array(1024), d = Math.tanh(k); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(k * (i / 511.5 - 1)) / d; n.curve = c; return n; };

    /* master bus: sum, glue compressor, limiter, soft ceiling. Nothing can leave above the ceiling. */
    const out = gain(0.94), ceiling = shaper(1.25); ceiling.oversample = '4x';
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.10;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -13; comp.knee.value = 9; comp.ratio.value = 2.4; comp.attack.value = 0.020; comp.release.value = 0.25;
    const rumble = filt('highpass', 24, 0.7), mix = gain(MIX);
    mix.connect(rumble); rumble.connect(comp); comp.connect(lim); lim.connect(ceiling); ceiling.connect(out); out.connect(dest);
    { const G = P(out.gain); G.set(0.94, DUR - 1.4); G.lin(0, DUR - 0.03); }
    const dry = gain(1), low = gain(0.78);            // low: sub and bass, kept mono and out of the reverb
    dry.connect(mix); low.connect(mix);
    /* reverb: a generated impulse response (decaying filtered noise), fed through a high-pass so the low end stays clean */
    const irLen = Math.floor(sr * 4.8), ir = ctx.createBuffer(2, irLen, sr);
    let seed = 20261110; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < irLen; i++) { const t = i / sr; lp += (rnd() - lp) * (0.5 * Math.exp(-t * 0.9) + 0.07); d[i] = lp * Math.exp(-t * 1.25) * (t < 0.015 ? t / 0.015 : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const send = gain(1), sendHP = filt('highpass', 230, 0.7), wet = gain(0.72);
    send.connect(sendHP); sendHP.connect(conv); conv.connect(wet); wet.connect(mix);
    const nb = ctx.createBuffer(2, sr * 2, sr);
    for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd(); }
    const noise = (t0, t1) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(at(t0), (t0 * 0.37) % 1.9); s.stop(at(t1)); return s; };
    const tone = (type, f, t0, t1, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.start(at(t0)); o.stop(at(t1)); return o; };
    const pan = v => { const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
    const toBus = (node, d, rv) => { if (d) { const a = gain(d); node.connect(a); a.connect(dry); } if (rv) { const b = gain(rv); node.connect(b); b.connect(send); } };
    const hit = t => t >= from - 0.02;             // percussive events that began before a seek point are not replayed

    /* ---- instruments. Each call is queued and only built a few seconds before it sounds,
       so the graph stays small however long the score is. ---- */
    const Q = []; let qi = 0, sorted = true;
    const defer = (fn, ti = 0) => (...a) => { Q.push([a[ti], () => fn(...a)]); sorted = false; };
    function pump(until) {
      for (;;) {
        if (!sorted) { const rest = Q.splice(qi); rest.sort((x, y) => x[0] - y[0]); for (const e of rest) Q.push(e); sorted = true; }
        if (qi >= Q.length || Q[qi][0] > until) break;
        Q[qi++][1]();
      }
    }
    function rawPad(freqs, t0, t1, peak, atk, rel, c0, c1, rv = 0.5) {
      if (t1 <= from) return;
      const g = gain(0), f = filt('lowpass', c0, 0.5), hp = filt('highpass', 110, 0.5), G = P(g.gain), F = P(f.frequency);
      G.set(0, t0); G.lin(peak, t0 + atk); G.set(peak, Math.max(t0 + atk, t1 - rel)); G.lin(0, t1);
      F.set(c0, t0); F.lin(c1, t1);
      freqs.forEach((fr, k) => [-9, 0, 8].forEach(det => { const o = tone('sawtooth', fr, t0, t1 + 0.05, det + (k % 2 ? 3 : -3)), og = gain(1 / (freqs.length * 3)), p = pan(det / 14); o.connect(og); og.connect(p); p.connect(f); }));
      f.connect(hp); hp.connect(g); toBus(g, 1, rv);
    }
    function rawBraam(t, f, weight = 1, len = 3.4) {   // stacked detuned saws, fast attack, long release
      if (!hit(t)) return;
      const g = gain(0), lp = filt('lowpass', 150, 1.2), drive = shaper(2.4), pre = gain(0.5), G = P(g.gain), F = P(lp.frequency);
      F.set(150, t); F.exp(3800, t + 0.06); F.exp(1350, t + 0.55); F.exp(320, t + len);
      G.set(0, t); G.lin(0.72 * weight, t + 0.016); G.lin(0.54 * weight, t + 0.5); G.exp(0.0006, t + len);
      [[1, 1], [2, 0.62], [1.4983, 0.40], [3, 0.22], [4, 0.12]].forEach(([m, a]) => [-14, 0, 11].forEach(det => {
        const o = tone('sawtooth', f * m, t, t + len + 0.05, det), og = gain(a / 3), p = pan(det / 22), D = P(o.detune);
        D.set(det - 55, t); D.lin(det, t + 0.14);
        o.connect(og); og.connect(p); p.connect(pre);
      }));
      pre.connect(drive); drive.connect(lp); lp.connect(g); toBus(g, 1, 0.42);
      const so = tone('sine', f / 2 < 30 ? f : f / 2, t, t + len * 0.7), sg = gain(0), SG = P(sg.gain);
      SG.set(0, t); SG.lin(0.50 * weight, t + 0.02); SG.exp(0.0006, t + len * 0.68);
      so.connect(sg); sg.connect(low);
      const n = noise(t, t + 0.3), nf = filt('lowpass', 1400, 0.7), ng = gain(0), NG = P(ng.gain);
      NG.set(0.30 * weight, t); NG.exp(0.0006, t + 0.26); n.connect(nf); nf.connect(ng); toBus(ng, 1, 0.3);
    }
    function rawTaiko(t, g0, f0 = 92, f1 = 43, len = 0.6, rv = 0.14) {   // pitched sine drop and a filtered noise skin
      if (!hit(t)) return;
      const o = ctx.createOscillator(), g = gain(0), G = P(g.gain), F = P(o.frequency);
      o.type = 'sine'; F.set(f0 * 1.9, t); F.exp(f0, t + 0.014); F.exp(f1, t + 0.20);
      G.set(0, t); G.lin(g0, t + 0.003); G.exp(0.0006, t + len);
      o.start(at(t)); o.stop(at(t + len + 0.05)); o.connect(g); g.connect(low); if (rv) { const r = gain(rv); g.connect(r); r.connect(send); }
      const o2 = ctx.createOscillator(), g2 = gain(0), G2 = P(g2.gain), F2 = P(o2.frequency);
      o2.type = 'triangle'; F2.set(f0 * 3.4, t); F2.exp(f0 * 2, t + 0.012); F2.exp(f1 * 2, t + 0.16);
      G2.set(0, t); G2.lin(g0 * 0.42, t + 0.003); G2.exp(0.0006, t + len * 0.55);
      o2.start(at(t)); o2.stop(at(t + len * 0.6)); o2.connect(g2); toBus(g2, 1, rv);
      const n = noise(t, t + 0.2), bp = filt('bandpass', f0 * 2.4, 0.9), lp = filt('lowpass', 3200, 0.5), ng = gain(0), NG = P(ng.gain);
      NG.set(g0 * 0.85, t); NG.exp(0.0006, t + 0.11);
      n.connect(bp); bp.connect(lp); lp.connect(ng); toBus(ng, 1, rv * 1.6);
    }
    function rawTick(t, g0) {                          // rim of the drum
      if (!hit(t)) return;
      const n = noise(t, t + 0.06), bp = filt('bandpass', 2600, 2.5), ng = gain(0), NG = P(ng.gain);
      NG.set(g0, t); NG.exp(0.0006, t + 0.045); n.connect(bp); bp.connect(ng); toBus(ng, 1, 0.12);
    }
    function rawOst(t, f, g0, cut, len = 0.22, pn = 0) {   // short bowed-string stroke
      if (!hit(t)) return;
      const g = gain(0), lp = filt('lowpass', cut, 1.4), hp = filt('highpass', 150, 0.6), p = pan(pn), G = P(g.gain), F = P(lp.frequency);
      F.set(cut * 1.7, t); F.exp(cut * 0.55, t + len);
      G.set(0, t); G.lin(g0, t + 0.007); G.exp(g0 * 0.42, t + len * 0.45); G.exp(0.0006, t + len);
      [[1, -7, 0.5], [1, 7, 0.5], [0.5, 0, 0.42]].forEach(([m, det, a]) => { const o = tone('sawtooth', f * m, t, t + len + 0.03, det), og = gain(a); o.connect(og); og.connect(lp); });
      lp.connect(hp); hp.connect(g); g.connect(p); toBus(p, 1, 0.26);
    }
    function rawBass(t, f, g0, len = 0.24) {
      if (!hit(t)) return;
      const g = gain(0), lp = filt('lowpass', 420, 0.9), G = P(g.gain), F = P(lp.frequency);
      F.set(950, t); F.exp(260, t + len);
      G.set(0, t); G.lin(g0, t + 0.006); G.exp(0.0006, t + len);
      const o = tone('sawtooth', f, t, t + len + 0.03), s = tone('sine', f, t, t + len + 0.03), sg = gain(0.55);
      o.connect(lp); s.connect(sg); sg.connect(lp); lp.connect(g); g.connect(low);
    }
    function rawSub(t, f0, f1, len, g0) {
      if (!hit(t)) return;
      const o = ctx.createOscillator(), g = gain(0), G = P(g.gain), F = P(o.frequency);
      o.type = 'sine'; F.set(f0, t); F.exp(f1, t + len * 0.6);
      G.set(0, t); G.lin(g0, t + 0.012); G.exp(0.0006, t + len);
      o.start(at(t)); o.stop(at(t + len + 0.05)); o.connect(g); g.connect(low);
    }
    function rawWash(t0, t1, type, f0, f1, q, g0, g1, rv = 0.3, tail = 0.02) {   // filtered noise, rising or falling
      if (t1 + tail <= from) return;
      const n = noise(t0, t1 + tail + 0.05), f = filt(type, f0, q), g = gain(0), G = P(g.gain), F = P(f.frequency);
      F.set(f0, t0); F.exp(f1, t1);
      G.set(Math.max(g0, 0.0006), t0); G.exp(Math.max(g1, 0.0006), t1); G.lin(0, t1 + tail);
      n.connect(f); f.connect(g); toBus(g, 1, rv);
    }
    function rawRiser(t0, t1, g0) {                    // noise sweep, a cluster gliding up, and a tremolo that tightens
      if (t1 <= from) return;
      rawWash(t0, t1, 'bandpass', 260, 7200, 1.3, 0.004, g0 * 0.55, 0.35);
      const g = gain(0), lp = filt('lowpass', 300, 0.8), G = P(g.gain), F = P(lp.frequency);
      F.set(300, t0); F.exp(4200, t1);
      G.set(0.0006, t0); G.exp(g0 * 0.32, t1); G.lin(0, t1 + 0.02);
      [hz('D3'), hz('A3'), hz('D4')].forEach((f, i) => [-10, 9].forEach(det => { const o = tone('sawtooth', f, t0, t1 + 0.05, det), og = gain(0.22), D = P(o.frequency); D.set(f, t0); D.exp(f * 2, t1); o.connect(og); og.connect(lp); }));
      const trem = gain(1), lfo = ctx.createOscillator(), lg = gain(0.45), LF = P(lfo.frequency);
      lfo.type = 'triangle'; LF.set(3.5, t0); LF.exp(28, t1); lfo.start(at(t0)); lfo.stop(at(t1 + 0.05)); lfo.connect(lg); lg.connect(trem.gain);
      lp.connect(trem); trem.connect(g); toBus(g, 1, 0.4);
    }
    function rawBell(t, f, g0, len = 3) {
      if (!hit(t)) return;
      [[1, 1, len], [2.01, 0.3, len * 0.5], [3.02, 0.1, len * 0.3]].forEach(([m, a, d]) => { const o = tone('sine', f * m, t, t + d + 0.05), g = gain(0), G = P(g.gain); G.set(0, t); G.lin(g0 * a, t + 0.004); G.exp(0.0006, t + d); o.connect(g); toBus(g, 0.5, 1); });
    }
    const pad = defer(rawPad, 1), braam = defer(rawBraam), taiko = defer(rawTaiko), tick = defer(rawTick), ost = defer(rawOst), bass = defer(rawBass), sub = defer(rawSub), wash = defer(rawWash), riser = defer(rawRiser), bell = defer(rawBell);
    const drumLo = (t, g) => taiko(t, g, 92, 43, 0.62);
    const drumMid = (t, g) => taiko(t, g, 150, 78, 0.34, 0.1);
    function drums(b0, level, opt = {}) {           // one bar of the driving pattern, in sixteenths
      const lo = opt.lo || [1, 0, 0, 0, 0, 0, 0.62, 0, 0.86, 0, 0, 0, 0, 0, 0.62, 0];
      const mid = opt.mid || [0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0.42, 0.55, 0, 0, 0, 0.5];
      for (let i = 0; i < 16; i++) {
        const t = B(b0 + i / 4);
        if (lo[i]) drumLo(t, 0.72 * level * lo[i]);
        if (mid[i]) drumMid(t, 0.62 * level * mid[i]);
        if (opt.ticks && (opt.ticks === 16 || i % 2 === 0)) tick(t, (i % 4 === 0 ? 0.24 : 0.14) * level);
      }
      if (opt.fill) for (let i = 0; i < 4; i++) drumMid(B(b0 + 3 + i / 4), (0.34 + 0.16 * i) * level);
    }
    function strings(b0, cell, g0, cut, sixteenths) {   // one bar of ostinato
      for (let i = 0; i < 8; i++) {
        ost(B(b0 + i / 2), cell[i], g0 * (i % 2 ? 0.82 : 1) * (i === 0 ? 1.2 : 1), cut, 0.23, i % 2 ? 0.28 : -0.28);
        if (sixteenths) ost(B(b0 + i / 2 + 0.25), cell[i] * 2, g0 * 0.42, cut * 1.25, 0.13, i % 2 ? -0.4 : 0.4);
      }
    }
    function bassBar(b0, f, g0) { for (let i = 0; i < 8; i++) bass(B(b0 + i / 2), i === 3 || i === 7 ? f * 2 : f, g0 * (i % 4 === 0 ? 1.15 : i % 2 ? 0.7 : 0.9)); }

    /* ---- foundation: a sub drone on D under the whole film ---- */
    {
      const o1 = tone('sine', hz('D1'), 0, DUR), o2 = tone('sine', hz('D2'), 0, DUR), o3 = tone('sawtooth', hz('D2'), 0, DUR, 6);
      const g = gain(0), g2 = gain(0.42), g3 = gain(0.16), lp = filt('lowpass', 130, 0.6), G = P(g.gain);
      G.set(0, 0); G.lin(0.04, B(3)); G.lin(0.10, B(8)); G.lin(0.12, B(16)); G.set(0.11, B(16.2)); G.lin(0.09, B(40)); G.set(0.06, B(40.1)); G.set(0.06, B(112));
      G.lin(0.07, B(136)); G.lin(0.10, B(144)); G.lin(0.17, B(151.9)); G.set(0.0006, B(151.94)); G.lin(0.19, B(152.05)); G.lin(0.11, B(156)); G.lin(0, B(163.4));
      o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(lp); lp.connect(g3); g3.connect(g); g.connect(low);
    }

    /* ---- cold open: slow swell, one pulse, then the headline ---- */
    pad(notes('D2 A2 D3 F3'), 0, B(16.6), 0.085, B(7), 0.5, 170, 620, 0.6);
    pad(notes('A3 D4 F4'), B(8), B(16.6), 0.035, B(3), 0.4, 500, 1300, 0.9);
    wash(B(1.6), B(3), 'bandpass', 180, 1500, 0.9, 0.004, 0.16, 0.5);
    sub(B(3), 74, 31, 2.6, 0.95); drumLo(B(3), 0.55); bell(B(3), hz('D5'), 0.05, 3.6); bell(B(3.5), hz('A5'), 0.022, 3);
    wash(B(3), B(5.5), 'lowpass', 1600, 140, 0.5, 0.22, 0.001, 0.5);
    braam(B(8), hz('D2'), 0.62, 3.6); drumLo(B(8), 0.6);
    [12, 14, 15, 15.5].forEach((b, i) => drumLo(B(b), 0.28 + 0.09 * i));
    wash(B(14), B(16), 'bandpass', 300, 4200, 1.1, 0.004, 0.20, 0.4);

    /* ---- every major cut ---- */
    BRAAMS.forEach(([b, n, w]) => { braam(B(b), hz(n), w); drumLo(B(b), 0.95); drumMid(B(b), 0.5); wash(B(b), B(b) + 1.8, 'highpass', 4600, 3000, 0.5, 0.22 * w, 0.001, 0.4); });

    /* ---- domain descent: sparse hits, a bass line that walks down ---- */
    DESCENT.forEach(([root, chord], k) => {
      const b0 = 16 + 4 * k;
      pad(notes(chord), B(b0), B(b0 + 4.25), 0.125, 0.5, 0.5, 420 + 60 * k, 900 + 110 * k, 0.55);
      sub(B(b0), hz(root) * 1.02, hz(root), 2.0, 0.42);
      DESCENT_HITS[k].forEach((off, i) => { if (off === 0) { if (k) drumLo(B(b0), 0.86); } else if (off % 1 === 0) drumLo(B(b0 + off), 0.44 + 0.03 * k); else drumMid(B(b0 + off), 0.30 + 0.035 * k + 0.02 * i); });
    });
    wash(B(38), B(40), 'bandpass', 300, 5200, 1.2, 0.004, 0.22, 0.4);

    /* ---- six missions: driving drums, the ostinato climbing a step each scene ---- */
    MISSION.forEach((m, k) => {
      const b0 = 40 + 12 * k, cell = notes(m.cell), root = hz(m.root), lvl = 0.86 + 0.028 * k;
      pad(notes(m.pad), B(b0), B(b0 + 12.2), 0.115, 0.25, 0.5, 700 + 90 * k, 1100 + 130 * k, 0.5);
      for (let j = 0; j < 3; j++) {
        const bb = b0 + 4 * j;
        drums(bb, lvl, { ticks: k >= 3 ? 16 : k >= 1 ? 8 : 0, fill: j === 2 });
        strings(bb, cell, 0.27 + 0.015 * k, 2300 + 320 * k, k >= 3);
        bassBar(bb, root * (root < 52 ? 2 : 1), 0.36);
      }
      sub(B(b0), root * (root < 52 ? 2 : 1), root * (root < 52 ? 2 : 1) * 0.98, 1.6, 0.36);
    });
    [5, 7, 9].forEach(b => drumMid(B(40 + b), 0.5));                 // integrated fires
    [6, 8, 10].forEach(b => drumMid(B(52 + b), 0.5));                // intercepts
    drumMid(B(76 + 4), 0.6); wash(B(76 + 4), B(76 + 4) + 0.5, 'highpass', 4000, 6000, 0.6, 0.10, 0.001, 0.3);   // the span fails
    bell(B(88 + 6), hz('D6'), 0.04, 2.4);                            // custody lock
    sub(B(100 + 8), 70, 34, 1.6, 0.6);                               // touchdown

    /* ---- how Astrion works ---- */
    {
      const dm = notes('D4 A4 D5 A4 F4 A4 D5 A4'), bb = notes('F4 Bb4 D5 Bb4 F4 Bb4 F5 Bb4'), cc = notes('G4 C5 E5 C5 G4 C5 G5 C5'), aa = notes('A4 E5 A5 E5 C#5 E5 A5 E5');
      pad(notes('D2 A2 D3 F3 A3'), B(112), B(120.2), 0.08, 0.25, 0.5, 900, 1500, 0.5);       // Tech: half time
      for (let j = 0; j < 2; j++) { const b0 = 112 + 4 * j; drums(b0, 0.8, { lo: [1, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0], mid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.6], ticks: 8, fill: j === 1 }); strings(b0, dm, 0.22, 3300, false); bassBar(b0, hz('D2'), 0.24); }
      pad(notes('Bb1 F2 Bb2 D3 F3'), B(120), B(128.2), 0.08, 0.25, 0.5, 900, 1500, 0.5);     // Orchestration: builds plane by plane
      pad(notes('C2 G2 C3 E3 G3'), B(128), B(136.2), 0.09, 0.25, 0.5, 1100, 1900, 0.5);
      for (let j = 0; j < 4; j++) { const b0 = 120 + 4 * j; drums(b0, 0.78 + 0.06 * j, { ticks: j >= 2 ? 16 : 8, fill: j === 3, lo: j < 2 ? [1, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0.6, 0] : undefined }); strings(b0, j < 2 ? bb : cc, 0.24 + 0.02 * j, 3300 + 220 * j, j >= 2); bassBar(b0, j < 2 ? hz('Bb1') : hz('C2'), 0.27); }
      [[127, 'Bb2'], [129, 'D3'], [131, 'F3']].forEach(([b, n]) => { braam(B(b), hz(n), 0.42, 1.5); drumLo(B(b), 0.7); });
      pad(notes('A1 E2 A2 C#3 E3'), B(136), B(144.2), 0.095, 0.25, 0.4, 1300, 2400, 0.5);    // Edge: full weight, sixteenths
      for (let j = 0; j < 2; j++) { const b0 = 136 + 4 * j; drums(b0, 1, { ticks: 16, fill: true }); strings(b0, aa, 0.30, 4200, true); bassBar(b0, hz('A1'), 0.30); }
      wash(B(140), B(144), 'bandpass', 300, 6000, 1.2, 0.004, 0.24, 0.4);
    }

    /* ---- close: riser, one full-weight hit on the logo, a long tail ---- */
    pad(notes('D2 A2 D3'), B(144), B(151.95), 0.07, 0.4, 0.04, 500, 2600, 0.5);
    [144.0, 146, 148].forEach(b => drumLo(B(b), 0.8));
    for (let i = 0; i < 4; i++) drumMid(B(148 + i / 2), 0.30 + 0.03 * i);
    for (let i = 0; i < 8; i++) drumMid(B(150 + i / 4), 0.40 + 0.03 * i);
    for (let i = 0; i < 7; i++) drumMid(B(151 + i / 8), 0.62 + 0.04 * i);
    riser(B(146), B(151.93), 0.9);
    {
      const t = B(152);
      braam(t, hz('D2'), 1.5, 7.2); braam(t, hz('D1'), 0.7, 6);
      drumLo(t, 1.25); taiko(t, 1.0, 64, 30, 1.6, 0.3); drumMid(t, 0.8);
      sub(t, 66, 27, 4.2, 1.15);
      wash(t, t + 4.5, 'highpass', 2400, 1500, 0.5, 0.26, 0.001, 0.7);
      wash(t, t + 1.2, 'lowpass', 2600, 160, 0.5, 0.5, 0.001, 0.5);
      pad(notes('D2 A2 D3 F3 A3 E4'), t + 0.2, B(163.6), 0.13, 2.2, 5.0, 2400, 420, 0.8);
      pad(notes('D4 A4'), B(154), B(163.6), 0.03, 1.5, 4.5, 1500, 600, 1);
      drumLo(B(154), 0.5); bell(B(154), hz('A4'), 0.035, 4); bell(B(156), hz('D5'), 0.026, 4.5);
    }
    return { pump, events: () => Q.length };
  }

  const AHEAD = 3;                                  // seconds of score built ahead of the playhead
  /* Offline: render the whole score, used to check length, level and the beat grid. */
  async function render(sampleRate = 48000) {
    const ctx = new OfflineAudioContext(2, Math.round(sampleRate * DUR), sampleRate);
    const sc = build(ctx, ctx.destination);
    sc.pump(AHEAD);
    for (let k = 1; k * 2 < DUR; k++) ctx.suspend(k * 2).then(() => { sc.pump(k * 2 + AHEAD); ctx.resume(); });
    return ctx.startRendering();
  }
  function analyse(buf) {
    const sr = buf.sampleRate, a = buf.getChannelData(0), b = buf.getChannelData(1), n = buf.length;
    let peak = 0, over = 0, sum = 0;
    for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(a[i]), Math.abs(b[i])); if (m > peak) peak = m; if (m >= 0.999) over++; sum += a[i] * a[i] + b[i] * b[i]; }
    const rms = (t0, t1) => { let e = 0, c = 0; for (let i = Math.max(0, Math.floor(t0 * sr)); i < Math.min(n, Math.floor(t1 * sr)); i++) { e += a[i] * a[i] + b[i] * b[i]; c += 2; } return c ? Math.sqrt(e / c) : 0; };
    const db = v => Math.round(200 * Math.log10(v + 1e-9)) / 10;
    const bars = []; for (let k = 0; k < BEATS / 4; k++) bars.push(db(rms(B(4 * k), B(4 * k + 4))));
    // low end: energy below roughly 120 Hz through a one-pole low-pass, against the whole
    let lp = 0, le = 0; const kf = 1 - Math.exp(-2 * Math.PI * 120 / sr); for (let i = 0; i < n; i++) { lp += ((a[i] + b[i]) * 0.5 - lp) * kf; le += lp * lp; }
    const cuts = CUT_BEATS.map(cb => { const t = B(cb), pre = rms(t - 0.13, t - 0.01), post = rms(t, t + 0.12); return { beat: cb, t: +t.toFixed(3), preDb: db(pre), postDb: db(post), jumpDb: +(db(post) - db(pre)).toFixed(1) }; });
    let l1 = 0, l2 = 0, eL = 0, eM = 0, eH = 0; const kh = 1 - Math.exp(-2 * Math.PI * 2000 / sr);
    for (let i = 0; i < n; i++) { const x = (a[i] + b[i]) * 0.5; l1 += (x - l1) * kf; l2 += (x - l2) * kh; eL += l1 * l1; eM += (l2 - l1) * (l2 - l1); eH += (x - l2) * (x - l2); }
    const bands = { lowBelow120HzDb: db(Math.sqrt(eL / n)), mid120To2000HzDb: db(Math.sqrt(eM / n)), highAbove2000HzDb: db(Math.sqrt(eH / n)) };
    return { bands, seconds: n / sr, samples: n, sampleRate: sr, peak: +peak.toFixed(4), peakDb: db(peak), samplesAtCeiling: over, rmsDb: db(Math.sqrt(sum / (2 * n))), lowShareDb: db(Math.sqrt(le / n)) - db(Math.sqrt(sum / (2 * n))), lastQuarterSecondDb: db(rms(n / sr - 0.25, n / sr)), last50msDb: db(rms(n / sr - 0.05, n / sr)), tailAt90sDb: db(rms(90, 91)), barsDb: bars, cuts };
  }
  /* Live: the same score from film time `from`. The audio clock is the film clock. */
  function live(from, level) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'playback' });
    const master = ctx.createGain(); master.gain.value = level;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    master.connect(analyser); analyser.connect(ctx.destination);
    const T0 = ctx.currentTime + 0.25;
    const sc = build(ctx, master, T0, from);
    sc.pump(from + AHEAD);
    const timer = setInterval(() => sc.pump(ctx.currentTime - T0 + from + AHEAD), 200);
    const lag = () => Math.min(0.25, ctx.outputLatency || ctx.baseLatency || 0);
    const data = new Float32Array(analyser.fftSize); let off = null;
    return {
      ctx, master, T0, from,
      // The context clock only advances once per audio callback, which would make the picture step.
      // So film time runs on the performance clock, pulled gently toward the audio output timestamp:
      // motion is even from frame to frame, and picture and sound still cannot drift apart.
      time: () => {
        if (ctx.state !== 'running') { off = null; return ctx.currentTime - T0 + from - lag(); }
        const now = performance.now() / 1000; let a = ctx.currentTime - T0 + from - lag();
        if (ctx.getOutputTimestamp) { const o = ctx.getOutputTimestamp(); if (o && o.performanceTime > 0) a = o.contextTime + Math.min(0.25, Math.max(0, now - o.performanceTime / 1000)) - T0 + from; }
        const target = a - now;
        if (off === null || Math.abs(target - off) > 0.08) off = target; else off += (target - off) * 0.02;
        return now + off;
      },
      level: () => { analyser.getFloatTimeDomainData(data); let e = 0; for (let i = 0; i < data.length; i++) e += data[i] * data[i]; return Math.sqrt(e / data.length); },
      stop: () => { clearInterval(timer); try { ctx.close(); } catch (e) { /* already closed */ } }
    };
  }
  return { DUR, build, render, analyse, live, CUT_BEATS };
})();
