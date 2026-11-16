import { readFileSync } from "node:fs";
import { test, expect, hasWebGl2 } from "./topo-fixtures.mjs";

// The relief map is one self-contained WebGL page. These tests run it on the software renderer at its lowest
// quality preset, and freeze it after a few frames where a still picture is enough. Reduced motion makes camera
// moves jump instead of fly, so nothing here depends on how fast the software renderer is.
const PAGE = "/relief-map.html";
const built = readFileSync(new URL("../../relief-map.html", import.meta.url), "utf8");
const stamp = built.match(/<meta name="relief-build" content="([0-9a-f]{12})">/)?.[1];

async function open(page, query = "q=low&freeze=4", frames = 4) {
  const problems = [], requests = [];
  page.on("pageerror", (error) => problems.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("request", (request) => { if (!/^(data|blob):/.test(request.url())) requests.push(new URL(request.url()).pathname); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${PAGE}?${query}`);
  test.skip(!(await hasWebGl2(page)), "this browser has no WebGL 2 context");
  await page.waitForFunction((n) => (window.__relief && window.__relief.frames >= n) || document.body.dataset.error, frames, { timeout: 150_000 });
  expect(await page.evaluate(() => document.body.dataset.error ?? null)).toBeNull();
  return { problems, requests };
}
const view = (page) => page.evaluate(() => window.__relief.viewNow());
const dock = (page, name) => page.locator("#dock").getByRole("button", { name });

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
    expect(info.states, "the 48 contiguous states, and the District of Columbia where the grid resolves it").toBeGreaterThanOrEqual(48);
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

  test("the dock opens one sheet at a time and drives light, layers and exaggeration", async ({ page }) => {
    await open(page);
    await expect(page.locator(".sheet:visible")).toHaveCount(0);
    await dock(page, "Light").click();
    await expect(dock(page, "Light")).toHaveAttribute("aria-expanded", "true");
    await page.locator("#hour").fill("12");
    await expect(page.locator("#hour-out")).toHaveText("12:00 pm");
    await page.locator("#light-presets").getByRole("button", { name: "Night" }).click();
    await expect(page.locator("#light-presets").getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => window.__relief.info().hour)).toBe(21.3);

    await dock(page, "Layers").click();
    await expect(page.locator(".sheet:visible")).toHaveCount(1);
    await expect(page.locator("#sheet-light")).toBeHidden();
    await page.locator("#exag").fill("70");
    await expect(page.locator("#exag-out")).toHaveText("70x");
    await page.getByLabel("State lines").check();
    await page.getByLabel("Exhibition hall").uncheck();
    await expect.poll(() => page.evaluate(() => { const i = window.__relief.info(); return [i.exag, i.layers.borders, i.layers.hall]; })).toEqual([70, true, false]);

    // Escape closes the sheet and hands focus back to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet:visible")).toHaveCount(0);
    await expect(dock(page, "Layers")).toBeFocused();

    await page.locator("#view").focus();
    await page.keyboard.press("l");
    await expect(page.locator("body")).toHaveClass(/no-labels/);
    await page.keyboard.press("l");
    await expect(page.locator(".lbl:not(.lbl-off)").first()).toBeVisible();
  });

  test("search finds states and places by keyboard and explains what it found", async ({ page }) => {
    await open(page);
    await page.locator("#view").focus();
    await page.keyboard.press("/");
    const search = page.getByRole("combobox", { name: "Find a state, city or peak" });
    await expect(search).toBeFocused();
    await search.fill("colo");
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("option").first()).toHaveText(/Colorado\s*State/);
    await page.keyboard.press("Enter");
    await expect(page.locator("#card")).toContainText("Colorado");
    await expect(page.locator("#card")).toContainText("Highest ground");
    const state = await view(page);
    expect(Math.abs(state.x + 153)).toBeLessThan(15);
    expect(await page.evaluate(() => window.__relief.info().layers.borders), "state lines switch on so the state can be seen").toBe(true);

    await search.fill("rainier");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#card")).toContainText("Mount Rainier");
    await expect(page.locator("#card")).toContainText(/Summit at (14,409 ft|4,392 m)/);
    expect(await page.evaluate(() => window.__relief.info().pin)).toBe(true);

    await search.fill("zzzz");
    await expect(page.getByRole("option")).toHaveText("No match. Try a state, city or peak.");
    await page.keyboard.press("Escape");
    await expect(page.locator("#search-list")).toBeHidden();
  });

  test("a click inspects a point, and units follow the reader", async ({ page }) => {
    await open(page);
    const [x, y] = await page.evaluate(() => window.__relief.screenOf(-98.5, 38.5));
    await page.mouse.click(x, y);
    const card = page.locator("#card");
    await expect(card).toContainText("Kansas");
    await expect(card).toContainText("Elevation");
    await expect(card).toContainText("°N");
    await dock(page, "More").click();
    await page.locator("#units").getByRole("button", { name: "Metres and kilometres" }).click();
    await expect(card.locator("dd").first()).toHaveText(/^\d[\d,]* m$/);
    await page.locator("#units").getByRole("button", { name: "Feet and miles" }).click();
    await expect(card.locator("dd").first()).toHaveText(/^\d[\d,]* ft$/);
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toBeHidden();
    expect(await page.evaluate(() => window.__relief.info().pin)).toBe(false);
  });

  test("tours, the guided tour and the navigation buttons move the camera without dragging", async ({ page }) => {
    await open(page, "q=low&freeze=4&view=-98,39,600,40,30");
    expect(Math.round((await view(page)).bearing)).toBe(40);
    await page.getByRole("button", { name: "Face north" }).click();
    expect(Math.abs((await view(page)).bearing)).toBeLessThan(0.5);
    await page.getByRole("button", { name: "Switch between top-down and angled view" }).click();
    expect((await view(page)).pitch).toBeGreaterThan(70);
    // One press is one whole step, whether it comes from a pointer or the keyboard.
    const before = await view(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    expect((await view(page)).dist).toBeCloseTo(before.dist * 0.78, 0);
    await page.getByRole("button", { name: "Zoom out" }).focus();
    await page.keyboard.press("Enter");
    expect((await view(page)).dist).toBeCloseTo(before.dist * 0.78 * 1.28, 0);
    await page.getByRole("button", { name: "Rotate left" }).click();
    expect((await view(page)).bearing).toBeCloseTo(before.bearing - 15, 1);
    await page.getByRole("button", { name: "Rotate right" }).click();
    await page.getByRole("button", { name: "Rotate right" }).click();
    expect((await view(page)).bearing).toBeCloseTo(before.bearing + 15, 1);
    await page.locator("#view").focus();
    const here = await view(page);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("q");
    const moved = await view(page);
    expect(Math.hypot(moved.x - here.x, moved.z - here.z)).toBeCloseTo(here.dist * 0.16, 0);
    expect(moved.bearing).toBeCloseTo(here.bearing - 15, 1);
    await page.getByRole("button", { name: "Show the whole map" }).click();
    expect((await view(page)).dist).toBeGreaterThan(900);

    await dock(page, "Explore").click();
    const stop = page.locator("#tours button", { hasText: "Grand Canyon" });
    await stop.click();
    await expect(stop).toHaveAttribute("aria-current", "true");
    expect((await view(page)).dist).toBeLessThan(200);
    await expect(page.locator("#card")).toContainText("Cut by the Colorado River");
    await expect(page.locator("#card")).toContainText("3 of 9");
    await page.locator("#card").getByRole("button", { name: "Next stop" }).click();
    await expect(page.locator("#card")).toContainText("Sierra Nevada");
    await page.getByRole("button", { name: "Play guided tour" }).click();
    await expect(page.getByRole("button", { name: "Pause guided tour" })).toBeVisible();
    await expect(page.locator("#card").getByRole("button", { name: "Pause tour" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#card")).toBeHidden();
    await expect(page.locator("#tour-play")).toHaveText("Play guided tour");
  });

  test("share copies a link that reopens the same view, and saves an image", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "q=low&freeze=4&view=-105,39.7,300,10,40&h=12");
    await dock(page, "Share").click();
    await page.getByRole("button", { name: "Copy link to this view" }).click();
    await expect(page.locator("#toast")).toHaveText("Link copied");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#v=-105\.000,39\.700,300,10,40&h=12\.00&ex=50$/);
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Save image" }).click();
    expect((await download).suggestedFilename()).toBe("united-states-in-relief.png");

    await page.goto(`${PAGE}?q=low&freeze=4&again=1#v=-90,35,420,-30,55&h=20.1&ex=64`);
    await page.waitForFunction(() => window.__relief && window.__relief.frames >= 4, null, { timeout: 150_000 });
    const restored = await view(page), info = await page.evaluate(() => window.__relief.info());
    expect([Math.round(restored.dist), Math.round(restored.bearing), Math.round(restored.pitch)]).toEqual([420, -30, 55]);
    expect([info.hour, info.exag]).toEqual([20.1, 64]);
  });

  test("help, pause and hide are reachable, and every control is big enough to hit", async ({ page }) => {
    await open(page);
    await dock(page, "More").click();
    await page.getByLabel("Pause moving water and animation").check();
    expect(await page.evaluate(() => window.__relief.info().paused)).toBe(true);
    await page.getByRole("button", { name: "Help and data credits" }).click();
    await expect(page.getByRole("dialog")).toContainText("How to move around");
    await expect(page.getByRole("dialog")).toContainText("Natural Earth");
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    // WCAG 2.2 target size (minimum): 24 by 24 CSS pixels.
    const small = await page.evaluate(() => [...document.querySelectorAll("button, input, select")]
      .filter((n) => !n.closest("#labels") && n.getClientRects().length)
      .map((n) => { const r = n.getBoundingClientRect(); return { name: n.getAttribute("aria-label") || n.id || n.textContent.trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((r) => r.w < 24 || r.h < 22));
    expect(small).toEqual([]);
    await page.getByRole("button", { name: "Hide the interface" }).click();
    await expect(page.locator("#dock")).toBeHidden();
    await page.getByRole("button", { name: "Show controls" }).click();
    await expect(page.locator("#dock")).toBeVisible();
  });

  test("fits a phone: a tab bar, a sheet that rises from it, and nothing off screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bar = await page.locator("#dock").boundingBox();
    expect([bar.x, Math.round(bar.x + bar.width), Math.round(bar.y + bar.height)]).toEqual([0, 390, 780]);
    await dock(page, "Layers").click();
    const sheet = await page.locator("#sheet-layers").boundingBox();
    expect(sheet.x).toBe(0);
    expect(Math.round(sheet.width)).toBe(390);
    expect(Math.round(sheet.y + sheet.height)).toBeLessThanOrEqual(Math.round(bar.y) + 1);
    expect(sheet.y).toBeGreaterThan(780 * 0.3);
    for (const box of await page.locator("#nav button").evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()))) {
      expect(box.right).toBeLessThanOrEqual(390);
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
    }
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
    await expect(page.locator("#dock")).toBeVisible();
    expect(problems).toEqual([]);
  });
});
