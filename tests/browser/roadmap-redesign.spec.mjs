import { test, expect } from "@playwright/test";

const USER_ID = "redesign-test-user";
const USER_EMAIL = "redesign@example.com";

function roadmap({
  id,
  title,
  archived = false,
  updatedAt = "2026-08-21T12:00:00.000Z",
  lanes,
} = {}) {
  return {
    schema: "roadmap.v1",
    id,
    title,
    subtitle: "A decision-ready delivery plan with clear gates and ownership",
    premise: "Show leaders the whole plan, then disclose editing detail only when it is needed.",
    notes: "Executive context for this roadmap.",
    public: false,
    archived,
    templateType: "custom",
    range: { start: "2026-08-15", end: "2029-08-15" },
    createdAt: "2026-08-15T12:00:00.000Z",
    updatedAt,
    callouts: [],
    lanes: lanes || [{
      id: `${id}-governance`,
      name: "Governance and requirements",
      color: "#0073ea",
      sub: "Decisions and controls",
      items: [{
        id: `${id}-complete`,
        kind: "bar",
        label: "Approve the delivery charter",
        start: "2026-08-15",
        end: "2026-08-31",
        status: "complete",
        note: "Signed by the executive sponsor.",
      }, {
        id: `${id}-gate-one`,
        kind: "milestone",
        label: "Gate 1: architecture approved",
        date: "2026-09-15",
        status: "planned",
        gate: true,
        note: "Approval unlocks the first release.",
      }],
    }, {
      id: `${id}-delivery`,
      name: "Platform delivery",
      color: "#00a86b",
      sub: "Build, integrate, and validate",
      items: [{
        id: `${id}-delivery-complete`,
        kind: "bar",
        label: "Stand up development environment",
        start: "2026-09-01",
        end: "2026-10-31",
        status: "complete",
        note: "Environment acceptance recorded.",
      }, {
        id: `${id}-delivery-active`,
        kind: "bar",
        label: "Integrate the first product thread",
        start: "2026-11-01",
        end: "2027-06-30",
        status: "in_progress",
        note: "Weekly integration checkpoints.",
      }, {
        id: `${id}-delivery-risk`,
        kind: "bar",
        label: "Validate production readiness",
        start: "2027-07-01",
        end: "2028-03-31",
        status: "at_risk",
        note: "Staffing is the primary risk.",
      }],
    }, {
      id: `${id}-transition`,
      name: "Transition and scale",
      color: "#8b5cf6",
      sub: "Move from pilot to repeatable operations",
      items: [{
        id: `${id}-on-hold`,
        kind: "bar",
        label: "Scale across the enterprise",
        start: "2028-04-01",
        end: "2029-08-15",
        status: "on_hold",
        note: "Held until the pilot decision.",
      }, {
        id: `${id}-final-gate`,
        kind: "milestone",
        label: "Gate 2: enterprise release",
        date: "2029-08-15",
        status: "planned",
        gate: true,
        note: "Final investment decision.",
      }],
    }],
  };
}

const ACTIVE = roadmap({
  id: "active-roadmap",
  title: "Astrion Digital Engineering Environment — an intentionally long roadmap title for responsive wrapping",
});
const SECOND = roadmap({
  id: "second-roadmap",
  title: "Customer transition roadmap",
  updatedAt: "2026-08-20T12:00:00.000Z",
});
const ARCHIVED = roadmap({
  id: "archived-roadmap",
  title: "Retired pilot roadmap",
  archived: true,
  updatedAt: "2026-08-19T12:00:00.000Z",
});
const TRASHED = roadmap({
  id: "trashed-roadmap",
  title: "Discarded planning draft",
  updatedAt: "2026-08-18T12:00:00.000Z",
});

