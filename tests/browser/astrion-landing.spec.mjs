import { test, expect } from "@playwright/test";

const SEGMENTS = [
  "Integrated Air and Missile Defense",
  "Lifecycle Management and Cyber Warfare",
  "Layered Defense, Autonomous Warfare & Integrated Fires",
  "Space Warfighting",
  "Critical Infrastructure Protection",
  "Exploration and Lunar Presence",
];

// Astrion Brand Guide 2026: the ten palette values, as computed RGB
const PALETTE = ["#102A47", "#33C7EB", "#DEFBFD", "#090A0B", "#0E0F11", "#1C1E22", "#3E3F41", "#7F848E", "#8E8E8D", "#E7E5DF"]
  .map(hex => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`);

function route(baseURL) {
  return new URL("../astrion/", baseURL).href;
}

test("the Astrion page loads cleanly and renders all six mission segments", async ({ page, baseURL }) => {
  const problems = [];
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => problems.push(`request failed: ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  const origin = new URL(baseURL).origin;
  page.on("request", request => { if (new URL(request.url()).origin !== origin) problems.push(`off-origin request: ${request.url()}`); });

  const response = await page.goto(route(baseURL), { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Astrion · Mission Solutions Portfolio");

  const segments = page.locator("ol.segments > li.segment");
  await expect(segments).toHaveCount(6);
  await expect(segments.locator("h3")).toHaveText(SEGMENTS);
  for (let index = 0; index < 6; index += 1) {
    await segments.nth(index).scrollIntoViewIfNeeded();
    await expect(segments.nth(index)).toHaveClass(/\bin\b/);
    await expect(segments.nth(index).locator(".seg-top svg")).toBeVisible();
  }
  await expect(page.locator(".sol")).toHaveCount(21);

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      display: document.fonts.check('800 16px "Archivo"'),
      text: document.fonts.check('400 16px "Archivo"'),
      mono: document.fonts.check('500 11px "JetBrains Mono"'),
      h1: getComputedStyle(document.querySelector("h1")).fontFamily,
      h1Weight: getComputedStyle(document.querySelector("h1")).fontWeight,
      label: getComputedStyle(document.querySelector(".mono-label")).fontFamily,
    };
  });
  expect(fonts.display && fonts.text && fonts.mono).toBe(true);
  expect(fonts.h1).toMatch(/^"?Archivo"?,/);
  expect(fonts.h1Weight).toBe("800");
  expect(fonts.label).toMatch(/^"?JetBrains Mono"?,/);

  await expect(page.locator(".nav .logo img")).toHaveAttribute("alt", "Astrion");
  expect(await page.locator(".nav .logo img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  for (const img of await page.locator("main img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator("#ldawif .seglink")).toHaveAttribute("href", "../astrion-division/ldawif/");
  expect(await page.locator("#eval").evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
  expect(problems).toEqual([]);
});

test("every rendered color comes from the 2026 palette, with no shadows and square corners", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const issues = await page.evaluate(palette => {
    const ok = new Set([...palette, "rgba(0, 0, 0, 0)"]);
    const found = [];
    for (const element of document.querySelectorAll("body *")) {
      if (element.closest("svg") && element.tagName.toLowerCase() !== "svg") continue;
      const style = getComputedStyle(element);
      if (style.display === "none") continue;
      const label = `${element.tagName.toLowerCase()}.${String(element.className.baseVal ?? element.className).split(" ")[0]}`;
      for (const prop of ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"]) {
        if (prop.startsWith("border") && style[prop.replace("Color", "Width")] === "0px") continue;
        if (!ok.has(style[prop])) found.push(`${label} ${prop} ${style[prop]}`);
      }
      if (style.boxShadow !== "none") found.push(`${label} box-shadow`);
      if (style.textShadow !== "none") found.push(`${label} text-shadow`);
      if (style.backgroundImage !== "none") found.push(`${label} background-image`);
      if (parseFloat(style.borderTopLeftRadius) > 2) found.push(`${label} radius ${style.borderTopLeftRadius}`);
    }
    return [...new Set(found)];
  }, PALETTE);
  expect(issues).toEqual([]);
});

