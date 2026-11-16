// One-time GPU bake: turns the embedded 2.5 km elevation grid into the detailed height field the page draws,
// plus slopes, ambient occlusion and an elevation code for shading.
import * as THREE from 'three';
import { Pass, makeTarget, readRed } from './gpu.js';
import { NOISE } from './glsl.js';
import { GRID, WORLD } from './geo.js';

// Relief is split into three bands. Regional elevation (beyond about 50 km) is kept in full, range-scale relief partly,
// and the finest ridges least, so mountains read as massifs instead of needles. High ground is then lifted further.
export const RELIEF = { mid: 0.62, fine: 0.3, exRef: 45, slopeMax: 2.5, levels: 5, lift: 9000 };

const BASE = /* glsl */`
uniform sampler2D tBase;
uniform vec2 uBase;
float stored(ivec2 p){ return texelFetch(tBase, clamp(p, ivec2(0), ivec2(uBase) - 1), 0).r; }
float surf(ivec2 p){ float v = stored(p); return v < -400.0 ? 0.0 : v; }
float deep(ivec2 p){ float v = stored(p); return v < -400.0 ? -(v + 500.0) : 0.0; }
`;

const BLUR = BASE + /* glsl */`
uniform sampler2D tIn;
uniform ivec2 uDir;
uniform bool uFirst;
uniform float uSigma;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  float s = 0.0, w = 0.0;
  for (int i = -20; i <= 20; i++) {
    float g = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    ivec2 q = clamp(p + uDir * i, ivec2(0), ivec2(uBase) - 1);
    s += g * (uFirst ? surf(q) : texelFetch(tIn, q, 0).r); w += g;
  }
  outColor = vec4(s / w, 0.0, 0.0, 1.0);
}`;

const RUG = BASE + /* glsl */`
uniform sampler2D tLow;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  float gx = surf(p + ivec2(1, 0)) - surf(p - ivec2(1, 0)), gz = surf(p + ivec2(0, 1)) - surf(p - ivec2(0, 1));
  float slope = length(vec2(gx, gz)) / 5000.0;
  float relief = abs(surf(p) - texelFetch(tLow, p, 0).r);
  outColor = vec4(clamp(slope / 0.12, 0.0, 1.0), clamp(relief / 700.0, 0.0, 1.0), 0.0, 1.0);
}`;

