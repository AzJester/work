import { test, expect } from "@playwright/test";

const CURRENT_BUILD = "<!doctype html><title>Black Hat Agent</title><h1>Current build</h1>";

async function stubCurrentBuild(page) {
  await page.route("**/Black_Hat_Agent/**", route => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: CURRENT_BUILD,
  }));
}

test("the retired Black Hat Agent address forwards to the current build and keeps the route", async ({ page, baseURL }) => {
  await stubCurrentBuild(page);
  await page.goto(new URL("../black-hat-agent/?from=bookmark#session", baseURL).href);
  await expect(page).toHaveURL(new URL("/Black_Hat_Agent/?from=bookmark#session", baseURL).href);
  await expect(page.getByRole("heading", { name: "Current build" })).toBeVisible();
});

test("the retired address still forwards when scripts are turned off", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await stubCurrentBuild(page);
  await page.goto(new URL("../black-hat-agent/", baseURL).href);
  await expect(page).toHaveURL(new URL("/Black_Hat_Agent/", baseURL).href);
  await context.close();
});
