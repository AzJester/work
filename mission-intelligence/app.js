/* Astrion Mission Intelligence: page behaviour.
   Everything runs in the browser against content in the page. No network requests, no analytics. */
(() => {
  "use strict";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* ---------- Header, menu and reveal ---------- */
  const header = $("#site-header");
  const menuButton = $("#menu-button");
  const menu = $("#site-menu");
  const onScroll = () => header.classList.toggle("scrolled", scrollY > 24);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", String(!open));
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.textContent = open ? "Close" : "Menu";
    header.classList.toggle("menu-open", open);
    document.body.classList.toggle("menu-open", open);
    if (open) $("a", menu)?.focus();
  }
  menuButton.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
  menu.addEventListener("click", event => { if (event.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.classList.contains("open")) { setMenu(false); menuButton.focus(); }
  });
  matchMedia("(min-width: 62.01em)").addEventListener("change", event => { if (event.matches) setMenu(false); });

  const revealed = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealed.forEach(element => observer.observe(element));
  } else {
    revealed.forEach(element => element.classList.add("in"));
  }

  // Highlight the section in view in the primary navigation.
  const navLinks = $$(".site-nav a[href^='#']").filter(link => !link.classList.contains("nav-cta"));
  const sections = navLinks.map(link => document.getElementById(link.getAttribute("href").slice(1))).filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const current = new Set();
    const spy = new IntersectionObserver(entries => {
      for (const entry of entries) entry.isIntersecting ? current.add(entry.target.id) : current.delete(entry.target.id);
      const top = sections.find(section => current.has(section.id));
      navLinks.forEach(link => {
        const active = top && link.getAttribute("href") === "#" + top.id;
        if (active) link.setAttribute("aria-current", "true"); else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-40% 0px -50% 0px" });
    sections.forEach(section => spy.observe(section));
  }

  /* ---------- Count-up for the statistics ---------- */
  const format = (value, suffix) => value.toLocaleString("en-US") + (suffix || "");
  $$("[data-count]").forEach(element => {
    const target = Number(element.dataset.count);
    const suffix = element.dataset.suffix || "";
    if (reduceMotion.matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now(), duration = 1400;
      const tick = now => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        element.textContent = format(Math.round(target * eased), suffix);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    observer.observe(element);
  });

  /* ---------- Hero motion ---------- */
  (() => {
    const film = $("#hero-film"), filmButton = $("#film-control");
    if (!film || !filmButton) return;
    const filmLabel = $("#film-label");
    const autoplay = !reduceMotion.matches && !(navigator.connection && navigator.connection.saveData);
    let attached = false, stopped = false;
    const attach = () => { if (attached) return; attached = true; $$("source[data-src]", film).forEach(source => { source.src = source.dataset.src; }); film.load(); };
    const setFilmLabel = playing => { filmButton.classList.toggle("playing", playing); filmLabel.textContent = playing ? "Pause motion" : "Play motion"; filmButton.setAttribute("aria-pressed", String(playing)); };
    const play = async () => { attach(); try { await film.play(); } catch { setFilmLabel(false); } };
    filmButton.hidden = false;
    filmButton.addEventListener("click", () => { if (film.paused) { stopped = false; play(); } else { stopped = true; film.pause(); } });
    film.addEventListener("playing", () => { film.classList.add("ready"); setFilmLabel(true); });
    film.addEventListener("pause", () => setFilmLabel(false));
    document.addEventListener("visibilitychange", () => { if (document.hidden) film.pause(); else if (autoplay && !stopped) play(); });
    if (autoplay) {
      if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { if (film.paused && !stopped) play(); } else film.pause(); }, { threshold: 0.2 }).observe(film);
      else play();
    }
  })();

  /* ---------- Hero orb: a rotating network globe ---------- */
  (() => {
    const canvas = $("#hero-orb");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const ION = "35,206,240", FLARE = "228,251,254", BONE = "238,237,231";
    const COUNT = 260, TILT = 0.42, SPEED = 0.00022;
    // Points spread evenly over the sphere, each linked to its nearest neighbours.
    const base = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
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
    // Graticule: a few latitude rings and meridians for the globe feel.
    const lines = [];
    for (const lat of [-60, -30, 0, 30, 60]) { const phi = lat * Math.PI / 180, pts = []; for (let k = 0; k <= 72; k++) { const lam = k / 72 * Math.PI * 2; pts.push({ x: Math.cos(phi) * Math.cos(lam), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(lam) }); } lines.push(pts); }
    for (let m = 0; m < 6; m++) { const lam = m * Math.PI / 6, pts = []; for (let k = 0; k <= 72; k++) { const phi = -Math.PI / 2 + k / 72 * Math.PI; pts.push({ x: Math.cos(phi) * Math.cos(lam), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(lam) }); } lines.push(pts); }
    // Signals travelling along the links.
    const pulses = Array.from({ length: 9 }, () => ({ edge: Math.floor(Math.random() * edges.length), from: 0, t: Math.random(), speed: 0.0004 + Math.random() * 0.0005 }));
    let width = 0, height = 0, dpr = 1, angle = 0.8, last, frame, visible = true;
    const projected = base.map(() => ({ x: 0, y: 0, z: 0 }));
    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
      canvas.width = width * dpr; canvas.height = height * dpr;
    }
    function rotate(p) {
      const ca = Math.cos(angle), sa = Math.sin(angle), x = p.x * ca + p.z * sa, z = -p.x * sa + p.z * ca;
      const ct = Math.cos(TILT), st = Math.sin(TILT);
      return { x, y: p.y * ct - z * st, z: p.y * st + z * ct };
    }
    function draw(now) {
      const cx = width / 2, cy = height / 2, R = Math.min(width, height) * 0.41;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      // limb
      ctx.strokeStyle = `rgba(${ION},0.28)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${ION},0.08)`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, Math.PI * 2); ctx.stroke();
      // graticule
      for (const pts of lines) {
        let prev = null;
        for (const p of pts) {
          const q = rotate(p), sx = cx + q.x * R, sy = cy - q.y * R;
          if (prev) { const depth = (q.z + prev.z) / 2; ctx.strokeStyle = `rgba(${BONE},${depth > 0 ? 0.14 : 0.035})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(prev.sx, prev.sy); ctx.lineTo(sx, sy); ctx.stroke(); }
          prev = { sx, sy, z: q.z };
        }
      }
      base.forEach((p, i) => { const q = rotate(p); projected[i].x = cx + q.x * R; projected[i].y = cy - q.y * R; projected[i].z = q.z; });
      // links
      for (const [a, b] of edges) {
        const pa = projected[a], pb = projected[b], depth = (pa.z + pb.z) / 2, alpha = 0.06 + Math.max(0, depth) * 0.5;
        ctx.strokeStyle = `rgba(${ION},${alpha})`; ctx.lineWidth = depth > 0 ? 1.25 : 0.7;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      // nodes
      projected.forEach((p, i) => {
        const front = (p.z + 1) / 2, hub = base[i].hub, glow = hub ? 0.55 + 0.45 * Math.sin(now * 0.0016 + base[i].phase) : 1;
        const radius = (hub ? 3.2 : 1.7) * (0.55 + 0.6 * front), alpha = (0.22 + 0.78 * front) * glow;
        if (hub && p.z > 0) { ctx.fillStyle = `rgba(${ION},${0.16 * glow})`; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = `rgba(${hub ? FLARE : ION},${alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      });
      // signals
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
          // continue from the node just reached along another of its links
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

  /* ---------- Links that pre-fill the pilot form ---------- */
  const pilotScenario = $("#pilot-scenario");
  const pilotPurpose = $("#pilot-purpose");
  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-scenario], a[data-inquiry]");
    if (!link || !pilotScenario) return;
    const scenario = link.dataset.scenario;
    if (scenario && $$("option", pilotScenario).some(option => option.value === scenario)) pilotScenario.value = scenario;
    if (link.dataset.inquiry === "partnership" && pilotPurpose) pilotPurpose.value = "partnership";
    pilotScenario.dispatchEvent(new Event("change"));
  });

  /* ---------- Fleet orchestration demo ---------- */
  (() => {
    const root = $("#ops");
    if (!root) return;
    const MISSIONS = {
      strait: {
        intent: "Maintain continuous surveillance of the strait for the next 72 hours and report any vessel that leaves the traffic lane.",
        effect: "A persistent track picture of the strait, every lane departure reported within five minutes.",
        horizon: 72, unit: "h",
        platforms: [
          { id: "sat", domain: "Space", name: "EO satellite", vendor: "Vendor A" },
          { id: "uav", domain: "Air", name: "Group 4 UAS", vendor: "Vendor B" },
          { id: "usv1", domain: "Surface", name: "USV Alpha", vendor: "Vendor C" },
          { id: "usv2", domain: "Surface", name: "USV Bravo", vendor: "Vendor D" },
          { id: "uuv", domain: "Subsea", name: "UUV picket", vendor: "Vendor E" },
          { id: "shore", domain: "Ground", name: "Shore fusion node", vendor: "Government" }
        ],
        tasks: [
          { id: "t1", platform: "sat", role: "ISR", label: "Wide-area revisit every 90 min", start: 0, end: 72 },
          { id: "t2", platform: "uav", role: "Relay", label: "Overhead relay and cueing orbit", start: 0, end: 72 },
          { id: "t3", platform: "usv1", role: "ISR", label: "Patrol western lane", start: 0, end: 72 },
          { id: "t4", platform: "usv2", role: "ISR", label: "Patrol eastern lane", start: 0, end: 72 },
          { id: "t5", platform: "uuv", role: "ISR", label: "Acoustic picket at the narrows", start: 4, end: 72 },
          { id: "t6", platform: "shore", role: "Fusion", label: "Fuse tracks, flag lane departures", start: 0, end: 72 }
        ],
        disruption: {
          platform: "usv2", note: "USV Bravo reports a propulsion fault and returns to port.",
          replan: [
            { platform: "usv1", role: "ISR", label: "Patrol both lanes, widened pattern" },
            { platform: "uav", role: "ISR", label: "Orbit shifted east over Bravo's lane" },
            { platform: "uuv", role: "ISR", label: "Reposition to the eastern approach" }
          ]
        }
      },
      route: {
        intent: "Clear and hold Route Tango for a resupply convoy between 0400 and 0600.",
        effect: "A convoy that departs on time along a route swept, overwatched and protected from remote-triggered threats.",
        horizon: 180, unit: "min",
        platforms: [
          { id: "uav", domain: "Air", name: "Small UAS, recon", vendor: "Vendor B" },
          { id: "uav2", domain: "Air", name: "Small UAS, EW payload", vendor: "Vendor F" },
          { id: "ugv1", domain: "Ground", name: "UGV Sweeper 1", vendor: "Vendor G" },
          { id: "ugv2", domain: "Ground", name: "UGV Sweeper 2", vendor: "Vendor H" },
          { id: "toc", domain: "Ground", name: "Tactical operations center", vendor: "Government" },
          { id: "sat", domain: "Space", name: "Comms satellite", vendor: "Vendor A" }
        ],
        tasks: [
          { id: "t1", platform: "uav", role: "ISR", label: "Route reconnaissance", start: 0, end: 50 },
          { id: "t2", platform: "ugv1", role: "Sweep", label: "Sweep km 0 to 6", start: 20, end: 100 },
          { id: "t3", platform: "ugv2", role: "Sweep", label: "Sweep km 6 to 12", start: 20, end: 100 },
          { id: "t4", platform: "uav2", role: "EW", label: "Deny remote triggers along route", start: 90, end: 180 },
          { id: "t5", platform: "uav", role: "ISR", label: "Convoy overwatch", start: 100, end: 180 },
          { id: "t6", platform: "sat", role: "Comms", label: "Beyond-line-of-sight link", start: 0, end: 180 },
          { id: "t7", platform: "toc", role: "Release", label: "Convoy release decision", start: 118, end: 126 }
        ],
        disruption: {
          platform: "ugv2", note: "UGV Sweeper 2 loses mobility in soft ground at km 8.",
          replan: [
            { platform: "ugv1", role: "Sweep", label: "Extend sweep to km 12" },
            { platform: "uav", role: "ISR", label: "Hold recon over km 8 to 12" },
            { platform: "toc", role: "Release", label: "Release window moved 20 min right" }
          ]
        }
      },
      comms: {
        intent: "Restore a data link between the forward team and the command post after the primary satellite link degrades.",
        effect: "A relayed, monitored link within the hour and a plan that survives a second loss.",
        horizon: 120, unit: "min",
        platforms: [
          { id: "sat", domain: "Space", name: "LEO relay", vendor: "Vendor A" },
          { id: "uav", domain: "Air", name: "Relay UAS 1", vendor: "Vendor B" },
          { id: "uav2", domain: "Air", name: "Relay UAS 2", vendor: "Vendor B" },
          { id: "usv", domain: "Surface", name: "USV mesh node", vendor: "Vendor C" },
          { id: "radio", domain: "Ground", name: "Forward team radio", vendor: "Government" },
          { id: "cp", domain: "Ground", name: "Command post gateway", vendor: "Government" }
        ],
        tasks: [
          { id: "t1", platform: "uav", role: "Relay", label: "Climb to relay orbit", start: 0, end: 120 },
          { id: "t2", platform: "usv", role: "Mesh", label: "Hold station as a mesh node", start: 10, end: 120 },
          { id: "t3", platform: "sat", role: "Comms", label: "Request next LEO pass", start: 0, end: 40 },
          { id: "t4", platform: "radio", role: "Config", label: "Retune to relay waveform", start: 15, end: 30 },
          { id: "t5", platform: "cp", role: "Monitor", label: "Monitor link quality", start: 15, end: 120 }
        ],
        disruption: {
          platform: "uav", note: "Relay UAS 1 reports jamming on the relay band.",
          replan: [
            { platform: "uav2", role: "Relay", label: "Launch and take the relay orbit" },
            { platform: "radio", role: "Config", label: "Shift to alternate frequency plan" },
            { platform: "cp", role: "Monitor", label: "Confirm link on alternate plan" }
          ]
        }
      }
    };
    const DOMAINS = ["Space", "Air", "Surface", "Ground", "Subsea"];
    const RUN_MS = 12000;

    const intentText = $("#ops-intent-text"), effectText = $("#ops-effect-text"), status = $("#ops-status"), statusText = $("#ops-status-text");
    const approve = $("#ops-approve"), disrupt = $("#ops-disrupt"), reset = $("#ops-reset"), log = $("#ops-log"), rows = $("#ops-rows"), ticks = $("#ops-ticks");
    const intentButtons = $$("#fleet-intents [data-mission]");

    let mission, tasks, state, progress = 0, frame, lastFrame, disrupted = false, timers = [];

    const fmtTime = value => mission.unit === "h" ? Math.round(value) + " h" : Math.round(value) + " min";
    const clockStamp = () => {
      const minutes = Math.round(progress * mission.horizon * (mission.unit === "h" ? 60 : 1));
      return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
    };
    function note(text, tone) {
      const line = document.createElement("div");
      const time = document.createElement("time");
      time.textContent = clockStamp();
      const body = document.createElement("span");
      body.textContent = text;
      if (tone) body.className = tone;
      line.append(time, body);
      log.append(line);
      log.scrollTop = log.scrollHeight;
    }
    function later(fn, ms) { timers.push(setTimeout(fn, reduceMotion.matches ? 0 : ms)); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(frame); frame = undefined; }
    function setState(next, text) { state = next; status.dataset.state = next; statusText.textContent = text; }

    function renderBoard() {
      rows.replaceChildren();
      ticks.replaceChildren();
      for (let i = 0; i <= 4; i++) {
        const tick = document.createElement("span");
        tick.style.left = (i * 25) + "%";
        tick.textContent = "T+" + fmtTime(mission.horizon * i / 4);
        ticks.append(tick);
      }
      for (const domain of DOMAINS) {
        const platforms = mission.platforms.filter(platform => platform.domain === domain);
        if (!platforms.length) continue;
        const head = document.createElement("div");
        head.className = "ops-domain";
        head.innerHTML = "<span></span><i></i>";
        head.firstChild.textContent = domain;
        rows.append(head);
        for (const platform of platforms) {
          const row = document.createElement("div");
          row.className = "ops-row";
          row.dataset.platform = platform.id;
          const who = document.createElement("div");
          who.className = "ops-who";
          who.innerHTML = '<span class="dot" aria-hidden="true"></span><div><b></b><small></small></div>';
          $("b", who).textContent = platform.name;
          $("small", who).textContent = platform.vendor;
          const lane = document.createElement("div");
          lane.className = "ops-lane";
          lane.setAttribute("role", "img");
          lane.setAttribute("aria-label", platform.name + " timeline");
          row.append(who, lane);
          rows.append(row);
        }
      }
      const now = document.createElement("div");
      now.className = "ops-now";
      now.id = "ops-now";
      now.dataset.t = "T+0";
      rows.append(now);
    }
    function bar(task, cls) {
      const element = document.createElement("div");
      element.className = "ops-bar " + cls;
      element.dataset.task = task.id;
      element.style.setProperty("--s", (task.start / mission.horizon * 100).toFixed(2));
      element.style.setProperty("--e", (task.end / mission.horizon * 100).toFixed(2));
      element.innerHTML = '<span class="role"></span><span class="text"></span>';
      $(".role", element).textContent = task.role;
      $(".text", element).textContent = task.label;
      element.title = task.label + " (T+" + fmtTime(task.start) + " to T+" + fmtTime(task.end) + ")";
      $(`.ops-row[data-platform="${task.platform}"] .ops-lane`, rows).append(element);
      return element;
    }
    function compose(key) {
      clearTimers();
      mission = MISSIONS[key];
      tasks = mission.tasks.map(task => ({ ...task }));
      progress = 0; disrupted = false;
      root.classList.remove("running");
      intentText.textContent = mission.intent;
      effectText.textContent = mission.effect;
      log.replaceChildren();
      renderBoard();
      approve.disabled = true; disrupt.disabled = true;
      approve.textContent = "Approve plan";
      setState("composing", "Composing plan");
      note("Intent received: " + mission.intent.split(".")[0] + ".");
      const domains = new Set(mission.platforms.map(platform => platform.domain)).size;
      const vendors = new Set(mission.platforms.map(platform => platform.vendor).filter(vendor => vendor !== "Government")).size;
      later(() => note(`Resolved to an end state with ${tasks.length} tasks across ${domains} domains and ${vendors} vendors.`), 500);
      tasks.forEach((task, index) => later(() => {
        bar(task, "planned");
        note(`Task ${index + 1}: ${task.label} (${mission.platforms.find(platform => platform.id === task.platform).name}).`);
      }, 900 + index * 420));
      later(() => {
        setState("planned", "Awaiting operator approval");
        note("Plan composed. Awaiting operator approval.", "warn");
        approve.disabled = false;
        approve.focus({ preventScroll: true });
      }, 1100 + tasks.length * 420);
    }
    function startClock() {
      root.classList.add("running");
      lastFrame = undefined;
      const now = $("#ops-now");
      const step = timestamp => {
        if (lastFrame === undefined) lastFrame = timestamp;
        const delta = timestamp - lastFrame;
        lastFrame = timestamp;
        progress = Math.min(1, progress + delta / RUN_MS);
        now.style.setProperty("--x", (progress * 100).toFixed(2));
        now.dataset.t = "T+" + fmtTime(progress * mission.horizon);
        const elapsed = progress * mission.horizon;
        $$(".ops-bar.active, .ops-bar.replan.active", rows).forEach(element => {
          const task = tasks.find(item => item.id === element.dataset.task);
          if (task && elapsed >= task.end) { element.classList.remove("active"); element.classList.add("done"); }
        });
        if (progress < 1) frame = requestAnimationFrame(step);
        else finish();
      };
      if (reduceMotion.matches) { progress = 1; now.style.setProperty("--x", "100"); $$(".ops-bar.active", rows).forEach(element => { element.classList.remove("active"); element.classList.add("done"); }); finish(); return; }
      frame = requestAnimationFrame(step);
    }
    function finish() {
      cancelAnimationFrame(frame); frame = undefined;
      $$(".ops-bar.active", rows).forEach(element => { element.classList.remove("active"); element.classList.add("done"); });
      $$(".ops-row", rows).forEach(row => row.classList.remove("active"));
      disrupt.disabled = true;
      setState("done", "Effect delivered");
      note("Effect delivered: " + mission.effect, "ok");
      note("Run closed. Approvals, re-plans and dispositions are recorded as evaluation cases.");
    }
    approve.addEventListener("click", () => {
      if (state !== "planned" && state !== "replanned") return;
      approve.disabled = true;
      const revised = state === "replanned";
      $$(".ops-bar.planned, .ops-bar.replan", rows).forEach(element => { element.classList.remove("planned"); element.classList.add("active"); });
      $$(".ops-row", rows).forEach(row => { if (!row.classList.contains("degraded")) row.classList.add("active"); });
      setState("executing", revised ? "Executing revised plan" : "Executing plan");
      note(revised ? "Revised plan approved. Intent unchanged. Tasks released." : "Operator approved the plan. Tasks released to every platform in its native interface.", "ion");
      disrupt.disabled = disrupted;
      startClock();
    });
    disrupt.addEventListener("click", () => {
      if (state !== "executing" || disrupted) return;
      disrupted = true;
      disrupt.disabled = true;
      cancelAnimationFrame(frame); frame = undefined;
      const at = progress * mission.horizon;
      const plan = mission.disruption;
      const row = $(`.ops-row[data-platform="${plan.platform}"]`, rows);
      row.classList.add("degraded");
      row.classList.remove("active");
      setState("disrupted", "Platform lost, re-planning");
      note(plan.note, "alert");
      // The lost platform's remaining work is marked lost from the current time.
      tasks.filter(task => task.platform === plan.platform && task.end > at).forEach(task => {
        const element = $(`.ops-bar[data-task="${task.id}"]`, rows);
        if (!element) return;
        if (task.start < at) {
          element.style.setProperty("--e", (at / mission.horizon * 100).toFixed(2));
          element.classList.remove("active"); element.classList.add("done");
          const lost = { ...task, id: task.id + "-lost", start: at };
          bar(lost, "lost");
        } else {
          element.classList.remove("active", "planned"); element.classList.add("lost");
        }
      });
      later(() => note("Capabilities, positions and remaining endurance re-evaluated against the same end state."), 700);
      plan.replan.forEach((item, index) => later(() => {
        const task = { id: "r" + index, platform: item.platform, role: item.role, label: item.label, start: at, end: mission.horizon };
        if (item.platform === "toc" || item.role === "Release" || item.role === "Config") task.end = Math.min(mission.horizon, at + mission.horizon * 0.08);
        tasks.push(task);
        bar(task, "replan");
        note(`Re-task: ${item.label} (${mission.platforms.find(platform => platform.id === item.platform).name}).`, "warn");
      }, 1200 + index * 500));
      later(() => {
        setState("replanned", "Revised plan awaiting approval");
        note(`${plan.replan.length} tasks changed. The intent did not. Awaiting operator approval.`, "warn");
        approve.textContent = "Approve revised plan";
        approve.disabled = false;
        approve.focus({ preventScroll: true });
      }, 1500 + plan.replan.length * 500);
    });
    reset.addEventListener("click", () => compose(intentButtons.find(button => button.getAttribute("aria-pressed") === "true").dataset.mission));
    intentButtons.forEach(button => button.addEventListener("click", () => {
      intentButtons.forEach(other => other.setAttribute("aria-pressed", String(other === button)));
      compose(button.dataset.mission);
    }));
    // Compose the first plan when the board scrolls into view, so the log reads from the start.
    let started = false;
    const begin = () => { if (!started) { started = true; compose("strait"); } };
    if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { if (entry.isIntersecting) begin(); }, { threshold: 0.25 }).observe(root);
    else begin();
    [approve, disrupt, reset, ...intentButtons].forEach(button => button.addEventListener("focus", begin, { once: true }));
    window.astrionFleetDemo = { begin, compose };
  })();

  /* ---------- Agentic architecture board ---------- */
  (() => {
    const stageNames = ["Sensor inputs", "Evidence agent", "Grounded LLM", "Verification agent", "Human approval"];
    const scenarios = {
      maritime: {
        title: "Vessel equipment health", reference: "Pump maintenance guide and calibration record", pilot: "Scope a vessel maintenance pilot", scenario: "maritime",
        steps: [
          ["Collect a pump history", "Temperature, vibration and operating mode arrive as separate records. Each reading retains its time, unit and sensor identity so a later reviewer can reconstruct what the pump was doing.", "Vessel pump telemetry", "Time-stamped equipment history"],
          ["Build the evidence packet", "A read-only agent aligns the pump readings, applies unit and freshness checks, and retrieves the relevant passage from the approved maintenance guide. Missing measurements stay visible in the packet.", "Equipment history and approved guide", "Checked readings and a guide excerpt"],
          ["Explain a change in vibration", "The language model uses the evidence packet to draft a maintenance note. It links a vibration change to the reading and guide passage, and flags that a missing temperature sample limits the explanation.", "Checked readings and retrieved passages", "Cited draft with an uncertainty note"],
          ["Verify the cited claims", "A bounded verification agent checks that the cited readings exist, units match and the uncertainty note survives into the draft. An unsupported statement returns to the reviewer as an exception.", "Draft note and evidence identifiers", "Claim checks and unresolved exceptions"],
          ["Approve the inspection note", "The maintenance lead inspects the citations, then accepts, edits or rejects the note. The recorded disposition and evidence references form a test case for evaluating later model changes.", "Checked draft and original readings", "Human disposition and a regression case"]
        ],
        draft: { first: "Vibration rose while the pump stayed at the same load", second: "The temperature sample needed to interpret the change is missing", telemetry: "Pump history T1 shows rising vibration at constant load. The temperature channel has a gap in the same interval.", reference: "Pump guide R1 calls for a temperature comparison before the vibration change can be attributed to bearing wear." }
      },
      flight: {
        title: "Flight-test data quality", reference: "Instrumentation plan and channel calibration sheet", pilot: "Scope a flight-test data review pilot", scenario: "flight",
        steps: [
          ["Collect the test-channel record", "Two instrumentation channels measure the same structural response during a test. Their timestamps, clock sources and calibration identifiers travel with the data.", "Paired test-channel measurements", "Tagged channel histories"],
          ["Check timing and calibration", "The evidence agent compares the sample interval with the instrumentation plan and looks up each calibration identifier. It marks a clock gap and preserves the affected interval for review.", "Channel histories and test references", "Validated intervals and a gap flag"],
          ["Draft a data-quality finding", "The language model describes where the channels diverge and cites the affected interval and the plan's timing requirement. It marks the cause as unresolved because the recorded evidence cannot distinguish drift from missing samples.", "Flagged interval and timing requirement", "Cited finding with an unresolved cause"],
          ["Check the finding against the record", "The verification agent recalculates the interval from timestamps and checks that each referenced channel appears in the recorded configuration. A mismatch goes back to the test engineer.", "Draft finding and channel references", "Recalculated interval and exceptions"],
          ["Disposition the affected interval", "The test engineer decides whether to accept the interval, exclude it or request a repeat. The decision and its rationale become a labeled example for the next test-data review.", "Verified finding and test configuration", "Interval disposition and review record"]
        ],
        draft: { first: "The two channels disagree across an interval with missing timestamps", second: "The cause remains open until the clock relationship can be verified", telemetry: "Test record T1 shows a discontinuity in one channel's timestamps while the second channel records continuously.", reference: "Instrumentation plan R1 requires a verified common time base before the two channel histories can be compared." }
      },
      space: {
        title: "Satellite power review", reference: "Power subsystem handbook and ground-pass log", pilot: "Scope a satellite power review pilot", scenario: "space",
        steps: [
          ["Collect a ground-pass record", "The ground station receives battery current, voltage and subsystem mode during a scheduled pass. The record keeps spacecraft time separate from reception time.", "Battery telemetry and mode history", "Time-tagged pass record"],
          ["Match the operating context", "The evidence agent associates telemetry with the recorded subsystem mode, checks the units and retrieves the approved reference for that mode. It marks intervals with missing samples.", "Pass record and subsystem handbook", "Mode-matched evidence packet"],
          ["Summarize the power trend", "The language model drafts a shift note describing the observed change in battery current. Citations point to the pass interval and the reference range. A data gap leaves the trend between passes uncertain.", "Mode-matched samples and reference range", "Cited shift note with a data-gap flag"],
          ["Validate the shift note", "The verification agent checks the cited interval, units and handbook revision against the input packet. It returns the draft for review if a citation falls outside the recorded pass.", "Draft shift note and evidence packet", "Citation checks and reviewer exceptions"],
          ["Record the engineering decision", "The power engineer accepts, edits or rejects the shift note and records the basis for the decision. The approved record gives evaluators a reproducible example for the next software release.", "Checked note and source telemetry", "Signed review record and evaluation case"]
        ],
        draft: { first: "Battery current rose during the recorded subsystem mode", second: "The gap between ground passes prevents a continuous trend estimate", telemetry: "Pass log T1 records an increase in battery current at the end of the pass. It contains no samples for the period before the next contact.", reference: "Power handbook R1 requires consecutive mode-matched samples before an inter-pass trend can be reported." }
      }
    };
    class MissionArchitecture extends HTMLElement {
      connectedCallback() {
        if (this.dataset.enhanced) return;
        const scenarioButtons = $$("[data-ma-scenario]", this), stageButtons = $$("[data-ma-stage]", this), citations = $$("[data-ma-source]", this);
        const disclosure = $(".ma-draft", this);
        const field = name => $("[data-ma-" + name + "]", this);
        let activeScenario = "maritime", activeStage = 2;
        const showCitation = source => {
          field("source-title").textContent = source === "telemetry" ? "T1 / Sample telemetry" : "R1 / Sample reference";
          field("source-text").textContent = scenarios[activeScenario].draft[source];
          citations.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.maSource === source)));
        };
        const render = () => {
          const scenario = scenarios[activeScenario];
          const [title, description, input, output] = scenario.steps[activeStage];
          field("title").textContent = scenario.title;
          field("pilot").textContent = scenario.pilot;
          field("pilot").dataset.scenario = scenario.scenario;
          field("stage-label").textContent = stageNames[activeStage];
          field("detail-title").textContent = title;
          field("description").textContent = description;
          field("input").textContent = input;
          field("output").textContent = output;
          field("reference").textContent = scenario.reference;
          disclosure.hidden = activeStage !== 2;
          disclosure.open = false;
          field("claim-first").textContent = scenario.draft.first;
          field("claim-second").textContent = scenario.draft.second;
          showCitation("telemetry");
          scenarioButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.maScenario === activeScenario)));
          stageButtons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === activeStage)));
        };
        citations.forEach(button => button.addEventListener("click", () => showCitation(button.dataset.maSource)));
        scenarioButtons.forEach(button => button.addEventListener("click", () => { activeScenario = button.dataset.maScenario; render(); }));
        stageButtons.forEach((button, index) => button.addEventListener("click", () => { activeStage = index; render(); }));
        for (const buttons of [scenarioButtons, stageButtons]) buttons.forEach((button, index) => button.addEventListener("keydown", event => {
          const keys = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 };
          if (!Object.hasOwn(keys, event.key)) return;
          event.preventDefault();
          const next = buttons[(keys[event.key] + buttons.length) % buttons.length];
          next.focus(); next.click();
        }));
        this.dataset.enhanced = "true";
      }
    }
    if (!customElements.get("mission-architecture")) customElements.define("mission-architecture", MissionArchitecture);
  })();

  /* ---------- Evidence demo ---------- */
  (() => {
    const questions = [
      { pilot: "retest",
        complete: { status: "Entry criteria met", answer: "Yes, pending test lead authorization", explanation: "The signed calibration record shows +0.2 °C error at the required 40 °C check point, within the ±0.5 °C limit. The original deviation log is present. The test lead can now review the packet.", cites: ["CAL-08", "PROC-03", "LOG-17"] },
        incomplete: { status: "Insufficient evidence", answer: "Retest readiness is undetermined", explanation: "The log establishes the initial +1.8 °C error. The procedure requires a signed, in-tolerance calibration result before the repeat run. That result is missing from the available packet.", cites: ["LOG-17", "PROC-03"] } },
      { pilot: "measurement",
        complete: { status: "Calculation supported", answer: "The error decreased by 1.6 °C", explanation: "The initial reading was 1.8 °C above reference. After adjustment, it was 0.2 °C above reference. Both records use the same sensor and the same 40.0 °C check point.", cites: ["LOG-17", "CAL-08"] },
        incomplete: { status: "Insufficient evidence", answer: "The change cannot be calculated", explanation: "The bench log provides the initial +1.8 °C error. Calculating the difference also requires a post-adjustment reading at the same reference temperature.", cites: ["LOG-17"] } },
      { pilot: "authority",
        complete: { status: "Authority identified", answer: "The test lead authorizes the retest", explanation: "The retest procedure assigns approval to the test lead. The technician signs the calibration record. Equipment release remains a separate decision.", cites: ["PROC-03"] } }
    ];
    class EvidenceDemo extends HTMLElement {
      connectedCallback() {
        if (this.dataset.enhanced) return;
        const question = $(".ed-question", this), withhold = $(".ed-switch input", this), answer = $(".ed-answer", this), count = $(".ed-count", this), pilot = $("[data-pilot-link]", this);
        const sources = new Map($$("[data-record]", this).map(record => [record.dataset.record, record]));
        const calibration = sources.get("CAL-08");
        const citation = id => {
          const source = sources.get(id), link = document.createElement("a");
          link.dataset.citation = id;
          link.href = "#" + $(".ed-excerpt", source).id;
          link.textContent = id;
          link.setAttribute("aria-label", "Read " + id + ", " + $(".ed-record span:nth-child(2)", source).textContent);
          return link;
        };
        const showAnswer = () => {
          const review = questions[Number(question.value)];
          const incomplete = Boolean(withhold.checked && review.incomplete);
          const result = incomplete ? review.incomplete : review.complete;
          const status = document.createElement("span");
          status.setAttribute("aria-hidden", "true");
          status.textContent = incomplete ? "?" : "✓";
          answer.classList.toggle("ed-incomplete", incomplete);
          $(".ed-status", answer).replaceChildren(status, result.status);
          $("h3", answer).textContent = result.answer;
          $("p", answer).textContent = result.explanation;
          const citations = $(".ed-citations", answer);
          citations.replaceChildren($(".ed-label", citations), ...result.cites.map(citation));
          pilot.dataset.scenario = review.pilot;
        };
        const changeAvailability = () => {
          if (withhold.checked && calibration.open) { calibration.open = false; sources.get("LOG-17").open = true; }
          calibration.hidden = withhold.checked;
          count.textContent = (withhold.checked ? "2 of 3" : "3 of 3") + " available";
          showAnswer();
        };
        question.addEventListener("change", showAnswer);
        withhold.addEventListener("change", changeAvailability);
        answer.addEventListener("click", event => {
          const link = event.target.closest("a[data-citation]");
          if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          const record = sources.get(link.dataset.citation);
          if (!record || record.hidden) return;
          event.preventDefault();
          record.open = true;
          $(".ed-excerpt", record).focus();
        });
        if (withhold.checked || question.selectedIndex) changeAvailability();
        this.dataset.enhanced = "true";
      }
    }
    if (!customElements.get("evidence-demo")) customElements.define("evidence-demo", EvidenceDemo);
  })();

  /* ---------- Capabilities accordion ---------- */
  (() => {
    const panels = $$("#cap-panels details");
    const image = $("#cap-photo"), caption = $("#cap-caption");
    if (!panels.length || !image) return;
    panels.forEach(details => details.addEventListener("toggle", () => {
      if (!details.open) return;
      panels.forEach(other => { if (other !== details) other.open = false; });
      image.style.opacity = "0";
      const swap = () => {
        image.src = "assets/media/" + details.dataset.image + ".webp";
        image.alt = details.dataset.alt;
        caption.textContent = details.dataset.caption;
        image.style.opacity = "1";
      };
      reduceMotion.matches ? swap() : setTimeout(swap, 160);
    }));
  })();

  /* ---------- Domain briefs ---------- */
  (() => {
    const briefs = {
      terrain: { title: "Offline maintenance assistant", body: "A small language model on a field laptop retrieves the approved maintenance procedure for an instrument by serial number and software version. It cites the manual and flags an expired local copy. The technician decides whether the procedure applies.", question: "Which manual covers the instrument in front of me, and when was my local copy last verified?", href: "https://astrion.us/edge/tactical-edge", link: "Explore Tactical Edge" },
      atmosphere: { title: "Flight-test coverage", body: "A test-analysis agent matches flight cards to recorded runs, software builds and instrumentation logs. It flags objectives that lack a usable measurement and links each finding to the run. The test director selects the objectives to repeat.", question: "After this software update, which test objectives still need a valid run?", href: "https://astrion.us/orchestration", link: "Explore mission orchestration" },
      maritime: { title: "Vessel machinery health", body: "A condition-monitoring model compares pump vibration at similar operating loads. A maintenance agent pairs an unusual reading with the repair history and original trace. The shore engineer decides whether the equipment needs inspection.", question: "Does this vibration change warrant an inspection, or did the pump simply run at a different load?", href: "#sea-hunter", link: "Read the Navy program evidence" },
      subsea: { title: "Underwater survey quality", body: "A survey-data agent aligns depth readings, onboard timestamps and the recovered survey log. It marks duplicated measurements and gaps, keeping estimated values separate from observations. A hydrographer decides which segments are fit for the survey product.", question: "Which stretches of this survey have enough observed data to support the published depth profile?", href: "https://astrion.us/tech", link: "Explore integration and test" },
      orbit: { title: "Payload interface review", body: "A language-model assistant reads two revisions of a payload interface specification and cites changed fields, units and timing requirements. A verification agent finds the affected ground-system tests. The interface owner approves the revised test scope.", question: "Which ground-system tests need revision when a payload supplier changes its data format?", href: "#pami-1", link: "Read the PAMI-1 program evidence" },
      cyber: { title: "Software assurance evidence", body: "An evidence assistant searches the release records a reviewer is authorized to see, then matches a software build to its signed test report. If the evidence is missing or belongs to another build, the assistant flags the gap for the release authority.", question: "Which claims in this release package have current evidence for the exact build under review?", href: "https://astrion.us/tech", link: "Explore cyber assurance" }
    };
    const dialog = $("#domain-dialog"), grid = $("#domain-grid");
    if (!dialog || !grid || typeof dialog.showModal !== "function") return;
    let lastCard;
    grid.addEventListener("click", event => {
      const card = event.target.closest("[data-domain]");
      if (!card || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const domain = card.dataset.domain, brief = briefs[domain];
      lastCard = card;
      $("#dialog-domain").textContent = domain + " domain";
      $("#dialog-title").textContent = brief.title;
      $("#dialog-description").textContent = brief.body;
      $("#dialog-question").textContent = brief.question;
      $("#dialog-image").src = "assets/media/" + domain + ".webp";
      const link = $("#dialog-link");
      link.href = brief.href;
      link.textContent = brief.link;
      dialog.showModal();
      dialog.scrollTop = 0;
    });
    $("#close-dialog").addEventListener("click", () => dialog.close());
    $("#dialog-link").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target !== dialog) return;
      const area = dialog.getBoundingClientRect();
      if (event.clientX < area.left || event.clientX > area.right || event.clientY < area.top || event.clientY > area.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => lastCard?.focus({ preventScroll: true }));
  })();

  /* ---------- Pilot inquiry builder ---------- */
  (() => {
    const purpose = $("#pilot-purpose"), scenario = $("#pilot-scenario"), question = $("#pilot-question"), mail = $("#pilot-mail"), preview = $("#pilot-body"), status = $("#pilot-status"), copy = $("#pilot-copy"), category = $("#pilot-category");
    if (!purpose || !scenario) return;
    const address = "communications@astrion.us";
    const aliases = { readiness: "retest", evidence: "retest", "space-integration": "space-integration", "maritime-integration": "maritime-integration" };
    const params = new URLSearchParams(location.search);
    const requested = params.get("scenario");
    const selected = Object.hasOwn(aliases, requested) ? aliases[requested] : requested;
    if (selected && $$("option", scenario).some(option => option.value === selected)) scenario.value = selected;
    if (params.get("inquiry") === "partnership") purpose.value = "partnership";
    let draft = "";
    function updateDraft() {
      const teaming = purpose.value === "partnership";
      const useCase = scenario.selectedOptions[0].text;
      category.textContent = teaming ? "Strategic partnerships" : "Mission & capabilities";
      const subject = `Astrion AI pilot ${teaming ? "partnership" : "inquiry"} | ${useCase}`;
      const context = question.value.trim();
      const opening = teaming ? "Our team would like to discuss partnering with Astrion on an engineering AI pilot." : "Our team would like to discuss an engineering AI pilot with Astrion.";
      const message = [opening, `Use case: ${useCase}`, context, "Please connect us with the team that can discuss approved records, human review and pilot evaluation criteria."].filter(Boolean).join("\r\n\r\n");
      mail.href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      draft = `To: ${address}\r\nSubject: ${subject}\r\n\r\n${message}`;
      preview.value = draft;
    }
    [purpose, scenario].forEach(element => element.addEventListener("change", updateDraft));
    question.addEventListener("input", updateDraft);
    mail.addEventListener("click", () => { status.textContent = "Send the draft in your email app. If it did not open, copy the inquiry and use the contact form below."; });
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(draft); status.textContent = "Inquiry copied. Paste it into your email app or the Astrion contact form."; }
      catch { $("#pilot-preview").open = true; preview.focus(); preview.select(); status.textContent = "Copy the inquiry text below."; }
    });
    updateDraft();
  })();
})();
