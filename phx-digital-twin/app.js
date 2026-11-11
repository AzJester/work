// PHX Sky Harbor digital twin. Three.js r160, ES module.
// World frame: meters, origin at the KPHX datum (33.434278N, -112.011583W, 1,131 ft MSL).
// x = east, n = north, y = up. In three.js space: (x, y, -n).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const DEG = Math.PI / 180, FT = 0.3048, KT = 0.514444;
const LAT0 = 33.434277778, LON0 = -112.011583333, ELEV_FT = 1131;
const M_LAT = 111132.92 - 559.82 * Math.cos(2 * LAT0 * DEG) + 1.175 * Math.cos(4 * LAT0 * DEG);
const M_LON = 111412.84 * Math.cos(LAT0 * DEG) - 93.5 * Math.cos(3 * LAT0 * DEG);
const toLL = (x, n) => [LAT0 + n / M_LAT, LON0 + x / M_LON];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hdgOf = (dx, dn) => (Math.atan2(dx, dn) / DEG + 360) % 360;
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const hex6 = (v) => v.toString(16).toUpperCase().padStart(6, '0');
const isNarrow = () => innerWidth <= 760;

// ---------------------------------------------------------------- N-number -> ICAO 24-bit (FAA allocation)
// Verified against the reference video: N327QS -> A389C0.
const NCH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NSUF = 1 + 24 * 25, NB4 = 1 + 24 + 10, NB3 = 10 * NB4 + NSUF, NB2 = 10 * NB3 + NSUF, NB1 = 10 * NB2 + NSUF;
export function nToIcao(reg) {
  const s = reg.toUpperCase().replace(/^N/, '');
  let o = 0xA00001 + (+s[0] - 1) * NB1;
  const bk = [NB2, NB3, NB4];
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (i === 4) { o += NCH.includes(c) ? NCH.indexOf(c) + 1 : 25 + (+c); break; }
    if (NCH.includes(c)) { o += 25 * NCH.indexOf(c) + 1; if (s[i + 1]) o += NCH.indexOf(s[i + 1]) + 1; break; }
    o += NSUF + (+c) * bk[i - 1];
  }
  return hex6(o);
}
if (nToIcao('N327QS') !== 'A389C0') console.warn('ICAO conversion self-test failed');

// ---------------------------------------------------------------- loading
const loadBar = $('#load-bar'), loadMsg = $('#load-msg');
const progress = (msg, f) => { loadMsg.textContent = msg; loadBar.style.width = `${Math.round(f * 100)}%`; };
const fail = (msg) => { $('#loading').classList.add('err'); loadMsg.textContent = msg; };
window.addEventListener('error', (e) => { if ($('#loading') && !$('#loading').hidden) fail(`Could not start the twin: ${e.message}`); });

