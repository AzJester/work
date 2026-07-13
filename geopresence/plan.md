# Astrion Map Builder plan

Status: implemented

Updated: July 13, 2026

Current version: 2.2.0

Created by: Dr. Shane Turner

## Objective

Build a simple standalone application that creates a polished U.S. location map and exports the finished graphic as PNG or SVG.

The application is a graphic-production tool. It is not an enterprise mapping platform, operational data system, or workflow application.

## Requirements

### Map composition

- display real geographic boundaries for every U.S. state and the District of Columbia
- use a recognizable Albers USA projection with Alaska and Hawaii insets
- allow a user to select a state and use a filtered city or community as the default location anchor
- allow a user to switch explicitly to an embedded military installation as an alternate anchor
- place markers at the selected city/community or installation presentation-scale coordinate
- visually distinguish headquarters, regional headquarters, hubs, contract sites, and future sites
- encode each location type with both a unique symbol and color while keeping state labels neutral
- group locations by anchor and type so different categories remain distinct and repeated categories receive a count badge
- show one collision-aware label per anchor instead of one label per location record
- reserve clear space around every state initial so state borders, callout connectors, markers, city/installation labels, and counts never obscure it
- keep small-state and District of Columbia initials readable with protected callouts whose connector lines terminate away from the text
- show optional state labels, city labels, site counts, legend, and background grid
- support editable title, subtitle, theme, and accent color

### Graphic formats

- 16:9 canvas for screens and presentations
- 4:3 canvas for legacy presentation or document layouts
- square canvas for social or general graphic placement
- transparent-background option
- PNG export at standard, high, and ultra resolution
- SVG export for lossless scaling and editing
- clipboard copy where the browser permits image clipboard writes
- omit application attribution, version information, and demonstration notices from every exported or copied graphic

### Application constraints

- one self-contained HTML file
- no mapping SDK or charting library
- no API key, account, backend, or database
- no external network requests
- no runtime government service, government account, or government approval
- bundle 887 selectable military-installation anchors across all 51 state/DC codes: 805 FY2024 DoD MIRTA points in the 50 states/DC and 82 Coast Guard records from 2025 Census military landmarks
- describe the installation catalog as public-source planning data, not a complete inventory of classified, unreleased, leased, or every small military site
- local browser persistence only
- keyboard-operable state selection and labeled form controls
- responsive layout for desktop and mobile use
- visible application version and creator attribution
- maintained release history in `changelog.md`

## User flow

1. Open the application.
2. Set the title, subtitle, theme, aspect ratio, and display options.
3. Click a state or choose it from the form.
4. Keep the default city/community anchor or switch to a listed military installation, then select the location type.
5. Add or remove location markers.
6. Select PNG quality and background behavior.
7. Download PNG, download SVG, or copy PNG.

## Output behavior

The exported graphic must include only the composed map—not the surrounding editor interface. SVG output remains editable. PNG output is rasterized at the selected scale:

- 1×: native canvas dimensions
- 2×: twice the native width and height
- 3×: three times the native width and height

## Acceptance criteria

- page runs without external scripts or services
- changing any setting immediately updates the map preview
- clicking a state preselects it in the add-location form
- choosing a state filters the city/community suggestions to that state
- a submitted city/community must match an embedded place in the selected state
- the installation selector contains 887 anchors and covers all 51 state/DC codes
- its source breakdown remains exactly 805 FY2024 DoD MIRTA points plus 82 Coast Guard records from 2025 Census military landmarks
- selecting Alabama offers Redstone Arsenal; Fort Campbell is available from both Tennessee and Kentucky
- city markers use finite coordinates projected into the same Albers USA space as the state geometry
- installation markers use finite embedded coordinates and require no runtime geocoder or government service
- different location types at one city or installation render as separate nearby symbols around the same geographic anchor
- repeated records of one type at one city or installation render as one symbol with a numeric count badge
- city/community remains the default anchor, and installations are selectable rather than all being plotted automatically
- Huntsville, Alabama demonstrates both Regional HQ and Contract Site symbols at the same city
- legacy records without city data remain visible as `Statewide` locations rather than being assigned a fabricated city
- map contains 51 unique geographic paths for the 50 states and District of Columbia
- state shapes preserve geographic proportions through uniform scaling at every canvas ratio
- every state initial is clearly legible and belongs unambiguously to its state or protected callout, with no border, connector, marker, label, or count crossing it
- small Northeast states and the District of Columbia remain labeled and selectable with callout lines kept clear of their initials
- adding or removing a location updates anchor markers, counts, legend, and the anchor-aware location list
- PNG export creates a valid non-empty PNG
- SVG export creates a valid standalone SVG
- transparent export omits the canvas background while retaining contrast-safe titles, subtitles, legend labels, place labels, and callout connectors on light or dark destination graphics
- Florida and Louisiana initials use verified interior positions, and state counts use interior-safe candidate points rather than a fixed centroid offset
- application works at desktop and mobile widths without horizontal overflow
- automated tests and browser console checks pass

## Future options

Only add these if they become useful:

- custom marker icons
- user-imported logo
- user-selectable fonts
- custom state colors
- JSON import/export of a saved map configuration
- alternate regional or international geographic maps
