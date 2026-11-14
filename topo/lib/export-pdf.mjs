// PDF export for Topo Map Builder. Each picked page is drawn to scale on US Letter: the map as a
// raster inside the frame, then the grid, grid numbers and the information collar as vectors.

import { formatAngleEW, formatLatLon, latBand, mgrsFromUtm } from "./geo.mjs?v=1.0.0";
import { SCALES, frameSizeMm, pageName, paperSizeMm, printView } from "./pages.mjs?v=1.0.0";
import { OffscreenMap, canvasToJpeg, make2dCanvas, throwIfCancelled } from "./render.mjs?v=1.0.0";
import { PALETTES, buildStyle, normaliseOptions, printContourInterval } from "./style.mjs?v=1.0.0";
import { declination, decimalYear } from "./wmm.mjs?v=1.0.0";

/** Print layout resolution: the map is laid out at 192 dpi and drawn twice as large as on screen. */
export const LAYOUT_PX_PER_MM = 7.56;
export const STYLE_SCALE = 2;
/** Raster resolution placed in the PDF: 10 pixels per millimetre (254 dpi). */
export const OUTPUT_PX_PER_MM = 10;
export const MAX_PDF_PAGES = 24;

const COLLAR_GAP = 1.5;
const CREDIT_LINE = "Map data © OpenStreetMap contributors  ·  Tiles: OpenFreeMap, OpenMapTiles  ·  Elevation: Mapzen terrain tiles "
  + "(USGS 3DEP, SRTM, GMTED and others)  ·  Magnetic model: WMM2025";

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Frame origin on the sheet. Portrait keeps the collar below the map, landscape beside it. */
export function frameOrigin(orient) {
  const paper = paperSizeMm(orient), frame = frameSizeMm(orient);
  return orient === "l" ? { x: 8, y: (paper.h - frame.h) / 2 } : { x: (paper.w - frame.w) / 2, y: 9 };
}

/** Scale-bar plan: the longest whole bar that fits `maxMm`. */
export function scaleBar(scale, unitMetres, candidates, maxMm) {
  const mmPerUnit = (unitMetres * 1000) / scale;
  const total = candidates.find(candidate => candidate * mmPerUnit <= maxMm) ?? candidates[candidates.length - 1];
  return { total, mmPerUnit, lengthMm: total * mmPerUnit };
}

/** Angles for the north diagram and the conversion note. All east-positive, in degrees. */
export function northReference(lat, lon, convergence, year = decimalYear()) {
  const magnetic = declination(lat, lon, year);
  return {
    year,
    convergence,                // grid north relative to true north
    declination: magnetic,      // magnetic north relative to true north
    gridMagnetic: magnetic - convergence,   // magnetic north relative to grid north
  };
}

