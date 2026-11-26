import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  coverageByVolume, coverageOf, crosswalk, EMPTY_FILTER, filterRequirements, goldGate, mappingFlag, MATRIX_COLUMNS, matrixCsv, matrixSheet, sortRequirements,
} from "../proposal-war-room/src/lib/compliance.ts";
import { cleanEmail, emailProblems, needsAttention, statusPayload, statusRequest, templateEmail } from "../proposal-war-room/src/lib/dashboard.ts";
import { docxToText, documentXmlToText, pdfItemsToText } from "../proposal-war-room/src/lib/extract.ts";
import { clonePursuit, exportPursuitJson, newPursuit, newRequirement, newVolume, nextReqId, normalizePursuit, PursuitFormatError } from "../proposal-war-room/src/lib/model.ts";
import { addSection, addSubsection, assignmentsFor, isOverdue, moveNode, orderedOutline, overdueByOwner, placeNode, removeNode, removePerson, updateNode } from "../proposal-war-room/src/lib/outline.ts";
import { allocationOf, budgetStatus, currentPagesOf, percentOf, volumeBudget, volumesOverLimit } from "../proposal-war-room/src/lib/pagebudget.ts";
import { replan, sectionDueDate } from "../proposal-war-room/src/lib/pursuit-ops.ts";
import { iconSize, SMALL_OK } from "../proposal-war-room/src/lib/icon-groups.ts";
import { STATUS_WORDS, statusStyle } from "../proposal-war-room/src/lib/status.ts";
import { columnName, sheetTitle, workbookParts, writeXlsx } from "../proposal-war-room/src/lib/xlsx.ts";
import { crc32, unzipFiles, zipFiles } from "../proposal-war-room/src/lib/zip.ts";

// The Proposal War Room's data rules: outline, page budget, compliance matrix, dashboard and exports.
// The worked sample in proposal-war-room/fixtures/ was built by the app's own functions from the recorded parser reply.

const NOW = "2026-12-01T15:00:00.000Z";
const TODAY = "2026-12-01";
const fixture = name => readFileSync(new URL(`../proposal-war-room/fixtures/${name}`, import.meta.url), "utf8");
const sample = () => normalizePursuit(JSON.parse(fixture("sample-pursuit.json")), NOW);
const section = (pursuit, ref) => pursuit.outline.find(node => node.lRef === ref && node.parentId === null);
const titles = pursuit => orderedOutline(pursuit).map(row => `${row.number} ${row.node.title}`);

function small() {
  let pursuit = newPursuit("Short pursuit", NOW);
  const volume = newVolume("Volume I, Technical", 25);
  pursuit = { ...pursuit, volumes: [volume] };
  for (const title of ["Approach", "Risk", "Cover"]) pursuit = addSection(pursuit, volume.id, TODAY, title).pursuit;
  return { pursuit, volume, ids: Object.fromEntries(pursuit.outline.map(node => [node.title, node.id])) };
}

test("a pursuit file round-trips, and a file that is not a pursuit is refused", () => {
  const pursuit = sample();
  assert.equal(pursuit.name, "Sentinel Range Modernization");
  assert.deepEqual(normalizePursuit(JSON.parse(exportPursuitJson(pursuit)), NOW), pursuit, "export then import changes nothing");
  assert.throws(() => normalizePursuit({ name: "Something else" }, NOW), PursuitFormatError);
  assert.throws(() => normalizePursuit({ ...pursuit, schema: 99 }, NOW), /newer version/);
  assert.throws(() => normalizePursuit(null, NOW), PursuitFormatError);
  const copy = clonePursuit(pursuit, "Copy", NOW);
  assert.notEqual(copy.id, pursuit.id);
  assert.equal(copy.outline.length, pursuit.outline.length);
});

