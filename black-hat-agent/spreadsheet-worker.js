/* global XLSX */

const MAX_UNCOMPRESSED_BYTES = 50_000_000;
const MAX_ZIP_ENTRY_BYTES = 20_000_000;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_SHEETS = 50;

importScripts("./vendor/xlsx.full.min.js");

self.addEventListener("message", event => {
  const { bytes, maxRows, maxHeaderRows } = event.data || {};
  try {
    if (!(bytes instanceof ArrayBuffer)) throw new Error("Workbook bytes are missing.");
    preflightZip(bytes);
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      cellFormula: true,
      cellHTML: false,
      cellStyles: true,
      bookVBA: false,
      bookFiles: false,
      sheetRows: Number(maxRows || 0) + Number(maxHeaderRows || 0) + 2,
      WTF: false
    });
    if (!workbook.SheetNames?.length) throw new Error("The file contains no readable worksheets.");
    if (workbook.SheetNames.length > MAX_SHEETS) {
      throw new Error(`The workbook exceeds the ${MAX_SHEETS}-worksheet limit.`);
    }
    delete workbook.vbaraw;
    self.postMessage({ ok: true, workbook });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error?.message || "The workbook could not be parsed safely."
    });
  }
});

function preflightZip(buffer) {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    ![0x03, 0x05, 0x07].includes(bytes[2])
  ) {
    return;
  }
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error("The workbook ZIP directory is malformed.");

  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 workbooks are not supported by this local importer.");
  }
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(`The workbook ZIP exceeds the ${MAX_ZIP_ENTRIES}-entry limit.`);
  }
  if (centralOffset + centralSize > view.byteLength) {
    throw new Error("The workbook ZIP directory points outside the selected file.");
  }

  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("The workbook ZIP directory contains an invalid entry.");
    }
    const flags = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (flags & 0x0001) throw new Error("Encrypted workbooks are not supported.");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("ZIP64 workbook entries are not supported.");
    }
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(
        `A workbook ZIP entry exceeds the ${formatMegabytes(MAX_ZIP_ENTRY_BYTES)} expanded-size limit.`
      );
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `The workbook expands beyond the ${formatMegabytes(
          MAX_UNCOMPRESSED_BYTES
        )} local-processing limit.`
      );
    }
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > centralOffset + centralSize || offset > view.byteLength) {
      throw new Error("The workbook ZIP directory is truncated.");
    }
  }
}

function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function formatMegabytes(bytes) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
