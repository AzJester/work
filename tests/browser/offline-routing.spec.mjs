import { test, expect } from "@playwright/test";

test("offline GeoPresence navigation never falls back to the tracker shell", async ({ page, context, baseURL }) => {
  const appUrl = new URL(baseURL);
  const repositoryRoot = new URL("../", appUrl);
  const trackerUrl = new URL("tracker.html", repositoryRoot);
  const serviceWorkerUrl = new URL("sw.js", repositoryRoot);
  const scopeUrl = new URL("./", repositoryRoot);

  await page.goto(trackerUrl.href, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    async ({ scriptURL, scope }) => {
      const registration = await navigator.serviceWorker.register(scriptURL, { scope });
      await registration.update();
      await navigator.serviceWorker.ready;
    },
    { scriptURL: serviceWorkerUrl.href, scope: scopeUrl.pathname },
  );

  // Reload once so the root-scoped worker controls the page. GeoPresence has
  // not been visited yet, so this verifies the complete precached app shell.
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

  await context.setOffline(true);
  try {
    const uncachedRoute = new URL(`?offline-route=${Date.now()}`, appUrl);
    await page.goto(uncachedRoute.href, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#mapSvg")).toBeVisible();
    await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
    await expect(page).toHaveTitle(/^Map Builder$/i);
    await expect(page.locator("body")).not.toContainText("Weekly Task Tracker");

    const noTrailingSlash = new URL(`geopresence?offline-route=${Date.now()}`, repositoryRoot);
    await page.goto(noTrailingSlash.href, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
    await expect(page.locator("body")).not.toContainText("Weekly Task Tracker");
  } finally {
    await context.setOffline(false);
  }
});
