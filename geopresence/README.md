# Map Builder

Map Builder is a browser application for creating a polished geographic U.S. presence map and exporting it for presentations, documents, posters, and other graphics.

Version: **4.0.0**

Created by **Dr. Shane Turner**

Public application: **https://azjester.github.io/work/geopresence/**

The hosted application is the simplest way to use it. For local development, serve the repository over HTTP and visit `/geopresence/`; the versioned reference catalogs are loaded from the same origin.

## What it does

- puts the map at the center of the screen with one rail beside it for Add a location, Locations, and Map settings, so the map stays in view while locations are added
- presents a compact progressive-disclosure Map settings panel with Quick setup open by default and Map details, Advanced, and Project collapsed
- keeps concise summaries on every settings group and updates them as the map choices change
- displays recognizable geographic boundaries for every U.S. state and the District of Columbia, with Alaska and Hawaii insets
- searches 32,058 official 2025 Census places and 887 public-reference military-installation anchors
- uses stable Census GEOID and LSAD fields so places with the same base name remain separate and receive identifying choice labels
- adds, edits, and removes locations anchored to a selected city, community, or military installation
- uses a familiar generic teardrop pin as the default location-marker silhouette, with an original application-rendered design rather than Google-branded artwork
- distinguishes eleven built-in categories inside each pin: Headquarters star, Regional headquarters building, Site circle, Contract site briefcase, Future site clock, Program office document, Operations center network/gear, Customer site person, Partner site link, Test or range site target, and Manufacturing facility factory
- combines repeated records of the same type at one anchor behind a numeric count badge
- draws every pin with its tip exactly on the place it marks; a pin is never moved to make room for anything else
- gives places closer than about 21 miles one shared numbered pin on their midpoint, and lists what each number stands for in a key under the map
- follows the Astrion Brand Kit: the website colors (Void, Carbon, Gunmetal, Bone, Steel, Ion) for the editor, the three map themes, the heading accents, and every pin; Archivo and JetBrains Mono for type; and the outlined Astrion wordmark in the header
- adapts pin outlines for light, dark, and transparent destinations; the legend renders identical complete pins, includes only categories used on the map, and wraps automatically
- moves a state abbreviation inside its state when a pin or place label needs the spot, and hides it when the state has no room left
- warns when a place label sits on a leader or is hidden, when a state abbreviation is hidden, when the key cannot list every entry, and when long heading text is fitted
- offers fit, zoom-in, zoom-out, and full-screen preview controls for desktop and mobile use
- supports light, dark, checkerboard, and custom destination previews for transparent graphics, plus automatic, dark, or light transparent-export text
- exports PNG at 1×, 2×, or 3× quality, exports SVG, and copies PNG where the browser supports image clipboard access
- optionally creates a clean SVG with hidden titles, descriptions, editor metadata, and data attributes removed
- saves a validated project in browser storage and supports portable JSON project import/export
- imports up to 1,000 locations at once from a validated UTF-8 CSV file without mixing location uploads with JSON project transfer
- confirms destructive replacements, keeps an Undo history, and saves a recovery snapshot for the last destructive change

The editor opens as an empty project. Sample Astrion locations are opt-in and are identified as demonstration data in the editor only; notices, creator text, and version text do not appear in copied or downloaded map graphics. The Huntsville Regional Headquarters and contract entries reflect user-provided information. The other optional locations are demonstration examples, not claims about current Astrion sites.

## Workspace

The map is the work area. On a desktop screen it sits on the left and is sized to the window, so the whole map is visible without scrolling. One rail on the right holds, in order, **Add a location**, **Locations**, and **Map settings**. The map stays in place while the rail scrolls, as long as the window is tall enough to show the whole map panel. On a phone the map comes first, followed by the same three panels, with section links at the top.

- **Undo** sits in the map header and is enabled whenever there is a change to undo. Its tooltip names the change. Ctrl+Z (Command+Z on a Mac) does the same when the cursor is not in a text field. Up to 20 changes can be undone, one at a time.
- After a location is added, the state, source, and type stay as they were, so several locations in one state take fewer steps. Pressing Enter in a field adds the location and returns the cursor to the name field.
- The status line under the map shows the canvas size, the number of locations, and any layout warning.
- **Full screen** uses the whole window. Zooming above 100% lets the map grow past the window and scroll inside its stage.
- Leaving the city or installation field closes its list of matches.
- The sample button reads **Load sample locations** when the project is empty and **Replace with sample locations** when it is not.

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

