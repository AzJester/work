// Coordinate maths for Topo Map Builder: WGS84 UTM (Karney-Krueger series), MGRS, and input parsing.
// Pure functions with no DOM or map dependency, so the same code runs in the page and in the Node tests.

export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
export const E2 = WGS84_F * (2 - WGS84_F);
const E = Math.sqrt(E2);
const N = WGS84_F / (2 - WGS84_F);
const K0 = 0.9996;
const N2 = N * N, N3 = N2 * N, N4 = N3 * N;
// Rectifying radius and the series coefficients to fourth order in the third flattening.
const A_RECT = (WGS84_A / (1 + N)) * (1 + N2 / 4 + N4 / 64);
const ALPHA = [
  N / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180,
  (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440,
  (61 * N3) / 240 - (103 * N4) / 140,
  (49561 * N4) / 161280,
];
const BETA = [
  N / 2 - (2 * N2) / 3 + (37 * N3) / 96 - N4 / 360,
  N2 / 48 + N3 / 15 - (437 * N4) / 1440,
  (17 * N3) / 480 - (37 * N4) / 840,
  (4397 * N4) / 161280,
];

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const MGRS_MIN_LAT = -80;
export const MGRS_MAX_LAT = 84;
const BANDS = "CDEFGHJKLMNPQRSTUVWX";
const COLUMNS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROWS = "ABCDEFGHJKLMNPQRSTUV";

/** Wrap a longitude into [-180, 180). */
export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** UTM zone number for a position, including the Norway and Svalbard exceptions. */
export function utmZone(lat, lon) {
  const l = wrapLon(lon);
  let zone = Math.min(60, Math.floor((l + 180) / 6) + 1);
  if (lat >= 56 && lat < 64 && l >= 3 && l < 12) zone = 32;
  if (lat >= 72 && lat <= 84) {
    if (l >= 0 && l < 9) zone = 31;
    else if (l >= 9 && l < 21) zone = 33;
    else if (l >= 21 && l < 33) zone = 35;
    else if (l >= 33 && l < 42) zone = 37;
  }
  return zone;
}

export function zoneCentralMeridian(zone) {
  return (zone - 1) * 6 - 180 + 3;
}

/**
 * West and east limits of a zone at a latitude, or null where the zone does not exist
 * (32X, 34X and 36X are absorbed by their neighbours over Svalbard).
 */
export function zoneLonBounds(zone, lat) {
  let west = (zone - 1) * 6 - 180;
  let east = west + 6;
  if (lat >= 56 && lat < 64) {
    if (zone === 31) east = 3;
    else if (zone === 32) west = 3;
  } else if (lat >= 72 && lat <= 84) {
    if (zone === 32 || zone === 34 || zone === 36) return null;
    if (zone === 31) east = 9;
    else if (zone === 33) { west = 9; east = 21; }
    else if (zone === 35) { west = 21; east = 33; }
    else if (zone === 37) west = 33;
  }
  return [west, east];
}

/** Latitude band letter, C to X. Latitudes outside the MGRS range clamp to the end bands. */
export function latBand(lat) {
  const index = Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)));
  return BANDS[index];
}

/** South and north limits of a latitude band letter. */
export function bandLatBounds(band) {
  const index = BANDS.indexOf(band.toUpperCase());
  if (index < 0) return null;
  const south = -80 + index * 8;
  return [south, index === 19 ? 84 : south + 8];
}

/**
 * Geographic to UTM. `zone` and `south` may be forced so that points just outside a zone or across
 * the equator stay on one continuous grid. Returns grid convergence (degrees, east positive: the
 * bearing of grid north measured from true north) and the point scale factor.
 */
export function utmForward(lat, lon, zone = utmZone(lat, lon), south = lat < 0) {
  const phi = lat * RAD;
  const dl = wrapLon(lon - zoneCentralMeridian(zone)) * RAD;
  const tau = Math.tan(phi);
  const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.hypot(1, tau)));
  const taup = tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);
  const cosDl = Math.cos(dl);
  const xip = Math.atan2(taup, cosDl);
  const etap = Math.asinh(Math.sin(dl) / Math.hypot(taup, cosDl));
  let xi = xip, eta = etap, pp = 1, qp = 0;
  for (let j = 1; j <= 4; j += 1) {
    const a = ALPHA[j - 1];
    const s = Math.sin(2 * j * xip), c = Math.cos(2 * j * xip);
    const sh = Math.sinh(2 * j * etap), ch = Math.cosh(2 * j * etap);
    xi += a * s * ch;
    eta += a * c * sh;
    pp += 2 * j * a * c * ch;
    qp += 2 * j * a * s * sh;
  }
  const gamma = Math.atan((taup / Math.hypot(1, taup)) * Math.tan(dl)) + Math.atan2(qp, pp);
  const sinPhi = Math.sin(phi);
  const scale = ((K0 * A_RECT) / WGS84_A) * Math.hypot(pp, qp)
    * ((Math.sqrt(1 - E2 * sinPhi * sinPhi) * Math.hypot(1, tau)) / Math.hypot(taup, cosDl));
  return {
    zone,
    south,
    easting: 500000 + K0 * A_RECT * eta,
    northing: K0 * A_RECT * xi + (south ? 10000000 : 0),
    convergence: gamma * DEG,
    scale,
  };
}

