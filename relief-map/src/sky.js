// Sun position and colour by time of day, and the sky dome with its distant mountain backdrop.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const hex = (h) => new THREE.Color(h);
const ramp = (stops, x) => {
  // stops: [[x, '#hex'], ...] sorted by x
  if (x <= stops[0][0]) return hex(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) return hex(stops[i - 1][1]).lerp(hex(stops[i][1]), (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return hex(stops[stops.length - 1][1]);
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Lighting for an hour of the day (5 to 22). The sun rises at 6 in the east and sets at 20 in the west. */
export function sunState(hour) {
  const t = (hour - 6) / 14;
  const elevation = t >= 0 && t <= 1 ? 62 * Math.sin(Math.PI * t) : -Math.min(20, 140 * Math.min(Math.abs(t), Math.abs(t - 1)));
  const azimuth = 90 + 180 * t;
  const dir = new THREE.Vector3(Math.sin(azimuth * DEG) * Math.cos(elevation * DEG), Math.sin(elevation * DEG), -Math.cos(azimuth * DEG) * Math.cos(elevation * DEG));
  const night = smooth(1, -9, elevation), day = smooth(-4, 9, elevation);
  const moon = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
  return {
    hour, elevation, azimuth, night, day,
    sunDir: dir,
    lightDir: night > 0.45 ? moon : dir,
    lightColor: night > 0.45 ? hex('#9db4ff') : ramp([[-2, '#ff5a1e'], [5, '#ff9a4a'], [16, '#ffd4a3'], [40, '#fff3e2']], elevation),
    lightIntensity: night > 0.45 ? 0.25 + 0.75 * smooth(0.45, 0.95, night) : 3.6 * smooth(-3, 10, elevation),
    zenith: ramp([[-12, '#04060e'], [-3, '#1b2a5c'], [6, '#3567b4'], [30, '#3f7dd0']], elevation),
    horizon: ramp([[-12, '#0a1022'], [-4, '#7a4a52'], [1, '#f08a4e'], [9, '#f7c88f'], [22, '#dbe8f4'], [45, '#cfe2f6']], elevation),
    sunColor: ramp([[-4, '#ff4a12'], [4, '#ff9440'], [14, '#ffd9a8'], [40, '#fff6e8']], elevation),
    ambient: 0.34 + 0.66 * day,
    exposure: 1.08 + 0.7 * night,
  };
}

const VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

const FRAG = /* glsl */`
uniform vec3 uSunDir, uZenith, uHorizon, uSunColor;
uniform float uNight, uBackdrop;
varying vec3 vDir;
float hash(float n){ return fract(sin(n) * 43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
float ridge(float a, float seed){
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) { s += amp * abs(n1(a * f + seed) * 2.0 - 1.0); amp *= 0.5; f *= 2.13; seed += 17.3; }
  return 1.0 - s;
}
void main(){
  vec3 d = normalize(vDir);
  float up = d.y, az = atan(d.z, d.x);
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.42));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (smoothstep(0.9996, 0.99985, sd) * 40.0 + pow(sd, 180.0) * 1.2 + pow(sd, 12.0) * 0.22) * (1.0 - uNight);
  // stars
  vec2 sp = floor(d.xz / (abs(d.y) + 0.35) * 220.0);
  col += vec3(0.9, 0.95, 1.0) * step(0.9975, hash2(sp)) * uNight * smoothstep(0.02, 0.3, up) * (0.4 + 0.6 * hash2(sp + 3.1));
  // thin high cloud
  float cl = n1(az * 3.0 + up * 9.0) * n1(az * 7.0 - up * 21.0 + 4.0);
  col = mix(col, mix(uHorizon, vec3(1.0), 0.5) * (1.0 - 0.8 * uNight), smoothstep(0.42, 0.75, cl) * smoothstep(0.03, 0.2, up) * (1.0 - smoothstep(0.25, 0.6, up)) * 0.45);
  if (uBackdrop > 0.5) {
    // Three ranges of mountains on the horizon and a lake below it.
    float lit = 1.0 - 0.85 * uNight;
    float far = 0.012 + 0.085 * ridge(az * 2.6, 3.0), mid = 0.004 + 0.05 * ridge(az * 4.4, 40.0), near = -0.004 + 0.024 * ridge(az * 7.0, 90.0);
    vec3 haze = mix(uHorizon, uZenith, 0.25);
    vec3 farCol = mix(vec3(0.36, 0.44, 0.58), vec3(0.95, 0.97, 1.0), smoothstep(far * 0.55, far * 0.8, up)) * lit;
    col = mix(col, mix(farCol, haze, 0.55), smoothstep(far + 0.0015, far, up));
    col = mix(col, mix(vec3(0.16, 0.25, 0.3) * lit, haze, 0.35), smoothstep(mid + 0.001, mid, up));
    col = mix(col, mix(vec3(0.06, 0.13, 0.09) * lit, haze, 0.15), smoothstep(near + 0.001, near, up));
    vec3 lake = mix(mix(uHorizon, uZenith, 0.5) * 0.75, vec3(0.03, 0.09, 0.14) * lit, smoothstep(0.0, -0.25, up));
    lake += uSunColor * pow(max(dot(normalize(vec3(d.x, -d.y, d.z)), uSunDir), 0.0), 60.0) * 0.5 * (1.0 - uNight);
    col = mix(col, lake, smoothstep(-0.004, -0.012, up));
  } else {
    col = mix(col, mix(uHorizon, uZenith, 0.6) * 0.5, smoothstep(0.0, -0.2, up));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uNight: { value: 0 }, uBackdrop: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    // A copy without the backdrop lights the scene, so reflections stay clean.
    const envMaterial = material.clone();
    envMaterial.uniforms = { ...this.uniforms, uBackdrop: { value: 0 } };
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(this.mesh.geometry, envMaterial));
    this.envTarget = null;
  }

  apply(state) {
    const u = this.uniforms;
    u.uSunDir.value.copy(state.sunDir); u.uZenith.value.copy(state.zenith); u.uHorizon.value.copy(state.horizon); u.uSunColor.value.copy(state.sunColor);
    u.uNight.value = state.night;
  }

  /** Re-renders the environment map from the current sky. */
  environment(renderer) {
    this.pmrem ??= new THREE.PMREMGenerator(renderer);
    const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 10);
    this.envTarget?.dispose();
    this.envTarget = next;
    return next.texture;
  }
}