### Where pins are drawn

A pin's tip is the location. Nothing in the layout moves a pin.

- Each place gets one pin, with its tip on the catalog point for that city, community, or installation.
- Places closer than 7 map units (about 21 miles) share one pin on the midpoint of their points. At this scale two pins that close would cover each other.
- One location type at a place shows that type's pin. Several locations of that type add a count badge.
- Several types at one place, or several merged places, show a numbered pin in the form of the highest tier present. Numbers run west to east.
- A key under the map names each numbered pin's places and its location types with counts. The key appears only when a numbered pin exists, and the map shrinks to make room for it. If the key cannot list every entry it ends with "+ N more" and the editor says so.
- Pins are painted south to north, so where one pin stands above another both tips stay visible.

Text gives way to pins, in this order:

1. A place label takes a spot beside its own pin: above, below, right, then left.
2. State abbreviations then move inside their state to clear pins and those labels. One with no room is hidden and counted in the warning under the map.
3. A place label that found no spot beside its pin is drawn nearby on a short leader. It stays within 84 map units (about 250 miles) of its pin and is never as close to another pin as to its own. If no such spot exists the label is hidden and counted in the warning. The pin stays, and its name remains in the pin's tooltip and accessible name.

Label backing plates never overlap each other, a pin, or a state abbreviation.

Pins carry no category hue. The Astrion website palette has one accent, so three pin forms do the work color used to do:

- **Ion pin:** Headquarters and Regional headquarters. On the light and clean themes the Ion fill sits inside a Void outline, which is what holds contrast against the land. On a transparent light-theme export headed for a dark background the outline has to be light, so the pin becomes Void with an Ion symbol.
- **Solid neutral pin:** Site, Program office, Operations center, Test or range site, and Manufacturing facility. Bone on the dark theme, dark gray on the light and clean themes.
- **Outlined pin:** Contract site, Future site, Customer site, and Partner site, which mark presence at someone else's location or a planned one.

The interior symbol still identifies each of the eleven categories on its own.

Pin outlines adapt to the light, dark, clean, and transparent destination treatment. Legend entries call the same pin renderer as map locations, so silhouette, interior symbol, pin form, outline, and visual weight remain identical. The legend includes only types currently used on the map and wraps automatically when several are present. All eleven built-in categories are available in the location editor, and the metadata-driven pin renderer can accept additional categories in a future release without redesigning the placement system.

## Brand colors

Color comes from the tokens used on astrion.us and nothing else:

| Token | Hex | Used for |
|---|---|---|
| Void | `#050607` | editor ground, dark map background, ink on light maps |
| Carbon | `#0B0D10` | panels, top bar, dark-map label plates |
| Gunmetal | `#171B22` | form fields, preview stage, dark-map land |
| Bone | `#EEEDE7` | ink on dark, light-map background, clean-map land |
| Steel | `#8A8F99` | small labels, dark-map state boundaries |
| Ion | `#23CEF0` | the one accent: primary actions, links, focus rings, headquarters pins, default heading accent |
| Flare | `#E2FDFF` | hover and error emphasis in the editor |

Exported graphics need solid colors, so the map themes add four tints, each a token laid over another token: `#B4B3AF` (Bone 75% on Void), `#4B4B4A` (Void 70% on Bone), `#6E6E6C` (Void 55% on Bone), and `#D0D1D0` (Steel 30% on Bone). The Clean white theme and the light destination preview keep plain white because they stand in for a white page.

The heading accent offers Astrion Ion, Steel, Bone, and Void. A project saved with one of the retired accents (Force, Sky, Water, Midnight) opens with the closest current one: the three blues and purple become Ion, and Midnight becomes Void.

The palette has no red, amber, or green. Warnings, errors, and destructive actions are told apart by weight, outline, and wording instead of hue.

## Brand typography and wordmark

