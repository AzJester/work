// Topo Map Builder: an in-browser builder for printable topographic maps with an MGRS grid,
// with Garmin (KMZ) and ATAK (MBTiles) export. Everything runs in the page; there is no server.

import * as maplibregl from "./vendor/maplibre-gl-6.18.0/maplibre-gl.mjs";
import {
  formatAngleEW, inMgrsRange, parseLatLon, parseMgrs, toMgrs, utmForward,
} from "./lib/geo.mjs?v=1.0.0";
import { buildGrid } from "./lib/grid.mjs?v=1.0.0";
import {
  MOVE_STEP_M, SCALES, isScale, movePage, pageAt, pageContains, pageGroundSize, pageGroundText, pageKey,
  pageName, pageRing, pagesBounds, pagesInBounds, resizePage, samePage, snapOffset, snapToNeighbours,
} from "./lib/pages.mjs?v=1.0.0";
import { RenderCancelled, createTerrain, provideIcons } from "./lib/render.mjs?v=1.0.0";
import { LAYER_TOGGLES, buildStyle, normaliseOptions } from "./lib/style.mjs?v=1.0.0";
import { MAX_PDF_PAGES, exportPdf } from "./lib/export-pdf.mjs?v=1.0.0";
import {
  ATAK_MAX_TILES, ATAK_MAX_ZOOM, ATAK_MIN_ZOOM, bakeGarmin, bakeMbtiles, bestGarminZoom, normaliseRegion,
  planGarmin, planMbtiles, regionSizeKm,
} from "./lib/export-tiles.mjs?v=1.0.0";
import { declination } from "./lib/wmm.mjs?v=1.0.0";

export const APP_VERSION = "1.0.0";
const STORAGE_KEY = "topo_map_builder_v1";
// First view: the South Rim of the Grand Canyon, where relief, trails and contours all show at once.
const DEFAULT_VIEW = { lat: 36.0577, lon: -112.125, zoom: 12.2 };
const MIN_PICK_ZOOM = 8.5;
const HISTORY_LIMIT = 60;
const EMPTY = { type: "FeatureCollection", features: [] };
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

function validPage(page) {
  return page && Number.isInteger(page.zone) && page.zone >= 1 && page.zone <= 60 && typeof page.south === "boolean"
    && Number.isFinite(page.e) && Number.isFinite(page.n) && page.e > -500000 && page.e < 1500000 && page.n > -1000000 && page.n < 11000000;
}

/** Pages travel in links as "12N.440000.3894000", comma separated. */
function parsePagesParam(text) {
  return String(text).split(",").map(part => {
    const match = part.match(/^(\d{1,2})([NS])\.(-?\d+)\.(-?\d+)$/);
    return match ? { zone: Number(match[1]), south: match[2] === "S", e: Number(match[3]), n: Number(match[4]) } : null;
  }).filter(validPage).slice(0, MAX_PDF_PAGES);
}

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    saved = {};
  }
  const query = new URLSearchParams(location.search);
  const options = normaliseOptions(saved.options);
  if (["ft", "m"].includes(query.get("u"))) options.units = query.get("u");
  const queryScale = Number(query.get("s"));
  const view = saved.view && Number.isFinite(saved.view.lat) && Number.isFinite(saved.view.lon) && Number.isFinite(saved.view.zoom)
    ? saved.view : DEFAULT_VIEW;
  return {
    mode: ["print", "garmin", "atak"].includes(saved.mode) ? saved.mode : "print",
    options,
    scale: isScale(queryScale) ? queryScale : isScale(saved.scale) ? saved.scale : 25000,
    orient: ["p", "l"].includes(query.get("o")) ? query.get("o") : saved.orient === "l" ? "l" : "p",
    pages: query.has("p") ? parsePagesParam(query.get("p")) : Array.isArray(saved.pages) ? saved.pages.filter(validPage).slice(0, MAX_PDF_PAGES) : [],
    activeKey: null,
    legend: saved.legend !== false,
    region: null,
    garminBudget: saved.garminBudget === 500 ? 500 : 100,
    garminZoom: null,          // tile zoom; null follows the device limit automatically
    atakMin: Number.isInteger(saved.atakMin) ? saved.atakMin : 10,
    atakMax: Number.isInteger(saved.atakMax) ? saved.atakMax : 15,
    view3d: false,
    view,
    undo: [],
    redo: [],
    busy: false,
  };
}

const state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: state.mode, options: state.options, scale: state.scale, orient: state.orient, pages: state.pages,
      legend: state.legend, garminBudget: state.garminBudget, atakMin: state.atakMin, atakMax: state.atakMax, view: state.view,
    }));
  } catch {
    // Storage can be full or blocked; the app works without it.
  }
}

const pageSize = () => pageGroundSize(state.scale, state.orient);

// ---------------------------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------------------------

let statusTimer = 0;
function flash(message, ms = 4200) {
  const node = $("status");
  node.textContent = message;
  clearTimeout(statusTimer);
  if (message && ms) statusTimer = setTimeout(() => { node.textContent = ""; }, ms);
}

const terrain = createTerrain(maplibregl, globalThis.mlcontour);
let gridData = EMPTY, gridLabelData = EMPTY;