function ownerStore(overrides = {}) {
  return {
    version: 2,
    activeId: ACTIVE.id,
    mode: "editor",
    trash: { [TRASHED.id]: TRASHED },
    sync: {
      [ACTIVE.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
      [SECOND.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
      [ARCHIVED.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
    },
    roadmaps: {
      [ACTIVE.id]: ACTIVE,
      [SECOND.id]: SECOND,
      [ARCHIVED.id]: ARCHIVED,
    },
    ...overrides,
  };
}

function roadmapRow(doc, accessRole = "owner") {
  const owner = accessRole === "owner";
  return {
    id: doc.id,
    user_id: owner ? USER_ID : "another-owner",
    owner_user_id: owner ? USER_ID : "another-owner",
    owner_email: owner ? USER_EMAIL : "owner@example.com",
    title: doc.title,
    subtitle: doc.subtitle,
    template_type: doc.templateType,
    public: doc.public,
    revision: 4,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    deleted_at: null,
    access_role: accessRole,
    doc,
  };
}

function supabaseMock({ role = "owner", docs = [ACTIVE], publicMode = false } = {}) {
  const rows = docs.map(doc => roadmapRow(doc, role));
  const session = publicMode ? null : {
    access_token: "redesign-test-token",
    user: { id: USER_ID, email: USER_EMAIL, app_metadata: {}, user_metadata: {} },
  };
  return `
    (() => {
      const session = ${JSON.stringify(session)};
      const rows = ${JSON.stringify(rows)};
      window.__redesignRpcCalls = [];
      window.supabase = {
        createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }),
              updateUser: async () => ({ data: { user: session && session.user }, error: null })
            },
            rpc: async (name, args = {}) => {
              window.__redesignRpcCalls.push({ name, args });
              if (name === "roadmap_accessible_portfolio" || name === "roadmap_owner_portfolio") {
                return { data: rows, error: null };
              }
              if (name === "roadmap_public_list") return { data: rows, error: null };
              if (name === "roadmap_public_get") return { data: rows[0] || null, error: null };
              if (name === "roadmap_shared_get") return { data: { ok: true, roadmap: rows[0] || null }, error: null };
              if (name === "admin_roadmap") return { data: rows[0] || null, error: null };
              if (name === "roadmap_save_atomic") {
                const source = rows.find(row => row.id === args.p_id) || rows[0];
                return { data: { ok: true, conflict: false, reason: "saved", roadmap: Object.assign({}, source, { doc: args.p_doc, title: args.p_title }) }, error: null };
              }
              if (name === "roadmap_public_list" || name === "roadmap_share_list" || name === "roadmap_collaborator_list") {
                return { data: [], error: null };
              }
              return { data: [], error: null };
            },
            functions: { invoke: async () => ({ data: {}, error: null }) }
          };
        }
      };
    })();
  `;
}

async function openRoadmap(page, {
  store = ownerStore(),
  role = "owner",
  docs = [ACTIVE, SECOND, ARCHIVED],
  publicMode = false,
  query = "",
  width = 1440,
  height = 1050,
} = {}) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript({ content: supabaseMock({ role, docs, publicMode }) });
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "/* Supabase is mocked by the test init script. */",
  }));
  await page.route("**/sw.js", route => route.abort());
  if (!publicMode) {
    await page.addInitScript(({ userId, seededStore }) => {
      if (!sessionStorage.getItem("__roadmap_redesign_seeded")) {
        localStorage.setItem(`roadmap_builder_v2:${userId}`, JSON.stringify(seededStore));
        sessionStorage.setItem("__roadmap_redesign_seeded", "1");
      }
    }, { userId: USER_ID, seededStore: store });
  }
  await page.goto(`../roadmap.html${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
}

function selectedView(page, name) {
  return name === "portfolio" ? page.locator("#overviewView") : page.locator(`[data-roadmap-view="${name}"]`);
}

async function activateView(page, name) {
  const trigger = page.locator(`[data-view="${name}"]`);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator("body")).toHaveAttribute("data-active-view", name);
  await expect(selectedView(page, name)).toBeVisible();
  return trigger;
}

function rectsOverlap(a, b, padding = 0) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > padding
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > padding;
}

test("Portfolio and the three roadmap views are distinct, persistent, and legacy-safe", async ({ page }) => {
  const legacy = ownerStore();
  delete legacy.roadmapView;
  await openRoadmap(page, { store: legacy });

  await expect(page.locator("body")).toHaveAttribute("data-active-view", "details");
  await expect(selectedView(page, "details")).toBeVisible();
  for (const name of ["executive", "timeline", "details", "portfolio"]) {
    const button = page.locator(`[data-view="${name}"]`);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute("aria-controls", /\S+/);
  }

  const initialRoadmap = await page.evaluate(userId => {
    const state = JSON.parse(localStorage.getItem(`roadmap_builder_v2:${userId}`));
    return state.roadmaps[state.activeId];
  }, USER_ID);
  const savesBeforeNavigation = await page.evaluate(() => window.__redesignRpcCalls.filter(call => call.name === "roadmap_save_atomic").length);

  await activateView(page, "executive");
  await expect(selectedView(page, "timeline")).toBeHidden();
  await expect(selectedView(page, "details")).toBeHidden();

  await activateView(page, "timeline");
  await expect(selectedView(page, "executive")).toBeHidden();
  await expect(selectedView(page, "details")).toBeHidden();

  const saved = await page.evaluate(userId => JSON.parse(localStorage.getItem(`roadmap_builder_v2:${userId}`)), USER_ID);
  expect(saved.mode).toBe("editor");
  expect(saved.roadmapView).toBe("timeline");
  expect(saved.roadmaps[saved.activeId]).toEqual(initialRoadmap);
  expect(await page.evaluate(() => window.__redesignRpcCalls.filter(call => call.name === "roadmap_save_atomic").length)).toBe(savesBeforeNavigation);

  await activateView(page, "portfolio");
  const portfolioState = await page.evaluate(userId => JSON.parse(localStorage.getItem(`roadmap_builder_v2:${userId}`)), USER_ID);
  expect(portfolioState.mode).toBe("overview");
  expect(portfolioState.roadmapView).toBe("timeline");
});

test("inactive roadmap panels expose no keyboard-reachable controls", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "executive" }) });

  for (const active of ["executive", "timeline", "details"]) {
    await activateView(page, active);
    const hiddenFocusable = await page.locator(`[data-roadmap-view]:not([data-roadmap-view="${active}"])`).evaluateAll(panels => panels.flatMap(panel =>
      [...panel.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(element => {
        const style = getComputedStyle(element);
        return !element.disabled && element.tabIndex >= 0 && !element.hidden && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length;
      }).map(element => element.id || element.getAttribute("data-role") || element.tagName)
    ));
    expect(hiddenFocusable, `${active} leaves no focusable controls in hidden panels`).toEqual([]);
  }
});

test("the simplified toolbar keeps every established action and owner guard", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "details" }) });

  const primaryActions = ["new-roadmap", "share", "present", "export", "more"];
  for (const action of primaryActions) {
    await expect(page.locator(`[data-action="${action}"]`), `${action} has one stable action target`).toHaveCount(1);
  }

  const retainedActions = [
    "dup", "archive", "del",
    "png", "html", "json", "portfolio", "print",
    "import", "json-template", "jira",
    "save", "open", "share", "public", "access",
  ];
  const available = await page.locator("[data-act]").evaluateAll(elements => [...new Set(elements.map(element => element.dataset.act))]);
  for (const action of retainedActions) expect(available, `${action} remains reachable`).toContain(action);

  await expect(page.locator('[data-action="share"]')).toBeVisible();
  await expect(page.locator('[data-act="access"]')).toBeAttached();
  await expect(page.locator("#saveStatus")).toHaveAttribute("role", "status");

  const exportButton = page.locator('[data-action="export"]');
  await exportButton.click();
  const exportMenu = exportButton.locator("xpath=following-sibling::*[@role='menu']");
  await expect(exportMenu).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: "Interactive HTML", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(exportMenu).toBeHidden();

  const moreButton = page.locator('[data-action="more"]');
  await moreButton.click();
  const moreMenu = page.locator('#moreMenu[role="group"][aria-label="More roadmap actions"]');
  await expect(moreMenu).toBeVisible();
  await expect(moreMenu.getByRole("button", { name: "Import Roadmap JSON…", exact: true })).toBeVisible();
  const templatePicker = page.locator("#tmplPicker");
  await templatePicker.click();
  await expect(moreMenu, "interacting with the nested template picker keeps More open").toBeVisible();
  await moreButton.click();
  await expect(moreMenu).toBeHidden();
});

test("Present focuses the timeline and Escape restores the prior roadmap view", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "details" }) });
  await activateView(page, "details");

  await page.locator('[data-action="present"]').click();
  await expect(page.locator("body")).toHaveClass(/presentation-mode/);
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "timeline");
  await expect(page.locator('[data-action="present"]')).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/presentation-mode/);
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "details");
  await expect(page.locator('[data-action="present"]')).toHaveAttribute("aria-pressed", "false");
});

test("PNG export remains available from Executive and Details", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "executive" }) });

  for (const view of ["executive", "details"]) {
    await activateView(page, view);
    await page.locator('[data-action="export"]').click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "PNG image", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/i);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", view);
  }
});

test("Details progressively discloses lanes while preserving direct item editing", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "details" }) });
  await activateView(page, "details");

  const lanes = page.locator("#editor [data-lane]");
  await expect(lanes).toHaveCount(3);
  const firstToggle = lanes.nth(0).locator('[data-role="laneToggle"]');
  const secondToggle = lanes.nth(1).locator('[data-role="laneToggle"]');
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");
  await expect(secondToggle).toHaveAttribute("aria-expanded", "false");

  const secondBodyId = await secondToggle.getAttribute("aria-controls");
  expect(secondBodyId).toBeTruthy();
  await expect(page.locator(`#${secondBodyId}`)).toBeHidden();

  await secondToggle.focus();
  await page.keyboard.press("Enter");
  await expect(secondToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`#${secondBodyId}`)).toBeVisible();
  await expect(secondToggle).toBeFocused();

  const item = page.locator(`[data-item="${ACTIVE.id}-delivery-active"]`);
  await expect(item).toBeVisible();
  await item.locator('[data-role="label"]').fill("Integrate the priority product thread");
  await item.locator('[data-role="status"]').selectOption("complete");
  await expect(lanes.nth(1).locator(".lane-summary")).toContainText("67% complete");

  await expect.poll(() => page.evaluate(({ userId, itemId }) => {
    const state = JSON.parse(localStorage.getItem(`roadmap_builder_v2:${userId}`));
    const item = state.roadmaps["active-roadmap"].lanes.flatMap(lane => lane.items).find(entry => entry.id === itemId);
    return item && { label: item.label, status: item.status };
  }, { userId: USER_ID, itemId: `${ACTIVE.id}-delivery-active` })).toEqual({
    label: "Integrate the priority product thread",
    status: "complete",
  });

  await secondToggle.click();
  await expect(secondToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(`#${secondBodyId}`)).toBeHidden();
});

