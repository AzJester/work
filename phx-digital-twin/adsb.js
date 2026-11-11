// ADS-B helpers shared by the twin (browser) and the node tests. Pure functions: no DOM, no three.js.
// Input format is the readsb / tar1090 aircraft JSON used by adsb.lol, airplanes.live, adsb.fi and local receivers.

export const FT = 0.3048, KT = 0.514444, DEG = Math.PI / 180;

// KPHX datum. geoidM is the geoid undulation (GEOID18, about -30 m at Phoenix): MSL = ellipsoid height - geoidM.
export const FIELD = { lat0: 33.434277778, lon0: -112.011583333, elevM: 1131 * FT, geoidM: -30.0 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hex6 = (v) => v.toString(16).toUpperCase().padStart(6, '0');

// ---------------------------------------------------------------- N-number -> ICAO 24-bit (FAA block A00001..ADF7C7)
const NCH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NSUF = 1 + 24 * 25, NB4 = 1 + 24 + 10, NB3 = 10 * NB4 + NSUF, NB2 = 10 * NB3 + NSUF, NB1 = 10 * NB2 + NSUF;
export function nToIcao(reg) {
  const s = String(reg).toUpperCase().replace(/^N/, '');
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

// ---------------------------------------------------------------- WGS84 -> twin meters (transverse Mercator on the datum)
// Same projection the preprocessing used (pyproj tmerc, k=1), so live positions land on the painted pavement.
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const meridian = (p) => A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * p - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * p)
  + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * p) - (35 * E2 ** 3 / 3072) * Math.sin(6 * p));
const M0 = meridian(FIELD.lat0 * DEG);
export function llToLocal(lat, lon) {
  const p = lat * DEG, sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
  const N = A / Math.sqrt(1 - E2 * sp * sp), T = tp * tp, C = EP2 * cp * cp, a = (lon - FIELD.lon0) * DEG * cp;
  const x = N * (a + (1 - T + C) * a ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5 / 120);
  const n = meridian(p) - M0 + N * tp * (a * a / 2 + (5 - T + 9 * C + 4 * C * C) * a ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6 / 720);
  return [x, n];
}

// ---------------------------------------------------------------- altitude handling
// Pressure altitude is not height: estimate the day's correction from aircraft that report both altitudes.
export function estimateQnhOffset(list) {
  const d = [];
  for (const a of list || []) {
    if (typeof a.alt_geom === 'number' && typeof a.alt_baro === 'number' && a.alt_baro < 18000) d.push((a.alt_geom - a.alt_baro) * FT - FIELD.geoidM);
  }
  if (!d.length) return null;
  d.sort((p, q) => p - q);
  return d[Math.floor(d.length / 2)];
}

// One raw aircraft object -> the state the twin renders, or null when it has no usable position.
export function normalize(a, qnhOffsetM = 0) {
  if (!a || typeof a.lat !== 'number' || typeof a.lon !== 'number' || !a.hex) return null;
  const hex = String(a.hex).toUpperCase();
  if (hex.startsWith('~')) return null;                    // TIS-B / non-ICAO tracks duplicate real targets
  const category = a.category || '';
  if (/^C/.test(category)) return null;                    // surface vehicles and fixed obstacles
  const ground = a.alt_baro === 'ground' || a.ground === true;
  let mslM = null, altSrc = 'none';
  if (ground) { mslM = FIELD.elevM; altSrc = 'ground'; }
  else if (typeof a.alt_geom === 'number') { mslM = a.alt_geom * FT - FIELD.geoidM; altSrc = 'geom'; }
  else if (typeof a.alt_baro === 'number') { mslM = a.alt_baro * FT + qnhOffsetM; altSrc = 'baro'; }
  else return null;
  const [x, n] = llToLocal(a.lat, a.lon);
  const gs = (typeof a.gs === 'number' ? a.gs : 0) * KT;
  const track = typeof a.track === 'number' ? a.track : null;
  const trueHdg = typeof a.true_heading === 'number' ? a.true_heading : null;
  // on the ground, course over ground is noise below a few knots: prefer reported heading
  const hdg = ground ? (trueHdg ?? (gs > 2.5 ? track : null)) : (track ?? trueHdg);
  const rate = typeof a.geom_rate === 'number' ? a.geom_rate : (typeof a.baro_rate === 'number' ? a.baro_rate : 0);
  return {
    hex, flight: (a.flight || '').trim(), reg: a.r || '', type: (a.t || '').toUpperCase(), category,
    lat: a.lat, lon: a.lon, x, n, ground, alt: ground ? 0 : Math.max(0, mslM - FIELD.elevM), mslFt: mslM / FT, altSrc,
    gs, track: track ?? trueHdg ?? 0, hdg, vs: ground ? 0 : rate * FT / 60,
    squawk: a.squawk || '', src: a.type || '', seenPos: typeof a.seen_pos === 'number' ? a.seen_pos : (typeof a.seen === 'number' ? a.seen : 0),
    mil: !!((a.dbFlags || 0) & 1), emergency: a.emergency && a.emergency !== 'none' ? a.emergency : '',
  };
}

