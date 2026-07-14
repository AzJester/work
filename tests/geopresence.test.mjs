import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "geopresence/index.html"), "utf8");
const changelog = readFileSync(resolve(root, "geopresence/changelog.md"), "utf8");
const serviceWorker = readFileSync(resolve(root, "sw.js"), "utf8");
const placeCatalogBuffer = readFileSync(resolve(root, "geopresence/data/places-2025.json"));
const placeCatalog = JSON.parse(placeCatalogBuffer.toString("utf8"));
const placeMetadata = JSON.parse(readFileSync(resolve(root, "geopresence/data/places-2025.meta.json"), "utf8"));
const installationCatalogBuffer = readFileSync(resolve(root, "geopresence/data/installations-2024-2025.json"));
const installationCatalog = JSON.parse(installationCatalogBuffer.toString("utf8"));
const installationMetadata = JSON.parse(readFileSync(resolve(root, "geopresence/data/installations-2024-2025.meta.json"), "utf8"));
const scriptMatch = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
const inlineScript = scriptMatch?.[1] || "";
const styles = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || "";
const expectedCodes = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");

function sha256(bytes) {
  const canonicalBytes = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(canonicalBytes, "utf8").digest("hex");
}

function assignmentSource(name) {
  const marker = `const ${name}=`;
  const start = inlineScript.indexOf(marker);
  assert.ok(start >= 0, `${name} assignment was not found`);
  const expressionStart = start + marker.length;
  const terminator = inlineScript.slice(expressionStart).match(/;\r?\n/);
  assert.ok(terminator, `${name} assignment is not terminated`);
  return inlineScript.slice(expressionStart, expressionStart + terminator.index);
}

function sectionFromLast(startMarker, endMarker) {
  const start = inlineScript.lastIndexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} was not found`);
  const end = inlineScript.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${endMarker} was not found after ${startMarker}`);
  return inlineScript.slice(start, end);
}

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

test("map builder application parses as JavaScript", () => {
  assert.ok(scriptMatch, "inline application script was not found");
  assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: "map-builder-inline.js" }));
});

