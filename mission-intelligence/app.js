/* Astrion · Agentic AI. Reveal on scroll and the data globe. No network requests. */
(() => {
  "use strict";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const revealed = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
    revealed.forEach(element => observer.observe(element));
  } else {
    revealed.forEach(element => element.classList.add("in"));
  }

  const canvas = document.getElementById("orb");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const ION = "35,206,240", FLARE = "228,251,254";
  const TAU = Math.PI * 2, TILT = 0.38, SPIN = 0.00016, SWEEP = 0.00055;
  const N = 6500, ARC_COUNT = 14, ARC_SAMPLES = 36, RING_SAMPLES = 160, DUST = 150;
  const LX = -0.501, LY = 0.622, LZ = 0.602; // light from the upper left, toward the viewer

  // ---- a smooth value noise on the sphere decides where the data clusters sit ----
  function hash3(ix, iy, iz) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
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

  // ---- points spread evenly over the sphere, ranked by the noise ----
  const unit = new Float32Array(N * 3), noise = new Float32Array(N), bright = new Float32Array(N), hot = new Uint8Array(N);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const jitter = 0.55 * Math.sqrt(4 * Math.PI / N);
  for (let i = 0; i < N; i++) {
    const y0 = 1 - 2 * (i + 0.5) / N, r0 = Math.sqrt(1 - y0 * y0), t = i * golden;
    let x = Math.cos(t) * r0 + (Math.random() - 0.5) * jitter, y = y0 + (Math.random() - 0.5) * jitter, z = Math.sin(t) * r0 + (Math.random() - 0.5) * jitter;
    const len = Math.hypot(x, y, z); x /= len; y /= len; z /= len;
    unit[i * 3] = x; unit[i * 3 + 1] = y; unit[i * 3 + 2] = z;
    noise[i] = fbm(x, y, z);
  }
  const order = Array.from(noise.keys()).sort((a, b) => noise[a] - noise[b]);
  order.forEach((index, position) => { bright[index] = 0.14 + 0.86 * Math.pow(position / (N - 1), 1.35); });
  const hots = order.slice(Math.floor(N * 0.89));
  hots.forEach(index => { hot[index] = 1; });

  // ---- glow sprites ----
  function sprite(color, inner) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${color},${inner})`); grad.addColorStop(0.22, `rgba(${color},${inner * 0.5})`); grad.addColorStop(0.55, `rgba(${color},${inner * 0.12})`); grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const glowIon = sprite(ION, 0.95), glowFlare = sprite(FLARE, 1);

  // ---- arcs between hotspots, lifted off the surface ----
  function makeArc(initial) {
    let a, b, dot;
    do {
      a = hots[(Math.random() * hots.length) | 0]; b = hots[(Math.random() * hots.length) | 0];
      dot = unit[a * 3] * unit[b * 3] + unit[a * 3 + 1] * unit[b * 3 + 1] + unit[a * 3 + 2] * unit[b * 3 + 2];
    } while (a === b || dot > 0.86 || dot < -0.7);
    const omega = Math.acos(dot), so = Math.sin(omega), lift = 0.12 + 0.18 * (omega / Math.PI), path = new Float32Array(ARC_SAMPLES * 3);
    for (let k = 0; k < ARC_SAMPLES; k++) {
      const s = k / (ARC_SAMPLES - 1), w1 = Math.sin((1 - s) * omega) / so, w2 = Math.sin(s * omega) / so, h = 1 + lift * Math.sin(Math.PI * s);
      path[k * 3] = (unit[a * 3] * w1 + unit[b * 3] * w2) * h; path[k * 3 + 1] = (unit[a * 3 + 1] * w1 + unit[b * 3 + 1] * w2) * h; path[k * 3 + 2] = (unit[a * 3 + 2] * w1 + unit[b * 3 + 2] * w2) * h;
    }
    const grow = 1500 + Math.random() * 1300, hold = 400 + Math.random() * 600, fade = 900, total = grow + hold + fade;
    return { path, grow, hold, fade, total, t: initial ? Math.random() * total : 0 };
  }
  const arcs = Array.from({ length: ARC_COUNT }, () => makeArc(true));

  // ---- two orbit rings with satellites ----
  const rings = [
    { r: 1.16, incl: 1.22, node: 0.35, drift: 0.00004, speed: 0.00040, sats: [0, 2.1, 4.2] },
    { r: 1.31, incl: 0.58, node: -1.1, drift: -0.00003, speed: -0.00026, sats: [0.8, 3.9] },
  ];
  const dust = Array.from({ length: DUST }, () => ({ r: 1.06 + Math.random() * 0.5, incl: Math.random() * Math.PI, node: Math.random() * TAU, ang: Math.random() * TAU, speed: (0.00005 + Math.random() * 0.00012) * (Math.random() < 0.5 ? 1 : -1), size: 0.7 + Math.random() * 1.1 }));
  const out = [0, 0, 0];
  function ringPoint(ring, ang, ct, st) {
    const x0 = Math.cos(ang) * ring.r, z0 = Math.sin(ang) * ring.r, ci = Math.cos(ring.incl), si = Math.sin(ring.incl), cn = Math.cos(ring.node), sn = Math.sin(ring.node);
    const y1 = -z0 * si, z1 = z0 * ci, x2 = x0 * cn + z1 * sn, z2 = -x0 * sn + z1 * cn;
    out[0] = x2; out[1] = y1 * ct - z2 * st; out[2] = y1 * st + z2 * ct;
  }

  let width = 0, height = 0, dpr = 1, angle = 0.6, last, frame, visible = true;
  const stats = { frameMs: 0 };
  window.astrionOrb = stats;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
    canvas.width = width * dpr; canvas.height = height * dpr;
  }

  function draw(now, still) {
    const W = width, H = height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
    const ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(TILT), st = Math.sin(TILT);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    // atmosphere, body and rim light
    let g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.55);
    g.addColorStop(0, `rgba(${ION},0)`); g.addColorStop(0.1, `rgba(${ION},0.2)`); g.addColorStop(0.4, `rgba(${ION},0.04)`); g.addColorStop(1, `rgba(${ION},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.05, cx, cy, R);
    g.addColorStop(0, "#19212b"); g.addColorStop(0.5, "#0a0d12"); g.addColorStop(1, "#04060a");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    g = ctx.createRadialGradient(cx, cy, R * 0.74, cx, cy, R);
    g.addColorStop(0, `rgba(${ION},0)`); g.addColorStop(0.8, `rgba(${ION},0.09)`); g.addColorStop(1, `rgba(${ION},0.42)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    // project every point; back points show through faintly, front points are lit from the upper left
    const sweep = still ? 1e9 : (now * SWEEP) % TAU, scale = 1 + Math.max(0, (R - 170) / 420);
    const backPaths = [new Path2D(), new Path2D(), new Path2D()], frontPaths = Array.from({ length: 10 }, () => new Path2D()), hotFront = [];
    for (let i = 0; i < N; i++) {
      const ux = unit[i * 3], uy = unit[i * 3 + 1], uz = unit[i * 3 + 2];
      const xs = ux * ca + uz * sa, zs = -ux * sa + uz * ca;
      const vx = xs, vy = uy * ct - zs * st, vz = uy * st + zs * ct;
      const sx = cx + vx * R, sy = cy - vy * R;
      px[i] = sx; py[i] = sy; pz[i] = vz;
      if (vz < 0) { const bs = 0.6 * scale; backPaths[Math.min(2, ((vz + 1) * 3) | 0)].rect(sx - bs, sy - bs, bs * 2, bs * 2); continue; }
      const lambert = Math.max(0, vx * LX + vy * LY + vz * LZ);
      let alpha = bright[i] * (0.28 + 0.72 * lambert) * (0.3 + 0.7 * vz);
      if (!still) {
        const d = Math.abs(((Math.atan2(xs, zs) - sweep + Math.PI * 3) % TAU) - Math.PI);
        if (d < 0.34) alpha += (1 - d / 0.34) * 0.5 * (0.35 + 0.65 * vz);
      }
      alpha = Math.min(1, alpha);
      const radius = (0.55 + 0.6 * vz) * (hot[i] ? 1.5 : 0.75 + 0.45 * bright[i]) * scale, path = frontPaths[Math.min(9, (alpha * 10) | 0)];
      path.moveTo(sx + radius, sy); path.arc(sx, sy, radius, 0, TAU);
      if (hot[i] && vz > 0.04) hotFront.push(i, alpha);
    }
    ctx.fillStyle = `rgba(${ION},0.05)`; ctx.fill(backPaths[0]);
    ctx.fillStyle = `rgba(${ION},0.08)`; ctx.fill(backPaths[1]);
    ctx.fillStyle = `rgba(${ION},0.12)`; ctx.fill(backPaths[2]);
    for (let b = 0; b < 10; b++) { ctx.fillStyle = `rgba(${ION},${((b + 0.5) / 10).toFixed(2)})`; ctx.fill(frontPaths[b]); }

    // hotspots bloom
    ctx.globalCompositeOperation = "lighter";
    const cores = new Path2D();
    for (let k = 0; k < hotFront.length; k += 2) {
      const i = hotFront[k], al = hotFront[k + 1], gs = (6 + 9 * pz[i]) * (0.55 + 0.45 * al) * (0.8 + 0.2 * scale);
      ctx.globalAlpha = Math.min(1, al * 0.85);
      ctx.drawImage(glowIon, px[i] - gs, py[i] - gs, gs * 2, gs * 2);
      cores.moveTo(px[i] + scale, py[i]); cores.arc(px[i], py[i], 0.9 * scale, 0, TAU);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${FLARE},0.95)`; ctx.fill(cores);

    // arcs
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const arc of arcs) {
      const prog = still ? 1 : Math.min(1, arc.t / arc.grow);
      const fadeIn = still ? 1 : arc.t < arc.grow + arc.hold ? 1 : Math.max(0, 1 - (arc.t - arc.grow - arc.hold) / arc.fade);
      if (fadeIn <= 0) continue;
      const count = Math.max(2, Math.ceil(prog * (ARC_SAMPLES - 1)) + 1);
      let run = null, runAlpha = -1, headX = 0, headY = 0, headZ = -1;
      const flush = () => { if (!run) return; ctx.strokeStyle = `rgba(${ION},${(runAlpha * fadeIn * 0.2).toFixed(3)})`; ctx.lineWidth = 5; ctx.stroke(run); ctx.strokeStyle = `rgba(${ION},${(runAlpha * fadeIn * 0.9).toFixed(3)})`; ctx.lineWidth = 1.4; ctx.stroke(run); run = null; };
      for (let k = 0; k < count && k < ARC_SAMPLES; k++) {
        const ux = arc.path[k * 3], uy = arc.path[k * 3 + 1], uz = arc.path[k * 3 + 2];
        const xs = ux * ca + uz * sa, zs = -ux * sa + uz * ca, vx = xs, vy = uy * ct - zs * st, vz = uy * st + zs * ct;
        const sx = cx + vx * R, sy = cy - vy * R;
        const depth = Math.min(1, Math.max(0, (vz + 0.3) / 0.5)), bucket = Math.round(depth * 4) / 4;
        if (bucket <= 0) { flush(); continue; }
        if (!run || bucket !== runAlpha) { const prevX = run ? headX : sx, prevY = run ? headY : sy; flush(); run = new Path2D(); run.moveTo(prevX, prevY); runAlpha = bucket; }
        run.lineTo(sx, sy); headX = sx; headY = sy; headZ = vz;
      }
      flush();
      if (prog < 1 && headZ > -0.1) {
        const hs = 7 + 5 * Math.max(0, headZ);
        ctx.globalAlpha = fadeIn; ctx.drawImage(glowFlare, headX - hs, headY - hs, hs * 2, hs * 2); ctx.globalAlpha = 1;
      }
    }

    // orbit rings and satellites: hidden where the body is in front of them
    for (const ring of rings) {
      let run = null, runAlpha = -1;
      const flushRing = () => { if (!run) return; ctx.strokeStyle = `rgba(${ION},${runAlpha})`; ctx.lineWidth = 1; ctx.stroke(run); run = null; };
      for (let k = 0; k <= RING_SAMPLES; k++) {
        ringPoint(ring, k / RING_SAMPLES * TAU, ct, st);
        const vx = out[0], vy = out[1], vz = out[2], hidden = vz < 0 && vx * vx + vy * vy < 1, a = hidden ? 0 : vz >= 0 ? 0.3 : 0.14;
        const sx = cx + vx * R, sy = cy - vy * R;
        if (a === 0) { flushRing(); continue; }
        if (!run || a !== runAlpha) { flushRing(); run = new Path2D(); run.moveTo(sx, sy); runAlpha = a; }
        run.lineTo(sx, sy);
      }
      flushRing();
      for (const phase of ring.sats) {
        const ang = phase + (still ? 0 : now * ring.speed);
        for (let tail = 10; tail >= 0; tail--) {
          ringPoint(ring, ang - tail * 0.028, ct, st);
          const vx = out[0], vy = out[1], vz = out[2];
          if (vz < 0 && vx * vx + vy * vy < 1) continue;
          const sx = cx + vx * R, sy = cy - vy * R;
          if (tail === 0) { ctx.drawImage(glowFlare, sx - 9, sy - 9, 18, 18); ctx.fillStyle = `rgba(${FLARE},1)`; ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4); }
          else { ctx.fillStyle = `rgba(${ION},${(0.5 * (1 - tail / 11)).toFixed(2)})`; ctx.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6); }
        }
      }
    }

    // dust drifting around the globe
    const dustPath = new Path2D();
    for (const mote of dust) {
      const ang = mote.ang + (still ? 0 : now * mote.speed), x0 = Math.cos(ang) * mote.r, z0 = Math.sin(ang) * mote.r, ci = Math.cos(mote.incl), si = Math.sin(mote.incl), cn = Math.cos(mote.node), sn = Math.sin(mote.node);
      const y1 = -z0 * si, z1 = z0 * ci, x2 = x0 * cn + z1 * sn, z2 = -x0 * sn + z1 * cn, vx = x2, vy = y1 * ct - z2 * st, vz = y1 * st + z2 * ct;
      if (vz < 0 && vx * vx + vy * vy < 1) continue;
      const sx = cx + vx * R, sy = cy - vy * R, rr = mote.size * (0.6 + 0.4 * (vz + 1) / 2);
      dustPath.moveTo(sx + rr, sy); dustPath.arc(sx, sy, rr, 0, TAU);
    }
    ctx.fillStyle = `rgba(${ION},0.42)`; ctx.fill(dustPath);

    // limb
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(${ION},0.55)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  }

  function advance(delta) {
    angle += SPIN * delta;
    for (const ring of rings) ring.node += ring.drift * delta;
    for (let i = 0; i < arcs.length; i++) { arcs[i].t += delta; if (arcs[i].t > arcs[i].total) arcs[i] = makeArc(false); }
  }
  function tick(now) {
    frame = undefined;
    if (last !== undefined) advance(Math.min(64, now - last));
    last = now;
    const started = performance.now();
    draw(now, false);
    stats.frameMs = performance.now() - started;
    if (visible && !document.hidden && !reduceMotion.matches) frame = requestAnimationFrame(tick);
  }
  function run() { if (frame === undefined) { last = undefined; frame = requestAnimationFrame(tick); } }
  const still = () => draw(performance.now(), true);
  resize();
  if ("ResizeObserver" in window) new ResizeObserver(() => { resize(); reduceMotion.matches ? still() : draw(performance.now(), false); }).observe(canvas);
  else addEventListener("resize", () => { resize(); still(); });
  if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
  reduceMotion.addEventListener("change", () => { reduceMotion.matches ? still() : run(); });
  if (reduceMotion.matches) still(); else { draw(performance.now(), false); run(); }
})();
