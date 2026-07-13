# Astrion Map Builder plan

Status: implemented

Updated: July 13, 2026

## Objective

Build a simple standalone application that creates a polished U.S. location map and exports the finished graphic as PNG or SVG.

The application is a graphic-production tool. It is not an enterprise mapping platform, operational data system, or workflow application.

## Requirements

### Map composition

- display every U.S. state and the District of Columbia in a consistent tile-map layout
- allow a user to add, label, classify, and remove locations
- visually distinguish headquarters, regional headquarters, hubs, contract sites, and future sites
- show optional state labels, site counts, legend, and background grid
- support editable title, subtitle, footer note, theme, and accent color

### Graphic formats

- 16:9 canvas for screens and presentations
- 4:3 canvas for legacy presentation or document layouts
- square canvas for social or general graphic placement
- transparent-background option
- PNG export at standard, high, and ultra resolution
- SVG export for lossless scaling and editing
- clipboard copy where the browser permits image clipboard writes

### Application constraints

- one self-contained HTML file
- no mapping SDK or charting library
- no API key, account, backend, or database
- no external network requests
- local browser persistence only
- keyboard-operable state selection and labeled form controls
- responsive layout for desktop and mobile use

## User flow

1. Open the application.
2. Set the title, subtitle, theme, aspect ratio, and display options.
3. Click a state or choose it from the form.
4. Add or remove location markers.
5. Select PNG quality and background behavior.
6. download PNG, download SVG, or copy PNG.

## Output behavior

The exported graphic must include only the composed map—not the surrounding editor interface. SVG output remains editable. PNG output is rasterized at the selected scale:

- 1×: native canvas dimensions
- 2×: twice the native width and height
- 3×: three times the native width and height

## Acceptance criteria

- page runs without external scripts or services
- changing any setting immediately updates the map preview
- clicking a state preselects it in the add-location form
- adding or removing a location updates state markers, counts, legend, and location list
- PNG export creates a valid non-empty PNG
- SVG export creates a valid standalone SVG
- transparent export omits the canvas background
- application works at desktop and mobile widths without horizontal overflow
- automated tests and browser console checks pass

## Future options

Only add these if they become useful:

- custom marker icons
- user-imported logo
- user-selectable fonts
- custom state colors
- JSON import/export of a saved map configuration
- alternate regional or international tile layouts
