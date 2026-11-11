# PHX Sky Harbor digital twin

Browser-based 3D twin of Phoenix Sky Harbor International (KPHX), modeled on the Unreal-style airport flyover with floating ADS-B tags. Open `phx-twin.html` through any static web server (it fetches `app.js` and `data/`), or use the published artifact.

## What is real and what is simulated

| Layer | Source | Fidelity |
|---|---|---|
| Runways, displaced thresholds, approach lights, PAPIs, windsocks, beacon | X-Plane Scenery Gateway airport data for KPHX (distributed with FlightGear, GPL) | Survey-grade positions, matches FAA runway lengths within a few feet |
| 614 pavement polygons, 6,449 painted lines, taxiway light strings, 132 gates | Same source | Real layout as of the 2023 dataset. Terminal 2 gates removed (demolished) |
| Taxi routing | Graph built from the painted yellow centerlines plus the X-Plane taxi network (11.8k vertices) | Aircraft follow the actual markings and hold at real hold lines |
| Imagery | Copernicus Sentinel-2 L2A, three passes from June 2025, 10 m/px, 30 x 30 km | Correct colors and layout; blurry below ~300 m altitude |
| Terrain | AWS Terrain Tiles (SRTM/USGS 3DEP), 60 m inner grid, 120 km outer ring | South Mountain, Camelback, Papago Buttes in the right places |
| Buildings | Overture Maps 2026-10 release (OSM footprints, USGS lidar heights) | 3,900 buildings, heights mostly lidar-derived; ATC tower modeled by hand at 326 ft |
| PHX Sky Train | Overture transportation segments | Alignment is real; guideway heights are estimated |
| Aircraft traffic | Rules-based simulator | **Not live.** Callsigns, types, registrations, ICAO addresses and runway flows are plausible, not observed |

ICAO 24-bit addresses for US registrations use the FAA N-number allocation algorithm (verified against the reference video: N327QS maps to A389C0).

## Traffic model

- West flow (default): arrivals 25L and 26, departures 25R and 26. East flow mirrors it on 7R/8 and 7L/8.
- Arrivals spawn 40 km out on the bearing of their origin airport, fly a downwind if needed, join a 3-degree glidepath, land, exit at the first suitable taxiway and taxi to a gate assigned by airline (American at A/B, Southwest at C/D, Delta and Alaska at E, United and others at F, FedEx/UPS on the cargo ramps, NetJets on the GA ramp).
- Departures push back, start engines, taxi to the shorter-queue runway, hold short until the runway is clear (no arrival inside 3.7 km, no crossing traffic waiting, 50 s since the last takeoff), line up and wait, then climb out toward the destination bearing.
- Runway crossings get priority between departures, the way tower batches them.
- Soak test over one simulated hour: 58 departures, 45 arrivals, longest single hold 7 minutes, no deadlocks.

## Making it a live twin

The tag and detail-panel fields mirror an ADS-B message (ICAO hex, callsign, registration, type, position, altitude, ground speed, vertical rate, track, squawk, on-ground flag). To run on real data, replace `simStep` with a feed adapter that writes those fields into each `Aircraft` and interpolates between reports. Candidate feeds: FAA SWIM (ASDE-X/STDDS for surface movement, which ADS-B alone does not give you reliably on the ramp), a local ADS-B receiver, or a commercial aggregator. A browser page cannot call most of these directly because of CORS and credentials, so plan on a small relay service.

## Rebuilding the data

`tools/` holds the preprocessing scripts (Python 3 with numpy, rasterio, shapely, pyproj, pyarrow, fsspec). Run them from a scratch `build/` directory; outputs land in `data/`.

1. `parse_apt.py` extracts KPHX from FlightGear's `apt.dat` into local meters (transverse Mercator on the airport datum).
2. `s2.py` mosaics Sentinel-2 true color; `terrain.py` reprojects elevation tiles; `overture_bldg.py` range-reads Overture parquet files from S3 for a bounding box.
3. `build_data.py` packs imagery, terrain and buildings (binary grids are shipped as base64 text because artifact hosting serves web types only); `route_graph.py` builds the taxi graph; `gate_links.py` links gates and finds runway exits.

## Attribution

Airfield data: X-Plane Scenery Gateway contributors (GPL v2+, via FlightGear fgdata). Imagery: contains modified Copernicus Sentinel data 2025. Terrain: Mapzen/AWS Terrain Tiles. Buildings and rail: Overture Maps Foundation (ODbL for OpenStreetMap-derived features, USGS lidar heights). Liveries are generic color schemes, not airline artwork.
