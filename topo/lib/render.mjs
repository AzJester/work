// Shared rendering plumbing for Topo Map Builder: the terrain and contour source, run-time map
// symbols, and an off-screen map that exports use to draw pages and device tiles.

import { DEM_MAX_ZOOM, DEM_TILES, drawIcon } from "./style.mjs?v=1.0.0";

const RENDER_TIMEOUT_MS = 120_000;

/**
 * Register the contour plugin with MapLibre once and return the pieces a style needs:
 * the shared terrain tile URL and a function that builds contour tile URLs.
 */
export function createTerrain(maplibregl, mlcontour) {
  const source = new mlcontour.DemSource({
    url: DEM_TILES,
    encoding: "terrarium",
    maxzoom: DEM_MAX_ZOOM,
    worker: true,
    cacheSize: 240,
    timeoutMs: 20_000,
  });
  source.setupMaplibre(maplibregl);
  return {
    demTiles: source.sharedDemProtocolUrl,
    contourTiles: (thresholds, multiplier) => source.contourProtocolUrl({
      multiplier,
      thresholds,
      elevationKey: "ele",
      levelKey: "level",
      contourLayer: "contours",
      overzoom: 1,
    }),
  };
}

/** Supply the style's small symbols on demand, in the map's own pixel ratio and palette. */
export function provideIcons(map, getPalette) {
  map.setMissingStyleImageResolver(id => {
    if (map.hasImage(id)) return;
    const ratio = Math.max(2, Math.ceil(map.getPixelRatio()));
    const icon = drawIcon(id, getPalette(), ratio, (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    });
    if (icon) map.addImage(id, icon, { pixelRatio: ratio });
  });
}

export class RenderCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "RenderCancelled";
  }
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new RenderCancelled();
}

/**
 * A hidden map used to draw exports. `render` moves it, waits until every tile is in and drawn,
 * and hands back the WebGL canvas, which stays valid until the next call.
 */
export class OffscreenMap {
  constructor(maplibregl, { style, pixelRatio = 1, palette = "colour" }) {
    this.container = document.createElement("div");
    this.container.className = "offscreen-map";
    this.container.setAttribute("aria-hidden", "true");
    this.container.style.cssText = "position:fixed;left:0;top:0;width:512px;height:512px;opacity:0;pointer-events:none;z-index:-1;contain:strict";
    document.body.append(this.container);
    this.failures = 0;
    this.map = new maplibregl.Map({
      container: this.container,
      style,
      center: [0, 0],
      zoom: 1,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio,
      maxCanvasSize: [8192, 8192],
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      renderWorldCopies: true,
      trackResize: false,
      validateStyle: false,
    });
    provideIcons(this.map, () => palette);
    this.map.on("error", () => { this.failures += 1; });
    this.ready = new Promise((resolve, reject) => {
      this.map.once("load", resolve);
      setTimeout(() => reject(new Error("The map style did not load. Check the network connection.")), RENDER_TIMEOUT_MS);
    });
  }

  /** Draw a view: { centre: [lon, lat], zoom, bearing, width, height } in CSS pixels. */
  async render(view, signal) {
    await this.ready;
    throwIfCancelled(signal);
    const width = Math.ceil(view.width), height = Math.ceil(view.height);
    if (this.container.style.width !== `${width}px` || this.container.style.height !== `${height}px`) {
      this.container.style.width = `${width}px`;
      this.container.style.height = `${height}px`;
      this.map.resize();
    }
    if (view.beforeRender) view.beforeRender(this.map);
    this.map.jumpTo({ center: view.centre, zoom: view.zoom, bearing: view.bearing || 0, pitch: 0 });
    await this.idle(signal);
    return this.map.getCanvas();
  }

  idle(signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (action, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.map.off("idle", onIdle);
        signal?.removeEventListener("abort", onAbort);
        action(value);
      };
      const onIdle = () => finish(resolve);
      const onAbort = () => finish(reject, new RenderCancelled());
      const timer = setTimeout(() => finish(reject, new Error("The map took too long to load. Check the network connection and try again.")), RENDER_TIMEOUT_MS);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.map.once("idle", onIdle);
      this.map.triggerRepaint();
    });
  }

  destroy() {
    this.map.remove();
    this.container.remove();
  }
}

/** Encode a 2D canvas as JPEG bytes. */
export function canvasToJpeg(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) {
        reject(new Error("The browser could not encode the map image."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", quality);
  });
}

export function make2dCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}