async function getData() {
  const get = async (u, t) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} returned ${r.status}`); return t === 'json' ? r.json() : r.text(); };
  const b64 = (txt) => { const s = atob(txt.trim()), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8.buffer; };
  const img = new Image(); img.src = 'data/imagery.jpg';
  const fonts = document.fonts ? Promise.all([document.fonts.load('700 26px "Barlow Condensed"'), document.fonts.load('600 12px "Barlow Condensed"')]).catch(() => {}) : Promise.resolve();
  const [airport, terrTxt, bldTxt] = await Promise.all([get('data/airport.json', 'json'), get('data/terrain.b64.txt'), get('data/buildings.b64.txt')]);
  const terr = b64(terrTxt), bld = b64(bldTxt);
  progress('Decoding Sentinel-2 imagery', 0.35);
  await img.decode();
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
  return { airport, terr, bld, img };
}

// ---------------------------------------------------------------- reference data
const APT = { LAX:[33.942,-118.408],SFO:[37.619,-122.375],SAN:[32.733,-117.19],LAS:[36.08,-115.152],DEN:[39.856,-104.674],DFW:[32.897,-97.038],ORD:[41.979,-87.904],ATL:[33.637,-84.428],SEA:[47.45,-122.309],JFK:[40.64,-73.779],CLT:[35.214,-80.943],MSP:[44.882,-93.222],SLC:[40.788,-111.978],IAH:[29.984,-95.341],EWR:[40.693,-74.169],BOS:[42.364,-71.005],MDW:[41.786,-87.752],OAK:[37.721,-122.221],BUR:[34.201,-118.359],SMF:[38.695,-121.591],PDX:[45.589,-122.597],ABQ:[35.04,-106.609],ELP:[31.807,-106.378],HOU:[29.645,-95.279],DAL:[32.847,-96.852],AUS:[30.195,-97.67],BWI:[39.175,-76.668],DTW:[42.212,-83.353],MIA:[25.795,-80.287],PHL:[39.872,-75.241],DCA:[38.852,-77.037],YYZ:[43.677,-79.631],YVR:[49.195,-123.184],YYC:[51.131,-114.01],YEG:[53.31,-113.58],LHR:[51.47,-0.454],MEX:[19.436,-99.072],GDL:[20.522,-103.311],SJD:[23.152,-109.721],MEM:[35.042,-89.977],IND:[39.717,-86.294],SDF:[38.174,-85.736],ONT:[34.056,-117.601],ASE:[39.223,-106.869],TEB:[40.85,-74.061],VNY:[34.21,-118.49],MCI:[39.298,-94.714],STL:[38.748,-90.37],MSY:[29.993,-90.258],BNA:[36.124,-86.678],OKC:[35.393,-97.601],RNO:[39.499,-119.768],BOI:[43.564,-116.223],SNA:[33.676,-117.868],PSP:[33.83,-116.507],MSN:[43.14,-89.34],FAT:[36.776,-119.718],OMA:[41.303,-95.894],SAT:[29.534,-98.47],TPA:[27.976,-82.533],MCO:[28.429,-81.309] };

const LIV = { // generic livery colors keyed by operator (no logos)
  AAL: { body: '#c9ced5', belly: '#aeb4bc', tail: '#3a5a92', eng: '#9aa2ac' },
  SWA: { body: '#2b3f96', belly: '#b9bec6', tail: '#2b3f96', eng: '#c5cad1', tail2: '#d63a3a' },
  DAL: { body: '#f2f3f5', belly: '#1d2a4d', tail: '#b5122b', eng: '#1d2a4d' },
  UAL: { body: '#f2f3f5', belly: '#2c4f86', tail: '#163563', eng: '#163563' },
  ASA: { body: '#f2f3f5', belly: '#f2f3f5', tail: '#0d3a5c', eng: '#0d3a5c' },
  FFT: { body: '#f2f3f5', belly: '#f2f3f5', tail: '#1c7a45', eng: '#1c7a45' },
  JBU: { body: '#f2f3f5', belly: '#d9dde3', tail: '#15357a', eng: '#9aa2ac' },
  SCX: { body: '#f2f3f5', belly: '#f2f3f5', tail: '#e8761e', eng: '#e8761e' },
  ACA: { body: '#f2f3f5', belly: '#2a2a2a', tail: '#151515', eng: '#151515' },
  WJA: { body: '#f2f3f5', belly: '#f2f3f5', tail: '#0b4f5c', eng: '#0b4f5c' },
  AMX: { body: '#f2f3f5', belly: '#cfd4da', tail: '#0b2240', eng: '#0b2240' },
  VOI: { body: '#f2f3f5', belly: '#f2f3f5', tail: '#8b1f86', eng: '#8b1f86' },
  BAW: { body: '#f2f3f5', belly: '#1a2b5e', tail: '#c8102e', eng: '#1a2b5e' },
  FDX: { body: '#f2f3f5', belly: '#d9dde3', tail: '#4d148c', eng: '#9aa2ac' },
  UPS: { body: '#4a2c1e', belly: '#d9dde3', tail: '#4a2c1e', eng: '#4a2c1e' },
  EJA: { body: '#f2f3f5', belly: '#2b3644', tail: '#f2f3f5', eng: '#2b3644' },
  GA: { body: '#f2f3f5', belly: '#7c8794', tail: '#7c8794', eng: '#c5cad1' },
  MIL: { body: '#8d969c', belly: '#8d969c', tail: '#8d969c', eng: '#7b8489' },
};
const R3 = () => rint(100, 999), R2 = () => rint(10, 99);
const OPS = {
  AAL: { name: 'American Airlines', w: 26, area: 'AB', fleet: [['A321', 5], ['B738', 4], ['A320', 2], ['A319', 2], ['A21N', 2], ['B38M', 1]], reg: () => `N${R3()}${pick(['AN', 'AA', 'UW', 'NN'])}`, fn: [1, 2999], dest: ['DFW', 'CLT', 'ORD', 'LAX', 'MIA', 'PHL', 'DCA', 'JFK', 'SFO', 'SEA', 'BOS', 'ATL', 'DEN', 'SAN', 'LAS', 'AUS', 'IAH', 'SNA', 'MCI', 'STL'] },
  ENY: { name: 'American Eagle (Envoy)', liv: 'AAL', w: 6, area: 'AB', fleet: [['E175', 1]], reg: () => `N${rint(200, 299)}NN`, fn: [3000, 3999], dest: ['ABQ', 'ELP', 'TUS', 'OKC', 'BOI', 'FAT', 'PSP', 'OMA', 'MSN'] },
  SWA: { name: 'Southwest Airlines', w: 34, area: 'CD', fleet: [['B737', 4], ['B738', 3], ['B38M', 3]], reg: () => pick([() => `N${rint(200, 799)}WN`, () => `N8${rint(300, 699)}Q`, () => `N87${R2()}M`])(), fn: [1, 4999], dest: ['LAS', 'DEN', 'OAK', 'SAN', 'BUR', 'SMF', 'MDW', 'BWI', 'HOU', 'DAL', 'AUS', 'SLC', 'ABQ', 'ELP', 'SNA', 'ONT', 'MCI', 'STL', 'BNA', 'MSY', 'SAT', 'TPA', 'MCO'] },
  DAL: { name: 'Delta Air Lines', w: 6, area: 'E', fleet: [['A321', 3], ['B739', 3], ['A320', 1], ['B752', 1]], reg: () => `N${rint(300, 399)}${pick(['DN', 'DX', 'DZ'])}`, fn: [300, 2999], dest: ['ATL', 'MSP', 'DTW', 'SLC', 'LAX', 'SEA', 'JFK'] },
  ASA: { name: 'Alaska Airlines', w: 3, area: 'E', fleet: [['B739', 2], ['B738', 1]], reg: () => `N${rint(200, 599)}AS`, fn: [400, 1499], dest: ['SEA', 'PDX', 'SFO', 'SAN'] },
  UAL: { name: 'United Airlines', w: 6, area: 'F', fleet: [['B738', 2], ['B739', 2], ['A320', 2], ['B38M', 1]], reg: () => `N${rint(200, 899)}UA`, fn: [200, 2699], dest: ['DEN', 'ORD', 'IAH', 'SFO', 'EWR', 'LAX'] },
  FFT: { name: 'Frontier Airlines', w: 2, area: 'F', fleet: [['A20N', 2], ['A21N', 1]], reg: () => `N${rint(300, 399)}FR`, fn: [1000, 2999], dest: ['DEN', 'LAS', 'ATL', 'MCO'] },
  JBU: { name: 'JetBlue', w: 1, area: 'F', fleet: [['A320', 1]], reg: () => `N${rint(500, 999)}JB`, fn: [100, 2999], dest: ['BOS', 'JFK'] },
  SCX: { name: 'Sun Country Airlines', w: 1, area: 'F', fleet: [['B738', 1]], reg: () => `N${rint(800, 849)}SY`, fn: [100, 699], dest: ['MSP'] },
  ACA: { name: 'Air Canada', w: 1, area: 'F', fleet: [['BCS3', 1], ['A320', 1]], reg: () => `C-F${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}`, hex: () => hex6(rint(0xC00001, 0xC3FFFF)), fn: [1000, 1999], dest: ['YYZ', 'YVR', 'YYC'] },
  WJA: { name: 'WestJet', w: 1, area: 'F', fleet: [['B38M', 1], ['B737', 1]], reg: () => `C-G${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}`, hex: () => hex6(rint(0xC00001, 0xC3FFFF)), fn: [1000, 1999], dest: ['YYC', 'YVR', 'YEG'] },
  AMX: { name: 'Aeroméxico', w: 1, area: 'F', fleet: [['B38M', 1]], reg: () => `XA-${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}`, hex: () => hex6(rint(0x0D0000, 0x0D7FFF)), fn: [600, 699], dest: ['MEX'] },
  VOI: { name: 'Volaris', w: 1, area: 'F', fleet: [['A20N', 1]], reg: () => `XA-V${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}${'ABCDEFGHJKLMNPRSTUVWXYZ'[rint(0, 22)]}`, hex: () => hex6(rint(0x0D0000, 0x0D7FFF)), fn: [800, 899], dest: ['GDL', 'MEX'] },
  BAW: { name: 'British Airways', w: 0.4, area: 'AB', size: 'DEF', fleet: [['B772', 1]], reg: () => `G-${['VIIA', 'VIIB', 'VIIE', 'YMMA', 'YMMD'][rint(0, 4)]}`, hex: () => hex6(rint(0x400000, 0x43FFFF)), fn: [289, 289], dest: ['LHR'] },
  FDX: { name: 'FedEx', w: 2, area: 'CARGO', fleet: [['B763', 2], ['A306', 1], ['MD11', 1]], reg: () => `N${rint(100, 199)}FE`, fn: [1200, 1999], dest: ['MEM', 'IND', 'OAK'] },
  UPS: { name: 'UPS Airlines', w: 1.5, area: 'CARGO', fleet: [['B763', 1], ['B752', 1]], reg: () => `N${rint(300, 350)}UP`, fn: [2000, 2999], dest: ['SDF', 'ONT', 'DFW'] },
  EJA: { name: 'NetJets', w: 2, area: 'GA', fleet: [['E55P', 2], ['C68A', 2], ['CL35', 1]], reg: () => `N${rint(300, 399)}QS`, fn: [300, 999], dest: ['ASE', 'TEB', 'VNY', 'SJD', 'DAL', 'RNO', 'SNA'] },
  GA: { name: 'General aviation', w: 1, area: 'GA', fleet: [['C68A', 1], ['GLF6', 1], ['CL35', 1]], reg: () => `N${rint(1, 9)}${rint(10, 999)}${pick(['', 'A', 'G', 'X', 'TM'])}`, fn: null, dest: ['VNY', 'ASE', 'TEB', 'SJD', 'LAS', 'SNA', 'DAL'] },
};
const OP_LIST = Object.entries(OPS).map(([k, v]) => ({ code: k, ...v }));
const TYPE_NAMES = { A319: 'Airbus A319', A320: 'Airbus A320', A20N: 'Airbus A320neo', A321: 'Airbus A321', A21N: 'Airbus A321neo', B737: 'Boeing 737-700', B738: 'Boeing 737-800', B38M: 'Boeing 737 MAX 8', B739: 'Boeing 737-900', B752: 'Boeing 757-200', BCS3: 'Airbus A220-300', E175: 'Embraer 175', B763: 'Boeing 767-300F', B772: 'Boeing 777-200ER', A306: 'Airbus A300-600F', MD11: 'Boeing MD-11F', E55P: 'Embraer Phenom 300', C68A: 'Cessna Citation Latitude', GLF6: 'Gulfstream G650', CL35: 'Challenger 350', K35R: 'Boeing KC-135R' };

// family specs: R radius, belly height, engine radius, layout
const FAM = {
  nb: { R: 1.98, belly: 1.2, engR: 0.98, engs: 'wing2', sweep: 25, dih: 5, tT: false, wl: 0.055, vref: 70, vr: 76, acc: 2.0, vs: 11 },
  wb: { R: 2.9, belly: 1.8, engR: 1.6, engs: 'wing2', sweep: 31, dih: 5.5, tT: false, wl: 0.02, vref: 75, vr: 82, acc: 1.7, vs: 9 },
  tri: { R: 3.0, belly: 1.8, engR: 1.5, engs: 'wing2tail', sweep: 35, dih: 5, tT: false, wl: 0.03, vref: 78, vr: 84, acc: 1.6, vs: 8.5 },
  rj: { R: 1.5, belly: 0.95, engR: 0.74, engs: 'wing2', sweep: 24, dih: 5, tT: false, wl: 0.06, vref: 67, vr: 70, acc: 2.1, vs: 11 },
  bj: { R: 0.95, belly: 0.55, engR: 0.42, engs: 'tail2', sweep: 18, dih: 3, tT: true, wl: 0.06, vref: 58, vr: 60, acc: 2.6, vs: 16 },
  quad: { R: 1.85, belly: 1.25, engR: 0.88, engs: 'wing4', sweep: 35, dih: 6, tT: false, wl: 0, vref: 72, vr: 78, acc: 1.8, vs: 9 },
};
const TYPES = {
  A319: ['nb', 33.8, 34.1, 11.8], A320: ['nb', 37.6, 35.8, 11.8], A20N: ['nb', 37.6, 35.8, 11.8, { engR: 1.08 }], A321: ['nb', 44.5, 35.8, 11.8], A21N: ['nb', 44.5, 35.8, 11.8, { engR: 1.08 }],
  B737: ['nb', 33.6, 35.8, 12.5, { R: 1.88 }], B738: ['nb', 39.5, 35.8, 12.5, { R: 1.88 }], B38M: ['nb', 39.5, 35.9, 12.3, { R: 1.88, engR: 1.05 }], B739: ['nb', 42.1, 35.8, 12.5, { R: 1.88 }], B752: ['nb', 47.3, 38.1, 13.6, { R: 1.88, engR: 1.12 }],
  BCS3: ['nb', 38.7, 35.1, 11.5, { R: 1.85, engR: 1.03 }], E175: ['rj', 31.7, 26.0, 9.7],
  B763: ['wb', 54.9, 47.6, 15.9, { R: 2.52, engR: 1.42 }], B772: ['wb', 63.7, 60.9, 18.5, { R: 3.1, engR: 1.8 }], A306: ['wb', 54.1, 44.8, 16.5, { R: 2.82, engR: 1.45 }], MD11: ['tri', 61.6, 51.7, 17.6],
  E55P: ['bj', 15.6, 16.2, 5.1], C68A: ['bj', 19.0, 22.0, 6.3, { R: 1.05 }], GLF6: ['bj', 30.4, 30.4, 7.9, { R: 1.3, engR: 0.62 }], CL35: ['bj', 20.9, 21.0, 6.1, { R: 1.1, engR: 0.5 }],
  K35R: ['quad', 41.5, 39.9, 12.7],
};
function typeSpec(t) { const [fam, L, S, H, o] = TYPES[t]; return { t, fam, L, S, H, ...FAM[fam], ...(o || {}) }; }

// ================================================================= boot
let D;
try { D = await getData(); } catch (e) { fail(`Could not load the airport data (${e.message}). Reload the page to try again.`); throw e; }
const AP = D.airport;
progress('Setting up renderer', 0.45);

const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { fail('This browser could not start WebGL, which the 3D twin needs. Try a desktop browser with hardware acceleration on.'); throw e; }
const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
const LOWQ = !!window.__TWIN_LOWQ; // headless test hook: software GL cannot keep up with full quality
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAXTEX = renderer.capabilities.maxTextureSize;
const ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 2, 180000);
const labelRenderer = new CSS2DRenderer({ element: $('#labels') });
labelRenderer.setSize(innerWidth, innerHeight);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 88 * DEG; controls.minDistance = 25; controls.maxDistance = 60000;
controls.zoomSpeed = 1.1; controls.screenSpacePanning = false;

// ---------------------------------------------------------------- terrain
const tdv = new DataView(D.terr);
const TN = tdv.getInt32(0, true), THALF = tdv.getInt32(4, true), TM = tdv.getInt32(8, true), THALF2 = tdv.getInt32(12, true);
const tInner = new Int16Array(D.terr, 16, TN * TN), tOuter = new Int16Array(D.terr, 16 + TN * TN * 2, TM * TM);
function terrainH(x, n) {
  const fx = (x + THALF) / (2 * THALF) * (TN - 1), fy = (THALF - n) / (2 * THALF) * (TN - 1);
  if (fx < 0 || fy < 0 || fx >= TN - 1 || fy >= TN - 1) {
    const gx = clamp((x + THALF2) / (2 * THALF2) * (TM - 1), 0, TM - 1.001), gy = clamp((THALF2 - n) / (2 * THALF2) * (TM - 1), 0, TM - 1.001);
    const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
    const h = (a, b) => tOuter[b * TM + a] / 10;
    return lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), v);
  }
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const h = (a, b) => tInner[b * TN + a] / 10;
  return lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), v);
}
function gridGeo(arr, size, half) {
  const g = new THREE.PlaneGeometry(2 * half, 2 * half, size - 1, size - 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, arr[i] / 10);
  g.computeVertexNormals();
  return g;
}
const imgTex = new THREE.Texture(D.img);
imgTex.colorSpace = THREE.SRGBColorSpace; imgTex.anisotropy = ANISO; imgTex.needsUpdate = true;

// city-lights emissive map derived from the imagery: low-saturation built-up pixels glow at night
function cityLights(img) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx > 0 ? (mx - mn) / mx : 0;
    let m = clamp((0.30 - sat) / 0.16, 0, 1) * clamp((mx - 0.30) / 0.35, 0, 1);
    m *= 0.35 + Math.random() * 0.9;
    a[i] = 255 * m; a[i + 1] = 165 * m; a[i + 2] = 80 * m; a[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const terrainMat = new THREE.MeshStandardMaterial({ map: imgTex, roughness: 1, metalness: 0, emissiveMap: cityLights(D.img), emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, envMapIntensity: 0.6 });
const terrain = new THREE.Mesh(gridGeo(tInner, TN, THALF), terrainMat);
terrain.receiveShadow = true; scene.add(terrain);
{
  const g = gridGeo(tOuter, TM, THALF2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i), m = sstep(15, 380, h);
    c.setRGB(lerp(0.70, 0.47, m), lerp(0.60, 0.38, m), lerp(0.47, 0.30, m), THREE.SRGBColorSpace);
    const k = 0.93 + Math.random() * 0.1; col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const outer = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  outer.position.y = -0.5; scene.add(outer);
}

// ---------------------------------------------------------------- runway model
const RWY = AP.runways.map((r, idx) => {
  const [a, b] = r.ends, dx = b.p[0] - a.p[0], dn = b.p[1] - a.p[1], len = Math.hypot(dx, dn);
  return { idx, name: `${a.id}/${b.id}`, w: r.w, hw: r.w / 2, len, ux: dx / len, un: dn / len, a, b, surf: r.surf };
});
const ENDS = {};
for (const r of RWY) {
  for (const [e, sgn] of [[r.a, 1], [r.b, -1]]) {
    const ux = r.ux * sgn, un = r.un * sgn;
    ENDS[e.id] = { id: e.id, rw: r, sgn, ux, un, hdg: hdgOf(ux, un), p: e.p, disp: e.disp, thr: [e.p[0] + ux * e.disp, e.p[1] + un * e.disp], exits: e.exits || [], entry: e.entry, other: null, data: e };
  }
}
for (const r of RWY) { ENDS[r.a.id].other = ENDS[r.b.id]; ENDS[r.b.id].other = ENDS[r.a.id]; }
function rwyAt(x, n, latM = 0, alM = 0) {
  for (const r of RWY) {
    const dx = x - r.a.p[0], dn = n - r.a.p[1], al = dx * r.ux + dn * r.un, lat = -dx * r.un + dn * r.ux;
    if (al >= -alM && al <= r.len + alM && Math.abs(lat) <= r.hw + latM) return r.idx;
  }
  return -1;
}

// ---------------------------------------------------------------- airfield bake (pavement, markings, runways)
const [PX0, PX1, PN0, PN1] = AP.meta.plane;
function noisePattern(g0, size, base, amp, joints, scale) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), d = g.createImageData(size, size), a = d.data;
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * amp;
    a[i * 4] = base[0] + n; a[i * 4 + 1] = base[1] + n; a[i * 4 + 2] = base[2] + n; a[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  // soft blotches
  for (let k = 0; k < size / 6; k++) {
    const x = Math.random() * size, y = Math.random() * size, r = 6 + Math.random() * size / 8;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dk = Math.random() < 0.5 ? 0 : 255;
    gr.addColorStop(0, `rgba(${dk},${dk},${dk},${0.05 + Math.random() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (joints) {
    g.strokeStyle = 'rgba(40,38,34,0.20)'; g.lineWidth = 1;
    for (let v = 0; v <= size; v += joints) { g.beginPath(); g.moveTo(v + 0.5, 0); g.lineTo(v + 0.5, size); g.moveTo(0, v + 0.5); g.lineTo(size, v + 0.5); g.stroke(); }
  }
  const p = g0.createPattern(c, 'repeat');
  if (scale && p.setTransform) p.setTransform(new DOMMatrix().scale(scale));
  return p;
}
function hatchPattern(g0, col) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); g.strokeStyle = col; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-4, 20); g.lineTo(20, -4); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(12, 20); g.lineTo(20, 12); g.stroke();
  const p = g0.createPattern(c, 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(0.5)); return p;
}
const LSTY = { // line type -> [color, width m, dash, black border]
  1: ['#f0be2a', 0.15], 51: ['#f0be2a', 0.15, null, 1], 2: ['#f0be2a', 0.15, [3, 3]], 52: ['#f0be2a', 0.15, [3, 3], 1],
  3: ['#f0be2a', 0.45], 53: ['#f0be2a', 0.45, null, 1], 4: ['#f0be2a', 1.0], 54: ['#f0be2a', 1.0, null, 1], 5: ['#f0be2a', 0.7], 55: ['#f0be2a', 0.7, null, 1],
  6: ['#f0be2a', 0.9], 56: ['#f0be2a', 0.9, null, 1], 7: ['#f0be2a', 0.5], 57: ['#f0be2a', 0.5, null, 1], 8: ['#f0be2a', 0.15, [4.5, 9]], 58: ['#f0be2a', 0.15, [4.5, 9], 1],
  19: ['#c24a37', 0.18], 20: ['#e9e8e2', 0.15], 21: ['#e9e8e2', 0.3, [1, 1]], 22: ['#e9e8e2', 0.15, [3, 3]], 30: ['#cf3b2d', 0.2], 31: ['#cf3b2d', 0.2, [3, 3]], 74: ['#dcdcd6', 0.2], 73: ['#e9e8e2', 0.15], 60: ['#f0be2a', 0.15],
};
function bakeAirfield() {
  const Wm = PX1 - PX0, Hm = PN1 - PN0;
  const cw = (MAXTEX >= 8192 && !MOBILE && !LOWQ) ? 8192 : 4096, s = cw / Wm, ch = Math.round(Hm * s);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const ipx = D.img.width / (2 * AP.meta.imagery_half);
  g.drawImage(D.img, (PX0 + AP.meta.imagery_half) * ipx, (AP.meta.imagery_half - PN1) * ipx, Wm * ipx, Hm * ipx, 0, 0, cw, ch);
  g.setTransform(s, 0, 0, -s, -PX0 * s, PN1 * s);
  const minW = 0.85 / s;
  const pat = {
    aL: noisePattern(g, 256, [168, 165, 158], 14), aD: noisePattern(g, 256, [140, 137, 131], 14),
    cL: noisePattern(g, 512, [214, 210, 200], 10, 15, 0.5), cD: noisePattern(g, 512, [198, 194, 184], 10, 15, 0.5),
    hatch: hatchPattern(g, 'rgba(200,58,45,0.75)'),
  };
  // pavements in file order
  for (const p of AP.pavements) {
    const path = new Path2D();
    for (const r of p.rings) { if (r.length < 6) continue; path.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) path.lineTo(r[i], r[i + 1]); path.closePath(); }
    if (/safety_area/.test(p.name)) { g.fillStyle = pat.hatch; g.fill(path, 'evenodd'); continue; }
    const light = /_\dL\.pol/.test(p.name) || (!/_\dD\.pol/.test(p.name) && p.surf === 2);
    g.fillStyle = p.surf === 2 ? (light ? pat.cL : pat.cD) : p.surf === 5 ? '#8f8270' : (light ? pat.aL : pat.aD);
    g.fill(path, 'evenodd');
  }
  // runways with FAA precision markings
  const runwayPat = noisePattern(g, 512, [186, 182, 173], 12, 15, 0.5);
  for (const r of RWY) {
    g.save();
    g.translate(r.a.p[0], r.a.p[1]); g.rotate(Math.atan2(r.un, r.ux));
    const L = r.len, hw = r.hw;
    // blast pads
    for (const [e, x0, sg] of [[r.a, 0, -1], [r.b, L, 1]]) {
      if (e.blast > 0) {
        g.fillStyle = pat.aD; g.fillRect(Math.min(x0, x0 + sg * e.blast), -hw, e.blast, 2 * hw);
        g.strokeStyle = '#e2b21f'; g.lineWidth = 0.9;
        for (let d = 15; d < e.blast - 5; d += 30) { g.beginPath(); g.moveTo(x0 + sg * (d + 20), -hw + 2); g.lineTo(x0 + sg * d, 0); g.lineTo(x0 + sg * (d + 20), hw - 2); g.stroke(); }
      }
    }
    g.fillStyle = runwayPat; g.fillRect(0, -hw, L, 2 * hw);
    // shoulders
    g.fillStyle = 'rgba(150,146,138,0.95)'; g.fillRect(0, -hw - 7, L, 7); g.fillRect(0, hw, L, 7);
    // rubber deposits in touchdown zones
    for (const [e, x0, sg] of [[r.a, 0, 1], [r.b, L, -1]]) {
      const t0 = x0 + sg * (e.disp + 220);
      for (let k = 0; k < 140; k++) {
        const d = Math.random() ** 1.6 * 900, xx = t0 + sg * d, yy = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 5);
        g.fillStyle = `rgba(38,36,34,${0.06 + Math.random() * 0.1})`; g.fillRect(xx - 12, yy - 1.6, 24 + Math.random() * 30, 3.2);
      }
    }
    g.fillStyle = '#f4f4f0';
    const thrX = { a: r.a.disp, b: L - r.b.disp };
    // side stripes
    g.fillRect(thrX.a, hw - 1.4, thrX.b - thrX.a, 0.9); g.fillRect(thrX.a, -hw + 0.5, thrX.b - thrX.a, 0.9);
    // centerline (from both designations)
    for (let x = thrX.a + 125; x < thrX.b - 125 - 36; x += 61) g.fillRect(x, -0.45, 36.6, 0.9);
    for (const [e, xe, sg] of [[r.a, 0, 1], [r.b, L, -1]]) {
      const tx = xe + sg * e.disp;
      const R = (a, b, y0, y1) => g.fillRect(Math.min(tx + sg * a, tx + sg * b), y0, Math.abs(b - a), y1 - y0);
      if (e.disp > 0) {
        R(0, 3, -hw, hw); // threshold bar
        for (let d = -e.disp + 20; d < -20; d += 61) { // displaced-area arrows
          R(d, d + 30, -0.45, 0.45);
          g.beginPath(); g.moveTo(tx + sg * (d + 38), 0); g.lineTo(tx + sg * (d + 28), 2.2); g.lineTo(tx + sg * (d + 28), -2.2); g.closePath(); g.fill();
        }
      }
      for (let i = 0; i < 6; i++) { const yc = 2.625 + i * 3.5; R(6, 51.7, yc - 0.875, yc + 0.875); R(6, 51.7, -yc - 0.875, -yc + 0.875); }
      // designation
      const m = e.id.match(/^0?(\d+)([LRC]?)$/), num = m[1], let_ = m[2];
      const drawTxt = (txt, d0) => {
        g.save(); g.translate(tx + sg * (d0 + 9.2), 0); g.rotate(-sg * Math.PI / 2); g.scale(0.62, -1);
        g.font = '700 25px "Barlow Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(txt, 0, 0); g.restore();
      };
      if (let_) { drawTxt(let_, 64); drawTxt(num, 88); } else drawTxt(num, 64);
      // touchdown zone + aiming point
      const bars = (d, k) => { for (let i = 0; i < k; i++) { const y0 = 11 + i * 3.35; R(d, d + 22.9, y0, y0 + 1.83); R(d, d + 22.9, -y0 - 1.83, -y0); } };
      bars(152, 3); R(305, 350.7, 11, 20.1); R(305, 350.7, -20.1, -11); bars(457, 2); bars(610, 2); bars(762, 1); bars(914, 1);
    }
    g.restore();
  }
  // painted lines
  g.lineCap = 'round'; g.lineJoin = 'round';
  const drawLine = (l, st, border) => {
    const p = l.pts; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    const w = Math.max(st[1], minW);
    if (border) { g.setLineDash([]); g.strokeStyle = 'rgba(15,15,15,0.85)'; g.lineWidth = w + Math.max(0.3, minW * 0.8); g.stroke(); return; }
    g.setLineDash(st[2] || []); g.strokeStyle = st[0]; g.lineWidth = w; g.stroke();
  };
  for (const l of AP.lines) { const st = LSTY[l.t]; if (st && st[3]) drawLine(l, st, true); }
  for (const l of AP.lines) { const st = LSTY[l.t]; if (st) drawLine(l, st, false); }
  g.setLineDash([]);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = ANISO; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  // night apron floodlight map
  const nc = document.createElement('canvas'); nc.width = 1024; nc.height = Math.round(1024 * Hm / Wm);
  const ng = nc.getContext('2d'); const ns = nc.width / Wm;
  ng.fillStyle = '#000'; ng.fillRect(0, 0, nc.width, nc.height);
  ng.setTransform(ns, 0, 0, -ns, -PX0 * ns, PN1 * ns); ng.globalCompositeOperation = 'lighter';
  for (const gt of AP.gates) {
    const [x, n] = gt.p, rad = gt.type === 'gate' ? 75 : 55;
    const gr = ng.createRadialGradient(x, n, 0, x, n, rad); gr.addColorStop(0, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,200,130,0)');
    ng.fillStyle = gr; ng.fillRect(x - rad, n - rad, 2 * rad, 2 * rad);
  }
  const ntex = new THREE.CanvasTexture(nc); ntex.colorSpace = THREE.SRGBColorSpace;
  return { tex, ntex, Wm, Hm };
}
progress('Painting runways, taxiways and 6,400 markings', 0.55);
await new Promise((r) => setTimeout(r, 0));
const AF = bakeAirfield();
const airfieldMat = new THREE.MeshStandardMaterial({ map: AF.tex, roughness: 0.92, metalness: 0, emissiveMap: AF.ntex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.6 });
{
  const g = new THREE.PlaneGeometry(AF.Wm, AF.Hm); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, airfieldMat); m.position.set((PX0 + PX1) / 2, 0, -(PN0 + PN1) / 2); m.receiveShadow = true; scene.add(m);
}

