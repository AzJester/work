import { test, expect } from "@playwright/test";

const APP_PATH = "../black-hat-agent/";
const NAVIGATION_LABELS = [
  "Pursuit Portfolio",
  "Command Center",
  "Opportunity",
  "Evaluation Criteria",
  "Evidence Room",
  "Competitors",
  "Data Import",
  "Playbook Library",
  "Black Hat Session",
  "Run History",
  "Output Center",
  "Action Register",
  "Recovery",
  "User Guide",
];

test("Black Hat Agent navigation is grouped, text-only, and fully labeled", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(APP_PATH, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  const sidebar = page.locator(".sidebar");
  const navigation = sidebar.getByRole("navigation", { name: "Workspace navigation" });
  await expect(sidebar.locator(".brand .mark")).toHaveCount(0);
  await expect(navigation.locator("b")).toHaveCount(0);

  for (const group of ["Workspace", "Analysis", "Workflow", "Results", "Help"]) {
    await expect(navigation.locator(".nav-label").getByText(group, { exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole("link")).toHaveCount(NAVIGATION_LABELS.length);
  for (const label of NAVIGATION_LABELS) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  const current = navigation.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText("Pursuit Portfolio");
  await navigation.getByRole("link", { name: "Evidence Room", exact: true }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Evidence Room");
  await expect(page).toHaveURL(/#evidence$/);
  expect(pageErrors).toEqual([]);
});

test("the in-app User Guide explains the workflow and links into the workspace", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(APP_PATH, { waitUntil: "domcontentloaded" });

  const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
  await navigation.getByRole("link", { name: "User Guide", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How to use Black Hat Agent" })).toBeVisible();
  await expect(page.locator(".guide-steps > li")).toHaveCount(8);
  await expect(page.getByText("Build an evidence-ready workspace", { exact: true })).toBeVisible();
  await expect(page.getByText("Protect the work stored in this browser", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open Evaluation Criteria", exact: true }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Evaluation Criteria");
  await expect(page.getByRole("heading", { name: "Customer priorities and scoring" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
