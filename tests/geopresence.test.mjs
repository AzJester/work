import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "geopresence/index.html"), "utf8");

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