// ---------------------------------------------------------------- static lights (runway, taxiway, approach, PAPI, beacon)
const LIGHT_VS = `
attribute vec3 color; attribute float size; attribute vec3 flash;
uniform float uTime; uniform float uScale; uniform float uNight; uniform float uDay;
varying vec3 vCol; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  float on = 1.0;
  if (flash.y > 0.0) on = step(fract(uTime*flash.y + flash.x), flash.z);
  vA = on * mix(uDay, 2.2, uNight);
  vCol = color;
  float px = size * uScale / max(1.0, -mv.z) * mix(1.0, 2.4, uNight);
  gl_PointSize = on > 0.5 ? clamp(px, mix(1.2, 3.2, uNight), 72.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const LIGHT_FS = `
varying vec3 vCol; varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, r);
  float a = (pow(core, 3.0) * 1.4 + pow(core, 1.2) * 0.25) * vA;
  gl_FragColor = vec4(vCol * a, a);
}`;
const lightUniforms = { uTime: { value: 0 }, uScale: { value: 600 }, uNight: { value: 0 }, uDay: { value: 0.35 } };
const lightMat = new THREE.ShaderMaterial({ vertexShader: LIGHT_VS, fragmentShader: LIGHT_FS, uniforms: lightUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function pointsFrom(arr) {
  const n = arr.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), fl = new Float32Array(n * 3);
  arr.forEach((L, i) => { pos.set([L[0], L[2], -L[1]], i * 3); col.set(L[3], i * 3); sz[i] = L[4]; fl.set(L[5] || [0, 0, 1], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1)); g.setAttribute('flash', new THREE.BufferAttribute(fl, 3));
  const p = new THREE.Points(g, lightMat); p.frustumCulled = false; return p;
}
const C = { W: [1, 0.93, 0.78], Y: [1, 0.78, 0.25], G: [0.25, 1, 0.45], B: [0.25, 0.5, 1], R: [1, 0.15, 0.1], A: [1, 0.62, 0.12] };
const staticLights = [];
function alongPolyline(p, step, cb) {
  let acc = step * 0.5;
  for (let i = 0; i < p.length - 2; i += 2) {
    const x0 = p[i], n0 = p[i + 1], x1 = p[i + 2], n1 = p[i + 3], d = Math.hypot(x1 - x0, n1 - n0);
    while (acc <= d) { const t = acc / d; cb(lerp(x0, x1, t), lerp(n0, n1, t)); acc += step; }
    acc -= d;
  }
}
for (const l of AP.lights) {
  if (l.t === 101) alongPolyline(l.pts, 15, (x, n) => staticLights.push([x, n, 0.25, C.G, 1.0]));
  else if (l.t === 102) alongPolyline(l.pts, 30, (x, n) => staticLights.push([x, n, 0.35, C.B, 1.1]));
  else if (l.t === 103) alongPolyline(l.pts, 1.6, (x, n) => staticLights.push([x, n, 0.25, C.A, 0.8]));
  else if (l.t === 104) { let k = 0; alongPolyline(l.pts, 3, (x, n) => staticLights.push([x, n, 0.5, C.Y, 1.2, [(k++ % 2) * 0.5, 1, 0.5]])); }
}
for (const r of RWY) {
  for (let d = 0; d <= r.len + 0.1; d += 60) for (const s of [-1, 1]) {
    const lat = s * (r.hw + 1);
    staticLights.push([r.a.p[0] + r.ux * d - r.un * lat, r.a.p[1] + r.un * d + r.ux * lat, 0.4, C.W, 1.6]);
  }
  for (let d = 7.5; d < r.len; d += 15) {
    const edge = Math.min(d, r.len - d), c = edge < 300 ? C.R : C.W;
    staticLights.push([r.a.p[0] + r.ux * d, r.a.p[1] + r.un * d, 0.15, c, 0.9]);
  }
  for (const e of [ENDS[r.a.id], ENDS[r.b.id]]) {
    const pX = -e.un, pN = e.ux;
    for (let y = -r.hw; y <= r.hw + 0.1; y += 3) {
      staticLights.push([e.thr[0] - e.ux * 1 + pX * y, e.thr[1] - e.un * 1 + pN * y, 0.3, C.G, 1.2]);
      staticLights.push([e.p[0] - e.ux * 2 + pX * y, e.p[1] - e.un * 2 + pN * y, 0.3, C.R, 1.0]);
    }
    const als = e.data.als;
    if (als > 0) {
      const len = als >= 7 ? 720 : 900;
      for (let d = 30; d <= len; d += 30) {
        const bx = e.thr[0] - e.ux * d, bn = e.thr[1] - e.un * d, hh = Math.max(0.5, terrainH(bx, bn) + 2.5 + d * 0.004);
        for (let k = -2; k <= 2; k++) staticLights.push([bx + pX * k * 1.1, bn + pN * k * 1.1, hh, C.W, 1.6]);
        if (d === 300) for (let k = -7; k <= 7; k++) if (Math.abs(k) > 2) staticLights.push([bx + pX * k * 1.5, bn + pN * k * 1.5, hh, C.W, 1.6]);
        if (d >= 300) staticLights.push([bx, bn, hh + 0.6, [1, 1, 1], 3.2, [1 - d / len, 2, 0.06]]); // sequenced flashers
      }
    }
    if (e.data.reil) for (const s of [-1, 1]) staticLights.push([e.thr[0] + pX * s * (r.hw + 12), e.thr[1] + pN * s * (r.hw + 12), 1.0, [1, 1, 1], 3, [0, 2, 0.05]]);
  }
}
const papi = [];
for (const P of AP.papi) {
  const k0 = P.rw.replace(/^(\d)([LRC]?)$/, '0$1$2'), e = ENDS[k0] || ENDS[k0.replace(/[LRC]$/, '')];
  if (!e) continue;
  const pX = -e.un, pN = e.ux;
  // the PAPI box row sits on the left of the runway; light 0 is closest to the runway
  const side = ((P.p[0] - e.thr[0]) * pX + (P.p[1] - e.thr[1]) * pN) < 0 ? -1 : 1;
  const unitAng = [3.5, 3.17, 2.83, 2.5];
  for (let k = 0; k < 4; k++) {
    const i = staticLights.length;
    staticLights.push([P.p[0] + pX * side * (k - 1.5) * 9, P.p[1] + pN * side * (k - 1.5) * 9, 0.8, C.W, 2.0]);
    papi.push({ i, x: P.p[0], n: P.p[1], ang: unitAng[k], e });
  }
}
{ const b = AP.misc.beacon; staticLights.push([b[0], b[1], 34, C.G, 6, [0, 0.4, 0.25]], [b[0], b[1], 34, [1, 1, 1], 6, [0.5, 0.4, 0.25]]); }
const STATIC_PTS = pointsFrom(staticLights); scene.add(STATIC_PTS);

// ---------------------------------------------------------------- buildings (Overture footprints, lidar heights)
const bldShader = { ref: null };
function buildBuildings(buf) {
  const dv = new DataView(buf), count = dv.getUint32(0, true);
  let off = 4;
  const P = [], N = [], Cc = [], R = [], K = [], U = [];
  const col = new THREE.Color();
  const PAL = {
    0: ['#cfc4b0', '#b9ad99', '#ddd6cb', '#a79d90', '#c9b79b'], 1: ['#b8b5ae', '#aaa69e'], 2: ['#cdd0d2', '#b9bdc1', '#d9dadb'],
    3: ['#e2ddd2', '#d6d1c6'], 4: ['#7d8c99', '#8f9ca6', '#6e7d8a', '#a3a49d'], 5: ['#d8c4a4', '#cdb796', '#e0cfb2'],
  };
  for (let b = 0; b < count; b++) {
    const nv = dv.getUint16(off, true), h = dv.getUint16(off + 2, true) / 10, mh = dv.getUint16(off + 4, true) / 10, kind = dv.getUint8(off + 6);
    off += 8;
    const pts = [];
    for (let i = 0; i < nv; i++) { pts.push([dv.getInt16(off, true) * 0.5, dv.getInt16(off + 2, true) * 0.5]); off += 4; }
    let area = 0, cx = 0, cn = 0;
    for (let i = 0; i < nv; i++) { const [x0, n0] = pts[i], [x1, n1] = pts[(i + 1) % nv]; area += x0 * n1 - x1 * n0; cx += x0; cn += n0; }
    if (area < 0) pts.reverse();
    cx /= nv; cn /= nv;
    const base = terrainH(cx, cn) - 0.6, y0 = base + mh, y1 = base + Math.max(h, 2.5);
    col.set(pick(PAL[kind] || PAL[0]));
    let u = 0;
    for (let i = 0; i < nv; i++) {
      const [ax, an] = pts[i], [bx, bn] = pts[(i + 1) % nv];
      const dx = bx - ax, dn = bn - an, L = Math.hypot(dx, dn);
      if (L < 0.05) continue;
      const nx = dn / L, nn = -dx / L;
      const quad = [[ax, y0, -an, u], [bx, y0, -bn, u + L], [bx, y1, -bn, u + L], [ax, y0, -an, u], [bx, y1, -bn, u + L], [ax, y1, -an, u]];
      for (const q of quad) { P.push(q[0], q[1], q[2]); N.push(nx, 0, -nn); Cc.push(col.r, col.g, col.b); R.push(0); K.push(kind); U.push(q[3]); }
      u += L;
    }
    const contour = pts.map(([x, n]) => new THREE.Vector2(x, n));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
    for (const t of tris) {
      let [a, c2, d] = t;
      const A = pts[a], B = pts[c2], Cn = pts[d];
      if ((B[0] - A[0]) * (Cn[1] - A[1]) - (Cn[0] - A[0]) * (B[1] - A[1]) < 0) [c2, d] = [d, c2];
      for (const k of [a, c2, d]) { P.push(pts[k][0], y1, -pts[k][1]); N.push(0, 1, 0); Cc.push(col.r, col.g, col.b); R.push(1); K.push(kind); U.push(0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute('aRoof', new THREE.Float32BufferAttribute(R, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1)); g.setAttribute('aWU', new THREE.Float32BufferAttribute(U, 1));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uImg = { value: imgTex }; sh.uniforms.uNight = { value: 0 }; bldShader.ref = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRoof; attribute float aKind; attribute float aWU;\nvarying float vRoof; varying float vKind; varying float vWU; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoof = aRoof; vKind = aKind; vWU = aWU; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uImg; uniform float uNight;\nvarying float vRoof; varying float vKind; varying float vWU; varying vec3 vWP; float winLit = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vRoof > 0.5) {
        vec2 iuv = vec2((vWP.x + 15360.0) / 30720.0, (-vWP.z + 15360.0) / 30720.0);
        diffuseColor.rgb = mix(texture2D(uImg, iuv).rgb, diffuseColor.rgb, 0.25);
      } else {
        float fh = vKind > 0.5 && vKind < 1.5 ? 3.1 : 3.8;
        float cw = vKind > 3.5 && vKind < 4.5 ? 2.0 : 3.4;
        float fy = fract((vWP.y + 0.6) / fh), fx = fract(vWU / cw);
        float lo = vKind > 0.5 && vKind < 1.5 ? 0.42 : (vKind > 3.5 && vKind < 4.5 ? 0.08 : 0.32);
        float hi = vKind > 3.5 && vKind < 4.5 ? 0.92 : 0.80;
        float win = step(lo, fy) * step(fy, hi) * step(0.14, fx) * step(fx, 0.86);
        vec2 fq = fwidth(vec2(vWU / cw, vWP.y / fh));
        float aa = 1.0 - smoothstep(0.2, 0.55, max(fq.x, fq.y));
        float has = (vKind > 1.5 && vKind < 2.5) || vWP.y < 1.5 ? 0.0 : 1.0;
        vec3 glass = vKind > 3.5 && vKind < 4.5 ? vec3(0.16, 0.22, 0.28) : vec3(0.09, 0.11, 0.13);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, has * (win * 0.85 * aa + (1.0 - aa) * 0.3 * (hi - lo)));
        win *= has;
        float id = floor(vWP.y / fh) * 157.0 + floor(vWU / cw) * 13.17 + floor(vWP.x * 0.01) * 3.1;
        winLit = win * step(0.52, fract(sin(id) * 43758.5453));
      }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * winLit * uNight * 1.3;');
  };
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
progress('Extruding 3,900 buildings from lidar heights', 0.65);
await new Promise((r) => setTimeout(r, 0));
const buildings = buildBuildings(D.bld); scene.add(buildings);

// ---------------------------------------------------------------- ATC tower, Sky Train, windsocks
const concrete = new THREE.MeshStandardMaterial({ color: '#d6d0c4', roughness: 0.85 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#2a4250', roughness: 0.08, metalness: 0.65, emissive: new THREE.Color('#7fd6e6'), emissiveIntensity: 0, envMapIntensity: 1.4 });
const TOWER = { x: 553, n: 122, cab: 95 };
{
  const T = new THREE.Group(); T.position.set(TOWER.x, 0, -TOWER.n);
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; T.add(m); return m; };
  add(new THREE.CylinderGeometry(15, 17, 10, 28), concrete, 5);
  add(new THREE.CylinderGeometry(4.3, 6, 80, 24), concrete, 50);
  add(new THREE.CylinderGeometry(8.4, 4.5, 5, 8), concrete, 92.5);
  add(new THREE.CylinderGeometry(9.4, 8.2, 5.6, 8, 1, true), glassMat, 97.8);
  add(new THREE.CylinderGeometry(10.8, 9.6, 1.6, 8), concrete, 101.4);
  add(new THREE.CylinderGeometry(0.25, 0.3, 9, 6), concrete, 106.7);
  scene.add(T);
  staticLights.length; // tower obstruction light added below
}
const towerLight = pointsFrom([[TOWER.x, TOWER.n, 111.5, C.R, 3.0, [0, 0.5, 0.5]]]); scene.add(towerLight);

const skyTrains = [];
{
  const beams = [], cols = [];
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.9, 1.1, 1, 10);
  const inPave = (x, n) => rwyAt(x, n, 40, 60) >= 0 || (Math.abs(x - 1660) < 140 && n > 120 && n < 470);
  const lines = AP.skytrain.filter((p) => p.length >= 4);
  for (const p of lines) {
    const pts = [];
    for (let i = 0; i < p.length; i += 2) pts.push({ x: p[i], n: p[i + 1] });
    pts.forEach((q) => { q.h = inPave(q.x, q.n) ? 30 : 11; });
    for (let k = 0; k < 3; k++) pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; q.h2 = Math.max(q.h, (a.h + q.h + b.h) / 3); });
    pts.forEach((q) => { q.h = q.h2 ?? q.h; q.y = Math.min(terrainH(q.x, q.n), 0) + q.h; });
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.n - a.n);
      if (L < 0.3) continue;
      const m = new THREE.Matrix4(), mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.9, -(a.n + b.n) / 2);
      const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, -(b.n - a.n)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      m.compose(mid, q, new THREE.Vector3(6.4, 1.8, L + 0.4)); beams.push(box.clone().applyMatrix4(m));
      acc += L;
      if (acc > 34) { acc = 0; const y = a.y - 1.8, base = Math.min(terrainH(a.x, a.n), 0); const cm = new THREE.Matrix4().compose(new THREE.Vector3(a.x, (y + base) / 2, -a.n), new THREE.Quaternion(), new THREE.Vector3(1, y - base, 1)); cols.push(cyl.clone().applyMatrix4(cm)); }
    }
  }
  if (beams.length) { const m = new THREE.Mesh(mergeGeometries(beams), concrete); m.castShadow = m.receiveShadow = true; scene.add(m); }
  if (cols.length) { const m = new THREE.Mesh(mergeGeometries(cols), concrete); m.castShadow = true; scene.add(m); }
  // trains run on the two longest guideway polylines
  const longest = lines.map((p) => { const pts = []; for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector3(p[i], Math.min(terrainH(p[i], p[i + 1]), 0) + (inPave(p[i], p[i + 1]) ? 30 : 11), -p[i + 1])); return pts; })
    .filter((p) => p.length > 30).sort((a, b) => b.length - a.length).slice(0, 2);
  const carMat = new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 0.35, metalness: 0.2 });
  const bandMat = new THREE.MeshStandardMaterial({ color: '#1d3f6e', roughness: 0.4, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 });
  for (const pts of longest) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const len = curve.getLength();
    const grp = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.4, 11.5), carMat); car.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.9, 11.2), bandMat); band.position.y = 0.4; car.add(band);
      grp.add(car);
    }
    scene.add(grp); skyTrains.push({ curve, len, grp, s: Math.random() * len, dir: 1, wait: 0 });
  }
  skyTrains.bandMat = bandMat;
}
const socks = [];
{
  const poleM = new THREE.MeshStandardMaterial({ color: '#d0d3d6', roughness: 0.6 });
  const sockM = new THREE.MeshStandardMaterial({ color: '#f26b1d', roughness: 0.8 });
  for (const [x, n] of AP.windsocks) {
    const g = new THREE.Group(); g.position.set(x, Math.min(terrainH(x, n), 0), -n);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), poleM); pole.position.y = 3; g.add(pole);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 3.6, 10, 1, true), sockM); sock.rotation.z = -Math.PI / 2 + 0.12; sock.position.set(1.8, 5.7, 0);
    const arm = new THREE.Group(); arm.add(sock); arm.position.y = 0; g.add(arm); scene.add(g); socks.push(arm);
  }
}

// ---------------------------------------------------------------- sky, sun, environment
const sky = new Sky(); sky.scale.setScalar(400000); scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 6.5; skyU.rayleigh.value = 1.4; skyU.mieCoefficient.value = 0.005; skyU.mieDirectionalG.value = 0.82;
const envScene = new THREE.Scene(); const skyEnv = new Sky(); skyEnv.scale.setScalar(1000); envScene.add(skyEnv);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true; { const sm = LOWQ ? 1024 : MOBILE ? 2048 : 4096; sun.shadow.mapSize.set(sm, sm); }
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbdd3ef, 0x9a8466, 0.8); scene.add(hemi);
scene.fog = new THREE.FogExp2(0xc8d2db, 0.000026);
const stars = (() => {
  const n = 1800, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.95, th = 2 * Math.PI * u, ph = Math.acos(1 - v); p.set([Math.sin(ph) * Math.cos(th) * 150000, Math.cos(ph) * 150000, Math.sin(ph) * Math.sin(th) * 150000], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const s = new THREE.Points(g, m); s.frustumCulled = false; scene.add(s); return s;
})();
function sunPosition(ms) { // NOAA-style low-precision solar position
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * DEG, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG, e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = ((gmst * 15 + LON0) * DEG - ra);
  const lat = LAT0 * DEG;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
  return { alt, az };
}
const ENV = { night: 0, day: 1, lastEnvAlt: 99 };
const fogDay = new THREE.Color(0xc5cfd8), fogDusk = new THREE.Color(0xd59a72), fogNight = new THREE.Color(0x0a1220);
function updateSky(ms) {
  const { alt, az } = sunPosition(ms);
  const dir = new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
  skyU.sunPosition.value.copy(dir); skyEnv.material.uniforms.sunPosition.value.copy(dir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) skyEnv.material.uniforms[k].value = skyU[k].value;
  const sAlt = Math.sin(alt);
  const day = sstep(-0.04, 0.22, sAlt), night = 1 - sstep(-0.13, 0.02, sAlt), dusk = sstep(-0.1, 0.03, sAlt) * (1 - sstep(0.05, 0.3, sAlt));
  ENV.day = day; ENV.night = night;
  const moon = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
  ENV.dir = (dir.y > 0 ? dir : moon).clone();
  sun.intensity = 3.4 * day + 0.12 * night;
  sun.color.setRGB(1, lerp(0.72, 0.97, sstep(0.0, 0.35, sAlt)), lerp(0.5, 0.92, sstep(0.0, 0.35, sAlt)));
  if (night > 0.5) sun.color.setRGB(0.55, 0.65, 0.95);
  sun.castShadow = day > 0.05;
  hemi.intensity = 0.15 + 0.85 * day; hemi.color.setRGB(lerp(0.25, 0.74, day), lerp(0.32, 0.83, day), lerp(0.5, 0.94, day));
  hemi.groundColor.setRGB(lerp(0.12, 0.6, day), lerp(0.1, 0.52, day), lerp(0.1, 0.4, day));
  renderer.toneMappingExposure = lerp(0.95, 0.6, day);
  const fc = fogNight.clone().lerp(fogDay, day).lerp(fogDusk, dusk * 0.6); scene.fog.color.copy(fc);
  scene.fog.density = lerp(0.000034, 0.000024, day);
  stars.material.opacity = night * 0.9;
  terrainMat.emissiveIntensity = night * 0.55; airfieldMat.emissiveIntensity = night * 0.7;
  if (bldShader.ref) bldShader.ref.uniforms.uNight.value = night;
  glassMat.emissiveIntensity = night * 0.6; if (skyTrains.bandMat) skyTrains.bandMat.emissiveIntensity = night * 0.8;
  lightUniforms.uNight.value = night; lightUniforms.uDay.value = lerp(0.6, 0.3, day);
  if (Math.abs(alt - ENV.lastEnvAlt) > 1.5 * DEG) {
    ENV.lastEnvAlt = alt;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0, 1, 1000);
    scene.environment = envRT.texture;
  }
  return { alt, az };
}

// ---------------------------------------------------------------- aircraft geometry
const geoCache = new Map();
function surface(parts, rootLE, cr, tipLE, ct, tr, tt, thick, col) {
  // diamond-section lifting surface; chord along +z (toward tail); thickness along `thick` axis
  const sec = (p, c, t) => [
    [p[0], p[1], p[2]],
    [p[0] + thick[0] * t, p[1] + thick[1] * t, p[2] + c * 0.32],
    [p[0], p[1], p[2] + c],
    [p[0] - thick[0] * t, p[1] - thick[1] * t, p[2] + c * 0.32],
  ];
  const A = sec(rootLE, cr, tr), B = sec(tipLE, ct, tt), pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 4; i++) quad(A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]);
  quad(B[0], B[1], B[2], B[3]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); paint(g, col); parts.push(g);
}
function paint(g, col) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function prep(g, col, m) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); if (m) g.applyMatrix4(m); g.computeVertexNormals(); return paint(g, col); }
function aircraftGeometry(T, liv) {
  const key = `${T.t}|${liv.body}|${liv.tail}|${liv.belly}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const c = (h) => new THREE.Color(h);
  const cBody = c(liv.body), cBelly = c(liv.belly), cTail = c(liv.tail), cEng = c(liv.eng), cWing = c('#c4c9cf'), cWin = c('#1b2128'), cDark = c('#15181b'), cTail2 = liv.tail2 ? c(liv.tail2) : cTail;
  const { L, S, H, R } = T, yc = T.belly + R, parts = [];
  // fuselage tube
  {
    const segs = 18, rings = [];
    const nl = T.fam === 'bj' ? 0.16 : 0.1, tl = T.fam === 'bj' ? 0.66 : 0.74;
    const us = [0, 0.004, 0.012, 0.025, 0.045, 0.07, nl, 0.2, 0.35, 0.5, 0.62, tl, 0.8, 0.86, 0.91, 0.95, 0.985, 1];
    for (const u of us) {
      let r = R, y = yc;
      if (u < nl) { const t = u / nl; r = R * Math.sqrt(1 - (1 - t) ** 2) * 0.98 + R * 0.02 * t; y = yc - R * 0.14 * (1 - t) ** 1.5; }
      else if (u > tl) { const t = (u - tl) / (1 - tl); r = R * (1 - 0.86 * t ** 1.25); y = yc + R * 0.62 * t ** 1.3; }
      rings.push({ z: -L / 2 + u * L, y, r: Math.max(r, 0.02), u });
    }
    const pos = [], col = [];
    const vtx = (rg, k) => { const th = (k / segs) * Math.PI * 2, cy = Math.cos(th), sx = Math.sin(th); return [rg.r * sx, rg.y + rg.r * cy * 1.03, rg.z, cy, rg.u]; };
    const colorAt = (cy, u) => {
      if (u > 0.035 && u < 0.065 && cy > 0.25 && cy < 0.62) return cWin;
      if (u > 0.09 && u < 0.8 && cy > 0.24 && cy < 0.36) return cWin;
      if (cy < -0.3) return cBelly;
      if (liv.tail2 && u > 0.78 && cy > -0.3) return cTail;
      return cBody;
    };
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < segs; k++) {
      const a = vtx(rings[i], k), b = vtx(rings[i], k + 1), d = vtx(rings[i + 1], k), e = vtx(rings[i + 1], k + 1);
      for (const v of [a, d, e, a, e, b]) { pos.push(v[0], v[1], v[2]); const cc = colorAt(v[3], v[4]); col.push(cc.r, cc.g, cc.b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); parts.push(g);
  }
  // wings
  const wy = T.fam === 'bj' ? yc - R * 0.55 : yc - R * 0.55, rootC = L * (T.fam === 'bj' ? 0.17 : 0.19), wz = -L * 0.07, semi = S / 2;
  const sweep = Math.tan(T.sweep * DEG), dih = Math.tan(T.dih * DEG), tipC = rootC * 0.24;
  const tipY = wy + semi * dih, tipZ = wz + semi * sweep;
  for (const s of [-1, 1]) {
    surface(parts, [s * R * 0.6, wy, wz], rootC, [s * semi, tipY, tipZ], tipC, 0.42, 0.1, [0, 1, 0], cWing);
    if (T.wl > 0) surface(parts, [s * semi * 0.995, tipY, tipZ], tipC, [s * semi * 1.01, tipY + S * T.wl, tipZ + tipC * 0.8], tipC * 0.4, 0.06, 0.04, [1, 0, 0], liv.tail2 ? cTail2 : cTail);
  }
  // tail surfaces
  const finRootZ = L * 0.3, finC = L * (T.fam === 'bj' ? 0.17 : 0.16), finTop = H, finRootY = yc + R * 0.5;
  const finSweep = Math.tan((T.fam === 'bj' ? 40 : 37) * DEG) * (finTop - finRootY);
  surface(parts, [0, finRootY, finRootZ], finC, [0, finTop, finRootZ + finSweep], finC * 0.38, 0.3, 0.1, [1, 0, 0], cTail);
  const stS = S * (T.fam === 'wb' || T.fam === 'tri' ? 0.36 : 0.37) / 2, stC = L * 0.1;
  const stY = T.tT ? finTop - 0.3 : yc + R * 0.25, stZ = T.tT ? finRootZ + finSweep * 0.95 : L * 0.35;
  for (const s of [-1, 1]) surface(parts, [0, stY, stZ], stC, [s * stS, stY + stS * 0.08, stZ + stS * Math.tan(32 * DEG)], stC * 0.4, 0.18, 0.06, [0, 1, 0], T.tT ? cTail : cBody);
  // engines
  const er = T.engR, el = er * 2.9;
  const lathe = new THREE.LatheGeometry([[er * 0.5, 0], [er * 0.82, el * 0.12], [er * 0.97, el * 0.45], [er, el * 0.8], [er * 0.93, el], [er * 0.8, el * 0.985]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
  lathe.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(er * 0.8, 16); disc.rotateY(Math.PI); disc.translate(0, 0, -el * 0.98);
  const engAt = (x, y, z, pylon) => {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    parts.push(prep(lathe.clone(), cEng, m)); parts.push(prep(disc.clone(), cDark, m));
    if (pylon) { const b = new THREE.BoxGeometry(er * 0.25, pylon, el * 0.7); parts.push(prep(b, cWing, new THREE.Matrix4().makeTranslation(x, y + pylon / 2 + er * 0.6, z - el * 0.45))); }
  };
  const wingZ = (sx) => wz + Math.abs(sx) * sweep, wingY = (sx) => wy + Math.abs(sx) * dih;
  if (T.engs === 'wing2' || T.engs === 'wing2tail') for (const s of [-1, 1]) { const x = s * semi * 0.34; engAt(x, wingY(x) - er * 1.05, wingZ(x) + el * 0.55, er * 0.5); }
  if (T.engs === 'wing4') for (const s of [-1, 1]) for (const f of [0.38, 0.66]) { const x = s * semi * f; engAt(x, wingY(x) - er * 1.15, wingZ(x) + el * 0.6, er * 0.6); }
  if (T.engs === 'tail2') for (const s of [-1, 1]) engAt(s * (R + er * 1.15), yc + R * 0.35, L * 0.26 + el * 0.5, 0);
  if (T.engs === 'wing2tail') engAt(0, finRootY + er * 0.6, finRootZ + el * 0.3, 0);
  const body = mergeGeometries(parts);
  // landing gear
  const gp = [], wheel = new THREE.CylinderGeometry(T.belly * 0.36, T.belly * 0.36, T.belly * 0.28, 12); wheel.rotateZ(Math.PI / 2);
  const strut = new THREE.CylinderGeometry(0.09 * (R / 2), 0.09 * (R / 2), 1, 6);
  const wr = T.belly * 0.36, cG = c('#3a3e42'), cS = c('#b8bcc1');
  const gearAt = (x, z, n) => {
    const top = yc - R * 0.6, h = top - wr;
    gp.push(prep(strut.clone(), cS, new THREE.Matrix4().compose(new THREE.Vector3(x, wr + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1))));
    for (let k = 0; k < n; k++) gp.push(prep(wheel.clone(), cG, new THREE.Matrix4().makeTranslation(x + (k - (n - 1) / 2) * wr * 1.1, wr, z)));
  };
  gearAt(0, -L * 0.37, 2);
  const mg = T.fam === 'wb' || T.fam === 'tri' ? 4 : 2;
  for (const s of [-1, 1]) gearAt(s * Math.max(R * 0.85, semi * 0.14), wz + rootC * 0.62, mg);
  const gear = mergeGeometries(gp);
  const lights = { nav: [[-semi, tipY, tipZ + tipC * 0.3], [semi, tipY, tipZ + tipC * 0.3], [0, yc + R * 0.7, L / 2]], bcn: [[0, yc + R + 0.15, -L * 0.05], [0, T.belly - 0.05, L * 0.05]], land: [[-R * 1.4, wy, wz + 0.4], [R * 1.4, wy, wz + 0.4]], taxi: [0, T.belly + 0.3, -L * 0.37] };
  const out = { body, gear, lights };
  geoCache.set(key, out); return out;
}
const acMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25, envMapIntensity: 1.1, side: THREE.DoubleSide });

