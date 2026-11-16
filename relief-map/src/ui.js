// Interface: the control panel, place-name labels, the hover readout and the info card.
import { CITIES, PEAKS, FEATURES, TOURS } from './places.js';
import { lonLatToWorld } from './geo.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function formatHour(h) {
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh % 24 < 12 ? 'am' : 'pm'}`;
}

const BIG = new Set(['Pacific Ocean', 'Atlantic Ocean', 'Gulf of Mexico', 'Great Plains', 'Rocky Mountains', 'Appalachian Mountains']);
function rankOf(p) {
  if (p.kind === 'city') return p.pop >= 9 ? 0 : p.pop >= 4.5 ? 1 : p.pop >= 2.2 ? 2 : 3;
  if (p.kind === 'peak') return p.elev >= 4300 || p.name === 'Mount Mitchell' || p.name === 'Mount Washington' ? 2 : 3;
  if (BIG.has(p.name)) return 0;
  return /Lake (Superior|Michigan|Huron|Erie|Ontario)|Sierra|Cascade|Colorado Plateau|Great Basin|Mississippi River/.test(p.name) ? 1 : 2;
}

export function describe(place) {
  if (place.kind === 'city') return `Metropolitan area of about ${place.pop >= 1 ? `${place.pop.toFixed(1)} million` : `${fmt(place.pop * 1e6)}`} people`;
  if (place.kind === 'peak') return `Summit ${fmt(place.elev)} m (${fmt(place.elev * 3.28084)} ft)`;
  return 'Physical region';
}

/** Place names projected onto the screen each frame, thinned by zoom and kept from overlapping. */
export class Labels {
  constructor(root, onPick) {
    this.root = root;
    this.items = [...CITIES, ...PEAKS, ...FEATURES].map((place) => {
      const [x, z] = lonLatToWorld(place.lon, place.lat), el = document.createElement('button');
      el.type = 'button';
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
   */
  update(project, groundY, blocked, width, height, distance, avoid = []) {
    if (!this.measured) { for (const it of this.items) { const r = it.el.getBoundingClientRect(); it.w = r.width || it.place.name.length * 7 + 16; it.h = r.height || 18; } this.measured = true; }
    const maxRank = distance > 1000 ? 0 : distance > 640 ? 1 : distance > 330 ? 2 : 3, taken = [...avoid];
    for (const it of this.items) {
      let show = it.rank <= maxRank, sx = 0, sy = 0;
      if (show) {
        const y = groundY(it.x, it.z) + it.lift;
        [sx, sy, show] = ((p) => [p[0], p[1], p[2] < 1])(project(it.x, y, it.z));
        if (show) show = sx > 4 && sy > 40 && sx < width - 8 && sy < height - 30 && !blocked(it.x, y, it.z);
        if (show) {
          // Anchor: cities and peaks sit to the right of their marker, regions are centred.
          const left = it.place.kind === 'feature' ? sx - it.w / 2 : sx - 9, top = sy - it.h / 2, box = [left - 4, top - 2, left + it.w + 4, top + it.h + 2];
          if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) show = false;
          else { taken.push(box); sx = left; sy = top; }
        }
      }
      if (show) it.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
      if (show !== it.shown) { it.el.classList.toggle('lbl-off', !show); it.el.tabIndex = show ? 0 : -1; it.shown = show; }
    }
  }
}

/** Wires the panel to the app. `app` supplies the actions; this file owns only the DOM. */
export function createUI(app, initial) {
  const body = document.body;
  // Tours
  const tours = $('tours'), tourButtons = new Map();
  for (const tour of TOURS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = tour.name; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => app.tour(tour.id));
    tours.appendChild(b); tourButtons.set(tour.id, b);
  }
  const markTour = (id) => { for (const [k, b] of tourButtons) b.setAttribute('aria-pressed', String(k === id)); };

  // Sliders
  const hour = $('hour'), exag = $('exag');
  const showHour = () => { $('hour-out').textContent = formatHour(Number(hour.value)); };
  const showExag = () => { $('exag-out').textContent = `${exag.value}x`; };
  hour.value = initial.hour; exag.value = initial.exag;
  hour.addEventListener('input', () => { showHour(); app.setHour(Number(hour.value)); });
  exag.addEventListener('input', () => { showExag(); app.setExaggeration(Number(exag.value)); });
  showHour(); showExag();

  // Layers
  const boxes = new Map();
  for (const box of document.querySelectorAll('[data-layer]')) {
    box.checked = Boolean(initial.layers[box.dataset.layer]);
    box.addEventListener('change', () => app.setLayer(box.dataset.layer, box.checked));
    boxes.set(box.dataset.layer, box);
  }
  const setLayerBox = (name, on) => { const b = boxes.get(name); if (b) b.checked = on; };

  // Quality
  const quality = $('quality');
  quality.value = initial.qualityChoice;
  $('quality-hint').textContent = initial.qualityChoice === 'auto' ? `Running at ${initial.quality}. Changing this reloads the map.` : 'Changing this reloads the map.';
  quality.addEventListener('change', () => app.setQuality(quality.value));

  $('shot').addEventListener('click', () => app.screenshot());
  $('reset').addEventListener('click', () => app.tour('overview'));
  const help = $('help');
  $('help-open').addEventListener('click', () => { if (help.showModal) help.showModal(); else help.setAttribute('open', ''); });

  const toggle = $('panel-toggle');
  const setPanel = (open) => { body.classList.toggle('panel-open', open); toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => setPanel(!body.classList.contains('panel-open')));
  setPanel(!matchMedia('(max-width: 760px)').matches);

  // Readout and card
  const readout = $('readout'), card = $('card');
  let lastText = '';
  const setReadout = (info) => {
    if (!info) { if (!readout.hidden) { readout.hidden = true; lastText = ''; } return; }
    const where = `${Math.abs(info.lat).toFixed(2)}°${info.lat >= 0 ? 'N' : 'S'} ${Math.abs(info.lon).toFixed(2)}°${info.lon >= 0 ? 'E' : 'W'}`;
    const height = info.water === 'sea' ? `Sea, about ${fmt(info.depth)} m deep` : `${fmt(info.elev)} m (${fmt(info.elev * 3.28084)} ft)${info.water ? `, ${info.water}` : ''}`;
    const text = `<b>${info.state || (info.water === 'sea' ? 'Offshore' : 'Canada')}</b> · ${height} <span>· ${where}${info.near ? ` · near ${info.near}` : ''}</span>`;
    if (text !== lastText) { readout.innerHTML = text; lastText = text; }
    readout.hidden = false;
  };
  const showCard = (place) => {
    if (!place) { card.hidden = true; return; }
    card.replaceChildren();
    const text = document.createElement('div'), h = document.createElement('h3'), p = document.createElement('p'), close = document.createElement('button');
    h.textContent = place.name; p.textContent = describe(place);
    close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', () => { card.hidden = true; });
    text.append(h, p); card.append(text, close);
    card.hidden = false;
  };

  const loading = $('loading');
  return {
    markTour, setReadout, showCard, setLayerBox,
    setHourValue: (v) => { hour.value = v; showHour(); },
    progress: (fraction, text) => { $('loading-bar').style.width = `${Math.round(fraction * 100)}%`; if (text) $('loading-text').textContent = text; },
    ready: () => { loading.classList.add('done'); setTimeout(() => { loading.hidden = true; }, 700); },
    fail: (message) => { loading.hidden = false; loading.classList.remove('done'); loading.classList.add('failed'); $('loading-text').textContent = message; },
    toggleBare: () => body.classList.toggle('bare'),
  };
}