test("map builder loads only versioned same-origin reference catalogs", () => {
  const catalogPaths = [...inlineScript.matchAll(/loadCatalog\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]).sort();
  assert.deepEqual(catalogPaths, [
    "./data/installations-2024-2025.json",
    "./data/places-2025.json",
    "./data/places-2025.meta.json"
  ]);
  assert.ok(catalogPaths.every(path => /^\.\/data\/[a-z0-9.-]+\.json$/i.test(path)));
  assert.equal((inlineScript.match(/\bfetch\s*\(/g) || []).length, 1, "catalog loader should be the application's only network reader");
  assert.match(inlineScript, /fetch\(file,\{cache:"force-cache"\}\)/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+(?:stylesheet|preload)/i);
  assert.doesNotMatch(html, /(?:services\d*\.arcgis\.com|ArcGIS REST|FeatureServer|Azure Maps|Highcharts)/i);
  assert.doesNotMatch(inlineScript, /const cityCatalog=\s*\[/);
  assert.doesNotMatch(inlineScript, /const installationCatalog=\s*\[/);
});

test("service worker caches the GeoPresence shell and same-origin catalogs", () => {
  for (const path of [
    "./geopresence/index.html",
    "./geopresence/data/places-2025.json",
    "./geopresence/data/places-2025.meta.json",
    "./geopresence/data/installations-2024-2025.json"
  ]) assert.match(serviceWorker, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(serviceWorker, /url\.origin\s*!==\s*self\.location\.origin/);
});

test("version, creator, and changelog are published", () => {
  assert.match(inlineScript, /const APP_VERSION="3\.2\.1"/);
  assert.match(html, /Version 3\.2\.1/);
  assert.match(html, /Created by Dr\. Shane Turner/);
  assert.match(changelog, /^# Changelog/m);
  assert.match(changelog, /Created by Dr\. Shane Turner/);
});

test("Census place catalog is complete, auditable, and GEOID-addressable", () => {
  assert.deepEqual(placeMetadata.rowSchema, ["USPS", "GEOID", "NAME", "LSAD", "x", "y", "duplicateLabel"]);
  assert.equal(placeMetadata.filtering.sourceRecordCount, 32350);
  assert.equal(placeMetadata.filtering.excludedPuertoRicoRecords, 292);
  assert.equal(placeMetadata.filtering.retainedRecordCount, 32058);
  assert.equal(placeCatalog.length, 32058);
  assert.equal(placeMetadata.records.uniqueGeoids, placeCatalog.length);
  assert.equal(sha256(Buffer.from(`${JSON.stringify(placeCatalog)}\n`, "utf8")), placeMetadata.validation.dataSha256);
  assert.deepEqual([...new Set(placeCatalog.map(place => place[0]))].sort(), [...expectedCodes].sort());
  assert.equal(new Set(placeCatalog.map(place => place[1])).size, placeCatalog.length);
  assert.ok(placeCatalog.every(place => (
    Array.isArray(place)
    && place.length === 7
    && expectedCodes.includes(place[0])
    && /^\d{7}$/.test(place[1])
    && typeof place[2] === "string"
    && Object.hasOwn(placeMetadata.lsadTypes, place[3])
    && Number.isFinite(place[4])
    && Number.isFinite(place[5])
    && typeof place[6] === "string"
  )));
  assert.ok(placeCatalog.every(place => place[4] >= -58 && place[4] <= 958 && place[5] >= 13 && place[5] <= 608));

  const huntsville = placeCatalog.find(place => place[1] === "0137000");
  assert.deepEqual(huntsville, ["AL", "0137000", "Huntsville city", "25", 670.2, 388.2, ""]);
});

test("same-name Census places retain distinct GEOIDs and editor labels", () => {
  const midway = placeCatalog.filter(place => place[0] === "FL" && /^Midway (?:city|CDP)$/.test(place[2]));
  assert.equal(midway.length, 3);
  assert.deepEqual(midway.map(place => place[1]).sort(), ["1245425", "1245465", "1245475"]);
  assert.ok(midway.every(place => place[6].startsWith("Midway") && place[6].includes(place[1])));
  assert.equal(new Set(midway.map(place => place[6])).size, 3);
  assert.match(inlineScript, /const cityById=new Map\(cityCatalog\.map/);
  assert.match(inlineScript, /const duplicateLabel=place=>place\[6\]/);
  assert.match(inlineScript, /anchorId:`place:\$\{place\[1\]\}`/);
  assert.match(inlineScript, /function resolveCity\(state,id\)/);
});

test("military installation catalog retains its pinned public snapshot", () => {
  assert.deepEqual(installationMetadata.rowSchema, ["primaryState", "name", "x", "y", "id", "component", "status", "states", "jointBase", "source"]);
  assert.equal(installationCatalog.length, 887);
  assert.equal(installationCatalog.filter(site => site[9] === "dod").length, 805);
  assert.equal(installationCatalog.filter(site => site[9] === "uscg").length, 82);
  assert.equal(sha256(Buffer.from(`${JSON.stringify(installationCatalog)}\n`, "utf8")), installationMetadata.sha256);
  assert.deepEqual([...new Set(installationCatalog.map(site => site[0]))].sort(), [...expectedCodes].sort());
  assert.equal(new Set(installationCatalog.map(site => site[4])).size, installationCatalog.length);
  assert.ok(installationCatalog.every(site => (
    Array.isArray(site)
    && site.length === 10
    && expectedCodes.includes(site[0])
    && typeof site[1] === "string"
    && Number.isFinite(site[2])
    && Number.isFinite(site[3])
    && typeof site[4] === "string"
    && site[7].split("|").every(code => expectedCodes.includes(code))
    && ["dod", "uscg"].includes(site[9])
  )));

  const redstone = installationCatalog.find(site => site[1] === "Redstone Arsenal");
  assert.equal(redstone?.[0], "AL");
  assert.equal(redstone?.[9], "dod");
  const fortCampbell = installationCatalog.filter(site => site[1] === "Fort Campbell");
  assert.equal(fortCampbell.length, 1);
  assert.deepEqual(fortCampbell[0][7].split("|").sort(), ["KY", "TN"]);
});

test("map builder uses complete projected U.S. state geometry", () => {
  const stateGeometry = JSON.parse(assignmentSource("stateGeometry"));
  assert.equal(stateGeometry.length, 51);
  assert.deepEqual(stateGeometry.map(item => item.code).sort(), [...expectedCodes].sort());
  assert.ok(stateGeometry.every(item => /^M/.test(item.path) && item.path.length > 20));
  assert.match(html, /states-albers-10m\.json/);
  assert.match(inlineScript, /Geographic map of the United States/);
  assert.doesNotMatch(inlineScript, /const stateLayout=/);
  assert.doesNotMatch(html, /United States tile map/i);
});

test("settings use semantic fieldsets and current plain-language labels", () => {
  const sectionLabels = [...html.matchAll(/<legend class="section-label">([^<]+)<\/legend>/g)].map(match => match[1]);
  for (const label of ["Map heading", "Format", "Map details", "Project"]) {
    assert.ok(sectionLabels.includes(label), `${label} must remain a semantic fieldset legend`);
  }
  assert.doesNotMatch(html, /<legend class="section-label">Text<\/legend>/);
  for (const id of [
    "mapTitle", "mapSubtitle", "aspect", "scale", "theme", "accent", "showLabels", "showCityLabels",
    "showCounts", "showLegend", "showGrid", "transparent", "transparentPreview", "backdropColor",
    "transparentText", "cleanSvg", "projectExport", "projectImport"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, />Map theme<\/label>/);
  assert.match(html, />Heading accent<\/label>/);
  assert.match(html, />Locations per state<\/label>/);
  assert.match(html, />Clean SVG metadata<\/label>/);
  assert.doesNotMatch(html, />Major hub</);
});

test("location form provides accessible searchable comboboxes", () => {
  const form = html.match(/<form[^>]+id="pinForm"[\s\S]*?<\/form>/)?.[0] || "";
  assert.ok(form, "location form was not found");
  assert.match(form, /<fieldset class="add-grid">/);
  assert.match(form, /<legend class="sr-only">Location details<\/legend>/);
  for (const [input, list, hidden] of [
    ["pinCity", "cityResults", "pinCityId"],
    ["pinInstallation", "installationResults", "pinInstallationId"]
  ]) {
    assert.match(form, new RegExp(`id="${input}" role="combobox"[^>]+aria-autocomplete="list"[^>]+aria-controls="${list}"[^>]+aria-expanded="false"`));
    assert.match(form, new RegExp(`id="${list}" role="listbox"`));
    assert.match(form, new RegExp(`id="${hidden}"[^>]+type="hidden"`));
  }
  assert.doesNotMatch(form, /<datalist/);
  assert.doesNotMatch(form, /<select[^>]+id="pinInstallation"/);
  assert.match(inlineScript, /function comboConfig\(kind\)/);
  assert.match(inlineScript, /function refreshCombo\(kind,open=false\)/);
  assert.match(inlineScript, /function handleComboKeydown\(kind,event\)/);
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) assert.match(inlineScript, new RegExp(`event\\.key==="${key}"`));
  assert.match(inlineScript, /\.slice\(0,40\)/);
  assert.match(inlineScript, /aria-activedescendant/);
});

test("form validation resolves catalog IDs and reports accessible errors", () => {
  assert.match(html, /id="pinNameError" hidden/);
  assert.match(html, /id="pinCityError" hidden/);
  assert.match(html, /id="pinInstallationError" hidden/);
  assert.match(inlineScript, /function setFieldError\(fieldId,message\)/);
  assert.match(inlineScript, /setAttribute\("aria-invalid"/);
  assert.match(inlineScript, /Choose a city or community from the search results/);
  assert.match(inlineScript, /Choose a military installation from the search results/);
  assert.match(inlineScript, /querySelector\('\[aria-invalid="true"\]'\)\?\.focus\(\)/);
  assert.match(inlineScript, /cityId:validated\.place\[1\]/);
  assert.match(inlineScript, /anchorId:validated\.item\[4\]/);
});

test("map semantics avoid fifty-one keyboard stops while retaining state selection", () => {
  assert.match(html, /<a class="skip" href="#main">/);
  assert.match(html, /<nav class="quick-nav" aria-label="Map builder sections">/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="svgTitle svgDesc"/);
  assert.match(html, /<select id="pinState" name="state"><\/select>/);
  assert.match(inlineScript, /class="state-hit" data-state/);
  assert.doesNotMatch(inlineScript, /tabindex="0" role="button"/);
  assert.match(html, /id="layoutWarning" role="status"/);
  assert.match(html, /id="storageWarning" role="alert"/);
  assert.match(html, /id="toast" role="status"/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
});

test("default project is empty and samples remain explicit editor data", () => {
  assert.match(inlineScript, /const defaults=\{[^;]+pins:\[\]\}/);
  assert.match(html, /id="sampleNotice" hidden>Sample locations are loaded for demonstration in the editor/);
  assert.match(html, /id="loadSamples"[^>]*>Replace with sample locations<\/button>/);
  const sampleMatch = inlineScript.match(/const samples=(\[[^\n]+\])\.map\(withAnchor\)/);
  assert.ok(sampleMatch, "sample locations were not found");
  const samples = vm.runInNewContext(sampleMatch[1]);
  const huntsville = samples.filter(pin => pin.state === "AL" && pin.city === "Huntsville");
  assert.equal(huntsville.length, 2);
  assert.deepEqual(Array.from(huntsville, pin => pin.type).sort(), ["contract", "regional"]);
  assert.match(inlineScript, /function isSampleData\(\)/);
});

test("site categories retain distinct pin interiors and accessible contrast", () => {
  const types = vm.runInNewContext(`(${assignmentSource("typeMeta")})`);
  const expectedTypes = {
    headquarters: { label: "Headquarters", icon: "star" },
    regional: { label: "Regional headquarters", icon: "building" },
    hub: { label: "Site", icon: "circle" },
    contract: { label: "Contract site", icon: "briefcase" },
    future: { label: "Future site", icon: "clock" },
    program: { label: "Program office", icon: "document" },
    operations: { label: "Operations center", icon: "network" },
    customer: { label: "Customer site", icon: "person" },
    partner: { label: "Partner site", icon: "link" },
    test: { label: "Test or range site", icon: "target" },
    manufacturing: { label: "Manufacturing facility", icon: "factory" }
  };
  assert.deepEqual(
    Object.fromEntries(Object.entries(types).map(([key, value]) => [key, { label: value.label, icon: value.icon }])),
    expectedTypes
  );
  const typeSelector = html.match(/<select\b[^>]*id="pinType"[^>]*>[\s\S]*?<\/select>/i)?.[0] || "";
  assert.ok(typeSelector, "location type selector was not found");
  for (const [value, meta] of Object.entries(expectedTypes)) {
    assert.match(typeSelector, new RegExp(`<option\\s+value="${value}"[^>]*>\\s*${meta.label}\\s*</option>`, "i"));
  }
  for (const [type, meta] of Object.entries(types)) {
    assert.ok(contrastRatio(meta.color, "#ffffff") >= 4.5, `${type} light marker must contrast with its plate`);
    assert.ok(contrastRatio(meta.color, "#dfe3e8") >= 4, `${type} light marker must contrast with light land`);
    assert.ok(contrastRatio(meta.darkColor, "#171722") >= 4.5, `${type} dark marker must contrast with its plate`);
    assert.ok(contrastRatio(meta.darkColor, "#3c3852") >= 4, `${type} dark marker must contrast with dark land`);
  }
  assert.match(inlineScript, /function markerToken\(meta,cx,cy,size,p\)/);
  assert.match(inlineScript, /class="[^"]*\bmarker-pin\b[^"]*"/);
  assert.doesNotMatch(inlineScript, /class="marker-backplate"/);
});

test("co-located tokens and globally nearby locations share collision occupancy", () => {
  const mapMarkup = sectionFromLast("function mapMarkup(){", "function comboConfig(kind)");
  assert.match(mapMarkup, /const anchorGroups=new Map\(\)/);
  assert.match(mapMarkup, /const groups=\[\.\.\.anchorGroups\.values\(\)\]\.sort/);
  assert.match(mapMarkup, /markerOffsets\(group\.typeGroups\.length\)/);
  assert.match(mapMarkup, /markerFootprints\(group\.offsets,group\.typeGroups\)/);
  assert.match(mapMarkup, /occupiedMarkerFootprints/);
  assert.match(mapMarkup, /markerShiftCandidates/);
  assert.match(mapMarkup, /occupiedMarkerFootprints\.every/);
  assert.match(mapMarkup, /stateLabelBoxes\.some/);
  assert.match(mapMarkup, /markerCollisionBoxes\.some/);
  assert.match(mapMarkup, /globalOccupancy:occupiedMarkerFootprints\.length/);
  assert.match(mapMarkup, /unplacedMarkers/);
  assert.match(mapMarkup, /class="marker-leader"/);
});

test("state initials, counts, markers, and place labels remain in protected layers", () => {
  const mapMarkup = sectionFromLast("function mapMarkup(){", "function comboConfig(kind)");
  const labelPositions = vm.runInNewContext(`(${assignmentSource("canonicalLabelPositions")})`);
  for (const code of ["FL", "KY", "LA", "MI", "NY", "WV"]) assert.ok(labelPositions[code], `${code} needs a fixed label position`);
  assert.match(mapMarkup, /const stateLabelBoxes=/);
  assert.match(mapMarkup, /class="state-callout-leader"/);
  assert.match(mapMarkup, /class="state-count-inline"/);
  assert.match(mapMarkup, /class="state-label"[\s\S]*?<rect/);
  assert.match(mapMarkup, /const labelBoxes=stateLabelBoxes\.map/);
  assert.match(mapMarkup, /placeLabelCandidates/);
  assert.match(mapMarkup, /hiddenLabels/);
  assert.ok(mapMarkup.indexOf('class="location-layer"') < mapMarkup.indexOf('class="state-label-layer"'), "state initials must render above locations");
});

test("transparent exports offer destination-aware readable text without glow", () => {
  for (const id of ["transparentPreview", "backdropColor", "transparentText"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(inlineScript, /function transparentTextTone\(p\)/);
  assert.match(inlineScript, /relativeLuminance\(preview\)<\.35/);
  assert.match(inlineScript, /destinationIsDark=model\.transparent/);
  assert.match(inlineScript, /function applyPreviewBackdrop\(\)/);
  const mapMarkup = sectionFromLast("function mapMarkup(){", "function comboConfig(kind)");
  assert.match(mapMarkup, /fill="\$\{tone\.text\}"/);
  assert.match(mapMarkup, /fill="\$\{tone\.muted\}"/);
  assert.doesNotMatch(mapMarkup, /feGaussianBlur|paint-order|drop-shadow/i);
});

test("project files are portable, schema-checked, and sanitized", () => {
  assert.match(html, /id="projectExport"[^>]*>Download project<\/button>/);
  assert.match(html, /id="projectImport" type="file" accept="application\/json,\.json"/);
  assert.match(inlineScript, /MODEL_SCHEMA_VERSION=3,PROJECT_SCHEMA_VERSION=1/);
  assert.match(inlineScript, /function sanitizePin\(raw,index=0\)/);
  assert.match(inlineScript, /function sanitizeModelState\(raw,\{strict=false\}=\{\}\)/);
  assert.match(inlineScript, /function validateProjectDocument\(payload\)/);
  assert.match(inlineScript, /sanitizeModelState\(payload\.model,\{strict:true\}\)/);
  assert.match(inlineScript, /function exportProject\(\)/);
  assert.match(inlineScript, /function importProjectFile\(file\)/);
  assert.match(inlineScript, /requestConfirmation\("Open this project and replace the current settings and locations\?"/);
});

test("CSV location upload publishes one accessible, documented file contract", () => {
  const locationsStart = html.indexOf('<section class="panel" aria-labelledby="locationsTitle"');
  const addStart = html.indexOf('<section class="panel" aria-labelledby="addTitle"');
  assert.ok(locationsStart >= 0 && addStart > locationsStart, "Locations and Add a location panels were not found");
  assert.match(html.slice(locationsStart, addStart), /id="locationImportOpen"[^>]+aria-haspopup="dialog"[^>]*>Upload locations<\/button>/);

  const dialogStart = html.indexOf('<dialog class="import-dialog" id="locationImportDialog"');
  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, "location upload dialog was not found");
  const dialog = html.slice(dialogStart, dialogEnd + "</dialog>".length);
  assert.match(dialog, /aria-labelledby="locationImportTitle"/);
  assert.match(dialog, /aria-describedby="locationImportDescription"/);
  assert.match(dialog, /UTF-8 CSV \(\.csv\)/i);
  assert.match(dialog, /id="locationImportFile" type="file" accept="\.csv,text\/csv"/);
  assert.match(dialog, /<label for="locationImportFile">Choose a CSV file<\/label>/);
  assert.match(dialog, /name="locationImportMode" value="append" checked/);
  assert.match(dialog, /name="locationImportMode" value="replace"/);
  assert.match(dialog, /id="locationImportPreview" role="status" aria-live="polite"/);
  assert.match(dialog, /id="locationImportErrors" role="alert"/);
  assert.match(dialog, /id="locationImportApply"[^>]+disabled>Import locations<\/button>/);
  assert.match(dialog, /id="locationImportTemplate"[^>]*>Download CSV template<\/button>/);

  const expectedHeaders = [
    "name", "state", "type", "source", "city", "city_geoid", "installation", "installation_id"
  ];
  const headers = Array.from(vm.runInNewContext(assignmentSource("LOCATION_IMPORT_HEADERS")));
  assert.deepEqual(headers, expectedHeaders);
  const template = vm.runInNewContext(assignmentSource("LOCATION_CSV_TEMPLATE"));
  assert.equal(template.split(/\r?\n/, 1)[0], expectedHeaders.join(","));
  assert.match(template, /Huntsville Regional Headquarters,AL,regional,city,Huntsville,0137000,,/);
  assert.match(template, /Redstone Arsenal Contract,AL,contract,installation,,,Redstone Arsenal,dod-fid-986/);
});

test("CSV parsing handles BOM, CRLF, commas, and escaped quotes without split-on-comma shortcuts", () => {
  const parserSource = sectionFromLast("function parseCsvRows(text){", "function placeMatchesImportName");
  const parseCsvRows = vm.runInNewContext(`(()=>{${parserSource};return parseCsvRows})()`);
  const rows = JSON.parse(JSON.stringify(parseCsvRows(
    '\uFEFFname,state,type,source,city,city_geoid,installation,installation_id\r\n' +
    '"Office, ""North""",VA,headquarters,city,Arlington,5103000,,\r\n'
  )));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].line, 1);
  assert.deepEqual(rows[0].cells, [
    "name", "state", "type", "source", "city", "city_geoid", "installation", "installation_id"
  ]);
  assert.equal(rows[1].line, 2);
  assert.equal(rows[1].cells[0], 'Office, "North"');
  assert.equal(rows[1].cells[5], "5103000");
  assert.throws(() => parseCsvRows('name,state\r\n"Unclosed,VA'), /quoted value is not closed/i);
  for (const trailingText of ["x", " ", "\t", "0"]) {
    assert.throws(
      () => parseCsvRows(`"closed"${trailingText},next`),
      /(?:after|follows) a closing quote/i,
      `text ${JSON.stringify(trailingText)} after a closing quote must be rejected`,
    );
  }
  assert.doesNotThrow(() => parseCsvRows('"closed",next'));
  assert.doesNotThrow(() => parseCsvRows('"closed"\r\nnext'));
  assert.doesNotThrow(() => parseCsvRows('"closed"'));
});

test("CSV validation is atomic, rejects duplicate headers, and resolves catalog-backed anchors", () => {
  const rowParser = sectionFromLast("function parseLocationImportRow(record,line){", "function validateLocationCsv(text){");
  assert.match(rowParser, /cityById\.get\(cityGeoid\)/);
  assert.match(rowParser, /citiesByState\[state\]/);
  assert.match(rowParser, /installationById\.get\(installationId\)/);
  assert.match(rowParser, /installationsByState\[state\]/);
  assert.match(rowParser, /if\(!stateNames\[state\]\)throw new Error/);
  assert.match(rowParser, /const type=resolveImportType\(record\.type\);if\(!type\)throw new Error/);
  assert.match(rowParser, /const source=resolveImportSource\(record\.source\);if\(!source\)throw new Error/);

  const validation = sectionFromLast("function validateLocationCsv(text){", "function setLocationImportErrors");
  assert.match(validation, /if\(seenHeaders\.has\(header\)\)errors\.push\(`Header "\$\{header\}" appears more than once\.`\)/);
  for (const header of ["name", "state", "type", "source"]) {
    assert.match(validation, new RegExp(`\\["name","state","type","source"\\].*Required header`, "s"), `${header} is part of the required-header contract`);
  }
  assert.match(validation, /catch\(error\)\{errors\.push\(`Row \$\{row\.line\}: \$\{error\.message\}`\)\}/);

  const staging = sectionFromLast("async function stageLocationImport(file){", "function downloadLocationTemplate");
  const errorReturn = staging.indexOf("if(result.errors.length)");
  const pendingAssignment = staging.indexOf("pendingLocationImport={pins:result.pins");
  assert.ok(errorReturn >= 0 && pendingAssignment > errorReturn, "invalid rows must stop staging before a pending import is created");
  assert.match(staging, /Nothing has been imported/);
  assert.doesNotMatch(staging, /model\.pins\s*=/, "file selection and validation must not mutate map locations");
});

test("CSV append uses the staged action while replace confirms, and each batch is recoverable", () => {
  const applyImport = sectionFromLast("async function applyLocationImport(){", "function cancelPinEdit");
  assert.equal((applyImport.match(/requestConfirmation\(/g) || []).length, 1,
    "only replace should open the second confirmation dialog");
  assert.match(applyImport, /if\(mode==="replace"\)[\s\S]*await requestConfirmation/);
  assert.match(applyImport, /mode==="append"\?staged\.pins\.filter/);
  const confirmation = applyImport.indexOf("await requestConfirmation");
  const recovery = applyImport.indexOf("captureRecoverySnapshot");
  const mutation = applyImport.indexOf("model.pins=");
  assert.ok(confirmation >= 0 && recovery > confirmation && mutation > recovery,
    "replace confirmation must precede its recovery snapshot and mutation");
  assert.match(applyImport, /captureRecoverySnapshot\(mode==="replace"\?"Location file replacement":"Location file addition"\)/);
  assert.match(applyImport, /model\.pins=mode==="replace"\?pins:\[\.\.\.model\.pins,\.\.\.pins\]/);
  assert.match(inlineScript, /\$\("locationImportApply"\)\.onclick=applyLocationImport/);
  assert.match(inlineScript, /toast\(`\$\{pins\.length\} location[\s\S]{0,120}\{undo:true\}\)/);
});

test("browser storage failures are nonfatal and visible", () => {
  assert.match(inlineScript, /function safeGetStorage\(key\)\{try\{/);
  assert.match(inlineScript, /function safeSetStorage\(key,value\)\{try\{/);
  assert.match(inlineScript, /Browser storage is unavailable/);
  assert.match(inlineScript, /could not be saved in browser storage/);
  assert.match(inlineScript, /function loadSavedModel\(\)/);
  assert.match(inlineScript, /Saved map data was invalid/);
  assert.match(inlineScript, /safeSetStorage\(STORAGE_KEY,JSON\.stringify\(model\)\)/);
});

test("destructive actions require confirmation and support undo recovery", () => {
  assert.match(html, /<dialog class="confirm-dialog" id="confirmDialog"/);
  assert.match(html, /id="undoAction" type="button" hidden>Undo<\/button>/);
  assert.match(inlineScript, /function captureRecoverySnapshot\(label\)/);
  assert.match(inlineScript, /function loadRecoverySnapshot\(\)/);
  assert.match(inlineScript, /function undoLastAction\(\)/);
  assert.match(inlineScript, /function requestConfirmation\(message,title="Confirm change"\)/);
  assert.match(inlineScript, /async function confirmDestructive\(message,label,change\)/);
  for (const id of ["clearPins", "loadSamples", "resetMap"]) {
    const handler = inlineScript.match(new RegExp(`\\$\\("${id}"\\)\\.onclick=([^;]+);`))?.[1] || "";
    assert.match(handler, /confirmDestructive/, `${id} must confirm before replacing data`);
  }
  assert.match(inlineScript, /data-remove/);
  assert.match(inlineScript, /await confirmDestructive\(`Remove/);
  assert.match(inlineScript, /next\|\|\$\("locationsTitle"\)/);
});

test("locations can be edited in place and canceled", () => {
  assert.match(html, /id="cancelEdit" type="button" hidden>Cancel edit<\/button>/);
  assert.match(inlineScript, /function startPinEdit\(id\)/);
  assert.match(inlineScript, /function cancelPinEdit\(focus=false\)/);
  assert.match(inlineScript, /editingPinId=pin\.id/);
  assert.match(inlineScript, /textContent="Save changes"/);
  assert.match(inlineScript, /model\.pins\[index\]=nextPin/);
  assert.match(inlineScript, /Location updated/);
  assert.match(inlineScript, /Edit canceled/);
  assert.match(html, /<ul class="pin-list" id="pinList"><\/ul>/);
  assert.match(inlineScript, /<li class="pin-row">/);
});

test("PNG, SVG, and clipboard exports fail safely and report busy state", () => {
  for (const id of ["exportPng", "exportSvg", "copyPng"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(inlineScript, /const MAX_EXPORT_PIXELS=22000000/);
  assert.match(inlineScript, /function setExportBusy\(busy\)/);
  assert.match(inlineScript, /\.disabled=busy/);
  assert.match(inlineScript, /setAttribute\("aria-busy",String\(busy\)\)/);
  assert.match(inlineScript, /async function withExportState\(task,success\)/);
  assert.match(inlineScript, /catch\(error\)/);
  assert.match(inlineScript, /finally\{setExportBusy\(false\)\}/);

  const pngBlob = sectionFromLast("async function pngBlob(){", "async function exportPng(){");
  assert.match(pngBlob, /pixels>MAX_EXPORT_PIXELS/);
  assert.match(pngBlob, /if\(!context\)throw new Error/);
  assert.match(pngBlob, /canvas\.toBlob\(blob=>blob\?resolve\(blob\):reject/);
  assert.match(pngBlob, /finally\{if\(url\)URL\.revokeObjectURL\(url\)\}/);
  assert.match(inlineScript, /navigator\.clipboard\?\.write/);
  assert.match(inlineScript, /typeof ClipboardItem!=="function"/);
  assert.match(inlineScript, /lastPngBytes/);
  assert.match(inlineScript, /lastSvgBytes/);
});

test("clean SVG export removes hidden metadata and application footer text", () => {
  const serializedSvg = sectionFromLast("function serializedSvg(){", "const MAX_EXPORT_PIXELS=");
  assert.match(serializedSvg, /querySelectorAll\("title,desc"\)/);
  assert.match(serializedSvg, /attribute\.name\.startsWith\("data-"\)/);
  assert.match(serializedSvg, /"aria-label","aria-labelledby","aria-describedby"/);
  assert.match(serializedSvg, /removeAttribute\("tabindex"\)/);
  assert.match(serializedSvg, /removeAttribute\("role"\)/);
  const mapMarkup = sectionFromLast("function mapMarkup(){", "function comboConfig(kind)");
  assert.doesNotMatch(mapMarkup, /Created by Dr\. Shane Turner/);
  assert.doesNotMatch(mapMarkup, /Synthetic demonstration data/);
  assert.doesNotMatch(mapMarkup, /mapFooter/);
});

test("preview supports zoom, full screen, layout warnings, and fitted text", () => {
  for (const id of ["previewZoomOut", "previewFit", "previewZoomIn", "previewFullscreen", "previewDialog", "previewClose"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(inlineScript, /function fitTextSize\(/);
  assert.match(inlineScript, /function wrapSvgText\(/);
  assert.match(inlineScript, /const scheduleRender=debounce\(render,180\)/);
  assert.match(inlineScript, /function setPreviewZoom\(value\)/);
  assert.match(inlineScript, /Math\.min\(2\.5,Math\.max\(\.5,value\)\)/);
  assert.match(inlineScript, /function openFullscreenPreview\(\)/);
  assert.match(inlineScript, /warnings\.unplacedMarkers/);
  assert.match(inlineScript, /warnings\.hiddenLabels/);
  assert.match(inlineScript, /warnings\.fittedTextCount/);
});

test("current layout keeps controls within responsive columns", () => {
  assert.match(styles, /\.workspace\{[^}]*grid-template-columns:330px minmax\(0,1fr\)/);
  assert.match(styles, /\.below\{[^}]*grid-template-columns:minmax\(420px,1fr\) minmax\(330px,\.72fr\)/);
  assert.match(styles, /\.add-grid\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)[^}]*min-width:0/);
  assert.match(styles, /\.add-grid input,\.add-grid select\{width:100%;min-width:0;max-width:100%/);
  assert.match(styles, /\.preview-stage\{[^}]*overflow:auto/);
  assert.match(styles, /@media\(max-width:860px\)[\s\S]*?\.workspace\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /@media\(max-width:500px\)[\s\S]*?\.row,\.add-grid,\.import-codes\{grid-template-columns:1fr\}/);
  assert.match(styles, /@media\(max-width:500px\)[\s\S]*?\.pin-row\{grid-template-columns:auto minmax\(0,1fr\)\}/);
});

test("required markers stay inline and location controls share a uniform height", () => {
  assert.match(styles, /\.form-field\{display:flex;flex-direction:column;gap:5px\}/);
  assert.match(styles, /\.add-grid label\{display:inline-flex;flex-direction:row;align-items:baseline/);
  assert.doesNotMatch(styles, /\.add-grid label,\.form-field\{[^}]*flex-direction:column/);
  assert.match(styles, /\.add-grid input,\.add-grid select\{[^}]*min-height:42px/);
  assert.match(styles, /\.required\{display:inline;flex:0 0 auto/);
  for (const id of ["pinName", "pinCity", "pinInstallation"]) {
    assert.match(html, new RegExp(`<label for="${id}">[^<]+<span class="required" aria-hidden="true">\\*<\\/span><\\/label>`));
  }
});

test("clear locations remains in the Locations panel", () => {
  const previewStart = html.indexOf('<section class="panel preview-panel"');
  const previewEnd = html.indexOf("</section>", previewStart);
  const locationsStart = html.indexOf('<section class="panel" aria-labelledby="locationsTitle"');
  const addStart = html.indexOf('<section class="panel" aria-labelledby="addTitle"');
  assert.ok(previewStart >= 0 && previewEnd > previewStart, "preview panel was not found");
  assert.ok(locationsStart >= 0 && addStart > locationsStart, "Locations panel was not found");
  assert.doesNotMatch(html.slice(previewStart, previewEnd), /id="clearPins"/);
  assert.match(html.slice(locationsStart, addStart), /id="clearPins"[^>]*>Clear locations<\/button>/);
});

test("obsolete standalone and statewide copy remain absent", () => {
  assert.doesNotMatch(html, /Standalone\s*[·•]\s*No map service required/);
  assert.doesNotMatch(html, /Standalone browser application/);
  assert.doesNotMatch(html, />Statewide</);
});