// ---------------------------------------------------------------- routing graph
const GV = AP.graph.v, GE = AP.graph.e;
const ADJ = GV.map(() => []);
for (const [a, b, L, k, z] of GE) {
  const w = L * (k >= 0 ? 30 : z >= 0 ? 2 : 1);
  ADJ[a].push([b, w]); ADJ[b].push([a, w]);
}
function astar(s, t) {
  if (s === t) return [s];
  const g = new Float64Array(GV.length).fill(Infinity), prev = new Int32Array(GV.length).fill(-1), closed = new Uint8Array(GV.length);
  const heap = [];
  const push = (f, v) => { heap.push([f, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hx = GV[t][0], hn = GV[t][1], h = (v) => Math.hypot(GV[v][0] - hx, GV[v][1] - hn);
  g[s] = 0; push(h(s), s);
  while (heap.length) {
    const [, u] = pop();
    if (closed[u]) continue; closed[u] = 1;
    if (u === t) break;
    for (const [v, w] of ADJ[u]) { const nd = g[u] + w; if (nd < g[v]) { g[v] = nd; prev[v] = u; push(nd + h(v), v); } }
  }
  if (prev[t] < 0) return null;
  const out = []; for (let v = t; v >= 0; v = prev[v]) out.push(v); return out.reverse();
}
function routeLen(route) { let d = 0; for (let i = 1; i < route.length; i++) d += Math.hypot(GV[route[i]][0] - GV[route[i - 1]][0], GV[route[i]][1] - GV[route[i - 1]][1]); return d; }
function nearestV(x, n, filt) { let best = -1, bd = Infinity; for (let i = 0; i < GV.length; i++) { if (filt && !filt(i)) continue; const d = (GV[i][0] - x) ** 2 + (GV[i][1] - n) ** 2; if (d < bd) { bd = d; best = i; } } return best; }

// ---------------------------------------------------------------- path utilities
// a path is a list of points {x, n, alt (m AGL or NaN = dynamic), v (max speed m/s), dec (m/s^2), acc, tag}
function roundCorners(pts, maxD = 32) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.n - a.n), l2 = Math.hypot(c.x - b.x, c.n - b.n);
    if (l1 < 0.5 || l2 < 0.5) { out.push(b); continue; }
    const turn = Math.abs(angDiff(hdgOf(b.x - a.x, b.n - a.n), hdgOf(c.x - b.x, c.n - b.n)));
    if (turn < 6) { out.push(b); continue; }
    const d = Math.min(maxD, l1 * 0.45, l2 * 0.45);
    const p0 = { x: b.x - (b.x - a.x) / l1 * d, n: b.n - (b.n - a.n) / l1 * d }, p2 = { x: b.x + (c.x - b.x) / l2 * d, n: b.n + (c.n - b.n) / l2 * d };
    const k = turn > 60 ? 6 : 4;
    for (let j = 0; j <= k; j++) { const t = j / k, u = 1 - t; out.push({ ...b, tag: undefined, x: u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, n: u * u * p0.n + 2 * u * t * b.n + t * t * p2.n }); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function densify(pts, maxSeg = 12) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.n - a.n), k = Math.ceil(d / maxSeg);
    for (let j = 1; j <= k; j++) { const t = j / k; out.push({ ...b, tag: j === k ? b.tag : undefined, noCorner: j === k ? b.noCorner : undefined, x: lerp(a.x, b.x, t), n: lerp(a.n, b.n, t), alt: Number.isNaN(b.alt) ? NaN : lerp(a.alt ?? 0, b.alt ?? 0, t) }); }
  }
  return out;
}
class Path {
  constructor(pts) {
    const P = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.n - pts[i - 1].n) > 0.05);
    this.p = P; const n = P.length;
    this.cum = new Float64Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].n - P[i - 1].n);
    this.len = this.cum[n - 1];
    // corner speed limits for ground segments
    for (let i = 1; i < n - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      if (!b.ground || b.noCorner) continue;
      const l1 = this.cum[i] - this.cum[i - 1], l2 = this.cum[i + 1] - this.cum[i];
      if (l1 < 0.1 || l2 < 0.1) continue;
      const turn = Math.abs(angDiff(hdgOf(b.x - a.x, b.n - a.n), hdgOf(c.x - b.x, c.n - b.n))) * DEG;
      const rad = Math.min(l1, l2) / Math.max(1e-3, turn);
      b.v = Math.min(b.v, Math.max(3, Math.sqrt(1.1 * rad)));
    }
    // backward braking pass
    this.vb = new Float64Array(n); this.vb[n - 1] = P[n - 1].vEnd ?? 0;
    for (let i = n - 2; i >= 0; i--) this.vb[i] = Math.min(P[i].v, Math.sqrt(this.vb[i + 1] ** 2 + 2 * (P[i].dec || 1) * (this.cum[i + 1] - this.cum[i])));
    this.i = 0;
    this.tags = {}; P.forEach((q, i) => { if (q.tag) this.tags[q.tag] = this.cum[i]; });
  }
  seg(s) { let i = this.i; while (i < this.p.length - 2 && this.cum[i + 1] <= s) i++; while (i > 0 && this.cum[i] > s) i--; this.i = i; return i; }
  at(s) {
    const i = this.seg(s), a = this.p[i], b = this.p[Math.min(i + 1, this.p.length - 1)];
    const L = this.cum[i + 1] - this.cum[i] || 1, t = clamp((s - this.cum[i]) / L, 0, 1);
    return { x: lerp(a.x, b.x, t), n: lerp(a.n, b.n, t), alt: lerp(a.alt ?? 0, b.alt ?? 0, t), dyn: Number.isNaN(a.alt) || Number.isNaN(b.alt), i, a, b, t };
  }
  vlim(s) {
    const i = this.seg(s), a = this.p[i];
    if (i >= this.p.length - 1) return this.vb[this.p.length - 1];
    return Math.min(a.v, Math.sqrt(this.vb[i + 1] ** 2 + 2 * (a.dec || 1) * Math.max(0, this.cum[i + 1] - s)));
  }
  heading(s, look = 10) {
    const p0 = this.at(Math.max(0, s - look * 0.5)), p1 = this.at(Math.min(this.len, s + look));
    if (Math.hypot(p1.x - p0.x, p1.n - p0.n) < 0.01) return null;
    return hdgOf(p1.x - p0.x, p1.n - p0.n);
  }
}
const G = (x, n, v = 9, extra) => ({ x, n, alt: 0, v, dec: 1.0, acc: 0.7, ground: true, ...extra });
function routePoints(route, v = 9) { return route.map((id) => G(GV[id][0], GV[id][1], v)); }
// find runway zones (hold lines) along a ground path: returns [{r, sIn, sOut}]
function zonesOn(path, latM = 52) {
  const z = []; let cur = null;
  for (let i = 0; i < path.p.length; i++) {
    const q = path.p[i];
    const r = q.ground ? rwyAt(q.x, q.n, latM, 40) : -1;
    if (r >= 0 && (!cur || cur.r !== r)) { if (cur) { cur.sOut = path.cum[i]; z.push(cur); } cur = { r, sIn: path.cum[Math.max(0, i - 1)], sOut: path.len }; }
    else if (r < 0 && cur) { cur.sOut = path.cum[i]; z.push(cur); cur = null; }
  }
  if (cur) z.push(cur);
  return z;
}

