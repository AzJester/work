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
  for (const id of ["mapTitle", "mapSubtitle", "mapFooter", "aspect", "scale", "theme", "accent", "showLabels", "showCounts", "showLegend", "showGrid", "transparent"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /16:9/);
  assert.match(html, /4:3/);
  assert.match(html, /Square/);
});

test("map builder uses complete projected U.S. state geometry instead of tiles", () => {
  const geometryMatch = html.match(/const stateGeometry=(\[[\s\S]*?\]);\s*const typeMeta=/);
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
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion/);
});

test("only synthetic sample data is bundled", () => {
  assert.match(html, /Synthetic demonstration data/);
  assert.match(html, /const samples=/);
});

test("version, creator, and changelog are published", () => {
  assert.match(html, /const APP_VERSION="2\.0\.0"/);
  assert.match(html, /Created by Dr\. Shane Turner/);
  assert.match(changelog, /## \[2\.0\.0\] - 2026-07-13/);
});
