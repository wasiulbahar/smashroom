// Rooms. Each scene builds itself with the current style, so every scene works in both looks.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { canvasTex } from './style.js?v=21';
import { buildCity } from './city.js?v=21';
import { loadModel, fitInto } from './models.js?v=21';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

function kit({ scene, world, S, items }) {
  const K = { slots: [], obstacles: [], updates: [], statics: [], furniture: [], lamps: [], cars: [] };
  const R = S.realistic;
  K.v = (realistic, stylized) => R ? realistic : stylized;
  K.box = (w, h, d, mat, x, y, z, o = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); mesh.rotation.set(o.rx || 0, o.ry || 0, 0);
    mesh.castShadow = o.cast ?? true; mesh.receiveShadow = true; scene.add(mesh);
    if (o.outline) S.outline(mesh, 1.02);
    if (o.phys !== false) K.statics.push(mesh);
    if (o.phys !== false) { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), position: new CANNON.Vec3(x, y, z) });
      b.quaternion.setFromEuler(o.rx || 0, o.ry || 0, 0); world.addBody(b); mesh.userData.body = b; mesh.userData.size = [w, h, d]; }
    return mesh;
  };
  // tables and shelves that can be wrecked: main.js damages them and turns their parts loose when they give out
  const furn = (name, parts, obstacle, hp) => { const f = { name, parts, obstacle, hp, maxHp: hp, dead: false }; parts.forEach(m => { m.userData.furn = f; }); K.furniture.push(f); return f; };
  K.cyl = (r, h, mat, x, y, z, o = {}) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(o.rt ?? r, r, h, o.seg || 20), mat); mesh.position.set(x, y, z); mesh.rotation.set(o.rx || 0, 0, o.rz || 0);
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); if (o.outline !== false) S.outline(mesh, 1.03); if (o.phys !== false) K.statics.push(mesh);
    if (o.phys !== false) { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(o.rt ?? r, r, h, 12), position: new CANNON.Vec3(x, y, z) }); b.quaternion.setFromEuler(o.rx || 0, 0, o.rz || 0); world.addBody(b); }
    return mesh;
  };
  K.plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); m.receiveShadow = true; scene.add(m); return m; };
  K.decal = (tex, w, h, x, y, z, ry = 0, opacity = 1) => K.plane(w, h, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), x, y, z, ry);
  // floor, four walls, ceiling. texture repeats roughly once per 2 m
  K.room = (w, d, h, floor, wall, ceil, o = {}) => {
    const t = o.t || 2, oz = o.oz || 0; // oz: the room's centre along z (rooms grow toward the front and keep their back wall)
    K.box(w, 0.2, d, S.surface(floor, w / t, d / t, o.floorTint), 0, -0.1, oz, { cast: false });
    const wm = S.surface(wall, w / t, h / t, o.wallTint), wm2 = S.surface(wall, d / t, h / t, o.wallTint);
    if (!o.noBack) K.box(w, h, 0.2, wm, 0, h / 2, oz - d / 2 - 0.1, { cast: false });
    K.box(w, h, 0.2, wm, 0, h / 2, oz + d / 2 + 0.1, { cast: false });
    K.box(0.2, h, d, wm2, -w / 2 - 0.1, h / 2, oz, { cast: false });
    K.box(0.2, h, d, wm2, w / 2 + 0.1, h / 2, oz, { cast: false });
    if (ceil) K.box(w, 0.2, d, S.surface(ceil, w / t, d / t, o.ceilTint), 0, h + 0.1, oz, { cast: false });
    K.bounds = [-w / 2 + 0.4, w / 2 - 0.4, oz - d / 2 + 0.4, oz + d / 2 - 0.4];
  };
  K.table = (cx, cz, w, d, h, top, leg, o = {}) => {
    const parts = [K.box(w, 0.08, d, top, cx, h - 0.04, cz, { outline: true })];
    if (o.solid) K.box(w - 0.06, h - 0.08, d - 0.06, leg, cx, (h - 0.08) / 2, cz);
    else for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(K.box(0.08, h - 0.08, 0.08, leg, cx + sx * (w / 2 - 0.08), (h - 0.08) / 2, cz + sz * (d / 2 - 0.08)));
    const cols = Math.max(1, Math.floor((w - 0.2) / 0.38)), rows = Math.max(1, Math.floor((d - 0.1) / 0.45));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
      K.slots.push({ x: cx - (cols - 1) * 0.19 + i * 0.38, y: h, z: cz - (rows - 1) * 0.225 + j * 0.45, k: o.k || 'table', w: Math.min(w, d) * 0.6 });
    const ob = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
    if (o.block !== false) K.obstacles.push(ob);
    if (!o.solid && h > 0.5) furn('table', parts, ob, Math.round(4 + w)); // counters and pallets stay put
    return h;
  };
  // shelf against a wall. axis 'x' = runs along x (back/front wall), 'z' = runs along z (side wall)
  K.shelf = (cx, cz, len, depth, levels, board, post, axis = 'x') => {
    const alongX = axis === 'x', W = alongX ? len : depth, D = alongX ? depth : len, top = levels[levels.length - 1] + 0.5;
    const parts = [];
    for (const s of [-1, 1]) parts.push(K.box(alongX ? 0.06 : depth, top, alongX ? depth : 0.06, post, cx + (alongX ? s * len / 2 : 0), top / 2, cz + (alongX ? 0 : s * len / 2)));
    for (const y of levels) {
      parts.push(K.box(W, 0.05, D, board, cx, y - 0.025, cz, { outline: true }));
      const n = Math.floor(len / 0.42);
      for (let i = 0; i < n; i++) { const t = -len / 2 + 0.21 + i * (len - 0.42) / Math.max(1, n - 1); K.slots.push({ x: cx + (alongX ? t : 0), y, z: cz + (alongX ? 0 : t), k: 'shelf', max: 0.4, ry: alongX ? 0 : Math.PI / 2 }); }
    }
    const ob = [cx - W / 2, cx + W / 2, cz - D / 2, cz + D / 2]; K.obstacles.push(ob);
    furn('shelf', parts, ob, 5);
  };
  K.floor = list => list.forEach(([x, z]) => K.slots.push({ x, y: 0, z, k: 'floor' }));
  K.light = (type, color, intensity, x, y, z, o = {}) => {
    let l;
    if (type === 'point') l = new THREE.PointLight(color, intensity, o.dist || 0, o.decay ?? 2);
    if (type === 'spot') { l = new THREE.SpotLight(color, intensity, o.dist || 0, o.angle || 0.8, o.pen ?? 0.6, o.decay ?? 2); l.target.position.set(...(o.target || [x, 0, z])); scene.add(l.target); }
    if (type === 'dir') { l = new THREE.DirectionalLight(color, intensity); l.target.position.set(...(o.target || [0, 0, 0])); scene.add(l.target); }
    l.position.set(x, y, z);
    if (o.shadow) { l.castShadow = true; l.shadow.bias = -0.0005; l.shadow.normalBias = 0.02;
      if (type === 'dir') { const s = o.size || 8; Object.assign(l.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 40 }); }
      else { l.shadow.camera.near = 0.3; l.shadow.camera.far = 20; } }
    scene.add(l); return l;
  };
  K.hemi = (sky, ground, i) => scene.add(new THREE.HemisphereLight(sky, ground, i));
  K.bulb = (x, y, z, color, intensity, o = {}) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(o.r || 0.06, 12, 10), S.mat('emissive', color)); b.position.set(x, y, z); scene.add(b);
    if (o.cage) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true })); c.position.copy(b.position); scene.add(c);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, o.cord || 0.6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); wire.position.set(x, y + (o.cord || 0.6) / 2 + 0.1, z); scene.add(wire); }
    const l = K.light('point', color, intensity, x, y - 0.05, z, { dist: o.dist || 9 });
    K.lamps.push({ meshes: [b], light: l, pos: b.position.clone(), r: (o.r || 0.06) + 0.1 }); // breakable
    return l;
  };
  // drifting dust in the air, realistic only
  K.dust = (n = 350, b = K.bounds, top = 3) => {
    if (!R) return;
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = rand(b[0], b[1]); p[i * 3 + 1] = rand(0.2, top); p[i * 3 + 2] = rand(b[2], b[3]); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const dot = canvasTex(32, 32, (c) => { const r = c.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 32, 32); });
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.025, map: dot, transparent: true, opacity: 0.55, depthWrite: false, color: 0xfff2dd }));
    scene.add(pts); K.updates.push(t => { pts.rotation.y = Math.sin(t * 0.05) * 0.05; pts.position.y = Math.sin(t * 0.3) * 0.05; });
  };
  K.shaft = (x, y, z, w, h, len, rx, ry, color = 0xfff1d0, op = 0.06) => {
    if (!R) return;
    const grad = canvasTex(4, 64, (c, w2, h2) => { const g = c.createLinearGradient(0, 0, 0, h2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w2, h2); });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, h), new THREE.MeshBasicMaterial({ color, map: grad, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.geometry.translate(0, -len / 2, 0); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); scene.add(m);
  };
  K.fixed = (key, x, y, z, ry = 0, o = {}) => items.add(key, x, y, z, ry, o);
  K.car = (cx, cz, color) => {
    const group = K.cars.length; K.cars.push({ x: cx, z: cz });
    K.fixed('carbody', cx, 0, cz, 0, { color, group });
    K.obstacles.push([cx - 1.05, cx + 1.05, cz - 2.3, cz + 2.3]);
    K.fixed('carglass', cx, 1.15, cz + 0.6, 0, { w: 1.56, h: 0.6, rx: -0.5, group });
    K.fixed('carglass', cx, 1.15, cz - 1.05, 0, { w: 1.56, h: 0.5, rx: 0.5, group });
    for (const s of [-1, 1]) for (const z of [0.15, -0.55]) K.fixed('carglass', cx + s * 0.84, 1.13, cz + z, Math.PI / 2, { w: 0.62, h: 0.42, group });
    for (const s of [-1, 1]) { K.fixed('carlight', cx + s * 0.62, 0.72, cz + 2.12, 0, { w: 0.34, h: 0.14, glow: true, color: 0xfff6d0, group });
      K.fixed('carlight', cx + s * 0.65, 0.72, cz - 2.12, 0, { w: 0.3, h: 0.12, glow: true, color: 0xff2a2a, group });
      K.fixed('carmirror', cx + s * 1.0, 0.95, cz + 0.55, 0, { group }); }
  };
  // realistic only: drop in a CC0 model of height h standing at (x, y, z); optionally hide the simple stand-ins it replaces
  K.model = (id, x, y, z, o = {}) => {
    if (!R) return;
    loadModel(id).then(src => {
      if (!src) return;
      const w = o.w || 1, d = o.d || 1, box = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + o.h, z + d / 2));
      scene.add(fitInto(src, box, o.mode || 'height', o.ry || 0)); (o.hide || []).forEach(m => { m.visible = false; m.children.forEach(c => c.visible = false); });
    });
  };
  return K;
}

