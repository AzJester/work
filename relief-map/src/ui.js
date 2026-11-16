// Interface: search, the navigation cluster, the dock and its sheets, the info card, place-name labels, readout and hints.
import { CITIES, PEAKS, FEATURES, TOURS } from './places.js';
import { lonLatToWorld } from './geo.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const KIND = { city: 'City', peak: 'Peak', feature: 'Region' };

export function formatHour(h) {
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh % 24 < 12 ? 'am' : 'pm'}`;
}
export const formatHeight = (m, units) => (units === 'us' ? `${fmt(m * 3.28084)} ft` : `${fmt(m)} m`);
export const formatCoords = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

export function describe(place, units) {
  if (place.kind === 'city') return `Metropolitan area of about ${place.pop >= 1 ? `${place.pop.toFixed(1)} million` : fmt(place.pop * 1e6)} people.`;
  if (place.kind === 'peak') return `Summit at ${formatHeight(place.elev, units)}.`;
  return '';
}

const BIG = new Set(['Pacific Ocean', 'Atlantic Ocean', 'Gulf of Mexico', 'Great Plains', 'Rocky Mountains', 'Appalachian Mountains']);
function rankOf(p) {
  if (p.kind === 'city') return p.pop >= 9 ? 0 : p.pop >= 4.5 ? 1 : p.pop >= 2.2 ? 2 : 3;
  if (p.kind === 'peak') return p.elev >= 4300 || p.name === 'Mount Mitchell' || p.name === 'Mount Washington' ? 2 : 3;
  if (BIG.has(p.name)) return 0;
  return /Lake (Superior|Michigan|Huron|Erie|Ontario)|Sierra|Cascade|Colorado Plateau|Great Basin|Mississippi River/.test(p.name) ? 1 : 2;
}

/**
 * Place names projected onto the screen each frame, thinned by zoom and kept from overlapping each other and the interface.
 * They are a pointer convenience and are hidden from assistive technology: search reaches the same places by keyboard.
 */
export class Labels {
  constructor(root, onPick) {
    this.items = [...CITIES, ...PEAKS, ...FEATURES].map((place) => {
      const [x, z] = lonLatToWorld(place.lon, place.lat), el = document.createElement('button');
      el.type = 'button'; el.tabIndex = -1;
      el.className = `lbl lbl-${place.kind}${BIG.has(place.name) ? ' lbl-big' : ''} lbl-off`;
      el.textContent = place.name;
      el.addEventListener('click', () => onPick(place));
      root.appendChild(el);
      return { place, x, z, el, rank: rankOf(place), shown: false, w: 0, h: 0, lift: place.kind === 'city' ? 5 : place.kind === 'peak' ? 1.6 : 2 };
    }).sort((a, b) => a.rank - b.rank);
    this.measured = false;
  }

  /**
   * @param project - (x, y, z) => [sx, sy, depth] in CSS pixels, depth > 1 when behind the camera
   * @param groundY - (x, z) => world height of the terrain
   * @param blocked - (x, y, z) => true when the terrain hides that point from the camera
   * @param avoid - screen rectangles [left, top, right, bottom] the interface occupies
   */
  update(project, groundY, blocked, width, height, distance, avoid = []) {
    if (!this.measured) { for (const it of this.items) { const r = it.el.getBoundingClientRect(); it.w = r.width || it.place.name.length * 7 + 16; it.h = r.height || 20; } this.measured = true; }
    const maxRank = distance > 1000 ? 0 : distance > 640 ? 1 : distance > 330 ? 2 : 3, taken = [...avoid];
    for (const it of this.items) {
      let show = it.rank <= maxRank, sx = 0, sy = 0;
      if (show) {
        const y = groundY(it.x, it.z) + it.lift, p = project(it.x, y, it.z);
        sx = p[0]; sy = p[1];
        show = p[2] < 1 && sx > 4 && sy > 8 && sx < width - 8 && sy < height - 8 && !blocked(it.x, y, it.z);
        if (show) {
          // Cities and peaks sit to the right of their marker, regions are centred.
          const left = it.place.kind === 'feature' ? sx - it.w / 2 : sx - 10, top = sy - it.h / 2, box = [left - 4, top - 2, left + it.w + 4, top + it.h + 2];
          if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) show = false;
          else { taken.push(box); sx = left; sy = top; }
        }
      }
      if (show) it.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
      if (show !== it.shown) { it.el.classList.toggle('lbl-off', !show); it.shown = show; }
    }
  }
}

/** Wires the page to the app. `app` supplies the actions; this file owns the DOM. */
export function createUI(app, initial) {
  const body = document.body, view = $('view');
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage can be blocked; the choice then lasts for this visit */ } },
  };
  const el = (tag, props = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v; else if (k === 'html') node.innerHTML = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v);
    }
    node.append(...kids.filter((kid) => kid != null));
    return node;
  };
  const narrow = () => matchMedia('(max-width: 720px)').matches;
  let units = initial.units || store.get('relief-map:units') || (/^en-(US|LR|MM)\b/i.test(navigator.language || '') ? 'us' : 'metric');

  // ---- toast ----
  const toastEl = $('toast');
  let toastTimer = 0;
  const toast = (text) => { toastEl.textContent = text; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2800); };
  const copy = async (text, done) => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const t = el('textarea', { class: 'sr' });
      t.value = text; body.append(t); t.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      t.remove();
    }
    toast(ok ? done : 'Copying is blocked in this browser');
  };

  // ---- dock and sheets: one open at a time, never stacked ----
  const dock = [...document.querySelectorAll('#dock [data-sheet]')], sheets = new Map(dock.map((b) => [b.dataset.sheet, $(`sheet-${b.dataset.sheet}`)]));
  let open = null;
  const setSheet = (name, focus = false) => {
    open = name;
    for (const b of dock) { const on = b.dataset.sheet === name; b.setAttribute('aria-expanded', String(on)); sheets.get(b.dataset.sheet).hidden = !on; }
    if (name && focus) sheets.get(name).querySelector('button:not(.sheet-close),input,select')?.focus({ preventScroll: true });
  };
  const closeSheet = () => { const b = dock.find((d) => d.dataset.sheet === open); setSheet(null); b?.focus({ preventScroll: true }); };
  for (const b of dock) b.addEventListener('click', () => setSheet(open === b.dataset.sheet ? null : b.dataset.sheet, true));
  for (const sheet of sheets.values()) sheet.querySelector('.sheet-close').addEventListener('click', closeSheet);

  // ---- info card ----
  const card = $('card');
  let cardRender = null;
  const drawCard = ({ kicker, title, text, rows = [], actions = [], step }) => {
    card.replaceChildren(...[
      el('div', { class: 'card-head' },
        el('div', {}, el('span', { class: 'card-kicker' }, kicker), el('h2', {}, title)),
        el('button', { type: 'button', class: 'card-close', 'aria-label': 'Close', html: icon('close'), onclick: () => { stopTour(); hideCard(); } })),
      text ? el('p', {}, text) : null,
      rows.length ? el('dl', {}, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])) : null,
      actions.length ? el('div', { class: 'card-actions' },
        ...actions.map((a) => el('button', { type: 'button', class: a.icon ? 'icon' : '', 'aria-label': a.label, html: a.icon ? icon(a.icon) : '', onclick: a.run }, a.icon ? null : a.label)),
        step ? el('span', { class: 'card-step' }, step) : null) : null,
    ].filter(Boolean));
    card.hidden = false;
    body.classList.add('card-open');
  };
  const showCard = (render) => { cardRender = render; drawCard(render()); };
  const hideCard = () => { card.hidden = true; cardRender = null; body.classList.remove('card-open'); app.clearPin(); };
  const pointRows = (info) => [
    info.water === 'sea' ? ['Sea depth', formatHeight(info.depth, units)] : [info.water ? 'Lake surface' : 'Elevation', formatHeight(info.elev, units)],
    ...(info.state ? [['State', info.state]] : []),
    ['Coordinates', formatCoords(info.lat, info.lon)],
  ];
  const copyCoords = (info) => ({ label: 'Copy coordinates', run: () => copy(`${info.lat.toFixed(4)}, ${info.lon.toFixed(4)}`, 'Coordinates copied') });
  const showPoint = (info) => showCard(() => ({
    kicker: info.water === 'sea' ? 'Sea' : info.water ? 'Lake' : 'Point on the map', title: info.near ? `Near ${info.near}` : info.state || 'Offshore',
    rows: pointRows(info), actions: [{ label: 'Fly here', run: () => app.flyToPoint(info.lon, info.lat) }, copyCoords(info)],
  }));
  const showPlace = (place, info) => showCard(() => ({
    kicker: KIND[place.kind], title: place.name, text: describe(place, units),
    rows: place.kind === 'city' ? pointRows(info) : pointRows(info).slice(1), actions: [copyCoords(info)],
  }));
  const showState = (s) => showCard(() => ({
    kicker: 'State', title: s.name, text: 'Elevation as this map holds it, on a 2.5 km grid. Summits read a little low.',
    rows: [['Highest ground', formatHeight(s.max, units)], ['Average', formatHeight(s.mean, units)], ['Lowest ground', formatHeight(s.min, units)]],
  }));

  // ---- tours ----
  const tourButtons = new Map(), playBtn = $('tour-play');
  let tourIndex = 0, playing = false, tourTimer = 0;
  const schedule = () => { clearTimeout(tourTimer); if (playing) tourTimer = setTimeout(() => showStop(tourIndex + 1), 11000); };
  const setPlaying = (on) => {
    playing = on;
    playBtn.innerHTML = `${icon(on ? 'pause' : 'play')}<span>${on ? 'Pause guided tour' : 'Play guided tour'}</span>`;
    if (cardRender?.tour) drawCard(cardRender());
    schedule();
  };
  const stopTour = () => { if (playing) setPlaying(false); };
  const showStop = (i) => {
    tourIndex = (i + TOURS.length) % TOURS.length;
    const tour = TOURS[tourIndex];
    app.tour(tour.id);
    for (const [id, b] of tourButtons) { if (id === tour.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
    const render = () => ({
      kicker: 'Guided tour', title: tour.name, text: tour.blurb, step: `${tourIndex + 1} of ${TOURS.length}`,
      actions: [{ icon: 'prev', label: 'Previous stop', run: () => showStop(tourIndex - 1) }, { icon: playing ? 'pause' : 'play', label: playing ? 'Pause tour' : 'Play tour', run: () => setPlaying(!playing) }, { icon: 'next', label: 'Next stop', run: () => showStop(tourIndex + 1) }],
    });
    render.tour = true;
    showCard(render);
    schedule();
    if (narrow()) setSheet(null);
  };
  TOURS.forEach((tour, i) => {
    const b = el('button', { type: 'button', onclick: () => { stopTour(); showStop(i); } }, el('b', {}, tour.name), el('span', {}, tour.blurb));
    $('tours').append(el('li', {}, b));
    tourButtons.set(tour.id, b);
  });
  playBtn.addEventListener('click', () => { if (playing) { setPlaying(false); return; } playing = true; showStop(cardRender?.tour ? tourIndex : 0); setPlaying(true); });

  // ---- light ----
  const hour = $('hour'), presets = [...document.querySelectorAll('#light-presets button')], dayBtn = $('day-play');
  let dayRaf = 0, dayLast = 0, dayHour = initial.hour;
  const setHour = (h, fromSlider = false) => {
    dayHour = h;
    if (!fromSlider) hour.value = h;
    $('hour-out').textContent = formatHour(h);
    for (const b of presets) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.hour) - h) < 0.08));
  };
  const stopDay = () => { cancelAnimationFrame(dayRaf); dayRaf = 0; dayBtn.setAttribute('aria-pressed', 'false'); dayBtn.innerHTML = `${icon('play')}<span>Play the day</span>`; };
  const stepDay = (now) => {
    const dt = Math.min(0.1, (now - dayLast) / 1000);
    dayLast = now;
    setHour(dayHour + dt * 0.5 > 21.5 ? 5 : dayHour + dt * 0.5);
    app.setHour(dayHour);
    dayRaf = requestAnimationFrame(stepDay);
  };
  dayBtn.addEventListener('click', () => {
    if (dayRaf) { stopDay(); return; }
    dayLast = performance.now(); dayBtn.setAttribute('aria-pressed', 'true'); dayBtn.innerHTML = `${icon('pause')}<span>Pause the day</span>`;
    dayRaf = requestAnimationFrame(stepDay);
  });
  hour.addEventListener('input', () => { stopDay(); setHour(Number(hour.value), true); app.setHour(dayHour); });
  for (const b of presets) b.addEventListener('click', () => { stopDay(); setHour(Number(b.dataset.hour)); app.setHour(dayHour); });
  setHour(initial.hour);

  // ---- layers and exaggeration ----
  const exag = $('exag'), boxes = new Map();
  const showExag = () => { $('exag-out').textContent = `${exag.value}x`; };
  exag.value = initial.exag;
  exag.addEventListener('input', () => { showExag(); app.setExaggeration(Number(exag.value)); });
  showExag();
  for (const box of document.querySelectorAll('[data-layer]')) {
    box.checked = Boolean(initial.layers[box.dataset.layer]);
    box.addEventListener('change', () => app.setLayer(box.dataset.layer, box.checked));
    boxes.set(box.dataset.layer, box);
  }

  // ---- share ----
  $('copy-link').addEventListener('click', () => copy(app.shareUrl(), 'Link copied'));
  $('shot').addEventListener('click', () => { app.screenshot(); toast('Image saved to your downloads'); });
  const fullscreen = $('fullscreen');
  if (!document.documentElement.requestFullscreen) fullscreen.hidden = true;
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast('Full screen is not available here'));
  });

  // ---- more ----
  const quality = $('quality'), help = $('help'), motion = $('motion'), unitButtons = [...document.querySelectorAll('#units button')];
  let perf = `Running at ${initial.quality}`;
  const showPerf = () => { $('quality-hint').textContent = `${perf}. Changing quality reloads the map.`; };
  quality.value = initial.qualityChoice;
  quality.addEventListener('change', () => app.setQuality(quality.value));
  showPerf();
  let lastReadout = '';
  const setUnits = (next) => {
    units = next;
    store.set('relief-map:units', next);
    for (const b of unitButtons) b.setAttribute('aria-pressed', String(b.dataset.units === next));
    if (cardRender) drawCard(cardRender());
    lastReadout = '';
  };
  for (const b of unitButtons) b.addEventListener('click', () => setUnits(b.dataset.units));
  setUnits(units);
  motion.checked = initial.paused;
  motion.addEventListener('change', () => { if (motion.checked) { stopTour(); stopDay(); } app.setMotion(motion.checked); });
  const openHelp = () => { if (help.showModal) { if (!help.open) help.showModal(); } else help.setAttribute('open', ''); };
  $('help-open').addEventListener('click', openHelp);
  $('credit-open').addEventListener('click', openHelp);
  const setBare = (on) => { body.classList.toggle('bare', on); if (on) toast('Press H, or use Show controls, to bring the interface back'); };
  $('hide-ui').addEventListener('click', () => { setSheet(null); setBare(true); $('unbare').focus({ preventScroll: true }); });
  $('unbare').addEventListener('click', () => { setBare(false); view.focus({ preventScroll: true }); });

  // ---- navigation cluster: every drag has a button, and holding one keeps it going ----
  for (const b of document.querySelectorAll('#nav [data-hold]')) {
    const name = b.dataset.hold;
    let since = 0, token = 0;
    const release = () => {
      if (!since) return;
      const mine = token, wait = Math.max(0, 200 - (performance.now() - since));
      since = 0;
      setTimeout(() => { if (mine === token) app.hold(name, false); }, wait);      // a quick click still moves a useful step
    };
    b.addEventListener('pointerdown', (e) => { if (e.button) return; token++; since = performance.now(); app.hold(name, true); b.setPointerCapture?.(e.pointerId); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, release);
    b.addEventListener('click', (e) => { if (e.detail === 0) { const mine = ++token; app.hold(name, true); setTimeout(() => { if (mine === token) app.hold(name, false); }, 260); } });   // keyboard
  }
  $('compass').addEventListener('click', () => app.north());
  $('tilt').addEventListener('click', () => app.tilt());
  $('home').addEventListener('click', () => { stopTour(); app.home(); });
  const needle = $('needle');
  let needleAngle = 0;

  // ---- search ----
  const input = $('search'), list = $('search-list'), ORDER = { State: 0, City: 1, Peak: 2, Region: 3 };
  const index = [
    ...initial.states.map((s) => ({ name: s.name, kind: 'State', go: () => app.goState(s) })),
    ...[...CITIES, ...PEAKS, ...FEATURES].map((p) => ({ name: p.name, kind: KIND[p.kind], go: () => app.goPlace(p) })),
  ];
  let results = [], active = -1;
  const closeList = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = (i) => {
    active = i;
    [...list.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', `so-${i}`); list.children[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };
  const choose = (item) => { input.value = item.name; closeList(); stopTour(); if (narrow()) setSheet(null); item.go(); view.focus({ preventScroll: true }); };
  const search = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { closeList(); return; }
    results = index
      .map((it) => { const n = it.name.toLowerCase(); return { it, score: n.startsWith(q) ? 0 : n.split(/[\s.-]+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : -1 }; })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || ORDER[a.it.kind] - ORDER[b.it.kind] || a.it.name.localeCompare(b.it.name))
      .slice(0, 7).map((r) => r.it);
    list.replaceChildren(...(results.length
      ? results.map((it, i) => el('li', { role: 'option', id: `so-${i}`, 'aria-selected': 'false', onpointerdown: (e) => { e.preventDefault(); choose(it); } }, el('span', {}, it.name), el('small', {}, it.kind)))
      : [el('li', { role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false' }, 'No match. Try a state, city or peak.')]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(results.length ? 0 : -1);
  };
  input.addEventListener('input', search);
  input.addEventListener('focus', () => { if (input.value.trim()) search(); });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeList(); }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden) search(); else if (results.length) setActive((active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (!list.hidden && results[active]) choose(results[active]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (!list.hidden) closeList(); else { input.value = ''; view.focus({ preventScroll: true }); }
      e.stopPropagation();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || help.open) return;
    if (open) closeSheet(); else if (!card.hidden) { stopTour(); hideCard(); }
  });

  // ---- first-visit hint, readout ----
  const hint = $('hint');
  let hintTimer = 0;
  const hideHint = () => { if (hint.hidden) return; hint.hidden = true; clearTimeout(hintTimer); store.set('relief-map:hinted', '1'); };
  const readout = $('readout');
  const setReadout = (info) => {
    if (!info) { if (!readout.hidden) { readout.hidden = true; lastReadout = ''; } return; }
    const height = info.water === 'sea' ? `sea, ${formatHeight(info.depth, units)} deep` : `${formatHeight(info.elev, units)}${info.water ? ', lake surface' : ''}`;
    const text = `<b>${info.state || (info.water === 'sea' ? 'Offshore' : 'Canada')}</b> · ${height} <span>· ${formatCoords(info.lat, info.lon)}</span>`;
    if (text !== lastReadout) { readout.innerHTML = text; lastReadout = text; }
    readout.hidden = false;
  };

  const loading = $('loading'), pin = $('pin'), chrome = [$('top'), $('nav'), $('dock'), card, readout];
  return {
    setReadout, showPoint, showPlace, showState, hideCard, toast, openHelp,
    tourStop: (i) => { stopTour(); showStop(i); },
    setLayerBox: (name, on) => { const b = boxes.get(name); if (b) b.checked = on; },
    setPerf: (text) => { if (text !== perf) { perf = text; showPerf(); } },
    focusSearch: () => { input.focus(); input.select(); },
    /** The user took hold of the map: stop anything that was moving it for them. */
    userMoved: () => { stopTour(); hideHint(); },
    setCompass: (bearing) => {
      const delta = ((-bearing - needleAngle + 540) % 360 + 360) % 360 - 180;       // turn the short way, never spin through a wrap
      if (Math.abs(delta) > 0.4) { needleAngle += delta; needle.style.transform = `rotate(${needleAngle.toFixed(1)}deg)`; }
    },
    movePin: (x, y, on) => { pin.hidden = !on; if (on) pin.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; },
    /** Screen rectangles the interface occupies, so place names can stay clear of them. */
    rects: () => [...chrome, open ? sheets.get(open) : null].filter(Boolean).map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => [r.left - 6, r.top - 6, r.right + 6, r.bottom + 6]),
    toggleBare: () => setBare(!body.classList.contains('bare')),
    progress: (fraction, text) => { $('loading-bar').style.width = `${Math.round(fraction * 100)}%`; if (text) $('loading-text').textContent = text; },
    ready: () => {
      loading.classList.add('done');
      setTimeout(() => { loading.hidden = true; }, 700);
      if (!initial.quiet && !store.get('relief-map:hinted')) {
        hint.textContent = matchMedia('(pointer: coarse)').matches ? 'One finger orbits. Two fingers pan and zoom. Tap for details.' : 'Drag to orbit. Scroll to zoom. Right-drag to pan. Click for details.';
        hint.hidden = false;
        hintTimer = setTimeout(hideHint, 12000);
      }
    },
    fail: (message) => { loading.hidden = false; loading.classList.remove('done'); loading.classList.add('failed'); $('loading-text').textContent = message; },
  };
}
