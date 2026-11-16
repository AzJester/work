import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GRID, WORLD, OCEAN_FLAG, project, unproject, lonLatToWorld, worldToLonLat } from "../relief-map/src/geo.js";
import { bilinear, decodeHeight, depthOf, gunzip, surfaceOf } from "../relief-map/src/data.js";
import { CITIES, FEATURES, PEAKS, TOURS } from "../relief-map/src/places.js";
import { buildPage } from "../relief-map/build.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const data = (name) => readFileSync(resolve(root, "relief-map/data", name));
const meta = JSON.parse(data("meta.json"));
const stored = decodeHeight(await gunzip(data("height.bin")));
const masks = await gunzip(data("masks.bin"));
const slab = await gunzip(data("slab.bin"));
const states = await gunzip(data("states.bin"));
const page = readFileSync(resolve(root, "relief-map.html"), "utf8");

const hi = { w: GRID.w * GRID.hi, h: GRID.h * GRID.hi }, lo = { w: GRID.w * GRID.lo, h: GRID.h * GRID.lo };
const uv = (lon, lat) => { const [x, z] = lonLatToWorld(lon, lat); return [x / WORLD.w + 0.5, z / WORLD.h + 0.5]; };
const elevation = (lon, lat) => { const [u, v] = uv(lon, lat); return bilinear(stored, GRID.w, GRID.h, u * GRID.w, v * GRID.h, surfaceOf); };
const depth = (lon, lat) => { const [u, v] = uv(lon, lat); return bilinear(stored, GRID.w, GRID.h, u * GRID.w, v * GRID.h, depthOf); };
const mask = (plane, lon, lat) => { const [u, v] = uv(lon, lat); return masks[plane * hi.w * hi.h + Math.floor(v * hi.h) * hi.w + Math.floor(u * hi.w)]; };
const stateAt = (lon, lat) => { const [u, v] = uv(lon, lat); const id = states[Math.floor(v * lo.h) * lo.w + Math.floor(u * lo.w)]; return id ? meta.states[id - 1] : ""; };
const slabAt = (lon, lat) => { const [u, v] = uv(lon, lat); return slab[Math.floor(v * lo.h) * lo.w + Math.floor(u * lo.w)]; };
const LAND = 0, LAKES = 1, RIVERS = 2, BORDERS = 3;

test("the projection is Albers Equal Area Conic as EPSG:5070 defines it", () => {
  // The projection origin maps to zero, and the central meridian stays on the y axis.
  const [x0, y0] = project(-96, 23);
  assert.ok(Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6);
  assert.ok(Math.abs(project(-96, 45)[0]) < 1e-6);
  // East and west of the central meridian mirror each other.
  const east = project(-86, 40), west = project(-106, 40);
  assert.ok(Math.abs(east[0] + west[0]) < 1e-6 && Math.abs(east[1] - west[1]) < 1e-6);
  // Equal area: a one-degree cell near the centre of the country keeps its true area on the ellipsoid to within 0.1 percent.
  const corners = [[-100, 39], [-99, 39], [-99, 40], [-100, 40]].map(([lon, lat]) => project(lon, lat));
  const area = Math.abs(corners.reduce((sum, [x, y], i) => { const [nx, ny] = corners[(i + 1) % 4]; return sum + x * ny - nx * y; }, 0)) / 2;
  assert.ok(Math.abs(area / 9.558e9 - 1) < 0.002, `one-degree cell at 39.5N measures ${(area / 1e6).toFixed(0)} square km`);
  for (const [lon, lat] of [[-124.7, 48.4], [-66.95, 44.8], [-80.2, 25.8], [-97.4, 25.9], [-104.99, 39.74]]) {
    const [bx, by] = unproject(...project(lon, lat));
    assert.ok(Math.abs(bx - lon) < 1e-7 && Math.abs(by - lat) < 1e-7, `${lon},${lat} does not survive a round trip`);
    const [wx, wz] = lonLatToWorld(lon, lat), [cx, cy] = worldToLonLat(wx, wz);
    assert.ok(Math.abs(cx - lon) < 1e-7 && Math.abs(cy - lat) < 1e-7);
    assert.ok(Math.abs(wx) < WORLD.w / 2 && Math.abs(wz) < WORLD.h / 2, `${lon},${lat} falls off the map`);
  }
});

