/* Astrion · Agentic AI. Scroll choreography, the data globe and small interactions. No network requests. */
(() => {
  "use strict";
  const doc = document, root = doc.documentElement, body = doc.body;
  const $ = (s, r = doc) => r.querySelector(s);
  const $$ = (s, r = doc) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const RM = root.classList.contains("rm");
  const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const state = { paused: false, ready: false };

  /* One shared frame loop. A ticker returns true while it still needs frames. */
  const tickers = new Set();
  let raf = 0;
  function frame(now) { raf = 0; let again = false; tickers.forEach(fn => { if (fn(now)) again = true; }); if (again) request(); }
  function request() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ---------- The data globe ---------- */
  const Globe = (() => {
    const ION = "35,206,240", FLARE = "228,251,254", TAU = Math.PI * 2;
    const BIG = Math.max(screen.width || 0, screen.height || 0) >= 1100;
    const NB = 6500, ND = BIG ? 90000 : 42000, N = NB + ND, ARC_COUNT = 14, ARC_S = 36, RING_S = 160, DUST = 150, HOT_MAX = 1400;
    const SPIN = 0.00016, FLOW = 0.000042, SWEEP = 0.00055;
    const LX = -0.421, LY = 0.381, LZ = 0.823; // light from the upper left, well toward the viewer

    // A smooth value noise on the sphere decides where the data clusters sit.
    function hash3(ix, iy, iz) {
      let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1442695041);
      h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    const smooth = t => t * t * (3 - 2 * t);
    function valueNoise(x, y, z) {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
      let total = 0;
      for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        total += (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz) * hash3(ix + dx + 4096, iy + dy + 4096, iz + dz + 4096);
      }
      return total;
    }
    const fbm = (x, y, z) => valueNoise(x * 2.3, y * 2.3, z * 2.3) * 0.55 + valueNoise(x * 4.7 + 7, y * 4.7 + 3, z * 4.7 + 1) * 0.3 + valueNoise(x * 9.5 + 13, y * 9.5 + 5, z * 9.5 + 2) * 0.15;

    // Two jittered lattices: a base set that is always drawn and a detail set that fills in as the camera closes in.
    // The detail set is stored in shuffled order so any leading share of it covers the sphere evenly.
    const unit = new Float32Array(N * 3), nz = new Float32Array(N), bright = new Float32Array(N), hot = new Uint8Array(N);
    const golden = Math.PI * (3 - Math.sqrt(5));
    function lattice(offset, count, phase, shuffle) {
      const jit = 0.55 * Math.sqrt(4 * Math.PI / count), order = new Uint32Array(count);
      for (let k = 0; k < count; k++) order[k] = k;
      if (shuffle) for (let k = count - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0, swap = order[k]; order[k] = order[j]; order[j] = swap; }
      for (let k = 0; k < count; k++) {
        const y0 = 1 - 2 * (k + 0.5) / count, r0 = Math.sqrt(1 - y0 * y0), t = k * golden + phase;
        let x = Math.cos(t) * r0 + (Math.random() - 0.5) * jit, y = y0 + (Math.random() - 0.5) * jit, z = Math.sin(t) * r0 + (Math.random() - 0.5) * jit;
        const len = Math.hypot(x, y, z), i = offset + order[k];
        x /= len; y /= len; z /= len;
        unit[i * 3] = x; unit[i * 3 + 1] = y; unit[i * 3 + 2] = z; nz[i] = fbm(x, y, z);
      }
    }
    lattice(0, NB, 0, false); lattice(NB, ND, 1.7, true);
    const sorted = Float32Array.from(nz.subarray(0, NB)).sort();
    const rank = v => { let lo = 0, hi = NB - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; } return lo / (NB - 1); };
    const hots = [];
    for (let i = 0; i < N; i++) { const r = rank(nz[i]); bright[i] = 0.14 + 0.86 * Math.pow(r, 1.35); if (r > 0.89) { hot[i] = 1; if (i < NB) hots.push(i); } }

    function sprite(color, inner) {
      const c = doc.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${color},${inner})`); grad.addColorStop(0.22, `rgba(${color},${inner * 0.5})`); grad.addColorStop(0.55, `rgba(${color},${inner * 0.12})`); grad.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return c;
    }
    const glowIon = sprite(ION, 0.95), glowFlare = sprite(FLARE, 1);

    function makeArc(initial) {
      let a, b, dot;
      do {
        a = hots[(Math.random() * hots.length) | 0]; b = hots[(Math.random() * hots.length) | 0];
        dot = unit[a * 3] * unit[b * 3] + unit[a * 3 + 1] * unit[b * 3 + 1] + unit[a * 3 + 2] * unit[b * 3 + 2];
      } while (a === b || dot > 0.86 || dot < -0.7);
      const omega = Math.acos(dot), so = Math.sin(omega), lift = 0.08 + 0.11 * (omega / Math.PI), path = new Float32Array(ARC_S * 4);
      for (let k = 0; k < ARC_S; k++) {
        const s = k / (ARC_S - 1), w1 = Math.sin((1 - s) * omega) / so, w2 = Math.sin(s * omega) / so;
        path[k * 4] = unit[a * 3] * w1 + unit[b * 3] * w2; path[k * 4 + 1] = unit[a * 3 + 1] * w1 + unit[b * 3 + 1] * w2; path[k * 4 + 2] = unit[a * 3 + 2] * w1 + unit[b * 3 + 2] * w2; path[k * 4 + 3] = lift * Math.sin(Math.PI * s);
      }
      const grow = 1500 + Math.random() * 1300, hold = 400 + Math.random() * 600, fade = 900, total = grow + hold + fade;
      return { path, grow, hold, fade, total, t: initial ? Math.random() * total : 0 };
    }

    /* camFn(W, H, e) returns the sphere's centre and radius in canvas pixels; e runs from 0 (whole globe) to 1 (horizon). */
    function create(canvas, camFn, opts = {}) {
      const ctx = canvas.getContext("2d");
      const arcs = Array.from({ length: ARC_COUNT }, () => makeArc(true));
      const rings = [
        { r: 1.09, incl: 1.22, node: 0.35, drift: 0.00004, speed: 0.0004, sats: [0, 2.1, 4.2] },
        { r: 1.18, incl: 0.58, node: -1.1, drift: -0.00003, speed: -0.00026, sats: [0.8, 3.9] },
      ];
      const dust = Array.from({ length: DUST }, () => ({ r: 1.05 + Math.random() * 0.16, incl: Math.random() * Math.PI, node: Math.random() * TAU, ang: Math.random() * TAU, speed: (0.00005 + Math.random() * 0.00012) * (Math.random() < 0.5 ? 1 : -1), size: 0.7 + Math.random() * 1.1 }));
      const hx = new Float32Array(HOT_MAX), hy = new Float32Array(HOT_MAX), hz = new Float32Array(HOT_MAX), ha = new Float32Array(HOT_MAX);
      const out = [0, 0, 0];
      const stats = { frameMs: 0, frames: 0, R: 0, W: 0, H: 0 };
      let W = 1, H = 1, dpr = 1, yaw = 0.6, pitch = 0, p = opts.fixed ? 1 : 0, px = 0, py = 0, time = 0, last, intro = opts.intro ? 0 : 1, visible = false, started = !opts.intro, dirty = true, wasStill = false;

      function ringPoint(ring, ang, ct, st) {
        const x0 = Math.cos(ang) * ring.r, z0 = Math.sin(ang) * ring.r, ci = Math.cos(ring.incl), si = Math.sin(ring.incl), cn = Math.cos(ring.node), sn = Math.sin(ring.node);
        const y1 = -z0 * si, z1 = z0 * ci, x2 = x0 * cn + z1 * sn, z2 = -x0 * sn + z1 * cn;
        out[0] = x2; out[1] = y1 * ct - z2 * st; out[2] = y1 * st + z2 * ct;
      }
      function resize() {
        W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
        dpr = Math.min(2, devicePixelRatio || 1, Math.sqrt(4.4e6 / (W * H)));
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        stats.W = W; stats.H = H; dirty = true;
      }
      function draw(still) {
        const e = easeInOut(p), c = camFn(W, H, e), introE = easeOut(clamp(intro));
        const cx = c.cx, cy = c.cy, R = c.R * (0.95 + 0.05 * introE);
        const tilt = 0.38 + pitch + py * 0.07, yawNow = yaw + px * 0.16;
        const ca = Math.cos(yawNow), sa = Math.sin(yawNow), ct = Math.cos(tilt), st = Math.sin(tilt);
        const scale = Math.min(2.3, R <= 470 ? 1 + Math.max(0, R - 170) / 420 : 1.714 + (R - 470) / 900);
        const fill = Math.pow(clamp((e - 0.3) / 0.7), 1.4), backs = R < 760, lw = clamp(R / 330, 0.7, 1.25);
        // Close to the horizon the limb is all that shows, so it gets more ambient light and flatter arcs.
        const amb = 0.28 + 0.2 * e, depthLo = 0.3 + 0.32 * e, liftK = 1 - 0.55 * e;
        stats.R = R;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);

        // atmosphere, body and rim light
        const bx0 = Math.max(0, cx - R * 1.24), by0 = Math.max(0, cy - R * 1.24), bx1 = Math.min(W, cx + R * 1.24), by1 = Math.min(H, cy + R * 1.24);
        if (bx1 <= bx0 || by1 <= by0) return;
        let g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.23);
        g.addColorStop(0, `rgba(${ION},0)`); g.addColorStop(0.25, `rgba(${ION},${0.24 * introE})`); g.addColorStop(0.6, `rgba(${ION},${0.055 * introE})`); g.addColorStop(1, `rgba(${ION},0)`);
        ctx.fillStyle = g; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
        g = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.05, cx, cy, R);
        g.addColorStop(0, "rgba(23,27,34,.93)"); g.addColorStop(0.5, "rgba(11,13,16,.93)"); g.addColorStop(1, "rgba(5,6,7,.95)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        g = ctx.createRadialGradient(cx, cy, R * 0.74, cx, cy, R);
        g.addColorStop(0, `rgba(${ION},0)`); g.addColorStop(0.8, `rgba(${ION},0.09)`); g.addColorStop(1, `rgba(${ION},0.42)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

        // points: the far side shows through faintly, the near side is lit and swept by a moving highlight
        const sweep = still ? 1e9 : (time * SWEEP) % TAU;
        const back = [new Path2D(), new Path2D(), new Path2D()], front = [];
        for (let b = 0; b < 10; b++) front.push(new Path2D());
        const count = NB + Math.ceil(ND * fill);
        let hotN = 0;
        for (let i = 0; i < count; i++) {
          const ux = unit[i * 3], uy = unit[i * 3 + 1], uz = unit[i * 3 + 2];
          const xs = ux * ca + uz * sa, zs = -ux * sa + uz * ca;
          const vy = uy * ct - zs * st, vz = uy * st + zs * ct;
          const sx = cx + xs * R, sy = cy - vy * R;
          if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
          if (vz < 0) {
            if (backs && i < NB) { const bs = 0.6 * scale; back[Math.min(2, ((vz + 1) * 3) | 0)].rect(sx - bs, sy - bs, bs * 2, bs * 2); }
            continue;
          }
          const lambert = Math.max(0, xs * LX + vy * LY + vz * LZ);
          let alpha = bright[i] * (amb + (1 - amb) * lambert) * (depthLo + (1 - depthLo) * vz);
          if (!still) {
            const d = Math.abs(((Math.atan2(xs, zs) - sweep + Math.PI * 3) % TAU) - Math.PI);
            if (d < 0.34) alpha += (1 - d / 0.34) * 0.5 * (0.35 + 0.65 * vz);
          }
          if (i >= NB) alpha *= Math.min(1, (fill - (i - NB) / ND) * 5 + 0.2);
          alpha = Math.min(1, alpha * introE);
          if (alpha < 0.02) continue;
          const r = (0.55 + 0.6 * vz) * (hot[i] ? 1.5 : 0.75 + 0.45 * bright[i]) * scale, path = front[Math.min(9, (alpha * 10) | 0)];
          path.moveTo(sx + r, sy); path.arc(sx, sy, r, 0, TAU);
          if (hot[i] && vz > 0.04 && hotN < HOT_MAX) { hx[hotN] = sx; hy[hotN] = sy; hz[hotN] = vz; ha[hotN] = alpha; hotN++; }
        }
        if (backs) {
          ctx.fillStyle = `rgba(${ION},0.05)`; ctx.fill(back[0]);
          ctx.fillStyle = `rgba(${ION},0.08)`; ctx.fill(back[1]);
          ctx.fillStyle = `rgba(${ION},0.12)`; ctx.fill(back[2]);
        }
        for (let b = 0; b < 10; b++) { ctx.fillStyle = `rgba(${ION},${((b + 0.5) / 10).toFixed(2)})`; ctx.fill(front[b]); }

        // hotspots bloom
        ctx.globalCompositeOperation = "lighter";
        const cores = new Path2D(), bloom = 0.8 + 0.2 * scale;
        for (let k = 0; k < hotN; k++) {
          const gs = (6 + 9 * hz[k]) * (0.55 + 0.45 * ha[k]) * bloom;
          ctx.globalAlpha = Math.min(1, ha[k] * 0.85);
          ctx.drawImage(glowIon, hx[k] - gs, hy[k] - gs, gs * 2, gs * 2);
          cores.moveTo(hx[k] + scale, hy[k]); cores.arc(hx[k], hy[k], 0.9 * scale, 0, TAU);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${FLARE},0.95)`; ctx.fill(cores);

        // arcs: a wide glow, a bright line and a hot core; hidden where the body is in front of them
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const arc of arcs) {
          const prog = still ? 1 : Math.min(1, arc.t / arc.grow);
          const fade = (still ? 1 : arc.t < arc.grow + arc.hold ? 1 : Math.max(0, 1 - (arc.t - arc.grow - arc.hold) / arc.fade)) * introE;
          if (fade <= 0) continue;
          const n = Math.max(2, Math.ceil(prog * (ARC_S - 1)) + 1);
          let run = null, runAlpha = -1, headX = 0, headY = 0, headZ = -1, headVisible = false;
          const flush = () => {
            if (!run) return;
            ctx.strokeStyle = `rgba(${ION},${(runAlpha * fade * 0.34).toFixed(3)})`; ctx.lineWidth = 8 * lw; ctx.stroke(run);
            ctx.strokeStyle = `rgba(${ION},${(runAlpha * fade).toFixed(3)})`; ctx.lineWidth = 2.3 * lw; ctx.stroke(run);
            ctx.strokeStyle = `rgba(${FLARE},${(runAlpha * fade * 0.9).toFixed(3)})`; ctx.lineWidth = 0.95 * lw; ctx.stroke(run);
            run = null;
          };
          for (let k = 0; k < n && k < ARC_S; k++) {
            const h = 1 + arc.path[k * 4 + 3] * liftK, ux = arc.path[k * 4] * h, uy = arc.path[k * 4 + 1] * h, uz = arc.path[k * 4 + 2] * h;
            const xs = ux * ca + uz * sa, zs = -ux * sa + uz * ca, vy = uy * ct - zs * st, vz = uy * st + zs * ct;
            const sx = cx + xs * R, sy = cy - vy * R;
            if (vz < 0 && xs * xs + vy * vy < 1) { flush(); headVisible = false; continue; }
            const bucket = vz >= 0.12 ? 1 : vz >= -0.05 ? 0.8 : 0.55;
            if (!run || bucket !== runAlpha) { const fromX = run ? headX : sx, fromY = run ? headY : sy; flush(); run = new Path2D(); run.moveTo(fromX, fromY); runAlpha = bucket; }
            run.lineTo(sx, sy); headX = sx; headY = sy; headZ = vz; headVisible = true;
          }
          flush();
          if (prog < 1 && headVisible) {
            const hs = (10 + 7 * Math.max(0, headZ)) * clamp(R / 330, 0.65, 1.2);
            ctx.globalAlpha = fade; ctx.drawImage(glowFlare, headX - hs, headY - hs, hs * 2, hs * 2); ctx.globalAlpha = 1;
          }
        }

        // orbit rings and satellites
        for (const ring of rings) {
          let run = null, runAlpha = -1, lastX = 0, lastY = 0, joined = false;
          const flushRing = () => { if (!run) return; ctx.strokeStyle = `rgba(${ION},${runAlpha * introE})`; ctx.lineWidth = 1; ctx.stroke(run); run = null; };
          for (let k = 0; k <= RING_S; k++) {
            ringPoint(ring, k / RING_S * TAU, ct, st);
            const vx = out[0], vy = out[1], vz = out[2], hidden = vz < 0 && vx * vx + vy * vy < 1, a = hidden ? 0 : vz >= 0 ? 0.3 : 0.14;
            const sx = cx + vx * R, sy = cy - vy * R;
            if (a === 0) { flushRing(); joined = false; continue; }
            if (!run || a !== runAlpha) { flushRing(); run = new Path2D(); if (joined) run.moveTo(lastX, lastY); else run.moveTo(sx, sy); runAlpha = a; }
            run.lineTo(sx, sy); lastX = sx; lastY = sy; joined = true;
          }
          flushRing();
          for (const phase of ring.sats) {
            const ang = phase + (still ? 0 : time * ring.speed);
            for (let tail = 10; tail >= 0; tail--) {
              ringPoint(ring, ang - tail * 0.028, ct, st);
              const vx = out[0], vy = out[1], vz = out[2];
              if (vz < 0 && vx * vx + vy * vy < 1) continue;
              const sx = cx + vx * R, sy = cy - vy * R;
              if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
              if (tail === 0) { ctx.drawImage(glowFlare, sx - 9, sy - 9, 18, 18); ctx.fillStyle = `rgba(${FLARE},${introE})`; ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4); }
              else { ctx.fillStyle = `rgba(${ION},${(0.5 * (1 - tail / 11) * introE).toFixed(2)})`; ctx.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6); }
            }
          }
        }

        // motes drifting around the globe
        const motes = new Path2D();
        for (const mote of dust) {
          const ang = mote.ang + (still ? 0 : time * mote.speed), x0 = Math.cos(ang) * mote.r, z0 = Math.sin(ang) * mote.r, ci = Math.cos(mote.incl), si = Math.sin(mote.incl), cn = Math.cos(mote.node), sn = Math.sin(mote.node);
          const y1 = -z0 * si, z1 = z0 * ci, x2 = x0 * cn + z1 * sn, z2 = -x0 * sn + z1 * cn, vy = y1 * ct - z2 * st, vz = y1 * st + z2 * ct;
          if (vz < 0 && x2 * x2 + vy * vy < 1) continue;
          const sx = cx + x2 * R, sy = cy - vy * R;
          if (sx < -6 || sx > W + 6 || sy < -6 || sy > H + 6) continue;
          const rr = mote.size * (0.6 + 0.4 * (vz + 1) / 2);
          motes.moveTo(sx + rr, sy); motes.arc(sx, sy, rr, 0, TAU);
        }
        ctx.fillStyle = `rgba(${ION},${0.42 * introE})`; ctx.fill(motes);

        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `rgba(${ION},${0.55 * introE})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      }
      function advance(dt) {
        const e = easeInOut(p);
        time += dt;
        if (started && intro < 1) intro = Math.min(1, intro + dt / 1700);
        yaw += SPIN * dt * (1 - 0.72 * e);
        // At the horizon the surface flows toward the viewer; back at the whole globe it settles to its resting tilt.
        if (e > 0.35) pitch += FLOW * dt * e;
        else if (pitch !== 0) {
          pitch = ((pitch + Math.PI) % TAU + TAU) % TAU - Math.PI;
          pitch *= Math.exp(-dt / 520);
          if (Math.abs(pitch) < 0.0004) pitch = 0;
        }
        for (const ring of rings) ring.node += ring.drift * dt;
        for (let i = 0; i < arcs.length; i++) { arcs[i].t += dt; if (arcs[i].t > arcs[i].total) arcs[i] = makeArc(false); }
      }
      function tick(now) {
        if (!visible) { last = undefined; return false; }
        const still = RM || state.paused;
        if (still && wasStill && !dirty) return false;
        wasStill = still; dirty = false;
        const dt = last === undefined ? 16 : Math.min(64, now - last);
        last = now;
        if (!still) advance(dt); else if (started && intro < 1) intro = 1;
        const began = performance.now();
        draw(still);
        stats.frameMs = performance.now() - began; stats.frames++;
        if (still) last = undefined;
        return !still;
      }
      tickers.add(tick);
      if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { dirty = true; request(); } }).observe(canvas);
      else visible = true;
      return {
        stats, resize() { resize(); request(); },
        start() { started = true; dirty = true; request(); },
        setProgress(v) { if (!opts.fixed && v !== p) { p = v; dirty = true; request(); } },
        setPointer(x, y) { px = x; py = y; },
      };
    }
    return { create };
  })();

  /* ---------- Elements ---------- */
  const stage = $("#stage"), pin = $("#stage-pin"), hero = $("#hero");
  const lkA = $(".lockup .lk-a"), lkB = $(".lockup .lk-b");
  const header = $("#site-header"), progressBar = $("#progress");
  const moves = $$(".move"), domains = $("#domains"), track = $("#domains-track"), domainEls = $$(".domain");
  const proof = $("#proof"), contact = $("#contact");
  const indexLinks = $$("#index a"), navLinks = $$(".site-nav a");

  /* ---------- Text preparation ---------- */
  const lit = [];
  function wrapWords(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const frag = doc.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(" "); return; }
          const span = doc.createElement("span"); span.className = "sw"; span.textContent = part; lit.push(span); frag.append(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) wrapWords(child);
    }
  }
  $$("[data-words]").forEach(wrapWords);
  if (!RM) $$("[data-split]").forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((word, i) => {
      const outer = doc.createElement("span"), inner = doc.createElement("span");
      outer.className = "w"; inner.className = "wi"; inner.style.setProperty("--i", i); inner.textContent = word;
      outer.append(inner); el.append(outer);
      if (i < words.length - 1) el.append(" ");
    });
  });

  /* ---------- Layout ---------- */
  let VW = innerWidth, VH = innerHeight, MODE = "split", PIN = false, GAL = false;
  const M = { stageTop: 0, travel: 1, stageEnd: 0, moves: [], sections: [], lights: [], galTop: 0, galH: 1, galTravel: 1, galOver: 0, cards: [], proofTop: 0, proofH: 1, footTop: 0, docH: 1 };
  const cam = { top0: 0, R0: 1, top1: 0, R1: 1 }, endCamState = { top: 0, R: 1 };

  function fitLines() {
    MODE = getComputedStyle(root).getPropertyValue("--mode").trim() || "split";
    const narrow = MODE === "stack3", active = [];
    for (const el of $$("[data-fit]")) {
      const want = el.dataset.fit;
      if (want === "all" || (want === "narrow") === narrow) { active.push(el); el.style.setProperty("--fs", "10px"); } else el.style.removeProperty("--fs");
    }
    for (const el of active) {
      const line = el.closest(".lk"), avail = line.clientWidth;
      el.style.setProperty("--fs", "100px");
      const width = el.getBoundingClientRect().width;
      let size = width > 0 ? 100 * avail / width * 0.994 : 0;
      if (MODE === "split" && line.closest(".lockup")) size = Math.min(size, innerHeight * (line.classList.contains("lk-a") ? 0.3 : 0.19));
      if (size > 0) el.style.setProperty("--fs", size.toFixed(2) + "px"); else el.style.removeProperty("--fs");
    }
  }
  function sizeGallery() {
    GAL = !RM && FINE && VW >= 900 && innerHeight >= 560;
    domains.classList.toggle("pinned", GAL);
    if (!GAL) { domains.style.removeProperty("--travel"); track.style.removeProperty("--x"); M.galOver = 0; return; }
    M.galOver = Math.max(0, track.offsetWidth - VW);
    M.galTravel = Math.max(1, Math.round(M.galOver * 0.82));
    domains.style.setProperty("--travel", M.galTravel + "px");
    M.cards = domainEls.map(el => el.offsetLeft + el.offsetWidth / 2);
  }
  function targetY(id) {
    if (id === "top") return 0;
    if (id === "build" && PIN) return M.stageTop + Math.round(VH * 1.78);
    const el = doc.getElementById(id);
    return el ? Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY)) : 0;
  }
  function measure() {
    VW = innerWidth;
    fitLines();
    sizeGallery();
    const y0 = scrollY, top = el => el.getBoundingClientRect().top + y0;
    PIN = !RM && getComputedStyle(pin).position === "sticky";
    VH = PIN ? pin.offsetHeight : innerHeight;
    M.stageTop = top(stage); M.travel = Math.max(1, stage.offsetHeight - VH); M.stageEnd = M.stageTop + M.travel;
    M.moves = moves.map(el => ({ el, word: $(".word-f", el), top: top(el), fill: -1 }));
    M.sections = indexLinks.map(a => {
      const id = a.getAttribute("href").slice(1), y = targetY(id);
      return { a, id, on: id === "build" && PIN ? M.stageTop + VH * 0.62 : y - innerHeight * 0.45 };
    });
    M.lights = $$(".light").map(el => [top(el), top(el) + el.offsetHeight]);
    M.galTop = top(domains) + domains.clientTop; M.galH = domains.offsetHeight; M.footTop = top($(".site-footer"));
    M.proofTop = top(proof); M.proofH = proof.offsetHeight;
    M.docH = Math.max(1, root.scrollHeight - innerHeight);

    // Where the globe sits behind the hero lines, and where its horizon ends up.
    const orb = $("#orb"), W = orb.clientWidth, H = orb.clientHeight, fs = el => parseFloat(getComputedStyle(el).fontSize) || 0;
    if (MODE === "split") {
      cam.R0 = clamp(0.30 * W, 0.44 * H, 0.56 * H);
      cam.top0 = lkA.offsetTop + lkA.offsetHeight - 0.2 * fs($(".lk-in", lkA));
    } else {
      const lastH = MODE === "stack3" ? fs($(".seg:last-child", lkB)) * 0.8 : lkB.offsetHeight;
      cam.top0 = lkB.offsetTop + lkB.offsetHeight - lastH * 0.6;
      cam.R0 = Math.max(60, Math.min(0.75 * W, 0.62 * (H - cam.top0)));
    }
    if (W >= H) { cam.R1 = 1.15 * W; cam.top1 = 0.58 * H; } else { cam.R1 = 1.15 * Math.max(W, 0.9 * H); cam.top1 = 0.64 * H; }
    const foot = $(".contact-foot"), inner = $(".contact-in"), CW = contact.clientWidth, CH = contact.clientHeight;
    endCamState.R = CW >= CH ? 1.15 * CW : 1.15 * Math.max(CW, 0.9 * CH);
    endCamState.top = Math.min(CH * 0.8, inner.offsetTop + foot.offsetTop + foot.offsetHeight + CH * 0.08);
  }
  const heroCam = (W, H, e) => { const R = cam.R0 * Math.pow(cam.R1 / cam.R0, e); return { cx: W / 2, cy: lerp(cam.top0, cam.top1, e) + R, R }; };
  const endCam = W => ({ cx: W / 2, cy: endCamState.top + endCamState.R, R: endCamState.R });
  const globe = Globe.create($("#orb"), heroCam, { intro: true });
  const endGlobe = Globe.create($("#orb-end"), endCam, { fixed: true });

  function drawStars() {
    const canvas = $("#stars"), W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(W * H / 5200);
    for (let i = 0; i < count; i++) {
      const bright = Math.random();
      ctx.fillStyle = bright > 0.93 ? `rgba(35,206,240,${0.35 + Math.random() * 0.4})` : `rgba(238,237,231,${0.05 + bright * 0.28})`;
      const r = bright > 0.93 ? 1.1 : 0.4 + bright * 0.6;
      ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  (function grain() {
    const tile = doc.createElement("canvas"); tile.width = tile.height = 128;
    const ctx = tile.getContext("2d"), image = ctx.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) { const v = Math.random() * 255; image.data[i] = image.data[i + 1] = image.data[i + 2] = v; image.data[i + 3] = 9 + Math.random() * 13; }
    ctx.putImageData(image, 0, 0);
    try { $("#grain").style.backgroundImage = `url(${tile.toDataURL("image/png")})`; } catch (e) { /* a tainted or blocked canvas just means no grain */ }
  })();

  /* ---------- Scroll ---------- */
  let sy = scrollY, ty = sy, lastSy = sy, vel = 0, lastT, litCount = -1, curSec, chrome = "", indexTheme = "", solid = null, hidden = false, lastCard = -1;
  function apply() {
    progressBar.style.setProperty("--p", clamp(sy / M.docH).toFixed(4));
    const s = sy - M.stageTop;
    if (PIN) {
      pin.style.setProperty("--hx", clamp(s / (VH * 0.55)).toFixed(4));
      pin.style.setProperty("--so", clamp((s - VH * 0.6) / (VH * 0.25)).toFixed(4));
      pin.style.setProperty("--sn", clamp((s - VH * 1.62) / (VH * 0.14)).toFixed(4));
      const upto = Math.floor(clamp((s - VH * 0.82) / (VH * 0.8)) * (lit.length + 0.999));
      if (upto !== litCount) { lit.forEach((el, i) => el.classList.toggle("lit", i < upto)); litCount = upto; }
      globe.setProgress(clamp(s / (VH * 0.9)));
    }
    if (!RM) for (const m of M.moves) {
      const f = clamp((innerHeight * 0.88 - (m.top - sy)) / (innerHeight * 0.46)), pct = Math.round(f * 1000) / 10;
      if (pct !== m.fill) { m.fill = pct; m.word.style.setProperty("--fill", pct + "%"); m.el.classList.toggle("done", f >= 0.995); }
    }
    if (GAL) {
      const g = clamp((sy - M.galTop) / M.galTravel), x = g * M.galOver, focus = lerp(M.cards[0], M.cards[M.cards.length - 1], g);
      track.style.setProperty("--x", x.toFixed(1));
      let near = 0;
      M.cards.forEach((c, i) => { if (Math.abs(c - focus) < Math.abs(M.cards[near] - focus)) near = i; });
      if (near !== lastCard) { lastCard = near; $("#domain-n").textContent = String(near + 1).padStart(2, "0"); }
      $("#domain-bar").style.setProperty("--g", g.toFixed(4));
    }
    proof.style.setProperty("--pp", (clamp((sy + innerHeight - M.proofTop) / (innerHeight + M.proofH)) * 2 - 1).toFixed(4));

    let cur = null;
    for (const sec of M.sections) if (sy >= sec.on) cur = sec;
    if (cur !== curSec) {
      curSec = cur;
      M.sections.forEach(sec => { if (sec === cur) sec.a.setAttribute("aria-current", "true"); else sec.a.removeAttribute("aria-current"); });
      navLinks.forEach(a => { if (cur && a.getAttribute("href") === "#" + cur.id) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    }
    const inLight = y => M.lights.some(([a, b]) => y >= a && y < b);
    const c = inLight(sy + header.offsetHeight / 2) ? "light" : "dark";
    if (c !== chrome) { chrome = c; body.dataset.chrome = c; }
    // The side index steps aside over the gallery, which has its own counter, and over the footer.
    const half = innerHeight / 2, pad = half + 90;
    const it = (sy > M.galTop - pad && sy < M.galTop + M.galH - innerHeight + pad) || sy > M.footTop - pad ? "off" : inLight(sy + half) ? "light" : "dark";
    if (it !== indexTheme) { indexTheme = it; body.dataset.index = it; }
    const nowSolid = sy > M.stageEnd - 4;
    if (nowSolid !== solid) { solid = nowSolid; header.classList.toggle("solid", solid); }
    const dy = sy - lastSy;
    vel = lerp(vel, dy, 0.25);
    const hide = solid && !header.contains(doc.activeElement) ? (dy > 1.5 ? true : dy < -1.5 ? false : hidden) : false;
    if (hide !== hidden) { hidden = hide; header.classList.toggle("hide", hidden); }
  }
  tickers.add(now => {
    const dt = lastT === undefined ? 16 : Math.min(64, now - lastT);
    lastT = now;
    const d = ty - sy;
    if (RM || Math.abs(d) < 0.4) sy = ty; else sy += d * (1 - Math.exp(-dt / 85));
    apply();
    lastSy = sy;
    if (sy === ty) { lastT = undefined; vel = 0; return false; }
    return true;
  });
  addEventListener("scroll", () => { ty = scrollY; request(); }, { passive: true });

  function layout() {
    measure();
    globe.resize(); endGlobe.resize(); drawStars();
    ty = scrollY; if (Math.abs(ty - sy) > innerHeight * 2) sy = ty;
    litCount = -1; lastCard = -1;
    apply(); request();
  }
  let resizeTimer = 0;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
  addEventListener("load", layout);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(layout);
  layout();
  if (RM) moves.forEach(el => el.classList.add("done"));

  /* ---------- In-page links ---------- */
  function go(id, smooth) {
    const y = targetY(id);
    scrollTo({ top: y, behavior: smooth && !RM ? "smooth" : "auto" });
  }
  doc.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = link.getAttribute("href").slice(1);
    if (!id || !(id === "top" || doc.getElementById(id))) return;
    event.preventDefault();
    go(id, true);
    try { history.replaceState(null, "", id === "top" ? location.pathname + location.search : "#" + id); } catch (e) { /* file: pages can refuse this */ }
    const target = id === "top" ? $("#main") : doc.getElementById(id);
    if (target) { if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  });
  if (location.hash === "#build" && PIN) go("build", false);

  /* ---------- Reveals, counters, film ---------- */
  const revealTargets = $$(".reveal, [data-split], .rule-title .lk, .closer .lk");
  if (!RM && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealTargets.forEach(el => io.observe(el));
  } else revealTargets.forEach(el => el.classList.add("in"));

  const counters = $$("[data-count]");
  if (!RM && "IntersectionObserver" in window && counters.length) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target, target = Number(el.dataset.count), suffix = el.dataset.suffix || "", decimals = Number(el.dataset.decimals || 0), begun = performance.now();
      const step = now => { const t = clamp((now - begun) / 1600), value = target * easeOut(t); el.textContent = (decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString("en-US")) + suffix; if (t < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }), { threshold: 0.6 });
    counters.forEach(el => io.observe(el));
  }

  const film = $("#film");
  let filmNear = false, filmAttached = false;
  function syncFilm() {
    if (!film) return;
    const want = filmNear && !RM && !state.paused && !(navigator.connection && navigator.connection.saveData);
    if (want) {
      if (!filmAttached) { filmAttached = true; $$("source[data-src]", film).forEach(source => { source.src = source.dataset.src; }); film.load(); }
      const playing = film.play(); if (playing && playing.catch) playing.catch(() => {});
    } else if (!film.paused) film.pause();
  }
  if (film) {
    film.addEventListener("playing", () => film.classList.add("on"));
    if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { filmNear = entry.isIntersecting; syncFilm(); }, { rootMargin: "30% 0px" }).observe(film);
  }

  /* ---------- Marquee ---------- */
  (() => {
    const band = $("#marquee"), row = $("#marquee-track");
    if (!band || !row || RM) return;
    let x = 0, last, visible = false, period = 0;
    const size = () => { const half = row.children[row.children.length / 2]; period = half ? half.offsetLeft - row.children[0].offsetLeft : 0; };
    size(); addEventListener("resize", size); if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(size);
    tickers.add(now => {
      if (!visible || state.paused || !period) { last = undefined; return false; }
      const dt = last === undefined ? 16 : Math.min(64, now - last);
      last = now;
      x = (x + dt * 0.055 + Math.abs(vel) * 0.55) % period;
      row.style.setProperty("--mq", (-x).toFixed(1) + "px");
      return true;
    });
    if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) request(); }).observe(band);
  })();

  /* ---------- Pointer: parallax, cursor, magnetic buttons, agent previews ---------- */
  if (FINE && !RM) {
    let mx = 0, my = 0, tmx = 0, tmy = 0, cx = -100, cy = -100, tcx = -100, tcy = -100, cs = 0.32, tcs = 0.32, seen = false;
    const cursor = $("#cursor");
    const preview = $("#preview"), previewImg = $("#preview-img"), rows = $$(".row");
    let pvx = 0, pvy = 0, tpx = 0, tpy = 0, pvOn = false, rot = 0;
    addEventListener("pointermove", event => {
      tmx = event.clientX / innerWidth * 2 - 1; tmy = event.clientY / innerHeight * 2 - 1;
      tcx = event.clientX; tcy = event.clientY; tpx = event.clientX; tpy = event.clientY;
      if (!seen) { seen = true; cx = tcx; cy = tcy; pvx = tpx; pvy = tpy; cursor.classList.add("on"); }
      request();
    }, { passive: true });
    doc.addEventListener("pointerover", event => {
      const big = event.target.closest && event.target.closest("a, button, .row, .domain");
      tcs = big ? 1 : 0.32; cursor.classList.toggle("big", Boolean(big)); request();
    });
    doc.documentElement.addEventListener("pointerleave", () => cursor.classList.remove("on"));
    doc.documentElement.addEventListener("pointerenter", () => { if (seen) cursor.classList.add("on"); });
    tickers.add(() => {
      let moving = false;
      if (Math.abs(tmx - mx) > 0.0008 || Math.abs(tmy - my) > 0.0008) { mx += (tmx - mx) * 0.07; my += (tmy - my) * 0.07; moving = true; pin.style.setProperty("--mx", mx.toFixed(4)); pin.style.setProperty("--my", my.toFixed(4)); globe.setPointer(mx, my); }
      if (Math.abs(tcx - cx) > 0.1 || Math.abs(tcy - cy) > 0.1 || Math.abs(tcs - cs) > 0.004) {
        cx += (tcx - cx) * 0.22; cy += (tcy - cy) * 0.22; cs += (tcs - cs) * 0.16; moving = true;
        cursor.style.setProperty("--cx", cx.toFixed(1) + "px"); cursor.style.setProperty("--cy", cy.toFixed(1) + "px"); cursor.style.setProperty("--cs", cs.toFixed(3));
      }
      if (pvOn || Math.abs(tpx - pvx) > 0.2) {
        const dx = tpx - pvx; pvx += dx * 0.14; pvy += (tpy - pvy) * 0.14; rot += (clamp(dx * 0.12, -7, 7) - rot) * 0.12;
        const w = preview.offsetWidth, h = preview.offsetHeight;
        preview.style.setProperty("--x", clamp(pvx + 28, 12, innerWidth - w - 12).toFixed(1) + "px");
        preview.style.setProperty("--y", clamp(pvy - h * 0.5, 12, innerHeight - h - 12).toFixed(1) + "px");
        preview.style.setProperty("--r", rot.toFixed(2) + "deg");
        if (pvOn || Math.abs(dx) > 0.2) moving = true;
      }
      return moving;
    });
    rows.forEach(row => {
      const image = $(".row-img", row);
      const side = event => { const box = row.getBoundingClientRect(); row.style.setProperty("--from", event.clientY < box.top + box.height / 2 ? "top" : "bottom"); };
      row.addEventListener("pointerenter", event => { side(event); if (image) { previewImg.src = image.getAttribute("src"); previewImg.alt = ""; } pvOn = true; preview.classList.add("on"); request(); });
      row.addEventListener("pointerleave", event => { side(event); pvOn = false; preview.classList.remove("on"); });
    });
    // Warm the four preview images once the list is near, so the first hover does not flash.
    if ("IntersectionObserver" in window && rows.length) {
      const warm = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) return; warm.disconnect(); rows.forEach(row => { const image = $(".row-img", row); if (image) new Image().src = image.getAttribute("src"); }); }, { rootMargin: "60% 0px" });
      warm.observe($("#rows"));
    }
    $$(".magnetic").forEach(el => {
      el.addEventListener("pointermove", event => { const box = el.getBoundingClientRect(); el.style.setProperty("--tx", ((event.clientX - box.left - box.width / 2) * 0.28).toFixed(1) + "px"); el.style.setProperty("--ty", ((event.clientY - box.top - box.height / 2) * 0.34).toFixed(1) + "px"); });
      el.addEventListener("pointerleave", () => { el.style.setProperty("--tx", "0px"); el.style.setProperty("--ty", "0px"); });
    });
  }

  /* ---------- Clock and the motion switch ---------- */
  const clock = $("#clock");
  if (clock) { const tickClock = () => { clock.textContent = new Date().toISOString().slice(11, 19); }; tickClock(); setInterval(tickClock, 1000); }
  const toggles = $$("[data-motion-toggle]");
  function setPaused(value) {
    state.paused = value;
    root.classList.toggle("paused", value);
    toggles.forEach(button => {
      button.setAttribute("aria-pressed", String(value));
      if (button.hasAttribute("aria-label")) button.setAttribute("aria-label", value ? "Play motion" : "Pause motion"); else button.textContent = value ? "Play motion" : "Pause motion";
    });
    syncFilm(); request();
  }
  if (RM) toggles.forEach(button => { button.hidden = true; });
  toggles.forEach(button => button.addEventListener("click", () => setPaused(!state.paused)));
  doc.addEventListener("visibilitychange", () => { if (!doc.hidden) request(); });

  /* ---------- Intro ---------- */
  function ready() {
    if (state.ready) return;
    state.ready = true;
    root.classList.add("is-ready");
    globe.start();
  }
  const loader = $("#loader");
  if (RM || !loader) ready();
  else {
    let seen = false;
    try { seen = sessionStorage.getItem("astrion-intro") === "1"; sessionStorage.setItem("astrion-intro", "1"); } catch (e) { /* storage can be blocked */ }
    const total = seen ? 380 : 1150, begun = performance.now(), count = $("#loader-count"), bar = $("#loader-bar");
    let fontsIn = !(doc.fonts && doc.fonts.ready);
    if (!fontsIn) doc.fonts.ready.then(() => { fontsIn = true; });
    const step = now => {
      const t = clamp((now - begun) / total), v = Math.round(easeOut(t) * 100);
      count.textContent = String(v).padStart(3, "0"); bar.style.transform = `scaleX(${v / 100})`;
      if (t < 1 || (!fontsIn && now - begun < 2600)) requestAnimationFrame(step);
      else { layout(); ready(); setTimeout(() => loader.remove(), 1300); }
    };
    requestAnimationFrame(step);
  }

  // A read-only hook for the browser tests.
  window.astrion = { state, globe: globe.stats, endGlobe: endGlobe.stats, metrics: M, cam, layout, mode: () => MODE, pinned: () => PIN, gallery: () => GAL, scroll: () => sy };
})();
