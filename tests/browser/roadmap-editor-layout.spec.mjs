import { test, expect } from "@playwright/test";

const USER_ID = "layout-test-user";
const ROADMAP_STORE = {
  version: 2,
  activeId: "layout-roadmap",
  mode: "editor",
  trash: {},
  sync: {},
  roadmaps: {
    "layout-roadmap": {
      id: "layout-roadmap",
      title: "Editor alignment test",
      subtitle: "Phase and milestone controls share a grid",
      templateType: "custom",
      range: { start: "2026-08-01", end: "2029-08-01" },
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-04T12:00:00.000Z",
      lanes: [{
        id: "layout-lane",
        name: "P2 · Access and business development",
        color: "#0073ea",
        sub: "Long lane names and descriptions stay separate from scheduled work.",
        items: [
          {
            id: "layout-phase",
            kind: "bar",
            label: "Implementation phase with a deliberately descriptive title",
            start: "2029-03-01",
            end: "2029-09-01",
            status: "in_progress",
            note: "Phase detail remains aligned beneath the item name.",
          },
          {
            id: "layout-milestone",
            kind: "milestone",
            label: "Executive approval",
            date: "2026-08-24",
            status: "planned",
            gate: true,
            note: "Milestone detail uses the same note column.",
          },
        ],
      }, {
        id: "empty-lane",
        name: "Empty lane",
        color: "#8b5cf6",
        items: [],
      }],
    },
  },
};

