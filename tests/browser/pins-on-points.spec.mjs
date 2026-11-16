import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { locationRows, revealControl } from "./helpers.mjs";

// Contract: a pin's tip is always exactly on its point. Places closer than MERGE_DISTANCE map units share one
// pin on their centroid; a place with several location types, or several merged places, shows a numbered group
// pin that the key explains. State abbreviations give way to pins; pins never move.
const STORAGE_KEY = "astrion_map_builder_v1";
const MERGE_DISTANCE = 7;
const places = JSON.parse(readFileSync(new URL("../../geopresence/data/places-2025.json", import.meta.url), "utf8"));
const installations = JSON.parse(readFileSync(new URL("../../geopresence/data/installations-2024-2025.json", import.meta.url), "utf8"));
const placeById = new Map(places.map(place => [place[1], place]));
const point = geoid => ({ x: placeById.get(geoid)[4], y: placeById.get(geoid)[5] });
const redstone = installations.find(item => item[4] === "dod-fid-986");

const LONE_PLACES = [
  ["Huntsville, AL", "AL", "0137000"],
  ["Phoenix, AZ", "AZ", "0455000"],
  ["Dayton, OH", "OH", "3921000"],
  ["Honolulu, HI", "HI", "1571550"],
  ["Anchorage, AK", "AK", "0203000"],
  ["Juneau, AK", "AK", "0236400"],
  ["Hilo, HI", "HI", "1514650"],
  ["Seattle, WA", "WA", "5363000"],
  ["Boston, MA", "MA", "2507000"],
  ["Key West, FL", "FL", "1236550"],
  ["Caribou, ME", "ME", "2310565"],
  ["Washington, DC", "DC", "1150000"],
  ["Denver, CO", "CO", "0820000"],
  ["Albuquerque, NM", "NM", "3502000"],
  ["San Antonio, TX", "TX", "4865000"],
  ["Colorado Springs, CO", "CO", "0816000"],
  ["Cape Canaveral, FL", "FL", "1210250"],
  ["Chicago, IL", "IL", "1714000"],
];

const cityPin = (id, name, state, cityId, type = "hub") => ({ id, name, state, type, anchorKind: "city", cityId });
const freePin = (id, name, state, x, y, type = "hub") => ({
  id, name, state, type, anchorKind: "installation", anchorId: `custom:${id}`, anchorLabel: name, x, y,
});

async function seed(page, pins, settings = {}) {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.evaluate(([key, model]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(model));
  }, [STORAGE_KEY, { schemaVersion: 3, ...settings, pins }]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mapSvg")).toBeVisible();
  await expect.poll(() => page.locator("#mapSvg .state-shape").count()).toBeGreaterThanOrEqual(51);
  await expect(page.locator("#mapStatus")).not.toContainText(/loading/i);
  await expect(locationRows(page)).toHaveCount(pins.length);
}

// Every marker with its tip (the pin path's start point) in the map group's own coordinates.
function readMarkers(page) {
  return page.evaluate(() => [...document.querySelectorAll("#mapSvg .location-layer .site-marker")].map(marker => {
    const body = marker.querySelector(".map-pin-body");
    const tip = body.getPointAtLength(0);
    const group = marker.closest(".place-group");
    return {
      anchorId: group.getAttribute("data-anchor-id"),
      placeCount: Number(group.getAttribute("data-place-count") || 1),
      type: marker.getAttribute("data-location-type"),
      types: (marker.getAttribute("data-location-types") || "").split(" ").filter(Boolean),
      x: tip.x,
      y: tip.y,
      ariaLabel: marker.getAttribute("aria-label") || "",
      title: marker.querySelector("title")?.textContent || "",
      number: marker.querySelector(".map-pin-number")?.textContent ?? null,
      badge: marker.querySelector(".marker-count text")?.textContent ?? null,
      icon: marker.querySelector(".map-pin-icon")?.getAttribute("data-icon") ?? null,
      fill: body.getAttribute("fill"),
      ring: body.getAttribute("stroke"),
      numberFill: marker.querySelector(".map-pin-number")?.getAttribute("fill") ?? null,
    };
  }));
}

// Rectangles in the map group's coordinates, so pins, labels and state plates compare directly.
function readMapBoxes(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#mapSvg");
    const map = svg.querySelector("g[aria-label='Geographic map of the United States']");
    const inverse = map.getScreenCTM().inverse();
    const toMap = element => {
      const rect = element.getBoundingClientRect();
      const a = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
      const b = new DOMPoint(rect.right, rect.bottom).matrixTransform(inverse);
      return { left: a.x, top: a.y, right: b.x, bottom: b.y };
    };
    return {
      pins: [...map.querySelectorAll(".site-marker")].map(marker => ({ key: marker.closest(".place-group").getAttribute("data-anchor-id"), ...toMap(marker) })),
      stateLabels: [...map.querySelectorAll(".state-label")].map(label => {
        const plate = label.querySelector("rect");
        const center = svg.createSVGPoint();
        center.x = Number(plate.getAttribute("x")) + Number(plate.getAttribute("width")) / 2;
        center.y = Number(plate.getAttribute("y")) + Number(plate.getAttribute("height")) / 2;
        const shape = map.querySelector(`.state-hit[data-state="${label.getAttribute("data-state")}"] .state-shape`);
        return {
          state: label.getAttribute("data-state"),
          moved: label.getAttribute("data-moved") === "true",
          centerX: center.x,
          centerY: center.y,
          centerInsideState: shape.isPointInFill(center),
          ...toMap(plate),
        };
      }),
      placeLabels: [...map.querySelectorAll(".place-label-group")].map(label => ({ text: label.textContent.trim(), ...toMap(label) })),
      calloutLeaders: map.querySelectorAll(".state-callout-leader").length,
      leaders: map.querySelectorAll(".marker-leader, .marker-fan-stem").length,
    };
  });
}