test("an imported pursuit loses links to things that do not exist, and keeps everything else", () => {
  const pursuit = sample();
  const raw = JSON.parse(exportPursuitJson(pursuit));
  raw.outline[0].ownerId = "nobody";
  raw.requirements[0].sectionIds = ["missing-section", raw.outline[0].id];
  raw.outline.push({ id: "orphan", volumeId: "no-such-volume", parentId: null, title: "Orphan" });
  raw.unknownField = "dropped";
  raw.wordsPerPage = 99999;
  const clean = normalizePursuit(raw, NOW);
  assert.equal(clean.outline[0].ownerId, "");
  assert.deepEqual(clean.requirements[0].sectionIds, [raw.outline[0].id]);
  assert.equal(clean.outline.some(node => node.id === "orphan"), false);
  assert.equal("unknownField" in clean, false);
  assert.equal(clean.wordsPerPage, 1500);
  assert.equal(clean.id, pursuit.id);
  assert.match(normalizePursuit({ ...raw, id: "pursuit-7" }, NOW).id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "storage keys pursuits by UUID, so any other id is replaced");
});

test("outline: sections and subsections add, reorder and delete in place", () => {
  let { pursuit, ids } = small();
  assert.deepEqual(titles(pursuit), ["1.1 Approach", "1.2 Risk", "1.3 Cover"]);
  pursuit = addSubsection(pursuit, ids.Approach, TODAY, "Task 3.1").pursuit;
  pursuit = addSubsection(pursuit, ids.Approach, TODAY, "Task 3.2").pursuit;
  assert.deepEqual(titles(pursuit), ["1.1 Approach", "1.1.1 Task 3.1", "1.1.2 Task 3.2", "1.2 Risk", "1.3 Cover"]);
  assert.deepEqual(pursuit.outline.map(node => node.title), ["Approach", "Task 3.1", "Task 3.2", "Risk", "Cover"], "the stored list stays in reading order");
  assert.equal(addSubsection(pursuit, pursuit.outline[1].id, TODAY), null, "a subsection takes no subsection of its own");

  pursuit = moveNode(pursuit, ids.Approach, 1);
  assert.deepEqual(titles(pursuit), ["1.1 Risk", "1.2 Approach", "1.2.1 Task 3.1", "1.2.2 Task 3.2", "1.3 Cover"], "a section moves with its subsections");
  pursuit = moveNode(pursuit, pursuit.outline.find(node => node.title === "Task 3.2").id, -1);
  assert.deepEqual(titles(pursuit).slice(2, 4), ["1.2.1 Task 3.2", "1.2.2 Task 3.1"]);
  assert.equal(moveNode(pursuit, ids.Risk, -1), pursuit, "the first row cannot move up");
  pursuit = placeNode(pursuit, ids.Cover, ids.Risk, "before");
  assert.deepEqual(titles(pursuit)[0], "1.1 Cover");
  assert.equal(placeNode(pursuit, ids.Cover, pursuit.outline.find(node => node.title === "Task 3.1").id, "before"), pursuit, "a section cannot be dropped among subsections");

  const requirement = { ...newRequirement("L", "L-001"), sectionIds: [ids.Approach, ids.Risk] };
  pursuit = { ...pursuit, requirements: [requirement] };
  pursuit = removeNode(pursuit, ids.Approach);
  assert.deepEqual(titles(pursuit), ["1.1 Cover", "1.2 Risk"], "deleting a section deletes its subsections");
  assert.deepEqual(pursuit.requirements[0].sectionIds, [ids.Risk], "and unmaps the requirements that pointed at it");
});

