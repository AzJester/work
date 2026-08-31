const EXTRACT_CONTRACT = "solution-source-extract-v1";

export const MAX_SOURCE_FILE_BYTES = 8_000_000;
export const MAX_EXTRACTED_TEXT_CHARS = 200_000;
export const MAX_PDF_PAGES = 200;
export const DEFAULT_INGESTION_TIMEOUT_MS = 20_000;

export const SUPPORTED_SOURCE_FORMATS = Object.freeze({
  txt: { label: "Plain text", mediaType: "text/plain", kind: "text" },
  md: { label: "Markdown", mediaType: "text/markdown", kind: "text" },
  csv: { label: "CSV", mediaType: "text/csv", kind: "text" },
  json: { label: "JSON", mediaType: "application/json", kind: "text" },
  pdf: { label: "PDF", mediaType: "application/pdf", kind: "pdf" },
  docx: { label: "Word document", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "office" },
  pptx: { label: "PowerPoint presentation", mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "office" },
  xlsx: { label: "Excel workbook", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "spreadsheet" },
  xls: { label: "Excel 97-2003 workbook", mediaType: "application/vnd.ms-excel", kind: "spreadsheet" },
  ods: { label: "OpenDocument spreadsheet", mediaType: "application/vnd.oasis.opendocument.spreadsheet", kind: "spreadsheet" },
  png: { label: "PNG image", mediaType: "image/png", kind: "image" },
  jpg: { label: "JPEG image", mediaType: "image/jpeg", kind: "image" },
  webp: { label: "WebP image", mediaType: "image/webp", kind: "image" }
});

export const SOURCE_FILE_ACCEPT = Object.freeze([
  ".txt", ".md", ".markdown", ".csv", ".json", ".pdf", ".docx", ".pptx",
  ".xlsx", ".xls", ".ods", ".png", ".jpg", ".jpeg", ".webp"
].join(","));

const MIME_FORMATS = new Map([
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["text/csv", "csv"],
  ["application/csv", "csv"],
  ["application/json", "json"],
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.oasis.opendocument.spreadsheet", "ods"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]);

function diagnostic(code, message, severity = "warning") {
  return { code, severity, message };
}

function boundedInteger(value, fallback, maximum, minimum = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

function safeMessage(error, fallback) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return (message || fallback).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
}

function normalizeFilename(value) {
  const leaf = String(value || "source")
    .split(/[\\/]/)
    .at(-1)
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim();
  return (leaf || "source").slice(0, 255);
}

function normalizeLocator(value, filename) {
  return String(value || filename)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 500) || filename;
}

function extensionOf(filename) {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return "";
  if (match[1] === "markdown") return "md";
  if (match[1] === "jpeg") return "jpg";
  return match[1];
}

export function detectSourceFormat(filename, mediaType = "") {
  const extension = extensionOf(filename);
  if (extension) return SUPPORTED_SOURCE_FORMATS[extension] ? extension : "";
  return MIME_FORMATS.get(String(mediaType).toLowerCase().split(";")[0].trim()) || "";
}

function preflightNamedSource(filename, mediaType = "") {
  const normalized = normalizeFilename(filename);
  const extension = extensionOf(normalized);
  if (extension && !SUPPORTED_SOURCE_FORMATS[extension]) {
    throw new Error("Unsupported source type. Use TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG, JPEG, or WebP.");
  }
  if (!extension && !MIME_FORMATS.has(String(mediaType).toLowerCase().split(";")[0].trim())) {
    throw new Error("Unsupported source type. Use TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG, JPEG, or WebP.");
  }
  return normalized;
}

function truncateText(text, limit) {
  const normalized = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (normalized.length <= limit) return { text: normalized, truncated: false };
  let end = limit;
  const code = normalized.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return { text: normalized.slice(0, end), truncated: true };
}

export function decodeStrictUtf8(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\u0000")) throw new Error("The selected text file contains NUL bytes and appears to be binary.");
    return text;
  } catch (error) {
    if (/NUL bytes/.test(error?.message || "")) throw error;
    throw new Error("The selected text file is not valid UTF-8.");
  }
}