const HEIGHT = BASE + NOISE + /* glsl */`
uniform sampler2D tLow, tMid, tRug, tMasks, tGeo;
uniform vec2 uWorld;
uniform float uMid, uFine, uLift;
vec4 crw(float t){ float t2 = t * t, t3 = t2 * t; return vec4(-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2); }
float surfCubic(vec2 uv){
  vec2 p = uv * uBase - 0.5, f = fract(p); ivec2 i = ivec2(floor(p));
  vec4 wx = crw(f.x), wy = crw(f.y); float s = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) s += surf(i + ivec2(x - 1, y - 1)) * wx[x] * wy[y];
  return s;
}
float bil(sampler2D t, vec2 uv){
  vec2 p = uv * uBase - 0.5, f = fract(p); ivec2 i = ivec2(floor(p)), mx = ivec2(uBase) - 1;
  float a = texelFetch(t, clamp(i, ivec2(0), mx), 0).r, b = texelFetch(t, clamp(i + ivec2(1, 0), ivec2(0), mx), 0).r;
  float c = texelFetch(t, clamp(i + ivec2(0, 1), ivec2(0), mx), 0).r, d = texelFetch(t, clamp(i + ivec2(1, 1), ivec2(0), mx), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  vec2 uv = vUv, wp = (uv - 0.5) * uWorld;
  vec4 mk = texture(tMasks, uv);
  float land = smoothstep(0.30, 0.62, mk.r), lake = smoothstep(0.35, 0.60, mk.g), river = mk.b;
  float s = surfCubic(uv), lo = bil(tLow, uv), mid = bil(tMid, uv);
  vec4 rg = texture(tRug, uv);
  float rug = smoothstep(0.06, 0.70, max(rg.r, rg.g * 0.8));
  vec2 ll = texture(tGeo, uv).rg;
  float h = lo + uMid * (mid - lo) + uFine * (s - mid);

  // Detail the 2.5 km data cannot hold: ridges where the land is already rough, a gentle roll everywhere else.
  vec2 q = wp + 2.2 * vec2(snoise(wp * 0.09 + 3.1), snoise(wp * 0.09 + 11.7));
  float det = (ridged(q * 0.11) - 0.40) * 170.0 * rug + (fbm(wp * 0.6 + 5.0) - 0.5) * 45.0 * rug + (fbm(wp * 0.21) - 0.5) * 22.0;
  h += det;

  // Colorado Plateau: step the land into benches so mesas and canyon walls appear.
  float plateau = exp(-(pow((ll.x + 110.6) / 3.0, 2.0) + pow((ll.y - 36.9) / 2.4, 2.0))) * smoothstep(800.0, 1300.0, s);
  float t = (h + (fbm(wp * 0.33 + 2.0) - 0.5) * 300.0) / 230.0, fl = floor(t);
  h = mix(h, (fl + smoothstep(0.26, 0.60, t - fl)) * 230.0, plateau * 0.8);

  // Rivers cut channels everywhere, and proper canyons across the plateau.
  h -= river * 38.0 + smoothstep(0.03, 0.22, textureLod(tMasks, uv, 3.0).b) * 520.0 * plateau;
  h = mix(h, s, lake);          // lakes stay level at their real surface height
  h *= 1.0 + max(h, 0.0) / uLift; // high ground is lifted further, so ranges tower over the plains
  h *= land;                    // the sea is flat
  outColor = vec4(h, 0.0, 0.0, 1.0);
}`;

const DOWN = /* glsl */`
uniform sampler2D tIn;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy) * 2, mx = textureSize(tIn, 0) - 1;
  outColor = vec4(0.25 * (texelFetch(tIn, min(p, mx), 0).r + texelFetch(tIn, min(p + ivec2(1, 0), mx), 0).r
    + texelFetch(tIn, min(p + ivec2(0, 1), mx), 0).r + texelFetch(tIn, min(p + ivec2(1, 1), mx), 0).r), 0.0, 0.0, 1.0);
}`;

const NORMAL = BASE + /* glsl */`
uniform sampler2D tH, tMasks;
uniform vec2 uSize;
uniform float uTexelM, uTexelU, uK, uSlopeMax;
float H(ivec2 p){ return texelFetch(tH, clamp(p, ivec2(0), ivec2(uSize) - 1), 0).r; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  float h0 = H(p);
  vec2 s = vec2(H(p + ivec2(1, 0)) - H(p - ivec2(1, 0)), H(p + ivec2(0, 1)) - H(p - ivec2(0, 1))) / (2.0 * uTexelM);
  // Horizon-based occlusion over eight directions, out to about 50 km.
  float occ = 0.0;
  for (int d = 0; d < 8; d++) {
    float a = (float(d) + 0.5) * 0.7853981634; vec2 dir = vec2(cos(a), sin(a)); float mt = 0.0, r = 1.5;
    for (int k = 0; k < 5; k++) { mt = max(mt, (H(p + ivec2(floor(dir * r + 0.5))) - h0) * uK / (r * uTexelU)); r *= 2.3; }
    occ += mt / sqrt(1.0 + mt * mt);
  }
  float ao = clamp(1.0 - occ / 8.0 * 1.25, 0.0, 1.0);
  // True elevation on land, depth at sea, in one channel that is continuous at the shore.
  vec2 bp = vUv * uBase - 0.5, f = fract(bp); ivec2 bi = ivec2(floor(bp));
  float e = mix(mix(surf(bi), surf(bi + ivec2(1, 0)), f.x), mix(surf(bi + ivec2(0, 1)), surf(bi + ivec2(1, 1)), f.x), f.y);
  float dp = mix(mix(deep(bi), deep(bi + ivec2(1, 0)), f.x), mix(deep(bi + ivec2(0, 1)), deep(bi + ivec2(1, 1)), f.x), f.y);
  float landish = smoothstep(0.35, 0.6, texture(tMasks, vUv).r);
  float code = mix(0.25 - 0.25 * sqrt(clamp(dp / 3000.0, 0.0, 1.0)), 0.25 + clamp(e, -100.0, 4500.0) / 6000.0, landish);
  outColor = vec4(sign(s) * sqrt(min(abs(s) / uSlopeMax, vec2(1.0))) * 0.5 + 0.5, ao, code);
}`;

