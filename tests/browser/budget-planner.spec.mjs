import { test, expect } from "@playwright/test";

function plannerUrl(baseURL) {
  return new URL("../budget-planner.html", new URL(baseURL)).href;
}

async function openPlanner(page, baseURL, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(plannerUrl(baseURL), { waitUntil: "domcontentloaded" });
  await expect(page.locator(".lane")).toHaveCount(6);
}

test.describe("Roadmap and Budget Planner", () => {
  test("renders the seed plan with the reference hours, materials and cost totals", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await expect(page.locator(".block")).toHaveCount(15);
    await expect(page.locator(".card")).toHaveCount(7);
    await expect(page.locator("#backlogMeta")).toContainText("2,010 h");
    await expect(page.locator("#backlogMeta")).toContainText("$4,000 materials");
    await expect(page.locator("#hoursYearTable tr[data-row='committed']")).toContainText("15,829 h");
    const hoursRemaining = page.locator("#hoursYearTable tr[data-row='remaining']");
    await expect(hoursRemaining).toContainText("-2,393 h");
    await expect(hoursRemaining).toContainText("Over");
    await expect(page.locator("#hoursEngineTable tr[data-engine='horizon']")).toContainText("2,270 h");
    await expect(page.locator("#materialsYearTable tr[data-row='spent']")).toContainText("$12,370");
    await expect(page.locator("#materialsYearTable tr[data-row='committed']")).toContainText("$21,000");
    await expect(page.locator("#costYearTable tr[data-row='committed']")).toContainText("$1,635,558");
    const costRemaining = page.locator("#costYearTable tr[data-row='remaining']");
    await expect(costRemaining).toContainText("$64,442");
    await expect(costRemaining).toContainText("Not set");
    const costCore = page.locator("#costEngineTable tr[data-engine='core']");
    await expect(costCore).toContainText("$122,400");
    await expect(costCore).toContainText("$18,500");
    await expect(costCore).toContainText("$140,900");
    await expect(page.locator(".lane-label").first()).toContainText("$140,900");
    await expect(page.locator(".block[data-block='b02']")).toContainText("$12,000 / $18,500");
    await expect(page.locator(".asof-pill")).toHaveText(/As of 2026-07-17/i);
  });

  test("adds a block with hours and materials through the dialog and persists it", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await page.click("#addBlockBtn");
    const dialog = page.locator("#blockDialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("input[name='name']").fill("Playwright block");
    await dialog.locator("select[name='engineId']").selectOption("colossus");
    await dialog.locator("input[name='hours']").fill("365");
    await dialog.locator("input[name='materials']").fill("1,000");
    await dialog.locator("input[name='start']").fill("2026-01-01");
    await dialog.locator("input[name='end']").fill("2026-12-31");
    await dialog.locator("button[type='submit']").click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".block")).toHaveCount(16);
    await expect(page.locator("#hoursEngineTable tr[data-engine='colossus']")).toContainText("365 h");
    await expect(page.locator("#materialsEngineTable tr[data-engine='colossus']")).toContainText("$1,000");
    const costRow = page.locator("#costEngineTable tr[data-engine='colossus']");
    await expect(costRow).toContainText("$37,230");
    await expect(costRow).toContainText("$38,230");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".block", { hasText: "Playwright block" })).toHaveCount(1);
  });

  test("rejects an end date before the start date", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await page.click("#addBlockBtn");
    const dialog = page.locator("#blockDialog");
    await dialog.locator("input[name='name']").fill("Backwards");
    await dialog.locator("input[name='start']").fill("2026-05-10");
    await dialog.locator("input[name='end']").fill("2026-05-01");
    await expect(page.locator("#dateSummary")).toHaveText("End before start");
    await dialog.locator("button[type='submit']").click();
    await expect(page.locator("#blockError")).toContainText("before the start date");
    await expect(dialog).toBeVisible();
  });

  test("moving the as-of date changes worked and forecast but not the total", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const worked = page.locator("#hoursYearTable tr[data-row='spent']");
    await expect(worked).toContainText("10,535 h");
    await page.fill("#asOfInput", "2027-01-01");
    await page.locator("#asOfInput").dispatchEvent("change");
    await expect(worked).toContainText("15,069 h");
    await expect(page.locator("#hoursYearTable tr[data-row='planned']")).toContainText("760 h");
    await expect(page.locator("#hoursYearTable tr[data-row='committed']")).toContainText("15,829 h");
    await expect(page.locator("#costYearTable tr[data-row='committed']")).toContainText("$1,635,558");
  });

  test("editing annual hours and the annual budget updates remaining, and a blank budget reads Not set", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const hoursInput = page.locator("input[data-hours-year='2026']");
    await hoursInput.fill("20,000");
    await hoursInput.press("Enter");
    await expect(page.locator("#hoursYearTable tr[data-row='remaining']")).toContainText("4,171 h");
    const budgetInput = page.locator("input[data-budget-year='2026']");
    await budgetInput.fill("");
    await budgetInput.press("Enter");
    const remaining = page.locator("#costYearTable tr[data-row='remaining'] td").first();
    await expect(remaining).toContainText("Not set");
    await page.locator("input[data-budget-year='2026']").fill("2,000,000");
    await page.locator("input[data-budget-year='2026']").press("Enter");
    await expect(page.locator("#costYearTable tr[data-row='remaining']")).toContainText("$364,442");
  });

  test("clear all can be undone", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await page.click("#clearBtn");
    await page.locator("#confirmDialog #confirmOk").click();
    await expect(page.locator(".block")).toHaveCount(0);
    await expect(page.locator("#loadSampleBtn")).toBeVisible();
    await expect(page.locator("#toast")).toBeVisible();
    await page.click("#toastUndo");
    await expect(page.locator(".block")).toHaveCount(15);
  });

  test("export downloads a version 2 document that validates and matches the page", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
    expect(download.suggestedFilename()).toMatch(/^budget-planner-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const exported = JSON.parse(readFileSync(path, "utf8"));
    expect(exported.version).toBe(2);
    expect(exported.rate).toBe(102);
    const result = await page.evaluate((json) => window.BudgetEngine.validateDoc(json), exported);
    expect(result.ok).toBe(true);
    expect(exported.blocks).toHaveLength(22);
  });

  test("theme toggle flips the document theme and remembers it", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.click("#themeBtn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("a phone-width viewport scrolls the board, not the page", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL, { width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const board = await page.evaluate(() => { const b = document.querySelector(".board-scroll"); return b.scrollWidth > b.clientWidth; });
    expect(board).toBe(true);
  });

  test("the old hours planner address opens the merged app, and logging hours and materials drives every table", async ({ page, baseURL }) => {
    await page.goto(new URL("../hours-planner.html", new URL(baseURL)).href, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/budget-planner\.html$/);
    await expect(page.locator(".lane")).toHaveCount(6);
    await expect(page).toHaveTitle("Roadmap and Budget Planner");
    await expect(page.locator("#subtitle")).toContainText("Hours and materials");
    await expect(page.locator("#subtitle")).toContainText("$102.00/h");
    const core = page.locator("#hoursEngineTable tr[data-engine='core']");
    await expect(core).toContainText("640 h");
    await expect(core).toContainText("560 h");
    await expect(page.locator(".block[data-block='b01']")).toContainText("640 h / 1,200 h");
    const costCore = page.locator("#costEngineTable tr[data-engine='core']");
    await expect(costCore).toContainText("$122,400");
    await expect(page.locator("#rateInput")).toHaveValue("102.00");
    await page.fill("#rateInput", "100");
    await page.press("#rateInput", "Enter");
    await expect(costCore).toContainText("$120,000");
    await expect(page.locator("#costMeta")).toContainText("$100.00");
    await expect(page.locator("#subtitle")).toContainText("$100.00/h");
    await page.click(".block[data-block='b01']");
    const dialog = page.locator("#blockDialog");
    await expect(dialog.locator("input[name='hoursActual']")).toHaveValue("640");
    await expect(dialog.locator("#materialsActualField")).toBeVisible();
    await dialog.locator("input[name='hoursActual']").fill("1,300");
    await dialog.locator("input[name='materials']").fill("500");
    await dialog.locator("input[name='materialsActual']").fill("200");
    await dialog.locator("button[type='submit']").click();
    await expect(core).toContainText("1,300 h");
    await expect(page.locator("#hoursYearTable tr[data-row='remaining']")).toContainText("Over");
    const materialsCore = page.locator("#materialsEngineTable tr[data-engine='core']");
    await expect(materialsCore).toContainText("$12,200");
    await expect(materialsCore).toContainText("$6,800");
    await expect(materialsCore).toContainText("$19,000");
    const row = page.locator("tr[data-block-row='b01']");
    await expect(row).toContainText("1,300 h");
    await expect(row).toContainText("$500");
    await expect(row).toContainText("$200");
    await expect(page.locator(".block[data-block='b01']")).toContainText("1,300 h / 1,200 h · $200 / $500");
  });

  test("carries over plans saved by the earlier hours and dollar editions", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("hours_planner_v1", JSON.stringify({
        version: 1, unit: "hours", rate: 90, startYear: 2026, endYear: 2026, asOf: "2026-03-01", budgets: { "2026": 500 },
        engines: [{ id: "a", name: "Alpha" }],
        blocks: [{ id: "x", name: "Legacy hours block", engineId: "a", cost: 100, actual: 20, materials: 50, start: "2026-02-01", end: "2026-03-31" }],
      }));
    });
    await page.goto(plannerUrl(baseURL), { waitUntil: "domcontentloaded" });
    await expect(page.locator(".lane")).toHaveCount(1);
    await expect(page.locator("#toastText")).toContainText("Carried over your saved hours plan");
    const hoursRow = page.locator("tr[data-block-row='x']");
    await expect(hoursRow).toContainText("100 h");
    await expect(hoursRow).toContainText("20 h");
    await expect(hoursRow).toContainText("$50");
    await expect(page.locator("input[data-hours-year='2026']")).toHaveValue("500");
    await expect(page.locator("#rateInput")).toHaveValue("90.00");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("budget_planner_v1", JSON.stringify({
        version: 1, unit: "USD", startYear: 2026, endYear: 2026, asOf: "2026-03-01", budgets: { "2026": 50000 },
        engines: [{ id: "a", name: "Alpha" }],
        blocks: [{ id: "y", name: "Legacy dollar block", engineId: "a", cost: 10200, actual: 5100, start: "2026-02-01", end: "2026-03-31" }],
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#toastText")).toContainText("Carried over your saved budget plan");
    const dollarRow = page.locator("tr[data-block-row='y']");
    await expect(dollarRow).toContainText("100 h");
    await expect(dollarRow).toContainText("50 h");
    await expect(page.locator("input[data-budget-year='2026']")).toHaveValue("50,000");
    await expect(page.locator("input[data-hours-year='2026']")).toHaveValue("");
  });

  test("adds a year with one click, and edits or deletes blocks from the list and the keyboard", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await expect(page.locator(".axis .years > div")).toHaveCount(2);
    await page.click("#addYearBtn");
    await expect(page.locator(".axis .years > div")).toHaveCount(3);
    await expect(page.locator(".axis .years > div").nth(2)).toHaveText("2028");
    await expect(page.locator("#hoursYearTable thead")).toContainText("2028");
    await expect(page.locator("#costYearTable thead")).toContainText("2028");
    await expect(page.locator("#subtitle")).toContainText("2026 – 2028");
    const rows = page.locator("#blocksTable tbody tr");
    await expect(rows).toHaveCount(22);
    await expect(page.locator("#blocksMeta")).toHaveText("15 scheduled · 7 backlog");
    await page.locator("#blocksTable button[aria-label='Edit Aurora ML POC']").click();
    const dialog = page.locator("#blockDialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input[name='name']")).toHaveValue("Aurora ML POC");
    await expect(dialog.locator("input[name='materials']")).toHaveValue("2,500");
    await dialog.locator("input[name='name']").fill("Aurora ML pilot");
    await dialog.locator("button[type='submit']").click();
    await expect(page.locator(".block", { hasText: "Aurora ML pilot" })).toHaveCount(1);
    await page.locator("#blocksTable button[aria-label='Delete Aurora ML pilot']").click();
    await expect(rows).toHaveCount(21);
    await expect(page.locator(".block")).toHaveCount(14);
    await page.click("#toastUndo");
    await expect(rows).toHaveCount(22);
    await page.locator(".block[data-block='b02']").focus();
    await page.keyboard.press("Delete");
    await expect(page.locator(".block")).toHaveCount(14);
    await expect(page.locator("#toastText")).toContainText("Deleted Outpost: Hardware");
  });

  test("moves and resizes a block by dragging and with the keyboard, and a plain click still opens the editor", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const block = page.locator(".block[data-block='b01']");
    const row = page.locator("tr[data-block-row='b01']");
    const pxPerDay = await page.locator(".lane[data-engine='core']").evaluate((lane) => lane.getBoundingClientRect().width / 730);
    let box = await block.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + pxPerDay * 5, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 + pxPerDay * 10, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(row).toContainText("2026-06-12");
    await expect(row).toContainText("2026-09-10");
    await expect(page.locator("#blockDialog")).toBeHidden();
    await expect(page.locator("#toastText")).toContainText("Moved CORE Foundation MVP");
    box = await block.boundingBox();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3 + pxPerDay * 7, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(row).toContainText("2026-06-12");
    await expect(row).toContainText("2026-09-17");
    await expect(page.locator("#toastText")).toContainText("Resized CORE Foundation MVP");
    await block.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(row).toContainText("2026-06-11");
    await expect(block).toBeFocused();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(row).toContainText("2026-06-18");
    await expect(row).toContainText("2026-09-23");
    await page.keyboard.press("-");
    await expect(row).toContainText("2026-09-22");
    await page.click("#toastUndo");
    await expect(row).toContainText("2026-09-23");
    await block.click();
    await expect(page.locator("#blockDialog")).toBeVisible();
    await expect(page.locator("#dateSummary")).toContainText("98 days");
  });

  test("keeps the board scroll position and keyboard focus through an edit", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL, { width: 900, height: 800 });
    const scroller = page.locator(".board-scroll");
    const asOfVisible = await page.evaluate(() => {
      const s = document.querySelector(".board-scroll").getBoundingClientRect();
      const l = document.querySelector(".axis .asof-line").getBoundingClientRect();
      return l.left >= s.left && l.left <= s.right;
    });
    expect(asOfVisible).toBe(true);
    await scroller.evaluate((s) => { s.scrollLeft = 150; });
    await page.locator("#blocksTable button[aria-label='Edit CORE Foundation MVP']").click();
    await page.locator("#blockDialog input[name='name']").fill("CORE Foundation MVP 2");
    await page.locator("#blockDialog button[type='submit']").click();
    await expect(page.locator(".block", { hasText: "CORE Foundation MVP 2" })).toHaveCount(1);
    expect(await scroller.evaluate((s) => s.scrollLeft)).toBe(150);
    await expect(page.locator("#blocksTable button[aria-label='Edit CORE Foundation MVP 2']")).toBeFocused();
    await expect(page.locator("#saveStatus")).toContainText("Saved");
  });

  test("section nav, Blocks filter, row click, one-click scheduling and the help shortcuts", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await expect(page.locator(".subnav a.active")).toHaveText("Timeline");
    await expect(page.locator(".subnav a[href='#materialsSection']")).toBeVisible();
    await page.click(".subnav a[href='#blocksSection']");
    await expect(page.locator(".subnav a.active")).toHaveText("Blocks");
    await page.fill("#blockFilter", "meridian");
    await expect(page.locator("#blocksTable tbody tr")).toHaveCount(4);
    await expect(page.locator("#blocksMeta")).toContainText("4 of 22 shown");
    await page.locator("#blocksTable tbody tr", { hasText: "Meridian v1" }).click();
    await expect(page.locator("#blockDialog input[name='name']")).toHaveValue("Meridian v1");
    await page.keyboard.press("Escape");
    await page.fill("#blockFilter", "nothing matches this");
    await expect(page.locator("#blocksHost")).toContainText("No block or engine matches");
    await page.fill("#blockFilter", "");
    await expect(page.locator("#blocksTable tbody tr")).toHaveCount(22);
    await page.locator("button[aria-label='Schedule Site Survey POC']").click();
    await expect(page.locator("#blockDialogTitle")).toHaveText("Schedule block");
    await expect(page.locator("#blockDialog input[name='scheduled']")).toBeChecked();
    await expect(page.locator("#blockDialog input[name='materials']")).toHaveValue("4,000");
    await expect(page.locator("#dateSummary")).toContainText("30 days");
    await page.locator("#blockDialog button[type='submit']").click();
    await expect(page.locator(".block")).toHaveCount(16);
    await expect(page.locator(".card")).toHaveCount(6);
    await page.keyboard.press("?");
    await expect(page.locator("#helpDialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#helpDialog")).toBeHidden();
    await page.keyboard.press("b");
    await expect(page.locator("#blockDialogTitle")).toHaveText("Add backlog item");
    await page.keyboard.press("Escape");
    await page.click("#helpBtn");
    await expect(page.locator("#helpDialog")).toBeVisible();
  });

  test("keeps the Astrion hard rules: no heading ends in a period and table text is 8 to 10 pt", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const audit = await page.evaluate(() => {
      const heads = [];
      document.querySelectorAll("h1,h2,h3,h4,h5,h6,th,caption,[role=heading],title").forEach((e) => heads.push((e.innerText || e.textContent || "").trim()));
      const cells = [];
      document.querySelectorAll("table *").forEach((e) => {
        const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
        if (own) cells.push([parseFloat(getComputedStyle(e).fontSize) * 0.75, own]);
      });
      document.querySelectorAll("table input").forEach((i) => cells.push([parseFloat(getComputedStyle(i).fontSize) * 0.75, i.value]));
      return { heads, cells };
    });
    expect(audit.heads.length).toBeGreaterThan(5);
    for (const text of audit.heads) expect(text, `heading "${text}"`).not.toMatch(/[^.]\.$/);
    expect(audit.cells.length).toBeGreaterThan(20);
    for (const [pt, text] of audit.cells) {
      expect(pt, `table text "${text}" is ${pt} pt`).toBeGreaterThanOrEqual(8);
      expect(pt, `table text "${text}" is ${pt} pt`).toBeLessThanOrEqual(10);
    }
  });
});
