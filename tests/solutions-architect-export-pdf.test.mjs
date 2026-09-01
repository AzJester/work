import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addBlankSolution, createWorkspace } from "../solutions-architect/engine.js";
import { PDF_EXPORT_INTERNALS, buildDecisionPackageExportSummary, buildDecisionPackagePdf } from "../solutions-architect/export-pdf.js";

const root = resolve(import.meta.dirname, "..");
const pdfLibSource = readFileSync(resolve(root, "solutions-architect", "vendor", "pdf-lib-1.17.1.min.js"), "utf8");
const pdfModule = { exports: {} };
new Function("module", "exports", pdfLibSource)(pdfModule, pdfModule.exports);
globalThis.PDFLib = pdfModule.exports;

async function extractPdfText(bytes) {
  const document = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(" "));
  }
  return { pageCount: document.numPages, pages, text: pages.join("\n") };
}

test("native PDF export creates a paginated, solution-scoped decision document", async () => {
  let workspace = createWorkspace();
  const originalSolutionId = workspace.activeSolutionId;
  workspace = addBlankSolution(workspace, "SECOND SOLUTION PRIVATE SENTINEL").workspace;
  workspace.activeSolutionId = originalSolutionId;
  Object.assign(workspace.trades.find(record => record.solutionId === originalSolutionId), {
    scopeAndGroundRules: "PDF AOA SCOPE MARKER",
    evaluationApproach: "PDF AOA EVALUATION MARKER",
    sensitivityAnalysis: "PDF AOA SENSITIVITY MARKER"
  });

  const summary = buildDecisionPackageExportSummary(workspace, originalSolutionId);
  assert.equal(summary.solutionId, originalSolutionId);
  assert.ok(summary.recordCounts.requirements > 0);

  const blob = await buildDecisionPackagePdf(workspace, originalSolutionId);
  assert.equal(blob.type, "application/pdf");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.length > 25_000);

  const extracted = await extractPdfText(bytes);
  assert.ok(extracted.pageCount >= 8);
  assert.match(extracted.text, /SOLUTION DECISION PACKAGE/);
  assert.match(extracted.text, /Technology Assessment/);
  assert.match(extracted.text, /Requirements traceability matrix/);
  assert.match(extracted.text, /Analysis of Alternatives: Mission package technology selection/);
  assert.match(extracted.text, /PDF AOA SCOPE MARKER/);
  assert.match(extracted.text, /PDF AOA EVALUATION MARKER/);
  assert.match(extracted.text, /PDF AOA SENSITIVITY MARKER/);
  assert.match(extracted.text, /Candidate Alpha mission package/);
  assert.match(extracted.text, /Candidate Bravo open sensor stack/);
  assert.match(extracted.text, /Draft interface control description/);
  assert.match(extracted.text, /Acronym key/);
  assert.match(extracted.text, /AoA\s+Analysis of Alternatives/);
  const genericTradeBlock = extracted.text.split("Trade studies")[1]?.split("Analysis of Alternatives:")[0] || "";
  assert.doesNotMatch(genericTradeBlock, /Mission package technology selection/, "the AoA must not also appear in the generic trade table");
  const aoaPage = extracted.pages.find(page => page.includes("Analysis of Alternatives: Mission package technology selection"));
  assert.match(aoaPage || "", /DECISION OBJECTIVE/, "an AoA heading must stay with its first detail block");
  assert.doesNotMatch(extracted.text, /SECOND SOLUTION PRIVATE SENTINEL/);
  assert.doesNotMatch(extracted.text, /browser storage|authorization boundary|DoDAF-conformance determination|data marking/i);
});

test("PDF export text normalization and status classification are deterministic", () => {
  assert.equal(PDF_EXPORT_INTERNALS.ascii("A\u2014B \u201cquoted\u201d"), 'A-B "quoted"');
  assert.equal(PDF_EXPORT_INTERNALS.ascii("\u2264 2 \u2194 \u2265 1"), "<= 2 <-> >= 1");
  assert.equal(PDF_EXPORT_INTERNALS.statusTone("Invalidated"), "negative");
  assert.equal(PDF_EXPORT_INTERNALS.statusTone("Validated"), "positive");
  assert.deepEqual(PDF_EXPORT_INTERNALS.normalizeWidths([1, 2], 2).map(value => Math.round(value)), [172, 344]);
});

test("native PDF keeps a long AoA objective with its heading at page boundaries", async () => {
  const base = createWorkspace();
  const solutionId = base.activeSolutionId;
  const analysis = base.trades.find(record => record.analysisType === "Analysis of Alternatives");
  analysis.question = `PDF LONG OBJECTIVE LEAD ${"mission context and evaluation detail ".repeat(180)}`;

  for (const repeatCount of [50, 55]) {
    const workspace = structuredClone(base);
    const ordinaryTrade = workspace.trades.find(record => record.analysisType !== "Analysis of Alternatives");
    workspace.trades.push(...Array.from({ length: 9 }, (_, index) => ({
      ...structuredClone(ordinaryTrade),
      id: `trade_pdf_boundary_${repeatCount}_${index}`,
      title: `Boundary filler ${index + 1}`,
      question: index === 8 ? `Boundary detail ${"shift ".repeat(repeatCount)}` : ordinaryTrade.question
    })));

    const blob = await buildDecisionPackagePdf(workspace, solutionId);
    const extracted = await extractPdfText(new Uint8Array(await blob.arrayBuffer()));
    const headingPage = extracted.pages.find(page => page.includes("Analysis of Alternatives: Mission package technology selection"));
    assert.match(headingPage || "", /DECISION OBJECTIVE\s+PDF LONG OBJECTIVE LEAD/i, `AoA lead content was orphaned with ${repeatCount} repeated shift tokens`);
  }
});