test("outline: due dates follow the schedule, and overdue sections group by owner", () => {
  const pursuit = sample();
  const approach = section(pursuit, "L.4.1");
  assert.equal(approach.dueMilestone, "pink", "a new section is due at the next color team");
  assert.equal(sectionDueDate(pursuit, approach), "2026-12-16");
  assert.equal(isOverdue(pursuit, approach, "2026-12-16"), false, "due today is not overdue");
  assert.equal(isOverdue(pursuit, approach, "2026-12-17"), true);
  assert.equal(isOverdue(updateNode(pursuit, approach.id, { status: "In review" }), { ...approach, status: "In review" }, "2026-12-17"), false, "a section handed to its review is not overdue");
  assert.equal(sectionDueDate(pursuit, { ...approach, dueDate: "2026-12-10" }), "2026-12-10", "a date set by hand wins");

  // The due date slips: sections that follow a milestone move with it.
  const moved = replan(pursuit, TODAY, NOW, "Amendment", "", { dueDate: "2027-02-09" }).pursuit;
  assert.notEqual(sectionDueDate(moved, section(moved, "L.4.1")), "2026-12-16");

  const groups = overdueByOwner(pursuit, "2027-01-13");
  assert.deepEqual(groups.map(group => [pursuit.roster.find(person => person.id === group.ownerId).name, group.nodes.length]), [["Priya Raman", 2], ["Marcus Bell", 1]]);
  const priya = pursuit.roster.find(person => person.name === "Priya Raman");
  const mine = assignmentsFor(pursuit, priya.id, "2027-01-13");
  assert.deepEqual(mine.map(row => [row.node.lRef, row.role, row.overdue]), [["L.4.1", "Owner", true], ["L.4.2", "Owner", true]]);
  const luis = pursuit.roster.find(person => person.name === "Luis Ortega");
  assert.deepEqual(assignmentsFor(pursuit, luis.id, TODAY).map(row => row.role), ["Reviewer", "Reviewer"]);

  const without = removePerson(pursuit, priya.id);
  assert.equal(without.roster.length, pursuit.roster.length - 1);
  assert.equal(without.outline.some(node => node.ownerId === priya.id), false);
  assert.equal(without.requirements.some(item => item.ownerId === priya.id), false);
});

test("page budget: Within below 90 percent, Near limit from 90 to 100, Over above 100", () => {
  assert.equal(budgetStatus(22.4, 25), "Within");
  assert.equal(budgetStatus(22.5, 25), "Near limit");
  assert.equal(budgetStatus(25, 25), "Near limit");
  assert.equal(budgetStatus(25.1, 25), "Over");
  assert.equal(budgetStatus(0, 25), "Within");
  assert.equal(budgetStatus(12, null), null);
  assert.equal(percentOf(27, 25), 108);
  for (const word of ["Within", "Near limit", "Over"]) assert.ok(statusStyle(word).icon, `${word} carries an icon`);
  assert.deepEqual([statusStyle("Within").icon, statusStyle("Near limit").icon, statusStyle("Over").icon], ["check", "status-attention", "status-blocked"]);
  assert.equal(statusStyle("Over").strong, true, "the Over label is set in bold");
});

test("acceptance 5: 27 pages against a 25-page limit puts the volume Over at 108 percent and raises the alert", () => {
  let pursuit = sample();
  const technical = pursuit.volumes.find(volume => volume.name === "Volume I, Technical");
  assert.equal(technical.pageLimit, 25);
  assert.deepEqual([volumeBudget(pursuit, technical).current, volumeBudget(pursuit, technical).status], [23, "Near limit"]);
  assert.deepEqual(volumesOverLimit(pursuit), []);

  pursuit = updateNode(pursuit, section(pursuit, "L.4.2").id, { currentPages: 12 });
  const budget = volumeBudget(pursuit, technical);
  assert.equal(budget.current, 27);
  assert.equal(budget.status, "Over");
  assert.equal(budget.percent, 108);
  assert.equal(statusStyle(budget.status).icon, "status-blocked");
  assert.deepEqual(volumesOverLimit(pursuit).map(item => item.volume.name), ["Volume I, Technical"], "this is the list the top alert reads");
  assert.match(needsAttention(pursuit, TODAY)[0].text, /^Volume I, Technical is 2 pages over its 25-page limit\.$/);
});

