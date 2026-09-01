import {
  VIEW_TEMPLATES,
  assessmentResult,
  buildAnalysisOfAlternativesModels,
  buildDiagramSvg,
  buildReadiness,
  cleanDecisionPackageValue,
  collectObligations,
  formatLocalDate,
  scoped
} from "./engine.js?v=9";

const LETTER = Object.freeze({ width: 612, height: 792 });
const MARGIN = 48;
const CONTENT_WIDTH = LETTER.width - MARGIN * 2;
const BODY_TOP = 724;
const BODY_BOTTOM = 54;
const COLORS = Object.freeze({
  ink: "17232f",
  muted: "586a78",
  quiet: "405663",
  line: "cbd7de",
  lineStrong: "9db1bc",
  panel: "f5f8fa",
  panelStrong: "eaf1f4",
  teal: "007b86",
  tealDark: "005d66",
  tealSoft: "e3f5f6",
  amber: "c2832c",
  amberDark: "81520f",
  amberSoft: "fff3dc",
  red: "963a3a",
  redSoft: "fbeaea",
  green: "176f4b",
  greenSoft: "e6f4ec",
  navy: "0d1a26",
  navy2: "143444",
  white: "ffffff"
});

function ascii(value) {
  return String(value ?? "")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2260/g, "!=")
    .replace(/\u2194/g, "<->")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u00b1/g, "+/-")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\u00b7/g, " | ")
    .replace(/\u2022/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?")
    .replace(/[\t\r]+/g, " ")
    .trim();
}

function valueText(value, fallback = "Not recorded") {
  const clean = ascii(cleanDecisionPackageValue(value));
  return clean || fallback;
}

function joined(values, fallback = "None recorded") {
  const clean = (values || []).map(value => valueText(value, "")).filter(Boolean);
  return clean.length ? clean.join("; ") : fallback;
}

function hexToRgb(PDFLib, hex) {
  const clean = hex.replace("#", "");
  return PDFLib.rgb(
    Number.parseInt(clean.slice(0, 2), 16) / 255,
    Number.parseInt(clean.slice(2, 4), 16) / 255,
    Number.parseInt(clean.slice(4, 6), 16) / 255
  );
}

function splitLongToken(token, font, size, maxWidth) {
  const chunks = [];
  let current = "";
  for (const character of token) {
    const next = `${current}${character}`;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      chunks.push(current);
      current = character;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(value, font, size, maxWidth) {
  const paragraphs = ascii(value).split(/\n/);
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph.trim()) {
      lines.push("");
      return;
    }
    const tokens = paragraph.split(/\s+/).flatMap(token => font.widthOfTextAtSize(token, size) > maxWidth
      ? splitLongToken(token, font, size, maxWidth)
      : [token]);
    let line = "";
    for (const token of tokens) {
      const next = line ? `${line} ${token}` : token;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = token;
      } else line = next;
    }
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1 && paragraphs[paragraphIndex + 1].trim()) lines.push("");
  });
  return lines.length ? lines : [""];
}

function normalizeWidths(widths, count) {
  const requested = Array.isArray(widths) && widths.length === count ? widths : Array(count).fill(1);
  const sum = requested.reduce((total, value) => total + Math.max(Number(value) || 0, .1), 0);
  return requested.map(value => CONTENT_WIDTH * Math.max(Number(value) || 0, .1) / sum);
}

function statusTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (/\b(blocked|rejected|invalidated|high|critical)\b/.test(normalized)) return "negative";
  if (/\b(approved|complete|validated|baselined|satisfied|substantiated|preferred|closed)\b/.test(normalized)) return "positive";
  if (/\b(draft|unknown|unverified|open|planned|proposed|considering|in progress|in analysis|at risk)\b/.test(normalized)) return "attention";
  return "neutral";
}

class PdfReport {
  constructor(PDFLib, pdfDoc, fonts, solution, prepared) {
    this.PDFLib = PDFLib;
    this.pdfDoc = pdfDoc;
    this.fonts = fonts;
    this.solution = solution;
    this.prepared = prepared;
    this.pages = [];
    this.page = null;
    this.y = BODY_TOP;
    this.currentSection = "Decision package";
  }

  color(name) {
    return hexToRgb(this.PDFLib, COLORS[name] || name);
  }

