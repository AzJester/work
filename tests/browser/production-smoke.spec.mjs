import { test, expect } from "@playwright/test";
import { projectExportButton, projectImportInput, revealControl, undoButton, zoomControls } from "./helpers.mjs";

test("@production deployed GeoPresence release is healthy", async ({ page, request }) => {
  test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
  test.setTimeout(120_000);

  await expect
    .poll(async () => {
      const response = await request.get(`./?deployment-smoke=${Date.now()}`, { failOnStatusCode: false });
      return response.status();
    }, { timeout: 90_000, intervals: [1_000, 2_000, 5_000] })
    .toBe(200);

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(`./?deployment-smoke=${Date.now()}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/^Map Builder$/i);
  await expect(page.locator("#mapSvg")).toBeVisible();
  await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
  await expect(page.getByText("Map heading", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Standalone\s*(?:\u00c2)?\u00b7\s*No map service required/i);
  await expect(page.locator("body")).toContainText(/v3\.2\.3/i);

  await page.locator("#locationImportOpen").click();
  await expect(page.locator("#locationImportDialog")).toBeVisible();
  await expect(page.locator("#locationImportFile")).toHaveAttribute("accept", ".csv,text/csv");
  await page.locator("#locationImportClose").click();

  await revealControl(page, projectExportButton(page));
  await expect(projectImportInput(page)).toBeAttached();
  await expect(undoButton(page)).toBeAttached();
  await expect(zoomControls(page)).toHaveCount(4);
  expect(pageErrors).toEqual([]);
});

test("@production the retired Black Hat Agent address forwards to the current build", async ({ page, request }) => {
  test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
  test.setTimeout(150_000);

  // Wait until the CDN serves the forwarding page instead of a cached copy of the old app.
  const retired = `../black-hat-agent/?deployment-smoke=${Date.now()}`;
  await expect
    .poll(async () => {
      const response = await request.get(retired, { failOnStatusCode: false });
      return response.status() === 200 && (await response.text()).includes('location.replace("/Black_Hat_Agent/"');
    }, { timeout: 100_000, intervals: [1_000, 2_000, 5_000] })
    .toBe(true);

  await page.goto(`${retired}#session`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/Black_Hat_Agent\/\?deployment-smoke=\d+#session$/);
  await expect(page).toHaveTitle(/Black Hat Agent$/i);

  // The Solution Architect Workbench loads SheetJS from this folder.
  const spreadsheetLibrary = await request.get("../black-hat-agent/vendor/xlsx.full.min.js", { failOnStatusCode: false });
  expect(spreadsheetLibrary.status()).toBe(200);
});

test("@production deployed Solution Architect Workbench release is healthy", async ({ page, request }) => {
  test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
  test.setTimeout(120_000);

  const route = `../solutions-architect/?deployment-smoke=${Date.now()}`;
  await expect
    .poll(async () => (await request.get(route, { failOnStatusCode: false })).status(), {
      timeout: 90_000,
      intervals: [1_000, 2_000, 5_000],
    })
    .toBe(200);

  for (const asset of ["app.js", "engine.js", "theme-init.js", "styles.css", "print-package.css", "guide.html", "sw.js", "icon.svg", "og-card.png"]) {
    expect((await request.get(`../solutions-architect/${asset}`, { failOnStatusCode: false })).status()).toBe(200);
  }
  expect((await request.get("../assets/vendor/supabase-js-2.110.2.umd.js", { failOnStatusCode: false })).status()).toBe(200);

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Solution Architect Workbench");
  await expect(page.locator(".development-banner")).toContainText("Under development");
  await expect(page.getByRole("note")).toContainText("Approved unclassified, non-CUI information only");
  const lifecycle = page.getByRole("navigation", { name: "Solution workspace" });
  await expect(lifecycle).toBeVisible();
  const themeToggle = page.getByRole("switch", { name: "Dark theme" });
  await expect(themeToggle).toBeVisible();
  await expect(page.getByText("Dark mode", { exact: true })).toHaveCount(0);
  await themeToggle.click();
  await expect(page.locator("#toast-region")).toBeEmpty();
  await themeToggle.click();
  await expect(page.locator("#toast-region")).toBeEmpty();
  await expect(page.getByText("Customer hot buttons", { exact: true })).not.toBeVisible();
  await lifecycle.getByRole("link", { name: /Discover$/ }).click();
  await expect(page.getByText("Customer hot buttons", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ingest list", exact: true })).toBeVisible();
  await lifecycle.getByRole("link", { name: /Propose$/ }).click();
  await expect(page.getByRole("heading", { name: "Win themes", exact: true })).toBeVisible();
  await expect(page.locator(".win-theme-card").first().getByRole("textbox", { name: "Win theme", exact: true }))
    .toHaveValue("Mission flexibility without platform redesign");
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("solution_architect_workspace_v1")))).toBe(true);

  const hub = await request.get(`../apps.html?deployment-smoke=${Date.now()}`, { failOnStatusCode: false });
  expect(hub.status()).toBe(200);
  const hubSource = await hub.text();
  expect(hubSource).toContain("https://azjester.github.io/work/solutions-architect/");
  expect(hubSource).toContain('status: "Under development"');

  const hubResponse = await page.goto(`../apps.html?q=Solution+Architect&deployment-smoke=${Date.now()}`, { waitUntil: "domcontentloaded" });
  expect(hubResponse?.status()).toBe(200);
  const solutionCard = page.locator(".app-card").filter({
    has: page.getByRole("heading", { name: "Solution Architect Workbench", exact: true }),
  });
  await expect(solutionCard.locator(".development-stamp")).toHaveText("UNDER DEVELOPMENT");
  expect(pageErrors).toEqual([]);
});

test("@production deployed Astrion Capabilities Film is published at its library route", async ({ request }) => {
  test.skip(!process.env.PRODUCTION_SMOKE, "runs only after the Pages deployment");
  test.setTimeout(120_000);

  const route = `../astrion-film/?deployment-smoke=${Date.now()}`;
  await expect
    .poll(async () => (await request.get(route, { failOnStatusCode: false })).status(), {
      timeout: 90_000,
      intervals: [1_000, 2_000, 5_000],
    })
    .toBe(200);
  const film = await request.get(route, { failOnStatusCode: false });
  expect(await film.text()).toContain("<title>Astrion Capabilities Film</title>");
});
