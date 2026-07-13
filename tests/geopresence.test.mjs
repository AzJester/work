import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "geopresence/index.html"), "utf8");
const changelog = readFileSync(resolve(root, "geopresence/changelog.md"), "utf8");

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

test("only synthetic location samples are bundled", () => {
  assert.match(html, /const samples=/);
});

test("version, creator, and changelog are published", () => {
  assert.match(html, /const APP_VERSION="2\.2\.0"/);
  assert.match(html, /Created by Dr\. Shane Turner/);
  assert.match(changelog, /## \[2\.2\.0\] - 2026-07-13/);
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
  assert.match(html, /\$\{states\}<g class="location-layer">\$\{placeMarkers\}/);
  assert.match(html, /city- or installation-positioned location markers/);
});

test("state initials stay protected from borders, markers, and location labels", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(mapMarkup, /const stateLabelBoxes=/);
  assert.match(mapMarkup, /const labelBoxes=stateLabelBoxes\.map\(/);
  assert.match(mapMarkup, /!labelBoxes\.some\(/);
  assert.match(mapMarkup, /class="state-label"[\s\S]*?<rect[^>]+opacity="\.98"/);
  assert.match(mapMarkup, /\$\{states\}<g class="location-layer">[\s\S]*?<g class="state-label-layer">\$\{stateLabels\}/);
});

test("transparent themes preserve readable title, legend, and callout lines", () => {
  const mapMarkup = html.match(/function mapMarkup\(\)\{[\s\S]*?\n  function refreshCityOptions\(/)?.[0] || "";
  assert.ok(mapMarkup, "map rendering code was not found");
  assert.match(mapMarkup, /transparentTitleHalo=model\.transparent/);
  assert.match(mapMarkup, /transparentSubtitleHalo=model\.transparent/);
  assert.match(mapMarkup, /legendTextHalo=model\.transparent/);
  assert.match(mapMarkup, /paint-order=\"stroke\"/);
  assert.match(mapMarkup, /model\.transparent\?`<path[^`]+stroke-width=\"4\.5\"/);
});

test("Florida and Louisiana labels and state counts use protected interior positions", () => {
  assert.match(html, /const interiorLabelPositions=\{FL:\[786,521\],LA:\[570,481\]\}/);
  assert.match(html, /const stateCountPoints=new Map/);
  assert.match(html, /candidates=.*\.filter\(point=>Math\.hypot/);
  assert.match(html, /class=\"state-count\" data-state/);
  assert.match(html, /data-inline-count/);
  assert.doesNotMatch(html, /cx=\"\$\{x\+22\}\"/);
});

test("legacy saved pins remain explicit statewide locations", () => {
  assert.match(html, /anchorKind:"statewide"/);
  assert.match(html, /anchorId:pin\.anchorId\|\|`state:\$\{pin\.state\}`/);
  assert.match(html, /anchorLabel:"Statewide"/);
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