  addCover(summary) {
    const page = this.pdfDoc.addPage([LETTER.width, LETTER.height]);
    this.pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: LETTER.width, height: LETTER.height, color: this.color("navy") });
    page.drawRectangle({ x: 0, y: 0, width: LETTER.width, height: 280, color: this.color("navy2") });
    page.drawRectangle({ x: 0, y: LETTER.height - 8, width: 430, height: 8, color: this.color("teal") });
    page.drawRectangle({ x: 430, y: LETTER.height - 8, width: 120, height: 8, color: this.color("amber") });

    page.drawText("SOLUTION DECISION PACKAGE", { x: MARGIN, y: 700, size: 11, font: this.fonts.bold, color: this.color("tealSoft"), characterSpacing: 1.5 });
    const titleLines = wrapText(valueText(this.solution.name, "Untitled solution"), this.fonts.bold, 34, CONTENT_WIDTH);
    let titleY = 650;
    for (const line of titleLines.slice(0, 4)) {
      page.drawText(line, { x: MARGIN, y: titleY, size: 34, font: this.fonts.bold, color: this.color("white") });
      titleY -= 40;
    }
    const summaryLines = wrapText(summary, this.fonts.regular, 13, CONTENT_WIDTH - 20).slice(0, 6);
    let summaryY = titleY - 8;
    for (const line of summaryLines) {
      page.drawText(line, { x: MARGIN, y: summaryY, size: 13, font: this.fonts.regular, color: this.color("panelStrong") });
      summaryY -= 19;
    }

    const metadata = [
      ["CUSTOMER", valueText(this.solution.customer)],
      ["LIFECYCLE STAGE", valueText(this.solution.stage)],
      ["DOMAIN", valueText(this.solution.domain)],
      ["PREPARED", this.prepared]
    ];
    const cardY = 292;
    const cardWidth = (CONTENT_WIDTH - 12) / 2;
    metadata.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = MARGIN + column * (cardWidth + 12);
      const y = cardY - row * 64;
      page.drawRectangle({ x, y, width: cardWidth, height: 52, borderColor: this.color("lineStrong"), borderWidth: .7, color: this.color("navy") });
      page.drawText(label, { x: x + 12, y: y + 34, size: 7.5, font: this.fonts.bold, color: this.color("lineStrong"), characterSpacing: .7 });
      const lines = wrapText(value, this.fonts.bold, 10, cardWidth - 24).slice(0, 2);
      lines.forEach((line, lineIndex) => page.drawText(line, { x: x + 12, y: y + 16 - lineIndex * 11, size: 10, font: this.fonts.bold, color: this.color("white") }));
    });

    const decisionY = 98;
    page.drawRectangle({ x: MARGIN, y: decisionY, width: CONTENT_WIDTH, height: 76, color: this.color("amberSoft"), borderColor: this.color("amber"), borderWidth: 1 });
    page.drawRectangle({ x: MARGIN, y: decisionY, width: 5, height: 76, color: this.color("amber") });
    page.drawText("DECISION REQUESTED", { x: MARGIN + 16, y: decisionY + 55, size: 8, font: this.fonts.bold, color: this.color("amberDark"), characterSpacing: .8 });
    const decisionLines = wrapText(valueText(this.solution.decision, "Decision request not yet defined"), this.fonts.bold, 11, CONTENT_WIDTH - 34).slice(0, 4);
    decisionLines.forEach((line, index) => page.drawText(line, { x: MARGIN + 16, y: decisionY + 36 - index * 13, size: 11, font: this.fonts.bold, color: this.color("ink") }));
  }

  addPage(section = this.currentSection) {
    this.currentSection = section || this.currentSection;
    this.page = this.pdfDoc.addPage([LETTER.width, LETTER.height]);
    this.pages.push(this.page);
    this.page.drawText("SOLUTION DECISION PACKAGE", { x: MARGIN, y: 758, size: 7.5, font: this.fonts.bold, color: this.color("teal"), characterSpacing: .75 });
    const title = valueText(this.solution.name, "Untitled solution");
    const clippedTitle = wrapText(title, this.fonts.bold, 8, 245)[0];
    const titleWidth = this.fonts.bold.widthOfTextAtSize(clippedTitle, 8);
    this.page.drawText(clippedTitle, { x: LETTER.width - MARGIN - titleWidth, y: 758, size: 8, font: this.fonts.bold, color: this.color("quiet") });
    this.page.drawLine({ start: { x: MARGIN, y: 747 }, end: { x: LETTER.width - MARGIN, y: 747 }, thickness: .7, color: this.color("line") });
    this.y = BODY_TOP;
  }

  ensure(height, section = this.currentSection) {
    if (!this.page || this.y - height < BODY_BOTTOM) this.addPage(section);
  }

  spacer(points = 8) {
    this.y -= points;
  }

  section(number, title, subtitle) {
    this.currentSection = title;
    this.ensure(190, title);
    if (this.y < BODY_TOP - 8) this.y -= 10;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 28, width: 28, height: 28, color: this.color("teal") });
    const numberWidth = this.fonts.bold.widthOfTextAtSize(number, 9);
    this.page.drawText(number, { x: MARGIN + (28 - numberWidth) / 2, y: this.y - 18, size: 9, font: this.fonts.bold, color: this.color("white") });
    this.page.drawText(title, { x: MARGIN + 40, y: this.y - 18, size: 18, font: this.fonts.bold, color: this.color("ink") });
    this.y -= 39;
    this.drawParagraph(subtitle, { size: 9.5, color: "muted", maxWidth: CONTENT_WIDTH - 40, x: MARGIN + 40, after: 10 });
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: LETTER.width - MARGIN, y: this.y }, thickness: .7, color: this.color("line") });
    this.y -= 14;
  }

  subheading(title) {
    this.ensure(34);
    this.y -= 4;
    this.page.drawText(valueText(title), { x: MARGIN, y: this.y - 13, size: 12.5, font: this.fonts.bold, color: this.color("tealDark") });
    this.y -= 25;
  }

  drawParagraph(text, { size = 10, font = this.fonts.regular, color = "ink", maxWidth = CONTENT_WIDTH, x = MARGIN, lineHeight = size * 1.38, after = 8 } = {}) {
    const lines = wrapText(valueText(text), font, size, maxWidth);
    for (const line of lines) {
      this.ensure(lineHeight + 2);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color: this.color(color) });
      this.y -= lineHeight;
    }
    this.y -= after;
  }

  drawNarrative(label, text) {
    const body = valueText(text);
    const lines = wrapText(body, this.fonts.regular, 9.5, CONTENT_WIDTH - 28);
    const required = 37 + lines.length * 13;
    if (required <= 225) {
      this.ensure(required + 8);
      const bottom = this.y - required;
      this.page.drawRectangle({ x: MARGIN, y: bottom, width: CONTENT_WIDTH, height: required, borderColor: this.color("line"), borderWidth: .7, color: this.color("panel") });
      this.page.drawRectangle({ x: MARGIN, y: bottom, width: 4, height: required, color: this.color("teal") });
      this.page.drawText(valueText(label).toUpperCase(), { x: MARGIN + 14, y: this.y - 16, size: 8, font: this.fonts.bold, color: this.color("tealDark"), characterSpacing: .5 });
      let lineY = this.y - 35;
      for (const line of lines) {
        if (line) this.page.drawText(line, { x: MARGIN + 14, y: lineY, size: 9.5, font: this.fonts.regular, color: this.color("ink") });
        lineY -= 13;
      }
      this.y = bottom - 8;
      return;
    }
    this.subheading(label);
    this.drawParagraph(body, { size: 9.5, maxWidth: CONTENT_WIDTH, lineHeight: 13, after: 9 });
  }

  drawMetrics(metrics) {
    const gap = 6;
    const width = (CONTENT_WIDTH - gap * (metrics.length - 1)) / metrics.length;
    const height = 58;
    this.ensure(height + 10);
    metrics.forEach(([label, value], index) => {
      const x = MARGIN + index * (width + gap);
      this.page.drawRectangle({ x, y: this.y - height, width, height, color: this.color("panel"), borderColor: this.color("line"), borderWidth: .7 });
      const labelLines = wrapText(label.toUpperCase(), this.fonts.bold, 6.5, width - 14).slice(0, 2);
      labelLines.forEach((line, lineIndex) => this.page.drawText(line, { x: x + 7, y: this.y - 14 - lineIndex * 8, size: 6.5, font: this.fonts.bold, color: this.color("quiet"), characterSpacing: .25 }));
      this.page.drawText(valueText(value), { x: x + 7, y: this.y - 45, size: 17, font: this.fonts.bold, color: this.color("teal") });
    });
    this.y -= height + 12;
  }

  drawTable(headers, rows, { widths, caption = "", fontSize = 7.8 } = {}) {
    if (!rows.length) {
      this.drawParagraph(`No ${String(caption || "records").toLowerCase()} recorded.`, { color: "muted", after: 5 });
      return;
    }
    const columnWidths = normalizeWidths(widths, headers.length);
    const paddingX = 5;
    const paddingY = 5;
    const lineHeight = fontSize * 1.32;
    const headerSize = Math.max(6.6, fontSize - .6);
    const headerLines = headers.map((header, index) => wrapText(valueText(header), this.fonts.bold, headerSize, columnWidths[index] - paddingX * 2));
    const headerHeight = Math.max(...headerLines.map(lines => lines.length)) * (headerSize * 1.22) + paddingY * 2;
    const wrappedRows = rows.map(row => headers.map((_, index) => wrapText(valueText(row[index], ""), this.fonts.regular, fontSize, columnWidths[index] - paddingX * 2)));
    const tableHeight = (caption ? 20 : 0) + headerHeight + wrappedRows.reduce((height, row) => (
      height + Math.max(...row.map(lines => Math.max(lines.length, 1))) * lineHeight + paddingY * 2
    ), 0) + 10;
    const availableHere = this.y - BODY_BOTTOM;
    const freshPageCapacity = BODY_TOP - BODY_BOTTOM;
    const usefulTableStart = Math.min(220, tableHeight * .5);
    if (
      tableHeight <= freshPageCapacity
      && this.y - tableHeight < BODY_BOTTOM
      && availableHere < usefulTableStart
    ) this.addPage();
    const firstRowHeight = wrappedRows.length
      ? Math.max(...wrappedRows[0].map(lines => Math.max(lines.length, 1))) * lineHeight + paddingY * 2
      : lineHeight + paddingY * 2;
    const initialChunkHeight = Math.min(
      firstRowHeight,
      freshPageCapacity - headerHeight - (caption ? 20 : 0)
    );
    this.ensure((caption ? 20 : 0) + headerHeight + initialChunkHeight);
    if (caption) {
      this.ensure(20 + headerHeight + lineHeight + paddingY * 2);
      this.page.drawText(valueText(caption), { x: MARGIN, y: this.y - 10, size: 8.5, font: this.fonts.bold, color: this.color("quiet") });
      this.y -= 20;
    }

    const drawHeader = () => {
      this.ensure(headerHeight + lineHeight + paddingY * 2);
      let x = MARGIN;
      headers.forEach((header, index) => {
        const width = columnWidths[index];
        this.page.drawRectangle({ x, y: this.y - headerHeight, width, height: headerHeight, color: this.color("panelStrong"), borderColor: this.color("lineStrong"), borderWidth: .7 });
        headerLines[index].forEach((line, lineIndex) => this.page.drawText(line.toUpperCase(), { x: x + paddingX, y: this.y - paddingY - headerSize - lineIndex * (headerSize * 1.22), size: headerSize, font: this.fonts.bold, color: this.color("quiet"), characterSpacing: .2 }));
        x += width;
      });
      this.y -= headerHeight;
    };

    drawHeader();
    rows.forEach((row, rowIndex) => {
      const pending = wrappedRows[rowIndex].map(lines => [...lines]);
      let continuation = false;
      while (pending.some(lines => lines.length)) {
        const maxLines = Math.max(...pending.map(lines => Math.max(lines.length, 1)));
        const fullRowHeight = maxLines * lineHeight + paddingY * 2;
        const freshRowSpace = BODY_TOP - BODY_BOTTOM - headerHeight - (caption ? 20 : 0);
        if (!continuation && fullRowHeight <= freshRowSpace && this.y - fullRowHeight < BODY_BOTTOM) {
          this.addPage();
          if (caption) {
            this.page.drawText(`${valueText(caption)} (continued)`, { x: MARGIN, y: this.y - 10, size: 8.5, font: this.fonts.bold, color: this.color("quiet") });
            this.y -= 20;
          }
          drawHeader();
          continue;
        }
        const availableLines = Math.max(1, Math.floor((this.y - BODY_BOTTOM - paddingY * 2) / lineHeight));
        if (availableLines < 2) {
          this.addPage();
          if (caption) {
            this.page.drawText(`${valueText(caption)} (continued)`, { x: MARGIN, y: this.y - 10, size: 8.5, font: this.fonts.bold, color: this.color("quiet") });
            this.y -= 20;
          }
          drawHeader();
          continue;
        }
        const chunkLines = Math.min(maxLines, availableLines, 24);
        const rowHeight = chunkLines * lineHeight + paddingY * 2;
        if (this.y - rowHeight < BODY_BOTTOM) {
          this.addPage();
          if (caption) {
            this.page.drawText(`${valueText(caption)} (continued)`, { x: MARGIN, y: this.y - 10, size: 8.5, font: this.fonts.bold, color: this.color("quiet") });
            this.y -= 20;
          }
          drawHeader();
          continue;
        }
        let x = MARGIN;
        headers.forEach((_, index) => {
          const width = columnWidths[index];
          if (rowIndex % 2 === 1) this.page.drawRectangle({ x, y: this.y - rowHeight, width, height: rowHeight, color: this.color("panel"), opacity: .55 });
          this.page.drawRectangle({ x, y: this.y - rowHeight, width, height: rowHeight, borderColor: this.color("line"), borderWidth: .55 });
          const chunk = pending[index].splice(0, chunkLines);
          chunk.forEach((line, lineIndex) => {
            const rendered = continuation && index === 0 && lineIndex === 0 ? `${line} (continued)` : line;
            if (rendered) this.page.drawText(rendered, { x: x + paddingX, y: this.y - paddingY - fontSize - lineIndex * lineHeight, size: fontSize, font: this.fonts.regular, color: this.color("ink") });
          });
          x += width;
        });
        this.y -= rowHeight;
        continuation = true;
      }
    });
    this.y -= 10;
  }

  drawImage(image, sourceWidth, sourceHeight, caption = "") {
    const maxWidth = CONTENT_WIDTH;
    const maxHeight = 350;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    this.ensure(height + (caption ? 28 : 12));
    if (caption) {
      this.page.drawText(valueText(caption), { x: MARGIN, y: this.y - 10, size: 8.5, font: this.fonts.bold, color: this.color("quiet") });
      this.y -= 20;
    }
    this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: CONTENT_WIDTH, height, color: this.color("panel"), borderColor: this.color("line"), borderWidth: .7 });
    this.page.drawImage(image, { x: MARGIN + (CONTENT_WIDTH - width) / 2, y: this.y - height, width, height });
    this.y -= height + 12;
  }

  finalizeFooters() {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      const pageNumber = `Page ${index + 1} of ${total}`;
      const prepared = `Prepared ${this.prepared}`;
      if (index > 0) page.drawLine({ start: { x: MARGIN, y: 38 }, end: { x: LETTER.width - MARGIN, y: 38 }, thickness: .6, color: this.color("line") });
      page.drawText(prepared, { x: MARGIN, y: 23, size: 7.3, font: this.fonts.regular, color: index === 0 ? this.color("lineStrong") : this.color("muted") });
      const width = this.fonts.regular.widthOfTextAtSize(pageNumber, 7.3);
      page.drawText(pageNumber, { x: LETTER.width - MARGIN - width, y: 23, size: 7.3, font: this.fonts.regular, color: index === 0 ? this.color("lineStrong") : this.color("muted") });
    });
  }
}

