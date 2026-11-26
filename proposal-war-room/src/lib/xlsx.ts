// A workbook writer for one styled sheet, per the Excel section of the astrion-brand-2026 skill:
// header row Gunmetal with Bone JetBrains Mono 9 pt uppercase, body Archivo 10 pt Carbon, no fills on data rows,
// Steel rules, at most one highlighted row in Flare, and the font set on every cell that is written.
// The data is defined as an Excel Table with its header row frozen and filters on.

import { zipFiles } from "./zip.ts";

export interface SheetColumn {
  header: string;
  /** Column width in characters. */
  width: number;
  number?: boolean;
}

export interface SheetSpec {
  sheetName: string;
  /** The line above the table. Titles carry no closing period. */
  title: string;
  /** A mono line under the title: solicitation number, export date. */
  meta: string;
  tableName: string;
  columns: readonly SheetColumn[];
  rows: readonly (readonly (string | number | null)[])[];
  /** Index into `rows` of the one row washed in Flare, or null. */
  highlightRow?: number | null;
  creator?: string;
}

const COLOR = { carbon: "FF0B0D10", gunmetal: "FF171B22", bone: "FFEEEDE7", steel: "FF8A8F99", flare: "FFE2FDFF" };
/** Style ids, in the order of cellXfs below. */
const STYLE = { base: 0, title: 1, meta: 2, header: 3, text: 4, number: 5, textHighlight: 6, numberHighlight: 7 };
const HEADER_ROW = 4;

const esc = (value: string): string => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** A sheet title is a title: it loses a closing period. */
export const sheetTitle = (title: string): string => title.trim().replace(/[.\s]+$/, "");

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

function stylesXml(): string {
  const font = (name: string, size: number, color: string, bold = false): string => `<font>${bold ? "<b/>" : ""}<sz val="${size}"/><color rgb="${color}"/><name val="${name}"/><family val="${name === "Archivo" ? 2 : 3}"/></font>`;
  const fill = (color: string): string => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf = (fontId: number, fillId: number, borderId: number, alignment: string): string => `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1"${fillId ? ' applyFill="1"' : ""}${borderId ? ' applyBorder="1"' : ""} applyAlignment="1">${alignment}</xf>`;
  const top = '<alignment vertical="top" wrapText="1"/>';
  const topRight = '<alignment horizontal="right" vertical="top"/>';
  return `${XML}<styleSheet xmlns="${MAIN}">`
    + `<fonts count="4">${font("Archivo", 10, COLOR.carbon)}${font("Archivo", 14, COLOR.carbon, true)}${font("JetBrains Mono", 9, COLOR.gunmetal)}${font("JetBrains Mono", 9, COLOR.bone)}</fonts>`
    + `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill(COLOR.gunmetal)}${fill(COLOR.flare)}</fills>`
    + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="${COLOR.steel}"/></bottom><diagonal/></border></borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="8">'
    + xf(0, 0, 0, '<alignment vertical="top"/>')
    + xf(1, 0, 0, '<alignment vertical="center"/>')
    + xf(2, 0, 0, '<alignment vertical="center"/>')
    + xf(3, 2, 1, '<alignment horizontal="left" vertical="center" wrapText="1"/>')
    + xf(0, 0, 1, top)
    + xf(0, 0, 1, topRight)
    + xf(0, 3, 1, top)
    + xf(0, 3, 1, topRight)
    + "</cellXfs>"
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
    + "</styleSheet>";
}