// spray-paint style wall text
function spray(text, color, size = 120, w = 900, h = 260) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${size}px Bungee, Impact, sans-serif`;
    g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2); g.shadowBlur = 0;
    for (let i = 0; i < 12; i++) { const x = rand(w * 0.1, w * 0.9); g.fillRect(x, h / 2 + size * 0.3, 4, rand(15, 60)); }
    for (let i = 0; i < 160; i++) { g.globalAlpha = rand(0.1, 0.5); g.beginPath(); g.arc(rand(w * 0.05, w * 0.95), rand(h * 0.15, h * 0.85), rand(0.5, 2.5), 0, 7); g.fill(); }
  });
}
function dents(K, n, wallZ, y0, y1, x0, x1) {
  const t = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(20,12,8,0.7)'); r.addColorStop(0.5, 'rgba(40,25,15,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < n; i++) { const s = rand(0.15, 0.4); K.decal(t, s, s, rand(x0, x1), rand(y0, y1), wallZ, 0, 0.9); }
}
function sign(lines, bg, fg, w = 512, h = 384) {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center';
    lines.forEach(([t, s, y]) => { g.font = `${s}px Rubik, Arial, sans-serif`; g.fillText(t, w / 2, y); }); });
}

const MIXED = ['gascan', 'bottle', 'bottle', 'cup', 'wineglass', 'vase', 'plate', 'platestack', 'mug', 'bowl', 'teapot', 'pot', 'keyboard', 'monitor', 'tv', 'printer', 'laptop', 'phone', 'lamp', 'speaker', 'clock', 'frame', 'chair', 'stool', 'pan', 'jar', 'microwave'];

export const SCENES = {
  classic: {
    name: 'Classic rage room', desc: 'Dented plywood, rubber floor, cage lights and spray paint.', exposure: 1, env: 0.45,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(10, 15, 3.6, 'rubber', 'plywood', 'concreteFloor', { ceilTint: 0x555555, oz: 2.5 });
      scene.background = new THREE.Color(K.v(0x0e0c10, 0x231a33)); scene.fog = new THREE.Fog(K.v(0x0e0c10, 0x231a33), 9, 22);
      const steel = S.surface('steel', 1, 1), rust = S.surface('rust', 1, 1), wood = S.surface('wood', 1, 1);
      K.table(0, -1.6, 3.2, 1.3, 0.92, steel, rust);
      K.table(-3.4, -1.6, 1.3, 1.3, 0.75, wood, rust);
      K.table(3.3, -2.4, 1.2, 1, 0.8, steel, rust);
      K.shelf(0, -4.68, 3.7, 0.55, [1.25, 2.05], rust, rust, 'x');
      const dr1 = K.cyl(0.32, 1, rust, 3.6, 0.5, 1.6); K.obstacles.push([3.2, 4, 1.2, 2]); K.slots.push({ x: 3.6, y: 1, z: 1.6, k: 'shelf', max: 0.35 });
      const dr2 = K.cyl(0.32, 1, rust, -3.9, 0.5, 2.2); K.obstacles.push([-4.3, -3.5, 1.8, 2.6]);
      K.model('Barrel_01', 3.6, 0, 1.6, { h: 1, w: 0.7, d: 0.7, hide: [dr1] }); K.model('Barrel_01', -3.9, 0, 2.2, { h: 1, w: 0.7, d: 0.7, hide: [dr2] });
      K.floor([[-3.6, 0.4], [3.4, -0.3], [-2.3, -3.7], [2.4, -3.8], [-3.8, 3.4], [1.9, 0.3], [-1.6, 0.2], [3.6, 3.4], [0.2, -3.6]]);
      K.decal(spray('SMASH', '#e8202c', 170), 4.4, 1.3, -0.3, 3, -4.88, 0);
      K.decal(spray('RAGE', '#2f9bff', 150), 3.2, 1, -4.88, 2.5, 0.8, Math.PI / 2);
      K.decal(spray('NO REGRETS', '#ffc531', 90), 3.4, 0.9, 4.88, 2.3, -0.5, -Math.PI / 2);
      if (S.realistic) dents(K, 26, -4.89, 0.4, 2.8, -4.5, 4.5);
      const stripe = canvasTex(512, 32, (g, w, h) => { g.fillStyle = '#ffc531'; g.fillRect(0, 0, w, h); g.fillStyle = '#140d1f'; for (let x = -h; x < w; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
      stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.x = 4;
      for (const [x, z, ry, w] of [[0, -4.99, 0, 10], [0, 9.99, Math.PI, 10], [-4.99, 2.5, Math.PI / 2, 15], [4.99, 2.5, -Math.PI / 2, 15]]) K.decal(stripe, w, 0.25, x, 0.14, z, ry);
      // the front half: more tables and racks to clear
      K.table(-2.6, 5.4, 2.2, 1.1, 0.85, wood, rust); K.table(2.8, 6.6, 1.6, 1.2, 0.9, steel, rust);
      K.shelf(-4.68, 6.6, 3.4, 0.55, [1.15, 1.95], rust, rust, 'z'); K.shelf(4.68, 5.6, 3.4, 0.55, [1.15, 1.95], rust, rust, 'z');
      for (const x of [-2.4, 2.4]) K.bulb(x, 3.0, 5.8, 0xffd9a0, K.v(12, 5), { cage: true, cord: 0.5 });
      K.light('point', 0xffe0c0, K.v(10, 5), 0, 3.2, 7.5, { dist: 12 });
      K.floor([[0, 4.2], [-0.8, 7.8], [1.4, 8.8], [-3.4, 9], [3.4, 9], [0.6, 3.6]]);
      K.decal(spray('BREAK IT', '#2fd1c0', 130), 3.6, 1.1, 0, 2.6, 9.88, Math.PI);
      K.hemi(0xffe2c0, 0x2a2030, K.v(0.25, 0.9));
      K.light('spot', 0xfff0dc, K.v(70, 25), 0, 3.5, 0.2, { target: [0, 0.8, -1.8], angle: 0.95, pen: 0.7, shadow: true });
      for (const x of [-2.8, 0, 2.8]) K.bulb(x, 3.0, -1.8, 0xffd9a0, K.v(14, 5), { cage: true, cord: 0.5 });
      if (!S.realistic) K.light('point', 0xff4f9a, 6, 0, 3.2, -4.4, { decay: 1.5, dist: 9 });
      K.dust(300, K.bounds, 3.4);
      return { ...K, pool: MIXED, start: { x: 0, z: 2.6 }, photoSpots: [[-1.2, -3.3, 0], [1.5, -3.3, 0]] };
    },
  },
  abandoned: {
    name: 'Abandoned building', desc: 'Cracked concrete, broken windows, rubble and daylight.', exposure: 1.15, env: 0.35,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(11, 16, 3.8, 'concreteFloor', 'blockWall', 'concreteFloor', { noBack: true, ceilTint: 0x777777, oz: 2.5 });
      scene.background = new THREE.Color(K.v(0x9bb3c4, 0x3a3550)); scene.fog = new THREE.Fog(K.v(0x8a96a0, 0x3a3550), 8, 26);
      const wall = S.surface('blockWall', 2, 1), z = -5.6;
      K.box(11.4, 1.1, 0.25, wall, 0, 0.55, z); K.box(11.4, 1.4, 0.25, wall, 0, 3.1, z);
      for (const [x0, x1] of [[-5.7, -3.3], [-1.7, 1.7], [3.3, 5.7]]) K.box(x1 - x0, 1.3, 0.25, wall, (x0 + x1) / 2, 1.75, z);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshBasicMaterial({ color: K.v(0xdfeaf2, 0x7fb2e6) })); sky.position.set(0, 4, -12); scene.add(sky);
      for (const x of [-2.5, 2.5]) { K.fixed('window', x, 1.75, z + 0.05, 0, { w: 1.55, h: 0.6 }); if (x < 0) K.fixed('window', x, 1.12, z + 0.05, 0, { w: 1.55, h: 0.6 }); }
      K.hemi(0xcfe0ff, 0x4a4440, K.v(0.6, 1));
      K.light('dir', 0xfff1d6, K.v(4, 1.4), 2, 7, -14, { target: [0, 0, 0], shadow: true, size: 9 });
      K.light('point', 0xbfd4ff, K.v(10, 4), 0, 2.5, 2, { dist: 12 });
      for (const x of [-2.5, 2.5]) K.shaft(x, 2.4, z + 0.15, 1.5, 0.05, 5, -0.75, 0, 0xfff1d0, 0.07);
      const conc = S.surface('concreteFloor', 1, 2), rust = S.surface('rust', 1, 1);
      K.box(0.6, 3.8, 0.6, conc, -2.8, 1.9, 1.2); K.obstacles.push([-3.1, -2.5, 0.9, 1.5]);
      K.box(0.6, 1.6, 0.6, conc, 3, 0.8, 0.8); K.obstacles.push([2.7, 3.3, 0.5, 1.1]);
      for (let i = 0; i < 6; i++) K.cyl(0.015, rand(0.6, 1.2), rust, 3 + rand(-0.2, 0.2), 1.6 + rand(0.1, 0.5), 0.8 + rand(-0.2, 0.2), { phys: false, outline: false, rz: rand(-0.4, 0.4) });
      const rub = S.mat('stone', 0x8a8580);
      for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.08, 0.3), 0), rub); r.position.set(rand(-5, 5), 0.05, pick([rand(-5, -3.8), rand(3, 5)])); r.rotation.set(rand(0, 3), rand(0, 3), 0); r.castShadow = r.receiveShadow = true; scene.add(r); }
      const wood = S.surface('wood', 1, 1);
      K.table(0, -2.2, 2.6, 1, 0.8, wood, rust);
      K.table(-3.8, -1.6, 1.2, 1.2, 0.15, wood, wood, { solid: true });
      K.table(3.9, -2.6, 1.2, 1.2, 0.15, wood, wood, { solid: true });
      K.table(3.8, 3.2, 1.4, 1, 0.75, wood, rust);
      K.table(-2.4, 6.6, 2.2, 1, 0.8, wood, rust); K.table(2.6, 8, 1.4, 1, 0.75, wood, rust);
      K.shelf(5.2, 6.2, 3, 0.5, [1, 1.8], rust, rust, 'z');
      K.box(0.6, 3.8, 0.6, conc, -3, 1.9, 8.6); K.obstacles.push([-3.3, -2.7, 8.3, 8.9]);
      K.light('point', 0xbfd4ff, K.v(9, 4), 0, 2.6, 7, { dist: 12 });
      K.floor([[0, 5], [-4.5, 6], [0.8, 9.6], [-1.4, 9.4], [3.6, 9.6], [-4.4, 9.4]]);
      K.floor([[-1.5, 0.3], [1.5, 0], [-4, 1.5], [4.2, -0.5], [0.5, -4.4], [-4, 3.8], [1, 3.6], [-1.2, -4.3]]);
      for (const [x, z, ry] of [[-4.6, -4.4, 0.3], [-4.0, -4.6, -0.2], [4.6, 1.8, 0.5]]) { const b = K.box(0.5, 0.4, 0.4, S.mat('wood', 0xb08a5a), x, 0.2, z, { ry, outline: true }); K.model('cardboard_box_01', x, 0, z, { h: 0.4, w: 0.55, d: 0.45, ry, mode: 'inside', hide: [b] }); }
      K.decal(spray('KEEP OUT', '#d8d0c0', 110), 3.6, 1, 0, 2.9, 10.39, Math.PI);
      K.decal(spray('X', '#e8202c', 160, 300, 260), 1, 0.9, -5.39, 1.6, -2, Math.PI / 2);
      K.decal(spray('WHO WAS HERE', '#2f9bff', 80), 3, 0.8, 5.39, 1.5, 1.5, -Math.PI / 2);
      K.dust(600, K.bounds, 3.6);
      return { ...K, pool: ['gascan', 'bottle', 'bottle', 'jar', 'crt', 'tv', 'monitor', 'cinder', 'cinder', 'chair', 'stool', 'vase', 'pot', 'flowerpot', 'lamp', 'speaker', 'crate', 'microwave'], start: { x: 0, z: 2.8 }, amb: 'abandoned', photoSpots: [[-1.5, -4.2, 0], [1.6, -4.2, 0]] };
    },
  },
  haunted: {
    name: 'Haunted house', desc: 'Peeling wallpaper, candlelight, creepy china and portraits.', exposure: 0.95, env: 0.2,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(9, 13, 3.4, 'oldWood', 'wallpaper', 'oldWood', { wallTint: K.v(0xb0a0a8, undefined), ceilTint: 0x3a2a20, oz: 2 });
      scene.background = new THREE.Color(K.v(0x07060a, 0x1a1028)); scene.fog = new THREE.FogExp2(K.v(0x0c0a12, 0x1a1028), K.v(0.09, 0.05));
      const stone = S.surface('blockWall', 1, 1, 0x9a8f88), dark = S.mat('wood', 0x3a2618), wood = S.surface('oldWood', 1, 1, 0x8a6a50);
      K.box(2.2, 1.4, 0.6, stone, 0, 0.7, -4.2); K.box(2.6, 0.12, 0.75, dark, 0, 1.46, -4.15, { outline: true }); K.box(1.1, 0.8, 0.2, S.mat('emissive', 0x140805), 0, 0.5, -3.95, { phys: false });
      K.obstacles.push([-1.3, 1.3, -4.5, -3.8]);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 8), S.mat('emissive', 0xff7a20)); fire.position.set(0, 0.35, -3.98); scene.add(fire);
      const fl = K.light('point', 0xff8a3a, K.v(18, 7), 0, 0.7, -3.6, { dist: 10 });
      for (let i = 0; i < 5; i++) K.slots.push({ x: -0.9 + i * 0.45, y: 1.52, z: -4.15, k: 'shelf', max: 0.32 });
      K.table(0, -0.8, 3, 1.2, 0.8, wood, dark);
      K.shelf(-4.2, -1, 2.6, 0.5, [0.9, 1.6, 2.3], dark, dark, 'z');
      K.table(3.9, 1.5, 1, 1.6, 0.85, wood, dark, { solid: true });
      K.fixed('mirror', 4.42, 1.8, -1.6, -Math.PI / 2, { w: 0.7, h: 1 });
      K.fixed('portrait', -4.42, 1.9, 2.4, Math.PI / 2); K.fixed('portrait', 4.42, 1.9, 1.3, -Math.PI / 2); K.fixed('portrait', -2.4, 2.2, -4.43, 0); K.fixed('portrait', 2.4, 2.2, -4.43, 0);
      K.floor([[-2.2, 1.8], [2.2, 2.6], [-3, -3.4], [1.8, 0.8], [-1.6, 3.4]]);
      // the front parlour
      K.table(-1.4, 5.8, 2.2, 1, 0.78, wood, dark); K.shelf(4.2, 5.4, 2.6, 0.5, [0.9, 1.6, 2.3], dark, dark, 'z'); K.shelf(-4.2, 6.4, 2.4, 0.5, [0.9, 1.6], dark, dark, 'z');
      K.fixed('portrait', 0, 2.2, 8.43, Math.PI); K.fixed('portrait', 2.6, 2.2, 8.43, Math.PI); K.fixed('mirror', 4.42, 1.8, 7.6, -Math.PI / 2, { w: 0.7, h: 1 });
      K.light('point', 0xffa040, K.v(5, 2.5), -1.4, 1.4, 5.8, { dist: 7 });
      K.floor([[1.4, 4.8], [-3, 7.8], [2.2, 7.8], [0.4, 7.6]]);
      const gc = K.box(0.5, 2.1, 0.4, dark, -3.95, 1.05, 3.7, { outline: true }); K.obstacles.push([-4.3, -3.6, 3.4, 4]); K.model('vintage_grandfather_clock_01', -3.95, 0, 3.7, { h: 2.1, w: 0.6, d: 0.5, ry: Math.PI / 2, mode: 'inside', hide: [gc] });
      const cb = K.box(0.55, 1.8, 1.1, dark, 4.15, 0.9, -3.2, { outline: true }); K.obstacles.push([3.8, 4.5, -3.8, -2.6]); K.model('GothicCabinet_01', 4.15, 0, -3.2, { h: 1.8, w: 0.6, d: 1.2, ry: -Math.PI / 2, mode: 'inside', hide: [cb] });
      const flames = [];
      for (const [x, y, z] of [[-1, 1.75, -4.1], [1, 1.75, -4.1], [0, 1.1, -0.8], [3.9, 1.15, 1.5]]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), S.mat('plastic', 0xf3ead8)); c.position.set(x, y - 0.12, z); scene.add(c);
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), S.mat('emissive', 0xffb347)); f.scale.y = 1.8; f.position.set(x, y - 0.01, z); scene.add(f);
        flames.push(K.light('point', 0xffa040, K.v(3.5, 1.5), x, y + 0.05, z, { dist: 5 }));
      }
      K.hemi(0x6a5a8a, 0x100808, K.v(0.22, 0.6));
      const moon = K.light('dir', 0x8fa8ff, K.v(0.6, 0.6), 6, 6, 3, { target: [0, 0, 0], shadow: true, size: 6 });
      K.fixed('window', 4.43, 1.9, 3, -Math.PI / 2, { w: 1, h: 1.2 });
      K.updates.push((t) => {
        fl.intensity = K.v(18, 7) * (0.75 + Math.sin(t * 13) * 0.08 + Math.random() * 0.17); fire.scale.y = 0.9 + Math.random() * 0.3;
        flames.forEach((l, i) => l.intensity = K.v(3.5, 1.5) * (0.8 + Math.sin(t * (9 + i)) * 0.1 + Math.random() * 0.1));
        moon.intensity = Math.random() < 0.0025 ? K.v(9, 4) : Math.max(K.v(0.6, 0.6), moon.intensity * 0.85);
      });
      K.dust(250, K.bounds, 3.2);
      return { ...K, pool: ['gascan', 'plate', 'platestack', 'teapot', 'cup', 'wineglass', 'bowl', 'jug', 'vase', 'doll', 'doll', 'candlestick', 'clock', 'frame', 'lamp', 'chair', 'stool', 'jar'], start: { x: 0, z: 3 }, amb: 'haunted', photoSpots: [[-2.8, 0.2, 0.4], [2.6, -2.4, -0.4]] };
    },
  },
  office: {
    name: 'Corporate office', desc: 'Cubicles, buzzing lights, monitors and printers.', exposure: 1, env: 0.55,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(12, 15, 3, 'carpet', 'plaster', null, { oz: 2.5 });
      scene.background = new THREE.Color(K.v(0x202428, 0x2a3040)); scene.fog = new THREE.Fog(K.v(0x202428, 0x2a3040), 12, 26);
      const tiles = canvasTex(256, 256, (g) => { g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#b8b4ac'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256); for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } });
      tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(10, 12);
      K.box(12, 0.1, 15, S.realistic ? new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9 }) : S.mat('plastic', 0xe8e6e0), 0, 3.05, 2.5, { cast: false });
      const panels = [];
      for (const x of [-3.5, 0, 3.5]) for (const z of [-2.5, 1.5, 5.5]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), S.mat('emissive', 0xf4f8ff)); p.rotation.x = Math.PI / 2; p.position.set(x, 2.99, z); scene.add(p); panels.push(p);
        K.lamps.push({ meshes: [p], light: K.light('point', 0xe8f0ff, K.v(7, 3), x, 2.7, z, { dist: 8 }), pos: p.position.clone(), r: 0.6 });
      }
      K.light('spot', 0xf4f8ff, K.v(32, 18), 0, 2.95, 0, { target: [0, 0, -0.5], angle: 1.1, pen: 0.8, shadow: true });
      K.hemi(0xf0f4ff, 0x404448, K.v(0.35, 0.9));
      const desk = S.surface('wood', 1, 1, 0xd8c8b0), leg = S.surface('steel', 1, 1), fabric = S.mat('fabric', 0x5a6a80);
      for (const [cx, cz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 1.2], [2.6, 1.2], [-2.6, 5], [2.6, 5]]) {
        K.table(cx, cz, 2.2, 0.9, 0.75, desk, leg);
        K.box(2.3, 1.4, 0.06, fabric, cx, 0.7, cz - 0.5); K.box(0.06, 1.4, 1, fabric, cx + (cx < 0 ? -1.15 : 1.15), 0.7, cz);
      }
      K.table(-5.3, -3.6, 1, 0.8, 0.9, leg, leg, { solid: true });
      K.table(5.3, 3.5, 1, 1, 0.85, desk, leg);
      K.box(0.5, 1.3, 0.6, leg, 5.6, 0.65, -1); K.box(0.5, 1.3, 0.6, leg, 5.6, 0.65, -0.35); K.obstacles.push([5.3, 6, -1.4, 0]);
      K.floor([[0, -0.6], [0, 2.8], [-5, 0.4], [5, 1.4], [-4.5, 3.8], [1.2, -4.2], [-1.4, -4.3], [-5, 6.4], [5, 6.8], [0, 6.2]]);
      K.table(0, 8.2, 3, 1.2, 0.76, desk, leg); // meeting table by the front wall
      K.decal(sign([['SYNERGY', 74, 210], ['Together we achieve more meetings', 22, 270]], '#1b2a4a', '#f4f0e6'), 1.4, 1.05, -2, 1.9, -4.98, 0);
      K.decal(sign([['HANG IN THERE', 58, 320], ['Q4 is almost over', 24, 360]], '#e8dcc0', '#3a2a1a'), 1.1, 0.82, 5.98, 1.8, -2.5, -Math.PI / 2);
      const wb = canvasTex(512, 300, (g) => { g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, 512, 300); g.strokeStyle = '#2050c0'; g.lineWidth = 4; g.beginPath(); g.moveTo(40, 240); g.lineTo(140, 180); g.lineTo(240, 200); g.lineTo(340, 90); g.lineTo(460, 50); g.stroke();
        g.fillStyle = '#c03030'; g.font = '34px Rubik, Arial'; g.fillText('GROWTH!!', 300, 260); g.fillStyle = '#222'; g.font = '22px Rubik, Arial'; g.fillText('Action items: ???', 40, 50); });
      K.decal(wb, 2.4, 1.4, 2.2, 1.7, -4.98, 0);
      K.model('WetFloorSign_01', 1.2, 0, 0.6, { h: 0.62, w: 0.4, d: 0.4, ry: 0.4 });
      K.updates.push(t => { const p = panels[4]; if (p.userData.broken) return; const on = Math.sin(t * 37) > -0.9 || Math.random() > 0.3; p.visible = on; });
      return { ...K, pool: ['gascan', 'monitor', 'monitor', 'keyboard', 'keyboard', 'mug', 'mug', 'phone', 'laptop', 'printer', 'lamp', 'flowerpot', 'watercooler', 'speaker', 'frame', 'clock', 'chair', 'crt'], start: { x: 0, z: 3.6 }, amb: 'office', photoSpots: [[-0.8, -4.3, 0], [4.2, -2.6, -0.6]] };
    },
  },
  kitchen: {
    name: 'Kitchen', desc: 'Tiled walls, shelves of plates, glasses and pans.', exposure: 1, env: 0.6,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(9, 12, 3, 'tiles', 'plaster', 'plaster', { t: 1.2, wallTint: K.v(0xf2ead8, undefined), oz: 2 });
      scene.background = new THREE.Color(K.v(0x1a1814, 0x2a2238)); scene.fog = new THREE.Fog(K.v(0x1a1814, 0x2a2238), 10, 22);
      const cab = S.surface('wood', 1, 1, 0xe8e0d0), top = S.surface('steel', 1, 1), shelfWood = S.surface('wood', 1, 1);
      K.table(0, -3.65, 8.6, 0.65, 0.92, top, cab, { solid: true });
      K.shelf(-2.2, -3.8, 3.6, 0.35, [1.55, 2.1], shelfWood, shelfWood, 'x');
      K.shelf(2.2, -3.8, 3.6, 0.35, [1.55, 2.1], shelfWood, shelfWood, 'x');
      K.table(-4.15, 0, 0.65, 4.4, 0.92, top, cab, { solid: true });
      for (const z of [-0.8, -0.3]) K.cyl(0.11, 0.02, S.mat('metal', 0x222222), -4.15, 0.94, z, { phys: false, outline: false });
      K.box(0.8, 1.9, 0.75, S.mat('electronics', 0xf0f0f2), 4.05, 0.95, -3.5, { outline: true }); K.box(0.04, 0.6, 0.04, S.mat('metal', 0xb8bcc4), 3.72, 1.3, -3.1, { phys: false });
      K.obstacles.push([3.6, 4.5, -3.9, -3.1]);
      K.table(0, -0.4, 2.4, 1, 0.92, top, cab, { solid: true });
      K.table(3.6, 1.6, 1.2, 1.2, 0.75, shelfWood, shelfWood);
      for (const x of [-0.7, 0.7]) K.bulb(x, 2.1, -0.4, 0xffd9a0, K.v(4, 3), { cage: true, cord: 0.7, r: 0.06 });
      K.light('spot', 0xfff2e0, K.v(28, 18), 0, 2.95, 1, { target: [0, 0.9, -1.5], angle: 1.1, pen: 0.8, shadow: true });
      K.hemi(0xfff4e0, 0x403830, K.v(0.4, 0.9));
      K.floor([[-2, 2], [2, 2.6], [-3, 3.3], [1.4, 1.2], [2, 6.8], [-3.6, 4.4], [0, 7.3]]);
      K.table(0, 4.6, 2.4, 1, 0.92, top, cab, { solid: true }); // island
      K.table(-2.6, 6.4, 1.6, 1, 0.76, shelfWood, shelfWood);
      K.shelf(4.2, 5.2, 3, 0.35, [1.3, 1.9], shelfWood, shelfWood, 'z');
      for (const x of [-0.7, 0.7]) K.bulb(x, 2.1, 4.6, 0xffd9a0, K.v(4, 3), { cage: true, cord: 0.7, r: 0.06 });
      return { ...K, pool: ['gascan', 'plate', 'plate', 'platestack', 'bowl', 'bowl', 'mug', 'cup', 'wineglass', 'beermug', 'teapot', 'jug', 'jar', 'pan', 'saucepan', 'kettle', 'fork', 'microwave', 'fishbowl', 'vase', 'flowerpot', 'bottle'], start: { x: 0, z: 2.8 }, amb: 'kitchen', photoSpots: [[-2.4, 1, 0.3], [2.4, -1.6, -0.3]] };
    },
  },
  caryard: {
    name: 'Car yard', desc: 'Outdoors at dusk. Smash a whole car, plus junk TVs.', exposure: 1.05, env: 0.6,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      const W = 18;
      K.box(W, 0.2, W, S.surface('asphalt', 6, 6), 0, -0.1, 0, { cast: false });
      const brick = S.surface('brick', W / 2, 1.5);
      for (const [x, z, ry] of [[0, -W / 2, 0], [0, W / 2, 0], [-W / 2, 0, Math.PI / 2], [W / 2, 0, Math.PI / 2]]) K.box(W, 3, 0.3, brick, x, 1.5, z, { ry, cast: false });
      K.bounds = [-W / 2 + 0.5, W / 2 - 0.5, -W / 2 + 0.5, W / 2 - 0.5];
      const sky = canvasTex(4, 256, (g, w, h) => { const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#1d2a4a'); s.addColorStop(0.55, '#c86a4a'); s.addColorStop(1, '#f2b06a'); g.fillStyle = s; g.fillRect(0, 0, w, h); });
      scene.background = sky; scene.fog = new THREE.Fog(K.v(0xa06a58, 0x5a4060), 14, 40);
      K.hemi(0xffc8a0, 0x302830, K.v(0.7, 1));
      K.light('dir', 0xffb070, K.v(3.5, 1.4), -10, 6, -6, { target: [0, 0, 0], shadow: true, size: 10 });
      for (const [x, z] of [[-7, 7], [7, -7]]) { K.cyl(0.08, 5, S.mat('metal', 0x555555), x, 2.5, z); K.bulb(x * 0.95, 5, z * 0.95, 0xfff2d0, K.v(40, 12), { r: 0.15, dist: 20 }); }
      const colors = [0xb3202a, 0x2a5ab3, 0x2a8a4a, 0xd9a22a].sort(() => Math.random() - 0.5);
      K.car(0, -2, colors[0]); K.car(-3.2, 4.4, colors[1]);
      const rust = S.surface('rust', 1, 1), wood = S.surface('wood', 1, 1);
      for (const [x, z] of [[-6, -6], [-5.2, -6.2], [-6.3, -5.1]]) for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.13, 10, 20), S.mat('plastic', 0x151518)); t.rotation.x = Math.PI / 2; t.position.set(x, 0.13 + i * 0.25, z); t.castShadow = true; scene.add(t);
        K.model('old_tyre', x, i * 0.25, z, { h: 0.26, w: 0.92, d: 0.92, mode: 'inside', ry: Math.random() * 3, hide: [t] }); }
      K.obstacles.push([-6.8, -4.7, -6.7, -4.6]);
      for (const [x, z] of [[6.5, 2], [6.5, 2.8], [5.8, 2.4]]) { const b = K.cyl(0.3, 0.95, rust, x, 0.475, z); K.model('Barrel_01', x, 0, z, { h: 0.95, w: 0.65, d: 0.65, hide: [b] }); }
      if (S.realistic) { K.box(2, 1.5, 4.3, S.mat('fabric', 0x555555), 6.3, 0.75, 6, { cast: false }).visible = false; K.obstacles.push([5.2, 7.4, 3.8, 8.2]); K.model('covered_car', 6.3, 0, 6, { h: 1.5, w: 2.1, d: 4.4, mode: 'inside', ry: Math.PI / 2 }); }
      K.obstacles.push([5.4, 7, 1.6, 3.2]);
      K.table(-5, 1, 1.2, 1, 0.15, wood, wood, { solid: true });
      K.table(-5, 3.5, 1.2, 1, 0.15, wood, wood, { solid: true });
      K.table(4.5, -4.5, 2, 1, 0.8, wood, rust);
      K.table(4.5, 5.6, 1.4, 1, 0.15, wood, wood, { solid: true });
      K.floor([[-2.8, 1], [2.8, 0.5], [-3, -4.5], [2.8, -5.5], [-7, -1], [7, -2], [1.4, 3.4], [2.5, 6.8], [-7, 6], [0.5, 7.6], [-6.8, 2.2], [3.6, -7.4], [-1.4, -7.6]]);
      K.decal(spray('JUNK YARD', '#f4e6c8', 110), 4, 1.1, 0, 2, -W / 2 + 0.16, 0);
      return { ...K, pool: ['gascan', 'gascan', 'tv', 'crt', 'crt', 'monitor', 'bottle', 'bottle', 'cinder', 'crate', 'speaker', 'microwave', 'chair', 'jar', 'vase', 'pot', 'lamp'], start: { x: 1.6, z: 5 }, amb: 'caryard', photoSpots: [[-3.5, -1.5, 0.4], [3.5, -1.5, -0.4]] };
    },
  },
  apartment: {
    name: 'Apartment', desc: 'A whole flat: TV wall, fridge, glass table, bathroom mirror. Walls hide water pipes.', exposure: 1, env: 0.55, pipes: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(10, 12, 2.8, 'oldWood', 'plaster', 'plaster', { t: 1.6, wallTint: K.v(0xb8ac98, 0xd8c8e8), ceilTint: K.v(0x9a9488, undefined), oz: 2 });
      scene.background = new THREE.Color(K.v(0x101420, 0x1e1a30)); scene.fog = new THREE.Fog(K.v(0x101420, 0x1e1a30), 11, 24);
      const wood = S.surface('wood', 1, 1), dark = S.mat('wood', 0x3a2a20), fab = S.mat('fabric', 0x4a5a6a), white = S.mat('plastic', 0xf0f0ee), tile = S.surface('wallTiles', 1, 1);
      // back wall: two windows onto the night, a TV on a low cabinet between them
      const night = new THREE.MeshBasicMaterial({ color: K.v(0x18243a, 0x2a3a6a) });
      for (const x of [-3, 3]) {
        K.plane(1.3, 1.1, night, x, 1.6, -3.985);
        for (const [w, h, y, dx] of [[1.42, 0.06, 2.18, 0], [1.42, 0.06, 1.02, 0], [0.06, 1.2, 1.6, -0.68], [0.06, 1.2, 1.6, 0.68], [0.04, 1.1, 1.6, 0]]) K.box(w, h, 0.06, white, x + dx, y, -3.96, { phys: false, outline: false });
        for (const dx of [-0.33, 0.33]) K.fixed('window', x + dx, 1.6, -3.95, 0, { w: 0.6, h: 1.1 });
      }
      K.table(0, -3.7, 2.2, 0.45, 0.5, dark, dark, { solid: true });
      K.fixed('tv', 0, 0.5, -3.7, 0);
      // living area: sofa facing the TV, glass coffee table
      K.box(2.2, 0.42, 0.85, fab, 0, 0.21, 0.6, { outline: true }); K.box(2.2, 0.5, 0.2, fab, 0, 0.67, 0.95, { outline: true });
      for (const s of [-1, 1]) K.box(0.2, 0.6, 0.85, fab, s * 1.2, 0.3, 0.6, { outline: true });
      K.obstacles.push([-1.3, 1.3, 0.15, 1.05]);
      K.fixed('coffeetable', 0, 0.21, -1, 0);
      // kitchen corner: fridge, counter, dining table
      K.fixed('fridge', 4.55, 0.9, -3.55, 0); K.obstacles.push([4.2, 4.9, -3.9, -3.2]);
      K.table(4.6, -1.6, 0.65, 2.4, 0.92, S.surface('steel', 1, 1), S.mat('wood', 0xe8e0d0), { solid: true });
      K.table(3, 1.8, 1.5, 0.9, 0.76, wood, dark);
      // bathroom corner: tiles, sink and mirror
      K.box(0.02, 1.4, 1.8, tile, -4.98, 1.2, 2.6, { outline: false });
      K.box(0.5, 0.18, 0.6, white, -4.7, 0.85, 2.6, { outline: true }); K.box(0.12, 0.85, 0.12, white, -4.85, 0.42, 2.6);
      K.fixed('mirror', -4.97, 1.65, 2.6, Math.PI / 2, { w: 0.6, h: 0.8 });
      K.shelf(-4.75, -1.4, 2, 0.35, [0.9, 1.45, 2], wood, dark, 'z');
      for (const [x, z] of [[-1.5, -1.5], [1.6, 2.4]]) K.bulb(x, 2.3, z, 0xffdcae, K.v(4, 3), { cage: false, cord: 0.45, r: 0.07 });
      K.light('spot', 0xffe6c8, K.v(11, 16), 0, 2.75, -0.5, { target: [0, 0.3, -2.5], angle: 1.15, pen: 0.8, shadow: true });
      K.light('point', 0xffe0c0, K.v(3, 3), 3.5, 2.2, -1.5, { dist: 7 });
      K.hemi(0xfff0e0, 0x504538, K.v(0.4, 0.9));
      K.floor([[-2.6, 1], [2.4, -0.4], [-1.8, 3.2], [1, 3.4], [-3.4, -2.6], [0, 5.6], [-1.2, 7.2], [1.8, 7.4]]);
      // bedroom at the front: bed, bedside table, desk, wardrobe
      const bedding = S.mat('fabric', 0xd8d0c4);
      K.box(1.6, 0.42, 2.1, bedding, -3.7, 0.21, 6.7, { outline: true }); K.box(1.7, 1, 0.1, dark, -3.7, 0.5, 7.8, { outline: true }); K.obstacles.push([-4.5, -2.9, 5.6, 7.9]);
      K.table(-2.4, 7.5, 0.5, 0.45, 0.55, dark, dark, { solid: true });
      K.table(3.6, 7, 1.6, 0.7, 0.75, wood, dark);
      K.box(0.6, 2, 1.4, dark, 4.65, 1, 4.6, { outline: true }); K.obstacles.push([4.3, 5, 3.9, 5.3]);
      K.bulb(0, 2.3, 6, 0xffdcae, K.v(4, 3), { cage: false, cord: 0.45, r: 0.07 });
      K.light('point', 0xffe0c0, K.v(3, 3), 0, 2.2, 6.5, { dist: 8 });
      return { ...K, pipes: true, pool: ['gascan', 'plate', 'platestack', 'mug', 'wineglass', 'bottle', 'bottle', 'vase', 'lamp', 'frame', 'clock', 'laptop', 'speaker', 'flowerpot', 'bowl', 'jar', 'teapot', 'phone', 'chair', 'stool', 'crt', 'fishbowl', 'microwave'], start: { x: 0, z: 2.9 }, amb: 'apartment', photoSpots: [[-2.4, 1, 0.3], [2.4, -1.6, -0.3]] };
    },
  },
  downtown: {
    name: 'Downtown', desc: 'A city street at night. Cars, shop windows, a phone booth and a hydrant. The more you wreck, the more heat you draw.', exposure: 1, env: 0.4, heat: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      const L = 30, X = 8; // street runs along z; shop fronts at x = +-X
      K.box(2 * X, 0.2, L, S.surface('asphalt', 4, 8), 0, -0.1, 0, { cast: false });
      const walk = S.surface('concreteFloor', 1, 8, 0xa8a49c);
      for (const s of [-1, 1]) K.box(3, 0.12, L, walk, s * (X - 1.5), 0.06, 0, { cast: false });
      const lines = canvasTex(32, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8d070'; for (let y = 0; y < h; y += 64) g.fillRect(12, y, 8, 36); });
      lines.wrapT = THREE.RepeatWrapping; lines.repeat.y = 6; K.plane(0.25, L, new THREE.MeshBasicMaterial({ map: lines, transparent: true, depthWrite: false }), 0, 0.006, 0, 0, -Math.PI / 2);
      // building fronts: brick, upper-floor windows, shop windows with lit interiors, neon signs
      const brick = S.surface('brick', L / 2, 4.5), H = 9;
      for (const s of [-1, 1]) K.box(0.3, H, L, brick, s * (X + 0.15), H / 2, 0, { cast: false });
      const upper = canvasTex(512, 256, (g, w, h) => { g.clearRect(0, 0, w, h); for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) { const lit = Math.random() < 0.35; g.fillStyle = lit ? (Math.random() < 0.5 ? '#ffd890' : '#bfe0ff') : '#141824'; g.fillRect(16 + c * 62, 16 + r * 80, 40, 56); g.strokeStyle = '#2a2420'; g.lineWidth = 4; g.strokeRect(16 + c * 62, 16 + r * 80, 40, 56); } });
      for (const s of [-1, 1]) K.decal(upper, L, 6, s * (X - 0.01), 6, 0, -s * Math.PI / 2);
      const SHOPS = [['PAWN', '#ffc531'], ['LIQUOR', '#ff4f9a'], ['DINER', '#2fd1c0'], ['ARCADE', '#b06aff'], ['PIZZA', '#ff7a2a'], ['LAUNDRY', '#6ab8ff']];
      let n = 0;
      for (const s of [-1, 1]) for (const z of [-9, 0, 9]) {
        const [name, col] = SHOPS[n++], x = s * (X - 0.02), ry = -s * Math.PI / 2;
        const inside = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#3a2c20'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.globalAlpha = 0.25; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
          for (let k = 0; k < 3; k++) { g.fillStyle = '#5a4434'; g.fillRect(10, 30 + k * 45, w - 20, 6); for (let i = 0; i < 9; i++) { g.fillStyle = ['#d04040', '#40a0d0', '#e0c040', '#60c070'][(i + k) % 4]; g.fillRect(16 + i * 26, 12 + k * 45, 16, 18); } } });
        K.decal(inside, 3, 1.8, x, 1.4, z, ry);
        K.fixed('window', s * (X - 0.12), 1.4, z, ry, { w: 3, h: 1.8 });
        K.box(3.4, 0.12, 0.12, S.mat('metal', 0x2a2a30), s * (X - 0.08), 2.36, z, { ry, phys: false });
        const sign = canvasTex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '84px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col; g.fillText(name, w / 2, h / 2); g.fillText(name, w / 2, h / 2); });
        const neon = K.decal(sign, 2.8, 0.7, s * (X - 0.03), 2.9, z, ry);
        const glow = K.light('point', new THREE.Color(col).getHex(), K.v(6, 4), s * (X - 0.8), 2.9, z, { dist: 7 });
        K.lamps.push({ meshes: [neon], light: glow, pos: neon.position.clone(), r: 1.2 });
      }
      // street lights (breakable if you throw something at them)
      for (const s of [-1, 1]) for (const z of [-9, 1, 10]) {
        const px = s * (X - 2.6), pz = z + s * 2.5;
        K.cyl(0.07, 4.6, S.mat('metal', 0x3a3e44), px, 2.3, pz); K.box(0.9, 0.06, 0.06, S.mat('metal', 0x3a3e44), px - s * 0.45, 4.55, pz, { phys: false });
        K.obstacles.push([px - 0.15, px + 0.15, pz - 0.15, pz + 0.15]);
        K.bulb(px - s * 0.85, 4.45, pz, 0xffd7a0, K.v(30, 12), { r: 0.14, dist: 14 });
      }
      // parked cars along both curbs
      const colors = [0xb3202a, 0x2a5ab3, 0x2a8a4a, 0xd9a22a, 0x8a8f96].sort(() => Math.random() - 0.5);
      K.car(-3.8, -7, colors[0]); K.car(-3.8, 5.5, colors[1]); K.car(3.8, -1.5, colors[2]); K.car(3.8, 9.5, colors[3]);
      // street furniture
      K.fixed('hydrant', 5.6, 0.52, -0.6, 0); K.fixed('hydrant', -5.6, 0.52, -3.6, 0);
      K.fixed('booth', -7, 1.27, 2, Math.PI / 2); K.obstacles.push([-7.5, -6.5, 1.5, 2.5]);
      K.fixed('vending', 7.35, 1.07, 5, -Math.PI / 2); K.obstacles.push([6.9, 7.8, 4.5, 5.5]);
      const steel = S.mat('metal', 0x5a6068); // bus shelter
      for (const z of [-13.2, -10.8]) K.box(0.08, 2.4, 0.08, steel, 6.4, 1.2, z);
      K.box(1.6, 0.08, 2.8, steel, 7, 2.4, -12, { phys: false });
      K.fixed('window', 7.6, 1.3, -12, -Math.PI / 2, { w: 2.4, h: 1.6 });
      K.box(0.4, 0.45, 2, S.mat('wood', 0x6a4a30), 7.1, 0.45, -12, { outline: true }); K.obstacles.push([6.8, 7.8, -13.2, -10.8]);
      const wood = S.surface('wood', 1, 1), rust = S.surface('rust', 1, 1);
      K.table(-6.6, 5, 0.8, 1.6, 1, wood, rust, { solid: true }); // newsstand counter
      K.table(6.3, 1.6, 0.8, 0.8, 0.75, S.surface('steel', 1, 1), rust); K.table(6.3, -4.2, 0.8, 0.8, 0.75, S.surface('steel', 1, 1), rust); // cafe tables
      for (const [x, z] of [[-6.6, -5.5], [6.6, 7.6], [-6.6, 11.5]]) { K.cyl(0.3, 0.9, S.mat('plastic', 0x2a4a2a), x, 0.45, z); K.obstacles.push([x - 0.35, x + 0.35, z - 0.35, z + 0.35]); K.slots.push({ x, y: 0.9, z, k: 'shelf', max: 0.35 }); }
      const walkSlots = [[-6.4, -10], [-6.4, -8], [6.4, -7.5], [6.4, 0], [-6.4, -12.5], [6.4, 11], [-6.4, 13], [6.4, 13.5], [6.4, -2.5], [-6.4, -0.5], [6.4, 4], [-6.4, 7.6], [-6.4, 10.4], [6.4, -9.6]];
      walkSlots.forEach(([x, z]) => K.slots.push({ x, y: 0.12, z, k: 'floor' }));
      K.floor([[0, -10], [1.5, -4], [-1.5, 2], [0.5, 7], [-1, 12], [1.8, 11.6], [-2, -12], [-1.5, -7], [1, -1], [-0.8, 4.5], [1.6, -12.5], [0, 9.5]]);
      // the ends of the street: barricades, invisible walls, a skyline far off
      const stripe = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8202a'; for (let x = -h; x < w; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
      for (const s of [-1, 1]) {
        const z = s * (L / 2 - 0.6);
        for (const x of [-4, 0, 4]) { const b = K.box(2.6, 0.35, 0.12, new THREE.MeshStandardMaterial({ map: stripe }), x, 0.9, z, { outline: true }); for (const dx of [-1.1, 1.1]) K.box(0.08, 0.9, 0.08, S.mat('metal', 0x888888), x + dx, 0.45, z, { phys: false }); }
        K.box(2 * X, 4, 0.3, S.mat('plastic', 0x000000), 0, 2, s * (L / 2 + 0.2)).visible = false;
        const sky = canvasTex(1024, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#05070f'); gr.addColorStop(1, '#2a1f3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
          for (let x = 0; x < w;) { const bw = 40 + Math.random() * 70, bh = 60 + Math.random() * 170; g.fillStyle = '#0b0d16'; g.fillRect(x, h - bh, bw, bh); for (let yy = h - bh + 8; yy < h - 6; yy += 12) for (let xx = x + 6; xx < x + bw - 6; xx += 10) if (Math.random() < 0.22) { g.fillStyle = Math.random() < 0.6 ? '#ffd58a' : '#a8d0ff'; g.fillRect(xx, yy, 4, 6); } x += bw + 4; } });
        K.plane(60, 15, new THREE.MeshBasicMaterial({ map: sky, fog: false }), 0, 7, s * 40, s > 0 ? Math.PI : 0);
      }
      K.bounds = [-X + 0.5, X - 0.5, -L / 2 + 1.2, L / 2 - 1.2];
      // cop lights at the far end: off until the heat gets high
      K.copLights = [K.light('point', 0xff1a2a, 0, -2, 2.4, -L / 2 + 1.5, { dist: 22 }), K.light('point', 0x1a4aff, 0, 2, 2.4, -L / 2 + 1.5, { dist: 22 })];
      scene.background = new THREE.Color(K.v(0x070912, 0x161230)); scene.fog = new THREE.Fog(K.v(0x0a0c18, 0x161230), 14, 34);
      K.hemi(0x8090c0, 0x201820, K.v(0.25, 0.7));
      K.light('dir', 0x9fb0ff, K.v(0.8, 0.5), -6, 14, 8, { target: [0, 0, 0], shadow: true, size: 16 });
      return { ...K, heat: true, pool: ['gascan', 'gascan', 'bottle', 'bottle', 'bottle', 'tv', 'crt', 'monitor', 'cinder', 'crate', 'speaker', 'microwave', 'chair', 'lamp', 'jar', 'vase', 'pot', 'laptop', 'mug'], start: { x: 0, z: 12 }, amb: 'city', photoSpots: [[-1.6, -10, 0.2], [1.6, -10, -0.2]] };
    },
  },
  city: {
    name: 'Open city', desc: 'Free roam a whole city: day and night, rain, a gas station, a park, a building site. Get in any parked car with E; V switches between first and third person.', exposure: 1, env: 0.5, heat: true, open: true,
    build(ctx) {
      const K = kit(ctx), c = buildCity(ctx, K, { spray });
      return { ...K, ...c, heat: true, open: true, batch: 70, cityCars: c.cars, pool: ['gascan', 'gascan', 'bottle', 'bottle', 'bottle', 'tv', 'crt', 'monitor', 'cinder', 'cinder', 'crate', 'crate', 'speaker', 'microwave', 'chair', 'stool', 'lamp', 'jar', 'vase', 'pot', 'laptop', 'mug', 'flowerpot'], start: { x: 3, z: 12 }, amb: 'city', photoSpots: [[-7, 22, 0], [7, 30, 0]] };
    },
  },
  greenhouse: {
    name: 'Greenhouse', desc: 'Calm. A sunny glasshouse of pots and panes, birdsong and a light shower on the glass. No rush.', exposure: 1.05, env: 0.6, calm: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      const W = 10, D = 12, oz = 1, H = 2.5;
      K.box(W, 0.2, D, S.surface('tiles', 4, 5, 0xd8a888), 0, -0.1, oz, { cast: false });
      const brick = S.surface('brick', W / 2, 0.4), frame = S.mat('paint', 0xf2f2ee), wood = S.surface('wood', 1, 1), rust = S.surface('rust', 1, 1);
      for (const [x, z, w, d] of [[0, oz - D / 2, W, 0.25], [0, oz + D / 2, W, 0.25], [-W / 2, oz, 0.25, D], [W / 2, oz, 0.25, D]]) K.box(w, 0.6, d, brick, x, 0.3, z, { cast: false });
      const paneH = H - 0.6, py = 0.6 + paneH / 2;
      for (const s of [-1, 1]) for (let z = oz - D / 2 + 1; z < oz + D / 2; z += 2) { K.fixed('window', s * W / 2, py, z, Math.PI / 2, { w: 1.92, h: paneH }); K.box(0.08, paneH, 0.08, frame, s * W / 2, py, z + 1, { phys: false }); }
      for (const s of [-1, 1]) for (let x = -W / 2 + 1; x < W / 2; x += 2) { K.fixed('window', x, py, oz + s * D / 2, 0, { w: 1.92, h: paneH }); K.box(0.08, paneH, 0.08, frame, x + 1, py, oz + s * D / 2, { phys: false }); }
      for (const s of [-1, 1]) { K.box(0.1, 0.1, D, frame, s * W / 2, H, oz, { phys: false }); K.box(W, 0.1, 0.1, frame, 0, H, oz + s * D / 2, { phys: false }); }
      for (const s of [-1, 1]) { K.box(0.4, 5, D + 1, frame, s * (W / 2 + 0.5), 2.5, oz).visible = false; K.box(W + 1, 5, 0.4, frame, 0, 2.5, oz + s * (D / 2 + 0.5)).visible = false; } // keep shards in
      // gable roof of glass on white rafters
      const roofGlass = S.realistic ? new THREE.MeshStandardMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.18, roughness: 0.05, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false }) : new THREE.MeshToonMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
      const slope = Math.atan2(1.4, W / 2), rl = Math.hypot(1.4, W / 2);
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(rl, D), roofGlass); r.rotation.order = 'ZXY'; r.rotation.set(-Math.PI / 2, 0, -s * slope); r.position.set(s * W / 4, H + 0.7, oz); scene.add(r); }
      K.box(0.12, 0.12, D, frame, 0, H + 1.4, oz, { phys: false });
      for (let z = oz - D / 2; z <= oz + D / 2 + 0.01; z += 2) for (const s of [-1, 1]) { const b = K.box(rl, 0.08, 0.08, frame, s * W / 4, H + 0.7, z, { phys: false }); b.rotation.z = -s * slope; }
      // the garden outside
      K.box(70, 0.1, 70, S.mat('fabric', 0x5a8a3a), 0, -0.26, 0, { cast: false, phys: false });
      for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, r = rand(11, 15); const h = new THREE.Mesh(new THREE.SphereGeometry(rand(1.2, 2.2), 10, 8), S.mat('fabric', pick([0x3f6a2a, 0x4f7a34, 0x365a22]))); h.position.set(Math.cos(a) * r, rand(0.4, 1.2), oz + Math.sin(a) * r); h.scale.y = 0.8; scene.add(h); }
      scene.background = new THREE.Color(K.v(0xa8d4f0, 0x9ad0f0)); scene.fog = new THREE.Fog(K.v(0xc8e4f0, 0xb8e0f0), 18, 50);
      // potting benches and a rack along the back
      K.table(-3.7, -2, 1.1, 3, 0.85, wood, rust); K.table(3.7, -2, 1.1, 3, 0.85, wood, rust);
      K.table(-3.7, 3.6, 1.1, 3, 0.85, wood, rust); K.table(3.7, 3.6, 1.1, 3, 0.85, wood, rust);
      K.table(0, 0.6, 3, 1.2, 0.85, wood, rust);
      K.shelf(0, oz - D / 2 + 0.45, 4.4, 0.4, [0.95, 1.6], wood, wood, 'x');
      K.hemi(0xfff6e0, 0x6a8a50, K.v(0.75, 1.1));
      K.light('dir', 0xfff0d0, K.v(4.5, 1.6), 6, 9, 4, { target: [0, 0, 0], shadow: true, size: 9 });
      K.light('point', 0xfff4e0, K.v(6, 3), 0, 2.8, 1, { dist: 12 });
      K.floor([[-1.6, -3.6], [1.8, -1], [-2, 2], [2, 5.2], [0, 4.4], [-2, 5.6], [0, -2.6]]);
      K.bounds = [-W / 2 + 0.5, W / 2 - 0.5, oz - D / 2 + 0.5, oz + D / 2 - 0.5];
      K.dust(160, K.bounds, 2.6);
      return { ...K, calm: true, pool: ['flowerpot', 'flowerpot', 'pot', 'pot', 'vase', 'vase', 'jar', 'jug', 'bowl', 'mug', 'bottle', 'plate', 'platestack', 'cup', 'wineglass', 'teapot', 'fishbowl'], start: { x: 0, z: oz + D / 2 - 1.5 }, amb: 'greenhouse', photoSpots: [[-1.4, -3.2, 0.3], [1.4, -3.2, -0.3]] };
    },
  },
  beach: {
    name: 'Beach shack', desc: 'Calm. A wooden bar open to the sea at sunset. Waves roll in while you break bottles and jars.', exposure: 1.05, env: 0.6, calm: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      const W = 10, D = 9;
      const deck = S.surface('oldWood', 4, 4, K.v(0xffe0b8, 0xd8b088)), planks = S.surface('oldWood', 3, 1.5, K.v(0xf0d0a8, 0xc89870)), wood = S.surface('wood', 1, 1), dark = S.mat('wood', 0x5a3a24);
      K.box(W, 0.2, D, deck, 0, -0.1, 0, { cast: false });
      K.box(W, 3, 0.2, planks, 0, 1.5, -D / 2 - 0.1, { cast: false });
      for (const s of [-1, 1]) K.box(0.2, 3, D, planks, s * (W / 2 + 0.1), 1.5, 0, { cast: false });
      K.box(W + 0.6, 0.14, D + 0.8, dark, 0, 3.07, 0.2, { phys: false });
      for (const x of [-W / 2 + 0.1, -1.7, 1.7, W / 2 - 0.1]) K.box(0.16, 3, 0.16, dark, x, 1.5, D / 2 - 0.1, { phys: false });
      K.box(W, 0.08, 0.08, dark, 0, 1, D / 2 - 0.05, { phys: false }); K.box(W, 0.08, 0.08, dark, 0, 0.55, D / 2 - 0.05, { phys: false }); // railing
      K.box(W, 1.6, 0.3, dark, 0, 0.8, D / 2 + 0.2).visible = false; K.box(W + 2, 6, 0.3, dark, 0, 3, D / 2 + 3).visible = false; // keep things on the deck
      // sand, sea and a sunset sky
      K.box(90, 0.1, 30, S.mat('fabric', 0xe0c08a), 0, -0.35, D / 2 + 14, { cast: false, phys: false });
      const seaTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#2a6a8a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(255,${180 + Math.random() * 60 | 0},${140 + Math.random() * 80 | 0},${Math.random() * 0.35})`; g.lineWidth = 1 + Math.random() * 2; const y = Math.random() * h, x = Math.random() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + Math.random() * 30, y + Math.random() * 2); g.stroke(); } });
      seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(12, 6);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), S.realistic ? new THREE.MeshStandardMaterial({ map: seaTex, color: 0x9ab8c8, roughness: 0.12, metalness: 0.3 }) : S.mat('plastic', 0x3a7aa0, { map: seaTex }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.32, D / 2 + 85); scene.add(sea);
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(90, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(0, -0.29, D / 2 + 25.5); scene.add(foam);
      K.updates.push(t => { seaTex.offset.set(t * 0.004, t * 0.012); foam.position.z = D / 2 + 25.5 + Math.sin(t * 0.8) * 1.4; foam.material.opacity = 0.35 + 0.25 * Math.sin(t * 0.8 + 1.2); });
      const sky = canvasTex(4, 256, (g, w, h) => { const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#2a2a5a'); s.addColorStop(0.45, '#c86a5a'); s.addColorStop(0.7, '#f2a05a'); s.addColorStop(1, '#ffd08a'); g.fillStyle = s; g.fillRect(0, 0, w, h); });
      scene.background = sky; scene.fog = new THREE.Fog(K.v(0xe8a070, 0xd890a0), 30, 140);
      const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false })); sun.position.set(-14, 3, 120); scene.add(sun);
      // the bar: counter, back shelves of bottles, two tables, string lights
      K.table(0, -3.7, 6, 0.7, 1.05, wood, dark, { solid: true });
      K.shelf(0, -4.35, 5.4, 0.3, [1.5, 2.1], wood, dark, 'x');
      K.table(-2.6, 0.6, 1.2, 1.2, 0.75, wood, dark); K.table(2.6, 1.6, 1.2, 1.2, 0.75, wood, dark);
      K.table(-4.2, 3.3, 0.8, 1.6, 0.75, wood, dark);
      for (let i = 0; i < 7; i++) K.bulb(-4.2 + i * 1.4, 2.75 - (i % 2) * 0.12, D / 2 - 0.3, 0xffcf8a, K.v(2.5, 2), { cage: false, cord: 0.15, r: 0.05, dist: 5 });
      K.hemi(0xffd8b8, 0x6a5040, K.v(1.1, 1));
      K.light('dir', 0xffb070, K.v(4.5, 1.3), -6, 4, 14, { target: [0, 0, -2], shadow: true, size: 8 });
      K.light('point', 0xffc890, K.v(16, 3), 0, 2.6, -1.5, { dist: 11 }); K.light('point', 0xffc890, K.v(9, 0), 0, 2.4, 2.4, { dist: 8 });
      K.floor([[-1, 2.6], [1.2, -1.2], [-3.6, -1.6], [3.8, -1.2], [0.4, 3.4], [3.6, 3.6]]);
      K.bounds = [-W / 2 + 0.4, W / 2 - 0.4, -D / 2 + 0.4, D / 2 - 0.5];
      return { ...K, calm: true, pool: ['bottle', 'bottle', 'bottle', 'beermug', 'wineglass', 'cup', 'jar', 'jar', 'plate', 'bowl', 'lamp', 'vase', 'flowerpot', 'fishbowl', 'chair', 'stool', 'crate', 'mug'], start: { x: 0, z: 2.8 }, amb: 'beach', photoSpots: [[-1.4, -2.8, 0.3], [1.4, -2.8, -0.3]] };
    },
  },
  museum: {
    name: 'Museum', desc: 'Priceless vases, marble busts and paintings behind glass. Break the first one and the alarm goes off.', exposure: 1, env: 0.6, museum: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(14, 18, 4.4, 'tiles', 'plaster', 'plaster', { t: 1.4, floorTint: K.v(0xf4f0e8, 0xe8e0f0), wallTint: K.v(0xe8dcc8, 0xd8cce8), ceilTint: K.v(0xd8d0c0, undefined), oz: 2 });
      scene.background = new THREE.Color(K.v(0x18161a, 0x231a33)); scene.fog = new THREE.Fog(K.v(0x18161a, 0x231a33), 16, 34);
      const marble = S.mat('stone', 0xf2eee8), brass = S.mat('metal', 0xc8a040), velvet = S.mat('fabric', 0x8a1a2a);
      for (const x of [-4, 0, 4]) for (const z of [-4, 1, 6]) {
        K.box(0.7, 1.0, 0.7, marble, x, 0.5, z, { outline: true }); K.obstacles.push([x - 0.45, x + 0.45, z - 0.45, z + 0.45]); K.slots.push({ x, y: 1.0, z, k: 'shelf', max: 0.5 });
        if (z === 1) { for (const [dx, dz, ry] of [[0, 0.36, 0], [0, -0.36, 0], [0.36, 0, Math.PI / 2], [-0.36, 0, Math.PI / 2]]) K.fixed('window', x + dx, 1.42, z + dz, ry, { w: 0.7, h: 0.84 });
          K.fixed('window', x, 1.86, z, 0, { w: 0.74, h: 0.74, rx: -Math.PI / 2 }); }
      }
      for (const z of [-6.93]) for (let x = -4.5; x <= 4.6; x += 3) K.fixed('portrait', x, 2.3, z, 0);
      for (const s of [-1, 1]) for (let z = -3.5; z <= 8.6; z += 4) K.fixed('portrait', s * 6.93, 2.3, z, -s * Math.PI / 2);
      for (const z of [-2, 3.5, 8]) for (const s of [-1, 1]) { K.cyl(0.03, 0.9, brass, s * 2, 0.45, z, { phys: false, outline: false }); }
      for (const z of [-2, 3.5, 8]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 8), velvet); rope.rotation.z = Math.PI / 2; rope.position.set(0, 0.8, z); scene.add(rope); }
      K.floor([[-6, -5.6], [6, -5.6], [-6, 9.6], [6, 9.6], [-2, -5.8], [2, -5.8]]);
      K.decal(sign([['ANCIENT', 64, 160], ['WONDERS', 64, 240], ['Please do not touch', 26, 320]], '#1a1612', '#e8d8b0'), 2.4, 1.8, 0, 3.2, -6.95, 0);
      K.hemi(0xfff4e6, 0x4a4236, K.v(0.5, 1)); K.light('spot', 0xfff0dc, K.v(40, 22), 0, 4.3, 2, { target: [0, 1, 1], angle: 1.1, pen: 0.7, shadow: true });
      for (const z of [-4, 1, 6]) K.light('point', 0xffe8c8, K.v(8, 4), 0, 3.6, z, { dist: 10 });
      return { ...K, museum: true, pool: ['vase', 'vase', 'vase', 'bust', 'bust', 'bust', 'pot', 'jug', 'plate', 'platestack', 'teapot', 'bowl', 'clock', 'lamp', 'frame'], start: { x: 0, z: 9.6 }, amb: 'museum', photoSpots: [[-3, -6.2, 0.3], [3, -6.2, -0.3]] };
    },
  },
  supermarket: {
    name: 'Supermarket', desc: 'Aisles of bottles, jars and eggs, a freezer wall and trolleys to ram into the displays.', exposure: 1, env: 0.55,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(16, 22, 4, 'tiles', 'plaster', 'plaster', { t: 1.2, floorTint: K.v(0xe8e8e4, 0xe0e0e8), wallTint: K.v(0xf0ece0, 0xd8e0e8), oz: 3 });
      scene.background = new THREE.Color(K.v(0x202428, 0x2a3040)); scene.fog = new THREE.Fog(K.v(0x202428, 0x2a3040), 18, 36);
      const board = S.mat('paint', 0xe8e8ec), post = S.mat('metal', 0x8a9098);
      for (const x of [-5.2, -1.7, 1.8, 5.3]) K.shelf(x, 0, 11, 0.55, [0.42, 0.95, 1.5], board, post, 'z');
      for (const x of [-6.2, -3.8, -1.4, 1, 3.4, 5.8]) { K.fixed('fridge', x, 0.9, -7.55, 0); K.obstacles.push([x - 0.4, x + 0.4, -7.95, -7.15]); }
      for (const x of [-4, 0, 4]) { K.table(x, 9.2, 1.8, 0.7, 0.9, S.mat('plastic', 0x2a2a30), S.mat('plastic', 0x2a2a30), { solid: true }); }
      for (const [x, z, ry] of [[-6.6, 7, 0.3], [6.6, 6, -0.4], [0, 6.5, 1.2], [-3.4, 5.6, 0.1], [3.6, 7.6, -0.2]]) K.fixed('trolley', x, 0, z, ry);
      for (const [t, x, c] of [['FRESH', -4, '#2ab04a'], ['SALE', 0, '#e8202c'], ['FROZEN', 4, '#2a8ad8']]) K.decal(sign([[t, 90, 220]], '#f8f8f4', c, 512, 320), 2.2, 1.3, x, 3.1, -7.95, 0);
      for (const z of [-4, 1, 6]) for (const x of [-3.5, 0, 3.5]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), S.mat('emissive', 0xf4f8ff)); p.rotation.x = Math.PI / 2; p.position.set(x, 3.98, z); scene.add(p); }
      K.light('spot', 0xf4f8ff, K.v(36, 20), 0, 3.9, 1, { target: [0, 0, 0], angle: 1.2, pen: 0.8, shadow: true });
      for (const z of [-4, 4]) K.light('point', 0xf0f4ff, K.v(10, 4), 0, 3.6, z, { dist: 14 });
      K.hemi(0xf0f4ff, 0x404448, K.v(0.55, 1));
      K.floor([[-3.5, 7.2], [3.5, 5.4], [-6.6, -6], [6.6, -6]]);
      return { ...K, batch: 70, pool: ['bottle', 'bottle', 'bottle', 'bottle', 'jar', 'jar', 'jar', 'eggs', 'eggs', 'eggs', 'mug', 'cup', 'wineglass', 'beermug', 'microwave', 'speaker', 'flowerpot', 'plate', 'platestack', 'kettle', 'bowl'], start: { x: -6.6, z: 10.8 }, amb: 'store', photoSpots: [[-3.4, 8, 0], [3.4, 8, 0]] };
    },
  },
  tinytown: {
    name: 'Tiny town', desc: 'You are a giant. A whole miniature city at your feet: stomp it, kick it, swing at the skyscrapers.', exposure: 1.05, env: 0.6,
    build(ctx) {
      const { scene, S, items } = ctx, K = kit(ctx), W = 14;
      K.box(W + 6, 0.2, W + 6, S.mat('fabric', K.v(0x5a8a3a, 0x6aaa4a)), 0, -0.1, 0, { cast: false });
      for (const [x, z, w, d] of [[0, -(W / 2 + 2), W + 6, 0.3], [0, W / 2 + 2, W + 6, 0.3], [-(W / 2 + 2), 0, 0.3, W + 6], [W / 2 + 2, 0, 0.3, W + 6]]) K.box(w, 2, d, S.mat('plastic', 0), x, 1, z).visible = false;
      K.bounds = [-W / 2 - 1.5, W / 2 + 1.5, -W / 2 - 1.5, W / 2 + 1.5];
      const road = S.mat('plastic', 0x3a3a40); for (const c of [-4.8, -1.6, 1.6, 4.8]) { K.plane(0.5, W, road, c, 0.004, 0, 0, -Math.PI / 2); K.plane(0.5, W, road, 0, 0.005, c, Math.PI / 2, -Math.PI / 2); }
      const sky = canvasTex(4, 256, (g, w, h) => { const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#5a9ae0'); s.addColorStop(1, '#d8ecf8'); g.fillStyle = s; g.fillRect(0, 0, w, h); });
      scene.background = sky; scene.fog = new THREE.Fog(0xc8e0f0, 14, 40);
      const spawn = () => { // a fresh town: towers downtown, houses at the edges, trees and toy cars
        for (const bx of [-6.4, -3.2, 0, 3.2, 6.4]) for (const bz of [-6.4, -3.2, 0, 3.2, 6.4]) {
          const core = Math.hypot(bx, bz) < 4;
          for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { if (Math.random() < 0.15) continue;
            const w = rand(0.32, 0.62), d = rand(0.32, 0.62), h = core ? rand(0.7, 1.9) : rand(0.2, 0.6);
            items.add('mini', bx + dx + rand(-0.08, 0.08), 0, bz + dz + rand(-0.08, 0.08), pick([0, Math.PI / 2]), { w, h, d }).body.sleep(); }
          if (!core && Math.random() < 0.6) items.add('minitree', bx + rand(-0.9, 0.9), 0, bz + rand(-0.9, 0.9), 0).body.sleep();
        }
        for (let i = 0; i < 18; i++) { const c = pick([-4.8, -1.6, 1.6, 4.8]), t = rand(-6.5, 6.5), along = Math.random() < 0.5; items.add('toycar', along ? c + 0.1 : t, 0, along ? t : c + 0.1, along ? 0 : Math.PI / 2).body.sleep(); }
      };
      spawn();
      K.hemi(0xdfeaff, 0x5a7a40, K.v(0.8, 1.1)); K.light('dir', 0xfff0d8, K.v(3.2, 1.4), 8, 12, 6, { target: [0, 0, 0], shadow: true, size: 10 });
      return { ...K, pool: [], restock: spawn, start: { x: 0, z: 8.5 }, amb: 'town', photoSpots: [] };
    },
  },
  space: {
    name: 'Space station', desc: 'Low gravity: everything drifts when it breaks. Smash a window and the air rushes out into space.', exposure: 1, env: 0.6, space: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(12, 14, 3.4, 'steel', 'steel', 'steel', { t: 1.2, wallTint: K.v(0xc8ccd4, 0x9aa4b8), ceilTint: K.v(0x8a909a, 0x7a8498), oz: 1 });
      scene.background = new THREE.Color(0x05060c); scene.fog = new THREE.Fog(0x05060c, 16, 34);
      const stars = canvasTex(1024, 512, (g, w, h) => { g.fillStyle = '#02030a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() < 0.1 ? 2 : 1, 1); }
        const gr = g.createRadialGradient(w * 0.7, h * 1.15, h * 0.4, w * 0.7, h * 1.15, h * 0.75); gr.addColorStop(0, '#2a6ac8'); gr.addColorStop(0.7, '#3a8ae0'); gr.addColorStop(0.95, '#a8d0ff'); gr.addColorStop(1, 'rgba(168,208,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(w * 0.7, h * 1.15, h * 0.75, 0, 7); g.fill(); });
      const starMat = new THREE.MeshBasicMaterial({ map: stars, fog: false });
      for (const x of [-3.5, 0, 3.5]) { K.plane(2.6, 1.4, starMat, x, 1.8, -5.985); K.fixed('window', x, 1.8, -5.93, 0, { w: 2.6, h: 1.4 }); K.box(2.8, 0.12, 0.1, S.mat('metal', 0x5a606a), x, 2.55, -5.95, { phys: false }); K.box(2.8, 0.12, 0.1, S.mat('metal', 0x5a606a), x, 1.05, -5.95, { phys: false }); }
      for (const s of [-1, 1]) { K.plane(1.6, 1.2, starMat, s * 5.985, 1.8, 2, -s * Math.PI / 2); K.fixed('window', s * 5.93, 1.8, 2, -s * Math.PI / 2, { w: 1.6, h: 1.2 }); }
      const panel = S.mat('electronics', 0x2a3040);
      K.table(0, -3, 4, 1, 0.95, panel, S.mat('metal', 0x5a606a), { solid: true }); K.table(-4, 2.5, 1.2, 3, 0.9, panel, S.mat('metal', 0x5a606a));
      K.table(4, 4.5, 1.6, 1, 0.9, panel, S.mat('metal', 0x5a606a)); K.shelf(4.7, -1.5, 3, 0.45, [0.8, 1.45, 2.1], S.mat('metal', 0x8a909a), S.mat('metal', 0x5a606a), 'z');
      for (const z of [-3, 1, 5]) { const st = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.25), S.mat('emissive', 0xd8ecff)); st.rotation.x = Math.PI / 2; st.position.set(0, 3.38, z); scene.add(st); }
      K.decal(sign([['DECK 3', 70, 150], ['Keep windows intact', 28, 230]], '#1a2030', '#d8e8ff'), 1.8, 1.1, -5.98, 2.2, -2.5, Math.PI / 2);
      K.hemi(0xd8e8ff, 0x202430, K.v(0.5, 1)); K.light('spot', 0xe8f0ff, K.v(30, 18), 0, 3.3, 1, { target: [0, 0, -1], angle: 1.15, pen: 0.8, shadow: true });
      K.light('point', 0x6a9aff, K.v(6, 3), 0, 2, -5, { dist: 10 });
      K.floor([[-2, 5.5], [2, 6.2], [-4.5, -4.2], [0.5, 2.5]]);
      return { ...K, space: true, gravity: -1.62, pool: ['monitor', 'monitor', 'laptop', 'keyboard', 'crt', 'speaker', 'phone', 'mug', 'bottle', 'lamp', 'clock', 'crate', 'jar', 'gascan'], start: { x: 0, z: 6.5 }, amb: 'space', photoSpots: [[-2, -4.4, 0.3], [2, -4.4, -0.3]] };
    },
  },
  bowling: {
    name: 'Bowling alley', desc: 'Three lanes of real pins. Roll the bowling ball for strikes, or just wreck the place.', exposure: 1, env: 0.55, bowling: true,
    build(ctx) {
      const { scene, S, items } = ctx, K = kit(ctx);
      K.room(12, 28, 3.6, 'carpet', 'plaster', 'plaster', { t: 1.6, wallTint: K.v(0x3a2a4a, 0x4a3a6a), floorTint: K.v(0x8a6a9a, undefined), oz: 2 });
      scene.background = new THREE.Color(K.v(0x100c18, 0x1a1028)); scene.fog = new THREE.Fog(K.v(0x100c18, 0x1a1028), 18, 40);
      const wood = S.surface('wood', 1, 8, K.v(0xf0d0a0, 0xe8c890)), rail = S.mat('plastic', 0x2a2a30), lanes = [];
      for (const x of [-3.2, 0, 3.2]) {
        K.box(1.1, 0.02, 20, wood, x, 0.01, -2, { cast: false });
        for (const s of [-1, 1]) K.box(0.08, 0.09, 20, rail, x + s * 0.62, 0.045, -2);
        const arrows = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(128, 64, g => { g.clearRect(0, 0, 128, 64); g.fillStyle = '#5a3a1a'; for (let i = 0; i < 5; i++) { const ax = 14 + i * 25; g.beginPath(); g.moveTo(ax, 50); g.lineTo(ax + 7, 20); g.lineTo(ax + 14, 50); g.fill(); } }), transparent: true, depthWrite: false }));
        arrows.rotation.x = -Math.PI / 2; arrows.position.set(x, 0.022, 3); scene.add(arrows);
        lanes.push({ x, pins: [], wait: 0, rolled: false });
      }
      K.box(12, 1.4, 0.4, S.mat('plastic', 0x101014), 0, 2.9, -11.4, { phys: false }); // masking unit over the pins
      K.decal(sign([['STRIKE', 80, 150]], '#101014', '#ff4f9a', 512, 256), 3, 1.2, 0, 2.95, -11.18, 0);
      K.box(12, 0.6, 1.2, S.mat('plastic', 0x15151a), 0, 0.3, -12.6); // the pit
      const rack = lane => { lane.pins.forEach(p => !p.dead && items.remove(p)); lane.pins = []; let k = 0;
        for (let row = 0; row < 4; row++) for (let c = 0; c <= row; c++) { const p = items.add('pin', lane.x + (c - row / 2) * 0.3, 0.02, -10 - row * 0.26, 0); p.body.sleep(); lane.pins.push(p); k++; } lane.rolled = false; lane.wait = 0; };
      lanes.forEach(rack);
      for (const [x, z] of [[-4.6, 9.5], [0, 10.2], [4.6, 9.5]]) K.table(x, z, 1.2, 0.8, 0.76, S.mat('plastic', 0xe8e0d0), S.mat('metal', 0x5a606a));
      K.table(-5.4, 4, 0.7, 3, 0.95, S.mat('plastic', 0x3a2a4a), S.mat('plastic', 0x3a2a4a), { solid: true });
      for (const x of [-3.2, 0, 3.2]) K.light('spot', 0xfff0dc, K.v(18, 10), x, 3.5, -8, { target: [x, 0, -10.5], angle: 0.6, pen: 0.5, shadow: x === 0 });
      K.light('point', 0xb06aff, K.v(8, 6), 0, 3.2, 6, { dist: 14 }); K.hemi(0xe0d8ff, 0x302030, K.v(0.4, 0.9));
      K.floor([[-5.4, 7], [5.4, 7], [-2, 11], [2, 11]]);
      return { ...K, bowling: true, lanes, rack, restock: () => lanes.forEach(rack), pool: ['bottle', 'bottle', 'beermug', 'cup', 'wineglass', 'mug', 'jar', 'plate', 'speaker', 'lamp'], start: { x: 0, z: 8.5 }, amb: 'bowling', photoSpots: [[-5, 1, 0.5], [5, 1, -0.5]] };
    },
  },
  studio: {
    name: 'Clay studio', desc: 'A life-size clay figure to punch, slap and kick. Dents stay, limbs come off.', exposure: 1, env: 0.5,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(9, 12, 3.2, 'oldWood', 'plaster', 'plaster', { wallTint: K.v(0xe8dfd0, 0xcfc6e0), oz: 1.5 });
      scene.background = new THREE.Color(K.v(0x15120f, 0x231a33)); scene.fog = new THREE.Fog(K.v(0x15120f, 0x231a33), 10, 22);
      const stone = S.surface('blockWall', 1, 1, 0xe0d8cc), wood = S.surface('wood', 1, 1), steel = S.surface('steel', 1, 1);
      K.box(1.1, 0.06, 1.1, stone, 0, 0.03, -1.2, { outline: true }); K.obstacles.push([-0.6, 0.6, -1.8, -0.6]);
      K.shelf(-4.2, -0.6, 3.2, 0.45, [0.9, 1.6, 2.3], wood, wood, 'z');
      K.shelf(4.2, -0.6, 3.2, 0.45, [0.9, 1.6, 2.3], wood, wood, 'z');
      K.table(0, -3.9, 3, 0.8, 0.9, wood, steel);
      K.floor([[-2.6, 1.6], [2.6, 1.6], [-2.8, -3], [2.8, -3], [-2.2, 5.6], [2.2, 5.6]]);
      K.shelf(-4.2, 5, 2.6, 0.45, [0.9, 1.6, 2.3], wood, wood, 'z'); K.shelf(4.2, 5, 2.6, 0.45, [0.9, 1.6, 2.3], wood, wood, 'z');
      K.table(0, 6.6, 2.4, 0.8, 0.9, wood, steel);
      K.decal(spray('HANDS ONLY', '#c96f3b', 110), 3.6, 1, 0, 2.5, -4.48, 0, 0.9);
      K.hemi(0xfff0e0, 0x302820, K.v(0.35, 0.9));
      K.light('spot', 0xfff2e0, K.v(28, 22), 0.8, 3.1, 0.6, { target: [0, 1.4, -1.2], angle: 0.7, pen: 0.6, shadow: true });
      for (const x of [-2.6, 2.6]) K.bulb(x, 2.7, -0.6, 0xffd9a0, K.v(8, 4), { cage: true, cord: 0.4 });
      K.dust(200, K.bounds, 3);
      return { ...K, pool: ['gascan', 'vase', 'vase', 'pot', 'bowl', 'jug', 'plate', 'platestack', 'mug', 'flowerpot', 'teapot'], start: { x: 0, z: 2.2 }, clay: { x: 0, y: 0.06, z: -1.2 }, photoSpots: [[-2.4, -3.2, 0.3], [2.4, -3.2, -0.3]] };
    },
  },
};
