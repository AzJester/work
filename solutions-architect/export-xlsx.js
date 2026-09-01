import {
  VIEW_TEMPLATES,
  assessmentResult,
  buildReadiness,
  collectObligations,
  formatLocalDate,
  safeHttpUrl,
  scoped
} from "./engine.js";

export const DECISION_WORKBOOK_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const DECISION_WORKBOOK_SHEET_NAMES = Object.freeze([
  "Executive Summary",
  "Mission & Outcomes",
  "Customer & Win Themes",
  "Requirements & Evidence",
  "Technology Assessment",
  "Architecture & Interfaces",
  "Decisions & Risk",
  "Delivery & Transition",
  "Gaps & Readiness"
]);

const COLORS = Object.freeze({
  ink: "17232F",
  muted: "586A78",
  navy: "17324A",
  navySoft: "DCE8EF",
  teal: "007B86",
  tealSoft: "DCEFF1",
  gold: "C58A2B",
  goldSoft: "F6EAD4",
  line: "C9D6DE",
  paper: "FFFFFF",
  panel: "F4F8FA",
  positive: "DCEFE5",
  attention: "FFF0D8",
  negative: "F8DEDE"
});

const BORDER_BOTTOM = Object.freeze({
  bottom: { style: "thin", color: { rgb: COLORS.line } }
});

const STYLES = Object.freeze({
  title: {
    font: { name: "Aptos Display", size: 18, bold: true, color: { rgb: COLORS.paper } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.navy } },
    alignment: { vertical: "center", horizontal: "left" }
  },
  subtitle: {
    font: { name: "Aptos", size: 10, color: { rgb: COLORS.navy } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.navySoft } },
    alignment: { vertical: "center", horizontal: "left", wrapText: true }
  },
  section: {
    font: { name: "Aptos Display", size: 12, bold: true, color: { rgb: COLORS.paper } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.teal } },
    alignment: { vertical: "center", horizontal: "left" }
  },
  header: {
    font: { name: "Aptos", size: 10, bold: true, color: { rgb: COLORS.ink } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.tealSoft } },
    alignment: { vertical: "center", horizontal: "left", wrapText: true },
    border: BORDER_BOTTOM
  },
  body: {
    font: { name: "Aptos", size: 10, color: { rgb: COLORS.ink } },
    alignment: { vertical: "top", horizontal: "left", wrapText: true },
    border: BORDER_BOTTOM
  },
  empty: {
    font: { name: "Aptos", size: 10, italic: true, color: { rgb: COLORS.muted } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.panel } },
    alignment: { vertical: "center", horizontal: "left" }
  }
});

function spreadsheetLibrary(explicitLibrary) {
  const library = explicitLibrary || globalThis.XLSX;
  if (!library?.utils?.book_new || !library?.utils?.aoa_to_sheet || !library?.utils?.book_append_sheet || !library?.write) {
    throw new Error("The repository-bundled SheetJS library is unavailable.");
  }
  return library;
}

