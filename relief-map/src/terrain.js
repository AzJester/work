// The terrain surface: a quadtree of instanced grid patches displaced on the GPU, and the material that paints
// land cover, rock, snow, farmland, lakes, rivers and sea onto it.
import * as THREE from 'three';
import { WORLD } from './geo.js';
import { RELIEF } from './bake.js';
import { lin } from './glsl.js';

/** CPU copy of a row-major grid that covers the whole map; row 0 is the north edge. */
export class Field {
  constructor(data, w, h) { this.data = data; this.w = w; this.h = h; }

  atUv(u, v) {
    const { data, w, h } = this;
    const x = Math.min(Math.max(u * w - 0.5, 0), w - 1.001), y = Math.min(Math.max(v * h - 0.5, 0), h - 1.001);
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, o = j * w + i;
    return (data[o] * (1 - fx) + data[o + 1] * fx) * (1 - fy) + (data[o + w] * (1 - fx) + data[o + w + 1] * fx) * fy;
  }

  at(wx, wz) { return this.atUv(wx / WORLD.w + 0.5, wz / WORLD.h + 0.5); }
}

const GRID_N = 64;      // quads per patch edge
const ROOT = 256;       // world units per root node
const MAX_PATCHES = 1400;

function patchGeometry() {
  const n = GRID_N, side = n + 3, pos = new Float32Array(side * side * 3), nor = new Float32Array(side * side * 3), idx = [];
  for (let j = 0, o = 0; j < side; j++) {
    for (let i = 0; i < side; i++, o += 3) {
      const gi = Math.min(Math.max(i - 1, 0), n), gj = Math.min(Math.max(j - 1, 0), n);
      pos[o] = gi / n; pos[o + 2] = gj / n;
      pos[o + 1] = i === 0 || j === 0 || i === side - 1 || j === side - 1 ? 1 : 0;   // y flags the skirt ring
      nor[o + 1] = 1;
    }
  }
  for (let j = 0; j < side - 1; j++) {
    for (let i = 0; i < side - 1; i++) {
      const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  const patch = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PATCHES * 4), 4);
  patch.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPatch', patch);
  g.instanceCount = 0;
  return g;
}

const VERT_PARS = /* glsl */`
uniform sampler2D tH0; uniform sampler2D tH1; uniform sampler2D tH2; uniform sampler2D tH3; uniform sampler2D tH4;
uniform float uExag; uniform vec2 uWorldSize;
attribute vec4 aPatch;
varying vec2 vTuv; varying vec3 vWpos;
float hBil(sampler2D t, vec2 uv){
  vec2 sz = vec2(textureSize(t, 0)), p = uv * sz - 0.5, f = fract(p); ivec2 i = ivec2(floor(p)), mx = ivec2(sz) - 1;
  float a = texelFetch(t, clamp(i, ivec2(0), mx), 0).r, b = texelFetch(t, clamp(i + ivec2(1, 0), ivec2(0), mx), 0).r;
  float c = texelFetch(t, clamp(i + ivec2(0, 1), ivec2(0), mx), 0).r, d = texelFetch(t, clamp(i + ivec2(1, 1), ivec2(0), mx), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float heightAt(vec2 uv, float mip){
  if (mip < 0.5) return hBil(tH0, uv);
  if (mip < 1.5) return hBil(tH1, uv);
  if (mip < 2.5) return hBil(tH2, uv);
  if (mip < 3.5) return hBil(tH3, uv);
  return hBil(tH4, uv);
}`;

const VERT_BEGIN = /* glsl */`
vec2 wxz = aPatch.xy + position.xz * aPatch.z;
vTuv = wxz / uWorldSize + 0.5;
vec3 transformed = vec3(wxz.x, heightAt(vTuv, aPatch.w) * uExag / 5000.0 - position.y * (aPatch.z * 0.05 + 0.6), wxz.y);
vWpos = transformed;`;

