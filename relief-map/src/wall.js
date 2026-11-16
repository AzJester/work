// The cut edge of the slab: rock cliffs where the land meets a border, a block of clear water where the sea does.
import * as THREE from 'three';
import { WORLD } from './geo.js';
import { lin } from './glsl.js';

export const FLOOR_Y = -44;

/** Traces the slab outline (marching squares on the signed distance grid). Returns closed loops of [x, z] world points. */
export function slabOutline(slab, iso = 127.5) {
  const { data, w, h } = slab, segs = new Map();
  const wx = (i) => (i + 0.5) / w * WORLD.w - WORLD.w / 2, wz = (j) => (j + 0.5) / h * WORLD.h - WORLD.h / 2;
  const cross = (a, b) => (iso - a) / (b - a);
  const link = (ka, pa, kb, pb) => {
    if (!segs.has(ka)) segs.set(ka, { p: pa, next: [] });
    if (!segs.has(kb)) segs.set(kb, { p: pb, next: [] });
    segs.get(ka).next.push(kb); segs.get(kb).next.push(ka);
  };
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const o = j * w + i, a = data[o], b = data[o + 1], c = data[o + w + 1], d = data[o + w];
      const code = (a > iso ? 1 : 0) | (b > iso ? 2 : 0) | (c > iso ? 4 : 0) | (d > iso ? 8 : 0);
      if (code === 0 || code === 15) continue;
      // Edge crossings, keyed by the grid edge they sit on so neighbouring cells share them exactly.
      const T = () => [2 * o, [wx(i + cross(a, b)), wz(j)]], B = () => [2 * (o + w), [wx(i + cross(d, c)), wz(j + 1)]];
      const L = () => [2 * o + 1, [wx(i), wz(j + cross(a, d))]], R = () => [2 * (o + 1) + 1, [wx(i + 1), wz(j + cross(b, c))]];
      const pairs = { 1: [[L, T]], 2: [[T, R]], 3: [[L, R]], 4: [[R, B]], 5: [[L, T], [R, B]], 6: [[T, B]], 7: [[L, B]], 8: [[B, L]], 9: [[T, B]], 10: [[T, R], [B, L]], 11: [[R, B]], 12: [[L, R]], 13: [[T, R]], 14: [[L, T]] }[code];
      for (const [e0, e1] of pairs) { const [k0, p0] = e0(), [k1, p1] = e1(); link(k0, p0, k1, p1); }
    }
  }
  const loops = [], seen = new Set();
  for (const start of segs.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, key = start;
    while (key !== undefined && !seen.has(key)) {
      seen.add(key);
      const node = segs.get(key);
      loop.push(node.p);
      const next = node.next.find((k) => k !== prev && !seen.has(k));
      prev = key; key = next;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

const VERT_PARS = /* glsl */`
attribute float aTop; attribute float aT; attribute float aSea; attribute float aArc;
uniform float uExag;
varying float vT; varying float vSea; varying float vArc; varying float vY; varying float vTopY;`;
const VERT_BEGIN = /* glsl */`
float topY = aTop * uExag / 5000.0;
vec3 transformed = vec3(position.x, mix(topY, ${FLOOR_Y.toFixed(1)}, aT), position.z);
vT = aT; vSea = aSea; vArc = aArc; vY = transformed.y; vTopY = topY;`;
const FRAG_PARS = /* glsl */`
uniform sampler2D tNoise;
varying float vT; varying float vSea; varying float vArc; varying float vY; varying float vTopY;
float wRough;`;
const FRAG_MAP = /* glsl */`
vec4 wn = texture2D(tNoise, vec2(vArc * 0.004, vY * 0.012)), wf = texture2D(tNoise, vec2(vArc * 0.05, vY * 0.09));
float layer = vY * 0.55 + wn.r * 5.0 + sin(vArc * 0.02) * 1.5;
vec3 rockCol = mix(${lin('#6f5c4b')}, ${lin('#a58a69')}, smoothstep(0.2, 0.8, sin(layer) * 0.5 + 0.5));
rockCol = mix(rockCol, ${lin('#4a3c33')}, smoothstep(0.55, 0.95, sin(layer * 2.7 + 1.3)) * 0.55);
rockCol = mix(rockCol, ${lin('#b9764a')}, smoothstep(0.7, 1.0, sin(layer * 0.43 + 2.0)) * 0.35);
rockCol *= 0.72 + 0.56 * wf.r;
rockCol *= mix(0.42, 1.0, smoothstep(${FLOOR_Y.toFixed(1)}, ${(FLOOR_Y + 30).toFixed(1)}, vY));
rockCol = mix(rockCol, ${lin('#3b2f24')}, (1.0 - smoothstep(0.0, 0.9, vTopY - vY)) * (1.0 - vSea) * 0.7);
// Sea edges: the water reads as a cast block of resin, pale at the surface and dark towards the bed.
float bed = -(3.0 + vSea * 11.0) + (wn.g - 0.5) * 3.0;
float inWater = vSea * smoothstep(bed - 0.4, bed + 0.4, vY) * step(0.01, vSea);
vec3 resin = mix(${lin('#0d4f86')}, ${lin('#39c0c4')}, smoothstep(bed, 0.0, vY));
diffuseColor.rgb = mix(rockCol, resin, inWater);
wRough = mix(0.95, 0.12, inWater);`;

export class Wall {
  /** @param {import('./terrain.js').Field} slab @param {import('./terrain.js').Field} field display heights, metres */
  constructor(slab, field, land, depthAt, tex, shared) {
    const rows = 14, pos = [], top = [], tt = [], sea = [], arc = [], idx = [];
    const grad = (x, z) => {
      const e = 1.2, gx = slab.at(x + e, z) - slab.at(x - e, z), gz = slab.at(x, z + e) - slab.at(x, z - e), l = Math.hypot(gx, gz) || 1;
      return [-gx / l, -gz / l];     // outward: towards lower signed distance
    };
    const noise = (a, b) => Math.sin(a * 12.9898 + b * 78.233) * 43758.5453 % 1;
    const vnoise = (x, y) => {
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const r = (a, b) => Math.abs(noise(a, b));
      return (r(i, j) * (1 - sx) + r(i + 1, j) * sx) * (1 - sy) + (r(i, j + 1) * (1 - sx) + r(i + 1, j + 1) * sx) * sy;
    };
    for (const loop of slabOutline(slab)) {
      const base = pos.length / 3, n = loop.length;
      let s = 0;
      for (let k = 0; k < n; k++) {
        const [x, z] = loop[k], [nx, nz] = grad(x, z);
        if (k) s += Math.hypot(x - loop[k - 1][0], z - loop[k - 1][1]);
        // Sample a touch inside the edge, where the terrain that meets the wall actually is.
        const ix = x - nx * 0.2, iz = z - nz * 0.2;
        const isSea = land.at(ix, iz) < 110 ? 1 : 0, topM = isSea ? 0 : Math.max(field.at(ix, iz), 0);
        const depth = isSea ? Math.min(1, depthAt(ix, iz) / 1800) : 0;
        for (let r = 0; r < rows; r++) {
          const t = (r / (rows - 1)) ** 1.25;
          // Rougher and wider towards the base, so the cliff reads as broken rock rather than a cut sheet.
          const bulge = r === 0 ? 0 : (2.2 * t * t + (vnoise(s * 0.11, r * 0.9) - 0.35) * 2.4 * Math.sqrt(t) + (vnoise(s * 0.45, r * 1.7) - 0.5) * 0.9) * (isSea && t < 0.25 ? 0.15 : 1);
          pos.push(x + nx * bulge, 0, z + nz * bulge);
          top.push(topM); tt.push(t); sea.push(isSea ? Math.max(depth, 0.02) : 0); arc.push(s);
        }
      }
      for (let k = 0; k < n; k++) {
        const a = base + k * rows, b = base + ((k + 1) % n) * rows;
        for (let r = 0; r < rows - 1; r++) idx.push(a + r, b + r, a + r + 1, a + r + 1, b + r, b + r + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
    g.setAttribute('aSea', new THREE.Float32BufferAttribute(sea, 1));
    g.setAttribute('aArc', new THREE.Float32BufferAttribute(arc, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const uniforms = { uExag: shared.uExag, tNoise: { value: tex.noise } };
    const patch = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_PARS}`).replace('#include <begin_vertex>', VERT_BEGIN);
    };
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      patch(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', FRAG_MAP).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wRough;');
    };
    material.customProgramCacheKey = () => 'relief-wall';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    depth.onBeforeCompile = patch;
    depth.customProgramCacheKey = () => 'relief-wall-depth';
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }
}
