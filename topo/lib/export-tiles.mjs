// Device exports for Topo Map Builder.
//   Garmin: a KMZ "custom map" of JPEG ground overlays, each at most 1024 x 1024 pixels.
//   ATAK:   an MBTiles file (SQLite) holding a pyramid of 256-pixel JPEG tiles.
// Both are rendered in the browser from the same style as the on-screen map.

import { mgrsFromUtm, utmForward } from "./geo.mjs?v=1.0.0";
import { buildGrid, gridInterval } from "./grid.mjs?v=1.0.0";
import { OffscreenMap, canvasToJpeg, make2dCanvas, throwIfCancelled } from "./render.mjs?v=1.0.0";
import { buildStyle, normaliseOptions } from "./style.mjs?v=1.0.0";
import { zipStore } from "./zip.mjs?v=1.0.0";

export const GARMIN_IMAGE_PX = 1024;
export const GARMIN_MIN_ZOOM = 6;
export const GARMIN_MAX_ZOOM = 16;
export const GARMIN_AUTO_ZOOM = 14;
export const TILE_PX = 256;
export const ATAK_MIN_ZOOM = 6;
export const ATAK_MAX_ZOOM = 17;
export const ATAK_MAX_TILES = 6000;
/** Extra margin drawn around each render so labels near an edge are placed the same on both sides. */
const RENDER_PAD = 96;
const ATTRIBUTION = "Map data © OpenStreetMap contributors. Tiles: OpenFreeMap, OpenMapTiles. Elevation: Mapzen terrain tiles. Made with Topo Map Builder.";

export function lonToWorld(lon, world) {
  return ((lon + 180) / 360) * world;
}

export function latToWorld(lat, world) {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  return ((1 - Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) / Math.PI) / 2) * world;
}

export function worldToLon(x, world) {
  return (x / world) * 360 - 180;
}

export function worldToLat(y, world) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;
}

/** Tidy a region: ordered edges, inside the Mercator and MGRS-friendly limits. */
export function normaliseRegion(region) {
  const west = Math.max(-180, Math.min(region.west, region.east));
  const east = Math.min(180, Math.max(region.west, region.east));
  const south = Math.max(-84, Math.min(region.south, region.north));
  const north = Math.min(84, Math.max(region.south, region.north));
  return { west, south, east, north };
}

export function regionSizeKm(region) {
  const midLat = (region.south + region.north) / 2;
  const kmPerDegree = 111.32;
  return {
    width: (region.east - region.west) * kmPerDegree * Math.cos((midLat * Math.PI) / 180),
    height: (region.north - region.south) * kmPerDegree,
  };
}

/** Garmin plan at a map zoom: how the region is cut into images of at most 1024 pixels. */
export function planGarmin(region, zoom) {
  const world = 512 * 2 ** zoom;
  const left = lonToWorld(region.west, world), right = lonToWorld(region.east, world);
  const top = latToWorld(region.north, world), bottom = latToWorld(region.south, world);
  const widthPx = right - left, heightPx = bottom - top;
  const cols = Math.max(1, Math.ceil(widthPx / GARMIN_IMAGE_PX)), rows = Math.max(1, Math.ceil(heightPx / GARMIN_IMAGE_PX));
  return { zoom, world, left, top, widthPx, heightPx, cols, rows, count: cols * rows };
}

/**
 * The most detailed whole zoom whose image count fits a device's limit. The automatic choice
 * stops at GARMIN_AUTO_ZOOM, about 4 m per pixel: beyond that the map data adds nothing and the
 * render only gets slower. The slider can still go higher.
 */
export function bestGarminZoom(region, budget) {
  for (let zoom = GARMIN_AUTO_ZOOM; zoom > GARMIN_MIN_ZOOM; zoom -= 1) {
    if (planGarmin(region, zoom).count <= budget) return zoom;
  }
  return GARMIN_MIN_ZOOM;
}

