// Print-page geometry for Topo Map Builder. A page is a rectangle on the UTM grid, stored by its
// south-west corner, so its edges run along grid lines and neighbouring pages butt together exactly.

import { mgrsFromUtm, radiiOfCurvature, utmForward, utmInverse, utmZone } from "./geo.mjs?v=1.0.0";

/** US Letter, in millimetres. */
export const PAPER_MM = { w: 215.9, h: 279.4 };
/** The map frame on the sheet: 200 x 240 mm, so 1:25,000 covers 5 x 6 km and 1:50,000 covers 10 x 12 km. */
export const FRAME_MM = { short: 200, long: 240 };
/** Pages move in steps of this many metres. */
export const MOVE_STEP_M = 1000;

/**
 * Print scales. `contourM` and `contourFt` are the fine ("Full") contour interval for the scale;
 * "Sparse" doubles it, which suits steep ground.
 */
export const SCALES = [
  { value: 25000, label: "1:25k", contourM: 10, contourFt: 20 },
  { value: 50000, label: "1:50k", contourM: 20, contourFt: 40 },
  { value: 24000, label: "1:24k", contourM: 10, contourFt: 20 },
  { value: 48000, label: "1:48k", contourM: 20, contourFt: 40 },
  { value: 15000, label: "1:15k", contourM: 5, contourFt: 10 },
];

export function isScale(value) {
  return SCALES.some(scale => scale.value === value);
}

export function frameSizeMm(orient) {
  return orient === "l" ? { w: FRAME_MM.long, h: FRAME_MM.short } : { w: FRAME_MM.short, h: FRAME_MM.long };
}

export function paperSizeMm(orient) {
  return orient === "l" ? { w: PAPER_MM.h, h: PAPER_MM.w } : { w: PAPER_MM.w, h: PAPER_MM.h };
}

/** Ground covered by one page, in grid metres. */
export function pageGroundSize(scale, orient) {
  const frame = frameSizeMm(orient);
  return { w: (frame.w * scale) / 1000, h: (frame.h * scale) / 1000 };
}

/** "5 x 6 km" style text for the ground one page covers. */
export function pageGroundText(scale, orient) {
  const size = pageGroundSize(scale, orient);
  const km = value => String(Number((value / 1000).toFixed(2)));
  return `${km(size.w)} × ${km(size.h)} km`;
}

/** The page of the fixed lattice that contains a position. */
export function pageAt(lat, lon, scale, orient) {
  const zone = utmZone(lat, lon);
  const south = lat < 0;
  const utm = utmForward(lat, lon, zone, south);
  const size = pageGroundSize(scale, orient);
  return { zone, south, e: Math.floor(utm.easting / size.w) * size.w, n: Math.floor(utm.northing / size.h) * size.h };
}

export function pageKey(page) {
  return `${page.zone}${page.south ? "S" : "N"}.${Math.round(page.e)}.${Math.round(page.n)}`;
}

export function samePage(a, b) {
  return pageKey(a) === pageKey(b);
}

export function pageCentre(page, size) {
  return utmInverse(page.zone, page.south, page.e + size.w / 2, page.n + size.h / 2);
}

/** Closed lon/lat ring of the page outline, south-west corner first, counter-clockwise. */
export function pageRing(page, size) {
  const corner = (de, dn) => {
    const p = utmInverse(page.zone, page.south, page.e + de, page.n + dn);
    return [p.lon, p.lat];
  };
  const sw = corner(0, 0);
  return [sw, corner(size.w, 0), corner(size.w, size.h), corner(0, size.h), sw];
}

/** Whether a position falls inside a page. */
export function pageContains(page, size, lat, lon) {
  const utm = utmForward(lat, lon, page.zone, page.south);
  return utm.easting >= page.e && utm.easting < page.e + size.w && utm.northing >= page.n && utm.northing < page.n + size.h;
}

/** Sheet name: the MGRS reference of the page centre to the nearest kilometre. */
export function pageName(page, size) {
  return mgrsFromUtm(page.zone, page.south, page.e + size.w / 2, page.n + size.h / 2, 2)
    || `Zone ${page.zone}${page.south ? "S" : "N"}`;
}

export function movePage(page, de, dn) {
  return { ...page, e: page.e + de, n: page.n + dn };
}

/** Round a dragged offset to whole move steps. */
export function snapOffset(metres, step = MOVE_STEP_M) {
  return Math.round(metres / step) * step;
}