test("page budget: excluded sections, word-count estimates and allocations", () => {
  let { pursuit, volume, ids } = small();
  pursuit = updateNode(pursuit, ids.Approach, { pages: 16, currentPages: 15 });
  pursuit = updateNode(pursuit, ids.Risk, { pages: 12, countMode: "estimate", wordCount: 3000, graphicsPages: 1.5 });
  pursuit = updateNode(pursuit, ids.Cover, { excluded: true, currentPages: 3 });
  assert.equal(currentPagesOf(pursuit.outline.find(node => node.id === ids.Risk), 500), 7.5, "3000 words at 500 a page, plus 1.5 pages of graphics");
  let budget = volumeBudget(pursuit, volume);
  assert.equal(budget.current, 22.5, "the excluded cover does not count");
  assert.equal(budget.excludedCurrent, 3);
  assert.equal(budget.allocated, 28);
  assert.equal(budget.overAllocatedBy, 3, "allocations past the limit are reported");
  assert.equal(budget.rows.find(row => row.node.id === ids.Cover).status, "Not counted");
  assert.equal(volumeBudget({ ...pursuit, wordsPerPage: 250 }, volume).current, 28.5, "words per page is a setting");

  // A section's allocation is its budget. Subsections split it, and overrunning it is flagged.
  pursuit = addSubsection(pursuit, ids.Approach, TODAY, "Task 3.1").pursuit;
  pursuit = addSubsection(pursuit, ids.Approach, TODAY, "Task 3.2").pursuit;
  const [first, second] = pursuit.outline.filter(node => node.parentId === ids.Approach);
  pursuit = updateNode(updateNode(pursuit, first.id, { pages: 10, currentPages: 9 }), second.id, { pages: 8, currentPages: 4 });
  budget = volumeBudget(pursuit, volume);
  const row = budget.rows.find(entry => entry.node.id === ids.Approach);
  assert.deepEqual([row.rollup, row.allocation, row.current, row.childrenOverBy], [true, 16, 13, 2]);
  assert.equal(budget.allocated, 28, "subsection allocations are not counted twice");
  assert.equal(allocationOf(updateNode(pursuit, ids.Approach, { pages: null }), { ...pursuit.outline.find(node => node.id === ids.Approach), pages: null }), 18, "with no number of its own, a section shows the sum of its subsections");

  // A volume with no sections takes its count from its own box. A volume with no limit has no status to report.
  const empty = { ...newVolume("Volume II, Management", 15), manualPages: 14 };
  const price = newVolume("Volume III, Price", null);
  const two = { ...pursuit, volumes: [...pursuit.volumes, empty, price] };
  assert.deepEqual([volumeBudget(two, empty).manual, volumeBudget(two, empty).status, volumeBudget(two, empty).percent], [true, "Near limit", 93]);
  assert.deepEqual([volumeBudget(two, price).status, volumeBudget(two, price).percent], ["No limit", null]);
});

test("compliance: unmapped Section L and untraced Section M items are flagged", () => {
  const pursuit = sample();
  const flags = Object.fromEntries(pursuit.requirements.map(item => [item.reqId, mappingFlag(item)]));
  assert.deepEqual(Object.entries(flags).filter(([, flag]) => flag === "Unmapped").map(([id]) => id), ["L-001", "L-002", "L-003", "L-004", "L-005"]);
  assert.deepEqual(Object.entries(flags).filter(([, flag]) => flag === "Untraced").map(([id]) => id), ["M-006"], "the Price factor has no section yet");
  assert.equal(flags["L-006"], null);
  assert.equal(flags["M-001"], null, "a Section M evaluation statement is not a factor and is not flagged");
  const na = { ...pursuit.requirements[0], status: "N/A", naReason: "" };
  assert.equal(mappingFlag(na), "Unmapped", "N/A without a reason does not clear the flag");
  assert.equal(mappingFlag({ ...na, naReason: "Covered by the transmittal letter." }), null);
});

