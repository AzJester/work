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
  test("renders the seed plan with the reference totals", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await expect(page.locator(".block")).toHaveCount(15);
    await expect(page.locator(".card")).toHaveCount(7);
    await expect(page.locator("#backlogMeta")).toContainText("$201,000");
    const committed = page.locator("#yearTable tbody tr", { hasText: "Committed" });
    await expect(committed).toContainText("$1,582,846");
    const remaining = page.locator("#yearTable tbody tr", { hasText: "Remaining" });
    await expect(remaining).toContainText("-$239,230");
    await expect(remaining).toContainText("Over");
    await expect(page.locator("#engineTable tr[data-engine='horizon']")).toContainText("$160,270");
    await expect(page.locator(".asof-pill")).toHaveText(/As of 2026-07-17/i);
  });

  test("adds a block through the dialog and persists it", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await page.click("#addBlockBtn");
    const dialog = page.locator("#blockDialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("input[name='name']").fill("Playwright block");
    await dialog.locator("select[name='engineId']").selectOption("colossus");
    await dialog.locator("input[name='cost']").fill("36,500");
    await dialog.locator("input[name='start']").fill("2026-01-01");
    await dialog.locator("input[name='end']").fill("2026-12-31");
    await dialog.locator("button[type='submit']").click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".block")).toHaveCount(16);
    await expect(page.locator("#engineTable tr[data-engine='colossus']")).toContainText("$36,500");
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
    await dialog.locator("button[type='submit']").click();
    await expect(page.locator("#blockError")).toContainText("before the start date");
    await expect(dialog).toBeVisible();
  });

  test("moving the as-of date changes the spent and planned split but not committed", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const spent = page.locator("#yearTable tbody tr", { hasText: "Spent" });
    await expect(spent).toContainText("$1,044,695");
    await page.fill("#asOfInput", "2027-01-01");
    await page.locator("#asOfInput").dispatchEvent("change");
    await expect(spent).toContainText("$1,582,846");
    await expect(page.locator("#yearTable tbody tr", { hasText: "Planned" })).toContainText("$0");
    await expect(page.locator("#yearTable tbody tr", { hasText: "Committed" })).toContainText("$1,582,846");
  });

  test("editing the annual budget updates remaining", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const input = page.locator("input[data-year='2026']");
    await input.fill("2,000,000");
    await input.press("Enter");
    await expect(page.locator("#yearTable tbody tr", { hasText: "Remaining" })).toContainText("$417,154");
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

  test("export downloads a document that validates and matches the page", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
    expect(download.suggestedFilename()).toMatch(/^budget-planner-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const exported = JSON.parse(readFileSync(path, "utf8"));
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

  test("the hours edition shows hours only, keeps its own plan, and logs worked hours", async ({ page, baseURL }) => {
    await page.goto(new URL("../hours-planner.html", new URL(baseURL)).href, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/budget-planner\.html\?unit=hours$/);
    await expect(page.locator(".lane")).toHaveCount(6);
    await expect(page).toHaveTitle("Roadmap and Hours Planner");
    await expect(page.locator("#pageTitle")).toHaveText("Roadmap & Hours Planner");
    await expect(page.locator("#subtitle")).toContainText("Hours");
    await expect(page.locator("#yearTable thead")).toContainText("Hours by year");
    await expect(page.locator("#engineTable thead")).toContainText("Worked");
    await expect(page.locator("#engineTable thead")).toContainText("Forecast");
    await expect(page.locator("#yearTable")).not.toContainText("$");
    await expect(page.locator("#engineTable")).not.toContainText("$");
    const core = page.locator("#engineTable tr[data-engine='core']");
    await expect(core).toContainText("640 h");
    await expect(core).toContainText("560 h");
    await expect(page.locator(".block[data-block='b01']")).toContainText("640 h / 1,200 h");
    // Cost: labor at the hourly rate plus materials, with the rate editable in place.
    await expect(page.locator("#costSection")).toBeVisible();
    await expect(page.locator("#rateInput")).toHaveValue("102.00");
    const costCore = page.locator("#costEngineTable tr[data-engine='core']");
    await expect(costCore).toContainText("$122,400");
    await expect(costCore).toContainText("$18,500");
    await expect(page.locator("#costYearTable tr[data-row='committed']")).toContainText("$1,635,558");
    await expect(page.locator("#blocksTable thead")).toContainText("Materials");
    await page.fill("#rateInput", "100");
    await page.press("#rateInput", "Enter");
    await expect(costCore).toContainText("$120,000");
    await expect(page.locator("#costMeta")).toContainText("$100.00");
    await page.click(".block[data-block='b01']");
    const dialog = page.locator("#blockDialog");
    await expect(dialog.locator("#materialsField")).toBeVisible();
    await expect(dialog.locator("#actualLabel")).toHaveText("Hours logged to date");
    await expect(dialog.locator("input[name='actual']")).toHaveValue("640");
    await dialog.locator("input[name='actual']").fill("1,300");
    await dialog.locator("button[type='submit']").click();
    await expect(core).toContainText("1,300 h");
    await expect(page.locator("#yearTable tr[data-row='remaining']")).toContainText("Over");
    // The dollars edition is a separate saved plan.
    await page.goto(plannerUrl(baseURL), { waitUntil: "domcontentloaded" });
    await expect(page.locator("#pageTitle")).toHaveText("Roadmap & Budget Planner");
    await expect(page.locator("#engineTable tr[data-engine='core']")).toContainText("$59,341");
    await expect(page.locator("#costSection")).toBeHidden();
    await page.click("#addBlockBtn");
    await expect(page.locator("#blockDialog #materialsField")).toBeHidden();
  });

  test("adds a year with one click, and edits or deletes blocks from the list and the keyboard", async ({ page, baseURL }) => {
    await openPlanner(page, baseURL);
    await expect(page.locator(".axis .years > div")).toHaveCount(2);
    await page.click("#addYearBtn");
    await expect(page.locator(".axis .years > div")).toHaveCount(3);
    await expect(page.locator(".axis .years > div").nth(2)).toHaveText("2028");
    await expect(page.locator("#yearTable thead")).toContainText("2028");
    await expect(page.locator("#subtitle")).toContainText("2026 – 2028");
    const rows = page.locator("#blocksTable tbody tr");
    await expect(rows).toHaveCount(22);
    await expect(page.locator("#blocksMeta")).toHaveText("15 scheduled · 7 backlog");
    await page.locator("#blocksTable button[aria-label='Edit Aurora ML POC']").click();
    const dialog = page.locator("#blockDialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input[name='name']")).toHaveValue("Aurora ML POC");
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
    await expect(page.locator("#navCost")).toBeHidden();
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
