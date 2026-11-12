import { test, expect } from "@playwright/test";

const APP_COUNT = 32;

async function openHub(page, baseURL, { query = "", expectedCount = APP_COUNT, storage = null } = {}) {
  if (storage) {
    await page.addInitScript(entries => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, storage);
  }
  const url = new URL("../apps.html", baseURL);
  url.search = query;
  await page.goto(url.href);
  await expect(page.locator(".app-card")).toHaveCount(expectedCount);
}

for (const view of ["cards", "list"]) {
  for (const width of [280, 320, 390, 640, 641, 980, 981, 1440]) {
    test(`application library ${view} layout stays contained at ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openHub(page, baseURL, { storage: { "app-library:view": view } });
      await expect(page.locator("#app-grid")).toHaveAttribute("data-view", view);

      const layout = await page.evaluate(() => {
        const rect = element => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        };
        const rendered = element => element.getClientRects().length > 0;
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
          const controls = [...actions.querySelectorAll(".app-link, .pin-button")].filter(rendered);
          if (!controls.some(control => control.matches(".app-link.primary"))) issues.push("no primary link is shown");
          if (!controls.some(control => control.matches(".pin-button"))) issues.push("no pin button is shown");
          for (const control of controls) {
            const controlRect = rect(control);
            if (controlRect.left < actionRect.left - 1 || controlRect.right > actionRect.right + 1 || controlRect.bottom > actionRect.bottom + 1) issues.push("control leaves actions");
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
        const controls = [".site-header", ".theme-toggle", ".hero", ".catalog-heading", ".controls", ".search-wrap", ".view-toggle", ".filters", ".app-grid", ".resources", ".resources-heading", ".resource-grid"]
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
}

test("the first applications are visible without scrolling on a laptop and a phone", async ({ page, baseURL }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openHub(page, baseURL);
    await expect(page.locator(".app-card h3").first()).toBeInViewport();
  }
});

test("deep-linked filters and application links resolve visibly and correctly", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHub(page, baseURL, { query: "?category=Source+only", expectedCount: 3 });

  const active = page.locator('#filters [aria-pressed="true"]');
  await expect(active).toHaveAttribute("data-category", "Source only");
  await expect(active).toHaveAccessibleName("Source only, 3 applications");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  const activeVisible = await page.locator("#filters").evaluate(element => {
    const rail = element.getBoundingClientRect();
    const item = element.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    return item.left >= rail.left - 1 && item.right <= rail.right + 1;
  });
  expect(activeVisible).toBe(true);

  await openHub(page, baseURL);
  await page.getByRole("button", { name: "Card view", exact: true }).click();

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

  const tracker = page.locator(".app-card").filter({ has: page.getByRole("heading", { name: "Weekly Status Tracker · Cloud", exact: true }) });
  await expect(tracker.locator(".availability")).toHaveText("Sign-in required");

  await expect(page.getByRole("heading", { name: "Black Hat Agent", exact: true })).toHaveCount(1);
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

test("the library loads nothing from outside its own page", async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const outside = [];
  page.on("request", request => {
    if (!request.url().startsWith(origin)) outside.push(request.url());
  });
  await openHub(page, baseURL);
  await page.waitForLoadState("networkidle");
  expect(outside).toEqual([]);
  await expect(page.locator('#filters [data-category="More"]')).toHaveCount(0);
  await expect(page.locator("#category-stat")).toHaveText("5");
});

test("pinned applications lead the library, get a filter, and survive a reload", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHub(page, baseURL);
  await expect(page.locator('#filters [data-category="Pinned"]')).toHaveCount(0);

  const pin = page.getByRole("button", { name: "Pin Link Budget", exact: true });
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await pin.click();
  await expect(page.locator(".app-card h3").first()).toHaveText("Link Budget");
  await expect(page.getByRole("button", { name: "Pin Link Budget", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pin Link Budget", exact: true })).toBeFocused();
  await expect(page.locator('#filters [data-category="Pinned"]')).toHaveAccessibleName("Pinned, 1 application");

  await page.reload();
  await expect(page.locator(".app-card")).toHaveCount(APP_COUNT);
  await expect(page.locator(".app-card h3").first()).toHaveText("Link Budget");

  await page.locator('#filters [data-category="Pinned"]').click();
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(page).toHaveURL(/category=Pinned/);
  await page.getByRole("button", { name: "Pin Link Budget", exact: true }).click();
  await expect(page.locator(".app-card")).toHaveCount(APP_COUNT);
  await expect(page.locator('#filters [data-category="Pinned"]')).toHaveCount(0);
  await expect(page.locator('#filters [aria-pressed="true"]')).toHaveAttribute("data-category", "All");
  await expect(page.locator(".app-card h3").first()).toHaveText("LDAWIF");
});

test("layout and theme choices persist, and small screens start in the list layout", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHub(page, baseURL);
  const grid = page.locator("#app-grid");
  await expect(grid).toHaveAttribute("data-view", "cards");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(grid).toHaveAttribute("data-view", "list");
  await expect(page.getByRole("button", { name: "List view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Dark theme", exact: true })).toBeVisible();
  const lightBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(lightBackground).toBe("rgb(243, 245, 247)");

  await page.reload();
  await expect(page.locator(".app-card")).toHaveCount(APP_COUNT);
  await expect(grid).toHaveAttribute("data-view", "list");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".app-card")).toHaveCount(APP_COUNT);
  await expect(grid).toHaveAttribute("data-view", "list");
});

test("an empty search offers a way back to the full library", async ({ page, baseURL }) => {
  await openHub(page, baseURL, { query: "?q=zzzz-no-such-app&category=Defense", expectedCount: 0 });
  await expect(page.locator("#empty-state")).toBeVisible();
  await expect(page.locator("#result-count")).toHaveText(`0 of ${APP_COUNT} applications`);
  await page.getByRole("button", { name: "Show all applications", exact: true }).click();
  await expect(page.locator(".app-card")).toHaveCount(APP_COUNT);
  await expect(page.locator("#empty-state")).toBeHidden();
  await expect(page.locator("#app-search")).toHaveValue("");
  await expect(page).not.toHaveURL(/[?&](q|category)=/);
});

test("the library still works when browser storage is blocked", async ({ page, baseURL }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHub(page, baseURL);
  await page.getByRole("button", { name: "Pin Roadmap Builder", exact: true }).click();
  await expect(page.locator('#filters [data-category="Pinned"]')).toHaveAccessibleName("Pinned, 1 application");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator("#app-grid")).toHaveAttribute("data-view", "list");
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(pageErrors).toEqual([]);
});
