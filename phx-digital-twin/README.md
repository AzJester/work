# PHX Sky Harbor digital twin

Browser-based 3D twin of Phoenix Sky Harbor International (KPHX), modeled on the Unreal-style airport flyover with floating ADS-B tags. Real aerial photography, real airfield geometry, live aircraft.

- **Public page:** `https://azjester.github.io/work/phx-digital-twin/` (live ADS-B capable).
- **claude.ai artifact preview:** same scene with simulated traffic only. The artifact sandbox blocks all outside data calls.
- **Local:** serve the repo root with any static server and open `/phx-digital-twin/`.

Unofficial visualization. Not for navigation or operational use.

## What is real and what is simulated

| Layer | Source | Fidelity |
|---|---|---|
| Airfield photography | USDA NAIP aerial imagery flown 2023-09-17, public domain, via the Interior GeoPlatform image service | 30 cm detail tiles loaded around the view, 0.65 m across the whole field. Shows the airport as it was that day, including aircraft at gates |
| Metro photography | Same NAIP flight | 3 m per pixel over a 12.3 km square |
| Regional imagery | Copernicus Sentinel-2 L2A, June 2025, 10 m | 30 x 30 km, toned to match the aerial photos |
| Terrain | AWS Terrain Tiles (SRTM/USGS 3DEP) | 60 m inner grid, 120 km outer ring |
| Buildings | Overture Maps 2026-10 (OSM footprints, USGS lidar heights) | 3,900 extruded footprints with roofs textured from the photos; flat roofs, generic walls. ATC tower modeled by hand at 326 ft |
| Runway and taxiway lights, PAPIs, gates, taxi routing graph | X-Plane Scenery Gateway data for KPHX (via FlightGear, GPL) | Survey-grade positions; they line up with the photography |
| PHX Sky Train | Overture transportation segments | Real alignment, estimated heights |
| Aircraft, **Live ADS-B** mode | Community receivers through the relay | Real positions and identities every 2 s, dead-reckoned in between. See limits |
| Aircraft, **Simulated** mode | Rules-based simulator in `app.js` | Plausible, not observed |
| Aircraft 3D models | Procedural, generic color schemes by operator | Right size and layout class per type; not airline artwork |

When the photo files are missing the page falls back to a painted airfield built from the X-Plane pavement polygons and markings.

## Live ADS-B

The page starts in live mode whenever a feed answers and falls back to the simulator when none does. In live mode nothing is invented: the simulator is off, speed and the time slider are locked to now, and runway flow is inferred from landing traffic.

**Data path.** Public ADS-B APIs send no CORS headers, so a browser cannot call them. `supabase/functions/adsb-relay` fetches one fixed area (40 NM around KPHX) server-side, trims the payload and returns it to the Pages origin. No secrets, no request parameters, 2 s cache. It tries `adsb.lol` then `adsb.fi` and keeps using whichever answered.

**What the feeds actually did** (probe from a GitHub-hosted runner, 2026-11-11):

| Feed | Result | Terms |
|---|---|---|
| adsb.lol | No answer (connection failed) | Open data (ODbL); has said an API key from feeders may become required |
| airplanes.live | 403, access by arrangement | Non-commercial |
| adsb.fi | 221 aircraft, 219 accepted by the parser, 65 on the ground, 43 within 6 km of the field | Personal, non-commercial use; 1 request per second; credit with a link (the page does this) |

So today the live traffic most likely comes from adsb.fi. That is fine for a personal demo and not for company or commercial use. For that, use a contracted feed, your own receiver, or FAA SWIM (STDDS/SMES carries ASDE-X surface tracks, which is what a real surface twin needs). Restrict the relay with the Supabase secret `ADSB_RELAY_UPSTREAMS` (for example `adsb.lol`); other settings are `ADSB_RELAY_ALLOWED_ORIGINS`, `ADSB_RELAY_CACHE_MS`, `ADSB_RELAY_TIMEOUT_MS`.

