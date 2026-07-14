# Map Builder

Map Builder is a browser application for creating a polished geographic U.S. presence map and exporting it for presentations, documents, posters, and other graphics.

Version: **3.1.0**

Created by **Dr. Shane Turner**

Public application: **https://azjester.github.io/work/geopresence/**

The hosted application is the simplest way to use it. For local development, serve the repository over HTTP and visit `/geopresence/`; the versioned reference catalogs are loaded from the same origin.

## What it does

- presents a compact progressive-disclosure Map settings panel with Quick setup open by default and Map details, Advanced, and Project collapsed
- keeps concise summaries on every settings group and updates them as the map choices change
- displays recognizable geographic boundaries for every U.S. state and the District of Columbia, with Alaska and Hawaii insets
- searches 32,058 official 2025 Census places and 887 public-reference military-installation anchors
- uses stable Census GEOID and LSAD fields so places with the same base name remain separate and receive identifying choice labels
- adds, edits, and removes locations anchored to a selected city, community, or military installation
- uses a familiar generic teardrop pin as the default location-marker silhouette, with an original application-rendered design rather than Google-branded artwork
- distinguishes eleven built-in categories inside each pin: Headquarters star, Regional headquarters building, Site circle, Contract site briefcase, Future site clock, Program office document, Operations center network/gear, Customer site person, Partner site link, Test or range site target, and Manufacturing facility factory
- combines repeated records of the same type at one anchor behind a numeric count badge
- fans different pin types around a shared or dense anchor and connects displaced pins with leader lines
- separates pin groups across nearby but distinct anchors with one deterministic global collision layout
- adapts pin outlines for light, dark, and transparent destinations; the legend renders identical complete pins, includes only categories used on the map, and wraps automatically
- protects state abbreviations and counts as reserved zones so pins, callouts, connectors, and place labels do not cover them
- warns when dense layout requires a fallback label, hides a label, fits long heading text, or cannot fully separate a marker group
- offers fit, zoom-in, zoom-out, and full-screen preview controls for desktop and mobile use
- supports light, dark, checkerboard, and custom destination previews for transparent graphics, plus automatic, dark, or light transparent-export text
- exports PNG at 1×, 2×, or 3× quality, exports SVG, and copies PNG where the browser supports image clipboard access
- optionally creates a clean SVG with hidden titles, descriptions, editor metadata, and data attributes removed
- saves a validated project in browser storage and supports portable JSON project import/export
- confirms destructive replacements, keeps an Undo history, and saves a recovery snapshot for the last destructive change

The editor opens as an empty project. Sample Astrion locations are opt-in and are identified as demonstration data in the editor only; notices, creator text, and version text do not appear in copied or downloaded map graphics. The Huntsville Regional Headquarters and contract entries reflect user-provided information. The other optional locations are demonstration examples, not claims about current Astrion sites.

## Compact Map settings

The Map settings panel uses native progressive disclosure so the editor remains short and easy to scan:

- **Quick setup** is open when the application starts and contains the most common heading, canvas, and map-theme choices.
- **Map details** is collapsed and summarizes the enabled labels, counts, legend, grid, and related presentation options.
- **Advanced** is collapsed and summarizes transparent-output and other less-frequent controls.
- **Project** is collapsed and keeps JSON project import/export available without occupying the everyday editing view.

Each group has a concise dynamic summary of its current choices. Opening or closing a group does not change the map or alter exported graphics.

## Location pins

Every location uses the same generic teardrop-shaped pin shell. The teardrop is a common cartographic convention implemented as application-owned SVG geometry; it is not Google Maps artwork and does not imply affiliation with Google.

The interior symbol communicates the current location category:

- **Headquarters:** star
- **Regional headquarters:** building
- **Site:** circle
- **Contract site:** briefcase
- **Future site:** clock
- **Program office:** document
- **Operations center:** network/gear
- **Customer site:** person
- **Partner site:** link
- **Test or range site:** target
- **Manufacturing facility:** factory

When an anchor contains multiple records of one category, one pin carries a numeric count badge. When an anchor contains different categories, their pins fan apart and use leader lines to preserve the common geographic anchor. The same fanning and global collision pass also respects nearby independent anchors and the protected rectangles around state abbreviations and state counts.

Pin outlines adapt to the light, dark, clean, and transparent destination treatment. Legend entries call the same pin renderer as map locations, so silhouette, interior symbol, category color, outline, and visual weight remain identical. The legend includes only types currently used on the map and wraps automatically when several are present. All eleven built-in categories are available in the location editor, and the metadata-driven pin renderer can accept additional categories in a future release without redesigning the placement system.

