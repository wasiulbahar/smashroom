// The clay statue: one human body (MakeHuman base mesh, CC0) cut at the neck, shoulders and hips.
// Hits push the surface in and the marks stay. The head snaps round, the body sways, limbs break off at
// the joints, and the whole figure collapses when the torso gives out. Every third figure is a tougher boss.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const rand = (a, b) => a + Math.random() * (b - a);
const CLAY = 0xb3ada3, GOLD = 0xc9a227;

// how each part behaves: damage it takes before breaking off, points, deepest dent, dent width factor
const SPEC = {
  head: { name: 'head', tough: 1.1, pts: 50, maxD: 0.035, rad: 0.65 },
  torso: { name: 'torso', tough: 3.2, pts: 80, maxD: 0.06, rad: 1 },
  armL: { name: 'arm', side: 1, tough: 0.9, pts: 30, maxD: 0.02, rad: 0.55 },
  armR: { name: 'arm', side: -1, tough: 0.9, pts: 30, maxD: 0.02, rad: 0.55 },
  legL: { name: 'leg', side: 1, tough: 1.3, pts: 30, maxD: 0.03, rad: 0.75 },
  legR: { name: 'leg', side: -1, tough: 1.3, pts: 30, maxD: 0.03, rad: 0.75 },
};

let BODY = null; // { key: { geo, pivot } }, each geometry's origin at its joint
export const preloadClayBody = () => BODY ? Promise.resolve() : fetch('assets/models/body/body.json').then(r => r.json()).then(d => {
  const out = {};
  for (const [key, part] of Object.entries(d.parts)) {
    const n = part.p.length / 3, pos = new Float32Array(part.p.length), uv = new Float32Array(n * 2);
    for (let i = 0; i < part.p.length; i++) pos[i] = part.p[i] * d.unit;
    for (let i = 0; i < n; i++) { uv[i * 2] = Math.atan2(pos[i * 3], pos[i * 3 + 2]) / (Math.PI * 2) * 3; uv[i * 2 + 1] = pos[i * 3 + 1] * 5; } // only for the fine clay grain
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(part.i); geo.computeVertexNormals(); geo.computeBoundingBox();
    out[key] = { geo, pivot: new THREE.Vector3(...part.pivot) };
  }
  BODY = out;
}).catch(e => console.warn('clay body failed to load', e));

