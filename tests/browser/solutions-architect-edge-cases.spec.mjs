import { devices, expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const STORAGE_KEY = "solution_architect_workspace_v1";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173/geopresence/";

async function gotoFresh(page, route = "dashboard") {
  const response = await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  if (response) expect(response.status()).toBe(200);
  else await expect(page).toHaveURL(new RegExp(`solutions-architect/#${route}$`));
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

async function openTools(page) {
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click();
  return page.getByRole("dialog", { name: "Workspace tools" });
}

async function openWorkspaceTool(page, name) {
  const tools = await openTools(page);
  await tools.getByRole("button", { name, exact: true }).click();
}

async function openDecisionExportMenu(page) {
  const trigger = page.getByRole("button", { name: "Export decision package", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const menu = page.getByRole("menu", { name: "Decision package export formats", exact: true });
  await expect(menu).toBeVisible();
  return { trigger, menu };
}

async function downloadDecisionFormat(page, accessibleName) {
  const { trigger, menu } = await openDecisionExportMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: accessibleName, exact: true }).click();
  const download = await downloadPromise;
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  return download;
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function installMockAuth(page) {
  await page.route("**/auth/v1/token?grant_type=password", async route => {
    const now = Math.floor(Date.now() / 1_000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
      aud: "authenticated",
      exp: now + 3_600,
      iat: now,
      sub: "00000000-0000-4000-8000-000000000002",
      email: "approved@example.test",
      role: "authenticated",
    })}.mock-signature`;
    const timestamp = new Date(now * 1_000).toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3_600,
        expires_at: now + 3_600,
        refresh_token: "mock-refresh-token",
        user: {
          id: "00000000-0000-4000-8000-000000000002",
          aud: "authenticated",
          role: "authenticated",
          email: "approved@example.test",
          email_confirmed_at: timestamp,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: timestamp,
          updated_at: timestamp,
        },
      }),
    });
  });
}

async function prepareAiRequest(page) {
  await openWorkspaceTool(page, "AI assist");
  const dialog = page.getByRole("dialog", { name: "AI assistance — review before sending" });
  await dialog.getByRole("button", { name: "Prepare exact payload", exact: true }).click();
  await dialog.getByText("Sign in for AI access", { exact: true }).click();
  await dialog.locator("#ai-email").fill("approved@example.test");
  await dialog.locator("#ai-password").fill("mock-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.locator("#ai-auth-state")).toContainText("Signed in");
  for (const id of ["ack-payload", "ack-data", "ack-restricted"]) await dialog.locator(`#${id}`).check();
  return dialog;
}

test("JSON backup round-trips atomically and hostile or oversized imports fail closed", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page, "discover");

  const tools = await openTools(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    tools.getByRole("button", { name: /Export JSON backup/ }).click(),
  ]);
  const exported = JSON.parse((await readDownload(download)).toString("utf8"));
  expect(exported.schema).toBe("solution-workspace-v1");

  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator('[data-solution-field="name"]').fill("Temporary browser edit");
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  await page.locator("#workspace-import").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByText("Workspace imported and validated.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-solution-field="name"]')).toHaveValue(exported.solutions[0].name);

  const inert = structuredClone(exported);
  inert.solutions[0].name = `<img src=x onerror="globalThis.__xss=true">`;
  await page.locator("#workspace-import").setInputFiles({
    name: "inert-workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(inert)),
  });
  await expect(page.locator('[data-solution-field="name"]')).toHaveValue(inert.solutions[0].name);
  expect(await page.locator("img[src='x']").count()).toBe(0);
  expect(await page.evaluate(() => globalThis.__xss === true)).toBe(false);

  const duplicate = structuredClone(inert);
  duplicate.requirements[1].id = duplicate.requirements[0].id;
  await page.locator("#workspace-import").setInputFiles({
    name: "duplicate-workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(duplicate)),
  });
  await expect(page.getByText(/Import rejected:.*Duplicate record ID/i)).toBeVisible();
  await expect(page.locator('[data-solution-field="name"]')).toHaveValue(inert.solutions[0].name);

  await page.locator("#workspace-import").setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 32),
  });
  await expect(page.getByText("Workspace imports are limited to 5 MB.", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("storage failures keep backup available and do not apply an import in memory", async ({ page }) => {
  await gotoFresh(page, "discover");
  await page.evaluate(() => {
    Storage.prototype.setItem = function setItemFailure() {
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    };
  });
  await page.locator('[data-solution-field="customer"]').fill("Trigger a visible save failure");
  await expect(page.locator("#save-state")).toHaveText("Save failed — export a backup");
  await expect(page.getByText("Browser storage is unavailable or full. Export a JSON backup now.", { exact: true })).toBeVisible();

  const tools = await openTools(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    tools.getByRole("button", { name: /Export JSON backup/ }).click(),
  ]);
  const exported = JSON.parse((await readDownload(download)).toString("utf8"));
  expect(exported.solutions.find(item => item.id === exported.activeSolutionId).customer).toBe("Trigger a visible save failure");
  await expect(page.getByText("Downloaded the current in-memory workspace. Keep this backup because browser storage did not save it.", { exact: true })).toBeVisible();

  const candidate = structuredClone(exported);
  candidate.solutions.find(item => item.id === candidate.activeSolutionId).customer = "Validated import that cannot persist";
  await page.locator("#workspace-import").setInputFiles({
    name: "cannot-persist.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(candidate)),
  });
  await expect(page.getByText(/Import not applied: Browser storage could not save the validated import\. The current workspace was kept\./)).toBeVisible();
  await expect(page.locator('[data-solution-field="customer"]')).toHaveValue("Trigger a visible save failure");
  await expect(page.getByText("Workspace imported and validated.", { exact: true })).toHaveCount(0);
});

test("Prove links assessed candidates to trades and evidence to decisions", async ({ page }) => {
  await gotoFresh(page, "prove");
  const tradeLinks = page.locator('[data-record-links-collection="trades"][data-record-links-field="optionIds"]').first();
  const decisionLinks = page.locator('[data-record-links-collection="decisions"][data-record-links-field="evidenceIds"]').first();
  const candidateIds = await tradeLinks.locator("option").evaluateAll(options => options.map(option => option.value));
  const evidenceIds = await decisionLinks.locator("option").evaluateAll(options => options.map(option => option.value));
  expect(candidateIds.length).toBeGreaterThan(1);
  expect(evidenceIds.length).toBeGreaterThan(1);

  await tradeLinks.selectOption(candidateIds);
  await decisionLinks.selectOption(evidenceIds.slice(0, 2));
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  await page.reload({ waitUntil: "domcontentloaded" });

  expect(await page.locator('[data-record-links-collection="trades"][data-record-links-field="optionIds"]').first().locator("option:checked").evaluateAll(options => options.map(option => option.value))).toEqual(candidateIds);
  expect(await page.locator('[data-record-links-collection="decisions"][data-record-links-field="evidenceIds"]').first().locator("option:checked").evaluateAll(options => options.map(option => option.value))).toEqual(evidenceIds.slice(0, 2));
});

test("modal focus is trapped and restored to the invoking control", async ({ page }) => {
  await gotoFresh(page, "dashboard");
  const trigger = page.getByRole("button", { name: "Workspace tools", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const tools = page.getByRole("dialog", { name: "Workspace tools" });
  await tools.getByRole("button", { name: "Create a new solution", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a solution workspace" });
  const name = dialog.getByLabel("Solution name");
  await expect(name).toBeFocused();

  const close = dialog.getByRole("button", { name: "Close dialog" });
  const submit = dialog.getByRole("button", { name: "Create solution", exact: true });
  await submit.focus();
  await submit.press("Tab");
  await expect(close).toBeFocused();
  await close.press("Shift+Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the informational Guide dialog receives focus and links to the rendered guide", async ({ page }) => {
  await gotoFresh(page, "dashboard");
  const trigger = page.getByRole("button", { name: "Guide", exact: true });
  await trigger.focus();
  await trigger.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Solution Architect Workbench guide" });
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await expect(dialog.getByRole("link", { name: /complete task-oriented user guide/i })).toHaveAttribute("href", "./guide.html");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("diagram keyboard movement, accessible data, and decision-package downloads remain deterministic", async ({ page }) => {
  await gotoFresh(page, "architect");
  const element = page.locator("#diagram-canvas [data-element-id]").first();
  const readX = async () => Number((await element.getAttribute("transform"))?.match(/translate\(([-\d.]+)/)?.[1]);
  const before = await readX();
  await element.focus();
  await element.press("ArrowRight");
  await expect.poll(readX).toBe(before + 10);
  await page.locator(".accessible-model summary").click();
  await expect(page.locator(".accessible-model table")).toHaveCount(2);

  await page.goto(`${APP_PATH}#decision-package`, { waitUntil: "domcontentloaded" });
  const markdownDownload = await downloadDecisionFormat(page, "Download decision package as Markdown");
  expect(markdownDownload.suggestedFilename()).toMatch(/-decision-package\.md$/);
  const markdown = (await readDownload(markdownDownload)).toString("utf8");
  for (const heading of ["Customer hot buttons", "Technology Assessment", "Dependencies", "Win themes", "Transition plan"]) expect(markdown).toContain(heading);

  const htmlDownload = await downloadDecisionFormat(page, "Download decision package as standalone HTML");
  expect(htmlDownload.suggestedFilename()).toMatch(/-decision-package\.html$/);
  const html = (await readDownload(htmlDownload)).toString("utf8");
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain('<article class="decision-document">');
  expect(html).toContain('<header class="decision-hero"');
  expect(html).toContain('<section class="doc-section" id="requirements">');
  expect(html).toContain("Architecture interfaces and exchanges");
  expect(html).toContain("Technology Readiness Level");
  expect(html).not.toMatch(/<pre\b/i);
  expect(html).not.toMatch(/data marking|NO CUI|CLASSIFIED DATA|browser(?:-local| storage)|not authorized|not an authorization|approval or authorization determination|DoD[- ]confirmed determination|DOF[- ]confirmed determination|DoDAF[- ]conformance determination/i);
  expect(html).toContain("<svg");

  const wordDownload = await downloadDecisionFormat(page, "Download decision package as Microsoft Word");
  expect(wordDownload.suggestedFilename()).toMatch(/-decision-package\.docx$/);
  const word = await readDownload(wordDownload);
  expect(word.subarray(0, 2).toString("ascii")).toBe("PK");
  expect(word.toString("latin1")).toContain("word/document.xml");

  const excelDownload = await downloadDecisionFormat(page, "Download decision workbook as Microsoft Excel");
  expect(excelDownload.suggestedFilename()).toMatch(/-decision-workbook\.xlsx$/);
  const excel = await readDownload(excelDownload);
  expect(excel.subarray(0, 2).toString("ascii")).toBe("PK");
  expect(excel.toString("latin1")).toContain("xl/workbook.xml");

  const pdfDownload = await downloadDecisionFormat(page, "Download decision package as PDF");
  expect(pdfDownload.suggestedFilename()).toMatch(/-decision-package\.pdf$/);
  const pdf = await readDownload(pdfDownload);
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(20_000);
});

test("narrow touch layout, reduced motion, and every lifecycle route avoid page overflow", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE_URL, reducedMotion: "reduce" });
  const page = await context.newPage();
  await gotoFresh(page, "dashboard");
  await page.getByRole("button", { name: "Open workspace navigation", exact: true }).click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);

  for (const route of ["discover", "shape", "assess", "architect", "prove", "propose", "transition", "knowledge-base", "decision-package"]) {
    await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.goto(`${APP_PATH}#architect`, { waitUntil: "domcontentloaded" });
  const element = page.locator("#diagram-canvas [data-element-id]").first();
  await element.tap();
  await expect(page.locator(".inspector")).toContainText("Edit the selected architecture element");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await context.close();
});

test("requirements use readable cards with auto-growing text and wrapping relationship controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFresh(page, "shape");

  const card = page.locator(".requirement-card").first();
  const statement = card.locator('textarea[data-record-field="title"]');
  const acceptance = card.locator('textarea[data-record-field="acceptanceMethod"]');
  await expect(card).toBeVisible();
  const selectedSource = await card.locator('.requirement-source select option:checked').textContent();
  await expect(card.locator(".selected-source-preview")).toContainText(selectedSource.trim());

  const beforeHeight = await acceptance.evaluate(node => node.clientHeight);
  await acceptance.fill([
    "Demonstrate the complete representative mission thread.",
    "Verify the controlled interface under nominal transport.",
    "Repeat the run under degraded transport.",
    "Record latency, data loss, recovery time, and operator outcome.",
    "Pass when every stated threshold is met without manual reconfiguration."
  ].join("\n"));
  await expect.poll(() => acceptance.evaluate(node => node.clientHeight)).toBeGreaterThan(beforeHeight);
  const textMetrics = await acceptance.evaluate(node => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    resize: getComputedStyle(node).resize,
  }));
  expect(textMetrics.scrollHeight).toBeLessThanOrEqual(textMetrics.clientHeight + 2);
  expect(textMetrics.resize).toBe("none");
  await expect(statement).toHaveAttribute("aria-label", /Requirement 1:/);

  const architecture = card.locator(".relationship-field").nth(1);
  await expect(architecture).toHaveAttribute("aria-label", /Architecture trace for .+/i);
  await architecture.locator("summary").click();
  const option = architecture.locator("[data-requirement-element]:not(:checked)").first();
  const optionLabel = await option.getAttribute("data-relationship-label");
  const optionId = await option.getAttribute("value");
  await option.check();
  await expect(architecture.locator("[data-relationship-selection]")).toContainText(optionLabel);
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  await page.reload({ waitUntil: "domcontentloaded" });
  const persisted = page.locator(".requirement-card").first();
  await expect(persisted.locator(`[data-requirement-element][value="${optionId}"]`)).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMetrics = await persisted.evaluate(node => ({
    cardOverflow: node.scrollWidth - node.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(mobileMetrics.cardOverflow).toBeLessThanOrEqual(1);
  expect(mobileMetrics.pageOverflow).toBeLessThanOrEqual(1);
});

test("mobile editable tables stack into labeled cards instead of requiring a wide horizontal pan", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const { route, tableSelector, reveal } of [
    { route: "assess", tableSelector: ".score-table" },
    { route: "architect", tableSelector: ".accessible-model .editable-table", reveal: ".accessible-model" },
    { route: "prove", tableSelector: ".governance-section .editable-table" },
  ]) {
    await test.step(route, async () => {
      await gotoFresh(page, route);
      if (reveal) await page.locator(reveal).evaluate(node => { node.open = true; });
      const table = page.locator(tableSelector).first();
      await expect(table).toBeVisible();

      const metrics = await table.evaluate(node => {
        const scrollContainer = node.closest(".table-scroll");
        const row = node.querySelector("tbody tr");
        const cells = row ? [...row.querySelectorAll("td")] : [];
        return {
          overflow: scrollContainer ? scrollContainer.scrollWidth - scrollContainer.clientWidth : Number.POSITIVE_INFINITY,
          rowDisplay: row ? getComputedStyle(row).display : "",
          headersRemainAvailable: getComputedStyle(node.querySelector("thead")).display !== "none",
          cellsAreLabeled: cells.length > 0 && cells.every(cell => {
            const pseudoContent = getComputedStyle(cell, "::before").content;
            return Boolean(cell.dataset.label?.trim()) || !["", "none", "normal", '""'].includes(pseudoContent);
          }),
          controlsAreNamed: [...node.querySelectorAll("input, textarea, select, button")].every(control => {
            const labelledBy = control.getAttribute("aria-labelledby")?.trim();
            const ariaLabel = control.getAttribute("aria-label")?.trim();
            const nativeLabel = control.labels?.length > 0;
            const buttonText = control.tagName === "BUTTON" && control.textContent.trim().length > 0;
            return Boolean(labelledBy || ariaLabel || nativeLabel || buttonText);
          }),
        };
      });

      expect.soft(metrics.overflow, `${route} editable table should not require horizontal panning`).toBeLessThanOrEqual(1);
      expect.soft(["block", "grid", "flex"], `${route} records should stack at phone width`).toContain(metrics.rowDisplay);
      expect.soft(metrics.headersRemainAvailable, `${route} table headers should remain available to assistive technology`).toBe(true);
      expect.soft(metrics.cellsAreLabeled, `${route} stacked cells should retain their column labels`).toBe(true);
      expect.soft(metrics.controlsAreNamed, `${route} table controls should have programmatic names`).toBe(true);
    });
  }
});

test("AI cancellation sends nothing and 403, quota, timeout, and malformed output remain safe", async ({ page }) => {
  await installMockAuth(page);
  let calls = 0;
  const responses = [
    { status: 403, body: { error: "This account is not allowed to use Solution Architect AI assistance." } },
    { status: 429, body: { error: "AI request quota exceeded. Try again later." } },
    { status: 504, body: { error: "The AI service timed out. Please try again." } },
    { status: 200, body: null },
  ];
  await page.route("**/functions/v1/solution-assist", async route => {
    const response = responses[calls++];
    const request = route.request().postDataJSON();
    const body = response.body || {
      contract_version: "solution-assist-v1",
      solution_id: request.solution_id,
      action: request.action,
      request_id: "request_malformed",
      model: "mock-model",
      result: {
        summary: "Malformed citation",
        drafts: [],
        findings: [{
          severity: "high",
          category: "traceability",
          title: "Unsafe finding",
          detail: "This otherwise valid finding cites a record outside the selected solution.",
          recommendation: "Reject cross-solution citations.",
          citation_ids: ["another_solution_record"],
        }],
        review_questions: [],
        architecture_views: [],
        assumptions: [],
        warnings: [],
        citation_ids: ["another_solution_record"],
      },
    };
    await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(body) });
  });

  await gotoFresh(page, "shape");
  await openWorkspaceTool(page, "AI assist");
  let dialog = page.getByRole("dialog", { name: "AI assistance — review before sending" });
  await dialog.getByRole("button", { name: "Prepare exact payload", exact: true }).click();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  expect(calls).toBe(0);

  dialog = await prepareAiRequest(page);
  for (const expected of ["not allowed", "quota exceeded", "timed out", "invalid or cross-solution citation"]) {
    await dialog.getByRole("button", { name: "Send selected facts to AI", exact: true }).click();
    await expect(page.locator(".toast-region")).toContainText(new RegExp(expected, "i"));
  }
  expect(calls).toBe(4);
  expect(await page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).aiDrafts.length : 0;
  }, STORAGE_KEY)).toBe(0);
});

test("the app shell reopens offline after one controlled online visit", async ({ page, context }) => {
  await gotoFresh(page, "dashboard");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: "networkidle" });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("Solution Architect Workbench");
    await expect(page.getByRole("note")).toContainText("Approved unclassified, non-CUI information only");
    await expect(page.getByText("Workspace coverage", { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