## Project safety and portability

Saved browser data is validated against the current model schema before use. Invalid or unavailable browser storage produces a visible, nonfatal warning instead of stopping the editor. Clear, Reset, Remove, sample replacement, and project import use confirmation and recovery behavior.

Use **Download project** to create a JSON backup and **Open project** to move that file to another browser or device. Imported JSON is schema-validated before it can replace the current map. This is manual project portability, not cloud synchronization.

## Location anchors

### Census places

City/community is the default location source. The versioned catalog contains **32,058 records** for the 50 states and District of Columbia from the official [2025 U.S. Census National Places Gazetteer](https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html).

Each record retains its official seven-character **GEOID**, exact place name, and **LSAD** legal/statistical-area code. Places that share a base name within one state are not collapsed. Their searchable choices include the entity type and GEOID; for example, Florida's three Midway records remain independently selectable.

Census internal points are presentation-scale place centers. They are not street addresses, surveyed parcels, or building locations.

### Military installations

The optional installation catalog contains **887 selectable public-reference anchors** across all **51 state/DC codes**:

- **805** FY2024 Department of Defense points from the public [Military Installations, Ranges, and Training Areas (MIRTA)](https://www.acq.osd.mil/eie/imr/rpid/disdi/index.html) release
- **82** Coast Guard records identified in the Census Bureau's [2025 TIGER/Line U.S. Military Installation landmarks](https://catalog.data.gov/dataset/tiger-line-shapefile-current-nation-u-s-military-installation)

Redstone Arsenal is indexed under Alabama. Fort Campbell is available from both Tennessee and Kentucky because it spans the state line. The installation combobox searches the selected state's public reference catalog; all 887 records are not automatically plotted.

These sources cannot promise every military facility. They exclude classified or otherwise unreleased sites and may omit leased sites, sites without releasable geospatial data, and smaller Guard or Reserve locations. Coast Guard records are useful public presentation anchors rather than a current legal inventory. Installation points are not gates, buildings, surveyed parcels, or legal boundaries.

## Map and export behavior

State geometry is derived from `us-atlas@3.0.1/states-albers-10m.json`, using U.S. Census Bureau cartographic boundary data in an Albers USA projection. Place and installation points use the same presentation coordinate space. The map is intended for graphic composition, not navigation, legal boundary analysis, or survey work.

The preview uses a global occupancy pass for every location anchor, so separate nearby cities do not independently claim the same marker space. It then places labels against marker, state-label, and previously occupied label boxes. The same resolved layout is used by the preview, PNG, clipboard, and SVG outputs.

Transparent output has no canvas background. Destination preview changes only the editor backdrop; it is not exported. Select automatic, dark, or light text for the intended destination. No single text color can guarantee contrast over every possible photograph, so check the result against its final background.

PNG generation uses an export-busy state, validates the canvas context and resulting blob, revokes temporary object URLs, applies a pixel safety limit, and reports actionable errors. Reduce PNG quality if an ultra-resolution export exceeds a browser's reliable memory range.

## Runtime and offline behavior

GeoPresence uses a compact HTML application shell plus versioned, same-origin JSON catalogs:

- `data/places-2025.json`
- `data/places-2025.meta.json`
- `data/installations-2024-2025.json`

The split avoids parsing more than 32,000 place records as part of the initial HTML document. A service worker caches the application shell and catalogs after a successful hosted load so the app can be reopened offline. No map SDK, charting library, geocoder, external map service, account, API key, backend, database, runtime government service, government account, government connection, or government approval is required.

## Accessibility and responsive design

- semantic fieldsets and legends group map settings
- city and installation controls are searchable ARIA comboboxes with keyboard navigation
- form validation uses linked inline errors and `aria-invalid`
- the location collection uses list semantics, and focus is restored after removing a record
- state geometry is described as a map image without adding 51 state buttons to the keyboard tab order; the State dropdown is the keyboard selection path
- visible focus rings, higher-contrast state boundaries, status announcements, reduced-motion handling, and labeled preview controls support assistive use
- the interface avoids horizontal overflow and offers zoom and full-screen viewing when a map preview is small

## Verification and deployment

Source, geometry, catalog, accessibility, export, project-history, dense-metro, responsive, offline-routing, and production-smoke checks are automated. Playwright runs in Chromium in GitHub Actions. GitHub Pages deployment is gated on the source and browser suites, and a production smoke test runs against the deployed public URL.

See [plan.md](plan.md) for the implemented requirements and [changelog.md](changelog.md) for release history.
