import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { crc32, deflateSync } from "node:zlib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { test, expect, hasWebGl2 } from "./topo-fixtures.mjs";

// Topo Map Builder draws with WebGL and reads map data from public tile hosts. These tests stand
// in for those hosts with generated data, so they are repeatable and need no network, and any
// request to a host the application is not meant to use fails the test.

const MM_TO_PT = 72 / 25.4;
const CORS = { "access-control-allow-origin": "*" };
const PLACES = [
  { lat: "35.1987522", lon: "-111.6518229", display_name: "Flagstaff, Coconino County, Arizona, United States", boundingbox: ["35.1037", "35.2755", "-111.7505", "-111.5066"] },
  { lat: "44.0520691", lon: "-123.0867536", display_name: "Flagstaff Lake, Oregon, United States", boundingbox: ["44.05", "44.06", "-123.09", "-123.08"] },
];

function png(width, height, rgb) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4), check = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    check.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const demCache = new Map();
/** A Terrarium-encoded elevation tile of smooth rolling hills that joins up across tiles. */
function demTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!demCache.has(key)) {
    const size = 256, world = size * 2 ** z;
    const rgb = Buffer.alloc(size * size * 3);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const u = (x * size + col) / world, v = (y * size + row) / world;
        const elevation = 1500 + 500 * Math.sin(u * 9000) * Math.cos(v * 9000);
        const value = elevation + 32768;
        const offset = (row * size + col) * 3;
        rgb[offset] = Math.floor(value / 256);
        rgb[offset + 1] = Math.floor(value % 256);
        rgb[offset + 2] = Math.floor((value - Math.floor(value)) * 256);
      }
    }
    demCache.set(key, png(size, size, rgb));
  }
  return demCache.get(key);
}

async function mockMapData(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const record = { unexpected: [], searches: [] };
  await page.route(url => url.origin !== origin && !url.protocol.startsWith("blob") && !url.protocol.startsWith("data"), async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "tiles.openfreemap.org") {
      if (url.pathname === "/planet") {
        return route.fulfill({
          headers: CORS,
          json: {
            tilejson: "3.0.0", name: "test", minzoom: 0, maxzoom: 14, bounds: [-180, -85.05113, 180, 85.05113],
            tiles: ["https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf"],
            attribution: "Test tiles in the OpenMapTiles schema",
            vector_layers: [],
          },
        });
      }
      if (url.pathname.endsWith(".pbf")) {
        return route.fulfill({ status: 200, headers: CORS, contentType: "application/x-protobuf", body: Buffer.alloc(0) });
      }
    }
    const dem = url.hostname === "s3.amazonaws.com" && url.pathname.match(/^\/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (dem) return route.fulfill({ status: 200, headers: CORS, contentType: "image/png", body: demTile(Number(dem[1]), Number(dem[2]), Number(dem[3])) });
    if (url.hostname === "nominatim.openstreetmap.org" && url.pathname === "/search") {
      record.searches.push(url.searchParams.get("q"));
      return route.fulfill({ headers: CORS, json: url.searchParams.get("q") === "Nowhereville" ? [] : PLACES });
    }
    record.unexpected.push(url.href);
    return route.abort();
  });
  return record;
}

function watchProblems(page) {
  const problems = [];
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error" && !/GL Driver Message|GPU stall/.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  return problems;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    const { map } = globalThis.topoApp;
    const check = () => (map.loaded() && map.areTilesLoaded() ? resolve() : map.once("idle", check));
    check();
  }));
}

