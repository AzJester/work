import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const styles = readFileSync(resolve(rootDir, "black-hat-agent", "styles.css"), "utf8");

test("the application shell exposes accessible focus, touch, and status states", () => {
  assert.match(styles, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--sky\)/s);
  assert.match(styles, /\.sr-only\s*\{/);
  assert.match(styles, /\.btn,[^{]*\.nav a[^{]*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.field label,[^{]*\{[^}]*font-size:\s*12px/s);
  assert.match(styles, /\.save-state\.dirty\s*\{/);
  assert.match(styles, /\.save-state\.error\s*\{/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});

test("mobile navigation is an accessible off-canvas drawer with a backdrop", () => {
  assert.match(styles, /\.mobile-header\s*\{/);
  assert.match(styles, /\.nav-toggle\[aria-expanded="true"\]\s*\{/);
  assert.match(styles, /\.nav-backdrop\.open\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(styles, /#workspace-sidebar\.sidebar\s*\{[^}]*position:\s*fixed[^}]*height:\s*100dvh[^}]*translateX\(-105%\)/s);
  assert.match(styles, /#workspace-sidebar\.sidebar\.open\s*\{[^}]*translateX\(0\)/s);
  assert.match(styles, /#workspace-sidebar \.nav-close\s*\{[^}]*display:\s*inline-grid/s);
});

test("narrow layouts contain cards and controls without viewport overflow", () => {
  assert.match(styles, /body\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden/s);
  assert.match(styles, /\.grid\s*\{[^}]*minmax\(min\(100%,300px\),1fr\)/s);
  assert.match(styles, /@media\(max-width:360px\)/);
  assert.match(styles, /\.content\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/s);
  assert.match(styles, /:where\([^)]*\.card[^)]*\)\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
});

test("large datasets have sticky tables, filters, pagination, and mobile cards", () => {
  assert.match(styles, /\.table-sticky thead th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s);
  assert.match(styles, /\.table-sticky\.sticky-first :is\(th,td\):first-child\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/s);
  assert.match(styles, /\.data-toolbar\s*\{/);
  assert.match(styles, /\.collection-toolbar\s*\{/);
  assert.match(styles, /\.collection-toolbar \.result-count\s*\{/);
  assert.match(styles, /\.pagination\s*\{/);
  assert.match(styles, /\.page-status\s*\{/);
  assert.match(styles, /\.table-cards-mobile \.responsive-cards\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.empty-state\s*\{[^}]*min-height:\s*220px/s);
});

test("workspace actions form a keyboard-friendly grouped menu", () => {
  assert.match(styles, /\.workspace-actions\s*\{[^}]*position:\s*relative/s);
  assert.match(styles, /\.workspace-menu-toggle\[aria-expanded="true"\]\s*\{/);
  assert.match(styles, /\.workspace-menu\s*\{[^}]*position:\s*absolute/s);
  assert.match(styles, /\.workspace-menu\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /\.workspace-menu (?:button|button,\.workspace-menu a)[^{]*\{[^}]*width:\s*100%/s);
  assert.match(styles, /\.sidebar-header\s*\{/);
  assert.match(styles, /\.active-context\s*\{/);
  assert.match(styles, /\.report-actions\s*\{/);
  assert.match(styles, /\.action-group\s*\{/);
});

test("reports have polished reading and optional markdown-source views", () => {
  assert.match(styles, /\.report-document,\.report-view\s*\{[^}]*max-width:\s*920px/s);
  assert.match(styles, /:is\(\.report-document,\.report-view\) h1\s*\{/);
  assert.match(styles, /\.report-callout\.warning\s*\{/);
  assert.match(styles, /\.report-view-toggle button\[aria-selected="true"\]\s*\{/);
  assert.match(styles, /\.markdown-source (?:textarea|textarea,\.markdown-source pre)[^{]*\{[^}]*font:/s);
});

test("charts and diagrams are responsive, printable, and retain data tables", () => {
  assert.match(styles, /\.visualization-grid,\.visual-grid\s*\{/);
  assert.match(styles, /\.visual-card,\.chart-card\s*\{/);
  assert.match(styles, /\.visual-heading,\.chart-heading\s*\{/);
  assert.match(styles, /\.chart-svg,\.chart-canvas svg,\.diagram-svg\s*\{[^}]*width:\s*100%[^}]*height:\s*auto/s);
  assert.match(styles, /\.chart-legend\s*\{/);
  assert.match(styles, /\.chart-data summary\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.diagram-edge\.conflict\s*\{/);
  assert.match(styles, /@media print\s*\{/);
  assert.match(
    styles,
    /\.chart-svg,\.chart-canvas svg,\.diagram-svg\s*\{[^}]*print-color-adjust:\s*exact/s
  );
});
