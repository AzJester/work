# Astrion Map Builder

A self-contained browser application for creating a branded geographic U.S. location map and exporting it for use in presentations, documents, posters, or other graphics.

Version: **2.2.2**

Created by **Dr. Shane Turner**

Public application: **https://azjester.github.io/work/geopresence/**

Open `index.html` directly or serve the repository and visit `/geopresence/`.

## What it does

- edits the map title, subtitle, theme, accent color, and canvas ratio
- displays recognizable geographic state boundaries with Alaska and Hawaii insets
- filters embedded U.S. city/community and military-installation catalogs by state
- keeps city/community as the default anchor type, with military installation available as an explicit alternative
- adds, edits, and removes labeled locations by city/community or installation and type
- places each marker at the selected anchor's presentation-scale coordinate
- distinguishes headquarters, regional headquarters, sites, contract sites, and future sites with unique marker shapes, theme-aware colors, and crisp solid backplates
- shows different site types side by side when they share an anchor and adds a count badge when one anchor has multiple records of the same type
- keeps regular state abbreviations at fixed, validated positions and uses protected callouts for the smallest states and District of Columbia
- optionally shows state labels, city labels, state-level location counts, a legend, and a background grid
- uses crisp, solid neutral typography and compact place-label plates for transparent backgrounds, without glows or text outlines
- keeps the location form controls inside their panel at desktop and mobile widths and places **Clear locations** with the location list it affects
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

The Huntsville, Alabama Regional Headquarters and contract presence reflect user-provided information. The other included Astrion locations are demonstration examples and can be cleared, edited, or replaced. Huntsville intentionally shows both categories at one anchor. The embedded city and installation catalogs are public reference data, not claims about Astrion sites.

## Location anchors

City/community remains the default. Its 31,847 choices come from the embedded [2025 U.S. Census National Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html), including incorporated places and Census-designated places. Coordinates are Census internal points used as presentation-scale place centers; they are not building locations or street addresses.

The optional military-installation catalog contains **887 selectable anchors** across all **51 state/DC codes** (the 50 states and the District of Columbia):

- **805** FY2024 Department of Defense points from the public [Military Installations, Ranges, and Training Areas (MIRTA)](https://www.acq.osd.mil/eie/imr/rpid/disdi/index.html) release
- **82** Coast Guard records identified in the Census Bureau's [2025 TIGER/Line U.S. Military Installation landmarks](https://catalog.data.gov/dataset/tiger-line-shapefile-current-nation-u-s-military-installation)

Redstone Arsenal is indexed under Alabama. Fort Campbell is indexed for both Tennessee and Kentucky because the installation spans the state line. Selecting an installation supplies a presentation-scale anchor; the user still assigns the Astrion location category. The catalog is searchable, but the map does not plot all 887 installations automatically.

These public sources do not and cannot promise every military facility. MIRTA excludes some classified or otherwise unreleased sites, leased sites, sites without releasable geospatial data, and many small Guard or Reserve sites. Census states that the 2025 military-landmark file carries older, 2012-sourced inventory and boundary work, so its Coast Guard records are useful public anchors rather than a current legal facility inventory. Installation points are not gates, buildings, surveyed parcels, or legal boundaries.

The exact nine-location starter set saved by version 2.1 is automatically replaced with the current city-based samples. Other older records without a city remain at the state's representative anchor, but the map does not show a fabricated place label or the word "Statewide."

## Map geometry

The embedded state geometry is derived from `us-atlas@3.0.1/states-albers-10m.json`, which uses U.S. Census Bureau cartographic boundary data projected with Albers USA. City/community and installation coordinates were projected into the same coordinate system during development. Regular state initials use fixed canonical anchors with protected backing; the smallest Northeast states and District of Columbia use callouts so state borders, connectors, location symbols, and other labels do not cross the text. All geometry and reference catalogs are bundled into the page, so the deployed app makes no runtime map or data requests. The map is intended for presentation graphics, not legal boundary analysis or survey work.

Transparent PNG and SVG output has no canvas background. The app uses neutral solid text, single-stroke callout connectors, compact background plates for place labels, and dual-tone marker backplates that remain identifiable on light or dark destinations. No single text color can guarantee contrast over every possible image, so preview a transparent export on its intended destination background before final use.

See [changelog.md](changelog.md) for release history.