async function svgToPng(svg, width, height) {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Architecture figure could not be rendered."));
      element.src = url;
    });
    const scale = Math.min(2, 1800 / Math.max(width, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#f5f8fa";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png", .95));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function names(ids, lookup, field) {
  return (ids || []).map(id => lookup.get(id)?.[field] || id);
}

export function buildDecisionPackageExportSummary(workspace, solutionId = workspace.activeSolutionId) {
  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) throw new Error("Solution not found.");
  const summary = valueText(solution.description || solution.mission?.desiredState || solution.mission?.problem, "Decision-ready solution architecture package.");
  return {
    solutionId,
    solutionName: valueText(solution.name, "Untitled solution"),
    prepared: formatLocalDate(),
    summary,
    readiness: buildReadiness(workspace, solutionId),
    recordCounts: Object.fromEntries([
      "stakeholders", "hotButtons", "outcomes", "measures", "requirements", "evidence", "candidates", "architectureViews", "elements", "connections", "trades", "decisions", "risks", "dependencies", "assumptions", "winThemes", "roadmapItems", "reviews", "transitionActions"
    ].map(collection => [collection, scoped(workspace, collection, solutionId).length]))
  };
}

export async function buildDecisionPackagePdf(workspace, solutionId = workspace.activeSolutionId) {
  const PDFLib = globalThis.PDFLib;
  if (!PDFLib?.PDFDocument || !PDFLib?.StandardFonts) throw new Error("The bundled PDF generator is unavailable. Reload the page and try again.");
  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) throw new Error("Solution not found.");

  const prepared = formatLocalDate();
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique)
  };
  pdfDoc.setTitle(`${valueText(solution.name)} - Decision Package`);
  pdfDoc.setSubject("Solution architecture decision package");
  pdfDoc.setAuthor("Solution Architect Workbench");
  pdfDoc.setCreator("Solution Architect Workbench");
  pdfDoc.setProducer("Solution Architect Workbench");
  pdfDoc.setCreationDate(new Date());

  const report = new PdfReport(PDFLib, pdfDoc, fonts, solution, prepared);
  const summary = valueText(solution.description || solution.mission?.desiredState || solution.mission?.problem, "Decision-ready solution architecture package.");
  report.addCover(summary);

  const stakeholders = scoped(workspace, "stakeholders", solutionId);
  const outcomes = scoped(workspace, "outcomes", solutionId);
  const measures = scoped(workspace, "measures", solutionId);
  const allHotButtons = scoped(workspace, "hotButtons", solutionId);
  const hotButtons = allHotButtons.filter(record => record.status !== "Retired");
  const requirements = scoped(workspace, "requirements", solutionId);
  const evidence = scoped(workspace, "evidence", solutionId);
  const candidates = scoped(workspace, "candidates", solutionId);
  const trades = scoped(workspace, "trades", solutionId).filter(record => record.analysisType !== "Analysis of Alternatives");
  const alternativesAnalyses = buildAnalysisOfAlternativesModels(workspace, solutionId);
  const views = scoped(workspace, "architectureViews", solutionId);
  const elements = scoped(workspace, "elements", solutionId);
  const connections = scoped(workspace, "connections", solutionId);
  const risks = scoped(workspace, "risks", solutionId);
  const dependencies = scoped(workspace, "dependencies", solutionId);
  const assumptions = scoped(workspace, "assumptions", solutionId);
  const winThemes = scoped(workspace, "winThemes", solutionId).filter(record => record.status !== "Retired");
  const decisions = scoped(workspace, "decisions", solutionId);
  const roadmap = scoped(workspace, "roadmapItems", solutionId);
  const reviews = scoped(workspace, "reviews", solutionId);
  const transitions = scoped(workspace, "transitionActions", solutionId);
  const obligations = collectObligations(workspace, solutionId);
  const readiness = buildReadiness(workspace, solutionId);
  const evidenceById = new Map(evidence.map(record => [record.id, record]));
  const requirementsById = new Map(requirements.map(record => [record.id, record]));
  const hotButtonsById = new Map(allHotButtons.map(record => [record.id, record]));
  const elementsById = new Map(elements.map(record => [record.id, record]));
  const candidatesById = new Map(candidates.map(record => [record.id, record]));

  report.addPage("Executive overview");
  report.section("01", "Executive overview", "Decision readiness, the mission outcome, and the operating change this solution is intended to enable.");
  report.drawMetrics([
    ["Overall coverage", `${readiness.overall}%`],
    ["Traceability", `${readiness.traceability}%`],
    ["Evidence", `${readiness.evidence}%`],
    ["Connectivity", `${readiness.interfaces}%`],
    ["Transition", `${readiness.transition}%`]
  ]);
  report.drawNarrative("Mission problem", solution.mission?.problem);
  report.drawNarrative("Current state", solution.mission?.currentState);
  report.drawNarrative("Desired state", solution.mission?.desiredState);
  report.drawNarrative("Company mission segments", joined(solution.missionSegments, "Mission segment not selected"));

  report.section("02", "Mission and operational context", "Stakeholders, operating conditions, outcomes, measures, and constraints that shape the solution.");
  report.drawNarrative("Operational context", solution.mission?.operationalContext);
  report.drawNarrative("Constraints", solution.mission?.constraints);
  report.subheading("Stakeholders");
  report.drawTable(["Stakeholder", "Role", "Primary concern"], stakeholders.map(record => [record.name, record.role, record.concern]), { widths: [1.2, 1, 2.2], caption: "Stakeholder register", fontSize: 8.2 });
  report.subheading("Outcomes and measures");
  report.drawTable(["Outcome", "Verification method", "Linked requirements"], outcomes.map(record => [record.title, record.verificationMethod, joined(names(record.linkedRequirementIds, requirementsById, "title"), "None linked")]), { widths: [1.5, 1.6, 1.5], caption: "Operational outcomes", fontSize: 8 });
  report.drawTable(["Measure", "Target", "Method"], measures.map(record => [record.name, record.target, record.method]), { widths: [1.2, 1, 2], caption: "Measures of effectiveness and performance", fontSize: 8.2 });

  report.section("03", "Customer priorities and win themes", "Customer signals traced to requirements, customer value, discriminators, and proof.");
  report.drawTable(["Customer signal", "Context / source", "Confidence", "Status", "Traced requirements"], hotButtons.map(record => [record.title, [record.detail, record.source].filter(Boolean).join(" | "), record.confidence, record.status, joined(requirements.filter(requirement => requirement.linkedHotButtonIds?.includes(record.id)).map(requirement => requirement.title), "None")]), { widths: [1.2, 1.9, .65, .7, 1.25], caption: "Customer hot buttons and decision drivers", fontSize: 7.3 });
  report.drawTable(["Win theme", "Customer value", "Discriminator", "Proof", "Trace", "Status"], winThemes.map(record => [record.title, record.customerValue, record.discriminator, record.proof, joined([...names(record.linkedHotButtonIds, hotButtonsById, "title"), ...names(record.sourceEvidenceIds, evidenceById, "title")]), record.status]), { widths: [1, 1.2, 1.2, 1.2, 1.05, .6], caption: "Win themes", fontSize: 6.9 });

  report.section("04", "Requirements trace", "Each requirement with its source, acceptance method, customer driver, and architecture realization.");
  report.drawTable(["Requirement", "Type / priority", "Source evidence", "Acceptance method", "Customer drivers", "Architecture trace", "Status"], requirements.map(record => [record.title, [record.type, record.priority].filter(Boolean).join(" | "), evidenceById.get(record.sourceEvidenceId)?.title || "Untraced", record.acceptanceMethod, joined(names(record.linkedHotButtonIds, hotButtonsById, "title"), "None"), joined(names(record.linkedElementIds, elementsById, "name"), "None"), record.status]), { widths: [1.4, .75, 1, 1.5, 1, 1, .65], caption: "Requirements traceability matrix", fontSize: 6.8 });

  report.section("05", "Technology Assessment", "Weighted criteria, evidence coverage, readiness, and rationale for each solution candidate.");
  if (!candidates.length) report.drawParagraph("No technology candidates recorded.", { color: "muted" });
  for (const candidate of candidates) {
    const result = assessmentResult(workspace, solutionId, candidate.id);
    report.subheading(candidate.name);
    report.drawParagraph([candidate.category, candidate.vendor, candidate.description].filter(Boolean).join(" | ") || "Candidate details not recorded.", { color: "muted", after: 5 });
    report.drawMetrics([
      ["Weighted score", result.score === null ? "Unknown" : `${result.score.toFixed(2)} / 5`],
      ["Assessed", `${Math.round(result.coverage * 100)}%`],
      ["Evidenced", `${Math.round(result.evidenceCoverage * 100)}%`],
      ["TRL", candidate.trl ?? "Unknown"],
      ["MRL / IRL", `${candidate.mrl ?? "Unknown"} / ${candidate.irl ?? "Unknown"}`]
    ]);
    report.drawNarrative("Readiness basis", [candidate.readinessAsOf ? `As of ${candidate.readinessAsOf}.` : "", candidate.readinessBasis].filter(Boolean).join(" "));
    report.drawTable(["Criterion", "Weight", "Score", "Rationale", "Evidence"], result.rows.map(row => [`${row.criterion.name}: ${row.criterion.description || "Definition not recorded"}`, `${row.criterion.weight}%`, row.value === null ? "Unknown" : `${row.value} / 5`, row.rationale, joined(names(row.evidenceIds, evidenceById, "title"), "None linked")]), { widths: [1.6, .55, .55, 1.8, 1.3], caption: `${candidate.name} assessment`, fontSize: 7.2 });
  }

  const proposal = solution.proposal || {};
  report.section("06", "Solution and proposal approach", "The operational concept, technical approach, discriminators, estimate assumptions, and delivery commitments.");
  report.drawNarrative("Concept of operations", proposal.conops);
  report.drawNarrative("Technical approach", proposal.technicalApproach);
  report.drawNarrative("Discriminators", proposal.discriminators);
  report.drawNarrative("Estimate and Basis of Estimate assumptions", proposal.estimateAssumptions);
  report.drawNarrative("Delivery commitments", proposal.deliveryCommitments);

  report.section("07", "Architecture views", "Decision-useful views of solution elements, boundaries, interfaces, exchanges, deployment, and transition context.");
  if (!views.length) report.drawParagraph("No architecture views recorded.", { color: "muted" });
  for (const view of views) {
    const svg = buildDiagramSvg(workspace, view.id, { standalone: true, interactive: false, palette: "print" });
    let embeddedImage = null;
    try {
      const pngBytes = await svgToPng(svg, view.width, view.height);
      if (pngBytes) embeddedImage = await pdfDoc.embedPng(pngBytes);
    } catch { /* The register below remains available when a browser cannot rasterize the SVG. */ }
    const description = view.description || "Architecture view description not recorded.";
    const descriptionHeight = wrapText(description, report.fonts.regular, 10, CONTENT_WIDTH).length * 13.8 + 8;
    const imageScale = embeddedImage ? Math.min(CONTENT_WIDTH / view.width, 350 / view.height, 1) : 0;
    report.ensure(Math.min(BODY_TOP - BODY_BOTTOM, Math.max(180, 30 + descriptionHeight + view.height * imageScale + (embeddedImage ? 40 : 8))));
    report.subheading(view.name);
    report.drawParagraph(description, { color: "muted", after: 5 });
    if (embeddedImage) {
      report.drawImage(embeddedImage, view.width, view.height, `${VIEW_TEMPLATES.find(([value]) => value === view.template)?.[1] || view.template || "Architecture view"} | ${elements.filter(record => record.viewId === view.id).length} elements | ${connections.filter(record => record.viewId === view.id).length} exchanges`);
    } else if (typeof document !== "undefined") {
      report.drawParagraph("The architecture figure could not be rasterized; the complete element and interface registers follow.", { color: "muted" });
    }
    const viewElements = elements.filter(record => record.viewId === view.id);
    report.drawTable(["Element", "Type", "Description"], viewElements.map(record => [record.name, record.type, record.description]), { widths: [1.2, 1, 2.2], caption: `${view.name} elements`, fontSize: 8 });
  }
  report.drawTable(["View", "Source", "Exchange", "Type / protocol", "Target", "Description"], connections.map(record => [views.find(view => view.id === record.viewId)?.name, elementsById.get(record.sourceElementId)?.name, record.label, [record.type, record.protocol].filter(Boolean).join(" | "), elementsById.get(record.targetElementId)?.name, record.description]), { widths: [.9, 1, 1.1, 1, 1, 1.4], caption: "Architecture interfaces and exchanges", fontSize: 6.9 });

  report.section("08", "Trades and decisions", "Evaluated alternatives, recommendations, decision status, rationale, ownership, and supporting evidence.");
  report.drawTable(["Trade study", "Decision question", "Options", "Recommendation", "Status"], trades.map(record => [record.title, record.question, joined(names(record.optionIds, candidatesById, "name"), "None"), record.recommendation, record.status]), { widths: [1.1, 1.5, 1, 1.6, .7], caption: "Trade studies", fontSize: 7.4 });
  for (const analysis of alternativesAnalyses) {
    const objectiveHeight = 37 + wrapText(valueText(analysis.question), report.fonts.regular, 9.5, CONTENT_WIDTH - 28).length * 13;
    report.ensure(34 + (objectiveHeight <= 225 ? objectiveHeight + 8 : 52));
    report.subheading(`Analysis of Alternatives: ${analysis.title}`);
    report.drawNarrative("Decision objective", analysis.question);
    report.drawNarrative("Baseline alternative", analysis.baselineName);
    report.drawNarrative("Scope and ground rules", analysis.scopeAndGroundRules);
    report.drawNarrative("Evaluation approach", analysis.evaluationApproach);
    report.drawNarrative("Sensitivity and uncertainty", analysis.sensitivityAnalysis);
    report.drawNarrative("Supporting evidence", joined(analysis.evidenceNames, "None linked"));
    report.drawNarrative("Recommendation", analysis.recommendation);
    report.drawNarrative("Owner / date / status", [analysis.owner, analysis.date, analysis.status].filter(Boolean).join(" | "));
    report.drawTable(["Alternative", "Baseline", "Score", "Assessed", "Evidenced", "Readiness", "Status"], analysis.alternatives.map(candidate => [candidate.name, candidate.baseline ? "Yes" : "No", candidate.weightedScore === null ? "Unknown" : `${candidate.weightedScore.toFixed(2)} / 5`, `${Math.round(candidate.assessmentCoverage * 100)}%`, `${Math.round(candidate.evidenceCoverage * 100)}%`, `TRL ${candidate.trl ?? "Unknown"}; MRL ${candidate.mrl ?? "Unknown"}; IRL ${candidate.irl ?? "Unknown"}`, candidate.status]), { widths: [1.2, .55, .7, .65, .65, 1.35, .7], caption: `${analysis.title} alternative comparison`, fontSize: 6.8 });
  }
  report.drawTable(["Decision", "Status", "Owner / date", "Rationale", "Evidence"], decisions.map(record => [record.title, record.status, [record.owner, record.date].filter(Boolean).join(" | "), record.rationale, joined(names(record.evidenceIds, evidenceById, "title"), "None")]), { widths: [1.2, .7, 1, 1.8, 1.2], caption: "Decision record", fontSize: 7.4 });

  report.section("09", "Risk, dependencies, and assumptions", "Conditions that could affect performance, integration, schedule, delivery, or sustainment.");
  report.drawTable(["Risk", "Likelihood", "Impact", "Owner", "Mitigation", "Status"], risks.map(record => [record.title, record.likelihood, record.impact, record.owner, record.mitigation, record.status]), { widths: [1.2, .7, .7, .9, 1.8, .7], caption: "Risks", fontSize: 7.2 });
  report.drawTable(["Dependency", "Type", "Provider", "Owner", "Needed by", "Status", "Impact"], dependencies.map(record => [record.title, record.type, record.provider, record.owner, record.neededBy, record.status, record.impact]), { widths: [1.1, .8, .8, .8, .7, .65, 1.4], caption: "Dependencies", fontSize: 6.9 });
  report.drawTable(["Assumption", "Owner", "Validation plan", "Status"], assumptions.map(record => [record.statement, record.owner, record.validationPlan, record.status]), { widths: [1.8, .9, 2.1, .8], caption: "Assumptions", fontSize: 7.6 });

  report.section("10", "Roadmap, reviews, and transition", "Sequence, ownership, gates, review criteria, receiving-team actions, and delivery blockers.");
  report.drawTable(["Stage", "Activity", "Start", "End", "Owner", "Status", "Gate"], roadmap.map(record => [record.stage, record.title, record.start, record.end, record.owner, record.status, record.gate ? "Yes" : "No"]), { widths: [.7, 1.7, .75, .75, .9, .8, .45], caption: "Roadmap and gates", fontSize: 7.1 });
  report.drawTable(["Review", "Type", "Due", "Owner", "Status", "Entry criteria"], reviews.map(record => [record.name, record.type, record.due, record.owner, record.status, record.entryCriteria]), { widths: [1.1, .8, .65, .8, .7, 1.8], caption: "Review gates", fontSize: 7.2 });
  report.drawTable(["Transition action", "Owner", "Target / gate", "Status", "Blocker"], transitions.map(record => [record.title, record.owner, record.target, record.status, record.blocker || "No blocker recorded"]), { widths: [1.5, .8, 1.1, .7, 1.5], caption: "Transition actions", fontSize: 7.5 });

  report.ensure(310, "Evidence and open obligations");
  report.section("11", "Evidence and open obligations", "The evidence register and deterministic gaps that still need action before the decision is fully supported.");
  report.subheading("Open obligations");
  report.drawTable(["Stage", "Severity", "Obligation"], obligations.map(record => [record.stage, record.severity.toUpperCase(), record.message]), { widths: [.8, .65, 3.6], caption: "Readiness gaps", fontSize: 7.8 });
  report.subheading("Evidence register");
  report.drawTable(["Evidence", "Type / date", "Source / participants", "Mission segments", "Confidence", "Reference / notes"], evidence.map(record => [record.title, [record.sourceType, record.meetingDate].filter(Boolean).join(" | "), [record.source, joined(record.participants, "")].filter(Boolean).join(" | "), joined(record.missionSegments, "None"), record.confidence, [record.url, record.notes].filter(Boolean).join(" | ")]), { widths: [1.1, .8, 1.35, 1, .65, 1.6], caption: "Source evidence", fontSize: 6.9 });
  report.subheading("Acronym key");
  report.drawTable(["Acronym", "Meaning"], [...(alternativesAnalyses.length ? [["AoA", "Analysis of Alternatives"]] : []), ["TRL", "Technology Readiness Level"], ["MRL", "Manufacturing Readiness Level"], ["IRL", "Integration Readiness Level"], ["MOSA", "Modular Open Systems Approach"], ["CONOPS", "Concept of Operations"], ["RF", "Radio Frequency"]], { widths: [.8, 3.6], caption: "Acronyms and abbreviations", fontSize: 8.4 });

  report.finalizeFooters();
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return new Blob([bytes], { type: "application/pdf" });
}

export const PDF_EXPORT_INTERNALS = Object.freeze({ ascii, joined, normalizeWidths, statusTone, valueText, wrapText });
