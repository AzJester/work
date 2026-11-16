import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const APP_PATH = "../solutions-architect/";
const WORKSPACE_KEY = "solution_architect_workspace_v1";
const KNOWLEDGE_BASE_KEY = "solution_architect_knowledge_base_v1";

test.use({ serviceWorkers: "block" });

async function gotoFresh(page, route = "knowledge-base", { catalogMode = "single" } = {}) {
  const response = await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  if (response) expect(response.status()).toBe(200);
  await page.evaluate(async () => {
    localStorage.clear();
    if ("serviceWorker" in navigator) {
      for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    }
    if ("caches" in globalThis) {
      for (const name of await caches.keys()) await caches.delete(name);
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
  if (catalogMode === "single") {
    await page.evaluate(key => {
      const catalog = JSON.parse(localStorage.getItem(key));
      catalog.items = catalog.items.slice(0, 1);
      catalog.savedAt = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(catalog));
    }, KNOWLEDGE_BASE_KEY);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#workspace")).toBeVisible();
  }
}

async function openRoute(page, route) {
  await page.evaluate(value => { location.hash = value; }, route);
  await expect(page).toHaveURL(new RegExp(`#${route}$`));
  await expect(page.locator(`.stage-link[data-route="${route}"]`)).toHaveClass(/active/);
}

async function pageOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function knowledgeCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

async function setKnowledgeListFile(page, { name, mimeType, buffer }) {
  await page.locator("#knowledge-list-import").setInputFiles({ name, mimeType, buffer });
  await expect(page.getByRole("dialog", { name: "Review Knowledge Base import" })).toBeVisible();
}

async function downloadedBytes(download) {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path);
}

async function addCardOfferingToActiveSolution(page, card) {
  await card.getByRole("button", { name: "Add to solution…", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser).toBeVisible();
  await expect(chooser.locator("[data-offering-choice-check]:checked")).toHaveCount(1);
  await chooser.getByRole("button", { name: "Add 1 offering", exact: true }).click();
  await expect(chooser).toBeHidden();
  await expect(card.getByRole("button", { name: "Open active assessment", exact: true })).toBeVisible();
}

async function seedOfferingChooserCatalog(page) {
  await page.evaluate(key => {
    const catalog = JSON.parse(localStorage.getItem(key));
    const seed = catalog.items[0];
    const timestamp = new Date().toISOString();
    catalog.savedAt = timestamp;
    catalog.items = [
      {
        ...seed,
        id: "offering_chooser_current",
        name: "Current mission gateway",
        offeringType: "Platform",
        lifecycleStatus: "Current",
        summary: "Current reusable gateway offering for chooser coverage.",
        updatedAt: timestamp
      },
      {
        ...seed,
        id: "offering_chooser_emerging",
        name: "Emerging edge analytics",
        offeringType: "Software",
        lifecycleStatus: "Emerging",
        summary: "Emerging edge analytics offering for chooser coverage.",
        updatedAt: timestamp
      },
      {
        ...seed,
        id: "offering_chooser_legacy",
        name: "Legacy interface adapter",
        offeringType: "Application",
        lifecycleStatus: "Legacy",
        summary: "Legacy but active interface adapter for chooser coverage.",
        updatedAt: timestamp
      },
      {
        ...seed,
        id: "offering_chooser_archived",
        name: "Archived sensor bridge",
        offeringType: "Product",
        lifecycleStatus: "Retired",
        summary: "Archived offering that must never appear in the target-solution chooser.",
        updatedAt: timestamp
      }
    ];
    localStorage.setItem(key, JSON.stringify(catalog));
  }, KNOWLEDGE_BASE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

test("Knowledge Base toolbar exposes responsive templates, list import, JSON backup, and add controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page);

  const toolbar = page.locator(".knowledge-toolbar-actions");
  await expect(toolbar.getByRole("button", { name: "Templates", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Import list", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "JSON backup", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Create offering", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Add to solution", exact: true })).toBeVisible();

  await toolbar.getByRole("button", { name: "Templates", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Knowledge Base import templates" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Name is the only required value");
  await expect(dialog).toContainText("Separate capabilities, mission segments, and tags with semicolons or line breaks.");

  const [excelDownload] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("link", { name: "Download Excel template", exact: true }).click()
  ]);
  expect(excelDownload.suggestedFilename()).toBe("solution-knowledge-base-import-template.xlsx");
  const excelBytes = await downloadedBytes(excelDownload);
  expect(excelBytes.length).toBeGreaterThan(5_000);
  expect(excelBytes.subarray(0, 2).toString("ascii")).toBe("PK");

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download CSV template", exact: true }).click()
  ]);
  expect(csvDownload.suggestedFilename()).toBe("solution-knowledge-base-import-template.csv");
  const csvBytes = await downloadedBytes(csvDownload);
  expect(csvBytes.subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]));
  const csvText = csvBytes.toString("utf8");
  expect(csvText).toContain("Catalog ID,Expected Revision,Name,Offering Type");
  expect(csvText.trim().split(/\r?\n/)).toHaveLength(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
  const dialogBounds = await dialog.evaluate(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, viewport: document.documentElement.clientWidth };
  });
  expect(dialogBounds.left).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.right).toBeLessThanOrEqual(dialogBounds.viewport + 1);
  expect(dialogBounds.width).toBeGreaterThan(300);
});

