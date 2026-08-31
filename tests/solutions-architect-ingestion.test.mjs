import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { deflateRawSync } from "node:zlib";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const modulePath = resolve(rootDir, "solutions-architect", "ingestion.js");
const workerPath = resolve(rootDir, "solutions-architect", "ingestion-worker.js");
const ingestion = await import(pathToFileURL(modulePath));

function exactArrayBuffer(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function fakePdfBytes() {
  return exactArrayBuffer(Buffer.from("%PDF-1.7\n% local parser test\n", "ascii"));
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function makeZip(records, { deflate = true } = {}) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const record of records) {
    const name = Buffer.from(record.name, "utf8");
    const raw = Buffer.from(record.content || "", record.encoding || "utf8");
    const method = deflate && raw.length ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const flags = record.flags ?? 0x0800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

function loadWorkerInternals({ spreadsheet = false, workerConsole } = {}) {
  const workerSource = readFileSync(workerPath, "utf8");
  const spreadsheetSource = spreadsheet ? readFileSync(resolve(rootDir, "black-hat-agent", "vendor", "xlsx.full.min.js"), "utf8") : "";
  const self = {
    addEventListener() {},
    postMessage() {}
  };
  let context;
  const globals = {
    self,
    TextDecoder,
    TextEncoder,
    Blob,
    Response,
    DecompressionStream,
    importScripts() {
      if (!spreadsheet) throw new Error("Spreadsheet vendor loading is not expected in this test.");
      vm.runInContext(spreadsheetSource, context, { filename: "xlsx.full.min.js" });
    }
  };
  if (workerConsole) globals.console = workerConsole;
  context = vm.createContext(globals);
  vm.runInContext(workerSource, context, { filename: workerPath });
  if (spreadsheet) context.importScripts();
  return { ...self.SolutionIngestionWorkerInternals, xlsxForTests: context.XLSX, contextForTests: context };
}

const docxContentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const pptxContentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`;

function presentationXml(relationshipIds) {
  return `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${relationshipIds.map((id, index) => `<p:sldId id="${256 + index}" r:id="${id}"/>`).join("")}</p:sldIdLst></p:presentation>`;
}

function presentationRelationships(relationships) {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.map(({ id, target }) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/>`).join("")}</Relationships>`;
}

function slideXml(text, { hidden = false } = {}) {
  return `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"${hidden ? ` show="0"` : ""}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

test("strict local text and JSON extraction returns bounded provenance without persistence", async () => {
  const source = exactArrayBuffer(Buffer.from('{"mission":"protect","count":2}', "utf8"));
  const result = await ingestion.extractSource(source, { filename: "customer.json", locator: "Customer package / Annex A" });

  assert.equal(result.contract, "solution-source-extract-v1");
  assert.equal(result.filename, "customer.json");
  assert.equal(result.locator, "Customer package / Annex A");
  assert.equal(result.format, "json");
  assert.equal(result.mediaType, "application/json");
  assert.match(result.text, /"mission": "protect"/);
  assert.equal(result.textLength, result.text.length);
  assert.equal(result.sizeBytes, source.byteLength);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.needsManualText, false);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(Object.isFrozen(result), true);

  await assert.rejects(
    ingestion.extractSource(exactArrayBuffer(Buffer.from([0xc3, 0x28])), { filename: "bad.txt" }),
    /not valid UTF-8/i
  );
  await assert.rejects(
    ingestion.extractSource(exactArrayBuffer(Buffer.from("{broken", "utf8")), { filename: "bad.json" }),
    /JSON file is malformed/i
  );
  await assert.rejects(
    ingestion.extractSource(exactArrayBuffer(Buffer.from("spoofed", "utf8")), { filename: "payload.exe", mediaType: "text/plain" }),
    /Unsupported source type/i
  );
});