test("Executive view presents one derived decision band without the old duplicate summaries", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "executive" }) });
  await activateView(page, "executive");

  const band = page.locator("#executiveBand");
  await expect(band).toBeVisible();
  await expect(band.locator('[data-role="executive-completion"]')).toContainText(/29%|2\s+of\s+7/i);
  await expect(band.locator('[data-role="executive-range"]')).toContainText(/2026.*2029/i);
  await expect(band.locator('[data-role="executive-duration"]')).not.toBeEmpty();
  await expect(band.locator('[data-role="executive-upcoming"]')).toContainText("Gate 1: architecture approved");
  await expect(band.locator('[data-role="executive-health"]')).toContainText(/at risk|blocked|no flags/i);

  await expect(band.locator(":scope > #statChips")).toBeVisible();
  await expect(page.locator("#statChips")).toHaveCount(1);
  await expect(band.locator(":scope > #summaryCard")).toHaveCount(1);
  await expect(page.locator("#summaryCard")).toHaveCount(1);
  await expect(page.locator('[data-role="executive-completion"]')).toHaveCount(1);
});

test("Portfolio cards use one topology and Active, Archived, and Trash filters", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ mode: "overview", roadmapView: "executive" }) });
  await activateView(page, "portfolio");

  for (const filter of ["active", "archived", "trash"]) {
    const button = page.locator(`[data-portfolio-filter="${filter}"]`);
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");

    const cards = page.locator(`article[data-roadmap-id][data-status="${filter}"]`);
    await expect(cards).not.toHaveCount(0);
    for (const role of ["portfolio-title", "portfolio-preview", "portfolio-progress", "portfolio-health", "portfolio-next-milestone", "portfolio-sharing", "portfolio-updated"]) {
      await expect(cards.first().locator(`[data-role="${role}"]`), `${filter} cards include ${role}`).toHaveCount(1);
    }
    const mismatchedVisible = await page.locator(`article[data-roadmap-id]:not([data-status="${filter}"])`).evaluateAll(elements => elements.filter(element => {
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden";
    }).length);
    expect(mismatchedVisible).toBe(0);
  }
});