const overlaps = (a, b, pad = 0) => a.left < b.right + pad && a.right + pad > b.left && a.top < b.bottom + pad && a.bottom + pad > b.top;
const labelsOverPins = boxes => boxes.stateLabels.filter(label => boxes.pins.some(pin => overlaps(label, pin))).map(label => label.state);

function readCanvas(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#mapSvg");
    const viewBox = svg.viewBox.baseVal;
    const box = element => {
      if (!element) return null;
      const b = element.getBBox();
      return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
    };
    const map = svg.querySelector("g[aria-label='Geographic map of the United States']");
    const [, mapX, mapY, scale] = map.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/).map(Number);
    const key = svg.querySelector(".group-key");
    return {
      width: viewBox.width,
      height: viewBox.height,
      mapScale: scale,
      mapLeft: mapX,
      mapTop: mapY,
      mapBottom: mapY + 594 * scale,
      mapRight: mapX + 1016 * scale,
      key: box(key),
      keyEntries: key ? [...key.querySelectorAll(".group-key-item")].map(item => ({
        number: item.querySelector(".group-key-number").textContent,
        text: item.querySelector(".group-key-text").textContent.replace(/\s+/g, " ").trim(),
        label: item.getAttribute("aria-label"),
        ...box(item),
      })) : [],
      keyMore: key?.querySelector(".group-key-more")?.textContent ?? null,
      keyTotal: key ? Number(key.getAttribute("data-entries")) : 0,
      legend: box(svg.querySelector("g[aria-label='Legend']")),
      legendLabels: [...svg.querySelectorAll("g[aria-label='Legend'] > g")].map(item => item.getAttribute("aria-label")),
      warning: document.querySelector("#layoutWarning").textContent,
    };
  });
}

test("a lone pin's tip sits exactly on its catalog point with state labels on", async ({ page }) => {
  for (const [name, state, geoid] of LONE_PLACES) {
    await seed(page, [cityPin("lone", `${name} office`, state, geoid)]);
    expect(await page.locator("#showLabels").isChecked(), "state labels are on by default").toBeTruthy();
    const markers = await readMarkers(page);
    expect(markers, `${name} renders one pin`).toHaveLength(1);
    const expected = point(geoid);
    expect(Math.abs(markers[0].x - expected.x), `${name} tip x ${markers[0].x} vs catalog ${expected.x}`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(markers[0].y - expected.y), `${name} tip y ${markers[0].y} vs catalog ${expected.y}`).toBeLessThanOrEqual(0.1);
    expect(markers[0].anchorId).toBe(`place:${geoid}`);
    expect(markers[0].type).toBe("hub");
    expect(markers[0].number, `${name} keeps the type symbol, not a key number`).toBeNull();
  }
});

test("pins far enough apart all keep their exact points, and nothing links a pin to another position", async ({ page }) => {
  const pins = LONE_PLACES.map(([name, state, geoid], index) => cityPin(`p${index}`, `${name} office`, state, geoid, index % 2 ? "contract" : "hub"));
  pins.push({ id: "redstone", name: "Redstone contract", state: "AL", type: "contract", anchorKind: "installation", anchorId: "dod-fid-986" });
  await seed(page, pins);

  const markers = await readMarkers(page);
  for (const [name, , geoid] of LONE_PLACES) {
    const marker = markers.find(item => item.anchorId.split(" ").includes(`place:${geoid}`));
    expect(marker, `${name} has a pin`).toBeTruthy();
    if (marker.placeCount > 1) continue; // Huntsville merges with Redstone Arsenal; covered below.
    const expected = point(geoid);
    expect(Math.hypot(marker.x - expected.x, marker.y - expected.y), `${name} tip distance from its point`).toBeLessThanOrEqual(0.1);
  }
  const boxes = await readMapBoxes(page);
  expect(boxes.leaders, "no marker leader lines or fan stems").toBe(0);

  // Huntsville and Redstone Arsenal are 1.6 units apart: one pin on their centroid.
  const huntsville = point("0137000");
  expect(Math.hypot(huntsville.x - redstone[2], huntsville.y - redstone[3])).toBeLessThan(MERGE_DISTANCE);
  const merged = markers.find(item => item.anchorId.split(" ").includes("place:0137000"));
  expect(merged.anchorId.split(" ").sort()).toEqual(["dod-fid-986", "place:0137000"]);
  expect(merged.placeCount).toBe(2);
  expect(Math.abs(merged.x - (huntsville.x + redstone[2]) / 2)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(merged.y - (huntsville.y + redstone[3]) / 2)).toBeLessThanOrEqual(0.1);
});

