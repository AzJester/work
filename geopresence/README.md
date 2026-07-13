# Astrion Map Builder

A self-contained browser application for creating a branded geographic U.S. location map and exporting it for use in presentations, documents, posters, or other graphics.

Version: **2.2.0**

Created by **Dr. Shane Turner**

Open `index.html` directly or serve the repository and visit `/geopresence/`.

## What it does

- edits the map title, subtitle, theme, accent color, and canvas ratio
- displays recognizable geographic state boundaries with Alaska and Hawaii insets
- filters embedded U.S. city/community and military-installation catalogs by state
- keeps city/community as the default anchor type, with military installation available as an explicit alternative
- adds and removes labeled locations by city/community or installation and type
- places each marker at the selected anchor's presentation-scale coordinate
- distinguishes headquarters, regional HQs, hubs, contract sites, and future sites with unique marker shapes as well as color
- shows different site types side by side when they share an anchor and adds a count badge when one anchor has multiple records of the same type
- keeps state abbreviations visually neutral and protected from state borders, callout lines, markers, and other labels
- optionally shows state labels, city labels, state-level location counts, a legend, and a background grid
- supports transparent backgrounds with contrast-safe title, subtitle, legend, place-label, and callout-line rendering on light or dark destination graphics
- exports high-resolution PNG files at 1×, 2×, or 3× quality
- exports scalable SVG files for later editing
- copies a PNG to the clipboard when the browser supports image clipboard access
- saves the current map locally in the browser
- keeps application attribution, version information, and demonstration notices out of copied and downloaded graphics

## What it does not need

- no map service
- no external JavaScript library
- no account or API key
- no backend or database
- no network connection after the page is loaded
- no government account, connection, or approval

The Huntsville, Alabama defaults reflect the user-provided Regional HQ and contract presence. The other included Astrion locations are demonstration examples and can be cleared or replaced. Huntsville intentionally shows both categories at one anchor. The embedded city and installation catalogs are public reference data, not claims about Astrion sites.

## Location anchors

City/community remains the default. Its 31,847 choices come from the embedded [2025 U.S. Census National Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html), including incorporated places and Census-designated places. Coordinates are Census internal points used as presentation-scale place centers; they are not building locations or street addresses.

The optional military-installation catalog contains **887 selectable anchors** across all **51 state/DC codes** (the 50 states and the District of Columbia):

- **805** FY2024 Department of Defense points from the public [Military Installations, Ranges, and Training Areas (MIRTA)](https://www.acq.osd.mil/eie/imr/rpid/disdi/index.html) release
- **82** Coast Guard records identified in the Census Bureau's [2025 TIGER/Line U.S. Military Installation landmarks](https://catalog.data.gov/dataset/tiger-line-shapefile-current-nation-u-s-military-installation)

Redstone Arsenal is indexed under Alabama. Fort Campbell is indexed for both Tennessee and Kentucky because the installation spans the state line. Selecting an installation supplies a presentation-scale anchor; the user still assigns the Astrion location category. The catalog is searchable, but the map does not plot all 887 installations automatically.

These public sources do not and cannot promise every military facility. MIRTA excludes some classified or otherwise unreleased sites, leased sites, sites without releasable geospatial data, and many small Guard or Reserve sites. Census states that the 2025 military-landmark file carries older, 2012-sourced inventory and boundary work, so its Coast Guard records are useful public anchors rather than a current legal facility inventory. Installation points are not gates, buildings, surveyed parcels, or legal boundaries.

Older saved records that do not contain a city remain available as `Statewide` locations at the state's representative anchor. The app does not invent a city for those records.

## Map geometry

The embedded state geometry is derived from `us-atlas@3.0.1/states-albers-10m.json`, which uses U.S. Census Bureau cartographic boundary data projected with Albers USA. City/community and installation coordinates were projected into the same coordinate system during development. State initials use protected anchors and backing so state borders, Northeast callout lines, location symbols, and other labels do not cross the text. All geometry and reference catalogs are bundled into the page, so the deployed app makes no runtime map or data requests. The map is intended for presentation graphics, not legal boundary analysis or survey work.

See [changelog.md](changelog.md) for release history.
