import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const geoRoot = resolve(root, "geopresence");
const html = readFileSync(resolve(geoRoot, "index.html"), "utf8");
const readText = path => readFileSync(resolve(geoRoot, path), "utf8");
const readJson = path => JSON.parse(readText(path));
const readScript = source => source.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i)?.[1] || "";
const app = readScript(html);
const styles = html.match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)?.[1] || "";

function functionSource(source, ...names) {
  for (const name of names) {
    const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
    if (!match) continue;
    const start = source.indexOf("{", match.index + match[0].length);
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(match.index, index + 1);
      }
    }
  }
  return "";
}

function lastFunctionSource(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "g");
  let match;
  let lastIndex = -1;
  while ((match = pattern.exec(source))) lastIndex = match.index;
  return lastIndex < 0 ? "" : functionSource(source.slice(lastIndex), name);
}

function tagWithId(id) {
  return html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "i"))?.[0] || "";
}

function detailsBlock(id) {
  const openingTag = tagWithId(id);
  if (!/^<details\b/i.test(openingTag)) return "";
  const start = html.indexOf(openingTag);
  const end = html.indexOf("</details>", start + openingTag.length);
  return end < 0 ? "" : html.slice(start, end + "</details>".length);
}

function cssRule(selectorPattern) {
  return styles.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, "i"))?.[1] || "";
}

