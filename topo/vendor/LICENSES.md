# Third-party libraries

Topo Map Builder ships these libraries unmodified, copied from npm by `npm run build:vendor`.
Each folder is named for the library's version and holds its licence text.

| Library | Version | Licence | Used for |
|---------|---------|---------|----------|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 6.18.0 | BSD-3-Clause | Drawing the map |
| [maplibre-contour](https://github.com/onthegomap/maplibre-contour) | 0.1.1 | BSD-3-Clause | Contour lines from elevation tiles |
| [jsPDF](https://github.com/parallax/jsPDF) | 4.2.1 | MIT | Writing the PDF |
| [sql.js](https://github.com/sql-js/sql.js) | 1.16.0 | MIT (SQLite is public domain) | Writing MBTiles files for ATAK |

The World Magnetic Model 2025 coefficients in `lib/wmm.mjs` are a public-domain product of
NOAA NCEI and the British Geological Survey.
