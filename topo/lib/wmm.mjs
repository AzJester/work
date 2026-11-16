// World Magnetic Model declination for Topo Map Builder.
// Coefficients: WMM2025 (NOAA NCEI and the British Geological Survey), public domain, valid 2025.0 to 2030.0.
// The synthesis below is the standard spherical-harmonic evaluation to degree and order 12.

export const WMM = {
  name: "WMM2025",
  epoch: 2025,
  validFrom: 2025,
  validTo: 2030,
  nMax: 12,
  // Index n * (n + 1) / 2 + m. Main field in nT, secular variation in nT per year.
  g: [0, -29351.8, -1410.8, -2556.6, 2951.1, 1649.3, 1361, -2404.1, 1243.8, 453.6, 895, 799.5, 55.7, -281.1, 12.1, -233.2, 368.9, 187.2, -138.7, -142, 20.9, 64.4, 63.8, 76.9, -115.7, -40.9, 14.9, -60.7, 79.5, -77, -8.8, 59.3, 15.8, 2.5, -11.1, 14.2, 23.2, 10.8, -17.5, 2, -21.7, 16.9, 15, -16.8, 0.9, 4.6, 7.8, 3, -0.2, -2.5, -13.1, 2.4, 8.6, -8.7, -12.9, -1.3, -6.4, 0.2, 2, -1, -0.6, -0.9, 1.5, 0.9, -2.7, -3.9, 2.9, -1.5, -2.5, 2.4, -0.6, -0.1, -0.6, -0.1, 1.1, -1, -0.2, 2.6, -2, -0.2, 0.3, 1.2, -1.3, 0.6, 0.6, 0.5, -0.1, -0.4, -0.2, -1.3, -0.7],
  h: [0, 0, 4545.4, 0, -3133.6, -815.1, 0, -56.6, 237.5, -549.5, 0, 278.6, -133.9, 212, -375.6, 0, 45.4, 220.2, -122.9, 43, 106.1, 0, -18.4, 16.8, 48.8, -59.8, 10.9, 72.7, 0, -48.9, -14.4, -1, 23.4, -7.4, -25.1, -2.3, 0, 7.1, -12.6, 11.4, -9.7, 12.7, 0.7, -5.2, 3.9, 0, -24.8, 12.2, 8.3, -3.3, -5.2, 7.2, -0.6, 0.8, 10, 0, 3.3, 0, 2.4, 5.3, -9.1, 0.4, -4.2, -3.8, 0.9, -9.1, 0, 0, 2.9, -0.6, 0.2, 0.5, -0.3, -1.2, -1.7, -2.9, -1.8, -2.3, 0, -1.3, 0.7, 1, -1.4, 0, 0.6, -0.1, 0.8, 0.1, -1, 0.1, 0.2],
  gDot: [0, 12, 9.7, -11.6, -5.2, -8, -1.3, -4.2, 0.4, -15.6, -1.6, -2.4, -6, 5.6, -7, 0.6, 1.4, 0, 0.6, 2.2, 0.9, -0.2, -0.4, 0.9, 1.2, -0.9, 0.3, 0.9, 0, -0.1, -0.1, 0.5, -0.1, -0.8, -0.8, 0.8, -0.1, 0.2, 0, 0.5, -0.1, 0.3, 0.2, 0, 0.2, 0, -0.1, 0.1, 0.3, -0.3, 0, 0.3, -0.1, 0.1, -0.1, 0.1, 0, 0.1, 0.1, 0, -0.3, 0, -0.1, -0.1, 0, 0, 0, 0, 0, 0, 0, -0.1, 0, 0, -0.1, -0.1, -0.1, -0.1, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, -0.1, 0, -0.1],
  hDot: [0, 0, -21.5, 0, -27.7, -12.1, 0, 4, -0.3, -4.1, 0, -1.1, 4.1, 1.6, -4.4, 0, -0.5, 2.2, 0.4, 1.7, 1.9, 0, 0.3, -1.6, -0.4, 0.9, 0.7, 0.9, 0, 0.6, 0.5, -0.8, 0, -1, 0.6, -0.2, 0, -0.2, 0.5, -0.4, 0.4, -0.5, -0.6, 0.3, 0.2, 0, -0.3, 0.3, -0.3, 0.3, 0.2, -0.1, -0.2, 0.4, 0.1, 0, 0, 0, -0.2, 0.1, -0.1, 0.1, 0, -0.1, 0.2, 0, 0, 0, 0.1, 0, 0.1, 0, 0, 0.1, 0, 0, 0, 0, 0, 0, 0, -0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, -0.1],
};