const FRAG_PARS = /* glsl */`
uniform sampler2D tNormal; uniform sampler2D tMasks; uniform sampler2D tSlab; uniform sampler2D tNoise; uniform sampler2D tGeo;
uniform sampler2D tLcA; uniform sampler2D tLcB; uniform sampler2D tLcC;
uniform float uExag; uniform float uTime; uniform float uBorders; uniform float uNight;
varying vec2 vTuv; varying vec3 vWpos;
vec3 sNormal; float sRough; float sAO; vec3 sEmissive;
float sq(float v){ return v * v; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 cropColor(float h){
  if (h < 0.20) return ${lin('#d9b95f')};
  if (h < 0.34) return ${lin('#e6d48f')};
  if (h < 0.54) return ${lin('#7ea03c')};
  if (h < 0.70) return ${lin('#3f7d35')};
  if (h < 0.84) return ${lin('#93714a')};
  return ${lin('#a7a94f')};
}
// A patchwork of fields: square cells split into two to six parcels, hedgerow lines between them, optional pivot circles.
vec3 quilt(vec2 p, float cell, float pivot, float px){
  vec2 g = p / cell, id = floor(g), f = fract(g);
  float r = hash12(id + 0.5);
  vec2 sub = r < 0.35 ? vec2(2.0, 2.0) : r < 0.6 ? vec2(2.0, 1.0) : r < 0.85 ? vec2(1.0, 2.0) : vec2(3.0, 2.0);
  vec2 sf = f * sub, sid = floor(sf), lf = fract(sf);
  float h = hash12(id * 7.13 + sid * 3.71 + 1.3);
  vec3 c = cropColor(h) * (0.88 + 0.24 * hash12(id + sid * 1.7));
  vec2 e = min(lf, 1.0 - lf) * cell / sub;
  float disc = (1.0 - smoothstep(0.40, 0.44 + px / cell, length(lf - 0.5))) * pivot * step(0.45, hash12(id * 1.9 + sid + 4.4));
  c = mix(mix(c, ${lin('#b89a6a')}, pivot * 0.55), cropColor(0.35 + 0.3 * h), disc);
  float line = 1.0 - smoothstep(px * 0.6, px * 0.6 + 0.03 * cell, min(e.x, e.y));
  return mix(c, ${lin('#3d5a2a')}, line * 0.5);
}`;