function cleanWorkbookText(value) {
  return String(value ?? "")
    .replace(/(?:^|\n)\s*(?:>\s*)?(?:\*\*)?data marking(?:\*\*)?\s*:[^\n]*(?:\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*(?:approved unclassified\s*\/\s*non-CUI\s*[·|]\s*)?NO CUI\s*\/\s*CLASSIFIED DATA\s*(?:\n|$)/gi, "\n")
    .replace(/;\s*they are not an approval or authorization determination\.?/gi, ".")
    .replace(/\s*this package is not an authorization or DoDAF[- ]conformance determination\.?/gi, "")
    .replace(/\s*this (?:package|report|workbook) is not authorized(?:\s+for[^.\n]+)?\.?/gi, "")
    .replace(/\s*this (?:package|report|workbook) is not (?:a |an )?(?:DoD|DOF)[- ]confirmed determination\.?/gi, "")
    .replace(/(?:^|\n)\s*generated[^\n]{0,160}?from a browser-local workspace\.?\s*(?:\n|$)/gi, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function text(value, fallback = "") {
  return cleanWorkbookText(value) || fallback;
}

function dateCell(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return text(value);
  return {
    t: "d",
    v: new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
    z: "yyyy-mm-dd"
  };
}

function percentCell(value) {
  const number = Number(value);
  return { t: "n", v: Number.isFinite(number) ? number : 0, z: "0%" };
}

function decimalCell(value, format = "0.00") {
  const number = Number(value);
  return Number.isFinite(number) ? { t: "n", v: number, z: format } : text(value, "Unknown");
}

function joinNames(ids, lookup, property = "title", fallback = "None") {
  const names = (ids || [])
    .map(id => lookup.get(id)?.[property])
    .map(value => text(value))
    .filter(Boolean);
  return names.length ? names.join("; ") : fallback;
}

function valueOfCell(value) {
  return value && typeof value === "object" && Object.hasOwn(value, "v") ? value.v : value;
}

function estimatedRowHeight(row, widths) {
  let lines = 1;
  row.forEach((cell, index) => {
    const value = valueOfCell(cell);
    if (value instanceof Date || typeof value === "number" || typeof value === "boolean") return;
    const content = String(value ?? "");
    const explicitLines = content.split(/\r?\n/).length;
    const wrappedLines = Math.ceil(content.length / Math.max(12, (widths[index] || 18) * 1.25));
    lines = Math.max(lines, explicitLines, wrappedLines);
  });
  return Math.min(66, 17 + (Math.min(lines, 4) - 1) * 12);
}

function createReportSheet(XLSX, { title, subtitle, widths, sections }) {
  const maxColumns = Math.max(2, widths.length, ...sections.map(section => section.headers.length));
  const rows = [];
  const roles = [];
  const merges = [];

  const addRow = (values, role, { merge = false } = {}) => {
    const rowIndex = rows.length;
    rows.push(values);
    roles.push(role);
    if (merge && maxColumns > 1) merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: maxColumns - 1 } });
  };

  addRow([title], "title", { merge: true });
  addRow([subtitle], "subtitle", { merge: true });
  addRow([], "spacer");

  for (const section of sections) {
    addRow([section.title], "section", { merge: true });
    addRow(section.headers, "header");
    if (section.rows.length) {
      for (const row of section.rows) addRow(row, "body");
    } else {
      addRow([section.emptyLabel || "No records"], "empty", { merge: true });
    }
    addRow([], "spacer");
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const role = roles[rowIndex];
    const style = STYLES[role];
    if (!style) continue;
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (!worksheet[address] && ["title", "subtitle", "section", "header", "empty"].includes(role)) {
        worksheet[address] = { t: "s", v: "" };
      }
      if (worksheet[address]) worksheet[address].s = style;
    }
  }

  worksheet["!cols"] = Array.from({ length: maxColumns }, (_, index) => ({
    wch: Math.max(10, Math.min(52, widths[index] || 18))
  }));
  worksheet["!rows"] = rows.map((row, index) => ({
    hpt: roles[index] === "title" ? 30
      : roles[index] === "subtitle" ? 24
        : roles[index] === "section" ? 23
          : roles[index] === "header" ? 28
            : roles[index] === "spacer" ? 9
              : roles[index] === "empty" ? 22
                : estimatedRowHeight(row, widths)
  }));
  worksheet["!merges"] = merges;
  worksheet["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };
  worksheet["!gridlines"] = false;
  worksheet["!margins"] = { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  worksheet["!pageSetup"] = {
    orientation: maxColumns > 6 ? "landscape" : "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 1
  };
  return worksheet;
}

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = ZIP_CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function concatenateBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function storedZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.xml);
    const checksum = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    localParts.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }

  const directorySize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return concatenateBytes([...localParts, ...centralParts, new Uint8Array(end.buffer)]);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function cellReference(rowIndex, columnIndex) {
  return `${columnName(columnIndex)}${rowIndex + 1}`;
}

