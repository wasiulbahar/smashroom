// Open city: a 4x4 grid of blocks with streets, a park, a gas station, a parking lot, a construction site and a waterfront.
// Built through the same kit as the rooms, so everything breakable works the same. main.js adds the drivable cars,
// the third-person view and the mini-map; the sky, sun, street lights and rain run here as a room update.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { canvasTex } from './style.js?v=19';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
export const HALF = 106; // the ring road's outer edge
const CENTRES = [-75, -25, 25, 75], BLOCK = 38, WALK = 0.15;

// a window grid that repeats every 4 m across and 3.2 m up; lit cells glow at night
function windowTextures() {
  const lit = [];
  const draw = (g, w, h, emissive) => {
    g.clearRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * 64 + 12, y = r * 64 + 14, on = lit[r * 4 + c];
      if (emissive) { g.fillStyle = on ? (on > 1 ? '#bfe0ff' : '#ffd890') : '#000'; g.fillRect(x, y, 40, 40); continue; }
      g.fillStyle = 'rgba(30,26,24,.85)'; g.fillRect(x - 3, y - 3, 46, 46);
      const gr = g.createLinearGradient(x, y, x + 40, y + 40); gr.addColorStop(0, '#5a7088'); gr.addColorStop(1, '#1c2430'); g.fillStyle = gr; g.fillRect(x, y, 40, 40);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 4, y + 4, 10, 32); g.fillStyle = 'rgba(30,26,24,.9)'; g.fillRect(x + 19, y, 2, 40);
    }
  };
  for (let i = 0; i < 16; i++) lit.push(Math.random() < 0.38 ? (Math.random() < 0.3 ? 2 : 1) : 0);
  const map = canvasTex(256, 256, (g, w, h) => draw(g, w, h, false)), glow = canvasTex(256, 256, (g, w, h) => draw(g, w, h, true));
  for (const t of [map, glow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return { map, glow };
}
// a plane whose UVs repeat the window grid at real-world scale
function facade(w, h, mat) {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 16, uv.getY(i) * h / 12.8);
  return new THREE.Mesh(geo, mat);
}

