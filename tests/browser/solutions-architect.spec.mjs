import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const STORAGE_KEY = "solution_architect_workspace_v1";

test.use({ serviceWorkers: "block" });

async function gotoFresh(page, route = "dashboard") {
  const response = await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
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

async function openWorkspaceTool(page, name) {
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Workspace tools" });
  await tools.getByRole("button", { name, exact: true }).click();
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("core lifecycle editing persists locally and architecture exports remain self-contained", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page, "dashboard");

  await expect(page).toHaveTitle("Solution Architect Workbench");
  await expect(page.locator(".development-banner")).toContainText("Under development");
  await expect(page.getByRole("note")).toContainText("Approved unclassified, non-CUI information only");
  const navigation = page.getByRole("navigation", { name: "Solution workspace" });
  for (const [route, label] of [
    ["dashboard", "Command view"],
    ["discover", "Discover"],
    ["shape", "Shape"],
    ["assess", "Assess"],
    ["architect", "Architect"],
    ["prove", "Prove"],
    ["propose", "Propose"],
    ["transition", "Transition"],
    ["knowledge-base", "Knowledge base"],
    ["decision-package", "Decision package"]
  ]) {
    await expect(navigation.locator(`[data-route="${route}"] .label`)).toHaveText(label);
  }

  await openRoute(page, "discover");
  await expect(page.getByLabel("Development status")).toContainText("Under development");
  const solutionName = page.locator('[data-solution-field="name"]');
  await solutionName.fill("Browser-tested solution");
  await expect(page.locator("#save-state")).toHaveText("Unsaved changes");
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  const storedName = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).solutions[0].name, STORAGE_KEY);
  expect(storedName).toBe("Browser-tested solution");

  await openRoute(page, "shape");
  const evidenceCards = page.locator(".evidence-card");
  const evidenceBefore = await evidenceCards.count();
  await page.locator('[data-add="evidence"]').click();
  await expect(evidenceCards).toHaveCount(evidenceBefore + 1);
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  await openRoute(page, "propose");
  const seededWinTheme = page.locator(".win-theme-card").first();
  await expect(seededWinTheme).toBeVisible();
  await expect(seededWinTheme.locator('[data-record-field="title"]')).toHaveValue("Mission flexibility without platform redesign");
  await expect(seededWinTheme.locator('[data-record-field="status"]')).toHaveValue("Draft");

  await openRoute(page, "architect");
  await expect(page.locator("#diagram-canvas svg[role='img']")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.getByRole("button", { name: "Auto-layout", exact: true }).click();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "SVG", exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  const svg = (await readDownload(download)).toString("utf8");
  expect(svg).toMatch(/^<\?xml version="1\.0"/);
  expect(svg).toContain("<svg");
  expect(svg).not.toMatch(/<(?:script|image)[^>]+https?:/i);

  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PNG", exact: true }).click()
  ]);
  expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);
  const png = await readDownload(pngDownload);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(pageErrors).toEqual([]);
});

test("development status stays visible on screen and out of printed decision packages", async ({ page }) => {
  await gotoFresh(page, "dashboard");
  const banner = page.getByLabel("Development status");
  await expect(banner).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(banner).toBeHidden();
});

test("Technology Assessment explains TRL, MRL, and IRL beside the readiness fields", async ({ page }) => {
  await gotoFresh(page, "assess");

  const key = page.getByRole("region", { name: "Readiness levels" });
  await expect(key).toContainText("TRL");
  await expect(key).toContainText("Technology Readiness Level");
  await expect(key).toContainText("MRL");
  await expect(key).toContainText("Manufacturing Readiness Level");
  await expect(key).toContainText("IRL");
  await expect(key).toContainText("Integration Readiness Level");
  await expect(page.getByLabel("Technology Readiness Level (TRL)")).toHaveAttribute("max", "9");
  await expect(page.getByLabel("Manufacturing Readiness Level (MRL)")).toHaveAttribute("max", "10");
  const irl = page.getByLabel(/Integration Readiness Level \(IRL\)$/);
  await expect(irl).toHaveAttribute("min", "0");
  await expect(irl).toHaveAttribute("max", "9");
});

