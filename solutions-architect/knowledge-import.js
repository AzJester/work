import {
  KNOWLEDGE_LIFECYCLE_STATUSES,
  KNOWLEDGE_OFFERING_TYPES,
  MAX_KNOWLEDGE_IMPORT_BYTES,
  createKnowledgeItem,
  validateKnowledgeBase
} from "./knowledge-base.js?v=15";

export const KNOWLEDGE_IMPORT_CSV_MIME = "text/csv;charset=utf-8";
export const KNOWLEDGE_IMPORT_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const KNOWLEDGE_IMPORT_CSV_ACCEPT = ".csv,text/csv,application/csv";
export const KNOWLEDGE_IMPORT_EXCEL_ACCEPT = `.xlsx,${KNOWLEDGE_IMPORT_XLSX_MIME}`;
export const KNOWLEDGE_IMPORT_FILE_ACCEPT = `${KNOWLEDGE_IMPORT_CSV_ACCEPT},${KNOWLEDGE_IMPORT_EXCEL_ACCEPT}`;
export const MAX_KNOWLEDGE_IMPORT_ROWS = 1_001; // One header plus the catalog's 1,000-record ceiling.
export const MAX_KNOWLEDGE_IMPORT_COLUMNS = 100;
export const MAX_KNOWLEDGE_IMPORT_CELLS = 100_000;

function column(key, header, aliases, description, example = "") {
  return Object.freeze({ key, header, aliases: Object.freeze(aliases), description, example });
}

export const KNOWLEDGE_IMPORT_COLUMNS = Object.freeze([
  column("catalogId", "Catalog ID", ["catalog id", "catalog_id", "offering id", "offering_id", "record id"], "Leave blank to create an offering. Use an existing catalog ID only for explicit upsert updates."),
  column("expectedRevision", "Expected Revision", ["expected revision", "expected_revision", "current revision", "catalog revision", "revision"], "Required for an update and must match the current catalog revision."),
  column("name", "Name", ["name", "solution name", "solution_name", "offering name", "product name", "application name"], "Required offering, product, application, software, service, or platform name.", "Example mission application"),
  column("offeringType", "Offering Type", ["offering type", "offering_type", "solution type", "product type", "category", "type"], `One of: ${KNOWLEDGE_OFFERING_TYPES.join(", ")}.`, "Application"),
  column("provider", "Provider / Owner", ["provider / owner", "provider owner", "provider_owner", "provider", "owner", "vendor", "manufacturer"], "Organization that provides or owns the offering.", "Example provider"),
  column("version", "Version / Release", ["version / release", "version release", "version_release", "version", "release"], "Current version, release, or configuration baseline.", "1.0"),
  column("lifecycleStatus", "Lifecycle Status", ["lifecycle status", "lifecycle_status", "lifecycle", "product lifecycle", "status"], `One of: ${KNOWLEDGE_LIFECYCLE_STATUSES.join(", ")}.`, "Current"),
  column("summary", "Summary", ["summary", "description", "overview", "synopsis"], "Concise description of the offering and its purpose.", "Reusable unclassified example."),
  column("capabilities", "Capabilities", ["capabilities", "capability", "key capabilities", "features"], "Separate multiple values with semicolons or line breaks, or use a JSON string array.", "Mission planning; Interface verification"),
  column("missionSegments", "Mission Segments", ["mission segments", "mission_segments", "mission segment", "mission areas", "mission area"], "Use exact Workbench mission-segment names; separate multiple values with semicolons or line breaks."),
  column("deploymentAndEnvironment", "Deployment and Environment", ["deployment and environment", "deployment & environment", "deployment environment", "deployment_environment", "deployment", "environment"], "Deployment model and relevant operating environments."),
  column("interfaces", "Interfaces", ["interfaces", "interface", "interface summary"], "Physical, electrical, RF, network, API, data, and human/process interfaces."),
  column("integrationConsiderations", "Integration Considerations", ["integration considerations", "integration_considerations", "integration notes", "integration constraints"], "Dependencies, constraints, and integration considerations."),
  column("cyberSafetyConsiderations", "Cyber and Safety Considerations", ["cyber and safety considerations", "cyber & safety considerations", "cyber_safety_considerations", "cybersecurity and safety", "cybersecurity", "cyber / safety"], "Relevant cybersecurity, software-assurance, authorization, and safety considerations."),
  column("mosaDataRights", "MOSA and Data Rights", ["mosa and data rights", "mosa & data rights", "mosa_data_rights", "mosa", "data rights", "modular open systems approach"], "Modular boundaries, open interfaces, standards, competition, and necessary data rights."),
  column("trl", "Technology Readiness Level", ["technology readiness level", "technology readiness", "trl"], "Integer 1-9, or blank when unknown."),
  column("mrl", "Manufacturing Readiness Level", ["manufacturing readiness level", "manufacturing readiness", "mrl"], "Integer 1-10, or blank when unknown."),
  column("irl", "Integration Readiness Level", ["integration readiness level", "integration readiness", "irl"], "Integer 0-9, or blank when unknown."),
  column("readinessBasis", "Readiness Basis", ["readiness basis", "readiness_basis", "maturity basis", "readiness rationale"], "Evidence and rationale supporting the readiness values."),
  column("readinessAsOf", "Readiness As Of", ["readiness as of", "readiness as-of", "readiness_as_of", "readiness date", "assessment date"], "YYYY-MM-DD or blank."),
  column("sourceTitle", "Source Title", ["source title", "source_title", "reference title", "document title", "source"], "Title of the supporting source."),
  column("sourceUrl", "Source URL", ["source url", "source_url", "source link", "reference url", "url", "link"], "HTTP or HTTPS URL without embedded credentials."),
  column("sourceNotes", "Source Notes", ["source notes", "source_notes", "reference notes", "citation notes"], "Notes about provenance, limits, or source interpretation."),
  column("tags", "Tags", ["tags", "tag", "keywords", "labels"], "Separate multiple values with semicolons or line breaks, or use a JSON string array."),
  column("reviewedAt", "Last Reviewed", ["last reviewed", "last_reviewed", "reviewed at", "reviewed_at", "review date"], "YYYY-MM-DD or blank."),
  column("changeSummary", "Change Summary", ["change summary", "change_summary", "change notes", "update summary", "revision notes"], "Required when an existing Catalog ID is materially updated.")
]);