test("compliance: coverage by volume, and the Gold team gate counts Open and Gap", () => {
  const pursuit = sample();
  const overall = coverageOf(pursuit.requirements);
  assert.deepEqual([overall.total, overall.open, overall.gap, overall.addressed, overall.percent], [15, 12, 1, 2, 13]);
  const byVolume = Object.fromEntries(coverageByVolume(pursuit).map(row => [row.label, [row.covered, row.applicable, row.percent]]));
  assert.deepEqual(byVolume, {
    "Volume I, Technical": [1, 5, 20], "Volume II, Management": [1, 3, 33], "Volume III, Price": [0, 0, null], "Not mapped to a section": [0, 7, 0],
  });
  const gate = goldGate(pursuit);
  assert.deepEqual([gate.ready, gate.open, gate.gap, gate.unmapped, gate.untraced], [false, 12, 1, 5, 1]);
  assert.equal(statusStyle("Not ready").icon, "status-blocked");
  assert.equal(statusStyle("Ready").icon, "status-complete");

  const closed = { ...pursuit, requirements: pursuit.requirements.map((item, index) => ({ ...item, status: index % 2 ? "Verified compliant" : "Addressed" })) };
  assert.equal(goldGate(closed).ready, true);
  const reasonless = { ...closed, requirements: closed.requirements.map((item, index) => (index === 0 ? { ...item, status: "N/A", naReason: "" } : item)) };
  assert.deepEqual([goldGate(reasonless).ready, goldGate(reasonless).open], [false, 1], "N/A needs a reason. Without one it still counts as Open");
  assert.equal(goldGate({ ...reasonless, requirements: reasonless.requirements.map((item, index) => (index === 0 ? { ...item, naReason: "Not in scope." } : item)) }).ready, true);
  assert.equal(goldGate({ ...pursuit, requirements: [] }).ready, false, "an empty matrix is not ready");
});

test("compliance: the L-to-M crosswalk joins requirements and factors through shared sections", () => {
  const rows = crosswalk(sample());
  const byId = Object.fromEntries(rows.filter(row => row.l).map(row => [row.l.reqId, row]));
  assert.deepEqual(byId["L-006"].m.map(item => item.text), ["Factor 1, Technical", "1a Technical Approach"]);
  assert.deepEqual(byId["L-007"].m.map(item => item.text), ["Factor 1, Technical", "1b Risk Management"]);
  assert.deepEqual(byId["L-008"].m.map(item => item.text), ["Factor 2, Management"]);
  assert.equal(byId["L-001"].flag, "Unmapped");
  assert.deepEqual(rows.filter(row => !row.l).map(row => [row.m[0].text, row.flag]), [["Price", "Untraced"]], "a factor no requirement reaches is still listed");
});

test("compliance: search, filter and sort", () => {
  const pursuit = sample();
  const ids = list => list.map(item => item.reqId);
  assert.deepEqual(ids(filterRequirements(pursuit, { ...EMPTY_FILTER, search: "risk" })), ["L-007", "M-004"]);
  assert.deepEqual(ids(filterRequirements(pursuit, { ...EMPTY_FILTER, source: "M", type: "subfactor" })), ["M-003", "M-004"]);
  assert.deepEqual(ids(filterRequirements(pursuit, { ...EMPTY_FILTER, status: "Gap" })), ["L-007"]);
  assert.deepEqual(ids(filterRequirements(pursuit, { ...EMPTY_FILTER, flaggedOnly: true })), ["L-001", "L-002", "L-003", "L-004", "L-005", "L-007", "M-006"]);
  const management = pursuit.volumes.find(volume => volume.name === "Volume II, Management");
  assert.deepEqual(ids(filterRequirements(pursuit, { ...EMPTY_FILTER, volumeId: management.id })), ["L-008", "L-009", "M-005"]);
  const priya = pursuit.roster.find(person => person.name === "Priya Raman");
  assert.deepEqual(ids(filterRequirements(pursuit, { ...EMPTY_FILTER, ownerId: priya.id })), ["L-006", "L-007"]);
  assert.equal(ids(sortRequirements(pursuit, pursuit.requirements, "status", false))[0], "L-007", "Gaps sort first");
  assert.deepEqual(ids(sortRequirements(pursuit, pursuit.requirements, "reqId", true)).slice(0, 2), ["M-006", "M-005"]);
  assert.equal(nextReqId(pursuit.requirements, "L"), "L-010");
  assert.equal(nextReqId(pursuit.requirements, "SOW"), "SOW-001");
});

test("the matrix exports as CSV with every specified column", () => {
  const pursuit = sample();
  const csv = matrixCsv(pursuit, pursuit.requirements);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Req ID,Source,Paragraph ref,Requirement text,Type,Mapped sections,Owner,Status,N/A reason,Proposal page ref,Reviewer comment");
  assert.equal(lines.length, 16);
  assert.equal(lines[6], 'L-006,L,L.4.1,The offeror shall describe its technical approach to SOW tasks 3.1 through 3.4.,shall,"Volume I, Technical / Technical Approach to SOW Tasks 3.1 through 3.4",Priya Raman,Addressed,,I-3,');
});

