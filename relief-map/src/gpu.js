// Full-screen GPU passes used by the terrain bake and the post chain.
import * as THREE from 'three';

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'in vec3 position;\nout vec2 vUv;\nvoid main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\nin vec2 vUv;\nout vec4 outColor;\n';

export class Pass {
  constructor(fragment, uniforms = {}, opts = {}) {
    this.uniforms = uniforms;
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: HEAD + fragment, uniforms, depthTest: false, depthWrite: false, ...opts,
    });
    this.mesh = new THREE.Mesh(tri, this.material);
    this.mesh.frustumCulled = false;
  }

  render(renderer, target = null) {
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, cam);
  }
}

export function makeTarget(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, ...opts,
  });
}

/** Reads the red channel of a float target back to the CPU, in strips when the driver only offers RGBA. */
export function readRed(renderer, target) {
  const gl = renderer.getContext(), { width: w, height: h } = target;
  renderer.setRenderTarget(target);
  const out = new Float32Array(w * h);
  if (gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) === gl.RED && gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) === gl.FLOAT) {
    gl.readPixels(0, 0, w, h, gl.RED, gl.FLOAT, out);
  } else {
    const rows = 96, buf = new Float32Array(w * rows * 4);
    for (let y = 0; y < h; y += rows) {
      const n = Math.min(rows, h - y);
      gl.readPixels(0, y, w, n, gl.RGBA, gl.FLOAT, buf);
      for (let i = 0, o = y * w, e = w * n; i < e; i++) out[o + i] = buf[i * 4];
    }
  }
  renderer.setRenderTarget(null);
  return out;
}
