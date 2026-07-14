# Changelog

All notable changes to Astrion Map Builder are documented here.

Created by Dr. Shane Turner.

## [3.0.0] - 2026-07-13

### Added

- added a versioned 32,058-record 2025 Census place catalog that retains the official GEOID, NAME, and LSAD fields for every record in the 50 states and District of Columbia
- added duplicate-place disambiguation so same-base-name records remain independently selectable with entity-type and GEOID labels
- replaced long native selectors with searchable, keyboard-operable city and installation comboboxes
- added deterministic global marker and label occupancy across co-located and distinct nearby anchors, with fallback and hidden-label warnings for dense layouts
- added confirmation for destructive clear, reset, remove, sample-replacement, and project-import operations
- added in-session Undo history and a persisted recovery snapshot for the latest destructive change
- added versioned JSON project import/export with schema validation before an imported project can replace the current map
- added checkerboard, light, dark, and custom transparent destination previews with automatic, dark, and light export-text tones
- added an enabled-by-default **Clean SVG metadata** option that removes hidden titles, descriptions, accessibility labels, editor data attributes, and location metadata from exported SVG copies
- added Fit, zoom-in, zoom-out, and full-screen preview controls for responsive map inspection
- added semantic fieldsets, list structure, ARIA combobox state, linked inline form errors, focus restoration, and a keyboard state-selection path without 51 state tab stops

### Changed

- changed a new browser session to open an empty project; demonstration locations are now opt-in and identified in the editor only
- split the place, place-metadata, and installation catalogs into versioned same-origin JSON files to reduce the initial HTML parse cost
- added service-worker caching for the GeoPresence shell and catalogs after a successful hosted load so the application can be reopened offline
- changed browser persistence to a versioned, sanitized model that handles blocked, full, missing, or corrupt storage as a visible nonfatal condition
- debounced live heading and custom-preview-color updates instead of rebuilding the map for every keystroke
- bounded user-entered text and automatically fitted long title and subtitle text to the export canvas
- clarified **Map theme**, **Heading accent**, **Locations per state**, **Replace with sample locations**, and public-reference anchor wording
- updated all application, documentation, and release references to version 3.0.0 while preserving attribution to Dr. Shane Turner

### Fixed

- prevented separate nearby cities and installations from independently occupying the same marker space
- preserved same-named Census entities that were previously collapsed by state-and-name identity
- removed interactive state-button roles from the SVG image and retained the State dropdown as the accessible keyboard path
- strengthened focus visibility and state-boundary contrast without adding glow effects
- constrained responsive panels, combobox results, and previews to avoid mobile horizontal overflow
- hardened PNG creation with an export-busy state, pixel safety limit, canvas-context and blob validation, temporary object-URL cleanup, and actionable error messages
- ensured transparent destination preview mattes remain editor-only and never appear in transparent PNG or SVG output

### Verification

- added generated-catalog validation for source checksums, record counts, GEOID uniqueness, LSAD coverage, projection output, and duplicate-name cases
- added Playwright coverage for responsive and accessible behavior, project history, exports, dense metropolitan layouts, offline routing, and production smoke testing
- gated GitHub Pages deployment on passing Node source tests and Chromium Playwright tests, followed by a smoke test against the deployed public URL

## [2.2.3] - 2026-07-13

### Changed

- renamed the map-settings **Text** section to **Map heading** so the group is clear without changing its Title or Subtitle controls

## [2.2.2] - 2026-07-13

### Fixed

- replaced low-contrast dark-purple map symbols with theme-aware marker colors that remain clearly visible on the dark map
- added crisp solid backplates and contrasting keylines to every map and legend marker without using blur, glow, or shadow effects
- made marker count badges use the same resolved theme color as their location symbol
- moved repeated-location badges outward and included every badge in shared-anchor spacing, label placement, and state-initial collision checks

### Changed

- unified map and legend rendering so headquarters, regional headquarters, site, contract-site, and future-site symbols use the same complete visual treatment in the preview, SVG, PNG, and clipboard output
- slightly enlarged location symbols and expanded same-anchor spacing, label clearance, and state-initial collision clearance so every symbol remains distinct
- removed the redundant **Standalone · No map service required** heading and standalone wording from the application footer

## [2.2.1] - 2026-07-13

### Added

- added an **Edit** action for every saved location, reusing the location form to change its label, state, city or installation, and site type while preserving its position in the list
- added an explicit **Cancel edit** action that exits edit mode without changing the saved location