async function resolveInput(input, options) {
  let bytes;
  let suppliedName = options.filename;
  let suppliedType = options.mediaType || options.type || "";
  let declaredSize = null;

  if (input instanceof ArrayBuffer) {
    bytes = input.slice(0);
  } else if (ArrayBuffer.isView(input)) {
    bytes = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  } else if (input && typeof input.arrayBuffer === "function") {
    suppliedName ||= input.name;
    suppliedType ||= input.type;
    if (!suppliedName) throw new Error("A filename is required to identify the source format.");
    suppliedName = preflightNamedSource(suppliedName, suppliedType);
    declaredSize = Number.isFinite(input.size) ? Number(input.size) : null;
    if (declaredSize !== null && declaredSize > options.maxFileBytes) {
      throw new Error(`The selected file exceeds the ${formatMegabytes(options.maxFileBytes)} local-ingestion limit.`);
    }
    bytes = await input.arrayBuffer();
  } else {
    throw new TypeError("A File, Blob, ArrayBuffer, or typed-array source is required.");
  }

  if (!suppliedName) throw new Error("A filename is required to identify the source format.");
  if (!(bytes instanceof ArrayBuffer)) throw new Error("The selected file could not be read as local bytes.");
  if (bytes.byteLength === 0) throw new Error("The selected file is empty.");
  if (bytes.byteLength > options.maxFileBytes) {
    throw new Error(`The selected file exceeds the ${formatMegabytes(options.maxFileBytes)} local-ingestion limit.`);
  }
  if (declaredSize !== null && declaredSize !== bytes.byteLength) {
    throw new Error("The selected file size changed while it was being read.");
  }
  return { bytes, filename: normalizeFilename(suppliedName), mediaType: String(suppliedType || "") };
}

function formatMegabytes(bytes) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

async function sha256Hex(buffer) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot compute the required local SHA-256 source fingerprint.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function startsWithBytes(bytes, expected, offset = 0) {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function assertPdf(bytes) {
  const maximum = Math.min(bytes.length - 4, 1_024);
  for (let offset = 0; offset <= maximum; offset += 1) {
    if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], offset)) return;
  }
  throw new Error("The selected file does not have a valid PDF signature.");
}

export function inspectImageDimensions(bytes, format) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") {
    if (
      bytes.length < 33 ||
      !startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
      view.getUint32(8, false) !== 13 ||
      !startsWithBytes(bytes, [0x49, 0x48, 0x44, 0x52], 12)
    ) {
      throw new Error("The selected file does not have a valid PNG header.");
    }
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return validateImageDimensions(width, height);
  }
  if (format === "jpg") {
    if (!startsWithBytes(bytes, [0xff, 0xd8])) throw new Error("The selected file does not have a valid JPEG header.");
    let offset = 2;
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 9 < bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > bytes.length) break;
      if (startOfFrame.has(marker) && length >= 7) {
        return validateImageDimensions(view.getUint16(offset + 5, false), view.getUint16(offset + 3, false));
      }
      offset += length;
    }
    throw new Error("The JPEG dimensions could not be read safely.");
  }
  if (format === "webp") {
    if (bytes.length < 30 || !startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) || !startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
      throw new Error("The selected file does not have a valid WebP header.");
    }
    const declaredLength = view.getUint32(4, true) + 8;
    if (declaredLength > bytes.length || declaredLength < 30) throw new Error("The selected WebP file is truncated.");
    const fourcc = String.fromCharCode(...bytes.slice(12, 16));
    const dataOffset = 20;
    if (fourcc === "VP8X") {
      const width = 1 + bytes[dataOffset + 4] + (bytes[dataOffset + 5] << 8) + (bytes[dataOffset + 6] << 16);
      const height = 1 + bytes[dataOffset + 7] + (bytes[dataOffset + 8] << 8) + (bytes[dataOffset + 9] << 16);
      return validateImageDimensions(width, height);
    }
    if (fourcc === "VP8 " && startsWithBytes(bytes, [0x9d, 0x01, 0x2a], dataOffset + 3)) {
      return validateImageDimensions(view.getUint16(dataOffset + 6, true) & 0x3fff, view.getUint16(dataOffset + 8, true) & 0x3fff);
    }
    if (fourcc === "VP8L" && bytes[dataOffset] === 0x2f) {
      const width = 1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8);
      const height = 1 + (bytes[dataOffset + 2] >> 6) + (bytes[dataOffset + 3] << 2) + ((bytes[dataOffset + 4] & 0x0f) << 10);
      return validateImageDimensions(width, height);
    }
    throw new Error("The WebP dimensions could not be read safely.");
  }
  throw new Error("Unsupported image format.");
}

function validateImageDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 100_000 || height > 100_000 || width * height > 20_000_000) {
    throw new Error("The image reports invalid or unsafe dimensions.");
  }
  return { width, height };
}

async function extractPdf(bytes, locator, options) {
  assertPdf(new Uint8Array(bytes));
  const signal = options.signal && typeof options.signal.addEventListener === "function" ? options.signal : null;
  let loadingTask = null;
  let pdf;
  let canceled = null;
  let rejectCancellation;
  let destruction = Promise.resolve();

  const destroyPdfResources = () => {
    const document = pdf;
    const task = loadingTask;
    pdf = null;
    loadingTask = null;
    if (!document && !task) return destruction;
    destruction = destruction.then(async () => {
      try { await document?.destroy?.(); } catch { /* local parser cleanup only */ }
      try { await task?.destroy?.(); } catch { /* local parser cleanup only */ }
    });
    return destruction;
  };
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  const cancel = error => {
    if (canceled) return;
    canceled = error;
    void destroyPdfResources();
    rejectCancellation(error);
  };
  const abort = () => cancel(new Error("Local PDF extraction was canceled and its worker was stopped."));
  const throwIfCanceled = () => { if (canceled) throw canceled; };

  if (signal?.aborted) throw new Error("Local PDF extraction was canceled before it started.");
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => cancel(new Error("Local PDF extraction timed out and its worker was stopped.")),
    options.timeoutMs
  );

  const operation = (async () => {
    let pdfjs;
    try {
      pdfjs = await (typeof options.pdfModuleLoader === "function"
        ? options.pdfModuleLoader()
        : import("./vendor/pdf-6.3.289.min.mjs"));
    } catch {
      throwIfCanceled();
      throw new Error("The bundled local PDF reader is unavailable.");
    }
    throwIfCanceled();
    if (!pdfjs?.GlobalWorkerOptions || typeof pdfjs.getDocument !== "function") {
      throw new Error("The bundled local PDF reader is invalid.");
    }
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker-6.3.289.min.mjs", import.meta.url).href;
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      enableScripting: false,
      disableAutoFetch: true,
      disableStream: true,
      stopAtErrors: true,
      useSystemFonts: true,
      verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0
    });
    if (!loadingTask?.promise || typeof loadingTask.destroy !== "function") {
      throw new Error("The bundled local PDF reader did not create an isolated loading task.");
    }
    throwIfCanceled();
    pdf = await loadingTask.promise;
    throwIfCanceled();
    if (!pdf || !Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) {
      throw new Error("The PDF reports an invalid page count.");
    }

    if (typeof pdf.getJSActions === "function") {
      const actions = await pdf.getJSActions();
      throwIfCanceled();
      if (actions && Object.keys(actions).length) throw new Error("PDF files containing JavaScript actions are not supported.");
    }
    if (typeof pdf.getAttachments === "function") {
      const attachments = await pdf.getAttachments();
      throwIfCanceled();
      if (attachments && Object.keys(attachments).length) throw new Error("PDF files containing embedded attachments are not supported.");
    }

    const pageLimit = Math.min(pdf.numPages, options.maxPdfPages);
    const diagnostics = [];
    const sections = [];
    let text = "";
    let truncated = pdf.numPages > pageLimit;
    if (truncated) diagnostics.push(diagnostic("pdf-pages-truncated", `Only the first ${pageLimit} of ${pdf.numPages} PDF pages were read.`));

    for (let pageNumber = 1; pageNumber <= pageLimit && text.length < options.maxTextChars; pageNumber += 1) {
      throwIfCanceled();
      const page = await pdf.getPage(pageNumber);
      throwIfCanceled();
      try {
        const content = await page.getTextContent({ disableCombineTextItems: false, includeMarkedContent: false });
        throwIfCanceled();
        const pageText = content.items
          .filter(item => typeof item?.str === "string")
          .map(item => `${item.str}${item.hasEOL ? "\n" : " "}`)
          .join("")
          .replace(/[ \t]+\n/g, "\n")
          .trim();
        const separator = text ? "\n\n" : "";
        const start = text.length + separator.length;
        text += separator + pageText;
        sections.push({ label: `Page ${pageNumber}`, locator: `${locator}#page=${pageNumber}`, start, end: text.length });
      } finally {
        page.cleanup?.();
      }
    }
    const bounded = truncateText(text, options.maxTextChars);
    truncated ||= bounded.truncated;
    if (bounded.truncated) diagnostics.push(diagnostic("text-truncated", `Extracted PDF text was limited to ${options.maxTextChars.toLocaleString()} characters.`));
    if (!bounded.text.trim()) diagnostics.push(diagnostic("manual-text-required", "No machine-readable text was found. Add a manual transcription or caption; this app does not perform OCR.", "info"));
    return {
      text: bounded.text,
      truncated,
      needsManualText: !bounded.text.trim(),
      diagnostics,
      sections: clampSections(sections, bounded.text.length),
      metadata: { pageCount: pdf.numPages, pagesRead: pageLimit }
    };
  })().catch(error => {
    if (canceled) throw canceled;
    throw new Error(safeMessage(error, "The PDF could not be read safely."));
  });
  // Promise.race installs a rejection handler, but keep a handler attached even
  // when cancellation wins and the PDF worker rejects later during teardown.
  operation.catch(() => {});

  try {
    return await Promise.race([operation, cancellation]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    await destroyPdfResources();
  }
}