async function openSeededRoadmap(page) {
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      window.supabase = {
        createClient() {
          const session = {
            access_token: "layout-test-token",
            user: { id: "${USER_ID}", email: "layout@example.com", app_metadata: {}, user_metadata: {} }
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
  await page.addInitScript(({ userId, store }) => {
    localStorage.setItem(`roadmap_builder_v2:${userId}`, JSON.stringify(store));
  }, { userId: USER_ID, store: ROADMAP_STORE });
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#editorCard")).toBeVisible();
  await expect(page.locator(".item")).toHaveCount(2);
}

async function openTimelineView(page) {
  const timelineView = page.locator('[data-view="timeline"]');
  await expect(timelineView).toBeVisible();
  await timelineView.click();
  await expect(page.locator('[data-roadmap-view="timeline"]')).toBeVisible();
}

function edge(box) {
  return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
}

test("phase and milestone editor rows share uniform desktop columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openSeededRoadmap(page);

  const phase = page.locator('[data-item="layout-phase"]');
  const milestone = page.locator('[data-item="layout-milestone"]');
  for (const selector of ["select.kind", "input.lbl", ".item-dates", "select.chip", '[data-role="itemToggle"]']) {
    const [phaseBox, milestoneBox] = await Promise.all([
      phase.locator(selector).boundingBox(),
      milestone.locator(selector).boundingBox(),
    ]);
    expect(Math.abs(phaseBox.x - milestoneBox.x), `${selector} left edges align`).toBeLessThanOrEqual(1);
    expect(Math.abs(phaseBox.width - milestoneBox.width), `${selector} widths match`).toBeLessThanOrEqual(1);
  }

  const controlHeights = await page.locator(
    '.item select.kind, .item input.lbl, .item input[type="date"], .item select.chip, .item [data-role="itemToggle"]',
  ).evaluateAll(controls => controls.map(control => control.getBoundingClientRect().height));
  expect(Math.max(...controlHeights) - Math.min(...controlHeights), "primary controls share one height").toBeLessThanOrEqual(1);

  const headingPairs = [
    [".item-col-kind", "select.kind"],
    [".item-col-label", "input.lbl"],
    [".item-col-dates", ".item-dates"],
    [".item-col-status", "select.chip"],
  ];
  for (const [headingSelector, controlSelector] of headingPairs) {
    const [headingBox, controlBox] = await Promise.all([
      page.locator(headingSelector).boundingBox(),
      phase.locator(controlSelector).boundingBox(),
    ]);
    expect(Math.abs(headingBox.x - controlBox.x), `${headingSelector} labels its control column`).toBeLessThanOrEqual(1);
  }
  const [detailsHeading, detailsButton] = await Promise.all([
    page.locator(".item-col-actions").boundingBox(),
    phase.locator('[data-role="itemToggle"]').boundingBox(),
  ]);
  expect(Math.abs(edge(detailsHeading).right - edge(detailsButton).right), "Details labels the compact disclosure column").toBeLessThanOrEqual(3);
  await phase.locator('[data-role="itemToggle"]').click();
  await milestone.locator('[data-role="itemToggle"]').click();
  await expect(phase.locator(".item-detail-panel")).toBeVisible();
  await expect(milestone.locator(".item-detail-panel")).toBeVisible();
  await expect(phase.locator("input.note-inp")).toHaveValue("Phase detail remains aligned beneath the item name.");
  await expect(milestone.locator('.gate-tog input[data-role="gate"]')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1441);
  await expect(page.locator('[data-lane="empty-lane"] .item-columns')).toHaveCount(0);
});

test("tablet rows keep their visual flow in keyboard order", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1100 });
  await openSeededRoadmap(page);

  await expect(page.locator(".item-columns")).toBeHidden();
  for (const item of [page.locator('[data-item="layout-phase"]'), page.locator('[data-item="layout-milestone"]')]) {
    const [kind, label, dates, status, details] = await Promise.all([
      item.locator("select.kind").boundingBox(),
      item.locator("input.lbl").boundingBox(),
      item.locator(".item-dates").boundingBox(),
      item.locator("select.chip").boundingBox(),
      item.locator('[data-role="itemToggle"]').boundingBox(),
    ]);
    expect(Math.abs(kind.y - label.y), "type and item share the first row").toBeLessThanOrEqual(1);
    expect(edge(label).bottom).toBeLessThanOrEqual(edge(dates).top + 1);
    for (const secondRowControl of [status, details]) {
      expect(Math.abs(dates.y - secondRowControl.y), "schedule, status, and details share the second row").toBeLessThanOrEqual(1);
    }
    await item.locator('[data-role="itemToggle"]').click();
    const [expandedDetails, detailPanel] = await Promise.all([
      item.locator('[data-role="itemToggle"]').boundingBox(),
      item.locator(".item-detail-panel").boundingBox(),
    ]);
    expect(edge(expandedDetails).bottom).toBeLessThanOrEqual(edge(detailPanel).top + 1);

    const focusOrder = await item.locator(
      'select.kind, input.lbl, input[type="date"], select.chip, [data-role="itemToggle"], input.note-inp, .gate-tog input, .item-actions button',
    ).evaluateAll(controls => controls.filter(control => control.getClientRects().length).map(control => {
      const rect = control.getBoundingClientRect();
      return {
        name: control.getAttribute("aria-label") || control.dataset.role || control.className,
        center: rect.top + rect.height / 2,
      };
    }));
    for (let index = 1; index < focusOrder.length; index += 1) {
      expect(
        focusOrder[index].center,
        `tab order from ${focusOrder[index - 1].name} to ${focusOrder[index].name} never jumps back to an earlier visual row`,
      ).toBeGreaterThanOrEqual(focusOrder[index - 1].center - 2);
    }
  }
});