/** UTM to geographic. */
export function utmInverse(zone, south, easting, northing) {
  const xi = (northing - (south ? 10000000 : 0)) / (K0 * A_RECT);
  const eta = (easting - 500000) / (K0 * A_RECT);
  let xip = xi, etap = eta;
  for (let j = 1; j <= 4; j += 1) {
    const b = BETA[j - 1];
    xip -= b * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etap -= b * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const taup = Math.sin(xip) / Math.hypot(Math.sinh(etap), Math.cos(xip));
  const dl = Math.atan2(Math.sinh(etap), Math.cos(xip));
  let tau = taup;
  for (let i = 0; i < 8; i += 1) {
    const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.hypot(1, tau)));
    const tp = tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);
    const delta = ((taup - tp) / Math.hypot(1, tp)) * ((1 + (1 - E2) * tau * tau) / ((1 - E2) * Math.hypot(1, tau)));
    tau += delta;
    if (Math.abs(delta) < 1e-14) break;
  }
  return { lat: Math.atan(tau) * DEG, lon: wrapLon(zoneCentralMeridian(zone) + dl * DEG) };
}

/** Two-letter 100 km square identifier for a UTM position. */
export function square100k(zone, easting, northing) {
  const column = COLUMNS[((zone - 1) % 3) * 8 + Math.floor(easting / 100000) - 1];
  const row = ROWS[(((Math.floor(northing / 100000) + (zone % 2 === 0 ? 5 : 0)) % 20) + 20) % 20];
  return column && row ? column + row : "";
}

export function inMgrsRange(lat) {
  return lat >= MGRS_MIN_LAT && lat <= MGRS_MAX_LAT;
}

/**
 * MGRS string for a position. `digits` is the count per axis (5 = 1 m, 4 = 10 m, ... 0 = 100 km
 * square only). Values are truncated, as the standard requires, never rounded.
 */
export function toMgrs(lat, lon, digits = 5, spaced = true) {
  if (!inMgrsRange(lat)) return "";
  const utm = utmForward(lat, lon);
  const square = square100k(utm.zone, utm.easting, utm.northing);
  const head = `${utm.zone}${latBand(lat)}`;
  if (digits <= 0) return spaced ? `${head} ${square}` : head + square;
  const divisor = 10 ** (5 - digits);
  const e = String(Math.floor((utm.easting % 100000) / divisor)).padStart(digits, "0");
  const n = String(Math.floor((utm.northing % 100000) / divisor)).padStart(digits, "0");
  return spaced ? `${head} ${square} ${e} ${n}` : head + square + e + n;
}

/**
 * MGRS string for a UTM position, without a round trip through latitude and longitude, so exact
 * grid values such as a page corner never fall one metre short through rounding.
 */
export function mgrsFromUtm(zone, south, easting, northing, digits = 5, spaced = true) {
  const { lat } = utmInverse(zone, south, easting, northing);
  if (!inMgrsRange(lat)) return "";
  const square = square100k(zone, easting, northing);
  const head = `${zone}${latBand(lat)}`;
  if (digits <= 0) return spaced ? `${head} ${square}` : head + square;
  const divisor = 10 ** (5 - digits);
  const part = value => String(Math.floor((((value % 100000) + 100000) % 100000) / divisor + 1e-9)).padStart(digits, "0");
  return spaced ? `${head} ${square} ${part(easting)} ${part(northing)}` : head + square + part(easting) + part(northing);
}

/**
 * Parse an MGRS string. Returns the centre of the referenced square, its size in metres, and its
 * UTM south-west corner, or null when the text is not a valid reference.
 */