// ---------------------------------------------------------------- simulation
const FLOWS = {
  west: { arr: ['25L', '26'], dep: ['25R', '26'], wind: 'Wind 250° 9 kt', windHdg: 250 },
  east: { arr: ['07R', '08'], dep: ['07L', '08'], wind: 'Wind 090° 6 kt', windHdg: 90 },
};
const SIM = { t: 0, flow: 'west', ac: [], nextId: 1, arrTimer: {}, rw: RWY.map(() => ({ occ: new Set(), cross: new Set(), req: new Set(), lastTk: -999 })) };
const acGroup = new THREE.Group(); scene.add(acGroup);
let selected = null, followSel = false, camMode = 'tour';
const labelsOn = { mode: 'full' };

const gateArea = (g) => {
  const nm = g.name;
  if (/^[AB]\d/.test(nm)) return 'AB'; if (/^[CD]\d/.test(nm)) return 'CD'; if (/^E\d/.test(nm)) return 'E'; if (/^F\d/.test(nm)) return 'F';
  if (/cargo/i.test(nm)) return 'CARGO'; if (/GA Ramp/.test(nm)) return 'GA'; if (/Guard/.test(nm)) return 'MIL'; if (/Maintenance/.test(nm)) return 'MX';
  return 'X';
};
const GATES = AP.gates.map((g, i) => ({ ...g, i, area: gateArea(g), occ: null, linked: g.q !== undefined }));
const bigGate = (g) => /[DEF]/.test(g.size || 'C');
function freeGates(op, T) {
  const wide = T && (T.fam === 'wb' || T.fam === 'tri');
  return GATES.filter((g) => g.linked && !g.occ && (g.area === op.area || (op.area === 'E' && g.area === 'F' && Math.random() < 0.3) || (op.area === 'F' && g.area === 'E' && Math.random() < 0.3)) && (!wide || bigGate(g) || g.area === 'CARGO'));
}
function pickOp(filter) { const list = OP_LIST.filter(filter || (() => true)); let tot = list.reduce((a, o) => a + o.w, 0), r = Math.random() * tot; for (const o of list) { r -= o.w; if (r <= 0) return o; } return list[0]; }
function pickType(op) { let tot = op.fleet.reduce((a, f) => a + f[1], 0), r = Math.random() * tot; for (const [t, w] of op.fleet) { r -= w; if (r <= 0) return t; } return op.fleet[0][0]; }
function bearingTo(code) {
  const [la, lo] = APT[code] || [LAT0 + 1, LON0]; const p1 = LAT0 * DEG, p2 = la * DEG, dl = (lo - LON0) * DEG;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / DEG + 360) % 360;
}
const squawk = () => { let s; do { s = [0, 0, 0, 0].map(() => rint(0, 7)).join(''); } while (/^(7[567]00|1200|0000)$/.test(s)); return s; };

