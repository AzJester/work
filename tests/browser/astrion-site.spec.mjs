import { test, expect } from "@playwright/test";

function route(baseURL, hash = "") {
  return `${new URL("../astrion-site/", baseURL).href}${hash}`;
}

test("the reference-style page loads cleanly with local fonts, imagery, and motion media", async ({ page, baseURL }) => {
  const problems = [];
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => problems.push(`request failed: ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  const origin = new URL(baseURL).origin;
  page.on("request", request => { if (new URL(request.url()).origin !== origin) problems.push(`off-origin request: ${request.url()}`); });

  const response = await page.goto(route(baseURL), { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Astrion · Missions are won at the seams");
  expect((await page.locator("h1").innerText()).replace(/\s+/g, " ").trim()).toBe("MISSIONS ARE WON AT THE SEAMS.");
  await expect(page.locator(".hero-motion")).toHaveCount(1);
  await expect(page.locator("#hero-video")).toHaveAttribute("poster", "assets/hero-poster.webp");
  await expect(page.locator("#hero-video")).toHaveAttribute("loop", "");
  await expect(page.locator("#hero-video source")).toHaveAttribute("src", "assets/hero-loop.mp4");
  await expect(page.locator(".hero-rock-island, .hero-beacon, #hero-video-buffer")).toHaveCount(0);
  await expect(page.locator(".mission-tab")).toHaveCount(6);
  await expect(page.locator(".system-art")).toHaveCount(4);
  await expect(page.locator(".orchestration-art")).toHaveAttribute("src", "assets/mission-orchestration-v2.webp");

  const styles = await page.evaluate(async () => {
    await document.fonts.ready;
    const h1 = getComputedStyle(document.querySelector("h1"));
    const label = getComputedStyle(document.querySelector(".nav a"));
    return { archivo: document.fonts.check('800 16px "Archivo"'), mono: document.fonts.check('500 11px "JetBrains Mono"'), h1: h1.fontFamily, weight: h1.fontWeight, label: label.fontFamily };
  });
  expect(styles).toMatchObject({ archivo: true, mono: true, weight: "800" });
  expect(styles.h1).toMatch(/Archivo/);
  expect(styles.label).toMatch(/JetBrains Mono/);
  const box = await page.locator("h1").boundingBox();
  const height = await page.evaluate(() => innerHeight);
  expect(box.y).toBeGreaterThan(height * 0.35);
  expect(problems).toEqual([]);
});

for (const width of [320, 360, 390, 430, 640, 720, 768, 900, 1001, 1280, 1440, 1920]) {
  test(`the rebuilt site stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route(baseURL), { waitUntil: "load" });
    const issues = await page.evaluate(() => {
      const found = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      const selectors = [".header-in", ".hero-in", ".headline-grid", ".systems-grid", ".mission-layout", ".mission-tabs", ".mission-detail:not([hidden])", ".field-title", ".capability-strip", ".orchestration-head", ".orchestration-map", ".edge-cards", ".engine-grid", ".proof-grid", ".field-notes", ".footer-bottom"];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        if (box.left < -1 || box.right > innerWidth + 1) found.push(`${element.className} leaves the viewport: ${box.left}-${box.right}`);
      }
      const wordmark = document.querySelector(".wordmark").getBoundingClientRect();
      const h1 = document.querySelector(".hero h1").getBoundingClientRect();
      const section = document.querySelector("#problem .headline-grid").getBoundingClientRect();
      if (Math.abs(h1.left - wordmark.left) > 1 || Math.abs(section.left - wordmark.left) > 1) found.push("container gutters differ");
      return found;
    });
    expect(issues).toEqual([]);
    await expect(page.locator("#menu-btn")).toBeVisible();
  });
}

test("long headings and navigation remain readable at the narrow breakpoints", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const overflow = await page.locator("#field-intelligence .field-title, #orchestration .section-title, #edge .section-title").evaluateAll(elements =>
    elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim())
  );
  expect(overflow).toEqual([]);
  const wordmark = await page.locator(".wordmark").boundingBox();
  expect(wordmark.height).toBeGreaterThanOrEqual(44);
  await page.locator("#menu-btn").click();
  const menuOverflow = await page.locator("#site-menu a").evaluateAll(elements =>
    elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim())
  );
  expect(menuOverflow).toEqual([]);

  await page.setViewportSize({ width: 721, height: 900 });
  await page.reload({ waitUntil: "load" });
  const edgeDirection = await page.locator(".edge-layout").evaluate(element => getComputedStyle(element).flexDirection);
  expect(edgeDirection).toBe("column");
});

test("desktop disclosure navigation opens, routes to a pillar, and closes", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const missionsButton = page.locator('[data-panel="missions-panel"]');
  const panel = page.locator("#missions-panel");
  await expect(panel).toBeHidden();
  await missionsButton.click();
  await expect(missionsButton).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await panel.locator('a[href="#ldawif"]').click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/#ldawif$/);
  await expect(page.locator("#tab-ldawif")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pillar-ldawif")).toBeVisible();

  await page.locator('[data-panel="orchestration-panel"]').click();
  await expect(page.locator("#orchestration-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#orchestration-panel")).toBeHidden();
});

test("the mobile menu traps focus sensibly and closes on Escape", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const menu = page.locator("#site-menu");
  const button = page.locator("#menu-btn");
  await button.click();
  await expect(menu).toHaveClass(/\bopen\b/);
  await expect(menu).toHaveAttribute("aria-hidden", "false");
  await expect(menu.locator("a").first()).toBeFocused();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu.locator("a").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.locator("a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveClass(/\bopen\b/);
  await expect(menu).toHaveAttribute("aria-hidden", "true");
  await expect(button).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
});