test("text limits are fail-closed and oversized Blob-like inputs are rejected before reading", async () => {
  const result = await ingestion.extractSource(exactArrayBuffer(Buffer.from("x".repeat(5_000))), {
    filename: "notes.md",
    maxTextChars: 1_000
  });
  assert.equal(result.text.length, 1_000);
  assert.equal(result.truncated, true);
  assert.ok(result.diagnostics.some(item => item.code === "text-truncated"));

  let read = false;
  const oversized = {
    name: "oversized.txt",
    type: "text/plain",
    size: ingestion.MAX_SOURCE_FILE_BYTES + 1,
    async arrayBuffer() { read = true; return new ArrayBuffer(1); }
  };
  await assert.rejects(ingestion.extractSource(oversized), /exceeds the 8 MB/i);
  assert.equal(read, false, "oversized files must be rejected before bytes are read");

  const unsupported = {
    name: "customer-package.exe",
    type: "text/plain",
    size: 1,
    async arrayBuffer() { read = true; return new ArrayBuffer(1); }
  };
  read = false;
  await assert.rejects(ingestion.extractSource(unsupported), /Unsupported source type/i);
  assert.equal(read, false, "unsupported native files must be rejected before bytes are read");
});

test("image ingestion records dimensions and a hash while requiring manual text instead of OCR", async () => {
  const png = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  const result = await ingestion.extractSource(exactArrayBuffer(png), { filename: "context.png" });

  assert.deepEqual(result.metadata, { width: 640, height: 480 });
  assert.equal(result.text, "");
  assert.equal(result.needsManualText, true);
  assert.ok(result.diagnostics.some(item => /does not perform OCR|not OCR-processed/i.test(item.message)));

  const oversizedDimensions = Buffer.from(png);
  oversizedDimensions.writeUInt32BE(5_000, 16);
  oversizedDimensions.writeUInt32BE(5_000, 20);
  await assert.rejects(
    ingestion.extractSource(exactArrayBuffer(oversizedDimensions), { filename: "oversized-dimensions.png" }),
    /invalid or unsafe dimensions/i
  );
});

test("PDF timeout governs page extraction and destroys both the document and loading worker", async () => {
  let loadingTaskDestroyCount = 0;
  let documentDestroyCount = 0;
  let getDocumentOptions;
  let pageReadStarted;
  const pageStarted = new Promise(resolve => { pageReadStarted = resolve; });
  const pdf = {
    numPages: 1,
    async getJSActions() { return null; },
    async getAttachments() { return null; },
    async getPage() {
      return {
        getTextContent() {
          pageReadStarted();
          return new Promise(() => {});
        },
        cleanup() {}
      };
    },
    async destroy() { documentDestroyCount += 1; }
  };
  const loadingTask = {
    promise: Promise.resolve(pdf),
    async destroy() { loadingTaskDestroyCount += 1; }
  };
  const pdfModule = {
    GlobalWorkerOptions: {},
    getDocument(options) { getDocumentOptions = options; return loadingTask; }
  };

  const extraction = ingestion.extractSource(fakePdfBytes(), {
    filename: "stalled-page.pdf",
    timeoutMs: 1_000,
    pdfModuleLoader: async () => pdfModule
  });
  await pageStarted;
  await assert.rejects(extraction, /PDF extraction timed out and its worker was stopped/i);
  assert.equal(documentDestroyCount, 1);
  assert.equal(loadingTaskDestroyCount, 1);
  assert.equal(getDocumentOptions.isEvalSupported, false);
  assert.equal(getDocumentOptions.enableScripting, false);
  assert.equal(getDocumentOptions.disableAutoFetch, true);
  assert.equal(getDocumentOptions.disableStream, true);
  assert.equal(getDocumentOptions.verbosity, 0);
});

