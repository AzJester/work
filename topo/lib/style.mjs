// The topographic map style for Topo Map Builder, built as plain MapLibre style JSON.
// Vector data: OpenFreeMap (OpenMapTiles schema, OpenStreetMap data). Terrain: Mapzen terrain tiles
// on AWS. Contours are cut in the browser from the terrain tiles by maplibre-contour.
//
// One function builds every variant: the on-screen map, the print render (drawn larger, so it
// reads tiles one zoom deeper for the same paper size) and the device-tile render.

export const VECTOR_TILEJSON = "https://tiles.openfreemap.org/planet";
export const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const DEM_MAX_ZOOM = 14;
export const FEET_PER_METRE = 3.28084;

const DEM_ATTRIBUTION = 'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Mapzen terrain tiles</a>';
const FONT = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Bold"], italic: ["Noto Sans Italic"] };

export const PALETTES = {
  colour: {
    land: "#fbfaf4", wood: "#d2e5bd", grass: "#e7efd6", farmland: "#f5f1e0", wetland: "#d6eae2", sand: "#f1e6c3",
    rock: "#e2ddd5", ice: "#edf5fa", residential: "#f0eae2", civic: "#ece6ee", military: "#f1d5d1",
    militaryLine: "#b9534c", cemetery: "#dde7d3", quarry: "#e1dacd", park: "#bfe0b4", parkLine: "#4f8f4b",
    parkText: "#2c6a2c", water: "#bbdcf2", waterLine: "#3f86b8", waterText: "#1c5c8c",
    contour: "#b0722c", contourIndex: "#93581a", contourText: "#7a4812", building: "#585858",
    roadMajor: "#c8372d", roadMajorCase: "#7c2019", roadSecondary: "#e2812f", roadSecondaryCase: "#8a4712",
    roadMinor: "#ffffff", roadMinorCase: "#3b3b3b", service: "#5b5b5b", track: "#4b3a2b", path: "#2a2a2a",
    rail: "#222222", runway: "#a6a6b2", apron: "#e4e4ea", boundary: "#7b5d8c", ferry: "#3f86b8",
    grid: "#1b2f52", gridText: "#12233f", text: "#171717", textMuted: "#454545", halo: "#ffffff",
    peak: "#6a3c0c", poi: "#3d3d3d", shadow: "#3a3a3a", highlight: "#ffffff", accent: "#d9480f",
  },
  bw: {
    land: "#ffffff", wood: "#ededed", grass: "#f6f6f6", farmland: "#fafafa", wetland: "#e9e9e9", sand: "#f4f4f4",
    rock: "#e6e6e6", ice: "#fbfbfb", residential: "#f3f3f3", civic: "#f0f0f0", military: "#e4e4e4",
    militaryLine: "#555555", cemetery: "#ebebeb", quarry: "#e4e4e4", park: "#e2e2e2", parkLine: "#6a6a6a",
    parkText: "#333333", water: "#d2d2d2", waterLine: "#4a4a4a", waterText: "#222222",
    contour: "#8a8a8a", contourIndex: "#5c5c5c", contourText: "#3c3c3c", building: "#4a4a4a",
    roadMajor: "#1a1a1a", roadMajorCase: "#000000", roadSecondary: "#555555", roadSecondaryCase: "#111111",
    roadMinor: "#ffffff", roadMinorCase: "#222222", service: "#555555", track: "#333333", path: "#222222",
    rail: "#111111", runway: "#9a9a9a", apron: "#e6e6e6", boundary: "#555555", ferry: "#4a4a4a",
    grid: "#000000", gridText: "#000000", text: "#000000", textMuted: "#333333", halo: "#ffffff",
    peak: "#222222", poi: "#333333", shadow: "#2b2b2b", highlight: "#ffffff", accent: "#000000",
  },
};

