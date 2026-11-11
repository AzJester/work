# PHX Sky Harbor digital twin

Browser-based 3D twin of Phoenix Sky Harbor International (KPHX), modeled on the Unreal-style airport flyover with floating ADS-B tags.

- **Public page (after this folder is on `main`):** `https://azjester.github.io/work/phx-digital-twin/`. This copy can show live ADS-B traffic.
- **claude.ai artifact preview:** same scene, simulated traffic only. The artifact sandbox blocks all outside data calls, so live traffic cannot run there.
- **Local:** serve the repo root with any static server and open `/phx-digital-twin/`.

Unofficial visualization. Not for navigation or operational use.

## What is real and what is simulated

| Layer | Source | Fidelity |
|---|---|---|
| Runways, displaced thresholds, approach lights, PAPIs, windsocks, beacon | X-Plane Scenery Gateway airport data for KPHX (distributed with FlightGear, GPL) | Survey-grade positions, matches FAA runway lengths within a few feet |
| 614 pavement polygons, 6,449 painted lines, taxiway light strings, 132 gates | Same source | Real layout as of the 2023 dataset. Terminal 2 gates removed (demolished) |
| Imagery | Copernicus Sentinel-2 L2A, three passes from June 2025, 10 m/px, 30 x 30 km | Correct colors and layout; blurry below ~300 m altitude |
| Terrain | AWS Terrain Tiles (SRTM/USGS 3DEP), 60 m inner grid, 120 km outer ring | South Mountain, Camelback, Papago Buttes in the right places |
| Buildings | Overture Maps 2026-10 release (OSM footprints, USGS lidar heights) | 3,900 buildings, heights mostly lidar-derived; ATC tower modeled by hand at 326 ft |
| PHX Sky Train | Overture transportation segments | Alignment is real; guideway heights are estimated |
| Aircraft, **Live ADS-B** mode | Community ADS-B receivers via the relay (default upstream adsb.lol, ODbL) | Real positions, identities and altitudes, refreshed every 2 s and dead-reckoned in between. See limits below |
| Aircraft, **Simulated** mode | Rules-based simulator in `app.js` | Plausible, not observed |
| Aircraft 3D models and paint | Procedural, generic color schemes by operator | Right size and layout class per type; not airline artwork |

## Live ADS-B

The page starts in live mode whenever a feed answers and falls back to the simulator when none does. In live mode nothing on screen is invented: the simulator is off, sim speed and the time slider are locked to now, and runway flow is inferred from landing traffic instead of set by hand.

**Data path.** Public ADS-B APIs do not send CORS headers, so a browser cannot call them directly. `supabase/functions/adsb-relay` is a small Edge Function that fetches one fixed area (40 NM around KPHX) server-side, trims the payload and returns it to the Pages origin. It holds no secrets, takes no parameters, caches for 1.5 s so upstream sees at most one request per 1.5 s regardless of viewers, and is deployed by the Pages workflow. Settings (all optional Supabase secrets): `ADSB_RELAY_ALLOWED_ORIGINS`, `ADSB_RELAY_UPSTREAMS` (ordered subset of `adsb.lol`, `airplanes.live`, `adsb.fi`), `ADSB_RELAY_CACHE_MS`, `ADSB_RELAY_TIMEOUT_MS`.

**Other feeds.** Append `?feed=<url>` to point the page at any endpoint that returns readsb/tar1090 JSON (`{"ac":[...]}` or a receiver's `aircraft.json` with `{"aircraft":[...]}`) and allows the page's origin. A local receiver (readsb or dump1090-fa with an antenna that can see the ramp) is the best source for surface traffic.

**How reports become aircraft** (`adsb.js`, covered by `tests/phx-digital-twin.test.mjs`):
- Position: WGS84 to the twin's grid with the same transverse Mercator used for the airfield data (checked against runway ends to 6 cm).
- Altitude: geometric altitude when present (ellipsoid height corrected by the local geoid, about -30 m). Otherwise pressure altitude plus a correction estimated each poll from aircraft that report both. `alt_baro: "ground"` pins the aircraft to the surface.
- Heading: track in the air; reported true heading on the ground, because course over ground is noise below a few knots.
- Model: ICAO type designator mapped to one of 37 procedural models, falling back to the emitter category.
- Dropped: TIS-B tracks without an ICAO address (they duplicate real targets) and surface vehicles.

**Limits you should expect.**
- Aircraft with transponders off (most aircraft parked at gates) do not appear. The ramp will look emptier than it is.
- Surface coverage depends on which volunteer receivers can see the airfield. MLAT does not work on the ground.
- ADS-B carries no origin, destination or gate. The detail panel shows the nearest stand for stopped aircraft as an inference.
- Free community APIs have no SLA. adsb.lol has said it may require an API key from feeders in future; the other two free sources restrict commercial use. For anything beyond a demo, use a contracted feed or FAA SWIM (STDDS/SMES gives ASDE-X surface tracks, which is what a real surface twin needs).
- No ADS-B host was reachable from the build environment, so the live path was verified against a mock feed in the exact relay format, not against adsb.lol itself. The first real check is after deploy.

## Simulated traffic model

- West flow (default): arrivals 25L and 26, departures 25R and 26. East flow mirrors it on 7R/8 and 7L/8.
- Arrivals spawn 40 km out on the bearing of their origin airport, fly a downwind if needed, join a 3-degree glidepath, land, exit and taxi to a gate assigned by airline.
- Departures push back, start, taxi along the painted centerlines to the shorter-queue runway, hold short until released first-come-first-served, line up and wait, then climb out toward the destination bearing. Runway crossings get priority between departures.
- Soak test over one simulated hour: 58 departures, 45 arrivals, longest single hold 7 minutes, no deadlocks.
- ICAO 24-bit addresses for US registrations use the FAA N-number allocation (N327QS maps to A389C0, as in the reference video).

## Controls

Orbit, Flyover and Tower views; click any aircraft or list row to inspect and follow it. Zoom with the + and − buttons, scroll wheel, pinch or the + and − keys (in the tower cab, zoom narrows the field of view). The frame button resets to the whole airport.

## Files

- `phx-twin.html`: the page as published to claude.ai artifacts (which add their own document wrapper). Edit this.
- `index.html`: standalone build for static hosting. Generated: `node phx-digital-twin/tools/build_index.mjs`. A test fails if it is out of date.
- `app.js`: renderer, simulator, live-feed client. `adsb.js`: pure ADS-B helpers shared with the tests.
- `data/`: airfield JSON, imagery, terrain and buildings (binary grids are base64 text because artifact hosting serves web types only).
- `tools/`: preprocessing scripts (Python 3 with numpy, rasterio, shapely, pyproj, pyarrow, fsspec). Run from a scratch `build/` directory.
  1. `parse_apt.py` extracts KPHX from FlightGear's `apt.dat` into local meters.
  2. `s2.py` mosaics Sentinel-2 true color; `terrain.py` reprojects elevation tiles; `overture_bldg.py` range-reads Overture parquet from S3 for a bounding box.
  3. `build_data.py` packs imagery, terrain and buildings; `route_graph.py` builds the taxi graph; `gate_links.py` links gates and finds runway exits.

## Attribution

Airfield data: X-Plane Scenery Gateway contributors (GPL v2+, via FlightGear fgdata). Imagery: contains modified Copernicus Sentinel data 2025. Terrain: Mapzen/AWS Terrain Tiles. Buildings and rail: Overture Maps Foundation (ODbL for OpenStreetMap-derived features, USGS lidar heights). Live traffic: adsb.lol contributors (ODbL). Liveries are generic color schemes, not airline artwork.
