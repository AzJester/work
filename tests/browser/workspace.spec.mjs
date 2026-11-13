import { test, expect } from "@playwright/test";
import { addCity, clickWithConfirmation, gotoFresh, locationRows } from "./helpers.mjs";

const box = (page, selector) => page.locator(selector).boundingBox();

for (const [width, height] of [[1440, 900], [1280, 720]]) {
  test(`the map and the add form are both in view at ${width}x${height} without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoFresh(page);
    await page.evaluate(() => document.fonts.ready);

    const [map, preview, rail, name, state, city] = await Promise.all([
      box(page, "#mapSvg"), box(page, ".preview-panel"), box(page, ".rail"), box(page, "#pinName"), box(page, "#pinState"), box(page, "#pinCity"),
    ]);
    expect(map.y + map.height, "the whole map is above the fold").toBeLessThanOrEqual(height);
    expect(map.y, "the map starts near the top").toBeLessThan(260);
    for (const [label, field] of [["name", name], ["state", state], ["city", city]]) {
      expect(field.y + field.height, `the ${label} field is above the fold`).toBeLessThanOrEqual(height);
    }
    expect(preview.x + preview.width, "the map sits to the left of the rail").toBeLessThanOrEqual(rail.x);
    expect(map.width, "the map takes most of the window").toBeGreaterThan(width * 0.55);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}

test("the map stays in view while the rail scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoFresh(page);
  await page.locator("#projectSettings").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY), "the page did scroll").toBeGreaterThan(200);
  const map = await box(page, "#mapSvg");
  expect(map.y, "map top is still on screen").toBeGreaterThanOrEqual(0);
  expect(map.y + map.height, "map bottom is still on screen").toBeLessThanOrEqual(900);
});

test("on a phone the map comes first and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoFresh(page);
  const [map, add, list, settings] = await Promise.all([box(page, "#mapSvg"), box(page, ".add-panel"), box(page, ".locations-panel"), box(page, ".controls")]);
  expect(map.y).toBeLessThan(add.y);
  expect(add.y).toBeLessThan(list.y);
  expect(list.y).toBeLessThan(settings.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await expect(page.locator(".quick-nav")).toBeVisible();
});

test("Undo is always on the page, works by button and by Ctrl+Z, and clears its saved snapshot", async ({ page }) => {
  await gotoFresh(page);
  const undo = page.locator("#undoButton");
  await expect(undo).toBeVisible();
  await expect(undo).toBeDisabled();

  await addCity(page, { name: "First", state: "VA", city: "Arlington" });
  await addCity(page, { name: "Second", state: "VA", city: "Alexandria" });
  await expect(locationRows(page)).toHaveCount(2);
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute("title", /Undo: Location addition/);

  await undo.click();
  await expect(locationRows(page)).toHaveCount(1);
  await expect(undo, "the earlier change is still reachable after one undo").toBeEnabled();

  await page.locator("#locationsTitle").focus();
  await page.keyboard.press("Control+z");
  await expect(locationRows(page)).toHaveCount(0);
  await expect(undo).toBeDisabled();

  // Nothing is left to undo, so a reload must not offer a stale recovery.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
  await expect(page.locator("#undoButton")).toBeDisabled();
  await expect(page.locator("#toast")).toBeHidden();
});

test("Ctrl+Z inside a text field edits the text, not the map", async ({ page }) => {
  await gotoFresh(page);
  await addCity(page, { name: "Keep me", state: "VA", city: "Arlington" });
  await page.locator("#pinName").fill("typing");
  await page.keyboard.press("Control+z");
  await expect(locationRows(page)).toHaveCount(1);
});

test("adding a location keeps the state, source and type for the next one", async ({ page }) => {
  await gotoFresh(page);
  await addCity(page, { name: "Contract one", state: "VA", city: "Arlington", type: "contract" });
  await expect(page.locator("#pinState")).toHaveValue("VA");
  await expect(page.locator("#pinType")).toHaveValue("contract");
  await expect(page.locator("#pinAnchorKind")).toHaveValue("city");
  await expect(page.locator("#pinName")).toHaveValue("");
  await expect(page.locator("#pinCity")).toHaveValue("");

  // Typing Enter in a field adds the location and returns the cursor to the name field.
  await page.locator("#pinCity").fill("Alexandria");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.locator("#pinName").fill("Contract two");
  await page.keyboard.press("Enter");
  await expect(locationRows(page)).toHaveCount(2);
  await expect(page.locator("#pinName")).toBeFocused();
  await expect(page.locator("#pinState")).toHaveValue("VA");
});

test("leaving the city field closes its list", async ({ page }) => {
  await gotoFresh(page);
  await page.locator("#pinState").selectOption("VA");
  const city = page.locator("#pinCity");
  await city.fill("Arl");
  await expect(city).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#cityResults")).toBeVisible();
  await expect(page.locator("#cityResults")).toHaveAttribute("aria-label", /cities/i);

  await page.keyboard.press("Tab");
  await expect(city).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#cityResults")).toBeHidden();
  await expect(city).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.id), "focus moved on to a control, not into the list").not.toBe("cityResults");
});

test("the sample button says what it will do", async ({ page }) => {
  await gotoFresh(page);
  const samples = page.locator("#loadSamples");
  await expect(samples).toHaveText("Load sample locations");
  await clickWithConfirmation(page, samples);
  await expect.poll(() => locationRows(page).count()).toBeGreaterThan(0);
  await expect(samples).toHaveText("Replace with sample locations");
});

test("full screen uses the whole window", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoFresh(page);
  await page.locator("#previewFullscreen").click();
  const dialog = await box(page, "#previewDialog");
  const map = await box(page, "#fullscreenMap svg");
  expect(dialog.width).toBeGreaterThan(1440 * 0.95);
  expect(map.height, "the map is as tall as the window allows").toBeGreaterThan(700);
  expect(map.y + map.height).toBeLessThanOrEqual(900);
});

test("zooming in lets the map grow past the window and scroll inside its stage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoFresh(page);
  const fitted = await box(page, "#mapSvg");
  await page.locator("#previewZoomIn").click();
  await page.locator("#previewZoomIn").click();
  const zoomed = await box(page, "#mapSvg");
  expect(zoomed.width, "150% really is larger").toBeGreaterThan(fitted.width * 1.4);
  expect(zoomed.height).toBeGreaterThan(fitted.height * 1.4);
  await page.locator("#previewFit").click();
  expect((await box(page, "#mapSvg")).width).toBeCloseTo(fitted.width, 0);
});

test("panels, buttons and fields share the brand's single corner radius", async ({ page }) => {
  await gotoFresh(page);
  const radii = await page.evaluate(() => {
    const selectors = [".panel", ".btn", "main input:not([type=checkbox]):not([type=radio]):not([type=color]):not(.sr-only)", "main select", "dialog", ".toast"];
    return [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(element => getComputedStyle(element).borderTopLeftRadius)))];
  });
  expect(radii).toEqual(["4px"]);
});

test("on a short window the map does not pin itself and its footer can be reached", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 560 });
  await gotoFresh(page);
  expect(await page.locator(".preview-panel").evaluate(element => getComputedStyle(element).position)).toBe("static");
  await page.locator(".hint").scrollIntoViewIfNeeded();
  const hint = await box(page, ".hint");
  expect(hint.y + hint.height, "the reference note can be scrolled into view").toBeLessThanOrEqual(560);
});

test("a location row keeps its name and actions on one line with details below", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoFresh(page);
  await addCity(page, { name: "Mountain Regional Headquarters", state: "CO", city: "Colorado Springs", type: "regional" });
  const row = page.locator("#pinList .pin-row").first();
  const [name, details, edit, remove] = await Promise.all([
    row.locator("strong").boundingBox(), row.locator("small").boundingBox(), row.locator("[data-edit]").boundingBox(), row.locator("[data-remove]").boundingBox(),
  ]);
  const middle = rect => rect.y + rect.height / 2;
  expect(Math.abs(middle(name) - middle(edit)), "name and Edit share a line").toBeLessThan(10);
  expect(Math.abs(middle(edit) - middle(remove))).toBeLessThan(2);
  expect(details.y, "details sit below the name").toBeGreaterThanOrEqual(name.y + name.height - 1);
  expect(details.x + details.width, "details use the width under the buttons").toBeGreaterThan(edit.x);
  expect(details.height, "details take at most two lines").toBeLessThanOrEqual(36);
});
