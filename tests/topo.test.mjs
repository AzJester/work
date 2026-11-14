import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatAngleEW, latBand, parseLatLon, parseMgrs, radiiOfCurvature, square100k, toMgrs,
  utmForward, utmInverse, utmZone, zoneLonBounds,
} from "../topo/lib/geo.mjs";
import { buildGrid, cellsInView, clipPolyline, gridInterval, gridLabel } from "../topo/lib/grid.mjs";
import {
  frameSizeMm, pageAt, pageContains, pageGroundSize, pageGroundText, pageName, pageRing, pagesInBounds,
  printView, resizePage, snapOffset, snapToNeighbours,
} from "../topo/lib/pages.mjs";
import { declination, decimalYear, magneticField, WMM } from "../topo/lib/wmm.mjs";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { frameOrigin, northReference, scaleBar } from "../topo/lib/export-pdf.mjs";
import {
  ATAK_MAX_TILES, bestGarminZoom, garminKml, latToWorld, lonToWorld, normaliseRegion, planGarmin, planMbtiles,
  regionName, tileRange, worldToLat, worldToLon,
} from "../topo/lib/export-tiles.mjs";
import {
  DEFAULT_OPTIONS, LAYER_TOGGLES, buildStyle, contourThresholds, normaliseOptions, printContourInterval,
} from "../topo/lib/style.mjs";
import { SCALES } from "../topo/lib/pages.mjs";
import { crc32, zipStore } from "../topo/lib/zip.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test("UTM zones follow the Norway and Svalbard exceptions", () => {
  assert.equal(utmZone(35.2, -111.65), 12);
  assert.equal(utmZone(0, -180), 1);
  assert.equal(utmZone(0, 179.99), 60);
  assert.equal(utmZone(60.5, 5.5), 32, "south-west Norway is moved into zone 32");
  assert.equal(utmZone(55.9, 5.5), 31);
  assert.equal(utmZone(78.2, 15.6), 33, "Svalbard uses zones 31, 33, 35 and 37");
  assert.equal(utmZone(78.2, 8.9), 31);
  assert.equal(utmZone(78.2, 34), 37);
  assert.deepEqual(zoneLonBounds(32, 60), [3, 12]);
  assert.deepEqual(zoneLonBounds(31, 60), [0, 3]);
  assert.equal(zoneLonBounds(32, 78), null);
  assert.deepEqual(zoneLonBounds(33, 78), [9, 21]);
  assert.deepEqual(zoneLonBounds(12, 35), [-114, -108]);
});

test("UTM conversion matches published reference points and round-trips", () => {
  // Central meridian on the equator is the grid origin.
  const origin = utmForward(0, -111, 12);
  assert.ok(Math.abs(origin.easting - 500000) < 1e-6);
  assert.ok(Math.abs(origin.northing) < 1e-6);
  assert.ok(Math.abs(origin.scale - 0.9996) < 1e-9);
  assert.ok(Math.abs(origin.convergence) < 1e-12);

  // Reference values computed with GeographicLib-grade Krueger series, cross-checked against proj4's MGRS library.
  const flagstaff = utmForward(35.1983, -111.6513);
  assert.equal(flagstaff.zone, 12);
  assert.ok(Math.abs(flagstaff.easting - 440711.102) < 0.01, `easting ${flagstaff.easting}`);
  assert.ok(Math.abs(flagstaff.northing - 3895228.383) < 0.01, `northing ${flagstaff.northing}`);

  const sydney = utmForward(-33.8568, 151.2153);
  assert.equal(sydney.zone, 56);
  assert.equal(sydney.south, true);
  assert.ok(sydney.northing > 6_000_000 && sydney.northing < 6_300_000);

  const next = random(7);
  for (let i = 0; i < 4000; i += 1) {
    const lat = -79.9 + next() * 163.8, lon = -180 + next() * 360;
    const utm = utmForward(lat, lon);
    const back = utmInverse(utm.zone, utm.south, utm.easting, utm.northing);
    assert.ok(Math.abs(back.lat - lat) < 1e-9 && Math.abs(back.lon - lon) < 1e-8, `round trip at ${lat}, ${lon}`);
  }
});

test("grid convergence and scale agree with a numerical derivative of the projection", () => {
  for (const [lat, lon, zone] of [[47.3, 9.9, 32], [35.2, -113.5, 12], [-41, 174.9, 60], [62, 27.5, 35]]) {
    const here = utmForward(lat, lon, zone);
    const step = 1e-6;
    const north = utmForward(lat + step, lon, zone);
    // True north in grid coordinates sits at minus the convergence.
    const measured = -Math.atan2(north.easting - here.easting, north.northing - here.northing) * 180 / Math.PI;
    assert.ok(Math.abs(measured - here.convergence) < 1e-5, `convergence at ${lat}, ${lon}`);
    const metres = radiiOfCurvature(lat).meridional * step * Math.PI / 180;
    const scale = Math.hypot(north.easting - here.easting, north.northing - here.northing) / metres;
    assert.ok(Math.abs(scale - here.scale) < 1e-7, `scale at ${lat}, ${lon}`);
  }
  assert.ok(utmForward(35.2, -111.65).convergence < 0, "west of the central meridian, grid north is west of true north");
  assert.ok(utmForward(35.2, -110.2).convergence > 0);
  assert.equal(formatAngleEW(-0.375), "0.4° W");
  assert.equal(formatAngleEW(9.75), "9.8° E");
  assert.equal(formatAngleEW(0.01), "0.0°");
});

