// Instanced scenery: forests, saguaros and city skylines, scattered from the land-cover data.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID, WORLD, worldToLonLat, lonLatToWorld } from './geo.js';
import { bilinear, surfaceOf } from './data.js';
import { RELIEF } from './bake.js';
import { CITIES } from './places.js';
import { lin } from './glsl.js';

const CHUNK = 64;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vertex colours from a function of position, so one material can shade trunk and crown differently. */
function paint(geometry, fn) {
  const pos = geometry.getAttribute('position'), col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.set(fn(pos.getX(i), pos.getY(i), pos.getZ(i)), i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geometry;
}
const flat = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
const TRUNK = [0.16, 0.09, 0.05];

function coniferGeometry(detailed) {
  if (!detailed) {
    const g = new THREE.ConeGeometry(0.27, 1, 5, 1, true);
    g.translate(0, 0.5, 0);
    return paint(flat(g), (x, y) => { const v = 0.55 + 0.5 * y; return [v, v, v]; });
  }
  const parts = [[0.31, 0.5, 0.1], [0.235, 0.42, 0.37], [0.15, 0.36, 0.64]].map(([r, h, y0]) => { const c = new THREE.ConeGeometry(r, h, 6, 1, true); c.translate(0, y0 + h / 2, 0); return flat(c); });
  const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.14, 4, 1, true);
  trunk.translate(0, 0.07, 0);
  parts.push(flat(trunk));
  return paint(mergeGeometries(parts), (x, y, z) => {
    if (y < 0.1 && Math.hypot(x, z) < 0.06) return TRUNK;
    const v = 0.5 + 0.55 * y + 0.25 * Math.hypot(x, z);
    return [v, v, v];
  });
}

function broadleafGeometry(detailed) {
  const crown = new THREE.IcosahedronGeometry(0.36, detailed ? 1 : 0), p = crown.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * Math.sin(x * 23.1 + y * 17.7 + z * 31.3) * (detailed ? 1 : 0.4);
    p.setXYZ(i, x * k, y * k * 0.86 + 0.56, z * k);
  }
  if (!detailed) return paint(flat(crown), (x, y) => { const v = 0.5 + 0.6 * y; return [v, v, v]; });
  const trunk = new THREE.CylinderGeometry(0.045, 0.06, 0.3, 5, 1, true);
  trunk.translate(0, 0.15, 0);
  return paint(mergeGeometries([flat(crown), flat(trunk)]), (x, y, z) => {
    if (y < 0.3 && Math.hypot(x, z) < 0.07) return TRUNK;
    const v = 0.45 + 0.65 * y;
    return [v, v, v];
  });
}

function cactusGeometry() {
  const parts = [];
  const tube = (r, h, x, y, z, rot) => {
    const g = new THREE.CylinderGeometry(r * 0.86, r, h, 6, 1, false);
    if (rot) g.rotateZ(rot);
    g.translate(x, y, z);
    parts.push(flat(g));
  };
  tube(0.075, 1, 0, 0.5, 0);
  tube(0.05, 0.22, 0.16, 0.42, 0, Math.PI / 2); tube(0.05, 0.36, 0.26, 0.6, 0);
  tube(0.05, 0.2, -0.15, 0.56, 0, Math.PI / 2); tube(0.05, 0.26, -0.24, 0.7, 0);
  return paint(mergeGeometries(parts), (x, y) => { const v = 0.7 + 0.35 * y; return [v, v, v]; });
}

const hexes = (list) => list.map((h) => new THREE.Color(h));
const PALETTE = {
  conifer: hexes(['#1f4d2b', '#2a6234', '#173f26', '#35703a', '#24583a']),
  pine: hexes(['#3a6e36', '#4a7d3c', '#2f6432']),
  summer: hexes(['#4a8a2e', '#5f9f35', '#3c7a2a', '#6aa53a', '#558f2c']),
  autumn: hexes(['#c8451c', '#e07f1e', '#ecb42e', '#a8401a', '#d9601c', '#f0c23a', '#b5521c']),
  cactus: hexes(['#5c8a4a', '#6a9a52', '#4f7a44']),
};

