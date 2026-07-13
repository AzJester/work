# Changelog

All notable changes to Astrion Map Builder are documented here.

Created by Dr. Shane Turner.

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