test("MGRS strings use the standard lettering and truncate rather than round", () => {
  assert.equal(toMgrs(35.1983, -111.6513), "12S VD 40711 95228");
  assert.equal(toMgrs(35.1983, -111.6513, 2), "12S VD 40 95");
  assert.equal(toMgrs(35.1983, -111.6513, 0), "12S VD");
  assert.equal(toMgrs(35.1983, -111.6513, 5, false), "12SVD4071195228");
  assert.equal(toMgrs(-33.8568, 151.2153), "56H LH 34900 52288");
  assert.equal(toMgrs(60.5, 5.5), "32V LN 07793 12209");
  assert.equal(toMgrs(78.2, 15.6), "33X WG 13696 80760");
  assert.equal(toMgrs(0.0001, 0.0001), "31N AA 66032 00011");
  assert.equal(toMgrs(-0.0001, -0.0001), "30M ZE 33967 99988");
  assert.equal(toMgrs(85, 0), "", "the poles use UPS, which this tool does not cover");
  assert.equal(latBand(-80), "C");
  assert.equal(latBand(83.9), "X");
  assert.equal(square100k(18, 323478, 4306483), "UJ");
});

test("MGRS references parse back to the square they name", () => {
  const next = random(11);
  for (let i = 0; i < 3000; i += 1) {
    const lat = -79.5 + next() * 163, lon = -180 + next() * 360;
    for (const digits of [5, 3, 1]) {
      const parsed = parseMgrs(toMgrs(lat, lon, digits));
      assert.ok(parsed, `parse ${toMgrs(lat, lon, digits)}`);
      assert.equal(parsed.size, 10 ** (5 - digits));
      const metresPerDegree = 111320;
      const miss = Math.hypot((parsed.lat - lat) * metresPerDegree, (parsed.lon - lon) * metresPerDegree * Math.cos(lat * Math.PI / 180));
      assert.ok(miss <= parsed.size * 0.75 + 1, `${toMgrs(lat, lon, digits)} is ${miss.toFixed(1)} m from its source`);
    }
  }
  const square = parseMgrs("12s vd 40 95");
  assert.equal(square.size, 1000);
  assert.ok(Math.abs(square.lat - 35.1983) < 0.01 && Math.abs(square.lon + 111.6513) < 0.01);
  assert.equal(parseMgrs("12SVD4071195228").size, 1);
  for (const invalid of ["", "Flagstaff", "86004", "12S", "12S VD 407 95", "61S VD 40 95", "12I VD 40 95", "12S ID 40 95", "12S VD 4 5 6"]) {
    assert.equal(parseMgrs(invalid), null, `"${invalid}" is not an MGRS reference`);
  }
});

test("latitude and longitude text is parsed in decimal and degree-minute-second forms", () => {
  assert.deepEqual(parseLatLon("35.1983, -111.6513"), { lat: 35.1983, lon: -111.6513 });
  assert.deepEqual(parseLatLon("35.1983 N 111.6513 W"), { lat: 35.1983, lon: -111.6513 });
  assert.deepEqual(parseLatLon("111.6513W, 35.1983N"), { lat: 35.1983, lon: -111.6513 });
  assert.deepEqual(parseLatLon("-33.8568 151.2153"), { lat: -33.8568, lon: 151.2153 });
  const dms = parseLatLon("35°11'54\"N 111°39'05\"W");
  assert.ok(Math.abs(dms.lat - 35.198333) < 1e-5 && Math.abs(dms.lon + 111.651389) < 1e-5);
  const dm = parseLatLon("N35 11.9 W111 39.08");
  assert.ok(Math.abs(dm.lat - 35.198333) < 1e-5 && Math.abs(dm.lon + 111.651333) < 1e-5);
  for (const invalid of ["Flagstaff", "86004", "95, 10", "35.2", "12S VD 40 95", "35.2, 200"]) {
    assert.equal(parseLatLon(invalid), null, `"${invalid}" is not a coordinate pair`);
  }
});

