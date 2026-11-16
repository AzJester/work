import { readFileSync } from "node:fs";
import { test, expect, hasWebGl2 } from "./topo-fixtures.mjs";

// The relief map is one self-contained WebGL page. These tests run it on the software renderer at its lowest
// quality preset, and freeze it after a few frames where a still picture is enough.
const PAGE = "/relief-map.html";
const built = readFileSync(new URL("../../relief-map.html", import.meta.url), "utf8");
const stamp = built.match(/<meta name="relief-build" content="([0-9a-f]{12})">/)?.[1];

async function open(page, query = "q=low&freeze=4", frames = 4) {
  const problems = [], requests = [];
  page.on("pageerror", (error) => problems.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("request", (request) => { if (!/^(data|blob):/.test(request.url())) requests.push(new URL(request.url()).pathname); });
  await page.goto(`${PAGE}?${query}`);
  test.skip(!(await hasWebGl2(page)), "this browser has no WebGL 2 context");
  await page.waitForFunction((n) => (window.__relief && window.__relief.frames >= n) || document.body.dataset.error, frames, { timeout: 150_000 });
  expect(await page.evaluate(() => document.body.dataset.error ?? null)).toBeNull();
  return { problems, requests };
}

test.describe("United States in Relief", () => {
  test.describe.configure({ timeout: 240_000 });

  test("draws the map from one file with no other requests", async ({ page }) => {
    const { problems, requests } = await open(page);
    expect(requests, "the page must not load anything but itself").toEqual([PAGE]);
    await expect(page.locator("#loading")).toHaveClass(/done/);
    const info = await page.evaluate(() => window.__relief.info());
    expect(info.quality).toBe("low");
    expect(info.patches).toBeGreaterThan(4);
    expect(info.trees).toBeGreaterThan(20_000);
    expect(info.buildings).toBeGreaterThan(1_000);
    expect(info.triangles).toBeGreaterThan(200_000);
    // What reached the screen: many different colours, not a blank or single-colour canvas.
    const pixels = await page.evaluate(() => window.__relief.probe());
    expect(new Set(pixels.map((p) => p.join(","))).size).toBeGreaterThan(40);
    const centre = pixels[4 * 12 + 5];
    expect(centre[1], "the middle of the map is land, greener than it is blue").toBeGreaterThan(centre[2]);
    expect(problems).toEqual([]);
  });

  test("reports true elevation, state and coordinates under the pointer", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      const r = window.__relief, at = (lon, lat) => { const [x, y] = r.screenOf(lon, lat), hit = r.pickScreen(x, y); return hit && [hit.state, Math.round(hit.elev), Math.round(hit.lon * 10) / 10, Math.round(hit.lat * 10) / 10, hit.water]; };
      return { denver: at(-104.99, 39.74), kansas: at(-98.5, 38.5), gulf: at(-91, 27.9), superior: at(-87.5, 47.7), sky: r.pickScreen(5, 5) };
    });
    expect(result.denver.slice(0, 1)).toEqual(["Colorado"]);
    expect(Math.abs(result.denver[1] - 1609)).toBeLessThan(150);
    expect(Math.abs(result.denver[2] + 105)).toBeLessThan(0.4);
    expect(Math.abs(result.denver[3] - 39.7)).toBeLessThan(0.4);
    expect(result.kansas[0]).toBe("Kansas");
    expect(result.gulf[4]).toBe("sea");
    expect(result.superior[4]).toBe("lake surface");
    expect(result.sky).toBeNull();
  });

  test("the panel drives light, exaggeration, layers, tours and the image export", async ({ page }) => {
    // Reduced motion makes tours jump instead of fly, so nothing here depends on how fast the software renderer is.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const tour = page.locator("#tours").getByRole("button", { name: "Grand Canyon" });
    await page.locator("#hour").fill("12");
    await page.locator("#exag").fill("70");
    await page.getByLabel("State lines").check();
    await page.getByLabel("Exhibition hall").uncheck();
    await expect(page.locator("#hour-out")).toHaveText("12:00 pm");
    await expect(page.locator("#exag-out")).toHaveText("70x");
    await expect.poll(() => page.evaluate(() => { const i = window.__relief.info(); return [i.hour, i.exag, i.layers.borders, i.layers.hall]; })).toEqual([12, 70, true, false]);

    await tour.click();
    await expect(tour).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => Math.round(window.__relief.viewNow().dist))).toBeLessThan(200);

    await page.locator("#view").focus();
    await page.keyboard.press("l");
    await expect(page.locator("body")).toHaveClass(/no-labels/);
    await expect(page.getByLabel("Place names")).not.toBeChecked();
    await page.keyboard.press("l");
    await expect(page.locator(".lbl:not(.lbl-off)").first()).toBeVisible();

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Save image" }).click();
    expect((await download).suggestedFilename()).toBe("united-states-in-relief.png");

    await page.getByRole("button", { name: "Help" }).click();
    await expect(page.getByRole("dialog")).toContainText("How to move around");
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("fits a phone: the panel starts closed and nothing overflows", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await open(page);
    await expect(page.locator("#panel")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("#panel-toggle").click();
    await expect(page.locator("#panel")).toBeVisible();
    const box = await page.locator("#panel").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test("says so plainly when WebGL 2 is missing", async ({ page }) => {
    await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : get.call(this, type, ...rest); }; });
    await page.goto(`${PAGE}?q=low`);
    await expect(page.locator("#loading-text")).toContainText("needs WebGL 2");
  });

  test("@production the deployed relief map is this build and draws", async ({ page, request }) => {
    test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
    expect(stamp, "relief-map.html carries no build stamp").toBeTruthy();
    // Wait until the CDN serves this build rather than a cached copy of the last one.
    await expect
      .poll(async () => {
        const response = await request.get(`../relief-map.html?deployment-smoke=${Date.now()}`, { failOnStatusCode: false });
        return response.status() === 200 && (await response.text()).includes(`<meta name="relief-build" content="${stamp}">`);
      }, { timeout: 150_000, intervals: [1_000, 2_000, 5_000] })
      .toBe(true);
    const problems = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    await page.goto(`../relief-map.html?q=low&freeze=4&deployment-smoke=${Date.now()}`);
    test.skip(!(await hasWebGl2(page)), "this browser has no WebGL 2 context");
    await page.waitForFunction(() => (window.__relief && window.__relief.frames >= 4) || document.body.dataset.error, null, { timeout: 150_000 });
    expect(await page.evaluate(() => document.body.dataset.error ?? null)).toBeNull();
    expect(await page.evaluate(() => window.__relief.sample(-104.99, 39.74).state)).toBe("Colorado");
    expect(problems).toEqual([]);
  });
});
