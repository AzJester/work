# Topo Map Builder

Topo Map Builder is a browser application for building printable topographic maps of anywhere in the world, drawn to scale with an MGRS grid, and for exporting the same map to Garmin handhelds and ATAK.

Version: **1.0.0**

Public application: **https://azjester.github.io/work/topo/**

It is a static site. There is no server, account, API key or build step: the page, its modules and its libraries are served from this folder, and map data is read by the visitor's browser straight from public hosts.

## What it does

- shows a topographic map with hillshade, contours cut from elevation data, land cover, water, roads, trails, railways, buildings, airfields, parks, boundaries, peaks and place names
- overlays the MGRS grid: grid zone boundaries when zoomed out, then 100 km squares, 10 km, 1 km and 100 m lines as the map zooms in, with principal-digit grid numbers
- reads out grid convergence (GN), magnetic declination (MN), the zoom and the MGRS reference under the pointer
- goes to a town or ZIP code, an MGRS reference, a latitude and longitude in decimal or degrees-minutes-seconds, or the visitor's own location
- picks print pages on the map at 1:25,000, 1:50,000, 1:24,000, 1:48,000 or 1:15,000, portrait or landscape, on US Letter
- keeps every page on the UTM grid, so pages butt together exactly; a page can be dragged in 1 km steps, moved with the arrow keys, and snaps to the edge of a neighbour
- exports the pages as a PDF with the map at true scale, a vector grid with grid numbers, kilometre and mile scale bars, a north diagram with the grid-magnetic angle and the compass conversion, the contour interval, the sheet's MGRS name and corner, and data credits
- adds an optional legend page that explains the symbols and how to read a grid reference
- builds a Garmin Custom Map (KMZ) of the chosen region within the device's 100 or 500 image limit
- builds an ATAK tile set (MBTiles) of the chosen region across a range of zoom levels
- offers colour or black-and-white ink, soft or sharp hillshade, sparse or full contours and labels, metric or imperial units, and switches for twenty layers
- previews the terrain in 3D (exports stay flat)
- shares a link that reopens the same pages, scale and units
- remembers pages and settings in the visitor's browser, and nowhere else

## How it is built

| Path | Purpose |
|------|---------|
| `index.html`, `app.css`, `app.mjs` | The page, its styles and the interface logic. |
| `lib/geo.mjs` | WGS 84 to UTM and back (Karney-Krueger series), MGRS formatting and parsing, coordinate text parsing. |
| `lib/wmm.mjs` | Magnetic declination from the World Magnetic Model 2025 coefficients. |
| `lib/grid.mjs` | MGRS grid lines and labels for a view, clipped to each grid zone. |
| `lib/pages.mjs` | Print-page geometry: page sizes, the page lattice, snapping, and the map view that draws a page to scale. |
| `lib/style.mjs` | The map style, generated as MapLibre style JSON for screen, print and device renders. |
| `lib/render.mjs` | The terrain and contour source, run-time map symbols, and the hidden map used for exports. |
| `lib/export-pdf.mjs` | The PDF sheet: raster map, vector grid, collar and legend. |
| `lib/export-tiles.mjs` | Garmin KMZ and ATAK MBTiles export. |
| `lib/zip.mjs` | A small stored-entry ZIP writer for KMZ files. |
| `vendor/` | MapLibre GL JS, maplibre-contour, jsPDF and sql.js, copied from npm by `npm run build:vendor`. Licences are in `vendor/LICENSES.md`. |

Every local import carries the application version as a query string, and each vendored library sits in a folder named for its version. The root service worker that the tracker registers caches same-origin files, so a changed file needs a changed address to be picked up at once. `tests/topo.test.mjs` fails if a version is out of step.

## Data and credits

| Data | Source | Terms |
|------|--------|-------|
| Roads, water, land cover, buildings, places | [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, as vector tiles from [OpenFreeMap](https://openfreemap.org) in the [OpenMapTiles](https://www.openmaptiles.org/) schema | ODbL; attribution shown on the map and on every sheet |
| Elevation, hillshade and contours | [Mapzen terrain tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) hosted by AWS Open Data: USGS 3DEP, SRTM, GMTED and others | Open data with attribution |
| Place search | [Nominatim](https://nominatim.org) on OpenStreetMap data | Used once per submitted search, never while typing |
| Magnetic declination | World Magnetic Model 2025, NOAA NCEI and the British Geological Survey | Public domain; valid 2025.0 to 2030.0 |
| Map fonts | Noto Sans glyphs served by OpenFreeMap | SIL Open Font License |

The contour lines are computed in the browser by [maplibre-contour](https://github.com/onthegomap/maplibre-contour).

## Accuracy

- Pages are rectangles on the UTM grid and the printed grid is drawn as vectors from exact grid coordinates, so grid spacing on paper is exact: 40 mm per kilometre at 1:25,000.
- The map image under the grid is Web Mercator, rotated to grid north and scaled for the page centre. Its features sit within about 0.1 mm of their true grid position at 1:25,000 in mid latitudes. The difference grows toward the poles and reaches about 0.3 mm in the corners of a 1:50,000 sheet at 70° north. `tests/topo.test.mjs` measures this.
- UTM conversion round-trips to better than a micrometre and agrees with an independent MGRS library on 19,994 of 20,000 random points; the six differences are single metres at a truncation boundary where this code is the more exact.
- Declination reproduces NOAA's published WMM2025 test values.
- Printers must be set to 100% (actual size). Every sheet prints scale bars to check with a ruler.

## Limits

- MGRS covers 80° S to 84° N. The polar UPS grids are not drawn and pages cannot be picked there.
- Paper size is US Letter.
- A PDF holds at most 24 pages and an ATAK export at most 6,000 tiles, to keep memory use and load on the public tile hosts reasonable.
- Device tiles are drawn a block at a time, so a label that straddles the join between two blocks can be clipped.
- The map is drawn from open data that changes over time and has gaps. It carries no flood zones, power lines, pipelines, aeronautical obstacles or marine chart data, because no free worldwide tile source offers them. Confirm anything critical against an official map.
- The application depends on its public data hosts being reachable. If OpenFreeMap or the AWS terrain bucket is unavailable, the map is incomplete until it returns.

## Development

Serve the repository root over HTTP and open `/topo/`:

```
python3 -m http.server 4173
```

Tests:

```
npm test                  # coordinate maths, grid, pages, style validation, packaging
npm run test:browser      # drives the page in Chromium against generated map data
```

The browser tests replace the tile, elevation and search hosts with generated data, so they need no network and fail if the page contacts any other host. Updating a vendored library means changing its version in `package.json`, running `npm install` and `npm run build:vendor`, and updating the versioned paths the tests point to.