export function buildCity(ctx, K, { spray }) {
  const { scene, S } = ctx, R = S.realistic, LOW = S.quality === 'low';
  const mapRects = [], lampSpots = [], cars = [], heads = [], merge = []; // merge: static meshes drawn as a few big batches
  const L = HALF * 2;
  // ground, roads and markings
  const asphalt = S.surface('asphalt', 52, 52);
  K.box(L + 30, 0.2, L + 30, asphalt, 0, -0.1, 0, { cast: false });
  mapRects.push([-HALF - 15, -HALF - 15, HALF + 15, HALF + 15, '#3a3a40']);
  const dashes = canvasTex(32, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8d070'; for (let y = 0; y < h; y += 128) g.fillRect(12, y, 8, 64); });
  dashes.wrapT = THREE.RepeatWrapping; dashes.repeat.y = L / 12;
  const lineMat = new THREE.MeshBasicMaterial({ map: dashes, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const c of [-100, -50, 0, 50, 100]) { K.plane(0.25, L, lineMat, c, 0.012, 0, 0, -Math.PI / 2); K.plane(0.25, L, lineMat, 0, 0.012, c, Math.PI / 2, -Math.PI / 2); }

  // materials for the blocks
  const walkMat = S.surface('concreteFloor', 9, 9, R ? 0xb8b2a8 : 0x8a8690);
  const skins = [S.surface('brick', 6, 8), S.surface('plaster', 6, 8, R ? 0xd8cbb0 : 0xc8b8d8), S.surface('blockWall', 6, 8, R ? 0xb8b0a4 : 0x8a8494), S.surface('concreteFloor', 6, 8, R ? 0x9a948c : 0x6b6670), S.surface('brick', 6, 8, 0xc8a890)];
  const wt = windowTextures();
  const winMat = new THREE.MeshStandardMaterial({ map: wt.map, transparent: true, roughness: 0.18, metalness: 0.35, emissiveMap: wt.glow, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -1 });
  const neonSigns = [];

  const shop = (x, z, nx, nz, len) => { // a shopfront on a street-facing wall: lit interior, breakable window, neon sign
    const ry = Math.atan2(nx, nz), col = pick(['#ffc531', '#ff4f9a', '#2fd1c0', '#b06aff', '#ff7a2a', '#6ab8ff', '#7aff6a']);
    const name = pick(['DELI', 'PAWN', 'DINER', 'ARCADE', 'PIZZA', 'LAUNDRY', 'NOODLES', 'BARBER', 'HARDWARE', 'TATTOO', 'DONUTS', 'PHONES', 'LIQUOR', 'BOOKS']);
    const inside = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#3a2c20'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.globalAlpha = 0.22; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      for (let k = 0; k < 3; k++) { g.fillStyle = '#5a4434'; g.fillRect(10, 30 + k * 45, w - 20, 6); for (let i = 0; i < 9; i++) { g.fillStyle = pick(['#d04040', '#40a0d0', '#e0c040', '#60c070', '#e8e0d0']); g.fillRect(16 + i * 26, 12 + k * 45, 16, 18); } } });
    const w = Math.min(4, len - 1.5);
    K.decal(inside, w, 2, x + nx * 0.015, WALK + 1.3, z + nz * 0.015, ry);
    K.fixed('window', x + nx * 0.1, WALK + 1.3, z + nz * 0.1, ry, { w, h: 2 });
    const sign = canvasTex(512, 128, (g, cw, ch) => { g.clearRect(0, 0, cw, ch); g.font = '80px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = col; g.shadowBlur = 22; g.fillStyle = col; g.fillText(name, cw / 2, ch / 2); g.fillText(name, cw / 2, ch / 2); });
    const neon = K.decal(sign, w * 0.9, w * 0.22, x + nx * 0.03, WALK + 2.75, z + nz * 0.03, ry); neonSigns.push(neon);
    merge.push(K.box(w + 0.6, 0.1, 0.9, S.mat('paint', new THREE.Color(col).getHex()), x + nx * 0.45, WALK + 2.45, z + nz * 0.45, { ry, phys: false })); // awning
  };
  const building = (x, z, w, d, h, cx, cz, shops = true) => {
    const skin = pick(skins);
    merge.push(K.box(w, h, d, skin, x, WALK + h / 2, z, { cast: true }));
    K.obstacles.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
    mapRects.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, '#6a6470']);
    const up = h - 4.2; // window bands above the ground floor
    if (up > 2) for (const [nx, nz, fw] of [[1, 0, d], [-1, 0, d], [0, 1, w], [0, -1, w]]) {
      const f = facade(fw - 0.6, up, winMat); f.position.set(x + nx * (w / 2 + 0.02), WALK + 4 + up / 2, z + nz * (d / 2 + 0.02)); f.rotation.y = Math.atan2(nx, nz); f.receiveShadow = true; scene.add(f); merge.push(f);
    }
    merge.push(K.box(w + 0.3, 0.4, d + 0.3, S.mat('stone', 0x8a8580), x, WALK + h + 0.2, z, { phys: false })); // roof parapet
    if (shops) { const nx = Math.sign(x - cx) || 1, nz = Math.sign(z - cz) || 1;
      if (Math.abs(x - cx) > Math.abs(z - cz)) shop(x + nx * w / 2, z, nx, 0, d); else shop(x, z + nz * d / 2, 0, nz, w); }
  };
  const sidewalk = (cx, cz, mat = walkMat) => { merge.push(K.box(BLOCK, WALK, BLOCK, mat, cx, WALK / 2, cz, { cast: false })); mapRects.push([cx - BLOCK / 2, cz - BLOCK / 2, cx + BLOCK / 2, cz + BLOCK / 2, '#8a8690']); };
  const floorSlots = (cx, cz) => { for (const s of [-1, 1]) for (let t = -15; t <= 15; t += 7.5) { K.slots.push({ x: cx + s * 17.4, y: WALK, z: cz + t, k: 'floor' }); K.slots.push({ x: cx + t, y: WALK, z: cz + s * 17.4, k: 'floor' }); } };
  const lampPost = (x, z) => { merge.push(K.cyl(0.08, 5.4, S.mat('metal', 0x3a3e44), x, WALK + 2.7, z, { outline: false, seg: 8 })); K.obstacles.push([x - 0.15, x + 0.15, z - 0.15, z + 0.15]);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), heads.mat ||= S.mat('emissive', 0x332a1a).clone()); hd.position.set(x, WALK + 5.45, z); scene.add(hd); merge.push(hd); lampSpots.push(new THREE.Vector3(x, WALK + 5.3, z)); };

  for (const cx of CENTRES) for (const cz of CENTRES) {
    const id = `${cx},${cz}`;
    if (id === '-75,-75') { // the park: grass, trees, benches, a fountain
      sidewalk(cx, cz, S.mat('fabric', R ? 0x4a6a2e : 0x5a9a3a)); mapRects.push([cx - 17, cz - 17, cx + 17, cz + 17, '#4a8a3a']);
      for (let i = 0; i < 16; i++) { const x = cx + rand(-15, 15), z = cz + rand(-15, 15); if (Math.hypot(x - cx, z - cz) < 5) continue;
        merge.push(K.cyl(0.18, 3, S.mat('wood', 0x5a3a24), x, WALK + 1.5, z, { outline: false, seg: 8 })); const crown = new THREE.Mesh(new THREE.SphereGeometry(rand(1.6, 2.4), 12, 10), S.mat('fabric', pick([0x3f6a2a, 0x4f7a34, 0x365a22]))); crown.position.set(x, WALK + 3.8, z); crown.castShadow = true; scene.add(crown); merge.push(crown); K.obstacles.push([x - 0.3, x + 0.3, z - 0.3, z + 0.3]); }
      K.cyl(3, 0.6, S.mat('stone', 0xb0aaa2), cx, WALK + 0.3, cz); K.obstacles.push([cx - 3, cx + 3, cz - 3, cz + 3]); const water = new THREE.Mesh(new THREE.CircleGeometry(2.7, 32), S.mat('liquid', 0x6aa8c8)); water.rotation.x = -Math.PI / 2; water.position.set(cx, WALK + 0.62, cz); scene.add(water);
      for (const [x, z, ry] of [[cx - 8, cz, Math.PI / 2], [cx + 8, cz, -Math.PI / 2], [cx, cz - 8, 0], [cx, cz + 8, Math.PI]]) { K.box(2, 0.45, 0.6, S.mat('wood', 0x8a5a34), x, WALK + 0.45, z, { ry, outline: true }); K.slots.push({ x, y: WALK + 0.68, z, k: 'shelf', max: 0.35 }); }
      floorSlots(cx, cz); continue;
    }
    if (id === '25,-25') { // the gas station: canopy, pumps that explode, a little shop
      sidewalk(cx, cz); mapRects.push([cx - 12, cz - 8, cx + 12, cz + 4, '#b85a3a']);
      K.box(20, 0.6, 12, S.mat('paint', 0xe8e8e8), cx, WALK + 5.2, cz - 2, { phys: false }); K.box(20.2, 0.3, 12.2, S.mat('paint', 0xc8202a), cx, WALK + 4.8, cz - 2, { phys: false });
      for (const x of [-8, 8]) for (const z of [-6, 2]) { K.box(0.4, 5, 0.4, S.mat('paint', 0xe8e8e8), cx + x, WALK + 2.5, cz + z); K.obstacles.push([cx + x - 0.3, cx + x + 0.3, cz + z - 0.3, cz + z + 0.3]); }
      for (const x of [-4.5, 0, 4.5]) { K.fixed('pump', cx + x, WALK + 0.9, cz - 2, 0); K.obstacles.push([cx + x - 0.5, cx + x + 0.5, cz - 2.4, cz - 1.6]); }
      building(cx, cz + 11, 16, 8, 4.6, cx, cz, false); shop(cx, cz + 7, 0, -1, 16);
      for (let k = 0; k < 4; k++) K.slots.push({ x: cx - 6 + k * 4, y: WALK, z: cz + 5.5, k: 'floor' });
      floorSlots(cx, cz); continue;
    }
    if (id === '75,25') { // parking lot full of cars
      K.box(BLOCK, 0.05, BLOCK, S.surface('asphalt', 10, 10, 0x8a8a90), cx, 0.025, cz, { cast: false }); mapRects.push([cx - 19, cz - 19, cx + 19, cz + 19, '#4a4a52']);
      const lines = canvasTex(64, 64, g => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, 3, 64); }); lines.wrapS = THREE.RepeatWrapping; lines.repeat.x = 12;
      for (const z of [-9, 9]) K.plane(36, 5.4, new THREE.MeshBasicMaterial({ map: lines, transparent: true, depthWrite: false }), cx, 0.06, cz + z, 0, -Math.PI / 2);
      for (let i = 0; i < 5; i++) { cars.push([cx - 12 + i * 6, cz - 9, 0]); if (i % 2 === 0) cars.push([cx - 12 + i * 6, cz + 9, Math.PI]); }
      lampPost(cx, cz); continue;
    }
    if (id === '-25,75') { // construction site: fence, scaffolding, a crane, piles of blocks
      sidewalk(cx, cz, S.surface('concreteFloor', 9, 9, 0x8a7a60)); mapRects.push([cx - 17, cz - 17, cx + 17, cz + 17, '#8a7a5a']);
      const fence = S.mat('metal', 0x8a9098);
      for (const [x, z, w, d] of [[cx, cz - 16, 32, 0.1], [cx, cz + 16, 32, 0.1], [cx - 16, cz, 0.1, 32], [cx + 16, cz + 6, 0.1, 20]]) K.box(w, 2.2, d, fence, x, WALK + 1.1, z, { cast: false });
      const steel = S.mat('paint', 0xe0a020);
      for (let lv = 0; lv < 4; lv++) { K.box(12, 0.12, 2, S.mat('wood', 0x9a7a4a), cx - 6, WALK + 2.5 + lv * 3, cz - 12, { phys: lv === 0 }); for (const x of [-12, -6, 0]) K.box(0.1, 3, 0.1, steel, cx + x, WALK + 1.5 + lv * 3, cz - 12, { phys: false }); }
      K.box(1.2, 32, 1.2, steel, cx + 9, WALK + 16, cz + 9); K.obstacles.push([cx + 8.4, cx + 9.6, cz + 8.4, cz + 9.6]); K.box(26, 1, 1, steel, cx + 1, WALK + 31.5, cz + 9, { phys: false });
      for (let k = 0; k < 10; k++) K.slots.push({ x: cx + rand(-12, 12), y: WALK, z: cz + rand(-8, 12), k: 'floor' });
      floorSlots(cx, cz); continue;
    }
    // an ordinary block: four buildings around a courtyard, shops on the street side
    sidewalk(cx, cz);
    const lots = [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]];
    for (const [dx, dz] of lots) building(cx + dx, cz + dz, rand(13, 15.5), rand(13, 15.5), Math.round(rand(3, 10)) * 3.2 + 1, cx, cz);
    floorSlots(cx, cz);
  }
  // street lights along the inner streets, plus hydrants, booths, vending machines and bins on the corners
  for (const c of [-50, 0, 50]) [-85, -65, -35, -15, 15, 35, 65, 85].forEach((t, i) => { const s = i % 2 ? 1 : -1; lampPost(c + s * 6.6, t); lampPost(t, c - s * 6.6); });
  for (const cx of CENTRES) for (const cz of CENTRES) {
    const corner = [[1, 1], [1, -1], [-1, 1], [-1, -1]][Math.floor(Math.random() * 4)];
    K.fixed('hydrant', cx + corner[0] * 17.6, WALK + 0.4, cz + corner[1] * 12, 0);
    if (Math.random() < 0.35) { const x = cx - corner[0] * 17.2, z = cz + corner[1] * 6; K.fixed('booth', x, WALK + 1.15, z, Math.PI / 2); K.obstacles.push([x - 0.5, x + 0.5, z - 0.5, z + 0.5]); }
    if (Math.random() < 0.4) { const x = cx + corner[0] * 6, z = cz - corner[1] * 17.3; K.fixed('vending', x, WALK + 0.95, z, corner[1] > 0 ? 0 : Math.PI); K.obstacles.push([x - 0.5, x + 0.5, z - 0.45, z + 0.45]); }
  }
  // parked cars along the curbs
  for (const c of [-50, 0, 50]) for (const t of [-80, -32, 18, 66]) { if (Math.random() < 0.7) cars.push([c - 4, t + rand(-4, 4), 0]); if (Math.random() < 0.5) cars.push([t + rand(-4, 4), c + 4, Math.PI / 2]); }
  // traffic lights at the nine inner crossings: north-south and east-west take turns
  const lamp = c => new THREE.MeshBasicMaterial({ color: c }), SIG = { ns: { r: lamp(0x330000), y: lamp(0x332200), g: lamp(0x003310) }, ew: { r: lamp(0x330000), y: lamp(0x332200), g: lamp(0x003310) } };
  const signals = { t: 0, state(axis) { const p = this.t % 20, ns = p < 8 ? 'green' : p < 10 ? 'yellow' : 'red', ew = p >= 10 && p < 18 ? 'green' : p >= 18 ? 'yellow' : 'red'; return axis === 'ns' ? ns : ew; } };
  const pole = S.mat('metal', 0x2a2e34), boxM = S.mat('plastic', 0x1a1a1e), bulb = new THREE.SphereGeometry(0.11, 10, 8);
  for (const x of [-50, 0, 50]) for (const z of [-50, 0, 50]) for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    const px = x + sx * 6.8, pz = z + sz * 6.8; merge.push(K.cyl(0.07, 4, pole, px, WALK + 2, pz, { outline: false, seg: 8 })); K.obstacles.push([px - 0.15, px + 0.15, pz - 0.15, pz + 0.15]);
    for (const [axis, ry] of [['ns', sz > 0 ? 0 : Math.PI], ['ew', sx > 0 ? Math.PI / 2 : -Math.PI / 2]]) {
      const g = new THREE.Group(); g.position.set(px, WALK + 3.6, pz); g.rotation.y = ry; scene.add(g);
      const hous = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.22), boxM); g.add(hous); merge.push(hous);
      ['r', 'y', 'g'].forEach((c, i) => { const b = new THREE.Mesh(bulb, SIG[axis][c]); b.position.set(0, 0.28 - i * 0.28, 0.12); g.add(b); merge.push(b); });
    }
  }
  K.updates.push((t, dt = 0.016) => { signals.t += dt; for (const axis of ['ns', 'ew']) { const st = signals.state(axis), M = SIG[axis];
    M.r.color.setHex(st === 'red' ? 0xff2a2a : 0x330000); M.y.color.setHex(st === 'yellow' ? 0xffc020 : 0x332200); M.g.color.setHex(st === 'green' ? 0x2aff6a : 0x003310); } });
  // the waterfront along the south edge, skyline everywhere else
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), R ? new THREE.MeshStandardMaterial({ color: 0x2a5a78, roughness: 0.08, metalness: 0.4 }) : S.mat('plastic', 0x3a7aa0));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.8, HALF + 160); scene.add(sea); mapRects.push([-HALF - 15, HALF + 8, HALF + 15, HALF + 15, '#3a7aa0']);
  K.box(L, 1, 0.3, S.mat('metal', 0x5a6068), 0, 0.5, HALF + 1.5, { phys: false });
  const skyline = canvasTex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h);
    for (let x = 0; x < w;) { const bw = 30 + Math.random() * 90, bh = 40 + Math.random() * 200; g.fillStyle = '#20242e'; g.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 6; yy < h - 6; yy += 10) for (let xx = x + 4; xx < x + bw - 4; xx += 8) if (Math.random() < 0.2) { g.fillStyle = Math.random() < 0.6 ? '#ffd58a' : '#a8d0ff'; g.fillRect(xx, yy, 3, 5); } x += bw + 3; } });
  for (const [x, z, ry] of [[0, -360, 0], [-360, 0, Math.PI / 2], [360, 0, -Math.PI / 2], [0, 520, Math.PI]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(900, 110), new THREE.MeshBasicMaterial({ map: skyline, transparent: true, fog: false })); p.position.set(x, 50, z); p.rotation.y = ry; scene.add(p); }
  for (const [x, z, w, d] of [[0, -HALF - 1, L + 4, 1], [0, HALF + 1, L + 4, 1], [-HALF - 1, 0, 1, L + 4], [HALF + 1, 0, 1, L + 4]]) K.box(w, 6, d, S.mat('plastic', 0), x, 3, z).visible = false; // keep things in the city
  K.decal(spray('NO TRESPASSING', '#f4e6c8', 90), 6, 1.4, -25, WALK + 1.2, 75 - 16.06, Math.PI);
  K.bounds = [-HALF + 0.5, HALF - 0.5, -HALF + 0.5, HALF - 0.5];
  // draw all the static stone, glass and steel as a handful of big batches; the originals stay (hidden) for hits and decals
  const groups = new Map();
  for (const m of merge) {
    m.updateMatrixWorld(true); const k = m.material.uuid; if (!groups.has(k)) groups.set(k, { mat: m.material, geos: [], cast: false });
    const gr = groups.get(k), g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    gr.geos.push(g); gr.cast ||= m.castShadow;
    if (K.statics.includes(m)) m.visible = false; else m.removeFromParent();
  }
  for (const { mat, geos, cast } of groups.values()) { const g = mergeGeometries(geos, false); if (!g) continue; const mesh = new THREE.Mesh(g, mat); mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh); geos.forEach(x => x.dispose()); }

  // ---- sky, sun and weather (runs every frame)
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a4440, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3); sun.castShadow = !LOW; // phones skip the sun's shadow pass: it costs as much as the whole scene sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  const SH = LOW ? 22 : 32; Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 220 }); sun.shadow.bias = -0.0004; scene.add(sun, sun.target);
  let sky = null;
  if (R) { sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky); Object.assign(sky.material.uniforms, {}); sky.material.uniforms.turbidity.value = 6; sky.material.uniforms.rayleigh.value = 1.6; sky.material.uniforms.mieCoefficient.value = 0.004; sky.material.uniforms.mieDirectionalG.value = 0.8; }
  const FAR = LOW ? 170 : 340; scene.fog = new THREE.Fog(0x9ab0c8, 60, FAR);
  const pool = []; for (let i = 0; i < (LOW ? 3 : 6); i++) { const l = new THREE.PointLight(0xffd7a0, 0, 22, 1.6); scene.add(l); pool.push(l); } // street lights near you
  const rainGeo = new THREE.BufferGeometry(), N = LOW ? 900 : 2600, rp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { rp[i * 3] = rand(-25, 25); rp[i * 3 + 1] = rand(0, 22); rp[i * 3 + 2] = rand(-25, 25); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xc8d8f0, size: 0.1, transparent: true, opacity: 0.7, depthWrite: false })); rain.visible = false; rain.frustumCulled = false; scene.add(rain);
  const day = { t: 0.66, len: 420, rain: 0, rainTarget: 0, nextWeather: rand(90, 160) }; // 0.25 sunrise, 0.5 noon, 0.75 sunset; a full day takes 7 minutes
  const follow = { x: 0, z: 0 };
  const bgDay = new THREE.Color(0x9ac0e0), bgDusk = new THREE.Color(0xe08a5a), bgNight = new THREE.Color(0x070912), tmp = new THREE.Color();
  let poolT = 0;
  K.updates.push((t, dt = 0.016) => {
    day.t = (day.t + dt / day.len) % 1;
    const ang = (day.t - 0.25) * Math.PI * 2, elev = Math.sin(ang), dir = new THREE.Vector3(Math.cos(ang) * 0.8, elev, 0.45).normalize();
    const lightK = THREE.MathUtils.smoothstep(elev, -0.08, 0.25), night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.08), dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (elev > -0.15 ? 1 : 0);
    sun.position.set(follow.x + dir.x * 90, Math.max(5, dir.y * 90), follow.z + dir.z * 90); sun.target.position.set(follow.x, 0, follow.z);
    sun.intensity = (R ? 3.2 : 1.05) * lightK * (1 - day.rain * 0.6); sun.color.setRGB(1, 0.82 + 0.18 * (1 - dusk), 0.62 + 0.38 * (1 - dusk));
    hemi.intensity = (R ? 0.25 : 0.4) + (R ? 0.55 : 0.4) * lightK; hemi.color.setRGB(0.55 + 0.45 * lightK, 0.6 + 0.4 * lightK, 0.75 + 0.25 * lightK);
    if (sky) { sky.material.uniforms.sunPosition.value.copy(dir); sky.material.uniforms.rayleigh.value = 1.6 + day.rain * 2; scene.background = null; }
    else { tmp.copy(bgNight).lerp(bgDay, lightK).lerp(bgDusk, dusk * 0.6); scene.background = tmp.clone(); }
    scene.fog.color.copy(tmp.copy(bgNight).lerp(bgDay, lightK).lerp(bgDusk, dusk * 0.5)).lerp(new THREE.Color(0x707884), day.rain * 0.6);
    scene.fog.far = FAR - day.rain * FAR * 0.5;
    winMat.emissiveIntensity = night * 1.6; for (const n of neonSigns) n.material.opacity = 0.35 + 0.65 * night;
    heads.mat && heads.mat.color.setHex(night > 0.3 ? 0xffe6b0 : 0x332a1a);
    poolT -= dt; if (poolT <= 0) { poolT = 0.5; const near = lampSpots.map(p => [p, (p.x - follow.x) ** 2 + (p.z - follow.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, pool.length); near.forEach(([p], i) => pool[i].position.copy(p)); }
    for (const l of pool) l.intensity = night * (R ? 26 : 10);
    // weather: now and then a shower rolls through; roads go dark and shiny
    day.nextWeather -= dt; if (day.nextWeather <= 0) { day.rainTarget = day.rainTarget > 0 ? 0 : rand(0.6, 1); day.nextWeather = day.rainTarget ? rand(50, 90) : rand(120, 220); }
    day.rain += Math.sign(day.rainTarget - day.rain) * Math.min(Math.abs(day.rainTarget - day.rain), dt * 0.08);
    rain.visible = day.rain > 0.05; rain.material.opacity = 0.7 * day.rain; rain.position.set(follow.x, 0, follow.z);
    if (rain.visible) { const a = rainGeo.attributes.position; for (let i = 0; i < N; i++) { let y = a.getY(i) - dt * 18; if (y < 0) y += 22; a.setY(i, y); } a.needsUpdate = true; }
    if (R) { asphalt.roughness = 1 - day.rain * 0.75; asphalt.color.setScalar(1 - day.rain * 0.35); asphalt.envMapIntensity = S.envI * (0.7 + day.rain * 1.4); }
    else asphalt.color.setScalar(1 - day.rain * 0.3);
  });
  return { mapRects, cars, day, follow, signals, far: LOW ? 220 : 420 };
}