function pagesGeoJson() {
  const size = pageSize();
  return {
    type: "FeatureCollection",
    features: state.pages.map((page, index) => ({
      type: "Feature",
      properties: { key: pageKey(page), number: index + 1, active: pageKey(page) === state.activeKey },
      geometry: { type: "Polygon", coordinates: [pageRing(page, size)] },
    })),
  };
}

function regionGeoJson() {
  const region = state.region;
  if (!region || state.mode === "print") return EMPTY;
  const ring = [[region.west, region.south], [region.east, region.south], [region.east, region.north], [region.west, region.north], [region.west, region.south]];
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
}

function mainStyle() {
  return buildStyle(state.options, {
    demTiles: terrain.demTiles,
    contourTiles: terrain.contourTiles,
    scale: 1,
    interactive: true,
    terrain: state.view3d,
    overlays: { grid: gridData, gridLabels: gridLabelData, pages: pagesGeoJson(), region: regionGeoJson() },
  });
}

let map;
try {
  map = new maplibregl.Map({
    container: "map",
    style: mainStyle(),
    center: [state.view.lon, state.view.lat],
    zoom: state.view.zoom,
    hash: "map",
    maxPitch: 75,
    boxZoom: false,
    attributionControl: false,
    validateStyle: false,
  });
} catch (error) {
  $("map").textContent = "This browser could not start the map. Topo Map Builder needs WebGL 2.";
  $("map").classList.add("noscript");
  throw error;
}
provideIcons(map, () => state.options.palette);
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
const scaleControl = new maplibregl.ScaleControl({ unit: state.options.units === "ft" ? "imperial" : "metric", maxWidth: 140 });
map.addControl(scaleControl, "bottom-left");

const readout = document.createElement("div");
readout.className = "maplibregl-ctrl readout";
readout.innerHTML = '<span>GN <b id="read-gn"></b></span><span>MN <b id="read-mn"></b></span><span>Z <b id="read-zoom"></b></span><span id="read-cursor"></span>';
map.addControl({ onAdd: () => readout, onRemove: () => readout.remove() }, "bottom-left");

function applyStyle() {
  map.setStyle(mainStyle(), { diff: true });
}

let tileErrorShown = false;
map.on("error", event => {
  if (tileErrorShown || state.busy) return;
  tileErrorShown = true;
  flash("Some map data did not load. Check the network connection.", 7000);
  setTimeout(() => { tileErrorShown = false; }, 30000);
  console.warn("Map error:", event.error?.message || event);
});

function refreshGrid() {
  if (!map.getSource("grid")) return;
  if (!state.options.toggles.grid) {
    gridData = EMPTY;
    gridLabelData = EMPTY;
  } else {
    const bounds = map.getBounds();
    const padLon = (bounds.getEast() - bounds.getWest()) * 0.15, padLat = (bounds.getNorth() - bounds.getSouth()) * 0.15;
    const grid = buildGrid({
      west: bounds.getWest() - padLon, east: bounds.getEast() + padLon,
      south: bounds.getSouth() - padLat, north: bounds.getNorth() + padLat,
      zoom: map.getZoom(),
    });
    gridData = { type: "FeatureCollection", features: grid.lines };
    gridLabelData = { type: "FeatureCollection", features: grid.labels };
  }
  map.getSource("grid").setData(gridData);
  map.getSource("gridLabels").setData(gridLabelData);
}

function refreshReadout() {
  const centre = map.getCenter();
  const lon = ((((centre.lng + 180) % 360) + 360) % 360) - 180;
  $("read-zoom").textContent = map.getZoom().toFixed(1);
  $("read-mn").textContent = formatAngleEW(declination(centre.lat, lon));
  $("read-gn").textContent = inMgrsRange(centre.lat) ? formatAngleEW(utmForward(centre.lat, lon).convergence) : "n/a";
}

let frameQueued = false;
function onMove() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    refreshGrid();
    refreshReadout();
  });
}
map.on("move", onMove);
map.on("moveend", () => {
  const centre = map.getCenter();
  state.view = { lat: Number(centre.lat.toFixed(5)), lon: Number(centre.lng.toFixed(5)), zoom: Number(map.getZoom().toFixed(2)) };
  saveState();
});
map.on("mousemove", event => {
  const { lat, lng } = event.lngLat;
  const lon = ((((lng + 180) % 360) + 360) % 360) - 180;
  $("read-cursor").textContent = toMgrs(lat, lon, 4) || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
});

// The pointer reference describes where the pointer is, so it goes blank when the pointer leaves.
map.on("mouseout", () => { $("read-cursor").textContent = ""; });

// ---------------------------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------------------------

function renderPagesOnMap() {
  map.getSource("pages")?.setData(pagesGeoJson());
}

function renderChips() {
  const size = pageSize();
  const list = $("chips");
  list.replaceChildren(...state.pages.map((page, index) => {
    const item = document.createElement("li");
    const key = pageKey(page);
    item.className = `chip${key === state.activeKey ? " active" : ""}`;
    const name = document.createElement("button");
    name.type = "button";
    name.className = "chip-name";
    name.dataset.key = key;
    name.title = "Select this page. Arrow keys move it 1 km.";
    name.setAttribute("aria-pressed", String(key === state.activeKey));
    const number = document.createElement("b");
    number.textContent = String(index + 1);
    name.append(number, pageName(page, size));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.dataset.remove = key;
    remove.setAttribute("aria-label", `Remove page ${index + 1}`);
    remove.textContent = "×";
    item.append(name, remove);
    return item;
  }));
}

