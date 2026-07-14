import { test, expect } from "@playwright/test";
import { downloadBytes, ensureSampleLocations, gotoFresh, pngCornerAlpha, pngDimensions, revealControl } from "./helpers.mjs";

const luminance = hex => {
  const channels = (hex.match(/[a-f\d]{2}/gi) || []).map(value => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrastRatio = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

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
  await (await revealControl(page, "#theme")).selectOption("dark");
  await (await revealControl(page, "#transparent")).check();
  await (await revealControl(page, "#showCounts")).check();
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
      const stateLabels = [...document.querySelectorAll(".state-label text")];
      const stateCounts = [...document.querySelectorAll(".state-count-inline")];
      const placeLabels = [...document.querySelectorAll(".place-label-group text")];
      return {
        title: title?.getAttribute("fill")?.toLowerCase() || null,
        legend: legend.map(element => element.getAttribute("fill")?.toLowerCase() || null),
        stateLabels: stateLabels.map(element => element.getAttribute("fill")?.toLowerCase() || null),
        stateCounts: stateCounts.map(element => element.getAttribute("fill")?.toLowerCase() || null),
        placeLabels: placeLabels.map(element => element.getAttribute("fill")?.toLowerCase() || null),
      };
    }, bytes.toString("utf8"));

    expect(colors.title, `${scenario.preview}/${scenario.tone} title tone`).toBe(scenario.expected);
    expect(colors.legend.length, `${scenario.preview}/${scenario.tone} includes legend text`).toBeGreaterThan(0);
    expect(new Set(colors.legend), `${scenario.preview}/${scenario.tone} legend tone`).toEqual(new Set([scenario.expected]));
    expect(colors.stateLabels.length, `${scenario.preview}/${scenario.tone} includes state labels`).toBeGreaterThan(0);
    expect(colors.stateCounts.length, `${scenario.preview}/${scenario.tone} includes state counts`).toBeGreaterThan(0);
    expect(colors.placeLabels.length, `${scenario.preview}/${scenario.tone} includes place labels`).toBeGreaterThan(0);
    expect(new Set(colors.stateLabels), `${scenario.preview}/${scenario.tone} keeps state text light on dark state plates`).toEqual(new Set(["#ffffff"]));
    expect(new Set(colors.stateCounts), `${scenario.preview}/${scenario.tone} keeps state counts light on dark state plates`).toEqual(new Set(["#ffffff"]));
    expect(new Set(colors.placeLabels), `${scenario.preview}/${scenario.tone} keeps place text light on dark label plates`).toEqual(new Set(["#ffffff"]));
  }
});

test("map-surface labels retain contrast across every theme and transparent text mode", async ({ page }) => {
  await ensureSampleLocations(page);
  await (await revealControl(page, "#showCounts")).check();

  const themes = [
    { value: "light", text: "#20202e", land: "#dfe3e8", panel: "#ffffff" },
    { value: "dark", text: "#ffffff", land: "#3c3852", panel: "#2f2c43" },
    { value: "clean", text: "#20202e", land: "#f1f2f5", panel: "#ffffff" },
  ];
  const presentations = [
    { name: "opaque", transparent: false },
    { name: "light auto", transparent: true, preview: "light", tone: "auto" },
    { name: "checker auto", transparent: true, preview: "checker", tone: "auto" },
    { name: "dark auto", transparent: true, preview: "dark", tone: "auto" },
    { name: "custom light auto", transparent: true, preview: "custom", backdrop: "#ffffff", tone: "auto" },
    { name: "custom dark auto", transparent: true, preview: "custom", backdrop: "#111111", tone: "auto" },
    { name: "forced light text", transparent: true, preview: "light", tone: "light" },
    { name: "forced dark text", transparent: true, preview: "dark", tone: "dark" },
  ];

  for (const theme of themes) {
    await (await revealControl(page, "#theme")).selectOption(theme.value);
    for (const presentation of presentations) {
      await (await revealControl(page, "#transparent")).setChecked(presentation.transparent);
      if (presentation.transparent) {
        await (await revealControl(page, "#transparentPreview")).selectOption(presentation.preview);
        if (presentation.backdrop) await (await revealControl(page, "#backdropColor")).fill(presentation.backdrop);
        await (await revealControl(page, "#transparentText")).selectOption(presentation.tone);
      }

      const colors = await page.evaluate(() => ({
        stateText: [...document.querySelectorAll("#mapSvg .state-label text")].map(element => element.getAttribute("fill")?.toLowerCase()),
        statePlates: [...document.querySelectorAll("#mapSvg .state-label rect")].map(element => element.getAttribute("fill")?.toLowerCase()),
        placeText: [...document.querySelectorAll("#mapSvg .place-label-group text")].map(element => element.getAttribute("fill")?.toLowerCase()),
        placePlates: [...document.querySelectorAll("#mapSvg .place-label-group rect")].map(element => element.getAttribute("fill")?.toLowerCase()),
      }));
      const context = `${theme.value}/${presentation.name}`;
      expect(colors.stateText.length, `${context} includes state initials and counts`).toBeGreaterThan(51);
      expect(colors.placeText.length, `${context} includes place labels`).toBeGreaterThan(0);
      expect(new Set(colors.stateText), `${context} state text follows the state surface`).toEqual(new Set([theme.text]));
      expect(new Set(colors.statePlates), `${context} state plates follow the theme`).toEqual(new Set([theme.land]));
      expect(new Set(colors.placeText), `${context} place text follows the label surface`).toEqual(new Set([theme.text]));
      expect(new Set(colors.placePlates), `${context} place plates follow the theme`).toEqual(new Set([theme.panel]));
      expect(contrastRatio(theme.text, theme.land), `${context} state text contrast`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.text, theme.panel), `${context} place text contrast`).toBeGreaterThanOrEqual(4.5);
    }
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
