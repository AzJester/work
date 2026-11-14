import { readFileSync } from "node:fs";
import { test, expect, hasWebGl2 } from "./topo-fixtures.mjs";

// The deployed page must show the version this commit ships.
const releasedVersion = readFileSync(new URL("../../topo/app.mjs", import.meta.url), "utf8")
  .match(/\bAPP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)?.[1];
const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const pinned = name => packageJson.devDependencies[name];

test("@production deployed Topo Map Builder release is healthy", async ({ page, request }) => {
  test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
  test.setTimeout(240_000);
  expect(releasedVersion, "APP_VERSION was not found in topo/app.mjs").toBeTruthy();

  // Wait until the CDN serves this release rather than a cached copy of the last one.
  await expect
    .poll(async () => {
      const response = await request.get(`../topo/app.mjs?v=${releasedVersion}&deployment-smoke=${Date.now()}`, { failOnStatusCode: false });
      return response.status() === 200 && (await response.text()).includes(`APP_VERSION = "${releasedVersion}"`);
    }, { timeout: 150_000, intervals: [1_000, 2_000, 5_000] })
    .toBe(true);

  const assets = [
    "app.css", "icon.svg", "lib/geo.mjs", "lib/wmm.mjs", "lib/grid.mjs", "lib/pages.mjs", "lib/style.mjs", "lib/render.mjs",
    "lib/export-pdf.mjs", "lib/export-tiles.mjs", "lib/zip.mjs",
    `vendor/maplibre-gl-${pinned("maplibre-gl")}/maplibre-gl.mjs`,
    `vendor/maplibre-gl-${pinned("maplibre-gl")}/maplibre-gl-worker.mjs`,
    `vendor/maplibre-gl-${pinned("maplibre-gl")}/maplibre-gl.css`,
    `vendor/maplibre-contour-${pinned("maplibre-contour")}/maplibre-contour.min.js`,
    `vendor/jspdf-${pinned("jspdf")}/jspdf.umd.min.js`,
    `vendor/sql.js-${pinned("sql.js")}/sql-wasm-browser.js`,
    `vendor/sql.js-${pinned("sql.js")}/sql-wasm-browser.wasm`,
  ];
  for (const asset of assets) {
    expect((await request.get(`../topo/${asset}`, { failOnStatusCode: false })).status(), asset).toBe(200);
  }

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(`../topo/?deployment-smoke=${Date.now()}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Topo Map Builder");
  await expect(page.getByRole("tab", { name: "Print" })).toHaveAttribute("aria-selected", "true");

  // The map itself needs WebGL 2. A runner without it can still vouch for everything above.
  if (!(await hasWebGl2(page))) {
    test.info().annotations.push({ type: "note", description: "WebGL 2 is unavailable on this runner; the map was not started" });
    return;
  }
  await page.waitForFunction(() => globalThis.topoApp, null, { timeout: 30_000 });
  await expect(page.locator("#version")).toHaveText(`v${releasedVersion}`);
  await expect(page.locator("#map .maplibregl-canvas")).toBeVisible();
  await expect(page.locator("#download")).toBeDisabled();
  expect(pageErrors).toEqual([]);
});
