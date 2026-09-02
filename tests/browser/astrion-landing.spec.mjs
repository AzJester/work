import { test, expect } from "@playwright/test";

const SEGMENTS = [
  "Integrated Air and Missile Defense",
  "Lifecycle Management and Cyber Warfare",
  "Layered Defense, Autonomous Warfare & Integrated Fires",
  "Space Warfighting",
  "Critical Infrastructure Protection",
  "Exploration and Lunar Presence",
];

function route(baseURL) {
  return new URL("../astrion/", baseURL).href;
}

test("the Astrion landing page loads cleanly and renders all six mission segments", async ({ page, baseURL }) => {
  const problems = [];
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => problems.push(`request failed: ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });

  const response = await page.goto(route(baseURL), { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Astrion · Defend This World. Build the Next.");

  const segments = page.locator("ol.segments > li.segment");
  await expect(segments).toHaveCount(6);
  await expect(segments.locator("h3")).toHaveText(SEGMENTS);
  for (let index = 0; index < 6; index += 1) {
    await segments.nth(index).scrollIntoViewIfNeeded();
    await expect(segments.nth(index)).toHaveClass(/\bin\b/);
    await expect(segments.nth(index).locator(".glyph svg")).toBeVisible();
  }

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      bold: document.fonts.check('700 16px "Archivo"'),
      regular: document.fonts.check('400 16px "Archivo"'),
      h1: getComputedStyle(document.querySelector("h1")).fontFamily,
    };
  });
  expect(fonts.bold).toBe(true);
  expect(fonts.regular).toBe(true);
  expect(fonts.h1).toMatch(/Archivo/);

  await expect(page.locator(".nav .logo img")).toHaveAttribute("alt", "Astrion");
  await expect(page.locator("#ldawif .seglink")).toHaveAttribute("href", "../astrion-division/ldawif/");
  expect(await page.locator("#terrain").evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
  expect(await page.locator("#eval").evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
  expect(problems).toEqual([]);
});

for (const width of [320, 390, 640, 768, 940, 1024, 1440]) {
  test(`the Astrion landing page stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route(baseURL), { waitUntil: "load" });
    await page.evaluate(() => document.querySelectorAll(".reveal").forEach(element => element.classList.add("in")));

    const layout = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      const selectors = [".nav-in", ".hero h1", ".lede", ".telem", ".nodes", ".segment", ".stat", ".cap", ".eval", ".card", ".co-featured", ".contact .panel", ".foot-in"];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        const label = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`;
        if (box.left < -1 || box.right > innerWidth + 1) issues.push(`${label} leaves the viewport`);
        if (element.scrollWidth > element.clientWidth + 1) issues.push(`${label} clips horizontally`);
      }
      return issues;
    });
    expect(layout).toEqual([]);
    await expect(page.locator(".nav .btn-primary")).toBeVisible();
    await expect(page.locator(".nav .logo img")).toBeVisible();
  });
}

test("reduced motion keeps every section visible and the consoles static", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const hidden = await page.evaluate(() => [...document.querySelectorAll(".reveal")]
    .filter(element => getComputedStyle(element).opacity !== "1").length);
  expect(hidden).toBe(0);
  await expect(page.locator("#eval-state")).toHaveText("VALIDATED");
  await expect(page.locator("#eval-run")).toHaveText("RUN 07");
  await expect(page.locator("#eval-res")).toHaveText("1.1%");
});

test("in-page navigation reaches every section and the hero field accepts a survey fix", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });

  for (const [name, id] of [["Mission segments", "segments"], ["Approach", "approach"], ["Company", "company"]]) {
    await page.locator(".nav-links").getByRole("link", { name, exact: true }).click();
    await expect.poll(() => page.evaluate(target => {
      const box = document.getElementById(target).getBoundingClientRect();
      return box.top < innerHeight && box.bottom > 0;
    }, id)).toBe(true);
  }
  await page.locator(".nav .btn-primary").click();
  await expect(page.locator("#contact h2")).toBeInViewport();

  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const box = await page.locator("#terrain").boundingBox();
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.45);
  await page.mouse.click(box.x + box.width * 0.82, box.y + box.height * 0.45);
  await expect(page.locator("#cf-fix")).toHaveText("1");
  await expect(page.locator("#terrainhint")).toHaveClass(/\boff\b/);
});
