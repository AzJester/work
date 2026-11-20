import { test, expect } from "@playwright/test";

const route = (baseURL, hash = "") => `${new URL("../mission-intelligence/", baseURL).href}${hash}`;

/** Open the page and wait until the intro has finished and the fonts are in. */
async function open(page, baseURL, hash = "") {
  const response = await page.goto(route(baseURL, hash), { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.classList.contains("is-ready") && Boolean(window.astrion), null, { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  return response;
}

/** Jump to a scroll position and wait for the page's smoothed scroll value to catch up. */
async function scrollTo(page, y) {
  await page.evaluate(top => window.scrollTo(0, top), Math.max(0, Math.round(y)));
  await page.waitForFunction(() => Math.abs(window.astrion.scroll() - scrollY) < 0.5);
}

const docTop = (page, id) => page.evaluate(name => Math.round(document.getElementById(name).getBoundingClientRect().top + scrollY), id);

/** Every fitted display line, or each stacked word on phones, with the width of the column it should span. */
const fittedLines = () => {
  const stacked = innerWidth <= 600;
  return Array.from(document.querySelectorAll(".lk")).flatMap(line => {
    const parts = stacked && line.querySelector(".seg") ? Array.from(line.querySelectorAll(".seg")) : [line.querySelector(".lk-in")];
    return parts.map(part => ({ text: part.textContent.trim(), width: part.getBoundingClientRect().width, column: line.clientWidth }));
  });
};

/** Things that would make the page scroll sideways or lose content off the edge. */
const containment = () => {
  const found = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
  for (const element of document.querySelectorAll(".bar, .hero-copy, .statement .wrap, .band-head, .moves, .row, .domains-pin, .rules, .stats, .proof-note, .contact-foot, .foot-top, .foot-mark, .foot-bottom")) {
    const box = element.getBoundingClientRect();
    if (box.width && (box.left < -1 || box.right > innerWidth + 1)) found.push(`${element.className} leaves the viewport: ${Math.round(box.left)} to ${Math.round(box.right)}`);
  }
  for (const element of document.querySelectorAll(".h2, .row-t, .domain h3, .rules p, .stats dd, .word")) {
    const box = element.getBoundingClientRect();
    if (element.closest(".domains-track")) continue;
    if (box.right > innerWidth + 1) found.push(`text runs off the edge: ${element.textContent.trim().slice(0, 30)}`);
  }
  return found;
};

const litPixels = canvas => {
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) lit++;
  return lit;
};

test("the page loads cleanly with the brand fonts, the intro and a moving globe", async ({ page, baseURL }) => {
  const problems = [];
  const origin = new URL(baseURL).origin;
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => problems.push(`request failed: ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { const url = request.url(); if (!/^(?:data|blob):/.test(url) && new URL(url).origin !== origin) problems.push(`off-origin request: ${url}`); });

  const response = await open(page, baseURL);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Astrion · Agentic AI for the mission");
  await expect(page.getByRole("heading", { level: 1, name: "Agentic AI for the mission" })).toBeVisible();
  const styles = await page.evaluate(() => ({
    archivo: document.fonts.check('700 16px "Archivo"'),
    mono: document.fonts.check('500 11px "JetBrains Mono"'),
    line: getComputedStyle(document.querySelector(".lk-a .lk-in")).fontFamily,
    weight: getComputedStyle(document.querySelector(".lk-a .lk-in")).fontWeight,
    label: getComputedStyle(document.querySelector(".label")).fontFamily,
    sub: getComputedStyle(document.querySelector(".brand-sub")).fontFamily,
  }));
  expect(styles).toMatchObject({ archivo: true, mono: true, weight: "700" });
  expect(styles.line).toMatch(/^Archivo/);
  expect(styles.label).toMatch(/JetBrains Mono/);
  expect(styles.sub).toMatch(/Space Grotesk/);

  await expect(page.locator("#loader")).toBeHidden();
  await expect.poll(() => page.locator("#orb").evaluate(litPixels)).toBeGreaterThan(500);
  const frames = await page.evaluate(() => window.astrion.globe.frames);
  await expect.poll(() => page.evaluate(() => window.astrion.globe.frames)).toBeGreaterThan(frames + 5);
  for (const line of await page.evaluate(fittedLines)) {
    expect(line.width, `${line.text} stays inside its column`).toBeLessThanOrEqual(line.column + 0.5);
    expect(line.width, `${line.text} spans its column`).toBeGreaterThan(line.column * 0.97);
  }
  expect(problems).toEqual([]);
});

for (const [width, height] of [[320, 700], [390, 844], [600, 900], [601, 900], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]) {
  test(`at ${width} by ${height} the display lines span their columns and nothing leaves the page`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, baseURL);
    for (const line of await page.evaluate(fittedLines)) {
      expect(line.width, `${line.text} stays inside its column`).toBeLessThanOrEqual(line.column + 0.5);
      expect(line.width, `${line.text} spans its column`).toBeGreaterThan(line.column * 0.97);
    }
    expect(await page.evaluate(containment)).toEqual([]);
    await expect(page.locator('.tools a[href="#contact"]')).toBeVisible();
    // One half of the marquee is wider than the viewport, so the loop never shows a gap.
    const loop = await page.locator("#marquee-track").evaluate(track => track.children[track.children.length / 2].offsetLeft - track.children[0].offsetLeft);
    expect(loop).toBeGreaterThan(width);
  });
}

test("scrolling the pinned stage zooms the globe to its horizon and lights the statement", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, baseURL);
  expect(await page.evaluate(() => [window.astrion.mode(), window.astrion.pinned()])).toEqual(["split", true]);
  const read = () => page.locator("#stage-pin").evaluate(pin => ({
    hx: Number(pin.style.getPropertyValue("--hx")), so: Number(pin.style.getPropertyValue("--so")), top: Math.round(pin.getBoundingClientRect().top),
    lit: document.querySelectorAll("#build .sw.lit").length, words: document.querySelectorAll("#build .sw").length,
  }));
  const start = await read();
  expect(start).toMatchObject({ hx: 0, so: 0, top: 0, lit: 0 });
  expect(start.words).toBeGreaterThan(8);
  await expect(page.locator("#build")).toHaveCSS("opacity", "0");
  await expect.poll(() => page.evaluate(() => window.astrion.globe.R)).toBeGreaterThan(300);
  const wholeGlobe = await page.evaluate(() => window.astrion.globe.R);

  await scrollTo(page, 720 * 1.78);
  expect(await read()).toEqual({ hx: 1, so: 1, top: 0, lit: start.words, words: start.words });
  await expect(page.locator("#build")).toHaveCSS("opacity", "1");
  await expect(page.locator(".lockup .lk-a")).toHaveCSS("opacity", "0");
  await expect(page.locator(".scroll-cue")).toHaveCSS("opacity", "0");
  await expect.poll(() => page.evaluate(() => window.astrion.globe.R)).toBeGreaterThan(wholeGlobe * 2.5);

  // The next band slides up over the stage while the stage is still pinned.
  const travel = await page.evaluate(() => window.astrion.metrics.travel);
  await scrollTo(page, travel - 360);
  const overlap = await page.evaluate(() => ({ pin: Math.round(document.getElementById("stage-pin").getBoundingClientRect().top), loop: Math.round(document.getElementById("loop").getBoundingClientRect().top) }));
  expect(overlap).toEqual({ pin: 0, loop: 360 });

  // Each of the three words fills as it crosses the viewport.
  const loopTop = await docTop(page, "loop");
  await scrollTo(page, loopTop + 720);
  await expect(page.locator(".move.done")).toHaveCount(3);
});

test("the side index and the navigation reach every chapter", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, baseURL);
  const index = page.locator("#index");
  await expect(index).toBeVisible();
  const current = () => page.locator("#index a[aria-current]").evaluateAll(links => links.map(link => link.getAttribute("href")));

  await index.locator('a[href="#build"]').click();
  await expect(page).toHaveURL(/#build$/);
  await expect(page.locator("#build")).toHaveCSS("opacity", "1");
  await expect.poll(current).toEqual(["#build"]);

  for (const id of ["loop", "agents", "domains"]) {
    await index.locator(`a[href="#${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}-title`)).toBeInViewport();
    await expect.poll(current).toEqual([`#${id}`]);
  }
  await expect(page.locator(`.site-nav a[href="#domains"]`)).toHaveAttribute("aria-current", "true");

  // Over the gallery the index steps aside; the keyboard still brings it back.
  await expect(page.locator("body")).toHaveAttribute("data-index", "off");
  await expect(index).toHaveCSS("opacity", "0");
  await index.locator('a[href="#rule"]').focus();
  await expect(index).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#rule$/);
  await expect(page.locator("#rule-title")).toBeInViewport();
  await expect(page.locator("body")).toHaveAttribute("data-index", "light");
  await expect(page.locator("#rule")).toBeFocused();

  for (const id of ["proof", "contact"]) {
    await index.locator(`a[href="#${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}-title`)).toBeInViewport();
  }
  await expect(page.locator('#contact a.btn[href^="mailto:communications@astrion.us"]')).toBeVisible();
  await expect(page.locator('#contact a.link[href="mailto:communications@astrion.us"]')).toBeVisible();
  await page.locator('.site-footer a[href="#top"]').click();
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(0);
  await expect(page).not.toHaveURL(/#/);
});

test("the domain gallery pins and travels sideways with the artwork shown whole", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, baseURL);
  expect(await page.evaluate(() => window.astrion.gallery())).toBe(true);
  await expect(page.locator("#domains")).toHaveClass(/\bpinned\b/);
  const gallery = await page.evaluate(() => ({ top: window.astrion.metrics.galTop, travel: window.astrion.metrics.galTravel, over: window.astrion.metrics.galOver }));
  expect(gallery.over).toBeGreaterThan(1000);

  await scrollTo(page, gallery.top + 2);
  await expect(page.locator("#domain-n")).toHaveText("01");
  expect(await page.locator("#domains-pin").evaluate(pin => Math.abs(Math.round(pin.getBoundingClientRect().top)))).toBe(0);
  await expect(page.locator("#domains-title")).toBeInViewport();

  await scrollTo(page, gallery.top + gallery.travel);
  await expect(page.locator("#domain-n")).toHaveText("06");
  expect(Math.abs(Number(await page.locator("#domains-track").evaluate(track => track.style.getPropertyValue("--x"))) - gallery.over)).toBeLessThan(2);
  expect(await page.locator("#domains-pin").evaluate(pin => Math.abs(Math.round(pin.getBoundingClientRect().top)))).toBe(0);
  await expect(page.locator(".domain").last()).toBeInViewport({ ratio: 0.99 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);

  await expect.poll(() => page.locator(".domain-art img").evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length)).toBeGreaterThanOrEqual(3);
  const artwork = await page.locator(".domain-art img").evaluateAll(images => images.map(image => {
    const box = image.getBoundingClientRect();
    return { name: image.getAttribute("src"), width: box.width, height: box.height, loaded: image.complete && image.naturalWidth > 0, file: /-480\.webp$/.test(image.currentSrc) ? 480 : 1122 };
  }));
  expect(artwork).toHaveLength(6);
  for (const art of artwork) {
    expect(Math.abs(art.width / art.height - 1122 / 1402), `${art.name} keeps its proportions`).toBeLessThan(0.004);
    expect(art.width, `${art.name} is never drawn above its supplied width`).toBeLessThanOrEqual(1122);
    if (art.loaded) expect(art.width, `${art.name} is not stretched beyond the file the browser chose`).toBeLessThanOrEqual(art.file + 1);
  }
});

test("the Bone band flips the chrome, and the film waits for its band and obeys the pause switch", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, baseURL);
  await expect(page.locator("#film source[src]")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-chrome", "dark");

  await scrollTo(page, await docTop(page, "rule"));
  await expect(page.locator("body")).toHaveAttribute("data-chrome", "light");
  await expect(page.locator(".wm-dark")).toHaveCSS("display", "block");
  await expect(page.locator(".wm-light")).toHaveCSS("display", "none");
  await expect(page.locator(".rule-title .lk.in")).toHaveCount(2);

  await scrollTo(page, await docTop(page, "proof"));
  await expect(page.locator("body")).toHaveAttribute("data-chrome", "dark");
  await expect(page.locator("#film source[src]")).toHaveCount(2);
  await expect(page.locator('#proof [data-count="38000"]')).toHaveText("38,000+");
  await expect(page.locator('#proof [data-count="6000"]')).toHaveText("6,000+");
  await expect(page.locator('#proof [data-count="1.2"]')).toHaveText("1.2B");

  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
  const frames = () => page.evaluate(() => window.astrion.endGlobe.frames);
  const before = await frames();
  await expect.poll(frames).toBeGreaterThan(before + 3);
  const toggle = page.locator(".foot-motion");
  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/\bpaused\b/);
  await expect(toggle).toHaveText("Play motion");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#motion")).toHaveAttribute("aria-label", "Play motion");
  expect(await page.locator("#film").evaluate(film => film.paused)).toBe(true);
  await page.waitForTimeout(250);
  const held = await frames();
  await page.waitForTimeout(350);
  expect(await frames()).toBe(held);
  await toggle.click();
  await expect(page.locator("html")).not.toHaveClass(/\bpaused\b/);
  await expect.poll(frames).toBeGreaterThan(held + 3);
});

