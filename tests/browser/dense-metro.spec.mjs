import { test, expect } from "@playwright/test";
import { addCity, clearLocations, gotoFresh } from "./helpers.mjs";

test("nearby Northern Virginia locations retain distinct markers and labels", async ({ page }) => {
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

  const geometry = await page.evaluate(cities => {
    const read = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return cities.map(city => {
      const marker = [...document.querySelectorAll("#mapSvg .site-marker")].find(element =>
        (element.getAttribute("aria-label") || "").startsWith(`${city},`),
      );
      const group = marker?.closest(".place-group");
      return {
        city,
        marker: marker ? read(marker) : null,
        label: group?.querySelector(".place-label-group") ? read(group.querySelector(".place-label-group")) : null,
      };
    });
  }, locations.map(location => location.city));
  for (const item of geometry) {
    expect(item.marker, `${item.city} has a visible marker`).not.toBeNull();
    expect(item.label, `${item.city} has a visible place label`).not.toBeNull();
    expect(item.marker.width).toBeGreaterThan(0);
    expect(item.label.width).toBeGreaterThan(0);
  }

  const overlaps = (left, right, padding = 1) =>
    left.left < right.right + padding && left.right + padding > right.left && left.top < right.bottom + padding && left.bottom + padding > right.top;
  const circleGap = (left, right) => {
    const leftCenter = { x: (left.left + left.right) / 2, y: (left.top + left.bottom) / 2 };
    const rightCenter = { x: (right.left + right.right) / 2, y: (right.top + right.bottom) / 2 };
    return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y) - (left.width + right.width) / 4;
  };
  for (let index = 0; index < geometry.length; index += 1) {
    for (let other = index + 1; other < geometry.length; other += 1) {
      expect(circleGap(geometry[index].marker, geometry[other].marker), `${geometry[index].city} and ${geometry[other].city} marker gap`).toBeGreaterThanOrEqual(1);
      expect(overlaps(geometry[index].label, geometry[other].label), `${geometry[index].city} and ${geometry[other].city} labels overlap`).toBeFalsy();
    }
  }
});
