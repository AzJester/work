import { test, expect } from "@playwright/test";

const USER_ID = "undo-toast-test-user";
const USER_EMAIL = "undo@example.com";

function roadmap(id, title) {
  return {
    schema: "roadmap.v1",
    id,
    title,
    subtitle: "",
    premise: "",
    notes: "",
    public: false,
    archived: false,
    templateType: "custom",
    range: null,
    createdAt: "2026-08-15T12:00:00.000Z",
    updatedAt: "2026-08-21T12:00:00.000Z",
    callouts: [],
    lanes: [{
      id: `${id}-lane`,
      name: "Delivery",
      color: "#0073ea",
      sub: "",
      items: [{
        id: `${id}-item`,
        kind: "bar",
        label: "Build the thing",
        start: "2026-08-15",
        end: "2026-08-31",
        status: "in_progress",
        note: "",
      }],
    }],
  };
}

const ALPHA = roadmap("rm_undo_alpha", "Alpha Launch Plan");
const BETA = roadmap("rm_undo_beta", "Beta Program");

function baseStore() {
  return {
    version: 2,
    activeId: ALPHA.id,
    mode: "overview",
    roadmapView: "details",
    roadmaps: { [ALPHA.id]: ALPHA, [BETA.id]: BETA },
    trash: {},
    sync: {
      [ALPHA.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
      [BETA.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
    },
  };
}

async function openRoadmap(page, storePatch = {}) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.clock.install();
  await page.addInitScript(({ userId, userEmail, store }) => {
    localStorage.clear();
    localStorage.setItem(`roadmap_builder_v2:${userId}`, JSON.stringify(store));
    const session = {
      access_token: "roadmap-undo-test-token",
      user: { id: userId, email: userEmail, app_metadata: {}, user_metadata: {} },
    };
    Object.defineProperty(window, "supabase", {
      configurable: false,
      value: {
        createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            },
            rpc: async () => ({ data: [], error: null }),
            functions: { invoke: async () => ({ data: {}, error: null }) },
          };
        },
      },
    });
  }, {
    userId: USER_ID,
    userEmail: USER_EMAIL,
    store: { ...baseStore(), ...storePatch },
  });
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "/* Supabase is mocked by the roadmap undo toast browser test. */",
  }));
  await page.route("**/sw.js", route => route.abort());
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  return pageErrors;
}

test("the Trash undo strip docks to the bottom edge, states the action once, and dismisses itself", async ({ page }) => {
  const pageErrors = await openRoadmap(page);
  page.on("dialog", dialog => dialog.accept());

  await page.getByRole("button", { name: "Move Beta Program to trash", exact: true }).click();
  const undoBar = page.locator("#undoBar");
  await expect(undoBar).toBeVisible();

  // One plain statement of what happened; the button carries the verb. No
  // "undo? Undo?" doubling anywhere in the strip.
  await expect(page.locator("#undoText")).toHaveText("Roadmap moved to Trash");
  expect(await undoBar.innerText()).not.toMatch(/\?/);
  await expect(undoBar.getByRole("button", { name: "Undo", exact: true })).toBeVisible();

  // Docked to the bottom edge, spanning the width — nowhere near the header,
  // view tabs, or toolbar it used to cover.
  const box = await undoBar.boundingBox();
  const viewport = page.viewportSize();
  expect(box.y).toBeGreaterThan(viewport.height * 0.7);
  expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);

  // The page always ends with more blank padding than the strip is tall, so
  // the strip can never sit over content at any scroll position.
  const wrapPaddingBottom = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.querySelector(".wrap")).paddingBottom));
  expect(wrapPaddingBottom).toBeGreaterThanOrEqual(box.height);

  // The strip holds while the user could still want it, then clears on its own.
  await page.clock.runFor(9_000);
  await expect(undoBar).toBeVisible();
  await page.clock.runFor(1_500);
  await expect(undoBar).toBeHidden();

  // Dismissal removes only the shortcut: the roadmap waits in Trash.
  await page.locator('[data-portfolio-filter="trash"]').click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("the dismiss button hides the strip at once and Undo restores the roadmap", async ({ page }) => {
  const pageErrors = await openRoadmap(page);
  page.on("dialog", dialog => dialog.accept());
  const undoBar = page.locator("#undoBar");

  await page.getByRole("button", { name: "Move Beta Program to trash", exact: true }).click();
  await expect(undoBar).toBeVisible();
  await undoBar.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(undoBar).toBeHidden();

  // Dismissing kept the roadmap in Trash; restore it, then undo the restore.
  await page.locator('[data-portfolio-filter="trash"]').click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator("#undoText")).toHaveText("Roadmap restored");
  await undoBar.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(undoBar).toBeHidden();
  // Undoing the restore put the roadmap back in Trash.
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("a reload right after a change re-offers the undo, cleaned of the legacy label suffix", async ({ page }) => {
  const snapshot = { ...baseStore() };
  const pageErrors = await openRoadmap(page, {
    undo: {
      // A label persisted by older builds — must render without "undo?".
      label: "Roadmap moved to Trash — undo?",
      at: new Date().toISOString(),
      snapshot,
    },
  });
  const undoBar = page.locator("#undoBar");
  await expect(undoBar).toBeVisible();
  await expect(page.locator("#undoText")).toHaveText("Roadmap moved to Trash");
  expect(await undoBar.innerText()).not.toMatch(/\?/);
  expect(pageErrors).toEqual([]);
});

test("a stale undo snapshot no longer greets every page load with a toast", async ({ page }) => {
  const snapshot = { ...baseStore() };
  const pageErrors = await openRoadmap(page, {
    undo: {
      label: "Roadmap moved to Trash",
      at: "2026-01-01T00:00:00.000Z",
      snapshot,
    },
  });
  await expect(page.locator("#undoBar")).toBeHidden();
  expect(pageErrors).toEqual([]);
});
