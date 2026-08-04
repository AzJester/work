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
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-04T12:00:00.000Z",
      lanes: [{
        id: "layout-lane",
        name: "Delivery",
        color: "#0073ea",
        items: [
          {
            id: "layout-phase",
            kind: "bar",
            label: "Implementation phase with a deliberately descriptive title",
            start: "2026-08-03",
            end: "2026-08-21",
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

function edge(box) {
  return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
}

test("phase and milestone editor rows share uniform desktop columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openSeededRoadmap(page);

  const phase = page.locator('[data-item="layout-phase"]');
  const milestone = page.locator('[data-item="layout-milestone"]');
  for (const selector of ["select.kind", "input.lbl", ".item-dates", "select.chip", ".item-gate-slot", ".item-actions", "input.note-inp"]) {
    const [phaseBox, milestoneBox] = await Promise.all([
      phase.locator(selector).boundingBox(),
      milestone.locator(selector).boundingBox(),
    ]);
    expect(Math.abs(phaseBox.x - milestoneBox.x), `${selector} left edges align`).toBeLessThanOrEqual(1);
    expect(Math.abs(phaseBox.width - milestoneBox.width), `${selector} widths match`).toBeLessThanOrEqual(1);
  }

  const controlHeights = await page.locator(
    '.item select.kind, .item input.lbl, .item input[type="date"], .item select.chip, .item .gate-tog, .item-actions .icon-btn',
  ).evaluateAll(controls => controls.map(control => control.getBoundingClientRect().height));
  expect(Math.max(...controlHeights) - Math.min(...controlHeights), "primary controls share one height").toBeLessThanOrEqual(1);
  await expect(phase.locator(".item-gate-slot")).toBeEmpty();

  const headingPairs = [
    [".item-col-kind", "select.kind"],
    [".item-col-label", "input.lbl"],
    [".item-col-dates", ".item-dates"],
    [".item-col-status", "select.chip"],
    [".item-col-gate", ".item-gate-slot"],
  ];
  for (const [headingSelector, controlSelector] of headingPairs) {
    const [headingBox, controlBox] = await Promise.all([
      page.locator(headingSelector).boundingBox(),
      phase.locator(controlSelector).boundingBox(),
    ]);
    expect(Math.abs(headingBox.x - controlBox.x), `${headingSelector} labels its control column`).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1441);
  await expect(page.locator('[data-lane="empty-lane"] .item-columns')).toHaveCount(0);
});

test("tablet rows keep their visual flow in keyboard order", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1100 });
  await openSeededRoadmap(page);

  await expect(page.locator(".item-columns")).toBeHidden();
  for (const item of [page.locator('[data-item="layout-phase"]'), page.locator('[data-item="layout-milestone"]')]) {
    const [kind, label, dates, status, gate, actions, note] = await Promise.all([
      item.locator("select.kind").boundingBox(),
      item.locator("input.lbl").boundingBox(),
      item.locator(".item-dates").boundingBox(),
      item.locator("select.chip").boundingBox(),
      item.locator(".item-gate-slot").boundingBox(),
      item.locator(".item-actions").boundingBox(),
      item.locator("input.note-inp").boundingBox(),
    ]);
    expect(Math.abs(kind.y - label.y), "type and item share the first row").toBeLessThanOrEqual(1);
    expect(edge(label).bottom).toBeLessThanOrEqual(edge(dates).top + 1);
    for (const secondRowControl of [status, gate, actions]) {
      expect(Math.abs(dates.y - secondRowControl.y), "schedule, status, gate, and actions share the second row").toBeLessThanOrEqual(1);
    }
    expect(edge(actions).bottom).toBeLessThanOrEqual(edge(note).top + 1);

    const focusCenters = await item.locator(
      'select.kind, input.lbl, input[type="date"], select.chip, .gate-tog input, .item-actions button, input.note-inp',
    ).evaluateAll(controls => controls.map(control => {
      const rect = control.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }));
    for (let index = 1; index < focusCenters.length; index += 1) {
      expect(focusCenters[index], "tab order never jumps back to an earlier visual row").toBeGreaterThanOrEqual(focusCenters[index - 1] - 2);
    }
  }
});

test("roadmap editor remains contained across responsive breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 1121, height: 1100 });
  await openSeededRoadmap(page);

  for (const width of [1121, 1120, 721, 720]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px viewport has no horizontal overflow`).toBeLessThanOrEqual(width + 1);

    const laneBox = edge(await page.locator('[data-lane="layout-lane"]').boundingBox());
    const controls = await page.locator('[data-lane="layout-lane"] .item input, [data-lane="layout-lane"] .item select, [data-lane="layout-lane"] .item button')
      .evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute("aria-label") || element.dataset.role, left: rect.left, right: rect.right };
      }));
    for (const control of controls) {
      expect(control.left, `${control.label} begins inside its lane at ${width}px`).toBeGreaterThanOrEqual(laneBox.left - 1);
      expect(control.right, `${control.label} ends inside its lane at ${width}px`).toBeLessThanOrEqual(laneBox.right + 1);
    }
  }
});

test("roadmap editor rows reflow without clipping on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  await openSeededRoadmap(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await expect(page.locator(".item-columns")).toBeHidden();

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
    const [kind, label, dates, status, actions, note] = await Promise.all([
      item.locator("select.kind").boundingBox(),
      item.locator("input.lbl").boundingBox(),
      item.locator(".item-dates").boundingBox(),
      item.locator("select.chip").boundingBox(),
      item.locator(".item-actions").boundingBox(),
      item.locator("input.note-inp").boundingBox(),
    ]);
    expect(edge(kind).bottom).toBeLessThanOrEqual(edge(label).top + 1);
    expect(edge(label).bottom).toBeLessThanOrEqual(edge(dates).top + 1);
    expect(edge(dates).bottom).toBeLessThanOrEqual(edge(status).top + 1);
    expect(edge(status).bottom).toBeLessThanOrEqual(edge(actions).top + 1);
    expect(edge(actions).bottom).toBeLessThanOrEqual(edge(note).top + 1);
  }
});
