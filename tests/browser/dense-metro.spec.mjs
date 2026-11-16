import { test, expect } from "@playwright/test";
import { addCity, clearLocations, gotoFresh } from "./helpers.mjs";

// Pins never move off their points. Places closer than seven map units (about 21 miles) cannot be told apart at
// map scale, so they share one numbered pin on their centroid and the key names them.
const readMap = page => page.evaluate(async () => {
  const places = await (await fetch("./data/places-2025.json")).json();
  const pointById = new Map(places.map(place => [`place:${place[1]}`, { x: place[4], y: place[5] }]));
  const read = element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const svg = document.querySelector("#mapSvg");
  return {
    markers: [...svg.querySelectorAll(".location-layer .site-marker")].map(marker => {
      const group = marker.closest(".place-group");
      const tip = marker.querySelector(".map-pin-body").getPointAtLength(0);
      const ids = group.getAttribute("data-anchor-id").split(" ");
      return {
        ids,
        points: ids.map(id => pointById.get(id)),
        tip: { x: tip.x, y: tip.y },
        ariaLabel: marker.getAttribute("aria-label") || "",
        title: marker.querySelector("title")?.textContent || "",
        number: marker.querySelector(".map-pin-number")?.textContent ?? null,
        countBadges: marker.querySelectorAll(".marker-count").length,
        box: read(marker),
        label: group.querySelector(".place-label-group") ? read(group.querySelector(".place-label-group")) : null,
        labelText: group.querySelector(".place-label-group") ? [...group.querySelectorAll(".place-label-group tspan")].map(line => line.textContent).join(" ") : null,
      };
    }),
    leaders: svg.querySelectorAll(".marker-leader, .marker-fan-stem").length,
    keyEntries: [...svg.querySelectorAll(".group-key .group-key-item")].map(item => item.querySelector(".group-key-text").textContent.replace(/\s+/g, " ").trim()),
    legend: [...svg.querySelectorAll("g[aria-label='Legend'] > g")].map(item => item.getAttribute("aria-label")),
  };
});

const overlaps = (left, right, padding = 1) =>
  left.left < right.right + padding && left.right + padding > right.left && left.top < right.bottom + padding && left.bottom + padding > right.top;

test("nearby Northern Virginia locations share one numbered pin on their centroid, explained by the key", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFresh(page);
  await clearLocations(page);

  const locations = [
    { name: "Arlington office", state: "VA", city: "Arlington", type: "headquarters" },
    { name: "Alexandria office", state: "VA", city: "Alexandria", type: "regional" },
    { name: "Falls Church office", state: "VA", city: "Falls Church", type: "contract" },
  ];
  for (const location of locations) await addCity(page, location);

  const map = await readMap(page);
  expect(map.markers, "three places within 21 miles share one pin").toHaveLength(1);
  const [pin] = map.markers;
  expect(pin.ids).toHaveLength(3);
  expect(pin.points.every(Boolean), "the pin holds three catalog places").toBeTruthy();
  for (const member of pin.points) {
    expect(Math.hypot(member.x - pin.points[0].x, member.y - pin.points[0].y), "the members are closer than the merge distance").toBeLessThan(7);
  }
  const centroid = { x: pin.points.reduce((sum, p) => sum + p.x, 0) / 3, y: pin.points.reduce((sum, p) => sum + p.y, 0) / 3 };
  expect(Math.abs(pin.tip.x - centroid.x), "the pin's tip is on the centroid of its places (x)").toBeLessThanOrEqual(0.1);
  expect(Math.abs(pin.tip.y - centroid.y), "the pin's tip is on the centroid of its places (y)").toBeLessThanOrEqual(0.1);
  for (const member of pin.points) {
    expect(Math.hypot(member.x - pin.tip.x, member.y - pin.tip.y), "every member place is within a few miles of the tip").toBeLessThan(7);
  }

  expect(pin.number, "the group pin carries key number 1").toBe("1");
  expect(pin.countBadges, "a group pin has no count badge").toBe(0);
  expect(map.leaders, "nothing links the pin to another position").toBe(0);
  for (const location of locations) {
    expect(pin.ariaLabel, `${location.name} is reachable in the pin's accessible name`).toContain(location.name);
    expect(pin.title, `${location.name} is reachable in the pin's title`).toContain(location.name);
  }
  expect(map.keyEntries).toEqual(["Alexandria, VA · Arlington, VA · Falls Church, VA: Headquarters, Regional headquarters, Contract site"]);
  expect(new Set(map.legend), "the legend still lists every type inside the group").toEqual(new Set(["Headquarters", "Regional headquarters", "Contract site"]));

  expect(pin.label, "the merged pin has a visible place label").not.toBeNull();
  expect(pin.label.width).toBeGreaterThan(0);
  expect(pin.labelText).toMatch(/^(?:Alexandria|Arlington|Falls Church) \+2$/);
  expect(overlaps(pin.label, pin.box, 0), "the place label does not cover the pin").toBeFalsy();
});

test("nearby cities that can be told apart keep separate pins on their own points with separate labels", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFresh(page);
  await clearLocations(page);

  const locations = [
    { name: "Arlington office", state: "VA", city: "Arlington", type: "headquarters" },
    { name: "Baltimore office", state: "MD", city: "Baltimore", type: "regional" },
    { name: "Richmond office", state: "VA", city: "Richmond", type: "contract" },
  ];
  for (const location of locations) await addCity(page, location);

  const map = await readMap(page);
  expect(map.markers, "each city keeps its own pin").toHaveLength(3);
  expect(map.leaders, "no pin is linked to another position").toBe(0);
  expect(map.keyEntries, "single-type pins need no key").toEqual([]);
  for (const location of locations) {
    const pin = map.markers.find(marker => marker.ariaLabel.startsWith(`${location.city},`));
    expect(pin, `${location.city} has a visible marker`).toBeTruthy();
    expect(pin.ids).toHaveLength(1);
    expect(Math.hypot(pin.tip.x - pin.points[0].x, pin.tip.y - pin.points[0].y), `${location.city} tip is on its catalog point`).toBeLessThanOrEqual(0.1);
    expect(pin.number).toBeNull();
    expect(pin.ariaLabel).toContain(location.name);
    expect(pin.label, `${location.city} has a visible place label`).not.toBeNull();
    expect(pin.label.width).toBeGreaterThan(0);
    expect(pin.labelText).toBe(location.city);
  }
  for (let index = 0; index < map.markers.length; index += 1) {
    for (let other = 0; other < map.markers.length; other += 1) {
      if (other > index) {
        expect(Math.hypot(map.markers[index].tip.x - map.markers[other].tip.x, map.markers[index].tip.y - map.markers[other].tip.y), "separate pins are at least the merge distance apart").toBeGreaterThanOrEqual(7);
        expect(overlaps(map.markers[index].label, map.markers[other].label), "place labels overlap").toBeFalsy();
      }
      expect(overlaps(map.markers[index].label, map.markers[other].box, 0), "a place label covers a pin").toBeFalsy();
    }
  }
});
