import { test, expect } from "@playwright/test";
import {
  addCity,
  downloadBytes,
  gotoFresh,
  locationRows,
  undoButton,
} from "./helpers.mjs";

const CSV_HEADERS = [
  "name",
  "state",
  "type",
  "source",
  "city",
  "city_geoid",
  "installation",
  "installation_id",
];

const VALID_CSV = [
  `\uFEFF${CSV_HEADERS.join(",")}`,
  `"Arlington, ""Virginia"" Headquarters",VA,headquarters,city,Arlington,5103000,,`,
  `Redstone Contract,AL,contract,installation,,,Redstone Arsenal,dod-fid-986`,
  "",
].join("\r\n");

async function openLocationImport(page) {
  const trigger = page.locator("#locationImportOpen");
  await trigger.click();
  const dialog = page.locator("#locationImportDialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function stageCsv(page, text, name = "locations.csv") {
  await stageCsvBytes(page, Buffer.from(text, "utf8"), name);
}

async function stageCsvBytes(page, buffer, name = "locations.csv") {
  await page.locator("#locationImportFile").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer,
  });
  await expect(page.locator("#locationImportPreview")).not.toContainText(/Checking/i);
}

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
  ));
}

test.beforeEach(async ({ page }) => {
  await gotoFresh(page);
});