function clampSections(sections, textLength) {
  return (Array.isArray(sections) ? sections : [])
    .filter(section => Number.isInteger(section?.start) && section.start < textLength)
    .slice(0, 500)
    .map(section => ({
      label: String(section.label || "Section").slice(0, 160),
      locator: String(section.locator || "").slice(0, 700),
      start: Math.max(0, section.start),
      end: Math.max(section.start, Math.min(textLength, Number.isInteger(section.end) ? section.end : textLength))
    }));
}

function workerUrl() {
  return new URL("./ingestion-worker.js", import.meta.url);
}

export function runIngestionWorker(payload, options = {}) {
  if (typeof Worker !== "function" && typeof options.workerFactory !== "function") {
    throw new Error("This browser does not support isolated local document workers.");
  }
  const timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_INGESTION_TIMEOUT_MS, 30_000, 1_000);
  const worker = options.workerFactory ? options.workerFactory(workerUrl()) : new Worker(workerUrl(), { type: "classic", name: "solution-source-ingestion" });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      worker.terminate?.();
      callback(value);
    };
    const abort = () => finish(reject, new Error("Local source extraction was canceled."));
    const timer = setTimeout(() => finish(reject, new Error("Local source extraction timed out and the isolated worker was stopped.")), timeoutMs);
    worker.onmessage = event => {
      const response = event.data;
      if (!response?.ok) finish(reject, new Error(safeMessage({ message: response?.error }, "The selected file could not be extracted safely.")));
      else finish(resolve, response.result);
    };
    worker.onerror = event => finish(reject, new Error(safeMessage({ message: event?.message }, "The isolated local extractor failed.")));
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      worker.postMessage(payload, payload.bytes instanceof ArrayBuffer ? [payload.bytes] : []);
    } catch (error) {
      finish(reject, new Error(safeMessage(error, "The selected file could not be sent to the isolated local extractor.")));
    }
  });
}

function workerSections(sections, locator, textLength) {
  return clampSections((Array.isArray(sections) ? sections : []).map(section => ({
    ...section,
    locator: section.locator || `${locator}#${String(section.part || "section").replace(/[^a-z0-9._=-]+/gi, "-")}`
  })), textLength);
}

/**
 * Extract a bounded, reviewable source preview entirely in the current browser.
 * This function performs no persistence, logging, upload, or network request.
 */
