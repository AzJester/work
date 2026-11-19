import { test, expect } from "@playwright/test";

function route(baseURL, hash = "") {
  return `${new URL("../mission-intelligence/", baseURL).href}${hash}`;
}

function watch(page, baseURL) {
  const problems = [];
  const origin = new URL(baseURL).origin;
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => problems.push(`request failed: ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (new URL(request.url()).origin !== origin) problems.push(`off-origin request: ${request.url()}`); });
  return problems;
}

test("the page loads cleanly with the brand kit fonts, the wordmark and the hero motion", async ({ page, baseURL }) => {
  const problems = watch(page, baseURL);
  const response = await page.goto(route(baseURL), { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Astrion Mission Intelligence · AI from intent to effect");
  expect((await page.locator("h1").innerText()).replace(/\s+/g, " ").trim()).toBe("AI THAT CARRIES INTENT TO EFFECT");
  await expect(page.locator(".site-header .brand img")).toHaveAttribute("src", "assets/media/wordmark-light.svg");
  const styles = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      archivo: document.fonts.check('700 16px "Archivo"'),
      mono: document.fonts.check('500 11px "JetBrains Mono"'),
      grotesk: document.fonts.check('400 11px "Space Grotesk"'),
      h1: getComputedStyle(document.querySelector("h1")).fontFamily,
      eyebrow: getComputedStyle(document.querySelector(".eyebrow")).fontFamily,
      sub: getComputedStyle(document.querySelector(".brand-sub")).fontFamily,
      weight: getComputedStyle(document.querySelector("h1")).fontWeight,
    };
  });
  expect(styles).toMatchObject({ archivo: true, mono: true, grotesk: true, weight: "700" });
  expect(styles.h1).toMatch(/Archivo/);
  expect(styles.eyebrow).toMatch(/JetBrains Mono/);
  expect(styles.sub).toMatch(/Space Grotesk/);
  await expect(page.locator("#hero-film source").first()).toHaveAttribute("src", /hero-loop\.(webm|mp4)$/);
  await expect(page.locator("#film-control")).toBeVisible();
  expect(problems).toEqual([]);
});

for (const width of [320, 360, 390, 430, 640, 720, 768, 900, 1001, 1280, 1440, 1920]) {
  test(`the page stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route(baseURL), { waitUntil: "load" });
    await page.evaluate(() => window.astrionFleetDemo.begin());
    await page.waitForSelector("#ops-approve:not([disabled])");
    const issues = await page.evaluate(() => {
      const found = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      const selectors = [".site-bar", ".hero-inner", ".stats-grid", ".products", ".flow", ".stack-layout", ".integrations", ".ops", ".ma-board", ".ed-dossier", ".cap-grid", ".domain-grid", ".program", ".ev-blocks", ".protocol", ".pilot-layout", ".footer-top"];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        if (box.left < -1 || box.right > innerWidth + 1) found.push(`${element.className} leaves the viewport: ${Math.round(box.left)}-${Math.round(box.right)}`);
      }
      const wordmark = document.querySelector(".site-header .brand").getBoundingClientRect();
      const h1 = document.querySelector(".hero h1").getBoundingClientRect();
      if (Math.abs(h1.left - wordmark.left) > 1) found.push("container gutters differ");
      return found;
    });
    expect(issues).toEqual([]);
    if (width <= 992) await expect(page.locator("#menu-button")).toBeVisible();
    else await expect(page.locator(".site-nav")).toBeVisible();
  });
}

test("the fleet demo composes a plan, waits for approval, re-tasks after a disruption and delivers the effect", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route(baseURL, "#fleet"), { waitUntil: "load" });
  await page.evaluate(() => window.astrionFleetDemo.begin());
  const approve = page.locator("#ops-approve");
  const disrupt = page.locator("#ops-disrupt");
  const status = page.locator("#ops-status");
  await expect(approve).toBeEnabled({ timeout: 10_000 });
  await expect(status).toHaveAttribute("data-state", "planned");
  await expect(page.locator(".ops-bar.planned")).toHaveCount(6);
  await expect(disrupt).toBeDisabled();
  await approve.click();
  await expect(status).toHaveAttribute("data-state", "executing");
  await expect(page.locator(".ops-bar.active")).toHaveCount(6);
  await expect(disrupt).toBeEnabled();
  await page.waitForTimeout(2500);
  await disrupt.click();
  await expect(page.locator('.ops-row[data-platform="usv2"]')).toHaveClass(/degraded/);
  await expect(approve).toBeEnabled({ timeout: 10_000 });
  await expect(status).toHaveAttribute("data-state", "replanned");
  await expect(approve).toHaveText("Approve revised plan");
  await expect(page.locator(".ops-bar.replan")).toHaveCount(3);
  await expect(page.locator(".ops-bar.lost")).toHaveCount(1);
  await expect(page.locator("#ops-log")).toContainText("3 tasks changed. The intent did not.");
  await approve.click();
  await expect(status).toHaveAttribute("data-state", "done", { timeout: 20_000 });
  await expect(page.locator("#ops-log")).toContainText("Effect delivered");
  await expect(page.locator(".ops-bar.active")).toHaveCount(0);
  // the intent is the one thing that never changed
  await expect(page.locator("#ops-intent-text")).toHaveText(/Maintain continuous surveillance of the strait/);
  // a different intent rebuilds the board
  await page.locator('[data-mission="route"]').click();
  await expect(page.locator("#ops-intent-text")).toHaveText(/Route Tango/);
  await expect(approve).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator(".ops-bar.planned")).toHaveCount(7);
});