test("the matrix workbook follows the Astrion Excel rules", async () => {
  const pursuit = sample();
  const spec = matrixSheet(pursuit, pursuit.requirements, "2026-12-01");
  assert.equal(spec.title, "Compliance matrix: Sentinel Range Modernization");
  assert.equal(spec.highlightRow, null, "no row is highlighted by default, and never more than one");
  const parts = Object.fromEntries(workbookParts(spec).map(part => [part.path, part.content]));
  const sheet = parts["xl/worksheets/sheet1.xml"], styles = parts["xl/styles.xml"], table = parts["xl/tables/table1.xml"], strings = parts["xl/sharedStrings.xml"];

  // The data is an Excel Table with its header row frozen and filters on.
  assert.match(table, /<table [^>]*name="ComplianceMatrix"[^>]*ref="A4:K19"/);
  assert.match(table, /<autoFilter ref="A4:K19"\/>/);
  assert.match(table, /<tableStyleInfo showFirstColumn="0" showLastColumn="0" showRowStripes="0" showColumnStripes="0"\/>/, "no table style, so no fills land on data rows");
  assert.match(sheet, /<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /showGridLines="0"/);
  assert.deepEqual([...table.matchAll(/<tableColumn id="\d+" name="([^"]+)"/g)].map(match => match[1]), MATRIX_COLUMNS.map(name => name.toUpperCase()), "headers are uppercase and match the table definition");

  // Fonts and fills: Archivo 10 pt Carbon for the body, JetBrains Mono 9 pt Bone on Gunmetal for the header, Steel rules.
  assert.match(styles, /<fonts count="4"><font><sz val="10"\/><color rgb="FF0B0D10"\/><name val="Archivo"\/>/);
  assert.match(styles, /<font><sz val="9"\/><color rgb="FFEEEDE7"\/><name val="JetBrains Mono"\/>/);
  assert.match(styles, /<fgColor rgb="FF171B22"\/>/);
  assert.match(styles, /<bottom style="thin"><color rgb="FF8A8F99"\/><\/bottom>/);
  assert.deepEqual([...new Set([...styles.matchAll(/rgb="([0-9A-F]{8})"/g)].map(match => match[1]))].sort(), ["FF0B0D10", "FF171B22", "FF8A8F99", "FFE2FDFF", "FFEEEDE7"], "only palette values");
  assert.doesNotMatch(styles, /Calibri/);
  // Every written cell names a style, and so a font.
  const cells = [...sheet.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>/g)];
  assert.ok(cells.length > 150);
  for (const [, , row, attributes] of cells) {
    const style = Number(/ s="(\d+)"/.exec(attributes)?.[1]);
    assert.ok(Number.isInteger(style), "a cell without a style would fall back to the workbook default");
    if (Number(row) === 4) assert.equal(style, 3, "header cells use the header style");
    if (Number(row) > 4) assert.ok(style === 4 || style === 5, "data rows carry no fill");
  }
  assert.match(strings, /<t xml:space="preserve">Compliance matrix: Sentinel Range Modernization<\/t>/);
  assert.equal(sheetTitle("Compliance matrix: Phase 2. "), "Compliance matrix: Phase 2", "a sheet title carries no closing period");
  assert.match(workbookParts({ ...spec, highlightRow: 2 }).find(part => part.path.endsWith("sheet1.xml")).content, /<row r="7"[^>]*><c r="A7" s="6"/, "one row can be washed in Flare");
  assert.equal(columnName(0) + columnName(25) + columnName(26) + columnName(701) + columnName(702), "AZAAZZAAA");
  assert.throws(() => workbookParts({ ...spec, columns: [{ header: "A", width: 8 }, { header: "a", width: 8 }] }), /unique/);

  // The file is a real ZIP that reads back to the same parts.
  const bytes = await writeXlsx(spec);
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const back = await unzipFiles(bytes);
  assert.deepEqual(back.map(entry => entry.path).sort(), Object.keys(parts).sort());
  assert.equal(new TextDecoder().decode(back.find(entry => entry.path === "xl/tables/table1.xml").data), table);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  await assert.rejects(unzipFiles(new TextEncoder().encode("not a zip at all, just text")), /not a ZIP archive/);
});

