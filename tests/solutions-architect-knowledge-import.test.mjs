import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
  KNOWLEDGE_IMPORT_COLUMNS,
  KNOWLEDGE_IMPORT_CSV_ACCEPT,
  KNOWLEDGE_IMPORT_CSV_MIME,
  KNOWLEDGE_IMPORT_EXCEL_ACCEPT,
  KNOWLEDGE_IMPORT_FILE_ACCEPT,
  KNOWLEDGE_IMPORT_XLSX_MIME,
  MAX_KNOWLEDGE_IMPORT_CELLS,
  MAX_KNOWLEDGE_IMPORT_COLUMNS,
  MAX_KNOWLEDGE_IMPORT_ROWS,
  buildKnowledgeCsvTemplate,
  buildKnowledgeImportPlan,
  mapKnowledgeHeaders,
  normalizeKnowledgeImportRows,
  parseKnowledgeCsv,
  parseKnowledgeListCell,
  parseKnowledgeWorkbook
} from "../solutions-architect/knowledge-import.js";
import {
  createKnowledgeBase,
  createKnowledgeItem,
  validateKnowledgeBase
} from "../solutions-architect/knowledge-base.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const generatedAt = new Date("2026-09-01T18:30:00.000Z");

function loadBundledSheetJs() {
  const source = readFileSync(resolve(rootDir, "black-hat-agent", "vendor", "xlsx.full.min.js"), "utf8");
  const context = vm.createContext({ console, Date });
  vm.runInContext(source, context, { filename: "xlsx.full.min.js" });
  assert.ok(context.XLSX?.utils?.book_new);
  return context.XLSX;
}

function table(headers, rows, details = {}) {
  return { sourceType: "test", sheetName: null, headerRow: 1, headers, rows, diagnostics: [], ...details };
}

function errors(plan) {
  return plan.diagnostics.filter(item => item.severity === "error").map(item => `${item.code}: ${item.message}`).join("\n");
}

test("the import contract publishes 26 human-readable columns, limits, and local file accepts", () => {
  assert.equal(KNOWLEDGE_IMPORT_COLUMNS.length, 26);
  assert.deepEqual(KNOWLEDGE_IMPORT_COLUMNS.slice(0, 3).map(record => record.header), ["Catalog ID", "Expected Revision", "Name"]);
  assert.equal(KNOWLEDGE_IMPORT_COLUMNS.at(-1).header, "Change Summary");
  assert.equal(new Set(KNOWLEDGE_IMPORT_COLUMNS.map(record => record.key)).size, 26);
  assert.ok(KNOWLEDGE_IMPORT_COLUMNS.every(record => Object.isFrozen(record) && Object.isFrozen(record.aliases)));
  assert.equal(KNOWLEDGE_IMPORT_CSV_MIME, "text/csv;charset=utf-8");
  assert.equal(KNOWLEDGE_IMPORT_XLSX_MIME, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(KNOWLEDGE_IMPORT_CSV_ACCEPT, /\.csv/);
  assert.match(KNOWLEDGE_IMPORT_EXCEL_ACCEPT, /\.xlsx/);
  assert.match(KNOWLEDGE_IMPORT_FILE_ACCEPT, /text\/csv/);
  assert.equal(MAX_KNOWLEDGE_IMPORT_ROWS, 1_001);
  assert.equal(MAX_KNOWLEDGE_IMPORT_COLUMNS, 100);
  assert.equal(MAX_KNOWLEDGE_IMPORT_CELLS, 100_000);
});

test("the RFC4180 CSV parser handles a UTF-8 BOM, quoted commas, quotes, and line breaks", () => {
  const csv = '\uFEFFName,Summary,Capabilities\r\n"Command, planning","A ""quoted"" summary","Planning; Verification"\r\n"Multiline","first\r\nsecond","[""One"",""Two""]"\r\n';
  const parsed = parseKnowledgeCsv(new TextEncoder().encode(csv));
  assert.deepEqual(parsed.headers, ["Name", "Summary", "Capabilities"]);
  assert.deepEqual(parsed.rows, [
    ["Command, planning", 'A "quoted" summary', "Planning; Verification"],
    ["Multiline", "first\nsecond", '["One","Two"]']
  ]);
  assert.equal(parsed.sourceType, "csv");
  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.columnCount, 3);

  assert.throws(() => parseKnowledgeCsv('Name\r\n"unterminated'), /unterminated quoted field/i);
  assert.throws(() => parseKnowledgeCsv('Name\r\n"closed"junk'), /characters after a closing quote/i);
  assert.throws(() => parseKnowledgeCsv("Na\u0000me\nOffering"), /null characters/i);
  assert.throws(() => parseKnowledgeCsv(new Uint8Array([0xc3, 0x28])), /valid UTF-8/i);
});