test("with reduced motion the fleet demo still runs end to end without waiting on animation", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL, "#fleet"), { waitUntil: "load" });
  await page.evaluate(() => window.astrionFleetDemo.begin());
  await page.locator("#ops-approve").click();
  await expect(page.locator("#ops-status")).toHaveAttribute("data-state", "done", { timeout: 5_000 });
});

test("the evidence demo abstains when the calibration record is withheld and citations open their record", async ({ page, baseURL }) => {
  await page.goto(route(baseURL, "#evidence"), { waitUntil: "load" });
  const answer = page.locator("evidence-demo .ed-answer h3");
  await expect(answer).toHaveText("Yes, pending test lead authorization");
  await page.locator("evidence-demo .ed-switch input").check();
  await expect(answer).toHaveText("Retest readiness is undetermined");
  await expect(page.locator("evidence-demo .ed-count")).toHaveText("2 of 3 available");
  await expect(page.locator('[data-record="CAL-08"]')).toBeHidden();
  await expect(page.locator("evidence-demo .ed-citations a")).toHaveCount(2);
  await page.selectOption("#demo-question", "1");
  await expect(answer).toHaveText("The change cannot be calculated");
  await page.locator("evidence-demo .ed-switch input").uncheck();
  await expect(answer).toHaveText("The error decreased by 1.6 °C");
  await page.locator('evidence-demo .ed-citations a[data-citation="CAL-08"]').click();
  await expect(page.locator('[data-record="CAL-08"]')).toHaveAttribute("open", "");
  await expect(page.locator("#demo-record-CAL-08")).toBeFocused();
  await expect(page.locator("evidence-demo [data-pilot-link]")).toHaveAttribute("data-scenario", "measurement");
});

test("the architecture board switches scenarios and stages, and the pilot link follows", async ({ page, baseURL }) => {
  await page.goto(route(baseURL, "#architecture"), { waitUntil: "load" });
  await page.locator('[data-ma-scenario="flight"]').click();
  await expect(page.locator("[data-ma-title]")).toHaveText("Flight-test data quality");
  await expect(page.locator("[data-ma-detail-title]")).toHaveText("Draft a data-quality finding");
  await page.locator('[data-ma-stage="4"]').click();
  await expect(page.locator("[data-ma-stage-label]")).toHaveText("Human approval");
  await expect(page.locator(".ma-draft")).toBeHidden();
  await page.locator('[data-ma-stage="2"]').click();
  await expect(page.locator(".ma-draft")).toBeVisible();
  await page.locator(".ma-draft summary").click();
  await page.locator('[data-ma-source="reference"]').click();
  await expect(page.locator("[data-ma-source-title]")).toHaveText("R1 / Sample reference");
  await expect(page.locator("[data-ma-pilot]")).toHaveAttribute("data-scenario", "flight");
});

test("domain cards open a brief in a dialog that closes on Escape and returns focus", async ({ page, baseURL }) => {
  await page.goto(route(baseURL, "#domains"), { waitUntil: "load" });
  const card = page.locator('[data-domain="terrain"]');
  await card.click();
  const dialog = page.locator("#domain-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#dialog-title")).toHaveText("Offline maintenance assistant");
  await expect(page.locator("#dialog-image")).toHaveAttribute("src", /terrain\.webp$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
});

test("pilot deep links pre-fill the inquiry and the email draft follows the form", async ({ page, baseURL }) => {
  await page.goto(route(baseURL), { waitUntil: "load" });
  await page.locator('.ops-foot a[data-scenario="orchestration"]').click();
  await expect(page.locator("#pilot-scenario")).toHaveValue("orchestration");
  await page.locator('a[data-inquiry="partnership"]').click();
  await expect(page.locator("#pilot-purpose")).toHaveValue("partnership");
  await expect(page.locator("#pilot-category")).toHaveText("Strategic partnerships");
  await page.fill("#pilot-question", "Three vendors, one strait, one watch officer.");
  const href = await page.locator("#pilot-mail").getAttribute("href");
  expect(href).toContain("mailto:communications@astrion.us");
  expect(decodeURIComponent(href)).toContain("Astrion AI pilot partnership | Mission orchestration across a multi-vendor fleet");
  expect(decodeURIComponent(href)).toContain("Three vendors, one strait, one watch officer.");
  await expect(page.locator("#pilot-body")).toHaveValue(/Use case: Mission orchestration across a multi-vendor fleet/);
  await page.goto(route(baseURL, "?scenario=readiness&inquiry=partnership"), { waitUntil: "load" });
  await expect(page.locator("#pilot-scenario")).toHaveValue("retest");
  await expect(page.locator("#pilot-purpose")).toHaveValue("partnership");
});

test("the mobile menu opens, closes on Escape and navigates", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const button = page.locator("#menu-button");
  const menu = page.locator("#site-menu");
  await button.click();
  await expect(menu).toHaveClass(/\bopen\b/);
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(menu.locator("a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveClass(/\bopen\b/);
  await expect(button).toBeFocused();
  await button.click();
  await menu.locator('a[href="#evaluation"]').click();
  await expect(menu).not.toHaveClass(/\bopen\b/);
  await expect(page).toHaveURL(/#evaluation$/);
  const overflow = await page.locator(".display, .display-xl").evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim().slice(0, 40)));
  expect(overflow).toEqual([]);
});