class Aircraft {
  constructor(op, type, opts = {}) {
    this.id = SIM.nextId++;
    this.op = op; this.T = typeSpec(type); this.type = type;
    this.reg = op.reg();
    this.hex = this.reg.startsWith('N') ? nToIcao(this.reg) : (op.hex ? op.hex() : hex6(rint(0xA00001, 0xADF7C7)));
    this.newFlight();
    this.sq = squawk();
    this.x = 0; this.n = 0; this.alt = 0; this.hdg = 0; this.v = 0; this.vs = 0; this.pitch = 0; this.bank = 0; this.yawRate = 0;
    this.phase = 'gate'; this.path = null; this.s = 0; this.holds = []; this.gate = null; this.rwyEnd = null; this.static = !!opts.static;
    this.engines = false; this.blockT = 0; this.lastHdg = null;
    const liv = LIV[op.liv || op.code] || LIV.GA;
    const geo = aircraftGeometry(this.T, liv);
    this.obj = new THREE.Group(); this.obj.rotation.order = 'YXZ';
    this.body = new THREE.Mesh(geo.body, acMat); this.body.castShadow = true; this.body.receiveShadow = true; this.body.userData.ac = this;
    this.gearMesh = new THREE.Mesh(geo.gear, acMat); this.gearMesh.castShadow = true;
    this.obj.add(this.body, this.gearMesh); this.lightsLocal = geo.lights;
    // label
    const el = document.createElement('div'); el.className = 'lbl';
    el.innerHTML = '<div class="in"><span class="cs"></span><span class="loc x1"></span><span class="x1 gr"></span><span class="x1 ic"></span><span class="x1 md"></span><span class="x1 rg"></span></div>';
    el.addEventListener('click', (e) => { e.stopPropagation(); select(this); });
    this.lblEl = el; this.lblParts = el.querySelectorAll('span');
    this.label = new CSS2DObject(el); this.label.position.set(0, this.T.H + 5, 0); this.label.visible = false; this.obj.add(this.label);
    acGroup.add(this.obj); SIM.ac.push(this);
  }
  newFlight() {
    const op = this.op;
    this.callsign = op.fn ? `${op.code === 'ENY' ? 'ENY' : op.code}${rint(op.fn[0], op.fn[1])}` : this.reg.replace('-', '');
    if (op.code === 'BAW') this.callsign = `BAW${pick(['289', '288'])}`;
    this.other = pick(op.dest || ['LAX']);
    this.sq = squawk();
  }
  get grounded() { return this.alt < 0.3; }
  get moving() { return !['gate', 'parked'].includes(this.phase); }
  setPath(path, phase) { this.path = path; this.s = 0; this.phase = phase; path.i = 0; }
  dispose() {
    acGroup.remove(this.obj); this.label.element.remove(); this.label.removeFromParent();
    for (const r of SIM.rw) { r.occ.delete(this); r.cross.delete(this); r.req.delete(this); }
    if (this.gate && this.gate.occ === this) this.gate.occ = null;
    SIM.ac.splice(SIM.ac.indexOf(this), 1);
    if (selected === this) select(null);
  }
}

function parkAt(ac, gate, timer) {
  ac.gate = gate; gate.occ = ac; ac.x = gate.p[0]; ac.n = gate.p[1]; ac.hdg = gate.h; ac.alt = 0; ac.v = 0;
  ac.phase = 'gate'; ac.timer = timer; ac.engines = false; ac.path = null; ac.holds = [];
}

// ---- arrivals
function arrivalPath(ac, endId) {
  const E = ENDS[endId], T = ac.T, [tx, tn] = E.thr, ux = E.ux, un = E.un;
  const brg = bearingTo(ac.other) * DEG, P0 = { x: Math.sin(brg) * 40000, n: Math.cos(brg) * 40000 };
  const along = (d) => ({ x: tx - ux * d, n: tn - un * d });
  const wantN = E.rw.idx === 0 ? 1 : -1; // north runway flies a north downwind, the south pair a south downwind
  let px = -un, pn = ux; if (pn * wantN < 0) { px = -px; pn = -pn; }
  const proj = (P0.x - tx) * -ux + (P0.n - tn) * -un; // >0 when the origin lies on the approach side
  const wps = [P0];
  if (proj < 9000) {
    const lat = (P0.x - tx) * px + (P0.n - tn) * pn;
    const s2 = 1; void lat;
    wps.push({ x: tx + ux * 7000 + px * s2 * 9000, n: tn + un * 7000 + pn * s2 * 9000 });
    wps.push({ x: tx - ux * 15000 + px * s2 * 9000, n: tn - un * 15000 + pn * s2 * 9000 });
    wps.push(along(25000));
  } else wps.push(along(Math.max(26000, Math.min(proj * 0.7, 32000))));
  wps.push(along(17000), along(9000), along(0));
  const curve = new THREE.CatmullRomCurve3(wps.map((w) => new THREE.Vector3(w.x, 0, w.n)), false, 'centripetal', 0.5);
  const N = Math.ceil(curve.getLength() / 120), raw = curve.getSpacedPoints(N);
  // distance-to-go from the end
  const pts = raw.map((p) => ({ x: p.x, n: p.z }));
  let dtg = 0; for (let i = pts.length - 1; i >= 0; i--) { if (i < pts.length - 1) dtg += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].n - pts[i].n); pts[i].D = dtg; }
  const startAlt = 2900;
  for (const p of pts) {
    p.alt = p.D <= 17000 ? 15 + p.D * Math.tan(3 * DEG) : Math.min(startAlt, 15 + 17000 * Math.tan(3 * DEG) + (p.D - 17000) * 0.05);
    p.v = p.D > 30000 ? 128 : p.D > 17000 ? lerp(T.vref + 14, 128, (p.D - 17000) / 13000) : p.D > 7000 ? lerp(T.vref + 2, T.vref + 14, (p.D - 7000) / 10000) : T.vref;
    p.dec = 0.7; p.acc = 0.5; p.air = true;
  }
  pts[pts.length - 1].tag = 'thr';
  // runway: flare to touchdown then roll-out to exit
  const tdD = 300 + Math.random() * 120;
  pts.push({ x: tx + ux * tdD, n: tn + un * tdD, alt: 0, v: T.vref * 0.96, dec: 2.4, acc: 0.5, ground: true, rwy: true });
  const need = E.disp + tdD + (T.vref ** 2 - 16 ** 2) / (2 * 2.1);
  const exits = E.exits.filter(([al]) => al >= need && al <= E.rw.len - 120);
  const ex = exits.length ? exits[0] : E.exits[E.exits.length - 1];
  const exV = ex[1];
  pts.push({ x: GV[exV][0], n: GV[exV][1], alt: 0, v: 16, dec: 2.2, acc: 0.6, ground: true, rwy: true, tag: 'exit' });
  const route = astar(exV, ac.gate.q);
  if (!route) return null;
  let taxi = routePoints(route, 9.5);
  taxi[0].v = 16;
  taxi.push(G(ac.gate.p[0], ac.gate.p[1], 2.5));
  taxi = densify(roundCorners(taxi, 30), 12);
  const lastStretch = 45; let accd = 0;
  for (let i = taxi.length - 1; i > 0; i--) { accd += Math.hypot(taxi[i].x - taxi[i - 1].x, taxi[i].n - taxi[i - 1].n); if (accd < lastStretch) taxi[i].v = 2.2; }
  const all = pts.concat(taxi.slice(1));
  const path = new Path(all);
  path.sThr = path.tags.thr;
  path.sExitRwy = path.tags.exit;
  path.end = E;
  return path;
}
function spawnArrival(endId, preProgress = 0) {
  const op = pickOp((o) => o.code !== 'BAW' || Math.random() < 0.5);
  const type = pickType(op), T = typeSpec(type);
  const gates = freeGates(op, T); if (!gates.length) return null;
  const ac = new Aircraft(op, type);
  ac.gate = pick(gates); ac.gate.occ = ac;
  // choose the arrival runway whose exits give the shorter taxi to this gate
  const arrs = FLOWS[SIM.flow].arr;
  if (!endId) {
    const costs = arrs.map((id) => { const e = ENDS[id]; const ex = e.exits[Math.floor(e.exits.length / 2)]; const r = ex && astar(ex[1], ac.gate.q); return r ? routeLen(r) : 1e9; });
    endId = costs[0] <= costs[1] ? arrs[0] : arrs[1];
    if (Math.random() < 0.2) endId = pick(arrs);
  }
  const path = arrivalPath(ac, endId);
  if (!path) { ac.dispose(); return null; }
  ac.rwyEnd = ENDS[endId]; ac.setPath(path, 'arr'); ac.engines = true;
  ac.s = preProgress * path.sThr; ac.v = path.vlim(ac.s); ac.dir = 'in';
  const p = path.at(ac.s); ac.x = p.x; ac.n = p.n; ac.alt = p.alt; ac.hdg = path.heading(ac.s, 60) ?? 0;
  ac.zones = zonesOn(path).filter((z) => z.sIn > path.sExitRwy - 5);
  return ac;
}

// ---- departures
function departurePath(ac, endId) {
  const E = ENDS[endId], T = ac.T, g = ac.gate;
  const h = g.h * DEG, d = { x: Math.sin(h), n: Math.cos(h) };
  let f = { x: g.m[0], n: g.m[1] };
  const dm = f.x * d.x + f.n * d.n;
  if (Math.abs(dm) > 0.5) { const s = (f.x * -d.n + f.n * d.x) >= 0 ? 1 : -1; f = { x: -d.n * s, n: d.x * s }; }
  const S = { x: g.p[0], n: g.p[1] }, B = { x: S.x - d.x * 36 - f.x * 24, n: S.n - d.n * 36 - f.n * 24 };
  const bez = []; const P1 = { x: S.x - d.x * 22, n: S.n - d.n * 22 }, P2 = { x: B.x + f.x * 18, n: B.n + f.n * 18 };
  for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; bez.push(G(u ** 3 * S.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t ** 3 * B.x, u ** 3 * S.n + 3 * u * u * t * P1.n + 3 * u * t * t * P2.n + t ** 3 * B.n, 1.6, { dec: 0.5 })); }
  const push = new Path(bez);
  // taxi to runway entry, line up, take off, climb out toward destination
  const route = astar(g.q, E.entry);
  if (!route) return null;
  let taxi = [G(B.x, B.n, 6)].concat(routePoints(route, 10));
  taxi = densify(roundCorners(taxi, 30), 12);
  const iEntry = taxi.length - 1, depR = E.rw.idx;
  for (const q of taxi) if (rwyAt(q.x, q.n, 52, 40) === depR) q.v = Math.min(q.v, 5);
  Object.assign(taxi[iEntry], { v: 110, noCorner: true, tag: 'entry' });
  const far = E.other.p, rwHdg = E.hdg * DEG, ux = Math.sin(rwHdg), un = Math.cos(rwHdg);
  taxi.push({ x: far[0] - ux * 40, n: far[1] - un * 40, alt: NaN, v: 110, dec: 3, acc: T.acc, ground: false, roll: true, tag: 'roll' });
  const brg = bearingTo(ac.other) * DEG;
  const a1 = { x: far[0] + ux * 4500, n: far[1] + un * 4500 };
  const wps = [{ x: far[0] - ux * 40, n: far[1] - un * 40 }, { x: far[0] + ux * 1500, n: far[1] + un * 1500 }, a1, { x: a1.x + ux * 2500 + Math.sin(brg) * 2500, n: a1.n + un * 2500 + Math.cos(brg) * 2500 }, { x: Math.sin(brg) * 34000, n: Math.cos(brg) * 34000 }];
  const curve = new THREE.CatmullRomCurve3(wps.map((w) => new THREE.Vector3(w.x, 0, w.n)), false, 'centripetal', 0.5);
  const cp = curve.getSpacedPoints(Math.ceil(curve.getLength() / 150)).slice(1);
  cp.forEach((p, i) => taxi.push({ x: p.x, n: p.z, alt: NaN, v: lerp(95, 130, clamp(i / 30, 0, 1)), dec: 1, acc: i < 3 ? T.acc : 0.8, air: true }));
  const path = new Path(taxi);
  path.sEntry = path.tags.entry; path.sRoll = path.tags.roll;
  const zs = zonesOn(path).filter((z) => z.r === depR && z.sIn <= path.sEntry);
  path.sHold = zs.length ? zs[zs.length - 1].sIn : path.sEntry - 70;
  path.end = E;
  return { push, path };
}
function startDeparture(ac) {
  const deps = FLOWS[SIM.flow].dep;
  ac.newFlight(); ac.dir = 'out';
  const queue = (id) => SIM.ac.filter((o) => o.phase === 'taxiout' && o.rwyEnd && o.rwyEnd.id === id).length;
  const opts = deps.map((id) => { const r = astar(ac.gate.q, ENDS[id].entry); return r ? routeLen(r) + queue(id) * 900 + (FLOWS[SIM.flow].arr.includes(id) ? 1200 : 0) : 1e9; });
  let endId = opts[0] <= opts[1] ? deps[0] : deps[1];
  if (Math.random() < 0.15) endId = pick(deps);
  const pp = departurePath(ac, endId);
  if (!pp) { ac.timer = 120; return; }
  ac.rwyEnd = ENDS[endId]; ac.depPath = pp.path; ac.engines = true;
  ac.setPath(pp.push, 'push'); ac.pushHdgFix = true;
  ac.zones = zonesOn(pp.path).filter((z) => !(z.r === ac.rwyEnd.rw.idx && z.sIn >= pp.path.sHold - 1));
}

// ---- runway logic
function arrivalsNear(r, dist) {
  return SIM.ac.some((a) => a.phase === 'arr' && a.rwyEnd && a.rwyEnd.rw.idx === r && a.path && (a.path.sThr - a.s) < dist && a.s < a.path.sThr + 10);
}
function canDepart(r) { const R = SIM.rw[r]; return R.occ.size === 0 && R.cross.size === 0 && R.req.size === 0 && !arrivalsNear(r, 3700) && SIM.t - R.lastTk > 50; }
function canCross(r) { const R = SIM.rw[r]; return R.occ.size === 0 && !arrivalsNear(r, 3200); }

