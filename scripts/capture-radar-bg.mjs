/* Captures the LDAWIF hero radar as standalone background PNGs
   (e.g. for SharePoint site backgrounds). Renders the page with all
   copy/nav/sections hidden so only the ambient background + scope remain,
   lets the engagement develop, then grabs frames two seconds apart.

   Usage: node scripts/capture-radar-bg.mjs [outDir]
   Set CHROMIUM_PATH to use a pre-installed browser instead of the
   Playwright-managed one. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = process.argv[2] || root;
const PAGE = 'file://' + path.join(root, 'astrion-division/ldawif/index.html');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  deviceScaleFactor: 1.5, // the radar canvas caps DPR at 1.5 -> 3840x2160 output
});
const page = await context.newPage();
await page.goto(PAGE, { waitUntil: 'load' });

// Keep only the page background + radar scope; stretch the hero to fill the viewport.
await page.addStyleTag({ content: `
  header.nav, .skip, .hero-in, .scope-hint, footer,
  main > section:not(.hero) { display: none !important; }
  html, body { height: 100%; overflow: hidden !important; }
  .hero { height: 100vh; min-height: 100vh; border-bottom: none !important; }
` });
await page.waitForTimeout(500); // let the scope's ResizeObserver settle

// Contacts spawn at 0.90R and engage at 0.52R (~10s inbound), so wait for the
// fight to develop; the sweep period is 5.2s, so 2s spacing varies the bearing.
await page.waitForTimeout(9000);
for (let i = 0; i < 6; i++) {
  await page.screenshot({ path: path.join(OUT, `radar-frame-${i}.png`) });
  await page.waitForTimeout(2000);
}

await browser.close();
