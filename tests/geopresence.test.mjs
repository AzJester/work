import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "geopresence/index.html"), "utf8");

test("GeoPresence inline application parses as JavaScript", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1], { filename: "geopresence-inline.js" }));
});

test("GeoPresence supplies accessible map and synchronized alternative", () => {
  assert.match(html, /<svg[^>]+role="img"/);
  assert.match(html, /class="state \$\{/);
  assert.match(html, /role="button" tabindex="0" data-state/);
  assert.match(html, /id="siteRows"/);
  assert.match(html, /id="mapSummary" aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion/);
});

test("GeoPresence separates operational and publishing state", () => {
  assert.match(html, /Operational status/);
  assert.match(html, /Draft &nbsp;·&nbsp; Submitted &nbsp;·&nbsp; Approved &nbsp;·&nbsp; Published/);
  assert.match(html, /workflow:"published"/);
});

test("GeoPresence implements the complete visibility vocabulary", () => {
  for (const value of ["public_internal", "business_internal", "restricted", "executive_only", "aggregated_only", "hidden_archived"]) {
    assert.match(html, new RegExp(value));
  }
});

test("GeoPresence uses synthetic data and explicitly rejects external approval scope", () => {
  assert.match(html, /Synthetic demonstration data/);
  assert.match(html, /No external or government approval is required/);
  assert.doesNotMatch(html, /requires government approval/i);
});
