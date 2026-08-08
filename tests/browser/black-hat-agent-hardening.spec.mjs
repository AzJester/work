import { test, expect } from "@playwright/test";

const APP_PATH = "../black-hat-agent/";

test("mobile navigation, URL history, and responsive visuals work together", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(APP_PATH, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  await expect(page.locator("#workspace-sidebar")).not.toHaveClass(/\bopen\b/);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator("#workspace-sidebar")).toHaveClass(/\bopen\b/);
  await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();

  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Command Center", exact: true })
    .click();
  await expect(page).toHaveURL(/#command$/);
  await expect(page.locator("#workspace-sidebar")).not.toHaveClass(/\bopen\b/);
  await expect(page.getByRole("heading", { name: "Joint Multi-Domain T&E Support" })).toBeVisible();
  await expect(page.locator(".chart-card")).toHaveCount(3);
  await expect(page.locator(".chart-card svg[role='img']")).toHaveCount(3);

  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goBack();
  await expect(page).toHaveURL(/#portfolio$/);
  await expect(page.getByRole("heading", { name: "Evidence-grounded competitive analysis." })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("forms protect unsaved work and reports export their saved visuals", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${APP_PATH}#criteria`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  const addCriterion = page.getByRole("button", { name: "Add criterion", exact: true });
  await addCriterion.click();
  const dialog = page.getByRole("dialog", { name: "Add criterion" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Criterion name")).toBeFocused();
  await dialog.getByLabel("Criterion name").fill("Uncommitted criterion");
  await expect(page.locator(".save-state")).toHaveText("Unsaved changes");

  page.once("dialog", confirmation => confirmation.dismiss());
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toBeVisible();
  page.once("dialog", confirmation => confirmation.accept());
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toBeHidden();
  await expect(addCriterion).toBeFocused();

  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Black Hat Session", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate competitive analysis" }).click();
  await expect(page.getByRole("heading", { name: "Editable competitive-analysis reports" })).toBeVisible();
  await expect(page.locator(".report-card .chart-card")).toHaveCount(7);
  await expect(page.locator(".report-card .chart-card table")).toHaveCount(7);

  const [visualDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Visuals HTML" }).click()
  ]);
  expect(visualDownload.suggestedFilename()).toMatch(/-visuals\.html$/);
  const stream = await visualDownload.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const visualHtml = Buffer.concat(chunks).toString("utf8");
  expect(visualHtml).toContain("<svg");
  expect(visualHtml).toContain("<table>");
  expect(visualHtml).toContain("Relationship scope:");
  expect(visualHtml).toContain("total actions are included in this analysis");
  expect(visualHtml).not.toContain("available in the workspace");
  expect(visualHtml).not.toMatch(/<(?:script|link)[^>]+https?:|<img[^>]+https?:/i);
  expect(pageErrors).toEqual([]);
});

test("legacy report text never receives visuals rebuilt from current workspace data", async ({
  page
}) => {
  await page.goto(`${APP_PATH}#session`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Generate competitive analysis" }).click();
  await expect(
    page.getByRole("heading", { name: "Editable competitive-analysis reports" })
  ).toBeVisible();

  await page.evaluate(() => {
    const key = "black_hat_agent_public_v2";
    const workspace = JSON.parse(localStorage.getItem(key));
    delete workspace.runs[workspace.runs.length - 1].visualSnapshot;
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const report = page.locator(".report-card");
  await expect(report.locator(".legacy-visual-notice")).toContainText(
    "Current workspace data was not substituted"
  );
  await expect(report.locator(".chart-card")).toHaveCount(0);

  const [visualDownload] = await Promise.all([
    page.waitForEvent("download"),
    report.getByRole("button", { name: "Visuals HTML" }).click()
  ]);
  const stream = await visualDownload.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const visualHtml = Buffer.concat(chunks).toString("utf8");
  expect(visualHtml).toContain("Analysis visuals unavailable");
  expect(visualHtml).toContain("Current workspace data was not substituted");
  expect(visualHtml).not.toContain("<svg");
});

test("a browser-storage failure is visible and does not report success", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto(APP_PATH, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open workspace" }).first().click();
  await expect(page.locator(".save-state")).toContainText("Browser storage is full");
  await expect(page.locator(".toast[role='alert']")).toContainText("Browser storage is full");
  await expect(page).toHaveURL(/#portfolio$/);
});