test("CSV parsing and arbitrary parsed tables fail closed at bounded rows, columns, and cells", () => {
  assert.throws(() => parseKnowledgeCsv("Name,A,B\nOne,2,3", { maxColumns: 2 }), /column limit/i);
  assert.throws(() => parseKnowledgeCsv("Name\nOne\nTwo", { maxRows: 2 }), /row limit/i);
  assert.throws(() => parseKnowledgeCsv("Name,A\nOne,Two", { maxCells: 3 }), /cell limit/i);
  assert.throws(() => normalizeKnowledgeImportRows(table(["Name"], Array.from({ length: MAX_KNOWLEDGE_IMPORT_ROWS }, () => ["Offering"]))), /row limit/i);
});

test("the CSV template is BOM-prefixed, RFC4180-compatible, and round trips through the parser", () => {
  const blank = buildKnowledgeCsvTemplate();
  assert.equal(blank[0], "\uFEFF");
  const blankParsed = parseKnowledgeCsv(blank);
  assert.deepEqual(blankParsed.headers, KNOWLEDGE_IMPORT_COLUMNS.map(record => record.header));
  assert.equal(blankParsed.rows.length, 0);

  const example = parseKnowledgeCsv(buildKnowledgeCsvTemplate({ includeExample: true }));
  assert.equal(example.rows.length, 1);
  assert.equal(example.rows[0][2], "Example mission application");
  assert.equal(example.rows[0][8], "Mission planning; Interface verification");
});

test("header aliases map common CSV and Excel names without silently accepting collisions", () => {
  const mapped = mapKnowledgeHeaders(["catalog_id", "revision", "Solution Name", "Vendor", "Version", "TRL", "Keywords", "Extra column"]);
  assert.equal(mapped.valid, true);
  assert.deepEqual({ ...mapped.mapping }, { catalogId: 0, expectedRevision: 1, name: 2, provider: 3, version: 4, trl: 5, tags: 6 });
  assert.match(mapped.diagnostics.map(item => item.message).join("\n"), /Extra column is not recognized/i);

  const duplicate = mapKnowledgeHeaders(["Name", "Solution Name"]);
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.diagnostics.map(item => item.code).join(" "), /duplicate-header/);
  assert.match(mapKnowledgeHeaders(["Provider"]).diagnostics.map(item => item.code).join(" "), /missing-name-header/);
});

test("list cells support semicolons, line breaks, and JSON arrays without splitting commas in mission names", () => {
  assert.deepEqual(parseKnowledgeListCell("One; Two\nThree"), ["One", "Two", "Three"]);
  assert.deepEqual(parseKnowledgeListCell('["One", "Two, with comma"]'), ["One", "Two, with comma"]);
  assert.deepEqual(parseKnowledgeListCell("Integrated Air and Missile Defense"), ["Integrated Air and Missile Defense"]);
  assert.deepEqual(parseKnowledgeListCell(""), []);
  assert.throws(() => parseKnowledgeListCell('["One", 2]'), /non-text value/i);
  assert.throws(() => parseKnowledgeListCell("One;;Two"), /blank value/i);
  assert.throws(() => parseKnowledgeListCell("[not-json]"), /valid JSON string array/i);
});

