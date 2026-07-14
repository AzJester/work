# Astrion Map Builder plan

Status: implemented

Updated: July 13, 2026

Current version: 3.0.0

Created by: Dr. Shane Turner

Public application: https://azjester.github.io/work/geopresence/

## Objective

Build a simple browser application that creates a polished geographic U.S. location map and exports the finished graphic as PNG or SVG.

The application is a graphic-production tool. It is not an operational mapping platform, authoritative facility inventory, navigation system, legal boundary product, or enterprise workflow application.

## Implemented architecture

- a compact HTML/CSS/JavaScript application shell at `geopresence/index.html`
- geographic state paths embedded in the application shell
- versioned same-origin reference data in `geopresence/data/`
- schema-validated local browser persistence with a separate destructive-action recovery snapshot
- portable JSON project import/export without a backend or account
- service-worker caching for the application shell and versioned catalogs after the first successful hosted load
- GitHub Pages hosting at the public application URL

Splitting the catalogs from the HTML reduces initial parsing cost while preserving a local, same-origin runtime. It does not introduce an external map service or government runtime connection.

## Requirements

### Map composition

- display recognizable geographic boundaries for every U.S. state and the District of Columbia
- use an Albers USA projection with Alaska and Hawaii insets
- allow a state to be selected through the form and use a searchable city/community as the default location anchor
- allow an explicit switch to a searchable military-installation combobox
- place markers at the chosen place or installation presentation coordinate
- distinguish Headquarters, Regional headquarters, Site, Contract site, and Future site with unique shapes and theme-aware colors
- keep state labels neutral and every marker and legend symbol visible on a crisp dual-tone backplate
- group repeated records of one type at an anchor behind a numeric count while keeping different types separate
- run one deterministic global collision layout across all anchors, including distinct nearby cities and installations
- reserve state-label, marker, count, callout, connector, and previously placed label geometry during layout
- use fallback label positions and surface a visible warning when density prevents an ideal result
- keep regular state initials at fixed, verified positions and protect small-state and District of Columbia callouts
- support optional state labels, place labels, locations-per-state counts, legend, and background grid
- automatically fit long map headings to the selected canvas and report when fitting occurs

### Reference data

- load 32,058 official 2025 Census place records covering the 50 states and District of Columbia
- retain each Census GEOID, exact NAME, and LSAD code as stable identity and descriptive data
- preserve same-base-name records and show an entity-type and GEOID disambiguator in search results
- load 887 selectable public-reference military-installation anchors across all 51 state/DC codes
- retain the installation breakdown of 805 FY2024 DoD MIRTA points and 82 Coast Guard records from 2025 Census military landmarks
- expose Redstone Arsenal from Alabama and Fort Campbell from both Tennessee and Kentucky
- describe all anchors as approximate presentation points rather than gates, buildings, surveyed parcels, boundaries, or a complete military inventory
- keep sample Astrion locations opt-in, retain the user-provided Huntsville Regional Headquarters and contract entries, and identify the remaining examples as demonstration data in the editor only

### Editing, history, and projects

- add, edit, cancel, and remove locations without changing a saved record until an edit is submitted
- begin a new browser with an empty map rather than preloading demonstration locations
- confirm Clear, Reset, Remove, sample replacement, and imported-project replacement
- keep an in-session Undo history and a browser recovery snapshot for the latest destructive change
- validate saved browser state against a versioned model schema
- treat missing, blocked, full, or corrupt browser storage as a visible nonfatal condition
- export the current map settings and locations as a versioned JSON project
- validate JSON project structure before import and preserve an undo snapshot before replacement

### Graphic formats

- 16:9, 4:3, and square canvases
- transparent-background output
- destination preview choices for checkerboard, light, dark, and custom backgrounds
- automatic, dark, and light transparent-export text tones
- PNG export at standard, high, and ultra resolution
- scalable SVG export
- clipboard PNG copy where the browser permits image clipboard writes
- an enabled-by-default clean SVG metadata option that removes hidden titles, descriptions, accessibility labels, editor data attributes, and location metadata from the exported copy
- omission of application attribution, version information, and demonstration notices from every exported or copied graphic
- an export-busy state that prevents concurrent output operations
- validation of image loading, the 2D canvas context, and non-null PNG blobs
- reliable temporary object-URL cleanup and a maximum-pixel safety check with actionable errors