/** Open the application on mocked map data. Skips the test where the browser has no WebGL 2. */
async function openApp(page, baseURL, suffix = "") {
  const record = await mockMapData(page, baseURL);
  await page.addInitScript(() => {
    globalThis.cspViolations = [];
    document.addEventListener("securitypolicyviolation", event => globalThis.cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`));
  });
  const response = await page.goto(new URL(`../topo/${suffix}`, baseURL).href, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  test.skip(!(await hasWebGl2(page)), "WebGL 2 is not available in this browser, so the map cannot draw");
  await page.waitForFunction(() => globalThis.topoApp, null, { timeout: 20_000 });
  await page.evaluate(() => globalThis.topoApp.ready);
  await settle(page);
  return record;
}

async function mapPoint(page, fx, fy) {
  const box = await page.locator("#map").boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function clickMap(page, fx, fy) {
  const point = await mapPoint(page, fx, fy);
  await page.mouse.click(point.x, point.y);
}

async function shiftDrag(page, from, to) {
  const a = await mapPoint(page, ...from), b = await mapPoint(page, ...to);
  await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
}

const chips = page => page.locator("#chips .chip-name");

async function download(page, trigger, timeout = 150_000) {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout }), trigger()]);
  return { name: file.suggestedFilename(), path: await file.path() };
}

/** Read a ZIP's entries from its central directory and check each stored entry's checksum. */
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(0);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50);
    const method = buffer.readUInt16LE(offset + 10), check = buffer.readUInt32LE(offset + 16), size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataStart, dataStart + size);
    expect(method, `${name} is stored`).toBe(0);
    expect(crc32(data) >>> 0, `${name} checksum`).toBe(check);
    entries.set(name, data);
    offset += 46 + nameLength + extra + comment;
  }
  return entries;
}

function jpegSize(data) {
  expect(data[0]).toBe(0xff);
  expect(data[1]).toBe(0xd8);
  let offset = 2;
  while (offset < data.length) {
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7), progressive: marker === 0xc2 };
    offset += 2 + length;
  }
  throw new Error("no JPEG frame header");
}

test("the map loads on its documented data hosts with no errors or policy violations", async ({ page, baseURL }) => {
  const problems = watchProblems(page);
  const record = await openApp(page, baseURL, "?u=ft");
  await expect(page).toHaveTitle("Topo Map Builder");
  const version = readFileSync(new URL("../../topo/app.mjs", import.meta.url), "utf8").match(/\bAPP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)[1];
  await expect(page.locator("#version")).toHaveText(`v${version}`);

  const view = await page.evaluate(() => {
    const { map, state } = globalThis.topoApp;
    const style = map.getStyle();
    return {
      layers: style.layers.map(layer => layer.id),
      sources: Object.keys(style.sources),
      gridLines: style.sources.grid.data.features.length,
      units: state.options.units,
      canvas: map.getCanvas().width > 0,
    };
  });
  expect(view.canvas).toBe(true);
  expect(view.sources).toEqual(expect.arrayContaining(["omt", "dem", "contours", "grid", "pages"]));
  expect(view.layers).toEqual(expect.arrayContaining(["hillshade", "contour-lines", "road-major", "grid-lines", "grid-numbers", "pages-line"]));
  expect(view.gridLines).toBeGreaterThan(20);
  expect(view.units).toBe("ft");

  await expect(page.locator("#read-gn")).toHaveText(/^\d+\.\d° [EW]$|^0\.0°$/);
  await expect(page.locator("#read-mn")).toHaveText(/^\d+\.\d° [EW]$/);
  await expect(page.locator("#read-zoom")).toHaveText("12.2");
  const point = await mapPoint(page, 0.5, 0.5);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator("#read-cursor")).toHaveText(/^12S [A-Z]{2} \d{4} \d{4}$/);

  await expect(page.locator(".panel-toggle")).toBeHidden();
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("footer.fine")).toContainText("OpenStreetMap");
  expect(record.unexpected, "requests to hosts the application should not use").toEqual([]);
  expect(await page.evaluate(() => globalThis.cspViolations)).toEqual([]);
  expect(problems).toEqual([]);
});

test("pages are picked, moved, undone and shared", async ({ page, baseURL, context }) => {
  const problems = watchProblems(page);
  await openApp(page, baseURL);
  await clickMap(page, 0.5, 0.5);
  await expect(chips(page)).toHaveCount(1);
  await expect(page.locator("#page-count")).toHaveText("· 1");
  await expect(page.locator("#download")).toBeEnabled();
  const first = await page.evaluate(() => ({ ...globalThis.topoApp.state.pages[0] }));
  expect(first.zone).toBe(12);
  expect(first.e % 5000).toBe(0);
  expect(first.n % 6000).toBe(0);

  // Clicking the same page again drops it, and Undo brings it back.
  await clickMap(page, 0.5, 0.5);
  await expect(chips(page)).toHaveCount(0);
  await page.locator("#undo").click();
  await expect(chips(page)).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(chips(page)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(chips(page)).toHaveCount(1);

  // Shift-drag picks every page the box touches.
  await shiftDrag(page, [0.3, 0.3], [0.7, 0.7]);
  const afterBox = await chips(page).count();
  expect(afterBox).toBeGreaterThanOrEqual(2);

  // Selecting a page shows the move buttons; each press moves it one kilometre.
  await chips(page).first().click();
  await expect(page.locator("#nudge")).toBeVisible();
  const before = await page.evaluate(() => ({ ...globalThis.topoApp.state.pages[0] }));
  await page.getByRole("button", { name: "Move the selected page 1 km east" }).click();
  await chips(page).first().press("ArrowUp");
  const after = await page.evaluate(() => ({ ...globalThis.topoApp.state.pages[0] }));
  expect(after.e - before.e).toBe(1000);
  expect(after.n - before.n).toBe(1000);

  // Dragging a page on the map moves it in whole kilometres.
  const dragged = await page.evaluate(() => {
    const { map, state } = globalThis.topoApp;
    const feature = map.getSource("pages").serialize().data.features[state.pages.length - 1];
    const ring = feature.geometry.coordinates[0];
    const centre = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2];
    const point = map.project(centre);
    const box = map.getContainer().getBoundingClientRect();
    return { x: box.x + point.x, y: box.y + point.y, page: { ...state.pages[state.pages.length - 1] } };
  });
  await page.mouse.move(dragged.x, dragged.y);
  await page.mouse.down();
  await page.mouse.move(dragged.x + 60, dragged.y, { steps: 6 });
  await page.mouse.move(dragged.x + 160, dragged.y - 90, { steps: 8 });
  await page.mouse.up();
  const moved = await page.evaluate(() => ({ ...globalThis.topoApp.state.pages.at(-1) }));
  expect(moved.e).toBeGreaterThan(dragged.page.e);
  expect((moved.e - dragged.page.e) % 1000 === 0 || moved.e % 5000 === 0, "moves in whole kilometres or snaps to a neighbour").toBe(true);

  // Changing the scale keeps the pages, re-cut for the new size.
  const count = await chips(page).count();
  await page.locator('#scale-seg [data-v="50000"]').click();
  await expect(page.locator("#scale-note")).toHaveText("Each page covers 10 × 12 km on US Letter.");
  expect(await chips(page).count()).toBeLessThanOrEqual(count);
  expect(await chips(page).count()).toBeGreaterThan(0);

  // The share link restores the same pages in a fresh browser profile.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#share").click();
  await expect(page.locator("#status")).toContainText("copied");
  const link = await page.evaluate(() => globalThis.topoApp.shareUrl());
  expect(link).toMatch(/[?&]s=50000/);
  expect(link).toMatch(/[?&]p=12N\.\d+\.\d+/);
  const pages = await page.evaluate(() => globalThis.topoApp.state.pages.map(entry => ({ ...entry })));

  const fresh = await context.newPage();
  await mockMapData(fresh, baseURL);
  await fresh.goto(link);
  await fresh.evaluate(() => localStorage.clear());
  await fresh.goto(link);
  await fresh.waitForFunction(() => globalThis.topoApp);
  await fresh.evaluate(() => globalThis.topoApp.ready);
  expect(await fresh.evaluate(() => globalThis.topoApp.state.pages.map(entry => ({ ...entry })))).toEqual(pages);
  expect(await fresh.evaluate(() => globalThis.topoApp.state.scale)).toBe(50000);
  await fresh.close();

  await page.locator("#clear").click();
  await expect(chips(page)).toHaveCount(0);
  await expect(page.locator("#download")).toBeDisabled();
  expect(problems).toEqual([]);
});

test("a downloaded PDF places the map frame at true scale on US Letter", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const problems = watchProblems(page);
  await openApp(page, baseURL, "?u=m");
  await clickMap(page, 0.5, 0.5);
  await clickMap(page, 0.75, 0.5);
  await expect(chips(page)).toHaveCount(2);

  const file = await download(page, () => page.locator("#download").click());
  expect(file.name).toMatch(/^topo-12S[A-Z]{2}\d{4}-25k-2pages\.pdf$/);
  await expect(page.locator("#progress")).toBeHidden();
  const bytes = readFileSync(file.path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  expect(doc.numPages, "two map pages and the legend").toBe(3);
  const sheet = await doc.getPage(1);
  expect(sheet.view.slice(2).map(value => Math.round(value))).toEqual([612, 792]);

  // The map image fills a 200 x 240 mm frame: at 1:25,000 that is exactly 5 x 6 km.
  const operators = await sheet.getOperatorList();
  const imageIndex = operators.fnArray.indexOf(OPS.paintImageXObject);
  expect(imageIndex).toBeGreaterThan(0);
  const placement = operators.argsArray[operators.fnArray.lastIndexOf(OPS.transform, imageIndex)];
  expect(placement[0]).toBeCloseTo(200 * MM_TO_PT, 1);
  expect(placement[3]).toBeCloseTo(240 * MM_TO_PT, 1);
  expect(placement[4]).toBeCloseTo(7.95 * MM_TO_PT, 1);
  expect(placement[5]).toBeCloseTo((279.4 - 9 - 240) * MM_TO_PT, 1);

  const text = await sheet.getTextContent();
  const strings = text.items.map(item => item.str.replace(/\s+/g, " ").trim()).filter(Boolean);
  expect(strings).toEqual(expect.arrayContaining([
    "Sheet 1 of 2 · Scale 1:25,000",
    "Contour interval 20 m, index 100 m",
    "Print at 100% (actual size). One 1 km grid square measures 40 mm.",
    "GN",
  ]));
  expect(strings.some(value => /^SW corner 12S [A-Z]{2} \d{5} \d{5}$/.test(value))).toBe(true);
  expect(strings.some(value => /^Grid-magnetic angle \d+\.\d° \(\d+ mils\)$/.test(value))).toBe(true);
  expect(strings.some(value => value.includes("OpenStreetMap contributors"))).toBe(true);

  // Grid numbers along the top edge sit one kilometre, 40 mm, apart.
  const gridNumbers = text.items.filter(item => /^\d{2}$/.test(item.str));
  expect(gridNumbers.length).toBeGreaterThanOrEqual(16);
  const topRow = gridNumbers.filter(item => Math.abs(item.transform[5] - gridNumbers[0].transform[5]) < 0.5).map(item => item.transform[4]).sort((a, b) => a - b);
  expect(topRow.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < topRow.length; i += 1) expect(topRow[i] - topRow[i - 1]).toBeCloseTo(40 * MM_TO_PT, 1);

  const legend = await doc.getPage(3);
  const legendText = (await legend.getTextContent()).items.map(item => item.str);
  expect(legendText).toEqual(expect.arrayContaining(["Legend", "Index contour, labelled with its elevation", "Reading a grid reference"]));
  expect(legendText.some(value => value.includes("elevation in metres"))).toBe(true);
  expect(problems).toEqual([]);
});

test("a landscape sheet without a legend page keeps its collar beside the map", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await openApp(page, baseURL, "?o=l&s=50000");
  await clickMap(page, 0.5, 0.5);
  await page.locator("#legend-page").uncheck();
  const file = await download(page, () => page.locator("#download").click());
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file.path)), useSystemFonts: false, disableFontFace: true }).promise;
  expect(doc.numPages).toBe(1);
  const sheet = await doc.getPage(1);
  expect(sheet.view.slice(2).map(value => Math.round(value))).toEqual([792, 612]);
  const operators = await sheet.getOperatorList();
  const imageIndex = operators.fnArray.indexOf(OPS.paintImageXObject);
  const placement = operators.argsArray[operators.fnArray.lastIndexOf(OPS.transform, imageIndex)];
  expect(placement[0]).toBeCloseTo(240 * MM_TO_PT, 1);
  expect(placement[3]).toBeCloseTo(200 * MM_TO_PT, 1);
  const text = await sheet.getTextContent();
  const title = text.items.find(item => /^Sheet 1 of 1/.test(item.str));
  // Rotated a quarter turn, and placed to the right of the 240 mm frame.
  expect(Math.abs(title.transform[0])).toBeLessThan(0.01);
  expect(title.transform[1]).toBeGreaterThan(0);
  expect(title.transform[4]).toBeGreaterThan((8 + 240) * MM_TO_PT);
});

test("the Garmin export is a KMZ of baseline JPEG overlays within the device limit", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const problems = watchProblems(page);
  await openApp(page, baseURL, "#map=10.5/36.0577/-112.125");
  await page.getByRole("tab", { name: "Garmin" }).click();
  await expect(page.locator("#region-read")).toHaveText(/km/);
  await expect(page.locator(".region-handle")).toHaveCount(5);

  // The first region covers most of the view. At full detail that is more than a device holds,
  // and it is refused before any rendering starts.
  await page.locator("#garmin-zoom").fill("17");
  await expect(page.locator("#garmin-hint")).toContainText("more than the device holds");
  await expect(page.locator("#bake")).toBeDisabled();

  await shiftDrag(page, [0.42, 0.42], [0.6, 0.62]);
  await page.locator("#garmin-zoom").fill("13");
  await expect(page.locator("#garmin-hint")).toHaveText(/^\d+ images?, about/);
  await expect(page.locator("#bake")).toBeEnabled();
  const region = await page.evaluate(() => ({ ...globalThis.topoApp.state.region }));

  const file = await download(page, () => page.locator("#bake").click());
  expect(file.name).toMatch(/^topo-12S[A-Z]{2}\d{4}-z12\.kmz$/);
  const entries = readZip(readFileSync(file.path));
  const names = [...entries.keys()];
  expect(names[0]).toBe("doc.kml");
  const images = names.filter(name => name.endsWith(".jpg"));
  expect(images.length).toBeGreaterThanOrEqual(1);
  expect(images.length).toBeLessThanOrEqual(100);
  for (const name of images) {
    const size = jpegSize(entries.get(name));
    expect(size.width).toBeLessThanOrEqual(1024);
    expect(size.height).toBeLessThanOrEqual(1024);
    expect(size.progressive, "Garmin units read baseline JPEG only").toBe(false);
  }
  const kml = entries.get("doc.kml").toString("utf8");
  expect(kml.match(/<GroundOverlay>/g).length).toBe(images.length);
  for (const name of images) expect(kml).toContain(`<href>${name}</href>`);
  const numbers = tag => [...kml.matchAll(new RegExp(`<${tag}>(-?[\\d.]+)</${tag}>`, "g"))].map(match => Number(match[1]));
  expect(Math.max(...numbers("north"))).toBeCloseTo(region.north, 5);
  expect(Math.min(...numbers("south"))).toBeCloseTo(region.south, 5);
  expect(Math.min(...numbers("west"))).toBeCloseTo(region.west, 5);
  expect(Math.max(...numbers("east"))).toBeCloseTo(region.east, 5);
  expect(kml).toContain("OpenStreetMap contributors");
  expect(problems).toEqual([]);
});

test("the ATAK export is a valid MBTiles pyramid", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const problems = watchProblems(page);
  await openApp(page, baseURL);
  await page.getByRole("tab", { name: "ATAK" }).click();
  await shiftDrag(page, [0.45, 0.45], [0.58, 0.6]);
  await page.locator("#atak-min").fill("11");
  await page.locator("#atak-max").fill("13");
  await expect(page.locator("#atak-read")).toHaveText("· 11 to 13");
  await expect(page.locator("#atak-hint")).toHaveText(/^[\d,]+ tiles, finest/);
  const expected = Number((await page.locator("#atak-hint").innerText()).match(/^([\d,]+) tiles/)[1].replace(",", ""));
  const region = await page.evaluate(() => ({ ...globalThis.topoApp.state.region }));

  const file = await download(page, () => page.locator("#bake").click(), 200_000);
  expect(file.name).toMatch(/^topo-12S[A-Z]{2}\d{4}-z11-13\.mbtiles$/);
  const db = new DatabaseSync(file.path, { readOnly: true });
  const metadata = Object.fromEntries(db.prepare("SELECT name, value FROM metadata").all().map(row => [row.name, row.value]));
  expect(metadata).toMatchObject({ format: "jpg", type: "baselayer", minzoom: "11", maxzoom: "13" });
  expect(metadata.attribution).toContain("OpenStreetMap contributors");
  expect(metadata.bounds.split(",").map(Number)).toEqual([region.west, region.south, region.east, region.north].map(value => Number(value.toFixed(6))));

  const tiles = db.prepare("SELECT zoom_level AS z, tile_column AS x, tile_row AS y, tile_data AS data FROM tiles ORDER BY z, x, y").all();
  expect(tiles.length).toBe(expected);
  expect([...new Set(tiles.map(tile => tile.z))]).toEqual([11, 12, 13]);
  const midLat = (region.south + region.north) / 2, midLon = (region.west + region.east) / 2;
  for (const zoom of [11, 13]) {
    // The tile under the region centre is present, with its row counted from the south (TMS).
    const n = 2 ** zoom;
    const x = Math.floor((midLon + 180) / 360 * n);
    const xyzRow = Math.floor((1 - Math.log(Math.tan(Math.PI / 4 + midLat * Math.PI / 360)) / Math.PI) / 2 * n);
    expect(tiles.some(tile => tile.z === zoom && tile.x === x && tile.y === n - 1 - xyzRow), `centre tile at zoom ${zoom}`).toBe(true);
  }
  for (const tile of tiles.slice(0, 6)) {
    const size = jpegSize(Buffer.from(tile.data));
    expect([size.width, size.height]).toEqual([256, 256]);
  }
  db.close();
  expect(problems).toEqual([]);
});

test("the search box understands coordinates, MGRS references and place names", async ({ page, baseURL }) => {
  const problems = watchProblems(page);
  const record = await openApp(page, baseURL);
  const centre = () => page.evaluate(() => {
    const value = globalThis.topoApp.map.getCenter();
    return [value.lat, value.lng];
  });
  // The map flies to its target, so wait until it has arrived.
  const arrivesAt = (lat, lon, tolerance = 0.0005) => expect.poll(async () => {
    const [atLat, atLon] = await centre();
    return Math.max(Math.abs(atLat - lat), Math.abs(atLon - lon));
  }).toBeLessThan(tolerance);
  const go = async text => {
    await page.locator("#goto-input").fill(text);
    await page.locator("#goto-input").press("Enter");
  };

  await go("44.2706, -71.3033");
  await arrivesAt(44.2706, -71.3033);
  expect(record.searches, "coordinates never leave the browser").toEqual([]);

  await go("12S VD 40711 95228");
  await arrivesAt(35.1983, -111.6513);
  expect(record.searches).toEqual([]);

  await go("Flagstaff");
  await expect(page.locator("#suggest")).toBeVisible();
  await expect(page.locator('#suggest [role="option"]')).toHaveCount(2);
  expect(record.searches).toEqual(["Flagstaff"]);
  await page.locator('#suggest [role="option"]').nth(1).click();
  await expect(page.locator("#suggest")).toBeHidden();
  await arrivesAt(44.0521, -123.0868, 0.02);

  await go("Nowhereville");
  await expect(page.locator("#status")).toContainText('No place found for "Nowhereville"');
  expect(problems).toEqual([]);
});

test("map options restyle the map and are remembered", async ({ page, baseURL }) => {
  const problems = watchProblems(page);
  await openApp(page, baseURL);
  const layerIds = () => page.evaluate(() => globalThis.topoApp.map.getStyle().layers.map(layer => layer.id));
  const group = name => page.getByRole("radiogroup", { name });

  await group("Contours").getByRole("radio", { name: "Off" }).click();
  expect(await layerIds()).not.toContain("contour-lines");
  await group("Hillshade").getByRole("radio", { name: "Off" }).click();
  expect(await layerIds()).not.toContain("hillshade");
  await group("Ink").getByRole("radio", { name: "B&W" }).click();
  expect(await page.evaluate(() => globalThis.topoApp.map.getPaintProperty("land", "background-color"))).toBe("#ffffff");
  await group("Units").getByRole("radio", { name: "Metric" }).click();
  await expect(page.locator(".maplibregl-ctrl-scale")).toHaveText(/\d\s?k?m$/);

  const gridSwitch = page.getByRole("switch", { name: "MGRS grid lines" });
  await expect(gridSwitch).toHaveAttribute("aria-checked", "true");
  await gridSwitch.click();
  await expect(gridSwitch).toHaveAttribute("aria-checked", "false");
  expect(await layerIds()).not.toContain("grid-lines");

  await page.locator("details.more summary").click();
  await page.getByRole("switch", { name: "Railways" }).click();
  expect(await layerIds()).not.toContain("rail");

  // 3D is a preview: it tilts the map and adds terrain, and 2D puts it flat again.
  await page.getByRole("radiogroup", { name: "Map view" }).getByRole("radio", { name: "3D" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.topoApp.map.getPitch())).toBeGreaterThan(55);
  expect(await page.evaluate(() => Boolean(globalThis.topoApp.map.getTerrain()))).toBe(true);
  await page.getByRole("radiogroup", { name: "Map view" }).getByRole("radio", { name: "2D" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.topoApp.map.getPitch())).toBe(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.topoApp);
  await page.evaluate(() => globalThis.topoApp.ready);
  expect(await page.evaluate(() => globalThis.topoApp.state.options)).toMatchObject({
    contours: "off", relief: "off", palette: "bw", units: "m", toggles: { grid: false, rail: false },
  });
  await expect(group("Ink").getByRole("radio", { name: "B&W" })).toHaveAttribute("aria-checked", "true");
  expect(problems).toEqual([]);
});

test("the panel becomes a toggled sheet on a phone and nothing overflows", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page, baseURL);
  const toggle = page.locator("#panel-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#panel")).toBeHidden();
  await toggle.click();
  await expect(page.locator("#panel")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("tab", { name: "Print" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await toggle.click();
  await expect(page.locator("#panel")).toBeHidden();

  await page.locator("#panel-toggle").click();
  await page.locator("#help-open").click();
  await expect(page.locator("#help")).toBeVisible();
  await expect(page.locator("#help")).toContainText("Actual size");
  await page.getByRole("button", { name: "Close the guide" }).click();
  await expect(page.locator("#help")).toBeHidden();
});