/**
 * @returns {{ levels: THREE.Texture[], normal: THREE.Texture, heights: Float32Array, w: number, h: number }}
 *   heights are display metres (multiply by exaggeration / 5000 for world units), row 0 at the north edge.
 */
export function bake(renderer, { stored, masks, geo, scale }) {
  const { w: bw, h: bh } = GRID, w = bw * scale, h = bh * scale;
  const baseTex = new THREE.DataTexture(Float32Array.from(stored), bw, bh, THREE.RedFormat, THREE.FloatType);
  baseTex.needsUpdate = true;
  const float = { format: THREE.RedFormat, type: THREE.FloatType };
  const base = { tBase: { value: baseTex }, uBase: { value: new THREE.Vector2(bw, bh) } };

  const lowA = makeTarget(bw, bh, float), lowB = makeTarget(bw, bh, float), midB = makeTarget(bw, bh, float);
  const blur = new Pass(BLUR, { ...base, tIn: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uFirst: { value: true }, uSigma: { value: 8 } });
  const smooth = (sigma, out) => {     // separable Gaussian of the land surface, sigma in base pixels (2.5 km each)
    const u = blur.uniforms;
    u.uSigma.value = sigma;
    u.tIn.value = null; u.uDir.value.set(1, 0); u.uFirst.value = true; blur.render(renderer, lowA);
    u.tIn.value = lowA.texture; u.uDir.value.set(0, 1); u.uFirst.value = false; blur.render(renderer, out);
  };
  smooth(8, lowB);
  smooth(2.6, midB);

  const rug = makeTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  new Pass(RUG, { ...base, tLow: { value: lowB.texture } }).render(renderer, rug);

  const levels = [];
  for (let i = 0; i < RELIEF.levels; i++) levels.push(makeTarget(Math.max(1, w >> i), Math.max(1, h >> i), float));
  new Pass(HEIGHT, {
    ...base, tLow: { value: lowB.texture }, tMid: { value: midB.texture }, tRug: { value: rug.texture }, tMasks: { value: masks }, tGeo: { value: geo },
    uWorld: { value: new THREE.Vector2(WORLD.w, WORLD.h) }, uMid: { value: RELIEF.mid }, uFine: { value: RELIEF.fine }, uLift: { value: RELIEF.lift },
  }).render(renderer, levels[0]);
  const down = new Pass(DOWN, { tIn: { value: null } });
  for (let i = 1; i < levels.length; i++) { down.uniforms.tIn.value = levels[i - 1].texture; down.render(renderer, levels[i]); }

  const normal = makeTarget(w, h, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  normal.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  new Pass(NORMAL, {
    ...base, tH: { value: levels[0].texture }, tMasks: { value: masks }, uSize: { value: new THREE.Vector2(w, h) },
    uTexelM: { value: GRID.px / scale }, uTexelU: { value: GRID.px / scale / WORLD.unit }, uK: { value: RELIEF.exRef / WORLD.unit },
    uSlopeMax: { value: RELIEF.slopeMax },
  }).render(renderer, normal);

  const heights = readRed(renderer, levels[0]);
  for (const t of [lowA, lowB, midB, rug]) t.dispose();
  baseTex.dispose();
  return { levels: levels.map((t) => t.texture), normal: normal.texture, heights, w, h };
}
