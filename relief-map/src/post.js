// Post chain: the scene is drawn to a multisampled HDR target, then gets screen-space ambient occlusion,
// depth of field (the miniature look), bloom, filmic tone mapping and a light grade.
import * as THREE from 'three';
import { Pass } from './gpu.js';

const DEPTH = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uProjInv;
vec3 viewPos(vec2 uv){ vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, texture(tDepth, uv).r * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
`;

const AO = DEPTH + /* glsl */`
uniform vec2 uRes;
uniform float uRadius, uProjScale;
void main(){
  if (texture(tDepth, vUv).r >= 0.99999) { outColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv); vec2 e = 1.0 / uRes;
  vec3 x1 = viewPos(vUv + vec2(e.x, 0.0)), x0 = viewPos(vUv - vec2(e.x, 0.0)), y1 = viewPos(vUv + vec2(0.0, e.y)), y0 = viewPos(vUv - vec2(0.0, e.y));
  vec3 dx = abs(x1.z - p.z) < abs(p.z - x0.z) ? x1 - p : p - x0, dy = abs(y1.z - p.z) < abs(p.z - y0.z) ? y1 - p : p - y0;
  vec3 n = normalize(cross(dx, dy));
  float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float rUv = uRadius * uProjScale / -p.z, occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = rot + float(i) * 2.3999632, r = (float(i) + 0.5) / 12.0;
    vec2 o = vec2(cos(a), sin(a)) * r * rUv; o.x *= uRes.y / uRes.x;
    vec3 v = viewPos(vUv + o) - p;
    float vv = dot(v, v);
    occ += max(dot(v, n) - 0.04 * uRadius, 0.0) / (vv + 0.02 * uRadius * uRadius) * max(1.0 - vv / (uRadius * uRadius), 0.0);
  }
  outColor = vec4(vec3(clamp(1.0 - occ * uRadius / 12.0 * 2.2, 0.0, 1.0)), 1.0);
}`;

const AO_BLUR = /* glsl */`
uniform sampler2D tAO, tDepth;
uniform vec2 uStep;
uniform float uNear, uFar;
float viewZ(vec2 uv){ return uNear * uFar / (uFar - texture(tDepth, uv).r * (uFar - uNear)); }
void main(){
  float z0 = viewZ(vUv), sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uStep * float(i);
    // Weight by relative distance, so far ground seen at a shallow angle still gets smoothed.
    float w = exp(-float(i * i) / 9.0) * max(0.0, 1.0 - abs(viewZ(uv) - z0) / (0.04 * z0));
    sum += texture(tAO, uv).r * w; wsum += w;
  }
  outColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
}`;

const DOF = /* glsl */`
uniform sampler2D tColor, tDepth, tAO;
uniform vec2 uRes;
uniform float uNear, uFar, uFocus, uBlur, uAO;
float viewZ(vec2 uv){ float d = texture(tDepth, uv).r; return uNear * uFar / (uFar - d * (uFar - uNear)); }
float coc(float z){ return clamp((z - uFocus) / uFocus, -1.0, 1.0) * uBlur; }
void main(){
  float z = viewZ(vUv), c = coc(z), radius = abs(c);
  vec3 col = texture(tColor, vUv).rgb;
  float ao = texture(tAO, vUv).r;
  if (radius > 0.6) {
    float lod = clamp(log2(radius * 0.22), 0.0, 4.0);
    vec3 sum = textureLod(tColor, vUv, lod).rgb; float wsum = 1.0;
    ao = textureLod(tAO, vUv, max(lod - 1.0, 0.0)).r;
    float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    for (int i = 0; i < 28; i++) {
      float a = rot + float(i) * 2.3999632, r = sqrt((float(i) + 0.5) / 28.0) * radius;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
      // A sample only bleeds onto this pixel if its own blur reaches this far.
      float w = smoothstep(r - 1.0, r + 1.0, abs(coc(viewZ(uv))) + 0.5);
      sum += textureLod(tColor, uv, lod).rgb * w; wsum += w;
    }
    col = sum / wsum;
  }
  outColor = vec4(col * mix(1.0, ao, uAO), 1.0);
}`;

const BRIGHT = /* glsl */`
uniform sampler2D tIn;
uniform float uThreshold;
void main(){
  vec2 e = 1.0 / vec2(textureSize(tIn, 0));
  vec3 c = 0.25 * (texture(tIn, vUv + e * vec2(-1.0, -1.0)).rgb + texture(tIn, vUv + e * vec2(1.0, -1.0)).rgb + texture(tIn, vUv + e * vec2(-1.0, 1.0)).rgb + texture(tIn, vUv + e).rgb);
  float l = max(c.r, max(c.g, c.b));
  outColor = vec4(min(c * max(l - uThreshold, 0.0) / max(l, 1e-4), vec3(24.0)), 1.0);
}`;

const DOWN = /* glsl */`
uniform sampler2D tIn;
void main(){
  vec2 e = 1.0 / vec2(textureSize(tIn, 0));
  outColor = vec4(0.25 * (texture(tIn, vUv + e * vec2(-1.0, -1.0)).rgb + texture(tIn, vUv + e * vec2(1.0, -1.0)).rgb + texture(tIn, vUv + e * vec2(-1.0, 1.0)).rgb + texture(tIn, vUv + e).rgb), 1.0);
}`;

const UP = /* glsl */`
uniform sampler2D tIn;
uniform float uWeight;
void main(){
  vec2 e = 1.0 / vec2(textureSize(tIn, 0));
  vec3 c = texture(tIn, vUv).rgb * 4.0;
  c += (texture(tIn, vUv + vec2(e.x, 0.0)).rgb + texture(tIn, vUv - vec2(e.x, 0.0)).rgb + texture(tIn, vUv + vec2(0.0, e.y)).rgb + texture(tIn, vUv - vec2(0.0, e.y)).rgb) * 2.0;
  c += texture(tIn, vUv + e).rgb + texture(tIn, vUv - e).rgb + texture(tIn, vUv + vec2(e.x, -e.y)).rgb + texture(tIn, vUv + vec2(-e.x, e.y)).rgb;
  outColor = vec4(c / 16.0 * uWeight, 1.0);
}`;

const FINAL = /* glsl */`
uniform sampler2D tColor, tBloom;
uniform float uExposure, uBloom, uVignette;
// ACES fit by Stephen Hill
vec3 rrtOdt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537, b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  c = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * c;
  c = rrtOdt(c);
  return clamp(mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * c, 0.0, 1.0);
}
void main(){
  vec3 c = texture(tColor, vUv).rgb + texture(tBloom, vUv).rgb * uBloom;
  c = aces(c * uExposure * 1.25);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);                                   // a little more colour
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);                   // a little more contrast
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
  c = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;   // dither against banding
  outColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer, { samples = 4, bloomLevels = 5 } = {}) {
    this.renderer = renderer;
    this.samples = samples;
    this.bloomLevels = bloomLevels;
    this.settings = { ao: 0.75, blur: 1, bloom: 0.5, vignette: 0.32, dof: true };
    const u = (v) => ({ value: v });
    this.ao = new Pass(AO, { tDepth: u(null), uProjInv: u(new THREE.Matrix4()), uRes: u(new THREE.Vector2()), uRadius: u(2), uProjScale: u(1) });
    this.aoBlur = new Pass(AO_BLUR, { tAO: u(null), tDepth: u(null), uStep: u(new THREE.Vector2()), uNear: u(1), uFar: u(1000) });
    this.dof = new Pass(DOF, { tColor: u(null), tDepth: u(null), tAO: u(null), uRes: u(new THREE.Vector2()), uNear: u(1), uFar: u(1000), uFocus: u(100), uBlur: u(0), uAO: u(0.75) });
    this.bright = new Pass(BRIGHT, { tIn: u(null), uThreshold: u(1.0) });
    this.down = new Pass(DOWN, { tIn: u(null) });
    this.up = new Pass(UP, { tIn: u(null), uWeight: u(1) }, { blending: THREE.AdditiveBlending, transparent: true });
    this.final = new Pass(FINAL, { tColor: u(null), tBloom: u(null), uExposure: u(1), uBloom: u(0.5), uVignette: u(0.3) });
    this.targets = null;
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (this.targets && this.w === w && this.h === h) return;
    this.dispose();
    this.w = w; this.h = h;
    const hdr = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, stencilBuffer: false };
    const depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    // Mipmaps on the scene colour let the blur read wide, pre-filtered samples instead of showing its tap pattern.
    const scene = new THREE.WebGLRenderTarget(w, h, { ...hdr, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, samples: this.samples, depthBuffer: true, depthTexture });
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    const ldr = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false, stencilBuffer: false };
    const bloom = [];
    for (let i = 0, bw = hw, bh = hh; i < this.bloomLevels && bw > 4 && bh > 4; i++, bw = Math.ceil(bw / 2), bh = Math.ceil(bh / 2)) bloom.push(new THREE.WebGLRenderTarget(bw, bh, { ...hdr, depthBuffer: false }));
    this.targets = { scene, aoA: new THREE.WebGLRenderTarget(hw, hh, { ...ldr, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true }), aoB: new THREE.WebGLRenderTarget(hw, hh, ldr), dof: new THREE.WebGLRenderTarget(w, h, { ...hdr, depthBuffer: false }), bloom };
  }

  dispose() {
    if (!this.targets) return;
    const { scene, aoA, aoB, dof, bloom } = this.targets;
    for (const t of [scene, aoA, aoB, dof, ...bloom]) t.dispose();
    scene.depthTexture?.dispose();
    this.targets = null;
  }

  /** @param {{focus:number, exposure:number, aoRadius:number}} view */
  render(scene, camera, view) {
    const { renderer, targets: t, settings } = this, { w, h } = this;
    renderer.setRenderTarget(t.scene);
    renderer.clear();
    renderer.render(scene, camera);

    const depth = t.scene.depthTexture;
    const ao = this.ao.uniforms;
    ao.tDepth.value = depth; ao.uProjInv.value.copy(camera.projectionMatrixInverse); ao.uRes.value.set(t.aoA.width, t.aoA.height);
    ao.uRadius.value = view.aoRadius; ao.uProjScale.value = camera.projectionMatrix.elements[5] * 0.5;
    if (settings.ao > 0) {
      this.ao.render(renderer, t.aoA);
      const blur = this.aoBlur.uniforms;
      blur.tDepth.value = depth; blur.uNear.value = camera.near; blur.uFar.value = camera.far;
      blur.tAO.value = t.aoA.texture; blur.uStep.value.set(1 / t.aoA.width, 0); this.aoBlur.render(renderer, t.aoB);
      blur.tAO.value = t.aoB.texture; blur.uStep.value.set(0, 1 / t.aoA.height); this.aoBlur.render(renderer, t.aoA);
    }

    const dof = this.dof.uniforms;
    dof.tColor.value = t.scene.texture; dof.tDepth.value = depth; dof.tAO.value = t.aoA.texture; dof.uRes.value.set(w, h);
    dof.uNear.value = camera.near; dof.uFar.value = camera.far; dof.uFocus.value = view.focus;
    dof.uBlur.value = settings.dof ? settings.blur * h * 0.0095 : 0; dof.uAO.value = settings.ao;
    this.dof.render(renderer, t.dof);

    const b = t.bloom;
    this.bright.uniforms.tIn.value = t.dof.texture; this.bright.render(renderer, b[0]);
    for (let i = 1; i < b.length; i++) { this.down.uniforms.tIn.value = b[i - 1].texture; this.down.render(renderer, b[i]); }
    renderer.autoClear = false;
    for (let i = b.length - 1; i > 0; i--) { this.up.uniforms.tIn.value = b[i].texture; this.up.uniforms.uWeight.value = 0.85; this.up.render(renderer, b[i - 1]); }
    renderer.autoClear = true;

    const f = this.final.uniforms;
    f.tColor.value = t.dof.texture; f.tBloom.value = b[0].texture; f.uExposure.value = view.exposure; f.uBloom.value = settings.bloom; f.uVignette.value = settings.vignette;
    this.final.render(renderer, null);
  }
}