### Fixed

- moved **Clear locations** from the map-preview header into the Locations header beside the content it clears
- constrained text fields and choice controls to their form columns so long installation names no longer overflow the Add a location panel
- locked regular state abbreviations to fixed, validated interior positions while retaining protected callouts for the smallest states and District of Columbia
- removed visible `Statewide` place labels and migrated the exact legacy nine-sample starter set to the current city-based samples
- removed text glow, outline, and doubled callout strokes that made dark and transparent modes look cluttered

### Changed

- simplified the visible location categories to **Headquarters**, **Regional headquarters**, **Site**, **Contract site**, and **Future site**; the internal `hub` key remains compatible with older saved maps
- migrated both the version 2.1 nine-location starter set and the version 2.2 ten-location starter set to the current city-based samples and plain-language category names
- simplified transparent exports with crisp solid neutral typography, single-stroke connectors, and compact background plates for city and installation labels
- shortened the default subtitle and strengthened the visual hierarchy for faster reading across themes and canvas ratios
- documented that transparent PNG and SVG output should be previewed on its intended destination background because no single text color can guarantee contrast over every possible image
- clarified that the Huntsville Regional Headquarters and contract-site entries are user-provided, while all other default Astrion sites are demonstration data

## [2.2.0] - 2026-07-13

### Added

- embedded 31,847 U.S. city and community records derived from the official 2025 U.S. Census National Places Gazetteer
- state-filtered city/community entry with validation against the embedded catalog
- an optional catalog of 887 selectable military-installation anchors covering all 51 state/DC codes: 805 FY2024 DoD MIRTA points and 82 Coast Guard records from 2025 Census military landmarks
- installation filtering by state, including Redstone Arsenal under Alabama and Fort Campbell under both Tennessee and Kentucky
- city- and installation-positioned markers with an optional collision-aware place-label layer
- same-anchor grouping that keeps different location types visually distinct and gives repeated records of the same type a numeric count badge
- a Huntsville, Alabama sample with both a Regional HQ and a Contract Site

### Changed

- moved location symbols into a dedicated layer above every state outline so border-adjacent markers stay visible
- protected every state initial from overlap by borders, callout lines, location markers, anchor labels, and counts
- moved Florida and Louisiana initials to protected interior positions and placed state counts at interior-safe geometry candidates instead of a fixed centroid offset
- added contrasting halos to titles, subtitles, legend labels, and Northeast callout connectors so transparent exports remain readable when pasted onto light or dark graphics
- made downloaded SVGs presentation-only by stripping browser-only state-selection roles and focus attributes from the exported copy
- kept city/community as the default anchor while making military installations selectable rather than plotting all 887 automatically
- updated the location list to show the selected city/community or installation, state, and site type
- retained older state-only saved records as explicit `Statewide` locations instead of assigning a fabricated city
- kept all city and installation reference data fully embedded so the app still has no runtime map service, geocoder, government connection or approval, account, API key, or network dependency
- documented that the public installation sources do not include classified or otherwise unreleased sites, leased sites, or every small Guard and Reserve site

## [2.1.0] - 2026-07-13

### Changed

- removed creator attribution and version text from copied and downloaded map graphics
- removed the synthetic demonstration footer from copied and downloaded map graphics
- kept version and creator attribution visible in the application interface and documentation only
- replaced same-shape location dots with a star for headquarters, diamond for regional HQ, circle for major hubs, square for contract sites, and triangle for future sites
- made state abbreviations neutral and removed active-state highlighting so location symbols provide the visual emphasis
- changed site counts to an optional, neutral treatment and disabled them by default

## [2.0.0] - 2026-07-13

### Changed

- replaced the schematic state-block grid with a geographic map of the United States
- added recognizable state boundaries using embedded Census-derived geometry
- added Alaska and Hawaii insets and geographic handling for the District of Columbia
- added small-state callout labels and expanded selection targets
- updated state-level location markers for the geographic projection
- added visible version and creator attribution to the application and exported graphics

### Preserved

- PNG export at 1x, 2x, and 3x resolution
- scalable SVG export
- clipboard image copy
- themes, colors, labels, counts, legend, grid, and transparency controls
- local-only persistence with no backend, account, API key, or runtime map service

## [1.0.0] - 2026-07-13

### Added

- initial standalone Astrion Map Builder
- editable titles, themes, canvas ratios, and state-level synthetic locations
- PNG, SVG, and clipboard output
