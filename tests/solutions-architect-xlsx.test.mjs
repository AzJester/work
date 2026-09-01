import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const engine = await import(pathToFileURL(resolve(rootDir, "solutions-architect", "engine.js")));
const exporter = await import(pathToFileURL(resolve(rootDir, "solutions-architect", "export-xlsx.js")));

function loadBundledSheetJs() {
  const source = readFileSync(resolve(rootDir, "black-hat-agent", "vendor", "xlsx.full.min.js"), "utf8");
  // Share Date with the test realm so SheetJS recognizes typed date cells that
  // were constructed by the ES module outside this VM context.
  const context = vm.createContext({ console, Date });
  vm.runInContext(source, context, { filename: "xlsx.full.min.js" });
  assert.ok(context.XLSX?.utils?.book_new, "the repository-bundled SheetJS browser build must load");
  return context.XLSX;
}

function workbookText(XLSX, workbook) {
  return Array.from(workbook.SheetNames).flatMap(name =>
    Array.from(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }))
      .flatMap(row => Array.from(row).map(value => String(value ?? "")))
  ).join("\n");
}

function formulaCells(workbook) {
  return Array.from(workbook.SheetNames).flatMap(name =>
    Object.entries(workbook.Sheets[name])
      .filter(([address, cell]) => !address.startsWith("!") && cell?.f)
      .map(([address, cell]) => `${name}!${address}=${cell.f}`)
  );
}

