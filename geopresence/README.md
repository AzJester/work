# Astrion Map Builder

A self-contained browser application for creating a branded geographic U.S. location map and exporting it for use in presentations, documents, posters, or other graphics.

Version: **2.1.0**

Created by **Dr. Shane Turner**

Open `index.html` directly or serve the repository and visit `/geopresence/`.

## What it does

- edits the map title, subtitle, theme, accent color, and canvas ratio
- displays recognizable geographic state boundaries with Alaska and Hawaii insets
- adds and removes labeled locations by state and type
- distinguishes headquarters, regional HQs, hubs, contract sites, and future sites with unique marker shapes as well as color
- keeps state abbreviations visually neutral so the location symbols carry the emphasis
- optionally shows state labels, location counts, a legend, and a background grid
- supports transparent backgrounds
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

The included locations are synthetic examples and can be cleared or replaced.

Markers are positioned at representative state-level anchors because locations currently select a state rather than an exact street address or coordinate.

## Map geometry

The embedded geometry is derived from `us-atlas@3.0.1/states-albers-10m.json`, which uses U.S. Census Bureau cartographic boundary data projected with Albers USA. It is intended for presentation graphics, not legal boundary analysis or survey work. The geometry is bundled into the page, so the deployed app makes no runtime map or data requests.

See [changelog.md](changelog.md) for release history.