test("the provided 28 offerings are a permanent reusable catalog for every new browser", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page, "knowledge-base", { catalogMode: "bundled" });

  await expect(page.locator("[data-knowledge-card]")).toHaveCount(28);
  await expect(page.locator("[data-knowledge-count]")).toHaveText("28 of 28 items");
  for (const name of ["PULSE", "ASGARD", "Program Atlas", "Space Maneuver SIL/HWIL"]) {
    await expect(page.getByRole("heading", { level: 3, name, exact: true })).toBeVisible();
  }
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KNOWLEDGE_BASE_KEY);
  expect(stored.items).toHaveLength(28);
  expect(stored.items.every(item => !Object.hasOwn(item, "solutionId"))).toBe(true);
});

test("valid UTF-8 CSV is previewed before one atomic Knowledge Base save", async ({ page }) => {
  await gotoFresh(page);
  const before = await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY);
  const beforeCatalog = JSON.parse(before);
  const csv = knowledgeCsv(
    ["Name", "Offering Type", "Provider / Owner", "Version / Release", "Lifecycle Status", "Summary", "Capabilities", "Tags"],
    [["Field Integration Toolkit", "Software", "Synthetic Engineering Group", "2.4", "Current", "Reusable unclassified integration-planning toolkit.", "Interface mapping; Verification planning", "integration; reusable"]]
  );

  await setKnowledgeListFile(page, {
    name: "knowledge-offerings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8")
  });
  const preview = page.getByRole("dialog", { name: "Review Knowledge Base import" });
  await expect(preview).toContainText("UTF-8 CSV");
  await expect(preview.locator(".knowledge-import-counts")).toContainText(/New\s*1/);
  await expect(preview).toContainText("Field Integration Toolkit");
  expect(await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY)).toBe(before);

  await preview.getByRole("button", { name: "Apply 1 change", exact: true }).click();
  await expect(page.getByText("1 offering added. Existing solution copies were not changed.", { exact: true })).toBeVisible();
  const imported = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KNOWLEDGE_BASE_KEY);
  expect(imported.items).toHaveLength(beforeCatalog.items.length + 1);
  expect(imported.items.at(-1)).toMatchObject({
    name: "Field Integration Toolkit",
    offeringType: "Software",
    provider: "Synthetic Engineering Group",
    version: "2.4",
    capabilities: ["Interface mapping", "Verification planning"],
    tags: ["integration", "reusable"],
    revision: 1
  });
});

test("invalid CSV keeps the catalog byte-for-byte unchanged and blocks Apply on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoFresh(page);
  const before = await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY);
  const csv = knowledgeCsv(
    ["Name", "Offering Type", "Technology Readiness Level"],
    [["Invalid readiness example", "Application", "99"]]
  );

  await setKnowledgeListFile(page, {
    name: "invalid-knowledge-offerings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8")
  });
  const preview = page.getByRole("dialog", { name: "Review Knowledge Base import" });
  await expect(preview.locator(".knowledge-import-counts")).toContainText(/Errors\s*1/);
  await expect(preview.locator("[data-knowledge-list-apply]")).toBeDisabled();
  await expect(preview.getByRole("status")).toContainText("must be corrected");
  await expect(preview).toContainText("trl must be 1-9 or null");
  expect(await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY)).toBe(before);
  await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
});

test("repository-bundled SheetJS imports a valid Solutions worksheet", async ({ page }) => {
  await gotoFresh(page);
  const beforeCount = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).items.length, KNOWLEDGE_BASE_KEY);
  const workbookBase64 = await page.evaluate(() => {
    const rows = [
      ["Name", "Offering Type", "Provider / Owner", "Version / Release", "Lifecycle Status", "Summary", "Capabilities"],
      ["Mission Data Adapter", "Application", "Synthetic Mission Systems", "3.1", "Current", "Normalizes approved unclassified mission data exchanges.", "Data translation; Interface monitoring"]
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Solutions");
    return XLSX.write(workbook, { type: "base64", bookType: "xlsx", compression: true });
  });

  await setKnowledgeListFile(page, {
    name: "knowledge-offerings.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbookBase64, "base64")
  });
  const preview = page.getByRole("dialog", { name: "Review Knowledge Base import" });
  await expect(preview).toContainText("Excel · Solutions");
  await expect(preview).toContainText("Mission Data Adapter");
  await preview.getByRole("button", { name: "Apply 1 change", exact: true }).click();

  const imported = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KNOWLEDGE_BASE_KEY);
  expect(imported.items).toHaveLength(beforeCount + 1);
  expect(imported.items.at(-1)).toMatchObject({
    name: "Mission Data Adapter",
    offeringType: "Application",
    provider: "Synthetic Mission Systems",
    capabilities: ["Data translation", "Interface monitoring"]
  });
});