function around(needle, radius = 1800) {
  const index = app.indexOf(needle);
  return index < 0 ? "" : app.slice(Math.max(0, index - radius), index + needle.length + radius);
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16) / 255);
  const linear = channels.map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("v3 keeps a reproducible GEOID/LSAD place catalog without collapsing duplicate names", () => {
  const dataPath = resolve(geoRoot, "data/places-2025.json");
  const metaPath = resolve(geoRoot, "data/places-2025.meta.json");
  assert.ok(existsSync(dataPath), "the generated 2025 place catalog is missing");
  assert.ok(existsSync(metaPath), "the place-catalog provenance and schema metadata is missing");

  const places = JSON.parse(readFileSync(dataPath, "utf8"));
  const metadata = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.deepEqual(metadata.rowSchema, ["USPS", "GEOID", "NAME", "LSAD", "x", "y", "duplicateLabel"]);
  assert.equal(places.length, metadata.records.count);
  assert.ok(places.length >= 32_000, "the full 50-state/DC Census snapshot should be retained");
  assert.ok(places.every(row => (
    Array.isArray(row)
    && row.length === 7
    && /^[A-Z]{2}$/.test(row[0])
    && /^\d{7}$/.test(row[1])
    && row[2].trim()
    && String(row[3]).trim()
    && Number.isFinite(row[4])
    && Number.isFinite(row[5])
    && typeof row[6] === "string"
  )));
  assert.equal(new Set(places.map(row => row[1])).size, places.length, "GEOID must be the unique place identity");

  const duplicates = places.filter(row => row[6]);
  assert.ok(duplicates.length >= 400, "same-base-name places must not be discarded");
  assert.ok(duplicates.every(row => row[6].includes(row[1])), "duplicate labels must include a GEOID disambiguator");
  const midway = places.filter(row => row[0] === "FL" && /^Midway\b/i.test(row[2]));
  assert.deepEqual(midway.map(row => row[1]).sort(), ["1245425", "1245465", "1245475"]);
  assert.equal(new Set(midway.map(row => row[6])).size, 3);

  assert.match(app, /["']\.\/data\/places-2025\.json["']/,
    "the application should lazy-load the versioned same-origin catalog rather than parse it in the initial HTML");
  assert.match(app, /fetch\s*\([\s\S]{0,500}(?:response\.ok|\.ok[\s\S]{0,80}throw)/i,
    "catalog loading needs an explicit HTTP failure path");
  assert.match(app, /cityCatalog[\s\S]{0,800}(?:place\[1\]|row\[1\])/, "catalog index 1 (GEOID) must drive identity");
  assert.match(app, /(?:duplicateLabel|place\[6\]|row\[6\])/, "the editor must consume generated duplicate-name labels");
  assert.match(app, /(?:cityGeoid|placeGeoid|geoid|GEOID)/);
  assert.match(app, /(?:cityLsad|placeLsad|lsad|LSAD)/);
  assert.match(app, /(?:anchorId|placeId|cityId)\s*:/, "saved locations must identify cities by stable ID, not display name");
});

// Runs the app's own pure layout helpers outside the browser.
function layoutHelpers(extra = "") {
  const names = ["markerBadgeOffset", "pinBoxes", "clusterPlaces", "wrapKeyEntry", "layoutGroupKey"];
  const sources = names.map(name => functionSource(app, name));
  names.forEach((name, index) => assert.ok(sources[index], `${name} function was not found`));
  const constants = app.match(/const PIN_SIZE=[^;]+;/)?.[0];
  assert.ok(constants, "pin layout constants were not found");
  return vm.runInNewContext(`${constants}\nconst keyTextWidth=text=>String(text).length*6.5;\n${sources.join("\n")}\n${extra}\n({ ${names.join(", ")}, PIN_SIZE, PLACE_MERGE_DISTANCE })`);
}
const place = (key, x, y) => ({ key, anchorX: x, anchorY: y });
// Array.from brings arrays built inside the vm context into this realm, so strict deep equality compares their contents.
const summarize = clusters => Array.from(clusters, cluster => `${Array.from(cluster.places, member => member.key).join("+")}@${cluster.x.toFixed(3)},${cluster.y.toFixed(3)}`)
  .sort();

test("nearby places merge deterministically onto their centroid and no two pins end up closer than the merge distance", () => {
  const { clusterPlaces, PLACE_MERGE_DISTANCE } = layoutHelpers();
  assert.equal(PLACE_MERGE_DISTANCE, 7, "places closer than seven map units (about 21 miles) share a pin");

  assert.deepEqual(summarize(clusterPlaces([place("a", 100, 100), place("b", 106.9, 100)])), ["a+b@103.450,100.000"],
    "two places closer than the merge distance share one pin on their centroid");
  const apart = clusterPlaces([place("a", 100.3, 200.7), place("b", 107.3, 200.7)]);
  assert.deepEqual(summarize(apart), ["a@100.300,200.700", "b@107.300,200.700"], "places exactly the merge distance apart stay separate");
  assert.equal(apart[0].x, 100.3, "a place on its own keeps its exact catalog x");
  assert.equal(apart[0].y, 200.7, "a place on its own keeps its exact catalog y");
  assert.equal(clusterPlaces([]).length, 0, "no places, no pins");

  assert.deepEqual(summarize(clusterPlaces([place("a", 0, 0), place("b", 6, 0), place("c", 12, 0)])), ["a+b@3.000,0.000", "c@12.000,0.000"],
    "a chain does not swallow a place that is farther than the merge distance from the merged pin");
  assert.deepEqual(summarize(clusterPlaces([place("a", 0, 0), place("b", 5, 0), place("c", 8, 0)])), ["a+b+c@4.333,0.000"],
    "the closest pair merges first, and a third place within reach of the merged pin joins it");
  assert.deepEqual(summarize(clusterPlaces([place("a", 0, 0), place("b", 6, 0), place("c", 12, 0), place("d", 18, 0)])), ["a+b@3.000,0.000", "c+d@15.000,0.000"],
    "equal gaps break ties on place keys");

  let seed = 20261113;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const crowd = Array.from({ length: 400 }, (_, index) => place(`p${String(index).padStart(3, "0")}`, Number((random() * 90).toFixed(1)), Number((random() * 60).toFixed(1))));
  const clusters = Array.from(clusterPlaces(crowd));
  assert.equal(clusters.reduce((total, cluster) => total + cluster.places.length, 0), crowd.length, "every place belongs to exactly one pin");
  assert.ok(clusters.length > 20 && clusters.length < crowd.length / 2, "a crowd of places collapses into far fewer pins");
  assert.deepEqual(clusters.map(cluster => cluster.key), clusters.map(cluster => cluster.key).sort(), "pins are returned in a stable key order");
  for (const cluster of clusters) {
    const meanX = cluster.places.reduce((sum, member) => sum + member.anchorX, 0) / cluster.places.length;
    const meanY = cluster.places.reduce((sum, member) => sum + member.anchorY, 0) / cluster.places.length;
    assert.ok(Math.hypot(cluster.x - meanX, cluster.y - meanY) < 1e-9, "a merged pin sits on the plain centroid of its places");
  }
  for (let index = 0; index < clusters.length; index += 1) {
    for (let other = index + 1; other < clusters.length; other += 1) {
      assert.ok(Math.hypot(clusters[index].x - clusters[other].x, clusters[index].y - clusters[other].y) >= PLACE_MERGE_DISTANCE,
        "no two pins are closer than the merge distance");
    }
  }
  const reversed = clusterPlaces([...crowd].reverse());
  const shuffled = clusterPlaces([...crowd].sort((a, b) => (a.anchorX * 7 + a.anchorY * 13) % 5 - (b.anchorX * 7 + b.anchorY * 13) % 5));
  assert.deepEqual(summarize(reversed), summarize(clusters), "the result does not depend on the order locations were entered");
  assert.deepEqual(summarize(shuffled), summarize(clusters), "the result does not depend on the order locations were entered");

  const mapMarkup = lastFunctionSource(app, "mapMarkup");
  assert.match(mapMarkup, /\.sort\(\(a,b\)=>a\.key\.localeCompare\(b\.key\)\)/, "places are ordered by stable key before they are clustered");
  assert.match(mapMarkup, /(?:boxesOverlap|\.hits\()/, "labels are tested against the fixed pin boxes");
  assert.match(mapMarkup, /candidates\.find\(candidate=>insideMap\(candidate\.box\)&&clearSpot\(candidate\.box\)\)/,
    "a label candidate is rejected when it overlaps a pin, a state label, or an earlier place label");
  assert.match(app, /(?:labelOmitted|hiddenLabels|unplacedLabels|labelFallback|leaderPath)/i,
    "labels that cannot use their first position need a recorded fallback rather than silent omission");
});

test("clear, reset, replace-samples, and remove are recoverable destructive actions", () => {
  assert.match(html, /(?:id=["'][^"']*undo[^"']*["']|>Undo(?:\s[^<]*)?<)/i, "an Undo action must be available");
  assert.match(app, /(?:undoStack|actionHistory|recoverySnapshot|lastSnapshot|undoAction)/i);
  assert.match(app, /(?:confirm\s*\(|showModal\s*\(|confirmDestructive|requestConfirmation)/i,
    "destructive replacement and clearing need confirmation");

  for (const operation of ["clearPins", "resetMap", "loadSamples", "data-remove"]) {
    assert.match(around(operation), /(?:confirm|destructive|snapshot|history|undo|recover)/i,
      `${operation} must use the shared confirmation/recovery path`);
  }
  assert.match(app, /(?:RECOVERY|recovery)[\s\S]{0,400}(?:localStorage|storage)/i,
    "a persisted recovery snapshot should survive an accidental reload");
});

test("projects can be exported, validated, and imported as portable JSON", () => {
  assert.match(html, /(?:id=["'](?:export|download)(?:Project|Json)["']|>Export project<|>Download project<)/i);
  assert.match(html, /(?:id=["'](?:import|open)(?:Project|Json)["']|>Import project<|>Open project<)/i);
  const fileControl = html.match(/<input[^>]+type=["']file["'][^>]*>/i)?.[0] || "";
  assert.match(fileControl, /accept=["'][^"']*(?:\.json|application\/json)/i);
  assert.match(app, /(?:PROJECT|SCHEMA)_VERSION|projectSchemaVersion/i);
  assert.match(app, /JSON\.stringify[\s\S]{0,1000}(?:application\/json|\.json)/i);
  assert.match(app, /(?:\.text\(\)|FileReader)/);
  assert.match(app, /(?:validate|sanitize)(?:Project|Model|State|Imported)/i,
    "imported JSON must pass schema validation before replacing the current project");
  assert.match(app, /(?:schemaVersion|projectVersion)/i);
});

test("browser persistence is schema-validated, failure-safe, and recoverable", () => {
  assert.match(app, /(?:STORAGE_SCHEMA_VERSION|MODEL_SCHEMA_VERSION|schemaVersion)/);
  assert.match(app, /(?:validate|sanitize)(?:Model|State|Saved|Project)/i);
  assert.match(app, /(?:safeGet|readStorage|loadSaved|loadPersisted)/i);
  assert.match(app, /(?:safeSet|writeStorage|saveStorage|persist)/i);
  assert.match(app, /try\s*\{[\s\S]{0,1800}localStorage\.getItem[\s\S]{0,1800}\}\s*catch/i);
  assert.match(app, /try\s*\{[\s\S]{0,1800}localStorage\.setItem[\s\S]{0,1800}\}\s*catch/i,
    "blocked or full localStorage must not break rendering");
  assert.match(app, /(?:storage|saved data|project)[^\n]{0,180}(?:unavailable|invalid|recovered|could not|failed)/i,
    "users need a visible nonfatal warning when storage or saved data fails");
  assert.match(app, /(?:recovery|lastKnownGood|backup)/i);
});

test("starter demonstration data is either opt-in or explicitly editor-only", () => {
  const emptyStart = /(?:defaults|defaultModel)\s*=\s*\{[\s\S]{0,1800}?pins\s*:\s*\[\s*\]/.test(app);
  const editorNotice = /<(?:aside|div|p)[^>]+(?:id|class)=["'][^"']*(?:sample|demo)[^"']*(?:notice|banner|status)[^"']*["']/i.test(html);
  assert.ok(emptyStart || editorNotice, "sample locations must not look like official live data on first launch");
  if (!emptyStart) {
    assert.match(html, /(?:demonstration|sample)[\s\S]{0,160}(?:not official|editor only|clear|replace)/i);
  }
  const mapMarkup = functionSource(app, "mapMarkup", "buildMapMarkup", "renderMapMarkup");
  assert.doesNotMatch(mapMarkup, /(?:sample|demonstration)\s+(?:notice|data)/i,
    "the sample notice belongs in the editor, never in exported map markup");
});

test("clean SVG export removes hidden location metadata on request", () => {
  assert.match(html, /(?:id=["'](?:cleanSvg|stripSvgMetadata|svgMetadata)["']|Clean SVG|Remove (?:hidden )?metadata)/i);
  const serialization = functionSource(app, "serializedSvg", "serializeSvg", "buildSvgExport");
  assert.ok(serialization, "SVG serialization function was not found");
  assert.match(serialization, /(?:cleanSvg|stripSvgMetadata|svgMetadata|cleanExport)/i);
  assert.match(serialization, /(?:querySelectorAll\([^)]*(?:title|desc)|remove\(\))/i);
  assert.match(serialization, /(?:aria-label|aria-labelledby|aria-describedby)/i);
  assert.match(serialization, /(?:removeAttribute|removeNamedItem)/i);
  assert.match(serialization, /(?:data-(?:location|anchor|state)|dataset)/i,
    "presentation-only SVGs must drop editor data attributes as well as title/description text");
});

test("PNG and clipboard export use a busy state and fail safely", () => {
  assert.match(app, /(?:exportBusy|isExporting|setExportBusy|withExportState)/i);
  assert.match(app, /(?:aria-busy|\.disabled\s*=|setAttribute\(["']disabled)/i);
  assert.match(app, /canvas\.getContext\(["']2d["']\)[\s\S]{0,500}(?:if\s*\(!|throw|Error)/i,
    "a missing 2D context must become a friendly export error");
  assert.match(app, /toBlob[\s\S]{0,500}(?:if\s*\(!|reject|throw|Error)/i,
    "canvas.toBlob returning null must be handled");
  assert.match(app, /try[\s\S]{0,2600}URL\.createObjectURL[\s\S]{0,2600}finally[\s\S]{0,800}URL\.revokeObjectURL/i,
    "object URLs must be revoked even when image decoding or rasterization fails");
  assert.match(app, /(?:MAX_EXPORT_PIXELS|exportPixelLimit|memory|too large|lower quality)/i,
    "ultra-resolution export needs a mobile-safe preflight or actionable fallback");
  const sharedExport = functionSource(app, "withExportState", "runExport", "performExport", "setExportBusy");
  for (const name of ["exportPng", "copyPng"]) {
    const source = functionSource(app, name);
    const guarded = /try/.test(source) ? source : `${source}\n${sharedExport}`;
    assert.match(guarded, /try/);
    assert.match(guarded, /catch/);
    assert.match(guarded, /finally/);
    assert.match(guarded, /(?:toast|showError|announce)/);
  }
});

test("transparent maps support destination preview and an explicit text tone", () => {
  assert.match(html, /(?:id=["'](?:destinationPreview|transparentPreview|previewBackground)["']|Destination background|Preview background)/i);
  assert.match(html, /<option[^>]+value=["']light["'][^>]*>[^<]*(?:Light|White)/i);
  assert.match(html, /<option[^>]+value=["']dark["'][^>]*>[^<]*Dark/i);
  assert.match(html, /(?:type=["']color["'][^>]+(?:destination|preview|backdrop)|(?:destination|preview|backdrop)[^>]+type=["']color["'])/i);
  assert.match(html, /(?:id=["'](?:transparentTextTone|transparentText|textTone|exportTextTone)["']|Transparent(?:-export)? text|Text tone)/i);
  assert.match(html, /<option[^>]+value=["'](?:auto|light|dark)["']/i);
  assert.match(app, /(?:transparentTextTone|transparentText|textTone|exportTextTone)/);
  assert.match(app, /(?:destinationPreview|transparentPreview|previewBackground)/);
  assert.doesNotMatch(app, /model\.transparent\s*\?\s*["']#757575["']/,
    "transparent typography must not be locked to one gray regardless of destination");
});

test("the map is accessible without 51 state tab stops inside an image role", () => {
  assert.match(html, /<svg[^>]+role=["']img["'][^>]+aria-labelledby=/i);
  assert.doesNotMatch(app, /class=["'][^"']*state-(?:hit|click)[^"']*["'][^>]+tabindex=["']0["']/i);
  assert.doesNotMatch(app, /class=["'][^"']*state-(?:hit|click)[^"']*["'][^>]+role=["']button["']/i);
  assert.doesNotMatch(app, /tabindex=["']0["']\s+role=["']button["']/i);
  assert.match(html, /<select[^>]+id=["']pinState["']/i, "the state dropdown remains the keyboard state-selection path");
  assert.match(html, /<a[^>]+href=["']#(?:preview|location|add|main)/i, "keyboard users need a skip path around the map/editor regions");
});

test("focus indicators and state boundaries have strong non-glowing contrast", () => {
  const focusRule = styles.match(/[^{}]*:focus-visible[^{}]*\{([^}]*)\}/i)?.[1] || "";
  const width = Number(focusRule.match(/outline\s*:\s*([\d.]+)px/i)?.[1] || 0);
  assert.ok(width >= 3, "focus outline should be at least 3px");
  assert.doesNotMatch(focusRule, /rgba\([^)]*,\s*(?:0?\.[0-7]\d*|0)\s*\)/i,
    "a translucent focus ring disappears against some map themes");
  assert.doesNotMatch(styles, /\.state-shape[^{}]*\{[^}]*drop-shadow/i,
    "state-boundary contrast should not depend on a blurred glow");

  const paletteSource = functionSource(app, "palette", "getPalette", "resolvePalette");
  assert.ok(paletteSource, "theme palette function was not found");
  for (const theme of ["light", "clean", "dark"]) {
    const paletteName = paletteSource.match(/function\s+(\w+)/)?.[1];
    const palette = vm.runInNewContext(`let model={theme:${JSON.stringify(theme)}};${paletteSource};${paletteName}()`);
    assert.ok(/^#[a-f\d]{6}$/i.test(palette.land) && /^#[a-f\d]{6}$/i.test(palette.line));
    assert.ok(contrast(palette.land, palette.line) >= 3,
      `${theme} state boundaries need 3:1 contrast against state fill`);
  }
});

test("settings, location lists, and form errors use durable HTML semantics", () => {
  const fieldsets = html.match(/<fieldset\b/gi) || [];
  assert.ok(fieldsets.length >= 3, "Map heading, Format, and Map details should be fieldsets");
  for (const legend of ["Map heading", "Format", "Map details"]) {
    assert.match(html, new RegExp(`<legend[^>]*>\\s*${legend}\\s*</legend>`, "i"));
  }
  const pinListTag = tagWithId("pinList");
  assert.ok(/^<(?:ul|ol)\b/i.test(pinListTag) || /role=["']list["']/i.test(pinListTag));
  assert.match(app, /<(?:li)\b[^>]*class=["'][^"']*pin-row/i);

  for (const field of ["pinName", "pinCity", "pinInstallation"]) {
    const tag = tagWithId(field);
    assert.match(tag, /aria-describedby=["'][^"']+/i, `${field} needs an inline help/error relationship`);
  }
  assert.ok((html.match(/(?:class=["'][^"']*(?:field-error|error-message)[^"']*["']|role=["']alert["'])/gi) || []).length >= 3,
    "each validated location field needs an inline error region");
  assert.match(app, /aria-invalid/);
  assert.match(app, /(?:setFieldError|showFieldError|validateField|inlineError)/i);
});

test("live heading edits are debounced rather than rebuilding the map on every keypress", () => {
  assert.match(app, /(?:function\s+debounce|const\s+debounce\s*=|scheduleRender|queueRender)/i);
  const titleContext = `${around('"mapTitle"', 2500)}${around("'mapTitle'", 2500)}`;
  assert.match(titleContext, /(?:debounce|scheduleRender|queueRender|requestAnimationFrame)/i);
  assert.doesNotMatch(app, /(?:mapTitle|mapSubtitle)[\s\S]{0,300}addEventListener\(["']input["'][\s\S]{0,180}=>\s*render\(\)/i);
});

test("city and installation pickers are searchable comboboxes", () => {
  for (const id of ["pinCity", "pinInstallation"]) {
    const control = tagWithId(id);
    assert.ok(control, `${id} control was not found`);
    assert.ok(
      /^<input\b/i.test(control) || /role=["']combobox["']/i.test(control),
      `${id} must support text search instead of being a long native select`
    );
    assert.match(control, /(?:list=["']|role=["']combobox["']|aria-controls=["'])/i);
  }
  assert.match(html, /role=["']listbox["']|<datalist\b/i);
  assert.match(app, /(?:filter|includes|startsWith)[\s\S]{0,1000}(?:city|place|installation)/i);
  assert.match(app, /(?:duplicateLabel|GEOID|geoid)/, "same-name place choices must display their disambiguator");
});

test("long headings and labels are bounded and fitted without silent disappearance", () => {
  const limits = {
    mapTitle: 100,
    mapSubtitle: 180,
    pinName: 180
  };
  for (const [id, maximum] of Object.entries(limits)) {
    const tag = tagWithId(id);
    const value = Number(tag.match(/maxlength=["']?(\d+)/i)?.[1] || 0);
    assert.ok(value > 0 && value <= maximum, `${id} needs a reasonable maxlength`);
  }
  assert.match(app, /(?:fit(?:Svg)?Text|fitTextSize|wrapSvgText|measureText|textLength|lengthAdjust)/i,
    "title and subtitle need automatic fitting or wrapping in the export canvas");
  assert.match(html, /(?:character|length|fit|overflow|too long)[^<]{0,120}(?:warning|export|canvas|map)/i,
    "the editor should explain or warn when entered text must be fitted");
  assert.doesNotMatch(app, /(?:anchorLabel|placeLabel|cityLabel)[\s\S]{0,180}\.slice\(0\s*,\s*30\)/i,
    "place labels should not be silently discarded at an unexplained 30-character boundary");
});

test("ambiguous controls and source descriptions use precise wording", () => {
  assert.match(html, /<label[^>]+for=["']theme["'][^>]*>\s*Map theme\s*</i);
  assert.match(html, /<label[^>]+for=["']accent["'][^>]*>\s*Heading accent\s*</i);
  assert.match(html, /Locations per state/i);
  assert.doesNotMatch(html, />\s*Site counts\s*</i);
  assert.match(html, /Replace with sample locations/i);
  assert.match(html, /public reference catalog/i);
  assert.match(html, /approximate presentation anchor/i);
  assert.doesNotMatch(html, /complete (?:military |installation )?inventory/i);
});

test("v3.1 map settings use compact, accessible native disclosures", () => {
  const contracts = [
    ["quickSettings", "Quick setup", true],
    ["mapDetailsSettings", "Map details", false],
    ["advancedSettings", "Advanced", false],
    ["projectSettings", "Project", false]
  ];

  for (const [id, label, startsOpen] of contracts) {
    const openingTag = tagWithId(id);
    assert.match(openingTag, /^<details\b/i, `${id} must use the native details element`);
    assert.match(openingTag, /class=["'][^"']*\bsettings-disclosure\b/i);
    assert.equal(/\sopen(?:\s|=|>)/i.test(openingTag), startsOpen,
      `${label} must ${startsOpen ? "start open" : "start collapsed"}`);

    const block = detailsBlock(id);
    assert.ok(block, `${id} details block was not found`);
    const summary = block.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/i)?.[0] || "";
    assert.ok(summary, `${label} needs a keyboard-accessible native summary`);
    assert.match(summary.replace(/<[^>]+>/g, " "), new RegExp(label, "i"));
    assert.match(summary, /class=["'][^"']*\bsettings-summary-status\b/i,
      `${label} must expose its concise current-value summary while collapsed`);
    assert.match(block, /<fieldset\b/i, `${label} must retain grouped form semantics`);
    assert.match(block, /<legend\b[^>]*>[\s\S]*?<\/legend>/i, `${label} needs a fieldset legend`);
  }

  const quick = detailsBlock("quickSettings");
  assert.match(quick, /<legend[^>]*>\s*Map heading\s*<\/legend>/i);
  assert.match(quick, /<legend[^>]*>\s*Format\s*<\/legend>/i);
  for (const legend of ["Map heading", "Format", "Map details", "Project"]) {
    assert.match(html, new RegExp(`<legend[^>]*>\\s*${legend}\\s*</legend>`, "i"),
      `${legend} must remain a semantic legend after the sidebar reorganization`);
  }

  const controlsRule = cssRule("\\.controls");
  const controlsGapText = controlsRule.match(/\bgap\s*:\s*([\d.]+)px/i)?.[1];
  if (controlsGapText) {
    assert.ok(Number(controlsGapText) <= 10, "the settings stack should use a compact gap of no more than 10px");
  }
  assert.match(styles, /\.controls\s*>\s*\.panel-body\s*\{[^}]*padding\s*:\s*0/i,
    "the disclosure stack should use the panel width without a second padded container");
  const disclosureRule = cssRule("\\.settings-disclosure");
  assert.ok(disclosureRule, "compact disclosure styling was not found");
  const summaryRule = styles.match(/\.settings-disclosure[^{}]*summary[^{}]*\{([^}]*)\}/i)?.[1] || "";
  assert.match(summaryRule, /cursor\s*:\s*pointer/i);
  const blockPadding = Number(summaryRule.match(/padding(?:-block)?\s*:\s*([\d.]+)px/i)?.[1] || Number.NaN);
  assert.ok(Number.isFinite(blockPadding) && blockPadding <= 12,
    "disclosure summaries should remain compact enough for the sidebar");
  assert.match(styles, /\.settings-summary-status\s*\{/i);
});

test("v3.1 renders category interiors inside one outlined teardrop pin shell", () => {
  const token = functionSource(app, "markerToken");
  const symbol = functionSource(app, "markerSymbol");
  const style = functionSource(app, "markerStyle");
  assert.ok(token && symbol && style, "pin renderer functions were not found");

  assert.match(token, /<g\b[^>]*class=["'][^"']*\bmap-pin\b/i);
  const pinBody = token.match(/<path\b[^>]*class=["']map-pin-body marker-pin["'][^>]*>/i)?.[0] || "";
  assert.ok(pinBody, "the default marker must be a teardrop path with map-pin-body and marker-pin classes");
  assert.match(pinBody, /\bd=["'][^"']+/i);
  assert.match(pinBody, /stroke=["']\$\{style\.ring\}["']/i,
    "the teardrop outline must use the destination-aware contrasting ring color");
  const outlineWidth = Number(pinBody.match(/stroke-width=["']([\d.]+)/i)?.[1] || 0);
  assert.ok(outlineWidth >= 2, "the contrasting teardrop outline must remain visibly crisp");
  assert.match(pinBody, /vector-effect=["']non-scaling-stroke["']/i);
  assert.match(token, /markerSymbol\(/, "the shell must delegate its interior to the category renderer");
  assert.match(symbol, /meta\.icon/);
  assert.match(token, /class=["'][^"']*\bmap-pin-icon\b/i);
  for (const icon of ["star", "building", "circle", "briefcase", "clock", "document", "network", "person", "link", "target", "factory"]) {
    assert.match(symbol, new RegExp(`["']${icon}["']`), `${icon} needs a rendered pin interior`);
  }
  assert.match(style, /ring\s*:/);
  assert.doesNotMatch(app, /class=["'][^"']*\bmarker-backplate\b/i,
    "the old circular marker backplate must not remain as the default map symbol");
  assert.doesNotMatch(app, /meta\.shape/,
    "the pin interior registry should use its explicit icon metadata rather than the former outer-shape key");
});

test("one pin per place: repeated types share a count badge, mixed types share a numbered group pin, and the legend reuses complete pins", () => {
  const mapMarkup = lastFunctionSource(app, "mapMarkup");
  assert.ok(mapMarkup, "current mapMarkup function was not found");
  assert.match(mapMarkup, /pinsByType\s*=\s*new Map\(\)/);
  assert.match(mapMarkup, /isGroup\s*=\s*merged\s*\|\|\s*typeGroups\.length\s*>\s*1/,
    "several location types at one place, or several merged places, make a group pin");
  assert.match(mapMarkup, /hasBadge\s*:\s*!isGroup\s*&&\s*pins\.length\s*>\s*1/, "only a single-type pin carries the count badge");
  assert.match(mapMarkup, /class=["']marker-count["']/);
  assert.match(mapMarkup, /count\s*>\s*1\s*\?/,
    "one category repeated at a place should use one numeric badge rather than duplicate pins");
  assert.match(mapMarkup, />\$\{count\}<\/text>/,
    "the same-type badge must contain the actual numeric count");
  assert.doesNotMatch(mapMarkup, /marker-fan-stem|marker-leader|markerOffsets/,
    "mixed categories no longer fan away from their place");

  const group = functionSource(app, "groupMarkerToken");
  assert.ok(group, "groupMarkerToken function was not found");
  assert.match(group, /markerStyle\(meta,p\)/, "a group pin is styled through markerStyle");
  assert.match(group, /class=["']map-pin-body marker-pin["']/, "a group pin is the same teardrop");
  assert.match(group, /pinBodyPath\(cx,cy,size\)/);
  assert.match(group, /class=["']map-pin-number["'][^>]*fill=["']\$\{style\.icon\}["']/, "the key number takes the symbol's place and colour");
  assert.doesNotMatch(group, /markerSymbol\(|marker-count/, "a group pin has no type symbol and no count badge");
  assert.match(mapMarkup, /TONE_ORDER\.indexOf\(metaFor\(type\)\.tone\)/, "types are ranked by tier: lead, then site, then presence");
  assert.match(app, /TONE_ORDER=\["lead","site","presence"\]/);
  assert.match(mapMarkup, /groupMarkerToken\(metaFor\(cluster\.typeGroups\[0\]\[0\]\)/, "a group pin takes the highest tier among its members");
  assert.match(mapMarkup, /numbered=clusters\.filter\(cluster=>cluster\.isGroup\)\.sort\(\(a,b\)=>a\.x-b\.x/, "group pins are numbered west to east");
  assert.match(mapMarkup, /aria-label="\$\{esc\(`Group \$\{cluster\.number\}[^`]*\$\{detail\.join/, "a group pin's accessible name lists every location");
  assert.match(mapMarkup, /location\$\{count===1\?"":"s"\} \(\$\{esc\(names\)\}\)/, "a single-type pin's accessible name lists every location");

  assert.ok((mapMarkup.match(/markerToken\(/g) || []).length >= 2,
    "map locations and legend entries must call the same complete pin renderer");
  assert.match(mapMarkup, /Object\.entries\(typeMeta\)\.filter\(\(\[type\]\)\s*=>\s*model\.pins\.some\(pin\s*=>\s*pin\.type\s*===\s*type\)\)/,
    "the legend must show every category used by the current project, including those inside group pins");
  assert.match(mapMarkup,
    /(?:legend(?:Rows|Columns|Cols)|Math\.floor\([^)]*\/[^)]*\)[\s\S]{0,220}legend|index\s*%\s*(?:legend(?:Columns|Cols)|\d+))/i,
    "the expanded category legend needs row/column wrapping instead of one overflowing line");
});

test("the numbered key lists as many group pins as fit and counts the rest", () => {
  const { layoutGroupKey, wrapKeyEntry } = layoutHelpers();
  const entry = number => ({ number, places: `Place ${number}, AL`, types: "Headquarters, Operations center, Contract site (2)" });

  const lines = wrapKeyEntry({ places: "Huntsville, AL", types: "Headquarters, Operations center, Contract site (2)" }, 1000);
  assert.equal(lines.length, 1);
  assert.equal(Array.from(lines[0], word => word.text).join(" "), "Huntsville, AL: Headquarters, Operations center, Contract site (2)");
  assert.deepEqual(Array.from(lines[0]).filter(word => word.bold).map(word => word.text), ["Huntsville,", "AL:"], "the places are set apart from the types");
  const wrapped = wrapKeyEntry({ places: "Huntsville, AL", types: "Headquarters, Operations center, Contract site (2)" }, 200);
  assert.ok(wrapped.length > 1, "a long entry wraps inside its column");
  assert.ok(Array.from(wrapped).every(line => Array.from(line).reduce((width, word) => width + word.text.length * 6.5, 0) <= 200), "no wrapped line is wider than its column");
  const truncated = wrapKeyEntry({ places: "Huntsville, AL", types: Array.from({ length: 80 }, (_, index) => `Type${index}`).join(", ") }, 200, 4);
  assert.equal(truncated.length, 4, "an entry never takes more than four lines");
  assert.equal(truncated[3].at(-1).text, "…");

  const one = layoutGroupKey([entry(1)], 1440, 150);
  assert.equal(one.columns, 1);
  assert.equal(one.items.length, 1);
  assert.equal(one.hidden, 0);

  const all = layoutGroupKey(Array.from({ length: 6 }, (_, index) => entry(index + 1)), 1440, 150);
  assert.equal(all.columns, 2);
  assert.equal(all.items.length, 6);
  assert.equal(all.hidden, 0);
  assert.equal(all.first, 3, "entries run down the first column, then the second");
  assert.ok(all.height <= 150);

  const crowded = layoutGroupKey(Array.from({ length: 60 }, (_, index) => entry(index + 1)), 1440, 150);
  assert.equal(crowded.total, 60);
  assert.ok(crowded.items.length > 0 && crowded.items.length < 60, "only the entries that fit are listed");
  assert.equal(crowded.hidden, 60 - crowded.items.length, "the rest are counted for the final line");
  assert.ok(crowded.height <= 150, "the key never grows past the height it is given");
  assert.deepEqual(crowded.items.map(item => item.number), Array.from({ length: crowded.items.length }, (_, index) => index + 1), "entries are listed in number order");
  const roomier = layoutGroupKey(Array.from({ length: 60 }, (_, index) => entry(index + 1)), 1440, 300);
  assert.ok(roomier.items.length > crowded.items.length, "a taller band lists more entries");

  const mapMarkup = lastFunctionSource(app, "mapMarkup");
  const keyMarkup = functionSource(app, "groupKeyMarkup");
  assert.ok(keyMarkup, "groupKeyMarkup function was not found");
  assert.match(keyMarkup, /class="group-key-more"[^>]*>\+ \$\{key\.hidden\} more</, "a final line counts the group pins that are not listed");
  assert.match(mapMarkup, /const key=keyEntries\.length\?layoutGroupKey\(/, "the key is drawn whenever a group pin exists, with or without the legend");
  assert.match(mapMarkup, /mapBottom=legendBand\+\(key\?key\.height\+14:0\)/, "the bottom band grows for the key and the map shrinks to fit");
  assert.match(mapMarkup, /keyOverflow:key\?key\.hidden:0/);
  assert.match(app, /warnings\.keyOverflow\)warningParts\.push/, "the layout warning reports entries the key cannot list");
});

test("pin boxes cover the teardrop, its tail and the count badge, and state labels give way to them", () => {
  const { pinBoxes, markerBadgeOffset, PIN_SIZE } = layoutHelpers();
  const [body, ...rest] = pinBoxes(100, 200, false);
  assert.equal(rest.length, 0, "a pin without a badge takes one box");
  assert.ok(body[0] <= 100 - PIN_SIZE && body[2] >= 100 + PIN_SIZE, "the box covers the full width of the teardrop");
  assert.ok(body[1] <= 200 - PIN_SIZE * 3.1 && body[3] >= 200, "the box runs from the top of the head down to the tip");
  assert.ok(body[2] - body[0] < 30 && body[3] - body[1] < 40, "the box hugs the pin instead of reserving a wide zone around it");
  const [, badge] = pinBoxes(100, 200, true);
  const [badgeDx, badgeDy] = markerBadgeOffset();
  assert.ok(badge, "a count badge adds its own box");
  assert.ok(badge[0] <= 100 + badgeDx - 8 && badge[2] >= 100 + badgeDx + 8 && badge[1] <= 200 + badgeDy - 8 && badge[3] >= 200 + badgeDy + 8,
    "the badge box covers the whole badge circle");

  const stateLabels = functionSource(app, "placeStateLabels");
  const mapMarkup = lastFunctionSource(app, "mapMarkup");
  assert.ok(stateLabels, "placeStateLabels function was not found");
  assert.match(stateLabels, /pinIndex\.hits\(box,2\)/, "a state plate that a pin's box would cover has to give way");
  assert.match(stateLabels, /stateLabelOffsets\(\)\.find/, "it moves to the nearest free spot");
  assert.match(stateLabels, /insideState\(code,/, "the new spot must be inside the same state");
  assert.match(stateLabels, /if\(!spot\)\{hidden\+\+;return\}/, "with no free spot the abbreviation is left out");
  assert.match(stateLabels, /callouts\.has\(code\)/, "callout states keep a callout");
  assert.match(functionSource(app, "insideState"), /isPointInPath\(outline\.path,x,y,"evenodd"\)/);
  assert.match(functionSource(app, "stateOutline"), /new Path2D\(geometry\.path\)/, "state outlines are cached as Path2D");
  assert.match(mapMarkup, /const stateLabelBoxes=\[\.\.\.stateLabelLayout\.placed\.values\(\)\]/,
    "place labels avoid the state plates where they finally sit");
  assert.match(mapMarkup, /markerCollisionBoxes/,
    "labels and state plates reserve nothing: they work around the final pin boxes");
  assert.doesNotMatch(mapMarkup, /group\.x=group\.anchorX\+|markerShiftCandidates|occupiedMarkerFootprints/, "pins are never shifted off their points");
});

test("v3 application, README, plan, and changelog publish one consistent version", () => {
  const readme = readText("README.md");
  const plan = readText("plan.md");
  const changelog = readText("changelog.md");
  const version = app.match(/\bAPP_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/)?.[1];
  assert.ok(version, "APP_VERSION was not found");
  assert.equal(version, "3.4.0", "this release must publish the complete v3.4.0 contract");
  assert.ok(Number(version.split(".")[0]) >= 3, "the complete hardening release should be versioned as v3 or later");
  assert.equal(readme.match(/Version:\s*\*\*(\d+\.\d+\.\d+)\*\*/i)?.[1], version);
  assert.equal(plan.match(/Current version:\s*(\d+\.\d+\.\d+)/i)?.[1], version);
  assert.equal(changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1], version);
  assert.ok((html.match(new RegExp(`(?:v|Version\\s+)${version.replaceAll(".", "\\.")}`, "g")) || []).length >= 3,
    "header, version card, and footer must show the same version");
  assert.match(html, /Created by Dr\. Shane Turner/);
  assert.doesNotMatch(html, /(?:\u00c2\u00b7|\u00e2\u20ac\u00ba)/,
    "v3.1 UI copy must not contain mojibake in separators or disclosure arrows");

  for (const document of [readme, plan, changelog]) {
    assert.match(document, /JSON (?:project )?(?:import|export)|import\/export/i);
    assert.match(document, /GEOID/i);
    assert.match(document, /(?:Undo|recovery|recoverable)/i);
    assert.match(document, /(?:clean SVG|SVG metadata|metadata-free SVG)/i);
  }
  assert.match(plan, /searchable (?:city|place|installation|combobox)/i);
  assert.match(changelog, /## \[[^\]]+\] - \d{4}-\d{2}-\d{2}/);
});