const FRAG_SURFACE = /* glsl */`
vec2 uv = vTuv;
if (texture2D(tSlab, uv).r < 0.492) discard;
vec2 P = vWpos.xz;
vec4 nrm = texture2D(tNormal, uv);
vec2 sl = nrm.rg * 2.0 - 1.0; sl = sign(sl) * sl * sl * ${RELIEF.slopeMax.toFixed(2)};
vec4 mk = texture2D(tMasks, uv);
vec4 mkNear = textureLod(tMasks, uv, 2.5), mkWide = textureLod(tMasks, uv, 4.5);
float land = smoothstep(0.42, 0.58, mk.r);
float elev = (nrm.a - 0.25) * 6000.0;
float depth = sq(clamp((0.25 - nrm.a) * 4.0, 0.0, 1.0)) * 3000.0;
vec2 ll = texture2D(tGeo, uv).rg; float lon = ll.x, lat = ll.y;
vec4 A = texture2D(tLcA, uv), B = texture2D(tLcB, uv), C = texture2D(tLcC, uv);
vec4 n1 = texture2D(tNoise, P * 0.0021 + 0.37), n2 = texture2D(tNoise, P * 0.0113 + 0.11), n3 = texture2D(tNoise, P * 0.057), n4 = texture2D(tNoise, P * 0.31 + 0.5);
float px = length(fwidth(P)) * 0.7;
float slope = length(sl);

// ---- where we are ----
float arid = smoothstep(-97.0, -102.0, lon);
float redrock = exp(-(sq((lon + 110.6) / 3.2) + sq((lat - 36.8) / 2.6)));
float autumn = smoothstep(-98.0, -90.0, lon) * smoothstep(34.6, 38.6, lat + elev * 0.0015);
float pivot = smoothstep(-97.8, -99.6, lon) * smoothstep(-105.5, -103.8, lon) * smoothstep(32.5, 34.0, lat);
float snowline = 3350.0 - (lat - 35.0) * 125.0 + (n1.r - 0.5) * 520.0;

// ---- land cover ----
float wCon = A.r + C.b * 0.6, wHard = A.g + C.b * 0.4, wCrop = A.b, wShrub = A.a, wGrass = B.r, wPast = B.g, wWet = B.b, wUrb = B.a, wBar = C.r;
float wSum = wCon + wHard + wCrop + wShrub + wGrass + wPast + wWet + wUrb + wBar + 0.02;
vec3 cCon = mix(${lin('#1c4426')}, ${lin('#2f6a36')}, n2.r) * (0.8 + 0.4 * n3.r);
vec3 cAut = mix(${lin('#b23a1a')}, ${lin('#dc7a1c')}, smoothstep(0.34, 0.52, n2.r));
cAut = mix(cAut, ${lin('#e8b030')}, smoothstep(0.56, 0.72, n2.g));
cAut = mix(cAut, ${lin('#8f3d18')}, smoothstep(0.62, 0.8, n3.g) * 0.6);
vec3 cHard = mix(mix(${lin('#3d7a2b')}, ${lin('#5f9a32')}, n2.g) * (0.8 + 0.4 * n3.r), cAut, clamp(autumn * (0.7 + 0.6 * n1.g), 0.0, 1.0));
vec3 cGrass = mix(${lin('#7fa246')}, ${lin('#bca85e')}, clamp(arid * 0.9 + (n1.r - 0.5) * 0.35, 0.0, 1.0));
vec3 cPast = mix(${lin('#8fb24a')}, ${lin('#b5ab60')}, arid * 0.5 + (n2.r - 0.5) * 0.3);
vec3 cShrub = mix(mix(${lin('#d2ab76')}, ${lin('#a79c6c')}, n2.r * (1.0 - redrock)), ${lin('#c87643')}, redrock * 0.85);
cShrub *= 1.0 - 0.22 * smoothstep(0.60, 0.68, n3.r);
vec3 cWet = mix(${lin('#3f6238')}, ${lin('#6f8c4a')}, n2.r);
vec3 cUrb = ${lin('#aaa49b')} * (0.82 + 0.36 * n3.g);
vec3 cBar = mix(${lin('#b7a58a')}, ${lin('#b9562c')}, redrock);
vec3 cBig = quilt(P, 9.0, pivot, px), cSmall = quilt(P + 31.7, 2.25, pivot, px);
vec3 cCrop = mix(cBig, cSmall, 0.6 * (1.0 - smoothstep(0.25, 0.85, px / 2.25)));
vec3 col = (cCon * wCon + cHard * wHard + cCrop * wCrop + cShrub * wShrub + cGrass * wGrass + cPast * wPast + cWet * wWet + cUrb * wUrb + cBar * wBar
  + mix(cGrass, cShrub, arid) * 0.02) / wSum;
float forest = (wCon + wHard) / wSum;

// ---- rock and snow ----
float bandY = vWpos.y / uExag * 5000.0;
vec3 strata = mix(${lin('#b5522a')}, ${lin('#e2b98a')}, smoothstep(0.1, 0.9, sin(bandY * 0.027 + n1.r * 5.0) * 0.5 + 0.5) * 0.7);
strata = mix(strata, ${lin('#7a3a22')}, smoothstep(0.75, 1.0, sin(bandY * 0.071 + n2.r * 3.0)) * 0.5);
vec3 rock = mix(mix(${lin('#7f766a')}, ${lin('#9c866a')}, clamp(arid * 0.6 + n1.g * 0.4, 0.0, 1.0)) * (0.8 + 0.4 * n3.g), strata, clamp(redrock * 1.4, 0.0, 1.0));
float alpine = smoothstep(snowline - 750.0, snowline - 300.0, elev);
float rockAmt = max(smoothstep(0.05, 0.13, slope) * (1.0 - forest * 0.55), alpine);
col = mix(col, rock, clamp(rockAmt, 0.0, 1.0));
float snow = max(smoothstep(-140.0, 170.0, elev - snowline) * (1.0 - 0.45 * smoothstep(0.12, 0.26, slope)), C.a);
col = mix(col, ${lin('#f3f6fb')}, clamp(snow, 0.0, 1.0));
float beach = (1.0 - smoothstep(0.52, 0.82, mkNear.r)) * (1.0 - smoothstep(3.0, 40.0, elev));
col = mix(col, ${lin('#e8d8aa')}, beach * 0.85);
col = mix(col, vec3(0.92), mk.a * uBorders * 0.75);

// ---- water ----
float lake = max(smoothstep(0.42, 0.58, mk.g), smoothstep(0.55, 0.8, C.g) * land);
float river = smoothstep(0.30, 0.68, mk.b) * land * (1.0 - lake) * (1.0 - smoothstep(0.09, 0.2, slope));
float sh = 1.0 - exp(-depth / 70.0);
vec3 sea = mix(${lin('#8fe3d2')}, ${lin('#27b4ba')}, smoothstep(0.0, 0.4, sh));
sea = mix(sea, ${lin('#1277ad')}, smoothstep(0.35, 0.95, sh));
sea = mix(sea, ${lin('#0e4c84')}, smoothstep(300.0, 2200.0, depth));
sea = mix(sea, ${lin('#3cc4c0')}, smoothstep(0.03, 0.5, mkWide.r) * 0.45);
float swell = sin(mkWide.r * 26.0 - uTime * 0.7 + n1.r * 7.0);
float foam = smoothstep(0.86, 1.0, swell) * smoothstep(0.08, 0.3, mkWide.r) * smoothstep(0.35, 0.7, n3.r) * 0.4 + smoothstep(0.33, 0.45, mk.r) * 0.7;
sea = mix(sea, ${lin('#f4fbff')}, clamp(foam, 0.0, 1.0) * (1.0 - land));
vec3 lakeCol = mix(${lin('#49a6d6')}, ${lin('#1c64ac')}, smoothstep(0.5, 0.97, textureLod(tMasks, uv, 3.5).g));
vec3 waterCol = mix(mix(sea, lakeCol, lake), ${lin('#2f7fbe')}, river);
float water = clamp(1.0 - land + lake + river, 0.0, 1.0);
col = mix(col, waterCol, water);

// ---- shading inputs ----
float bumpAmt = mix(mix(0.5, 2.6, forest), 1.7, rockAmt) * (1.0 - snow * 0.75);
vec2 bump = (n4.ba - 0.5) * bumpAmt + (n3.ba - 0.5) * bumpAmt * 0.8;
vec3 nLand = vec3(-sl.x * uExag + bump.x, 1.0, -sl.y * uExag + bump.y);
vec2 wave = texture2D(tNoise, P * 0.11 + uTime * vec2(0.011, 0.007)).ba + texture2D(tNoise, P * 0.31 - uTime * vec2(0.013, 0.019)).ba - 1.0;
sNormal = normalize(mix(nLand, vec3(wave.x * 0.55, 1.0, wave.y * 0.55), water));
sRough = mix(mix(0.92, 0.55, snow), 0.14, water);
sAO = mix(nrm.b, 1.0, water);
sEmissive = ${lin('#ffc27a')} * uNight * (1.0 - water) * smoothstep(0.12, 0.6, wUrb / wSum) * smoothstep(0.5, 0.75, n3.r) * 2.5;
diffuseColor.rgb = col * mix(0.72, 1.0, sAO);`;