/** Layer switches shown in the panel. `key` is stored in settings; `on` is the default. */
export const LAYER_TOGGLES = [
  { key: "trees", label: "Tree cover", group: "main", on: true },
  { key: "buildings", label: "Buildings", group: "main", on: true },
  { key: "roads", label: "Roads", group: "main", on: true },
  { key: "trails", label: "Trails and tracks", group: "main", on: true },
  { key: "grid", label: "MGRS grid lines", group: "main", on: true },
  { key: "gridNumbers", label: "Grid numbers", group: "main", on: true },
  { key: "peaks", label: "Peaks and hilltops", group: "Terrain", on: true },
  { key: "ground", label: "Wetland, sand, rock, ice", group: "Cover", on: true },
  { key: "landuse", label: "Town and land-use tints", group: "Cover", on: true },
  { key: "restricted", label: "Military, cemetery, quarry", group: "Cover", on: true },
  { key: "parks", label: "Parks and protected land", group: "Cover", on: true },
  { key: "intermittent", label: "Intermittent streams", group: "Water", on: true },
  { key: "waterNames", label: "Water names", group: "Water", on: true },
  { key: "rail", label: "Railways", group: "Transport", on: true },
  { key: "airfields", label: "Airfields", group: "Transport", on: true },
  { key: "roadNames", label: "Road names and numbers", group: "Transport", on: true },
  { key: "trailNames", label: "Trail names", group: "Transport", on: true },
  { key: "places", label: "Place names", group: "Places", on: true },
  { key: "pois", label: "Points of interest", group: "Places", on: true },
  { key: "boundaries", label: "Admin boundaries", group: "Places", on: true },
];

export const DEFAULT_OPTIONS = {
  units: "ft",          // "ft" or "m": contour and peak elevations
  labels: "full",       // "sparse" or "full"
  palette: "colour",    // "colour" or "bw"
  relief: "sharp",      // "off", "soft" or "sharp"
  contours: "sparse",   // "off", "sparse" or "full"
  toggles: Object.fromEntries(LAYER_TOGGLES.map(toggle => [toggle.key, toggle.on])),
};

/** Merge stored or partial options over the defaults, discarding anything unrecognised. */
export function normaliseOptions(options = {}) {
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  const toggles = { ...DEFAULT_OPTIONS.toggles };
  for (const toggle of LAYER_TOGGLES) {
    if (typeof options.toggles?.[toggle.key] === "boolean") toggles[toggle.key] = options.toggles[toggle.key];
  }
  return {
    units: pick(options.units, ["ft", "m"], DEFAULT_OPTIONS.units),
    labels: pick(options.labels, ["sparse", "full"], DEFAULT_OPTIONS.labels),
    palette: pick(options.palette, ["colour", "bw"], DEFAULT_OPTIONS.palette),
    relief: pick(options.relief, ["off", "soft", "sharp"], DEFAULT_OPTIONS.relief),
    contours: pick(options.contours, ["off", "sparse", "full"], DEFAULT_OPTIONS.contours),
    toggles,
  };
}

/**
 * Contour spacing by tile zoom for the on-screen map, as [minor, index] in the chosen unit.
 * The spacing at each zoom matches what a print at the corresponding scale uses, so the screen
 * previews the sheet. "Sparse" doubles the spacing.
 */
export function contourThresholds(units, density) {
  const table = units === "ft"
    ? { 9: [500, 2500], 10: [200, 1000], 11: [100, 500], 12: [40, 200], 13: [20, 100], 15: [10, 50] }
    : { 9: [200, 1000], 10: [100, 500], 11: [50, 250], 12: [20, 100], 13: [10, 50], 15: [5, 25] };
  if (density !== "sparse") return table;
  return Object.fromEntries(Object.entries(table).map(([zoom, [minor, index]]) => [zoom, [minor * 2, index * 2]]));
}

/** Fixed contour spacing for a print scale: [interval, index interval] in the chosen unit. */
export function printContourInterval(scaleInfo, units, density) {
  const base = units === "ft" ? scaleInfo.contourFt : scaleInfo.contourM;
  const interval = density === "sparse" ? base * 2 : base;
  return [interval, interval * 5];
}

const lineOnly = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const polygonOnly = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const pointOnly = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
const classIn = (...classes) => ["match", ["get", "class"], classes, true, false];
const notTunnel = ["!=", ["coalesce", ["get", "brunnel"], ""], "tunnel"];
const isTunnel = ["==", ["coalesce", ["get", "brunnel"], ""], "tunnel"];
const displayName = ["coalesce", ["get", "name_en"], ["get", "name"], ""];

const POI_CLASSES = [
  "hospital", "police", "fire_station", "school", "college", "campsite", "shelter", "lodging", "fuel",
  "place_of_worship", "railway", "town_hall", "post", "attraction", "information", "castle", "museum",
  "cemetery", "ranger_station", "ferry_terminal", "harbor",
];

