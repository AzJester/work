import { test, expect } from "@playwright/test";
import { projectExportButton, projectImportInput, revealControl, undoButton, zoomControls } from "./helpers.mjs";

test("@production deployed GeoPresence release is healthy", async ({ page, request }) => {
  test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
  test.setTimeout(120_000);

  await expect
    .poll(async () => {
      const response = await request.get(`./?deployment-smoke=${Date.now()}`, { failOnStatusCode: false });
      return response.status();
    }, { timeout: 90_000, intervals: [1_000, 2_000, 5_000] })
    .toBe(200);

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(`./?deployment-smoke=${Date.now()}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/^Map Builder$/i);
  await expect(page.locator("#mapSvg")).toBeVisible();
  await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
  await expect(page.getByText("Map heading", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Standalone\s*(?:\u00c2)?\u00b7\s*No map service required/i);
  await expect(page.locator("body")).toContainText(/v3\.2\.0/i);

  await page.locator("#locationImportOpen").click();
  await expect(page.locator("#locationImportDialog")).toBeVisible();
  await expect(page.locator("#locationImportFile")).toHaveAttribute("accept", ".csv,text/csv");
  await page.locator("#locationImportClose").click();

  await revealControl(page, projectExportButton(page));
  await expect(projectImportInput(page)).toBeAttached();
  await expect(undoButton(page)).toBeAttached();
  await expect(zoomControls(page)).toHaveCount(4);
  expect(pageErrors).toEqual([]);
});