const RAD = Math.PI / 180;
const EARTH_A = 6378.137;
const EARTH_B = 6356.7523142;
const EARTH_REFERENCE_RADIUS = 6371.2;

/** Decimal year for a Date, for example 2026.87. */
export function decimalYear(date = new Date()) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

/**
 * Magnetic field at a position. Returns declination in degrees (east positive: the bearing of
 * magnetic north measured from true north), inclination, and the north, east and down components in nT.
 * Years outside the model's validity are clamped, with `extrapolated` set so callers can say so.
 */
export function magneticField(lat, lon, altitudeKm = 0, year = decimalYear()) {
  const clampedYear = Math.min(WMM.validTo, Math.max(WMM.validFrom, year));
  const dt = clampedYear - WMM.epoch;
  const nMax = WMM.nMax;

  // Geodetic to geocentric spherical coordinates.
  const phi = Math.max(-89.9999, Math.min(89.9999, lat)) * RAD;
  const lambda = lon * RAD;
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const e2 = 1 - (EARTH_B * EARTH_B) / (EARTH_A * EARTH_A);
  const rc = EARTH_A / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const xp = (rc + altitudeKm) * cosPhi;
  const zp = (rc * (1 - e2) + altitudeKm) * sinPhi;
  const r = Math.hypot(xp, zp);
  const phiC = Math.asin(zp / r);
  const cosTheta = Math.sin(phiC), sinTheta = Math.cos(phiC);

  // Gauss-normalised associated Legendre functions and their colatitude derivatives,
  // with the Schmidt quasi-normalisation factors applied to the coefficients.
  const size = ((nMax + 1) * (nMax + 2)) / 2;
  const P = new Float64Array(size), dP = new Float64Array(size), S = new Float64Array(size);
  const index = (n, m) => (n * (n + 1)) / 2 + m;
  P[0] = 1;
  S[0] = 1;
  for (let n = 1; n <= nMax; n += 1) {
    for (let m = 0; m <= n; m += 1) {
      const i = index(n, m);
      if (n === m) {
        const prev = index(n - 1, m - 1);
        P[i] = sinTheta * P[prev];
        dP[i] = sinTheta * dP[prev] + cosTheta * P[prev];
      } else {
        const a = index(n - 1, m);
        const k = n === 1 ? 0 : ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
        const b = n >= 2 && m <= n - 2 ? index(n - 2, m) : -1;
        P[i] = cosTheta * P[a] - (b >= 0 ? k * P[b] : 0);
        dP[i] = cosTheta * dP[a] - sinTheta * P[a] - (b >= 0 ? k * dP[b] : 0);
      }
      if (m === 0) S[i] = (S[index(n - 1, 0)] * (2 * n - 1)) / n;
      else S[i] = S[index(n, m - 1)] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }

  let br = 0, bTheta = 0, bPhi = 0;
  const ratio = EARTH_REFERENCE_RADIUS / r;
  let power = ratio * ratio;
  for (let n = 1; n <= nMax; n += 1) {
    power *= ratio;
    for (let m = 0; m <= n; m += 1) {
      const i = index(n, m);
      const g = (WMM.g[i] + dt * WMM.gDot[i]) * S[i];
      const h = (WMM.h[i] + dt * WMM.hDot[i]) * S[i];
      const cosM = Math.cos(m * lambda), sinM = Math.sin(m * lambda);
      const term = g * cosM + h * sinM;
      br += power * (n + 1) * term * P[i];
      bTheta -= power * term * dP[i];
      bPhi += (power * m * (g * sinM - h * cosM) * P[i]) / sinTheta;
    }
  }

  // Geocentric north, east, down, then rotate into the geodetic frame.
  const northC = -bTheta, east = bPhi, downC = -br;
  const psi = phiC - phi;
  const north = northC * Math.cos(psi) - downC * Math.sin(psi);
  const down = northC * Math.sin(psi) + downC * Math.cos(psi);
  return {
    declination: Math.atan2(east, north) / RAD,
    inclination: Math.atan2(down, Math.hypot(north, east)) / RAD,
    north,
    east,
    down,
    year: clampedYear,
    extrapolated: clampedYear !== year,
  };
}

/** Magnetic declination in degrees, east positive. */
export function declination(lat, lon, year = decimalYear(), altitudeKm = 0) {
  return magneticField(lat, lon, altitudeKm, year).declination;
}