function excelDateSerial(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function styleIndex(cell) {
  if (cell?.s === STYLES.title) return 1;
  if (cell?.s === STYLES.subtitle) return 2;
  if (cell?.s === STYLES.section) return 3;
  if (cell?.s === STYLES.header) return 4;
  if (cell?.s === STYLES.empty) return 10;
  if (cell?.s !== STYLES.body) return 0;
  if (cell.t === "d" || cell.v instanceof Date || cell.z === "yyyy-mm-dd") return 8;
  if (cell.z === "0%") return 7;
  if (cell.z === "0.00") return 9;
  if (cell.t === "n" || typeof cell.v === "number") return 6;
  return 5;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="0%"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>
  <fonts count="7">
    <font><sz val="10"/><color rgb="FF17232F"/><name val="Aptos"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><sz val="10"/><color rgb="FF17324A"/><name val="Aptos"/></font>
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="10"/><color rgb="FF17232F"/><name val="Aptos"/></font>
    <font><sz val="10"/><color rgb="FF17232F"/><name val="Aptos"/></font>
    <font><i/><sz val="10"/><color rgb="FF586A78"/><name val="Aptos"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF17324A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCE8EF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF007B86"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCEFF1"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F8FA"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFC9D6DE"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="165" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <xf numFmtId="166" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="0" fontId="6" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(XLSX, worksheet) {
  const decoded = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  const freeze = worksheet["!freeze"];
  const showGridLines = worksheet["!gridlines"] === false ? ' showGridLines="0"' : "";
  const pane = freeze
    ? `<pane${freeze.xSplit ? ` xSplit="${freeze.xSplit}"` : ""}${freeze.ySplit ? ` ySplit="${freeze.ySplit}"` : ""} topLeftCell="${xmlEscape(freeze.topLeftCell || "A4")}" activePane="${xmlEscape(freeze.activePane || "bottomLeft")}" state="frozen"/>`
    : "";
  const views = `<sheetViews><sheetView workbookViewId="0"${showGridLines}>${pane}</sheetView></sheetViews>`;
  const columns = (worksheet["!cols"] || []).length
    ? `<cols>${worksheet["!cols"].map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(column.wch) || 12}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rowMetadata = worksheet["!rows"] || [];
  const rows = [];
  for (let rowIndex = decoded.s.r; rowIndex <= decoded.e.r; rowIndex += 1) {
    const cells = [];
    for (let columnIndex = decoded.s.c; columnIndex <= decoded.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) continue;
      const style = styleIndex(cell);
      const styleAttribute = style ? ` s="${style}"` : "";
      if (cell.v === "" || cell.v === null || cell.v === undefined) {
        if (style) cells.push(`<c r="${address}"${styleAttribute}/>`);
        continue;
      }
      if (cell.t === "d" || cell.v instanceof Date) {
        const serial = excelDateSerial(cell.v);
        if (serial !== null) cells.push(`<c r="${address}"${styleAttribute}><v>${serial}</v></c>`);
        continue;
      }
      if (typeof cell.v === "number" && Number.isFinite(cell.v)) {
        cells.push(`<c r="${address}"${styleAttribute}><v>${cell.v}</v></c>`);
        continue;
      }
      if (typeof cell.v === "boolean") {
        cells.push(`<c r="${address}" t="b"${styleAttribute}><v>${cell.v ? 1 : 0}</v></c>`);
        continue;
      }
      cells.push(`<c r="${address}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${xmlEscape(cell.v)}</t></is></c>`);
    }
    const rowHeight = Number(rowMetadata[rowIndex]?.hpt);
    const heightAttributes = Number.isFinite(rowHeight) ? ` ht="${rowHeight}" customHeight="1"` : "";
    rows.push(`<row r="${rowIndex + 1}"${heightAttributes}>${cells.join("")}</row>`);
  }
  const merges = (worksheet["!merges"] || []).length
    ? `<mergeCells count="${worksheet["!merges"].length}">${worksheet["!merges"].map(range => `<mergeCell ref="${XLSX.utils.encode_range(range)}"/>`).join("")}</mergeCells>`
    : "";
  const margins = worksheet["!margins"] || {};
  const setup = worksheet["!pageSetup"] || {};
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="${xmlEscape(worksheet["!ref"] || "A1:A1")}"/>${views}<sheetFormatPr defaultRowHeight="15"/>${columns}
  <sheetData>${rows.join("")}</sheetData>${merges}
  <pageMargins left="${margins.left ?? 0.35}" right="${margins.right ?? 0.35}" top="${margins.top ?? 0.5}" bottom="${margins.bottom ?? 0.5}" header="${margins.header ?? 0.2}" footer="${margins.footer ?? 0.2}"/>
  <pageSetup paperSize="${setup.paperSize || 1}" orientation="${setup.orientation || "portrait"}" fitToWidth="${setup.fitToWidth ?? 1}" fitToHeight="${setup.fitToHeight ?? 0}"/>
</worksheet>`;
}

function styledWorkbookBytes(XLSX, workbook) {
  const sheetNames = Array.from(workbook.SheetNames || []);
  const created = workbook.Props?.CreatedDate instanceof Date && Number.isFinite(workbook.Props.CreatedDate.valueOf())
    ? workbook.Props.CreatedDate.toISOString()
    : new Date().toISOString();
  const files = [
    {
      name: "[Content_Types].xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetNames.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`
    },
    {
      name: "_rels/.rels",
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'
    },
    {
      name: "docProps/core.xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(workbook.Props?.Title || "Solution Decision Workbook")}</dc:title><dc:subject>${xmlEscape(workbook.Props?.Subject || "Solution decision package")}</dc:subject><dc:creator>${xmlEscape(workbook.Props?.Author || "Solution Architect Workbench")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(created)}</dcterms:created></cp:coreProperties>`
    },
    {
      name: "docProps/app.xml",
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Solution Architect Workbench</Application></Properties>'
    },
    {
      name: "xl/workbook.xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="0"/><sheets>${sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    },
    { name: "xl/styles.xml", xml: stylesXml() }
  ];
  sheetNames.forEach((name, index) => files.push({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    xml: worksheetXml(XLSX, workbook.Sheets[name])
  }));
  return storedZip(files);
}

