import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const ROUTES = [
  "dashboard",
  "discover",
  "shape",
  "assess",
  "architect",
  "prove",
  "propose",
  "transition",
  "decision-package",
];

test.use({ serviceWorkers: "block" });

async function gotoFresh(page, route = "dashboard") {
  const response = await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  if (response) expect(response.status()).toBe(200);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

async function gotoRoute(page, route) {
  await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

async function readabilityAudit(page) {
  return page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && styles.display !== "none" && styles.visibility !== "hidden";
    };
    const controls = [...document.querySelectorAll(".content input, .content textarea, .content select")]
      .filter(visible)
      .filter(element => !["checkbox", "radio", "hidden"].includes(element.type));
    const labelNodes = [...document.querySelectorAll(".content label")]
      .filter(visible)
      .map(label => [...label.children].find(child => child.tagName === "SPAN") || label);

    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      editableTableOverflows: [...document.querySelectorAll(".table-scroll")]
        .filter(visible)
        .filter(wrapper => wrapper.querySelector(".editable-table"))
        .map(wrapper => wrapper.scrollWidth - wrapper.clientWidth)
        .filter(overflow => overflow > 1),
      undersizedControls: controls.map(element => {
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.closest("label")?.textContent.trim().slice(0, 80) || element.tagName,
          fontSize: Number.parseFloat(styles.fontSize),
          height: rect.height,
          minimumHeight: element.tagName === "TEXTAREA" ? 112 : 47,
        };
      }).filter(item => item.fontSize < 16 || item.height < item.minimumHeight),
      internallyScrollingTextareas: controls
        .filter(element => element.tagName === "TEXTAREA" && element.scrollHeight > element.clientHeight + 2)
        .map(element => element.getAttribute("aria-label") || element.closest("label")?.textContent.trim().slice(0, 80) || "textarea"),
      undersizedLabels: labelNodes.map(element => ({
        text: element.textContent.trim().slice(0, 80),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      })).filter(item => item.fontSize < 14),
    };
  });
}

test("every workbench page keeps readable controls and contained layouts", async ({ page }) => {
  await gotoFresh(page);

  for (const viewport of [
    { width: 1440, height: 1000, name: "desktop" },
    { width: 1024, height: 900, name: "tablet" },
    { width: 390, height: 844, name: "phone" },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ROUTES) {
      await test.step(`${viewport.name}: ${route}`, async () => {
        await gotoRoute(page, route);
        const audit = await readabilityAudit(page);
        expect.soft(audit.pageOverflow, `${route} should not overflow the ${viewport.name} viewport`).toBeLessThanOrEqual(1);
        expect.soft(audit.editableTableOverflows, `${route} editable records should not require horizontal scrolling`).toEqual([]);
        expect.soft(audit.undersizedControls, `${route} controls should meet the readable size floor`).toEqual([]);
        expect.soft(audit.internallyScrollingTextareas, `${route} seeded text should remain readable without manual resizing`).toEqual([]);
        expect.soft(audit.undersizedLabels, `${route} field labels should remain legible`).toEqual([]);
      });
    }
  }
});

test("governance records use labeled cards and long text grows in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFresh(page, "prove");

  const firstRow = page.locator(".governance-section .editable-table tbody tr").first();
  await expect(firstRow).toBeVisible();
  expect(await firstRow.evaluate(row => getComputedStyle(row).display)).toBe("grid");
  expect((await firstRow.evaluate(row => getComputedStyle(row).gridTemplateColumns)).split(" ")).toHaveLength(2);

  const labels = await firstRow.locator("td").evaluateAll(cells => cells.map(cell => ({
    dataLabel: cell.dataset.label,
    renderedLabel: getComputedStyle(cell, "::before").content,
    fontSize: Number.parseFloat(getComputedStyle(cell, "::before").fontSize),
  })));
  expect(labels.length).toBeGreaterThan(1);
  for (const label of labels) {
    expect.soft(label.dataLabel).toBeTruthy();
    expect.soft(label.renderedLabel).not.toBe("none");
    expect.soft(label.fontSize).toBeGreaterThanOrEqual(14);
  }

  const longText = firstRow.locator("textarea").first();
  await longText.fill([
    "Describe the mission evidence supporting this trade.",
    "Record the operational impact and affected interface.",
    "State the assumption being tested.",
    "Identify the verification approach.",
    "Capture the decision consequence.",
  ].join("\n"));
  const lightMetrics = await longText.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
  }));
  expect(lightMetrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(lightMetrics.scrollHeight).toBeLessThanOrEqual(lightMetrics.clientHeight + 2);

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkColors = await longText.evaluate(element => {
    const styles = getComputedStyle(element);
    return { color: styles.color, backgroundColor: styles.backgroundColor };
  });
  expect(darkColors.color).not.toBe(darkColors.backgroundColor);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRoute(page, "transition");
  const phoneRow = page.locator(".governance-section .editable-table tbody tr").first();
  await expect(phoneRow).toBeVisible();
  expect((await phoneRow.evaluate(row => getComputedStyle(row).gridTemplateColumns)).split(" ")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