/**
 * Pull a page onto the edges of nearby pages in the same zone when it is within `tolerance` metres
 * of butting against or lining up with one.
 */
export function snapToNeighbours(page, others, size, tolerance = 450) {
  let e = page.e, n = page.n;
  let bestE = tolerance, bestN = tolerance;
  for (const other of others) {
    if (other.zone !== page.zone || other.south !== page.south || samePage(other, page)) continue;
    if (Math.abs(other.n - page.n) < size.h + tolerance) {
      for (const candidate of [other.e - size.w, other.e, other.e + size.w]) {
        const miss = Math.abs(candidate - page.e);
        if (miss <= bestE) { bestE = miss; e = candidate; }
      }
    }
    if (Math.abs(other.e - page.e) < size.w + tolerance) {
      for (const candidate of [other.n - size.h, other.n, other.n + size.h]) {
        const miss = Math.abs(candidate - page.n);
        if (miss <= bestN) { bestN = miss; n = candidate; }
      }
    }
  }
  return { ...page, e, n };
}

/** Lattice pages touched by a lon/lat box, row by row from the north-west. */
export function pagesInBounds(bounds, scale, orient, limit = 48) {
  const { west, south, east, north } = bounds;
  const midLat = (south + north) / 2, midLon = (west + east) / 2;
  const zone = utmZone(midLat, midLon);
  const isSouth = midLat < 0;
  const size = pageGroundSize(scale, orient);
  let eMin = Infinity, eMax = -Infinity, nMin = Infinity, nMax = -Infinity;
  for (const lat of [south, midLat, north]) {
    for (const lon of [west, midLon, east]) {
      const utm = utmForward(lat, lon, zone, isSouth);
      eMin = Math.min(eMin, utm.easting); eMax = Math.max(eMax, utm.easting);
      nMin = Math.min(nMin, utm.northing); nMax = Math.max(nMax, utm.northing);
    }
  }
  const pages = [];
  const e0 = Math.floor(eMin / size.w) * size.w, n0 = Math.floor(nMin / size.h) * size.h;
  let truncated = false;
  for (let n = Math.floor(nMax / size.h) * size.h; n >= n0 && !truncated; n -= size.h) {
    for (let e = e0; e <= eMax; e += size.w) {
      if (pages.length >= limit) { truncated = true; break; }
      pages.push({ zone, south: isSouth, e, n });
    }
  }
  return { pages, truncated };
}

/** Re-cut a page for a new scale or orientation, keeping its centre as close as the move step allows. */
export function resizePage(page, oldSize, newSize) {
  const centreE = page.e + oldSize.w / 2, centreN = page.n + oldSize.h / 2;
  return {
    ...page,
    e: snapOffset(centreE - newSize.w / 2),
    n: snapOffset(centreN - newSize.h / 2),
  };
}

/** Lon/lat box around a set of pages. */
export function pagesBounds(pages, size) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const page of pages) {
    for (const [lon, lat] of pageRing(page, size)) {
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
    }
  }
  return pages.length ? { west, south, east, north } : null;
}

/**
 * The map view that draws one page to scale. Web Mercator is rotated so grid north is up and zoomed
 * so the frame width spans the page's grid width. Web Mercator stretches north-south distances
 * slightly relative to east-west on the ellipsoid, so the view is rendered `stretch` times taller
 * and squeezed back when it is placed in the frame.
 */
export function printView(page, scale, orient, cssPerMm) {
  const size = pageGroundSize(scale, orient);
  const frame = frameSizeMm(orient);
  const centre = pageCentre(page, size);
  const utm = utmForward(centre.lat, centre.lon, page.zone, page.south);
  const radii = radiiOfCurvature(centre.lat);
  const cssWidth = frame.w * cssPerMm;
  const worldPx = (cssWidth / size.w) * 2 * Math.PI * radii.primeVertical * Math.cos((centre.lat * Math.PI) / 180) * utm.scale;
  const stretch = radii.primeVertical / radii.meridional;
  return {
    centre,
    bearing: utm.convergence,
    zoom: Math.log2(worldPx / 512),
    cssWidth,
    cssHeight: frame.h * cssPerMm * stretch,
    stretch,
    convergence: utm.convergence,
    gridScale: utm.scale,
    size,
    frame,
  };
}