const COLUMN_BY_KEY = new Map(KNOWLEDGE_IMPORT_COLUMNS.map(record => [record.key, record]));
const RECORD_FIELD_KEYS = Object.freeze(KNOWLEDGE_IMPORT_COLUMNS
  .map(record => record.key)
  .filter(key => !["catalogId", "expectedRevision"].includes(key)));
const LIST_FIELDS = new Set(["capabilities", "missionSegments", "tags"]);
const READINESS_FIELDS = new Set(["trl", "mrl", "irl"]);
const DATE_FIELDS = new Set(["readinessAsOf", "reviewedAt"]);
const MATERIAL_FIELDS = Object.freeze(RECORD_FIELD_KEYS.filter(key => key !== "changeSummary"));
const OFFERING_TYPE_LOOKUP = new Map(KNOWLEDGE_OFFERING_TYPES.map(value => [value.toLowerCase(), value]));
const LIFECYCLE_LOOKUP = new Map(KNOWLEDGE_LIFECYCLE_STATUSES.map(value => [value.toLowerCase(), value]));

function diagnostic(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function errorCount(diagnostics) {
  return diagnostics.filter(item => item.severity === "error").length;
}

function warningCount(diagnostics) {
  return diagnostics.filter(item => item.severity === "warning").length;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const HEADER_ALIASES = (() => {
  const aliases = new Map();
  for (const record of KNOWLEDGE_IMPORT_COLUMNS) {
    for (const value of [record.header, record.key, ...record.aliases]) {
      const token = normalizeHeader(value);
      const prior = aliases.get(token);
      if (prior && prior !== record.key) throw new Error(`Knowledge import header alias ${value} is ambiguous.`);
      aliases.set(token, record.key);
    }
  }
  return aliases;
})();

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function utf8Text(input) {
  if (typeof input === "string") {
    if (byteLength(input) > MAX_KNOWLEDGE_IMPORT_BYTES) throw new Error(`CSV exceeds the ${MAX_KNOWLEDGE_IMPORT_BYTES.toLocaleString()}-byte import limit.`);
    return input.replace(/^\uFEFF/, "");
  }
  let bytes;
  if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  else throw new TypeError("CSV input must be text, an ArrayBuffer, or an ArrayBuffer view.");
  if (bytes.byteLength > MAX_KNOWLEDGE_IMPORT_BYTES) throw new Error(`CSV exceeds the ${MAX_KNOWLEDGE_IMPORT_BYTES.toLocaleString()}-byte import limit.`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("CSV must use valid UTF-8 encoding.");
  }
}

function validateLimits(options = {}) {
  const limits = {
    maxRows: options.maxRows ?? MAX_KNOWLEDGE_IMPORT_ROWS,
    maxColumns: options.maxColumns ?? MAX_KNOWLEDGE_IMPORT_COLUMNS,
    maxCells: options.maxCells ?? MAX_KNOWLEDGE_IMPORT_CELLS
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return limits;
}

function assertTableBounds(rows, limits) {
  if (rows.length > limits.maxRows) throw new Error(`Import exceeds the ${limits.maxRows.toLocaleString()}-row limit, including the header.`);
  let cells = 0;
  let columns = 0;
  rows.forEach(row => {
    if (!Array.isArray(row)) throw new TypeError("Import rows must be arrays.");
    if (row.length > limits.maxColumns) throw new Error(`Import exceeds the ${limits.maxColumns.toLocaleString()}-column limit.`);
    columns = Math.max(columns, row.length);
    cells += row.length;
    if (cells > limits.maxCells) throw new Error(`Import exceeds the ${limits.maxCells.toLocaleString()}-cell limit.`);
  });
  return { cells, columns };
}

function tableResult(rows, sourceType, details, limits) {
  if (!rows.length) throw new Error("Import contains no header row.");
  const bounded = assertTableBounds(rows, limits);
  const headers = Array.from(rows[0], value => String(value ?? "").replace(/^\uFEFF/, ""));
  if (!headers.some(value => value.trim())) throw new Error("Import header row is blank.");
  return {
    sourceType,
    sheetName: details.sheetName ?? null,
    headerRow: details.headerRow ?? 1,
    headers,
    rows: rows.slice(1).map(row => Array.from(row)),
    diagnostics: [...(details.diagnostics || [])],
    rowCount: Math.max(0, rows.length - 1),
    columnCount: bounded.columns,
    cellCount: bounded.cells
  };
}

export function parseKnowledgeCsv(input, options = {}) {
  const limits = validateLimits(options);
  const text = utf8Text(input);
  if (text.includes("\u0000")) throw new Error("CSV contains unsupported null characters.");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;
  let endedWithRowBreak = false;

  const appendField = () => {
    row.push(field);
    field = "";
    quoteClosed = false;
    if (row.length > limits.maxColumns) throw new Error(`CSV exceeds the ${limits.maxColumns.toLocaleString()}-column limit.`);
  };
  const appendRow = () => {
    appendField();
    rows.push(row);
    row = [];
    if (rows.length > limits.maxRows) throw new Error(`CSV exceeds the ${limits.maxRows.toLocaleString()}-row limit, including the header.`);
    const cells = rows.reduce((total, current) => total + current.length, 0);
    if (cells > limits.maxCells) throw new Error(`CSV exceeds the ${limits.maxCells.toLocaleString()}-cell limit.`);
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    endedWithRowBreak = false;
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else { inQuotes = false; quoteClosed = true; }
      } else if (character === "\r") {
        if (text[index + 1] === "\n") index += 1;
        field += "\n";
      } else field += character;
      continue;
    }
    if (quoteClosed && ![",", "\r", "\n"].includes(character)) throw new Error("CSV has characters after a closing quote.");
    if (character === '"') {
      if (field.length) throw new Error("CSV contains a quote inside an unquoted field.");
      inQuotes = true;
    } else if (character === ",") appendField();
    else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      appendRow();
      endedWithRowBreak = true;
    } else field += character;
  }
  if (inQuotes) throw new Error("CSV contains an unterminated quoted field.");
  if (!endedWithRowBreak || row.length || field.length || quoteClosed) appendRow();
  return tableResult(rows, "csv", {}, limits);
}

