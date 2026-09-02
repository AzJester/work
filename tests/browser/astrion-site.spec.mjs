import { test, expect } from "@playwright/test";

function route(baseURL) {
  return new URL("../astrion-site/", baseURL).href;
}

test("the company site loads cleanly, self-contained, with the reference fonts applied", async ({ page, baseURL }) => {
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
  await expect(page.locator("h1")).toHaveText("Missions are won at the seams.");

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      archivo: document.fonts.check('800 16px "Archivo"'),
      mono: document.fonts.check('500 12px "JetBrains Mono"'),
      h1: getComputedStyle(document.querySelector("h1")).fontFamily,
      h1Weight: getComputedStyle(document.querySelector("h1")).fontWeight,
      label: getComputedStyle(document.querySelector(".nav a")).fontFamily,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(fonts.archivo).toBe(true);
  expect(fonts.mono).toBe(true);
  expect(fonts.h1).toMatch(/Archivo/);
  expect(fonts.h1Weight).toBe("800");
  expect(fonts.label).toMatch(/JetBrains Mono/);
  expect(fonts.bg).toMatch(/oklch|rgb\(5, 6, 7\)/);

  // the hero copy sits in the lower part of the viewport, as on the reference
  const box = await page.locator("h1").boundingBox();
  const height = await page.evaluate(() => innerHeight);
  expect(box.y).toBeGreaterThan(height * 0.35);
  expect(await page.locator(".ledger > li")).toHaveCount(6);
  expect(problems).toEqual([]);
});

for (const width of [320, 360, 390, 430, 640, 768, 900, 901, 1024, 1280, 1440, 1920]) {
  test(`the company site stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route(baseURL), { waitUntil: "load" });
    await page.evaluate(() => document.querySelectorAll(".reveal").forEach(element => element.classList.add("in")));
    const layout = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      const selectors = [".header-in", ".hero-in", ".hero .cta", ".ledger > li", ".card", ".rail", ".stat", ".quote", ".split", ".footer .top", ".footer .bottom", ".loop"];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        const label = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`;
        if (box.left < -1 || box.right > innerWidth + 1) issues.push(`${label} leaves the viewport`);
        if (element.scrollWidth > element.clientWidth + 1) issues.push(`${label} clips horizontally`);
      }
      const singleLine = (selector, max) => {
        for (const element of document.querySelectorAll(selector)) {
          const h = element.getBoundingClientRect().height;
          if (h > max) issues.push(`${selector} wraps (${Math.round(h)}px tall)`);
        }
      };
      singleLine(".nav a", 24);
      singleLine(".hero .btn", 60);
      singleLine(".stat .v", parseFloat(getComputedStyle(document.querySelector(".stat .v")).fontSize) * 1.3);
      // the hero shares the container gutters with the header and every section
      const wordmark = document.querySelector(".wordmark").getBoundingClientRect();
      const h1 = document.querySelector(".hero h1").getBoundingClientRect();
      const head = document.querySelector("#problem .section-head").getBoundingClientRect();
      if (Math.abs(h1.left - wordmark.left) > 1 || Math.abs(head.left - wordmark.left) > 1) issues.push(`gutters differ: hero ${h1.left}, header ${wordmark.left}, sections ${head.left}`);
      return issues;
    });
    expect(layout).toEqual([]);
    await expect(page.locator("#menu-btn")).toBeVisible();
  });
}

test("the header solidifies on scroll and the full-screen menu opens, traps focus sensibly, and closes on Escape", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const header = page.locator("#header");
  await expect(header).not.toHaveClass(/\bscrolled\b/);
  expect(await header.evaluate(element => getComputedStyle(element).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(header).toHaveClass(/\bscrolled\b/);

  const menu = page.locator("#site-menu");
  const button = page.locator("#menu-btn");
  await expect(menu).toHaveAttribute("aria-hidden", "true");
  await button.click();
  await expect(menu).toHaveClass(/\bopen\b/);
  await expect(menu).toHaveAttribute("aria-hidden", "false");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#site-menu a").first()).toBeFocused();
  await expect(page.locator("#site-menu ol a")).toHaveText(["01Missions", "02Tech", "03Orchestration", "04Edge", "05Company", "06Intelligence", "07Careers"]);
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveClass(/\bopen\b/);
  await expect(menu).toHaveAttribute("aria-hidden", "true");
  await expect(button).toBeFocused();

  // a menu link navigates and closes the menu
  await button.click();
  await page.locator('#site-menu a[href="#edge"]').click();
  await expect(menu).not.toHaveClass(/\bopen\b/);
  await expect.poll(() => page.evaluate(() => { const r = document.querySelector("#edge").getBoundingClientRect(); return r.top >= 0 && r.top < 200; })).toBe(true);
});

test("in-page navigation reaches every section under the fixed header", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  for (const [label, id] of [["Missions", "missions"], ["Tech", "field-intelligence"], ["Orchestration", "orchestration"], ["Edge", "edge"], ["Company", "proof"]]) {
    await page.locator(`.header a:text-is("${label}")`).click();
    const top = await page.evaluate(id => document.getElementById(id).getBoundingClientRect().top, id);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(200);
  }
  await page.locator(".hero .btn").click();
  expect(await page.evaluate(() => document.getElementById("contact").getBoundingClientRect().top)).toBeLessThan(200);
});

test("reduced motion keeps every section visible and the hero still", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const hidden = await page.evaluate(() => [...document.querySelectorAll(".reveal")].filter(element => getComputedStyle(element).opacity !== "1").length);
  expect(hidden).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(150);
  expect(await page.locator("#hero-media").evaluate(element => element.style.transform)).toBe("");
});