test("responsive shell contains titles and primary actions at every supported breakpoint", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "details" }), width: 1121 });

  for (const width of [320, 390, 720, 721, 1120, 1121, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.waitForTimeout(190);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px has no page-level horizontal overflow`).toBeLessThanOrEqual(width + 1);

    const visiblePrimary = page.locator("[data-action]:visible, [data-view]:visible");
    const actionBoxes = await visiblePrimary.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { name: element.dataset.action || element.dataset.view, left: box.left, right: box.right };
    }));
    for (const box of actionBoxes) {
      expect(box.left, `${box.name} starts in the ${width}px viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.right, `${box.name} ends in the ${width}px viewport`).toBeLessThanOrEqual(width + 1);
    }

    const title = page.locator("#titleIn");
    const titleBox = await title.boundingBox();
    expect(titleBox.x).toBeGreaterThanOrEqual(-1);
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(width + 1);

    const mobileActions = page.locator("#mobileActions");
    if (width <= 720) {
      await expect(mobileActions).toBeVisible();
      expect(await title.evaluate(element => getComputedStyle(element).textOverflow)).not.toBe("ellipsis");
      const titleGeometry = await title.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(titleGeometry.scrollHeight, `${width}px title is fully visible without an internal scrollbar`).toBeLessThanOrEqual(titleGeometry.clientHeight + 1);
      expect(titleGeometry.overflowY).toBe("hidden");
      const tabGeometry = await page.locator("#roadmapViews").evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(tabGeometry.scrollWidth, `${width}px keeps all three roadmap views visible`).toBeLessThanOrEqual(tabGeometry.clientWidth + 1);
    } else {
      await expect(mobileActions).toBeHidden();
    }
  }
});

