// MGRS grid overlay for Topo Map Builder: grid lines and labels as GeoJSON for the area in view.
// Lines are built per grid zone cell (UTM zone x latitude band) and clipped to it, which is what
// makes the grid break correctly at zone edges and over Norway and Svalbard.

import { bandLatBounds, square100k, utmForward, utmInverse, zoneLonBounds } from "./geo.mjs?v=1.0.0";

const BANDS = "CDEFGHJKLMNPQRSTUVWX";
const MAX_LINES_PER_CELL = 420;

/** Grid spacing in metres for a map zoom. 0 means only the grid zone boundaries are drawn. */
export function gridInterval(zoom) {
  if (zoom >= 15.5) return 100;
  if (zoom >= 10.5) return 1000;
  if (zoom >= 7.5) return 10000;
  if (zoom >= 4.5) return 100000;
  return 0;
}

/** The digits printed against a grid line at a spacing: two principal digits at 1 km. */
export function gridLabel(value, interval) {
  if (interval === 100) return String(Math.floor(value / 100) % 1000).padStart(3, "0");
  if (interval === 1000) return String(Math.floor(value / 1000) % 100).padStart(2, "0");
  if (interval === 10000) return String(Math.floor(value / 10000) % 10);
  return "";
}

function clipSegment(a, b, rect) {
  // Liang-Barsky clip of one segment to an axis-aligned box.
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const checks = [
    [-dx, a[0] - rect.west], [dx, rect.east - a[0]],
    [-dy, a[1] - rect.south], [dy, rect.north - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

/** Clip a polyline to a lon/lat box, returning the pieces that survive. */
export function clipPolyline(points, rect) {
  const pieces = [];
  let current = null;
  for (let i = 1; i < points.length; i += 1) {
    const clipped = clipSegment(points[i - 1], points[i], rect);
    if (!clipped) { current = null; continue; }
    const [start, end] = clipped;
    if (current && current[current.length - 1][0] === start[0] && current[current.length - 1][1] === start[1]) {
      current.push(end);
    } else {
      current = [start, end];
      pieces.push(current);
    }
  }
  return pieces.filter(piece => piece.length > 1 && (piece[0][0] !== piece[piece.length - 1][0] || piece[0][1] !== piece[piece.length - 1][1]));
}

function line(coordinates, properties) {
  return { type: "Feature", properties, geometry: { type: "LineString", coordinates } };
}

function point(coordinates, properties) {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

/** Grid zone cells (zone, band, lon/lat limits) that intersect a view. Longitudes may be unwrapped. */
export function cellsInView(view) {
  const cells = [];
  const south = Math.max(-80, view.south), north = Math.min(84, view.north);
  if (north <= south) return cells;
  const wholeWorld = view.east - view.west >= 360;
  for (let b = Math.max(0, Math.floor((south + 80) / 8)); b < 20; b += 1) {
    const band = BANDS[b];
    const [bandSouth, bandNorth] = bandLatBounds(band);
    if (bandSouth >= north) break;
    if (bandNorth <= south) continue;
    for (let zone = 1; zone <= 60; zone += 1) {
      const limits = zoneLonBounds(zone, (bandSouth + bandNorth) / 2);
      if (!limits) continue;
      for (const shift of wholeWorld ? [0] : [-360, 0, 360]) {
        const west = limits[0] + shift, east = limits[1] + shift;
        if (!wholeWorld && (east <= view.west || west >= view.east)) continue;
        cells.push({ zone, band, south: band < "N", shift, west, east, bandSouth, bandNorth });
      }
    }
  }
  return cells;
}

/**
 * Build the grid for a view: { west, south, east, north, zoom }. Returns arrays of GeoJSON features:
 * `lines` (kind "e", "n" or "zone"; level 1 marks every tenth line) and `labels` (kind "sq" for
 * 100 km square identifiers, "gzd" for grid zone designators).
 */
export function buildGrid(view, interval = gridInterval(view.zoom)) {
  const lines = [], labels = [];
  for (const cell of cellsInView(view)) {
    const rect = {
      west: Math.max(cell.west, view.west), east: Math.min(cell.east, view.east),
      south: Math.max(cell.bandSouth, view.south), north: Math.min(cell.bandNorth, view.north),
    };
    if (rect.east <= rect.west || rect.north <= rect.south) continue;

    // Cell boundaries: the west edge and the south edge, so shared edges are drawn once.
    if (cell.west >= view.west && cell.west <= view.east) {
      lines.push(line([[cell.west, rect.south], [cell.west, rect.north]], { kind: "zone", level: 2, label: "" }));
    }
    if (cell.bandSouth >= view.south && cell.bandSouth <= view.north) {
      lines.push(line([[rect.west, cell.bandSouth], [rect.east, cell.bandSouth]], { kind: "zone", level: 2, label: "" }));
    }
    if (!interval) {
      const lon = (cell.west + cell.east) / 2, lat = (cell.bandSouth + cell.bandNorth) / 2;
      if (lon > view.west && lon < view.east && lat > view.south && lat < view.north) {
        labels.push(point([lon, lat], { kind: "gzd", label: `${cell.zone}${cell.band}` }));
      }
      continue;
    }

    let eMin = Infinity, eMax = -Infinity, nMin = Infinity, nMax = -Infinity;
    for (let i = 0; i <= 4; i += 1) {
      for (let j = 0; j <= 4; j += 1) {
        const lon = rect.west + ((rect.east - rect.west) * i) / 4 - cell.shift;
        const lat = rect.south + ((rect.north - rect.south) * j) / 4;
        const utm = utmForward(lat, lon, cell.zone, cell.south);
        eMin = Math.min(eMin, utm.easting); eMax = Math.max(eMax, utm.easting);
        nMin = Math.min(nMin, utm.northing); nMax = Math.max(nMax, utm.northing);
      }
    }

    let step = interval;
    while ((eMax - eMin) / step + (nMax - nMin) / step > MAX_LINES_PER_CELL) step *= 10;
    const toLonLat = (e, n) => {
      const p = utmInverse(cell.zone, cell.south, e, n);
      // Keep the longitude on the same side of the antimeridian as the cell.
      let lon = p.lon + cell.shift;
      const mid = (cell.west + cell.east) / 2;
      if (lon - mid > 180) lon -= 360;
      else if (lon - mid < -180) lon += 360;
      return [lon, p.lat];
    };
    const sampleStep = span => step * Math.max(1, Math.ceil(span / step / 24));
    const nStep = sampleStep(nMax - nMin), eStep = sampleStep(eMax - eMin);
    const nLo = Math.floor(nMin / nStep) * nStep - nStep, nHi = Math.ceil(nMax / nStep) * nStep + nStep;
    const eLo = Math.floor(eMin / eStep) * eStep - eStep, eHi = Math.ceil(eMax / eStep) * eStep + eStep;

    for (let e = Math.ceil(eMin / step) * step; e <= eMax; e += step) {
      const points = [];
      for (let n = nLo; n <= nHi; n += nStep) points.push(toLonLat(e, n));
      const properties = { kind: "e", value: e, level: e % (step * 10) === 0 ? 1 : 0, label: gridLabel(e, step) };
      for (const piece of clipPolyline(points, rect)) lines.push(line(piece, properties));
    }
    for (let n = Math.ceil(nMin / step) * step; n <= nMax; n += step) {
      const points = [];
      for (let e = eLo; e <= eHi; e += eStep) points.push(toLonLat(e, n));
      const properties = { kind: "n", value: n, level: n % (step * 10) === 0 ? 1 : 0, label: gridLabel(n, step) };
      for (const piece of clipPolyline(points, rect)) lines.push(line(piece, properties));
    }

    if (step >= 10000) {
      for (let e = Math.floor(eMin / 100000) * 100000; e <= eMax; e += 100000) {
        for (let n = Math.floor(nMin / 100000) * 100000; n <= nMax; n += 100000) {
          const centre = toLonLat(e + 50000, n + 50000);
          if (centre[0] <= rect.west || centre[0] >= rect.east || centre[1] <= rect.south || centre[1] >= rect.north) continue;
          const square = square100k(cell.zone, e + 50000, n + 50000);
          if (square) labels.push(point(centre, { kind: "sq", label: `${cell.zone}${cell.band} ${square}` }));
        }
      }
    }
  }
  return { lines, labels };
}