test("a pin on the northern edge of the map stays on its point and clear of the heading", async ({ page }) => {
  const bellingham = "5305280";
  expect(point(bellingham).y, "Bellingham is close enough to the map's top edge for its pin to stand above it").toBeLessThan(13 + 30);
  await seed(page, [cityPin("n", "Bellingham office", "WA", bellingham)], { mapSubtitle: "A long subtitle that runs across the width of the canvas, under where the map of the northern states begins" });
  for (const aspect of ["wide", "slide", "square"]) {
    await (await revealControl(page, "#aspect")).selectOption(aspect);
    const [marker] = await readMarkers(page);
    expect(Math.hypot(marker.x - point(bellingham).x, marker.y - point(bellingham).y), `${aspect}: tip on the catalog point`).toBeLessThanOrEqual(0.1);
    const layout = await page.evaluate(() => {
      const svg = document.querySelector("#mapSvg");
      const inverse = svg.getScreenCTM().inverse();
      const top = element => new DOMPoint(0, element.getBoundingClientRect().top).matrixTransform(inverse).y;
      const bottom = element => new DOMPoint(0, element.getBoundingClientRect().bottom).matrixTransform(inverse).y;
      const subtitle = [...svg.children].find(element => element.localName === "text" && element.getAttribute("y") === "142");
      return { pinTop: top(svg.querySelector(".site-marker")), subtitleBottom: bottom(subtitle) };
    });
    expect(layout.pinTop, `${aspect}: the pin's head stays below the subtitle`).toBeGreaterThanOrEqual(layout.subtitleBottom);
    expect(layout.pinTop, `${aspect}: the pin's head stays inside the map band`).toBeGreaterThanOrEqual(160);
  }
});

test("places closer than the merge distance share one pin on their centroid; farther ones do not", async ({ page }) => {
  const near = ["5103000", "5101000", "1150000"]; // Arlington, Alexandria, Washington
  const far = "2404000"; // Baltimore
  const nearPoints = near.map(point);
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      expect(Math.hypot(nearPoints[i].x - nearPoints[j].x, nearPoints[i].y - nearPoints[j].y)).toBeLessThan(MERGE_DISTANCE);
    }
    expect(Math.hypot(nearPoints[i].x - point(far).x, nearPoints[i].y - point(far).y)).toBeGreaterThanOrEqual(MERGE_DISTANCE);
  }

  await seed(page, [
    cityPin("a", "Arlington site", "VA", "5103000"),
    cityPin("b", "Alexandria site", "VA", "5101000"),
    cityPin("c", "Washington site", "DC", "1150000"),
    cityPin("d", "Baltimore site", "MD", far),
  ]);
  const markers = await readMarkers(page);
  expect(markers, "three merged places and one separate place").toHaveLength(2);

  const cluster = markers.find(marker => marker.placeCount === 3);
  expect(cluster, "the three nearby places form one cluster").toBeTruthy();
  const centroid = { x: nearPoints.reduce((sum, p) => sum + p.x, 0) / 3, y: nearPoints.reduce((sum, p) => sum + p.y, 0) / 3 };
  expect(Math.abs(cluster.x - centroid.x), "cluster tip x is the centroid").toBeLessThanOrEqual(0.1);
  expect(Math.abs(cluster.y - centroid.y), "cluster tip y is the centroid").toBeLessThanOrEqual(0.1);
  expect(cluster.number, "merged places show a key number even with one location type").toBe("1");
  expect(cluster.badge, "a group pin has no count badge").toBeNull();
  expect(cluster.icon, "a group pin shows a number in place of the symbol").toBeNull();
  for (const name of ["Arlington site", "Alexandria site", "Washington site"]) {
    expect(cluster.ariaLabel, `${name} is in the group pin's accessible name`).toContain(name);
    expect(cluster.title, `${name} is in the group pin's title`).toContain(name);
  }

  const baltimore = markers.find(marker => marker.anchorId === `place:${far}`);
  expect(Math.hypot(baltimore.x - point(far).x, baltimore.y - point(far).y), "the separate place keeps its exact point").toBeLessThanOrEqual(0.1);
  expect(baltimore.number).toBeNull();
  expect(baltimore.icon).toBe("circle");

  // Every tip stays visible: the topmost element at each tip belongs to that pin.
  const covered = await page.evaluate(() => [...document.querySelectorAll("#mapSvg .location-layer .site-marker")].filter(marker => {
    const body = marker.querySelector(".map-pin-body");
    const tip = body.getPointAtLength(0);
    const screen = new DOMPoint(tip.x, tip.y - 0.6).matrixTransform(body.getScreenCTM());
    document.querySelector(".map-frame").scrollIntoView({ block: "center" });
    const fresh = new DOMPoint(tip.x, tip.y - 0.6).matrixTransform(body.getScreenCTM());
    const hit = document.elementFromPoint(fresh.x, fresh.y) || document.elementFromPoint(screen.x, screen.y);
    return !marker.contains(hit);
  }).length);
  expect(covered, "no pin tip is covered by another pin or a label").toBe(0);
});