test("text comes out of Word and PDF uploads in reading order", async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>L.3.1 Volume I, Technical, shall not exceed </w:t></w:r><w:r><w:t xml:space="preserve">25 pages.</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Factor 1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Technical &amp; risk</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:r><w:t>M.2 Factor 1</w:t><w:tab/><w:t>is &#8220;significantly&#8221; more important</w:t><w:br/><w:t>than Factor 2.</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(documentXmlToText(xml), "L.3.1 Volume I, Technical, shall not exceed 25 pages.\nFactor 1 | Technical & risk\nM.2 Factor 1\tis “significantly” more important\nthan Factor 2.");
  const docx = await zipFiles([{ path: "[Content_Types].xml", data: new TextEncoder().encode("<Types/>") }, { path: "word/document.xml", data: new TextEncoder().encode(xml) }]);
  assert.match(await docxToText(docx), /^L\.3\.1 Volume I, Technical, shall not exceed 25 pages\./);
  await assert.rejects(docxToText(await zipFiles([{ path: "xl/workbook.xml", data: new Uint8Array(3) }])), /not a Word document/);
  const real = await docxToText(new Uint8Array(readFileSync(new URL("../proposal-war-room/fixtures/sample-excerpt.docx", import.meta.url))));
  assert.equal(real.replace(/\s+/g, " "), fixture("sample-excerpt.txt").replace(/\s+/g, " ").trim(), "a document saved by a word processor reads back as its text");
  assert.equal(pdfItemsToText([
    { str: "L.2 Proposals are due", transform: [1, 0, 0, 1, 72, 700] }, { str: " 2:00 PM", transform: [1, 0, 0, 1, 180, 700], hasEOL: true },
    { str: "via the designated portal.", transform: [1, 0, 0, 1, 72, 686] }, { str: "L.3.1 Volume I", transform: [1, 0, 0, 1, 72, 660] },
  ]), "L.2 Proposals are due 2:00 PM\nvia the designated portal.\nL.3.1 Volume I");
});

test("needs attention today is computed from the data, most serious first", () => {
  const pursuit = updateNode(sample(), section(sample(), "L.4.2").id, { currentPages: 12 });
  const texts = needsAttention(pursuit, "2027-01-13").map(item => item.text);
  assert.deepEqual(texts, [
    "Volume I, Technical is 2 pages over its 25-page limit.",
    "Internal submit is in 2 business days, on Fri 15 Jan 2027.",
    "Priya Raman has 2 overdue sections.",
    "Marcus Bell has 1 overdue section.",
    "1 compliance item is a Gap.",
    "5 Section L requirements map to no section.",
    "1 Section M factor or subfactor traces to no section.",
    "1 conflict in the solicitation is unresolved.",
    "The Q&A deadline passed on Fri 11 Dec 2026 with 5 questions still open.",
  ]);
  assert.match(needsAttention(newPursuit("Empty", NOW), TODAY)[0].text, /no due date/);
  const fresh = replan({ ...newPursuit("Tidy", NOW) }, TODAY, NOW, "Schedule planned", "", { dueDate: "2027-03-01" }).pursuit;
  assert.deepEqual(needsAttention(fresh, "2026-12-03"), [], "a planned pursuit with nothing wrong has nothing to report");
  const gold = needsAttention(sample(), "2027-01-06").find(item => item.key === "gate");
  assert.equal(gold.text, "Gold team review is in 2 business days and the readiness gate is not met: 12 Open, 1 Gap.");
});

