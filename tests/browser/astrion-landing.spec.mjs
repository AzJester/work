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
  const origin = new URL(baseURL).origin;
  page.on("request", request => { if (new URL(request.url()).origin !== origin) problems.push(`off-origin request: ${request.url()}`); });

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
  // the canvases are sized by their resize() handlers, not left at the 300x150 default
  const sized = canvas => {
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, canvas.id === "terrain" ? 1.5 : 2);
    return canvas.width === Math.round(box.width * dpr) && canvas.height === Math.round(box.height * dpr) && canvas.width > 300;
  };
  expect(await page.locator("#terrain").evaluate(sized)).toBe(true);
  expect(await page.locator("#eval").evaluate(sized)).toBe(true);
  expect(problems).toEqual([]);
});

for (const width of [320, 360, 390, 430, 460, 640, 768, 940, 941, 1024, 1041, 1100, 1440]) {
  test(`the Astrion landing page stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route(baseURL), { waitUntil: "load" });
    await page.evaluate(() => document.querySelectorAll(".reveal").forEach(element => element.classList.add("in")));

    const layout = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
      const selectors = [".nav-in", ".hero h1", ".lede", ".telem", ".nodes", ".segment", ".stat", ".cap", ".eval", ".card", ".co-featured", ".contact .panel", ".foot-in", ".foci", ".lifecycle", ".eval-bar", ".rail"];
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        const label = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`;
        if (box.left < -1 || box.right > innerWidth + 1) issues.push(`${label} leaves the viewport`);
        if (element.scrollWidth > element.clientWidth + 1) issues.push(`${label} clips horizontally`);
      }
      // single-line controls and values: a wrapped nav button, stat, or notched chip is a layout defect the overflow check cannot see
      const singleLine = (selector, max) => {
        for (const element of document.querySelectorAll(selector)) {
          const height = element.getBoundingClientRect().height;
          if (height > max) issues.push(`${selector} wraps (${Math.round(height)}px tall)`);
        }
      };
      singleLine(".nav .btn", 50);
      singleLine(".nav-links a.link", 24);
      singleLine(".stat .num", parseFloat(getComputedStyle(document.querySelector(".stat .num")).fontSize) * 1.3);
      singleLine(".node .spine", 32);
      singleLine(".chainlink", 36);
      // the hero shares the wrap gutters with the nav and every section
      const logo = document.querySelector(".nav .logo").getBoundingClientRect();
      const h1 = document.querySelector(".hero h1").getBoundingClientRect();
      const head = document.querySelector("#segments .sec-head").getBoundingClientRect();
      if (Math.abs(h1.left - logo.left) > 1 || Math.abs(head.left - logo.left) > 1) issues.push(`hero gutter ${h1.left} differs from nav ${logo.left} / sections ${head.left}`);
      const navIn = document.querySelector(".nav-in");
      const navBox = navIn.getBoundingClientRect();
      const cta = document.querySelector(".nav .btn-primary").getBoundingClientRect();
      const gutter = navBox.right - parseFloat(getComputedStyle(navIn).paddingRight);
      if (cta.right > gutter + 1) issues.push(`nav CTA breaks the right gutter (${Math.round(cta.right)} > ${Math.round(gutter)})`);
      // the founder card stacks on narrow phones instead of squeezing its text beside the avatar
      const founder = document.querySelector(".co-featured");
      const founderColumns = getComputedStyle(founder).gridTemplateColumns.trim().split(/\s+/).length;
      const who = founder.querySelector(".who").getBoundingClientRect();
      if (innerWidth <= 420 && founderColumns !== 1) issues.push(`founder card keeps ${founderColumns} columns at ${innerWidth}px`);
      if (who.width < 180) issues.push(`founder text column is only ${Math.round(who.width)}px wide`);
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
  await expect(page.locator("#motion-toggle")).toHaveText("Resume motion");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.locator("#terrain").evaluate(canvas => getComputedStyle(canvas).pointerEvents)).toBe("none");

  // the clock keeps time under the OS setting: only the page's own pause freezes it
  const clock = await page.locator("#navclk").textContent();
  await expect.poll(() => page.locator("#navclk").textContent(), { timeout: 3000 }).not.toBe(clock);

  // an explicit resume lifts the OS-level stillness for this visitor, canvases and CSS alike
  await page.locator("#motion-toggle").scrollIntoViewIfNeeded();
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).toHaveClass(/\bmotion\b/);
  await expect(page.locator("#motion-toggle")).toHaveText("Pause motion");
  expect(await page.locator("#terrain").evaluate(canvas => getComputedStyle(canvas).pointerEvents)).toBe("auto");
  expect(await page.locator("#terrainhint").evaluate(element => getComputedStyle(element).display)).toBe("block");
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
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
  expect(await page.locator("#terrain").evaluate(canvas => getComputedStyle(canvas).pointerEvents)).toBe("none");
  const clock = await page.locator("#navclk").textContent();
  await page.waitForTimeout(1500);
  expect(await page.locator("#navclk").textContent()).toBe(clock);

  await page.reload({ waitUntil: "load" });
  await expect(page.locator("html")).toHaveClass(/\bstill\b/);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator("#motion-toggle")).toHaveText("Resume motion");
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).not.toHaveClass(/\bstill\b/);
  await expect(page.locator("#motion-toggle")).toHaveText("Pause motion");
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
});

