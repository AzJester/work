import { test, expect } from "@playwright/test";
import { addCity, gotoFresh, revealControl } from "./helpers.mjs";

const DISCLOSURES = ["quickSettings", "mapDetailsSettings", "advancedSettings", "projectSettings"];
const LOCATION_TYPES = [
  ["headquarters", "Headquarters", "star"],
  ["regional", "Regional headquarters", "building"],
  ["hub", "Site", "circle"],
  ["contract", "Contract site", "briefcase"],
  ["future", "Future site", "clock"],
  ["program", "Program office", "document"],
  ["operations", "Operations center", "network"],
  ["customer", "Customer site", "person"],
  ["partner", "Partner site", "link"],
  ["test", "Test or range site", "target"],
  ["manufacturing", "Manufacturing facility", "factory"],
];

function details(page, id) {
  return page.locator(`details#${id}`);
}

async function openDisclosure(page, id) {
  const section = details(page, id);
  if (!(await section.evaluate(element => element.open))) await section.locator(":scope > summary").click();
  await expect.poll(() => section.evaluate(element => element.open)).toBeTruthy();
  return section;
}

function parseColor(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return [1, 3, 5].map(index => Number.parseInt(text.slice(index, index + 2), 16));
  const match = text.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/);
  if (match) return match.slice(1, 4).map(Number);
  throw new Error(`Unsupported CSS color: ${value}`);
}