test("normalization preserves only mapped fields, tracks physical rows, and reports malformed cells", () => {
  const normalized = normalizeKnowledgeImportRows(table(
    ["Name", "Offering Type", "Capabilities", "Technology Readiness Level", "Readiness As Of", "Unknown"],
    [
      ["Mission app", "software", "Plan; Verify", "7", "2026-09-01", "ignored"],
      ["", "", "", "", "", ""],
      ["Bad app", "Application", "[broken", "seven", "09/01/2026", "ignored"]
    ],
    { headerRow: 4 }
  ));
  assert.equal(normalized.rows[0].rowNumber, 5);
  assert.equal(normalized.rows[0].values.offeringType, "Software");
  assert.deepEqual(normalized.rows[0].values.capabilities, ["Plan", "Verify"]);
  assert.equal(normalized.rows[0].values.trl, 7);
  assert.equal(normalized.counts.blankRows, 1);
  assert.equal(normalized.valid, false);
  assert.match(normalized.diagnostics.map(item => item.message).join("\n"), /Unknown is not recognized|valid JSON|string array|whole number|YYYY-MM-DD/i);
});

test("SheetJS parsing prefers the visible Solutions sheet and rejects formulas and hidden selected dimensions", () => {
  const XLSX = loadBundledSheetJs();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name"], ["Wrong sheet"]]), "Instructions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name", "Tags"], ["Mission app", "planning; edge"]]), "Solutions");
  const workbookBefore = JSON.stringify(workbook);
  const selected = parseKnowledgeWorkbook(workbook, { xlsx: XLSX });
  assert.equal(selected.sheetName, "Solutions");
  assert.deepEqual(selected.rows[0], ["Mission app", "planning; edge"]);
  assert.equal(selected.diagnostics.length, 0);
  assert.equal(JSON.stringify(workbook), workbookBefore, "preview parsing must not add SheetJS display fields or otherwise mutate the workbook");

  const fallback = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(fallback, XLSX.utils.aoa_to_sheet([["Name"], ["Fallback app"]]), "Offerings");
  assert.equal(parseKnowledgeWorkbook(fallback, { xlsx: XLSX }).diagnostics[0].code, "workbook-sheet-fallback");

  const formulaBook = XLSX.utils.book_new();
  const formulaSheet = XLSX.utils.aoa_to_sheet([["Name", "Summary"], ["Formula app", "cached"]]);
  formulaSheet.B2.f = "1+1";
  XLSX.utils.book_append_sheet(formulaBook, formulaSheet, "Solutions");
  assert.throws(() => parseKnowledgeWorkbook(formulaBook, { xlsx: XLSX }), /formula at B2/i);

  const hiddenRowBook = XLSX.utils.book_new();
  const hiddenRowSheet = XLSX.utils.aoa_to_sheet([["Name"], ["Hidden app"]]);
  hiddenRowSheet["!rows"] = [null, { hidden: true }];
  XLSX.utils.book_append_sheet(hiddenRowBook, hiddenRowSheet, "Solutions");
  assert.throws(() => parseKnowledgeWorkbook(hiddenRowBook, { xlsx: XLSX }), /hidden row 2/i);

  const hiddenColumnBook = XLSX.utils.book_new();
  const hiddenColumnSheet = XLSX.utils.aoa_to_sheet([["Name", "Summary"], ["App", "Hidden"]]);
  hiddenColumnSheet["!cols"] = [null, { hidden: true }];
  XLSX.utils.book_append_sheet(hiddenColumnBook, hiddenColumnSheet, "Solutions");
  assert.throws(() => parseKnowledgeWorkbook(hiddenColumnBook, { xlsx: XLSX }), /hidden column/i);
});

