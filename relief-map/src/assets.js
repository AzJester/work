// Turns the data embedded in the page into textures and CPU-side grids.
import * as THREE from 'three';
import { b64ToBytes, gunzip, decodeHeight } from './data.js';
import { GRID, WORLD, worldToLonLat } from './geo.js';
import { Field } from './terrain.js';

const embedded = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Embedded data block ${id} is missing`);
  return b64ToBytes(el.textContent);
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling noise: R and G are two fractal fields, B and A the gradient of R. */
function noiseTexture(size = 256) {
  const field = (seed) => {
    const rnd = mulberry(seed), out = new Float32Array(size * size);
    let amp = 0.5, total = 0;
    for (let period = 4; period <= 64; period *= 2, amp *= 0.55) {
      const lat = Float32Array.from({ length: period * period }, rnd), cell = size / period;
      for (let y = 0; y < size; y++) {
        const gy = y / cell, j = Math.floor(gy), ty = gy - j, sy = ty * ty * (3 - 2 * ty), j0 = (j % period) * period, j1 = ((j + 1) % period) * period;
        for (let x = 0; x < size; x++) {
          const gx = x / cell, i = Math.floor(gx), tx = gx - i, sx = tx * tx * (3 - 2 * tx), i0 = i % period, i1 = (i + 1) % period;
          out[y * size + x] += amp * ((lat[j0 + i0] * (1 - sx) + lat[j0 + i1] * sx) * (1 - sy) + (lat[j1 + i0] * (1 - sx) + lat[j1 + i1] * sx) * sy);
        }
      }
      total += amp;
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
    return out;
  };
  const a = field(1337), b = field(4242), px = new Uint8Array(size * size * 4), wrap = (v) => (v + size) % size;
  let gmax = 1e-6;
  const gx = new Float32Array(size * size), gy = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = y * size + x;
    gx[o] = a[y * size + wrap(x + 1)] - a[y * size + wrap(x - 1)];
    gy[o] = a[wrap(y + 1) * size + x] - a[wrap(y - 1) * size + x];
    gmax = Math.max(gmax, Math.abs(gx[o]), Math.abs(gy[o]));
  }
  for (let o = 0; o < size * size; o++) {
    px[o * 4] = a[o] * 255; px[o * 4 + 1] = b[o] * 255;
    px[o * 4 + 2] = 127.5 + gx[o] / gmax * 127.5; px[o * 4 + 3] = 127.5 + gy[o] / gmax * 127.5;
  }
  const t = new THREE.DataTexture(px, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/** Longitude and latitude per texel, so shaders can reason about place. */
function geoTexture() {
  const w = 128, h = 84, px = new Uint16Array(w * h * 4);
  for (let j = 0, o = 0; j < h; j++) for (let i = 0; i < w; i++, o += 4) {
    const [lon, lat] = worldToLonLat(((i + 0.5) / w - 0.5) * WORLD.w, ((j + 0.5) / h - 0.5) * WORLD.h);
    px[o] = THREE.DataUtils.toHalfFloat(lon); px[o + 1] = THREE.DataUtils.toHalfFloat(lat); px[o + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

async function decodeImage(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  } finally { URL.revokeObjectURL(url); }
}

function rgbaTexture(px, w, h, mipmaps, renderer) {
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mipmaps;
  if (mipmaps) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

export async function loadAssets(renderer, progress = () => {}) {
  const meta = JSON.parse(new TextDecoder().decode(embedded('d-meta')));
  progress(0.05, 'Unpacking elevation');
  const stored = decodeHeight(await gunzip(embedded('d-height')));
  progress(0.2, 'Unpacking coast, lakes and rivers');
  const hw = GRID.w * GRID.hi, hh = GRID.h * GRID.hi, n = hw * hh;
  const planes = await gunzip(embedded('d-masks'));
  if (planes.length !== n * 4) throw new Error('Mask data has the wrong size');
  const maskPx = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { maskPx[i * 4] = planes[i]; maskPx[i * 4 + 1] = planes[n + i]; maskPx[i * 4 + 2] = planes[2 * n + i]; maskPx[i * 4 + 3] = planes[3 * n + i]; }
  const masks = rgbaTexture(maskPx, hw, hh, true, renderer);
  progress(0.4, 'Unpacking land cover');
  const lw = GRID.w * GRID.lo, lh = GRID.h * GRID.lo;
  const slabData = await gunzip(embedded('d-slab')), states = await gunzip(embedded('d-states'));
  const slabPx = new Uint8Array(lw * lh * 4);
  for (let i = 0; i < lw * lh; i++) { slabPx[i * 4] = slabData[i]; slabPx[i * 4 + 3] = 255; }
  const lc = await Promise.all([0, 1, 2, 3].map((i) => decodeImage(embedded(`d-lc${i}`))));
  const pack = (pick) => {
    const px = new Uint8Array(lw * lh * 4);
    for (let i = 0; i < lw * lh; i++) for (let c = 0; c < 4; c++) px[i * 4 + c] = lc[pick[c][0]].data[i * 4 + pick[c][1]];
    return px;
  };
  // A: conifer, hardwood, crops, shrub. B: grass, pasture, wetland, urban. C: barren, open water, no data, ice.
  const lcPx = [pack([[0, 0], [0, 1], [0, 2], [1, 0]]), pack([[1, 1], [1, 2], [2, 0], [2, 1]]), pack([[2, 2], [3, 0], [3, 1], [3, 2]])];
  progress(0.5, 'Preparing textures');
  return {
    meta, stored, states, lcPx, lw, lh,
    land: new Field(planes.subarray(0, n), hw, hh), lakes: new Field(planes.subarray(n, 2 * n), hw, hh), rivers: new Field(planes.subarray(2 * n, 3 * n), hw, hh),
    slab: new Field(slabData, lw, lh),
    tex: {
      masks, slab: rgbaTexture(slabPx, lw, lh, false, renderer), noise: noiseTexture(), geo: geoTexture(),
      lcA: rgbaTexture(lcPx[0], lw, lh, true, renderer), lcB: rgbaTexture(lcPx[1], lw, lh, true, renderer), lcC: rgbaTexture(lcPx[2], lw, lh, true, renderer),
    },
  };
}