test("with reduced motion nothing pins or animates and every chapter is readable", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, baseURL);
  await expect(page.locator("html")).toHaveClass(/\brm\b/);
  await expect(page.locator("html")).not.toHaveClass(/\bfx\b/);
  expect(await page.evaluate(() => [window.astrion.pinned(), window.astrion.gallery()])).toEqual([false, false]);
  await expect(page.locator("#loader")).toBeHidden();
  await expect(page.locator("#stage-pin")).toHaveCSS("position", "relative");
  await expect(page.locator("#build")).toHaveCSS("opacity", "1");
  await expect(page.locator("#statement-text .sw").first()).toHaveCSS("opacity", "1");
  await expect(page.locator(".move.done")).toHaveCount(3);
  expect(await page.locator(".reveal, .rule-title .lk, .closer .lk").evaluateAll(elements => elements.every(element => element.classList.contains("in")))).toBe(true);
  for (const toggle of await page.locator("[data-motion-toggle]").all()) await expect(toggle).toBeHidden();

  expect(await page.locator("#orb").evaluate(litPixels)).toBeGreaterThan(500);
  const frames = await page.evaluate(() => window.astrion.globe.frames);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.astrion.globe.frames)).toBeLessThanOrEqual(frames + 1);

  // The gallery becomes an ordinary sideways scroller and the film stays on its poster.
  await expect(page.locator("#domains")).not.toHaveClass(/\bpinned\b/);
  expect(await page.locator("#domains-pin").evaluate(pin => pin.scrollWidth > pin.clientWidth + 500)).toBe(true);
  await scrollTo(page, await docTop(page, "proof"));
  await expect(page.locator("#film source[src]")).toHaveCount(0);
  await expect(page.locator('#proof [data-count="38000"]')).toHaveText("38,000+");
  await scrollTo(page, await docTop(page, "contact"));
  await expect.poll(() => page.locator("#orb-end").evaluate(litPixels)).toBeGreaterThan(300);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the hero stacks, the gallery scrolls by hand and nothing overflows", async ({ page, baseURL }) => {
    await open(page, baseURL);
    expect(await page.evaluate(() => [window.astrion.mode(), window.astrion.gallery()])).toEqual(["stack3", false]);
    for (const line of await page.evaluate(fittedLines)) {
      expect(line.width, `${line.text} stays inside its column`).toBeLessThanOrEqual(line.column + 0.5);
      expect(line.width, `${line.text} spans its column`).toBeGreaterThan(line.column * 0.97);
    }
    await expect(page.locator("#index")).toBeHidden();
    await expect(page.locator(".site-nav")).toBeHidden();
    await expect(page.locator("#cursor")).toBeHidden();
    await expect(page.locator('.tools a[href="#contact"]')).toBeVisible();
    await expect(page.locator(".hero-copy .btn")).toBeInViewport();

    for (const id of ["loop", "agents", "domains", "rule", "proof", "contact"]) {
      await scrollTo(page, await docTop(page, id));
      expect(await page.evaluate(containment), `at #${id}`).toEqual([]);
    }
    await expect(page.locator(".row-img").first()).toHaveCSS("display", "block");
    const scroller = await page.locator("#domains-pin").evaluate(pin => ({ scrolls: pin.scrollWidth > pin.clientWidth + 500, pinned: pin.closest(".domains").classList.contains("pinned"), gutter: Math.round(pin.querySelector(".domains-head").getBoundingClientRect().left) }));
    expect(scroller).toEqual({ scrolls: true, pinned: false, gutter: 20 });
    await expect(page.locator("#contact .btn-xl")).toBeVisible();
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [2560, 1440]]) {
    test(`at ${width} by ${height} the page reads straight down and the display lines still fit`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height });
      const response = await page.goto(route(baseURL), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveClass("no-js");
      for (const line of await page.evaluate(fittedLines)) {
        expect(line.width, `${line.text} stays inside its column`).toBeLessThanOrEqual(line.column + 0.5);
        expect(line.width, `${line.text} nearly spans its column`).toBeGreaterThan(line.column * 0.95);
      }
      expect(await page.evaluate(containment)).toEqual([]);
      await expect(page.locator("#site-header")).toHaveCSS("position", "absolute");
      await expect(page.locator("#stage-pin")).toHaveCSS("position", "relative");
      await expect(page.locator("#build")).toHaveCSS("opacity", "1");
      await expect(page.locator(".reveal").first()).toHaveCSS("opacity", "1");
      await expect(page.locator("#loader")).toBeHidden();
      await expect(page.locator("#motion")).toBeHidden();
      expect(await page.locator(".word-f").first().evaluate(word => getComputedStyle(word).getPropertyValue("--fill").trim())).toBe("100%");
      await expect(page.locator('#contact a.btn[href^="mailto:communications@astrion.us"]')).toBeVisible();
    });
  }
});
