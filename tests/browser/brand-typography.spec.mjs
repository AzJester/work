import { test, expect } from "@playwright/test";
import { downloadBytes, gotoFresh, pngDimensions, revealControl } from "./helpers.mjs";

const FONT_ROUTE = "**/assets/fonts/Archivo-latin-wght-normal.woff2";

// Compares the heading strip of an exported PNG with the same words drawn on a canvas
// in a given typeface. A low score means the PNG was drawn in that face.
async function headingDifference(page, pngBytes) {
  return page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const heading = document.querySelector("#mapSvg text");
    const text = heading.textContent;
    const size = Number(heading.getAttribute("font-size"));
    const ink = heading.getAttribute("fill");
    const ground = document.querySelector("#mapSvg rect").getAttribute("fill");
    const strip = draw => {
      const canvas = document.createElement("canvas");
      canvas.width = 700;
      canvas.height = 70;
      const context = canvas.getContext("2d");
      draw(context);
      return context.getImageData(0, 0, 700, 70).data;
    };
    // The heading baseline sits at x 80, y 82 on the canvas; the strip starts at x 60, y 35.
    const exported = strip(context => context.drawImage(image, 60, 35, 700, 70, 0, 0, 700, 70));
    const drawnIn = family => strip(context => {
      context.fillStyle = ground;
      context.fillRect(0, 0, 700, 70);
      context.fillStyle = ink;
      context.font = `700 ${size}px ${family}`;
      context.fillText(text, 20, 47);
    });
    const difference = other => {
      let sum = 0;
      for (let index = 0; index < exported.length; index += 4) sum += Math.abs(exported[index] - other[index]);
      return sum / (exported.length / 4);
    };
    return { archivo: difference(drawnIn("Archivo")), fallback: difference(drawnIn("sans-serif")) };
  }, pngBytes.toString("base64"));
}

test("the editor is set in the Brand Kit faces and shows the Astrion wordmark", async ({ page }) => {
  await gotoFresh(page);
  await page.evaluate(() => document.fonts.ready);

  const type = await page.evaluate(() => {
    const family = selector => getComputedStyle(document.querySelector(selector)).fontFamily;
    const wordmark = document.querySelector(".brand .wordmark");
    const box = wordmark.getBoundingClientRect();
    return {
      archivoLoaded: document.fonts.check('700 16px "Archivo"'),
      monoLoaded: document.fonts.check('500 12px "JetBrains Mono"'),
      body: family("body"),
      heading: family(".intro h1"),
      button: family("#exportPng"),
      field: family("#mapTitle"),
      versionLine: family(".brand small"),
      sectionLabel: family(".section-label"),
      status: family("#mapStatus"),
      footer: family("footer"),
      mapFonts: [...new Set([...document.querySelectorAll("#mapSvg text")].map(element => element.getAttribute("font-family")))],
      wordmark: { alt: wordmark.alt, drawn: wordmark.complete && wordmark.naturalWidth > 0, width: Math.round(box.width), height: Math.round(box.height) },
      requests: performance.getEntriesByType("resource").map(entry => new URL(entry.name).origin),
    };
  });

  expect(type.archivoLoaded, "Archivo is loaded from the page's own files").toBeTruthy();
  expect(type.monoLoaded, "JetBrains Mono is loaded from the page's own files").toBeTruthy();
  for (const role of ["body", "heading", "button", "field"]) expect(type[role], `${role} copy is Archivo`).toMatch(/^"?Archivo"?,/);
  for (const role of ["versionLine", "sectionLabel", "status", "footer"]) expect(type[role], `${role} is a utility label in JetBrains Mono`).toMatch(/^"?JetBrains Mono"?,/);
  expect(type.mapFonts, "all map text takes the brand face").toEqual(["Archivo,Arial,sans-serif"]);
  expect(type.wordmark).toEqual({ alt: "Astrion", drawn: true, width: 137, height: 20 });
  expect(new Set(type.requests), "fonts and artwork come from the same origin").toEqual(new Set([new URL(page.url()).origin]));
});

test("a PNG export is drawn in Archivo, not in whatever the computer has", async ({ page }) => {
  await gotoFresh(page);
  await page.evaluate(() => document.fonts.load('700 48px "Archivo"'));
  await (await revealControl(page, "#scale")).selectOption("1");

  // The first export of a session is the one most likely to miss a late font, so check it and a repeat.
  for (const attempt of ["first", "second"]) {
    const { bytes } = await downloadBytes(page, page.locator("#exportPng"));
    expect(pngDimensions(bytes)).toEqual({ width: 1600, height: 900 });
    await expect(page.locator("#mapStatus")).toHaveAttribute("data-last-png-font", "embedded");
    const difference = await headingDifference(page, bytes);
    expect(difference.archivo, `${attempt} export: heading matches Archivo`).toBeLessThan(2);
    expect(difference.fallback, `${attempt} export: heading is clearly not the fallback face`).toBeGreaterThan(difference.archivo * 4);
  }

  // The downloadable SVG stays plain: it names the face and embeds nothing.
  const { bytes: svgBytes } = await downloadBytes(page, page.locator("#exportSvg"));
  const svg = svgBytes.toString("utf8");
  expect(svg).toContain('font-family="Archivo,Arial,sans-serif"');
  expect(svg).not.toMatch(/@font-face|base64|<style/i);
});

test("export still works when the brand font cannot be read", async ({ page, context }) => {
  await context.route(FONT_ROUTE, route => route.abort());
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page);
  expect(await page.evaluate(() => document.fonts.check('700 16px "Archivo"')), "the font really is unavailable in this run").toBeFalsy();

  await (await revealControl(page, "#scale")).selectOption("1");
  const { bytes } = await downloadBytes(page, page.locator("#exportPng"));
  expect(pngDimensions(bytes)).toEqual({ width: 1600, height: 900 });
  await expect(page.locator("#mapStatus")).toHaveAttribute("data-last-png-font", "fallback");
  await expect(page.locator("#toastMessage")).toHaveText(/PNG downloaded/);
  expect(pageErrors).toEqual([]);
});