function signedDegrees(value) {
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? "+" : "-"} ${rounded}°`;
}

/**
 * Render the picked pages to a PDF and return it as a Blob.
 *
 * `deps` carries the libraries (maplibregl, jsPDF) and the terrain context from createTerrain.
 * `job` describes the work: pages, scale, orient, options, legend, onProgress(done, total, label), signal.
 */
export async function exportPdf(deps, job) {
  const { maplibregl, jsPDF, terrain } = deps;
  const { pages, scale, orient, signal } = job;
  const options = normaliseOptions(job.options);
  const palette = PALETTES[options.palette];
  const scaleInfo = SCALES.find(entry => entry.value === scale);
  const contourInterval = options.contours === "off" ? null : printContourInterval(scaleInfo, options.units, options.contours);
  const frame = frameSizeMm(orient);
  const origin = frameOrigin(orient);
  const total = pages.length + (job.legend ? 1 : 0);
  const progress = (done, label) => job.onProgress?.(done, total, label);

  // The grid is drawn as vectors on top of the raster, so it is switched off in the raster itself.
  const rasterOptions = { ...options, toggles: { ...options.toggles, grid: false, gridNumbers: false } };
  const style = buildStyle(rasterOptions, {
    demTiles: terrain.demTiles,
    contourTiles: terrain.contourTiles,
    scale: STYLE_SCALE,
    contourInterval,
  });
  const offscreen = new OffscreenMap(maplibregl, {
    style,
    pixelRatio: OUTPUT_PX_PER_MM / LAYOUT_PX_PER_MM,
    palette: options.palette,
  });
  const doc = new jsPDF({ orientation: orient === "l" ? "landscape" : "portrait", unit: "mm", format: "letter", compress: true });
  doc.setProperties({
    title: `Topographic map 1:${scale.toLocaleString("en-US")}`,
    subject: "Printable topographic map with MGRS grid",
    creator: "Topo Map Builder",
    keywords: CREDIT_LINE,
  });
  const year = decimalYear();
  let missingTiles = 0;

  try {
    for (let index = 0; index < pages.length; index += 1) {
      throwIfCancelled(signal);
      const page = pages[index];
      progress(index, `Rendering page ${index + 1} of ${pages.length}`);
      const view = printView(page, scale, orient, LAYOUT_PX_PER_MM);
      const container = { width: Math.ceil(view.cssWidth), height: Math.ceil(view.cssHeight) + 2 };
      const failuresBefore = offscreen.failures;
      const mapCanvas = await offscreen.render({
        centre: [view.centre.lon, view.centre.lat], zoom: view.zoom, bearing: view.bearing,
        width: container.width, height: container.height,
      }, signal);
      missingTiles += offscreen.failures - failuresBefore;

      // Crop the exact frame out of the render and squeeze it to the frame's shape.
      const rx = mapCanvas.width / container.width, ry = mapCanvas.height / container.height;
      const { canvas, context } = make2dCanvas(frame.w * OUTPUT_PX_PER_MM, frame.h * OUTPUT_PX_PER_MM);
      context.drawImage(
        mapCanvas,
        ((container.width - view.cssWidth) / 2) * rx, ((container.height - view.cssHeight) / 2) * ry,
        view.cssWidth * rx, view.cssHeight * ry,
        0, 0, canvas.width, canvas.height,
      );
      const jpeg = await canvasToJpeg(canvas, 0.9);
      throwIfCancelled(signal);

      if (index > 0) doc.addPage("letter", orient === "l" ? "landscape" : "portrait");
      doc.addImage(jpeg, "JPEG", origin.x, origin.y, frame.w, frame.h, `map-${index}`, "NONE");
      drawGrid(doc, page, view, origin, frame, palette, options);
      drawCollar(doc, {
        page, view, origin, frame, orient, scale, palette, options, contourInterval, year,
        sheet: index + 1, sheets: pages.length,
      });
    }
    if (job.legend) {
      progress(pages.length, "Adding the legend");
      doc.addPage("letter", "portrait");
      drawLegend(doc, palette, options, scale);
    }
    progress(total, "Finishing the PDF");
    return { blob: doc.output("blob"), missingTiles };
  } finally {
    offscreen.destroy();
  }
}

function drawGrid(doc, page, view, origin, frame, palette, options) {
  const { size } = view;
  const toX = easting => origin.x + ((easting - page.e) / size.w) * frame.w;
  const toY = northing => origin.y + frame.h - ((northing - page.n) / size.h) * frame.h;
  const showLines = options.toggles.grid;
  const showNumbers = options.toggles.grid && options.toggles.gridNumbers;
  const [r, g, b] = hexToRgb(palette.grid);
  const eastings = [], northings = [];
  for (let e = Math.ceil(page.e / 1000) * 1000; e <= page.e + size.w + 1e-6; e += 1000) eastings.push(e);
  for (let n = Math.ceil(page.n / 1000) * 1000; n <= page.n + size.h + 1e-6; n += 1000) northings.push(n);

  if (showLines) {
    doc.setDrawColor(r, g, b);
    for (const e of eastings) {
      doc.setLineWidth(e % 10000 === 0 ? 0.3 : 0.12);
      doc.line(toX(e), origin.y, toX(e), origin.y + frame.h);
    }
    for (const n of northings) {
      doc.setLineWidth(n % 10000 === 0 ? 0.3 : 0.12);
      doc.line(origin.x, toY(n), origin.x + frame.w, toY(n));
    }
  }
  if (showNumbers) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const label = value => String(Math.floor(value / 1000 + 1e-9) % 100).padStart(2, "0");
    const plate = (x, y, width) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(x - 0.4, y - 2.35, width + 0.8, 3, "F");
    };
    doc.setTextColor(r, g, b);
    for (const e of eastings) {
      const x = toX(e);
      if (x < origin.x + 5 || x > origin.x + frame.w - 5) continue;
      const text = label(e), width = doc.getTextWidth(text);
      for (const y of [origin.y + 3.4, origin.y + frame.h - 1.1]) {
        plate(x - width / 2, y, width);
        doc.text(text, x - width / 2, y);
      }
    }
    for (const n of northings) {
      const y = toY(n) + 0.95;
      if (y < origin.y + 6.5 || y > origin.y + frame.h - 4) continue;
      const text = label(n), width = doc.getTextWidth(text);
      for (const x of [origin.x + 1, origin.x + frame.w - 1 - width]) {
        plate(x, y, width);
        doc.text(text, x, y);
      }
    }
  }
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(origin.x, origin.y, frame.w, frame.h, "S");
}

function drawCollar(doc, info) {
  const { page, view, origin, frame, orient, scale, options, contourInterval } = info;
  const landscape = orient === "l";
  const angle = landscape ? 90 : 0;
  // Collar coordinates: u runs along the frame edge, v away from it. Below the map in portrait;
  // beside it in landscape, where the text is turned to read up the sheet.
  const at = landscape
    ? (u, v) => [origin.x + frame.w + COLLAR_GAP + v, origin.y + frame.h - u]
    : (u, v) => [origin.x + u, origin.y + frame.h + COLLAR_GAP + v];
  const text = (value, u, v, align = "left") => {
    const width = doc.getTextWidth(value);
    const start = align === "center" ? u - width / 2 : align === "right" ? u - width : u;
    const [x, y] = at(start, v);
    doc.text(value, x, y, angle ? { angle } : undefined);
  };
  const box = (u, v, w, h, style) => {
    const [x1, y1] = at(u, v), [x2, y2] = at(u + w, v + h);
    doc.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), style);
  };

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // --- Sheet information: u 0 to 56 -----------------------------------------------------------
  const size = view.size;
  const zoneBand = `${page.zone}${latBand(view.centre.lat)}`;
  const unit = options.units === "ft" ? "ft" : "m";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  text(pageName(page, size), 0, 4.4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  text(`Sheet ${info.sheet} of ${info.sheets}  ·  Scale 1:${scale.toLocaleString("en-US")}`, 0, 7.9);
  text(contourInterval ? `Contour interval ${contourInterval[0]} ${unit}, index ${contourInterval[1]} ${unit}` : "Contours not shown", 0, 11);
  text(`MGRS grid zone ${zoneBand}  ·  1 km squares  ·  WGS 84`, 0, 14.1);
  text(`SW corner ${mgrsFromUtm(page.zone, page.south, page.e, page.n, 5)}`, 0, 17.2);

  // --- Scale bars: u 59 to 141 ----------------------------------------------------------------
  const barStart = 59, barMax = 82;
  const drawBar = (plan, v, unitLabel, firstSplit) => {
    const segments = Math.max(1, Math.round(plan.total));
    const segmentMm = plan.lengthMm / segments;
    doc.setLineWidth(0.15);
    for (let i = 0; i < segments; i += 1) {
      if (i === 0) {
        const part = segmentMm / firstSplit;
        for (let j = 0; j < firstSplit; j += 1) {
          doc.setFillColor(j % 2 === 0 ? 0 : 255);
          box(barStart + j * part, v, part, 1.6, "FD");
        }
      } else {
        doc.setFillColor(i % 2 === 0 ? 0 : 255);
        box(barStart + i * segmentMm, v, segmentMm, 1.6, "FD");
      }
    }
    doc.setFontSize(6);
    text("0", barStart, v + 4.1, "center");
    for (let i = 1; i <= segments; i += 1) {
      const value = String((plan.total / segments) * i);
      const u = barStart + i * segmentMm;
      text(value, u, v + 4.1, "center");
      if (i === segments) text(unitLabel, u + doc.getTextWidth(value) / 2 + 0.8, v + 4.1);
    }
  };
  drawBar(scaleBar(scale, 1000, [10, 5, 4, 3, 2, 1, 0.5], barMax), 3.2, "km", 5);
  drawBar(scaleBar(scale, 1609.344, [5, 4, 3, 2, 1, 0.5], barMax), 10.4, "mi", 4);
  doc.setFontSize(6);
  text(`Print at 100% (actual size). One 1 km grid square measures ${Number((1e6 / scale).toFixed(1))} mm.`, barStart, 18.2);

  // --- North diagram: u 143 to 157, always upright on the sheet -------------------------------
  const north = northReference(view.centre.lat, view.centre.lon, view.convergence, info.year);
  // The real angles are a few degrees, too small to draw, so the arms are fanned out in the right order.
  const arms = [
    { label: "TN", angle: -north.convergence },
    { label: "MN", angle: north.gridMagnetic },
  ].map(arm => ({ ...arm, side: Math.abs(arm.angle) < 0.05 ? 0 : Math.sign(arm.angle), display: 0 }));
  for (const side of [-1, 1]) {
    arms.filter(arm => arm.side === side)
      .sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))
      .forEach((arm, rank) => { arm.display = side * (16 + rank * 16); arm.rank = rank; });
  }
  const [baseX, baseY] = landscape ? at(143.5, 10.75) : at(150, 18.2);
  doc.setLineWidth(0.25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  // The nearer arm is longer with its label above the tip; the farther one is shorter with its
  // label beside the tip, so two arms on the same side never collide.
  const drawArm = (label, degrees, length, beside) => {
    const radians = (degrees * Math.PI) / 180;
    const tipX = baseX + Math.sin(radians) * length, tipY = baseY - Math.cos(radians) * length;
    doc.line(baseX, baseY, tipX, tipY);
    const width = doc.getTextWidth(label);
    if (beside) doc.text(label, degrees > 0 ? tipX + 0.7 : tipX - 0.7 - width, tipY + 0.7);
    else doc.text(label, tipX - width / 2 + Math.sign(degrees) * 1.3, tipY - 0.7);
  };
  const coincident = arms.filter(arm => arm.side === 0).map(arm => arm.label);
  drawArm(["GN", ...coincident].join("/"), 0, 12.6, false);
  for (const arm of arms) {
    if (arm.side !== 0) drawArm(arm.label, arm.display, arm.rank ? 8 : 11.2, Boolean(arm.rank));
  }

  // --- North notes: u 159 to 200 --------------------------------------------------------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  [
    `Grid-magnetic angle ${Math.abs(north.gridMagnetic).toFixed(1)}° (${Math.round(Math.abs(north.gridMagnetic) * 17.7778)} mils)`,
    `Grid azimuth = magnetic ${signedDegrees(north.gridMagnetic)}`,
    `Magnetic azimuth = grid ${signedDegrees(-north.gridMagnetic)}`,
    `Declination ${formatAngleEW(north.declination)} in ${north.year.toFixed(1)}`,
    `Grid convergence ${formatAngleEW(north.convergence)}`,
  ].forEach((note, i) => text(note, 159, 4.4 + i * 3.1));

  // --- Credits --------------------------------------------------------------------------------
  doc.setFontSize(4.8);
  doc.setTextColor(70, 70, 70);
  text(CREDIT_LINE, 0, 20);
  text(`Centre ${formatLatLon(view.centre.lat, view.centre.lon, 4)}  ·  Made with Topo Map Builder, ${new Date().toISOString().slice(0, 10)}  ·  `
    + "Drawn from open data: confirm critical details against an official source.", 0, 21.9);
  doc.setTextColor(0, 0, 0);
}

function drawLegend(doc, palette, options, scale) {
  const rgb = name => hexToRgb(palette[name]);
  const left = 18;
  let y = 22;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Legend", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Topo Map Builder  ·  1:${scale.toLocaleString("en-US")}  ·  WGS 84, MGRS grid`, left, y + 5);
  y += 16;

  const heading = (title, x, top) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(title, x, top);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
  };
  const lineSample = (x, top, draw, label) => {
    draw(x, top);
    doc.setLineDashPattern([], 0);
    doc.setTextColor(0, 0, 0);
    doc.text(label, x + 24, top + 1);
  };
  const solid = (colour, width, dash = []) => (x, top) => {
    doc.setDrawColor(...rgb(colour));
    doc.setLineWidth(width);
    doc.setLineDashPattern(dash, 0);
    doc.line(x, top, x + 20, top);
  };
  const cased = (fill, casing, width) => (x, top) => {
    solid(casing, width + 0.35)(x, top);
    solid(fill, width)(x, top);
  };

  const columnA = left, columnB = 112;
  heading("Roads and routes", columnA, y);
  const lines = [
    [cased("roadMajor", "roadMajorCase", 0.9), "Highway or primary road"],
    [cased("roadSecondary", "roadSecondaryCase", 0.75), "Secondary road"],
    [cased("roadMinor", "roadMinorCase", 0.6), "Local road"],
    [solid("service", 0.3), "Service road or driveway"],
    [solid("track", 0.35, [1.6, 0.6]), "Track (unpaved, vehicle width)"],
    [solid("path", 0.25, [0.8, 0.55]), "Trail or footpath"],
    [(x, top) => { solid("rail", 0.35)(x, top); solid("rail", 1.3, [0.2, 1.8])(x, top); }, "Railway"],
    [solid("ferry", 0.3, [1.2, 0.9]), "Ferry route"],
  ];
  lines.forEach(([draw, label], i) => lineSample(columnA, y + 6 + i * 6, draw, label));

  heading("Water and relief", columnB, y);
  const relief = [
    [solid("waterLine", 0.5), "River or stream"],
    [solid("waterLine", 0.3, [1.5, 0.9]), "Intermittent stream"],
    [solid("contour", 0.18), "Contour line"],
    [solid("contourIndex", 0.4), "Index contour, labelled with its elevation"],
    [solid("grid", 0.12), "Grid line (1 km)"],
    [solid("grid", 0.3), "Grid line (10 km)"],
    [solid("boundary", 0.4, [1.8, 0.6, 0.3, 0.6]), "State or province boundary"],
    [solid("parkLine", 0.35, [1.8, 0.6]), "Park or protected-land boundary"],
  ];
  relief.forEach(([draw, label], i) => lineSample(columnB, y + 6 + i * 6, draw, label));
  y += 62;

  heading("Ground cover and land use", columnA, y);
  const areas = [
    ["wood", "Tree cover"], ["water", "Lake, pond or wide river"], ["wetland", "Wetland"], ["sand", "Sand"],
    ["rock", "Bare rock"], ["residential", "Built-up area"], ["military", "Military area"], ["cemetery", "Cemetery"],
    ["quarry", "Quarry"], ["park", "Park or protected land"],
  ];
  areas.forEach(([colour, label], i) => {
    const x = i < 5 ? columnA : columnB, top = y + 4 + (i % 5) * 7;
    doc.setFillColor(...rgb(colour));
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.1);
    doc.rect(x, top, 20, 4.2, "FD");
    doc.text(label, x + 24, top + 3.1);
  });
  y += 46;

  heading("Points", columnA, y);
  doc.setFillColor(...rgb("building"));
  doc.rect(columnA + 6, y + 4.4, 2, 2, "F");
  doc.rect(columnA + 9.4, y + 5, 2.6, 1.6, "F");
  doc.text("Buildings", columnA + 24, y + 6.6);
  doc.setFillColor(...rgb("peak"));
  doc.triangle(columnA + 10, y + 10.6, columnA + 8.4, y + 13.4, columnA + 11.6, y + 13.4, "F");
  doc.text(`Peak, with its name and elevation in ${options.units === "ft" ? "feet" : "metres"}`, columnA + 24, y + 13.2);
  doc.setFillColor(...rgb("poi"));
  doc.circle(columnA + 10, y + 18.6, 0.8, "F");
  doc.text("Point of interest", columnA + 24, y + 19.6);
  y += 32;

  heading("Reading a grid reference", columnA, y);
  const paragraphs = [
    "Grid squares are 1 km on a side. The numbers along the frame are the principal digits of each grid line. "
      + "Read right, then up: take the line to the left of the point, estimate tenths across the square, then take the line "
      + "below the point and estimate tenths up. Four digits name the 1 km square, six digits a 100 m square.",
    "The sheet name is the MGRS reference of the centre of the page. The south-west corner is printed in full in the collar.",
    "Grid north (GN) is the direction of the vertical grid lines. A compass points to magnetic north (MN). "
      + "Use the grid-magnetic angle in the collar to convert a compass bearing to a grid bearing and back. "
      + "Magnetic values come from the World Magnetic Model and drift slowly from year to year.",
    "Print at 100% (actual size), not 'fit to page', then check the scale bar with a ruler. "
      + "This map is drawn from open data that changes over time; confirm critical details against an official source.",
  ];
  let textY = y + 6;
  for (const paragraph of paragraphs) {
    const rows = doc.splitTextToSize(paragraph, 180);
    doc.text(rows, columnA, textY);
    textY += rows.length * 3.7 + 2.4;
  }

  doc.setFontSize(6);
  doc.setTextColor(70, 70, 70);
  doc.text(doc.splitTextToSize(CREDIT_LINE, 180), columnA, 266);
}