test("magnetic declination reproduces the published WMM2025 test values", () => {
  // NOAA NCEI WMM2025 test values at sea level, epoch 2025.0.
  assert.ok(Math.abs(declination(80, 0, 2025) - 1.28) < 0.01);
  assert.ok(Math.abs(declination(0, 120, 2025) - -0.16) < 0.01);
  assert.ok(Math.abs(declination(-80, 240, 2025) - 68.78) < 0.01);
  // Secular change is applied: Flagstaff's easterly declination shrinks through the model period.
  assert.ok(declination(35.1983, -111.6513, 2025) > declination(35.1983, -111.6513, 2029));
  assert.ok(Math.abs(declination(35.1983, -111.6513, 2026.87) - 9.75) < 0.02);
  assert.equal(magneticField(35, -111, 0, 2040).extrapolated, true);
  assert.equal(magneticField(35, -111, 0, 2040).year, WMM.validTo);
  assert.equal(WMM.g.length, 91);
  assert.equal(WMM.h.length, 91);
  const year = decimalYear(new Date(Date.UTC(2026, 6, 2, 12)));
  assert.ok(Math.abs(year - 2026.5) < 0.001);
});

test("pages sit on the UTM grid and tile without gaps", () => {
  assert.deepEqual(frameSizeMm("p"), { w: 200, h: 240 });
  assert.deepEqual(frameSizeMm("l"), { w: 240, h: 200 });
  assert.deepEqual(pageGroundSize(25000, "p"), { w: 5000, h: 6000 });
  assert.deepEqual(pageGroundSize(50000, "l"), { w: 12000, h: 10000 });
  assert.equal(pageGroundText(25000, "p"), "5 × 6 km");
  assert.equal(pageGroundText(24000, "p"), "4.8 × 5.76 km");

  const size = pageGroundSize(25000, "p");
  const page = pageAt(35.1983, -111.6513, 25000, "p");
  assert.deepEqual(page, { zone: 12, south: false, e: 440000, n: 3894000 });
  assert.ok(pageContains(page, size, 35.1983, -111.6513));
  assert.equal(pageName(page, size), "12S VD 42 97");
  const ring = pageRing(page, size);
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4]);

  const east = pageAt(35.1983, -111.59, 25000, "p");
  assert.equal(east.e, page.e + size.w, "the next lattice page starts where this one ends");

  const area = pagesInBounds({ west: -111.70, south: 35.15, east: -111.58, north: 35.25 }, 25000, "p");
  assert.equal(area.truncated, false);
  assert.ok(area.pages.length >= 4 && area.pages.length <= 9, `picked ${area.pages.length} pages`);
  assert.ok(area.pages.some(candidate => candidate.e === page.e && candidate.n === page.n));
  assert.equal(pagesInBounds({ west: -113, south: 34, east: -110, north: 36 }, 25000, "p", 12).truncated, true);
});

test("dragged pages move in kilometre steps and snap to their neighbours", () => {
  assert.equal(snapOffset(1499), 1000);
  assert.equal(snapOffset(-1501), -2000);
  const size = pageGroundSize(24000, "p");
  const anchor = { zone: 12, south: false, e: 440000, n: 3894000 };
  // A 4.8 km page dropped 300 m short of butting against its neighbour is pulled onto the shared edge.
  const loose = { zone: 12, south: false, e: 440000 + size.w + 300, n: 3894000 - 200 };
  assert.deepEqual(snapToNeighbours(loose, [anchor], size), { zone: 12, south: false, e: 440000 + size.w, n: 3894000 });
  const far = { zone: 12, south: false, e: 460000, n: 3920000 };
  assert.deepEqual(snapToNeighbours(far, [anchor], size), far);
  const otherZone = { zone: 13, south: false, e: 440000 + size.w + 300, n: 3894000 };
  assert.deepEqual(snapToNeighbours(otherZone, [anchor], size), otherZone);

  const resized = resizePage(anchor, pageGroundSize(25000, "p"), pageGroundSize(50000, "p"));
  assert.equal(resized.e % 1000, 0);
  assert.equal(resized.n % 1000, 0);
  assert.ok(Math.abs(resized.e + 5000 - (anchor.e + 2500)) <= 500, "the centre stays put to within the move step");
});

function mercatorPx(lat, lon, zoom) {
  const world = 512 * 2 ** zoom;
  const x = (lon + 180) / 360 * world;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * world;
  return [x, y];
}