test("the grid in the data matches the grid the page assumes", () => {
  assert.deepEqual([meta.w, meta.h, meta.px, meta.xc, meta.yc, meta.hi, meta.lo], [GRID.w, GRID.h, GRID.px, GRID.xc, GRID.yc, GRID.hi, GRID.lo]);
  assert.equal(GRID.w * GRID.px / WORLD.w, WORLD.unit);
  assert.equal(GRID.h * GRID.px / WORLD.h, WORLD.unit);
  assert.equal(stored.length, GRID.w * GRID.h);
  assert.equal(masks.length, 4 * hi.w * hi.h);
  assert.equal(slab.length, lo.w * lo.h);
  assert.equal(states.length, lo.w * lo.h);
  assert.equal(meta.states.length, 51, "48 contiguous states, the District of Columbia, Alaska and Hawaii");
});

test("known places land at the right height", () => {
  const near = (value, target, tolerance, what) => assert.ok(Math.abs(value - target) <= tolerance, `${what}: ${value.toFixed(0)} m, expected ${target} within ${tolerance}`);
  near(elevation(-104.99, 39.74), 1609, 90, "Denver");
  near(elevation(-111.89, 40.76), 1300, 150, "Salt Lake City");
  near(elevation(-87.63, 41.88), 180, 30, "Chicago");
  near(elevation(-90.07, 29.95), 2, 12, "New Orleans");
  near(elevation(-87.5, 47.7), 183, 8, "Lake Superior surface");
  near(elevation(-120.03, 39.1), 1897, 60, "Lake Tahoe surface");
  assert.ok(elevation(-116.83, 36.24) < -50, "Badwater Basin sits below sea level");
  // A 2.5 km grid rounds summits off, so check the highest cell near each one against a loose floor.
  const summit = (lon, lat) => { let top = -Infinity; for (let dx = -0.04; dx <= 0.04; dx += 0.02) for (let dy = -0.04; dy <= 0.04; dy += 0.02) top = Math.max(top, elevation(lon + dx, lat + dy)); return top; };
  for (const [name, lon, lat, floor] of [["Mount Whitney", -118.292, 36.578, 3650], ["Mount Rainier", -121.76, 46.853, 3300], ["Mount Elbert", -106.445, 39.118, 3800], ["Mount Mitchell", -82.265, 35.765, 1600]]) {
    assert.ok(summit(lon, lat) > floor, `${name}: ${summit(lon, lat).toFixed(0)} m, expected above ${floor}`);
  }
  for (const peak of PEAKS) assert.ok(summit(peak.lon, peak.lat) > peak.elev * 0.65 && summit(peak.lon, peak.lat) < peak.elev + 60, `${peak.name} reads ${summit(peak.lon, peak.lat).toFixed(0)} m against a ${peak.elev} m summit`);
});

