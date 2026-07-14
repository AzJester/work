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

test("distinct nearby anchors participate in one deterministic global occupancy layout", () => {
  assert.match(app, /(?:global(?:Marker|Anchor|Layout|Occupancy)|occupied(?:Marker|Anchor)?(?:Boxes|Footprints)|markerCollisionBoxes)/i,
    "marker occupancy must be shared across different anchors, not reset per anchor group");
  assert.match(app, /(?:boxesOverlap|rectsOverlap|overlap|intersect|collid)/i);
  assert.match(app, /(?:candidate|offset)[\s\S]{0,1800}(?:occupied|occupancy|collision|overlap)/i,
    "candidate marker positions must be rejected when they overlap globally occupied geometry");
  assert.match(app, /(?:sort\([\s\S]{0,500}(?:anchorId|placeId|id)|localeCompare)/i,
    "nearby-anchor placement needs a stable tie-breaker so exports do not move between renders");
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

test("v3.1 groups repeated types, fans mixed types, and reuses complete pins in a wrapping legend", () => {
  const mapMarkup = lastFunctionSource(app, "mapMarkup");
  assert.ok(mapMarkup, "current mapMarkup function was not found");
  assert.match(mapMarkup, /const\s+pinsByType\s*=\s*new Map\(\)/);
  assert.match(mapMarkup, /markerOffsets\(group\.typeGroups\.length\)/);
  assert.match(mapMarkup, /class=["']marker-fan-stem["']/,
    "mixed categories need visible stems back to their shared geographic anchor");
  assert.match(mapMarkup, /class=["']marker-count["']/);
  assert.match(mapMarkup, /count\s*>\s*1\s*\?/,
    "one category repeated at an anchor should use one numeric badge rather than duplicate pins");
  assert.match(mapMarkup, />\$\{count\}<\/text>/,
    "the same-type badge must contain the actual numeric count");

  assert.ok((mapMarkup.match(/markerToken\(/g) || []).length >= 2,
    "map locations and legend entries must call the same complete pin renderer");
  assert.match(mapMarkup, /Object\.entries\(typeMeta\)\.filter\(\(\[type\]\)\s*=>\s*model\.pins\.some\(pin\s*=>\s*pin\.type\s*===\s*type\)\)/,
    "the legend must show only categories used by the current project");
  assert.match(mapMarkup,
    /(?:legend(?:Rows|Columns|Cols)|Math\.floor\([^)]*\/[^)]*\)[\s\S]{0,220}legend|index\s*%\s*(?:legend(?:Columns|Cols)|\d+))/i,
    "the expanded category legend needs row/column wrapping instead of one overflowing line");
});

test("v3.1 collision footprints protect state labels from pin bodies and count badges", () => {
  const footprints = functionSource(app, "markerFootprints");
  const mapMarkup = lastFunctionSource(app, "mapMarkup");
  assert.ok(footprints, "markerFootprints function was not found");
  const namesPinGeometry = /(?:(?:pin|marker)(?:Width|Height|Radius|Bounds|Body|Tail)|(?:body|tail)(?:Radius|Offset|Bounds)|teardrop|PIN_[A-Z_]+)/i.test(footprints);
  const offsetsForPinTail = /y\s*:\s*dy\s*[-+]\s*[\d.]+[\s\S]{0,80}r\s*:\s*(?:1[7-9]|[2-9]\d)/i.test(footprints);
  assert.ok(namesPinGeometry || offsetsForPinTail,
    "collision geometry must cover the teardrop body and tail instead of the retired centered circle");
  assert.match(footprints, /markerBadgeOffset/,
    "numeric badge geometry must participate in the shared occupancy footprint");
  assert.doesNotMatch(footprints, /\{\s*x\s*:\s*dx\s*,\s*y\s*:\s*dy\s*,\s*r\s*:\s*16\s*\}/,
    "the former fixed circular footprint does not cover the teardrop tail");

  assert.match(mapMarkup, /group\.footprints\s*=\s*markerFootprints\(/);
  assert.match(mapMarkup, /stateLabelBoxes\.some\(/,
    "state abbreviation and state-count rectangles must remain protected placement zones");
  assert.match(mapMarkup, /occupiedMarkerFootprints/,
    "pin-aware footprints must still feed deterministic global occupancy");
  assert.match(mapMarkup, /markerCollisionBoxes/,
    "labels and nearby independent anchors must reserve the final pin footprint");
});

test("v3 application, README, plan, and changelog publish one consistent version", () => {
  const readme = readText("README.md");
  const plan = readText("plan.md");
  const changelog = readText("changelog.md");
  const version = app.match(/\bAPP_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/)?.[1];
  assert.ok(version, "APP_VERSION was not found");
  assert.equal(version, "3.2.1", "this release must publish the complete v3.2.1 contract");
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