const FRAG_AO = /* glsl */`
reflectedLight.indirectDiffuse *= sAO;
reflectedLight.indirectSpecular *= mix(1.0, sAO, 0.6);
reflectedLight.directDiffuse *= mix(1.0, sAO, 0.3);`;

export class Terrain {
  /**
   * @param {object} tex - levels[], normal, masks, slab, noise, geo, lcA, lcB, lcC
   * @param {Field} field - display heights in metres
   * @param {Field} slab - slab signed distance, 0..255
   * @param {object} shared - uniform objects shared with the rest of the scene (uExag, uTime, uBorders, uNight)
   */
  constructor(tex, field, slab, shared) {
    this.field = field;
    this.uniforms = {
      tH0: { value: tex.levels[0] }, tH1: { value: tex.levels[1] }, tH2: { value: tex.levels[2] }, tH3: { value: tex.levels[3] }, tH4: { value: tex.levels[4] },
      tNormal: { value: tex.normal }, tMasks: { value: tex.masks }, tSlab: { value: tex.slab }, tNoise: { value: tex.noise }, tGeo: { value: tex.geo },
      tLcA: { value: tex.lcA }, tLcB: { value: tex.lcB }, tLcC: { value: tex.lcC },
      uWorldSize: { value: new THREE.Vector2(WORLD.w, WORLD.h) },
      uExag: shared.uExag, uTime: shared.uTime, uBorders: shared.uBorders, uNight: shared.uNight,
    };
    const patchVertex = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_PARS}`).replace('#include <begin_vertex>', VERT_BEGIN);
    };
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      patchVertex(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', FRAG_SURFACE)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(sNormal, 0.0)).xyz);')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += sEmissive;')
        .replace('#include <aomap_fragment>', FRAG_AO);
    };
    this.material.customProgramCacheKey = () => 'relief-terrain';
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    this.depthMaterial.onBeforeCompile = (shader) => {
      patchVertex(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tSlab; varying vec2 vTuv;')
        .replace('#include <map_fragment>', 'if (texture2D(tSlab, vTuv).r < 0.492) discard;');
    };
    this.depthMaterial.customProgramCacheKey = () => 'relief-terrain-depth';

    this.geometry = patchGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.customDepthMaterial = this.depthMaterial;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.detail = 3.0;          // subdivide a node when the camera is closer than detail x its size
    this.patchCount = 0;
    this.#buildTree(slab);
    this.frustum = new THREE.Frustum();
    this.box = new THREE.Box3();
    this.matrix = new THREE.Matrix4();
  }

  #buildTree(slab) {
    const { field } = this, leaf = ROOT >> (RELIEF.levels - 1);
    // Min and max display height per leaf-sized block, then folded up the tree.
    const bx = Math.ceil(WORLD.w / leaf), bz = Math.ceil(WORLD.h / leaf), per = field.w / WORLD.w * leaf;
    const bmin = new Float32Array(bx * bz).fill(Infinity), bmax = new Float32Array(bx * bz).fill(-Infinity), bhas = new Uint8Array(bx * bz);
    for (let j = 0; j < field.h; j++) {
      const row = Math.min(bz - 1, Math.floor(j / per)) * bx;
      for (let i = 0, o = j * field.w; i < field.w; i++, o++) {
        const b = row + Math.min(bx - 1, Math.floor(i / per)), v = field.data[o];
        if (v < bmin[b]) bmin[b] = v;
        if (v > bmax[b]) bmax[b] = v;
      }
    }
    const sper = slab.w / WORLD.w * leaf;
    for (let j = 0; j < slab.h; j++) {
      for (let i = 0; i < slab.w; i++) if (slab.data[j * slab.w + i] > 110) bhas[Math.min(bz - 1, Math.floor(j / sper)) * bx + Math.min(bx - 1, Math.floor(i / sper))] = 1;
    }
    // A block also counts when a neighbour has slab, so nothing is lost on the boundary.
    const has = new Uint8Array(bhas);
    for (let j = 0; j < bz; j++) for (let i = 0; i < bx; i++) {
      if (!bhas[j * bx + i]) continue;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < bx && b < bz) has[b * bx + a] = 1;
      }
    }
    const make = (x, z, size, level) => {
      const node = { x, z, size, level, min: Infinity, max: -Infinity, has: false, kids: null };
      if (level === RELIEF.levels - 1) {
        const i = Math.round((x + WORLD.w / 2) / leaf), j = Math.round((z + WORLD.h / 2) / leaf);
        if (i >= 0 && j >= 0 && i < bx && j < bz && has[j * bx + i]) { node.has = true; node.min = bmin[j * bx + i]; node.max = bmax[j * bx + i]; }
        return node;
      }
      const half = size / 2;
      node.kids = [make(x, z, half, level + 1), make(x + half, z, half, level + 1), make(x, z + half, half, level + 1), make(x + half, z + half, half, level + 1)];
      for (const k of node.kids) if (k.has) { node.has = true; node.min = Math.min(node.min, k.min); node.max = Math.max(node.max, k.max); }
      return node;
    };
    this.roots = [];
    for (let z = -WORLD.h / 2; z < WORLD.h / 2; z += ROOT) for (let x = -WORLD.w / 2; x < WORLD.w / 2; x += ROOT) this.roots.push(make(x, z, ROOT, 0));
  }

  /** Picks the patches to draw for this camera and uploads them. */
  update(camera, exag) {
    const k = exag / WORLD.unit, attr = this.geometry.getAttribute('aPatch'), arr = attr.array, { frustum, box } = this;
    frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, pad = 40;
    let n = 0;
    const visit = (node) => {
      if (!node.has) return;
      const y0 = Math.min(node.min * k, 0) - 2, y1 = node.max * k + 2;
      // Padded sideways so patches that only cast a shadow into view are still drawn.
      box.min.set(node.x - pad, y0, node.z - pad); box.max.set(node.x + node.size + pad, y1, node.z + node.size + pad);
      if (!frustum.intersectsBox(box)) return;
      const dx = Math.max(node.x - cx, 0, cx - node.x - node.size), dy = Math.max(y0 - cy, 0, cy - y1), dz = Math.max(node.z - cz, 0, cz - node.z - node.size);
      if (node.kids && Math.hypot(dx, dy, dz) < node.size * this.detail) { for (const kid of node.kids) visit(kid); return; }
      if (n >= MAX_PATCHES) return;
      arr[n * 4] = node.x; arr[n * 4 + 1] = node.z; arr[n * 4 + 2] = node.size; arr[n * 4 + 3] = RELIEF.levels - 1 - node.level;
      n++;
    };
    for (const root of this.roots) visit(root);
    attr.clearUpdateRanges(); attr.addUpdateRange(0, n * 4); attr.needsUpdate = true;
    this.geometry.instanceCount = n;
    this.patchCount = n;
  }
}