test("AbortSignal cancels PDF metadata inspection and destroys its worker", async () => {
  const controller = new AbortController();
  let loadingTaskDestroyCount = 0;
  let documentDestroyCount = 0;
  let metadataReadStarted;
  const metadataStarted = new Promise(resolve => { metadataReadStarted = resolve; });
  const pdf = {
    numPages: 1,
    getJSActions() {
      metadataReadStarted();
      return new Promise(() => {});
    },
    async destroy() { documentDestroyCount += 1; }
  };
  const loadingTask = {
    promise: Promise.resolve(pdf),
    async destroy() { loadingTaskDestroyCount += 1; }
  };
  const extraction = ingestion.extractSource(fakePdfBytes(), {
    filename: "stalled-metadata.pdf",
    signal: controller.signal,
    pdfModuleLoader: async () => ({ GlobalWorkerOptions: {}, getDocument: () => loadingTask })
  });

  await metadataStarted;
  controller.abort();
  await assert.rejects(extraction, /PDF extraction was canceled and its worker was stopped/i);
  assert.equal(documentDestroyCount, 1);
  assert.equal(loadingTaskDestroyCount, 1);
});

test("the disposable worker extracts DOCX text and locators from a bounded ZIP", async () => {
  const internals = loadWorkerInternals();
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>Mission need</w:t></w:r><w:tab/><w:r><w:t>protect the interface</w:t></w:r></w:p></w:body>
    </w:document>`;
  const zip = makeZip([
    { name: "[Content_Types].xml", content: docxContentTypes },
    { name: "_rels/.rels", content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", content: documentXml }
  ]);
  const result = await internals.extractDocx(exactArrayBuffer(zip), internals.limitsFrom({ maxTextChars: 20_000 }));

  assert.match(result.text, /Mission need\s+protect the interface/);
  assert.equal(result.truncated, false);
  assert.equal(result.needsManualText, false);
  assert.equal(result.sections[0].part, "word/document.xml");
  assert.equal(result.metadata.partsRead, 1);
});

test("DOCX extraction follows document relationships and excludes removed or orphan auxiliary content", async () => {
  const internals = loadWorkerInternals();
  const relationshipType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <w:body>
      <w:sectPr><w:headerReference w:type="default" r:id="rHeaderActive"/></w:sectPr>
      <w:p><w:r><w:t>Main narrative</w:t></w:r><w:commentReference w:id="5"/></w:p>
      <w:p><w:r><w:t>See note</w:t></w:r><w:footnoteReference w:id="2"/><w:endnoteReference w:id="3"/></w:p>
    </w:body>
  </w:document>`;
  const relationships = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rHeaderActive" Type="${relationshipType}/header" Target="header2.xml"/>
    <Relationship Id="rHeaderRemoved" Type="${relationshipType}/header" Target="header9.xml"/>
    <Relationship Id="rFooterRemoved" Type="${relationshipType}/footer" Target="footer1.xml"/>
    <Relationship Id="rFootnotes" Type="${relationshipType}/footnotes" Target="footnotes.xml"/>
    <Relationship Id="rEndnotes" Type="${relationshipType}/endnotes" Target="endnotes.xml"/>
    <Relationship Id="rComments" Type="${relationshipType}/comments" Target="comments.xml"/>
  </Relationships>`;
  const zip = makeZip([
    { name: "[Content_Types].xml", content: docxContentTypes },
    { name: "word/document.xml", content: documentXml },
    { name: "word/_rels/document.xml.rels", content: relationships },
    { name: "word/header2.xml", content: `<w:hdr xmlns:w="x"><w:p><w:r><w:t>Active header context</w:t></w:r></w:p></w:hdr>` },
    { name: "word/header9.xml", content: `<w:hdr xmlns:w="x"><w:t>REMOVED HEADER SECRET</w:t></w:hdr>` },
    { name: "word/footer1.xml", content: `<w:ftr xmlns:w="x"><w:t>REMOVED FOOTER SECRET</w:t></w:ftr>` },
    { name: "word/header99.xml", content: `<w:hdr xmlns:w="x"><w:t>ORPHAN HEADER SECRET</w:t></w:hdr>` },
    { name: "word/footnotes.xml", content: `<w:footnotes xmlns:w="x"><w:footnote w:id="-1"><w:t>separator</w:t></w:footnote><w:footnote w:id="2"><w:t>Referenced footnote</w:t></w:footnote><w:footnote w:id="8"><w:t>ORPHAN FOOTNOTE SECRET</w:t></w:footnote></w:footnotes>` },
    { name: "word/endnotes.xml", content: `<w:endnotes xmlns:w="x"><w:endnote w:id="0"><w:t>separator</w:t></w:endnote><w:endnote w:id="3"><w:t>Referenced endnote</w:t></w:endnote><w:endnote w:id="9"><w:t>ORPHAN ENDNOTE SECRET</w:t></w:endnote></w:endnotes>` },
    { name: "word/comments.xml", content: `<w:comments xmlns:w="x"><w:comment w:id="5"><w:p><w:r><w:t>Referenced comment</w:t></w:r></w:p></w:comment><w:comment w:id="6"><w:p><w:r><w:t>REMOVED COMMENT SECRET</w:t></w:r></w:p></w:comment></w:comments>` }
  ]);

  const result = await internals.extractDocx(exactArrayBuffer(zip), internals.limitsFrom({ maxTextChars: 20_000 }));
  assert.match(result.text, /Main narrative/);
  assert.match(result.text, /Active header context/);
  assert.match(result.text, /Referenced footnote/);
  assert.match(result.text, /Referenced endnote/);
  assert.match(result.text, /Referenced comment/);
  assert.doesNotMatch(result.text, /REMOVED|ORPHAN|separator/);
  assert.deepEqual(
    Object.fromEntries(["partsRead", "relatedAuxiliaryPartCount", "excludedAuxiliaryPartCount", "excludedCommentCount", "excludedFootnoteCount", "excludedEndnoteCount"].map(field => [field, result.metadata[field]])),
    { partsRead: 5, relatedAuxiliaryPartCount: 6, excludedAuxiliaryPartCount: 3, excludedCommentCount: 1, excludedFootnoteCount: 1, excludedEndnoteCount: 1 }
  );
  assert.ok(result.diagnostics.some(item => item.code === "docx-auxiliary-parts-excluded"));
  assert.ok(result.diagnostics.some(item => item.code === "docx-unreferenced-items-excluded"));
});

test("PPTX extraction follows declared presentation order and ignores orphan slide parts", async () => {
  const internals = loadWorkerInternals();
  const zip = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: presentationXml(["rIdSecond", "rIdFirst"]) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelationships([
      { id: "rIdFirst", target: "slides/slide1.xml" },
      { id: "rIdSecond", target: "slides/slide2.xml" },
      { id: "rIdOrphan", target: "slides/slide99.xml" }
    ]) },
    { name: "ppt/slides/slide1.xml", content: slideXml("Filename one is second in the presentation") },
    { name: "ppt/slides/slide2.xml", content: slideXml("Filename two is first in the presentation") },
    { name: "ppt/slides/slide99.xml", content: slideXml("ORPHAN SLIDE MUST NOT BE INGESTED") }
  ]);

  const result = await internals.extractPptx(exactArrayBuffer(zip), internals.limitsFrom({ maxTextChars: 20_000 }));
  assert.ok(result.text.indexOf("Filename two is first") < result.text.indexOf("Filename one is second"));
  assert.doesNotMatch(result.text, /ORPHAN SLIDE MUST NOT BE INGESTED/);
  assert.deepEqual(Array.from(result.sections, section => section.label), ["Slide 1", "Slide 2"]);
  assert.deepEqual(Array.from(result.sections, section => section.part), ["slide=1", "slide=2"]);
  assert.deepEqual(
    Object.fromEntries(["slideCount", "visibleSlideCount", "hiddenSlideCount", "orphanSlideCount", "slidesRead"].map(field => [field, result.metadata[field]])),
    { slideCount: 2, visibleSlideCount: 2, hiddenSlideCount: 0, orphanSlideCount: 1, slidesRead: 2 }
  );

  const limited = await internals.extractPptx(exactArrayBuffer(zip), internals.limitsFrom({ maxTextChars: 20_000, maxSlides: 1 }));
  assert.match(limited.text, /Filename two is first/);
  assert.doesNotMatch(limited.text, /Filename one is second/);
  assert.equal(limited.truncated, true);
  assert.ok(limited.diagnostics.some(item => item.code === "slides-truncated"));
  assert.equal(limited.diagnostics.some(item => item.code === "text-truncated"), false);
});

test("PPTX extraction excludes hidden slides with a diagnostic while preserving presentation positions", async () => {
  const internals = loadWorkerInternals();
  const zip = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: presentationXml(["rId1", "rId2", "rId3"]) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelationships([
      { id: "rId1", target: "slides/slide1.xml" },
      { id: "rId2", target: "slides/slide2.xml" },
      { id: "rId3", target: "slides/slide3.xml" }
    ]) },
    { name: "ppt/slides/slide1.xml", content: slideXml("Visible opening") },
    { name: "ppt/slides/slide2.xml", content: slideXml("HIDDEN CONTENT MUST NOT BE INGESTED", { hidden: true }) },
    { name: "ppt/slides/slide3.xml", content: slideXml("Visible close") }
  ]);

  const result = await internals.extractPptx(exactArrayBuffer(zip), internals.limitsFrom({ maxTextChars: 20_000 }));
  assert.match(result.text, /Visible opening/);
  assert.match(result.text, /Visible close/);
  assert.doesNotMatch(result.text, /HIDDEN CONTENT MUST NOT BE INGESTED/);
  assert.deepEqual(Array.from(result.sections, section => section.label), ["Slide 1", "Slide 3"]);
  assert.equal(result.metadata.hiddenSlideCount, 1);
  assert.equal(result.metadata.visibleSlideCount, 2);
  assert.ok(result.diagnostics.some(item => item.code === "hidden-slides-excluded" && /1 hidden slide was excluded/i.test(item.message)));
});

test("PPTX extraction rejects packages missing presentation ordering or relationships metadata", async () => {
  const internals = loadWorkerInternals();
  const missingPresentation = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/slides/slide1.xml", content: slideXml("Unordered slide") }
  ]);
  await assert.rejects(
    internals.extractPptx(exactArrayBuffer(missingPresentation), internals.limitsFrom()),
    /missing ppt\/presentation\.xml presentation metadata/i
  );

  const missingRelationships = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: presentationXml(["rId1"]) },
    { name: "ppt/slides/slide1.xml", content: slideXml("Unrelated slide") }
  ]);
  await assert.rejects(
    internals.extractPptx(exactArrayBuffer(missingRelationships), internals.limitsFrom()),
    /missing ppt\/_rels\/presentation\.xml\.rels presentation metadata/i
  );

  const missingOrder = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>` },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelationships([{ id: "rId1", target: "slides/slide1.xml" }]) },
    { name: "ppt/slides/slide1.xml", content: slideXml("Undeclared slide") }
  ]);
  await assert.rejects(
    internals.extractPptx(exactArrayBuffer(missingOrder), internals.limitsFrom()),
    /missing its slide-order list/i
  );

  const missingRelationship = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: presentationXml(["rIdMissing"]) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelationships([{ id: "rIdOther", target: "slides/slide1.xml" }]) },
    { name: "ppt/slides/slide1.xml", content: slideXml("Unreferenced slide") }
  ]);
  await assert.rejects(
    internals.extractPptx(exactArrayBuffer(missingRelationship), internals.limitsFrom()),
    /references missing relationship rIdMissing/i
  );

  const missingTarget = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: presentationXml(["rId1"]) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelationships([{ id: "rId1", target: "slides/missing.xml" }]) }
  ]);
  await assert.rejects(
    internals.extractPptx(exactArrayBuffer(missingTarget), internals.limitsFrom()),
    /references missing slide part ppt\/slides\/missing\.xml/i
  );

  const unsafeTarget = makeZip([
    { name: "[Content_Types].xml", content: pptxContentTypes },
    { name: "ppt/presentation.xml", content: presentationXml(["rId1"]) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelationships([{ id: "rId1", target: "../../outside.xml" }]) }
  ]);
  await assert.rejects(
    internals.extractPptx(exactArrayBuffer(unsafeTarget), internals.limitsFrom()),
    /outside the package|invalid slide relationship target/i
  );
});