Type follows the Astrion Brand Kit typography guide (version 1.0, 2026-10-01):

- **Archivo** sets display and body copy in the editor and all text in the map: heading, subtitle, state abbreviations, place labels, counts, and legend.
- **JetBrains Mono** sets utility labels, versions, and compact metadata in the editor: the version line, section labels, settings summaries, the preview status line, code samples, and the footer.
- **Space Grotesk** is the web wordmark face only. The header uses the kit's outlined wordmark SVG, which needs no font, so Space Grotesk is never loaded.

Both fonts are self-hosted in `assets/fonts/` as Latin variable WOFF2 files with their SIL Open Font License texts. The page makes no request to a font service.

How the map text behaves in each output:

- **Preview:** drawn with the page's fonts.
- **PNG and Copy PNG:** an SVG drawn as an image cannot see the page's fonts, so Archivo is embedded in the copy handed to the rasterizer. The PNG matches the preview on any computer.
- **SVG download:** text names Archivo with Arial as the fallback and nothing is embedded, so the file stays plain and editable. It shows Archivo where the Brand Kit desktop fonts are installed and Arial elsewhere.

If the font file cannot be read (first visit while offline), the editor and the PNG fall back to the system sans-serif and export still works.

Corners use one 4 px radius and panels are flat with hairline borders, as on astrion.us.

## Project safety and portability

Saved browser data is validated against the current model schema before use. Invalid or unavailable browser storage produces a visible, nonfatal warning instead of stopping the editor. Clear, Reset, Remove, sample replacement, and project import use confirmation and recovery behavior.

Use **Download project** to create a JSON backup and **Open project** to move that file to another browser or device. Imported JSON is schema-validated before it can replace the current map. This is manual project portability, not cloud synchronization.

## Bulk location upload

Use **Upload locations** to add locations from a comma-separated values file. The accepted file type is **UTF-8 CSV (`.csv`)**, with a maximum size of **2 MB** and no more than **1,000 nonblank location rows**. The upload dialog includes a **Download CSV template** button that provides the required headers and sample city and installation rows.

Every CSV must contain these required headers:

| Header | Required value |
| --- | --- |
| `name` | The label shown for the location; maximum 100 characters. |
| `state` | A two-letter U.S. state or District of Columbia code, such as `AL` or `DC`. |
| `type` | One of the supported lowercase location-type slugs listed below. |
| `source` | Either `city` or `installation`. |

City rows must also provide either `city` or `city_geoid`. Installation rows must provide either `installation` or `installation_id`. Stable IDs are recommended because a name can be duplicated or ambiguous within a state. If a row supplies both a name and an ID, they must identify the same catalog entry. Additional columns are ignored.

The accepted type slugs are:

| Type slug | Location type |
| --- | --- |
| `headquarters` | Headquarters |
| `regional` | Regional headquarters |
| `hub` | Site |
| `contract` | Contract site |
| `future` | Future site |
| `program` | Program office |
| `operations` | Operations center |
| `customer` | Customer site |
| `partner` | Partner site |
| `test` | Test or range site |
| `manufacturing` | Manufacturing facility |

Example:

```csv
name,state,type,source,city,city_geoid,installation,installation_id
Huntsville Regional Headquarters,AL,regional,city,Huntsville,0137000,,
Redstone Arsenal Contract,AL,contract,installation,,,Redstone Arsenal,dod-fid-986
```

The entire file is parsed and validated before the map changes. If any required header or row is invalid, **nothing is imported** and the dialog reports the problems. After a valid file is staged, choose **Add to current locations** or **Replace current locations**. Append mode skips locations that are already on the map; replace mode asks for confirmation. A completed import can be reversed with **Undo**.

CSV location upload changes only the map's location list. It does not import map headings, themes, export settings, or other project choices. Use the separate **Open project** control for a Map Builder JSON project backup, and use **Download project** to create that JSON file.

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

The layout places pins first, on their points, then place labels, then state abbreviations, as described under "Where pins are drawn". The same resolved layout is used by the preview, PNG, clipboard, and SVG outputs. Maps saved in earlier versions keep their locations and settings and are redrawn with the pins on their points.

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
