// Entry point: loads the embedded data, bakes the terrain, builds the scene and runs the frame loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAssets } from './assets.js';
import { bake } from './bake.js';
import { Terrain, Field } from './terrain.js';
import { Sky, sunState } from './sky.js';
import { Wall, FLOOR_Y } from './wall.js';
import { Props } from './props.js';
import { Hall, HALL } from './hall.js';
import { Post } from './post.js';
import { createUI, Labels } from './ui.js';
import { GRID, WORLD, lonLatToWorld, worldToLonLat } from './geo.js';
import { bilinear, depthOf, surfaceOf } from './data.js';
import { CITIES, PEAKS, FEATURES, TOURS } from './places.js';

const PRESETS = {
  // pixels caps the size of the picture the scene is drawn into, whatever the window and display density.
  low: { scale: 1, spacing: 1.6, shadow: 2048, detail: 2.2, samples: 0, ratio: 1, pixels: 1.3e6, ao: false, dof: false, bloom: 3, near: 150 },
  medium: { scale: 2, spacing: 1.15, shadow: 2048, detail: 2.6, samples: 2, ratio: 1.25, pixels: 2.4e6, ao: true, dof: true, bloom: 4, near: 220 },
  high: { scale: 2, spacing: 0.9, shadow: 4096, detail: 3.0, samples: 4, ratio: 1.5, pixels: 4.2e6, ao: true, dof: true, bloom: 5, near: 300 },
  ultra: { scale: 2, spacing: 0.72, shadow: 4096, detail: 4.0, samples: 4, ratio: 2, pixels: 8.5e6, ao: true, dof: true, bloom: 5, near: 420 },
};
const STORE = 'relief-map:quality';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function chooseQuality(q, gl) {
  let choice = q.get('q');
  if (!choice) { try { choice = localStorage.getItem(STORE); } catch { /* storage can be blocked; the default still works */ } }
  if (PRESETS[choice]) return { choice, quality: choice };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'), gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '');
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  const weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const small = gl.getParameter(gl.MAX_TEXTURE_SIZE) < 8192;
  return { choice: 'auto', quality: software || small || (phone && weak) ? 'low' : phone || weak ? 'medium' : 'high' };
}

