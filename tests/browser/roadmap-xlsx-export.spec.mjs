import { test, expect } from "@playwright/test";

const USER_ID = "xlsx-test-user";
const USER_EMAIL = "xlsx@example.com";

const ROADMAP = {
  schema: "roadmap.v1",
  id: "rm_xlsx_alpha",
  title: "Alpha Launch Plan",
  subtitle: "Ship the first release",
  premise: "Prove the platform end to end.",
  notes: "Owner: platform team & partners",
  public: false,
  archived: false,
  templateType: "custom",
  range: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  callouts: [
    { id: "co1", title: "Decision criteria", body: "Ship only if error rate < 1% & sign-off given", list: false },
  ],
  lanes: [{
    id: "lane1",
    name: "Delivery",
    color: "#0073ea",
    contingency: false,
    sub: "Build & validate",
    items: [{
      id: "it1",
      kind: "bar",
      label: "Build the thing",
      start: "2026-08-15",
      end: "2026-08-31",
      status: "in_progress",
      note: "",
      gate: false,
    }, {
      id: "it2",
      kind: "milestone",
      label: "Gate 1 <Review> & sign-off",
      date: "2026-09-01",
      status: "planned",
      note: "Needs exec approval",
      gate: true,
    }],
  }],
};

function seededStore() {
  return {
    version: 2,
    activeId: ROADMAP.id,
    mode: "editor",
    roadmapView: "details",
    roadmaps: { [ROADMAP.id]: ROADMAP },
    trash: {},
    sync: { [ROADMAP.id]: { accessRole: "owner", ownerEmail: USER_EMAIL } },
  };
}

async function openRoadmap(page) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(({ userId, userEmail, store }) => {
    localStorage.clear();
    localStorage.setItem(`roadmap_builder_v2:${userId}`, JSON.stringify(store));
    const session = {
      access_token: "roadmap-xlsx-test-token",
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
    body: "/* Supabase is mocked by the roadmap xlsx browser test. */",
  }));
  await page.route("**/sw.js", route => route.abort());
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  return pageErrors;
}

// The export writes stored (uncompressed) entries, so a minimal local-header
// walk recovers every part as text.
function unzipStored(buf) {
  const entries = {};
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
    const start = off + 30 + nameLen + extraLen;
    entries[name] = { method, xml: buf.subarray(start, start + size).toString("utf8") };
    off = start + size;
  }
  return entries;
}

test("Export menu downloads a valid Excel workbook capturing every roadmap detail", async ({ page }) => {
  const pageErrors = await openRoadmap(page);

  const exportMenu = page.getByRole("button", { name: "Export", exact: true }).locator("xpath=..");
  await exportMenu.getByRole("button", { name: "Export", exact: true }).click();
  const xlsxItem = exportMenu.getByRole("menuitem", { name: "Excel workbook", exact: true });
  await expect(xlsxItem).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), xlsxItem.click()]);
  expect(download.suggestedFilename()).toBe("alpha-launch-plan-roadmap.xlsx");
  const savedPath = test.info().outputPath("roadmap.xlsx");
  await download.saveAs(savedPath);

  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(savedPath);
  expect(buf.readUInt32LE(0)).toBe(0x04034b50); // ZIP magic
  const parts = unzipStored(buf);

  const expected = [
    "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
    "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
    "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml",
  ];
  for (const name of expected) expect(parts[name], `${name} present`).toBeTruthy();
  for (const name of expected) expect(parts[name].method, `${name} stored`).toBe(0);

  const workbook = parts["xl/workbook.xml"].xml;
  for (const sheet of ["Roadmap", "Lanes", "Items", "Callouts"]) expect(workbook).toContain(`name="${sheet}"`);

  const overview = parts["xl/worksheets/sheet1.xml"].xml;
  expect(overview).toContain("Alpha Launch Plan");
  expect(overview).toContain("Ship the first release");
  expect(overview).toContain("Prove the platform end to end.");
  expect(overview).toContain("Owner: platform team &amp; partners");
  expect(overview).toContain("Percent complete");

  const lanes = parts["xl/worksheets/sheet2.xml"].xml;
  expect(lanes).toContain("Delivery");
  expect(lanes).toContain("Build &amp; validate");
  expect(lanes).toContain("#0073ea");

  const items = parts["xl/worksheets/sheet3.xml"].xml;
  expect(items).toContain("Build the thing");
  expect(items).toContain("2026-08-15");
  expect(items).toContain("2026-08-31");
  expect(items).toContain("<v>17</v>"); // inclusive duration in days
  expect(items).toContain("In progress");
  expect(items).toContain("Gate 1 &lt;Review&gt; &amp; sign-off"); // XML-escaped, not raw
  expect(items).not.toContain("<Review>");
  expect(items).toContain("2026-09-01");
  expect(items).toContain("Milestone");
  expect(items).toContain("Needs exec approval");

  const callouts = parts["xl/worksheets/sheet4.xml"].xml;
  expect(callouts).toContain("Decision criteria");
  expect(callouts).toContain("Ship only if error rate &lt; 1% &amp; sign-off given");

  expect(pageErrors).toEqual([]);
});