// Straight-line extrapolation from the last report; capped so a dropped feed does not send aircraft into the next county.
export function predict(rep, t) {
  const dt = clamp(t - rep.t, 0, rep.ground ? 6 : 15);
  return { x: rep.x + rep.vx * dt, n: rep.n + rep.vn * dt, alt: rep.ground ? 0 : Math.max(0, rep.alt + rep.vs * Math.min(dt, 10)) };
}

// ---------------------------------------------------------------- type designator -> 3D model key
const ALIAS = {
  A318: 'A319', A19N: 'A319', A20N: 'A20N', A21N: 'A21N', B736: 'B737', B37M: 'B737', B39M: 'B739', B3XM: 'B739', B753: 'B752', B734: 'B737', B733: 'B737', B735: 'B737', B712: 'B737', MD82: 'B737', MD83: 'B737', MD88: 'B737', MD90: 'B737',
  BCS1: 'BCS3', E170: 'E175', E75L: 'E175', E75S: 'E175', E190: 'E175', E195: 'E175', E290: 'E175', E295: 'E175', E135: 'CRJ7', E145: 'CRJ7', E45X: 'CRJ7',
  CRJ2: 'CRJ7', CRJ1: 'CRJ7', CRJX: 'CRJ9',
  B762: 'B763', B764: 'B763', B77L: 'B772', B773: 'B77W', B778: 'B77W', B779: 'B77W', B788: 'B789', B78X: 'B789',
  A332: 'A333', A338: 'A333', A339: 'A333', A342: 'A333', A343: 'A333', A30B: 'A306', A310: 'A306', A35K: 'A359', A345: 'A359', A346: 'A359',
  B741: 'B744', B742: 'B744', B748: 'B744', A388: 'B744', A124: 'B744', C5M: 'B744', DC10: 'MD11', K35E: 'K35R', E3TF: 'K35R', E6: 'K35R', C17: 'B744', C135: 'K35R', B703: 'K35R', B52: 'K35R',
  E50P: 'E55P', C25A: 'E55P', C25B: 'E55P', C25C: 'E55P', C525: 'E55P', C510: 'E55P', C550: 'E55P', C560: 'E55P', C56X: 'E55P', LJ35: 'E55P', LJ45: 'E55P', LJ60: 'E55P', LJ75: 'E55P', BE40: 'E55P', HDJT: 'E55P', PC24: 'E55P', SF50: 'E55P', EA50: 'E55P',
  C680: 'C68A', C700: 'C68A', C750: 'C68A', E545: 'C68A', E550: 'C68A', H25B: 'C68A', G280: 'C68A', F2TH: 'C68A', CL30: 'CL35', CL60: 'CL35', GALX: 'CL35',
  GLF4: 'GLF6', GLF5: 'GLF6', GLEX: 'GLF6', GL5T: 'GLF6', GL7T: 'GLF6', GA5C: 'GLF6', GA6C: 'GLF6', F900: 'GLF6', FA7X: 'GLF6', FA8X: 'GLF6',
  C152: 'C172', C182: 'C172', C206: 'C172', C210: 'C172', P28A: 'SR22', P28B: 'SR22', PA32: 'SR22', P32R: 'SR22', SR20: 'SR22', S22T: 'SR22', DA40: 'SR22', DA42: 'SR22', BE35: 'SR22', BE36: 'SR22', M20P: 'SR22', BE58: 'SR22', PA34: 'SR22', PA44: 'SR22', C310: 'SR22',
  TBM7: 'PC12', TBM8: 'PC12', TBM9: 'PC12', PA46: 'PC12', P46T: 'PC12', M600: 'PC12',
  B350: 'BE20', BE9L: 'BE20', BE30: 'BE20', B190: 'BE20', SW4: 'BE20', C441: 'BE20', PAY2: 'BE20', DH8A: 'DH8D', DH8B: 'DH8D', DH8C: 'DH8D', AT43: 'AT72', AT45: 'AT72', AT75: 'AT72', AT76: 'AT72', SF34: 'AT72', C130: 'DH8D', C30J: 'DH8D',
  H47: 'H60', H53: 'H60', S92: 'H60', B412: 'H60', UH1: 'H60', B429: 'EC35', EC30: 'EC35', EC45: 'EC35', AS50: 'EC35', AS55: 'EC35', B06: 'EC35', B407: 'EC35', R22: 'EC35', R44: 'EC35', R66: 'EC35', A109: 'EC35', A139: 'H60', H500: 'EC35', MD52: 'EC35', H64: 'H60',
};
const BY_CATEGORY = { A1: 'C172', A2: 'E55P', A3: 'B738', A4: 'B752', A5: 'B772', A6: 'GLF6', A7: 'EC35', B1: 'C172', B2: 'C172', B4: 'C172', B6: 'C172' };
// `known` is the set of model keys the renderer can build.
export function modelKey(type, category, known) {
  const t = (type || '').toUpperCase();
  if (t && known.has(t)) return t;
  if (ALIAS[t] && known.has(ALIAS[t])) return ALIAS[t];
  if (/^H\d|^EC\d|^AS\d|^R\d\d$/.test(t) && known.has('EC35')) return 'EC35';
  const c = BY_CATEGORY[category];
  if (c && known.has(c)) return c;
  return known.has('B738') ? 'B738' : [...known][0];
}