test("explicit upsert requires ID, revision, and change summary and never auto-refreshes a solution copy", async ({ page }) => {
  await gotoFresh(page);
  const card = page.locator("[data-knowledge-card]").first();
  await addCardOfferingToActiveSolution(page, card);
  await expect(page.getByText(/1 offering added to/)).toBeVisible();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  const seeded = await page.evaluate(([workspaceKey, catalogKey]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    const item = catalog.items[0];
    const candidate = workspace.candidates.find(record => record.catalogSource?.itemId === item.id);
    return { item, candidate };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY]);
  expect(seeded.candidate).toBeTruthy();

  const updatedSummary = "Updated catalog facts supplied through an explicit spreadsheet upsert.";
  const csv = knowledgeCsv(
    ["Catalog ID", "Expected Revision", "Name", "Summary", "Change Summary"],
    [[seeded.item.id, seeded.item.revision, seeded.item.name, updatedSummary, "Reviewed spreadsheet update for browser coverage."]]
  );
  await setKnowledgeListFile(page, {
    name: "knowledge-upsert.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8")
  });
  let preview = page.getByRole("dialog", { name: "Review Knowledge Base import" });
  await expect(preview.locator("[data-knowledge-list-apply]")).toBeDisabled();
  await expect(preview).toContainText("can only be updated in upsert mode");

  await preview.getByRole("radio", { name: /Add new and update by Catalog ID/ }).check();
  preview = page.getByRole("dialog", { name: "Review Knowledge Base import" });
  await expect(preview.locator(".knowledge-import-counts")).toContainText(/Updated\s*1/);
  await preview.getByRole("button", { name: "Apply 1 change", exact: true }).click();

  const after = await page.evaluate(([workspaceKey, catalogKey, itemId, candidateId]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    return {
      item: catalog.items.find(record => record.id === itemId),
      candidate: workspace.candidates.find(record => record.id === candidateId)
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY, seeded.item.id, seeded.candidate.id]);
  expect(after.item.revision).toBe(seeded.item.revision + 1);
  expect(after.item.summary).toBe(updatedSummary);
  expect(after.item.changeSummary).toBe("Reviewed spreadsheet update for browser coverage.");
  expect(after.candidate.catalogSource.revision).toBe(seeded.candidate.catalogSource.revision);
  expect(after.candidate.description).toBe(seeded.candidate.description);
});