export class Props {
  /**
   * @param {object} ctx - field (display heights), stored, slab, land, lakes, rivers, lcPx, lw, lh
   * @param {object} shared - shared uniforms (uExag, uNight)
   * @param {number} spacing - world units between tree candidates
   */
  constructor(ctx, shared, spacing = 0.9) {
    this.group = new THREE.Group();
    this.shared = shared;
    this.field = ctx.field;
    this.chunks = [];
    this.nearDist = 300;
    this.farDist = 5000;
    this.treeCount = 0;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });
    const kinds = {
      conifer: { high: coniferGeometry(true), low: coniferGeometry(false), size: 1.9 },
      broadleaf: { high: broadleafGeometry(true), low: broadleafGeometry(false), size: 1.55 },
      cactus: { high: cactusGeometry(), low: null, size: 1.5 },
    };
    const buckets = new Map();
    const push = (kind, x, z, hm, s, rot, c) => {
      const key = `${kind}:${Math.floor((x + WORLD.w / 2) / CHUNK)}:${Math.floor((z + WORLD.h / 2) / CHUNK)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { kind, v: [] });
      b.v.push(x, z, hm, s * kinds[kind].size, rot, c.r, c.g, c.b);
    };

    const { field, stored, slab, land, lakes, rivers, lcPx, lw, lh } = ctx, [lcA, lcB, lcC] = lcPx, rnd = mulberry(20261116);
    const kRef = RELIEF.exRef / WORLD.unit, tmp = new THREE.Color();
    // Downtowns are kept clear of trees so the skylines read.
    const downtowns = CITIES.map((c) => [...lonLatToWorld(c.lon, c.lat), (1.0 + 0.8 * Math.sqrt(c.pop)) ** 2]);
    for (let z = -WORLD.h / 2; z < WORLD.h / 2; z += spacing) {
      for (let x = -WORLD.w / 2; x < WORLD.w / 2; x += spacing) {
        // Every cell draws the same number of randoms, so the forest is identical on every load.
        const px = x + rnd() * spacing, pz = z + rnd() * spacing, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
        const u = px / WORLD.w + 0.5, v = pz / WORLD.h + 0.5;
        if (slab.atUv(u, v) < 136 || land.atUv(u, v) < 160 || lakes.atUv(u, v) > 40 || rivers.atUv(u, v) > 120) continue;
        if (downtowns.some(([cx, cz, rr]) => (px - cx) ** 2 + (pz - cz) ** 2 < rr * (0.5 + r4))) continue;
        const li = (Math.min(lh - 1, Math.floor(v * lh)) * lw + Math.min(lw - 1, Math.floor(u * lw))) * 4;
        const noData = lcC[li + 2] / 255, con = lcA[li] / 255 + noData * 0.6, hard = lcA[li + 1] / 255 + noData * 0.4;
        const shrub = lcA[li + 3] / 255, grass = (lcB[li] + lcB[li + 1]) / 255, wet = lcB[li + 2] / 255, urban = lcB[li + 3] / 255;
        const density = Math.min(1, (con + hard) * 1.25 + wet * 0.45 + grass * 0.03 + shrub * 0.01) * (1 - urban * 0.85);
        const elev = bilinear(stored, GRID.w, GRID.h, u * GRID.w, v * GRID.h, surfaceOf);
        if (r1 > density) {
          if (shrub > 0.35 && r2 < 0.085 && elev < 1150) {
            const [lon, lat] = worldToLonLat(px, pz);
            if (lon > -114.6 && lon < -109.6 && lat > 31.2 && lat < 34.4) push('cactus', px, pz, field.at(px, pz), 0.75 + 0.5 * r3, r4 * 6.283, PALETTE.cactus[Math.floor(r3 * 2.99)]);
          }
          continue;
        }
        const sl = Math.hypot(field.at(px + 0.4, pz) - field.at(px - 0.4, pz), field.at(px, pz + 0.4) - field.at(px, pz - 0.4)) * kRef / 0.8;
        if (sl > 2.6) continue;
        const [lon, lat] = worldToLonLat(px, pz);
        if (elev > 3350 - (lat - 35) * 125 - 430 + (r4 - 0.5) * 260) continue;       // above the treeline
        const isConifer = r2 < con / (con + hard + wet * 0.3 + grass * 0.03 + 1e-3);
        let colour;
        if (isConifer) colour = lat < 36.5 && lon > -100 ? PALETTE.pine[Math.floor(r3 * 2.99)] : PALETTE.conifer[Math.floor(r3 * 4.99)];
        else {
          const autumn = smooth(-98, -90, lon) * smooth(34.6, 38.6, lat + elev * 0.0015);
          colour = r4 < autumn * 0.92 ? PALETTE.autumn[Math.floor(r3 * 6.99)] : PALETTE.summer[Math.floor(r3 * 4.99)];
        }
        tmp.copy(colour).multiplyScalar(0.85 + 0.3 * r4);
        push(isConifer ? 'conifer' : 'broadleaf', px, pz, field.at(px, pz), 0.78 + 0.5 * ((r3 * 7.31) % 1), r4 * 6.283, tmp);
      }
    }

    for (const { kind, v } of buckets.values()) {
      const n = v.length / 8, g = kinds[kind], data = Float32Array.from(v);
      const matrices = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16), colours = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 8, m = i * 16, s = data[o + 3], c = Math.cos(data[o + 4]) * s, sn = Math.sin(data[o + 4]) * s;
        matrices.array.set([c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, data[o], 0, data[o + 1], 1], m);
        colours.array.set([data[o + 5], data[o + 6], data[o + 7]], i * 3);
        cx += data[o]; cz += data[o + 1];
      }
      const make = (geometry) => {
        const mesh = new THREE.InstancedMesh(geometry, material, n);
        mesh.instanceMatrix = matrices; mesh.instanceColor = colours;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        return mesh;
      };
      const chunk = { kind, n, data, matrices, high: make(g.high), low: g.low ? make(g.low) : null, centre: new THREE.Vector3(cx / n, 0, cz / n) };
      chunk.high.castShadow = true;
      this.chunks.push(chunk);
      if (kind !== 'cactus') this.treeCount += n;
    }
    this.#buildCities(ctx);
    this.setExaggeration(shared.uExag.value);
  }

  #buildCities({ field, land, lakes, slab }) {
    const rnd = mulberry(777), boxes = [];
    const tones = hexes(['#d9d4c8', '#b8b4aa', '#e8e0cf', '#9a9a98', '#d6c9b4', '#c4c8c8', '#f0ebe0']);
    for (const city of CITIES) {
      const [cx, cz] = lonLatToWorld(city.lon, city.lat), sigma = 1.1 + 0.85 * Math.sqrt(city.pop), count = Math.round(12 + 30 * Math.sqrt(city.pop));
      for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
        const a = rnd() * 6.283, r = sigma * Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)) * 0.7, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const h0 = rnd(), w = 0.42 + rnd() * 0.5, d = 0.42 + rnd() * 0.5, tone = tones[Math.floor(rnd() * 6.99)];
        if (land.at(x, z) < 170 || lakes.at(x, z) > 40 || slab.at(x, z) < 136) continue;
        const core = Math.exp(-(r * r) / (2 * (0.42 * sigma) ** 2));
        const h = 0.7 + (1.1 + 7.5 * core * Math.min(1.7, 0.45 + 0.29 * Math.sqrt(city.pop))) * (0.3 + 0.7 * h0 * h0);
        boxes.push(x, z, field.at(x, z), w, h, d, rnd() * 0.5 - 0.25, tone.r, tone.g, tone.b);
        i++;
      }
    }
    const n = boxes.length / 10, geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 });
    const uniforms = { uNight: this.shared.uNight };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCityPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vCityPos;\nfloat cityHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
        .replace('#include <emissivemap_fragment>', `
          vec3 wp = vCityPos * vec3(5.0, 3.4, 5.0), cell = floor(wp), f = fract(wp);
          float pane = step(0.18, f.y) * step(f.y, 0.82) * step(0.12, max(f.x, f.z)) * step(cityHash(cell), 0.55 + 0.3 * uNight);
          diffuseColor.rgb *= mix(1.0, 0.7, pane * (1.0 - uNight));
          totalEmissiveRadiance += ${lin('#ffd08a')} * pane * uNight * 2.2;`);
    };
    material.customProgramCacheKey = () => 'relief-city';
    this.cities = new THREE.InstancedMesh(geometry, material, n);
    this.cityData = Float32Array.from(boxes);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) this.cities.setColorAt(i, c.setRGB(boxes[i * 10 + 7], boxes[i * 10 + 8], boxes[i * 10 + 9]));
    this.cities.castShadow = true; this.cities.receiveShadow = true;
    this.group.add(this.cities);
  }

  /** Re-seats everything on the terrain after the vertical scale changes. */
  setExaggeration(exag) {
    const k = exag / WORLD.unit;
    for (const chunk of this.chunks) {
      const { data, matrices, n } = chunk;
      let y = 0;
      for (let i = 0; i < n; i++) { const h = data[i * 8 + 2] * k - 0.05 * data[i * 8 + 3]; matrices.array[i * 16 + 13] = h; y += h; }
      matrices.needsUpdate = true;
      chunk.centre.y = y / n;
      for (const mesh of [chunk.high, chunk.low]) if (mesh) { mesh.computeBoundingSphere(); mesh.computeBoundingBox(); }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), d = this.cityData;
    for (let i = 0; i < d.length / 10; i++) {
      const o = i * 10;
      this.cities.setMatrixAt(i, m.compose(p.set(d[o], d[o + 2] * k - 0.05, d[o + 1]), q.setFromAxisAngle(up, d[o + 6]), s.set(d[o + 3], d[o + 4], d[o + 5])));
    }
    this.cities.instanceMatrix.needsUpdate = true;
    this.cities.computeBoundingSphere();
  }

  /** Near chunks get the detailed trees and cast shadows; far ones get the simple shape, thinned out with distance. */
  update(camera, showTrees, showCities) {
    this.cities.visible = showCities;
    for (const chunk of this.chunks) {
      const d = camera.position.distanceTo(chunk.centre), near = d < this.nearDist || !chunk.low;
      chunk.high.visible = showTrees && near && d < this.farDist;
      if (chunk.low) {
        chunk.low.visible = showTrees && !near && d < this.farDist;
        chunk.low.count = Math.max(1, Math.round(chunk.n * (1 - 0.6 * smooth(this.nearDist, this.farDist, d))));
      }
    }
  }
}