test("ZIP preflight rejects traversal, encryption, ZIP64, active content, and external relationships", async () => {
  const internals = loadWorkerInternals();
  assert.throws(
    () => internals.preflightZip(exactArrayBuffer(makeZip([{ name: "../escape.xml", content: "x" }]))),
    /traversal/i
  );
  assert.throws(
    () => internals.preflightZip(exactArrayBuffer(makeZip([{ name: "safe.xml", content: "x", flags: 0x0801 }]))),
    /Encrypted/i
  );

  const zip64 = makeZip([{ name: "safe.xml", content: "x" }]);
  zip64.writeUInt16LE(0xffff, zip64.length - 12);
  assert.throws(() => internals.preflightZip(exactArrayBuffer(zip64)), /ZIP64/i);

  const macro = makeZip([
    { name: "[Content_Types].xml", content: docxContentTypes },
    { name: "word/document.xml", content: `<w:document xmlns:w="x"><w:t>Text</w:t></w:document>` },
    { name: "word/vbaProject.bin", content: "macro" }
  ]);
  await assert.rejects(internals.extractDocx(exactArrayBuffer(macro), internals.limitsFrom()), /macros|embedded objects/i);

  const external = makeZip([
    { name: "[Content_Types].xml", content: docxContentTypes },
    { name: "word/document.xml", content: `<w:document xmlns:w="x"><w:t>Text</w:t></w:document>` },
    { name: "word/_rels/document.xml.rels", content: `<Relationships><Relationship Target="https://example.test" TargetMode="External"/></Relationships>` }
  ]);
  await assert.rejects(internals.extractDocx(exactArrayBuffer(external), internals.limitsFrom()), /external relationships/i);
});