/** XYZ tile range (256-pixel tiles) covering a region at a tile zoom. */
export function tileRange(region, zoom) {
  const n = 2 ** zoom;
  const clamp = value => Math.max(0, Math.min(n - 1, value));
  const x0 = clamp(Math.floor(lonToWorld(region.west, n))), x1 = clamp(Math.floor(lonToWorld(region.east, n) - 1e-9));
  const y0 = clamp(Math.floor(latToWorld(region.north, n))), y1 = clamp(Math.floor(latToWorld(region.south, n) - 1e-9));
  return { zoom, x0, x1: Math.max(x0, x1), y0, y1: Math.max(y0, y1), count: (Math.max(x0, x1) - x0 + 1) * (Math.max(y0, y1) - y0 + 1) };
}

/** ATAK plan: the tile ranges for every zoom from minZoom to maxZoom. */
export function planMbtiles(region, minZoom, maxZoom) {
  const levels = [];
  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) levels.push(tileRange(region, zoom));
  return { levels, count: levels.reduce((total, level) => total + level.count, 0) };
}

/** A short file-name stem for a region: the MGRS reference of its centre to the kilometre. */
export function regionName(region) {
  const lat = (region.south + region.north) / 2, lon = (region.west + region.east) / 2;
  const utm = utmForward(lat, lon);
  const reference = mgrsFromUtm(utm.zone, utm.south, utm.easting, utm.northing, 2, false);
  return reference || `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

/** The KML document that places each image of a Garmin custom map. */
export function garminKml(name, images) {
  const overlays = images.map(image => `  <GroundOverlay>
    <name>${escapeXml(image.name)}</name>
    <drawOrder>50</drawOrder>
    <Icon><href>${escapeXml(image.href)}</href></Icon>
    <LatLonBox>
      <north>${image.north.toFixed(8)}</north>
      <south>${image.south.toFixed(8)}</south>
      <east>${image.east.toFixed(8)}</east>
      <west>${image.west.toFixed(8)}</west>
      <rotation>0</rotation>
    </LatLonBox>
  </GroundOverlay>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(name)}</name>
  <description>${escapeXml(ATTRIBUTION)}</description>