test("Knowledge Base search, copy-on-use, revision, and explicit refresh stay solution-safe", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page);

  const navigation = page.getByRole("navigation", { name: "Solution workspace" });
  await expect(navigation.locator('[data-route="knowledge-base"] .label')).toHaveText("Knowledge base");
  await expect(page.getByRole("heading", { level: 3, name: "Knowledge base", exact: true })).toBeVisible();
  await expect(page.locator('[data-knowledge-count]')).toHaveText("1 of 1 items");
  const filterStatus = page.locator("[data-knowledge-filter-status]");
  await expect(filterStatus).toHaveAttribute("role", "status");
  await expect(filterStatus).toHaveAttribute("aria-live", "polite");
  await expect(filterStatus).toHaveText("1 of 1 Knowledge Base items match the current filters.");

  const search = page.locator('[data-knowledge-filter="search"]');
  await expect(search).toHaveAttribute("aria-controls", "knowledge-results-grid");
  await expect(search).toHaveAttribute("aria-describedby", "knowledge-filter-status");
  await search.fill("systems engineering");
  await expect(page.locator("[data-knowledge-card]")).toBeVisible();
  await search.fill("no matching offering");
  await expect(filterStatus).toHaveText("0 of 1 Knowledge Base items match the current filters.");
  await expect(page.locator("[data-knowledge-card]")).toBeHidden();
  await expect(page.locator("[data-knowledge-empty]")).toBeVisible();
  await page.locator("[data-knowledge-clear]").click();
  await expect(search).toHaveValue("");
  await expect(filterStatus).toHaveText("1 of 1 Knowledge Base items match the current filters.");

  const card = page.locator("[data-knowledge-card]");
  await addCardOfferingToActiveSolution(page, card);
  await expect(page.getByText(/1 offering added to/)).toBeVisible();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const firstCopy = await page.evaluate(([workspaceKey, catalogKey]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    const candidate = workspace.candidates.find(record => record.catalogSource?.itemId === catalog.items[0].id);
    return { activeSolutionId: workspace.activeSolutionId, catalogRevision: catalog.items[0].revision, candidate };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY]);
  expect(firstCopy.candidate.solutionId).toBe(firstCopy.activeSolutionId);
  expect(firstCopy.candidate.catalogSource.revision).toBe(firstCopy.catalogRevision);
  expect(firstCopy.candidate.status).toBe("Considering");

  const candidateId = firstCopy.candidate.id;
  await openRoute(page, "assess");
  await expect(page).toHaveURL(/#assess$/);
  await expect(page.locator(".candidate-provenance")).toContainText("Knowledge Base copy · Catalog revision 1");
  const candidateStatus = page.locator(`[data-record-collection="candidates"][data-record-id="${candidateId}"][data-record-field="status"]`);
  await candidateStatus.selectOption("Shortlist");
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  await openRoute(page, "knowledge-base");
  await page.locator("[data-knowledge-edit]").click();
  const editor = page.getByRole("dialog", { name: "Update solution offering" });
  await editor.getByLabel("Version / release").fill("Reference release 2.0");
  await editor.getByLabel("Change summary").fill("Updated reusable integration facts for browser coverage.");
  await editor.getByRole("button", { name: "Save new revision", exact: true }).click();
  await expect(page.getByText("Knowledge Base revision saved. Existing solution copies were not changed.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-knowledge-card]")).toContainText("Revision 2");
  await expect(page.getByRole("button", { name: "Refresh active copy", exact: true })).toBeVisible();

  const beforeRefresh = await page.evaluate(([workspaceKey, catalogKey, id]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    return {
      catalogRevision: catalog.items[0].revision,
      candidate: workspace.candidates.find(record => record.id === id),
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY, candidateId]);
  expect(beforeRefresh.catalogRevision).toBe(2);
  expect(beforeRefresh.candidate.catalogSource.revision).toBe(1);
  expect(beforeRefresh.candidate.status).toBe("Shortlist");
  expect(beforeRefresh.candidate.description).not.toContain("Reference release 2.0");

  await openRoute(page, "assess");
  await expect(page.locator(".candidate-provenance.update-available")).toContainText("Update available · Solution copy revision 1 · Catalog revision 2");
  await openRoute(page, "knowledge-base");

  await page.getByRole("button", { name: "Refresh active copy", exact: true }).click();
  await expect(page.getByText(/was refreshed\. Assessment scores and solution-specific status were preserved\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open active assessment", exact: true })).toBeVisible();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const refreshed = await page.evaluate(([workspaceKey, id]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    return workspace.candidates.find(record => record.id === id);
  }, [WORKSPACE_KEY, candidateId]);
  expect(refreshed.id).toBe(candidateId);
  expect(refreshed.solutionId).toBe(firstCopy.activeSolutionId);
  expect(refreshed.catalogSource.revision).toBe(2);
  expect(refreshed.status).toBe("Shortlist");
  expect(refreshed.description).toContain("Reference release 2.0");
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

test("permanent Knowledge Base offerings can be batch-copied independently into multiple target opportunities", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page, "assess");
  await seedOfferingChooserCatalog(page);

  const original = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    const solution = workspace.solutions.find(item => item.id === workspace.activeSolutionId);
    return { id: solution.id, name: solution.name };
  }, WORKSPACE_KEY);
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click();
  await page.getByRole("button", { name: "Create a new solution", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Create a solution workspace" });
  await createDialog.getByLabel("Solution name", { exact: true }).fill("Second target opportunity");
  await createDialog.getByRole("button", { name: "Create solution", exact: true }).click();
  const second = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    const solution = workspace.solutions.find(item => item.id === workspace.activeSolutionId);
    return { id: solution.id, name: solution.name };
  }, WORKSPACE_KEY);
  expect(second.id).not.toBe(original.id);

  await page.locator("#solution-select").selectOption(original.id);
  await expect(page.locator("#solution-select")).toHaveValue(original.id);
  await openRoute(page, "assess");
  const addOfferings = page.getByRole("button", { name: "Add offerings", exact: true });
  await expect(addOfferings).toBeVisible();
  await addOfferings.click();

  let chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser).toBeVisible();
  const target = chooser.locator("[data-offering-target-solution]");
  await expect(target.locator("option")).toHaveCount(2);
  await expect(target).toHaveValue(original.id);
  await target.selectOption(second.id);
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser.locator("[data-offering-target-solution]")).toHaveValue(second.id);
  await expect(chooser.locator("[data-offering-chooser-status]")).toContainText("3 active offerings");
  await expect(chooser.locator("[data-offering-choice]")).toHaveCount(3);
  await expect(chooser).toContainText("Current mission gateway");
  await expect(chooser).toContainText("Emerging edge analytics");
  await expect(chooser).toContainText("Legacy interface adapter");
  await expect(chooser).not.toContainText("Archived sensor bridge");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).activeSolutionId, WORKSPACE_KEY)).toBe(original.id);

  const search = chooser.getByLabel("Search offerings", { exact: true });
  await search.fill("edge analytics");
  await expect(chooser.locator("[data-offering-choice]:visible")).toHaveCount(1);
  const edgeOffering = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_emerging"]');
  await edgeOffering.locator("[data-offering-choice-check]").check();
  await expect(edgeOffering.locator(".offering-choice-state")).toHaveText("Selected");

  await search.fill("mission gateway");
  const gatewayOffering = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_current"]');
  await expect(gatewayOffering).toBeVisible();
  await gatewayOffering.locator("[data-offering-choice-check]").check();
  await expect(chooser.getByRole("button", { name: "Add 2 offerings", exact: true })).toBeEnabled();
  await chooser.getByRole("button", { name: "Add 2 offerings", exact: true }).click();
  await expect(chooser).toBeHidden();
  await expect(page.getByText("2 offerings added to Second target opportunity.", { exact: true })).toBeVisible();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const afterBatch = await page.evaluate(([workspaceKey, originalId, secondId]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalogCopies = workspace.candidates.filter(candidate => candidate.catalogSource?.itemId);
    return {
      activeSolutionId: workspace.activeSolutionId,
      originalCopies: catalogCopies.filter(candidate => candidate.solutionId === originalId),
      secondCopies: catalogCopies.filter(candidate => candidate.solutionId === secondId)
    };
  }, [WORKSPACE_KEY, original.id, second.id]);
  expect(afterBatch.activeSolutionId).toBe(original.id);
  expect(afterBatch.originalCopies).toHaveLength(0);
  expect(afterBatch.secondCopies.map(candidate => candidate.catalogSource.itemId).sort()).toEqual([
    "offering_chooser_current",
    "offering_chooser_emerging"
  ]);

  await openRoute(page, "knowledge-base");
  const gatewayCard = page.locator('[data-knowledge-card][data-knowledge-search*="current mission gateway"]');
  await gatewayCard.getByRole("button", { name: "Add to solution…", exact: true }).click();
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  let gatewayChoice = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_current"]');
  await expect(gatewayChoice.locator("[data-offering-choice-check]")).toBeChecked();
  await chooser.locator("[data-offering-target-solution]").selectOption(second.id);
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  gatewayChoice = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_current"]');
  await expect(gatewayChoice.locator("[data-offering-choice-check]")).toBeDisabled();
  await expect(gatewayChoice.locator(".offering-choice-state")).toHaveText("Already added");
  await chooser.locator("[data-offering-target-solution]").selectOption(original.id);
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  gatewayChoice = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_current"]');
  await expect(gatewayChoice.locator("[data-offering-choice-check]")).toBeChecked();
  await chooser.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openRoute(page, "assess");

  await addOfferings.click();
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await chooser.getByLabel("Search offerings", { exact: true }).fill("edge analytics");
  await chooser.locator("[data-offering-target-solution]").selectOption(second.id);
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser.getByLabel("Search offerings", { exact: true })).toHaveValue("edge analytics");
  let existingCopy = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_emerging"]');
  await expect(existingCopy.locator("[data-offering-choice-check]")).toBeDisabled();
  await expect(existingCopy.locator(".offering-choice-state")).toHaveText("Already added");

  await chooser.locator("[data-offering-target-solution]").selectOption(original.id);
  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser.getByLabel("Search offerings", { exact: true })).toHaveValue("edge analytics");
  existingCopy = chooser.locator('[data-offering-choice][data-offering-id="offering_chooser_emerging"]');
  await expect(existingCopy.locator("[data-offering-choice-check]")).toBeEnabled();
  await existingCopy.locator("[data-offering-choice-check]").check();
  await chooser.getByRole("button", { name: "Add 1 offering", exact: true }).click();
  await expect(page.getByText(`1 offering added to ${original.name}.`, { exact: true })).toBeVisible();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const reused = await page.evaluate(([workspaceKey, itemId, originalId, secondId]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const copies = workspace.candidates.filter(candidate => candidate.catalogSource?.itemId === itemId);
    return {
      activeSolutionId: workspace.activeSolutionId,
      original: copies.filter(candidate => candidate.solutionId === originalId),
      second: copies.filter(candidate => candidate.solutionId === secondId)
    };
  }, [WORKSPACE_KEY, "offering_chooser_emerging", original.id, second.id]);
  expect(reused.activeSolutionId).toBe(original.id);
  expect(reused.original).toHaveLength(1);
  expect(reused.second).toHaveLength(1);
  expect(reused.original[0].id).not.toBe(reused.second[0].id);
});

