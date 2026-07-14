import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "geopresence/index.html"), "utf8");
const changelog = readFileSync(resolve(root, "geopresence/changelog.md"), "utf8");

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16) / 255);
  const linear = channels.map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("map builder inline application parses as JavaScript", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1], { filename: "map-builder-inline.js" }));
});

test("map builder is self-contained and has no external runtime dependency", () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+(?:stylesheet|preload)/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket)\b/);
  assert.doesNotMatch(html, /(?:services\d*\.arcgis\.com|ArcGIS REST|FeatureServer)/i);
  assert.doesNotMatch(html, /Azure Maps|Highcharts/i);
});

test("map builder provides PNG, SVG, and clipboard output", () => {
  assert.match(html, /id="exportPng"/);
  assert.match(html, /id="exportSvg"/);
  assert.match(html, /id="copyPng"/);
  assert.match(html, /canvas\.toBlob\(resolve,"image\/png"\)/);
  assert.match(html, /new XMLSerializer\(\)/);
  assert.match(html, /ClipboardItem/);
  assert.match(html, /lastPngBytes/);
  assert.match(html, /lastSvgBytes/);
});

test("map builder supports graphic composition controls", () => {
  for (const id of ["mapTitle", "mapSubtitle", "aspect", "scale", "theme", "accent", "showLabels", "showCityLabels", "showCounts", "showLegend", "showGrid", "transparent"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="mapFooter"/);
  assert.match(html, /16:9/);
  assert.match(html, /4:3/);
  assert.match(html, /Square/);
});

test("map builder uses complete projected U.S. state geometry instead of tiles", () => {
  const geometryMatch = html.match(/const stateGeometry=(\[[^\n]+\]);/);
  assert.ok(geometryMatch, "embedded state geometry was not found");
  const geometry = JSON.parse(geometryMatch[1]);
  const expectedCodes = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");
  assert.equal(geometry.length, 51);
  assert.deepEqual(geometry.map(item => item.code).sort(), expectedCodes.sort());
  assert.ok(geometry.every(item => /^M/.test(item.path) && item.path.length > 20));
  assert.match(html, /states-albers-10m\.json/);
  assert.match(html, /class="state-shape\$\{isCallout/);
  assert.match(html, /d="\$\{path\}"/);
  assert.match(html, /Geographic map of the United States/);
  assert.doesNotMatch(html, /const stateLayout=/);
  assert.doesNotMatch(html, /United States tile map/i);
});

test("map and location editing expose accessible controls", () => {
  assert.match(html, /<svg[^>]+role="img"/);
  assert.match(html, /class=\"state-hit\" data-state/);
  assert.match(html, /tabindex=\"0\" role=\"button\"/);
  assert.match(html, /id="pinForm"/);
  assert.match(html, /id="pinAnchorKind"/);
  assert.match(html, /id="pinCity"[^>]+list="cityOptions"/);
  assert.match(html, /id="cityOptions"/);
  assert.match(html, /id="pinInstallation"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion/);
});

test("the user-provided Huntsville entries and demonstration samples are bundled", () => {
  assert.match(html, /const samples=/);
  assert.match(html, /name:"Huntsville Regional Headquarters"/);
  assert.match(html, /name:"Huntsville Contract Operations"/);
});

test("version, creator, and changelog are published", () => {
  assert.match(html, /const APP_VERSION="2\.2\.2"/);
  assert.match(html, /Created by Dr\. Shane Turner/);
  assert.match(changelog, /## \[2\.2\.2\] - 2026-07-13/);
});

test("embedded Census place catalog covers every state and DC", () => {
  const catalogMatch = html.match(/const cityCatalog=(\[[^\n]+\]);/);
  assert.ok(catalogMatch, "embedded city catalog was not found");
  const catalog = JSON.parse(catalogMatch[1]);
  const expectedCodes = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");
  assert.equal(catalog.length, 31847);
  assert.deepEqual([...new Set(catalog.map(place => place[0]))].sort(), expectedCodes.sort());
  assert.ok(catalog.every(place => place.length === 4 && place[1] && Number.isFinite(place[2]) && Number.isFinite(place[3])));
  assert.equal(new Set(catalog.map(place => `${place[0]}|${place[1].toLocaleLowerCase("en-US")}`)).size, catalog.length);
  const huntsville = catalog.find(place => place[0] === "AL" && place[1] === "Huntsville");
  assert.deepEqual(huntsville, ["AL", "Huntsville", 670.2, 388.2]);
});

test("embedded military installation catalog has the complete pinned DoD and Coast Guard snapshot", () => {
  const catalogMatch = html.match(/const installationCatalog=(\[[^\n]+\]);/);
  assert.ok(catalogMatch, "embedded military installation catalog was not found");
  const catalog = JSON.parse(catalogMatch[1]);
  const expectedCodes = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");

  assert.equal(catalog.length, 887);
  assert.equal(catalog.filter(site => site[9] === "dod").length, 805);
  assert.equal(catalog.filter(site => site[9] === "uscg").length, 82);
  assert.deepEqual([...new Set(catalog.map(site => site[0]))].sort(), expectedCodes.sort());
  assert.ok(catalog.every(site => (
    Array.isArray(site)
    && site.length === 10
    && expectedCodes.includes(site[0])
    && typeof site[1] === "string"
    && site[1].trim().length > 0
    && Number.isFinite(site[2])
    && Number.isFinite(site[3])
    && typeof site[4] === "string"
    && site[4].length > 0
    && typeof site[7] === "string"
    && site[7].split("|").every(code => expectedCodes.includes(code))
    && ["dod", "uscg"].includes(site[9])
  )));
  assert.equal(new Set(catalog.map(site => site[4])).size, catalog.length, "installation IDs must be unique");

  const redstone = catalog.find(site => site[1] === "Redstone Arsenal");
  assert.ok(redstone, "Redstone Arsenal was not found");
  assert.equal(redstone[0], "AL");
  assert.equal(redstone[9], "dod");

  const fortCampbell = catalog.filter(site => site[1] === "Fort Campbell");
  assert.equal(fortCampbell.length, 1, "Fort Campbell should be one canonical installation record");
  assert.equal(fortCampbell[0][0], "TN");
  assert.deepEqual(fortCampbell[0][7].split("|").sort(), ["KY", "TN"]);
  assert.equal(catalog.filter(site => site[4] === fortCampbell[0][4]).length, 1, "Fort Campbell must share one ID across both states");
});

test("location form switches cleanly between city and military installation anchors", () => {
  const form = html.match(/<form[^>]+id="pinForm"[\s\S]*?<\/form>/)?.[0] || "";
  assert.ok(form, "location form was not found");

  const sourceSelect = form.match(/<select[^>]+id="pinAnchorKind"[^>]*>/)?.[0] || "";
  assert.ok(sourceSelect, "location source selector was not found");
  assert.match(sourceSelect, /name="anchorKind"/);
  assert.match(form, /<option value="city"[^>]*>City \/ community<\/option>/);
  assert.match(form, /<option value="installation"[^>]*>Military installation<\/option>/);

  const installationSelect = form.match(/<select[^>]+id="pinInstallation"[^>]*>/)?.[0] || "";
  assert.ok(installationSelect, "military installation selector was not found");
  assert.match(installationSelect, /name="installation"/);
  assert.match(html, /installationsByState/);
  assert.match(html, /String\(item\[7\]\)\.split\("\|"\)/);
  assert.match(html, /installationById/);
  assert.match(html, /\$\("pinAnchorKind"\)\.addEventListener\("change"/);
  assert.match(html, /anchorKind/);
  assert.match(html, /anchorId/);
});

test("samples model Huntsville as both regional headquarters and contract presence", () => {
  const sampleMatch = html.match(/const samples=(\[[^\n]+\])\.map\(with(?:City|Anchor)\);/);
  assert.ok(sampleMatch, "sample locations were not found");
  const samples = vm.runInNewContext(sampleMatch[1]);
  const huntsville = samples.filter(pin => pin.state === "AL" && pin.city === "Huntsville");
  assert.equal(huntsville.length, 2);
  assert.deepEqual([...huntsville.map(pin => pin.type)].sort(), ["contract", "regional"]);
});

test("locations are validated, projected, grouped by anchor and type, and layered above states", () => {
  assert.match(html, /function resolveCity\(state,city\)/);
  assert.match(html, /const withAnchor=pin=>/);
  assert.match(html, /const anchorGroups=new Map\(\)/);
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(mapMarkup, /pin\.anchorId/);
  assert.match(html, /const pinsByType=new Map\(\)/);
  assert.match(html, /class="marker-count"/);
  assert.match(html, /class="place-label city-label"/);
  assert.match(html, /\$\{states\}<g class="marker-leader-layer">\$\{markerLeaders\}<\/g><g class="location-layer">\$\{placeMarkers\}/);
  assert.match(html, /city- or installation-positioned location markers/);
});

test("state initials stay protected from borders, markers, and location labels", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(mapMarkup, /const stateLabelBoxes=/);
  assert.match(mapMarkup, /const labelBoxes=stateLabelBoxes\.map\(/);
  assert.match(mapMarkup, /!labelBoxes\.some\(/);
  assert.match(mapMarkup, /class="state-label"[\s\S]*?<rect[^>]+opacity="\.98"/);
  assert.match(mapMarkup, /\$\{states\}<g class="marker-leader-layer">\$\{markerLeaders\}<\/g><g class="location-layer">[\s\S]*?<g class="state-label-layer">\$\{stateLabels\}/);
  assert.match(mapMarkup, /const markerLeaders=groups\.filter\(/);
});

test("state initials use fixed canonical positions independent of locations", () => {
  const canonicalMatch = html.match(/const canonicalLabelPositions=(\{[^\n]+\});/);
  assert.ok(canonicalMatch, "canonical state label positions were not found");
  const canonical = vm.runInNewContext(`(${canonicalMatch[1]})`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(canonical)),
    {
      FL: [780.27, 515.87],
      KY: [703.99, 314.18],
      LA: [565.02, 489.08],
      MI: [675.32, 170.37],
      NY: [842.51, 168.82],
      WV: [758.17, 295.16]
    }
  );

  const stateLabelPoints = html.match(/const stateLabelPoints=[^\n]+/)?.[0] || "";
  assert.match(stateLabelPoints, /labelPositions\[code\]\|\|canonicalLabelPositions\[code\]\|\|\[x,y\]/);
  assert.doesNotMatch(stateLabelPoints, /\b(?:groups|nearby|pins|anchorGroups)\b/);
});

test("transparent themes use solid readable text and single callout leaders", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(mapMarkup, /const canvasText=model\.transparent\?"#757575":p\.text,canvasMuted=model\.transparent\?"#757575":p\.muted/);
  assert.match(mapMarkup, /fill="\$\{canvasText\}"[^>]*>\$\{esc\(model\.mapTitle\)\}/);
  assert.match(mapMarkup, /fill="\$\{canvasMuted\}"[^>]*>\$\{esc\(model\.mapSubtitle\)\}/);
  assert.match(mapMarkup, /stroke="\$\{model\.transparent\?"#757575":p\.muted\}" stroke-width="1\.6"/);
  assert.match(mapMarkup, /font-size="14" fill="\$\{canvasText\}"/);

  const leaderStart = mapMarkup.indexOf("const leaderPath=");
  const leaderEnd = mapMarkup.indexOf("const aria=", leaderStart);
  assert.ok(leaderStart >= 0 && leaderEnd > leaderStart, "callout leader definition was not found");
  const leaderDefinition = mapMarkup.slice(leaderStart, leaderEnd);
  assert.equal((leaderDefinition.match(/<path\b/g) || []).length, 1, "callouts should render one leader path");

  assert.doesNotMatch(html, /transparentTitleHalo|transparentSubtitleHalo|legendTextHalo/);
  assert.doesNotMatch(html, /paint-order/);
  assert.doesNotMatch(html, /stroke-width="4\.5"/);
  assert.doesNotMatch(html, /drop-shadow/);
});

test("small-state callout leaders stop at label edges without crossing initials", () => {
  const geometryMatch = html.match(/const stateGeometry=(\[[^\n]+\]);/);
  const calloutMatch = html.match(/const labelPositions=(\{[^\n]+\});/);
  const canonicalMatch = html.match(/const canonicalLabelPositions=(\{[^\n]+\});/);
  assert.ok(geometryMatch && calloutMatch && canonicalMatch, "state label geometry was not found");
  const geometry = JSON.parse(geometryMatch[1]);
  const callouts = vm.runInNewContext(`(${calloutMatch[1]})`);
  const canonical = vm.runInNewContext(`(${canonicalMatch[1]})`);
  const positions = Object.fromEntries(geometry.map(state => [state.code, callouts[state.code] || canonical[state.code] || [state.x, state.y]]));
  const rectangles = Object.fromEntries(Object.entries(positions).map(([code, [x, y]]) => [code, { x1: x - 16, y1: y - 12, x2: x + 16, y2: y + 12 }]));
  const segments = Object.entries(callouts).map(([code, [lx, ly]]) => {
    const state = geometry.find(item => item.code === code);
    const dx = lx - state.x;
    const dy = ly - state.y;
    const edgeScale = 1 / Math.max(Math.abs(dx) / 16, Math.abs(dy) / 12);
    return { code, start: [state.x, state.y], end: [lx - dx * edgeScale, ly - dy * edgeScale] };
  });

  for (const segment of segments) {
    const target = rectangles[segment.code];
    const [x, y] = segment.end;
    const onTargetEdge = ((Math.abs(x - target.x1) < 0.02 || Math.abs(x - target.x2) < 0.02) && y >= target.y1 && y <= target.y2)
      || ((Math.abs(y - target.y1) < 0.02 || Math.abs(y - target.y2) < 0.02) && x >= target.x1 && x <= target.x2);
    assert.ok(onTargetEdge, `${segment.code} leader does not stop at its callout edge`);

    for (let step = 1; step < 200; step += 1) {
      const t = step / 200;
      const px = segment.start[0] + (segment.end[0] - segment.start[0]) * t;
      const py = segment.start[1] + (segment.end[1] - segment.start[1]) * t;
      for (const [code, rect] of Object.entries(rectangles)) {
        assert.ok(!(px > rect.x1 && px < rect.x2 && py > rect.y1 && py < rect.y2), `${segment.code} leader crosses ${code} initials`);
      }
    }
  }

  const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      const crosses = orientation(a.start, a.end, b.start) * orientation(a.start, a.end, b.end) < 0
        && orientation(b.start, b.end, a.start) * orientation(b.start, b.end, a.end) < 0;
      assert.equal(crosses, false, `${a.code} and ${b.code} leaders cross`);
    }
  }
});

test("state counts remain inside the protected state-label plate", () => {
  assert.match(html, /inlineCount=model\.showCounts&&counts\[code\]/);
  assert.match(html, /class=\"state-count-inline\"/);
  assert.match(html, /data-inline-count/);
  assert.match(html, /stateLabelBoxes=model\.showLabels\|\|model\.showCounts/);
  assert.doesNotMatch(html, /const stateCountPoints=new Map/);
  assert.doesNotMatch(html, /class=\"state-count\" data-state/);
  assert.doesNotMatch(html, /cx=\"\$\{x\+22\}\"/);
});

test("legacy defaults migrate to city samples without visible statewide text", () => {
  const signatureMatch = html.match(/const legacySampleSignatureSets=(\[new Set\([^\n]+\)\]),isLegacySampleSet=/);
  assert.ok(signatureMatch, "legacy sample signatures were not found");
  const signatureSets = vm.runInNewContext(signatureMatch[1]);
  assert.equal(signatureSets.length, 2);
  assert.deepEqual(
    [...signatureSets[0]].sort(),
    [
      "Enterprise HQ|AL|headquarters",
      "Southwest Hub|NM|hub",
      "Mountain Regional HQ|CO|regional",
      "Mid-Atlantic Hub|VA|hub",
      "Great Lakes Hub|OH|hub",
      "Northeast Site|MA|contract",
      "Coastal Site|FL|contract",
      "Texas Site|TX|contract",
      "Growth Scenario|AZ|future"
    ].sort()
  );
  assert.deepEqual(
    [...signatureSets[1]].sort(),
    [
      "Huntsville Regional HQ|AL|regional",
      "Huntsville Contract Operations|AL|contract",
      "Southwest Hub|NM|hub",
      "Mountain Regional HQ|CO|regional",
      "Mid-Atlantic Hub|VA|hub",
      "Great Lakes Hub|OH|hub",
      "Northeast Site|MA|contract",
      "Coastal Site|FL|contract",
      "Texas Site|TX|contract",
      "Growth Scenario|AZ|future"
    ].sort()
  );
  assert.match(html, /isLegacySampleSet=pins=>Array\.isArray\(pins\)&&legacySampleSignatureSets\.some\(signatures=>pins\.length===signatures\.size&&pins\.every/);
  assert.match(html, /migratedPins=isLegacySampleSet\(savedPins\)\?samples\.map\(pin=>\(\{\.\.\.pin\}\)\):savedPins/);

  const subtitleMatch = html.match(/const legacySubtitles=new Set\((\[[^\n]+\])\);/);
  assert.ok(subtitleMatch, "legacy subtitle list was not found");
  const subtitles = vm.runInNewContext(subtitleMatch[1]);
  assert.deepEqual(
    [...subtitles],
    [
      "Mission footprint · Demonstration locations",
      "Mission footprint · City-level demonstration locations",
      "Mission footprint · City and installation demonstration locations"
    ]
  );
  assert.match(html, /mapSubtitle:"U\.S\. mission footprint"/);
  assert.match(html, /if\(legacySubtitles\.has\(model\.mapSubtitle\)\)model\.mapSubtitle=defaults\.mapSubtitle/);

  assert.match(html, /anchorKind:"statewide"/);
  assert.match(html, /anchorId:pin\.anchorId\|\|`state:\$\{pin\.state\}`/);
  assert.match(html, /anchorLabel:stateNames\[pin\.state\]\|\|pin\.state/);
  assert.match(html, /group\.anchorKind!=="statewide"/);
  assert.doesNotMatch(html, /Statewide/);
});

test("existing locations can be edited in place or canceled", () => {
  assert.match(html, /let editingPinId=null/);
  assert.match(html, /data-edit="\$\{esc\(pin\.id\)\}" aria-label="Edit \$\{esc\(pin\.name\)\}"/);
  assert.match(html, /function startPinEdit\(id\)/);
  assert.match(html, /function cancelPinEdit\(focus=false\)/);
  assert.match(html, /\$\("addTitle"\)\.textContent="Edit location"/);
  assert.match(html, /\$\("savePin"\)\.textContent="Save changes"/);
  assert.match(html, /id="cancelEdit" type="button" hidden>Cancel edit/);
  assert.match(html, /const index=model\.pins\.findIndex\(pin=>pin\.id===id\);if\(wasEditing&&index>=0\)model\.pins\[index\]=nextPin/);
  assert.match(html, /wasEditing\?"Location updated":"Location added"/);
  assert.match(html, /\$\("clearPins"\)\.onclick=\(\)=>\{cancelPinEdit\(\);model\.pins=\[\]/);
  assert.match(html, /\$\("loadSamples"\)\.onclick=\(\)=>\{cancelPinEdit\(\)/);
  assert.match(html, /\$\("resetMap"\)\.onclick=\(\)=>\{cancelPinEdit\(\)/);
});

test("site categories use the requested plain-language labels", () => {
  const typeMatch = html.match(/const typeMeta=(\{[^\n]+\});/);
  assert.ok(typeMatch, "site type metadata was not found");
  const types = vm.runInNewContext(`(${typeMatch[1]})`);
  assert.deepEqual(
    Object.fromEntries(Object.entries(types).map(([key, value]) => [key, value.label])),
    {
      headquarters: "Headquarters",
      regional: "Regional headquarters",
      hub: "Site",
      contract: "Contract site",
      future: "Future site"
    }
  );
  assert.match(html, /<option value="regional">Regional headquarters<\/option><option value="hub" selected>Site<\/option>/);
  assert.doesNotMatch(html, />Major hub</);
  assert.match(html, /name:"Southwest Site"/);
  assert.match(html, /name:"Mid-Atlantic Site"/);
  assert.match(html, /name:"Great Lakes Site"/);
});

test("site markers remain high contrast on light and dark maps", () => {
  const typeMatch = html.match(/const typeMeta=(\{[^\n]+\});/);
  assert.ok(typeMatch, "site type metadata was not found");
  const types = vm.runInNewContext(`(${typeMatch[1]})`);

  for (const [type, meta] of Object.entries(types)) {
    assert.ok(meta.color, `${type} needs a light-theme marker color`);
    assert.ok(meta.darkColor, `${type} needs a dark-theme marker color`);
    assert.ok(contrastRatio(meta.color, "#ffffff") >= 4.5, `${type} light marker must contrast with its plate`);
    assert.ok(contrastRatio(meta.color, "#dfe3e8") >= 4, `${type} light marker must contrast with light land`);
    assert.ok(contrastRatio(meta.darkColor, "#171722") >= 4.5, `${type} dark marker must contrast with its plate`);
    assert.ok(contrastRatio(meta.darkColor, "#3c3852") >= 4, `${type} dark marker must contrast with dark land`);
  }

  assert.match(html, /function markerStyle\(meta,p\)/);
  assert.match(html, /color:isDark\?meta\.darkColor\|\|"#e9d5ff":meta\.color\|\|model\.accent/);
  assert.match(html, /plate:isDark\?"#171722":p\.panel/);
  assert.match(html, /ring:isDark\?"#f5f3ff":"#20202e"/);
});

test("map and legend share the same solid marker token without glow", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(html, /function markerToken\(meta,cx,cy,size,p\)/);
  assert.match(html, /class="marker-backplate"[^>]+fill="\$\{style\.plate\}" stroke="\$\{style\.ring\}" stroke-width="2"/);
  assert.match(mapMarkup, /\$\{markerToken\(meta,mx,my,10\.5,p\)\}/);
  assert.match(mapMarkup, /\$\{markerToken\(meta,x,legendY,11\.5,p\)\}/);
  assert.match(mapMarkup, /stroke="\$\{style\.color\}" stroke-width="1\.8"/);
  assert.match(mapMarkup, /fill="\$\{style\.color\}">\$\{count\}<\/text>/);
  assert.doesNotMatch(mapMarkup, /<filter|feGaussianBlur|drop-shadow|paint-order/i);
  assert.doesNotMatch(mapMarkup, /<circle cx="\$\{mx\}" cy="\$\{my\}" r="13"/);
});

test("co-located marker layouts keep every token and place label separate", () => {
  const layoutMatch = html.match(/function markerOffsets\(count\)\{const layouts=(\{[^\n]+\});return/);
  assert.ok(layoutMatch, "marker offset layouts were not found");
  const layouts = vm.runInNewContext(`(${layoutMatch[1]})`);
  const badgeOffset = (x, y) => {
    const distance = Math.hypot(x, y);
    return distance ? [x / distance * 14, y / distance * 14] : [10, -10];
  };

  for (let count = 1; count <= 5; count += 1) {
    const offsets = layouts[count];
    assert.equal(offsets.length, count);
    for (let first = 0; first < offsets.length; first += 1) {
      for (let second = first + 1; second < offsets.length; second += 1) {
        const distance = Math.hypot(
          offsets[first][0] - offsets[second][0],
          offsets[first][1] - offsets[second][1]
        );
        assert.ok(distance >= 16 * 2 + 2, `${count}-marker layout tokens must not overlap`);
      }
    }

    const footprints = offsets.flatMap(([x, y], markerIndex) => {
      const [badgeX, badgeY] = badgeOffset(x, y);
      for (let otherIndex = 0; otherIndex < offsets.length; otherIndex += 1) {
        if (otherIndex === markerIndex) continue;
        const distance = Math.hypot(
          x + badgeX - offsets[otherIndex][0],
          y + badgeY - offsets[otherIndex][1]
        );
        assert.ok(distance >= 9 + 16 + 2, `${count}-marker badge must not overlap another token`);
      }
      return [{ x, y, r: 16 }, { x: x + badgeX, y: y + badgeY, r: 9 }];
    });
    const horizontalExtent = Math.max(...footprints.map(item => Math.abs(item.x) + item.r));
    const verticalExtent = Math.max(...footprints.map(item => Math.abs(item.y) + item.r));
    const topLabelBottom = -verticalExtent - 8 + 2;
    const bottomLabelTop = verticalExtent + 14 + 6 - 14;
    const rightLabelLeft = horizontalExtent + 8;
    const leftLabelRight = -horizontalExtent - 8;
    assert.ok(topLabelBottom <= -verticalExtent - 6);
    assert.ok(bottomLabelTop >= verticalExtent + 6);
    assert.ok(rightLabelLeft >= horizontalExtent + 8);
    assert.ok(leftLabelRight <= -horizontalExtent - 8);
  }

  assert.match(html, /function markerBadgeOffset\(dx,dy\)/);
  assert.match(html, /function markerFootprints\(offsets,typeGroups\)/);
  assert.match(html, /function placeLabelCandidates\(cx,cy,footprints,width,height\)/);
  assert.match(html, /for\(let dx=-120;dx<=120;dx\+=4\)/);
  assert.match(html, /\[badgeDx,badgeDy\]=markerBadgeOffset\(dx,dy\)/);
  assert.match(html, /candidates=placeLabelCandidates\(group\.x,group\.y,group\.footprints,width,height\)/);
});

test("redundant standalone application copy is removed", () => {
  assert.doesNotMatch(html, /Standalone · No map service required/);
  assert.doesNotMatch(html, /Standalone browser application/);
});

test("place labels use compact background plates instead of text outlines", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(mapMarkup, /<g class="place-label-group"[^>]*><rect[^>]+fill="\$\{p\.panel\}" opacity="\.96"\/><text class="place-label city-label"/);
  assert.doesNotMatch(mapMarkup, /class="place-label[^>]+\bstroke=/);
});

test("location form controls stay within responsive grid columns", () => {
  const styles = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || "";
  assert.match(styles, /\.add-grid\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)[^}]*min-width:0/);
  assert.match(styles, /\.add-grid label\{[^}]*min-width:0/);
  assert.match(styles, /\.add-grid input,\.add-grid select\{width:100%;min-width:0;max-width:100%/);
  assert.match(styles, /@media\(max-width:500px\)[\s\S]*?\.row,\.add-grid\{grid-template-columns:1fr\}/);
});

test("clear locations action is in the Locations panel, not the preview header", () => {
  const previewStart = html.indexOf('<section class="panel preview-panel"');
  const previewEnd = html.indexOf("</section>", previewStart);
  const locationsStart = html.indexOf('<section class="panel" aria-labelledby="locationsTitle"');
  const addStart = html.indexOf('<section class="panel" aria-labelledby="addTitle"');
  assert.ok(previewStart >= 0 && previewEnd > previewStart, "preview panel was not found");
  assert.ok(locationsStart >= 0 && addStart > locationsStart, "Locations panel was not found");
  assert.doesNotMatch(html.slice(previewStart, previewEnd), /id="clearPins"/);
  assert.match(html.slice(locationsStart, addStart), /<button[^>]+id="clearPins"[^>]*>Clear locations<\/button>/);
});

test("copied and downloaded map graphics omit application footer text", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function render\(\)/)?.[0] || "";
  assert.ok(mapMarkup);
  assert.doesNotMatch(mapMarkup, /Created by Dr\. Shane Turner/);
  assert.doesNotMatch(mapMarkup, /Synthetic demonstration data/);
  assert.doesNotMatch(mapMarkup, /mapFooter/);
  assert.match(html, /clone\.querySelectorAll\('\[tabindex\],\[role="button"\]'\)/);
  assert.match(html, /node\.removeAttribute\("tabindex"\)/);
  assert.match(html, /node\.removeAttribute\("role"\)/);
});

test("location categories use distinct shapes without highlighting states", () => {
  for (const shape of ["star", "diamond", "circle", "square", "triangle"]) {
    assert.match(html, new RegExp(`shape:"${shape}"`));
  }
  assert.match(html, /function markerSymbol\(/);
  assert.match(html, /fill=p\.land/);
  assert.doesNotMatch(html, /landActive/);
  assert.match(html, /showCounts:false/);
});