for (const width of [320, 360, 390, 430, 460, 640, 680, 681, 768, 920, 921, 1024, 1080, 1081, 1280, 1440]) {
  test(`the Astrion page stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route(baseURL), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.querySelectorAll(".reveal").forEach(element => element.classList.add("in")));

    const layout = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      const selectors = [".nav-in", ".hero h1", ".hero .lead", ".strip", ".segment", ".filter", ".pf-head", ".sol", ".plays", ".lifecycle", ".cap", ".eval", ".eval-bar", ".stat", ".founder", ".card", ".card-panel", ".spec .row", ".foot-top", ".runner"];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        if (!box.width) continue;
        const label = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`;
        if (box.left < -1 || box.right > innerWidth + 1) issues.push(`${label} leaves the viewport`);
        if (element.scrollWidth > element.clientWidth + 1) issues.push(`${label} clips horizontally`);
      }
      // the hero headline is one or two lines, never three
      const h1 = document.querySelector(".hero h1");
      const lines = Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight));
      if (lines > 2) issues.push(`hero headline runs ${lines} lines`);
      // single-line controls: a wrapped nav button, chip, or stat is a layout defect the overflow check cannot see
      const singleLine = (selector, max) => {
        for (const element of document.querySelectorAll(selector)) {
          const height = element.getBoundingClientRect().height;
          if (height > max) issues.push(`${selector} wraps (${Math.round(height)}px tall)`);
        }
      };
      singleLine(".nav .btn", 44);
      singleLine(".nav-links a.link", 24);
      singleLine(".chip", 40);
      singleLine(".stat .num", parseFloat(getComputedStyle(document.querySelector(".stat .num")).fontSize) * 1.3);
      // the hero shares the wrap gutters with the nav and every section
      const logo = document.querySelector(".nav .logo").getBoundingClientRect();
      const heroLabel = document.querySelector(".hero .mono-label").getBoundingClientRect();
      const opener = document.querySelector("#segments .opener").getBoundingClientRect();
      if (Math.abs(heroLabel.left - logo.left) > 1 || Math.abs(opener.left - logo.left) > 1) issues.push(`hero gutter ${heroLabel.left} differs from nav ${logo.left} / sections ${opener.left}`);
      const navIn = document.querySelector(".nav-in");
      const cta = document.querySelector(".nav .btn").getBoundingClientRect();
      const gutter = navIn.getBoundingClientRect().right - parseFloat(getComputedStyle(navIn).paddingRight);
      if (cta.right > gutter + 1) issues.push(`nav CTA breaks the right gutter (${Math.round(cta.right)} > ${Math.round(gutter)})`);
      return issues;
    });
    expect(layout).toEqual([]);
    await expect(page.locator(".nav .btn")).toBeVisible();
    await expect(page.locator(".nav .logo img")).toBeVisible();
  });
}

test("the nav sits clear over the hero photograph and turns solid once the page moves", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const nav = page.locator("#nav");
  await expect(nav).toHaveClass(/\bover\b/);
  await page.evaluate(() => scrollTo(0, 400));
  await expect(nav).not.toHaveClass(/\bover\b/);
  await expect.poll(() => nav.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(9, 10, 11)");
});