test("a printed page holds its scale to a fraction of a millimetre across the frame", () => {
  // The exporter draws Web Mercator rotated to grid north and squeezed north-south. This simulates
  // that drawing and measures how far any grid intersection lands from its true place on paper.
  const cases = [
    [{ zone: 12, south: false, e: 440000, n: 3894000 }, 25000, "p"],
    [{ zone: 12, south: false, e: 240000, n: 3894000 }, 50000, "l"],   // far from the central meridian
    [{ zone: 33, south: false, e: 560000, n: 7770000 }, 50000, "p"],   // 70 degrees north
    [{ zone: 22, south: false, e: 700000, n: 12000 }, 24000, "p"],     // on the equator
    [{ zone: 56, south: true, e: 330000, n: 6248000 }, 15000, "l"],    // southern hemisphere
  ];
  for (const [page, scale, orient] of cases) {
    const view = printView(page, scale, orient, 7.559);
    const [cx, cy] = mercatorPx(view.centre.lat, view.centre.lon, view.zoom);
    const bearing = view.bearing * Math.PI / 180;
    let worst = 0;
    for (let i = 0; i <= 10; i += 1) {
      for (let j = 0; j <= 10; j += 1) {
        const e = page.e + view.size.w * i / 10, n = page.n + view.size.h * j / 10;
        const position = utmInverse(page.zone, page.south, e, n);
        const [px, py] = mercatorPx(position.lat, position.lon, view.zoom);
        const dx = px - cx, dy = cy - py;
        const screenX = dx * Math.cos(bearing) - dy * Math.sin(bearing);
        const screenUp = dx * Math.sin(bearing) + dy * Math.cos(bearing);
        const paperX = (screenX / view.cssWidth + 0.5) * view.frame.w;
        const paperY = (0.5 - screenUp / view.cssHeight) * view.frame.h;
        const miss = Math.hypot(paperX - view.frame.w * i / 10, paperY - (view.frame.h - view.frame.h * j / 10));
        worst = Math.max(worst, miss);
      }
    }
    // Mercator's scale changes with latitude and UTM's barely does, so the residual grows towards the
    // poles: under 0.1 mm at 1:25,000 in mid latitudes, about 0.27 mm in the corners at 70 degrees north.
    const limit = Math.abs(view.centre.lat) > 60 ? 0.3 : 0.12;
    assert.ok(worst < limit, `worst placement error ${worst.toFixed(3)} mm for zone ${page.zone} at 1:${scale}`);
    assert.ok(view.stretch > 1 && view.stretch < 1.0068);
  }
});

test("the grid spacing follows the zoom and labels use principal digits", () => {
  assert.equal(gridInterval(3), 0);
  assert.equal(gridInterval(5), 100000);
  assert.equal(gridInterval(9), 10000);
  assert.equal(gridInterval(12), 1000);
  assert.equal(gridInterval(16), 100);
  assert.equal(gridLabel(440000, 1000), "40");
  assert.equal(gridLabel(3895000, 1000), "95");
  assert.equal(gridLabel(3805000, 1000), "05");
  assert.equal(gridLabel(440700, 100), "407");
  assert.equal(gridLabel(440000, 10000), "4");
});

test("grid lines are true to the UTM grid and stop at zone edges", () => {
  const view = { west: -111.75, south: 35.14, east: -111.55, north: 35.26, zoom: 12 };
  const grid = buildGrid(view);
  const eastings = grid.lines.filter(feature => feature.properties.kind === "e");
  const northings = grid.lines.filter(feature => feature.properties.kind === "n");
  assert.ok(eastings.length >= 15 && eastings.length <= 22, `${eastings.length} easting lines`);
  assert.ok(northings.length >= 11 && northings.length <= 16, `${northings.length} northing lines`);
  for (const feature of [...eastings, ...northings]) {
    for (const [lon, lat] of feature.geometry.coordinates) {
      assert.ok(lon >= view.west - 1e-9 && lon <= view.east + 1e-9 && lat >= view.south - 1e-9 && lat <= view.north + 1e-9);
    }
    // Interior vertices sit exactly on the line's grid value.
    const [lon, lat] = feature.geometry.coordinates[1];
    const utm = utmForward(lat, lon, 12);
    const value = feature.properties.kind === "e" ? utm.easting : utm.northing;
    if (feature.geometry.coordinates.length > 2) assert.ok(Math.abs(value - feature.properties.value) < 0.01);
  }
  const forty = eastings.find(feature => feature.properties.value === 440000);
  assert.equal(forty.properties.label, "40");
  assert.equal(forty.properties.level, 1, "every tenth line is marked as an index line");
  assert.equal(eastings.find(feature => feature.properties.value === 441000).properties.level, 0);

  // Across the boundary between zones 12 and 13 at 108 degrees west each zone draws its own grid.
  const seam = buildGrid({ west: -108.1, south: 35.1, east: -107.9, north: 35.2, zoom: 12 });
  assert.equal(seam.lines.filter(feature => feature.properties.kind === "zone").length >= 1, true);
  for (const feature of seam.lines.filter(feature => feature.properties.kind === "e")) {
    const lons = feature.geometry.coordinates.map(coordinate => coordinate[0]);
    assert.ok(Math.max(...lons) <= -108 + 1e-9 || Math.min(...lons) >= -108 - 1e-9, "no grid line crosses the zone boundary");
  }

  const squares = buildGrid({ west: -114, south: 33, east: -108, north: 37, zoom: 8 });
  assert.ok(squares.labels.some(feature => feature.properties.label === "12S VD"));
  const zones = buildGrid({ west: -130, south: 20, east: -90, north: 50, zoom: 3 });
  assert.ok(zones.labels.some(feature => feature.properties.label === "12S"));
  assert.equal(zones.lines.every(feature => feature.properties.kind === "zone"), true);
});