export function parseMgrs(text) {
  const compact = String(text).toUpperCase().replace(/[\s.,-]+/g, "");
  const match = compact.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/);
  if (!match) return null;
  const zone = Number(match[1]);
  const band = match[2];
  const digits = match[5];
  if (zone < 1 || zone > 60 || digits.length % 2 !== 0 || digits.length > 10) return null;
  const columnIndex = COLUMNS.indexOf(match[3]) - ((zone - 1) % 3) * 8;
  if (columnIndex < 0 || columnIndex > 7) return null;
  const rowIndex = (ROWS.indexOf(match[4]) - (zone % 2 === 0 ? 5 : 0) + 20) % 20;
  const half = digits.length / 2;
  const size = 10 ** (5 - half);
  const e = (columnIndex + 1) * 100000 + (half ? Number(digits.slice(0, half)) * size : 0);
  const nInSquare = rowIndex * 100000 + (half ? Number(digits.slice(half)) * size : 0);
  const south = band < "N";
  const [bandSouth, bandNorth] = bandLatBounds(band);
  // The row letters repeat every 2,000 km: take the repeat whose latitude falls in the band.
  let best = null;
  for (let k = 0; k < 5; k += 1) {
    const northing = nInSquare + k * 2000000;
    if (northing >= 10000000) break;
    const centre = utmInverse(zone, south, e + size / 2, northing + size / 2);
    const miss = centre.lat < bandSouth ? bandSouth - centre.lat : centre.lat > bandNorth ? centre.lat - bandNorth : 0;
    if (!best || miss < best.miss) best = { miss, northing, centre };
  }
  if (!best || best.miss > 1) return null;
  return { lat: best.centre.lat, lon: best.centre.lon, size, zone, south, band, easting: e, northing: best.northing };
}

function dmsToDecimal(parts) {
  const [d, m = 0, s = 0] = parts.map(Number);
  if (m >= 60 || s >= 60) return NaN;
  return Math.abs(d) + m / 60 + s / 3600;
}

/**
 * Parse "lat, lon" in decimal degrees or degrees-minutes-seconds, with optional N/S/E/W letters.
 * Without letters the order is latitude then longitude. Returns null when the text is not a pair.
 */
export function parseLatLon(text) {
  const source = String(text).trim().toUpperCase();
  if (!source || /[A-MO-RT-VX-Z]/.test(source.replace(/[NSEW]/g, ""))) return null;
  const tokens = [];
  const pattern = /([NSEW])?\s*(-?\d+(?:\.\d+)?)(?:\s*[°D:\s]\s*(\d+(?:\.\d+)?))?(?:\s*['′M:\s]\s*(\d+(?:\.\d+)?))?\s*["″S]?\s*([NSEW])?/g;
  // A cheap first pass for the common decimal pair, which the general pattern would over-read.
  const simple = source.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/);
  if (simple) {
    let lat = Number(simple[1]);
    let lon = Number(simple[3]);
    if (simple[2] === "S") lat = -Math.abs(lat);
    if (simple[4] === "W") lon = -Math.abs(lon);
    return validPair(lat, lon);
  }
  const halves = source.split(/[,;]/);
  const pieces = halves.length === 2 ? halves : source.split(/(?<=[NSEW])\s+|\s+(?=[NSEW]\s*\d)/);
  if (pieces.length !== 2) return null;
  for (const piece of pieces) {
    pattern.lastIndex = 0;
    const m = pattern.exec(piece.trim());
    if (!m || m[0].trim().length !== piece.trim().length) return null;
    const hemisphere = m[1] || m[5] || "";
    const negative = m[2].startsWith("-");
    const value = dmsToDecimal([m[2], m[3], m[4]].filter(v => v !== undefined));
    if (!Number.isFinite(value)) return null;
    tokens.push({ value: negative || hemisphere === "S" || hemisphere === "W" ? -value : value, hemisphere });
  }
  let [first, second] = tokens;
  if ("EW".includes(first.hemisphere || "?") || "NS".includes(second.hemisphere || "?")) [first, second] = [second, first];
  return validPair(first.value, second.value);
}

function validPair(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** "3.6° W" style text for a signed angle measured east-positive. */
export function formatAngleEW(degrees, places = 1) {
  const rounded = Number(Math.abs(degrees).toFixed(places));
  if (rounded === 0) return `${rounded.toFixed(places)}°`;
  return `${rounded.toFixed(places)}° ${degrees >= 0 ? "E" : "W"}`;
}

/** "35.19830° N, 111.65130° W" text for a position. */
export function formatLatLon(lat, lon, places = 5) {
  return `${Math.abs(lat).toFixed(places)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(places)}° ${lon >= 0 ? "E" : "W"}`;
}

/** Radii of curvature at a latitude: prime vertical (east-west) and meridional (north-south). */
export function radiiOfCurvature(lat) {
  const s = Math.sin(lat * RAD);
  const w = 1 - E2 * s * s;
  return { primeVertical: WGS84_A / Math.sqrt(w), meridional: (WGS84_A * (1 - E2)) / (w * Math.sqrt(w)) };
}
