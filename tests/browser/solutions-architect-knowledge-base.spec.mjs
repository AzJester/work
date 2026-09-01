import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const WORKSPACE_KEY = "solution_architect_workspace_v1";
const KNOWLEDGE_BASE_KEY = "solution_architect_knowledge_base_v1";

test.use({ serviceWorkers: "block" });

async function gotoFresh(page, route = "knowledge-base") {
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
}

async function openRoute(page, route) {
  await page.evaluate(value => { location.hash = value; }, route);
  await expect(page).toHaveURL(new RegExp(`#${route}$`));
  await expect(page.locator(`.stage-link[data-route="${route}"]`)).toHaveClass(/active/);
}

async function pageOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("Knowledge Base search, copy-on-use, revision, and explicit refresh stay solution-safe", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await gotoFresh(page);

  const navigation = page.getByRole("navigation", { name: "Solution workspace" });
  await expect(navigation.locator('[data-route="knowledge-base"] .label')).toHaveText("Knowledge base");
  await expect(page.getByRole("heading", { level: 3, name: "Knowledge base", exact: true })).toBeVisible();
  await expect(page.locator('[data-knowledge-count]')).toHaveText("1 of 1 items");

  const search = page.locator('[data-knowledge-filter="search"]');
  await search.fill("governed data exchange");
  await expect(page.locator("[data-knowledge-card]")).toBeVisible();
  await search.fill("no matching offering");
  await expect(page.locator("[data-knowledge-card]")).toBeHidden();
  await expect(page.locator("[data-knowledge-empty]")).toBeVisible();
  await page.locator("[data-knowledge-clear]").click();
  await expect(search).toHaveValue("");

  const card = page.locator("[data-knowledge-card]");
  await card.getByRole("button", { name: "Use in active solution", exact: true }).click();
  await expect(page.getByText(/was copied into .* for solution-specific assessment\./)).toBeVisible();
  await expect(card.getByRole("button", { name: "Open assessment", exact: true })).toBeVisible();
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
  await card.getByRole("button", { name: "Open assessment", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Refresh solution copy", exact: true })).toBeVisible();

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
  expect(beforeRefresh.candidate.description).toContain("Reference release 1.0");

  await openRoute(page, "assess");
  await expect(page.locator(".candidate-provenance.update-available")).toContainText("Update available · Solution copy revision 1 · Catalog revision 2");
  await openRoute(page, "knowledge-base");

  await page.getByRole("button", { name: "Refresh solution copy", exact: true }).click();
  await expect(page.getByText(/was refreshed\. Assessment scores and solution-specific status were preserved\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open assessment", exact: true })).toBeVisible();
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

test("an unreadable saved catalog is preserved until a valid backup is explicitly imported", async ({ page }) => {
  await gotoFresh(page);
  const validBackup = await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY);
  const unreadableSavedValue = '{"schema":"solution-knowledge-base-v2","schemaVersion":2,"privateFutureData":"KEEP-ME"}';
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KNOWLEDGE_BASE_KEY, unreadableSavedValue]);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("alert").filter({ hasText: "Saved catalog needs recovery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add item", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export catalog", exact: true })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), KNOWLEDGE_BASE_KEY)).toBe(unreadableSavedValue);

  await page.locator("#knowledge-import").setInputFiles({
    name: "solution-knowledge-base-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(validBackup)
  });
  await expect(page.getByText("1 Knowledge Base item imported.", { exact: true })).toBeVisible();
  await expect(page.locator(".knowledge-recovery")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add item", exact: true })).toBeEnabled();
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
  expect(Math.abs(desktop.title.width - desktop.status.width)).toBeLessThanOrEqual(1);
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
      titleContained: inside(title),
      titleWrap: getComputedStyle(title).overflowWrap,
      candidateContained: candidateCell ? inside(candidateCell) : false,
      candidateWrap: candidateCell ? getComputedStyle(candidateCell).overflowWrap : ""
    };
  }, longCandidateName);
  expect(longTextContainment).toEqual({ headerContained: true, titleContained: true, titleWrap: "anywhere", candidateContained: true, candidateWrap: "anywhere" });
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
