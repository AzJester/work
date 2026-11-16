import { test as base, expect } from "@playwright/test";

// Topo Map Builder draws with WebGL. Headless Chromium has no GPU, so these tests ask for the
// software renderer explicitly, on top of whatever launch options the configuration already sets.
export const test = base.extend({
  launchOptions: [async ({ launchOptions }, use) => {
    await use({
      ...launchOptions,
      args: [...(launchOptions.args ?? []), "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    });
  }, { scope: "worker", option: true }],
});

export { expect };

/** Whether this browser can create the WebGL 2 context the map needs. */
export function hasWebGl2(page) {
  return page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
}
