import { test, expect } from "@playwright/test";
import {
  addCity,
  clickWithConfirmation,
  clearLocations,
  downloadBytes,
  ensureSampleLocations,
  gotoFresh,
  locationRows,
  projectExportButton,
  projectImportInput,
  revealControl,
  undoButton,
} from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  await gotoFresh(page);
});

test("clear and replace actions can be undone", async ({ page }) => {
  await ensureSampleLocations(page);
  const originalCount = await locationRows(page).count();
  expect(originalCount).toBeGreaterThan(0);

  await page.locator("#clearPins").click();
  await expect(page.locator("#confirmDialog[open]")).toBeVisible();
  await page.locator("#confirmCancel").click();
  await expect(locationRows(page)).toHaveCount(originalCount);

  await clearLocations(page);
  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();
  await expect(locationRows(page)).toHaveCount(originalCount);

  await addCity(page, { name: "Undo sentinel", state: "VA", city: "Alexandria" });
  await expect(locationRows(page)).toHaveCount(originalCount + 1);
  await clickWithConfirmation(page, page.getByRole("button", { name: /sample locations/i }));
  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();
  await expect(locationRows(page)).toHaveCount(originalCount + 1);
  await expect(page.locator("#pinList").getByText("Undo sentinel", { exact: true })).toBeVisible();
});

test("remove and reset actions can be undone", async ({ page }) => {
  await ensureSampleLocations(page);
  const originalCount = await locationRows(page).count();
  const removedName = (await page.locator("#pinList .pin-row strong").first().textContent()).trim();

  await clickWithConfirmation(page, page.locator("#pinList [data-remove]").first());
  await expect(locationRows(page)).toHaveCount(originalCount - 1);
  await undoButton(page).click();
  await expect(locationRows(page)).toHaveCount(originalCount);
  await expect(page.locator("#pinList").getByText(removedName, { exact: true })).toBeVisible();

  await (await revealControl(page, "#mapTitle")).fill("Before reset");
  await addCity(page, { name: "Reset sentinel", state: "VA", city: "Alexandria" });
  const beforeResetCount = await locationRows(page).count();
  await clickWithConfirmation(page, page.locator("#resetMap"));
  await expect(page.locator("#mapTitle")).not.toHaveValue("Before reset");
  await undoButton(page).click();
  await expect(page.locator("#mapTitle")).toHaveValue("Before reset");
  await expect(locationRows(page)).toHaveCount(beforeResetCount);
  await expect(page.locator("#pinList").getByText("Reset sentinel", { exact: true })).toBeVisible();
});

test("a project file round-trips all editable map data", async ({ page }) => {
  await ensureSampleLocations(page);
  await (await revealControl(page, "#mapTitle")).fill("Browser test project");
  await (await revealControl(page, "#mapSubtitle")).fill("Portable configuration");
  await (await revealControl(page, "#theme")).selectOption("dark");
  const originalCount = await locationRows(page).count();

  const { bytes, filename } = await downloadBytes(page, projectExportButton(page));
  expect(filename).toMatch(/\.json$/i);
  const project = JSON.parse(bytes.toString("utf8"));
  expect(project).toEqual(expect.any(Object));

  await clearLocations(page);
  await (await revealControl(page, "#mapTitle")).fill("Changed after export");
  await projectImportInput(page).setInputFiles({
    name: filename,
    mimeType: "application/json",
    buffer: bytes,
  });
  const importConfirmation = page.locator("#confirmDialog[open]");
  try {
    await importConfirmation.waitFor({ state: "visible", timeout: 2_000 });
    await page.locator("#confirmAccept").click();
  } catch {
    // Import may apply immediately when there is no current project to replace.
  }

  await expect(locationRows(page)).toHaveCount(originalCount);
  await expect(page.locator("#mapTitle")).toHaveValue("Browser test project");
  await expect(page.locator("#mapSubtitle")).toHaveValue("Portable configuration");
  await expect(page.locator("#theme")).toHaveValue("dark");
});
