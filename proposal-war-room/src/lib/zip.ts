// A small ZIP reader and writer on the platform's own deflate streams. It is enough for .xlsx (write) and .docx
// (read), and it keeps both file formats free of a third-party library.

export interface ZipEntry { path: string; data: Uint8Array }

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

// A fixed timestamp: the same content always gives the same bytes.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Writes a ZIP archive. Entries are deflated, with UTF-8 names. */
export async function zipFiles(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const deflated = await pipe(entry.data, new CompressionStream("deflate-raw"));
    const stored = deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated;
    const crc = crc32(entry.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, stored ? 0 : 8, true);
    head.setUint16(10, DOS_TIME, true); head.setUint16(12, DOS_DATE, true); head.setUint32(14, crc, true);
    head.setUint32(18, body.length, true); head.setUint32(22, entry.data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    local.push(new Uint8Array(head.buffer), name, body);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true); dir.setUint16(10, stored ? 0 : 8, true);
    dir.setUint16(12, DOS_TIME, true); dir.setUint16(14, DOS_DATE, true); dir.setUint32(16, crc, true);
    dir.setUint32(20, body.length, true); dir.setUint32(24, entry.data.length, true); dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const directory = concat(central);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, directory.length, true); end.setUint32(16, offset, true);
  return concat([...local, directory, new Uint8Array(end.buffer)]);
}

/** Reads the entries of a ZIP archive whose names pass `want`. Throws when the bytes are not a ZIP archive. */
export async function unzipFiles(bytes: Uint8Array, want: (path: string) => boolean = () => true, maxBytes = 64 * 1024 * 1024): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("This file is not a ZIP archive.");
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) throw new Error("The ZIP directory is damaged.");
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const path = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    pointer += 46 + nameLength + extraLength + commentLength;
    if (!want(path)) continue;
    total += size;
    if (total > maxBytes) throw new Error("The archive is too large to open here.");
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.push({ path, data: raw.slice() });
    else if (method === 8) entries.push({ path, data: await pipe(raw, new DecompressionStream("deflate-raw")) });
    else throw new Error(`The archive uses a compression method this reader does not know (${method}).`);
  }
  return entries;
}