function contrastRatio(foreground, background) {
  const luminance = color => {
    const channels = parseColor(color).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test.beforeEach(async ({ page }) => {
  await gotoFresh(page);
});

test("settings use a compact native one-at-a-time disclosure sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });

  for (const id of DISCLOSURES) {
    const section = details(page, id);
    await expect(section).toHaveCount(1);
    expect(await section.evaluate(element => element.tagName)).toBe("DETAILS");
    await expect(section.locator(":scope > summary")).toHaveCount(1);

    const status = section.locator(":scope > summary .settings-summary-status, :scope > summary [data-summary-status]");
    await expect(status, `${id} has visible summary status text`).toHaveCount(1);
    await expect(status).toBeVisible();
    expect((await status.textContent()).trim(), `${id} summary status is not empty`).not.toBe("");
  }

  expect(await details(page, "quickSettings").evaluate(element => element.open)).toBeTruthy();
  for (const id of DISCLOSURES.slice(1)) {
    expect(await details(page, id).evaluate(element => element.open), `${id} starts collapsed`).toBeFalsy();
  }

  const panelBox = await page.locator("aside.controls").boundingBox();
  expect(panelBox, "settings panel is visible").not.toBeNull();
  expect(panelBox.height, "default desktop settings panel stays compact").toBeLessThanOrEqual(600);

  for (const id of DISCLOSURES.slice(1)) {
    await details(page, id).locator(":scope > summary").click();
    for (const candidate of DISCLOSURES) {
      expect(
        await details(page, candidate).evaluate(element => element.open),
        `${id} is the only open settings section`,
      ).toBe(candidate === id);
    }
  }
});

for (const width of [320, 400, 802, 1280]) {
  test(`every disclosure control remains reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });

    for (const id of DISCLOSURES) {
      const section = await openDisclosure(page, id);
      const interactive = section.locator(
        ":scope > summary, input:not([type='hidden']):not(.sr-only), select, button, label.btn",
      );
      let visibleControls = 0;
      for (let index = 0; index < (await interactive.count()); index += 1) {
        const control = interactive.nth(index);
        if (!(await control.isVisible())) continue;
        visibleControls += 1;
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        expect(box, `${id} control ${index} has layout geometry`).not.toBeNull();
        expect(box.x, `${id} control ${index} begins inside the viewport`).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, `${id} control ${index} ends inside the viewport`).toBeLessThanOrEqual(width + 1);
        expect(box.y, `${id} control ${index} can be scrolled into view`).toBeGreaterThanOrEqual(-1);
        expect(box.y + box.height, `${id} control ${index} can be fully reached`).toBeLessThanOrEqual(721);
      }
      expect(visibleControls, `${id} exposes at least its summary and one control`).toBeGreaterThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), "the page does not scroll sideways").toBeLessThanOrEqual(width + 1);
    }
  });
}

test("all location categories use distinct accessible icons inside the same teardrop pin", async ({ page }) => {
  const typeOptions = await page.locator("#pinType option").evaluateAll(options =>
    options.map(option => ({ value: option.value, label: option.textContent.trim() })),
  );
  expect(typeOptions, "the location dropdown publishes every supported category").toEqual(
    LOCATION_TYPES.map(([value, label]) => ({ value, label })),
  );

  for (const [type, label] of LOCATION_TYPES) {
    await addCity(page, { name: `${label} browser test`, state: "VA", city: "Arlington", type });
  }

  const result = await page.evaluate(({ types }) => {
    const iconSignature = icon => {
      const clone = icon.cloneNode(true);
      clone.removeAttribute("data-icon");
      return new XMLSerializer()
        .serializeToString(clone)
        .replace(/#[\da-f]{3,8}/gi, "#color")
        .replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi, "#")
        .replace(/\s+/g, " ")
        .trim();
    };

    const output = {};
    for (const [type, label] of types) {
      const marker = document.querySelector(`#mapSvg .location-layer .site-marker[data-location-type="${type}"]`);
      const pin = marker?.querySelector(".map-pin");
      const body = pin?.querySelector(".map-pin-body");
      const icon = pin?.querySelector(".map-pin-icon");
      const legendItem = [...document.querySelectorAll("#mapSvg g[aria-label]")].find(element =>
        element.getAttribute("aria-label") === label && element.querySelector(".map-pin"),
      );
      const legendIcon = legendItem?.querySelector(".map-pin-icon");
      const rect = pin?.getBoundingClientRect();
      const bodyBox = body?.getBBox();
      output[type] = {
        markerLabel: marker?.getAttribute("aria-label") || null,
        pinCount: marker?.querySelectorAll(".map-pin").length || 0,
        bodyTag: body?.tagName.toLowerCase() || null,
        bodyHasMarkerPinClass: body?.classList.contains("marker-pin") || false,
        bodyRatio: bodyBox ? bodyBox.height / bodyBox.width : 0,
        iconTag: icon?.tagName.toLowerCase() || null,
        mapIconKind: icon?.getAttribute("data-icon") || null,
        legendIconKind: legendIcon?.getAttribute("data-icon") || null,
        center: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null,
        mapIconSignature: icon ? iconSignature(icon) : null,
        legendIconSignature: legendIcon ? iconSignature(legendIcon) : null,
      };
    }
    return output;
  }, { types: LOCATION_TYPES });

  for (const [type, label, expectedIcon] of LOCATION_TYPES) {
    const pin = result[type];
    expect(pin.markerLabel, `${label} marker has an accessible category label`).toMatch(new RegExp(label, "i"));
    expect(pin.pinCount, `${label} uses one generic pin`).toBe(1);
    expect(pin.bodyTag, `${label} pin body is a teardrop path`).toBe("path");
    expect(pin.bodyHasMarkerPinClass, `${label} keeps the common marker-pin hook`).toBeTruthy();
    expect(pin.bodyRatio, `${label} teardrop is taller than it is wide`).toBeGreaterThan(1.1);
    expect(pin.iconTag, `${label} interior icon is grouped independently`).toBe("g");
    expect(pin.mapIconKind, `${label} uses its assigned map icon`).toBe(expectedIcon);
    expect(pin.legendIconKind, `${label} uses its assigned legend icon`).toBe(expectedIcon);
    expect(pin.center, `${label} pin has rendered geometry`).not.toBeNull();
    expect(pin.mapIconSignature, `${label} has an interior category icon`).toContain("<");
    expect(pin.legendIconSignature, `${label} legend uses a pin with an interior icon`).toContain("<");
    expect(pin.legendIconSignature, `${label} map and legend icons match`).toBe(pin.mapIconSignature);
  }

  const iconSignatures = LOCATION_TYPES.map(([type]) => result[type].mapIconSignature);
  expect(new Set(iconSignatures).size, "every category has a distinct interior icon").toBe(LOCATION_TYPES.length);

  for (let index = 0; index < LOCATION_TYPES.length; index += 1) {
    for (let other = index + 1; other < LOCATION_TYPES.length; other += 1) {
      const left = result[LOCATION_TYPES[index][0]].center;
      const right = result[LOCATION_TYPES[other][0]].center;
      expect(
        Math.hypot(left.x - right.x, left.y - right.y),
        `${LOCATION_TYPES[index][1]} and ${LOCATION_TYPES[other][1]} fan to distinct positions`,
      ).toBeGreaterThan(4);
    }
  }

  const layout = await page.evaluate(() => {
    const svg = document.querySelector("#mapSvg");
    const viewBox = svg.viewBox.baseVal;
    const legend = [...svg.querySelectorAll("g[aria-label]")].find(element => element.getAttribute("aria-label") === "Legend");
    const legendBox = legend?.getBBox();
    const items = legend ? [...legend.querySelectorAll(":scope > g")] : [];
    return {
      viewBox: { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height },
      legendBox: legendBox ? { x: legendBox.x, y: legendBox.y, width: legendBox.width, height: legendBox.height } : null,
      legendLabels: items.map(item => item.getAttribute("aria-label")),
      legendRows: new Set(items.map(item => Math.round(item.getBoundingClientRect().y))).size,
      fanStemCount: svg.querySelectorAll(".marker-fan-stem").length,
    };
  });
  expect(layout.legendBox, "the used-type legend is rendered").not.toBeNull();
  expect(new Set(layout.legendLabels), "the legend includes all used categories").toEqual(
    new Set(LOCATION_TYPES.map(([, label]) => label)),
  );
  expect(layout.legendRows, "the many-category legend wraps to multiple rows").toBeGreaterThan(1);
  expect(layout.legendBox.x).toBeGreaterThanOrEqual(layout.viewBox.x - 0.5);
  expect(layout.legendBox.y).toBeGreaterThanOrEqual(layout.viewBox.y - 0.5);
  expect(layout.legendBox.x + layout.legendBox.width).toBeLessThanOrEqual(layout.viewBox.x + layout.viewBox.width + 0.5);
  expect(layout.legendBox.y + layout.legendBox.height).toBeLessThanOrEqual(layout.viewBox.y + layout.viewBox.height + 0.5);
  expect(layout.fanStemCount, "fanned categories keep a visible stem back to their shared anchor").toBeGreaterThan(0);
});