function sheetMetadata(workbook, name, index) {
  const sheets = workbook?.Workbook?.Sheets;
  if (!Array.isArray(sheets)) return null;
  return sheets.find(record => String(record?.name ?? record?.Name ?? "") === name) || sheets[index] || null;
}

function sheetIsHidden(workbook, name, index) {
  return Number(sheetMetadata(workbook, name, index)?.Hidden || 0) !== 0;
}

function selectedSheetName(workbook, explicitName) {
  if (!Array.isArray(workbook?.SheetNames) || !workbook.SheetNames.length) throw new Error("Workbook contains no worksheets.");
  const visible = workbook.SheetNames.filter((name, index) => !sheetIsHidden(workbook, name, index) && workbook.Sheets?.[name]);
  if (!visible.length) throw new Error("Workbook contains no visible worksheets.");
  if (explicitName) {
    const exact = workbook.SheetNames.find(name => name === explicitName);
    if (!exact || !workbook.Sheets?.[exact]) throw new Error(`Worksheet ${String(explicitName).slice(0, 120)} was not found.`);
    const index = workbook.SheetNames.indexOf(exact);
    if (sheetIsHidden(workbook, exact, index)) throw new Error(`Worksheet ${String(explicitName).slice(0, 120)} is hidden and cannot be imported.`);
    return { name: exact, usedFallback: false };
  }
  const preferred = visible.find(name => name.toLowerCase() === "solutions");
  return { name: preferred || visible[0], usedFallback: !preferred };
}

