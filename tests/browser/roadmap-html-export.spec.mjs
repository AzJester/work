import { test, expect } from "@playwright/test";

const USER_ID = "html-export-test-user";
const HOSTILE_PHASE_LABEL = 'Execute " onmouseover="window.__pwned=1 <script>window.__pwned=2</script> & \' plan';
const HOSTILE_PHASE_NOTE = 'Note " onfocus="window.__pwned=3 <img src=x onerror=window.__pwned=4> & \' remains text';
const HOSTILE_GATE_LABEL = 'Final " onmouseover="window.__pwned=5 <svg/onload=window.__pwned=6> approval';
const HOSTILE_GATE_NOTE = "Gate ' autofocus onfocus='window.__pwned=7 & <script>window.__pwned=8</script> remains text";
const STORE = {
  version: 2,
  activeId: "html-export-roadmap",
  mode: "editor",
  trash: {},
  sync: {},
  roadmaps: {
    "html-export-roadmap": {
      schema: "roadmap.v1",
      id: "html-export-roadmap",
      title: "Standalone scale test",
      subtitle: "A long plan that exercises responsive timeline scaling",
      premise: "The downloaded page must remain useful on desktop, tablet, phone, and print.",
      templateType: "custom",
      public: false,
      archived: false,
      range: { start: "2026-01-01", end: "2029-01-31" },
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-08-22T12:00:00.000Z",
      callouts: [],
      lanes: [{
        id: "export-delivery-lane",
        name: "Delivery",
        color: "#0073ea",
        sub: "The final gate deliberately shares the project finish date.",
        items: [{
          id: "export-primary-phase",
          kind: "bar",
          label: HOSTILE_PHASE_LABEL,
          start: "2026-01-01",
          end: "2029-01-31",
          status: "in_progress",
          note: HOSTILE_PHASE_NOTE,
        }, {
          id: "export-final-phase",
          kind: "bar",
          label: "Complete final acceptance",
          start: "2028-07-01",
          end: "2029-01-31",
          status: "planned",
          note: "This second dated phase makes the project finish marker visible.",
        }, {
          id: "export-final-gate",
          kind: "milestone",
          label: HOSTILE_GATE_LABEL,
          date: "2029-01-31",
          status: "planned",
          gate: true,
          note: HOSTILE_GATE_NOTE,
        }],
      }],
    },
  },
};

