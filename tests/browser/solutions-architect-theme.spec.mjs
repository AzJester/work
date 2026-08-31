import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const THEME_KEY = "solution_architect_theme_v1";

test.use({ serviceWorkers: "block" });

async function gotoFresh(page) {
  const response = await page.goto(`${APP_PATH}#dashboard`, { waitUntil: "domcontentloaded" });
  if (response) expect(response.status()).toBe(200);
  else await expect(page).toHaveURL(/solutions-architect\/#dashboard$/);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

async function expectResolvedTheme(page, preference, resolved, { toggleSelector = "#theme-toggle", themeColor = true } = {}) {
  const toggle = page.locator(toggleSelector);
  await expect(toggle).toHaveAttribute("role", "switch");
  await expect(toggle).toHaveAttribute("aria-label", "Dark mode");
  await expect(toggle).toHaveAttribute("aria-checked", resolved === "dark" ? "true" : "false");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", preference);
  await expect(page.locator("html")).toHaveAttribute("data-theme", resolved);
  if (themeColor) await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", resolved === "dark" ? "#0b1119" : "#eef3f6");
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

function parseRgb(color) {
  const match = color.match(/^rgba?\(([^)]+)\)$/);
  expect(match, `Expected an rgb/rgba color, received ${color}`).not.toBeNull();
  const channels = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  return { red: channels[0], green: channels[1], blue: channels[2], alpha: channels[3] ?? 1 };
}

function relativeLuminance({ red, green, blue }) {
  const linear = [red, green, blue].map(channel => {
    const normalized = channel / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

test("a fresh theme defaults to Light and the switch persists the explicit opposite", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFresh(page);

  const toggle = page.locator("#theme-toggle");
  await expectResolvedTheme(page, "light", "light");
  await expectCoreContrast(page);
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBeNull();
  await toggle.focus();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expectResolvedTheme(page, "dark", "dark");
  await expectCoreContrast(page);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe("dark");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectResolvedTheme(page, "dark", "dark");
});

test("stored System follows OS changes and Use device theme restores that behavior", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFresh(page);

  await page.evaluate(key => localStorage.setItem(key, "system"), THEME_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectResolvedTheme(page, "system", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expectResolvedTheme(page, "system", "light");

  await page.locator("#theme-toggle").click();
  await expectResolvedTheme(page, "dark", "dark");
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click();
  const useDeviceTheme = page.getByRole("dialog", { name: "Workspace tools" }).getByRole("button", { name: "Use device theme", exact: true });
  await expect(useDeviceTheme).toHaveAttribute("aria-pressed", "false");
  await useDeviceTheme.click();
  await expectResolvedTheme(page, "system", "light");
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe("system");
});

test("dark select options are opaque and retain readable contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFresh(page);
  await page.locator("#theme-toggle").click();
  await expectResolvedTheme(page, "dark", "dark");

  const optionStyles = await page.locator("select option").evaluateAll(options => options.map(option => {
    const styles = getComputedStyle(option);
    return { color: styles.color, backgroundColor: styles.backgroundColor };
  }));
  expect(optionStyles.length).toBeGreaterThan(0);
  for (const style of optionStyles) {
    const foreground = parseRgb(style.color);
    const background = parseRgb(style.backgroundColor);
    expect(foreground.alpha).toBe(1);
    expect(background.alpha).toBe(1);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
});

test("explicit Dark remains stable and the compact switch fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ colorScheme: "light" });
  await gotoFresh(page);

  const toggle = page.locator("#theme-toggle");
  await expectResolvedTheme(page, "light", "light");
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeLessThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeLessThanOrEqual(48);

  await toggle.click();
  await expectResolvedTheme(page, "dark", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expectResolvedTheme(page, "dark", "dark");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Capture and grouped Workspace tools remain reachable across responsive breakpoints", async ({ page }) => {
  for (const width of [1240, 980, 650, 360]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await gotoFresh(page);

      await expect(page.locator("#theme-toggle")).toBeVisible();
      const capture = page.getByRole("button", { name: /Capture$/ });
      const workspaceTools = page.getByRole("button", { name: "Workspace tools", exact: true });
      await expect(capture).toBeVisible();
      await expect(workspaceTools).toBeVisible();

      await capture.click();
      const captureDialog = page.getByRole("dialog", { name: "Quick capture" });
      await expect(captureDialog).toBeVisible();
      await captureDialog.getByRole("button", { name: "Cancel", exact: true }).click();

      await workspaceTools.click();
      const toolsDialog = page.getByRole("dialog", { name: "Workspace tools" });
      await expect(toolsDialog).toBeVisible();
      for (const action of ["Open local files", "AI assist", "Create a new solution", "Review capture inbox"]) {
        await expect(toolsDialog.getByRole("button", { name: new RegExp(`^${action}\\b`) })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: "Close dialog" }).click();
    });
  }
});

test("the rendered task guide is semantic, responsive, and shares the theme preference", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${APP_PATH}guide.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Solution Architect Workbench User Guide" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Ingest a meeting transcript or summary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open workbench" })).toHaveAttribute("href", "./");
  const toggle = page.locator("#guide-theme-toggle");
  const guideTheme = { toggleSelector: "#guide-theme-toggle" };
  await expectResolvedTheme(page, "light", "light", guideTheme);
  await toggle.click();
  await expectResolvedTheme(page, "dark", "dark", guideTheme);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe("dark");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectResolvedTheme(page, "dark", "dark", guideTheme);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
