import { expect } from "@playwright/test";

export const APP_PATH = "./";

export function locationRows(page) {
  return page.locator("#pinList .pin-row");
}

export function undoButton(page) {
  return page
    .locator("#undoAction, #undoButton, [data-action='undo']")
    .or(page.getByRole("button", { name: /undo/i }))
    .first();
}

export function projectExportButton(page) {
  return page
    .locator("#projectExport, #exportProject, [data-action='export-project']")
    .or(page.getByRole("button", { name: /(?:save|download|export) project/i }))
    .first();
}

export function projectImportInput(page) {
  return page
    .locator("#projectImport, #importProject, #importProjectInput, input[type='file'][accept*='json']")
    .first();
}

export function zoomControls(page) {
  return page.locator(
    "#previewZoomIn, #previewZoomOut, #previewFit, #previewFullscreen, " +
      "[data-action='zoom-in'], [data-action='zoom-out'], [data-action='zoom-fit'], [data-action='fullscreen']",
  );
}

export async function revealControl(page, selectorOrLocator) {
  const control = typeof selectorOrLocator === "string" ? page.locator(selectorOrLocator) : selectorOrLocator;
  const section = control.locator("xpath=ancestor::details[1]");
  if ((await section.count()) && !(await section.evaluate(element => element.open))) {
    await section.locator(":scope > summary").click();
  }
  await expect(control).toBeVisible();
  return control;
}

export async function gotoFresh(page) {
  await page.goto(APP_PATH, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mapSvg")).toBeVisible();
  await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
  await expect(page.locator("#mapStatus")).not.toContainText(/loading/i);
}

export async function ensureSampleLocations(page) {
  if ((await locationRows(page).count()) > 0) return;
  await clickWithConfirmation(page, page.getByRole("button", { name: /sample locations/i }));
  await expect.poll(() => locationRows(page).count()).toBeGreaterThan(0);
}

export async function clearLocations(page) {
  const clear = page.locator("#clearPins");
  if (await clear.isEnabled()) await clickWithConfirmation(page, clear);
  await expect(locationRows(page)).toHaveCount(0);
}

export async function clickWithConfirmation(page, trigger) {
  await trigger.click();
  const confirmation = page.locator("#confirmDialog[open]");
  try {
    await confirmation.waitFor({ state: "visible", timeout: 1_000 });
    await page.locator("#confirmAccept").click();
  } catch {
    // Some non-destructive or empty-state actions do not require confirmation.
  }
}

export async function downloadBytes(page, trigger) {
  const visibleTrigger = await revealControl(page, trigger);
  const [download] = await Promise.all([page.waitForEvent("download"), visibleTrigger.click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { bytes: Buffer.concat(chunks), filename: download.suggestedFilename() };
}

export function pngDimensions(bytes) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function pngCornerAlpha(page, bytes) {
  return page.evaluate(async encoded => {
    const raw = atob(encoded);
    const data = Uint8Array.from(raw, character => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, 1, 1).data[3];
  }, bytes.toString("base64"));
}

export async function addCity(page, { name, state, city, type = "hub" }) {
  await page.locator("#pinName").fill(name);
  await page.locator("#pinAnchorKind").selectOption("city");
  await page.locator("#pinState").selectOption(state);
  await page.locator("#pinCity").fill(city);
  const results = page.locator("#cityResults [role='option']");
  if (await results.count()) {
    const exact = results.filter({ hasText: new RegExp(`^${city}(?:\\s|·|$)`, "i") }).first();
    await (await exact.count() ? exact : results.first()).click();
  }
  await page.locator("#pinType").selectOption(type);
  await page.locator("#savePin").click();
  await expect(page.locator("#pinList").getByText(name, { exact: true })).toBeVisible();
}