function renderPrintPanel() {
  const count = state.pages.length;
  $("page-count").textContent = count ? `· ${count}` : "";
  $("scale-note").textContent = `Each page covers ${pageGroundText(state.scale, state.orient)} on US Letter.`;
  $("download").disabled = !count || state.busy;
  $("print").disabled = !count || state.busy;
  $("clear").disabled = !count;
  $("fit").disabled = !count;
  $("undo").disabled = !state.undo.length;
  $("redo").disabled = !state.redo.length;
  $("nudge").hidden = !state.pages.some(page => pageKey(page) === state.activeKey);
  $("estimate").textContent = count
    ? `${count} page${count === 1 ? "" : "s"} at 1:${state.scale.toLocaleString("en-US")}. Allow 10 to 30 seconds a page.`
    : "Pick at least one page to export.";
  $("region-pages").disabled = !count;
}

function pagesChanged() {
  if (!state.pages.some(page => pageKey(page) === state.activeKey)) state.activeKey = null;
  renderPagesOnMap();
  renderChips();
  renderPrintPanel();
  saveState();
}

/** Replace the page list, remembering the old one for Undo. */
function commitPages(pages, activeKey = state.activeKey) {
  state.undo.push({ pages: state.pages, scale: state.scale, orient: state.orient });
  if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
  state.redo = [];
  state.pages = pages;
  state.activeKey = activeKey;
  pagesChanged();
}

function stepHistory(from, to) {
  const snapshot = from.pop();
  if (!snapshot) return;
  to.push({ pages: state.pages, scale: state.scale, orient: state.orient });
  state.pages = snapshot.pages;
  state.scale = snapshot.scale;
  state.orient = snapshot.orient;
  syncSegments();
  pagesChanged();
}

function addPages(candidates) {
  const fresh = candidates.filter(candidate => !state.pages.some(page => samePage(page, candidate)));
  if (!fresh.length) return;
  const room = MAX_PDF_PAGES - state.pages.length;
  if (room <= 0) {
    flash(`A PDF holds at most ${MAX_PDF_PAGES} pages.`);
    return;
  }
  if (fresh.length > room) flash(`Added ${room} of ${fresh.length} pages: a PDF holds at most ${MAX_PDF_PAGES}.`);
  const added = fresh.slice(0, room);
  commitPages([...state.pages, ...added], pageKey(added[added.length - 1]));
}

function removePage(key) {
  commitPages(state.pages.filter(page => pageKey(page) !== key), state.activeKey === key ? null : state.activeKey);
}

function nudgeActive(de, dn) {
  const index = state.pages.findIndex(page => pageKey(page) === state.activeKey);
  if (index < 0) return;
  const moved = movePage(state.pages[index], de, dn);
  if (state.pages.some((page, i) => i !== index && samePage(page, moved))) return;
  const pages = state.pages.slice();
  pages[index] = moved;
  commitPages(pages, pageKey(moved));
}

function pageIndexAt(lngLat) {
  const size = pageSize();
  for (let i = state.pages.length - 1; i >= 0; i -= 1) {
    if (pageContains(state.pages[i], size, lngLat.lat, lngLat.lng)) return i;
  }
  return -1;
}

map.on("click", event => {
  if (state.mode !== "print" || state.busy) return;
  const hit = pageIndexAt(event.lngLat);
  if (hit >= 0) {
    removePage(pageKey(state.pages[hit]));
    return;
  }
  if (map.getZoom() < MIN_PICK_ZOOM) {
    flash("Zoom in to pick pages.");
    return;
  }
  if (!inMgrsRange(event.lngLat.lat)) {
    flash("Pages use the MGRS grid, which covers 80° S to 84° N.");
    return;
  }
  addPages([pageAt(event.lngLat.lat, event.lngLat.lng, state.scale, state.orient)]);
});

// Dragging a picked page moves it in whole kilometres.
let pageDrag = null;
map.on("mousedown", "pages-fill", event => {
  if (state.mode !== "print" || state.busy || event.originalEvent.shiftKey || event.originalEvent.button !== 0) return;
  const key = event.features?.[0]?.properties?.key;
  const index = state.pages.findIndex(page => pageKey(page) === key);
  if (index < 0) return;
  event.preventDefault();
  pageDrag = { index, start: event.lngLat, origin: state.pages[index], before: state.pages, moved: false };
  map.getCanvas().style.cursor = "grabbing";
});
map.on("mousemove", event => {
  if (!pageDrag) return;
  const { origin } = pageDrag;
  const from = utmForward(pageDrag.start.lat, pageDrag.start.lng, origin.zone, origin.south);
  const to = utmForward(event.lngLat.lat, event.lngLat.lng, origin.zone, origin.south);
  const stepped = movePage(origin, snapOffset(to.easting - from.easting), snapOffset(to.northing - from.northing));
  const others = pageDrag.before.filter((_, i) => i !== pageDrag.index);
  const moved = snapToNeighbours(stepped, others, pageSize());
  if (samePage(moved, state.pages[pageDrag.index])) return;
  pageDrag.moved = true;
  const pages = pageDrag.before.slice();
  pages[pageDrag.index] = moved;
  state.pages = pages;
  state.activeKey = pageKey(moved);
  renderPagesOnMap();
});
function endPageDrag() {
  if (!pageDrag) return;
  const drag = pageDrag;
  pageDrag = null;
  map.getCanvas().style.cursor = "";
  if (!drag.moved) return;
  const moved = state.pages[drag.index];
  // Dropping a page exactly onto another one merges them.
  const pages = state.pages.filter((page, i) => i === drag.index || !samePage(page, moved));
  state.pages = drag.before;
  commitPages(pages, pageKey(moved));
}
map.on("mouseup", endPageDrag);
window.addEventListener("mouseup", endPageDrag);
window.addEventListener("blur", endPageDrag);
map.on("mouseenter", "pages-fill", () => { if (state.mode === "print" && !pageDrag) map.getCanvas().style.cursor = "grab"; });
map.on("mouseleave", "pages-fill", () => { if (!pageDrag) map.getCanvas().style.cursor = ""; });