// ---------------------------------------------------------------- callsign -> operator and paint scheme
const AIRLINES = {
  AAL: ['American Airlines', 'AAL'], ENY: ['Envoy Air (American Eagle)', 'AAL'], SKW: ['SkyWest Airlines', 'AAL'], JIA: ['PSA Airlines (American Eagle)', 'AAL'], PDT: ['Piedmont Airlines (American Eagle)', 'AAL'], RPA: ['Republic Airways', 'AAL'],
  SWA: ['Southwest Airlines', 'SWA'], DAL: ['Delta Air Lines', 'DAL'], EDV: ['Endeavor Air (Delta Connection)', 'DAL'], UAL: ['United Airlines', 'UAL'], ASH: ['Mesa Airlines (United Express)', 'UAL'], GJS: ['GoJet Airlines (United Express)', 'UAL'],
  ASA: ['Alaska Airlines', 'ASA'], QXE: ['Horizon Air', 'ASA'], FFT: ['Frontier Airlines', 'FFT'], JBU: ['JetBlue', 'JBU'], SCX: ['Sun Country Airlines', 'SCX'], NKS: ['Spirit Airlines', 'NKS'], AAY: ['Allegiant Air', 'JBU'], HAL: ['Hawaiian Airlines', 'VOI'],
  ACA: ['Air Canada', 'ACA'], ROU: ['Air Canada Rouge', 'ACA'], WJA: ['WestJet', 'WJA'], AMX: ['Aeroméxico', 'AMX'], VOI: ['Volaris', 'VOI'], BAW: ['British Airways', 'BAW'], CFG: ['Condor', 'SCX'], AFR: ['Air France', 'UAL'],
  FDX: ['FedEx', 'FDX'], UPS: ['UPS Airlines', 'UPS'], GTI: ['Atlas Air', 'UAL'], ABX: ['ABX Air', 'GEN'], ATN: ['Air Transport International', 'GEN'], PAC: ['Polar Air Cargo', 'GEN'], AJT: ['Amerijet', 'GEN'], SOO: ['Southern Air', 'GEN'],
  EJA: ['NetJets', 'EJA'], LXJ: ['Flexjet', 'EJA'], EJM: ['Executive Jet Management', 'EJA'], VJA: ['Vista America', 'EJA'], JTL: ['Jet Linx', 'EJA'], WUP: ['Wheels Up', 'EJA'], TWY: ['Sun Air Jets', 'EJA'], KOW: ['Baker Aviation', 'EJA'],
  RCH: ['US Air Force (Air Mobility Command)', 'MIL'], CNV: ['US Navy', 'MIL'], PAT: ['US Army', 'MIL'], LIFE: ['Air ambulance', 'GA'], N: ['General aviation', 'GA'],
};
export function operatorOf(flight, reg, mil) {
  const cs = (flight || '').toUpperCase();
  const m = cs.match(/^([A-Z]{3})\d/);
  if (m && AIRLINES[m[1]]) return { code: m[1], name: AIRLINES[m[1]][0], liv: mil ? 'MIL' : AIRLINES[m[1]][1] };
  if (mil) return { code: 'MIL', name: 'Military', liv: 'MIL' };
  if (m) return { code: m[1], name: `Operator ${m[1]}`, liv: 'GEN' };
  if (/^N\d/.test(cs) || /^N\d/.test(reg || '')) return { code: 'GA', name: 'General aviation', liv: 'GA' };
  return { code: 'UNK', name: 'Operator not reported', liv: 'GA' };
}

// Rough test for "which way is the airport landing": descending traffic near the field on a runway heading.
// Phase of a live aircraft from one report. Transponders often keep the airborne bit set through the takeoff roll and for
// the first seconds after touchdown, so an aircraft moving fast within a few metres of a runway surface counts as on the
// runway even when the report says airborne. onRunway is a function so the lookup only runs when it can matter.
export function livePhase(rep, altAgl, onRunway) {
  if (rep.ground) return rep.gs < 1.2 ? 'stop' : rep.gs > 18 && onRunway() ? 'roll' : 'taxi';
  if (altAgl < 12 && Math.abs(rep.vs) <= 1.2 && rep.gs > 18 && onRunway()) return 'roll';
  return rep.vs < -1.2 ? 'arr' : rep.vs > 1.2 ? 'climb' : 'lvl';
}

export function flowVote(rep) {
  if (rep.ground || rep.alt < 60 || rep.alt > 1400 || rep.vs > -0.4 || Math.hypot(rep.x, rep.n) > 18000) return null;
  const d = (h) => Math.abs(((rep.track - h + 540) % 360) - 180);
  if (d(258) < 22) return 'west';
  if (d(78) < 22) return 'east';
  return null;
}