test("the legend renders pins for used categories only", async ({ page }) => {
  await addCity(page, { name: "Used headquarters", state: "VA", city: "Arlington", type: "headquarters" });
  await addCity(page, { name: "Used contract", state: "VA", city: "Alexandria", type: "contract" });

  const legend = page.locator("#mapSvg g[aria-label='Legend']");
  await expect(legend).toHaveCount(1);
  const items = legend.locator(":scope > g");
  await expect(items).toHaveCount(2);
  expect(new Set(await items.evaluateAll(elements => elements.map(element => element.getAttribute("aria-label"))))).toEqual(
    new Set(["Headquarters", "Contract site"]),
  );
  await expect(items.locator(".map-pin")).toHaveCount(2);
  await expect(items.locator(".map-pin-body.marker-pin")).toHaveCount(2);
  await expect(items.locator(".map-pin-icon")).toHaveCount(2);
});

test("multiple locations of the same type share one pin with a count badge", async ({ page }) => {
  await addCity(page, { name: "Arlington site one", state: "VA", city: "Arlington", type: "hub" });
  await addCity(page, { name: "Arlington site two", state: "VA", city: "Arlington", type: "hub" });

  const marker = page.locator("#mapSvg .location-layer .site-marker[data-location-type='hub']");
  await expect(marker).toHaveCount(1);
  await expect(marker.locator(".map-pin")).toHaveCount(1);
  await expect(marker).toHaveAttribute("aria-label", /2 Site locations/i);
  const badge = marker.locator(".marker-count");
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText("2");
  await expect(badge).toHaveAttribute("aria-label", /2 Site locations/i);
});

test("pin outlines retain destination contrast in light, dark, and transparent modes", async ({ page }) => {
  await addCity(page, { name: "Outline test headquarters", state: "VA", city: "Arlington", type: "headquarters" });
  const scenarios = [
    { name: "light map", theme: "light", transparent: false },
    { name: "dark map", theme: "dark", transparent: false },
    { name: "transparent light destination", theme: "light", transparent: true, preview: "light", destination: "#ffffff" },
    { name: "transparent dark destination", theme: "light", transparent: true, preview: "dark", destination: "#222230" },
  ];
  const outlineColors = new Set();

  for (const scenario of scenarios) {
    const theme = await revealControl(page, "#theme");
    await theme.selectOption(scenario.theme);
    const transparent = await revealControl(page, "#transparent");
    await transparent.setChecked(scenario.transparent);
    if (scenario.preview) {
      const preview = await revealControl(page, "#transparentPreview");
      await preview.selectOption(scenario.preview);
    }

    const style = await page.locator("#mapSvg .location-layer .map-pin-body").first().evaluate(element => {
      const computed = getComputedStyle(element);
      const state = document.querySelector("#mapSvg .state-shape");
      return {
        stroke: computed.stroke,
        strokeWidth: Number.parseFloat(computed.strokeWidth),
        stateFill: getComputedStyle(state).fill,
      };
    });
    outlineColors.add(style.stroke);
    expect(style.stroke, `${scenario.name} has a solid pin outline`).not.toMatch(/^(?:none|transparent|rgba\([^)]*,\s*0\))$/i);
    expect(style.strokeWidth, `${scenario.name} outline is substantial`).toBeGreaterThanOrEqual(1.5);
    expect(
      contrastRatio(style.stroke, scenario.destination || style.stateFill),
      `${scenario.name} outline remains distinguishable`,
    ).toBeGreaterThanOrEqual(3);
  }

  expect(outlineColors.size, "outline tone adapts between light and dark destinations").toBeGreaterThanOrEqual(2);
});