function hiddenIndex(dimensions, start, end) {
  if (!Array.isArray(dimensions)) return -1;
  for (let index = start; index <= end; index += 1) if (dimensions[index]?.hidden) return index;
  return -1;
}

export function parseKnowledgeWorkbook(workbook, options = {}) {
  const limits = validateLimits(options);
  const xlsx = options.xlsx || globalThis.XLSX;
  if (!xlsx?.utils?.decode_range || !xlsx?.utils?.encode_range || !xlsx?.utils?.sheet_to_json) {
    throw new Error("The repository-bundled SheetJS library is unavailable.");
  }
  if (!workbook || typeof workbook !== "object" || !workbook.Sheets || typeof workbook.Sheets !== "object") {
    throw new TypeError("A parsed SheetJS workbook is required.");
  }
  if (workbook.vbaraw) throw new Error("Macro-enabled workbooks are not supported.");
  const selection = selectedSheetName(workbook, options.sheetName);
  const sheet = workbook.Sheets[selection.name];
  if (!sheet?.["!ref"]) throw new Error(`Worksheet ${selection.name} contains no used range.`);
  let range;
  try { range = xlsx.utils.decode_range(sheet["!ref"]); }
  catch { throw new Error(`Worksheet ${selection.name} has an invalid used range.`); }
  const height = range.e.r - range.s.r + 1;
  const width = range.e.c - range.s.c + 1;
  const rectangularCells = height * width;
  if (!Number.isSafeInteger(height) || !Number.isSafeInteger(width) || height < 1 || width < 1) throw new Error(`Worksheet ${selection.name} has an invalid used range.`);
  if (height > limits.maxRows) throw new Error(`Worksheet ${selection.name} exceeds the ${limits.maxRows.toLocaleString()}-row limit, including the header.`);
  if (width > limits.maxColumns) throw new Error(`Worksheet ${selection.name} exceeds the ${limits.maxColumns.toLocaleString()}-column limit.`);
  if (!Number.isSafeInteger(rectangularCells) || rectangularCells > limits.maxCells) throw new Error(`Worksheet ${selection.name} exceeds the ${limits.maxCells.toLocaleString()}-cell limit.`);
  const hiddenRow = hiddenIndex(sheet["!rows"], range.s.r, range.e.r);
  if (hiddenRow >= 0) throw new Error(`Worksheet ${selection.name} contains hidden row ${hiddenRow + 1} in the selected range.`);
  const hiddenColumn = hiddenIndex(sheet["!cols"], range.s.c, range.e.c);
  if (hiddenColumn >= 0) throw new Error(`Worksheet ${selection.name} contains a hidden column in the selected range.`);
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    if (cell && typeof cell === "object" && (Object.hasOwn(cell, "f") || Object.hasOwn(cell, "F"))) {
      throw new Error(`Worksheet ${selection.name} contains a formula at ${address}; formulas are not supported.`);
    }
  }
  let extracted;
  try {
    // SheetJS may lazily add formatted-value fields while converting cells.
    // Parse a disposable clone so previewing an import never changes the
    // caller's workbook object or makes a later security comparison ambiguous.
    const extractionSheet = structuredClone(sheet);
    extracted = xlsx.utils.sheet_to_json(extractionSheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
      dateNF: "yyyy-mm-dd",
      range: xlsx.utils.encode_range(range)
    });
  } catch {
    throw new Error(`Worksheet ${selection.name} could not be converted to import rows.`);
  }
  const rows = Array.from(extracted, source => Array.from(source));
  const diagnostics = selection.usedFallback
    ? [diagnostic("info", "workbook-sheet-fallback", `Imported the first visible worksheet, ${selection.name}, because no visible Solutions worksheet was found.`, { sheetName: selection.name })]
    : [];
  return tableResult(rows, "xlsx", { sheetName: selection.name, headerRow: range.s.r + 1, diagnostics }, limits);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildKnowledgeCsvTemplate({ includeExample = false } = {}) {
  const rows = [KNOWLEDGE_IMPORT_COLUMNS.map(record => record.header)];
  if (includeExample) rows.push(KNOWLEDGE_IMPORT_COLUMNS.map(record => record.example));
  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function mapKnowledgeHeaders(headers) {
  const diagnostics = [];
  const mapping = Object.create(null);
  if (!Array.isArray(headers)) return { valid: false, mapping, diagnostics: [diagnostic("error", "invalid-headers", "Import headers must be an array.")] };
  if (headers.length > MAX_KNOWLEDGE_IMPORT_COLUMNS) diagnostics.push(diagnostic("error", "too-many-columns", `Import exceeds the ${MAX_KNOWLEDGE_IMPORT_COLUMNS.toLocaleString()}-column limit.`));
  headers.forEach((value, index) => {
    const display = String(value ?? "").replace(/^\uFEFF/, "").trim();
    if (!display) return;
    const key = HEADER_ALIASES.get(normalizeHeader(display));
    if (!key) {
      diagnostics.push(diagnostic("warning", "unknown-header", `Column ${display} is not recognized and will not be imported.`, { column: index + 1, header: display }));
      return;
    }
    if (Object.hasOwn(mapping, key)) {
      diagnostics.push(diagnostic("error", "duplicate-header", `${COLUMN_BY_KEY.get(key).header} is mapped by more than one column.`, { column: index + 1, header: display }));
      return;
    }
    mapping[key] = index;
  });
  if (!Object.hasOwn(mapping, "name")) diagnostics.push(diagnostic("error", "missing-name-header", "A Name column is required."));
  return { valid: errorCount(diagnostics) === 0, mapping, diagnostics };
}

export function parseKnowledgeListCell(value) {
  if (value === null || value === undefined || value === "") return [];
  let values;
  if (Array.isArray(value)) values = value;
  else {
    const text = String(value).trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { throw new Error("must be a valid JSON string array or use semicolons or line breaks."); }
      if (!Array.isArray(parsed)) throw new Error("must be a JSON string array or use semicolons or line breaks.");
      values = parsed;
    } else values = text.split(/;|\r?\n|\r/g);
  }
  return values.map((item, index) => {
    if (typeof item !== "string") throw new Error(`contains a non-text value at position ${index + 1}.`);
    const trimmed = item.trim();
    if (!trimmed) throw new Error(`contains a blank value at position ${index + 1}.`);
    return trimmed;
  });
}