test("location upload dialog explains the CSV contract and downloads its template", async ({ page }) => {
  const trigger = page.locator("#locationImportOpen");
  await trigger.focus();
  const dialog = await openLocationImport(page);

  await expect(dialog).toHaveAttribute("aria-labelledby", "locationImportTitle");
  await expect(dialog).toHaveAttribute("aria-describedby", "locationImportDescription");
  await expect(page.getByRole("heading", { name: "Upload locations" })).toBeVisible();
  await expect(page.locator("#locationImportDescription")).toContainText(/UTF-8 CSV \(\.csv\)/i);

  const fileInput = page.getByLabel("Choose a CSV file");
  await expect(fileInput).toHaveAttribute("type", "file");
  await expect(fileInput).toHaveAttribute("accept", /(?:\.csv.*text\/csv|text\/csv.*\.csv)/i);
  await expect(fileInput).toBeFocused();

  const append = page.getByRole("radio", { name: "Add to current locations" });
  const replace = page.getByRole("radio", { name: "Replace current locations" });
  await expect(append).toBeChecked();
  await expect(replace).not.toBeChecked();

  await page.getByText("File requirements", { exact: true }).click();
  const requirements = page.locator(".import-requirements");
  for (const header of ["name", "state", "type", "source", "city_geoid", "installation_id"]) {
    await expect(requirements.locator("code", { hasText: new RegExp(`^${header}$`) })).toHaveCount(1);
  }
  for (const type of [
    "headquarters", "regional", "hub", "contract", "future", "program",
    "operations", "customer", "partner", "test", "manufacturing",
  ]) {
    await expect(requirements.locator(".import-codes code", { hasText: new RegExp(`^${type}$`) })).toHaveCount(1);
  }

  const { bytes, filename } = await downloadBytes(page, "#locationImportTemplate");
  expect(filename).toBe("map-builder-location-template.csv");
  const template = bytes.toString("utf8");
  expect(template.split(/\r?\n/, 1)[0]).toBe(CSV_HEADERS.join(","));
  expect(template).toContain("Huntsville Regional Headquarters,AL,regional,city");
  expect(template).toContain("Redstone Arsenal Contract,AL,contract,installation");

  await fileInput.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("a BOM and CRLF CSV stages then appends resolved city and installation rows as one undoable batch", async ({ page }) => {
  const beforeStorage = await storageSnapshot(page);
  const beforeMarkers = await page.locator("#mapSvg .site-marker").count();
  await openLocationImport(page);
  await stageCsv(page, VALID_CSV);

  await expect(page.locator("#locationImportPreview")).toContainText("2 valid locations");
  await expect(page.locator("#locationImportErrors")).toBeHidden();
  await expect(page.locator("#locationImportApply")).toBeEnabled();
  await expect(page.locator("#locationImportApply")).toHaveText("Add 2 locations");
  await expect(locationRows(page)).toHaveCount(0);
  expect(await page.locator("#mapSvg .site-marker").count()).toBe(beforeMarkers);
  expect(await storageSnapshot(page)).toEqual(beforeStorage);

  await page.locator("#locationImportApply").click();
  await expect(page.locator("#confirmDialog")).not.toBeVisible();
  await expect(page.locator("#locationImportDialog")).not.toBeVisible();
  await expect(locationRows(page)).toHaveCount(2);
  await expect(page.locator("#pinList strong").filter({ hasText: 'Arlington, "Virginia" Headquarters' })).toHaveCount(1);
  await expect(page.locator("#pinList")).toContainText("GEOID 5103000");
  await expect(page.locator("#pinList")).toContainText("Redstone Arsenal");
  await expect(page.locator("#pinList")).toContainText("Contract site");
  await expect(page.locator('#mapSvg [data-anchor-id="place:5103000"] [data-location-type="headquarters"]')).toHaveCount(1);
  await expect(page.locator('#mapSvg [data-anchor-id="dod-fid-986"] [data-location-type="contract"]')).toHaveCount(1);

  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();
  await expect(locationRows(page)).toHaveCount(0);
  await expect(page.locator("#mapSvg .site-marker")).toHaveCount(beforeMarkers);
});

test("one invalid row makes the entire staged CSV atomic and actionable", async ({ page }) => {
  await addCity(page, { name: "Import sentinel", state: "VA", city: "Alexandria", type: "hub" });
  const beforeStorage = await storageSnapshot(page);
  const invalidCsv = [
    CSV_HEADERS.join(","),
    "Would otherwise be valid,VA,hub,city,Arlington,5103000,,",
    ",VA,hub,city,Arlington,5103000,,",
    "Bad state,ZZ,hub,city,Arlington,,,",
    "Bad type,VA,spaceship,city,Arlington,5103000,,",
  ].join("\r\n");

  await openLocationImport(page);
  await stageCsv(page, invalidCsv);

  const errors = page.locator("#locationImportErrors");
  await expect(errors).toBeVisible();
  await expect(errors).toContainText("Row 3: name is required");
  await expect(errors).toContainText("Row 4: state must be a valid two-letter state/DC code");
  await expect(errors).toContainText('Row 5: type "spaceship" is not supported');
  await expect(page.locator("#locationImportPreview")).toContainText("Nothing has been imported");
  await expect(page.locator("#locationImportApply")).toBeDisabled();
  await expect(locationRows(page)).toHaveCount(1);
  await expect(page.locator("#pinList")).toContainText("Import sentinel");
  await expect(page.locator("#pinList")).not.toContainText("Would otherwise be valid");
  expect(await storageSnapshot(page)).toEqual(beforeStorage);
});

test("duplicate normalized headers are rejected without changing the map", async ({ page }) => {
  const beforeStorage = await storageSnapshot(page);
  const duplicateHeaders = [
    `${CSV_HEADERS.join(",")}, Name `,
    "Duplicate header row,VA,hub,city,Arlington,5103000,,,ignored",
  ].join("\r\n");

  await openLocationImport(page);
  await stageCsv(page, duplicateHeaders);

  await expect(page.locator("#locationImportErrors")).toContainText('Header "name" appears more than once');
  await expect(page.locator("#locationImportApply")).toBeDisabled();
  await expect(locationRows(page)).toHaveCount(0);
  expect(await storageSnapshot(page)).toEqual(beforeStorage);
});

test("invalid UTF-8 bytes are rejected instead of being imported as replacement characters", async ({ page }) => {
  const beforeStorage = await storageSnapshot(page);
  const invalidUtf8 = Buffer.concat([
    Buffer.from(`${CSV_HEADERS.join(",")}\r\n"Invalid `, "utf8"),
    Buffer.from([0xc3, 0x28]),
    Buffer.from('",VA,hub,city,Arlington,5103000,,\r\n', "utf8"),
  ]);

  await openLocationImport(page);
  await stageCsvBytes(page, invalidUtf8, "invalid-utf8.csv");

  await expect(page.locator("#locationImportErrors")).toBeVisible();
  await expect(page.locator("#locationImportErrors")).toContainText(/UTF-8/i);
  await expect(page.locator("#locationImportPreview")).toContainText("Nothing has been imported");
  await expect(page.locator("#locationImportApply")).toBeDisabled();
  await expect(locationRows(page)).toHaveCount(0);
  expect(await storageSnapshot(page)).toEqual(beforeStorage);
});

test("a stale slow file read cannot overwrite a newer file selection", async ({ page }) => {
  await page.evaluate(() => {
    window.__locationImportReadCompletions = [];
    for (const method of ["text", "arrayBuffer"]) {
      const original = Blob.prototype[method];
      Blob.prototype[method] = function (...args) {
        const result = original.apply(this, args);
        const fileName = this.name;
        const delay = fileName === "slow.csv" ? 350 : 0;
        return new Promise((resolve, reject) => {
          setTimeout(() => Promise.resolve(result).then(value => {
            window.__locationImportReadCompletions.push(fileName);
            resolve(value);
          }, reject), delay);
        });
      };
    }
  });

  const slowCsv = [
    CSV_HEADERS.join(","),
    "Stale Arlington,VA,headquarters,city,Arlington,5103000,,",
    "",
  ].join("\r\n");
  const fastCsv = [
    CSV_HEADERS.join(","),
    "Current Redstone,AL,contract,installation,,,Redstone Arsenal,dod-fid-986",
    "",
  ].join("\r\n");

  await openLocationImport(page);
  await page.locator("#locationImportFile").setInputFiles({
    name: "slow.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(slowCsv, "utf8"),
  });
  await page.locator("#locationImportFile").setInputFiles({
    name: "fast.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(fastCsv, "utf8"),
  });

  await expect(page.locator("#locationImportPreview")).toContainText("fast.csv is ready");
  await expect.poll(() => page.evaluate(() => window.__locationImportReadCompletions.includes("slow.csv"))).toBeTruthy();
  await expect(page.locator("#locationImportPreview")).toContainText("fast.csv is ready");
  await expect(page.locator("#locationImportApply")).toHaveText("Add 1 location");

  await page.locator("#locationImportApply").click();
  await expect(locationRows(page)).toHaveCount(1);
  await expect(page.locator("#pinList")).toContainText("Current Redstone");
  await expect(page.locator("#pinList")).not.toContainText("Stale Arlington");
  await expect(page.locator('#mapSvg [data-anchor-id="dod-fid-986"]')).toHaveCount(1);
  await expect(page.locator('#mapSvg [data-anchor-id="place:5103000"]')).toHaveCount(0);
});

test("replace remains unchanged through cancellation, then replaces and undoes as one batch", async ({ page }) => {
  await addCity(page, { name: "Replace sentinel", state: "VA", city: "Alexandria", type: "hub" });
  await openLocationImport(page);
  await stageCsv(page, VALID_CSV);
  await page.getByRole("radio", { name: "Replace current locations" }).check();
  await expect(page.locator("#locationImportApply")).toHaveText("Replace with 2 locations");

  const beforeConfirmation = await storageSnapshot(page);
  await page.locator("#locationImportApply").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await expect(page.locator("#confirmTitle")).toHaveText("Replace locations");
  await expect(page.locator("#confirmMessage")).toHaveText("Replace 1 current location with 2 imported locations?");
  await expect(locationRows(page)).toHaveCount(1);
  await expect(page.locator("#pinList")).toContainText("Replace sentinel");
  expect(await storageSnapshot(page)).toEqual(beforeConfirmation);

  await page.locator("#confirmCancel").click();
  await expect(page.locator("#confirmDialog")).not.toBeVisible();
  await expect(page.locator("#locationImportDialog")).toBeVisible();
  await expect(page.locator("#locationImportApply")).toBeFocused();
  await expect(locationRows(page)).toHaveCount(1);
  expect(await storageSnapshot(page)).toEqual(beforeConfirmation);

  await page.locator("#locationImportApply").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmAccept").click();
  await expect(locationRows(page)).toHaveCount(2);
  await expect(page.locator("#pinList")).not.toContainText("Replace sentinel");
  await expect(page.locator("#pinList")).toContainText('Arlington, "Virginia" Headquarters');
  await expect(page.locator("#pinList")).toContainText("Redstone Contract");

  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();
  await expect(locationRows(page)).toHaveCount(1);
  await expect(page.locator("#pinList")).toContainText("Replace sentinel");
  await expect(page.locator("#pinList")).not.toContainText("Redstone Contract");
});

for (const width of [320, 400]) {
  test(`location upload dialog remains accessible and contained at ${width}px`, async ({ page }) => {
    const height = 720;
    await page.setViewportSize({ width, height });
    const dialog = await openLocationImport(page);
    await page.getByText("File requirements", { exact: true }).click();

    const layout = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.rect.left).toBeGreaterThanOrEqual(-1);
    expect(layout.rect.right).toBeLessThanOrEqual(width + 1);
    expect(layout.rect.top).toBeGreaterThanOrEqual(-1);
    expect(layout.rect.bottom).toBeLessThanOrEqual(height + 1);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 1);

    const controls = dialog.locator("summary, input:not([type='hidden']), button");
    for (let index = 0; index < await controls.count(); index += 1) {
      const control = controls.nth(index);
      if (!(await control.isVisible())) continue;
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box, `control ${index} has layout geometry`).not.toBeNull();
      expect(box.x, `control ${index} starts inside the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `control ${index} ends inside the viewport`).toBeLessThanOrEqual(width + 1);
      expect(box.y, `control ${index} can be scrolled into view`).toBeGreaterThanOrEqual(-1);
      expect(box.y + box.height, `control ${index} can be fully reached`).toBeLessThanOrEqual(height + 1);
    }

    await expect(page.getByLabel("Choose a CSV file")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Add to current locations" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Replace current locations" })).toBeVisible();
    await expect(page.locator("#locationImportPreview")).toHaveAttribute("role", "status");
    await expect(page.locator("#locationImportErrors")).toHaveAttribute("role", "alert");
  });
}