// Shift-drag draws a box: pages in print mode, the export region in device modes.
let boxDrag = null;
map.on("mousedown", event => {
  if (!event.originalEvent.shiftKey || event.originalEvent.button !== 0 || state.busy) return;
  event.preventDefault();
  boxDrag = { start: event.point, end: event.point };
});
map.on("mousemove", event => {
  if (!boxDrag) return;
  boxDrag.end = event.point;
  const box = $("dragbox");
  box.hidden = false;
  box.style.left = `${Math.min(boxDrag.start.x, boxDrag.end.x)}px`;
  box.style.top = `${Math.min(boxDrag.start.y, boxDrag.end.y)}px`;
  box.style.width = `${Math.abs(boxDrag.end.x - boxDrag.start.x)}px`;
  box.style.height = `${Math.abs(boxDrag.end.y - boxDrag.start.y)}px`;
});
function endBoxDrag() {
  if (!boxDrag) return;
  const drag = boxDrag;
  boxDrag = null;
  $("dragbox").hidden = true;
  if (Math.abs(drag.end.x - drag.start.x) < 6 || Math.abs(drag.end.y - drag.start.y) < 6) return;
  const a = map.unproject(drag.start), b = map.unproject(drag.end);
  const bounds = { west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng), south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat) };
  if (state.mode === "print") {
    if (map.getZoom() < MIN_PICK_ZOOM) {
      flash("Zoom in to pick pages.");
      return;
    }
    const picked = pagesInBounds(bounds, state.scale, state.orient, MAX_PDF_PAGES);
    if (picked.truncated) flash(`That area needs more than ${MAX_PDF_PAGES} pages. The first ${MAX_PDF_PAGES} were picked.`);
    addPages(picked.pages);
  } else {
    setRegion(bounds);
  }
}
map.on("mouseup", endBoxDrag);
window.addEventListener("mouseup", endBoxDrag);

// ---------------------------------------------------------------------------------------------
// Device region
// ---------------------------------------------------------------------------------------------

const handles = [];
function makeHandle(kind) {
  const element = document.createElement("div");
  element.className = `region-handle${kind === "grip" ? " grip" : ""}`;
  element.title = kind === "grip" ? "Drag to move the region" : "Drag to resize the region";
  const marker = new maplibregl.Marker({ element, draggable: true });
  marker.on("drag", () => {
    const position = marker.getLngLat();
    const region = { ...state.region };
    if (kind === "grip") {
      const halfLon = (region.east - region.west) / 2, halfLat = (region.north - region.south) / 2;
      region.west = position.lng - halfLon; region.east = position.lng + halfLon;
      region.south = position.lat - halfLat; region.north = position.lat + halfLat;
    } else {
      if (kind.includes("w")) region.west = position.lng; else region.east = position.lng;
      if (kind.includes("s")) region.south = position.lat; else region.north = position.lat;
    }
    setRegion(region, marker);
  });
  marker.on("dragend", () => setRegion(state.region));
  return { kind, marker };
}
for (const kind of ["sw", "se", "ne", "nw", "grip"]) handles.push(makeHandle(kind));

function placeHandles(except) {
  const region = state.region;
  const visible = region && state.mode !== "print";
  for (const { kind, marker } of handles) {
    if (!visible) {
      marker.remove();
      continue;
    }
    if (marker !== except) {
      const lng = kind === "grip" ? (region.west + region.east) / 2 : kind.includes("w") ? region.west : region.east;
      const lat = kind === "grip" ? (region.south + region.north) / 2 : kind.includes("s") ? region.south : region.north;
      marker.setLngLat([lng, lat]);
    }
    marker.addTo(map);
  }
}

function setRegion(bounds, draggingMarker) {
  state.region = draggingMarker ? bounds : normaliseRegion(bounds);
  map.getSource("region")?.setData(regionGeoJson());
  placeHandles(draggingMarker);
  renderDevicePanel();
}

function regionFromView() {
  const bounds = map.getBounds();
  const lon = (bounds.getEast() - bounds.getWest()) * 0.2, lat = (bounds.getNorth() - bounds.getSouth()) * 0.2;
  setRegion({ west: bounds.getWest() + lon, east: bounds.getEast() - lon, south: bounds.getSouth() + lat, north: bounds.getNorth() - lat });
}

function metresPerPixel(tileZoom, lat) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** tileZoom);
}