function section(title, headers, rows, emptyLabel = "No records") {
  return { title, headers, rows, emptyLabel };
}

function sheetSubtitle(solution, prepared) {
  return `${text(solution.name, "Untitled solution")} · ${text(solution.customer, "Customer not recorded")} · Prepared ${prepared}`;
}

function slug(value) {
  return String(value || "solution")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "solution";
}

export function decisionWorkbookFilename(workspace, solutionId = workspace.activeSolutionId) {
  const solution = (workspace.solutions || []).find(record => record.id === solutionId);
  return `${slug(solution?.name)}-decision-workbook.xlsx`;
}

export function buildDecisionWorkbook(
  workspace,
  solutionId = workspace.activeSolutionId,
  { xlsx: explicitLibrary, preparedAt = new Date() } = {}
) {
  const XLSX = spreadsheetLibrary(explicitLibrary);
  const solution = (workspace.solutions || []).find(record => record.id === solutionId);
  if (!solution) throw new Error("Choose a valid solution before exporting an Excel workbook.");

  const preparedDate = preparedAt instanceof Date && Number.isFinite(preparedAt.valueOf()) ? preparedAt : new Date();
  const prepared = formatLocalDate(preparedDate);
  const subtitle = sheetSubtitle(solution, prepared);
  const stakeholders = scoped(workspace, "stakeholders", solutionId);
  const hotButtons = scoped(workspace, "hotButtons", solutionId);
  const outcomes = scoped(workspace, "outcomes", solutionId);
  const measures = scoped(workspace, "measures", solutionId);
  const requirements = scoped(workspace, "requirements", solutionId);
  const evidence = scoped(workspace, "evidence", solutionId);
  const criteria = scoped(workspace, "criteria", solutionId);
  const candidates = scoped(workspace, "candidates", solutionId);
  const winThemes = scoped(workspace, "winThemes", solutionId);
  const views = scoped(workspace, "architectureViews", solutionId);
  const elements = scoped(workspace, "elements", solutionId);
  const connections = scoped(workspace, "connections", solutionId);
  const trades = scoped(workspace, "trades", solutionId);
  const decisions = scoped(workspace, "decisions", solutionId);
  const risks = scoped(workspace, "risks", solutionId);
  const dependencies = scoped(workspace, "dependencies", solutionId);
  const assumptions = scoped(workspace, "assumptions", solutionId);
  const roadmap = scoped(workspace, "roadmapItems", solutionId);
  const reviews = scoped(workspace, "reviews", solutionId);
  const transitionActions = scoped(workspace, "transitionActions", solutionId);
  const readiness = buildReadiness(workspace, solutionId);
  const obligations = collectObligations(workspace, solutionId);

  const requirementById = new Map(requirements.map(record => [record.id, record]));
  const hotButtonById = new Map(hotButtons.map(record => [record.id, record]));
  const evidenceById = new Map(evidence.map(record => [record.id, record]));
  const candidateById = new Map(candidates.map(record => [record.id, record]));
  const viewById = new Map(views.map(record => [record.id, record]));
  const elementById = new Map(elements.map(record => [record.id, record]));

  const inventory = [
    ["Stakeholders", stakeholders.length], ["Customer signals", hotButtons.length], ["Outcomes", outcomes.length],
    ["Requirements", requirements.length], ["Evidence records", evidence.length], ["Technology candidates", candidates.length],
    ["Win themes", winThemes.length], ["Architecture views", views.length], ["Interfaces", connections.length],
    ["Trades", trades.length], ["Decisions", decisions.length], ["Open risks", risks.filter(record => record.status !== "Closed").length],
    ["Roadmap activities", roadmap.length], ["Reviews", reviews.length], ["Transition actions", transitionActions.length],
    ["Open obligations", obligations.length]
  ];

  const summarySheet = createReportSheet(XLSX, {
    title: "Executive Summary",
    subtitle,
    widths: [28, 72],
    sections: [
      section("Decision profile", ["Field", "Value"], [
        ["Solution", text(solution.name)], ["Customer", text(solution.customer, "Not recorded")],
        ["Domain", text(solution.domain, "Not recorded")], ["Lifecycle stage", text(solution.stage)],
        ["Working status", text(solution.status)], ["Prepared", dateCell(prepared)],
        ["Mission segments", (solution.missionSegments || []).map(value => text(value)).filter(Boolean).join("; ") || "None selected"],
        ["Decision requested", text(solution.decision, "Not recorded")], ["Executive description", text(solution.description, "Not recorded")]
      ]),
      section("Readiness snapshot", ["Metric", "Value"], [
        ["Overall coverage", percentCell(readiness.overall / 100)],
        ["Traceability", percentCell(readiness.traceability / 100)],
        ["Evidence coverage", percentCell(readiness.evidence / 100)],
        ["Element connectivity", percentCell(readiness.interfaces / 100)],
        ["Transition readiness", percentCell(readiness.transition / 100)]
      ]),
      section("Record inventory", ["Record type", "Count"], inventory)
    ]
  });

  const missionSheet = createReportSheet(XLSX, {
    title: "Mission & Outcomes",
    subtitle,
    widths: [28, 28, 48, 48],
    sections: [
      section("Mission brief", ["Topic", "Detail"], [
        ["Mission problem", text(solution.mission?.problem, "Not recorded")],
        ["Operational context", text(solution.mission?.operationalContext, "Not recorded")],
        ["Current state", text(solution.mission?.currentState, "Not recorded")],
        ["Desired state", text(solution.mission?.desiredState, "Not recorded")],
        ["Constraints", text(solution.mission?.constraints, "Not recorded")]
      ]),
      section("Stakeholders", ["Stakeholder", "Role", "Primary concern"], stakeholders.map(record => [
        text(record.name), text(record.role), text(record.concern)
      ])),
      section("Outcomes and trace", ["Outcome", "Verification method", "Linked requirements"], outcomes.map(record => [
        text(record.title), text(record.verificationMethod, "Not recorded"), joinNames(record.linkedRequirementIds, requirementById)
      ])),
      section("Measures", ["Measure", "Target", "Method"], measures.map(record => [
        text(record.name), text(record.target), text(record.method)
      ]))
    ]
  });

  const customerSheet = createReportSheet(XLSX, {
    title: "Customer & Win Themes",
    subtitle,
    widths: [34, 48, 32, 16, 16, 48, 48, 48],
    sections: [
      section("Customer hot buttons", ["Customer signal", "Detail", "Source", "Confidence", "Status", "Traced requirements"], hotButtons.map(record => [
        text(record.title), text(record.detail), text(record.source), text(record.confidence), text(record.status),
        requirements.filter(requirement => requirement.linkedHotButtonIds?.includes(record.id)).map(requirement => text(requirement.title)).join("; ") || "None"
      ])),
      section("Win themes", ["Win theme", "Customer value", "Discriminator", "Proof", "Customer signals", "Evidence", "Status"], winThemes.map(record => [
        text(record.title), text(record.customerValue), text(record.discriminator), text(record.proof),
        joinNames(record.linkedHotButtonIds, hotButtonById), joinNames(record.sourceEvidenceIds, evidenceById), text(record.status)
      ])),
      section("Proposal narrative", ["Artifact", "Content"], [
        ["Concept of operations", text(solution.proposal?.conops, "Not recorded")],
        ["Technical approach", text(solution.proposal?.technicalApproach, "Not recorded")],
        ["Discriminators", text(solution.proposal?.discriminators, "Not recorded")],
        ["Estimate assumptions", text(solution.proposal?.estimateAssumptions, "Not recorded")],
        ["Delivery commitments", text(solution.proposal?.deliveryCommitments, "Not recorded")]
      ])
    ]
  });

  const requirementsSheet = createReportSheet(XLSX, {
    title: "Requirements & Evidence",
    subtitle,
    widths: [48, 18, 14, 16, 32, 48, 40, 40, 22, 22],
    sections: [
      section("Requirements trace", ["Requirement", "Type", "Priority", "Status", "Source evidence", "Acceptance method", "Customer drivers", "Architecture trace"], requirements.map(record => [
        text(record.title), text(record.type), text(record.priority), text(record.status),
        text(evidenceById.get(record.sourceEvidenceId)?.title, "Untraced"), text(record.acceptanceMethod, "Not recorded"),
        joinNames(record.linkedHotButtonIds, hotButtonById), joinNames(record.linkedElementIds, elementById, "name")
      ])),
      section("Evidence register", ["Evidence", "Type", "Source", "Date", "Participants", "Mission segments", "Confidence", "Reference URL", "Notes"], evidence.map(record => [
        text(record.title), text(record.sourceType, "Other"), text(record.source), dateCell(record.meetingDate),
        (record.participants || []).map(value => text(value)).filter(Boolean).join("; ") || "None recorded",
        (record.missionSegments || []).map(value => text(value)).filter(Boolean).join("; ") || "None recorded",
        text(record.confidence), safeHttpUrl(record.url), text(record.notes)
      ]))
    ]
  });

  const candidateSummaryRows = [];
  const assessmentRows = [];
  for (const candidate of candidates) {
    const result = assessmentResult(workspace, solutionId, candidate.id);
    candidateSummaryRows.push([
      text(candidate.name), text(candidate.category), text(candidate.vendor), text(candidate.description), text(candidate.status),
      candidate.trl ?? "Unknown", candidate.mrl ?? "Unknown", candidate.irl ?? "Unknown", dateCell(candidate.readinessAsOf),
      text(candidate.readinessBasis), result.score === null ? "Unknown" : decimalCell(result.score),
      percentCell(result.coverage), percentCell(result.evidenceCoverage)
    ]);
    for (const row of result.rows) {
      assessmentRows.push([
        text(candidate.name), text(row.criterion.name), text(row.criterion.description),
        percentCell((Number(row.criterion.weight) || 0) / 100), row.value === null ? "Unknown" : row.value,
        text(row.rationale), joinNames(row.evidenceIds, evidenceById)
      ]);
    }
  }
  const assessmentSheet = createReportSheet(XLSX, {
    title: "Technology Assessment",
    subtitle,
    widths: [34, 28, 28, 48, 16, 12, 12, 12, 14, 52, 16, 14, 14],
    sections: [
      section("Candidate summaries", ["Candidate", "Category", "Vendor", "Description", "Status", "TRL", "MRL", "IRL", "Readiness as of", "Readiness basis", "Weighted score", "Assessed", "Evidenced"], candidateSummaryRows),
      section("Weighted criteria and evidence", ["Candidate", "Criterion", "Criterion description", "Weight", "Score", "Rationale", "Evidence"], assessmentRows)
    ]
  });

  const architectureSheet = createReportSheet(XLSX, {
    title: "Architecture & Interfaces",
    subtitle,
    widths: [32, 30, 48, 14, 14, 16, 16, 22, 26, 26, 40],
    sections: [
      section("Architecture views", ["View", "Template", "Description", "Width", "Height", "Elements", "Interfaces"], views.map(record => [
        text(record.name), text(VIEW_TEMPLATES.find(([value]) => value === record.template)?.[1] || record.template),
        text(record.description), record.width, record.height,
        elements.filter(element => element.viewId === record.id).length,
        connections.filter(connection => connection.viewId === record.id).length
      ])),
      section("Architecture elements", ["View", "Element", "Type", "Description", "X", "Y", "Width", "Height"], elements.map(record => [
        text(viewById.get(record.viewId)?.name, "Unresolved view"), text(record.name), text(record.type), text(record.description),
        record.x, record.y, record.width, record.height
      ])),
      section("Interface register", ["View", "Source", "Exchange", "Type", "Protocol", "Target", "Description"], connections.map(record => [
        text(viewById.get(record.viewId)?.name, "Unresolved view"), text(elementById.get(record.sourceElementId)?.name, "Unresolved source"),
        text(record.label), text(record.type), text(record.protocol), text(elementById.get(record.targetElementId)?.name, "Unresolved target"),
        text(record.description)
      ]))
    ]
  });

  const decisionsSheet = createReportSheet(XLSX, {
    title: "Decisions & Risk",
    subtitle,
    widths: [38, 48, 40, 48, 18, 24, 24],
    sections: [
      section("Trade studies", ["Trade study", "Decision question", "Options", "Recommendation", "Status"], trades.map(record => [
        text(record.title), text(record.question), joinNames(record.optionIds, candidateById, "name"), text(record.recommendation), text(record.status)
      ])),
      section("Decision record", ["Decision", "Status", "Owner", "Date", "Rationale", "Evidence"], decisions.map(record => [
        text(record.title), text(record.status), text(record.owner), dateCell(record.date), text(record.rationale), joinNames(record.evidenceIds, evidenceById)
      ])),
      section("Risks", ["Risk", "Likelihood", "Impact", "Owner", "Mitigation", "Status"], risks.map(record => [
        text(record.title), text(record.likelihood), text(record.impact), text(record.owner), text(record.mitigation), text(record.status)
      ])),
      section("Dependencies", ["Dependency", "Type", "Provider", "Owner", "Needed by", "Status", "Impact"], dependencies.map(record => [
        text(record.title), text(record.type), text(record.provider), text(record.owner), dateCell(record.neededBy), text(record.status), text(record.impact)
      ])),
      section("Assumptions", ["Assumption", "Owner", "Validation plan", "Status"], assumptions.map(record => [
        text(record.statement), text(record.owner), text(record.validationPlan), text(record.status)
      ]))
    ]
  });

  const deliverySheet = createReportSheet(XLSX, {
    title: "Delivery & Transition",
    subtitle,
    widths: [18, 42, 16, 16, 28, 18, 14, 46],
    sections: [
      section("Roadmap and gates", ["Stage", "Activity", "Start", "End", "Owner", "Status", "Gate"], roadmap.map(record => [
        text(record.stage), text(record.title), dateCell(record.start), dateCell(record.end), text(record.owner), text(record.status), record.gate ? "Yes" : "No"
      ])),
      section("Reviews", ["Review", "Type", "Due", "Owner", "Status", "Entry criteria"], reviews.map(record => [
        text(record.name), text(record.type), dateCell(record.due), text(record.owner), text(record.status), text(record.entryCriteria)
      ])),
      section("Transition actions", ["Transition action", "Owner", "Target or gate", "Status", "Blocker"], transitionActions.map(record => [
        text(record.title), text(record.owner), text(record.target), text(record.status), text(record.blocker, "No blocker recorded")
      ]))
    ]
  });

  const gapsSheet = createReportSheet(XLSX, {
    title: "Gaps & Readiness",
    subtitle,
    widths: [22, 18, 34, 72],
    sections: [
      section("Readiness metrics", ["Metric", "Value"], [
        ["Overall coverage", percentCell(readiness.overall / 100)], ["Traceability", percentCell(readiness.traceability / 100)],
        ["Evidence coverage", percentCell(readiness.evidence / 100)], ["Element connectivity", percentCell(readiness.interfaces / 100)],
        ["Transition readiness", percentCell(readiness.transition / 100)]
      ]),
      section("Open obligations", ["Lifecycle stage", "Severity", "Gap type", "Required action"], obligations.map(record => [
        text(record.stage), text(record.severity), text(record.kind).replaceAll("-", " "), text(record.message)
      ]), "No deterministic gaps detected")
    ]
  });

  const workbook = XLSX.utils.book_new();
  const sheets = [summarySheet, missionSheet, customerSheet, requirementsSheet, assessmentSheet, architectureSheet, decisionsSheet, deliverySheet, gapsSheet];
  DECISION_WORKBOOK_SHEET_NAMES.forEach((name, index) => XLSX.utils.book_append_sheet(workbook, sheets[index], name));
  workbook.Props = {
    Title: `${text(solution.name, "Solution")} — Decision Workbook`,
    Subject: "Solution decision package registers and traceability",
    Author: "Solution Architect Workbench",
    CreatedDate: preparedDate
  };
  return workbook;
}

export function writeDecisionWorkbook(workspace, solutionId = workspace.activeSolutionId, options = {}) {
  const XLSX = spreadsheetLibrary(options.xlsx);
  const workbook = buildDecisionWorkbook(workspace, solutionId, { ...options, xlsx: XLSX });
  return styledWorkbookBytes(XLSX, workbook);
}
