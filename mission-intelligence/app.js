/* Astrion · Agentic AI. Reveal on scroll and the network globe. No network requests. */
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
  const ION = "35,206,240", FLARE = "228,251,254", BONE = "238,237,231";
  const COUNT = 260, TILT = 0.42, SPEED = 0.00022;

  // Points spread evenly over a sphere, each linked to its nearest neighbours.
  const base = [], golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * golden;
    base.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r, hub: i % 23 === 0, phase: Math.random() * Math.PI * 2 });
  }
  const edges = [], seen = new Set();
  base.forEach((p, i) => {
    const near = base.map((q, j) => ({ j, d: j === i ? Infinity : (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, p.hub ? 4 : 2);
    for (const { j } of near) { const key = i < j ? i + ":" + j : j + ":" + i; if (!seen.has(key)) { seen.add(key); edges.push([i, j]); } }
  });
  const byNode = base.map(() => []);
  edges.forEach((edge, index) => { byNode[edge[0]].push(index); byNode[edge[1]].push(index); });
  const lines = [];
  for (const lat of [-60, -30, 0, 30, 60]) { const phi = lat * Math.PI / 180, pts = []; for (let k = 0; k <= 72; k++) { const lam = k / 72 * Math.PI * 2; pts.push({ x: Math.cos(phi) * Math.cos(lam), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(lam) }); } lines.push(pts); }
  for (let m = 0; m < 6; m++) { const lam = m * Math.PI / 6, pts = []; for (let k = 0; k <= 72; k++) { const phi = -Math.PI / 2 + k / 72 * Math.PI; pts.push({ x: Math.cos(phi) * Math.cos(lam), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(lam) }); } lines.push(pts); }
  const pulses = Array.from({ length: 9 }, () => ({ edge: Math.floor(Math.random() * edges.length), from: 0, t: Math.random(), speed: 0.0004 + Math.random() * 0.0005 }));
  const projected = base.map(() => ({ x: 0, y: 0, z: 0 }));
  let width = 0, height = 0, dpr = 1, angle = 0.8, last, frame, visible = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
    canvas.width = width * dpr; canvas.height = height * dpr;
  }
  function rotate(p) {
    const ca = Math.cos(angle), sa = Math.sin(angle), x = p.x * ca + p.z * sa, z = -p.x * sa + p.z * ca, ct = Math.cos(TILT), st = Math.sin(TILT);
    return { x, y: p.y * ct - z * st, z: p.y * st + z * ct };
  }
  function draw(now) {
    const cx = width / 2, cy = height / 2, R = Math.min(width, height) * 0.44;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    // the sphere itself: a dark body so the globe reads on light and dark bands alike
    const body = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.38, R * 0.08, cx, cy, R);
    body.addColorStop(0, "#1b2029"); body.addColorStop(0.55, "#0b0d10"); body.addColorStop(1, "#050607");
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${ION},0.1)`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(${ION},0.42)`; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (const pts of lines) {
      let prev = null;
      for (const p of pts) {
        const q = rotate(p), sx = cx + q.x * R, sy = cy - q.y * R;
        if (prev) { const depth = (q.z + prev.z) / 2; ctx.strokeStyle = `rgba(${BONE},${depth > 0 ? 0.13 : 0.03})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(prev.sx, prev.sy); ctx.lineTo(sx, sy); ctx.stroke(); }
        prev = { sx, sy, z: q.z };
      }
    }
    base.forEach((p, i) => { const q = rotate(p); projected[i].x = cx + q.x * R; projected[i].y = cy - q.y * R; projected[i].z = q.z; });
    for (const [a, b] of edges) {
      const pa = projected[a], pb = projected[b], depth = (pa.z + pb.z) / 2;
      ctx.strokeStyle = `rgba(${ION},${0.06 + Math.max(0, depth) * 0.5})`; ctx.lineWidth = depth > 0 ? 1.25 : 0.7;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    projected.forEach((p, i) => {
      const front = (p.z + 1) / 2, hub = base[i].hub, glow = hub ? 0.55 + 0.45 * Math.sin(now * 0.0016 + base[i].phase) : 1;
      const radius = (hub ? 3.2 : 1.7) * (0.55 + 0.6 * front), alpha = (0.22 + 0.78 * front) * glow;
      if (hub && p.z > 0) { ctx.fillStyle = `rgba(${ION},${0.16 * glow})`; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = `rgba(${hub ? FLARE : ION},${alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
    });
    for (const pulse of pulses) {
      const [a, b] = edges[pulse.edge], start = pulse.from === 0 ? projected[a] : projected[b], end = pulse.from === 0 ? projected[b] : projected[a];
      const x = start.x + (end.x - start.x) * pulse.t, y = start.y + (end.y - start.y) * pulse.t, depth = start.z + (end.z - start.z) * pulse.t;
      if (depth > -0.2) {
        const alpha = 0.35 + 0.65 * (depth + 1) / 2;
        ctx.fillStyle = `rgba(${ION},${alpha * 0.25})`; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${FLARE},${alpha})`; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function advance(delta) {
    angle += SPEED * delta;
    for (const pulse of pulses) {
      pulse.t += pulse.speed * delta;
      if (pulse.t >= 1) {
        const [a, b] = edges[pulse.edge], node = pulse.from === 0 ? b : a, options = byNode[node].filter(index => index !== pulse.edge);
        pulse.edge = options.length ? options[Math.floor(Math.random() * options.length)] : Math.floor(Math.random() * edges.length);
        pulse.from = edges[pulse.edge][0] === node ? 0 : 1; pulse.t = 0;
      }
    }
  }
  function tick(now) {
    frame = undefined;
    if (last !== undefined) advance(Math.min(64, now - last));
    last = now;
    draw(now);
    if (visible && !document.hidden && !reduceMotion.matches) frame = requestAnimationFrame(tick);
  }
  function run() { if (frame === undefined) { last = undefined; frame = requestAnimationFrame(tick); } }
  resize();
  if ("ResizeObserver" in window) new ResizeObserver(() => { resize(); draw(performance.now()); }).observe(canvas);
  else addEventListener("resize", () => { resize(); draw(performance.now()); });
  if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
  reduceMotion.addEventListener("change", () => { if (!reduceMotion.matches) run(); else draw(performance.now()); });
  draw(performance.now());
  if (!reduceMotion.matches) run();
})();