test("SheetJS parsing falls back from hidden sheets and rejects oversized or explicitly hidden selections", () => {
  const XLSX = loadBundledSheetJs();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name"], ["Hidden preferred"]]), "Solutions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name"], ["Visible fallback"]]), "Visible");
  workbook.Workbook = { Sheets: [{ name: "Solutions", Hidden: 1 }, { name: "Visible", Hidden: 0 }] };
  assert.equal(parseKnowledgeWorkbook(workbook, { xlsx: XLSX }).sheetName, "Visible");
  assert.throws(() => parseKnowledgeWorkbook(workbook, { xlsx: XLSX, sheetName: "Solutions" }), /hidden and cannot be imported/i);

  const oversized = XLSX.utils.book_new();
  const oversizedSheet = XLSX.utils.aoa_to_sheet([["Name"], ["App"]]);
  oversizedSheet["!ref"] = "A1:A1002";
  XLSX.utils.book_append_sheet(oversized, oversizedSheet, "Solutions");
  assert.throws(() => parseKnowledgeWorkbook(oversized, { xlsx: XLSX }), /row limit/i);

  const tooWide = XLSX.utils.book_new();
  const tooWideSheet = XLSX.utils.aoa_to_sheet([["Name"]]);
  tooWideSheet["!ref"] = "A1:C1";
  XLSX.utils.book_append_sheet(tooWide, tooWideSheet, "Solutions");
  assert.throws(() => parseKnowledgeWorkbook(tooWide, { xlsx: XLSX, maxColumns: 2 }), /column limit/i);
});

test("add mode creates defaulted, validated records atomically without mutating its inputs", () => {
  const catalog = createKnowledgeBase({ seed: false, generatedAt: new Date("2026-09-01T12:00:00.000Z") });
  const originalCatalog = structuredClone(catalog);
  const parsed = parseKnowledgeCsv("Name,Provider / Owner,Capabilities,Technology Readiness Level,Tags\r\nMission app,Example provider,Planning; Verification,7,edge; planning\r\nMission service,,Support,,,\r\n");
  const ids = ["offering_import_1", "offering_import_2"];
  const plan = buildKnowledgeImportPlan(catalog, parsed, { generatedAt, idFactory: () => ids.shift() });
  assert.equal(plan.valid, true, errors(plan));
  assert.deepEqual(plan.counts, { inputRows: 2, dataRows: 2, blankRows: 0, created: 2, updated: 0, unchanged: 0, errors: 0, warnings: 0 });
  assert.equal(plan.nextCatalog.savedAt, generatedAt.toISOString());
  assert.equal(plan.nextCatalog.items[0].id, "offering_import_1");
  assert.equal(plan.nextCatalog.items[0].revision, 1);
  assert.equal(plan.nextCatalog.items[0].offeringType, "Integrated solution");
  assert.equal(plan.nextCatalog.items[0].lifecycleStatus, "Current");
  assert.deepEqual(plan.nextCatalog.items[0].capabilities, ["Planning", "Verification"]);
  assert.equal(plan.nextCatalog.items[0].trl, 7);
  assert.equal(plan.nextCatalog.items[0].mrl, null);
  assert.equal(validateKnowledgeBase(plan.nextCatalog).valid, true);
  assert.deepEqual(catalog, originalCatalog);
  assert.equal(parsed.rows[0][0], "Mission app");
});