test("cards lift on hover and the evaluation console validates each run before it starts the next", async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route(baseURL), { waitUntil: "load" });
  const segment = page.locator("#space");
  await segment.scrollIntoViewIfNeeded();
  await expect(segment).toHaveClass(/\bin\b/);
  // the page scrolls smoothly: let the scroll settle so the hover pointer stays over the card
  await page.waitForFunction(() => new Promise(resolve => { const start = scrollY; setTimeout(() => resolve(scrollY === start), 250); }));
  await segment.hover();
  await expect.poll(() => segment.evaluate(element => getComputedStyle(element).transform)).toBe("matrix(1, 0, 0, 1, 0, -5)");

  await page.locator("#approach").scrollIntoViewIfNeeded();
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

test.describe("touch input", () => {
  test.use({ hasTouch: true });
  test("a touch on the hero field scrolls the page instead of dropping a survey fix", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(route(baseURL), { waitUntil: "load" });
    // a coarse primary pointer keeps the field inert at the CSS level, so a tap can only scroll
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(false);
    expect(await page.locator("#terrain").evaluate(canvas => getComputedStyle(canvas).pointerEvents)).toBe("none");
    const box = await page.locator("#terrain").boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height * 0.45);
    await page.waitForTimeout(300);
    await expect(page.locator("#cf-fix")).toHaveText("0");
  });
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

  // the hint points at surveyable ground: a click where it sits drops a fix too, and a secondary button never does
  const hint = await page.locator("#terrainhint").boundingBox();
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [hint.x + hint.width / 2, hint.y + hint.height / 2])).toBe("terrain");
  await page.mouse.click(hint.x + hint.width / 2, hint.y + hint.height / 2);
  await expect(page.locator("#cf-fix")).toHaveText("2");
  await page.mouse.click(box.x + box.width * 0.82, box.y + box.height * 0.45, { button: "right" });
  await expect(page.locator("#cf-fix")).toHaveText("2");

  // the handler itself (not only the CSS gate) ignores touch and secondary buttons and accepts a pen
  const synthetic = (pointerType, button) => page.locator("#terrain").evaluate((canvas, init) => {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + r.width * 0.8, clientY: r.top + r.height * 0.45, ...init }));
  }, { pointerType, button });
  await synthetic("touch", 0);
  await synthetic("mouse", 2);
  await expect(page.locator("#cf-fix")).toHaveText("2");
  await synthetic("pen", 0);
  await expect(page.locator("#cf-fix")).toHaveText("3");
});

for (const width of [1024, 1180]) {
  test(`the survey hint sits over surveyable ground at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(route(baseURL), { waitUntil: "load" });
    const hint = await page.locator("#terrainhint").boundingBox();
    for (const fx of [0.1, 0.5, 0.9]) {
      const id = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [hint.x + hint.width * fx, hint.y + hint.height / 2]);
      expect(id).toBe("terrain");
    }
  });
}