test("the offering chooser creates a reusable offering, returns it for selection, and stays light and phone-contained", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoFresh(page, "assess");
  await seedOfferingChooserCatalog(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Add offerings", exact: true }).click();
  let chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser).toBeVisible();
  await expect(chooser.locator("[data-offering-target-solution]")).toHaveValue(await page.locator("#solution-select").inputValue());
  await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
  const chooserBounds = await chooser.evaluate(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: document.documentElement.clientWidth };
  });
  expect(chooserBounds.left).toBeGreaterThanOrEqual(0);
  expect(chooserBounds.right).toBeLessThanOrEqual(chooserBounds.viewport + 1);
  const touchTargetHeights = await chooser.locator("button.button:visible").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
  expect(touchTargetHeights.length).toBeGreaterThanOrEqual(3);
  for (const height of touchTargetHeights) expect(height).toBeGreaterThanOrEqual(44);

  await chooser.getByRole("button", { name: "Create new offering", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add solution offering" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Name", { exact: true }).fill("New operator planning service");
  await editor.getByRole("combobox", { name: "Offering type", exact: true }).selectOption("Service");
  await editor.getByLabel("Summary", { exact: true }).fill("Reusable planning support created directly in the permanent catalog.");
  await editor.getByRole("button", { name: "Add to Knowledge Base", exact: true }).click();

  chooser = page.getByRole("dialog", { name: "Add offerings to a solution" });
  await expect(chooser).toBeVisible();
  await chooser.getByLabel("Search offerings", { exact: true }).fill("operator planning service");
  const newOffering = chooser.locator("[data-offering-choice]", { hasText: "New operator planning service" });
  await expect(newOffering).toBeVisible();
  await expect(newOffering.locator("[data-offering-choice-check]")).toBeChecked();
  await expect(newOffering.locator(".offering-choice-state")).toHaveText("Selected");

  const beforeAdd = await page.evaluate(([workspaceKey, catalogKey, name]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    const item = catalog.items.find(record => record.name === name);
    return {
      item,
      copyCount: workspace.candidates.filter(candidate => candidate.solutionId === workspace.activeSolutionId && candidate.catalogSource?.itemId === item?.id).length
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY, "New operator planning service"]);
  expect(beforeAdd.item).toMatchObject({ offeringType: "Service", lifecycleStatus: "Current", revision: 1 });
  expect(beforeAdd.copyCount).toBe(0);

  await chooser.getByRole("button", { name: "Add 1 offering", exact: true }).click();
  await expect(chooser).toBeHidden();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  const afterAdd = await page.evaluate(([workspaceKey, itemId]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    return workspace.candidates.filter(candidate => candidate.solutionId === workspace.activeSolutionId && candidate.catalogSource?.itemId === itemId).length;
  }, [WORKSPACE_KEY, beforeAdd.item.id]);
  expect(afterAdd).toBe(1);
  await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
});