test("where one pin stands above another, both tips stay visible", async ({ page }) => {
  // Denver is 21 units due north of Colorado Springs, so Denver's tip lies over the head of the Colorado Springs pin.
  const denver = point("0820000"), springs = point("0816000");
  expect(Math.abs(denver.x - springs.x)).toBeLessThan(5);
  expect(springs.y - denver.y).toBeGreaterThan(MERGE_DISTANCE);
  expect(springs.y - denver.y).toBeLessThan(28);
  await seed(page, [cityPin("s", "Colorado Springs site", "CO", "0816000"), cityPin("d", "Denver site", "CO", "0820000", "headquarters")]);
  const hits = await page.evaluate(() => {
    document.querySelector(".map-frame").scrollIntoView({ block: "center" });
    return [...document.querySelectorAll("#mapSvg .location-layer .site-marker")].map(marker => {
      const body = marker.querySelector(".map-pin-body");
      const tip = body.getPointAtLength(0);
      const screen = new DOMPoint(tip.x, tip.y - 0.6).matrixTransform(body.getScreenCTM());
      const hit = document.elementFromPoint(screen.x, screen.y);
      return { place: marker.getAttribute("aria-label").split(",")[0], tipOnTop: marker.contains(hit), order: [...marker.closest(".location-layer").children].indexOf(marker.closest(".place-group")) };
    });
  });
  expect(hits.map(hit => hit.tipOnTop), "each tip is the topmost thing at its own point").toEqual([true, true]);
  const byPlace = Object.fromEntries(hits.map(hit => [hit.place, hit.order]));
  expect(byPlace.Denver, "the northern pin is painted after the southern one").toBeGreaterThan(byPlace["Colorado Springs"]);
});

test("a place with several location types shows one numbered pin and a key entry naming its types", async ({ page }) => {
  await seed(page, [
    cityPin("h1", "Huntsville contract one", "AL", "0137000", "contract"),
    cityPin("h2", "Huntsville operations", "AL", "0137000", "operations"),
    cityPin("h3", "Huntsville headquarters", "AL", "0137000", "headquarters"),
    cityPin("h4", "Huntsville contract two", "AL", "0137000", "contract"),
    cityPin("d1", "Dayton site", "OH", "3921000", "hub"),
    cityPin("d2", "Dayton second site", "OH", "3921000", "hub"),
  ]);

  const markers = await readMarkers(page);
  expect(markers, "one pin per place").toHaveLength(2);
  const group = markers.find(marker => marker.anchorId === "place:0137000");
  const huntsville = point("0137000");
  expect(Math.hypot(group.x - huntsville.x, group.y - huntsville.y), "the group pin stays on the place").toBeLessThanOrEqual(0.1);
  expect(group.number).toBe("1");
  expect(group.badge).toBeNull();
  expect(group.icon).toBeNull();
  expect(group.types.sort()).toEqual(["contract", "headquarters", "operations"]);
  for (const name of ["Huntsville contract one", "Huntsville operations", "Huntsville headquarters", "Huntsville contract two"]) {
    expect(group.ariaLabel).toContain(name);
    expect(group.title).toContain(name);
  }

  // One type repeated at one place keeps today's pin and its count badge, and needs no key entry.
  const dayton = markers.find(marker => marker.anchorId === "place:3921000");
  expect(dayton.number).toBeNull();
  expect(dayton.icon).toBe("circle");
  expect(dayton.badge).toBe("2");
  expect(dayton.ariaLabel).toMatch(/2 Site locations/);
  expect(dayton.ariaLabel).toContain("Dayton second site");

  const canvas = await readCanvas(page);
  expect(canvas.keyEntries).toHaveLength(1);
  expect(canvas.keyEntries[0].number).toBe("1");
  expect(canvas.keyEntries[0].text).toBe("Huntsville, AL: Headquarters, Operations center, Contract site (2)");
  expect(canvas.keyEntries[0].label).toBe("1: Huntsville, AL: Headquarters, Operations center, Contract site (2)");
  expect(new Set(canvas.legendLabels), "the legend still lists every type on the map, including those inside groups").toEqual(
    new Set(["Headquarters", "Site", "Contract site", "Operations center"]),
  );

  // The key stays when the legend is switched off, and goes when no group pin is left.
  await (await revealControl(page, "#showLegend")).uncheck();
  const withoutLegend = await readCanvas(page);
  expect(withoutLegend.legend).toBeNull();
  expect(withoutLegend.keyEntries).toHaveLength(1);
  expect(withoutLegend.key.bottom).toBeLessThanOrEqual(withoutLegend.height);
  expect(withoutLegend.key.top).toBeGreaterThanOrEqual(withoutLegend.mapBottom - 0.5);
});

