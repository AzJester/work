// Grid and projection shared by the page, the build and the tests.
// The map lives on one grid in Albers Equal Area Conic (EPSG:5070). World units are 5 km: x east, z south, y up.
export const GRID = { w: 2048, h: 1344, px: 2500, xc: -50000, yc: 1722000, hi: 2, lo: 0.5 };
export const WORLD = { w: 1024, h: 672, unit: 5000 };
export const OCEAN_FLAG = -400; // stored heights below this are sea floor: depth = -(v + 500)

const A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F), E = Math.sqrt(E2), RAD = Math.PI / 180;
const m = (phi) => Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
const q = (phi) => {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
};
const LAT1 = 29.5 * RAD, LAT2 = 45.5 * RAD, LAT0 = 23 * RAD, LON0 = -96 * RAD;
const N = (m(LAT1) ** 2 - m(LAT2) ** 2) / (q(LAT2) - q(LAT1));
const C = m(LAT1) ** 2 + N * q(LAT1);
const RHO0 = A * Math.sqrt(C - N * q(LAT0)) / N;

/** Longitude and latitude in degrees to EPSG:5070 metres. */
export function project(lon, lat) {
  const rho = A * Math.sqrt(Math.max(C - N * q(lat * RAD), 0)) / N, th = N * (lon * RAD - LON0);
  return [rho * Math.sin(th), RHO0 - rho * Math.cos(th)];
}

/** EPSG:5070 metres to longitude and latitude in degrees. */
export function unproject(x, y) {
  const rho = Math.hypot(x, RHO0 - y), th = Math.atan2(x, RHO0 - y);
  const qq = (C - (rho * N / A) ** 2) / N;
  let phi = Math.asin(Math.max(-1, Math.min(1, qq / 2)));
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(phi);
    phi += (1 - E2 * s * s) ** 2 / (2 * Math.cos(phi)) * (qq / (1 - E2) - s / (1 - E2 * s * s) + (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
  }
  return [(LON0 + th / N) / RAD, phi / RAD];
}

export function lonLatToWorld(lon, lat) {
  const [x, y] = project(lon, lat);
  return [(x - GRID.xc) / WORLD.unit, (GRID.yc - y) / WORLD.unit];
}

export function worldToLonLat(wx, wz) {
  return unproject(GRID.xc + wx * WORLD.unit, GRID.yc - wz * WORLD.unit);
}

/** World position to texture coordinates: u east, v south, both 0..1 across the grid. */
export function worldToUv(wx, wz) {
  return [wx / WORLD.w + 0.5, wz / WORLD.h + 0.5];
}
