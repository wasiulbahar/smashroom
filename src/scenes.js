// Rooms. Each scene builds itself with the current style, so every scene works in both looks.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { canvasTex } from './style.js?v=11';
import { loadModel, fitInto } from './models.js?v=11';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

function kit({ scene, world, S, items }) {
  const K = { slots: [], obstacles: [], updates: [], statics: [], furniture: [], lamps: [] };
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
    const t = o.t || 2;
    K.box(w, 0.2, d, S.surface(floor, w / t, d / t, o.floorTint), 0, -0.1, 0, { cast: false });
    const wm = S.surface(wall, w / t, h / t, o.wallTint), wm2 = S.surface(wall, d / t, h / t, o.wallTint);
    if (!o.noBack) K.box(w, h, 0.2, wm, 0, h / 2, -d / 2 - 0.1, { cast: false });
    K.box(w, h, 0.2, wm, 0, h / 2, d / 2 + 0.1, { cast: false });
    K.box(0.2, h, d, wm2, -w / 2 - 0.1, h / 2, 0, { cast: false });
    K.box(0.2, h, d, wm2, w / 2 + 0.1, h / 2, 0, { cast: false });
    if (ceil) K.box(w, 0.2, d, S.surface(ceil, w / t, d / t, o.ceilTint), 0, h + 0.1, 0, { cast: false });
    K.bounds = [-w / 2 + 0.4, w / 2 - 0.4, -d / 2 + 0.4, d / 2 - 0.4];
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
      K.room(10, 10, 3.6, 'rubber', 'plywood', 'concreteFloor', { ceilTint: 0x555555 });
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
      for (const [x, z, ry] of [[0, -4.99, 0], [0, 4.99, Math.PI], [-4.99, 0, Math.PI / 2], [4.99, 0, -Math.PI / 2]]) K.decal(stripe, 10, 0.25, x, 0.14, z, ry);
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
      K.room(11, 11, 3.8, 'concreteFloor', 'blockWall', 'concreteFloor', { noBack: true, ceilTint: 0x777777 });
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
      K.floor([[-1.5, 0.3], [1.5, 0], [-4, 1.5], [4.2, -0.5], [0.5, -4.4], [-4, 3.8], [1, 3.6], [-1.2, -4.3]]);
      for (const [x, z, ry] of [[-4.6, -4.4, 0.3], [-4.0, -4.6, -0.2], [4.6, 1.8, 0.5]]) { const b = K.box(0.5, 0.4, 0.4, S.mat('wood', 0xb08a5a), x, 0.2, z, { ry, outline: true }); K.model('cardboard_box_01', x, 0, z, { h: 0.4, w: 0.55, d: 0.45, ry, mode: 'inside', hide: [b] }); }
      K.decal(spray('KEEP OUT', '#d8d0c0', 110), 3.6, 1, 0, 2.9, 5.39, Math.PI);
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
      K.room(9, 9, 3.4, 'oldWood', 'wallpaper', 'oldWood', { wallTint: K.v(0xb0a0a8, undefined), ceilTint: 0x3a2a20 });
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
      K.room(12, 10, 3, 'carpet', 'plaster', null);
      scene.background = new THREE.Color(K.v(0x202428, 0x2a3040)); scene.fog = new THREE.Fog(K.v(0x202428, 0x2a3040), 12, 26);
      const tiles = canvasTex(256, 256, (g) => { g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#b8b4ac'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256); for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } });
      tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(10, 8);
      K.box(12, 0.1, 10, S.realistic ? new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9 }) : S.mat('plastic', 0xe8e6e0), 0, 3.05, 0, { cast: false });
      const panels = [];
      for (const x of [-3.5, 0, 3.5]) for (const z of [-2.5, 1.5]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), S.mat('emissive', 0xf4f8ff)); p.rotation.x = Math.PI / 2; p.position.set(x, 2.99, z); scene.add(p); panels.push(p);
        K.lamps.push({ meshes: [p], light: K.light('point', 0xe8f0ff, K.v(7, 3), x, 2.7, z, { dist: 8 }), pos: p.position.clone(), r: 0.6 });
      }
      K.light('spot', 0xf4f8ff, K.v(32, 18), 0, 2.95, 0, { target: [0, 0, -0.5], angle: 1.1, pen: 0.8, shadow: true });
      K.hemi(0xf0f4ff, 0x404448, K.v(0.35, 0.9));
      const desk = S.surface('wood', 1, 1, 0xd8c8b0), leg = S.surface('steel', 1, 1), fabric = S.mat('fabric', 0x5a6a80);
      for (const [cx, cz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 1.2], [2.6, 1.2]]) {
        K.table(cx, cz, 2.2, 0.9, 0.75, desk, leg);
        K.box(2.3, 1.4, 0.06, fabric, cx, 0.7, cz - 0.5); K.box(0.06, 1.4, 1, fabric, cx + (cx < 0 ? -1.15 : 1.15), 0.7, cz);
      }
      K.table(-5.3, -3.6, 1, 0.8, 0.9, leg, leg, { solid: true });
      K.table(5.3, 3.5, 1, 1, 0.85, desk, leg);
      K.box(0.5, 1.3, 0.6, leg, 5.6, 0.65, -1); K.box(0.5, 1.3, 0.6, leg, 5.6, 0.65, -0.35); K.obstacles.push([5.3, 6, -1.4, 0]);
      K.floor([[0, -0.6], [0, 2.8], [-5, 0.4], [5, 1.4], [-4.5, 3.8], [1.2, -4.2], [-1.4, -4.3]]);
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
      K.room(9, 8, 3, 'tiles', 'plaster', 'plaster', { t: 1.2, wallTint: K.v(0xf2ead8, undefined) });
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
      K.floor([[-2, 2], [2, 2.6], [-3, 3.3], [1.4, 1.2]]);
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
      const cx = 0, cz = -2;
      K.fixed('carbody', cx, 0, cz, 0, { color: pick([0xb3202a, 0x2a5ab3, 0x2a8a4a, 0xd9a22a]) });
      K.obstacles.push([cx - 1.05, cx + 1.05, cz - 2.3, cz + 2.3]);
      K.fixed('carglass', cx, 1.15, cz + 0.6, 0, { w: 1.56, h: 0.6, rx: -0.5 });
      K.fixed('carglass', cx, 1.15, cz - 1.05, 0, { w: 1.56, h: 0.5, rx: 0.5 });
      for (const s of [-1, 1]) for (const z of [0.15, -0.55]) K.fixed('carglass', cx + s * 0.84, 1.13, cz + z, Math.PI / 2, { w: 0.62, h: 0.42 });
      for (const s of [-1, 1]) { K.fixed('carlight', cx + s * 0.62, 0.72, cz + 2.12, 0, { w: 0.34, h: 0.14, glow: true, color: 0xfff6d0 });
        K.fixed('carlight', cx + s * 0.65, 0.72, cz - 2.12, 0, { w: 0.3, h: 0.12, glow: true, color: 0xff2a2a });
        K.fixed('carmirror', cx + s * 1.0, 0.95, cz + 0.55, 0); }
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
      K.floor([[-2.8, 1], [2.8, 0.5], [-3, -4.5], [2.8, -5.5], [-7, -1], [7, -2], [0, 4.5], [-2, 6.5], [2.5, 6.8], [-7, 6]]);
      K.decal(spray('JUNK YARD', '#f4e6c8', 110), 4, 1.1, 0, 2, -W / 2 + 0.16, 0);
      return { ...K, pool: ['gascan', 'gascan', 'tv', 'crt', 'crt', 'monitor', 'bottle', 'bottle', 'cinder', 'crate', 'speaker', 'microwave', 'chair', 'jar', 'vase', 'pot', 'lamp'], start: { x: 0, z: 5 }, amb: 'caryard', photoSpots: [[-3.5, -1.5, 0.4], [3.5, -1.5, -0.4]] };
    },
  },
  apartment: {
    name: 'Apartment', desc: 'A whole flat: TV wall, fridge, glass table, bathroom mirror. Walls hide water pipes.', exposure: 1, env: 0.55, pipes: true,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(10, 8, 2.8, 'oldWood', 'plaster', 'plaster', { t: 1.6, wallTint: K.v(0xb8ac98, 0xd8c8e8), ceilTint: K.v(0x9a9488, undefined) });
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
      K.floor([[-2.6, 1], [2.4, -0.4], [-1.8, 3.2], [1, 3.4], [-3.4, -2.6]]);
      return { ...K, pipes: true, pool: ['gascan', 'plate', 'platestack', 'mug', 'wineglass', 'bottle', 'bottle', 'vase', 'lamp', 'frame', 'clock', 'laptop', 'speaker', 'flowerpot', 'bowl', 'jar', 'teapot', 'phone', 'chair', 'stool', 'crt', 'fishbowl', 'microwave'], start: { x: 0, z: 2.9 }, amb: 'apartment', photoSpots: [[-2.4, 1, 0.3], [2.4, -1.6, -0.3]] };
    },
  },
  studio: {
    name: 'Clay studio', desc: 'A life-size clay figure to punch, slap and kick. Dents stay, limbs come off.', exposure: 1, env: 0.5,
    build(ctx) {
      const { scene, S } = ctx, K = kit(ctx);
      K.room(9, 9, 3.2, 'oldWood', 'plaster', 'plaster', { wallTint: K.v(0xe8dfd0, 0xcfc6e0) });
      scene.background = new THREE.Color(K.v(0x15120f, 0x231a33)); scene.fog = new THREE.Fog(K.v(0x15120f, 0x231a33), 10, 22);
      const stone = S.surface('blockWall', 1, 1, 0xe0d8cc), wood = S.surface('wood', 1, 1), steel = S.surface('steel', 1, 1);
      K.box(1.1, 0.06, 1.1, stone, 0, 0.03, -1.2, { outline: true }); K.obstacles.push([-0.6, 0.6, -1.8, -0.6]);
      K.shelf(-4.2, -0.6, 3.2, 0.45, [0.9, 1.6, 2.3], wood, wood, 'z');
      K.shelf(4.2, -0.6, 3.2, 0.45, [0.9, 1.6, 2.3], wood, wood, 'z');
      K.table(0, -3.9, 3, 0.8, 0.9, wood, steel);
      K.floor([[-2.6, 1.6], [2.6, 1.6], [-2.8, -3], [2.8, -3]]);
      K.decal(spray('HANDS ONLY', '#c96f3b', 110), 3.6, 1, 0, 2.5, -4.48, 0, 0.9);
      K.hemi(0xfff0e0, 0x302820, K.v(0.35, 0.9));
      K.light('spot', 0xfff2e0, K.v(28, 22), 0.8, 3.1, 0.6, { target: [0, 1.4, -1.2], angle: 0.7, pen: 0.6, shadow: true });
      for (const x of [-2.6, 2.6]) K.bulb(x, 2.7, -0.6, 0xffd9a0, K.v(8, 4), { cage: true, cord: 0.4 });
      K.dust(200, K.bounds, 3);
      return { ...K, pool: ['gascan', 'vase', 'vase', 'pot', 'bowl', 'jug', 'plate', 'platestack', 'mug', 'flowerpot', 'teapot'], start: { x: 0, z: 2.2 }, clay: { x: 0, y: 0.06, z: -1.2 }, photoSpots: [[-2.4, -3.2, 0.3], [2.4, -3.2, -0.3]] };
    },
  },
};