// ---- per-aircraft step
const tmpV = new THREE.Vector3();
function groundConflict(ac) {
  let lim = Infinity;
  const hr = ac.hdg * DEG, fx = Math.sin(hr), fn = Math.cos(hr);
  for (const o of SIM.ac) {
    if (o === ac || !o.grounded || o.phase === 'gate' || o.phase === 'parked' || (o.ignoreUntil && o.ignoreUntil > SIM.t && ac.ignoreId === o.id)) continue;
    const dx = o.x - ac.x, dn = o.n - ac.n; if (Math.abs(dx) > 160 || Math.abs(dn) > 160) continue;
    const ahead = dx * fx + dn * fn, lat = Math.abs(-dx * fn + dn * fx);
    if (ahead <= 0 || ahead > 140 || lat > 16) continue;
    const gap = ahead - (ac.T.L + o.T.L) / 2 - 18;
    const v = Math.sqrt(2 * 1.2 * Math.max(0, gap));
    if (v < lim) { lim = v; ac.blocker = o; }
  }
  return lim;
}
function stepAircraft(ac, dt) {
  if (ac.phase === 'gate') {
    if (ac.static) return;
    ac.timer -= dt;
    if (ac.timer <= 0 && SIM.ac.filter((a) => a.phase === 'push').length < 4) startDeparture(ac);
    return;
  }
  if (ac.phase === 'start') { ac.timer -= dt; if (ac.timer <= 0) { ac.setPath(ac.depPath, 'taxiout'); ac.v = 0; } return; }
  const P = ac.path; if (!P) return;
  let vt = P.vlim(ac.s);
  // holds: runway crossings, departure release
  if (ac.grounded || ac.phase === 'taxiout') {
    if (ac.zones) for (const z of ac.zones) {
      if (z.passed || ac.s > z.sIn) continue;
      const dist = z.sIn - ac.s;
      if (dist < 140) {
        if (canCross(z.r)) { z.passed = true; SIM.rw[z.r].cross.add(ac); SIM.rw[z.r].req.delete(ac); z.active = true; }
        else { vt = Math.min(vt, Math.sqrt(2 * 1.0 * Math.max(0, dist - 2))); ac.holding = true; if (dist < 40) SIM.rw[z.r].req.add(ac); }
      }
    }
    if (ac.zones) for (const z of ac.zones) if (z.active && ac.s > z.sOut) { z.active = false; SIM.rw[z.r].cross.delete(ac); }
  }
  if (ac.phase === 'taxiout') {
    const dHold = P.sHold - ac.s, r = ac.rwyEnd.rw.idx;
    if (!ac.released) {
      if (dHold < 140) {
        if (dHold < 30 && !ac.holdSince) ac.holdSince = SIM.t;
        const first = ac.holdSince && SIM.ac.every((o) => o === ac || !(o.phase === 'taxiout' && o.rwyEnd && o.rwyEnd.rw.idx === r && (o.released || (o.holdSince && o.holdSince < ac.holdSince))));
        if (dHold < 30 && first && canDepart(r)) { ac.released = true; SIM.rw[r].occ.add(ac); }
        else vt = Math.min(vt, Math.sqrt(2 * 1.0 * Math.max(0, dHold)));
      }
    }
    if (ac.released && !ac.rolled) {
      // line up and wait briefly on the centerline
      vt = Math.min(vt, Math.sqrt(2 * 1.2 * Math.max(0, P.sEntry - ac.s)));
      if (ac.s >= P.sEntry - 2 && ac.v < 0.6 && !ac.luaw) { ac.luaw = SIM.t + 6 + Math.random() * 6; }
      if (ac.luaw && SIM.t >= ac.luaw) { ac.rolled = true; ac.phase = 'tkof'; SIM.rw[r].lastTk = SIM.t; }
    }
  }
  const crossing = ac.zones && ac.zones.some((z) => z.active);
  if (ac.grounded && ['taxi', 'taxiout', 'push'].includes(ac.phase) && !ac.released && !crossing) {
    const c = groundConflict(ac);
    if (c < vt) {
      vt = c;
      if (ac.v < 0.3) { ac.blockT += dt; if (ac.blockT > 35 && ac.blocker && Math.abs(angDiff(ac.hdg, ac.blocker.hdg)) > 100) { ac.ignoreId = ac.blocker.id; ac.blocker.ignoreUntil = SIM.t + 25; ac.blockT = 0; } }
    } else ac.blockT = 0;
  }
  ac.holding = ac.v < 0.3 && vt < 0.3;
  const segAcc = P.at(ac.s).a.acc || 0.7;
  const acc = ac.phase === 'tkof' ? ac.T.acc : segAcc;
  if (ac.v < vt) ac.v = Math.min(vt, ac.v + acc * dt); else ac.v = Math.max(vt, ac.v - 3.0 * dt);
  ac.s += ac.v * dt;
  const p = P.at(Math.min(ac.s, P.len));
  ac.x = p.x; ac.n = p.n;
  // heading
  let h = P.heading(ac.s, ac.grounded ? 9 : 80);
  if (ac.phase === 'push' && h !== null) h = (h + 180) % 360;
  if (h !== null) {
    const maxRate = ac.grounded ? 22 : 4.5;
    const dh = clamp(angDiff(ac.hdg, h), -maxRate * dt, maxRate * dt);
    ac.yawRate = lerp(ac.yawRate, dh / Math.max(dt, 1e-3), 0.1);
    ac.hdg = (ac.hdg + dh + 360) % 360;
  }
  // vertical
  if (ac.phase === 'arr') {
    const old = ac.alt; ac.alt = p.alt; ac.vs = (ac.alt - old) / Math.max(dt, 1e-3);
    if (ac.s > P.sThr - 1200 && !ac.onRw) { ac.onRw = true; SIM.rw[ac.rwyEnd.rw.idx].occ.add(ac); }
    if (ac.alt <= 0.01 && ac.s > P.sThr) { ac.phase = 'roll'; }
  } else if (ac.phase === 'roll') {
    ac.alt = 0; ac.vs = 0;
    if (ac.s > P.sExitRwy + 50 && rwyAt(ac.x, ac.n, 8) < 0) { SIM.rw[ac.rwyEnd.rw.idx].occ.delete(ac); ac.onRw = false; ac.phase = 'taxi'; }
  } else if (ac.phase === 'tkof' || ac.phase === 'climb') {
    const Vr = ac.T.vr;
    if (ac.v >= Vr || ac.alt > 0) {
      const tgtVs = ac.alt < 15 ? 4 : ac.T.vs;
      ac.vs = lerp(ac.vs, tgtVs, clamp(dt * 0.6, 0, 1));
      ac.alt += ac.vs * dt;
      if (ac.alt > 1) ac.phase = 'climb';
    }
    if (ac.phase === 'climb' && ac.alt > 150 && SIM.rw[ac.rwyEnd.rw.idx].occ.has(ac)) SIM.rw[ac.rwyEnd.rw.idx].occ.delete(ac);
    if (ac.s >= P.len - 1 || ac.alt > 3600) { ac.dispose(); return; }
  } else { ac.alt = 0; ac.vs = 0; }
  // end of path
  if (ac.s >= P.len - 0.05 && ac.v < 0.05) {
    if (ac.phase === 'push') { ac.phase = 'start'; ac.timer = 12 + Math.random() * 14; if (ac.gate) { ac.gate.occ = null; ac.gate = null; } ac.hdg = (P.heading(P.len - 0.1, 6) + 180) % 360; }
    else if (ac.phase === 'taxi' || ac.phase === 'roll') { parkAt(ac, ac.gate, 2100 + Math.random() * 2400); for (const z of ac.zones || []) { SIM.rw[z.r].cross.delete(ac); SIM.rw[z.r].req.delete(ac); } }
  }
}
function simStep(dt) {
  SIM.t += dt;
  // spawn arrivals on each arrival runway
  for (const id of FLOWS[SIM.flow].arr) {
    if (SIM.arrTimer[id] === undefined) SIM.arrTimer[id] = SIM.t + 20 + Math.random() * 60;
    if (SIM.t >= SIM.arrTimer[id]) { spawnArrival(id); const mixed = FLOWS[SIM.flow].dep.includes(id === '26' ? '26' : id === '08' ? '08' : '_'); SIM.arrTimer[id] = SIM.t + (mixed ? 150 + Math.random() * 80 : 90 + Math.random() * 60); }
  }
  for (const ac of [...SIM.ac]) stepAircraft(ac, dt);
  // Sky Train
  for (const tr of skyTrains) {
    if (tr.wait > 0) { tr.wait -= dt; continue; }
    tr.s += tr.dir * 14 * dt;
    if (tr.s > tr.len - 20 || tr.s < 20) { tr.dir *= -1; tr.wait = 25; tr.s = clamp(tr.s, 20, tr.len - 20); }
  }
}

// ---- initial population
function populate() {
  for (const g of GATES) {
    if (g.area === 'MIL') { const ac = new Aircraft({ code: 'MIL', name: 'Arizona Air National Guard', liv: 'MIL', reg: () => `${rint(57, 64)}-${rint(1400, 1500)}`, hex: () => hex6(rint(0xAE0000, 0xAE7FFF)), fn: null, dest: ['LUF'] }, 'K35R', { static: true }); ac.callsign = `RCH${rint(100, 999)}`; parkAt(ac, g, Infinity); ac.static = true; continue; }
    if (g.area === 'MX') { if (Math.random() < 0.6) { const op = OPS[pick(['AAL', 'SWA'])]; const ac = new Aircraft({ code: op === OPS.AAL ? 'AAL' : 'SWA', ...op }, pickType(op), { static: true }); parkAt(ac, g, Infinity); ac.static = true; ac.phase = 'parked'; } continue; }
    if (!g.linked) { if (g.area === 'GA' && Math.random() < 0.7) { const op = { code: 'GA', ...OPS.GA }; const ac = new Aircraft(op, pickType(op), { static: true }); parkAt(ac, g, Infinity); ac.static = true; ac.phase = 'parked'; } continue; }
    if (Math.random() > 0.74) continue;
    const op = pickOp((o) => o.area === g.area && (o.code !== 'BAW' || bigGate(g)));
    if (!op || op.area !== g.area) continue;
    let type = pickType(op), T = typeSpec(type), tries = 0;
    while ((T.fam === 'wb' || T.fam === 'tri') && !bigGate(g) && g.area !== 'CARGO' && tries++ < 5) { type = pickType(op); T = typeSpec(type); }
    if ((T.fam === 'wb' || T.fam === 'tri') && !bigGate(g) && g.area !== 'CARGO') continue;
    const ac = new Aircraft(op, type);
    parkAt(ac, g, 20 + Math.random() * 4200);
  }
  for (const id of FLOWS[SIM.flow].arr) for (const f of [0.35, 0.62, 0.86]) spawnArrival(id, f);
  // run the simulator forward so taxiing traffic exists on first frame
  for (let i = 0; i < 360; i++) simStep(0.5);
}
progress('Generating traffic', 0.8);
await new Promise((r) => setTimeout(r, 0));
populate();

// ---------------------------------------------------------------- aircraft lights (nav, beacon, strobe, landing)
const MAXL = 12 * 160;
const acLightGeo = new THREE.BufferGeometry();
const alPos = new Float32Array(MAXL * 3), alCol = new Float32Array(MAXL * 3), alSize = new Float32Array(MAXL), alFl = new Float32Array(MAXL * 3);
acLightGeo.setAttribute('position', new THREE.BufferAttribute(alPos, 3)); acLightGeo.setAttribute('color', new THREE.BufferAttribute(alCol, 3));
acLightGeo.setAttribute('size', new THREE.BufferAttribute(alSize, 1)); acLightGeo.setAttribute('flash', new THREE.BufferAttribute(alFl, 3));
const acLights = new THREE.Points(acLightGeo, lightMat); acLights.frustumCulled = false; scene.add(acLights);
function updateAcLights() {
  let k = 0;
  const put = (v, c, s, f) => { if (k >= MAXL) return; alPos.set([v.x, v.y, v.z], k * 3); alCol.set(c, k * 3); alSize[k] = s; alFl.set(f || [0, 0, 1], k * 3); k++; };
  for (const ac of SIM.ac) {
    if (!ac.obj.visible) continue;
    const L = ac.lightsLocal, m = ac.obj.matrixWorld, ph = (ac.id * 0.137) % 1;
    const w = (p) => tmpV.set(p[0], p[1], p[2]).applyMatrix4(m);
    const powered = ac.engines || ac.moving;
    if (powered) { put(w(L.nav[0]), C.R, 1.0); put(w(L.nav[1]), C.G, 1.0); put(w(L.nav[2]), [1, 1, 1], 0.9); }
    if (ac.engines) { put(w(L.bcn[0]), C.R, 1.6, [ph, 1, 0.12]); put(w(L.bcn[1]), C.R, 1.6, [ph + 0.5, 1, 0.12]); }
    const onRw = ['tkof', 'climb', 'arr', 'roll'].includes(ac.phase);
    if (onRw) { put(w(L.nav[0]), [1, 1, 1], 2.4, [ph, 1.2, 0.05]); put(w(L.nav[1]), [1, 1, 1], 2.4, [ph, 1.2, 0.05]); }
    if (onRw && ac.alt < 3000) { put(w(L.land[0]), [1, 0.98, 0.9], 4.5); put(w(L.land[1]), [1, 0.98, 0.9], 4.5); }
    if (['taxi', 'taxiout'].includes(ac.phase)) put(w(L.taxi), [1, 0.96, 0.85], 2.2);
  }
  acLightGeo.setDrawRange(0, k);
  for (const a of ['position', 'color', 'size', 'flash']) acLightGeo.attributes[a].needsUpdate = true;
}

// ---------------------------------------------------------------- visuals per frame
function updateAircraftVisual(ac, dtR) {
  const o = ac.obj;
  o.position.set(ac.x, ac.alt, -ac.n);
  let pitch = 0;
  if (ac.grounded) { if (ac.phase === 'tkof' && ac.v > ac.T.vr - 3) pitch = clamp((ac.v - ac.T.vr + 3) / 6, 0, 1) * 8; }
  else pitch = Math.atan2(ac.vs, Math.max(ac.v, 30)) / DEG + (ac.phase === 'arr' ? lerp(2.5, 0.5, clamp((ac.v - ac.T.vref) / 40, 0, 1)) : 3);
  ac.pitch = lerp(ac.pitch, pitch, clamp(dtR * 3, 0, 1));
  const bank = ac.grounded ? 0 : clamp(Math.atan(ac.v * ac.yawRate * DEG / 9.81) / DEG, -27, 27);
  ac.bank = lerp(ac.bank, bank, clamp(dtR * 2, 0, 1));
  o.rotation.set(ac.pitch * DEG, -ac.hdg * DEG, -ac.bank * DEG);
  ac.gearMesh.visible = ac.grounded || (ac.phase === 'arr' && ac.alt < 650) || (ac.phase === 'climb' && ac.alt < 70);
}