test("upsert requires exact IDs and revisions, skips no-ops, and increments only material updates", () => {
  const baseTime = new Date("2026-08-31T12:00:00.000Z");
  const catalog = createKnowledgeBase({ seed: false, generatedAt: baseTime });
  catalog.items = [createKnowledgeItem({
    id: "offering_existing",
    name: "Existing platform",
    offeringType: "Platform",
    provider: "Example provider",
    version: "1.0",
    summary: "Original summary",
    changeSummary: "Initial record"
  }, baseTime)];
  const original = structuredClone(catalog);

  const update = table(
    ["Catalog ID", "Expected Revision", "Name", "Provider / Owner", "Version / Release", "Change Summary"],
    [["offering_existing", "1", "Existing platform", "Example provider", "2.0", "Released version 2.0"]]
  );
  const plan = buildKnowledgeImportPlan(catalog, update, { mode: "upsert", generatedAt });
  assert.equal(plan.valid, true, errors(plan));
  assert.equal(plan.counts.updated, 1);
  assert.equal(plan.nextCatalog.items[0].revision, 2);
  assert.equal(plan.nextCatalog.items[0].version, "2.0");
  assert.equal(plan.nextCatalog.items[0].summary, "Original summary", "an absent column must preserve the existing value");
  assert.equal(plan.nextCatalog.items[0].createdAt, baseTime.toISOString());
  assert.equal(plan.nextCatalog.items[0].updatedAt, generatedAt.toISOString());
  assert.deepEqual(catalog, original);

  const noOp = table(
    ["Catalog ID", "Expected Revision", "Name", "Provider / Owner", "Version / Release", "Change Summary"],
    [["offering_existing", "1", "Existing platform", "Example provider", "1.0", ""]]
  );
  const skipped = buildKnowledgeImportPlan(catalog, noOp, { mode: "upsert", generatedAt });
  assert.equal(skipped.valid, true, errors(skipped));
  assert.equal(skipped.counts.unchanged, 1);
  assert.equal(skipped.nextCatalog.items[0].revision, 1);
  assert.equal(skipped.nextCatalog.savedAt, catalog.savedAt);
});

test("stale revisions, missing change summaries, unknown IDs, and add-mode updates are atomic errors", () => {
  const catalog = createKnowledgeBase({ generatedAt });
  const id = catalog.items[0].id;
  const cases = [
    ["upsert", [id, "99", catalog.items[0].name, "Changed", "Changed facts"], /stale-revision/i],
    ["upsert", [id, "1", catalog.items[0].name, "Changed", ""], /missing-change-summary/i],
    ["upsert", ["offering_unknown", "1", "Unknown", "Changed", "Changed facts"], /unknown-catalog-id/i],
    ["add", [id, "1", catalog.items[0].name, "Changed", "Changed facts"], /update-requires-upsert/i]
  ];
  for (const [mode, row, pattern] of cases) {
    const parsed = table(["Catalog ID", "Expected Revision", "Name", "Summary", "Change Summary"], [row]);
    const plan = buildKnowledgeImportPlan(catalog, parsed, { mode, generatedAt });
    assert.equal(plan.valid, false);
    assert.equal(plan.nextCatalog, null);
    assert.match(errors(plan), pattern);
  }
});

test("duplicate IDs and logical offerings are rejected, and a blank ID never updates by name", () => {
  const catalog = createKnowledgeBase({ generatedAt });
  const existing = catalog.items[0];
  const duplicateId = table(
    ["Catalog ID", "Expected Revision", "Name", "Change Summary"],
    [
      [existing.id, "1", existing.name, "No material change"],
      [existing.id, "1", existing.name, "No material change"]
    ]
  );
  const duplicated = buildKnowledgeImportPlan(catalog, duplicateId, { mode: "upsert", generatedAt });
  assert.equal(duplicated.valid, false);
  assert.match(errors(duplicated), /duplicate-import-id|duplicate-import-offering/i);
  assert.equal(duplicated.nextCatalog, null);

  const nameOnly = table(["Name", "Provider / Owner"], [[existing.name.toUpperCase(), existing.provider.toUpperCase()]]);
  const namePlan = buildKnowledgeImportPlan(catalog, nameOnly, { generatedAt, idFactory: () => "offering_new_duplicate" });
  assert.equal(namePlan.valid, false);
  assert.match(errors(namePlan), /duplicate-logical-offering/i);
  assert.equal(namePlan.nextCatalog, null, "a name match must never become an implicit update");
  assert.equal(catalog.items.length, 1);
});

