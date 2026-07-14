import { test, expect } from "@playwright/test";
import { downloadBytes, ensureSampleLocations, gotoFresh, pngCornerAlpha, pngDimensions, revealControl } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await gotoFresh(page);
  await (await revealControl(page, "#scale")).selectOption("1");
  await (await revealControl(page, "#showGrid")).uncheck();
});

test("PNG exports use the selected canvas and quality dimensions", async ({ page }) => {
  await (await revealControl(page, "#aspect")).selectOption("wide");
  await (await revealControl(page, "#scale")).selectOption("1");
  const standard = await downloadBytes(page, page.locator("#exportPng"));
  expect(pngDimensions(standard.bytes)).toEqual({ width: 1600, height: 900 });

  await (await revealControl(page, "#aspect")).selectOption("square");
  await (await revealControl(page, "#scale")).selectOption("2");
  const high = await downloadBytes(page, page.locator("#exportPng"));
  expect(pngDimensions(high.bytes)).toEqual({ width: 2400, height: 2400 });
});

test("transparent PNG has a transparent corner and opaque PNG does not", async ({ page }) => {
  await (await revealControl(page, "#aspect")).selectOption("wide");

  await (await revealControl(page, "#transparent")).uncheck();
  const opaque = await downloadBytes(page, page.locator("#exportPng"));
  expect(await pngCornerAlpha(page, opaque.bytes)).toBe(255);

  await (await revealControl(page, "#transparent")).check();
  const transparent = await downloadBytes(page, page.locator("#exportPng"));
  expect(await pngCornerAlpha(page, transparent.bytes)).toBe(0);
});

test("all themes export correctly with opaque and transparent canvases", async ({ page }) => {
  const opaqueFills = new Set();

  for (const theme of ["light", "dark", "clean"]) {
    await (await revealControl(page, "#theme")).selectOption(theme);
    for (const transparent of [false, true]) {
      await (await revealControl(page, "#transparent")).setChecked(transparent);
      const { bytes } = await downloadBytes(page, page.locator("#exportSvg"));
      const svg = bytes.toString("utf8");
      const canvas = await page.evaluate(source => {
        const document = new DOMParser().parseFromString(source, "image/svg+xml");
        const svg = document.documentElement;
        const viewBox = (svg.getAttribute("viewBox") || "0 0 0 0").trim().split(/\s+/).map(Number);
        const width = Number(svg.getAttribute("width")) || viewBox[2];
        const height = Number(svg.getAttribute("height")) || viewBox[3];
        const rectangles = [...document.querySelectorAll("rect")].filter(rectangle => {
          const x = Number(rectangle.getAttribute("x") || 0);
          const y = Number(rectangle.getAttribute("y") || 0);
          return x === 0 && y === 0 && Number(rectangle.getAttribute("width")) === width && Number(rectangle.getAttribute("height")) === height;
        });
        return { width, height, fills: rectangles.map(rectangle => rectangle.getAttribute("fill")) };
      }, svg);

      expect(canvas).toMatchObject({ width: 1600, height: 900 });
      if (transparent) {
        expect(canvas.fills).toHaveLength(0);
      } else {
        expect(canvas.fills).toHaveLength(1);
        opaqueFills.add(canvas.fills[0]);
      }
    }
  }

  expect(opaqueFills.size).toBe(3);
});

test("transparent exports use a high-contrast header and legend text tone for every destination preview", async ({ page }) => {
  await ensureSampleLocations(page);
  await (await revealControl(page, "#transparent")).check();
  await (await revealControl(page, "#showLegend")).check();
  await (await revealControl(page, "#cleanSvg")).uncheck();

  const cases = [
    { preview: "light", tone: "auto", expected: "#20202e" },
    { preview: "checker", tone: "auto", expected: "#20202e" },
    { preview: "dark", tone: "auto", expected: "#ffffff" },
    { preview: "custom", backdrop: "#111111", tone: "auto", expected: "#ffffff" },
    { preview: "custom", backdrop: "#ffffff", tone: "auto", expected: "#20202e" },
    { preview: "light", tone: "light", expected: "#ffffff" },
    { preview: "dark", tone: "dark", expected: "#20202e" },
  ];

  for (const scenario of cases) {
    await (await revealControl(page, "#transparentPreview")).selectOption(scenario.preview);
    if (scenario.backdrop) await (await revealControl(page, "#backdropColor")).fill(scenario.backdrop);
    await (await revealControl(page, "#transparentText")).selectOption(scenario.tone);

    const { bytes } = await downloadBytes(page, page.locator("#exportSvg"));
    const colors = await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, "image/svg+xml");
      const directText = [...document.documentElement.children].filter(element => element.localName === "text");
      const title = directText.find(element => element.getAttribute("x") === "80" && element.getAttribute("y") === "82");
      const legend = [...document.querySelectorAll("g[aria-label='Legend'] text")];
      return {
        title: title?.getAttribute("fill")?.toLowerCase() || null,
        legend: legend.map(element => element.getAttribute("fill")?.toLowerCase() || null),
      };
    }, bytes.toString("utf8"));

    expect(colors.title, `${scenario.preview}/${scenario.tone} title tone`).toBe(scenario.expected);
    expect(colors.legend.length, `${scenario.preview}/${scenario.tone} includes legend text`).toBeGreaterThan(0);
    expect(new Set(colors.legend), `${scenario.preview}/${scenario.tone} legend tone`).toEqual(new Set([scenario.expected]));
  }
});

test("clean SVG mode removes editor-only location names", async ({ page }) => {
  await ensureSampleLocations(page);
  const locationName = (await page.locator("#pinList .pin-row strong").first().textContent()).trim();

  await (await revealControl(page, "#cleanSvg")).check();
  const clean = await downloadBytes(page, page.locator("#exportSvg"));
  expect(clean.bytes.toString("utf8")).not.toContain(locationName);

  await (await revealControl(page, "#cleanSvg")).uncheck();
  const detailed = await downloadBytes(page, page.locator("#exportSvg"));
  expect(detailed.bytes.toString("utf8")).toContain(locationName);
});