test("spreadsheet extraction excludes hidden sheets, rows, and columns and never ingests formula expressions", async () => {
  const internals = loadWorkerInternals({ spreadsheet: true });
  const xlsx = internals.xlsxForTests;
  const workbook = xlsx.utils.book_new();
  const visible = xlsx.utils.aoa_to_sheet([
    ["Candidate", "Internal note", "Score"],
    ["Alpha", "HIDDEN COLUMN SECRET", 3],
    ["HIDDEN ROW SECRET", "row secret", 5],
    ["Bravo", "other", 4]
  ]);
  visible.C2.f = "1+2";
  visible.C2.w = "3";
  visible["!rows"] = [];
  visible["!rows"][2] = { hidden: true };
  visible["!cols"] = [];
  visible["!cols"][1] = { hidden: true };
  const hidden = xlsx.utils.aoa_to_sheet([["HIDDEN SHEET SECRET"]]);
  xlsx.utils.book_append_sheet(workbook, visible, "Assessment");
  xlsx.utils.book_append_sheet(workbook, hidden, "Hidden notes");
  xlsx.utils.book_set_sheet_visibility(workbook, "Hidden notes", xlsx.utils.consts.SHEET_HIDDEN);
  const file = xlsx.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellStyles: true });

  const result = await internals.extractSpreadsheet(exactArrayBuffer(Buffer.from(file)), "xlsx", internals.limitsFrom({ maxRows: 50, maxColumns: 20 }));
  assert.match(result.text, /Worksheet: Assessment/);
  assert.match(result.text, /Alpha\s+3/);
  assert.match(result.text, /Bravo\s+4/);
  assert.doesNotMatch(result.text, /1\+2|HIDDEN (?:COLUMN|ROW|SHEET) SECRET|row secret|other/);
  assert.equal(result.metadata.visibleSheetCount, 1);
  assert.equal(result.metadata.formulaCellCount, 1);
  assert.equal(result.metadata.hiddenRowCount, 1);
  assert.equal(result.metadata.hiddenColumnCount, 1);
  assert.ok(result.diagnostics.some(item => item.code === "formula-values-only"));
  assert.ok(result.diagnostics.some(item => item.code === "hidden-dimensions-excluded" && /1 hidden row and 1 hidden column/i.test(item.message)));
});