/**
 * Build a style.
 *
 * `options` are the user's map settings (see DEFAULT_OPTIONS). `context` describes the render:
 *   demTiles        tile URL for the terrain source (the contour plugin's shared protocol)
 *   contourTiles    function (thresholds, multiplier) -> tile URL for the contour source
 *   scale           drawing scale: 1 on screen, 2 for print (everything is drawn twice as large and
 *                   zoom-dependent rules shift one zoom deeper, so print keeps screen cartography)
 *   contourInterval optional fixed [interval, index] for print
 *   terrain         true to add a second terrain source for the 3D preview
 *   overlays        optional GeoJSON for grid lines, grid labels, picked pages and the device region
 *   interactive     true on the main map: adds the page and region overlay layers
 */
export function buildStyle(options, context) {
  const o = normaliseOptions(options);
  const c = PALETTES[o.palette];
  const S = context.scale || 1;
  const shift = Math.log2(S);
  const z = zoom => zoom + shift;
  const px = value => value * S;
  const full = o.labels === "full";
  const on = o.toggles;
  const imperial = o.units === "ft";
  const empty = { type: "FeatureCollection", features: [] };
  const overlays = context.overlays || {};

  /** Zoom-interpolated size: pairs of [screen zoom, screen px]. */
  const grow = (...stops) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flatMap(([zoom, value]) => [z(zoom), px(value)])];

  const sources = {
    omt: { type: "vector", url: VECTOR_TILEJSON },
    grid: { type: "geojson", data: overlays.grid || empty },
    gridLabels: { type: "geojson", data: overlays.gridLabels || empty },
  };
  const needsDem = o.relief !== "off" || context.terrain;
  if (needsDem) {
    sources.dem = { type: "raster-dem", tiles: [context.demTiles], encoding: "terrarium", tileSize: 256, maxzoom: DEM_MAX_ZOOM, attribution: DEM_ATTRIBUTION };
  }
  if (context.terrain) {
    sources.demTerrain = { type: "raster-dem", tiles: [context.demTiles], encoding: "terrarium", tileSize: 256, maxzoom: DEM_MAX_ZOOM };
  }
  if (o.contours !== "off") {
    const thresholds = context.contourInterval ? { 5: context.contourInterval } : contourThresholds(o.units, o.contours);
    sources.contours = {
      type: "vector",
      tiles: [context.contourTiles(thresholds, imperial ? FEET_PER_METRE : 1)],
      maxzoom: 15,
      // Credit the terrain data once: on the terrain source when it is present, otherwise here.
      ...(needsDem ? {} : { attribution: DEM_ATTRIBUTION }),
    };
  }
  if (context.interactive) {
    sources.pages = { type: "geojson", data: overlays.pages || empty };
    sources.region = { type: "geojson", data: overlays.region || empty };
  }

  const layers = [];
  const add = layer => layers.push(layer);
  const omt = (id, type, sourceLayer, rest) => add({ id, type, source: "omt", "source-layer": sourceLayer, ...rest });
  const text = (size, font = FONT.regular, more = {}) => ({
    "text-font": font,
    "text-size": typeof size === "number" ? px(size) : size,
    "text-padding": px(2),
    ...more,
  });
  const ink = (color, haloWidth = 1.4, more = {}) => ({
    "text-color": color,
    "text-halo-color": c.halo,
    "text-halo-width": px(haloWidth),
    ...more,
  });

  add({ id: "land", type: "background", paint: { "background-color": c.land } });

  // --- Ground cover -------------------------------------------------------------------------
  if (on.landuse) {
    omt("cover-grass", "fill", "landcover", { filter: classIn("grass"), paint: { "fill-color": c.grass } });
    omt("cover-farmland", "fill", "landcover", { filter: classIn("farmland"), paint: { "fill-color": c.farmland } });
    omt("landuse-residential", "fill", "landuse", {
      filter: classIn("residential", "suburb", "neighbourhood"), maxzoom: z(15),
      paint: { "fill-color": c.residential },
    });
    omt("landuse-civic", "fill", "landuse", {
      filter: classIn("commercial", "industrial", "retail", "school", "university", "college", "hospital", "railway", "bus_station"),
      paint: { "fill-color": c.civic },
    });
  }
  if (on.ground) {
    omt("cover-sand", "fill", "landcover", { filter: classIn("sand"), paint: { "fill-color": c.sand } });
    omt("cover-rock", "fill", "landcover", { filter: classIn("rock"), paint: { "fill-color": c.rock } });
    omt("cover-ice", "fill", "landcover", { filter: classIn("ice"), paint: { "fill-color": c.ice } });
    omt("cover-wetland", "fill", "landcover", { filter: classIn("wetland"), paint: { "fill-color": c.wetland } });
  }
  if (on.trees) {
    omt("cover-wood", "fill", "landcover", { filter: classIn("wood"), paint: { "fill-color": c.wood } });
  }
  if (on.restricted) {
    omt("landuse-cemetery", "fill", "landuse", { filter: classIn("cemetery"), paint: { "fill-color": c.cemetery } });
    omt("landuse-quarry", "fill", "landuse", { filter: classIn("quarry"), paint: { "fill-color": c.quarry } });
    omt("landuse-military", "fill", "landuse", { filter: classIn("military"), paint: { "fill-color": c.military, "fill-opacity": 0.7 } });
    omt("landuse-military-line", "line", "landuse", {
      filter: classIn("military"),
      paint: { "line-color": c.militaryLine, "line-width": px(1), "line-dasharray": [4, 2] },
    });
  }
  if (on.parks) {
    omt("park-fill", "fill", "park", { filter: polygonOnly, paint: { "fill-color": c.park, "fill-opacity": 0.22 } });
  }
  if (on.airfields) {
    omt("aeroway-area", "fill", "aeroway", { filter: polygonOnly, minzoom: z(11), paint: { "fill-color": c.apron } });
  }

  // --- Relief -------------------------------------------------------------------------------
  if (o.relief !== "off") {
    add({
      id: "hillshade", type: "hillshade", source: "dem",
      paint: {
        "hillshade-exaggeration": o.relief === "sharp" ? 0.5 : 0.24,
        "hillshade-shadow-color": c.shadow,
        "hillshade-highlight-color": c.highlight,
        "hillshade-accent-color": c.shadow,
        "hillshade-illumination-direction": 315,
      },
    });
  }

  // --- Water --------------------------------------------------------------------------------
  omt("water", "fill", "water", {
    filter: ["all", ["!=", ["get", "intermittent"], 1], notTunnel],
    paint: { "fill-color": c.water },
  });
  if (on.intermittent) {
    omt("water-intermittent", "fill", "water", {
      filter: ["==", ["get", "intermittent"], 1],
      paint: { "fill-color": c.water, "fill-opacity": 0.45 },
    });
    omt("water-intermittent-line", "line", "water", {
      filter: ["==", ["get", "intermittent"], 1],
      paint: { "line-color": c.waterLine, "line-width": px(0.7), "line-dasharray": [3, 2] },
    });
  }
  if (o.palette === "bw") {
    omt("water-outline", "line", "water", { filter: ["!=", ["get", "intermittent"], 1], paint: { "line-color": c.waterLine, "line-width": px(0.6) } });
  }
  const waterwayWidth = ["match", ["get", "class"], "river", 1, "canal", 0.8, "stream", 0.55, 0.4];
  omt("waterway", "line", "waterway", {
    filter: ["all", ["!=", ["get", "intermittent"], 1], notTunnel],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": c.waterLine,
      "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], z(8), ["*", px(0.9), waterwayWidth], z(13), ["*", px(1.9), waterwayWidth], z(16), ["*", px(3.4), waterwayWidth]],
    },
  });
  if (on.intermittent) {
    omt("waterway-intermittent", "line", "waterway", {
      filter: ["all", ["==", ["get", "intermittent"], 1], notTunnel],
      minzoom: z(10),
      paint: { "line-color": c.waterLine, "line-width": grow([10, 0.6], [14, 1.1], [16, 1.8]), "line-dasharray": [5, 3] },
    });
  }

  // --- Contours -----------------------------------------------------------------------------
  if (o.contours !== "off") {
    add({
      id: "contour-lines", type: "line", source: "contours", "source-layer": "contours",
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "level"], 1, c.contourIndex, c.contour],
        "line-width": ["match", ["get", "level"], 1, px(1.15), px(0.5)],
        "line-opacity": 0.85,
      },
    });
    add({
      id: "contour-labels", type: "symbol", source: "contours", "source-layer": "contours",
      filter: [">", ["get", "level"], 0],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": px(320),
        "text-field": ["to-string", ["get", "ele"]],
        "text-max-angle": 25,
        ...text(9.5, FONT.regular, { "text-padding": px(8) }),
      },
      paint: ink(c.contourText, 1.6),
    });
  }

  // --- Parks, boundaries --------------------------------------------------------------------
  if (on.parks) {
    omt("park-line", "line", "park", {
      filter: polygonOnly, minzoom: z(8),
      paint: { "line-color": c.parkLine, "line-width": px(1.1), "line-dasharray": [6, 2], "line-opacity": 0.8 },
    });
  }
  if (on.boundaries) {
    const land = ["!=", ["get", "maritime"], 1];
    omt("boundary-local", "line", "boundary", {
      filter: ["all", land, ["match", ["get", "admin_level"], [5, 6, 7, 8], true, false]], minzoom: z(10),
      paint: { "line-color": c.boundary, "line-width": px(0.8), "line-dasharray": [3, 2], "line-opacity": 0.8 },
    });
    omt("boundary-state", "line", "boundary", {
      filter: ["all", land, ["match", ["get", "admin_level"], [3, 4], true, false]], minzoom: z(3),
      paint: { "line-color": c.boundary, "line-width": grow([4, 0.8], [10, 1.5]), "line-dasharray": [6, 2, 1, 2] },
    });
    omt("boundary-country", "line", "boundary", {
      filter: ["all", land, ["<=", ["coalesce", ["get", "admin_level"], 99], 2]],
      paint: { "line-color": c.boundary, "line-width": grow([2, 0.9], [10, 2.2]) },
    });
  }

  // --- Airfields, buildings -----------------------------------------------------------------
  if (on.airfields) {
    omt("aeroway-taxiway", "line", "aeroway", {
      filter: ["all", lineOnly, classIn("taxiway")], minzoom: z(12),
      paint: { "line-color": c.runway, "line-width": grow([12, 0.8], [15, 4]) },
    });
    omt("aeroway-runway", "line", "aeroway", {
      filter: ["all", lineOnly, classIn("runway")], minzoom: z(10),
      paint: { "line-color": c.runway, "line-width": grow([10, 1.6], [13, 6], [16, 34]) },
    });
  }
  if (on.buildings) {
    omt("building", "fill", "building", {
      minzoom: z(13),
      paint: { "fill-color": c.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], z(13), 0.6, z(14.5), 0.9] },
    });
  }

  // --- Roads, trails, rail ------------------------------------------------------------------
  const roadLayout = { "line-cap": "round", "line-join": "round" };
  const major = classIn("motorway", "trunk", "primary");
  const secondary = classIn("secondary");
  const minor = classIn("tertiary", "minor");
  const majorWidth = [[5, 0.8], [9, 1.4], [12, 2.4], [14, 3.6], [17, 9]];
  const secondaryWidth = [[8, 0.7], [12, 1.9], [14, 3], [17, 8]];
  const minorWidth = [[10, 0.5], [12, 1.1], [14, 2.2], [17, 7]];
  const casing = stops => stops.map(([zoom, value]) => [zoom, value + 1.3]);
  if (on.trails) {
    omt("road-path", "line", "transportation", {
      filter: ["all", lineOnly, classIn("path"), notTunnel], minzoom: z(12.5),
      paint: { "line-color": c.path, "line-width": grow([12.5, 0.6], [15, 1.1], [17, 1.8]), "line-dasharray": [3, 2] },
    });
    omt("road-track", "line", "transportation", {
      filter: ["all", lineOnly, classIn("track"), notTunnel], minzoom: z(11.5),
      paint: { "line-color": c.track, "line-width": grow([11.5, 0.7], [15, 1.5], [17, 2.6]), "line-dasharray": [6, 2] },
    });
  }
  if (on.roads) {
    omt("road-tunnel", "line", "transportation", {
      filter: ["all", lineOnly, classIn("motorway", "trunk", "primary", "secondary", "tertiary", "minor"), isTunnel], minzoom: z(11),
      paint: { "line-color": c.roadMinorCase, "line-width": grow(...minorWidth), "line-dasharray": [2, 2], "line-opacity": 0.55 },
    });
    omt("road-service", "line", "transportation", {
      filter: ["all", lineOnly, classIn("service"), notTunnel], minzoom: z(13),
      layout: roadLayout,
      paint: { "line-color": c.service, "line-width": grow([13, 0.5], [15, 1.1], [17, 3]) },
    });
    omt("road-minor-case", "line", "transportation", {
      filter: ["all", lineOnly, minor, notTunnel], minzoom: z(11.5), layout: roadLayout,
      paint: { "line-color": c.roadMinorCase, "line-width": grow(...casing(minorWidth)) },
    });
    omt("road-minor-thin", "line", "transportation", {
      filter: ["all", lineOnly, minor, notTunnel], minzoom: z(9), maxzoom: z(11.5), layout: roadLayout,
      paint: { "line-color": c.roadMinorCase, "line-width": px(0.6), "line-opacity": 0.8 },
    });
    omt("road-secondary-case", "line", "transportation", {
      filter: ["all", lineOnly, secondary, notTunnel], minzoom: z(9), layout: roadLayout,
      paint: { "line-color": c.roadSecondaryCase, "line-width": grow(...casing(secondaryWidth)) },
    });
    omt("road-major-case", "line", "transportation", {
      filter: ["all", lineOnly, major, notTunnel], minzoom: z(7), layout: roadLayout,
      paint: { "line-color": c.roadMajorCase, "line-width": grow(...casing(majorWidth)) },
    });
    omt("road-minor", "line", "transportation", {
      filter: ["all", lineOnly, minor, notTunnel], minzoom: z(11.5), layout: roadLayout,
      paint: { "line-color": c.roadMinor, "line-width": grow(...minorWidth) },
    });
    omt("road-secondary", "line", "transportation", {
      filter: ["all", lineOnly, secondary, notTunnel], minzoom: z(8), layout: roadLayout,
      paint: { "line-color": c.roadSecondary, "line-width": grow(...secondaryWidth) },
    });
    omt("road-major", "line", "transportation", {
      filter: ["all", lineOnly, major, notTunnel], minzoom: z(5), layout: roadLayout,
      paint: { "line-color": c.roadMajor, "line-width": grow(...majorWidth) },
    });
    omt("ferry", "line", "transportation", {
      filter: ["all", lineOnly, classIn("ferry")], minzoom: z(9),
      paint: { "line-color": c.ferry, "line-width": px(1), "line-dasharray": [4, 3] },
    });
  }
  if (on.rail) {
    const railFilter = ["all", lineOnly, classIn("rail"), notTunnel];
    omt("rail", "line", "transportation", {
      filter: railFilter, minzoom: z(9),
      paint: { "line-color": c.rail, "line-width": grow([9, 0.7], [14, 1.4], [17, 2.4]) },
    });
    omt("rail-ties", "line", "transportation", {
      filter: railFilter, minzoom: z(12),
      paint: { "line-color": c.rail, "line-width": grow([12, 3], [14, 5], [17, 9]), "line-dasharray": [0.18, 1.6] },
    });
  }

  // --- Grid ---------------------------------------------------------------------------------
  if (on.grid) {
    add({
      id: "grid-lines", type: "line", source: "grid",
      filter: ["!=", ["get", "kind"], "zone"],
      paint: {
        "line-color": c.grid,
        "line-width": ["match", ["get", "level"], 1, px(1.2), px(0.55)],
        "line-opacity": 0.7,
      },
    });
    add({
      id: "grid-zone-lines", type: "line", source: "grid",
      filter: ["==", ["get", "kind"], "zone"],
      paint: { "line-color": c.grid, "line-width": px(1.6), "line-dasharray": [5, 2], "line-opacity": 0.75 },
    });
  }

  // --- Labels -------------------------------------------------------------------------------
  if (on.waterNames) {
    omt("waterway-name", "symbol", "waterway", {
      filter: ["all", lineOnly, ["has", "name"]], minzoom: z(full ? 12 : 13),
      layout: {
        "symbol-placement": "line", "symbol-spacing": px(380), "text-field": displayName,
        ...text(10.5, FONT.italic, { "text-letter-spacing": 0.08 }),
      },
      paint: ink(c.waterText),
    });
    omt("water-name-line", "symbol", "water_name", {
      filter: ["all", lineOnly, ["has", "name"]], minzoom: z(full ? 9 : 11),
      layout: {
        "symbol-placement": "line", "symbol-spacing": px(420), "text-field": displayName,
        ...text(11, FONT.italic, { "text-letter-spacing": 0.06 }),
      },
      paint: ink(c.waterText),
    });
    omt("water-name", "symbol", "water_name", {
      filter: ["all", pointOnly, ["has", "name"]], minzoom: z(full ? 9 : 11),
      layout: {
        "text-field": displayName, "text-max-width": 7,
        ...text(11, FONT.italic, { "text-letter-spacing": 0.06 }),
      },
      paint: ink(c.waterText),
    });
  }
  if (on.roads && on.roadNames) {
    omt("road-number", "symbol", "transportation_name", {
      filter: ["all", lineOnly, ["has", "ref"], classIn("motorway", "trunk", "primary", "secondary")], minzoom: z(8),
      layout: {
        "symbol-placement": "line", "symbol-spacing": px(420), "text-field": ["get", "ref"],
        "text-rotation-alignment": "viewport", "text-pitch-alignment": "viewport",
        ...text(9.5, FONT.bold, { "text-padding": px(6) }),
      },
      paint: ink(c.roadMajorCase, 2),
    });
    if (full) {
      omt("road-name", "symbol", "transportation_name", {
        filter: ["all", lineOnly, ["has", "name"], classIn("motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service")],
        minzoom: z(13),
        layout: { "symbol-placement": "line", "symbol-spacing": px(360), "text-field": displayName, ...text(9.5) },
        paint: ink(c.textMuted),
      });
    }
  }
  if (on.trails && on.trailNames && full) {
    omt("trail-name", "symbol", "transportation_name", {
      filter: ["all", lineOnly, ["has", "name"], classIn("path", "track")], minzoom: z(13.5),
      layout: { "symbol-placement": "line", "symbol-spacing": px(420), "text-field": displayName, ...text(9.5, FONT.italic) },
      paint: ink(c.track),
    });
  }
  if (on.airfields) {
    omt("airfield-name", "symbol", "aerodrome_label", {
      minzoom: z(10),
      layout: { "text-field": displayName, "text-max-width": 8, ...text(10, FONT.bold) },
      paint: ink(c.textMuted),
    });
  }
  if (on.parks) {
    omt("park-name", "symbol", "park", {
      filter: ["all", pointOnly, ["has", "name"]], minzoom: z(8),
      layout: {
        "text-field": displayName, "text-max-width": 8, "symbol-sort-key": ["coalesce", ["get", "rank"], 9],
        ...text(10.5, FONT.italic, { "text-letter-spacing": 0.04 }),
      },
      paint: ink(c.parkText),
    });
  }
  if (on.pois && full) {
    omt("poi", "symbol", "poi", {
      filter: ["all", ["has", "name"], ["<=", ["coalesce", ["get", "rank"], 99], 12], ["match", ["get", "class"], POI_CLASSES, true, false]],
      minzoom: z(14),
      layout: {
        "icon-image": "dot", "icon-size": S * 0.8, "text-field": displayName, "text-anchor": "top",
        "text-offset": [0, 0.45], "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        "text-optional": false, ...text(9.5),
      },
      paint: ink(c.poi),
    });
  }
  if (on.peaks) {
    const elevation = imperial
      ? ["concat", ["to-string", ["coalesce", ["get", "ele_ft"], ["round", ["*", ["coalesce", ["get", "ele"], 0], FEET_PER_METRE]]]], " ft"]
      : ["concat", ["to-string", ["coalesce", ["get", "ele"], 0]], " m"];
    omt("peak", "symbol", "mountain_peak", {
      filter: ["match", ["get", "class"], ["peak", "volcano"], true, false], minzoom: z(9),
      layout: {
        "icon-image": "peak", "icon-size": S,
        "text-field": ["format", ["coalesce", ["get", "name_en"], ["get", "name"], ""], {}, "\n", {}, elevation, { "font-scale": 0.85 }],
        "text-anchor": "top", "text-offset": [0, 0.55], "text-max-width": 8,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 9],
        ...text(10, FONT.italic),
      },
      paint: ink(c.peak),
    });
  }
  if (on.places) {
    const minorPlaces = ["hamlet", "suburb", "quarter", "neighbourhood", "isolated_dwelling", "island"];
    if (full) {
      omt("place-minor", "symbol", "place", {
        filter: ["match", ["get", "class"], minorPlaces, true, false], minzoom: z(12),
        layout: {
          "text-field": displayName, "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "rank"], 30],
          ...text(grow([12, 9.5], [15, 11.5])),
        },
        paint: ink(c.textMuted),
      });
    }
    omt("place-village", "symbol", "place", {
      filter: classIn("village"), minzoom: z(10),
      layout: {
        "text-field": displayName, "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "rank"], 30],
        ...text(grow([10, 10], [15, 13.5]), FONT.bold),
      },
      paint: ink(c.text, 1.6),
    });
    omt("place-town", "symbol", "place", {
      filter: classIn("town"), minzoom: z(7),
      layout: {
        "text-field": displayName, "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "rank"], 30],
        ...text(grow([7, 10.5], [14, 15.5]), FONT.bold),
      },
      paint: ink(c.text, 1.8),
    });
    omt("place-city", "symbol", "place", {
      filter: classIn("city"), minzoom: z(3),
      layout: {
        "text-field": displayName, "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "rank"], 30],
        ...text(grow([3, 10.5], [10, 15], [14, 19]), FONT.bold),
      },
      paint: ink(c.text, 2),
    });
    omt("place-state", "symbol", "place", {
      filter: classIn("state"), minzoom: z(3), maxzoom: z(8),
      layout: {
        "text-field": displayName, "text-transform": "uppercase", "text-max-width": 8,
        ...text(grow([3, 9.5], [7, 13]), FONT.regular, { "text-letter-spacing": 0.14 }),
      },
      paint: ink(c.textMuted, 1.6),
    });
    omt("place-country", "symbol", "place", {
      filter: classIn("country"), maxzoom: z(6),
      layout: {
        "text-field": displayName, "text-max-width": 7,
        ...text(grow([1, 10.5], [5, 15]), FONT.bold),
      },
      paint: ink(c.text, 2),
    });
  }
  if (on.grid && on.gridNumbers) {
    add({
      id: "grid-numbers", type: "symbol", source: "grid",
      filter: ["!=", ["get", "label"], ""],
      layout: {
        "symbol-placement": "line", "symbol-spacing": px(380), "text-field": ["get", "label"],
        "text-rotation-alignment": "viewport", "text-pitch-alignment": "viewport",
        ...text(["match", ["get", "level"], 1, px(12.5), px(11)], FONT.bold, { "text-padding": px(4) }),
      },
      paint: ink(c.gridText, 1.8),
    });
    add({
      id: "grid-squares", type: "symbol", source: "gridLabels",
      layout: {
        "text-field": ["get", "label"], "text-allow-overlap": false,
        ...text(["match", ["get", "kind"], "gzd", px(17), px(14)], FONT.bold, { "text-letter-spacing": 0.08 }),
      },
      paint: ink(c.gridText, 2, { "text-opacity": 0.85 }),
    });
  }

  // --- Picked pages and device region (main map only) ---------------------------------------
  if (context.interactive) {
    add({ id: "region-fill", type: "fill", source: "region", paint: { "fill-color": c.accent, "fill-opacity": 0.08 } });
    add({ id: "region-line", type: "line", source: "region", paint: { "line-color": c.accent, "line-width": 2.2, "line-dasharray": [3, 2] } });
    add({
      id: "pages-fill", type: "fill", source: "pages",
      paint: { "fill-color": c.accent, "fill-opacity": ["case", ["boolean", ["get", "active"], false], 0.2, 0.1] },
    });
    add({
      id: "pages-line", type: "line", source: "pages",
      paint: { "line-color": c.accent, "line-width": ["case", ["boolean", ["get", "active"], false], 3.2, 2] },
    });
    add({
      id: "pages-label", type: "symbol", source: "pages",
      layout: {
        "text-field": ["to-string", ["get", "number"]], "text-font": FONT.bold, "text-size": 20,
        "text-allow-overlap": true, "text-ignore-placement": true,
      },
      paint: { "text-color": c.accent, "text-halo-color": c.halo, "text-halo-width": 2.4 },
    });
  }

  const style = { version: 8, name: "Topo Map Builder", glyphs: GLYPHS_URL, sources, layers };
  if (context.terrain) style.terrain = { source: "demTerrain", exaggeration: 1.4 };
  return style;
}

/**
 * Small map symbols drawn on a canvas at run time, so the style needs no sprite sheet.
 * Returns { width, height, data } suitable for map.addImage with the given pixel ratio.
 */
export function drawIcon(name, palette, pixelRatio, createCanvas) {
  const c = PALETTES[palette] || PALETTES.colour;
  const size = name === "peak" ? 12 : 7;
  const canvas = createCanvas(Math.ceil(size * pixelRatio), Math.ceil(size * pixelRatio));
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  context.lineJoin = "round";
  if (name === "peak") {
    context.beginPath();
    context.moveTo(6, 1.6);
    context.lineTo(10.6, 10.2);
    context.lineTo(1.4, 10.2);
    context.closePath();
    context.fillStyle = c.peak;
    context.strokeStyle = c.halo;
    context.lineWidth = 1.2;
    context.stroke();
    context.fill();
  } else if (name === "dot") {
    context.beginPath();
    context.arc(3.5, 3.5, 2.2, 0, Math.PI * 2);
    context.fillStyle = c.poi;
    context.strokeStyle = c.halo;
    context.lineWidth = 1.1;
    context.stroke();
    context.fill();
  } else {
    return null;
  }
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}
