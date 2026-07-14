import { test, expect } from "@playwright/test";
import { gotoFresh, zoomControls } from "./helpers.mjs";

for (const width of [320, 400, 802, 900]) {
  test(`GeoPresence fits a ${width}px viewport without clipped controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await gotoFresh(page);

    const geometry = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const controls = [...document.querySelectorAll("main input, main select, main button")]
        .filter(visible)
        .map(element => {
          const rect = element.getBoundingClientRect();
          return { id: element.id, left: rect.left, right: rect.right, width: rect.width };
        });
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        controls,
      };
    });

    expect(geometry.documentWidth, "the page must not scroll horizontally").toBeLessThanOrEqual(width + 1);
    for (const control of geometry.controls) {
      expect(control.left, `${control.id || "control"} begins inside the viewport`).toBeGreaterThanOrEqual(-1);
      expect(control.right, `${control.id || "control"} ends inside the viewport`).toBeLessThanOrEqual(width + 1);
    }

    await expect(page.locator("#mapSvg")).toBeVisible();
    await expect(zoomControls(page)).toHaveCount(4);
  });
}

for (const width of [320, 900]) {
  test(`required labels and location controls stay uniformly aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await gotoFresh(page);

    const assertRequiredMarkers = async ids => {
      const requiredGeometry = await page.evaluate(fieldIds => fieldIds.map(id => {
        const label = document.querySelector(`label[for="${id}"]`);
        const marker = label.querySelector(".required");
        const labelRect = label.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        const style = getComputedStyle(label);
        return {
          id,
          display: style.display,
          direction: style.flexDirection,
          labelCenter: labelRect.top + labelRect.height / 2,
          markerCenter: markerRect.top + markerRect.height / 2,
          markerWidth: markerRect.width,
        };
      }), ids);
      for (const item of requiredGeometry) {
        expect(["flex", "inline-flex"], `${item.id} label uses one flex row`).toContain(item.display);
        expect(item.direction, `${item.id} label is not a column`).toBe("row");
        expect(Math.abs(item.labelCenter - item.markerCenter), `${item.id} asterisk stays on its label line`).toBeLessThanOrEqual(2);
        expect(item.markerWidth, `${item.id} asterisk does not stretch across the field`).toBeLessThan(20);
      }
    };
    await assertRequiredMarkers(["pinName", "pinCity"]);

    if (width > 500) {
      const assertPairedControls = async (firstId, secondId) => {
        const [first, second] = await Promise.all([
          page.locator(`#${firstId}`).boundingBox(),
          page.locator(`#${secondId}`).boundingBox(),
        ]);
        expect(Math.abs(first.y - second.y), `${firstId} and ${secondId} share a top edge`).toBeLessThanOrEqual(1);
        expect(Math.abs(first.height - second.height), `${firstId} and ${secondId} share a height`).toBeLessThanOrEqual(1);
      };
      await assertPairedControls("pinState", "pinCity");
      await page.locator("#pinAnchorKind").selectOption("installation");
      await assertRequiredMarkers(["pinInstallation"]);
      await assertPairedControls("pinState", "pinInstallation");
    } else {
      const formBounds = await page.locator("#pinForm").boundingBox();
      for (const id of ["pinName", "pinAnchorKind", "pinState", "pinCity", "pinType"]) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(box.x, `${id} stays inside the form`).toBeGreaterThanOrEqual(formBounds.x - 1);
        expect(box.x + box.width, `${id} stays inside the form`).toBeLessThanOrEqual(formBounds.x + formBounds.width + 1);
      }
      await page.locator("#pinAnchorKind").selectOption("installation");
      await assertRequiredMarkers(["pinInstallation"]);
    }
  });
}

test("keyboard users do not have to tab through every state", async ({ page }) => {
  await gotoFresh(page);

  const mapTabStops = page.locator("#mapSvg [tabindex='0'], #mapSvg [role='button']");
  expect(await mapTabStops.count()).toBeLessThanOrEqual(1);

  await page.locator("#mapTitle").focus();
  await expect(page.locator("#mapTitle")).toBeFocused();
  const focusIndicator = await page.locator("#mapTitle").evaluate(element => {
    const style = getComputedStyle(element);
    return {
      outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
      shadow: style.boxShadow !== "none",
    };
  });
  expect(focusIndicator.outline || focusIndicator.shadow).toBeTruthy();
});

test("preview controls zoom, fit, and open the full-screen map", async ({ page }) => {
  await gotoFresh(page);
  const frame = page.locator(".map-frame");
  const initialWidth = (await frame.boundingBox()).width;

  await page.locator("#previewZoomIn").click();
  expect((await frame.boundingBox()).width).toBeGreaterThan(initialWidth * 1.2);
  expect(await frame.evaluate(element => element.style.width)).toBe("125%");

  await page.locator("#previewZoomOut").click();
  expect(await frame.evaluate(element => element.style.width)).toBe("100%");
  await page.locator("#previewZoomIn").click();
  await page.locator("#previewFit").click();
  expect(await frame.evaluate(element => element.style.width)).toBe("100%");

  await page.locator("#previewFullscreen").click();
  await expect(page.locator("#previewDialog[open]")).toBeVisible();
  await expect(page.locator("#fullscreenMap svg")).toBeVisible();
  await page.locator("#previewClose").click();
  await expect(page.locator("#previewDialog")).not.toBeVisible();
});