async function start() {
  const q = new URLSearchParams(location.search), canvas = document.getElementById('view');
  const freeze = Number(q.get('freeze') ?? 0), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layers = { labels: true, borders: false, trees: true, cities: true, hall: true, blur: true };
  for (const name of Object.keys(layers)) if (q.has(name)) layers[name] = q.get(name) !== '0';
  const initialHour = clamp(Number(q.get('h') ?? 17.9), 5, 21.5), initialExag = clamp(Number(q.get('ex') ?? 50), 20, 90);
  const app = {};
  let ui = null;
  const fail = (message) => { document.body.dataset.error = message; if (ui) ui.fail(message); else document.getElementById('loading-text').textContent = message; };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch {
    fail('This map needs WebGL 2. Turn on hardware acceleration or try a current version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) { fail('This device cannot render to floating-point textures, which the terrain needs.'); return; }
  const { choice: qualityChoice, quality } = chooseQuality(q, gl), preset = PRESETS[quality];
  ui = createUI(app, { hour: initialHour, exag: initialExag, layers, qualityChoice, quality });
  if (q.get('ui') === '0') ui.toggleBare();
  document.body.classList.toggle('no-labels', !layers.labels);

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.ratio));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  // ---- data and terrain ----
  ui.progress(0.04, 'Unpacking elevation');
  await nextFrame();
  const t0 = performance.now();
  const assets = await loadAssets(renderer, (f, text) => ui.progress(f * 0.5, text));
  ui.progress(0.5, 'Sculpting terrain');
  await nextFrame();
  const t1 = performance.now();
  const baked = bake(renderer, { stored: assets.stored, masks: assets.tex.masks, geo: assets.tex.geo, scale: preset.scale });
  const t2 = performance.now();
  const shared = { uExag: { value: initialExag }, uTime: { value: 0 }, uBorders: { value: layers.borders ? 1 : 0 }, uNight: { value: 0 } };
  const field = new Field(baked.heights, baked.w, baked.h), tex = { ...assets.tex, levels: baked.levels, normal: baked.normal };
  const k = () => shared.uExag.value / WORLD.unit;
  const groundY = (x, z) => field.at(x, z) * k();
  const storedAt = (x, z, map) => bilinear(assets.stored, GRID.w, GRID.h, (x / WORLD.w + 0.5) * GRID.w, (z / WORLD.h + 0.5) * GRID.h, map);
  let maxMetres = 0;
  for (let i = 0; i < baked.heights.length; i += 7) if (baked.heights[i] > maxMetres) maxMetres = baked.heights[i];

  ui.progress(0.62, 'Raising cliffs');
  await nextFrame();
  const terrain = new Terrain(tex, field, assets.slab, shared);
  terrain.detail = preset.detail;
  const wall = new Wall(assets.slab, field, assets.land, (x, z) => storedAt(x, z, depthOf), tex, shared);
  ui.progress(0.72, 'Planting forests');
  await nextFrame();
  const props = new Props({ field, stored: assets.stored, slab: assets.slab, land: assets.land, lakes: assets.lakes, rivers: assets.rivers, lcPx: assets.lcPx, lw: assets.lw, lh: assets.lh },
    shared, Number(q.get('sp') ?? preset.spacing));
  props.nearDist = preset.near;
  ui.progress(0.86, 'Building the hall');
  await nextFrame();
  const hall = new Hall();
  hall.visible = layers.hall;
  const sky = new Sky();
  sky.mesh.scale.setScalar(100);
  const scene = new THREE.Scene();
  scene.add(sky.mesh, hall.group, terrain.mesh, wall.mesh, props.group);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(preset.shadow, preset.shadow);
  sun.shadow.bias = -0.0004;
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x77664f, 0.5);
  scene.add(sun, sun.target, hemi);
  scene.fog = new THREE.FogExp2(0xffffff, 0.00021);

  // ---- light ----
  let state = sunState(initialHour), envDirty = true, envAt = -1e9;
  const applyLight = () => {
    sky.apply(state);
    sun.color.copy(state.lightColor); sun.intensity = state.lightIntensity;
    hemi.intensity = 0.5 * state.ambient;
    scene.environmentIntensity = 0.45 + 0.4 * state.day;
    shared.uNight.value = state.night;
    scene.fog.color.copy(state.horizon).lerp(state.zenith, 0.15).multiplyScalar(0.25 + 0.75 * state.day);
    envDirty = true;
  };
  applyLight();

  // ---- camera ----
  const size = new THREE.Vector2(innerWidth, innerHeight);
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 2, 9000);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, rotateSpeed: 0.55, zoomSpeed: 0.9, panSpeed: 0.9, screenSpacePanning: false, minDistance: 40, maxDistance: 1700, minPolarAngle: 0.1, maxPolarAngle: 1.5, zoomToCursor: true });
  const offset = new THREE.Vector3();
  const viewNow = () => {
    offset.copy(camera.position).sub(controls.target);
    const dist = offset.length();
    return { x: controls.target.x, z: controls.target.z, dist, bearing: Math.atan2(-offset.x, offset.z) * 180 / Math.PI, pitch: Math.asin(clamp(offset.y / dist, -1, 1)) * 180 / Math.PI };
  };
  const applyView = (v) => {
    const b = v.bearing * Math.PI / 180, p = v.pitch * Math.PI / 180;
    controls.target.set(v.x, Math.max(groundY(v.x, v.z), 0), v.z);
    camera.position.set(v.x - Math.sin(b) * Math.cos(p) * v.dist, controls.target.y + Math.sin(p) * v.dist, v.z + Math.cos(b) * Math.cos(p) * v.dist);
  };
  const tourView = (tour) => {
    const [x, z] = lonLatToWorld(tour.lon, tour.lat);
    // The whole-map view backs off on narrow windows so both coasts stay in frame.
    const fit = tour.id === 'overview' ? clamp(1.6 / ((size.x - (size.x > 900 ? 300 : 0)) / size.y) * 0.82, 0.8, 1.3) : 1;
    return { x, z, dist: tour.dist * fit, bearing: tour.bearing, pitch: tour.pitch };
  };
  let flight = null;
  const flyTo = (to, ms = 2600) => {
    if (reducedMotion || freeze || ms <= 0) { flight = null; applyView(to); return; }
    const from = viewNow();
    from.bearing += Math.round((to.bearing - from.bearing) / 360) * 360;      // turn the short way round
    flight = { from, to, t0: performance.now(), ms, hop: clamp(Math.hypot(to.x - from.x, to.z - from.z) / 500, 0, 1) };
  };
  const stepFlight = (now) => {
    if (!flight) return;
    const t = clamp((now - flight.t0) / flight.ms, 0, 1), e = ease(t), { from: a, to: b } = flight, mix = (p, r) => p + (r - p) * e;
    applyView({ x: mix(a.x, b.x), z: mix(a.z, b.z), bearing: mix(a.bearing, b.bearing), pitch: mix(a.pitch, b.pitch) + 8 * flight.hop * Math.sin(Math.PI * e),
      dist: Math.exp(mix(Math.log(a.dist), Math.log(b.dist))) * (1 + 0.45 * flight.hop * Math.sin(Math.PI * e)) });
    if (t >= 1) flight = null;
  };
  const cancelFlight = () => { if (flight) { flight = null; ui.markTour(null); } };
  canvas.addEventListener('pointerdown', cancelFlight);
  canvas.addEventListener('wheel', cancelFlight, { passive: true });
  const startTour = TOURS.find((t) => t.id === q.get('tour')) ?? TOURS[0];
  applyView(q.has('view') ? (([lon, lat, dist, bearing, pitch]) => ({ ...tourView({ lon, lat }), dist, bearing, pitch }))(q.get('view').split(',').map(Number)) : tourView(startTour));
  controls.update();

  // ---- picking ----
  const ray = new THREE.Vector3(), probe = new THREE.Vector3();
  const inMap = (x, z) => Math.abs(x) < WORLD.w / 2 - 1 && Math.abs(z) < WORLD.h / 2 - 1;
  /** First point where the ray from the camera through (ndcX, ndcY) meets the terrain, or null. */
  const pick = (ndcX, ndcY) => {
    ray.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
    const o = camera.position, top = maxMetres * k() + 1;
    if (ray.y >= -1e-4 && o.y > top) return null;
    let t = o.y > top ? (o.y - top) / -ray.y : 0, prev = t;
    for (let i = 0; i < 600 && t < 7000; i++) {
      probe.copy(o).addScaledVector(ray, t);
      const above = probe.y - (inMap(probe.x, probe.z) ? groundY(probe.x, probe.z) : -1e3);
      if (above <= 0) {
        let a = prev, b = t;
        for (let j = 0; j < 8; j++) { const m = (a + b) / 2; probe.copy(o).addScaledVector(ray, m); if (probe.y - groundY(probe.x, probe.z) > 0) a = m; else b = m; }
        probe.copy(o).addScaledVector(ray, b);
        return assets.slab.at(probe.x, probe.z) > 127 ? probe.clone() : null;
      }
      if (probe.y < FLOOR_Y) return null;
      prev = t; t += Math.max(0.3, above * 0.3);
    }
    return null;
  };
  const places = [...CITIES, ...PEAKS, ...FEATURES].map((p) => ({ p, xz: lonLatToWorld(p.lon, p.lat) }));
  const infoAt = (x, z) => {
    const u = x / WORLD.w + 0.5, v = z / WORLD.h + 0.5, [lon, lat] = worldToLonLat(x, z);
    const isLand = assets.land.at(x, z) > 128, isLake = assets.lakes.at(x, z) > 128;
    const sid = assets.states[clamp(Math.floor(v * assets.lh), 0, assets.lh - 1) * assets.lw + clamp(Math.floor(u * assets.lw), 0, assets.lw - 1)];
    let near = null, best = 30;
    for (const { p, xz } of places) { const d = Math.hypot(xz[0] - x, xz[1] - z) * (p.kind === 'feature' ? 1.6 : 1); if (d < best) { best = d; near = p.name; } }
    return { lon, lat, state: sid ? assets.meta.states[sid - 1] : '', elev: storedAt(x, z, surfaceOf), depth: storedAt(x, z, depthOf), water: !isLand && !isLake ? 'sea' : isLake ? 'lake surface' : '', near };
  };
  const pointer = { x: 0, y: 0, moved: false, inside: false };
  // Listen on the document: place names sit above the canvas and would otherwise swallow the hover.
  const labelRoot = document.getElementById('labels');
  document.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = true;
    pointer.inside = e.pointerType !== 'touch' && (e.target === canvas || labelRoot.contains(e.target));
  });
  document.documentElement.addEventListener('mouseleave', () => { pointer.inside = false; pointer.moved = true; });
  canvas.addEventListener('dblclick', (e) => {
    const hit = pick(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
    if (hit) { const v = viewNow(); flyTo({ ...v, x: hit.x, z: hit.z, dist: Math.max(55, v.dist * 0.45) }, 1400); }
  });

  // ---- labels ----
  const projected = new THREE.Vector3();
  const labels = new Labels(labelRoot, (place) => {
    const [x, z] = lonLatToWorld(place.lon, place.lat), v = viewNow();
    ui.showCard(place);
    flyTo({ ...v, x, z, dist: clamp(v.dist * 0.6, place.kind === 'feature' ? 260 : 110, 420) }, 1800);
  });
  const project = (x, y, z) => { projected.set(x, y, z).project(camera); return [(projected.x * 0.5 + 0.5) * size.x, (0.5 - projected.y * 0.5) * size.y, projected.z]; };
  const blocked = (x, y, z) => {
    for (let i = 1; i <= 10; i++) {
      const t = i / 11 * 0.5, px = x + (camera.position.x - x) * t, pz = z + (camera.position.z - z) * t;
      if (inMap(px, pz) && groundY(px, pz) > y + (camera.position.y - y) * t + 0.5) return true;
    }
    return false;
  };

  // ---- post and sizing ----
  let avoid = [];
  const post = new Post(renderer, { samples: preset.samples, bloomLevels: preset.bloom });
  post.settings.ao = preset.ao ? 0.75 : 0;
  post.settings.dof = preset.dof && layers.blur;
  let renderScale = 1;
  const resize = () => {
    size.set(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.ratio));
    renderer.setSize(size.x, size.y, false);
    camera.aspect = size.x / size.y;
    camera.fov = camera.aspect < 1 ? Math.min(58, 35 + (1 - camera.aspect) * 46) : 35;     // a wider lens on upright phones
    // On wide screens the panel covers the right edge, so shift the picture left by half its width.
    const shift = size.x > 900 && !document.body.classList.contains('bare') ? 150 : 0;
    if (shift) camera.setViewOffset(size.x, size.y, shift, 0, size.x, size.y); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio(), bare = document.body.classList.contains('bare');
    // Screen areas the interface owns; place names stay out of them.
    avoid = bare ? [] : [[0, 0, 400, 70], ...(size.x > 760 ? [[size.x - 304, 0, size.x, Math.min(size.y, 690)]] : [])];
    const fit = renderScale * Math.min(1, Math.sqrt(preset.pixels / (size.x * pr * size.y * pr)));
    post.setSize(size.x * pr * fit, size.y * pr * fit);
  };
  resize();
  addEventListener('resize', resize);

  // ---- actions the interface calls ----
  let exagDirty = false;
  const drawNow = () => { const dist = camera.position.distanceTo(controls.target); post.render(scene, camera, { focus: dist, exposure: state.exposure, aoRadius: clamp(dist * 0.012, 0.7, 9) }); };
  Object.assign(app, {
    tour(id) { const tour = TOURS.find((t) => t.id === id); if (!tour) return; ui.markTour(id); ui.showCard(null); flyTo(tourView(tour)); },
    setHour(h) { state = sunState(h); applyLight(); },
    setExaggeration(v) { shared.uExag.value = v; exagDirty = true; },
    setLayer(name, on) {
      layers[name] = on;
      if (name === 'borders') shared.uBorders.value = on ? 1 : 0;
      if (name === 'hall') hall.visible = on;
      if (name === 'blur') post.settings.dof = preset.dof && on;
      if (name === 'labels') document.body.classList.toggle('no-labels', !on);
    },
    setQuality(value) {
      try { if (value === 'auto') localStorage.removeItem(STORE); else localStorage.setItem(STORE, value); } catch { /* not stored; the URL below still carries it */ }
      const url = new URL(location.href);
      if (value === 'auto') url.searchParams.delete('q'); else url.searchParams.set('q', value);
      location.href = url.href;
    },
    screenshot() {
      // Draw and read back in the same task: the canvas does not keep its picture between frames.
      drawNow();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'united-states-in-relief.png'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    },
  });

  // ---- keyboard ----
  const keys = new Set(), forward = new THREE.Vector3(), side = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (/^[1-9]$/.test(key)) { const tour = TOURS[Number(key) - 1]; if (tour) app.tour(tour.id); return; }
    if (key === 'l' || key === 'b') { const name = key === 'l' ? 'labels' : 'borders'; app.setLayer(name, !layers[name]); ui.setLayerBox(name, layers[name]); return; }
    if (key === 'h') { ui.toggleBare(); resize(); return; }
    if (key === 'r') { app.tour('overview'); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e', '+', '=', '-', '_'].includes(key)) {
      if (e.target instanceof HTMLButtonElement && key.startsWith('Arrow')) return;
      keys.add(key); cancelFlight(); e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  const stepKeys = (dt) => {
    if (!keys.size) return;
    const has = (...names) => names.some((n) => keys.has(n));
    offset.copy(camera.position).sub(controls.target);
    const dist = offset.length(), pan = dist * 0.9 * dt;
    forward.set(-offset.x, 0, -offset.z).normalize(); side.crossVectors(forward, UP);
    const move = new THREE.Vector3().addScaledVector(forward, (has('ArrowUp', 'w') ? pan : 0) - (has('ArrowDown', 's') ? pan : 0)).addScaledVector(side, (has('ArrowRight', 'd') ? pan : 0) - (has('ArrowLeft', 'a') ? pan : 0));
    controls.target.add(move); camera.position.add(move);
    const turn = ((has('q') ? 1 : 0) - (has('e') ? 1 : 0)) * dt * 1.1, zoom = Math.exp(((has('-', '_') ? 1 : 0) - (has('+', '=') ? 1 : 0)) * dt * 1.4);
    if (turn || zoom !== 1) {
      offset.copy(camera.position).sub(controls.target).applyAxisAngle(UP, turn).multiplyScalar(clamp(dist * zoom, controls.minDistance, controls.maxDistance) / dist);
      camera.position.copy(controls.target).add(offset);
    }
  };

  /** Keeps the camera over the map, above the ground and inside the hall. */
  const constrain = () => {
    const t = controls.target;
    t.x = clamp(t.x, -WORLD.w / 2 + 12, WORLD.w / 2 - 12); t.z = clamp(t.z, -WORLD.h / 2 + 8, WORLD.h / 2 - 8);
    t.y += (Math.max(groundY(t.x, t.z), 0) - t.y) * 0.12;
    // Low down the camera stays in the well; higher up it may drift out over the gallery, as far as the columns.
    const c = camera.position, r = Math.hypot(c.x, c.z), limit = c.y > HALL.gallery + 60 ? HALL.glass - 190 : HALL.well - 22;
    if (r > limit) { c.x *= limit / r; c.z *= limit / r; }
    c.y = clamp(c.y, (inMap(c.x, c.z) ? Math.max(groundY(c.x, c.z), 0) : FLOOR_Y) + 3, HALL.roof - 40);
  };

  const right = new THREE.Vector3(), up = new THREE.Vector3(), centre = new THREE.Vector3();
  const fitShadow = (dist) => {
    const r = clamp(dist * 0.85, 70, 780), texel = 2 * r / sun.shadow.mapSize.x, dir = state.lightDir;
    right.crossVectors(dir, UP).normalize(); up.crossVectors(right, dir).normalize();
    centre.copy(controls.target);
    // Snap to whole shadow texels so shadows do not shimmer as the view moves.
    centre.addScaledVector(right, Math.round(centre.dot(right) / texel) * texel - centre.dot(right)).addScaledVector(up, Math.round(centre.dot(up) / texel) * texel - centre.dot(up));
    sun.position.copy(centre).addScaledVector(dir, 1700);
    sun.target.position.copy(centre); sun.target.updateMatrixWorld();
    const c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 100; c.far = 3400; c.updateProjectionMatrix();
    sun.shadow.normalBias = r / 650;
  };

  // ---- frame loop ----
  const stats = { frames: 0, ms: 16.7, calls: 0, triangles: 0 };
  let last = performance.now(), acc = 0, count = 0, adjusted = last, running = true, strikes = 0, lite = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; fail('The graphics context was lost. Reload the page to continue.'); });
  const frame = (now) => {
    if (!running) return;
    const dtMs = now - last, dt = Math.min(0.1, dtMs / 1000);
    last = now;
    shared.uTime.value = reducedMotion ? 0 : now / 1000;
    stepKeys(dt);
    stepFlight(now);
    controls.update();
    constrain();
    const dist = camera.position.distanceTo(controls.target), near = clamp(dist * 0.02, 1, 12);
    if (Math.abs(near - camera.near) > 0.05) { camera.near = near; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    sky.mesh.position.copy(camera.position);
    if (exagDirty) { props.setExaggeration(shared.uExag.value); exagDirty = false; }
    if (envDirty && now - envAt > 150) { scene.environment = sky.environment(renderer); envDirty = false; envAt = now; }
    fitShadow(dist);
    terrain.update(camera, shared.uExag.value);
    props.update(camera, layers.trees, layers.cities);
    renderer.info.reset();
    post.render(scene, camera, { focus: dist, exposure: state.exposure, aoRadius: clamp(dist * 0.012, 0.7, 9) });
    stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;
    if (layers.labels) labels.update(project, groundY, blocked, size.x, size.y, dist, avoid);
    if (pointer.moved) {
      pointer.moved = false;
      const hit = pointer.inside ? pick(pointer.x / size.x * 2 - 1, 1 - pointer.y / size.y * 2) : null;
      ui.setReadout(hit ? infoAt(hit.x, hit.z) : null);
    }
    // Hold the frame rate by trading resolution, once a second at most.
    if (dtMs < 250 && !freeze) { acc += dtMs; count++; }
    if (now - adjusted > 1000 && count > 10) {
      stats.ms = acc / count;
      const next = stats.ms > 40 ? renderScale - 0.2 : stats.ms > 23 ? renderScale - 0.1 : stats.ms < 17.6 ? renderScale + 0.05 : renderScale;
      if (clamp(next, 0.5, 1) !== renderScale) { renderScale = clamp(next, 0.5, 1); resize(); }
      // Still slow at half resolution on an automatic setting: drop the costly effects and thin the scenery, once.
      strikes = renderScale <= 0.5 && stats.ms > 34 ? strikes + 1 : 0;
      if (strikes >= 3 && !lite && qualityChoice === 'auto') {
        lite = true;
        post.settings.ao = 0; post.settings.dof = false; preset.dof = false;
        props.nearDist = Math.min(props.nearDist, 130); props.farDist = 950; terrain.detail = Math.min(terrain.detail, 2.2);
      }
      acc = 0; count = 0; adjusted = now;
    }
    stats.frames++;
    if (stats.frames === 2) ui.ready();
    if (!freeze || stats.frames < freeze) requestAnimationFrame(frame);
  };

  window.__relief = {
    get frames() { return stats.frames; },
    quality, app, viewNow,
    info: () => ({ quality, renderScale, lite, ms: stats.ms, calls: stats.calls, triangles: stats.triangles, patches: terrain.patchCount, trees: props.treeCount, buildings: props.cities.count,
      timings: { load: Math.round(t1 - t0), bake: Math.round(t2 - t1) }, hour: state.hour, exag: shared.uExag.value, layers: { ...layers }, size: [post.w, post.h] }),
    sample: (lon, lat) => infoAt(...lonLatToWorld(lon, lat)),
    pickScreen: (x, y) => { const hit = pick(x / size.x * 2 - 1, 1 - y / size.y * 2); return hit ? infoAt(hit.x, hit.z) : null; },
    screenOf: (lon, lat) => { const [x, z] = lonLatToWorld(lon, lat); return project(x, groundY(x, z), z); },
    /** Draws one frame and returns a 12 x 8 grid of the pixels that reached the screen. Used by the tests. */
    probe: () => {
      drawNow();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4), out = [];
      for (let j = 0; j < 8; j++) for (let i = 0; i < 12; i++) { gl.readPixels(Math.floor((i + 0.5) / 12 * w), Math.floor((j + 0.5) / 8 * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push([px[0], px[1], px[2]]); }
      return out;
    },
  };
  requestAnimationFrame(frame);
}

start().catch((err) => {
  console.error(err);
  const message = `The map could not start: ${err && err.message ? err.message : err}`;
  document.body.dataset.error = message;
  const text = document.getElementById('loading-text'), loading = document.getElementById('loading');
  if (loading) { loading.hidden = false; loading.classList.remove('done'); loading.classList.add('failed'); }
  if (text) text.textContent = message;
});