${overlays}
</Document>
</kml>
`;
}

function deviceStyle(options, terrain) {
  return buildStyle(normaliseOptions(options), { demTiles: terrain.demTiles, contourTiles: terrain.contourTiles, scale: 1 });
}

/** Refresh the baked grid for the area an off-screen render is about to draw. */
function gridUpdater(options, world, zoom) {
  if (!options.toggles.grid) return undefined;
  return (left, top, width, height) => map => {
    const view = {
      west: worldToLon(left, world), east: worldToLon(left + width, world),
      north: worldToLat(top, world), south: worldToLat(top + height, world), zoom,
    };
    const grid = buildGrid(view, gridInterval(zoom));
    map.getSource("grid")?.setData({ type: "FeatureCollection", features: grid.lines });
    map.getSource("gridLabels")?.setData({ type: "FeatureCollection", features: grid.labels });
  };
}

/**
 * Copy a Mercator render into a canvas whose rows are evenly spaced in latitude, which is how a
 * KML LatLonBox stretches an image. At high zoom the two differ by a fraction of a pixel and the
 * copy is direct; at low zoom each row is taken from the right place.
 */
function drawEquirectangular(context, source, sx, sy, width, height, ratio, top, world, north, south) {
  const midRow = (latToWorld((north + south) / 2, world) - top) - height / 2;
  if (Math.abs(midRow) < 0.35) {
    context.drawImage(source, sx * ratio, sy * ratio, width * ratio, height * ratio, 0, 0, width, height);
    return;
  }
  for (let row = 0; row < height; row += 1) {
    const lat = north - ((row + 0.5) / height) * (north - south);
    const sourceRow = latToWorld(lat, world) - top - 0.5;
    context.drawImage(source, sx * ratio, (sy + sourceRow) * ratio, width * ratio, ratio, 0, row, width, 1);
  }
}

/** Render a Garmin custom map. Returns { blob, name, count, missingTiles }. */
export async function bakeGarmin(deps, job) {
  const { maplibregl, terrain } = deps;
  const options = normaliseOptions(job.options);
  const region = normaliseRegion(job.region);
  const plan = planGarmin(region, job.zoom);
  const stem = `topo-${regionName(region)}-z${job.zoom}`;
  const offscreen = new OffscreenMap(maplibregl, { style: deviceStyle(options, terrain), pixelRatio: 1, palette: options.palette });
  const updateGrid = gridUpdater(options, plan.world, job.zoom);
  const files = [], images = [];
  try {
    const imageWidth = plan.widthPx / plan.cols, imageHeight = plan.heightPx / plan.rows;
    for (let row = 0; row < plan.rows; row += 1) {
      for (let col = 0; col < plan.cols; col += 1) {
        throwIfCancelled(job.signal);
        const done = row * plan.cols + col;
        job.onProgress?.(done, plan.count, `Rendering image ${done + 1} of ${plan.count}`);
        const left = plan.left + col * imageWidth, top = plan.top + row * imageHeight;
        const width = Math.max(1, Math.round(imageWidth)), height = Math.max(1, Math.round(imageHeight));
        const canvasSource = await offscreen.render({
          centre: [worldToLon(left + imageWidth / 2, plan.world), worldToLat(top + imageHeight / 2, plan.world)],
          zoom: job.zoom,
          width: width + RENDER_PAD * 2, height: height + RENDER_PAD * 2,
          beforeRender: updateGrid?.(left - RENDER_PAD, top - RENDER_PAD, imageWidth + RENDER_PAD * 2, imageHeight + RENDER_PAD * 2),
        }, job.signal);
        const ratio = canvasSource.width / (width + RENDER_PAD * 2);
        const north = worldToLat(top, plan.world), south = worldToLat(top + imageHeight, plan.world);
        const { canvas, context } = make2dCanvas(width, height);
        drawEquirectangular(context, canvasSource, RENDER_PAD, RENDER_PAD, width, height, ratio, top, plan.world, north, south);
        const name = `r${String(row).padStart(2, "0")}c${String(col).padStart(2, "0")}`;
        files.push({ name: `files/${name}.jpg`, data: await canvasToJpeg(canvas, 0.86) });
        images.push({
          name, href: `files/${name}.jpg`, north, south,
          west: worldToLon(left, plan.world), east: worldToLon(left + imageWidth, plan.world),
        });
      }
    }
    job.onProgress?.(plan.count, plan.count, "Packing the KMZ");
    const archive = zipStore([{ name: "doc.kml", data: garminKml(stem, images) }, ...files]);
    return {
      blob: new Blob(archive, { type: "application/vnd.google-earth.kmz" }),
      name: `${stem}.kmz`, count: plan.count, missingTiles: offscreen.failures,
    };
  } finally {
    offscreen.destroy();
  }
}

const SQL_JS_FOLDER = "../vendor/sql.js-1.16.0/";
let sqlLoader = null;

/** Load sql.js on first use. It is only needed for the ATAK export. */
function loadSql() {
  if (!sqlLoader) {
    sqlLoader = new Promise((resolve, reject) => {
      const start = () => globalThis.initSqlJs({ locateFile: file => new URL(`${SQL_JS_FOLDER}${file}`, import.meta.url).href }).then(resolve, reject);
      if (globalThis.initSqlJs) {
        start();
        return;
      }
      const script = document.createElement("script");
      script.src = new URL(`${SQL_JS_FOLDER}sql-wasm-browser.js`, import.meta.url).href;
      script.onload = start;
      script.onerror = () => reject(new Error("The database library could not be loaded."));
      document.head.append(script);
    }).catch(error => {
      sqlLoader = null;
      throw error;
    });
  }
  return sqlLoader;
}

/** Render an MBTiles tile pyramid for ATAK. Returns { blob, name, count, missingTiles }. */
export async function bakeMbtiles(deps, job) {
  const { maplibregl, terrain } = deps;
  const options = normaliseOptions(job.options);
  const region = normaliseRegion(job.region);
  const plan = planMbtiles(region, job.minZoom, job.maxZoom);
  if (plan.count > ATAK_MAX_TILES) throw new Error(`That is ${plan.count.toLocaleString("en-US")} tiles. Shrink the region or lower the zoom to stay under ${ATAK_MAX_TILES.toLocaleString("en-US")}.`);
  const SQL = await loadSql();
  throwIfCancelled(job.signal);
  const stem = `topo-${regionName(region)}-z${job.minZoom}-${job.maxZoom}`;
  const db = new SQL.Database();
  const offscreen = new OffscreenMap(maplibregl, { style: deviceStyle(options, terrain), pixelRatio: 1, palette: options.palette });
  try {
    db.run("CREATE TABLE metadata (name TEXT, value TEXT)");
    db.run("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)");
    db.run("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)");
    const metadata = {
      name: stem,
      type: "baselayer",
      version: "1.0",
      description: "Topographic map made with Topo Map Builder",
      format: "jpg",
      bounds: [region.west, region.south, region.east, region.north].map(value => value.toFixed(6)).join(","),
      center: `${((region.west + region.east) / 2).toFixed(6)},${((region.south + region.north) / 2).toFixed(6)},${job.maxZoom}`,
      minzoom: String(job.minZoom),
      maxzoom: String(job.maxZoom),
      attribution: ATTRIBUTION,
    };
    for (const [name, value] of Object.entries(metadata)) db.run("INSERT INTO metadata VALUES (?, ?)", [name, value]);

    const insert = db.prepare("INSERT INTO tiles VALUES (?, ?, ?, ?)");
    let done = 0;
    const chunk = 4;
    for (const level of plan.levels) {
      // A 256-pixel tile at tile zoom z is one map pixel per screen pixel at map zoom z - 1.
      const mapZoom = level.zoom - 1;
      const world = TILE_PX * 2 ** level.zoom;
      const updateGrid = gridUpdater(options, world, mapZoom);
      for (let y = level.y0; y <= level.y1; y += chunk) {
        for (let x = level.x0; x <= level.x1; x += chunk) {
          throwIfCancelled(job.signal);
          job.onProgress?.(done, plan.count, `Rendering tile ${Math.min(done + 1, plan.count).toLocaleString("en-US")} of ${plan.count.toLocaleString("en-US")} (zoom ${level.zoom})`);
          const nx = Math.min(chunk, level.x1 - x + 1), ny = Math.min(chunk, level.y1 - y + 1);
          const left = x * TILE_PX, top = y * TILE_PX, width = nx * TILE_PX, height = ny * TILE_PX;
          const source = await offscreen.render({
            centre: [worldToLon(left + width / 2, world), worldToLat(top + height / 2, world)],
            zoom: mapZoom,
            width: width + RENDER_PAD * 2, height: height + RENDER_PAD * 2,
            beforeRender: updateGrid?.(left - RENDER_PAD, top - RENDER_PAD, width + RENDER_PAD * 2, height + RENDER_PAD * 2),
          }, job.signal);
          const ratio = source.width / (width + RENDER_PAD * 2);
          for (let j = 0; j < ny; j += 1) {
            for (let i = 0; i < nx; i += 1) {
              const { canvas, context } = make2dCanvas(TILE_PX, TILE_PX);
              context.drawImage(
                source,
                (RENDER_PAD + i * TILE_PX) * ratio, (RENDER_PAD + j * TILE_PX) * ratio, TILE_PX * ratio, TILE_PX * ratio,
                0, 0, TILE_PX, TILE_PX,
              );
              // MBTiles rows count from the south (TMS), the reverse of XYZ.
              insert.run([level.zoom, x + i, 2 ** level.zoom - 1 - (y + j), await canvasToJpeg(canvas, 0.84)]);
              done += 1;
            }
          }
        }
      }
    }
    insert.free();
    job.onProgress?.(plan.count, plan.count, "Writing the MBTiles file");
    const bytes = db.export();
    return {
      blob: new Blob([bytes], { type: "application/vnd.sqlite3" }),
      name: `${stem}.mbtiles`, count: plan.count, missingTiles: offscreen.failures,
    };
  } finally {
    db.close();
    offscreen.destroy();
  }
}
