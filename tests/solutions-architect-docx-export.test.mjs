import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspace } from "../solutions-architect/engine.js";
import {
  DOCX_MIME_TYPE,
  buildDecisionPackageDocx,
  buildDecisionPackageDocxBytes,
  buildDecisionPackageDocxModel,
  decisionPackageDocxFilename
} from "../solutions-architect/export-docx.js";

const decoder = new TextDecoder();

function uint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function uint32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZipEntries(bytes) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= bytes.length && uint32(bytes, offset) === 0x04034b50) {
    const flags = uint16(bytes, offset + 6);
    const compression = uint16(bytes, offset + 8);
    const compressedSize = uint32(bytes, offset + 18);
    const uncompressedSize = uint32(bytes, offset + 22);
    const expectedCrc = uint32(bytes, offset + 14);
    const nameLength = uint16(bytes, offset + 26);
    const extraLength = uint16(bytes, offset + 28);
    assert.equal(flags & 0x0800, 0x0800, "DOCX ZIP entry names should be UTF-8");
    assert.equal(compression, 0, "the dependency-free DOCX writer should use ZIP store mode");
    assert.equal(compressedSize, uncompressedSize);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    assert.equal(crc32(data), expectedCrc, `${name} should have a valid ZIP CRC-32`);
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  assert.equal(uint32(bytes, offset), 0x02014b50, "a central directory should follow the local entries");
  assert.equal(uint32(bytes, bytes.length - 22), 0x06054b50, "the package should end with a ZIP end-of-central-directory record");
  return entries;
}

function textEntry(entries, name) {
  assert.ok(entries.has(name), `missing DOCX package entry ${name}`);
  return decoder.decode(entries.get(name));
}

test("native DOCX export creates a complete, styled WordprocessingML package without export boilerplate", async () => {
  const workspace = createWorkspace();
  const solution = workspace.solutions[0];
  const generatedAt = new Date("2026-08-31T16:30:00-07:00");

  solution.classification = "DATA-MARKING-SENTINEL";
  workspace.candidates[0].description = "CANDIDATE-DESCRIPTION-SENTINEL";
  workspace.candidates[0].readinessBasis = "Substantive readiness basis; they are not an approval or authorization determination. Browser storage and GitHub Pages are not an authorization boundary.";
  workspace.criteria[0].description = "CRITERION-DESCRIPTION-SENTINEL";
  workspace.elements[0].description = "ELEMENT-DESCRIPTION-SENTINEL";
  workspace.evidence[0].participants = ["PARTICIPANT-SENTINEL"];
  workspace.evidence[0].missionSegments = [...solution.missionSegments];
  workspace.evidence[0].notes = 'HOSTILE-SENTINEL <script data-x="1">alert & test</script>';
  workspace.outcomes[0].title = "OUTCOME-TRACE-SENTINEL";

  const model = buildDecisionPackageDocxModel(workspace, solution.id, { generatedAt });
  assert.equal(model.prepared, "2026-08-31");
  assert.equal(Object.hasOwn(model.solution, "classification"), false);
  assert.equal(model.requirements.find(record => record.id === "req_latency").outcomeNames[0], "OUTCOME-TRACE-SENTINEL");

  const bytes = buildDecisionPackageDocxBytes(workspace, solution.id, { generatedAt });
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.ok(bytes.length > 50_000, "a complete decision package should contain substantial WordprocessingML content");

  const entries = storedZipEntries(bytes);
  for (const name of [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/core.xml",
    "docProps/app.xml",
    "word/document.xml",
    "word/styles.xml",
    "word/numbering.xml",
    "word/settings.xml",
    "word/header1.xml",
    "word/footer1.xml",
    "word/_rels/document.xml.rels"
  ]) assert.ok(entries.has(name), `expected ${name} in the DOCX package`);

  const contentTypes = textEntry(entries, "[Content_Types].xml");
  const document = textEntry(entries, "word/document.xml");
  const styles = textEntry(entries, "word/styles.xml");
  const numbering = textEntry(entries, "word/numbering.xml");
  const header = textEntry(entries, "word/header1.xml");
  const footer = textEntry(entries, "word/footer1.xml");
  const relationships = textEntry(entries, "word/_rels/document.xml.rels");
  const packageText = [...entries.values()].map(value => decoder.decode(value)).join("\n");

  assert.match(contentTypes, /wordprocessingml\.document\.main\+xml/);
  assert.match(relationships, /relationships\/styles/);
  assert.match(relationships, /relationships\/numbering/);
  assert.match(relationships, /relationships\/header/);
  assert.match(relationships, /relationships\/footer/);

  for (const heading of [
    "Executive overview",
    "Mission and operational context",
    "Customer priorities and win themes",
    "Requirements trace",
    "Technology Assessment",
    "Solution and proposal approach",
    "Architecture views",
    "Trades and decisions",
    "Risk, dependencies, and assumptions",
    "Roadmap, reviews, and transition",
    "Evidence and open obligations",
    "Acronym key"
  ]) assert.match(document, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  for (const marker of [
    "CANDIDATE-DESCRIPTION-SENTINEL",
    "CRITERION-DESCRIPTION-SENTINEL",
    "ELEMENT-DESCRIPTION-SENTINEL",
    "PARTICIPANT-SENTINEL",
    solution.missionSegments[0].replace("&", "&amp;"),
    "OUTCOME-TRACE-SENTINEL",
    "Technology Readiness Level",
    "Architecture interfaces and exchanges"
  ]) assert.match(document, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.doesNotMatch(packageText, /DATA-MARKING-SENTINEL/);
  assert.doesNotMatch(packageText, /browser/i);
  assert.doesNotMatch(packageText, /not an approval or authorization determination/i);
  assert.doesNotMatch(packageText, /not an authorization|DoD[- ]confirmed determination|DOF[- ]confirmed determination|DoDAF[- ]conformance determination/i);
  assert.doesNotMatch(document, /<!doctype html>|<html\b|<pre\b|<script\b/i);
  assert.match(document, /HOSTILE-SENTINEL &lt;script data-x=&quot;1&quot;&gt;alert &amp; test&lt;\/script&gt;/);
  assert.match(document, /Substantive readiness basis\./);

  assert.match(document, /<w:pgSz w:w="12240" w:h="15840"\/>/);
  assert.match(document, /<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
  assert.match(document, /<w:tblW w:w="9360" w:type="dxa"\/>/);
  assert.match(document, /<w:tblInd w:w="120" w:type="dxa"\/>/);
  assert.match(document, /<w:tblHeader\/>/);
  assert.match(styles, /w:ascii="Arial"/);
  assert.match(styles, /w:styleId="Heading1"[\s\S]+?<w:pageBreakBefore\/>/);
  assert.match(numbering, /w:numFmt w:val="bullet"/);
  assert.match(header, /<w:tab\/>/);
  assert.ok(footer.includes('w:instr="PAGE \\* MERGEFORMAT"'));

  const blob = buildDecisionPackageDocx(workspace, solution.id, { generatedAt });
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, DOCX_MIME_TYPE);
  assert.equal(blob.size, bytes.length);
  assert.equal(decisionPackageDocxFilename("Mission Package / Demo"), "mission-package-demo-decision-package.docx");
  assert.equal(decisionPackageDocxFilename(workspace, solution.id), "expeditionary-sensor-node-upgrade-decision-package.docx");
});

test("native DOCX export rejects an invalid workspace before creating a package", () => {
  const workspace = createWorkspace();
  workspace.activeSolutionId = "solution_missing";
  assert.throws(() => buildDecisionPackageDocxBytes(workspace), /DOCX export blocked:/);
});
