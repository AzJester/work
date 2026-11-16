// The exhibition hall the map sits in: polished floor, sunken well, viewing gallery with visitors, columns and a glazed wall.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOOR_Y } from './wall.js';
import { mulberry } from './props.js';
import { lin } from './glsl.js';

export const HALL = { well: 1060, gallery: 12, glass: 1620, roof: 1200 };

function figureGeometry() {
  const body = new THREE.CapsuleGeometry(2.1, 6.4, 2, 7);
  body.translate(0, 6.6, 0);
  const head = new THREE.SphereGeometry(1.75, 8, 6);
  head.translate(0, 13.6, 0);
  const strip = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const g = mergeGeometries([strip(body), strip(head)]), p = g.getAttribute('position'), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(p.getY(i) > 11.9 ? [0.62, 0.42, 0.3] : p.getY(i) < 5 ? [0.16, 0.17, 0.2] : [1, 1, 1], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Hall {
  constructor() {
    this.group = new THREE.Group();
    this.room = new THREE.Group();     // everything except the floor, so the hall can be switched off
    const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

    // Floor: honed stone laid in rings.
    const floorMat = std('#b3aa9b', 0.36);
    floorMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloor;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloor;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <map_fragment>', `
          float fr = length(vFloor.xz), ring = fr / 70.0, fa = atan(vFloor.z, vFloor.x);
          float seg = floor(ring), across = fa * (6.0 + seg * 3.0) / 6.2831853 + fh(vec2(seg, 1.0));
          vec2 tile = vec2(seg, floor(across));
          float joint = min(min(fract(ring), 1.0 - fract(ring)) * 70.0, min(fract(across), 1.0 - fract(across)) * fr * 6.2831853 / (6.0 + seg * 3.0));
          diffuseColor.rgb *= (0.9 + 0.2 * fh(tile)) * mix(0.72, 1.0, smoothstep(0.0, 0.9, joint));
          diffuseColor.rgb = mix(diffuseColor.rgb, ${lin('#6f6a62')}, step(1.0, mod(seg, 5.0)) * 0.0 + smoothstep(0.86, 1.0, fh(tile + 7.0)) * 0.35);`);
    };
    floorMat.customProgramCacheKey = () => 'relief-floor';
    const floor = new THREE.Mesh(new THREE.CircleGeometry(HALL.glass + 400, 128), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    this.group.add(floor);

    // The well the map stands in, and the gallery around it.
    const stone = std('#cbc4b6', 0.7), wellH = HALL.gallery - FLOOR_Y;
    const well = new THREE.Mesh(new THREE.CylinderGeometry(HALL.well, HALL.well, wellH, 160, 1, true), std('#bdb6a8', 0.75, { side: THREE.BackSide }));
    well.position.y = FLOOR_Y + wellH / 2;
    const deck = new THREE.Mesh(new THREE.RingGeometry(HALL.well, HALL.glass + 60, 160, 1), std('#a89f8e', 0.55));
    deck.rotation.x = -Math.PI / 2; deck.position.y = HALL.gallery;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(HALL.well, 1.6, 6, 200), stone);
    lip.rotation.x = Math.PI / 2; lip.position.y = HALL.gallery;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(HALL.well + 2, HALL.well + 2, 10, 160, 1, true),
      new THREE.MeshStandardMaterial({ color: '#d5ecf2', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = HALL.gallery + 5.5;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(HALL.well + 2, 0.7, 6, 200), std('#3b3d40', 0.35, { metalness: 0.6 }));
    rail.rotation.x = Math.PI / 2; rail.position.y = HALL.gallery + 10.8;
    this.room.add(well, deck, lip, glass, rail);

    // Columns and the glazed wall.
    const colH = HALL.roof - HALL.gallery, columns = 22;
    const column = new THREE.InstancedMesh(new THREE.CylinderGeometry(15, 17, colH, 20, 1, true), std('#d8d2c6', 0.62), columns);
    const m = new THREE.Matrix4();
    for (let i = 0; i < columns; i++) {
      const a = (i + 0.5) / columns * Math.PI * 2;
      column.setMatrixAt(i, m.makeTranslation(Math.cos(a) * (HALL.glass - 90), HALL.gallery + colH / 2, Math.sin(a) * (HALL.glass - 90)));
    }
    const mullions = 88, mullion = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, colH, 7), std('#2c2e31', 0.4, { metalness: 0.5 }), mullions);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < mullions; i++) {
      const a = i / mullions * Math.PI * 2;
      mullion.setMatrixAt(i, m.compose(p.set(Math.cos(a) * HALL.glass, HALL.gallery + colH / 2, Math.sin(a) * HALL.glass), q.setFromAxisAngle(up, -a + Math.PI / 2), one));
    }
    this.room.add(column, mullion);
    for (const y of [HALL.gallery + 70, HALL.gallery + 330, HALL.gallery + 640, HALL.gallery + 940]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(HALL.glass, 2.6, 5, 180), mullion.material);
      band.rotation.x = Math.PI / 2; band.position.y = y;
      this.room.add(band);
    }
    // Roof with a wide oculus, so the sun still reaches the map.
    const roof = new THREE.Mesh(new THREE.RingGeometry(820, HALL.glass + 80, 128, 1), std('#3a352f', 0.9, { side: THREE.DoubleSide }));
    roof.rotation.x = Math.PI / 2; roof.position.y = HALL.roof;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(820, 9, 8, 160), std('#cfc8ba', 0.6));
    rim.rotation.x = Math.PI / 2; rim.position.y = HALL.roof;
    this.room.add(roof, rim);

    // Visitors along the rail, in loose groups.
    const rnd = mulberry(4711), count = 150, tints = ['#c9402f', '#2f5d8a', '#e8e2d2', '#3a7a55', '#d9a13a', '#5a4a7a', '#202428', '#b8562a', '#7fa3c4'].map((h) => new THREE.Color(h));
    const people = new THREE.InstancedMesh(figureGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), count);
    let angle = 0;
    for (let i = 0; i < count; i++) {
      angle += rnd() < 0.3 ? 0.08 + rnd() * 0.25 : 0.006 + rnd() * 0.012;       // a gap, or a step within a group
      const r = HALL.well + 9 + rnd() * rnd() * 70, s = 0.86 + rnd() * 0.3;
      people.setMatrixAt(i, m.compose(p.set(Math.cos(angle) * r, HALL.gallery, Math.sin(angle) * r), q.setFromAxisAngle(up, -angle + Math.PI / 2 + (rnd() - 0.5)), new THREE.Vector3(s, s, s)));
      people.setColorAt(i, tints[Math.floor(rnd() * tints.length)]);
    }
    this.room.add(people);
    this.group.add(this.room);
  }

  set visible(on) { this.room.visible = on; }
  get visible() { return this.room.visible; }
}
