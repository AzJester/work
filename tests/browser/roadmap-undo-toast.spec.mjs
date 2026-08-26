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

async function openRoadmap(page) {
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
    store: {
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
    },
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

test("the Trash undo toast dismisses itself and the roadmap stays restorable", async ({ page }) => {
  const pageErrors = await openRoadmap(page);
  page.on("dialog", dialog => dialog.accept());

  await page.getByRole("button", { name: "Move Beta Program to trash", exact: true }).click();
  const undoBar = page.locator("#undoBar");
  await expect(undoBar).toBeVisible();
  await expect(undoBar).toContainText("Roadmap moved to Trash. Undo?");

  // The toast lives in the top-right corner, not over the bottom of the page.
  const box = await undoBar.boundingBox();
  const viewport = page.viewportSize();
  expect(box.y).toBeLessThan(100);
  expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.6);

  // The toast holds while the user could still want it, then clears on its own.
  await page.clock.runFor(9_000);
  await expect(undoBar).toBeVisible();
  await page.clock.runFor(1_500);
  await expect(undoBar).toBeHidden();

  // Dismissal removes only the shortcut: the roadmap waits in Trash.
  await page.locator('[data-portfolio-filter="trash"]').click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