function scalarText(value, fieldName) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") throw new Error(`${fieldName} must be text or a number.`);
  return String(value).trim();
}

function readinessValue(value, fieldName) {
  const text = scalarText(value, fieldName);
  if (!text || /^(?:unknown|n\/?a|not assessed)$/i.test(text)) return null;
  if (!/^[+-]?\d+$/.test(text)) throw new Error(`${fieldName} must be a whole number or blank.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${fieldName} must be a safe whole number.`);
  return parsed;
}

function revisionValue(value) {
  const text = scalarText(value, "Expected Revision");
  if (!text) return null;
  if (!/^\d+$/.test(text)) throw new Error("Expected Revision must be a positive whole number.");
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Expected Revision must be a positive safe integer.");
  return parsed;
}

function canonicalEnum(value, lookup) {
  const text = scalarText(value, "Value");
  return lookup.get(text.toLowerCase()) || text;
}

function parsedCell(key, value) {
  if (LIST_FIELDS.has(key)) return parseKnowledgeListCell(value);
  if (READINESS_FIELDS.has(key)) return readinessValue(value, COLUMN_BY_KEY.get(key).header);
  if (key === "expectedRevision") return revisionValue(value);
  if (key === "offeringType") return canonicalEnum(value, OFFERING_TYPE_LOOKUP);
  if (key === "lifecycleStatus") return canonicalEnum(value, LIFECYCLE_LOOKUP);
  const result = scalarText(value, COLUMN_BY_KEY.get(key)?.header || key);
  if (DATE_FIELDS.has(key) && result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${COLUMN_BY_KEY.get(key).header} must use YYYY-MM-DD or be blank.`);
  return result;
}

function rowIsBlank(row) {
  return row.every(value => value === null || value === undefined || String(value).trim() === "");
}

function assertParsedTable(parsed) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) throw new TypeError("A parsed knowledge import table is required.");
  const limits = validateLimits();
  assertTableBounds([parsed.headers, ...parsed.rows], limits);
}

export function normalizeKnowledgeImportRows(parsed) {
  assertParsedTable(parsed);
  const mapped = mapKnowledgeHeaders(parsed.headers);
  const diagnostics = [...(Array.isArray(parsed.diagnostics) ? parsed.diagnostics : []), ...mapped.diagnostics];
  const rows = [];
  let blankRows = 0;
  const headerRow = Number.isSafeInteger(parsed.headerRow) && parsed.headerRow > 0 ? parsed.headerRow : 1;
  parsed.rows.forEach((source, index) => {
    const row = Array.from(source);
    const rowNumber = headerRow + index + 1;
    if (row.length > parsed.headers.length && row.slice(parsed.headers.length).some(value => String(value ?? "").trim())) {
      diagnostics.push(diagnostic("error", "data-beyond-headers", `Row ${rowNumber} contains data beyond the last header.`, { row: rowNumber }));
    }
    if (rowIsBlank(row)) { blankRows += 1; return; }
    const values = Object.create(null);
    const presentFields = [];
    let catalogId = "";
    let expectedRevision = null;
    for (const [key, columnIndex] of Object.entries(mapped.mapping)) {
      try {
        const value = parsedCell(key, row[columnIndex] ?? "");
        if (key === "catalogId") catalogId = value;
        else if (key === "expectedRevision") expectedRevision = value;
        else { values[key] = value; presentFields.push(key); }
      } catch (error) {
        diagnostics.push(diagnostic("error", "invalid-cell", `Row ${rowNumber}, ${COLUMN_BY_KEY.get(key).header}: ${error.message}`, { row: rowNumber, column: columnIndex + 1, field: key }));
      }
    }
    if (!String(values.name ?? "").trim()) diagnostics.push(diagnostic("error", "missing-name", `Row ${rowNumber}: Name is required.`, { row: rowNumber, field: "name" }));
    rows.push({ rowNumber, catalogId, expectedRevision, values, presentFields });
  });
  return {
    valid: errorCount(diagnostics) === 0,
    rows,
    diagnostics,
    counts: { inputRows: parsed.rows.length, dataRows: rows.length, blankRows }
  };
}

function valuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
  return left === right;
}

function logicalPart(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function logicalKey(item) {
  return `${logicalPart(item.name)}\u0000${logicalPart(item.provider)}`;
}

function duplicateLogicalDiagnostics(items, rowById = new Map()) {
  const diagnostics = [];
  const seen = new Map();
  for (const item of items) {
    const key = logicalKey(item);
    if (!logicalPart(item.name)) continue;
    const prior = seen.get(key);
    if (prior && prior.id !== item.id) {
      const importedItem = rowById.has(item.id) ? item : rowById.has(prior.id) ? prior : item;
      const otherItem = importedItem === item ? prior : item;
      const row = rowById.get(importedItem.id);
      diagnostics.push(diagnostic("error", "duplicate-logical-offering", `${row ? `Row ${row}: ` : ""}Name and Provider / Owner duplicate catalog item ${otherItem.id}; use unique offering identity data or the existing Catalog ID.`, { ...(row ? { row } : {}), catalogId: importedItem.id, conflictingCatalogId: otherItem.id }));
    } else seen.set(key, item);
  }
  return diagnostics;
}

function planResult({ diagnostics, normalized, created, updated, unchanged, nextCatalog }) {
  const errors = errorCount(diagnostics);
  const warnings = warningCount(diagnostics);
  return {
    valid: errors === 0,
    diagnostics,
    counts: {
      inputRows: normalized.counts.inputRows,
      dataRows: normalized.counts.dataRows,
      blankRows: normalized.counts.blankRows,
      created,
      updated,
      unchanged,
      errors,
      warnings
    },
    nextCatalog: errors === 0 ? nextCatalog : null
  };
}

function defaultIdFactory() {
  return createKnowledgeItem().id;
}

export function buildKnowledgeImportPlan(catalog, parsed, { mode = "add", generatedAt = new Date(), idFactory = defaultIdFactory } = {}) {
  if (!["add", "upsert"].includes(mode)) throw new TypeError("Knowledge import mode must be add or upsert.");
  if (typeof idFactory !== "function") throw new TypeError("Knowledge import idFactory must be a function.");
  const normalized = normalizeKnowledgeImportRows(parsed);
  const diagnostics = [...normalized.diagnostics];
  const catalogValidation = validateKnowledgeBase(catalog);
  if (!catalogValidation.valid) {
    catalogValidation.errors.forEach(message => diagnostics.push(diagnostic("error", "invalid-catalog", `Current Knowledge Base: ${message}`)));
  }
  let timestamp;
  try {
    timestamp = (generatedAt instanceof Date ? generatedAt : new Date(generatedAt)).toISOString();
  } catch {
    diagnostics.push(diagnostic("error", "invalid-generated-at", "The import timestamp is invalid."));
  }
  if (catalogValidation.valid) diagnostics.push(...duplicateLogicalDiagnostics(catalog.items));
  const initialErrors = errorCount(diagnostics);
  if (initialErrors) return planResult({ diagnostics, normalized, created: 0, updated: 0, unchanged: 0, nextCatalog: null });

  const nextCatalog = structuredClone(catalog);
  const existingById = new Map(nextCatalog.items.map((item, index) => [item.id, { item, index }]));
  const importedIds = new Map();
  const rowById = new Map();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of normalized.rows) {
    const { rowNumber, catalogId, expectedRevision, values, presentFields } = row;
    const normalizedCatalogId = String(catalogId || "").trim();
    if (normalizedCatalogId) {
      const priorIdRow = importedIds.get(normalizedCatalogId);
      if (priorIdRow) diagnostics.push(diagnostic("error", "duplicate-import-id", `Row ${rowNumber} repeats Catalog ID ${normalizedCatalogId} from row ${priorIdRow}.`, { row: rowNumber, conflictingRow: priorIdRow, catalogId: normalizedCatalogId }));
      else importedIds.set(normalizedCatalogId, rowNumber);
      const existing = existingById.get(normalizedCatalogId);
      if (!existing) {
        diagnostics.push(diagnostic("error", "unknown-catalog-id", `Row ${rowNumber}: Catalog ID ${normalizedCatalogId} does not exist. Leave Catalog ID blank to create an offering.`, { row: rowNumber, catalogId: normalizedCatalogId }));
        continue;
      }
      if (mode !== "upsert") {
        diagnostics.push(diagnostic("error", "update-requires-upsert", `Row ${rowNumber}: Catalog ID ${normalizedCatalogId} can only be updated in upsert mode.`, { row: rowNumber, catalogId: normalizedCatalogId }));
        continue;
      }
      if (expectedRevision === null) {
        diagnostics.push(diagnostic("error", "missing-expected-revision", `Row ${rowNumber}: Expected Revision is required to update ${normalizedCatalogId}.`, { row: rowNumber, catalogId: normalizedCatalogId }));
        continue;
      }
      if (expectedRevision !== existing.item.revision) {
        diagnostics.push(diagnostic("error", "stale-revision", `Row ${rowNumber}: Expected Revision ${expectedRevision} does not match current revision ${existing.item.revision} for ${normalizedCatalogId}.`, { row: rowNumber, catalogId: normalizedCatalogId, expectedRevision, currentRevision: existing.item.revision }));
        continue;
      }
      const patch = Object.fromEntries(presentFields.map(key => [key, values[key]]));
      const candidate = createKnowledgeItem({ ...existing.item, ...patch, id: existing.item.id, revision: existing.item.revision, createdAt: existing.item.createdAt, updatedAt: existing.item.updatedAt }, timestamp);
      const changedFields = MATERIAL_FIELDS.filter(key => Object.hasOwn(patch, key) && !valuesEqual(existing.item[key], candidate[key]));
      if (!changedFields.length) {
        unchanged += 1;
        diagnostics.push(diagnostic("info", "unchanged-row", `Row ${rowNumber}: ${existing.item.name} has no material changes and will be skipped.`, { row: rowNumber, catalogId: normalizedCatalogId }));
        rowById.set(normalizedCatalogId, rowNumber);
        continue;
      }
      if (!Object.hasOwn(patch, "changeSummary") || !String(patch.changeSummary || "").trim()) {
        diagnostics.push(diagnostic("error", "missing-change-summary", `Row ${rowNumber}: Change Summary is required for a material update.`, { row: rowNumber, catalogId: normalizedCatalogId, changedFields }));
        continue;
      }
      if (!Number.isSafeInteger(existing.item.revision) || existing.item.revision >= Number.MAX_SAFE_INTEGER) {
        diagnostics.push(diagnostic("error", "revision-overflow", `Row ${rowNumber}: Revision for ${normalizedCatalogId} cannot be advanced safely.`, { row: rowNumber, catalogId: normalizedCatalogId }));
        continue;
      }
      const replacement = createKnowledgeItem({ ...candidate, revision: existing.item.revision + 1, changeSummary: patch.changeSummary, createdAt: existing.item.createdAt, updatedAt: timestamp }, timestamp);
      nextCatalog.items[existing.index] = replacement;
      existingById.set(normalizedCatalogId, { item: replacement, index: existing.index });
      rowById.set(normalizedCatalogId, rowNumber);
      updated += 1;
      continue;
    }

    if (expectedRevision !== null) {
      diagnostics.push(diagnostic("error", "revision-without-id", `Row ${rowNumber}: Expected Revision must be blank when Catalog ID is blank.`, { row: rowNumber }));
      continue;
    }
    let generatedId;
    try { generatedId = String(idFactory("offering", rowNumber) ?? "").trim(); }
    catch (error) {
      diagnostics.push(diagnostic("error", "id-generation-failed", `Row ${rowNumber}: A Catalog ID could not be generated. ${error.message}`, { row: rowNumber }));
      continue;
    }
    if (!generatedId || existingById.has(generatedId) || importedIds.has(generatedId)) {
      diagnostics.push(diagnostic("error", "duplicate-generated-id", `Row ${rowNumber}: Generated Catalog ID ${generatedId || "(blank)"} is blank or already in use.`, { row: rowNumber, catalogId: generatedId }));
      continue;
    }
    importedIds.set(generatedId, rowNumber);
    const createValues = Object.fromEntries(presentFields.map(key => [key, values[key]]));
    const item = createKnowledgeItem({ ...createValues, id: generatedId, revision: 1, createdAt: timestamp, updatedAt: timestamp }, timestamp);
    nextCatalog.items.push(item);
    existingById.set(generatedId, { item, index: nextCatalog.items.length - 1 });
    rowById.set(generatedId, rowNumber);
    created += 1;
  }

  if (!errorCount(diagnostics)) diagnostics.push(...duplicateLogicalDiagnostics(nextCatalog.items, rowById));
  if (!errorCount(diagnostics)) {
    if (created || updated) nextCatalog.savedAt = timestamp;
    const finalValidation = validateKnowledgeBase(nextCatalog);
    if (!finalValidation.valid) finalValidation.errors.forEach(message => diagnostics.push(diagnostic("error", "invalid-result", `Imported Knowledge Base: ${message}`)));
  }
  return planResult({ diagnostics, normalized, created, updated, unchanged, nextCatalog });
}