test("Timeline is the focal view and Fit avoids label collisions before detailed zoom", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "timeline" }), width: 1440 });
  await activateView(page, "timeline");
  await expect(page.locator("#tlCard")).toBeVisible();
  await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "true");

  for (const width of [320, 390, 721, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.waitForTimeout(190);
    if (width > 720) await page.locator("#zoomFit").click();
    else await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "true");
    const geometry = await page.locator("#gantt svg").evaluate(svg => {
      const scroller = document.querySelector(".tl-scroll");
      const boxes = selector => [...svg.querySelectorAll(selector)].map(element => {
        const box = element.getBBox();
        return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
      });
      return {
        svgWidth: svg.getBoundingClientRect().width,
        viewportWidth: scroller.clientWidth,
        scrollLeft: scroller.scrollLeft,
        laneGutter: Number(svg.dataset.laneGutter),
        plotWidth: Number(svg.dataset.plotWidth),
        plotRight: Number(svg.dataset.plotRight),
        periodLabels: boxes('[data-role="timeline-period-label"]'),
        laneLabels: boxes('[data-role="timeline-lane-label"] text'),
        bars: boxes('rect[height="22"]'),
      };
    });
    expect(geometry.svgWidth, `${width}px Fit is contained`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.plotWidth, `${width}px timeline publishes a positive plot width`).toBeGreaterThan(0);
    expect(geometry.plotRight, `${width}px timeline retains a positive plot`).toBeGreaterThan(geometry.laneGutter);
    expect(geometry.scrollLeft).toBe(0);
    if (width <= 390) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px timeline does not overflow the document`).toBeLessThanOrEqual(width + 1);
    }
    for (let index = 1; index < geometry.periodLabels.length; index += 1) {
      expect(rectsOverlap(geometry.periodLabels[index - 1], geometry.periodLabels[index], 1), `${width}px period labels do not overlap`).toBe(false);
    }
    for (const label of geometry.laneLabels) {
      expect(label.right, `${width}px lane labels stay in their gutter`).toBeLessThanOrEqual(geometry.laneGutter + 1);
      for (const bar of geometry.bars) expect(rectsOverlap(label, bar, 2), `${width}px lane labels do not cover bars`).toBe(false);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator("#zoomIn").click();
  await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "false");
  const detail = await page.locator("#gantt svg").evaluate(svg => ({
    timeline: svg.getBoundingClientRect().width,
    viewport: document.querySelector(".tl-scroll").clientWidth,
  }));
  expect(detail.timeline).toBeGreaterThan(detail.viewport);
});

test("print presentation includes the roadmap header, executive band, and timeline from every view", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "executive" }), width: 1440 });

  for (const view of ["executive", "timeline", "details", "portfolio"]) {
    await activateView(page, view);
    await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
    await expect(page.locator("#roadmapHeader")).toBeVisible();
    await expect(page.locator("#executiveBand")).toBeVisible();
    await expect(page.locator("#tlCard")).toBeVisible();
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", view);
    await expect(selectedView(page, view)).toBeVisible();
  }
});

test("view, lane, mobile, and zoom controls expose keyboard and ARIA behavior", async ({ page }) => {
  await openRoadmap(page, { store: ownerStore({ roadmapView: "details" }), width: 390 });

  const viewNavigation = page.locator('[aria-label="Roadmap views"]');
  await expect(viewNavigation).toBeVisible();
  const timelineButton = page.locator('[data-view="timeline"]');
  await timelineButton.focus();
  await page.keyboard.press("Enter");
  await expect(timelineButton).toHaveAttribute("aria-selected", "true");
  await expect(selectedView(page, "timeline")).toBeVisible();
  await expect(page.locator('[role="group"][aria-label="Timeline scale"]')).toBeVisible();
  await expect(page.locator("#timelineDetails")).toBeVisible();

  const mobile = page.locator("#mobileActions");
  await mobile.focus();
  await page.keyboard.press("Enter");
  await expect(mobile).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(mobile).toHaveAttribute("aria-expanded", "false");
  await expect(mobile).toBeFocused();

  await page.setViewportSize({ width: 721, height: 1050 });
  await expect(page.locator('[role="group"][aria-label="Timeline scale"]')).toBeVisible();
  await page.locator("#zoomIn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#zoomFit")).toHaveAttribute("aria-pressed", "false");
});

test("viewer and public access remain read-only and cannot enter Details", async ({ page }) => {
  await openRoadmap(page, {
    store: ownerStore({ roadmaps: {}, trash: {}, sync: {}, activeId: null }),
    role: "viewer",
    docs: [ACTIVE, SECOND],
  });
  await expect(page.locator("body")).toHaveClass(/access-viewer/);
  await expect(page.locator('[data-view="details"]')).toBeHidden();
  await expect(selectedView(page, "details")).toBeHidden();
  await expect(page.locator('[data-action="share"]')).toBeDisabled();
  await expect(page.locator("#titleIn")).toHaveAttribute("readonly", "");
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "timeline");
  await page.locator("#rmPicker").selectOption(SECOND.id);
  await expect(page.locator("#titleIn")).toHaveValue(SECOND.title);
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "timeline");
  await expect(page.locator('[data-view="details"]')).toBeHidden();

  const publicPage = await page.context().newPage();
  await openRoadmap(publicPage, {
    publicMode: true,
    docs: [Object.assign({}, ACTIVE, { public: true })],
    query: `?r=${ACTIVE.id}`,
    width: 390,
  });
  await expect(publicPage.locator("body")).toHaveClass(/publicview/);
  await expect(publicPage.locator("#editorCard")).toBeHidden();
  await expect(publicPage.locator("#toolbar")).toBeHidden();
  await expect(publicPage.locator("#titleIn")).toHaveAttribute("readonly", "");
  await expect(publicPage.locator('[data-roadmap-view="details"]')).toBeHidden();
  await expect(publicPage.locator('[data-view="executive"]')).toBeVisible();
  await expect(publicPage.locator('[data-view="timeline"]')).toBeVisible();
  await activateView(publicPage, "executive");
  await expect(publicPage.locator("#titleIn")).toHaveAttribute("readonly", "");
});

for (const routeCase of [
  { label: "shared", query: "?s=11111111-1111-4111-8111-111111111111" },
  { label: "administrator", query: `?admin=${ACTIVE.id}` },
]) {
  test(`${routeCase.label} read-only route retains Executive and Timeline without Details`, async ({ page }) => {
    await openRoadmap(page, { docs: [ACTIVE], query: routeCase.query, width: 1121 });
    await expect(page.locator("body")).toHaveClass(/readonly/);
    await expect(page.locator('[data-view="executive"]')).toBeVisible();
    await expect(page.locator('[data-view="timeline"]')).toBeVisible();
    await expect(page.locator('[data-view="details"]')).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "timeline");
    await activateView(page, "executive");
    await expect(page.locator("#titleIn")).toHaveAttribute("readonly", "");
  });
}