test("roadmap editor remains contained across responsive breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 1121, height: 1100 });
  await openSeededRoadmap(page);

  for (const width of [320, 375, 720, 721, 1120, 1121, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px viewport has no horizontal overflow`).toBeLessThanOrEqual(width + 1);
    const shellWidth = await page.locator(".wrap").evaluate(element => element.getBoundingClientRect().width);
    expect(shellWidth, `${width}px viewport uses the available shell width`).toBeGreaterThanOrEqual(Math.min(width, 1800) - 1);

    const laneBox = edge(await page.locator('[data-lane="layout-lane"]').boundingBox());
    const controls = await page.locator('[data-lane="layout-lane"] .item input, [data-lane="layout-lane"] .item select, [data-lane="layout-lane"] .item button')
      .evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute("aria-label") || element.dataset.role, left: rect.left, right: rect.right };
      }));
    for (const control of controls) {
      expect(control.left, `${control.label} begins inside its lane at ${width}px`).toBeGreaterThanOrEqual(laneBox.left - 1);
      expect(control.right, `${control.label} ends inside its lane at ${width}px`).toBeLessThanOrEqual(laneBox.right + 1);
    }
  }
});

test("timeline lane labels stay inside a bounded gutter instead of covering bars", async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 1100 });
  await openSeededRoadmap(page);
  await openTimelineView(page);

  const result = await page.locator("#gantt svg").evaluate(svg => {
    const gutter = Number(svg.dataset.laneGutter);
    const labels = [...svg.querySelectorAll('[data-role="timeline-lane-label"] text')].map(element => {
      const box = element.getBBox();
      return { text:element.textContent, left:box.x, right:box.x + box.width, top:box.y, bottom:box.y + box.height };
    });
    const bars = [...svg.querySelectorAll('rect[height="22"]')].map(element => {
      const box = element.getBBox();
      return { left:box.x, right:box.x + box.width, top:box.y, bottom:box.y + box.height };
    });
    const overlaps = labels.flatMap(label => bars.filter(bar =>
      Math.min(label.right, bar.right) - Math.max(label.left, bar.left) > 2
      && Math.min(label.bottom, bar.bottom) - Math.max(label.top, bar.top) > 2
    ).map(bar => ({ label, bar })));
    return {
      gutter,
      labels,
      overlaps,
      fullLabel:svg.querySelector('[data-role="timeline-lane-label"] title')?.textContent || "",
    };
  });

  expect(result.gutter).toBeGreaterThan(184);
  expect(result.gutter).toBeLessThanOrEqual(360);
  for (const label of result.labels) expect(label.right, `${label.text} stays inside the lane gutter`).toBeLessThanOrEqual(result.gutter - 12);
  expect(result.overlaps).toEqual([]);
  expect(result.fullLabel).toContain("P2 · Access and business development");
});

test("Fit shows a multi-year project without clipping or overlapping header labels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openSeededRoadmap(page);
  await openTimelineView(page);

  const assertFittedTimeline = async width => {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForTimeout(180);
    await page.locator("#zoomFit").click();
    await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "true");

    const result = await page.locator("#gantt svg").evaluate(svg => {
      const scroller = document.querySelector(".tl-scroll");
      const periodLabels = [...svg.querySelectorAll('[data-role="timeline-period-label"]')].map(element => {
        const box = element.getBBox();
        return { text:element.textContent, left:box.x, right:box.x + box.width, top:box.y, bottom:box.y + box.height };
      }).sort((a,b) => a.left-b.left);
      const headerOverlaps = periodLabels.slice(1).filter((label,index) => label.left < periodLabels[index].right + 9);
      const laneLabels = [...svg.querySelectorAll('[data-role="timeline-lane-label"] text')].map(element => {
        const box = element.getBBox();
        return { left:box.x, right:box.x + box.width, top:box.y, bottom:box.y + box.height };
      });
      const bars = [...svg.querySelectorAll('rect[height="22"]')].map(element => {
        const box = element.getBBox();
        return { left:box.x, right:box.x + box.width, top:box.y, bottom:box.y + box.height };
      });
      const laneBarOverlaps = laneLabels.flatMap(label => bars.filter(bar =>
        Math.min(label.right, bar.right) - Math.max(label.left, bar.left) > 2
        && Math.min(label.bottom, bar.bottom) - Math.max(label.top, bar.top) > 2
      ));
      const laneGutter = Number(svg.dataset.laneGutter);
      const plotRight = Number(svg.dataset.plotRight);
      const itemLabels = [...svg.querySelectorAll('[data-role="timeline-item-label"]')].map(element => {
        const box = element.getBBox();
        return { text:element.textContent, left:box.x, right:box.x + box.width };
      });
      return {
        fitMode:svg.dataset.fitMode,
        svgWidth:svg.getBoundingClientRect().width,
        viewportWidth:scroller.clientWidth,
        scrollLeft:scroller.scrollLeft,
        periodLabels,
        headerOverlaps,
        laneBarOverlaps,
        itemLabelsOutsidePlot:itemLabels.filter(label => label.left < laneGutter - 1 || label.right > plotRight + 1),
        titles:[...svg.querySelectorAll("title")].map(title => title.textContent),
      };
    });

    expect(result.fitMode).toBe("true");
    expect(result.svgWidth, `${width}px Fit timeline stays inside its viewport`).toBeLessThanOrEqual(result.viewportWidth + 1);
    expect(result.scrollLeft).toBe(0);
    expect(result.periodLabels.length).toBeGreaterThanOrEqual(4);
    expect(result.headerOverlaps).toEqual([]);
    expect(result.laneBarOverlaps).toEqual([]);
    expect(result.itemLabelsOutsidePlot).toEqual([]);
    expect(result.titles.some(title => title.includes("P2 · Access and business development"))).toBe(true);
    expect(result.titles.some(title => title.includes("Implementation phase with a deliberately descriptive title"))).toBe(true);
    expect(result.titles.some(title => title.includes("Phase detail remains aligned beneath the item name."))).toBe(true);
  };

  for (const width of [1440, 1920, 2560]) await assertFittedTimeline(width);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(180);
  await page.locator("#zoomIn").click();
  await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator("#gantt svg").getAttribute("data-fit-mode")).toBe("false");
  const detailed = await page.locator("#gantt svg").evaluate(svg => ({
    svgWidth:svg.getBoundingClientRect().width,
    viewportWidth:document.querySelector(".tl-scroll").clientWidth,
  }));
  expect(detailed.svgWidth).toBeGreaterThan(detailed.viewportWidth);

  await page.locator("#zoomFit").click();
  await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "true");
});

test("roadmap editor rows reflow without clipping on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1100 });
  await openSeededRoadmap(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await expect(page.locator(".item-columns")).toBeHidden();
  expect(await page.locator("#titleIn").evaluate(element => getComputedStyle(element).textOverflow)).not.toBe("ellipsis");

  await openTimelineView(page);
  await expect(page.locator(".zoomer")).toBeVisible();
  await expect(page.locator('#gantt svg[data-plot-width]')).toHaveAttribute("data-plot-width", /^(?!0(?:\.0+)?$)\d+(?:\.\d+)?$/);
  await page.locator('[data-view="details"]').click();
  await expect(page.locator('[data-roadmap-view="details"]')).toBeVisible();

  const laneBox = edge(await page.locator('[data-lane="layout-lane"]').boundingBox());
  const controls = await page.locator('[data-lane="layout-lane"] .item input, [data-lane="layout-lane"] .item select, [data-lane="layout-lane"] .item button').evaluateAll(elements => elements
    .filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })
    .map(element => {
      const rect = element.getBoundingClientRect();
      return { label: element.getAttribute("aria-label") || element.dataset.role, left: rect.left, right: rect.right };
    }));
  for (const control of controls) {
    expect(control.left, `${control.label} begins inside its lane`).toBeGreaterThanOrEqual(laneBox.left - 1);
    expect(control.right, `${control.label} ends inside its lane`).toBeLessThanOrEqual(laneBox.right + 1);
  }

  for (const item of [page.locator('[data-item="layout-phase"]'), page.locator('[data-item="layout-milestone"]')]) {
    const [kind, label, dates, status, details] = await Promise.all([
      item.locator("select.kind").boundingBox(),
      item.locator("input.lbl").boundingBox(),
      item.locator(".item-dates").boundingBox(),
      item.locator("select.chip").boundingBox(),
      item.locator('[data-role="itemToggle"]').boundingBox(),
    ]);
    expect(edge(kind).bottom).toBeLessThanOrEqual(edge(label).top + 1);
    expect(edge(label).bottom).toBeLessThanOrEqual(edge(dates).top + 1);
    expect(edge(dates).bottom).toBeLessThanOrEqual(edge(status).top + 1);
    expect(Math.abs(status.y - details.y), "status and details share the compact final row").toBeLessThanOrEqual(1);
    await item.locator('[data-role="itemToggle"]').click();
    const [expandedDetails, detailPanel] = await Promise.all([
      item.locator('[data-role="itemToggle"]').boundingBox(),
      item.locator(".item-detail-panel").boundingBox(),
    ]);
    expect(edge(expandedDetails).bottom).toBeLessThanOrEqual(edge(detailPanel).top + 1);
    const panelControls = await item.locator(".item-detail-panel input, .item-detail-panel button").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left:rect.left, right:rect.right };
    }));
    for (const control of panelControls) {
      expect(control.left).toBeGreaterThanOrEqual(laneBox.left - 1);
      expect(control.right).toBeLessThanOrEqual(laneBox.right + 1);
    }
  }
});
