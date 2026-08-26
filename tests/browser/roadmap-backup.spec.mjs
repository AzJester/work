import { test, expect } from "@playwright/test";

const USER_ID = "backup-test-user";
const USER_EMAIL = "backup@example.com";

function roadmap(id, title) {
  return {
    schema: "roadmap.v1",
    id,
    title,
    subtitle: "Backup coverage roadmap",
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

const ALPHA = roadmap("rm_backup_alpha", "Alpha Launch Plan");
const BETA = roadmap("rm_backup_beta", "Beta Program");

function seededStore() {
  return {
    version: 2,
    activeId: ALPHA.id,
    mode: "editor",
    roadmapView: "details",
    roadmaps: { [ALPHA.id]: ALPHA, [BETA.id]: BETA },
    trash: {},
    sync: {
      [ALPHA.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
      [BETA.id]: { accessRole: "owner", ownerEmail: USER_EMAIL },
    },
  };
}

async function openRoadmap(page) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(({ userId, userEmail, store }) => {
    localStorage.clear();
    localStorage.setItem(`roadmap_builder_v2:${userId}`, JSON.stringify(store));
    const session = {
      access_token: "roadmap-backup-test-token",
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
          };
        },
      },
    });
  }, { userId: USER_ID, userEmail: USER_EMAIL, store: seededStore() });
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "/* Supabase is mocked by the roadmap backup browser test. */",
  }));
  await page.route("**/sw.js", route => route.abort());
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  return pageErrors;
}

async function downloadJson(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { download, payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
}

test("Export menu backs up just the current roadmap and the file restores through Import", async ({ page }) => {
  const pageErrors = await openRoadmap(page);

  const exportMenu = page.getByRole("button", { name: "Export", exact: true }).locator("xpath=..");
  await exportMenu.getByRole("button", { name: "Export", exact: true }).click();
  const backupItem = exportMenu.getByRole("menuitem", { name: "Backup this roadmap", exact: true });
  await expect(backupItem).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: "Full portfolio backup", exact: true })).toBeVisible();

  const { download, payload } = await downloadJson(page, () => backupItem.click());
  expect(download.suggestedFilename()).toMatch(/^alpha-launch-plan-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(payload.schema).toBe("roadmap.portfolio.v2");
  expect(Object.keys(payload.store.roadmaps)).toEqual([ALPHA.id]);
  expect(payload.store.roadmaps[ALPHA.id].title).toBe("Alpha Launch Plan");
  expect(payload.store.activeId).toBe(ALPHA.id);
  expect(payload.store.trash).toEqual({});
  expect(Object.keys(payload.store.sync)).toEqual([ALPHA.id]);

  // Round trip: importing the backup of an unchanged roadmap is a clean no-op merge.
  const backupPath = test.info().outputPath("alpha-backup.json");
  await download.saveAs(backupPath);
  await page.locator("#fileIn").setInputFiles(backupPath);
  await expect(page.locator("#topNote")).toContainText("skipped 1 identical copy");

  expect(pageErrors).toEqual([]);
});

test("A Portfolio card backs up its own roadmap, not the active one", async ({ page }) => {
  const pageErrors = await openRoadmap(page);

  await page.locator('[data-view="portfolio"]').click();
  await expect(page.locator("#overviewView")).toBeVisible();
  const betaBackup = page.getByRole("button", { name: "Backup Beta Program", exact: true });
  await expect(betaBackup).toBeVisible();

  const { download, payload } = await downloadJson(page, () => betaBackup.click());
  expect(download.suggestedFilename()).toMatch(/^beta-program-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(Object.keys(payload.store.roadmaps)).toEqual([BETA.id]);
  expect(payload.store.roadmaps[BETA.id].title).toBe("Beta Program");

  expect(pageErrors).toEqual([]);
});
