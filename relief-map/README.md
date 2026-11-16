# United States in Relief

An interactive 3D relief map of the contiguous United States, drawn as a tabletop model standing in an exhibition hall.

Live: <https://azjester.github.io/work/relief-map.html>

The published page is `relief-map.html` at the repository root. It is one file: the renderer, three.js and all map data are inlined, and it makes no network requests. Save it and open it from disk and it works the same.

## What is real and what is styled

| Part | Source | Treatment |
|---|---|---|
| Elevation and sea floor | Terrain Tiles (Mapzen, hosted by AWS Open Data), zoom 7 | Resampled to a 2048 x 1344 grid, 2.5 km per cell |
| Land cover | NLCD 2021 (USGS, MRLC) | Class fractions per 5 km cell: conifer, hardwood, crops, shrub, grass, pasture, wetland, urban, barren, water, ice |
| Countries, lakes, rivers, state lines | Natural Earth 1:10m | Rasterised at 1.25 km per cell |
| Cities, peaks, regions | Hand-written table in `src/places.js` | 44 metropolitan areas, 19 summits, 39 regions |

Everything shares one grid in Albers Equal Area Conic (EPSG:5070), so shapes and areas are the ones a wall map of the country uses.

The slab keeps the United States, the whole of the Great Lakes with a strip of Canadian shore, and the sea within 200 km of the coast. Where the sea lies between the United States and a neighbour, the cut follows the line that is equally far from both.

What the data cannot hold is generated when the page loads:

- **Relief.** Elevation is split into three bands. Regional height (features wider than about 50 km) is kept in full, range-scale relief at 62 percent and the finest ridges at 30 percent, and high ground is then lifted further. Without this, 50x exaggeration turns every range into needles. A small amount of ridged noise adds texture where the land is already rough.
- **Plateau country.** Around the Four Corners the land is stepped into benches and the rivers are cut into canyons.
- **Surface.** One shader blends the land-cover classes, then adds rock on steep ground, snow above a snowline that falls with latitude, beaches, a procedural field pattern on cropland, and water coloured by real depth.
- **Scenery.** Trees are scattered where the land cover says forest, coloured for autumn in the Northeast. Saguaros stand in the Sonoran Desert. Skylines are blocks sized by metropolitan population. None of it is surveyed: there is no real building or tree here.

The hover readout reports the true elevation from the embedded grid, not the exaggerated height on screen.

## Limits

- A 2.5 km grid rounds summits off. Mount Whitney reads about 3,810 m against a true 4,421 m, and isolated volcanoes lose more.
- Rivers, lakes and coast come from 1:10m data, so small features are missing or simplified.
- Vertical exaggeration is 50x by default and is not uniform (see Relief above). It is a model to look at, not a map to measure from or navigate by.
- Alaska, Hawaii and the territories are not included.
- It needs WebGL 2 with floating-point render targets. The High preset expects a discrete GPU or a recent integrated one. Frame rate has been checked only on a software renderer during development, so the presets are estimates; the page lowers its render resolution on its own when frames run long.

## Controls

| Action | Mouse or touch | Keys |
|---|---|---|
| Orbit | Drag, or one finger | Q, E |
| Pan | Right-drag or Shift-drag, or two fingers | Arrows, W A S D |
| Zoom | Scroll or pinch; double-click flies to a spot | + and - |
| Tours | Panel buttons | 1 to 9 |
| Place names, state lines | Panel switches | L, B |
| Hide the interface, reset the view | | H, R |

URL parameters: `q` (`low`, `medium`, `high`, `ultra`), `h` (hour, 5 to 21.5), `ex` (exaggeration, 20 to 90), `tour` (a tour id from `src/places.js`), `view` (`lon,lat,distance,bearing,pitch`), `ui=0`, and a layer name set to `0` or `1` (`labels`, `borders`, `trees`, `cities`, `hall`, `blur`).

## Layout

```
relief-map/
  build.mjs            bundles src/ and data/ into ../relief-map.html
  data/                baked data the page embeds (committed, about 2.2 MB)
  tools/build_data.py  bakes data/ from the open sources
  src/
    main.js            entry point: loading, camera, picking, frame loop
    geo.js, data.js    projection and decoding (pure, shared with the tests)
    assets.js          embedded data to textures and grids
    bake.js            GPU bake: relief bands, detail, slopes, occlusion
    terrain.js         quadtree of displaced patches and the surface shader
    wall.js            the cut edge of the slab
    props.js           trees, saguaros, skylines
    hall.js, sky.js    the hall, the sun and the sky
    post.js            occlusion, depth of field, bloom, tone mapping
    ui.js, places.js   interface, labels, tours
```

## Rebuilding

The page:

```
npm ci
npm run build:relief        # writes relief-map.html
npm test                    # includes a check that relief-map.html matches the sources
```

The data, only when a source or the grid changes. It needs Python 3 with numpy, scipy and Pillow, the seven Natural Earth GeoJSON files named in `NE_FILES` placed in a cache directory, and network access to the terrain tiles and the NLCD map service:

```
python3 -I relief-map/tools/build_data.py <cache-dir> relief-map/data [preview-dir]
```

## Credits

Terrain Tiles by Mapzen, hosted by AWS Open Data. National Land Cover Database 2021 by the U.S. Geological Survey and the Multi-Resolution Land Characteristics Consortium. Natural Earth, public domain. three.js, MIT License.