async function openSeededRoadmap(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      window.supabase = {
        createClient() {
          const session = {
            access_token: "html-export-test-token",
            user: { id: "${USER_ID}", email: "html-export@example.com", app_metadata: {}, user_metadata: {} }
          };
          return {
            auth: {
              getSession: async () => ({ data: { session } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }),
              updateUser: async () => ({ data: { user: session.user }, error: null })
            },
            rpc: async () => ({ data: [], error: null })
          };
        }
      };
    `,
  }));
  await page.route("**/sw.js", route => route.abort());
  await page.addInitScript(({ userId, store }) => {
    localStorage.setItem(`roadmap_builder_v2:${userId}`, JSON.stringify(store));
  }, { userId: USER_ID, store: STORE });
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#editorCard")).toBeVisible();
  await expect(page.locator("#titleIn")).toHaveValue("Standalone scale test");
}

async function downloadStandaloneHtml(page) {
  await page.getByRole("button", { name: "Export ▾", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "HTML page", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("standalone-scale-test-roadmap.html");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function openExportedHtml(page) {
  await openSeededRoadmap(page);
  const html = await downloadStandaloneHtml(page);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
  expect(html).not.toMatch(/<(?:script|link)\b[^>]+(?:src|href)=["']https?:/i);

  const externalRequests = [];
  const noteExternalRequest = request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  };
  page.on("request", noteExternalRequest);
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#gantt")).toHaveAttribute("data-period-cadence", /^(?:1|3|6|12)$/);
  page.off("request", noteExternalRequest);
  expect(externalRequests).toEqual([]);
  return html;
}

async function timelineGeometry(page) {
  return page.locator("#gantt").evaluate(gantt => {
    const scroller = document.querySelector(".gantt-scroll");
    return {
      fit: gantt.dataset.fitMode,
      zoom: Number(gantt.dataset.zoom),
      width: gantt.getBoundingClientRect().width,
      viewport: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      scrollLeft: scroller.scrollLeft,
      detailWidth: Number(gantt.dataset.detailWidth),
      cadence: Number(gantt.dataset.periodCadence),
      weekPixels: Number(gantt.dataset.weekPixels),
      weekDetail: gantt.dataset.weekDetail,
    };
  });
}

async function expectScaleSettled(page, predicate) {
  await expect.poll(async () => predicate(await timelineGeometry(page))).toBe(true);
  return timelineGeometry(page);
}

async function expectHeaderLabelsDoNotOverlap(page) {
  const result = await page.locator("#gantt").evaluate(gantt => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const boxes = selector => [...gantt.querySelectorAll(selector)].filter(visible).map(element => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const flags = boxes(".flag[data-flag-kind]");
    const gate = flags.find(flag => /^GATE/.test(flag.text));
    const finish = flags.find(flag => /^DAY /.test(flag.text));
    const months = boxes(".mlabel[data-month-index]").sort((a, b) => a.left - b.left);
    const head = gantt.querySelector(".g-head-time").getBoundingClientRect();
    const weeks = boxes(".wnum[data-week-index]").sort((a, b) => a.left - b.left);
    const weekGrids = boxes(".wgrid");
    return {
      gate,
      finish,
      finalFlagsOverlap: gate && finish ? overlap(gate, finish) : null,
      monthOverlap: months.slice(1).some((label, index) => label.left < months[index].right + 1),
      totalWeekLabels: gantt.querySelectorAll(".wnum[data-week-index]").length,
      visibleWeekLabels: weeks.length,
      visibleWeekGridLines: weekGrids.length,
      weekOverlap: weeks.slice(1).some((label, index) => label.left < weeks[index].right + 1),
      weeksOutsideHeader: weeks.filter(label => label.left < head.left - 1 || label.right > head.right + 1
        || label.top < head.top - 1 || label.bottom > head.bottom + 1),
    };
  });
  expect(result.gate).toBeTruthy();
  expect(result.finish).toBeTruthy();
  expect(result.finalFlagsOverlap).toBe(false);
  expect(result.monthOverlap).toBe(false);
  expect(result.totalWeekLabels).toBeGreaterThan(0);
  expect(result.weekOverlap).toBe(false);
  expect(result.weeksOutsideHeader).toEqual([]);
  return result;
}

function expectWeekDetailCoherent(geometry, header, context) {
  expect(["numbers", "grid", "none"], `${context} publishes a known weekly-detail state`).toContain(geometry.weekDetail);
  expect(Number.isFinite(geometry.weekPixels), `${context} publishes measured weekly spacing`).toBe(true);
  if (geometry.weekDetail === "numbers") {
    expect(geometry.weekPixels, `${context} shows numbers only with enough space`).toBeGreaterThanOrEqual(26);
    expect(header.visibleWeekLabels, `${context} number mode keeps visible weekly labels`).toBeGreaterThan(0);
    expect(header.visibleWeekGridLines, `${context} number mode keeps weekly grid lines`).toBeGreaterThan(0);
  } else {
    expect(header.visibleWeekLabels, `${context} suppresses weekly numbers`).toBe(0);
    if (geometry.weekDetail === "grid") {
      expect(geometry.weekPixels, `${context} grid mode retains usable weekly spacing`).toBeGreaterThanOrEqual(11);
      expect(geometry.weekPixels, `${context} grid mode is too dense for numbers`).toBeLessThan(26);
      expect(header.visibleWeekGridLines, `${context} grid mode keeps weekly grid lines`).toBeGreaterThan(0);
    } else {
      expect(geometry.weekPixels, `${context} none mode is too dense for weekly detail`).toBeLessThan(11);
      expect(header.visibleWeekGridLines, `${context} none mode suppresses weekly grid lines`).toBe(0);
    }
  }
}

test("downloaded HTML is self-contained and exposes accessible timeline controls", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openExportedHtml(page);

  const group = page.getByRole("group", { name: "Timeline scale", exact: true });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button")).toHaveCount(4);
  await expect(page.locator("#zoomFit")).toHaveText("Fit");
  await expect(page.locator("#zoomOut")).toHaveText("−");
  await expect(page.locator("#zoomReset")).toHaveText("100%");
  await expect(page.locator("#zoomIn")).toHaveText("+");
  for (const selector of ["#zoomFit", "#zoomOut", "#zoomReset", "#zoomIn"]) {
    await expect(page.locator(selector)).toHaveAttribute("aria-controls", "gantt");
  }
  await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#timelineScaleStatus")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator('.gantt-scroll[tabindex="0"]')).toHaveAttribute("aria-label", "Scrollable roadmap timeline");
  await expect(page.locator('#gantt [data-tid][tabindex="0"][role="img"]')).toHaveCount(3);
  const accessibleItems = await page.locator("#gantt [data-tid][tabindex='0'][role='img']")
    .evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")));
  expect(accessibleItems.every(Boolean)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("hostile exported labels remain inert text in attributes and tooltips", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openExportedHtml(page);

  const items = page.locator('#gantt [data-tid][tabindex="0"][role="img"]');
  await expect(items).toHaveCount(3);
  const ariaLabels = await items.evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")));
  expect(ariaLabels).toEqual(expect.arrayContaining([
    [HOSTILE_PHASE_LABEL, "Jan 1 to Jan 31, 2029", "In progress", HOSTILE_PHASE_NOTE].join(". "),
    [HOSTILE_GATE_LABEL, "Jan 31, 2029", "Planned", HOSTILE_GATE_NOTE].join(". "),
  ]));

  await expect(page.locator("[onmouseover], [onfocus], [onerror], [onload], [autofocus]")).toHaveCount(0);
  await expect(page.locator("#gantt script, #gantt img, #gantt svg, #gantt iframe, #gantt object, #gantt embed")).toHaveCount(0);
  for (const item of await items.all()) {
    await item.focus();
    await item.hover();
  }
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(pageErrors).toEqual([]);
});

test("Fit, zoom out, 100%, and zoom in remain coherent across resize", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openExportedHtml(page);

  for (const { name, width, shouldFullyFit } of [
    { name: "desktop", width: 1440, shouldFullyFit: true },
    { name: "tablet", width: 768, shouldFullyFit: false },
    { name: "phone", width: 390, shouldFullyFit: false },
  ]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.locator("#zoomFit").click();
    const fitted = await expectScaleSettled(page, value => value.fit === "true"
      && (shouldFullyFit ? value.width <= value.viewport + 1 : value.width > value.viewport + 1));
    await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "true");
    expect(fitted.scrollLeft, `${name} Fit returns to the start`).toBe(0);
    if (shouldFullyFit) expect(fitted.scrollWidth, `${name} Fit needs no material horizontal scrolling`).toBeLessThanOrEqual(fitted.viewport + 2);
    else expect(fitted.scrollWidth, `${name} Fit retains readable horizontal detail`).toBeGreaterThan(fitted.viewport + 1);
    const fittedHeader = await expectHeaderLabelsDoNotOverlap(page);
    expectWeekDetailCoherent(fitted, fittedHeader, `${name} Fit`);

    await page.locator("#zoomReset").click();
    const reset = await expectScaleSettled(page, value => value.fit === "false" && value.zoom === 1);
    await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#zoomReset")).toHaveText("100%");
    await expect(page.locator("#timelineScaleStatus")).toHaveText("Detailed timeline at 100 percent.");
    expect(reset.width, `${name} 100% restores the detailed width`).toBeGreaterThanOrEqual(reset.detailWidth - 1);
    const resetHeader = await expectHeaderLabelsDoNotOverlap(page);
    expectWeekDetailCoherent(reset, resetHeader, `${name} 100%`);

    await page.locator("#zoomIn").click();
    const zoomedIn = await expectScaleSettled(page, value => value.zoom === 1.25);
    await expect(page.locator("#zoomReset")).toHaveText("125%");
    expect(zoomedIn.width, `${name} + increases the detailed width`).toBeGreaterThan(reset.width);

    await page.locator("#zoomOut").click();
    const backAtReset = await expectScaleSettled(page, value => value.zoom === 1);
    await expect(page.locator("#zoomReset")).toHaveText("100%");
    expect(Math.abs(backAtReset.width - reset.width), `${name} - returns from 125% to 100%`).toBeLessThanOrEqual(1);

    await page.locator("#zoomOut").click();
    const zoomedOut = await expectScaleSettled(page, value => value.zoom === 0.75);
    await expect(page.locator("#zoomReset")).toHaveText("75%");
    expect(zoomedOut.width, `${name} - decreases the detailed width`).toBeLessThan(reset.width);
    const zoomedOutHeader = await expectHeaderLabelsDoNotOverlap(page);
    expectWeekDetailCoherent(zoomedOut, zoomedOutHeader, `${name} 75%`);

    await page.locator(".gantt-scroll").evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await page.locator("#zoomFit").click();
    const refitted = await expectScaleSettled(page, value => value.fit === "true" && value.scrollLeft === 0);
    expect(refitted.zoom, `${name} Fit preserves the last detailed zoom level`).toBe(0.75);
    await expect(page.locator("#timelineScaleStatus")).toContainText("Fit mode.");

    const buttons = await page.locator(".zoomer .zbtn").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, height: rect.height };
    }));
    for (const button of buttons) {
      expect(button.left, `${name} scale control begins inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(button.right, `${name} scale control ends inside the viewport`).toBeLessThanOrEqual(width + 1);
      expect(button.height, `${name} scale control has a usable target`).toBeGreaterThanOrEqual(width <= 760 ? 44 : 36);
    }
  }
});

test("standalone print layout fits the timeline without clipping and restores screen scale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openExportedHtml(page);
  await page.locator("#zoomIn").click();
  await expectScaleSettled(page, value => value.fit === "false" && value.zoom === 1.25);

  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  const printed = await page.locator("#gantt").evaluate(gantt => {
    const body = document.body.getBoundingClientRect();
    const rect = gantt.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      bodyLeft: body.left,
      bodyRight: body.right,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  await expect(page.locator(".gantt-tools")).toBeHidden();
  expect(printed.left).toBeGreaterThanOrEqual(printed.bodyLeft - 1);
  expect(printed.right).toBeLessThanOrEqual(printed.bodyRight + 1);
  expect(printed.documentWidth).toBeLessThanOrEqual(printed.viewportWidth + 2);
  const printHeader = await expectHeaderLabelsDoNotOverlap(page);
  expect(printHeader.visibleWeekLabels).toBe(0);
  expect(printHeader.visibleWeekGridLines).toBe(0);

  await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expectScaleSettled(page, value => value.fit === "false" && value.zoom === 1.25);
  await expect(page.locator("#zoomReset")).toHaveText("125%");
});
