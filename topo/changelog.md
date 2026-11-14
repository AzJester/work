# Changelog

All notable changes to Topo Map Builder are documented here.

## 1.0.0 - 2026-11-14

First release.

### Added

- topographic map drawn in the browser from OpenFreeMap vector tiles and Mapzen terrain tiles: hillshade, contours, land cover, water, roads, trails, railways, buildings, airfields, parks, boundaries, peaks and place names
- MGRS grid overlay from grid zone boundaries down to 100 m lines, with grid numbers, clipped correctly at zone edges and over Norway and Svalbard
- readout of grid convergence, magnetic declination (World Magnetic Model 2025), zoom and the MGRS reference under the pointer
- search by town or ZIP code, MGRS reference, or latitude and longitude, and a button for the visitor's location
- print pages at 1:25,000, 1:50,000, 1:24,000, 1:48,000 and 1:15,000, portrait or landscape, on US Letter, picked by click or shift-drag, moved by drag, buttons or arrow keys in 1 km steps, with snapping to neighbouring pages and undo and redo
- PDF export at true scale with a vector grid, grid numbers, scale bars, north diagram, grid-magnetic angle and compass conversion, contour interval, sheet name, corner reference and data credits, plus an optional legend page
- Garmin Custom Map (KMZ) export sized to a 100 or 500 image device limit
- ATAK tile set (MBTiles) export across a chosen range of zoom levels
- colour and black-and-white ink, soft and sharp hillshade, sparse and full contours and labels, metric and imperial units, and twenty layer switches
- 3D terrain preview
- shareable links that reopen the same pages, scale and units
- settings and pages remembered in the browser
