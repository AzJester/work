# Changelog

All notable changes to Astrion Map Builder are documented here.

Created by Dr. Shane Turner.

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
