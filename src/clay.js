// A clay figure on a pedestal. Hits push the surface in (knuckle marks, hand prints, boot dents),
// limbs crack off when they take enough damage, and the whole thing collapses when the body gives out.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const COLORS = [0xb5653a, 0x9a948c, 0xc98a5c, 0x8a5a4a, 0xd0b490];

// capsule with evenly spaced rings along its whole length, so dents have vertices to push
function capsule(r, len, seg = 32) {
  const pts = [], cap = 10, mid = Math.ceil(len / 0.02);
  for (let i = 0; i <= cap; i++) { const a = -Math.PI / 2 + i / cap * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, -len / 2 + Math.sin(a) * r)); }
  for (let i = 1; i < mid; i++) pts.push(new THREE.Vector2(r, -len / 2 + i / mid * len));
  for (let i = 0; i <= cap; i++) { const a = i / cap * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, len / 2 + Math.sin(a) * r)); }
  return new THREE.LatheGeometry(pts, seg);
}
function smoothGeo(geo) {
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4); g.computeVertexNormals(); return g;
}

// part: name, geometry, local position/rotation/scale, how much damage it takes to come off, points
const PARTS = [
  { name: 'leg', side: -1, geo: () => capsule(0.085, 0.62, 28), pos: [-0.11, 0.42, 0], tough: 1.3, pts: 30 },
  { name: 'leg', side: 1, geo: () => capsule(0.085, 0.62, 28), pos: [0.11, 0.42, 0], tough: 1.3, pts: 30 },
  { name: 'torso', geo: () => capsule(0.17, 0.4, 44), pos: [0, 1.12, 0], scale: [1.2, 1, 0.75], tough: 3.2, pts: 80 },
  { name: 'arm', side: -1, geo: () => capsule(0.062, 0.5, 24), pos: [-0.3, 1.08, 0], rot: [0, 0, -0.14], tough: 0.9, pts: 30 },
  { name: 'arm', side: 1, geo: () => capsule(0.062, 0.5, 24), pos: [0.3, 1.08, 0], rot: [0, 0, 0.14], tough: 0.9, pts: 30 },
  { name: 'head', geo: () => new THREE.SphereGeometry(0.13, 48, 36), pos: [0, 1.6, 0], scale: [0.95, 1.08, 1], tough: 1.1, pts: 50 },
];