/** Every part of the workbook as text, before it is zipped. Pure, so the layout can be tested without a browser. */
export function workbookParts(spec: SheetSpec): { path: string; content: string }[] {
  const columns = spec.columns;
  if (!columns.length) throw new Error("A sheet needs at least one column.");
  const headers = columns.map(column => column.header.trim().toUpperCase());
  if (new Set(headers).size !== headers.length) throw new Error("Table headers have to be unique.");
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const shared = (value: string): number => {
    let index = stringIndex.get(value);
    if (index === undefined) { index = strings.length; strings.push(value); stringIndex.set(value, index); }
    return index;
  };
  const textCell = (ref: string, value: string, style: number): string => `<c r="${ref}" s="${style}" t="s"><v>${shared(value)}</v></c>`;
  const lastColumn = columnName(columns.length - 1);
  const lastRow = HEADER_ROW + Math.max(1, spec.rows.length);
  const tableRef = `A${HEADER_ROW}:${lastColumn}${lastRow}`;

  const rowsXml: string[] = [
    `<row r="1" ht="24" customHeight="1">${textCell("A1", sheetTitle(spec.title), STYLE.title)}</row>`,
    `<row r="2" ht="16" customHeight="1">${textCell("A2", spec.meta.trim().toUpperCase(), STYLE.meta)}</row>`,
    `<row r="${HEADER_ROW}" ht="22" customHeight="1">${headers.map((header, index) => textCell(`${columnName(index)}${HEADER_ROW}`, header, STYLE.header)).join("")}</row>`,
  ];
  // A table needs one data row. An empty matrix gets a blank one, so the file still opens as a table.
  const dataRows = spec.rows.length ? spec.rows : [columns.map(() => "")];
  dataRows.forEach((row, rowIndex) => {
    const r = HEADER_ROW + 1 + rowIndex;
    const highlight = spec.highlightRow === rowIndex;
    let lines = 1;
    const cells = columns.map((column, index) => {
      const value = row[index] ?? "";
      const ref = `${columnName(index)}${r}`;
      if (column.number && typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${highlight ? STYLE.numberHighlight : STYLE.number}"><v>${value}</v></c>`;
      const text = String(value);
      const perLine = Math.max(4, Math.floor(column.width * 1.05));
      lines = Math.max(lines, text.split(/\r?\n/).reduce((total, part) => total + Math.max(1, Math.ceil(part.length / perLine)), 0));
      return textCell(ref, text, column.number ? (highlight ? STYLE.numberHighlight : STYLE.number) : highlight ? STYLE.textHighlight : STYLE.text);
    }).join("");
    rowsXml.push(`<row r="${r}" ht="${Math.min(409, Math.max(16, lines * 13.5 + 3))}" customHeight="1">${cells}</row>`);
  });

  const sheet = `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}">`
    + `<dimension ref="A1:${lastColumn}${lastRow}"/>`
    + `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${HEADER_ROW + 1}" sqref="A${HEADER_ROW + 1}"/></sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1" style="${STYLE.base}"/>`).join("")}</cols>`
    + `<sheetData>${rowsXml.join("")}</sheetData>`
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup orientation="landscape" fitToHeight="0"/>'
    + '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>'
    + "</worksheet>";

  const table = `${XML}<table xmlns="${MAIN}" id="1" name="${esc(spec.tableName)}" displayName="${esc(spec.tableName)}" ref="${tableRef}" totalsRowShown="0">`
    + `<autoFilter ref="${tableRef}"/>`
    + `<tableColumns count="${headers.length}">${headers.map((header, index) => `<tableColumn id="${index + 1}" name="${esc(header)}"/>`).join("")}</tableColumns>`
    + '<tableStyleInfo showFirstColumn="0" showLastColumn="0" showRowStripes="0" showColumnStripes="0"/>'
    + "</table>";

  const sharedStrings = `${XML}<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings.map(value => `<si><t xml:space="preserve">${esc(value)}</t></si>`).join("")}</sst>`;
  const sheetName = esc(spec.sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");

  return [
    { path: "[Content_Types].xml", content: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { path: "_rels/.rels", content: `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { path: "docProps/core.xml", content: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(sheetTitle(spec.title))}</dc:title><dc:creator>${esc(spec.creator ?? "Proposal War Room")}</dc:creator></cp:coreProperties>` },
    { path: "docProps/app.xml", content: `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Proposal War Room</Application></Properties>` },
    { path: "xl/workbook.xml", content: `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { path: "xl/_rels/workbook.xml.rels", content: `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { path: "xl/worksheets/sheet1.xml", content: sheet },
    { path: "xl/worksheets/_rels/sheet1.xml.rels", content: `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/table" Target="../tables/table1.xml"/></Relationships>` },
    { path: "xl/tables/table1.xml", content: table },
    { path: "xl/styles.xml", content: stylesXml() },
    { path: "xl/sharedStrings.xml", content: sharedStrings },
  ];
}

export async function writeXlsx(spec: SheetSpec): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return zipFiles(workbookParts(spec).map(part => ({ path: part.path, data: encoder.encode(part.content) })));
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
