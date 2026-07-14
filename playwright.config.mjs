import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const localBaseUrl = `http://127.0.0.1:${port}/geopresence/`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseUrl;
const serverCommand = process.platform === "win32"
  ? `python -m http.server ${port} --bind 127.0.0.1`
  : `python3 -m http.server ${port} --bind 127.0.0.1`;

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results/browser",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: serverCommand,
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "ignore",
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
