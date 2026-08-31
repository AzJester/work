import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const THEME_KEY = "solution_architect_theme_v1";

test.use({ serviceWorkers: "block" });

async function gotoFresh(page) {
  const response = await page.goto(`${APP_PATH}#dashboard`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

async function expectResolvedTheme(page, preference, resolved) {
  await expect(page.getByLabel("Color theme")).toHaveValue(preference);
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", preference);
  await expect(page.locator("html")).toHaveAttribute("data-theme", resolved);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", resolved === "dark" ? "#0b1119" : "#eef3f6");
}

async function expectCoreContrast(page) {
  const ratios = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const value = name => styles.getPropertyValue(name).trim();
    const luminance = hex => {
      const channels = hex.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16) / 255);
      const linear = channels.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const contrast = (foreground, background) => {
      const first = luminance(value(foreground));
      const second = luminance(value(background));
      return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
    };
    return [
      contrast("--ink", "--ground"),
      contrast("--muted", "--panel"),
      contrast("--quiet", "--panel"),
      contrast("--cyan", "--panel"),
      contrast("--accent-ink", "--cyan")
    ];
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
}

test("theme control persists an override and System responds to OS changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFresh(page);

  const control = page.getByLabel("Color theme");
  await expectResolvedTheme(page, "system", "dark");
  await expectCoreContrast(page);
  await control.focus();
  await expect(control).toBeFocused();

  await control.selectOption("light");
  await expectResolvedTheme(page, "light", "light");
  await expectCoreContrast(page);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe("light");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectResolvedTheme(page, "light", "light");

  await page.getByLabel("Color theme").selectOption("system");
  await expectResolvedTheme(page, "system", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expectResolvedTheme(page, "system", "light");
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe("system");
});

test("explicit Dark remains stable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ colorScheme: "light" });
  await gotoFresh(page);

  await page.getByLabel("Color theme").selectOption("dark");
  await expectResolvedTheme(page, "dark", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expectResolvedTheme(page, "dark", "dark");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByLabel("Color theme")).toBeVisible();
});

test("the rendered task guide is semantic, responsive, and shares the theme preference", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${APP_PATH}guide.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Solution Architect Workbench User Guide" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Ingest a meeting transcript or summary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open workbench" })).toHaveAttribute("href", "./");
  await page.getByLabel("Guide theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe("dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