test("grid cells cope with the antimeridian, Svalbard and the polar limits", () => {
  const dateLine = cellsInView({ west: 175, south: -20, east: 185, north: -10 });
  assert.deepEqual([...new Set(dateLine.map(cell => cell.zone))].sort((a, b) => a - b), [1, 60]);
  assert.ok(dateLine.find(cell => cell.zone === 1).west >= 180);
  const svalbard = cellsInView({ west: 8, south: 76, east: 34, north: 80 }).map(cell => cell.zone);
  assert.deepEqual([...new Set(svalbard)].sort((a, b) => a - b), [31, 33, 35, 37]);
  assert.deepEqual(cellsInView({ west: 0, south: 85, east: 10, north: 89 }), []);
  const crossing = buildGrid({ west: 179.9, south: -17.05, east: 180.1, north: -16.95, zoom: 12 });
  assert.ok(crossing.lines.length > 10);
  assert.ok(crossing.lines.every(feature => feature.geometry.coordinates.every(([lon]) => lon >= 179.9 - 1e-9 && lon <= 180.1 + 1e-9)));
  assert.deepEqual(clipPolyline([[0, 0], [10, 0]], { west: 2, south: -1, east: 4, north: 1 }), [[[2, 0], [4, 0]]]);
  assert.deepEqual(clipPolyline([[0, 5], [10, 5]], { west: 2, south: -1, east: 4, north: 1 }), []);
});

const styleContext = extra => ({
  demTiles: "dem://{z}/{x}/{y}",
  contourTiles: (thresholds, multiplier) => `contour://{z}/{x}/{y}?t=${encodeURIComponent(JSON.stringify(thresholds))}&m=${multiplier}`,
  scale: 1,
  ...extra,
});