test("sea, lakes, rivers, state lines and the slab are where the map says", () => {
  assert.ok(depth(-79.5, 25.7) > 300, "the Florida Straits are deep");
  assert.ok(depth(-125.5, 40) > 1500, "the Pacific drops off quickly");
  assert.equal(depth(-104.99, 39.74), 0);
  assert.equal(mask(LAND, -104.99, 39.74), 255);
  assert.equal(mask(LAND, -92, 27.5), 0, "open Gulf of Mexico");
  assert.ok(mask(LAKES, -87, 43.9) > 250, "Lake Michigan");
  assert.ok(mask(LAKES, -112.5, 41.15) > 250, "Great Salt Lake");
  assert.equal(mask(LAKES, -100, 40), 0);
  // The Mississippi at Memphis and the Missouri at Bismarck: the stroke passes within a few cells.
  const strokeNear = (plane, lon, lat) => { let top = 0; for (let dx = -0.06; dx <= 0.06; dx += 0.01) for (let dy = -0.04; dy <= 0.04; dy += 0.01) top = Math.max(top, mask(plane, lon + dx, lat + dy)); return top; };
  assert.ok(strokeNear(RIVERS, -90.08, 35.14) > 150, "Mississippi River at Memphis");
  assert.ok(strokeNear(RIVERS, -100.82, 46.81) > 150, "Missouri River at Bismarck");
  assert.ok(strokeNear(BORDERS, -109.05, 37.0) > 150, "Four Corners");
  assert.ok(strokeNear(BORDERS, -102.05, 38.5) > 150, "Colorado and Kansas line");
  assert.equal(strokeNear(BORDERS, -105.5, 39.0), 0, "middle of Colorado");
  for (const [lon, lat, name] of [[-104.99, 39.74, "Colorado"], [-97.74, 30.27, "Texas"], [-71.06, 42.36, "Massachusetts"], [-122.33, 47.61, "Washington"], [-81.38, 28.54, "Florida"], [-93.27, 44.98, "Minnesota"]]) {
    assert.equal(stateAt(lon, lat), name);
  }
  // The slab keeps the country and a fringe of sea, and drops its neighbours.
  assert.ok(slabAt(-98, 39) > 250, "Kansas is deep inside the slab");
  assert.ok(slabAt(-81.5, 43.8) > 128, "the Canadian shore of Lake Huron stays, so the lake is whole");
  assert.ok(slabAt(-92, 28) > 128, "the northern Gulf stays");
  assert.ok(slabAt(-106, 29.5) < 100, "Chihuahua is cut away");
  assert.ok(slabAt(-110, 51) < 100, "Alberta is cut away");
  assert.ok(slabAt(-90, 24) < 100, "the central Gulf is beyond the fringe");
  assert.ok(stored.some((v) => v < OCEAN_FLAG) && stored.some((v) => v > 3800), "the grid holds both sea floor and high peaks");
});

test("every named place and tour sits on the slab", () => {
  for (const place of [...CITIES, ...PEAKS, ...FEATURES, ...TOURS]) assert.ok(slabAt(place.lon, place.lat) > 128, `${place.name} is off the slab`);
  for (const city of CITIES) assert.ok(mask(LAND, city.lon, city.lat) > 128 || city.name === "New Orleans", `${city.name} is in the water`);
  assert.equal(new Set([...CITIES, ...PEAKS, ...FEATURES].map((p) => p.name)).size, CITIES.length + PEAKS.length + FEATURES.length, "place names are unique");
  assert.equal(TOURS[0].id, "overview");
  assert.ok(TOURS.length <= 9, "tours map to the number keys");
});

test("the published page is one self-contained file built from the current sources", async () => {
  assert.equal(page, await buildPage(), "relief-map.html is out of date: run npm run build:relief");
  assert.ok(page.length < 6 * 1048576, `page is ${(page.length / 1048576).toFixed(2)} MB`);
  assert.doesNotMatch(page, /<script[^>]+\bsrc=|<link[^>]+rel=["']stylesheet|@import|url\(\s*["']?https?:/i, "no script, stylesheet or font is fetched");
  assert.doesNotMatch(page, /\bfetch\(|XMLHttpRequest|importScripts|navigator\.sendBeacon/, "the page makes no requests of its own");
  for (const id of ["d-meta", "d-height", "d-masks", "d-slab", "d-states", "d-lc0", "d-lc1", "d-lc2", "d-lc3"]) assert.match(page, new RegExp(`<script type="application/octet-stream" id="${id}">[A-Za-z0-9+/=]{16,}</script>`));
  assert.match(page, /three\.js \(MIT License/);
  assert.match(page, /Terrain Tiles \(Mapzen, AWS Open Data\)[^<]*NLCD 2021 \(USGS\)[^<]*Natural Earth/);
  assert.doesNotMatch(page, /—/, "no em dash in the interface");
});

test("the page is published from the site root and described in the README", () => {
  const workflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8"), readme = readFileSync(resolve(root, "README.md"), "utf8");
  assert.match(workflow, /cp -- \*\.html/, "root HTML files are what the Pages artifact copies");
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/relief-map\.html/);
  assert.match(readFileSync(resolve(root, "apps.html"), "utf8"), /liveUrl: "https:\/\/azjester\.github\.io\/work\/relief-map\.html"/);
});