test("logical duplicate checks use effective catalog values when an update omits Provider / Owner", () => {
  const catalog = createKnowledgeBase({ seed: false, generatedAt });
  catalog.items = [
    createKnowledgeItem({ id: "offering_alpha", name: "Shared product name", provider: "Provider Alpha", version: "1" }, generatedAt),
    createKnowledgeItem({ id: "offering_bravo", name: "Shared product name", provider: "Provider Bravo", version: "1" }, generatedAt)
  ];
  const parsed = table(
    ["Catalog ID", "Expected Revision", "Name", "Version / Release", "Change Summary"],
    [
      ["offering_alpha", "1", "Shared product name", "2", "Updated Alpha"],
      ["offering_bravo", "1", "Shared product name", "2", "Updated Bravo"]
    ]
  );
  const plan = buildKnowledgeImportPlan(catalog, parsed, { mode: "upsert", generatedAt });
  assert.equal(plan.valid, true, errors(plan));
  assert.equal(plan.counts.updated, 2);
  assert.deepEqual(plan.nextCatalog.items.map(item => item.provider), ["Provider Alpha", "Provider Bravo"]);
});

test("logical duplicate checks normalize canonically equivalent Unicode names and providers", () => {
  const catalog = createKnowledgeBase({ seed: false, generatedAt });
  const parsed = table(
    ["Name", "Provider / Owner"],
    [
      ["Caf\u00e9 Suite", "Int\u00e9gration Team"],
      ["Cafe\u0301 Suite", "Inte\u0301gration Team"]
    ]
  );
  const ids = ["offering_unicode_1", "offering_unicode_2"];
  const plan = buildKnowledgeImportPlan(catalog, parsed, { generatedAt, idFactory: () => ids.shift() });
  assert.equal(plan.valid, false);
  assert.equal(plan.nextCatalog, null);
  assert.match(errors(plan), /duplicate-logical-offering/i);
});

test("final catalog validation rejects unsafe URLs, unsupported values, and readiness ranges before apply", () => {
  const catalog = createKnowledgeBase({ seed: false, generatedAt });
  const parsed = table(
    ["Name", "Offering Type", "Lifecycle Status", "Technology Readiness Level", "Source URL"],
    [["Unsafe app", "Weapon", "Unreviewed", "10", "javascript:alert(1)"]]
  );
  const plan = buildKnowledgeImportPlan(catalog, parsed, { generatedAt, idFactory: () => "offering_unsafe" });
  assert.equal(plan.valid, false);
  assert.equal(plan.nextCatalog, null);
  assert.match(errors(plan), /offeringType is unsupported|lifecycleStatus is unsupported|trl must be 1-9|sourceUrl must use HTTP or HTTPS/i);
  assert.equal(catalog.items.length, 0);
});

test("a mixed create/update file is all-or-nothing when any row fails", () => {
  const catalog = createKnowledgeBase({ generatedAt });
  const existing = catalog.items[0];
  const parsed = table(
    ["Catalog ID", "Expected Revision", "Name", "Version / Release", "Change Summary"],
    [
      ["", "", "New offering", "1.0", ""],
      [existing.id, "999", existing.name, "2.0", "Changed release"]
    ]
  );
  const original = structuredClone(catalog);
  const plan = buildKnowledgeImportPlan(catalog, parsed, { mode: "upsert", generatedAt, idFactory: () => "offering_created_before_error" });
  assert.equal(plan.valid, false);
  assert.equal(plan.counts.created, 1, "preview counts may show otherwise valid operations");
  assert.equal(plan.nextCatalog, null, "no partially built catalog may be applied");
  assert.match(errors(plan), /stale-revision/i);
  assert.deepEqual(catalog, original);
});