test("Knowledge Base archive and restore are confirmed, persisted, and unavailable offerings stay out of active work", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page);

  const statusFilter = page.locator('[data-knowledge-filter="status"]');
  const card = page.locator("[data-knowledge-card]");
  await expect(statusFilter).toHaveValue("active");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Archive offering", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Delete permanently", exact: true })).toHaveCount(0);

  await addCardOfferingToActiveSolution(page, card);
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  const before = await page.evaluate(([workspaceKey, catalogKey]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    return {
      item: catalog.items[0],
      candidate: workspace.candidates.find(record => record.catalogSource?.itemId === catalog.items[0].id)
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY]);
  expect(before.candidate).toBeTruthy();

  await card.getByRole("button", { name: "Archive offering", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Archive solution offering" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Existing solution copies");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)).items[0].lifecycleStatus, KNOWLEDGE_BASE_KEY))).toBe("Current");

  await card.getByRole("button", { name: "Archive offering", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Archive solution offering" });
  await dialog.getByRole("button", { name: "Archive offering", exact: true }).click();
  await expect(card).toBeHidden();
  await expect(statusFilter).toBeFocused();
  await expect(page.locator("[data-knowledge-count]")).toContainText("0 of 1");
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-knowledge-filter="status"]')).toHaveValue("active");
  await expect(page.locator("[data-knowledge-card]")).toBeHidden();
  await page.locator('[data-knowledge-filter="status"]').selectOption("archived");
  const archivedCard = page.locator("[data-knowledge-card]");
  await expect(archivedCard).toBeVisible();
  await expect(archivedCard).toContainText("Archived");
  await expect(archivedCard.getByRole("button", { name: "Restore offering", exact: true })).toBeVisible();
  await expect(archivedCard.getByRole("button", { name: "Delete permanently", exact: true })).toBeVisible();
  await expect(archivedCard.getByRole("button", { name: "Add to solution…", exact: true })).toHaveCount(0);
  await expect(archivedCard.getByRole("button", { name: "Refresh active copy", exact: true })).toHaveCount(0);

  await archivedCard.getByRole("button", { name: "Restore offering", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Restore solution offering" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Restore as").selectOption("Emerging");
  await dialog.getByRole("button", { name: "Restore offering", exact: true }).click();
  await expect(archivedCard).toBeHidden();
  await expect(page.locator('[data-knowledge-filter="status"]')).toBeFocused();
  await page.locator('[data-knowledge-filter="status"]').selectOption("active");
  await expect(page.locator("[data-knowledge-card]")).toBeVisible();

  const after = await page.evaluate(([workspaceKey, catalogKey, itemId, candidateId]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    return {
      item: catalog.items.find(record => record.id === itemId),
      candidate: workspace.candidates.find(record => record.id === candidateId)
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY, before.item.id, before.candidate.id]);
  expect(after.item.lifecycleStatus).toBe("Emerging");
  expect(after.item.revision).toBe(before.item.revision + 2);
  expect(after.candidate).toEqual(before.candidate);
});

test("permanent offering deletion requires archival and the exact offering name while preserving solution copies", async ({ page }) => {
  await gotoFresh(page);
  let card = page.locator("[data-knowledge-card]");
  const offeringName = (await card.getByRole("heading", { level: 3 }).textContent()).trim();
  await expect(card.getByRole("button", { name: "Delete permanently", exact: true })).toHaveCount(0);

  await addCardOfferingToActiveSolution(page, card);
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  const ids = await page.evaluate(([workspaceKey, catalogKey]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    const itemId = catalog.items[0].id;
    return {
      itemId,
      candidateId: workspace.candidates.find(record => record.catalogSource?.itemId === itemId).id
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY]);

  await card.getByRole("button", { name: "Archive offering", exact: true }).click();
  await page.getByRole("dialog", { name: "Archive solution offering" }).getByRole("button", { name: "Archive offering", exact: true }).click();
  await page.locator('[data-knowledge-filter="status"]').selectOption("archived");
  card = page.locator("[data-knowledge-card]");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Add to solution…", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Refresh active copy", exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: "Delete permanently", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete solution offering permanently" });
  const confirmation = dialog.getByLabel("Type the offering name to confirm");
  const deleteButton = dialog.getByRole("button", { name: "Delete permanently", exact: true });
  await expect(dialog).toContainText(/existing solution cop/i);
  await expect(deleteButton).toBeDisabled();
  await confirmation.fill(`${offeringName} `);
  await expect(deleteButton).toBeDisabled();
  await confirmation.fill(offeringName);
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(page.locator("[data-knowledge-card]")).toHaveCount(0);
  await expect(page.locator('[data-knowledge-filter="status"]')).toBeFocused();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const persisted = await page.evaluate(([workspaceKey, catalogKey, itemId, candidateId]) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const catalog = JSON.parse(localStorage.getItem(catalogKey));
    return {
      catalogHasItem: catalog.items.some(record => record.id === itemId),
      candidate: workspace.candidates.find(record => record.id === candidateId)
    };
  }, [WORKSPACE_KEY, KNOWLEDGE_BASE_KEY, ids.itemId, ids.candidateId]);
  expect(persisted.catalogHasItem).toBe(false);
  expect(persisted.candidate.catalogSource.itemId).toBe(ids.itemId);

  await openRoute(page, "assess");
  await expect(page.locator(".candidate-provenance")).toContainText("Source item is not present in this browser");
});

test("an unreadable saved catalog is preserved until a valid backup is explicitly imported", async ({ page }) => {
  await gotoFresh(page);
  const validBackup = await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY);
  const unreadableSavedValue = '{"schema":"solution-knowledge-base-v2","schemaVersion":2,"privateFutureData":"KEEP-ME"}';
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KNOWLEDGE_BASE_KEY, unreadableSavedValue]);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("alert").filter({ hasText: "Saved catalog needs recovery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create offering", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add to solution", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Import list", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "JSON backup", exact: true }).click();
  const backupDialog = page.getByRole("dialog", { name: "Knowledge Base backup and restore" });
  await expect(backupDialog).toContainText("Recovery required");
  await expect(backupDialog.getByRole("button", { name: "Download JSON backup", exact: true })).toBeDisabled();
  await expect(backupDialog.getByRole("button", { name: "Choose JSON backup", exact: true })).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY)).toBe(unreadableSavedValue);

  await page.locator("#knowledge-import").setInputFiles({
    name: "solution-knowledge-base-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(validBackup)
  });
  await expect(page.getByText("1 Knowledge Base item imported.", { exact: true })).toBeVisible();
  await expect(page.locator(".knowledge-recovery")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create offering", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add to solution", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Import list", exact: true })).toBeEnabled();
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY)).schema).toBe("solution-knowledge-base-v1");
});