test("the portfolio filter narrows to one segment, and a link to a hidden row opens its segment", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const filter = page.locator("#pf-filter");
  await filter.scrollIntoViewIfNeeded();
  await expect(page.locator(".sol:visible")).toHaveCount(21);

  await filter.getByRole("button", { name: /^IAMD/ }).click();
  await expect(filter.getByRole("button", { name: /^IAMD/ })).toHaveAttribute("aria-pressed", "true");
  await expect(filter.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".sol:visible")).toHaveCount(3);
  await expect(page.locator("#pf-status")).toHaveText("Showing 3 solution areas · Integrated Air and Missile Defense");

  // Integrated Fires lives in LDAWIF, which the IAMD filter hides: following the link opens LDAWIF and lands on the row
  await page.locator("#ldawif").getByRole("link", { name: "Integrated Fires" }).click();
  await expect(page.locator("#pf-ldawif")).toBeVisible();
  await expect(page.locator("#pf-iamd")).toBeHidden();
  await expect(filter.getByRole("button", { name: /^LDAWIF/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sol-integrated-fires")).toBeInViewport();
  expect(await page.locator("#sol-integrated-fires").evaluate(element => element.matches(":target"))).toBe(true);

  await filter.getByRole("button", { name: /^All/ }).click();
  await expect(page.locator(".sol:visible")).toHaveCount(21);
  await expect(page.locator("#pf-status")).toHaveText("Showing all 21 solution areas");

  // a deep link straight to a row opens its segment on load
  await page.goto(route(baseURL) + "#sol-space-access", { waitUntil: "load" });
  await expect(page.locator("#sol-space-access")).toBeVisible();
});

test("in-page navigation reaches every section", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  for (const [name, id] of [["Segments", "segments"], ["Portfolio", "portfolio"], ["Approach", "approach"], ["Company", "company"]]) {
    await page.locator(".nav-links").getByRole("link", { name, exact: true }).click();
    await expect.poll(() => page.evaluate(target => {
      const box = document.getElementById(target).getBoundingClientRect();
      return box.top < innerHeight && box.bottom > 0;
    }, id)).toBe(true);
  }
  await page.locator(".nav .btn").click();
  await expect(page.locator("#contact h2")).toBeInViewport();
});

test("reduced motion keeps every section visible and the console static", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const hidden = await page.evaluate(() => [...document.querySelectorAll(".reveal")]
    .filter(element => getComputedStyle(element).opacity !== "1").length);
  expect(hidden).toBe(0);
  await expect(page.locator("#eval-state")).toHaveText("VALIDATED");
  await expect(page.locator("#eval-run")).toHaveText("RUN 07");
  await expect(page.locator("#eval-res")).toHaveText("1.1%");
  await expect(page.locator("#motion-toggle")).toHaveText("Resume motion");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

  // an explicit resume lifts the OS-level stillness for this visitor
  await page.locator("#motion-toggle").scrollIntoViewIfNeeded();
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).toHaveClass(/\bmotion\b/);
  await expect(page.locator("#motion-toggle")).toHaveText("Pause motion");
  await page.locator("#approach .loop").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
});

test("the page has its own pause control for the ambient motion, and the choice survives a reload", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const toggle = page.locator("#motion-toggle");
  await expect(toggle).toHaveText("Pause motion");
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);

  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect(toggle).toHaveText("Resume motion");
  await expect(page.locator("html")).toHaveClass(/\bstill\b/);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

  await page.reload({ waitUntil: "load" });
  await expect(page.locator("html")).toHaveClass(/\bstill\b/);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator("#motion-toggle")).toHaveText("Resume motion");
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).not.toHaveClass(/\bstill\b/);
  await expect(page.locator("#motion-toggle")).toHaveText("Pause motion");
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
});

test("the evaluation console validates each run before it starts the next", async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  await page.locator(".eval").scrollIntoViewIfNeeded();
  await expect(page.locator("#eval-state")).toHaveText("CALIBRATING");
  await expect(page.locator("#eval-state")).toHaveText("CONVERGING", { timeout: 30_000 });
  await expect(page.locator("#eval-run")).toHaveText("RUN 01");
  await expect(page.locator("#eval-state")).toHaveText("VALIDATED", { timeout: 30_000 });
  await expect(page.locator("#eval-run")).toHaveText("RUN 01");
  await page.waitForTimeout(2000);
  await expect(page.locator("#eval-state")).toHaveText("VALIDATED");
  await expect(page.locator("#eval-run")).toHaveText("RUN 01");
  expect(parseFloat(await page.locator("#eval-res").textContent())).toBeLessThan(2.5);

  // a later run starts from a nearly converged window, so it must still arm, converge, and validate
  await expect(page.locator("#eval-run")).toHaveText("RUN 02", { timeout: 30_000 });
  await expect(page.locator("#eval-state")).toHaveText("CALIBRATING");
  await expect(page.locator("#eval-state")).toHaveText("VALIDATED", { timeout: 60_000 });
  await expect(page.locator("#eval-run")).toHaveText("RUN 02");
});
