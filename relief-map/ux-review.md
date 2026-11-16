# United States in Relief: interface review

Reviewed: November 16, 2026, against the first release (#199). The changes below shipped in the release that followed it.

## Method

Three passes: a heuristic walkthrough of the five things a visitor tries first (look around, find a place, learn what a spot is, change the scene, share it), a check against WCAG 2.2 AA for the parts a 3D map usually fails, and a comparison with the conventions people already know from map and globe viewers. No user testing was run. The findings are an expert review and should be read as that.

## Sources

| Source | What it says | Where it applies here |
|---|---|---|
| [WCAG 2.2, 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) (AA) | Anything done by dragging must also work with a single pointer without dragging | Orbit, pan and zoom were drag, wheel and pinch only |
| [WCAG 2.2, 2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) (A) | Its own example: a map with pinch zoom also offers plus and minus buttons | No zoom buttons |
| [WCAG 2.2, 2.5.8 Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum) (AA) | Pointer targets are at least 24 by 24 CSS pixels | Checkboxes were 15 px; tour chips about 28 px tall |
| [WCAG 2.2, 2.2.2 Pause, Stop, Hide](https://www.w3.org/TR/WCAG22/#pause-stop-hide) (A) | Motion that starts on its own and lasts over five seconds needs a way to pause it | The water animates continuously with no control |
| [Nielsen Norman Group, Icon Usability](https://www.nngroup.com/articles/icon-usability/) | Icons need a visible text label; do not rely on hover | Guides the dock: every button is an icon with its word |
| [Nielsen Norman Group, Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/) | Use sheets for temporary controls while keeping the background in view; give a clear way to dismiss; never stack them | Guides the phone layout |
| [WAI-ARIA Authoring Practices, Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | Keyboard and screen-reader contract for a text field with a list of suggestions | Guides search |
| [MapLibre GL JS navigation control](https://www.maplibre.org/maplibre-gl-js/docs/examples/display-map-navigation-controls/) | The familiar cluster: zoom in, zoom out, and a compass that resets north | Guides the navigation cluster |

## Findings and what shipped

Ranked by how much each one cost a visitor.

| # | Finding | Evidence | Change |
|---|---|---|---|
| 1 | **No way to move the map without dragging.** No zoom buttons, no compass, no way back to north. A visitor on a trackpad without two-finger scroll, or with limited dexterity, was stuck. | Fails 2.5.7; the 2.5.1 example describes exactly this case | A navigation cluster: rotate left and right, a compass that shows and resets north, zoom in and out, a top-down or angled switch, and whole map. One press is one whole step, however slowly the device draws; holding keeps it going. Keys behave the same way. |
| 2 | **The control panel covered the map.** A 300 px panel sat open on the right for the whole visit, and the camera had to be shifted sideways to make room for it. | The map is the content; the first release spent a quarter of a laptop screen on controls used a few times | The panel is gone. Five labelled dock buttons open one sheet at a time and the map is centred again. |
| 3 | **No search.** Finding a home state meant orbiting until it turned up. | The most common first task on any map | A search box over 48 states, 44 cities, 19 peaks and 39 regions, with keyboard support. Choosing a state flies there, turns on state lines and shows its highest, average and lowest ground. Press / to jump to it. |
| 4 | **Nothing to learn from on a phone.** Elevation and state appeared only on mouse hover. | Touch has no hover | Click or tap anywhere to drop a pin and open a card with elevation or sea depth, state and coordinates, with Fly here and Copy coordinates. |
| 5 | **Phone layout was a desktop panel in a dropdown.** | The toggle sat in the far top corner and the panel hid most of the map | The dock becomes a bottom tab bar, sheets rise from it over no more than 58 percent of the screen, and the card sits just above it. |
| 6 | **Tours were unexplained jump buttons.** | Nine names with no reason to press them | Each stop has a one-line fact. A guided tour plays through them with previous, pause and next, and stops the moment the visitor touches the map. |
| 7 | **A view could not be shared or reopened.** | Reloading always returned to the start | The address tracks the view, time of day and exaggeration. Share has Copy link, Save image and Full screen. |
| 8 | **Continuous motion with no pause.** | Fails 2.2.2 | More has a switch that pauses water and animation. It starts on for visitors who ask their system for reduced motion. |
| 9 | **Small targets.** | Fails 2.5.8 | Every control is at least 40 px, 44 px on touch screens. A test fails the build if any control drops under 24 px. |
| 10 | **Both units on every number.** "1,606 m (5,268 ft)" twice per line. | Noise for every reader | One unit system at a time, chosen from the browser language and switchable in More. |
| 11 | **No first-run guidance.** | Drag, scroll and right-drag are not discoverable | One line of gesture hints on the first visit, worded for mouse or touch, gone at the first interaction. Help also opens with ?. |
| 12 | **No legend.** | Orange forest and banded red rock need explaining | Layers has a colour key. |
| 13 | **Time of day was a bare slider.** | 5:54 pm means little without a reference | Five presets (Sunrise to Night) above the slider, and Play the day. |
| 14 | **Hide the interface had no way back on touch.** | It was the H key only | A Show controls button stays on screen. |
| 15 | **Place names were tab stops.** Up to thirty before reaching a control. | Keyboard order | Names are pointer-only and hidden from assistive technology; search reaches the same places. |

Also fixed while here: Escape closes the open sheet and returns focus to its button; the readout no longer repeats both units; changing quality keeps the current view through the reload; place names keep clear of whatever interface is on screen.

## Not done, and why

| Item | Why it waited |
|---|---|
| Testing with real visitors | Nothing here was observed. The ranking above is judgement. Five people trying to find their home state would confirm or reorder it. |
| Screen-reader walkthrough | Roles, names and focus order follow the patterns cited, and the tests check them, but no screen reader was run against the page. |
| Highlighting the chosen state on the terrain | State lines switch on instead. A true highlight needs the state raster in the terrain shader. |
| Measuring distance between two points | Useful, but a second mode on top of click-to-inspect. Worth doing only if visitors ask. |
| Frame rate on real hardware | Still unmeasured. Interface work does not change it. |