function renderDevicePanel() {
  const region = state.region && normaliseRegion(state.region);
  const ready = Boolean(region) && region.east > region.west && region.north > region.south;
  $("bake").disabled = !ready || state.busy;
  if (!ready) {
    $("region-read").textContent = "No region yet.";
    return;
  }
  const km = regionSizeKm(region);
  $("region-read").textContent = `${km.width.toFixed(1)} × ${km.height.toFixed(1)} km  ·  ${toMgrs((region.south + region.north) / 2, (region.west + region.east) / 2, 2) || "outside MGRS"}`;
  const midLat = (region.south + region.north) / 2;
  const resolution = zoom => {
    const metres = metresPerPixel(zoom, midLat);
    return metres >= 10 ? `${metres.toFixed(0)} m` : `${metres.toFixed(1)} m`;
  };

  if (state.mode === "garmin") {
    const auto = bestGarminZoom(region, state.garminBudget) + 1;
    const zoom = state.garminZoom ?? auto;
    const plan = planGarmin(region, zoom - 1);
    $("garmin-zoom").value = String(zoom);
    $("garmin-read").textContent = `· zoom ${zoom}`;
    const over = plan.count > state.garminBudget;
    $("garmin-hint").className = over ? "hint warn" : "hint";
    $("garmin-hint").textContent = over
      ? `${plan.count} images is more than the device holds. Lower the detail or shrink the region.`
      : `${plan.count} image${plan.count === 1 ? "" : "s"}, about ${resolution(zoom)} per pixel, roughly ${Math.max(1, Math.round(plan.count * 0.22))} MB.`;
    $("bake").disabled = over || state.busy;
    $("bake").textContent = "Build Garmin KMZ";
    $("bake-how").textContent = "Copy the KMZ to Garmin/CustomMaps on the device or its memory card.";
  } else if (state.mode === "atak") {
    $("atak-min").value = String(state.atakMin);
    $("atak-max").value = String(state.atakMax);
    const plan = planMbtiles(region, state.atakMin, state.atakMax);
    $("atak-read").textContent = `· ${state.atakMin} to ${state.atakMax}`;
    const over = plan.count > ATAK_MAX_TILES;
    $("atak-hint").className = over ? "hint warn" : "hint";
    $("atak-hint").textContent = over
      ? `${plan.count.toLocaleString("en-US")} tiles is over the ${ATAK_MAX_TILES.toLocaleString("en-US")} limit. Lower the top zoom or shrink the region.`
      : `${plan.count.toLocaleString("en-US")} tiles, finest ${resolution(state.atakMax)} per pixel, roughly ${Math.max(1, Math.round(plan.count * 0.02))} MB.`;
    $("bake").disabled = over || state.busy;
    $("bake").textContent = "Build ATAK MBTiles";
    $("bake-how").textContent = "Import the file with ATAK's Import Manager, or copy it to atak/imagery.";
  }
}

// ---------------------------------------------------------------------------------------------
// Panel controls
// ---------------------------------------------------------------------------------------------

/** Wire a radio group of buttons; arrow keys move the choice, as they do for native radios. */
function bindSegment(container, getValue, onChange) {
  const buttons = () => [...container.querySelectorAll('[role="radio"]')];
  const sync = () => {
    for (const button of buttons()) {
      const checked = button.dataset.v === String(getValue());
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  };
  container.addEventListener("click", event => {
    const button = event.target.closest('[role="radio"]');
    if (!button || button.dataset.v === String(getValue())) return;
    onChange(button.dataset.v);
    sync();
  });
  container.addEventListener("keydown", event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const list = buttons();
    const next = list[(list.indexOf(document.activeElement) + step + list.length) % list.length];
    next.focus();
    next.click();
  });
  sync();
  return sync;
}

const segmentSyncs = [];
function syncSegments() {
  for (const sync of segmentSyncs) sync();
}

function setOption(key, value) {
  state.options = normaliseOptions({ ...state.options, [key]: value });
  if (key === "palette") {
    for (const id of ["peak", "dot"]) if (map.hasImage(id)) map.removeImage(id);
  }
  if (key === "units") scaleControl.setUnit(value === "ft" ? "imperial" : "metric");
  applyStyle();
  saveState();
}

for (const container of document.querySelectorAll(".seg[data-setting]")) {
  const key = container.dataset.setting;
  segmentSyncs.push(bindSegment(container, () => state.options[key], value => setOption(key, value)));
}

$("scale-seg").replaceChildren(...SCALES.map(scale => {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "radio");
  button.dataset.v = String(scale.value);
  button.title = `1:${scale.value.toLocaleString("en-US")}`;
  const note = document.createElement("small");
  note.textContent = pageGroundText(scale.value, "p").replace(" km", "");
  button.append(scale.label, note);
  return button;
}));

function reshapePages(scale, orient) {
  const oldSize = pageSize();
  const newSize = pageGroundSize(scale, orient);
  const pages = [];
  for (const page of state.pages) {
    const resized = resizePage(page, oldSize, newSize);
    if (!pages.some(other => samePage(other, resized))) pages.push(resized);
  }
  state.undo.push({ pages: state.pages, scale: state.scale, orient: state.orient });
  state.redo = [];
  state.scale = scale;
  state.orient = orient;
  state.pages = pages;
  state.activeKey = null;
  pagesChanged();
}
segmentSyncs.push(bindSegment($("scale-seg"), () => state.scale, value => reshapePages(Number(value), state.orient)));
segmentSyncs.push(bindSegment($("orient-seg"), () => state.orient, value => reshapePages(state.scale, value)));