export function createClayFigure({ scene, world, S, items, x, y, z, onLoose }) {
  const api = { parts: [], alive: false, respawnAt: 0 };
  const ray = new THREE.Raycaster();

  function build() {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)], mat = S.mat('clay', color);
    api.color = color; api.parts = []; api.alive = true;
    const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = rand(-0.3, 0.3); scene.add(root); api.root = root;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 16), mat); neck.position.set(0, 1.47, 0); neck.castShadow = true; root.add(neck); api.neck = neck;
    for (const P of PARTS) {
      const geo = smoothGeo(P.geo()); if (P.scale) geo.scale(...P.scale); // bake shape into the geometry so dents stay round
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...P.pos); if (P.rot) mesh.rotation.set(...P.rot);
      mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); S.outline(mesh, 1.03);
      root.updateMatrixWorld(true);
      geo.computeBoundingBox(); const half = geo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const wp = mesh.getWorldPosition(new THREE.Vector3()), wq = mesh.getWorldQuaternion(new THREE.Quaternion());
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)), position: new CANNON.Vec3(wp.x, wp.y, wp.z) });
      body.quaternion.set(wq.x, wq.y, wq.z, wq.w); world.addBody(body);
      api.parts.push({ ...P, mesh, body, half, orig: Float32Array.from(geo.attributes.position.array), damage: 0, off: false, maxD: Math.min(half.x, half.z) * 0.75 });
    }
  }

  // push vertices near the hit point inwards (local space), never more than maxD from the original shape
  const inv = new THREE.Matrix4(), lp = new THREE.Vector3(), ld = new THREE.Vector3(), v = new THREE.Vector3(), o = new THREE.Vector3(), n = new THREE.Vector3();
  function dent(part, point, dir, radius, depth) {
    const m = part.mesh, geo = m.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, orig = part.orig;
    inv.copy(m.matrixWorld).invert(); lp.copy(point).applyMatrix4(inv); ld.copy(dir).transformDirection(inv);
    const r = radius, dp = depth;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const d = v.distanceTo(lp);
      if (d < r) { const f = 1 - d / r, k = f * f * (3 - 2 * f); v.addScaledVector(ld, dp * k); }
      else continue;
      o.set(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]); const off = v.clone().sub(o), len = off.length();
      if (len > part.maxD) v.copy(o).addScaledVector(off, part.maxD / len);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  const DMG = { punch: 0.35, slap: 0.2, kick: 0.6, weapon: 0.45, heavy: 0.8 };

  function loosen(part, dir, speed = 4) {
    if (part.off) return; part.off = true; world.removeBody(part.body);
    const m = part.mesh, wp = m.getWorldPosition(new THREE.Vector3()), wq = m.getWorldQuaternion(new THREE.Quaternion()), ws = m.getWorldScale(new THREE.Vector3());
    scene.attach(m); m.position.copy(wp); m.quaternion.copy(wq); m.scale.copy(ws);
    const body = new CANNON.Body({ mass: part.name === 'torso' ? 6 : 2, shape: new CANNON.Box(new CANNON.Vec3(part.half.x, part.half.y, part.half.z)), position: new CANNON.Vec3(wp.x, wp.y, wp.z) });
    body.quaternion.set(wq.x, wq.y, wq.z, wq.w); body.linearDamping = 0.1; body.angularDamping = 0.3;
    body.velocity.set(dir.x * speed + rand(-1, 1), Math.max(1, dir.y * speed) + rand(0.5, 2), dir.z * speed + rand(-1, 1));
    body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    world.addBody(body); onLoose({ mesh: m, body });
  }

  function blobs(point, dir, n) {
    for (let i = 0; i < n; i++) items.shard('clay', rand(0.025, 0.06), api.color, point, new CANNON.Vec3(), new THREE.Vector3(-dir.x, 0.4, -dir.z).normalize(), 2.5, 0.1);
  }

  // type: punch | slap | kick | weapon | heavy. Returns what happened, or null if nothing was hit.
  api.hit = (origin, dir, reach, type, right) => {
    if (!api.alive) return null;
    ray.set(origin, dir); ray.far = reach;
    const meshes = api.parts.filter(p => !p.off).map(p => p.mesh);
    const h = ray.intersectObjects(meshes, false)[0];
    if (!h) return null;
    const part = api.parts.find(p => p.mesh === h.object), up = new THREE.Vector3(0, 1, 0), P = h.point;
    if (type === 'punch') { dent(part, P, dir, 0.075, 0.035); for (let k = 0; k < 4; k++) dent(part, P.clone().addScaledVector(right, (k - 1.5) * 0.028).addScaledVector(up, 0.02), dir, 0.026, 0.016); }
    else if (type === 'slap') { dent(part, P, dir, 0.1, 0.018); for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) dent(part, P.clone().addScaledVector(right, (f - 1.5) * 0.026).addScaledVector(up, 0.07 + k * 0.022), dir, 0.016, 0.01); }
    else if (type === 'kick') dent(part, P, dir, 0.14, 0.07);
    else if (type === 'heavy') dent(part, P, dir, 0.16, 0.09);
    else dent(part, P, dir, 0.1, 0.06);
    part.damage += (DMG[type] || 0.4) / part.tough;
    blobs(P, dir, type === 'slap' ? 2 : type === 'punch' ? 3 : 6);
    const res = { point: P, part: part.name, lost: [], collapsed: false };
    if (part.damage >= 1) {
      if (part.name === 'torso') {
        for (const p of api.parts) if (!p.off) { loosen(p, dir, 3); res.lost.push(p); }
        scene.attach(api.neck); api.neck.visible = false;
        res.collapsed = true; api.alive = false; api.respawnAt = performance.now() + 3000;
      } else { loosen(part, dir, part.name === 'head' ? 5 : 4); res.lost.push(part); }
    }
    return res;
  };

  api.update = () => { if (!api.alive && api.respawnAt && performance.now() > api.respawnAt) { api.respawnAt = 0; scene.remove(api.root); build(); return true; } return false; };
  build();
  return api;
}