test("native decision workbook is polished, active-solution scoped, formula-free, and free of legacy export boilerplate", () => {
  const XLSX = loadBundledSheetJs();
  let workspace = engine.createWorkspace();
  const activeSolutionId = workspace.activeSolutionId;
  const activeSolution = workspace.solutions.find(record => record.id === activeSolutionId);

  activeSolution.classification = "Data marking: Approved unclassified / non-CUI · NO CUI / CLASSIFIED DATA";
  workspace.candidates[0].readinessBasis += "; they are not an approval or authorization determination.";
  workspace.criteria[0].description = "CRITERION-DESCRIPTION-MARKER";
  workspace.evidence[0].sourceType = "Meeting summary";
  workspace.evidence[0].meetingDate = "2026-08-30";
  workspace.evidence[0].participants = ["PARTICIPANT-MARKER", "Platform integration lead"];
  workspace.evidence[0].missionSegments = ["Layered Defense, Autonomous Warfare & Integrated Fires"];
  workspace.evidence[0].notes = "=HYPERLINK(\"https://invalid.example\",\"FORMULA-INJECTION-MARKER\")";
  Object.assign(workspace.trades[0], {
    scopeAndGroundRules: "XLSX-AOA-SCOPE-MARKER",
    evaluationApproach: "XLSX-AOA-EVALUATION-MARKER",
    sensitivityAnalysis: "XLSX-AOA-SENSITIVITY-MARKER"
  });

  const other = engine.addBlankSolution(workspace, "OTHER-SOLUTION-SECRET-MARKER");
  workspace = other.workspace;
  other.solution.description = "OTHER-SOLUTION-CONTENT-MUST-NOT-EXPORT";
  workspace.evidence.push({
    id: "evidence_other_solution_secret",
    solutionId: other.solution.id,
    title: "OTHER-SOLUTION-EVIDENCE-MARKER",
    source: "Other solution",
    url: "",
    notes: "Must remain isolated",
    confidence: "High"
  });
  workspace.activeSolutionId = activeSolutionId;

  const workbook = exporter.buildDecisionWorkbook(workspace, activeSolutionId, {
    xlsx: XLSX,
    preparedAt: new Date(2026, 7, 31, 12)
  });

  assert.deepEqual(Array.from(workbook.SheetNames), Array.from(exporter.DECISION_WORKBOOK_SHEET_NAMES));
  assert.equal(workbook.SheetNames.length, 10);
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    assert.ok(sheet["!ref"], `${name} must contain a used range`);
    assert.ok(sheet["!cols"]?.length >= 2, `${name} must define readable column widths`);
    assert.ok(sheet["!rows"]?.length >= 5, `${name} must define deliberate row heights`);
    assert.ok(sheet["!merges"]?.some(range => range.s.r === 0), `${name} must merge its report title row`);
    assert.equal(sheet["!freeze"]?.ySplit, 3, `${name} must freeze the report heading area`);
    assert.equal(sheet["!gridlines"], false, `${name} must not rely on default gridlines`);
    assert.equal(sheet.A1?.s?.fill?.fgColor?.rgb, "17324A", `${name} must use the shared title treatment`);
  }

  const text = workbookText(XLSX, workbook);
  assert.match(text, /Candidate Alpha mission package/);
  assert.match(text, /Ruggedized sensor, edge compute, and host-platform adapter software/);
  assert.match(text, /CRITERION-DESCRIPTION-MARKER/);
  assert.match(text, /PARTICIPANT-MARKER/);
  assert.match(text, /Layered Defense, Autonomous Warfare & Integrated Fires/);
  assert.match(text, /Publish a quality-tagged track within two seconds of detection/);
  assert.match(text, /Deploys and operates the mission package/);
  assert.match(text, /Cybersecurity and authorization/, "substantive assessment content must not be over-redacted");
  for (const marker of [
    "Analysis of Alternatives (AoA)",
    "Alternative comparison",
    "XLSX-AOA-SCOPE-MARKER",
    "XLSX-AOA-EVALUATION-MARKER",
    "XLSX-AOA-SENSITIVITY-MARKER",
    "Candidate Alpha mission package",
    "Candidate Bravo open sensor stack",
    "Draft interface control description"
  ]) assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const decisionsText = Array.from(XLSX.utils.sheet_to_json(workbook.Sheets["Decisions & Risk"], { header: 1, raw: false, defval: "" }))
    .flatMap(row => Array.from(row).map(value => String(value ?? "")))
    .join("\n");
  assert.match(decisionsText, /Representative demonstration delivery path/);
  assert.doesNotMatch(decisionsText, /Mission package technology selection|Analysis of Alternatives \(AoA\)/, "the AoA must not be duplicated in the generic trade register");
  const decisionColumns = workbook.Sheets["Decisions & Risk"]["!cols"];
  assert.ok(decisionColumns[3].wch >= 48, "long trade recommendations must retain a readable shared column width");
  assert.ok(decisionColumns[4].wch >= 48, "wrapped decision rationales and risk mitigations must not inherit a narrow status column");
  assert.ok(decisionColumns[5].wch >= 44, "wrapped decision evidence and dependency statuses must retain a readable shared column width");
  const alternativesText = Array.from(XLSX.utils.sheet_to_json(workbook.Sheets["Analysis of Alternatives"], { header: 1, raw: false, defval: "" }))
    .flatMap(row => Array.from(row).map(value => String(value ?? "")))
    .join("\n");
  assert.match(alternativesText, /Analysis of Alternatives \(AoA\)/);
  assert.match(alternativesText, /Alternative comparison/);
  assert.match(alternativesText, /Weighted score/);
  assert.match(alternativesText, /Assessed/);
  assert.match(alternativesText, /Evidenced/);
  assert.ok(workbook.Sheets["Analysis of Alternatives"]["!cols"][2].wch >= 50, "AoA narrative values must use a readable column width");
  assert.match(text, /=HYPERLINK\("https:\/\/invalid\.example"/, "formula-looking authored text must be preserved as text");
  assert.doesNotMatch(text, /OTHER-SOLUTION-(?:SECRET|CONTENT|EVIDENCE)-MARKER/);
  assert.doesNotMatch(text, /Data marking|NO CUI|CLASSIFIED DATA|approved unclassified|non-CUI/i);
  assert.doesNotMatch(text, /browser(?:-local| storage)|not authorized|not an authorization|approval or authorization determination|(?:DoD|DOF)[- ]confirmed determination|DoDAF[- ]conformance determination/i);
  assert.deepEqual(formulaCells(workbook), [], "the export must not create formulas or active spreadsheet content");

  const bytes = exporter.writeDecisionWorkbook(workspace, activeSolutionId, {
    xlsx: XLSX,
    preparedAt: new Date(2026, 7, 31, 12)
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 10_000);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [0x50, 0x4b], "an XLSX file must be a ZIP package");

  const roundTripped = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true });
  assert.deepEqual(Array.from(roundTripped.SheetNames), Array.from(exporter.DECISION_WORKBOOK_SHEET_NAMES));
  const roundTripText = workbookText(XLSX, roundTripped);
  assert.match(roundTripText, /PARTICIPANT-MARKER/);
  assert.match(roundTripText, /CRITERION-DESCRIPTION-MARKER/);
  assert.match(roundTripText, /XLSX-AOA-SCOPE-MARKER/);
  assert.match(roundTripText, /Alternative comparison/);
  assert.doesNotMatch(roundTripText, /OTHER-SOLUTION-(?:SECRET|CONTENT|EVIDENCE)-MARKER/);
  assert.doesNotMatch(roundTripText, /approval or authorization determination|browser-local|Data marking/i);
  assert.deepEqual(formulaCells(roundTripped), []);
  assert.equal(
    exporter.decisionWorkbookFilename(workspace, activeSolutionId),
    "expeditionary-sensor-node-upgrade-decision-workbook.xlsx"
  );
  assert.equal(exporter.DECISION_WORKBOOK_MIME, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("decision workbook export fails closed without SheetJS or a valid solution", () => {
  const XLSX = loadBundledSheetJs();
  const workspace = engine.createWorkspace();
  assert.throws(
    () => exporter.buildDecisionWorkbook(workspace, "missing_solution", { xlsx: XLSX }),
    /valid solution/i
  );
  assert.throws(
    () => exporter.buildDecisionWorkbook(workspace, workspace.activeSolutionId, { xlsx: {} }),
    /SheetJS library is unavailable/i
  );
});
