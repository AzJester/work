// Decoding of the embedded data. Pure functions, so the tests can run them in Node.
import { GRID, OCEAN_FLAG } from './geo.js';

export function b64ToBytes(text) {
  const bin = atob(text.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Undoes the bake's predictor (left + up - upleft, zig-zag residuals split into two byte planes). */
export function decodeHeight(bytes, w = GRID.w, h = GRID.h) {
  const n = w * h, out = new Int16Array(n);
  if (bytes.length !== n * 2) throw new Error(`height data is ${bytes.length} bytes, expected ${n * 2}`);
  for (let j = 0, i = 0; j < h; j++) {
    for (let k = 0; k < w; k++, i++) {
      const z = bytes[i] | (bytes[n + i] << 8);
      const r = (z >>> 1) ^ -(z & 1);
      const left = k ? out[i - 1] : 0, up = j ? out[i - w] : 0, upLeft = j && k ? out[i - w - 1] : 0;
      out[i] = (j ? (k ? left + up - upLeft : up) : left) + r;
    }
  }
  return out;
}

/** Splits the stored value into what stands above the waterline and how deep the sea is. */
export const surfaceOf = (v) => (v < OCEAN_FLAG ? 0 : v);
export const depthOf = (v) => (v < OCEAN_FLAG ? -(v + 500) : 0);

/** Bilinear sample of a row-major grid at fractional pixel coordinates (pixel centres at +0.5). */
export function bilinear(arr, w, h, px, py, map = (v) => v) {
  const x = Math.min(Math.max(px - 0.5, 0), w - 1.001), y = Math.min(Math.max(py - 0.5, 0), h - 1.001);
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, o = j * w + i;
  return (map(arr[o]) * (1 - fx) + map(arr[o + 1]) * fx) * (1 - fy) + (map(arr[o + w]) * (1 - fx) + map(arr[o + w + 1]) * fx) * fy;
}
