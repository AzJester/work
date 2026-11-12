import { test, expect } from "@playwright/test";

async function openHub(page, baseURL, query = "", expectedCount = 30) {
  await page.route("https://api.github.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
  const url = new URL("../apps.html", baseURL);
  url.search = query;
  await page.goto(url.href);
  await expect(page.locator(".app-card")).toHaveCount(expectedCount);
}

for (const width of [280, 320, 390, 640, 641, 980, 981, 1440]) {
  test(`application library stays contained at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openHub(page, baseURL);

    const layout = await page.evaluate(() => {
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      const h1 = document.querySelector("h1");
      const titleRange = document.createRange();
      titleRange.selectNodeContents(h1);
      const titleLines = [...titleRange.getClientRects()].map(box => ({
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      }));
      const cardIssues = [...document.querySelectorAll(".app-card")].flatMap(card => {
        const cardRect = rect(card);
        const actions = card.querySelector(".card-actions");
        const actionRect = rect(actions);
        const issues = [];
        if (cardRect.left < -1 || cardRect.right > innerWidth + 1) issues.push("card leaves viewport");
        if (card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1) issues.push("card content clips");
        if (actionRect.left < cardRect.left - 1 || actionRect.right > cardRect.right + 1 || actionRect.bottom > cardRect.bottom + 1) issues.push("actions leave card");
        for (const link of actions.querySelectorAll(".app-link")) {
          const linkRect = rect(link);
          if (linkRect.left < actionRect.left - 1 || linkRect.right > actionRect.right + 1 || linkRect.bottom > actionRect.bottom + 1) issues.push("link leaves actions");
        }
        return issues.map(issue => `${card.querySelector("h3").textContent}: ${issue}`);
      });
      const resourceIssues = [...document.querySelectorAll(".resource-card")].flatMap(card => {
        const cardRect = rect(card);
        const link = card.querySelector(".resource-link");
        const linkRect = rect(link);
        const issues = [];
        if (cardRect.left < -1 || cardRect.right > innerWidth + 1) issues.push("card leaves viewport");
        if (card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1) issues.push("card content clips");
        if (linkRect.left < cardRect.left - 1 || linkRect.right > cardRect.right + 1 || linkRect.bottom > cardRect.bottom + 1) issues.push("link leaves card");
        return issues.map(issue => `${card.querySelector("h3").textContent}: ${issue}`);
      });
      const controls = [".hero", ".catalog-heading", ".controls", ".search-wrap", ".filters", ".app-grid", ".resources", ".resources-heading", ".resource-grid"]
        .map(selector => ({ selector, ...rect(document.querySelector(selector)) }));
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        title: rect(h1),
        titleLines,
        controls,
        cardIssues,
        resourceIssues,
      };
    });

    expect(layout.documentWidth, "the document must not scroll horizontally").toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.titleLines.length, "the hero title should use at most two lines").toBeLessThanOrEqual(2);
    for (const line of layout.titleLines) {
      expect(line.left).toBeGreaterThanOrEqual(layout.title.left - 1);
      expect(line.right).toBeLessThanOrEqual(layout.title.right + 1);
    }
    for (const control of layout.controls) {
      expect(control.left, `${control.selector} starts inside the viewport`).toBeGreaterThanOrEqual(-1);
      expect(control.right, `${control.selector} ends inside the viewport`).toBeLessThanOrEqual(layout.viewport + 1);
    }
    expect(layout.cardIssues).toEqual([]);
    expect(layout.resourceIssues).toEqual([]);

    const filters = page.locator("#filters");
    const filterEdges = await filters.evaluate(element => {
      const visibleInsideRail = button => {
        const rail = element.getBoundingClientRect();
        const item = button.getBoundingClientRect();
        return item.left >= rail.left - 1 && item.right <= rail.right + 1;
      };
      const all = element.querySelector('[data-category="All"]');
      const sourceOnly = element.querySelector('[data-category="Source only"]');
      element.scrollLeft = 0;
      const allVisibleAtStart = visibleInsideRail(all);
      element.scrollLeft = element.scrollWidth;
      const sourceVisibleAtEnd = visibleInsideRail(sourceOnly);
      return { allVisibleAtStart, sourceVisibleAtEnd };
    });
    expect(filterEdges).toEqual({ allVisibleAtStart: true, sourceVisibleAtEnd: true });
  });
}

test("deep-linked filters and application links resolve visibly and correctly", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHub(page, baseURL, "?category=Source+only", 3);

  const active = page.locator('#filters [aria-pressed="true"]');
  await expect(active).toHaveText("Source only");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  const activeVisible = await page.locator("#filters").evaluate(element => {
    const rail = element.getBoundingClientRect();
    const item = element.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    return item.left >= rail.left - 1 && item.right <= rail.right + 1;
  });
  expect(activeVisible).toBe(true);

  await openHub(page, baseURL);
  const solutionWorkbench = page.locator(".app-card").filter({ has: page.getByRole("heading", { name: "Solution Architect Workbench", exact: true }) });
  await expect(solutionWorkbench).toContainText("Defense");
  await expect(solutionWorkbench.locator(".availability")).toHaveText("Live");
  await expect(solutionWorkbench.locator(".development-stamp")).toHaveText("UNDER DEVELOPMENT");
  await expect(solutionWorkbench.getByRole("link", { name: /^Open app:/ })).toHaveAttribute("href", "https://azjester.github.io/work/solutions-architect/");
  await expect(solutionWorkbench.getByRole("link", { name: /^View source:/ })).toHaveAttribute("href", "https://github.com/AzJester/work/tree/main/solutions-architect");

  const roadmap = page.locator(".app-card").filter({ has: page.getByRole("heading", { name: "Roadmap Builder", exact: true }) });
  await expect(roadmap.getByRole("link", { name: /^View source:/ })).toHaveAttribute("href", "https://github.com/AzJester/work/blob/main/roadmap.html");

  const astrionLdawif = page.locator(".app-card").filter({ has: page.getByRole("heading", { name: "Astrion Division · LDAWIF", exact: true }) });
  await expect(astrionLdawif.getByRole("link", { name: /^View source:/ })).toHaveAttribute("href", "https://github.com/AzJester/work/tree/main/astrion-division/ldawif");

  await expect(page.locator(".resource-card")).toHaveCount(1);

  const thoughtCircuit = page.locator('[data-resource="thought-circuit"]');
  await expect(thoughtCircuit.getByRole("link", { name: /Visit Thought Circuit/ })).toHaveAttribute("href", "https://st-dba.com/");
  await expect(thoughtCircuit.getByRole("link")).toHaveCount(1);
  await expect(thoughtCircuit).not.toContainText(/source/i);

  const localLoops = await page.locator(".app-card .app-link").evaluateAll((links, pathname) => links
    .filter(link => new URL(link.href).pathname === pathname)
    .map(link => link.getAttribute("aria-label")), new URL("../apps.html", baseURL).pathname);
  expect(localLoops).toEqual([]);
});

test("GitHub metadata adds only allowlisted repositories to the work library", async ({ page, baseURL }) => {
  const repository = (name, overrides = {}) => ({
    name,
    html_url: `https://github.com/AzJester/${name}`,
    description: null,
    homepage: null,
    language: "HTML",
    has_pages: true,
    private: false,
    pushed_at: "2026-11-01T00:00:00Z",
    ...overrides,
  });
  const respondWith = repositories => page.route("https://api.github.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(repositories),
  }));
  const hubUrl = new URL("../apps.html", baseURL).href;

  await respondWith([
    repository("passive_sensor_demo_F5.2", { homepage: "https://azjester.github.io/passive_sensor_demo_F5.2/" }),
    repository("Talent-Acquisition-Agent"),
    repository("Black_Hat_Agent"),
    repository("brand-new-public-site"),
    repository("another-unlisted-app", { homepage: "https://example.com/" }),
    repository("work"),
  ]);
  await page.goto(hubUrl);
  await expect(page.locator(".app-card")).toHaveCount(33);
  await expect(page.getByRole("heading", { name: "brand new public site", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "another unlisted app", exact: true })).toHaveCount(0);

  await page.locator('#filters [data-category="More"]').click();
  await expect(page.locator(".app-card h3")).toHaveText(["Black Hat Agent", "passive sensor demo F5.2", "Talent Acquisition Agent"]);
  const sensorDemo = page.locator(".app-card").filter({ has: page.getByRole("heading", { name: "passive sensor demo F5.2", exact: true }) });
  await expect(sensorDemo.getByRole("link", { name: /^Open app:/ })).toHaveAttribute("href", "https://azjester.github.io/passive_sensor_demo_F5.2/");

  await page.unroute("https://api.github.com/**");
  await respondWith([
    repository("passive_sensor_demo_F5.2", { private: true }),
    repository("Talent-Acquisition-Agent", { has_pages: false }),
  ]);
  await page.goto(hubUrl);
  await expect(page.locator(".app-card")).toHaveCount(30);
  await expect(page.locator('#filters [data-category="More"]')).toHaveCount(0);
});
