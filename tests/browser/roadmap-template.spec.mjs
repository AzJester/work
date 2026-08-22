import { test, expect } from "@playwright/test";

async function openRoadmap(page) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    const session = {
      access_token: "roadmap-template-test-token",
      user: { id: "roadmap-template-test-user", email: "template@example.com", app_metadata: {}, user_metadata: {} },
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
  });
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "/* Supabase is mocked by the roadmap template browser test. */",
  }));
  await page.route("**/sw.js", route => route.abort());
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  return pageErrors;
}

test("Import menu downloads a native, clearly marked roadmap JSON template", async ({ page }) => {
  const pageErrors = await openRoadmap(page);
  const importMenu = page.getByRole("button", { name: "Import ▾", exact: true }).locator("xpath=..");
  await importMenu.getByRole("button", { name: "Import ▾", exact: true }).click();

  const menuItems = importMenu.getByRole("menuitem");
  await expect(menuItems).toHaveText(["Roadmap JSON…", "Download JSON template", "Jira CSV…"]);
  const templateItem = importMenu.getByRole("menuitem", { name: "Download JSON template", exact: true });
  await expect(templateItem).toBeVisible();
  await expect(templateItem).toHaveAttribute("type", "button");
  await importMenu.getByRole("menuitem", { name: "Roadmap JSON…", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(templateItem).toBeFocused();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    templateItem.click(),
  ]);
  expect(download.suggestedFilename()).toBe("roadmap-builder-template.roadmap.json");

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const template = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  expect(template.schema).toBe("roadmap.v1");
  expect(template.title).toMatch(/^\[REPLACE\]/);
  expect(template.subtitle).toContain("placeholder content only");
  expect(template.public).toBe(false);
  expect(template.archived).toBe(false);
  expect(template.templateType).toBe("custom");
  expect(template.lanes).toHaveLength(2);
  expect(template.lanes.every(lane => lane.name.startsWith("[REPLACE]"))).toBe(true);
  expect(template.lanes.flatMap(lane => lane.items)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "bar", status: "planned" }),
    expect.objectContaining({ kind: "milestone", status: "planned", gate: true }),
  ]));
  for (const item of template.lanes.flatMap(lane => lane.items)) {
    if (item.kind === "bar") {
      expect(item.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } else {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  }
  await expect(page.locator("#topNote")).toContainText("Roadmap JSON template downloaded");
  expect(pageErrors).toEqual([]);
});

test("the downloaded template imports without a non-roadmap warning", async ({ page }) => {
  const pageErrors = await openRoadmap(page);
  await page.getByRole("button", { name: "Import ▾", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download JSON template", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);

  const dialogs = [];
  page.on("dialog", async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.locator("#fileIn").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: bytes,
  });

  await expect(page.locator("#titleIn")).toHaveValue("[REPLACE] Roadmap title");
  await expect(page.locator("#topNote")).toContainText("Imported “[REPLACE] Roadmap title”");
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
});