test("every combination of map options builds a valid MapLibre style", () => {
  let count = 0;
  for (const palette of ["colour", "bw"]) {
    for (const relief of ["off", "soft", "sharp"]) {
      for (const contours of ["off", "sparse", "full"]) {
        for (const labels of ["sparse", "full"]) {
          for (const units of ["ft", "m"]) {
            for (const extra of [{ interactive: true }, { scale: 2, contourInterval: [40, 200] }, { terrain: true, interactive: true }]) {
              const style = buildStyle({ ...DEFAULT_OPTIONS, palette, relief, contours, labels, units }, styleContext(extra));
              const errors = validateStyleMin(style);
              assert.deepEqual(errors.map(error => error.message), [], `${palette} ${relief} ${contours} ${labels} ${units}`);
              count += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(count, 216);
});

test("layer switches and options change what the style draws", () => {
  const ids = style => style.layers.map(layer => layer.id);
  const everything = buildStyle(DEFAULT_OPTIONS, styleContext({ interactive: true }));
  assert.ok(ids(everything).includes("pages-line") && ids(everything).includes("region-line"));
  for (const expected of ["hillshade", "contour-lines", "contour-labels", "water", "waterway", "road-major", "road-path", "rail", "building", "grid-lines", "grid-numbers", "peak", "place-city"]) {
    assert.ok(ids(everything).includes(expected), `${expected} is drawn by default`);
  }
  // Exports never carry the page and region overlays.
  const exported = buildStyle(DEFAULT_OPTIONS, styleContext({ scale: 2 }));
  assert.equal(ids(exported).some(id => id.startsWith("pages-") || id.startsWith("region-")), false);
  assert.equal(exported.sources.pages, undefined);

  const bare = buildStyle({ ...DEFAULT_OPTIONS, relief: "off", contours: "off", toggles: Object.fromEntries(LAYER_TOGGLES.map(toggle => [toggle.key, false])) }, styleContext({}));
  assert.deepEqual(ids(bare), ["land", "water", "waterway"]);
  assert.equal(bare.sources.dem, undefined);
  assert.equal(bare.sources.contours, undefined);

  for (const toggle of LAYER_TOGGLES) {
    const without = buildStyle({ ...DEFAULT_OPTIONS, toggles: { ...DEFAULT_OPTIONS.toggles, [toggle.key]: false } }, styleContext({ interactive: true }));
    assert.ok(without.layers.length < everything.layers.length, `switching off "${toggle.label}" removes at least one layer`);
  }

  // Print draws everything twice as large and reads rules one zoom deeper.
  const screenRoad = everything.layers.find(layer => layer.id === "road-major");
  const printRoad = exported.layers.find(layer => layer.id === "road-major");
  assert.equal(printRoad.minzoom, screenRoad.minzoom + 1);
  assert.equal(printRoad.paint["line-width"][4], screenRoad.paint["line-width"][4] * 2);

  const mono = buildStyle({ ...DEFAULT_OPTIONS, palette: "bw" }, styleContext({}));
  assert.equal(mono.layers[0].paint["background-color"], "#ffffff");
  assert.equal(buildStyle(DEFAULT_OPTIONS, styleContext({ terrain: true })).terrain.source, "demTerrain");
  assert.match(everything.sources.dem.attribution, /Mapzen terrain tiles/);

  assert.deepEqual(normaliseOptions({ units: "furlongs", palette: "bw", toggles: { rail: false, bogus: true } }), {
    ...DEFAULT_OPTIONS, palette: "bw", toggles: { ...DEFAULT_OPTIONS.toggles, rail: false },
  });
});

test("contour spacing follows the units, the density and the print scale", () => {
  assert.deepEqual(contourThresholds("ft", "full")[13], [20, 100]);
  assert.deepEqual(contourThresholds("ft", "sparse")[13], [40, 200]);
  assert.deepEqual(contourThresholds("m", "full")[13], [10, 50]);
  for (const units of ["ft", "m"]) {
    for (const [minor, index] of Object.values(contourThresholds(units, "sparse"))) assert.equal(index % minor, 0);
  }
  const scale = value => SCALES.find(entry => entry.value === value);
  assert.deepEqual(printContourInterval(scale(25000), "ft", "sparse"), [40, 200]);
  assert.deepEqual(printContourInterval(scale(25000), "m", "full"), [10, 50]);
  assert.deepEqual(printContourInterval(scale(50000), "m", "sparse"), [40, 200]);
  assert.deepEqual(printContourInterval(scale(15000), "ft", "full"), [10, 50]);
  const imperial = buildStyle({ ...DEFAULT_OPTIONS, units: "ft" }, styleContext({ scale: 2, contourInterval: [40, 200] }));
  assert.match(decodeURIComponent(imperial.sources.contours.tiles[0]), /"5":\[40,200\].*m=3\.28084$/);
});

test("the PDF sheet is laid out inside US Letter with whole scale bars", () => {
  assert.deepEqual(frameOrigin("p"), { x: (215.9 - 200) / 2, y: 9 });
  assert.deepEqual(frameOrigin("l"), { x: 8, y: (215.9 - 200) / 2 });
  // The collar must stay clear of a printer's unprintable margin of a quarter inch.
  assert.ok(frameOrigin("p").y + 240 + 1.5 + 21.9 <= 279.4 - 6.35);
  assert.ok(frameOrigin("l").x + 240 + 1.5 + 21.9 <= 279.4 - 6.35);
  assert.deepEqual(scaleBar(25000, 1000, [10, 5, 4, 3, 2, 1, 0.5], 82), { total: 2, mmPerUnit: 40, lengthMm: 80 });
  assert.deepEqual(scaleBar(50000, 1000, [10, 5, 4, 3, 2, 1, 0.5], 82), { total: 4, mmPerUnit: 20, lengthMm: 80 });
  assert.equal(scaleBar(15000, 1000, [10, 5, 4, 3, 2, 1, 0.5], 82).total, 1);
  assert.equal(scaleBar(24000, 1609.344, [5, 4, 3, 2, 1, 0.5], 82).total, 1);
  for (const { value } of SCALES) {
    assert.ok(scaleBar(value, 1000, [10, 5, 4, 3, 2, 1, 0.5], 82).lengthMm <= 82);
    assert.ok(scaleBar(value, 1609.344, [5, 4, 3, 2, 1, 0.5], 82).lengthMm <= 82);
  }
  // Grid azimuth = magnetic azimuth + (declination - convergence).
  const north = northReference(35.1983, -111.6513, -0.375, 2026.87);
  assert.ok(Math.abs(north.declination - 9.75) < 0.02);
  assert.ok(Math.abs(north.gridMagnetic - (north.declination + 0.375)) < 1e-12);
});

test("device exports are planned within their limits", () => {
  const region = normaliseRegion({ west: -112.0879, south: 36.0806, east: -112.1621, north: 36.0344 });
  assert.deepEqual(region, { west: -112.1621, south: 36.0344, east: -112.0879, north: 36.0806 });
  assert.deepEqual(normaliseRegion({ west: -200, south: -89, east: 200, north: 89 }), { west: -180, south: -84, east: 180, north: 84 });

  // Web Mercator helpers invert each other.
  const world = 512 * 2 ** 12;
  assert.ok(Math.abs(worldToLon(lonToWorld(-112.125, world), world) + 112.125) < 1e-9);
  assert.ok(Math.abs(worldToLat(latToWorld(36.0577, world), world) - 36.0577) < 1e-9);
  assert.equal(lonToWorld(0, 256), 128);
  assert.ok(Math.abs(latToWorld(0, 256) - 128) < 1e-9);

  const plan = planGarmin(region, 13);
  assert.equal(plan.count, plan.cols * plan.rows);
  assert.ok(plan.widthPx / plan.cols <= 1024 && plan.heightPx / plan.rows <= 1024);
  assert.equal(planGarmin(region, 14).count >= plan.count, true);
  for (const budget of [100, 500]) {
    const zoom = bestGarminZoom(region, budget);
    assert.ok(planGarmin(region, zoom).count <= budget);
  }
  const state = { west: -114.8, south: 31.3, east: -109, north: 37 };
  assert.ok(planGarmin(state, bestGarminZoom(state, 100)).count <= 100);
  assert.ok(planGarmin(state, bestGarminZoom(state, 100) + 1).count > 100, "one more zoom level would not fit");

  assert.deepEqual(tileRange({ west: -180, south: -84, east: 180, north: 84 }, 1), { zoom: 1, x0: 0, x1: 1, y0: 0, y1: 1, count: 4 });
  const range = tileRange(region, 14);
  assert.deepEqual([range.x0, range.x1, range.y0, range.y1], [3087, 3090, 6429, 6431]);
  const pyramid = planMbtiles(region, 11, 14);
  assert.deepEqual(pyramid.levels.map(level => level.count), [2, 2, 6, 12]);
  assert.equal(pyramid.count, 22);
  assert.ok(planMbtiles(state, 8, 15).count > ATAK_MAX_TILES);
  assert.equal(regionName(region), "12SUE9890");

  const kml = garminKml("topo & <test>", [{ name: "r00c00", href: "files/r00c00.jpg", north: 36.08, south: 36.07, east: -112.15, west: -112.16 }]);
  assert.match(kml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<kml xmlns="http:\/\/www\.opengis\.net\/kml\/2\.2">/);
  assert.match(kml, /<name>topo &amp; &lt;test&gt;<\/name>/);
  assert.match(kml, /<Icon><href>files\/r00c00\.jpg<\/href><\/Icon>/);
  assert.match(kml, /<north>36\.08000000<\/north>\s*<south>36\.07000000<\/south>\s*<east>-112\.15000000<\/east>\s*<west>-112\.16000000<\/west>/);
  assert.match(kml, /OpenStreetMap contributors/);
});

test("the ZIP writer produces a well-formed stored archive", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const image = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const archive = Buffer.concat(zipStore([{ name: "doc.kml", data: "<kml/>" }, { name: "files/a.jpg", data: image }], new Date(2026, 10, 14, 12, 30, 10)).map(chunk => Buffer.from(chunk)));
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert.equal(archive.toString("utf8", 30, 37), "doc.kml");
  assert.equal(archive.toString("utf8", 37, 43), "<kml/>");
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), 2);
  const directory = archive.readUInt32LE(end + 16);
  assert.equal(archive.readUInt32LE(directory), 0x02014b50);
  assert.equal(archive.readUInt16LE(directory + 10), 0, "entries are stored, not compressed");
  assert.equal(archive.readUInt32LE(directory + 16), crc32(new TextEncoder().encode("<kml/>")));
  assert.equal(directory + archive.readUInt32LE(end + 12), end, "the central directory ends where the end record starts");
  const second = directory + 46 + 7;
  assert.equal(archive.readUInt32LE(second + 42), 30 + 7 + 6, "the second entry's offset points at its local header");
  assert.equal(archive.readUInt32LE(30 + 7 + 6), 0x04034b50);
});

const packageJson = JSON.parse(read("package.json"));
const appVersion = read("topo/app.mjs").match(/\bAPP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)?.[1];
const vendorFolders = {
  maplibre: `topo/vendor/maplibre-gl-${packageJson.devDependencies["maplibre-gl"]}`,
  contour: `topo/vendor/maplibre-contour-${packageJson.devDependencies["maplibre-contour"]}`,
  jspdf: `topo/vendor/jspdf-${packageJson.devDependencies.jspdf}`,
  sql: `topo/vendor/sql.js-${packageJson.devDependencies["sql.js"]}`,
};
const moduleFiles = ["app.mjs", "lib/geo.mjs", "lib/wmm.mjs", "lib/grid.mjs", "lib/pages.mjs", "lib/style.mjs", "lib/render.mjs", "lib/export-pdf.mjs", "lib/export-tiles.mjs", "lib/zip.mjs"];

test("the application ships with its page, modules and vendored libraries", () => {
  for (const path of [
    "topo/index.html", "topo/app.css", "topo/icon.svg", "topo/README.md", "topo/changelog.md", "topo/vendor/LICENSES.md",
    ...moduleFiles.map(file => `topo/${file}`),
    `${vendorFolders.maplibre}/maplibre-gl.mjs`, `${vendorFolders.maplibre}/maplibre-gl-worker.mjs`, `${vendorFolders.maplibre}/maplibre-gl.css`,
    `${vendorFolders.contour}/maplibre-contour.min.js`, `${vendorFolders.jspdf}/jspdf.umd.min.js`,
    `${vendorFolders.sql}/sql-wasm-browser.js`, `${vendorFolders.sql}/sql-wasm-browser.wasm`,
    ...Object.values(vendorFolders).map(folder => `${folder}/LICENSE.txt`),
  ]) {
    assert.ok(existsSync(resolve(root, path)), `${path} is missing`);
  }
  // The vendored copies are exactly what the pinned packages ship, less the source-map comment.
  const shipped = read(`${vendorFolders.contour}/maplibre-contour.min.js`);
  const upstream = read("node_modules/maplibre-contour/dist/index.min.js").replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n");
  assert.equal(shipped, upstream, "run npm run build:vendor after changing a library version");
  assert.equal(readFileSync(resolve(root, `${vendorFolders.sql}/sql-wasm-browser.wasm`)).equals(readFileSync(resolve(root, "node_modules/sql.js/dist/sql-wasm-browser.wasm"))), true);

  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /cp -R [^\n]*\btopo\b[^\n]* _site\//, "the Pages artifact must include the topo folder");
  const readme = read("README.md");
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/topo\//);
});

test("every file address changes with the version, so a cached copy is never mixed in", () => {
  assert.ok(appVersion, "APP_VERSION was not found in topo/app.mjs");
  const page = read("topo/index.html");
  assert.ok(page.includes(`src="app.mjs?v=${appVersion}"`));
  assert.ok(page.includes(`href="app.css?v=${appVersion}"`));
  assert.ok(page.includes(`href="${vendorFolders.maplibre.replace("topo/", "")}/maplibre-gl.css"`));
  assert.ok(page.includes(`src="${vendorFolders.contour.replace("topo/", "")}/maplibre-contour.min.js"`));
  assert.ok(read("topo/app.mjs").includes(`from "./${vendorFolders.maplibre.replace("topo/", "")}/maplibre-gl.mjs"`));
  assert.ok(read("topo/app.mjs").includes(`"${vendorFolders.jspdf.replace("topo/", "")}/jspdf.umd.min.js"`));
  assert.ok(read("topo/lib/export-tiles.mjs").includes(`"../${vendorFolders.sql.replace("topo/", "")}/"`));

  for (const file of moduleFiles) {
    const source = read(`topo/${file}`);
    for (const [, specifier] of source.matchAll(/\bfrom\s+"(\.{1,2}\/[^"]+)"/g)) {
      if (specifier.includes("/vendor/")) continue;
      assert.ok(specifier.endsWith(`?v=${appVersion}`), `${file} imports ${specifier} without the current version`);
    }
    assert.doesNotMatch(source, /\bimport\s*\(/, `${file} must not use a dynamic import that skips the version`);
  }
  assert.match(read("topo/changelog.md"), new RegExp(`## ${appVersion.replaceAll(".", "\\.")} `));
  assert.match(read("topo/README.md"), new RegExp(`Version: \\*\\*${appVersion.replaceAll(".", "\\.")}\\*\\*`));
  const licences = read("topo/vendor/LICENSES.md");
  for (const name of ["maplibre-gl", "maplibre-contour", "jspdf", "sql.js"]) {
    assert.ok(licences.includes(`| ${packageJson.devDependencies[name]} |`), `LICENSES.md lists ${name} ${packageJson.devDependencies[name]}`);
  }
});

test("the page credits its data, limits what it may contact, and carries no third-party branding", () => {
  const page = read("topo/index.html");
  assert.match(page, /<title>Topo Map Builder<\/title>/);
  for (const credit of ["OpenStreetMap", "OpenMapTiles", "OpenFreeMap", "Mapzen terrain tiles", "Nominatim", "World Magnetic Model"]) {
    assert.ok(page.includes(credit), `the page credits ${credit}`);
  }
  const policy = page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || "";
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  const connect = policy.match(/connect-src ([^;]+)/)?.[1].split(/\s+/) || [];
  assert.deepEqual(connect.sort(), ["'self'", "https://nominatim.openstreetmap.org", "https://s3.amazonaws.com", "https://tiles.openfreemap.org"]);
  assert.doesNotMatch(policy, /script-src[^;]*(unsafe-inline|unsafe-eval(?!')|https?:)/, "scripts come from this origin only");
  assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/, "no inline scripts");

  const sources = ["index.html", "app.css", "README.md", "changelog.md", ...moduleFiles].map(file => read(`topo/${file}`)).join("\n");
  assert.doesNotMatch(sources, /\bt\.?\s?rex\b|trex-arms/i, "this is an original application and must not use another product's name");
  assert.doesNotMatch(sources, /\bcdn\.|unpkg\.com|jsdelivr|googleapis/i, "libraries are served from this folder, not a CDN");
});
