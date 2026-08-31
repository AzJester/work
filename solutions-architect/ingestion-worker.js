/* global XLSX */

(() => {
  "use strict";

  const MAX_UNCOMPRESSED_BYTES = 50_000_000;
  const MAX_ZIP_ENTRY_BYTES = 20_000_000;
  const MAX_ZIP_ENTRIES = 2_000;
  const DEFAULT_MAX_TEXT_CHARS = 200_000;
  const DEFAULT_MAX_ROWS = 500;
  const DEFAULT_MAX_COLUMNS = 100;
  const DEFAULT_MAX_SHEETS = 20;
  const DEFAULT_MAX_SLIDES = 200;
  let xlsxLoaded = false;
  let crcTable;

  function fail(message) {
    throw new Error(message);
  }

  function boundedInteger(value, fallback, maximum, minimum = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.floor(number)));
  }

  function limitsFrom(value = {}) {
    return {
      maxTextChars: boundedInteger(value.maxTextChars, DEFAULT_MAX_TEXT_CHARS, DEFAULT_MAX_TEXT_CHARS, 1_000),
      maxRows: boundedInteger(value.maxRows, DEFAULT_MAX_ROWS, 1_000),
      maxColumns: boundedInteger(value.maxColumns, DEFAULT_MAX_COLUMNS, 250),
      maxSheets: boundedInteger(value.maxSheets, DEFAULT_MAX_SHEETS, 50),
      maxSlides: boundedInteger(value.maxSlides, DEFAULT_MAX_SLIDES, 500)
    };
  }

  function safeError(error) {
    return String(error?.message || "The selected file could not be extracted safely.")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 500);
  }

  function note(code, message, severity = "warning") {
    return { code, message, severity };
  }

  function isZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]);
  }

  function findEndOfCentralDirectory(view) {
    const minimum = Math.max(0, view.byteLength - 65_557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    return -1;
  }

  function hasZip64Extra(view, offset, length) {
    const end = offset + length;
    while (offset + 4 <= end) {
      const type = view.getUint16(offset, true);
      const size = view.getUint16(offset + 2, true);
      if (offset + 4 + size > end) fail("A ZIP extra field is truncated.");
      if (type === 0x0001) return true;
      offset += 4 + size;
    }
    if (offset !== end) fail("A ZIP extra field is malformed.");
    return false;
  }

  function decodeZipName(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("A ZIP entry name is not valid UTF-8.");
    }
  }

  function normalizeEntryName(value) {
    const name = String(value).replace(/\\/g, "/");
    if (!name || name.includes("\u0000") || name.startsWith("/") || /^[a-z]:\//i.test(name)) {
      fail("The document ZIP contains an unsafe absolute entry path.");
    }
    const parts = name.split("/");
    if (parts.some(part => part === ".." || part === ".")) fail("The document ZIP contains an unsafe traversal entry path.");
    return name;
  }

  function preflightZip(buffer, { required = true } = {}) {
    const bytes = new Uint8Array(buffer);
    if (!isZip(bytes)) {
      if (required) fail("The selected Office file is not a valid ZIP package.");
      return null;
    }
    const view = new DataView(buffer);
    const eocd = findEndOfCentralDirectory(view);
    if (eocd < 0) fail("The document ZIP directory is malformed.");
    if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
      fail("Multi-disk ZIP packages are not supported.");
    }
    const entryCount = view.getUint16(eocd + 10, true);
    const diskEntryCount = view.getUint16(eocd + 8, true);
    const centralSize = view.getUint32(eocd + 12, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    if (entryCount === 0xffff || diskEntryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      fail("ZIP64 packages are not supported by this local importer.");
    }
    if (entryCount !== diskEntryCount) fail("The document ZIP has inconsistent entry counts.");
    if (entryCount > MAX_ZIP_ENTRIES) fail(`The document ZIP exceeds the ${MAX_ZIP_ENTRIES}-entry limit.`);
    if (centralOffset + centralSize > eocd || centralOffset + centralSize > view.byteLength) {
      fail("The document ZIP directory points outside the selected file.");
    }

    const entries = [];
    const seen = new Set();
    let offset = centralOffset;
    let totalUncompressed = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
        fail("The document ZIP directory contains an invalid entry.");
      }
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const checksum = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
      if (entryEnd > centralOffset + centralSize || entryEnd > view.byteLength) fail("The document ZIP directory is truncated.");
      if (flags & 0x0001 || flags & 0x0040) fail("Encrypted ZIP entries are not supported.");
      if (![0, 8].includes(method)) fail("The document ZIP uses an unsupported compression method.");
      if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) fail("ZIP64 entries are not supported.");
      if (hasZip64Extra(view, offset + 46 + nameLength, extraLength)) fail("ZIP64 entries are not supported.");
      if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) fail("A document ZIP entry exceeds the 20 MB expanded-size limit.");
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) fail("The document expands beyond the 50 MB local-processing limit.");
      if (compressedSize > 0 && uncompressedSize > 1_000_000 && uncompressedSize / compressedSize > 1_000) {
        fail("The document ZIP contains an unsafe compression ratio.");
      }
      const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength);
      const name = normalizeEntryName(decodeZipName(rawName));
      const key = name.toLowerCase();
      if (seen.has(key)) fail("The document ZIP contains duplicate entry names.");
      seen.add(key);

      if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) {
        fail("A document ZIP local entry is invalid.");
      }
      const localFlags = view.getUint16(localOffset + 6, true);
      const localMethod = view.getUint16(localOffset + 8, true);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      if ((localFlags & 0x0041) !== 0 || localMethod !== method) fail("A document ZIP entry has inconsistent security metadata.");
      if (localOffset + 30 + localNameLength + localExtraLength > centralOffset) fail("A document ZIP local entry is truncated.");
      if (hasZip64Extra(view, localOffset + 30 + localNameLength, localExtraLength)) fail("ZIP64 entries are not supported.");
      const localName = normalizeEntryName(decodeZipName(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)));
      if (localName !== name) fail("A document ZIP entry name does not match its directory record.");
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > centralOffset || dataOffset + compressedSize > view.byteLength) {
        fail("A document ZIP entry points outside the selected file.");
      }
      entries.push({ name, key, flags, method, checksum, compressedSize, uncompressedSize, dataOffset, isDirectory: name.endsWith("/") });
      offset = entryEnd;
    }
    if (offset !== centralOffset + centralSize) fail("The document ZIP directory contains unsupported trailing records.");
    return { buffer, entries, byName: new Map(entries.map(entry => [entry.key, entry])) };
  }

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  async function extractEntry(zip, entry) {
    if (!entry || entry.isDirectory) return new Uint8Array();
    const compressed = new Uint8Array(zip.buffer, entry.dataOffset, entry.compressedSize);
    let output;
    if (entry.method === 0) {
      output = compressed.slice();
    } else {
      if (typeof DecompressionStream !== "function") fail("This browser cannot safely expand local Office ZIP entries.");
      try {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        output = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch {
        fail(`The document ZIP entry ${entry.name.slice(0, 120)} could not be decompressed.`);
      }
    }
    if (output.byteLength !== entry.uncompressedSize) fail("A document ZIP entry expanded to an unexpected size.");
    if (crc32(output) !== entry.checksum) fail("A document ZIP entry failed its integrity check.");
    return output;
  }

  function decodeXml(bytes, label) {
    let xml;
    try {
      xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail(`${label} is not valid UTF-8 XML.`);
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail(`${label} contains unsupported XML entity declarations.`);
    return xml;
  }

  function decodeXmlEntities(value) {
    return String(value).replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos);/gi, (match, decimal, hexadecimal) => {
      if (decimal || hexadecimal) {
        const code = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
        return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : "�";
      }
      return ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'" })[match.toLowerCase()] || match;
    });
  }

  function xmlAttributes(fragment) {
    const attributes = new Map();
    const expression = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
    let match;
    while ((match = expression.exec(String(fragment || "")))) {
      const name = match[1].toLowerCase();
      if (attributes.has(name)) fail(`Office XML contains a duplicate ${match[1]} attribute.`);
      attributes.set(name, decodeXmlEntities(match[3]));
    }
    return attributes;
  }

  function packageText(xml, kind) {
    const tokens = [];
    const expression = kind === "docx"
      ? /<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>|<w:tab\b[^>]*\/?\s*>|<w:br\b[^>]*\/?\s*>|<\/w:(?:p|tr)\s*>|<\/w:tc\s*>/gi
      : /<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?\s*>|<\/a:p\s*>|<\/a:tc\s*>|<\/a:tr\s*>/gi;
    let match;
    while ((match = expression.exec(xml))) {
      if (match[1] !== undefined) tokens.push(decodeXmlEntities(match[1]));
      else if (/tab|tc/i.test(match[0])) tokens.push("\t");
      else tokens.push("\n");
    }
    return tokens.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function rejectActiveEntryNames(entries) {
    for (const entry of entries) {
      const name = entry.key;
      if (/(^|\/)vbaproject(?:signature)?\.bin$/.test(name) || /(^|\/)(?:word|ppt|xl)\/(?:embeddings|activex)\//.test(name) || /oleobject/.test(name)) {
        fail("Office files containing macros, ActiveX, or embedded objects are not supported.");
      }
      if (/^xl\/externallinks\//.test(name)) fail("Workbooks containing external links are not supported.");
      if (/^word\/(?:afchunk|altchunk)/.test(name)) fail("Word documents containing embedded alternate content are not supported.");
      if (/^(?:basic|scripts|objectreplacements)\//.test(name) || /^object(?:s)?(?:\s|\/)/.test(name)) {
        fail("OpenDocument files containing scripts or embedded objects are not supported.");
      }
    }
  }

  async function inspectPackage(zip, format) {
    rejectActiveEntryNames(zip.entries);
    const contentEntry = zip.byName.get("[content_types].xml");
    if (["docx", "pptx", "xlsx"].includes(format) && !contentEntry) fail("The Office package is missing [Content_Types].xml.");
    if (contentEntry) {
      const contentTypes = decodeXml(await extractEntry(zip, contentEntry), "[Content_Types].xml");
      if (/<Override\b[^>]*(?:vbaProject|macroEnabled|oleObject|activeX)[^>]*>/i.test(contentTypes)) fail("Macro-enabled or embedded-object Office files are not supported.");
      if (format === "docx" && !/wordprocessingml\.document\.main\+xml/i.test(contentTypes)) fail("The selected ZIP is not a standard DOCX document.");
      if (format === "pptx" && !/presentationml\.presentation\.main\+xml/i.test(contentTypes)) fail("The selected ZIP is not a standard PPTX presentation.");
      if (format === "xlsx" && !/spreadsheetml\.sheet\.main\+xml/i.test(contentTypes)) fail("The selected ZIP is not a standard XLSX workbook.");
    }
    for (const entry of zip.entries.filter(item => item.key.endsWith(".rels"))) {
      const relationships = decodeXml(await extractEntry(zip, entry), entry.name);
      if (/\bTargetMode\s*=\s*["']External["']/i.test(relationships)) {
        fail("Office files containing external relationships are not supported.");
      }
    }
    if (format === "ods") {
      const mimetypeEntry = zip.byName.get("mimetype");
      const contentEntryOds = zip.byName.get("content.xml");
      if (!mimetypeEntry || !contentEntryOds) fail("The ODS package is missing required spreadsheet parts.");
      const mimetype = new TextDecoder("utf-8", { fatal: true }).decode(await extractEntry(zip, mimetypeEntry)).trim();
      if (mimetype !== "application/vnd.oasis.opendocument.spreadsheet") fail("The selected ZIP is not a standard ODS spreadsheet.");
      const content = decodeXml(await extractEntry(zip, contentEntryOds), "content.xml");
      if (/<office:scripts\b|<script:event-listener\b/i.test(content)) fail("OpenDocument files containing scripts are not supported.");
      if (/\bxlink:href\s*=\s*["'](?:https?:|file:|\\\\|\.\.\/)/i.test(content)) fail("OpenDocument files containing external links are not supported.");
    }
  }

  function sectionBuilder(maxTextChars) {
    return { text: "", sections: [], truncated: false, maxTextChars };
  }

  function addSection(builder, label, part, content) {
    const cleaned = String(content || "").replace(/\u0000/g, "").trim();
    if (!cleaned || builder.text.length >= builder.maxTextChars) {
      if (cleaned) builder.truncated = true;
      return;
    }
    const prefix = builder.text ? "\n\n" : "";
    const heading = `${label}\n`;
    const available = builder.maxTextChars - builder.text.length - prefix.length;
    if (available <= 0) { builder.truncated = true; return; }
    const block = `${heading}${cleaned}`;
    const bounded = block.slice(0, available);
    const start = builder.text.length + prefix.length;
    builder.text += prefix + bounded;
    builder.sections.push({ label: String(label).slice(0, 160), part: String(part).slice(0, 300), start, end: builder.text.length });
    if (bounded.length < block.length) builder.truncated = true;
  }

  function qualifiedId(attributes) {
    return [...attributes.entries()].find(([name]) => name.includes(":") && name.endsWith(":id"))?.[1] || attributes.get("id") || "";
  }

  function wordReferenceIds(xml, elementNames) {
    const ids = new Set();
    const names = elementNames.join("|");
    const expression = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?(?:${names})\\b([^>]*)\\/?\\s*>`, "gi");
    let match;
    while ((match = expression.exec(xml))) {
      const id = qualifiedId(xmlAttributes(match[1]));
      if (id) ids.add(id);
    }
    return ids;
  }

  function docxAuxiliaryKind(type) {
    for (const kind of ["header", "footer", "footnotes", "endnotes", "comments"]) {
      if (new RegExp(`/${kind}$`, "i").test(type)) return kind;
    }
    return "";
  }

  function docxAuxiliaryRelationships(xml) {
    const records = [];
    const seen = new Set();
    const expression = /<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*)\/?\s*>/gi;
    let match;
    while ((match = expression.exec(xml))) {
      const attributes = xmlAttributes(match[1]);
      const id = attributes.get("id") || "";
      const type = attributes.get("type") || "";
      const target = attributes.get("target") || "";
      if (!id || !type || !target) fail("The DOCX document relationships metadata is malformed.");
      if ((attributes.get("targetmode") || "").toLowerCase() === "external") fail("Office files containing external relationships are not supported.");
      if (seen.has(id)) fail("The DOCX document relationships contain a duplicate relationship ID.");
      seen.add(id);
      const kind = docxAuxiliaryKind(type);
      if (kind) records.push({ id, kind, target });
    }
    return records;
  }

  function resolveDocxAuxiliaryTarget(target, kind) {
    const raw = String(target || "");
    if (!raw || raw.includes("\u0000") || raw.includes("\\") || /[?#]/.test(raw) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) || raw.startsWith("//")) {
      fail("The DOCX document contains an unsafe auxiliary relationship target.");
    }
    let decoded;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      fail("The DOCX document contains a malformed auxiliary relationship target.");
    }
    if (!decoded || decoded.includes("\u0000") || decoded.includes("\\") || /[?#]/.test(decoded) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) || decoded.startsWith("//")) {
      fail("The DOCX document contains an unsafe auxiliary relationship target.");
    }
    const parts = decoded.startsWith("/") ? [] : ["word"];
    for (const part of decoded.replace(/^\/+/, "").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) fail("The DOCX document contains an auxiliary relationship outside the package.");
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    const resolved = parts.join("/");
    const expected = {
      header: /^word\/header[^/]*\.xml$/i,
      footer: /^word\/footer[^/]*\.xml$/i,
      footnotes: /^word\/footnotes\.xml$/i,
      endnotes: /^word\/endnotes\.xml$/i,
      comments: /^word\/comments\.xml$/i
    }[kind];
    if (!expected?.test(resolved)) fail("The DOCX document contains an invalid auxiliary relationship target.");
    return resolved.toLowerCase();
  }

  function selectedWordItems(xml, itemName, referencedIds) {
    const selected = [];
    const seen = new Set();
    let excluded = 0;
    const expression = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${itemName}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${itemName}\\s*>`, "gi");
    let match;
    while ((match = expression.exec(xml))) {
      const id = qualifiedId(xmlAttributes(match[1]));
      if (!id) continue;
      if (seen.has(id)) fail(`The DOCX ${itemName} part contains duplicate ID ${id.slice(0, 80)}.`);
      seen.add(id);
      if (["footnote", "endnote"].includes(itemName) && ["-1", "0"].includes(id)) continue;
      if (referencedIds.has(id)) selected.push(match[0]);
      else excluded += 1;
    }
    const selectedXml = selected.join("\n");
    return { text: packageText(selectedXml, "docx"), selectedXml, excluded };
  }

  async function extractDocx(buffer, limits) {
    const zip = preflightZip(buffer);
    await inspectPackage(zip, "docx");
    const main = zip.byName.get("word/document.xml");
    if (!main) fail("The DOCX package is missing word/document.xml.");
    const documentXml = decodeXml(await extractEntry(zip, main), main.name);
    if (/<w:altChunk\b/i.test(documentXml)) fail("Word documents containing embedded alternate content are not supported.");
    const relationshipsEntry = zip.byName.get("word/_rels/document.xml.rels");
    const relationships = relationshipsEntry
      ? docxAuxiliaryRelationships(decodeXml(await extractEntry(zip, relationshipsEntry), relationshipsEntry.name))
      : [];
    const resolvedRelationships = relationships.map((relationship, index) => {
      const target = resolveDocxAuxiliaryTarget(relationship.target, relationship.kind);
      const entry = zip.byName.get(target);
      if (!entry) fail(`The DOCX document references missing auxiliary part ${target.slice(0, 160)}.`);
      return { ...relationship, target, entry, index };
    });
    const headerIds = wordReferenceIds(documentXml, ["headerReference"]);
    const footerIds = wordReferenceIds(documentXml, ["footerReference"]);
    const footnoteIds = wordReferenceIds(documentXml, ["footnoteReference"]);
    const endnoteIds = wordReferenceIds(documentXml, ["endnoteReference"]);
    const selectedTargets = new Set();
    const xmlCache = new Map();
    const outputs = [];
    const commentStories = [documentXml];
    const excludedItems = { comments: 0, footnotes: 0, endnotes: 0 };
    const loadPart = async relationship => {
      if (!xmlCache.has(relationship.target)) {
        const xml = decodeXml(await extractEntry(zip, relationship.entry), relationship.entry.name);
        if (/<w:altChunk\b/i.test(xml)) fail("Word documents containing embedded alternate content are not supported.");
        xmlCache.set(relationship.target, xml);
      }
      return xmlCache.get(relationship.target);
    };

    for (const relationship of resolvedRelationships.filter(item => ["header", "footer"].includes(item.kind))) {
      const references = relationship.kind === "header" ? headerIds : footerIds;
      if (!references.has(relationship.id) || selectedTargets.has(relationship.target)) continue;
      const xml = await loadPart(relationship);
      selectedTargets.add(relationship.target);
      commentStories.push(xml);
      outputs.push({ index: relationship.index, label: relationship.entry.name.replace(/^word\//i, "").replace(/\.xml$/i, ""), entry: relationship.entry, text: packageText(xml, "docx") });
    }

    for (const relationship of resolvedRelationships.filter(item => ["footnotes", "endnotes"].includes(item.kind))) {
      const references = relationship.kind === "footnotes" ? footnoteIds : endnoteIds;
      if (!references.size || selectedTargets.has(relationship.target)) continue;
      const xml = await loadPart(relationship);
      const itemName = relationship.kind === "footnotes" ? "footnote" : "endnote";
      const selection = selectedWordItems(xml, itemName, references);
      selectedTargets.add(relationship.target);
      excludedItems[relationship.kind] += selection.excluded;
      commentStories.push(selection.selectedXml);
      outputs.push({ index: relationship.index, label: relationship.kind, entry: relationship.entry, text: selection.text });
    }

    const commentIds = new Set(commentStories.flatMap(xml => [...wordReferenceIds(xml, ["commentReference"])]));
    for (const relationship of resolvedRelationships.filter(item => item.kind === "comments")) {
      if (!commentIds.size || selectedTargets.has(relationship.target)) continue;
      const xml = await loadPart(relationship);
      const selection = selectedWordItems(xml, "comment", commentIds);
      selectedTargets.add(relationship.target);
      excludedItems.comments += selection.excluded;
      outputs.push({ index: relationship.index, label: "comments", entry: relationship.entry, text: selection.text });
    }

    const builder = sectionBuilder(limits.maxTextChars);
    addSection(builder, "Document", main.name, packageText(documentXml, "docx"));
    for (const output of outputs.sort((left, right) => left.index - right.index)) {
      addSection(builder, output.label, output.entry.name, output.text);
    }
    const diagnostics = [];
    const physicalAuxiliaryParts = zip.entries.filter(entry => /^word\/(?:header[^/]*|footer[^/]*|footnotes|endnotes|comments)\.xml$/i.test(entry.name));
    const excludedAuxiliaryPartCount = physicalAuxiliaryParts.filter(entry => !selectedTargets.has(entry.key)).length;
    if (excludedAuxiliaryPartCount) {
      diagnostics.push(note("docx-auxiliary-parts-excluded", `${excludedAuxiliaryPartCount} unreferenced or inactive Word auxiliary part${excludedAuxiliaryPartCount === 1 ? " was" : "s were"} excluded from extraction.`, "info"));
    }
    const excludedItemCount = excludedItems.comments + excludedItems.footnotes + excludedItems.endnotes;
    if (excludedItemCount) {
      diagnostics.push(note("docx-unreferenced-items-excluded", `${excludedItemCount} unreferenced comment, footnote, or endnote entr${excludedItemCount === 1 ? "y was" : "ies were"} excluded from extraction.`, "info"));
    }
    if (builder.truncated) diagnostics.push(note("text-truncated", `Extracted Word text was limited to ${limits.maxTextChars.toLocaleString()} characters.`));
    if (!builder.text.trim()) diagnostics.push(note("manual-text-required", "No machine-readable Word text was found. Add a manual transcription.", "info"));
    return {
      text: builder.text,
      sections: builder.sections,
      truncated: builder.truncated,
      needsManualText: !builder.text.trim(),
      diagnostics,
      metadata: {
        packageEntries: zip.entries.length,
        partsRead: 1 + xmlCache.size,
        relatedAuxiliaryPartCount: new Set(resolvedRelationships.map(relationship => relationship.target)).size,
        excludedAuxiliaryPartCount,
        excludedCommentCount: excludedItems.comments,
        excludedFootnoteCount: excludedItems.footnotes,
        excludedEndnoteCount: excludedItems.endnotes
      }
    };
  }

  function presentationSlideIds(xml) {
    if (!/<(?:[A-Za-z_][\w.-]*:)?presentation\b/i.test(xml)) fail("The PPTX presentation metadata is malformed.");
    const list = xml.match(/<(?:[A-Za-z_][\w.-]*:)?sldIdLst\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?sldIdLst\s*>/i);
    if (!list) fail("The PPTX presentation metadata is missing its slide-order list.");
    const ids = [];
    const seen = new Set();
    const expression = /<(?:[A-Za-z_][\w.-]*:)?sldId\b([^>]*)\/?\s*>/gi;
    let match;
    while ((match = expression.exec(list[1]))) {
      const attributes = xmlAttributes(match[1]);
      const relationship = [...attributes.entries()].find(([name]) => name.includes(":") && name.endsWith(":id"))?.[1] || "";
      if (!relationship) fail("The PPTX presentation metadata contains a slide without a relationship ID.");
      if (seen.has(relationship)) fail("The PPTX presentation metadata contains a duplicate slide relationship ID.");
      seen.add(relationship);
      ids.push(relationship);
    }
    if (!ids.length) fail("The PPTX presentation metadata declares no slides.");
    return ids;
  }

  function presentationRelationships(xml) {
    const relationships = new Map();
    const expression = /<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*)\/?\s*>/gi;
    let match;
    while ((match = expression.exec(xml))) {
      const attributes = xmlAttributes(match[1]);
      const id = attributes.get("id") || "";
      const type = attributes.get("type") || "";
      const target = attributes.get("target") || "";
      if (!id || !type || !target) fail("The PPTX presentation relationships metadata is malformed.");
      if ((attributes.get("targetmode") || "").toLowerCase() === "external") fail("Office files containing external relationships are not supported.");
      if (relationships.has(id)) fail("The PPTX presentation relationships contain a duplicate relationship ID.");
      relationships.set(id, { id, type, target });
    }
    if (!relationships.size) fail("The PPTX presentation relationships metadata declares no relationships.");
    return relationships;
  }

  function resolveRelationshipTarget(sourcePart, target) {
    const raw = String(target || "");
    if (!raw || raw.includes("\u0000") || raw.includes("\\") || /[?#]/.test(raw) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) || raw.startsWith("//")) {
      fail("The PPTX presentation contains an unsafe slide relationship target.");
    }
    let decoded;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      fail("The PPTX presentation contains a malformed slide relationship target.");
    }
    if (!decoded || decoded.includes("\u0000") || decoded.includes("\\") || /[?#]/.test(decoded) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) || decoded.startsWith("//")) {
      fail("The PPTX presentation contains an unsafe slide relationship target.");
    }
    const parts = decoded.startsWith("/") ? [] : sourcePart.split("/").slice(0, -1);
    for (const part of decoded.replace(/^\/+/, "").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) fail("The PPTX presentation contains a slide relationship outside the package.");
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    const resolved = parts.join("/");
    if (!/^ppt\/slides\/[^/]+\.xml$/i.test(resolved)) fail("The PPTX presentation contains an invalid slide relationship target.");
    return resolved.toLowerCase();
  }

  function hiddenSlide(xml) {
    const root = xml.match(/<(?:[A-Za-z_][\w.-]*:)?sld\b([^>]*)>/i);
    if (!root) fail("A PPTX slide part is malformed.");
    return ["0", "false", "off"].includes((xmlAttributes(root[1]).get("show") || "").trim().toLowerCase());
  }

  async function extractPptx(buffer, limits) {
    const zip = preflightZip(buffer);
    await inspectPackage(zip, "pptx");
    const presentationEntry = zip.byName.get("ppt/presentation.xml");
    const relationshipsEntry = zip.byName.get("ppt/_rels/presentation.xml.rels");
    if (!presentationEntry) fail("The PPTX package is missing ppt/presentation.xml presentation metadata.");
    if (!relationshipsEntry) fail("The PPTX package is missing ppt/_rels/presentation.xml.rels presentation metadata.");
    const presentationXml = decodeXml(await extractEntry(zip, presentationEntry), presentationEntry.name);
    const relationshipsXml = decodeXml(await extractEntry(zip, relationshipsEntry), relationshipsEntry.name);
    const relationshipIds = presentationSlideIds(presentationXml);
    const relationships = presentationRelationships(relationshipsXml);
    const referencedParts = new Set();
    const declaredSlides = [];
    for (const [index, relationshipId] of relationshipIds.entries()) {
      const relationship = relationships.get(relationshipId);
      if (!relationship) fail(`The PPTX presentation references missing relationship ${relationshipId.slice(0, 80)}.`);
      if (!/\/slide$/i.test(relationship.type)) fail(`The PPTX presentation relationship ${relationshipId.slice(0, 80)} does not reference a slide.`);
      const target = resolveRelationshipTarget("ppt/presentation.xml", relationship.target);
      if (referencedParts.has(target)) fail("The PPTX presentation metadata references the same slide part more than once.");
      const entry = zip.byName.get(target);
      if (!entry) fail(`The PPTX presentation references missing slide part ${target.slice(0, 160)}.`);
      referencedParts.add(target);
      const xml = decodeXml(await extractEntry(zip, entry), entry.name);
      declaredSlides.push({ position: index + 1, entry, xml, hidden: hiddenSlide(xml) });
    }
    const visibleSlides = declaredSlides.filter(slide => !slide.hidden);
    const hiddenSlideCount = declaredSlides.length - visibleSlides.length;
    const packageSlideParts = zip.entries.filter(entry => /^ppt\/slides\/[^/]+\.xml$/i.test(entry.name));
    const orphanSlideCount = packageSlideParts.filter(entry => !referencedParts.has(entry.key)).length;
    const builder = sectionBuilder(limits.maxTextChars);
    const selectedSlides = visibleSlides.slice(0, limits.maxSlides);
    for (const slide of selectedSlides) {
      addSection(builder, `Slide ${slide.position}`, `slide=${slide.position}`, packageText(slide.xml, "pptx"));
    }
    const diagnostics = [];
    const slidesTruncated = visibleSlides.length > selectedSlides.length;
    if (hiddenSlideCount) {
      diagnostics.push(note("hidden-slides-excluded", `${hiddenSlideCount} hidden slide${hiddenSlideCount === 1 ? " was" : "s were"} excluded from extraction.`, "info"));
    }
    if (slidesTruncated) {
      diagnostics.push(note("slides-truncated", `Only the first ${selectedSlides.length} of ${visibleSlides.length} visible slides were read.`));
    }
    if (builder.truncated) {
      diagnostics.push(note("text-truncated", `Extracted presentation text was limited to ${limits.maxTextChars.toLocaleString()} characters.`));
    }
    if (!builder.text.trim()) diagnostics.push(note("manual-text-required", "No machine-readable slide text was found. Add a manual transcription.", "info"));
    return {
      text: builder.text,
      sections: builder.sections,
      truncated: builder.truncated || slidesTruncated,
      needsManualText: !builder.text.trim(),
      diagnostics,
      metadata: {
        packageEntries: zip.entries.length,
        slideCount: declaredSlides.length,
        visibleSlideCount: visibleSlides.length,
        hiddenSlideCount,
        orphanSlideCount,
        slidesRead: selectedSlides.length
      }
    };
  }

  function ensureXlsx() {
    if (xlsxLoaded) return;
    importScripts("../black-hat-agent/vendor/xlsx.full.min.js");
    if (typeof XLSX !== "object" || typeof XLSX.read !== "function") fail("The bundled local spreadsheet reader is unavailable.");
    xlsxLoaded = true;
  }

  const CONSOLE_METHODS = Object.freeze([
    "assert", "clear", "count", "countReset", "debug", "dir", "dirxml", "error",
    "group", "groupCollapsed", "groupEnd", "info", "log", "table", "time",
    "timeEnd", "timeLog", "timeStamp", "trace", "warn"
  ]);

  function readWorkbookWithoutConsole(bytes, options) {
    const output = globalThis.console;
    if (!output || (typeof output !== "object" && typeof output !== "function")) return XLSX.read(bytes, options);
    const restorations = [];
    const silent = () => {};
    let workbook;
    let readError;
    let restoreError;
    try {
      for (const name of CONSOLE_METHODS) {
        const originalDescriptor = Object.getOwnPropertyDescriptor(output, name);
        const originalValue = output[name];
        if (typeof originalValue !== "function") continue;
        try {
          Object.defineProperty(output, name, {
            configurable: true,
            enumerable: originalDescriptor?.enumerable || false,
            writable: true,
            value: silent
          });
        } catch {
          try { output[name] = silent; } catch { /* verified below */ }
        }
        if (output[name] !== silent) fail("The local spreadsheet reader could not be isolated from console output.");
        restorations.push({ name, originalDescriptor });
      }
      workbook = XLSX.read(bytes, options);
    } catch (error) {
      readError = error;
    } finally {
      for (const restoration of restorations.reverse()) {
        try {
          if (restoration.originalDescriptor) Object.defineProperty(output, restoration.name, restoration.originalDescriptor);
          else delete output[restoration.name];
        } catch (error) {
          restoreError ||= error;
        }
      }
    }
    if (restoreError) fail("The local spreadsheet reader console isolation could not be restored.");
    if (readError) throw readError;
    return workbook;
  }

  function assertLegacyWorkbook(bytes) {
    const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (bytes.length < signature.length || !signature.every((value, index) => bytes[index] === value)) {
      fail("The selected file does not have a valid XLS compound-document signature.");
    }
  }

  function externalFormula(value) {
    return /(?:https?:\/\/|file:\/\/|\\\\|\[[^\]]+\][^!]*!)/i.test(String(value || ""));
  }

  function inspectWorkbookFormulas(workbook) {
    let formulaCount = 0;
    for (const name of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      for (const address of Object.keys(sheet)) {
        if (address.startsWith("!")) continue;
        const cell = sheet[address];
        if (cell?.f) {
          formulaCount += 1;
          if (externalFormula(cell.f)) fail("Workbooks containing external formula references are not supported.");
          delete cell.f;
          delete cell.F;
        }
        if (cell?.l?.Target && /^(?:https?:|file:|\\\\)/i.test(cell.l.Target)) {
          fail("Workbooks containing external hyperlinks are not supported.");
        }
      }
    }
    for (const name of workbook.Workbook?.Names || []) {
      if (externalFormula(name?.Ref)) fail("Workbooks containing external named references are not supported.");
    }
    return formulaCount;
  }

  function sheetHidden(workbook, name, index) {
    const metadata = workbook.Workbook?.Sheets;
    const entry = Array.isArray(metadata) ? (metadata.find(item => item?.name === name) || metadata[index]) : null;
    return Number(entry?.Hidden || 0) !== 0;
  }

  function cellText(value) {
    return String(value ?? "").replace(/\u0000/g, "").replace(/\r?\n/g, " ↵ ").replace(/\t/g, " ").slice(0, 5_000);
  }

  function hiddenDimensionCount(dimensions, start, end) {
    if (!Array.isArray(dimensions)) return 0;
    let count = 0;
    for (let index = start; index <= end; index += 1) {
      if (dimensions[index]?.hidden) count += 1;
    }
    return count;
  }

  async function extractSpreadsheet(buffer, format, limits) {
    const bytes = new Uint8Array(buffer);
    let zip = null;
    if (format === "xls") {
      if (isZip(bytes)) fail("An XLS source must be a legacy compound-document workbook, not a ZIP package.");
      assertLegacyWorkbook(bytes);
    } else {
      zip = preflightZip(buffer);
      await inspectPackage(zip, format);
    }
    ensureXlsx();
    let workbook;
    try {
      workbook = readWorkbookWithoutConsole(bytes, {
        type: "array",
        cellDates: true,
        cellFormula: true,
        cellHTML: false,
        cellStyles: true,
        bookVBA: true,
        bookFiles: format === "xls",
        bookDeps: false,
        sheetRows: limits.maxRows + 2,
        WTF: false
      });
    } catch {
      fail("The workbook could not be parsed by the bundled local reader.");
    }
    if (workbook.vbaraw) fail("Macro-enabled workbooks are not supported.");
    const compoundPaths = workbook.cfb?.FullPaths || [];
    if (compoundPaths.some(path => /(?:^|\/)(?:_VBA_PROJECT_CUR|VBA|ObjectPool|MBD|Ole|Package)(?:\/|$)/i.test(String(path)))) {
      fail("XLS files containing macros or embedded OLE objects are not supported.");
    }
    delete workbook.cfb;
    if (!Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) fail("The workbook contains no readable worksheets.");
    const formulaCount = inspectWorkbookFormulas(workbook);
    const visible = workbook.SheetNames.filter((name, index) => !sheetHidden(workbook, name, index));
    if (!visible.length) fail("The workbook contains no visible worksheets.");
    const selected = visible.slice(0, limits.maxSheets);
    const builder = sectionBuilder(limits.maxTextChars);
    const diagnostics = [];
    let hiddenRowCount = 0;
    let hiddenColumnCount = 0;
    if (visible.length > selected.length) diagnostics.push(note("sheets-truncated", `Only the first ${selected.length} of ${visible.length} visible worksheets were read.`));
    if (formulaCount) diagnostics.push(note("formula-values-only", `${formulaCount} formula cell${formulaCount === 1 ? " was" : "s were"} represented only by cached display values; formula expressions were not ingested.`, "info"));

    for (const name of selected) {
      const sheet = workbook.Sheets[name];
      if (!sheet?.["!ref"]) continue;
      let range;
      try { range = XLSX.utils.decode_range(sheet["!ref"]); } catch { fail(`Worksheet ${String(name).slice(0, 80)} has an invalid used range.`); }
      const originalEndRow = range.e.r;
      const originalEndColumn = range.e.c;
      range.e.r = Math.min(range.e.r, range.s.r + limits.maxRows - 1);
      range.e.c = Math.min(range.e.c, range.s.c + limits.maxColumns - 1);
      hiddenRowCount += hiddenDimensionCount(sheet["!rows"], range.s.r, range.e.r);
      hiddenColumnCount += hiddenDimensionCount(sheet["!cols"], range.s.c, range.e.c);
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
        skipHidden: true,
        range: XLSX.utils.encode_range(range)
      });
      const text = rows.map(row => row.slice(0, limits.maxColumns).map(cellText).join("\t").replace(/\t+$/g, "")).filter(Boolean).join("\n");
      addSection(builder, `Worksheet: ${String(name).slice(0, 120)}`, `sheet=${String(name).slice(0, 160)}`, text);
      if (originalEndRow > range.e.r || originalEndColumn > range.e.c) {
        diagnostics.push(note("worksheet-truncated", `Worksheet ${String(name).slice(0, 80)} was limited to ${limits.maxRows} rows and ${limits.maxColumns} columns.`));
      }
    }
    if (hiddenRowCount || hiddenColumnCount) {
      const hiddenRows = `${hiddenRowCount} hidden row${hiddenRowCount === 1 ? "" : "s"}`;
      const hiddenColumns = `${hiddenColumnCount} hidden column${hiddenColumnCount === 1 ? "" : "s"}`;
      diagnostics.push(note("hidden-dimensions-excluded", `${hiddenRows} and ${hiddenColumns} were excluded from visible worksheet extraction.`, "info"));
    }
    if (builder.truncated) diagnostics.push(note("text-truncated", `Extracted workbook text was limited to ${limits.maxTextChars.toLocaleString()} characters.`));
    if (!builder.text.trim()) diagnostics.push(note("manual-text-required", "No displayable values were found in the visible worksheet range.", "info"));
    return {
      text: builder.text,
      sections: builder.sections,
      truncated: builder.truncated || visible.length > selected.length || diagnostics.some(item => item.code === "worksheet-truncated"),
      needsManualText: !builder.text.trim(),
      diagnostics,
      metadata: {
        sheetCount: workbook.SheetNames.length,
        visibleSheetCount: visible.length,
        sheetsRead: selected.length,
        formulaCellCount: formulaCount,
        hiddenRowCount,
        hiddenColumnCount
      }
    };
  }

  async function handleMessage(data) {
    if (data?.action !== "extract") fail("Unsupported ingestion worker action.");
    if (!(data.bytes instanceof ArrayBuffer)) fail("Document bytes are missing.");
    const format = String(data.format || "").toLowerCase();
    const limits = limitsFrom(data.limits);
    if (format === "docx") return extractDocx(data.bytes, limits);
    if (format === "pptx") return extractPptx(data.bytes, limits);
    if (["xlsx", "xls", "ods"].includes(format)) return extractSpreadsheet(data.bytes, format, limits);
    fail("Unsupported isolated document format.");
  }

  self.addEventListener("message", event => {
    Promise.resolve(handleMessage(event.data))
      .then(result => self.postMessage({ ok: true, result }))
      .catch(error => self.postMessage({ ok: false, error: safeError(error) }));
  });

  // Exposed only inside the disposable worker so focused tests can exercise the
  // ZIP security boundary without weakening the application API.
  self.SolutionIngestionWorkerInternals = Object.freeze({
    preflightZip,
    extractEntry,
    inspectPackage,
    extractDocx,
    extractPptx,
    extractSpreadsheet,
    packageText,
    limitsFrom
  });
})();