function buildToggle(toggle) {
  const item = document.createElement("li");
  item.className = "toggle";
  const label = document.createElement("span");
  label.textContent = toggle.label;
  label.id = `toggle-${toggle.key}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "switch";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-labelledby", label.id);
  button.setAttribute("aria-checked", String(state.options.toggles[toggle.key]));
  button.addEventListener("click", () => {
    const next = !state.options.toggles[toggle.key];
    state.options = normaliseOptions({ ...state.options, toggles: { ...state.options.toggles, [toggle.key]: next } });
    button.setAttribute("aria-checked", String(next));
    applyStyle();
    if (toggle.key === "grid") refreshGrid();
    saveState();
  });
  item.append(label, button);
  return item;
}
$("toggles-main").replaceChildren(...LAYER_TOGGLES.filter(toggle => toggle.group === "main").map(buildToggle));
{
  const groups = [...new Set(LAYER_TOGGLES.filter(toggle => toggle.group !== "main").map(toggle => toggle.group))];
  $("toggles-more").replaceChildren(...groups.flatMap(group => {
    const heading = document.createElement("h3");
    heading.textContent = group;
    const list = document.createElement("ul");
    list.className = "toggles";
    list.append(...LAYER_TOGGLES.filter(toggle => toggle.group === group).map(buildToggle));
    return [heading, list];
  }));
}

function setMode(mode) {
  state.mode = mode;
  for (const tab of $("tabs").querySelectorAll('[role="tab"]')) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const section of document.querySelectorAll("[data-modes]")) {
    section.hidden = !section.dataset.modes.split(" ").includes(mode);
  }
  if (mode !== "print" && !state.region) regionFromView();
  map.getSource("region")?.setData(regionGeoJson());
  placeHandles();
  renderDevicePanel();
  saveState();
}
$("tabs").addEventListener("click", event => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) setMode(tab.dataset.mode);
});
$("tabs").addEventListener("keydown", event => {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const tabs = [...$("tabs").querySelectorAll('[role="tab"]')];
  const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
  next.focus();
  next.click();
});

$("chips").addEventListener("click", event => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    removePage(remove.dataset.remove);
    return;
  }
  const chip = event.target.closest("[data-key]");
  if (!chip) return;
  state.activeKey = state.activeKey === chip.dataset.key ? null : chip.dataset.key;
  pagesChanged();
  $("chips").querySelector(`[data-key="${CSS.escape(chip.dataset.key)}"]`)?.focus();
});
$("chips").addEventListener("keydown", event => {
  const move = { ArrowLeft: [-MOVE_STEP_M, 0], ArrowRight: [MOVE_STEP_M, 0], ArrowUp: [0, MOVE_STEP_M], ArrowDown: [0, -MOVE_STEP_M] }[event.key];
  const chip = event.target.closest("[data-key]");
  if (!move || !chip) return;
  event.preventDefault();
  state.activeKey = chip.dataset.key;
  nudgeActive(...move);
  $("chips").querySelector(`[data-key="${CSS.escape(state.activeKey)}"]`)?.focus();
});
$("nudge").addEventListener("click", event => {
  const direction = event.target.closest("[data-nudge]")?.dataset.nudge;
  if (!direction) return;
  nudgeActive(...{ w: [-MOVE_STEP_M, 0], e: [MOVE_STEP_M, 0], n: [0, MOVE_STEP_M], s: [0, -MOVE_STEP_M] }[direction]);
});
$("clear").addEventListener("click", () => { if (state.pages.length) commitPages([], null); });
$("undo").addEventListener("click", () => stepHistory(state.undo, state.redo));
$("redo").addEventListener("click", () => stepHistory(state.redo, state.undo));
$("fit").addEventListener("click", () => {
  const bounds = pagesBounds(state.pages, pageSize());
  if (bounds) map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 60, maxZoom: 14 });
});
$("legend-page").checked = state.legend;
$("legend-page").addEventListener("change", event => { state.legend = event.target.checked; saveState(); });

document.addEventListener("keydown", event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.target.matches?.("input, textarea, select")) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) { event.preventDefault(); stepHistory(state.undo, state.redo); }
  else if ((key === "z" && event.shiftKey) || key === "y") { event.preventDefault(); stepHistory(state.redo, state.undo); }
});

$("region-fit").addEventListener("click", regionFromView);
$("region-pages").addEventListener("click", () => {
  const bounds = pagesBounds(state.pages, pageSize());
  if (bounds) setRegion(bounds);
});
$("garmin-budget").value = String(state.garminBudget);
$("garmin-budget").addEventListener("change", event => {
  state.garminBudget = Number(event.target.value);
  state.garminZoom = null;
  renderDevicePanel();
  saveState();
});
$("garmin-zoom").addEventListener("input", event => { state.garminZoom = Number(event.target.value); renderDevicePanel(); });
$("atak-min").min = $("atak-max").min = String(ATAK_MIN_ZOOM);
$("atak-min").max = $("atak-max").max = String(ATAK_MAX_ZOOM);
$("atak-min").addEventListener("input", event => {
  state.atakMin = Number(event.target.value);
  state.atakMax = Math.max(state.atakMax, state.atakMin);
  renderDevicePanel();
  saveState();
});
$("atak-max").addEventListener("input", event => {
  state.atakMax = Number(event.target.value);
  state.atakMin = Math.min(state.atakMin, state.atakMax);
  renderDevicePanel();
  saveState();
});

bindSegment($("view-seg"), () => (state.view3d ? "3d" : "2d"), value => {
  state.view3d = value === "3d";
  applyStyle();
  map.easeTo(state.view3d ? { pitch: 62, duration: 900 } : { pitch: 0, bearing: 0, duration: 700 });
});

$("panel-toggle").addEventListener("click", () => {
  const closed = $("panel").classList.toggle("closed");
  $("panel-toggle").setAttribute("aria-expanded", String(!closed));
  map.resize();
});
if (matchMedia("(max-width: 860px)").matches) {
  $("panel").classList.add("closed");
  $("panel-toggle").setAttribute("aria-expanded", "false");
}
$("help-open").addEventListener("click", () => $("help").showModal());
$("version").textContent = `v${APP_VERSION}`;

// ---------------------------------------------------------------------------------------------
// Go to: coordinates, MGRS, or a place name
// ---------------------------------------------------------------------------------------------

function hideSuggestions() {
  $("suggest").hidden = true;
  $("suggest").replaceChildren();
}

function goToPlace(place) {
  const box = place.boundingbox?.map(Number);
  if (box?.length === 4 && box.every(Number.isFinite) && (box[1] - box[0] > 0.002 || box[3] - box[2] > 0.002)) {
    map.fitBounds([[box[2], box[0]], [box[3], box[1]]], { maxZoom: 13, padding: 40 });
  } else {
    map.flyTo({ center: [Number(place.lon), Number(place.lat)], zoom: Math.max(map.getZoom(), 13) });
  }
}

async function searchPlaces(text) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const results = await response.json();
  return Array.isArray(results) ? results.filter(place => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon))) : [];
}

let searchToken = 0;
$("goto").addEventListener("submit", async event => {
  event.preventDefault();
  const text = $("goto-input").value.trim();
  if (!text) return;
  hideSuggestions();
  const position = parseLatLon(text);
  if (position) {
    map.flyTo({ center: [position.lon, position.lat], zoom: Math.max(map.getZoom(), 12.5) });
    return;
  }
  const reference = parseMgrs(text);
  if (reference) {
    const zoom = reference.size >= 100000 ? 8.5 : reference.size >= 10000 ? 11 : reference.size >= 1000 ? 13.5 : 15.5;
    map.flyTo({ center: [reference.lon, reference.lat], zoom });
    return;
  }
  const token = ++searchToken;
  $("goto-submit").disabled = true;
  try {
    const places = await searchPlaces(text);
    if (token !== searchToken) return;
    if (!places.length) {
      flash(`No place found for "${text}". Try a town and state, an MGRS reference, or "lat, lon".`);
      return;
    }
    goToPlace(places[0]);
    if (places.length > 1) {
      $("suggest").replaceChildren(...places.map(place => {
        const item = document.createElement("li");
        item.setAttribute("role", "none");
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        const [head, ...rest] = String(place.display_name || "").split(", ");
        const detail = document.createElement("small");
        detail.textContent = rest.join(", ");
        button.append(head || "Unnamed place", detail);
        button.addEventListener("click", () => { goToPlace(place); hideSuggestions(); });
        item.append(button);
        return item;
      }));
      $("suggest").hidden = false;
    }
  } catch (error) {
    if (token === searchToken) flash("Place search is unavailable right now. MGRS references and coordinates still work.");
    console.warn(error);
  } finally {
    if (token === searchToken) $("goto-submit").disabled = false;
  }
});
document.addEventListener("click", event => { if (!event.target.closest("#goto")) hideSuggestions(); });
$("goto").addEventListener("keydown", event => { if (event.key === "Escape") hideSuggestions(); });

$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) {
    flash("This browser does not offer a location.");
    return;
  }
  flash("Finding your location…", 0);
  navigator.geolocation.getCurrentPosition(
    position => {
      flash("");
      map.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: Math.max(map.getZoom(), 13) });
    },
    () => flash("Your location is not available. Check the browser's location permission."),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
});

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

function loadScript(src, ready) {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Run an export behind the progress dialog, with Cancel and tidy error reporting. */
async function withProgress(title, work) {
  if (state.busy) return null;
  state.busy = true;
  const controller = new AbortController();
  const dialog = $("progress"), bar = $("progress-bar"), label = $("progress-label");
  const cancel = () => controller.abort();
  const previousFocus = document.activeElement;
  label.textContent = title;
  bar.value = 0;
  dialog.hidden = false;
  document.querySelector(".layout").inert = true;
  document.querySelector(".topbar").inert = true;
  $("progress-cancel").addEventListener("click", cancel);
  $("progress-cancel").focus();
  renderPrintPanel();
  renderDevicePanel();
  try {
    return await work(controller.signal, (done, total, text) => {
      bar.value = total ? done / total : 0;
      if (text) label.textContent = text;
    });
  } catch (error) {
    if (error instanceof RenderCancelled) flash("Cancelled.");
    else {
      console.error(error);
      flash(error.message || "The export failed.", 9000);
    }
    return null;
  } finally {
    state.busy = false;
    dialog.hidden = true;
    document.querySelector(".layout").inert = false;
    document.querySelector(".topbar").inert = false;
    $("progress-cancel").removeEventListener("click", cancel);
    renderPrintPanel();
    renderDevicePanel();
    previousFocus?.focus?.();
  }
}

function pdfName() {
  const first = state.pages[0];
  const stem = pageName(first, pageSize()).replace(/\s+/g, "");
  return `topo-${stem}-${state.scale / 1000}k${state.pages.length > 1 ? `-${state.pages.length}pages` : ""}.pdf`;
}

/**
 * Offer a finished PDF for printing. The new tab is opened by the visitor's own click on a link:
 * a tab opened by script after a long render is treated as a pop-up and blocked, and one opened
 * before the render would push this tab into the background, where browsers pause drawing.
 */
function offerPrint(blob) {
  const dialog = $("progress"), link = $("progress-open");
  const url = URL.createObjectURL(blob);
  const previousFocus = document.activeElement;
  const chrome = [document.querySelector(".layout"), document.querySelector(".topbar")];
  const close = () => {
    dialog.hidden = true;
    $("progress-done").hidden = true;
    $("progress-working").hidden = false;
    for (const node of chrome) node.inert = false;
    link.removeEventListener("click", close);
    $("progress-close").removeEventListener("click", close);
    dialog.removeEventListener("keydown", onKey);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
    previousFocus?.focus?.();
  };
  const onKey = event => { if (event.key === "Escape") close(); };
  $("progress-label").textContent = "The map is ready to print";
  $("progress-working").hidden = true;
  $("progress-done").hidden = false;
  link.href = url;
  for (const node of chrome) node.inert = true;
  dialog.hidden = false;
  link.addEventListener("click", close);
  $("progress-close").addEventListener("click", close);
  dialog.addEventListener("keydown", onKey);
  link.focus();
}

async function runPdf(kind) {
  if (!state.pages.length) return;
  const result = await withProgress("Preparing the map", async (signal, onProgress) => {
    await loadScript("vendor/jspdf-4.2.1/jspdf.umd.min.js", () => Boolean(globalThis.jspdf));
    return exportPdf({ maplibregl, jsPDF: globalThis.jspdf.jsPDF, terrain }, {
      pages: state.pages, scale: state.scale, orient: state.orient, options: state.options, legend: state.legend, onProgress, signal,
    });
  });
  if (!result) return;
  if (kind === "print") {
    offerPrint(result.blob);
  } else {
    saveBlob(result.blob, pdfName());
    flash("PDF downloaded.", 8000);
  }
  if (result.missingTiles) flash(`Done, but ${result.missingTiles} map requests failed, so parts of a page may be blank.`, 10000);
}
$("download").addEventListener("click", () => runPdf("download"));
$("print").addEventListener("click", () => runPdf("print"));

function shareUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("u", state.options.units);
  url.searchParams.set("s", String(state.scale));
  url.searchParams.set("o", state.orient);
  if (state.pages.length) {
    url.searchParams.set("p", state.pages.map(page => `${page.zone}${page.south ? "S" : "N"}.${Math.round(page.e)}.${Math.round(page.n)}`).join(","));
  }
  return url.href;
}
$("share").addEventListener("click", async () => {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    flash(state.pages.length ? "Link to these pages copied." : "Link to this view copied.");
  } catch {
    history.replaceState(null, "", url);
    flash("Copy the link from the address bar.", 8000);
  }
});

$("bake").addEventListener("click", async () => {
  if (!state.region) return;
  const region = normaliseRegion(state.region);
  const garmin = state.mode === "garmin";
  const result = await withProgress(garmin ? "Preparing the Garmin map" : "Preparing the ATAK tiles", (signal, onProgress) => (garmin
    ? bakeGarmin({ maplibregl, terrain }, {
      region, zoom: (state.garminZoom ?? bestGarminZoom(region, state.garminBudget) + 1) - 1, options: state.options, onProgress, signal,
    })
    : bakeMbtiles({ maplibregl, terrain }, { region, minZoom: state.atakMin, maxZoom: state.atakMax, options: state.options, onProgress, signal })));
  if (!result) return;
  saveBlob(result.blob, result.name);
  flash(result.missingTiles
    ? `Saved ${result.name}, but ${result.missingTiles} map requests failed, so parts may be blank.`
    : `Saved ${result.name}.`, 9000);
});

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

syncSegments();
setMode(state.mode);
renderChips();
renderPrintPanel();

const ready = new Promise(resolve => {
  map.once("load", () => {
    refreshGrid();
    refreshReadout();
    renderPagesOnMap();
    if (new URLSearchParams(location.search).has("p") && state.pages.length && !location.hash.includes("map=")) {
      const bounds = pagesBounds(state.pages, pageSize());
      map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 60, maxZoom: 14, animate: false });
    }
    resolve();
  });
});
// The grid and overlays live in the style, so they are refreshed whenever a new style settles.
map.on("styledata", () => {
  if (map.getSource("grid") && gridData === EMPTY && state.options.toggles.grid) onMove();
});

/** A small handle for the browser tests and for debugging from the console. */
globalThis.topoApp = { version: APP_VERSION, map, state, ready, shareUrl };