test("group pins take the highest tier among their members and are numbered west to east", async ({ page }) => {
  await seed(page, [
    cityPin("b1", "Boston partner", "MA", "2507000", "partner"),
    cityPin("b2", "Boston contract", "MA", "2507000", "contract"),
    cityPin("p1", "Phoenix site", "AZ", "0455000", "hub"),
    cityPin("p2", "Phoenix customer", "AZ", "0455000", "customer"),
    cityPin("d1", "Denver headquarters", "CO", "0820000", "headquarters"),
    cityPin("d2", "Denver site", "CO", "0820000", "hub"),
    cityPin("d3", "Denver partner", "CO", "0820000", "partner"),
    cityPin("s1", "Seattle headquarters", "WA", "5363000", "headquarters"),
    cityPin("s2", "Chicago site", "IL", "1714000", "hub"),
    cityPin("s3", "Miami contract", "FL", "1245000", "contract"),
  ]);
  const markers = await readMarkers(page);
  const byPlace = geoid => markers.find(marker => marker.anchorId === `place:${geoid}`);
  const single = { lead: byPlace("5363000"), site: byPlace("1714000"), presence: byPlace("1245000") };
  const groups = { lead: byPlace("0820000"), site: byPlace("0455000"), presence: byPlace("2507000") };

  for (const tier of ["lead", "site", "presence"]) {
    expect(groups[tier].fill, `${tier} group pin fill matches the ${tier} pin form`).toBe(single[tier].fill);
    expect(groups[tier].ring, `${tier} group pin outline matches the ${tier} pin form`).toBe(single[tier].ring);
    expect(groups[tier].numberFill, `${tier} group number has a colour`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(groups[tier].numberFill, `${tier} group number differs from its pin fill`).not.toBe(groups[tier].fill);
  }
  expect([groups.site.number, groups.lead.number, groups.presence.number], "Phoenix, Denver, Boston from west to east").toEqual(["1", "2", "3"]);

  const canvas = await readCanvas(page);
  expect(canvas.keyEntries.map(entry => entry.text)).toEqual([
    "Phoenix, AZ: Site, Customer site",
    "Denver, CO: Headquarters, Site, Partner site",
    "Boston, MA: Contract site, Partner site",
  ]);
});

test("a state label that a pin covers moves inside its state, or hides, and never overlaps a pin", async ({ page }) => {
  // Phoenix sits on the Arizona abbreviation; Boston sits beside the Massachusetts callout.
  await seed(page, [
    cityPin("az", "Phoenix site", "AZ", "0455000"),
    cityPin("ma", "Boston site", "MA", "2507000"),
    cityPin("nm", "Albuquerque site", "NM", "3502000"),
    cityPin("co", "Colorado Springs site", "CO", "0816000"),
  ], { showCounts: true });
  let boxes = await readMapBoxes(page);
  expect(boxes.stateLabels.length, "most state abbreviations remain").toBeGreaterThanOrEqual(47);
  expect(labelsOverPins(boxes), "no state label overlaps a pin").toEqual([]);
  const arizona = boxes.stateLabels.find(label => label.state === "AZ");
  expect(arizona, "Arizona keeps its abbreviation").toBeTruthy();
  expect(arizona.moved, "the Arizona abbreviation moved out from under the Phoenix pin").toBeTruthy();
  expect(arizona.centerInsideState, "the moved abbreviation is still inside Arizona").toBeTruthy();
  await expect(page.locator("#mapSvg .state-label[data-state='AZ'] .state-count-inline"), "the per-state count moves with it").toHaveText("1");
  const untouched = boxes.stateLabels.find(label => label.state === "MT");
  expect(untouched.moved, "a state without pins keeps its label position").toBeFalsy();
  const massachusetts = boxes.stateLabels.find(label => label.state === "MA");
  expect(massachusetts.moved, "a callout no pin covers stays where it was").toBeFalsy();
  // The Boston pin's box reaches the New Hampshire callout plate: the callout shifts beside it and keeps its leader.
  const newHampshire = boxes.stateLabels.find(label => label.state === "NH");
  expect(newHampshire, "New Hampshire keeps its callout").toBeTruthy();
  expect(newHampshire.moved, "the New Hampshire callout moved clear of the Boston pin").toBeTruthy();
  expect(Math.hypot(newHampshire.centerX - 930, newHampshire.centerY - 128), "it stays beside its original position").toBeLessThanOrEqual(64);
  expect(newHampshire.centerInsideState, "it is still a callout outside New Hampshire").toBeFalsy();
  expect(boxes.calloutLeaders, "all nine callouts keep their leader").toBe(9);
  const stackedLabels = [];
  for (let i = 0; i < boxes.stateLabels.length; i += 1) {
    for (let j = i + 1; j < boxes.stateLabels.length; j += 1) {
      if (overlaps(boxes.stateLabels[i], boxes.stateLabels[j], -0.5)) stackedLabels.push(`${boxes.stateLabels[i].state}/${boxes.stateLabels[j].state}`);
    }
  }
  expect(stackedLabels, "no two state labels overlap").toEqual([]);
  expect(boxes.placeLabels.filter(label => boxes.pins.some(pin => overlaps(label, pin))).map(label => label.text), "no place label overlaps a pin").toEqual([]);
  expect(boxes.placeLabels.filter(label => boxes.stateLabels.some(state => overlaps(label, state))).map(label => label.text), "no place label overlaps a state label").toEqual([]);

  // Cover Indiana with pins: there is no free spot left, so the abbreviation hides and the app says so.
  const shape = await page.evaluate(() => {
    const b = document.querySelector("#mapSvg .state-hit[data-state='IN'] .state-shape").getBBox();
    return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
  });
  const cover = [];
  for (let x = shape.left - 8; x <= shape.right + 8; x += 16) {
    for (let y = shape.top; y <= shape.bottom + 30; y += 18) cover.push(freePin(`in-${cover.length}`, `Indiana point ${cover.length}`, "IN", Number(x.toFixed(1)), Number(y.toFixed(1))));
  }
  await seed(page, cover);
  boxes = await readMapBoxes(page);
  expect(boxes.pins.length).toBe(cover.length);
  expect(boxes.stateLabels.find(label => label.state === "IN"), "the Indiana abbreviation hides").toBeUndefined();
  expect(labelsOverPins(boxes), "no state label overlaps a pin").toEqual([]);
  await expect(page.locator("#layoutWarning")).toContainText(/state label/i);
});

test("the key fits inside the canvas on all three shapes and reports what it cannot list", async ({ page }) => {
  const pick = (state, count) => places.filter(place => place[0] === state && place[3] === "25").filter((_, index, list) => index % Math.max(1, Math.floor(list.length / count)) === 0).slice(0, count);
  const few = [
    cityPin("h1", "Huntsville headquarters", "AL", "0137000", "headquarters"),
    cityPin("h2", "Huntsville operations", "AL", "0137000", "operations"),
    cityPin("h3", "Huntsville contract", "AL", "0137000", "contract"),
    cityPin("a1", "Arlington headquarters", "VA", "5103000", "headquarters"),
    cityPin("a2", "Alexandria program", "VA", "5101000", "program"),
    cityPin("a3", "Washington customer", "DC", "1150000", "customer"),
    cityPin("a4", "Washington partner", "DC", "1150000", "partner"),
    cityPin("p1", "Phoenix site", "AZ", "0455000", "hub"),
    cityPin("p2", "Phoenix future", "AZ", "0455000", "future"),
    cityPin("s1", "Seattle test", "WA", "5363000", "test"),
    cityPin("s2", "Seattle manufacturing", "WA", "5363000", "manufacturing"),
    cityPin("x1", "Dayton site", "OH", "3921000", "hub"),
  ];
  const many = [];
  for (const state of ["TX", "CA", "MT", "KS", "NE", "MN", "GA", "NY", "OR", "CO"]) {
    for (const place of pick(state, 8)) {
      many.push(cityPin(`m${many.length}`, `${place[2]} one`, state, place[1], "hub"));
      many.push(cityPin(`m${many.length}`, `${place[2]} two`, state, place[1], "contract"));
    }
  }

  for (const [name, pins] of [["few", few], ["many", many]]) {
    await seed(page, pins);
    for (const aspect of ["wide", "slide", "square"]) {
      await (await revealControl(page, "#aspect")).selectOption(aspect);
      const canvas = await readCanvas(page);
      const context = `${name} groups on ${aspect}`;
      expect(canvas.key, `${context}: the key is drawn`).not.toBeNull();
      expect(canvas.key.left, `${context}: key left edge`).toBeGreaterThanOrEqual(0);
      expect(canvas.key.right, `${context}: key right edge`).toBeLessThanOrEqual(canvas.width);
      expect(canvas.key.bottom, `${context}: key bottom edge`).toBeLessThanOrEqual(canvas.height);
      expect(canvas.key.top, `${context}: the key starts below the map`).toBeGreaterThanOrEqual(canvas.mapBottom - 0.5);
      expect(canvas.legend, `${context}: the legend is drawn`).not.toBeNull();
      expect(canvas.key.bottom, `${context}: the key ends above the legend`).toBeLessThanOrEqual(canvas.legend.top + 0.5);
      expect(canvas.legend.bottom, `${context}: legend bottom edge`).toBeLessThanOrEqual(canvas.height);
      expect(canvas.mapLeft, `${context}: the map stays inside the canvas`).toBeGreaterThanOrEqual(0);
      expect(canvas.mapRight).toBeLessThanOrEqual(canvas.width);
      expect(canvas.mapScale, `${context}: the map keeps a usable size`).toBeGreaterThanOrEqual(0.7);
      const stacked = [];
      for (let i = 0; i < canvas.keyEntries.length; i += 1) {
        for (let j = i + 1; j < canvas.keyEntries.length; j += 1) {
          if (overlaps(canvas.keyEntries[i], canvas.keyEntries[j], -0.5)) stacked.push(`${i + 1}/${j + 1}`);
        }
      }
      expect(stacked, `${context}: no two key entries overlap`).toEqual([]);
      const groupPins = await page.locator("#mapSvg .site-marker .map-pin-number").count();
      expect(canvas.keyTotal, `${context}: the key counts every group pin`).toBe(groupPins);
      if (name === "few") {
        expect(canvas.keyEntries.map(entry => entry.number)).toEqual(["1", "2", "3", "4"]);
        expect(canvas.keyMore).toBeNull();
        expect(canvas.warning).not.toMatch(/key/i);
        expect(canvas.keyEntries[3].text).toBe("Alexandria, VA · Arlington, VA · Washington, DC: Headquarters, Program office, Customer site, Partner site");
      } else {
        const hidden = canvas.keyTotal - canvas.keyEntries.length;
        expect(hidden, `${context}: not every entry fits`).toBeGreaterThan(0);
        expect(canvas.keyEntries.length, `${context}: as many entries as fit are listed`).toBeGreaterThanOrEqual(8);
        expect(canvas.keyEntries.map(entry => Number(entry.number)), `${context}: entries are listed in number order from 1`).toEqual(canvas.keyEntries.map((_, index) => index + 1));
        expect(canvas.keyMore, `${context}: a final line counts the rest`).toBe(`+ ${hidden} more`);
        expect(canvas.warning, `${context}: the layout warning reports it`).toContain(`${hidden} numbered pin`);
      }
    }
  }
});

test("1,000 imported rows still render with every pin on a point and every name reachable", async ({ page }) => {
  const step = Math.floor(places.length / 1000);
  const types = ["hub", "contract", "headquarters", "operations", "customer"];
  const rows = Array.from({ length: 1000 }, (_, index) => {
    const place = places[index * step];
    return { name: `Row ${index + 1} location`, state: place[0], type: types[index % types.length], geoid: place[1] };
  });
  const csv = ["name,state,type,source,city,city_geoid", ...rows.map(row => `${row.name},${row.state},${row.type},city,,${row.geoid}`)].join("\r\n");
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));

  await seed(page, []);
  await page.locator("#locationImportOpen").click();
  await page.locator("#locationImportFile").setInputFiles({ name: "thousand.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await expect(page.locator("#locationImportPreview")).toContainText("1000 valid locations");
  const started = Date.now();
  await page.locator("#locationImportApply").click();
  await expect(locationRows(page)).toHaveCount(1000, { timeout: 20_000 });
  expect(Date.now() - started, "import, layout and render time").toBeLessThan(15_000);

  const markers = await readMarkers(page);
  expect(markers.length, "pins were drawn").toBeGreaterThan(300);
  expect(markers.length, "nearby places merged").toBeLessThanOrEqual(1000);
  // Checked in plain loops with one assertion per rule: a thousand pins make hundreds of thousands of comparisons.
  const expectedPoints = new Map(rows.map(row => [`place:${row.geoid}`, point(row.geoid)]));
  const offPoint = [];
  let lone = 0;
  for (const marker of markers) {
    const ids = marker.anchorId.split(" ");
    const members = ids.map(id => expectedPoints.get(id));
    if (!members.every(Boolean)) { offPoint.push(`${marker.anchorId} holds a place that was not imported`); continue; }
    const centroid = { x: members.reduce((sum, p) => sum + p.x, 0) / members.length, y: members.reduce((sum, p) => sum + p.y, 0) / members.length };
    if (Math.hypot(marker.x - centroid.x, marker.y - centroid.y) > 0.1) offPoint.push(`${marker.anchorId} tip is off its point`);
    if (ids.length === 1) lone += 1;
  }
  expect(offPoint, "every pin sits on its place or on the centroid of its places").toEqual([]);
  expect(lone, "most places stand alone on their exact catalog point").toBeGreaterThan(200);
  expect(new Set(markers.flatMap(marker => marker.anchorId.split(" "))).size, "every imported place is on the map once").toBe(new Set(rows.map(row => row.geoid)).size);
  const tooClose = [];
  for (let i = 0; i < markers.length; i += 1) {
    for (let j = i + 1; j < markers.length; j += 1) {
      if (Math.hypot(markers[i].x - markers[j].x, markers[i].y - markers[j].y) < MERGE_DISTANCE - 0.01) tooClose.push(`${markers[i].anchorId} / ${markers[j].anchorId}`);
    }
  }
  expect(tooClose, "no two pins are closer than the merge distance").toEqual([]);
  const reachable = markers.map(marker => `${marker.ariaLabel}\n${marker.title}`).join("\n");
  expect(rows.filter(row => !reachable.includes(row.name)).map(row => row.name), "every location name is reachable from a marker").toEqual([]);

  const boxes = await readMapBoxes(page);
  expect(boxes.leaders).toBe(0);
  const coveredLabels = boxes.stateLabels.filter(label => boxes.pins.some(pin => overlaps(label, pin))).map(label => label.state);
  expect(coveredLabels, "no state label overlaps a pin").toEqual([]);
  const canvas = await readCanvas(page);
  expect(canvas.key.bottom).toBeLessThanOrEqual(canvas.height);
  expect(canvas.keyMore).toMatch(/^\+ \d+ more$/);
  expect(canvas.warning).toMatch(/numbered pin/);
  expect(errors, "no script errors").toEqual([]);
});

// The 40 largest cities plus four in Alaska and Hawaii: enough pins that some labels cannot sit beside their own.
const BUSY_MAP = [
  ["New York", "NY", "3651000"], ["Los Angeles", "CA", "0644000"], ["Chicago", "IL", "1714000"], ["Houston", "TX", "4835000"],
  ["Philadelphia", "PA", "4260000"], ["Phoenix", "AZ", "0455000"], ["San Antonio", "TX", "4865000"], ["San Diego", "CA", "0666000"],
  ["Dallas", "TX", "4819000"], ["San Jose", "CA", "0668000"], ["Austin", "TX", "4805000"], ["Jacksonville", "FL", "1235000"],
  ["San Francisco", "CA", "0667000"], ["Columbus", "OH", "3918000"], ["Charlotte", "NC", "3712000"], ["Fort Worth", "TX", "4827000"],
  ["Detroit", "MI", "2622000"], ["El Paso", "TX", "4824000"], ["Memphis", "TN", "4748000"], ["Seattle", "WA", "5363000"],
  ["Denver", "CO", "0820000"], ["Washington", "DC", "1150000"], ["Boston", "MA", "2507000"], ["Baltimore", "MD", "2404000"],
  ["Oklahoma City", "OK", "4055000"], ["Louisville", "KY", "2148000"], ["Portland", "OR", "4159000"], ["Las Vegas", "NV", "3240000"],
  ["Milwaukee", "WI", "5553000"], ["Albuquerque", "NM", "3502000"], ["Tucson", "AZ", "0477000"], ["Fresno", "CA", "0627000"],
  ["Sacramento", "CA", "0664000"], ["Long Beach", "CA", "0643000"], ["Kansas City", "MO", "2938000"], ["Mesa", "AZ", "0446000"],
  ["Virginia Beach", "VA", "5182000"], ["Atlanta", "GA", "1304000"], ["Colorado Springs", "CO", "0816000"], ["Omaha", "NE", "3137000"],
  ["Anchorage", "AK", "0203000"], ["Juneau", "AK", "0236400"], ["Honolulu", "HI", "1571550"], ["Hilo", "HI", "1514650"],
];
const LABEL_REACH = 84; // REMOTE_LABEL_REACH in the app: about 250 miles.

test("a place label stays with its own pin: beside it, on a short leader, or hidden and reported", async ({ page }) => {
  await seed(page, BUSY_MAP.map(([name, state, geoid], index) => cityPin(`busy${index}`, `${name} office`, state, geoid)));
  expect(await page.locator("#showCityLabels").isChecked(), "place labels are on by default").toBeTruthy();

  const layout = await page.evaluate(() => {
    const map = document.querySelector("#mapSvg g[aria-label='Geographic map of the United States']");
    const inverse = map.getScreenCTM().inverse();
    const toMap = element => {
      const rect = element.getBoundingClientRect();
      const a = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
      const b = new DOMPoint(rect.right, rect.bottom).matrixTransform(inverse);
      return { left: a.x, top: a.y, right: b.x, bottom: b.y };
    };
    const groups = [...map.querySelectorAll(".place-group")].map(group => {
      const label = group.querySelector(".place-label-group");
      return { id: group.getAttribute("data-anchor-id"), pin: toMap(group.querySelector(".map-pin-body")), label: label ? toMap(label.querySelector("rect")) : null };
    });
    const leaders = [...map.querySelectorAll(".place-label-leader")].map(path => {
      const [, x1, y1, x2, y2] = path.getAttribute("d").match(/^M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)$/).map(Number);
      return { x1, y1, x2, y2 };
    });
    const statePlates = [...map.querySelectorAll(".state-label rect")].map(toMap);
    return { groups, leaders, statePlates, warning: document.querySelector("#layoutWarning").textContent };
  });

  const center = box => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
  const gap = (a, b) => Math.max(0, Math.max(a.left - b.right, b.left - a.right), Math.max(a.top - b.bottom, b.top - a.bottom));
  const shown = layout.groups.filter(group => group.label);
  const hidden = layout.groups.length - shown.length;
  expect(shown.length, "most labels are placed").toBeGreaterThanOrEqual(Math.ceil(layout.groups.length * 0.8));

  // Every leader starts at a pin, ends in that pin's label, and is short.
  const led = new Set();
  for (const leader of layout.leaders) {
    const owner = layout.groups.reduce((best, group) => {
      const c = center(group.pin);
      const distance = Math.hypot(c.x - leader.x1, c.y - leader.y1);
      return distance < best.distance ? { group, distance } : best;
    }, { group: null, distance: Infinity });
    expect(owner.distance, "the leader starts on a pin").toBeLessThan(6);
    expect(owner.group.label, `${owner.group.id} has the label its leader points to`).toBeTruthy();
    const end = center(owner.group.label);
    expect(Math.hypot(end.x - leader.x2, end.y - leader.y2), `${owner.group.id}: the leader ends in its own label`).toBeLessThan(2);
    const reach = Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1);
    expect(reach, `${owner.group.id}: leader length`).toBeLessThanOrEqual(LABEL_REACH + 0.5);
    for (const other of layout.groups) {
      if (other === owner.group) continue;
      const c = center(other.pin);
      expect(Math.hypot(c.x - leader.x2, c.y - leader.y2), `${owner.group.id}: its label is nearer its own pin than ${other.id}`).toBeGreaterThan(reach - 3);
    }
    led.add(owner.group.id);
  }
  expect(led.size, "one leader per fallback label").toBe(layout.leaders.length);

  // A label without a leader touches its own pin; no label covers a pin or a state abbreviation.
  for (const group of shown) {
    if (!led.has(group.id)) expect(gap(group.label, group.pin), `${group.id}: label sits beside its pin`).toBeLessThan(14);
    for (const other of layout.groups) {
      expect(overlaps(group.label, other.pin), `${group.id}: label is clear of the pin for ${other.id}`).toBeFalsy();
      if (other !== group && other.label) expect(overlaps(group.label, other.label), `${group.id} and ${other.id}: labels do not overlap`).toBeFalsy();
    }
    for (const plate of layout.statePlates) expect(overlaps(group.label, plate), `${group.id}: label is clear of state abbreviations`).toBeFalsy();
  }

  // What could not be placed is counted in the editor, not dropped silently.
  if (layout.leaders.length) expect(layout.warning).toMatch(new RegExp(`\\b${layout.leaders.length} place labels? uses? a fallback position`));
  else expect(layout.warning).not.toMatch(/fallback position/);
  if (hidden) expect(layout.warning).toMatch(new RegExp(`\\b${hidden} place labels? (?:is|are) hidden at this canvas size`));
  else expect(layout.warning).not.toMatch(/place labels? (?:is|are) hidden/);
});
