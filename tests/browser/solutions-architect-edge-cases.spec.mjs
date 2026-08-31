import { devices, expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const STORAGE_KEY = "solution_architect_workspace_v1";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173/geopresence/";

async function gotoFresh(page, route = "dashboard") {
  const response = await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

async function openTools(page) {
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click();
  return page.getByRole("dialog", { name: "Workspace tools" });
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
  await page.getByRole("button", { name: "AI assist", exact: true }).click();
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
  const trigger = page.getByRole("button", { name: /New solution$/ });
  await trigger.focus();
  await trigger.press("Enter");
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
  const markdownPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown", exact: true }).click();
  const markdown = (await readDownload(await markdownPromise)).toString("utf8");
  for (const heading of ["Customer hot buttons", "Technology Assessment", "Dependencies", "Win themes", "Transition plan"]) expect(markdown).toContain(heading);

  const htmlPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Standalone HTML", exact: true }).click();
  const html = (await readDownload(await htmlPromise)).toString("utf8");
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain("NO CUI / CLASSIFIED DATA");
  expect(html).toContain("<svg");

  await page.context().addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value() { globalThis.__printCalled = true; },
    });
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print / PDF", exact: true }).click();
  const printPage = await popupPromise;
  await printPage.waitForLoadState("domcontentloaded");
  await expect(printPage.locator(".marking")).toContainText("NO CUI / CLASSIFIED DATA");
  await expect.poll(() => printPage.locator("body").evaluate(node => getComputedStyle(node).maxWidth)).toBe("980px");
  await expect.poll(() => printPage.locator(".marking").evaluate(node => getComputedStyle(node).fontWeight)).toBe("700");
  await expect.poll(() => printPage.evaluate(() => globalThis.__printCalled === true)).toBe(true);
  await printPage.close();
});

test("narrow touch layout, reduced motion, and every lifecycle route avoid page overflow", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE_URL, reducedMotion: "reduce" });
  const page = await context.newPage();
  await gotoFresh(page, "dashboard");
  await page.getByRole("button", { name: "Toggle navigation", exact: false }).click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);

  for (const route of ["discover", "shape", "assess", "architect", "prove", "propose", "transition", "decision-package"]) {
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
  await page.getByRole("button", { name: "AI assist", exact: true }).click();
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
    await expect(page.getByText("Decision readiness", { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