test("Mission fields and Customer hot-button cards remain evenly aligned and phone-readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page, "discover");

  const missionControls = await page.locator(".form-panel .form-grid > .field").evaluateAll(labels => labels.slice(0, 4).map(label => {
    const control = label.querySelector("input, select, textarea");
    const box = control.getBoundingClientRect();
    return { label: label.querySelector("span")?.textContent, top: box.top, height: box.height };
  }));
  expect(missionControls.map(control => control.label)).toEqual(["Solution name", "Customer / mission partner", "Current working stage", "Domain"]);
  expect(Math.abs(missionControls[0].top - missionControls[1].top)).toBeLessThanOrEqual(1);
  expect(Math.abs(missionControls[2].top - missionControls[3].top)).toBeLessThanOrEqual(1);
  for (const control of missionControls) expect(control.height).toBeGreaterThanOrEqual(48);

  const desktop = await page.locator(".hot-button-panel").evaluate(panel => {
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const card = panel.querySelector(".hot-button-card");
    const actions = [...panel.querySelectorAll(".hot-button-actions .small-button")].map(rect);
    return {
      panel: rect(panel),
      actions,
      title: rect(card.querySelector(".hot-button-title textarea")),
      remove: rect(card.querySelector(".hot-button-card-heading .delete-record")),
      source: rect(card.querySelector('.hot-button-source input')),
      confidence: rect(card.querySelector('[data-record-field="confidence"]')),
      validation: rect(card.querySelector('[data-record-field="status"]')),
      detail: rect(card.querySelector('.hot-button-detail textarea')),
    };
  });
  expect(desktop.actions).toHaveLength(2);
  expect(Math.abs(desktop.actions[0].width - desktop.actions[1].width)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktop.actions[0].height - desktop.actions[1].height)).toBeLessThanOrEqual(1);
  for (const action of desktop.actions) {
    expect(action.left).toBeGreaterThanOrEqual(desktop.panel.left - 1);
    expect(action.right).toBeLessThanOrEqual(desktop.panel.right + 1);
    expect(action.height).toBeGreaterThanOrEqual(44);
  }
  expect(desktop.title.right).toBeLessThanOrEqual(desktop.remove.left);
  expect(Math.abs(desktop.source.width - desktop.detail.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktop.confidence.width - desktop.validation.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktop.confidence.top - desktop.validation.top)).toBeLessThanOrEqual(1);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, "discover");
  const phone = await page.locator(".hot-button-panel").evaluate(panel => {
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const card = panel.querySelector(".hot-button-card");
    return {
      actions: [...panel.querySelectorAll(".hot-button-actions .small-button")].map(rect),
      source: rect(card.querySelector('.hot-button-source input')),
      confidence: rect(card.querySelector('[data-record-field="confidence"]')),
      validation: rect(card.querySelector('[data-record-field="status"]')),
      detail: rect(card.querySelector('.hot-button-detail textarea')),
    };
  });
  expect(Math.abs(phone.actions[0].width - phone.actions[1].width)).toBeLessThanOrEqual(1);
  for (const action of phone.actions) expect(action.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(phone.source.width - phone.confidence.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(phone.source.width - phone.validation.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(phone.source.width - phone.detail.width)).toBeLessThanOrEqual(1);
  expect(phone.source.bottom).toBeLessThanOrEqual(phone.confidence.top);
  expect(phone.confidence.bottom).toBeLessThanOrEqual(phone.validation.top);
  expect(phone.validation.bottom).toBeLessThanOrEqual(phone.detail.top);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

test("optional Analysis of Alternatives stays legible, contained, and responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFresh(page, "prove");

  const analysis = page.locator(".aoa-editor-card").first();
  await expect(analysis).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Analysis of Alternatives", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add analysis", exact: true })).toBeVisible();
  const desktop = await analysis.evaluate(card => {
    const field = label => [...card.querySelectorAll(".aoa-form-grid label")].find(node => node.querySelector(":scope > span")?.textContent.trim() === label)?.querySelector("input, select, textarea");
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, fontSize: Number.parseFloat(getComputedStyle(node).fontSize) };
    };
    return {
      card: rect(card),
      title: rect(field("Analysis title")),
      status: rect(field("Status")),
      objective: rect(field("Decision objective")),
      owner: rect(field("Owner")),
      recommendation: rect(field("Recommendation")),
      controls: [...card.querySelectorAll(".aoa-form-grid input, .aoa-form-grid select, .aoa-form-grid textarea")].map(rect),
    };
  });
  expect(Math.abs(desktop.title.top - desktop.status.top)).toBeLessThanOrEqual(1);
  expect(desktop.title.width).toBeGreaterThan(desktop.status.width * 2);
  expect(desktop.status.width).toBeGreaterThanOrEqual(220);
  expect(desktop.objective.width).toBeGreaterThan(desktop.owner.width * 1.8);
  expect(desktop.recommendation.width).toBeGreaterThan(desktop.owner.width * 1.8);
  for (const control of desktop.controls) {
    expect(control.left).toBeGreaterThanOrEqual(desktop.card.left - 1);
    expect(control.right).toBeLessThanOrEqual(desktop.card.right + 1);
    expect(control.fontSize).toBeGreaterThanOrEqual(15);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

  const longAnalysisTitle = "A".repeat(280);
  const longCandidateName = "B".repeat(280);
  await analysis.getByLabel("Analysis title", { exact: true }).fill(longAnalysisTitle);
  await openRoute(page, "assess");
  await page.locator('[data-record-collection="candidates"][data-record-field="name"]').fill(longCandidateName);
  await openRoute(page, "prove");
  const longTextContainment = await page.locator(".aoa-editor-card").first().evaluate((card, candidateName) => {
    const header = card.querySelector(".aoa-card-header");
    const title = header.querySelector("h4");
    const candidateCell = [...card.querySelectorAll(".aoa-comparison td")].find(cell => cell.textContent.includes(candidateName));
    const inside = node => {
      const box = node.getBoundingClientRect();
      const parent = card.getBoundingClientRect();
      return box.left >= parent.left - 1 && box.right <= parent.right + 1;
    };
    return {
      headerContained: inside(header),
      headerContentContained: header.scrollWidth <= header.clientWidth + 1,
      titleContained: inside(title),
      titleWrap: getComputedStyle(title).overflowWrap,
      candidateContained: candidateCell ? inside(candidateCell) : false,
      candidateContentContained: candidateCell ? candidateCell.scrollWidth <= candidateCell.clientWidth + 1 : false,
      candidateWrap: candidateCell ? getComputedStyle(candidateCell).overflowWrap : "",
      headerWraps: [...card.querySelectorAll(".aoa-comparison th")].every(node => getComputedStyle(node).overflowWrap === "anywhere")
    };
  }, longCandidateName);
  expect(longTextContainment).toEqual({
    headerContained: true,
    headerContentContained: true,
    titleContained: true,
    titleWrap: "anywhere",
    candidateContained: true,
    candidateContentContained: true,
    candidateWrap: "anywhere",
    headerWraps: true
  });
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, "prove");
  const phone = await page.locator(".aoa-editor-card").first().evaluate(card => {
    const field = label => [...card.querySelectorAll(".aoa-form-grid label")].find(node => node.querySelector(":scope > span")?.textContent.trim() === label)?.querySelector("input, select, textarea");
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, fontSize: Number.parseFloat(getComputedStyle(node).fontSize) };
    };
    const cells = [...card.querySelectorAll(".aoa-comparison tbody td")];
    return {
      card: rect(card),
      title: rect(field("Analysis title")),
      status: rect(field("Status")),
      controls: [...card.querySelectorAll(".aoa-form-grid input, .aoa-form-grid select, .aoa-form-grid textarea")].map(rect),
      cells: cells.map(node => ({ label: node.dataset.label, before: getComputedStyle(node, "::before").content })),
    };
  });
  expect(phone.title.bottom).toBeLessThanOrEqual(phone.status.top);
  expect(Math.abs(phone.title.width - phone.status.width)).toBeLessThanOrEqual(1);
  for (const control of phone.controls) {
    expect(control.left).toBeGreaterThanOrEqual(phone.card.left - 1);
    expect(control.right).toBeLessThanOrEqual(phone.card.right + 1);
    expect(control.fontSize).toBeGreaterThanOrEqual(16);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
  expect(phone.cells.length).toBeGreaterThan(0);
  for (const cell of phone.cells) {
    expect(cell.label).toBeTruthy();
    expect(cell.before).not.toBe("none");
    expect(cell.before).not.toBe('""');
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});