**Other feeds.** Append `?feed=<url>` to use any endpoint that returns readsb/tar1090 JSON (`{"ac":[...]}` or a receiver's `aircraft.json`) and allows the page's origin.

**How reports become aircraft** (`adsb.js`, covered by tests):
- Position: WGS84 to the twin's grid with the same transverse Mercator as the airfield data (checked against runway ends to 6 cm).
- Altitude: geometric altitude when present, corrected by the local geoid; otherwise pressure altitude plus a correction estimated each poll from aircraft reporting both. `alt_baro: "ground"` pins the aircraft to the surface.
- Heading: track in the air; reported true heading on the ground.
- Model: ICAO type designator mapped to one of 37 procedural models, falling back to emitter category.
- Dropped: TIS-B tracks without an ICAO address and surface vehicles.

**Limits.**
- Aircraft with transponders off (most aircraft parked at gates) do not appear. Aircraft visible at gates in the photography are from September 2023, not now.
- Surface coverage depends on which volunteer receivers can see the airfield.
- ADS-B carries no origin, destination or gate. The nearest stand shown for a stopped aircraft is an inference.
- Free community feeds have no SLA.

## Graphics limits

The ground is a photograph, so it looks right from above and flat from low angles: there is no 3D photogrammetry. Buildings are extruded footprints. Getting textured 3D buildings and terrain needs Google Photorealistic 3D Tiles (API key with billing) or an Unreal Engine build.

## Controls

Orbit, Flyover and Tower views; click any aircraft or list row to inspect and follow it. Zoom with the + and − buttons, scroll wheel, pinch or the + and − keys (in the tower cab, zoom narrows the field of view). The frame button resets to the whole airport.

## Files

- `phx-twin.html`: the page as published to claude.ai artifacts. Edit this.
- `index.html`: standalone build for static hosting. Generated by `node phx-digital-twin/tools/build_index.mjs`; a test fails if it is stale.
- `app.js`: renderer, simulator, live-feed client. `adsb.js`: pure ADS-B helpers shared with the tests.
- `data/`: `photo_tiles/` (40 tiles, 26 MB), `photo_airfield.jpg`, `photo_metro.jpg`, Sentinel-2 base, terrain, buildings, airfield JSON.
- `tools/fetch_imagery.py`: fetches and bakes the aerial photography. It needs the open internet, so it runs in GitHub Actions (`.github/workflows/phx-twin-data.yml`) and commits the result. `tools/imagery_report.json` records the source, flight date and exposure.
- `tools/probe_feeds.mjs`, `tools/check_deployment.mjs`: report what the ADS-B feeds return and whether the deployed page and relay work. Run from Actions: PHX twin data, Run workflow.
- Other `tools/*.py`: preprocessing for airfield, terrain, buildings and taxi graph (Python 3 with numpy, rasterio, shapely, pyproj, pyarrow, fsspec).

## Simulated traffic model

West flow (default): arrivals 25L and 26, departures 25R and 26; east flow mirrors it. Arrivals fly a 3-degree glidepath, exit and taxi to airline-appropriate gates along the painted centerlines; departures push back, hold short, are released first-come-first-served, and crossings get priority between departures. One simulated hour: 58 departures, 45 arrivals, longest hold 7 minutes, no deadlocks.

## Attribution

Aerial photography: USDA Farm Production and Conservation, National Agriculture Imagery Program (public domain), served by the USFS Geospatial Technology and Applications Center and the Interior GeoPlatform. Regional imagery: contains modified Copernicus Sentinel data 2025. Terrain: Mapzen/AWS Terrain Tiles. Buildings and rail: Overture Maps Foundation (ODbL for OpenStreetMap-derived features, USGS lidar heights). Airfield data: X-Plane Scenery Gateway contributors (GPL v2+, via FlightGear). Live traffic: adsb.fi and adsb.lol community receivers. Liveries are generic color schemes, not airline artwork.