// ---------------------------------------------------------------- selection, labels, UI
const PH = {
  arr: ['Approach', 'ph-arr'], roll: ['Landing', 'ph-rwy'], taxi: ['Taxi in', 'ph-taxi'], gate: ['At gate', 'ph-gate'], parked: ['Parked', 'ph-gate'],
  push: ['Pushback', 'ph-hold'], start: ['Engine start', 'ph-hold'], taxiout: ['Taxi out', 'ph-taxi'], tkof: ['Takeoff', 'ph-rwy'], climb: ['Departure', 'ph-dep'],
};
const phaseOf = (ac) => (ac.phase === 'taxiout' && ac.holding && ac.v < 0.3 ? ['Holding short', 'ph-hold'] : ac.holding && ac.phase === 'taxi' ? ['Holding', 'ph-hold'] : PH[ac.phase] || [ac.phase, 'ph-gate']);
function select(ac) {
  if (selected) selected.lblEl.classList.remove('sel');
  selected = ac;
  if (!ac) { $('#detail').hidden = true; followSel = false; if (camMode === 'follow') setCam('orbit'); renderList(true); return; }
  ac.lblEl.classList.add('sel');
  $('#detail').hidden = false; updateDetail(); renderList(true);
}
const altFt = (ac) => Math.round(ELEV_FT + ac.alt / FT);
function updateDetail() {
  const ac = selected; if (!ac) return;
  const [ph] = phaseOf(ac);
  $('#d-cs').textContent = ac.callsign; $('#d-op').textContent = ac.op.name;
  $('#d-from').textContent = ac.dir === 'out' ? 'PHX' : ac.phase === 'gate' && !ac.dir ? '—' : ac.other;
  $('#d-to').textContent = ac.dir === 'out' ? ac.other : 'PHX';
  $('#d-ph').textContent = ph; $('#d-ty').textContent = `${ac.type} · ${TYPE_NAMES[ac.type] || ''}`;
  $('#d-reg').textContent = ac.reg; $('#d-hex').textContent = ac.hex; $('#d-sq').textContent = ac.engines ? ac.sq : '—';
  $('#d-gate').textContent = ac.gate ? ac.gate.name : ac.rwyEnd ? `Runway ${ac.rwyEnd.id.replace(/^0/, '')}` : '—';
  $('#d-alt').textContent = ac.grounded ? `${fmt(altFt(ac))} ft MSL (on ground)` : `${fmt(Math.round(altFt(ac) / 10) * 10)} ft MSL · ${fmt(Math.round(ac.alt / FT / 10) * 10)} AGL`;
  $('#d-gs').textContent = `${fmt(ac.v / KT)} kt`; $('#d-vs').textContent = `${ac.vs >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(ac.vs / FT * 60 / 10) * 10))} ft/min`;
  $('#d-trk').textContent = `${String(Math.round(ac.hdg) % 360).padStart(3, '0')}°`;
  const [la, lo] = toLL(ac.x, ac.n); $('#d-ll').textContent = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
  $('#d-xyz').textContent = `${fmt(ac.x)} / ${fmt(ac.n)} / ${fmt(ac.alt)} m`;
  $('#d-gnd').textContent = String(ac.grounded);
  $('#d-follow').textContent = followSel ? 'Stop following' : 'Follow';
}
const listRows = new Map();
function renderList(force) {
  const ul = $('#tlist');
  const order = { arr: 0, roll: 1, climb: 2, tkof: 3, taxiout: 4, start: 5, push: 6, taxi: 7 };
  const items = SIM.ac.filter((a) => a.moving || a === selected).sort((a, b) => (order[a.phase] ?? 9) - (order[b.phase] ?? 9) || a.callsign.localeCompare(b.callsign));
  const keep = new Set(items.map((a) => a.id));
  for (const [id, li] of listRows) if (!keep.has(id)) { li.remove(); listRows.delete(id); }
  items.forEach((ac, i) => {
    let li = listRows.get(ac.id);
    if (!li) {
      li = document.createElement('li'); li.innerHTML = '<button type="button"><span class="cs"></span><span class="ty"></span><span class="st"><span class="pill"></span><small></small></span></button>';
      li.firstChild.addEventListener('click', () => { select(ac); centerOn(ac); });
      listRows.set(ac.id, li);
    }
    const b = li.firstChild, [ph, cls] = phaseOf(ac);
    b.classList.toggle('sel', ac === selected);
    b.children[0].textContent = ac.callsign; b.children[1].textContent = ac.type;
    const pill = b.children[2].children[0]; pill.textContent = ph; pill.className = `pill ${cls}`;
    b.children[2].children[1].textContent = ac.grounded ? (ac.gate && ac.phase !== 'taxiout' ? ac.gate.name : ac.rwyEnd ? `RWY ${ac.rwyEnd.id.replace(/^0/, '')}` : '') : `${fmt(Math.round(altFt(ac) / 100) * 100)}′`;
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null);
  });
  const c = { arr: 0, dep: 0, taxi: 0, gate: 0 };
  for (const a of SIM.ac) { if (a.phase === 'arr') c.arr++; else if (a.phase === 'climb' || a.phase === 'tkof') c.dep++; else if (['taxi', 'taxiout', 'push', 'start', 'roll'].includes(a.phase)) c.taxi++; else c.gate++; }
  $('#n-arr').textContent = c.arr; $('#n-dep').textContent = c.dep; $('#n-taxi').textContent = c.taxi; $('#n-gate').textContent = c.gate;
  $('#chip-count').textContent = `${SIM.ac.length} aircraft`;
}
function updateLabels() {
  const camPos = camera.position, mode = labelsOn.mode;
  const cand = [];
  for (const ac of SIM.ac) {
    const d = camPos.distanceTo(ac.obj.position);
    const want = ac === selected || (mode !== 'off' && ((ac.moving && d < 16000) || (!ac.moving && d < 700)));
    if (want) cand.push([d, ac]); else ac.label.visible = false;
  }
  cand.sort((a, b) => (b[1] === selected) - (a[1] === selected) || a[0] - b[0]);
  const placed = [], v = new THREE.Vector3(), maxFull = isNarrow() ? 3 : 8;
  let nFull = 0, nShown = 0;
  const hit = (r) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
  cand.forEach(([d, ac]) => {
    v.copy(ac.label.position).applyMatrix4(ac.obj.matrixWorld).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2 || nShown >= (isNarrow() ? 10 : 26)) { ac.label.visible = false; return; }
    const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight, sel = ac === selected;
    const rect = (c) => { const w = c ? 104 : 210, h = c ? 20 : 96; return { x0: sx - w / 2, x1: sx + w / 2, y0: sy - h - 20, y1: sy - 16 }; };
    let compact = mode === 'compact' || ((d > 6000 || nFull >= maxFull || !ac.moving) && !sel);
    let r = rect(compact);
    if (!sel && hit(r) && !compact) { compact = true; r = rect(true); }
    if (!sel && hit(r)) { ac.label.visible = false; return; }
    placed.push(r); nShown++; if (!compact) nFull++;
    ac.label.visible = true;
    ac.lblEl.classList.toggle('compact', compact);
    const p = ac.lblParts;
    p[0].textContent = compact ? `${ac.callsign} ${ac.grounded ? '' : `${fmt(Math.round(altFt(ac) / 100) * 100)}`}`.trim() : ac.callsign;
    if (!compact) {
      p[1].textContent = `Location: X=${fmt(ac.x, 1)} Y=${fmt(ac.n, 1)} Z=${fmt(ac.alt, 1)}`;
      p[2].textContent = `Is Grounded?: ${ac.grounded}`; p[3].textContent = `ICAO: ${ac.hex}`; p[4].textContent = `Model: ${ac.type}`; p[5].textContent = `REGN: ${ac.reg}`;
    }
    ac.lblEl.style.opacity = ac === selected ? 1 : clamp(1.15 - d / 16000, 0.45, 1);
  });
}

// ---------------------------------------------------------------- camera modes
const TOUR = [ // [x, n, alt, tx, tn] world meters
  [2900, -2300, 620, 300, -150], [1500, -1500, 260, -500, -450], [-200, -1250, 190, -1700, -420], [-2500, -900, 260, -600, 200],
  [-2700, 300, 300, -300, 700], [-1800, 1700, 240, 600, 650], [200, 1900, 330, 600, 150], [2300, 1500, 380, 800, 0], [3300, -400, 520, 300, -200],
];
const tourPos = new THREE.CatmullRomCurve3(TOUR.map((k) => new THREE.Vector3(k[0], k[2], -k[1])), true, 'centripetal');
const tourTgt = new THREE.CatmullRomCurve3(TOUR.map((k) => new THREE.Vector3(k[3], 0, -k[4])), true, 'centripetal');
let tourT = 0;
function setCam(mode) {
  camMode = mode;
  $$('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === mode || (mode === 'follow' && b.dataset.cam === 'orbit'))));
  controls.enabled = mode !== 'tour';
  if (mode === 'tower') {
    followSel = false;
    camera.position.set(TOWER.x + 0.25, TOWER.cab + 0.12, -TOWER.n - 0.8); controls.target.set(TOWER.x, TOWER.cab - 0.2, -TOWER.n); // looking south over 7L/25R and 7R/25L
    controls.minDistance = 0.5; controls.maxDistance = 1.2; controls.rotateSpeed = -0.35; controls.enablePan = false; controls.maxPolarAngle = 170 * DEG;
  } else {
    controls.minDistance = 25; controls.maxDistance = 60000; controls.rotateSpeed = 1; controls.enablePan = true; controls.maxPolarAngle = 88 * DEG;
  }
  if (mode === 'orbit' && controls.target.y > 50) controls.target.y = 0;
  updateDetail();
}
function centerOn(ac) {
  if (camMode === 'tour' || camMode === 'tower') setCam('orbit');
  const tgt = ac.obj.position.clone(), off = camera.position.clone().sub(controls.target);
  const dist = clamp(off.length(), ac.T.L * 4, 1600); off.setLength(dist);
  if (off.y < dist * 0.25) off.y = dist * 0.35;
  controls.target.copy(tgt); camera.position.copy(tgt).add(off);
}
canvas.addEventListener('pointerdown', () => { if (camMode === 'tour') { setCam('orbit'); controls.target.copy(tourTgt.getPointAt(tourT % 1)); } });

const ray = new THREE.Raycaster(); let downXY = null;
canvas.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5) return;
  const m = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(m, camera);
  const hits = ray.intersectObjects(SIM.ac.map((a) => a.body), false);
  if (hits.length) select(hits[0].object.userData.ac);
});

// ---------------------------------------------------------------- controls wiring
let simSpeed = 1, live = true, clockMs = Date.now(), todOffset = 0;
const mst = (ms) => new Date(ms - 7 * 3600000);
const p2 = (v) => String(v).padStart(2, '0');
function setFlow(f) {
  SIM.flow = f; SIM.arrTimer = {};
  $('#flow-west').setAttribute('aria-pressed', String(f === 'west')); $('#flow-east').setAttribute('aria-pressed', String(f === 'east'));
  $('#flow-arr').textContent = FLOWS[f].arr.map((s) => s.replace(/^0/, '')).join(' · ');
  $('#flow-dep').textContent = FLOWS[f].dep.map((s) => s.replace(/^0/, '')).join(' · ');
  $('#chip-wx').textContent = FLOWS[f].wind;
  for (const s of socks) s.rotation.y = -((FLOWS[f].windHdg + 180) % 360 - 90) * DEG;
}
$('#flow-west').onclick = () => setFlow('west'); $('#flow-east').onclick = () => setFlow('east');
$$('[data-cam]').forEach((b) => (b.onclick = () => { if (b.dataset.cam === 'tour') { tourT = 0; } setCam(b.dataset.cam); }));
$$('[data-spd]').forEach((b) => (b.onclick = () => { simSpeed = +b.dataset.spd; $$('[data-spd]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
$$('[data-lbl]').forEach((b) => (b.onclick = () => { labelsOn.mode = b.dataset.lbl; $$('[data-lbl]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
const tod = $('#tod');
function setLive(on) { live = on; $('#live').setAttribute('aria-pressed', String(on)); if (on) clockMs = Date.now(); }
$('#live').onclick = () => setLive(true);
tod.oninput = () => {
  const h = +tod.value, now = mst(clockMs);
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 7 * 3600000;
  clockMs = base + h * 3600000; setLive(false); updateSky(clockMs); ENV.lastEnvAlt = 99;
};
$('#d-close').onclick = () => select(null);
$('#d-follow').onclick = () => { followSel = !followSel; if (followSel && selected) { setCam('follow'); centerOn(selected); camMode = 'follow'; } else setCam('orbit'); updateDetail(); };
$('#d-center').onclick = () => selected && centerOn(selected);
$('#tbtn').onclick = () => { const t = $('#traffic'), open = t.classList.toggle('closed') === false; $('#tbtn').setAttribute('aria-expanded', String(open)); };
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false); labelRenderer.setSize(innerWidth, innerHeight);
});
setFlow('west');

// ---------------------------------------------------------------- main loop
updateSky(clockMs);
camera.position.copy(tourPos.getPointAt(0)); camera.lookAt(tourTgt.getPointAt(0)); controls.target.copy(tourTgt.getPointAt(0));
setCam('tour');
progress('Ready', 1);
let last = performance.now(), uiT = 0, skyT = 0, lblT = 0;
function frame(now) {
  const dtR = Math.min(0.1, (now - last) / 1000); last = now;
  const dt = dtR * simSpeed;
  clockMs += dt * 1000;
  if (live && simSpeed === 1 && Math.abs(clockMs - Date.now()) > 5000) clockMs = Date.now();
  let rem = dt; while (rem > 1e-6) { const h = Math.min(0.25, rem); simStep(h); rem -= h; }
  for (const ac of SIM.ac) updateAircraftVisual(ac, dtR);
  for (const tr of skyTrains) {
    tr.grp.children.forEach((car, k) => {
      const s = clamp(tr.s - k * 12.2 * tr.dir, 0, tr.len), u = s / tr.len;
      const p = tr.curve.getPointAt(u), t = tr.curve.getTangentAt(u);
      car.position.set(p.x, p.y + 1.9, p.z); car.rotation.set(0, Math.atan2(t.x, t.z), 0);
    });
  }
  // camera
  if (camMode === 'tour') {
    tourT = (tourT + dtR / 110) % 1;
    camera.position.copy(tourPos.getPointAt(tourT)); camera.lookAt(tourTgt.getPointAt(tourT));
  } else {
    if (camMode === 'follow' && selected) {
      const tgt = selected.obj.position, d = tgt.clone().sub(controls.target);
      controls.target.add(d); camera.position.add(d);
    }
    controls.update();
  }
  const camAgl = camera.position.y - Math.min(terrainH(camera.position.x, -camera.position.z), 0);
  const near = clamp(Math.min(camAgl * 0.1, camMode === 'tour' ? 1e9 : controls.getDistance() * 0.2), 0.3, 40);
  if (Math.abs(near - camera.near) / camera.near > 0.15) { camera.near = near; camera.updateProjectionMatrix(); }
  // shadows follow the view
  const focus = camMode === 'tour' ? tourTgt.getPointAt(tourT) : controls.target;
  const span = clamp(camera.position.distanceTo(focus) * 0.9, 250, 2600);
  const sc = sun.shadow.camera; sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 10; sc.far = 14000; sc.updateProjectionMatrix();
  sun.target.position.copy(focus); sun.target.updateMatrixWorld(); sun.position.copy(ENV.dir).multiplyScalar(6000).add(focus);
  skyT += dtR; if (skyT > 0.5) { skyT = 0; updateSky(clockMs); }
  // PAPI colors from the camera's angle above each light
  const pc = STATIC_PTS.geometry.attributes.color;
  for (const P of papi) {
    const dx = camera.position.x - P.x, dz = -camera.position.z - P.n, along = dx * -P.e.ux + dz * -P.e.un;
    const ang = Math.atan2(camera.position.y, Math.max(1, Math.hypot(dx, dz))) / DEG;
    const c = along > 0 && ang > P.ang ? [1, 1, 1] : along > 0 ? C.R : [0, 0, 0];
    pc.array.set(c, P.i * 3);
  }
  pc.needsUpdate = true;
  lightUniforms.uTime.value = now / 1000;
  lightUniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * DEG / 2));
  scene.updateMatrixWorld();
  updateAcLights();
  lblT += dtR; if (lblT > 0.2) { lblT = 0; updateLabels(); }
  uiT += dtR;
  if (uiT > 0.5) {
    uiT = 0; renderList(); updateDetail();
    const t = mst(clockMs);
    $('#clk').textContent = `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())}`;
    const z = new Date(clockMs); $('#clkz').textContent = `MST · ${p2(z.getUTCHours())}:${p2(z.getUTCMinutes())}Z`;
    const hh = t.getUTCHours() + t.getUTCMinutes() / 60; if (document.activeElement !== tod) tod.value = String(Math.round(hh * 4) / 4);
    $('#todv').textContent = `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}`;
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => { $('#loading').hidden = true; }, 150);
if (!isNarrow()) $('#traffic').classList.remove('closed');
window.__twin = { SIM, ENDS, RWY, GATES, select, setCam, camera, controls, nToIcao, updateSky, setFlow, astar, simStep };