test("the status email request sends figures and names, never requirement text", () => {
  const pursuit = sample();
  const request = statusRequest(pursuit, "2027-01-13");
  assert.equal(request.action, "status_update");
  const payload = statusPayload(pursuit, "2027-01-13");
  assert.equal(payload.due.business_days_remaining, 3);
  assert.equal(payload.next_milestone.name, "Internal submit");
  assert.deepEqual(payload.page_budget[0], { volume: "Volume I, Technical", page_limit: 25, current_pages: 23, percent_of_limit: 92, status: "Near limit" });
  assert.equal(payload.compliance.gold_team_ready, false);
  assert.equal(payload.sender_name, "Luis Ortega");
  const json = JSON.stringify(request);
  assert.ok(json.length < 16000, "the request stays inside the server's limit");
  for (const item of pursuit.requirements.filter(entry => entry.text.length > 40)) assert.equal(json.includes(item.text), false, "requirement text stays out of the email request");
  for (const person of pursuit.roster) assert.equal(json.includes(person.email), false, "email addresses stay out of the email request");
});

test("acceptance 13: the drafted status email has no dashes, exclamation points, emoji or icons, and no period on its subject", () => {
  // The reply Claude gave for the worked sample, recorded as it came back.
  const recorded = cleanEmail(fixture("sample-status-reply.txt"));
  assert.equal(recorded.subject, "Sentinel Range Modernization is off track for internal submit");
  assert.deepEqual(recorded.cleaned, [], "the recorded draft needed no repair");
  assert.deepEqual(emailProblems(recorded.subject, recorded.body), []);
  assert.match(recorded.body, /^Team,\n\nSentinel Range Modernization is not on track\./, "outcome first");
  assert.match(recorded.body, /Luis Ortega$/);

  // Whatever comes back, the same rules are enforced before the draft is shown.
  const dirty = cleanEmail("**Subject:** ASTRION status update — great progress!.\n\nTeam,\n\nWe are on plan — Red team is next! \u{1F680}\n• Volume I is at 23–25 pages ✅\n\nThanks!");
  assert.equal(dirty.subject, "Astrion status update, great progress");
  assert.equal(dirty.body, "Team,\n\nWe are on plan, Red team is next.\n- Volume I is at 23 to 25 pages\n\nThanks.");
  assert.deepEqual(emailProblems(dirty.subject, dirty.body), []);
  assert.deepEqual(dirty.cleaned, ["em or en dash", "exclamation point", "emoji, icon or symbol", "ASTRION in capitals", "subject ends in a period", "Markdown"]);
  assert.equal(cleanEmail("Status for Monday.\n\nBody text.").subject, "Status for Monday", "a draft with no subject label still gets a subject, without its period");

  const template = templateEmail(sample(), "2027-01-13");
  assert.deepEqual(emailProblems(template.subject, template.body), []);
  assert.equal(template.subject, "Sentinel Range Modernization status: 3 business days to due");
  assert.match(template.body, /- Volume I, Technical: 23 of 25 pages, 92%, Near limit/);
});

test("every status is a word, and icons hold their minimum size", () => {
  for (const word of STATUS_WORDS) assert.ok(word.length > 1 && /^[A-Z]/.test(word), `${word} reads as a word`);
  for (const word of ["Not started", "N/A"]) assert.equal(statusStyle(word).icon, null, `${word} is shown as a word only`);
  assert.deepEqual(["Outlining", "Drafting", "Open"].map(word => statusStyle(word).icon), Array(3).fill("status-in-progress"));
  assert.deepEqual(["Verified compliant", "Final", "Ready"].map(word => statusStyle(word).icon), Array(3).fill("status-complete"));
  assert.deepEqual(["Gap", "Not ready", "Over"].map(word => statusStyle(word).icon), Array(3).fill("status-blocked"));
  assert.equal(statusStyle("In review").icon, "color-review");
  assert.equal(statusStyle("Addressed").icon, "check");
  // Interface and Documents icons may sit at 16 px. Every other group stays at 20 px or larger.
  assert.equal(iconSize("lock", 16), 16);
  assert.equal(iconSize("check", 16), 16);
  assert.equal(iconSize("status-blocked", 16), 20);
  assert.equal(iconSize("color-review", 16), 20);
  assert.equal(iconSize("gate-review", 24), 24);
  const groups = JSON.parse(readFileSync(new URL("../proposal-war-room/src/assets/icon-groups.json", import.meta.url), "utf8"));
  assert.deepEqual([...SMALL_OK].sort(), [...groups.Interface, ...groups.Documents].sort());
});
