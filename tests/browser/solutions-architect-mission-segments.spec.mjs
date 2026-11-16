import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const STORAGE_KEY = "solution_architect_workspace_v1";

test.use({ serviceWorkers: "block" });

test("company mission segments can span a solution and persist into its decision package", async ({ page }) => {
  await page.goto(`${APP_PATH}#discover`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  const segment = "Integrated Air and Missile Defense";
  const checkbox = page.locator(`[data-mission-segment][value="${segment}"]`);
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(page.locator("#save-state")).toHaveText("Saved locally");

  const stored = await page.evaluate(key => {
    const value = JSON.parse(localStorage.getItem(key));
    return value.solutions.find(solution => solution.id === value.activeSolutionId).missionSegments;
  }, STORAGE_KEY);
  expect(stored).toContain(segment);
  expect(stored).toContain("Layered Defense, Autonomous Warfare & Integrated Fires");

  await page.evaluate(() => { location.hash = "decision-package"; });
  await expect(page.locator(".package-preview")).toContainText("Company mission segments");
  await expect(page.locator(".package-preview")).toContainText(segment);
});