test("mission pillars switch with click and keyboard and expose the requested details", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL, "#missions"), { waitUntil: "load" });
  const lunar = page.locator("#tab-lunar");
  await lunar.click();
  await expect(lunar).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pillar-lunar")).toBeVisible();
  await expect(page.locator("#pillar-lunar .mission-tags li")).toHaveText(["Transport", "Power", "Communications", "Habitation", "In-situ resources"]);
  await expect(page.locator("#mission-image")).toHaveAttribute("src", "assets/artemis-lunar-v2.webp");
  await lunar.press("Home");
  await expect(page.locator("#tab-iamd")).toBeFocused();
  await expect(page.locator("#pillar-iamd")).toBeVisible();
  await page.locator("#tab-ldawif").click();
  await expect(page.locator("#pillar-ldawif .textlink")).toHaveAttribute("href", "../astrion-division/ldawif/");
});

test("a late mission image response cannot replace the currently selected pillar", async ({ page, baseURL }) => {
  await page.route("**/space-mission.png", async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.route("**/artemis-lunar-v2.webp", async route => {
    await new Promise(resolve => setTimeout(resolve, 40));
    await route.continue();
  });
  await page.goto(route(baseURL, "#missions"), { waitUntil: "load" });
  await page.locator("#tab-space").click();
  await page.locator("#tab-lunar").click();
  await expect(page.locator("#tab-lunar")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#mission-image")).toHaveAttribute("src", "assets/artemis-lunar-v2.webp");
  await page.waitForTimeout(700);
  await expect(page.locator("#mission-image")).toHaveAttribute("src", "assets/artemis-lunar-v2.webp");
  await expect(page.locator("#mission-image")).not.toHaveClass(/\bchanging\b/);
});

test("the header solidifies on scroll and reduced motion keeps content visible", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const header = page.locator("#header");
  await expect(header).not.toHaveClass(/\bscrolled\b/);
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(header).toHaveClass(/\bscrolled\b/);
  expect(await page.evaluate(() => [...document.querySelectorAll(".reveal")].filter(element => getComputedStyle(element).opacity !== "1").length)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.locator(".hero-motion").evaluateAll(videos => videos.every(video => video.paused))).toBe(true);
});

test("the hero uses a single native loop with no composited duplicate scene", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const primary = page.locator("#hero-video");
  await expect(page.locator(".hero-motion")).toHaveCount(1);
  await expect(primary).toHaveAttribute("loop", "");
  await expect(primary.locator("source")).toHaveAttribute("src", "assets/hero-loop.mp4");
  await expect(page.locator(".hero-rock-island, .hero-beacon, #hero-video-buffer")).toHaveCount(0);
  const duration = await primary.evaluate(video => new Promise(resolve => {
    if (Number.isFinite(video.duration)) resolve(video.duration);
    else video.addEventListener("loadedmetadata", () => resolve(video.duration), { once: true });
  }));
  expect(duration).toBeGreaterThan(4);
  expect(duration).toBeLessThan(4.3);
});

test("orchestration labels sit below the unobstructed image", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL, "#orchestration"), { waitUntil: "load" });
  const geometry = await page.evaluate(() => {
    const visual = document.querySelector(".orchestration-visual").getBoundingClientRect();
    const nodes = [...document.querySelectorAll(".orchestration-legend .node")].map(node => node.getBoundingClientRect());
    return { visualBottom: visual.bottom, nodeTops: nodes.map(node => node.top) };
  });
  expect(geometry.nodeTops).toHaveLength(4);
  for (const top of geometry.nodeTops) expect(top).toBeGreaterThanOrEqual(geometry.visualBottom - 1);
  await expect(page.locator(".mission-detail .counter")).toHaveCount(0);
});

test("scroll progress and parallax respond without breaking the field headline", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  expect(await page.locator("html").getAttribute("class")).not.toMatch(/\bstill\b/);
  const titleLines = page.locator(".field-title .title-line");
  await expect(titleLines).toHaveCount(2);
  await expect(titleLines.nth(1)).toHaveText("intelligence engine.");
  expect(await titleLines.nth(1).evaluate(element => element.getClientRects().length)).toBe(1);
  await page.evaluate(() => window.scrollTo(0, document.querySelector("#field-intelligence").offsetTop));
  await expect(page.locator("#scroll-progress")).toHaveClass(/\bon\b/);
  expect(await page.locator("#scroll-progress-bar").evaluate(element => getComputedStyle(element).transform)).not.toBe("none");
  await expect.poll(() => page.locator("#field-intelligence .section-media").getAttribute("style")).toMatch(/translate3d/);
});

test("the active mission detail follows its control on a phone", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL, "#missions"), { waitUntil: "load" });
  await page.locator("#tab-lunar").click();
  await expect(page.locator("#lunar > #pillar-lunar")).toBeVisible();
  const gap = await page.evaluate(() => {
    const tab = document.querySelector("#tab-lunar").getBoundingClientRect();
    const panel = document.querySelector("#pillar-lunar").getBoundingClientRect();
    return Math.round(panel.top - tab.bottom);
  });
  expect(gap).toBeLessThanOrEqual(8);
});

test("readable copy is not dimmed as it moves through the viewport", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const copy = page.locator("#problem .body-copy");
  await page.evaluate(() => window.scrollTo(0, document.querySelector("#problem").offsetTop));
  await expect(copy).toHaveCSS("opacity", "1");
});

test("direct section links reveal their content immediately", async ({ page, baseURL }) => {
  await page.goto(route(baseURL, "#field-intelligence"), { waitUntil: "load" });
  await expect(page.locator(".field-title")).toBeVisible();
  await expect(page.locator(".field-title")).toHaveClass(/\bin\b/);
  await expect(page.locator("#field-intelligence .body-copy")).toBeVisible();
});