test("spreadsheet parsing suppresses vendor console output and restores console methods after success or failure", async () => {
  const calls = [];
  const originalLog = (...values) => calls.push(["log", ...values]);
  const originalWarn = (...values) => calls.push(["warn", ...values]);
  const originalError = (...values) => calls.push(["error", ...values]);
  const workerConsole = { log: originalLog, warn: originalWarn, error: originalError };
  const internals = loadWorkerInternals({ spreadsheet: true, workerConsole });
  const xlsx = internals.xlsxForTests;
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([["Visible value"]]), "Sheet1");
  const file = exactArrayBuffer(Buffer.from(xlsx.write(workbook, { type: "array", bookType: "xlsx" })));
  calls.length = 0;

  vm.runInContext(`
    const originalReadForConsoleTest = XLSX.read;
    XLSX.read = function (...args) {
      console.log("WORKBOOK LOG SENTINEL");
      console.warn("WORKBOOK WARN SENTINEL");
      console.error("WORKBOOK ERROR SENTINEL");
      return originalReadForConsoleTest.apply(this, args);
    };
  `, internals.contextForTests);
  const result = await internals.extractSpreadsheet(file, "xlsx", internals.limitsFrom());
  assert.match(result.text, /Visible value/);
  assert.deepEqual(calls, []);
  assert.equal(workerConsole.log, originalLog);
  assert.equal(workerConsole.warn, originalWarn);
  assert.equal(workerConsole.error, originalError);

  vm.runInContext(`
    XLSX.read = function () {
      console.error("WORKBOOK FAILURE SENTINEL");
      throw new Error("vendor included workbook content in a diagnostic");
    };
  `, internals.contextForTests);
  await assert.rejects(internals.extractSpreadsheet(file, "xlsx", internals.limitsFrom()), /could not be parsed by the bundled local reader/i);
  assert.deepEqual(calls, []);
  assert.equal(workerConsole.log, originalLog);
  assert.equal(workerConsole.warn, originalWarn);
  assert.equal(workerConsole.error, originalError);
  workerConsole.warn("console restored");
  assert.deepEqual(calls, [["warn", "console restored"]]);
});

test("Office extraction is dispatched to a terminating worker and preserves pre-transfer size", async () => {
  let terminated = false;
  let transferCount = 0;
  const fakeWorker = {
    postMessage(payload, transfers) {
      assert.equal(payload.format, "docx");
      transferCount = transfers.length;
      queueMicrotask(() => this.onmessage({ data: { ok: true, result: {
        text: "Bounded extracted text",
        truncated: false,
        needsManualText: false,
        diagnostics: [],
        sections: [{ label: "Document", part: "word/document.xml", start: 0, end: 22 }],
        metadata: { partsRead: 1 }
      } } }));
    },
    terminate() { terminated = true; }
  };
  const bytes = exactArrayBuffer(makeZip([{ name: "placeholder", content: "x" }]));
  const result = await ingestion.extractSource(bytes, {
    filename: "brief.docx",
    workerFactory: () => fakeWorker
  });

  assert.equal(transferCount, 1);
  assert.equal(terminated, true);
  assert.equal(result.sizeBytes, bytes.byteLength);
  assert.equal(result.sections[0].locator, "brief.docx#word-document.xml");
  assert.equal(result.text, "Bounded extracted text");
});