test("win themes persist edited customer hot-button and evidence links", async ({ page }) => {
  await gotoFresh(page, "propose");
  const theme = page.locator(".win-theme-card").first();
  const title = theme.locator('[data-record-field="title"]');
  const hotButtons = theme.locator("[data-win-theme-hot-buttons]");
  const evidence = theme.locator("[data-win-theme-evidence]");
  const hotButtonIds = await hotButtons.locator("option").evaluateAll(options => options.map(option => option.value));
  const evidenceIds = await evidence.locator("option").evaluateAll(options => options.map(option => option.value));
  expect(hotButtonIds.length).toBeGreaterThan(1);
  expect(evidenceIds.length).toBeGreaterThan(1);

  await title.fill("Evidence-backed mission flexibility");
  await hotButtons.selectOption(hotButtonIds);
  await evidence.selectOption(evidenceIds.slice(0, 2));
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  await page.reload({ waitUntil: "domcontentloaded" });

  const reloadedTheme = page.locator(".win-theme-card").first();
  await expect(reloadedTheme.locator('[data-record-field="title"]')).toHaveValue("Evidence-backed mission flexibility");
  expect(await reloadedTheme.locator("[data-win-theme-hot-buttons] option:checked").evaluateAll(options => options.map(option => option.value))).toEqual(hotButtonIds);
  expect(await reloadedTheme.locator("[data-win-theme-evidence] option:checked").evaluateAll(options => options.map(option => option.value))).toEqual(evidenceIds.slice(0, 2));
});

test("bulk hot-button ingestion deduplicates signals without silently creating requirements", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page, "discover");

  const hotButtonCards = page.locator(".hot-button-card");
  const hotButtonsBefore = await hotButtonCards.count();
  await openRoute(page, "shape");
  const requirementsBefore = await page.locator('textarea[data-record-collection="requirements"][data-record-field="title"]').count();
  await openRoute(page, "discover");
  await page.locator('[data-action="ingest-hot-buttons"]').click();
  const dialog = page.getByRole("dialog", { name: "Ingest customer hot buttons" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Source / interaction").fill("Synthetic customer session, 2026-08-30");
  await dialog.getByLabel("Initial confidence").selectOption("High");
  await dialog.getByLabel("Customer hot buttons — one per line").fill([
    "- Prioritize operator setup under 15 minutes",
    "2. Protect field-replaceable compute choices",
    "Prioritize operator setup under 15 minutes"
  ].join("\n"));
  await dialog.getByRole("button", { name: "Ingest signals", exact: true }).click();

  await expect(page.getByText("2 customer hot buttons ingested for validation and traceability.", { exact: true })).toBeVisible();
  await expect(hotButtonCards).toHaveCount(hotButtonsBefore + 2);
  await expect(page.locator('[data-record-collection="hotButtons"][data-record-field="title"]').nth(hotButtonsBefore)).toHaveValue("Prioritize operator setup under 15 minutes");
  await expect(page.locator("#save-state")).toHaveText("Saved locally");
  const ingested = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return {
      records: workspace.hotButtons.filter(item => item.source === "Synthetic customer session, 2026-08-30"),
      requirementCount: workspace.requirements.length
    };
  }, STORAGE_KEY);
  expect(ingested.records).toHaveLength(2);
  expect(ingested.records.every(item => item.confidence === "High" && item.status === "Captured")).toBe(true);
  expect(ingested.requirementCount).toBe(requirementsBefore);
  expect(pageErrors).toEqual([]);
});