export async function extractSource(input, rawOptions = {}) {
  const options = {
    ...rawOptions,
    maxFileBytes: boundedInteger(rawOptions.maxFileBytes, MAX_SOURCE_FILE_BYTES, MAX_SOURCE_FILE_BYTES, 1_024),
    maxTextChars: boundedInteger(rawOptions.maxTextChars, MAX_EXTRACTED_TEXT_CHARS, MAX_EXTRACTED_TEXT_CHARS, 1_000),
    maxPdfPages: boundedInteger(rawOptions.maxPdfPages, MAX_PDF_PAGES, MAX_PDF_PAGES),
    timeoutMs: boundedInteger(rawOptions.timeoutMs, DEFAULT_INGESTION_TIMEOUT_MS, 30_000, 1_000)
  };
  const source = await resolveInput(input, options);
  const sizeBytes = source.bytes.byteLength;
  const format = detectSourceFormat(source.filename, source.mediaType);
  if (!format) throw new Error("Unsupported source type. Use TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG, JPEG, or WebP.");
  const definition = SUPPORTED_SOURCE_FORMATS[format];
  const locator = normalizeLocator(rawOptions.locator, source.filename);
  const sha256 = await sha256Hex(source.bytes);
  let extracted;

  if (definition.kind === "text") {
    let text = decodeStrictUtf8(new Uint8Array(source.bytes));
    if (format === "json") {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        throw new Error("The selected JSON file is malformed.");
      }
    }
    const bounded = truncateText(text, options.maxTextChars);
    extracted = {
      text: bounded.text,
      truncated: bounded.truncated,
      needsManualText: false,
      diagnostics: bounded.truncated ? [diagnostic("text-truncated", `Extracted text was limited to ${options.maxTextChars.toLocaleString()} characters.`)] : [],
      sections: [{ label: definition.label, locator, start: 0, end: bounded.text.length }],
      metadata: {}
    };
  } else if (definition.kind === "image") {
    const dimensions = inspectImageDimensions(new Uint8Array(source.bytes), format);
    extracted = {
      text: "",
      truncated: false,
      needsManualText: true,
      diagnostics: [diagnostic("manual-text-required", "Image pixels stay local and are not OCR-processed. Add a manual caption or transcription before saving a source excerpt.", "info")],
      sections: [],
      metadata: dimensions
    };
  } else if (definition.kind === "pdf") {
    extracted = await extractPdf(source.bytes, locator, options);
  } else {
    extracted = await runIngestionWorker({
      action: "extract",
      format,
      bytes: source.bytes,
      limits: {
        maxTextChars: options.maxTextChars,
        maxRows: 500,
        maxColumns: 100,
        maxSheets: 20,
        maxSlides: 200
      }
    }, options);
  }

  const bounded = truncateText(extracted.text || "", options.maxTextChars);
  const diagnostics = Array.isArray(extracted.diagnostics)
    ? extracted.diagnostics.slice(0, 50).map(item => diagnostic(
      String(item?.code || "extractor-note").slice(0, 80),
      String(item?.message || item || "Local extraction note.").slice(0, 500),
      ["info", "warning", "error"].includes(item?.severity) ? item.severity : "warning"
    ))
    : [];
  if (bounded.truncated && !diagnostics.some(item => item.code === "text-truncated")) {
    diagnostics.push(diagnostic("text-truncated", `Extracted text was limited to ${options.maxTextChars.toLocaleString()} characters.`));
  }

  return Object.freeze({
    contract: EXTRACT_CONTRACT,
    version: 1,
    filename: source.filename,
    locator,
    format,
    mediaType: definition.mediaType,
    sizeBytes,
    sha256,
    text: bounded.text,
    textLength: bounded.text.length,
    truncated: Boolean(extracted.truncated || bounded.truncated),
    needsManualText: Boolean(extracted.needsManualText),
    diagnostics,
    sections: definition.kind === "office" || definition.kind === "spreadsheet"
      ? workerSections(extracted.sections, locator, bounded.text.length)
      : clampSections(extracted.sections, bounded.text.length),
    metadata: extracted.metadata && typeof extracted.metadata === "object" ? structuredClone(extracted.metadata) : {}
  });
}

export const extractLocalSource = extractSource;