let grain = null;
function clayGrain() { // thumb-smoothed clay: fine speckle plus a few soft strokes
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 100 + Math.random() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '70,70,70' : '180,180,180'},.25)`; g.lineWidth = rand(2, 7); const x = rand(0, 256), y = rand(0, 256), a = rand(-0.5, 0.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * rand(20, 70), y + Math.sin(a) * rand(20, 70)); g.stroke(); }
  grain = new THREE.CanvasTexture(c); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; return grain;
}

export function createClayFigure({ scene, world, S, items, x, y, z, onLoose }) {
  if (!BODY) return null;
  const api = { parts: [], alive: false, respawnAt: 0, count: 0, boss: false };
  const ray = new THREE.Raycaster(), mats = new Map();
  const tilt = { x: 0, z: 0, vx: 0, vz: 0 }, look = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
  let lastVoice = 0;
  const material = color => {
    if (!S.realistic) return S.mat('clay', color);
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: color === GOLD ? 0.5 : 0, bumpMap: clayGrain(), bumpScale: 0.6, envMapIntensity: S.envI * 0.5 }));
    return mats.get(color);
  };

  function build() {
    api.count++; api.boss = api.count % 3 === 0;
    const color = api.boss ? GOLD : CLAY, mat = material(color), scale = api.boss ? 1.08 : 0.95;
    api.color = color; api.parts = []; api.alive = true;
    Object.assign(tilt, { x: 0, z: 0, vx: 0, vz: 0 }); Object.assign(look, { yaw: 0, pitch: 0, vy: 0, vp: 0 });
    const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = rand(-0.15, 0.15); root.scale.setScalar(scale); scene.add(root); api.root = root;
    const wob = new THREE.Group(); root.add(wob); api.wob = wob; // sways when hit; the plinth stays put
    for (const [key, spec] of Object.entries(SPEC)) {
      const src = BODY[key], geo = src.geo.clone(), mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(src.pivot); mesh.castShadow = mesh.receiveShadow = true; wob.add(mesh); S.outline(mesh, 1.02);
      root.updateMatrixWorld(true);
      const bb = src.geo.boundingBox, half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5 * scale), centre = bb.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      const wp = mesh.getWorldPosition(new THREE.Vector3()), wq = mesh.getWorldQuaternion(new THREE.Quaternion());
      const body = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(wp.x, wp.y, wp.z) });
      body.addShape(new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)), new CANNON.Vec3(centre.x, centre.y, centre.z));
      body.quaternion.set(wq.x, wq.y, wq.z, wq.w); world.addBody(body);
      api.parts.push({ ...spec, key, tough: spec.tough * (api.boss ? 2.2 : 1), pts: spec.pts * (api.boss ? 2 : 1), mesh, body, half, centre, orig: Float32Array.from(geo.attributes.position.array), damage: 0, off: false });
    }
    api.head = api.parts[0];
  }

  // push vertices near the hit point inwards (local space), never more than maxD from the original shape
  const inv = new THREE.Matrix4(), lp = new THREE.Vector3(), ld = new THREE.Vector3(), v = new THREE.Vector3(), o = new THREE.Vector3();
  function dent(part, point, dir, radius, depth) {
    const m = part.mesh, geo = m.geometry, pos = geo.attributes.position, orig = part.orig, sc = api.root.scale.x;
    inv.copy(m.matrixWorld).invert(); lp.copy(point).applyMatrix4(inv); ld.copy(dir).transformDirection(inv);
    const r = radius * part.rad / sc, dp = depth * Math.min(1, part.rad + 0.2) / sc, r2 = r * r;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const d2 = v.distanceToSquared(lp); if (d2 >= r2) continue;
      const f = 1 - Math.sqrt(d2) / r, k = f * f * (3 - 2 * f); v.addScaledVector(ld, dp * k);
      o.set(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]); const len = v.distanceTo(o);
      if (len > part.maxD) v.sub(o).multiplyScalar(part.maxD / len).add(o);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  const DMG = { punch: 0.35, slap: 0.2, kick: 0.6, weapon: 0.45, heavy: 0.8 };

  function loosen(part, dir, speed = 4) {
    if (part.off) return; part.off = true; world.removeBody(part.body);
    const m = part.mesh, wp = m.getWorldPosition(new THREE.Vector3()), wq = m.getWorldQuaternion(new THREE.Quaternion()), ws = m.getWorldScale(new THREE.Vector3());
    scene.attach(m); m.position.copy(wp); m.quaternion.copy(wq); m.scale.copy(ws);
    const body = new CANNON.Body({ mass: part.name === 'torso' ? 8 : part.name === 'leg' ? 4 : 2.5, position: new CANNON.Vec3(wp.x, wp.y, wp.z) });
    body.addShape(new CANNON.Box(new CANNON.Vec3(part.half.x * 0.85, part.half.y * 0.95, part.half.z * 0.85)), new CANNON.Vec3(part.centre.x, part.centre.y, part.centre.z));
    body.quaternion.set(wq.x, wq.y, wq.z, wq.w); body.linearDamping = 0.1; body.angularDamping = 0.3;
    body.velocity.set(dir.x * speed + rand(-1, 1), Math.max(1, dir.y * speed) + rand(0.5, 2), dir.z * speed + rand(-1, 1));
    body.angularVelocity.set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
    world.addBody(body); onLoose({ mesh: m, body, kind: 'clay' });
  }

  function blobs(point, dir, n) {
    for (let i = 0; i < n; i++) items.shard('clay', rand(0.008, 0.022), api.color, point, new CANNON.Vec3(), new THREE.Vector3(-dir.x, 0.4, -dir.z).normalize(), 2.5, 0.1);
  }

  // type: punch | slap | kick | weapon | heavy. Returns what happened, or null if nothing was hit.
  api.hit = (origin, dir, reach, type, right) => {
    if (!api.alive) return null;
    ray.set(origin, dir); ray.far = reach;
    const h = ray.intersectObjects(api.parts.filter(p => !p.off).map(p => p.mesh), false)[0];
    if (!h) return null;
    const part = api.parts.find(p => p.mesh === h.object), up = new THREE.Vector3(0, 1, 0), P = h.point;
    if (type === 'punch') { dent(part, P, dir, 0.075, 0.035); for (let k = 0; k < 4; k++) dent(part, P.clone().addScaledVector(right, (k - 1.5) * 0.026).addScaledVector(up, 0.018), dir, 0.024, 0.014); } // knuckles
    else if (type === 'slap') { dent(part, P, dir, 0.1, 0.016); for (let f = 0; f < 4; f++) dent(part, P.clone().addScaledVector(right, (f - 1.5) * 0.024).addScaledVector(up, 0.09), dir, 0.02, 0.009); } // palm and fingers
    else if (type === 'kick') dent(part, P, dir, 0.14, 0.07);
    else if (type === 'heavy') dent(part, P, dir, 0.16, 0.09);
    else dent(part, P, dir, 0.1, 0.06);
    part.damage += (DMG[type] || 0.4) / part.tough;
    blobs(P, dir, type === 'slap' ? 2 : type === 'punch' ? 3 : 6);
    // reactions: the body sways away from the blow, the head snaps round or back
    const push = { punch: 0.9, slap: 0.5, kick: 1.8, weapon: 1.2, heavy: 2.2 }[type] || 1, w = api.boss ? 0.5 : 1;
    tilt.vx += dir.z * push * w; tilt.vz -= dir.x * push * w;
    if (part.name === 'head') {
      const sideways = right.dot(P.clone().sub(api.head.mesh.getWorldPosition(new THREE.Vector3())));
      if (type === 'slap') look.vy += (sideways > 0 ? 1 : -1) * 13 * w + rand(-2, 2); else { look.vp -= push * 5 * w; look.vy += -sideways * 60 * w; }
    } else if (part.name === 'torso') look.vp += push * 2 * w;
    const res = { point: P, part: part.name, lost: [], collapsed: false, voice: null };
    if (performance.now() - lastVoice > 380 && Math.random() < 0.7) { res.voice = api.boss ? 'boss' : 'oof'; lastVoice = performance.now(); }
    if (part.damage >= 1) {
      if (part.name === 'torso') {
        for (const p of api.parts) if (!p.off) { loosen(p, dir, 3); res.lost.push(p); }
        res.collapsed = true; res.voice = 'groan'; api.alive = false; api.respawnAt = performance.now() + 3000;
      } else { loosen(part, dir, part.name === 'head' ? 5 : 4); res.lost.push(part); res.voice = 'ow'; lastVoice = performance.now(); }
    }
    return res;
  };

  // returns 'new' or 'boss' on the frame a fresh figure appears
  api.update = (dt = 1 / 60) => {
    tilt.vx += (-60 * tilt.x - 5 * tilt.vx) * dt; tilt.vz += (-60 * tilt.z - 5 * tilt.vz) * dt;
    tilt.x = Math.max(-0.3, Math.min(0.3, tilt.x + tilt.vx * dt)); tilt.z = Math.max(-0.3, Math.min(0.3, tilt.z + tilt.vz * dt));
    look.vy += (-90 * look.yaw - 9 * look.vy) * dt; look.vp += (-90 * look.pitch - 9 * look.vp) * dt;
    look.yaw = Math.max(-1.1, Math.min(1.1, look.yaw + look.vy * dt)); look.pitch = Math.max(-0.6, Math.min(0.45, look.pitch + look.vp * dt));
    if (api.wob && api.alive) {
      api.wob.rotation.set(tilt.x, 0, tilt.z);
      if (!api.head.off) api.head.mesh.rotation.set(look.pitch, look.yaw, 0);
      for (const p of api.parts) if (p.name === 'arm' && !p.off) p.mesh.rotation.set(-tilt.x * 1.6, 0, -tilt.z * 1.2); // arms lag behind the sway
    }
    if (!api.alive && api.respawnAt && performance.now() > api.respawnAt) { api.respawnAt = 0; scene.remove(api.root); build(); return api.boss ? 'boss' : 'new'; }
    return null;
  };
  build();
  return api;
}