### Accessibility and responsive behavior

- semantic fieldsets, legends, lists, explicit labels, and linked inline validation errors
- searchable city and installation comboboxes with ARIA state and keyboard navigation
- a State dropdown as the keyboard state-selection path, avoiding 51 state buttons inside an SVG image role
- visible focus indicators and state boundaries with stronger contrast
- polite status, warning, error, and Undo announcements
- focus restoration after a location is removed
- reduced-motion support
- desktop, tablet, and mobile layouts without horizontal overflow
- Fit, zoom-in, zoom-out, and full-screen preview controls for small viewports

### Application constraints

- no mapping SDK, charting library, geocoder, account, API key, backend, or database
- no external map service or third-party runtime data request
- no runtime government service, government account, government connection, or government approval
- same-origin versioned catalogs rather than an oversized inline place dataset
- local browser storage only; cross-device transfer uses a user-controlled JSON project file
- visible version number and attribution to Dr. Shane Turner in the editor and documentation only
- maintained release history in `changelog.md`

## User flow

1. Open the public application or serve the repository over HTTP.
2. Set the map heading, canvas, map theme, heading accent, and map details.
3. If exporting transparency, select a destination preview and text tone.
4. Choose a state and search for a Census place or public-reference installation.
5. Add, edit, or remove locations and use confirmation or Undo when replacing data.
6. Use Fit, zoom, or full-screen preview to inspect the composition.
7. Download or open a JSON project when backup or transfer is needed.
8. Download PNG, download SVG, or copy PNG.

## Output behavior

The exported graphic includes only the composed map, not the editor interface. PNG output is rasterized at the selected scale:

- 1×: native canvas dimensions
- 2×: twice the native width and height
- 3×: three times the native width and height, subject to the reliable maximum-pixel check

SVG output remains scalable and editable. When **Clean SVG metadata** is enabled, the exported copy excludes hidden location and editor metadata. Destination-preview colors remain in the editor and are never added as a transparent export background.

## Acceptance criteria

- all 51 state/DC paths render with recognizable geographic proportions
- the app loads its versioned same-origin catalogs and reports a clear error if a required catalog cannot load
- all 32,058 Census rows retain unique seven-character GEOIDs and LSAD values
- duplicate Census base names remain independently searchable and selectable
- the 887 installation anchors preserve their 805 DoD and 82 Coast Guard source split
- city and installation markers use finite coordinates in the state-geometry projection
- distinct nearby anchors participate in global marker and label occupancy rather than overlapping silently
- state initials, small-state callouts, counts, markers, leaders, and labels remain mutually legible
- long title, subtitle, and location text is bounded, fitted, or accompanied by a visible explanation
- adding, editing, removing, undoing, clearing, resetting, and replacing locations updates the preview and saved model correctly
- invalid saved state and invalid project JSON cannot replace a valid project
- JSON project export/import round-trips current settings and location identity
- PNG, SVG, and clipboard paths surface busy and failure states and produce non-empty output
- clean SVG output removes hidden editor and location metadata when requested
- transparent preview and text-tone choices remain readable and do not add a matte to the exported graphic
- keyboard and assistive-technology users can operate all editor controls without traversing 51 map-state tab stops
- desktop and mobile views avoid horizontal overflow and support zoom and full-screen inspection
- offline reopening works after the service worker has cached a successful hosted load
- source tests, generated-data validation, Playwright browser tests, and the deployed production smoke test pass

## Verification and release process

- Node source and geometry tests validate the application, data contracts, collision logic, accessibility structure, and documentation
- the place-catalog generator pins the Census source checksums and validates record counts, GEOID uniqueness, LSAD handling, projection output, and duplicate-name cases
- Playwright covers responsive behavior, accessibility, project history, exports, dense metropolitan layouts, offline routing, and the production deployment
- GitHub Actions runs source tests and Chromium Playwright tests before GitHub Pages deployment
- deployment is blocked if the quality checks fail
- a production smoke test runs against the deployed GeoPresence URL after publishing

## Future options

Only add these if they become useful:

- custom marker icons
- user-imported logo
- user-selectable fonts
- custom state colors
- alternate regional or international geographic maps
