import { test, expect } from "@playwright/test";

function route(baseURL, hash = "") {
  return `${new URL("../mission-intelligence/", baseURL).href}${hash}`;
}

test("the page loads cleanly with the brand kit fonts and the globe", async ({ page, baseURL }) => {
  const problems = [];
  const origin = new URL(baseURL).origin;
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => problems.push(`request failed: ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (new URL(request.url()).origin !== origin) problems.push(`off-origin request: ${request.url()}`); });

  const response = await page.goto(route(baseURL), { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Astrion · Agentic AI for the mission");
  await expect(page.locator("h1")).toHaveText("Agentic AI for the mission.");
  const styles = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      archivo: document.fonts.check('700 16px "Archivo"'),
      mono: document.fonts.check('500 11px "JetBrains Mono"'),
      h1: getComputedStyle(document.querySelector("h1")).fontFamily,
      label: getComputedStyle(document.querySelector(".label")).fontFamily,
      weight: getComputedStyle(document.querySelector("h1")).fontWeight,
    };
  });
  expect(styles).toMatchObject({ archivo: true, mono: true, weight: "700" });
  expect(styles.h1).toMatch(/Archivo/);
  expect(styles.label).toMatch(/JetBrains Mono/);
  const orb = await page.locator("#orb").evaluate(canvas => ({ width: canvas.width, height: canvas.height, css: canvas.getBoundingClientRect().width }));
  expect(orb.width).toBeGreaterThan(300);
  expect(orb.width).toBe(orb.height);
  expect(orb.css).toBeGreaterThan(300);
  // the globe straddles the first light band and the dark band below it
  const boxes = await page.evaluate(() => {
    const orb = document.querySelector(".orb-wrap").getBoundingClientRect();
    const dark = document.querySelector("#build").getBoundingClientRect();
    return { orbMiddle: orb.top + orb.height / 2, darkTop: dark.top };
  });
  expect(Math.abs(boxes.orbMiddle - boxes.darkTop)).toBeLessThan(4);
  expect(problems).toEqual([]);
});

for (const width of [320, 360, 390, 430, 640, 720, 768, 900, 1001, 1280, 1440, 1920]) {
  test(`the page stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route(baseURL), { waitUntil: "load" });
    const issues = await page.evaluate(() => {
      const found = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      for (const element of document.querySelectorAll(".site-bar, .hero .wrap, .orb-wrap, .trio, .list-head, .agents, .lines ol, .stats, .contact .wrap, .foot")) {
        const box = element.getBoundingClientRect();
        if (box.left < -1 || box.right > innerWidth + 1) found.push(`${element.className} leaves the viewport: ${Math.round(box.left)}-${Math.round(box.right)}`);
      }
      for (const element of document.querySelectorAll("h1, h2, h3")) if (element.scrollWidth > element.clientWidth + 1) found.push(`heading overflows: ${element.textContent.trim().slice(0, 30)}`);
      return found;
    });
    expect(issues).toEqual([]);
    await expect(page.locator(".site-nav .button")).toBeVisible();
  });
}

test("anchors reach their bands and the contact buttons point at Astrion", async ({ page, baseURL }) => {
  await page.goto(route(baseURL), { waitUntil: "load" });
  await page.locator('.site-nav a[href="#agents"]').click();
  await expect(page).toHaveURL(/#agents$/);
  await expect(page.locator("#agents-title")).toBeInViewport();
  await page.locator('.site-nav a[href="#contact"]').click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator("#contact-title")).toBeInViewport();
  await expect(page.locator('#contact a[href^="mailto:communications@astrion.us"]')).toBeVisible();
  await expect(page.locator('#contact a[href="https://astrion.us/"]')).toBeVisible();
  const revealed = await page.locator("#contact .reveal").evaluateAll(elements => elements.every(element => element.classList.contains("in")));
  expect(revealed).toBe(true);
});

test("with reduced motion the globe still renders a frame and nothing animates", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const painted = await page.locator("#orb").evaluate(canvas => {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) lit++;
    return lit;
  });
  expect(painted).toBeGreaterThan(50);
  await expect(page.locator(".reveal").first()).toHaveClass(/\bin\b/);
});