test("a new solution starts clean, remains independently scoped, and creates recovery points", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page);

  await openWorkspaceTool(page, "Create a new solution");
  const dialog = page.getByRole("dialog", { name: "Create a solution workspace" });
  await dialog.getByLabel("Solution name").fill("Independent browser solution");
  await dialog.getByRole("button", { name: "Create solution", exact: true }).click();

  await expect(page).toHaveURL(/#discover$/);
  await expect(page.locator("#solution-select")).toHaveValue(/solution_/);
  await expect(page.locator('[data-solution-field="name"]')).toHaveValue("Independent browser solution");
  await expect(page.locator('[data-solution-nested="mission.problem"]')).toHaveValue("");
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const scope = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return {
      solutions: workspace.solutions.length,
      activeSolutionId: workspace.activeSolutionId,
      activeCriteria: workspace.criteria.filter(item => item.solutionId === workspace.activeSolutionId).length,
      activeViews: workspace.architectureViews.filter(item => item.solutionId === workspace.activeSolutionId).length,
      foreignRecords: [
        "stakeholders", "hotButtons", "winThemes", "outcomes", "measures", "requirements", "evidence", "candidates",
        "elements", "connections", "trades", "decisions", "risks", "assumptions",
        "dependencies", "roadmapItems", "reviews", "transitionActions", "aiDrafts"
      ].reduce((total, name) => total + workspace[name].filter(item => item.solutionId === workspace.activeSolutionId).length, 0)
    };
  }, STORAGE_KEY);
  expect(scope.solutions).toBe(2);
  expect(scope.activeCriteria).toBeGreaterThan(0);
  expect(scope.activeViews).toBe(1);
  expect(scope.foreignRecords).toBe(0);

  await page.getByRole("button", { name: "Workspace tools", exact: true }).click();
  await page.getByRole("button", { name: /Create recovery point/ }).click();
  await expect(page.getByText("Recovery point created.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Recovery", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Recovery points" }).getByText("Manual recovery point", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Recovery points" }).getByText("Created solution", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("AI assistance previews the exact stage-scoped payload and saves only a validated mocked draft", async ({ page }) => {
  await page.route("**/auth/v1/token?grant_type=password", async route => {
    const now = Math.floor(Date.now() / 1_000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
      aud: "authenticated",
      exp: now + 3_600,
      iat: now,
      sub: "00000000-0000-4000-8000-000000000001",
      email: "approved@example.test",
      role: "authenticated"
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
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "approved@example.test",
          email_confirmed_at: timestamp,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: timestamp,
          updated_at: timestamp
        }
      })
    });
  });

  let requestPayload;
  await page.route("**/functions/v1/solution-assist", async route => {
    requestPayload = route.request().postDataJSON();
    const citationId = requestPayload.solution_id;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contract_version: "solution-assist-v1",
        solution_id: citationId,
        action: requestPayload.action,
        request_id: "request_mocked_browser",
        model: "mock-model",
        result: {
          summary: "Mocked traceability summary",
          drafts: [],
          findings: [{
            severity: "medium",
            category: "traceability",
            title: "Mocked traceability finding",
            detail: "A mocked finding tied to the reviewed workspace facts.",
            recommendation: "Confirm the trace before accepting the draft.",
            citation_ids: [citationId]
          }],
          review_questions: [],
          architecture_views: [],
          assumptions: [],
          warnings: [],
          citation_ids: [citationId]
        }
      })
    });
  });

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page, "shape");
  await openWorkspaceTool(page, "AI assist");
  const dialog = page.getByRole("dialog", { name: "AI assistance — review before sending" });
  await dialog.locator("#ai-action").selectOption("find_gaps");
  await dialog.locator("#ai-stage").selectOption("Propose");
  await dialog.locator("#ai-focus").fill("Check requirement traceability only.");
  await dialog.getByRole("button", { name: "Prepare exact payload", exact: true }).click();
  await expect(dialog.locator(".payload-preview")).toBeVisible();

  const preview = JSON.parse(await dialog.locator(".payload-preview").textContent());
  expect(preview.action).toBe("find_gaps");
  expect(preview.parameters.focus).toBe("Check requirement traceability only.");
  expect(preview.facts.every(fact => fact.solution_id === preview.solution_id)).toBe(true);
  expect(new Set(preview.facts.map(fact => fact.record_type))).toEqual(
    new Set(["mission_context", "customer_hot_button", "win_theme", "requirement", "decision", "risk", "dependency", "roadmap_item", "evidence"])
  );

  await dialog.getByText("Sign in for AI access", { exact: true }).click();
  await dialog.locator("#ai-email").fill("approved@example.test");
  await dialog.locator("#ai-password").fill("mock-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.locator("#ai-auth-state")).toHaveText("Signed in. You can send the reviewed payload.");
  await dialog.locator("#ack-payload").check();
  await dialog.locator("#ack-data").check();
  await dialog.locator("#ack-restricted").check();
  await dialog.getByRole("button", { name: "Send selected facts to AI", exact: true }).click();

  await expect(dialog.getByText("Mocked traceability finding", { exact: false })).toBeVisible();
  expect(requestPayload).toEqual(preview);
  await dialog.getByRole("button", { name: "Save as pending draft", exact: true }).click();
  await expect(page.getByText("AI output saved as a pending draft. No authored content was overwritten.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).aiDrafts.length : 0;
  }, STORAGE_KEY)).toBe(1);

  const stored = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return {
      drafts: workspace.aiDrafts,
      solutionName: workspace.solutions.find(item => item.id === workspace.activeSolutionId).name
    };
  }, STORAGE_KEY);
  expect(stored.drafts[0]).toMatchObject({
    status: "Pending review",
    stage: "Propose",
    requestId: "request_mocked_browser",
    model: "mock-model"
  });
  expect(stored.solutionName).toBe("Expeditionary Sensor Node Upgrade");

  const beforeAcceptance = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    const solution = structuredClone(workspace.solutions.find(item => item.id === workspace.activeSolutionId));
    delete solution.updatedAt;
    const draft = workspace.aiDrafts[0];
    return {
      solution,
      draftContent: {
        id: draft.id,
        solutionId: draft.solutionId,
        action: draft.action,
        stage: draft.stage,
        title: draft.title,
        createdAt: draft.createdAt,
        citationIds: draft.citationIds,
        result: draft.result,
        requestId: draft.requestId,
        model: draft.model
      }
    };
  }, STORAGE_KEY);

  await openRoute(page, "prove");
  const draftCard = page.locator(".ai-drafts .draft-list article").first();
  await expect(draftCard.locator(".draft-status")).toHaveText("Pending review");
  await draftCard.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByText("AI draft marked accepted. Authored content was not changed.", { exact: true })).toBeVisible();
  await expect(draftCard.locator(".draft-status")).toHaveText("Accepted");
  await expect.poll(() => page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).aiDrafts[0]?.status : "";
  }, STORAGE_KEY)).toBe("Accepted");

  const afterAcceptance = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    const solution = structuredClone(workspace.solutions.find(item => item.id === workspace.activeSolutionId));
    delete solution.updatedAt;
    const draft = workspace.aiDrafts[0];
    return {
      solution,
      status: draft.status,
      draftContent: {
        id: draft.id,
        solutionId: draft.solutionId,
        action: draft.action,
        stage: draft.stage,
        title: draft.title,
        createdAt: draft.createdAt,
        citationIds: draft.citationIds,
        result: draft.result,
        requestId: draft.requestId,
        model: draft.model
      }
    };
  }, STORAGE_KEY);
  expect(afterAcceptance.status).toBe("Accepted");
  expect(afterAcceptance.solution).toEqual(beforeAcceptance.solution);
  expect(afterAcceptance.draftContent).toEqual(beforeAcceptance.draftContent);
  expect(pageErrors).toEqual([]);
});
