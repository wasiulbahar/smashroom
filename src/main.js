import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeStyle, detectGPU } from './style.js?v=5';
import { SCENES } from './scenes.js?v=5';
import { createItems, DEFS } from './items.js?v=5';
import * as A from './audio.js?v=5';
import { preloadItemModels } from './models.js?v=5';
import { createClayFigure, preloadClayHead } from './clay.js?v=5';
import { createReplay } from './replay.js?v=5';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const isTouch = matchMedia('(pointer:coarse)').matches;
const SESSION = 120;

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight, false);
const gpu = detectGPU(renderer);

// ---------- saved progress (this browser only)
const SAVE_KEY = 'smashroom.v2';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } })();
save.points ??= 0; save.smashed ??= 0; save.best ??= {}; save.vol ??= { master: 1, music: 1, sfx: 1 };
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

const WEAPONS = {
  hands: { name: 'Bare hands', desc: 'Punch (click), slap (F), kick (Space). Made for the clay figure.', power: 1, reach: 1.6, cone: 0.82, speed: 0.22, knock: 5, hands: true },
  bat: { name: 'Baseball bat', desc: 'Balanced, quick. Sends things flying.', power: 1, reach: 2.2, cone: 0.8, speed: 0.34, knock: 9 },
  hammer: { name: 'Sledgehammer', desc: 'Slow but brutal. Hits everything in front.', power: 2, reach: 2.0, cone: 0.7, speed: 0.6, knock: 7, area: true, heavy: true },
  crowbar: { name: 'Crowbar', desc: 'Fastest swing. Extra damage to electronics.', power: 1, reach: 2.4, cone: 0.86, speed: 0.26, knock: 8, bonus: 'electronics' },
  pan: { name: 'Frying pan', desc: 'Wide swing, loud BONG. Hits a whole row.', power: 1, reach: 1.9, cone: 0.62, speed: 0.3, knock: 10, area: true, unlock: { pts: 1500 } },
  golf: { name: 'Golf club', desc: 'Longest reach. Launches things across the room.', power: 1, reach: 2.7, cone: 0.88, speed: 0.22, knock: 14, unlock: { smashed: 120 } },
  wrench: { name: 'Pipe wrench', desc: 'Heavy, double damage, still quick.', power: 2, reach: 2.1, cone: 0.8, speed: 0.4, knock: 9, unlock: { pts: 6000 } },
};
const unlocked = k => { const u = WEAPONS[k].unlock; return !u || (u.pts && save.points >= u.pts) || (u.smashed && save.smashed >= u.smashed); };
const unlockText = u => u.pts ? `${save.points.toLocaleString()} / ${u.pts.toLocaleString()} lifetime points` : `${save.smashed} / ${u.smashed} things smashed`;
const NAMES = { platestack: 'stack of plates', crt: 'old TV', tv: 'TV', beermug: 'beer mug', wineglass: 'wine glass', fishbowl: 'fish bowl', watercooler: 'water cooler', cinder: 'cinder block', fork: 'cutlery', flowerpot: 'plant pot' };
const nameOf = k => NAMES[k] || k;
const GMODES = {
  classic: { name: 'Classic', desc: 'Two minutes. Score as much as you can.' },
  zen: { name: 'Zen', desc: 'No timer, calm music. Smash at your own pace.' },
  attack: { name: 'Time attack', desc: 'Clear the whole room as fast as you can.' },
  targets: { name: 'Target practice', desc: 'Throw things at targets on the walls. 90 seconds.' },
};
const vibrate = ms => { if (isTouch) try { navigator.vibrate?.(ms); } catch (e) {} };

// ---------- world
let opts = { mode: null, scene: 'classic', weapon: 'bat', quality: 'auto', music: true, gm: 'classic', voice: true };
let S, scene, world, camera, I, room, pivot, weaponMesh, photoTex = null, W = WEAPONS.bat, figure = null;
const qualityFor = () => opts.mode !== 'realistic' ? 'medium' : opts.quality === 'auto' ? gpu.tier : opts.quality;

function disposeScene(sc) {
  if (!sc) return;
  sc.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => m.dispose?.()); });
}
function build() {
  disposeScene(scene);
  scene = new THREE.Scene();
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true; world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.45; world.defaultContactMaterial.restitution = 0.12;
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80); camera.rotation.order = 'YXZ'; scene.add(camera);
  const def = SCENES[opts.scene];
  S = makeStyle(opts.mode, renderer, qualityFor()); S.envI = def.env;
  I = createItems({ scene, world, S, onBreak, onClink });
  I.photo = photoTex;
  room = def.build({ scene, world, S, items: I });
  figure = room.clay ? createClayFigure({ scene, world, S, items: I, ...room.clay, onLoose: c => I.chunks.push(c) }) : null;
  S.setup(scene, camera, def);
  pivot = new THREE.Group(); camera.add(pivot); equip(opts.weapon);
  I.batch(room.pool, room.slots, batchSize());
  if (Math.random() < 0.7) I.pyramid(room.slots);
  spawnPhotos();
  boomLight = new THREE.PointLight(0xffa040, 0, 12, 2); scene.add(boomLight); fx = [];
  held = null; hlTarget = null; hlMeshes = []; charging = false; swingT = -1; marks = []; puffs = []; smokers = []; recoil = 0; swingHold = 0;
}
const batchSize = () => Math.min(24, Math.max(14, Math.ceil(room.slots.length * 0.45)));
function spawnPhotos() {
  if (!photoTex || !room.photoSpots) return;
  if (I.list.some(i => i.key === 'cutout' && !i.dead)) return;
  for (const [x, z, ry] of room.photoSpots) I.add('cutout', x, 0.75, z, ry);
}

// ---------- weapons
function buildWeapon(key) {
  const g = new THREE.Group(), add = (geo, kind, c, y, x = 0, z = 0) => { const m = new THREE.Mesh(geo, S.mat(kind, c)); m.position.set(x, y, z); g.add(m); return m; };
  const C = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s), B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  if (key === 'bat') { add(C(0.048, 0.022, 0.86, 16), 'wood', 0xd9a066, 0.43); add(C(0.026, 0.026, 0.22), 'plastic', 0x222222, 0.11); add(new THREE.SphereGeometry(0.032, 10, 8), 'plastic', 0x222222, 0); }
  if (key === 'hammer') { add(C(0.02, 0.022, 0.85), 'wood', 0xc58b52, 0.425); add(B(0.26, 0.12, 0.12), 'metal', 0x59606e, 0.84); }
  if (key === 'crowbar') { add(C(0.016, 0.016, 0.78, 8), 'paint', 0xe0342f, 0.39); add(new THREE.TorusGeometry(0.05, 0.016, 8, 12, Math.PI), 'paint', 0xe0342f, 0.78, 0.05); add(B(0.04, 0.05, 0.02), 'metal', 0x59606e, 0); }
  if (key === 'pan') { add(C(0.018, 0.018, 0.4), 'plastic', 0x1a1a1a, 0.2); const p = add(C(0.17, 0.15, 0.04, 24), 'metal', 0x2b2b30, 0.55); p.rotation.x = Math.PI / 2; }
  if (key === 'golf') { add(C(0.008, 0.012, 0.95, 8), 'metal', 0xb8bcc4, 0.47); add(C(0.016, 0.016, 0.24), 'plastic', 0x222222, 0.12); add(B(0.1, 0.04, 0.03), 'metal', 0xd0d4dc, 0.95, 0.04); }
  if (key === 'wrench') { add(B(0.05, 0.6, 0.03), 'metal', 0xc0392b, 0.3); add(B(0.15, 0.12, 0.04), 'metal', 0x8a9099, 0.64); add(B(0.05, 0.08, 0.04), 'metal', 0x8a9099, 0.73, -0.05); }
  if (key === 'hands') {
    const skin = S.mat('clay', 0xe0ac8a), sleeve = S.mat('fabric', 0x2b2b3a);
    const fist = side => { const f = new THREE.Group(), k = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), skin); k.scale.set(1, 0.85, 1.2); f.add(k);
      const th = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin); th.position.set(-side * 0.045, -0.01, -0.02); f.add(th);
      const sl = new THREE.Mesh(C(0.05, 0.06, 0.4), sleeve); sl.rotation.x = Math.PI / 2; sl.position.z = 0.24; f.add(sl); return f; };
    const L = fist(-1), R = fist(1), palm = new THREE.Group(), leg = new THREE.Group();
    palm.add(new THREE.Mesh(B(0.1, 0.17, 0.025), skin)); for (let i = 0; i < 4; i++) { const fg = new THREE.Mesh(B(0.02, 0.08, 0.022), skin); fg.position.set((i - 1.5) * 0.024, 0.12, 0); palm.add(fg); }
    const ps = new THREE.Mesh(C(0.05, 0.06, 0.4), sleeve); ps.position.set(0, -0.28, 0.02); palm.add(ps);
    const shin = new THREE.Mesh(C(0.07, 0.08, 0.7), S.mat('fabric', 0x2a4a7a)); shin.position.y = -0.35; leg.add(shin);
    const shoe = new THREE.Mesh(B(0.12, 0.1, 0.28), S.mat('plastic', 0x1a1a1a)); shoe.position.set(0, -0.72, -0.07); leg.add(shoe);
    palm.visible = leg.visible = false; g.add(L, R, palm, leg); g.userData = { L, R, palm, leg };
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = false; });
  return S.outline(g, key === 'hands' ? 1.04 : 1.08);
}
function equip(key) { if (weaponMesh) pivot.remove(weaponMesh); opts.weapon = key; W = WEAPONS[key]; weaponMesh = buildWeapon(key); pivot.add(weaponMesh); }

// ---------- game state
let state = 'menu', paused = false, timeLeft = SESSION, score = 0, smashed = 0, combo = 0, bestCombo = 0, comboTimer = 0, throws = 0;
let rageMeter = 0, rageUntil = 0, slowUntil = 0, shake = 0, restocking = false, byKind = {}, lastClink = 0;
let freezeUntil = 0, kick = 0, goldenAt = 0, elapsed = 0, figureDowned = false, targetsHit = 0, boomLight = null, fx = [];
const freeze = ms => { freezeUntil = Math.max(freezeUntil, performance.now() + ms); };
const FIREBALL = new THREE.SphereGeometry(1, 20, 14);
const GOLD = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
const replay = createReplay($('c'));
const player = { x: 0, z: 2.6, yaw: 0, pitch: -0.18, bob: 0 };
const keys = {}, joy = { x: 0, y: 0 };
let mouseHeld = false, swingT = -1, hitDone = false;
let held = null, charging = false, chargeT = 0, hlTarget = null, hlMeshes = [];
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const HL = new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false });

function onClink(kind, i, pos) { if (performance.now() - lastClink > 35) { lastClink = performance.now(); A.at(pos, () => A.SFX.land(kind, i)); } }

// ---------- dust, smoke and liquid
let puffs = [], smokers = [], puffTex = null, smokeT = 0;
function puff(p, color, n = 3, size = 0.25, rise = 0.3, op = 0.5) {
  if (!puffTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); puffTex = new THREE.CanvasTexture(c); }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, opacity: op, depthWrite: false }));
    m.position.set(p.x + rand(-0.1, 0.1), p.y + rand(-0.05, 0.1), p.z + rand(-0.1, 0.1)); m.scale.setScalar(size * 0.5); scene.add(m);
    puffs.push({ m, v: new THREE.Vector3(rand(-0.5, 0.5), rise + rand(0, 0.3), rand(-0.5, 0.5)), life: 0, max: rand(0.7, 1.4), size, op });
  }
  while (puffs.length > 70) { const o = puffs.shift(); scene.remove(o.m); o.m.material.dispose(); }
}
const DUST = { glass: 0xe8f4ff, ceramic: 0xe8e2d6, electronics: 0x8a8a92, wood: 0xb89a70, stone: 0xb0aaa2, plastic: 0xd0d0d8, photo: 0xb89a70, explosive: 0x555555 };
const LIQUID = { bottle: 0x9a6a2a, beermug: 0xd9a22a, wineglass: 0x7a1030, jug: 0x9fd0ff, teapot: 0x8a5a2a, fishbowl: 0x6fc3ff, watercooler: 0x6fc3ff, jar: 0xc9882a };
const DOWN = new THREE.Vector3(0, -1, 0);

// ---------- damage you can see before something breaks
function itemHitPoint(it) {
  const o = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3());
  ray.set(o, f); ray.far = 6;
  const h = ray.intersectObject(it.mesh, true).find(x => x.face && !x.object.userData.ol && !x.object.userData.hl && !x.object.userData.gold);
  if (!h) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.dot(f) > 0) n.negate();
  return { point: h.point.clone(), normal: n };
}
function damageDecal(it, h, type, size) {
  it.decals = (it.decals || 0) + 1; if (it.decals > 6) return;
  const root = it.mesh; root.updateMatrixWorld(true);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: markTex(type), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide }));
  m.userData.ol = true; // not part of the object: skipped by outlines, highlights and fragments
  const nl = h.normal.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  m.position.copy(root.worldToLocal(h.point.clone())).addScaledVector(nl, 0.006); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nl); m.rotateZ(rand(0, 6.28)); root.add(m);
}
function crackScreen(it) {
  it.mesh.traverse(m => {
    if (!m.isMesh || m.userData.ol || m.userData.cracked || !m.material.isMeshBasicMaterial || !m.material.map) return;
    const src = m.material.map.image; if (!src || !src.width) return;
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.max(48, Math.round(256 * src.height / src.width)); const g = c.getContext('2d'); g.drawImage(src, 0, 0, c.width, c.height);
    const cx = rand(60, 196), cy = rand(c.height * 0.25, c.height * 0.75); g.lineCap = 'round';
    g.fillStyle = 'rgba(5,5,10,.85)'; g.beginPath(); g.arc(cx, cy, rand(10, 18), 0, 7); g.fill();
    for (let k = 0; k < 13; k++) { let a = k / 13 * Math.PI * 2 + rand(-0.2, 0.2), x = cx, y = cy; g.strokeStyle = k % 3 ? 'rgba(10,10,15,.9)' : 'rgba(255,255,255,.8)'; g.lineWidth = rand(0.8, 2.4); g.beginPath(); g.moveTo(x, y);
      for (let d = 0; d < rand(50, 200); d += 14) { a += rand(-0.3, 0.3); x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(${k % 2 ? '255,0,160' : '0,220,255'},.5)`; g.fillRect(0, rand(0, c.height), c.width, rand(1, 5)); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; m.material = new THREE.MeshBasicMaterial({ map: t }); m.userData.cracked = true; (it.screens ||= []).push(m);
  });
  if (it.screens) it.flicker = performance.now() + 800;
}
function onBreak(it, fromHit) {
  const d = it.def, p = it.body.position;
  const sz = Math.min(1.2, d.size), rate = Math.max(0.7, Math.min(1.15, 1.22 - sz * 0.55)), lv = Math.max(0.85, Math.min(1.25, 0.8 + sz * 0.5));
  A.at(p, () => { (A.SFX[d.kind] || A.SFX.plastic)(lv, rate); if (sz > 0.4) A.SFX.body(lv); }); // small things ring high and light, big things low and loud
  const big = d.size > 0.45 || (fromHit && heavyNow);
  puff(p, DUST[d.kind] || 0xbbbbbb, big ? 6 : 3, 0.2 + sz * 0.5, 0.25, d.kind === 'glass' ? 0.25 : 0.5);
  if (d.kind === 'electronics') smokers.push({ p: new THREE.Vector3(p.x, p.y, p.z), until: performance.now() + 2200 });
  if (LIQUID[it.key]) { I.sparks_(p, 22, LIQUID[it.key]); const h = surfaceHit(new THREE.Vector3(p.x, p.y, p.z), DOWN, 3); if (h) addMark(h.point, h.normal, 'splat', rand(0.35, 0.6) * (it.key === 'watercooler' ? 2 : 1), LIQUID[it.key]); }
  shake = Math.max(shake, big ? 0.3 : 0.18);
  if ((fromHit && big) || it.thrown) slowUntil = performance.now() + (it.thrown ? 220 : 170);
  flash(big ? 0.2 : 0.1);
  if (big) freeze(50);
  vibrate(big ? 40 : 15); kick = Math.min(0.08, kick + (big ? 0.03 : 0.012));
  if (d.kind === 'explosive') explode(p, it);
  if (state !== 'play') return;
  if (it.key === 'target') {
    targetsHit++; bumpCombo();
    const dist = Math.hypot(p.x - player.x, p.z - player.z), pts = Math.round(50 * (1 + dist / 4));
    addScore(pts, p, 'big'); popup(dist > 5 ? 'Long shot!' : 'Hit!', { x: p.x, y: p.y + 0.4, z: p.z }, 'small'); A.SFX.coin();
    setTimeout(() => { if (state === 'play') spawnTarget(); }, 600); return;
  }
  smashed++; byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  bumpCombo();
  const rage = performance.now() < rageUntil, gold = it.golden && performance.now() < it.golden;
  const mult = Math.min(4, 1 + Math.floor(combo / 4) * 0.5) * (rage ? 2 : 1) * (it.thrown ? 1.5 : 1) * (gold ? 10 : 1);
  addScore(Math.round(d.pts * mult), p, d.pts >= 30 || it.thrown || gold ? 'big' : '');
  if (gold) { banner('Golden!'); A.SFX.coin(); A.SFX.golden(); freeze(90); vibrate(80); I.sparks_(p, 30, 0xffd23f); }
  if (it.blasted) popup('Chain!', { x: p.x, y: p.y + 0.35, z: p.z }, 'small');
  if (it.thrown) { popup('Throw!', { x: p.x, y: p.y + 0.35, z: p.z }, 'small'); markNear(p, it.key === 'watercooler' ? 'splat' : 'crack', 0.35, it.key === 'watercooler' ? 0x5aa0d0 : 0xffffff); }
  if (!rage) { rageMeter += 6 + Math.min(combo, 10); if (rageMeter >= 100) startRage(); }
}

const CALLS = { 3: 'Nice!', 5: 'Combo!', 8: 'Rampage!', 12: 'Unstoppable!', 16: 'Godlike!', 22: 'Legendary!' };
function bumpCombo() { combo++; comboTimer = 2.5; bestCombo = Math.max(bestCombo, combo); if (CALLS[combo]) announce(CALLS[combo]); }
function announce(text) {
  const a = $('announce'); a.textContent = text; a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
  if (opts.voice && window.speechSynthesis) try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/!/g, '')); u.pitch = 0.4; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {}
}

// a gas can went off: fireball, knock everything back, break what's close (which can set off more cans)
function explode(p, src) {
  const P = new THREE.Vector3(p.x, p.y, p.z), R = 2.6, now = performance.now();
  A.at(P, () => A.SFX.boom()); puff(P, 0x3a3632, 8, 1.1, 0.8, 0.6);
  if (Math.hypot(P.x - player.x, P.z - player.z) < 5) { deafUntil = now + 1500; A.SFX.ring(); }
  shake = Math.max(shake, 0.7); flash(0.5); freeze(110); slowUntil = now + 700; vibrate(150); kick = Math.min(0.12, kick + 0.08);
  for (const [color, grow, max, op] of [[0xffa040, 2.4, 0.5, 1], [0x2a2622, 3, 1.3, 0.55]]) {
    const ball = new THREE.Mesh(FIREBALL, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, toneMapped: false, depthWrite: false }));
    ball.position.copy(P); ball.scale.setScalar(0.2); scene.add(ball); fx.push({ mesh: ball, life: 0, max, grow, op });
  }
  boomLight.position.copy(P); boomLight.intensity = S.realistic ? 140 : 40;
  I.sparks_(P, 40, 0xffb347); markNear(P, 'splat', 1.3, 0x161210);
  if (state === 'play') { popup('BOOM!', { x: P.x, y: P.y + 0.5, z: P.z }, 'big'); addScore(25, P, 'small'); }
  for (const it of I.list) {
    if (it.dead || it.held || it === src) continue;
    const q = it.body.position, d = Math.hypot(q.x - P.x, q.y - P.y, q.z - P.z); if (d > R) continue;
    const f = 1 - d / R, dir = new THREE.Vector3(q.x - P.x, q.y - P.y + 0.3, q.z - P.z).normalize();
    if (!it.fixed) { it.body.wakeUp(); it.born = 0; it.body.velocity.set(it.body.velocity.x + dir.x * 14 * f, it.body.velocity.y + dir.y * 10 * f + 4 * f, it.body.velocity.z + dir.z * 14 * f); }
    if (it.def.hp !== Infinity && d < R * 0.65) { it.blasted = true; setTimeout(() => { if (!it.dead) I.shatter(it, dir, 6 * f + 2, false); }, 50 + d * 120); }
  }
  for (const c of I.chunks) { const q = c.body.position, d = Math.hypot(q.x - P.x, q.y - P.y, q.z - P.z); if (d < R) { const f = 1 - d / R; c.body.wakeUp(); c.body.velocity.set((q.x - P.x) / d * 12 * f, 3 + 8 * f, (q.z - P.z) / d * 12 * f); } }
  if (figure && figure.alive) {
    const fp = figure.root.position, tc = new THREE.Vector3(fp.x, fp.y + 1, fp.z);
    if (tc.distanceTo(P) < R) { const dir = tc.clone().sub(P).normalize(), res = figure.hit(P, dir, R + 1, 'heavy', new THREE.Vector3(1, 0, 0)); if (res) clayHit(res, dir); }
  }
}

// every so often one item turns gold for a few seconds: 10x points
function makeGolden() {
  const list = I.list.filter(i => !i.dead && !i.fixed && !i.held && !i.golden && i.def.hp !== Infinity && i.key !== 'gascan');
  if (!list.length) return;
  const it = list[Math.floor(Math.random() * list.length)]; it.golden = performance.now() + 9000; it.goldMeshes = [];
  const meshes = []; it.mesh.traverse(m => { if (m.isMesh && !m.userData.ol && !m.userData.hl && !m.userData.gold) meshes.push(m); });
  for (const m of meshes) { const g = new THREE.Mesh(m.geometry, GOLD); g.userData.gold = true; g.scale.setScalar(1.12); m.add(g); it.goldMeshes.push(g); }
  A.SFX.golden(); toast(`Golden ${nameOf(it.key)}! 10× points, be quick`);
}
function updateGolden(now, t) {
  GOLD.opacity = 0.35 + Math.sin(t * 8) * 0.2;
  for (const it of I.list) {
    if (!it.golden) continue;
    if (now > it.golden) { it.goldMeshes.forEach(g => g.parent?.remove(g)); it.golden = 0; continue; }
    if (Math.random() < 0.15) I.sparks_(it.body.position, 1, 0xffd23f);
  }
}

// target practice: a bullseye on a random wall, away from where you start
function spawnTarget() {
  for (let tries = 0; tries < 40; tries++) {
    const a = rand(0, Math.PI * 2), y = rand(1, 2.3), h = surfaceHit(new THREE.Vector3(0, y, -0.5), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 20);
    if (!h || Math.abs(h.normal.y) > 0.3) continue;
    const pt = h.point.clone().addScaledVector(h.normal, 0.05);
    if (Math.hypot(pt.x - room.start.x, pt.z - room.start.z) < 3) continue;
    if (I.list.some(i => i.key === 'target' && !i.dead && Math.hypot(i.body.position.x - pt.x, i.body.position.y - pt.y, i.body.position.z - pt.z) < 1.2)) continue;
    I.add('target', pt.x, pt.y, pt.z, Math.atan2(h.normal.x, h.normal.z)); return;
  }
}
const remaining = () => I.list.filter(i => !i.dead && i.def.hp !== Infinity && i.key !== 'cutout' && i.key !== 'target').length + (figure && !figureDowned ? 1 : 0);

let atk = 'swing', side = 1, CW = W, atkCount = 0, swingHold = 0, chargeK = 0, heavyNow = false, recoil = 0, deafUntil = 0, lastStep = 0;
const ATTACK = { punch: { speed: 0.22, reach: 1.6, power: 1, knock: 5, cone: 0.82 }, slap: { speed: 0.3, reach: 1.5, power: 1, knock: 3, cone: 0.72 }, kick: { speed: 0.45, reach: 1.9, power: 2, knock: 10, cone: 0.72 } };
const defaultAttack = () => W.hands ? (isTouch && ++atkCount % 3 === 0 ? 'slap' : 'punch') : 'swing';
function startSwing(type = defaultAttack()) {
  if (swingT >= 0 || state !== 'play' || paused || held) return;
  if (type !== 'swing' && !W.hands) type = 'swing';
  atk = type; CW = type === 'swing' ? W : { ...W, ...ATTACK[type] }; if (type === 'punch') side = -side;
  swingT = 0; hitDone = false; swingHold = 0; A.SFX.whoosh(W.heavy || type === 'kick');
}
function doHit() {
  const origin = camera.getWorldPosition(v1), fwd = camera.getWorldDirection(v2), hits = [];
  chargeK = atk === 'swing' ? Math.max(0, Math.min(1, (swingHold - 0.12) / 0.55)) : 0; heavyNow = !!W.heavy || chargeK >= 0.6;
  if (chargeK > 0.05) { CW = { ...W, power: W.power + (chargeK >= 0.6 ? 1 : 0), knock: W.knock * (1 + 0.7 * chargeK), area: W.area || chargeK >= 0.9 }; if (chargeK > 0.3) A.SFX.whoosh(true); }
  if (atk === 'kick') { fwd.y -= 0.5; fwd.normalize(); }
  if (figure) {
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const res = figure.hit(origin, fwd, CW.reach, atk === 'swing' ? (heavyNow ? 'heavy' : 'weapon') : atk, right);
    if (res) return clayHit(res, fwd);
  }
  for (const it of I.list) {
    if (it.dead || it.held) continue;
    const p = it.body.position; v3.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    const reach = CW.reach + (it.key === 'carbody' ? 1.6 : it.def.size * 0.5), dist = v3.length(); if (dist > reach) continue;
    v3.normalize(); if (v3.dot(fwd) > CW.cone - (dist < 1 ? 0.35 : 0) - (it.key === 'carbody' ? 0.4 : 0)) hits.push({ it, dist: it.key === 'carbody' ? dist + 1 : dist });
  }
  hits.sort((a, b) => a.dist - b.dist);
  const dir = new THREE.Vector3(fwd.x, Math.max(fwd.y, 0) + 0.3, fwd.z).normalize();
  for (const { it } of CW.area ? hits.slice(0, 4) : hits.slice(0, 1)) hitItem(it, dir);
  for (const c of I.chunks) { const p = c.body.position; v3.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    if (v3.length() < CW.reach && v3.normalize().dot(fwd) > CW.cone - 0.15) { c.body.wakeUp(); c.body.velocity.set(dir.x * 6 + rand(-1, 1), 2 + rand(0, 2), dir.z * 6 + rand(-1, 1)); } }
  if (!hits.length) {
    const h = surfaceHit(origin, fwd, CW.reach + 0.3);
    if (h && !W.hands) { addMark(h.point, h.normal, 'crack', heavyNow ? 0.55 : 0.34); A.at(h.point, () => A.SFX.thud('wood', 0.8 + chargeK * 0.4, 0.9)); puff(h.point, 0xb0aaa2, 2, 0.2, 0.1, 0.4); I.sparks_(h.point, 6, 0xbbb4aa); shake = Math.max(shake, 0.08 + chargeK * 0.1); recoil = 1; freeze(25); }
    else shake = Math.max(shake, 0.02);
  }
}
function clayHit(res, dir) {
  const p = res.point, hard = atk === 'kick' || heavyNow;
  A.at(p, () => { if (atk === 'punch') A.SFX.punch(1); else if (atk === 'slap') A.SFX.slap(1); else if (atk === 'kick') A.SFX.kick(1); else A.SFX.thud('wood', 1);
    A.SFX.clay(hard ? 1 : 0.7); if (res.voice) A.SFX.voice(res.voice); });
  shake = Math.max(shake, hard ? 0.16 : 0.07); recoil = 0.6; freeze(hard ? 35 : 20);
  kick = Math.min(0.08, kick + (hard ? 0.03 : 0.015)); vibrate(hard ? 35 : 15);
  bumpCombo();
  addScore(atk === 'slap' ? 2 : 3, p, 'small');
  const names = { head: 'Head off!', arm: 'Arm off!', leg: 'Leg off!', torso: 'Smashed!' };
  for (const part of res.lost) {
    smashed++; byKind.clay = (byKind.clay || 0) + 1;
    const mult = Math.min(4, 1 + Math.floor(combo / 4) * 0.5) * (performance.now() < rageUntil ? 2 : 1);
    addScore(Math.round(part.pts * mult), p, 'big'); if (names[part.name]) popup(names[part.name], { x: p.x, y: p.y + 0.4, z: p.z }, 'small');
    if (performance.now() >= rageUntil) { rageMeter += 10; if (rageMeter >= 100) startRage(); }
  }
  if (res.lost.length) { A.SFX.clay(1); A.SFX.wood(0.6); slowUntil = performance.now() + 200; flash(0.12); freeze(70); vibrate(60); }
  if (res.collapsed) { banner('Sculpture smashed!'); addScore(80, p, 'big'); figureDowned = true; }
}
function hitItem(it, dir) {
  const rage = performance.now() < rageUntil, p = it.body.position, kind = it.def.kind;
  if (it.key === 'target') { toast('Throw something at it!'); return; }
  kick = Math.min(0.08, kick + (heavyNow ? 0.03 : 0.015)); vibrate(20);
  const h = itemHitPoint(it), at = h ? h.point : p, lv = 0.8 + chargeK * 0.5;
  if (it.def.hp === Infinity) { // metal: it rings, dents and flies, but never breaks
    A.at(at, () => { A.SFX.metal(lv, Math.max(0.7, 1.3 - it.def.size)); if (opts.weapon === 'pan') A.SFX.metal(0.8); });
    it.pop = 1; shake = Math.max(shake, 0.12); I.sparks_(at, 8, 0xffd27a); addScore(it.def.pts, p, 'small'); recoil = 1; freeze(30);
    if (!it.fixed) { if (h) damageDecal(it, h, 'dent', Math.min(0.2, it.def.size * 0.6)); it.body.wakeUp(); it.body.velocity.set(dir.x * CW.knock, dir.y * CW.knock * 0.5 + 2, dir.z * CW.knock); it.body.angularVelocity.set(rand(-12, 12), rand(-12, 12), rand(-12, 12)); }
    else { const sh = surfaceHit(camera.getWorldPosition(v1), camera.getWorldDirection(v2), CW.reach + 2.5, it.mesh.children); if (sh) addMark(sh.point, sh.normal, 'dent', heavyNow ? 0.45 : 0.3); }
    return;
  }
  it.hp -= CW.power + (CW.bonus === kind ? 1 : 0) + (rage ? 1 : 0);
  if (it.hp <= 0) { recoil = 0.35; freeze(heavyNow ? 45 : 28); return I.shatter(it, dir, CW.knock * 0.7, true, h && h.point); }
  // still in one piece: leave a crack where it was hit, break the screen, start it smoking
  it.pop = 1; recoil = 1; freeze(30);
  if (h) damageDecal(it, h, 'crack', Math.min(0.3, Math.max(0.1, it.def.size * 0.45)));
  if (kind === 'electronics') { crackScreen(it); it.smoking = true; I.sparks_(at, 10, 0xffc531); }
  puff(at, DUST[kind] || 0xbbbbbb, 2, 0.18, 0.2, 0.4);
  if (!it.fixed) { it.body.wakeUp(); it.born = 0; it.body.velocity.set(dir.x * CW.knock, dir.y * CW.knock * 0.5 + 2, dir.z * CW.knock); it.body.angularVelocity.set(rand(-10, 10), rand(-10, 10), rand(-10, 10)); }
  for (let i = 0; i < 5; i++) I.shard(kind, Math.min(0.3, it.def.size) * rand(0.06, 0.13), it.color, at, it.fixed ? new CANNON.Vec3() : it.body.velocity, dir, 2, 0.15, I.photo);
  A.at(at, () => { if (W.hands) A.SFX[atk === 'slap' ? 'slap' : atk === 'kick' ? 'kick' : 'punch'](0.8); A.SFX.thud(kind, lv, Math.max(0.75, 1.25 - it.def.size * 0.5)); if (kind === 'electronics') A.SFX.plastic(0.5, 1.2); });
  shake = Math.max(shake, heavyNow ? 0.14 : 0.08); flash(0.06);
  addScore(2, p, 'small');
}

// ---------- grab and throw
function findGrabTarget() {
  const origin = camera.getWorldPosition(v1), fwd = camera.getWorldDirection(v2);
  let best = null, bestScore = -1;
  for (const it of I.list) {
    if (it.dead || it.fixed || it.held) continue;
    const p = it.body.position; v3.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    const dist = v3.length(); if (dist > 2.8 + it.def.size * 0.5) continue;
    const dot = v3.normalize().dot(fwd); if (dot < (dist < 1.2 ? 0.55 : 0.84)) continue;
    const s = dot * 3 - dist * 0.4; if (s > bestScore) { bestScore = s; best = it; }
  }
  return best;
}
function setHighlight(it) {
  if (hlTarget === it) return;
  for (const m of hlMeshes) m.parent?.remove(m); hlMeshes = []; hlTarget = it;
  if (!it) return;
  const list = []; it.mesh.traverse(m => { if (m.isMesh && !m.userData.ol && !m.userData.hl && !m.userData.gold) list.push(m); });
  for (const m of list) { const h = new THREE.Mesh(m.geometry, HL); h.userData.hl = true; h.scale.setScalar(1.09); m.add(h); hlMeshes.push(h); }
}
function grab(it) {
  if (!it || held) return;
  setHighlight(null); held = it; it.held = true; it.thrown = false;
  it.body.type = CANNON.Body.KINEMATIC; it.body.velocity.setZero(); it.body.angularVelocity.setZero(); it.body.wakeUp();
  A.SFX.grab();
}
function throwHeld(power) {
  if (!held) return; const it = held; held = null; charging = false;
  const fwd = camera.getWorldDirection(v2);
  it.body.type = CANNON.Body.DYNAMIC; it.body.wakeUp();
  const speed = (8 + power * 14) / Math.sqrt(Math.max(1, it.def.mass / 1.5));
  it.body.velocity.set(fwd.x * speed, fwd.y * speed + 1.5 + power * 1.5, fwd.z * speed);
  it.body.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
  it.held = false; it.thrown = true; it.born = 0; throws++;
  A.SFX.throw(); shake = Math.max(shake, 0.05 + power * 0.08);
  setTimeout(() => { it.thrown = false; }, 4000);
}
function dropHeld() {
  if (!held) return; const it = held; held = null; charging = false;
  it.body.type = CANNON.Body.DYNAMIC; it.body.wakeUp(); it.held = false; it.body.velocity.set(0, 0.5, 0);
}
function updateHeld(dt) {
  if (!held) return;
  if (held.dead) { held = null; return; }
  const cam = camera.getWorldPosition(v1), fwd = camera.getWorldDirection(v2), right = v3.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const dist = 0.8 + held.def.size * 0.6;
  v4.copy(cam).addScaledVector(fwd, dist).addScaledVector(right, 0.22).add({ x: 0, y: -0.18, z: 0 });
  v4.y = Math.max(v4.y, 0.25);
  const b = held.body.position;
  held.body.velocity.set((v4.x - b.x) * 14, (v4.y - b.y) * 14, (v4.z - b.z) * 14);
  held.body.quaternion.setFromEuler(0, player.yaw, 0);
}


// ---------- damage marks that stay put (walls, tables, the car)
const MARK_TEX = {};
function markTex(type) {
  if (MARK_TEX[type]) return MARK_TEX[type];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (type === 'crack') {
    const r = g.createRadialGradient(64, 64, 2, 64, 64, 34); r.addColorStop(0, 'rgba(15,10,8,.75)'); r.addColorStop(1, 'rgba(15,10,8,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(15,10,8,.9)'; g.lineCap = 'round';
    for (let k = 0; k < 9; k++) { let a = k / 9 * Math.PI * 2 + rand(-0.3, 0.3), x = 64, y = 64, len = rand(28, 60); g.lineWidth = rand(1.2, 3); g.beginPath(); g.moveTo(x, y);
      for (let d = 0; d < len; d += 8) { a += rand(-0.35, 0.35); x += Math.cos(a) * 8; y += Math.sin(a) * 8; g.lineTo(x, y); } g.stroke(); }
  } else if (type === 'dent') {
    const r = g.createRadialGradient(58, 58, 4, 64, 64, 58); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.6, 'rgba(0,0,0,.25)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 40, 3.6, 5.4); g.stroke();
  } else {
    g.fillStyle = 'rgba(255,255,255,.95)';
    for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(64 + rand(-30, 30) * (k ? 1 : 0), 64 + rand(-30, 30) * (k ? 1 : 0), k ? rand(4, 12) : 34, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (MARK_TEX[type] = t);
}
let marks = [];
function addMark(point, normal, type, size, color = 0xffffff) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: markTex(type), color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.position.copy(point).addScaledVector(normal, 0.004); m.lookAt(v4.copy(point).add(normal)); m.rotateZ(rand(0, 6.28)); scene.add(m); marks.push(m);
  if (marks.length > 90) { const o = marks.shift(); scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
}
const ray = new THREE.Raycaster();
function surfaceHit(origin, dir, far, targets = room.statics) {
  ray.set(origin, dir); ray.far = far; const h = ray.intersectObjects(targets, false)[0];
  if (!h || !h.face) return null;
  return { point: h.point.clone(), normal: h.face.normal.clone().transformDirection(h.object.matrixWorld), object: h.object };
}
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]].map(a => new THREE.Vector3(...a));
function markNear(p, type, size, color) {
  let best = null; const o = new THREE.Vector3(p.x, p.y, p.z);
  for (const a of AXES) { const h = surfaceHit(o, a, 0.7); if (h && (!best || h.point.distanceTo(o) < best.point.distanceTo(o))) best = h; }
  if (best) addMark(best.point, best.normal, type, size, color);
}

// ---------- scoring helpers
function startRage() { rageMeter = 0; rageUntil = performance.now() + 8000; banner('Rage mode'); A.SFX.rage(); slowUntil = performance.now() + 400; document.body.classList.add('rage'); }
function addScore(n, p, cls) { if (state !== 'play') return; score += n; replay.mark(n); popup('+' + n, p, cls); }
function popup(text, p, cls = '') {
  v1.set(p.x, p.y + 0.15, p.z).project(camera); if (v1.z > 1) return;
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = (v1.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-v1.y * 0.5 + 0.5) * innerHeight + 'px';
  $('pops').appendChild(el); el.addEventListener('animationend', () => el.remove());
}
function banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
function flash(a) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .18s'; f.style.opacity = 0; }); }

// ---------- session flow
let modelsReady = null;
const headReady = preloadClayHead().then(() => { if (state === 'menu' && opts.scene === 'studio') build(); });
async function startSession() {
  A.initAudio(); A.setVolume(save.vol); A.setRoom(opts.scene);
  if (opts.scene === 'studio') { $('start').textContent = 'Loading…'; await Promise.race([headReady, new Promise(r => setTimeout(r, 20000))]); $('start').textContent = 'Start smashing'; }
  if (opts.mode === 'realistic' && modelsReady) { $('start').textContent = 'Loading…'; await modelsReady; $('start').textContent = 'Start smashing'; }
  build();
  Object.assign(player, { x: room.start.x, z: room.start.z, yaw: 0, pitch: -0.18 });
  timeLeft = opts.gm === 'targets' ? 90 : opts.gm === 'classic' ? SESSION : Infinity;
  score = 0; smashed = 0; combo = 0; bestCombo = 0; rageMeter = 0; rageUntil = 0; byKind = {}; restocking = false; throws = 0;
  elapsed = 0; figureDowned = false; targetsHit = 0; kick = 0; goldenAt = performance.now() + 8000;
  if (opts.gm === 'attack') { I.batch(room.pool, room.slots, 8); I.pyramid(room.slots); }
  if (opts.gm === 'targets') for (let i = 0; i < 4; i++) spawnTarget();
  state = 'play'; paused = false; fpsT = 0; fpsN = 0;
  replay.start();
  for (const id of ['modeScreen', 'lobby', 'end', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  A.setMusicStyle(opts.gm === 'zen' ? 'calm' : 'heavy'); A.setMusic(opts.music, true); A.startAmbience(room.amb);
  banner({ classic: 'Go!', zen: 'Relax', attack: 'Clear the room!', targets: 'Hit the targets!' }[opts.gm]);
  if (!isTouch) lockMouse();
}
function endSession() {
  state = 'end'; mouseHeld = false; dropHeld(); setHighlight(null); document.exitPointerLock?.(); A.SFX.buzzer(); A.setMusic(opts.music, false); A.stopAmbience();
  document.body.classList.remove('rage'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const before = Object.keys(WEAPONS).filter(unlocked);
  save.points += score; save.smashed += smashed;
  const attack = opts.gm === 'attack', cleared = attack && remaining() === 0;
  const key = bestKey(opts.scene), list = save.best[key] || [], entry = { score, smashed, w: opts.weapon, d: Date.now(), time: cleared ? Math.round(elapsed * 10) / 10 : null };
  if (!attack || cleared) { list.push(entry); list.sort((a, b) => attack ? a.time - b.time : b.score - a.score); save.best[key] = list.slice(0, 5); }
  persist();
  const fresh = Object.keys(WEAPONS).filter(k => unlocked(k) && !before.includes(k));
  $('rating').textContent = attack ? (cleared ? `Cleared in ${fmtTime(elapsed)}` : 'Room not cleared')
    : opts.gm === 'zen' ? 'Feeling better?' : opts.gm === 'targets' ? `${targetsHit} targets hit`
    : smashed < 10 ? 'Mildly annoyed' : smashed < 25 ? 'Properly cross' : smashed < 45 ? 'Furious' : 'Absolute menace';
  const stat = (l, v) => `<div class="stat"><div class="lbl">${l}</div><div class="val">${v}</div></div>`;
  $('stats').innerHTML = stat('Score', score) + stat('Smashed', smashed) + stat('Best combo', 'x' + bestCombo) + stat('Throws', throws) +
    ['glass', 'ceramic', 'electronics', 'wood', 'stone', 'plastic'].filter(k => byKind[k]).map(k => stat(k[0].toUpperCase() + k.slice(1), byKind[k])).join('');
  const rows = save.best[key] || [], rank = rows.indexOf(entry);
  $('scores').innerHTML = `<div class="lbl">Your ${attack ? 'fastest clears' : 'top scores'}: ${SCENES[opts.scene].name}, ${GMODES[opts.gm].name} (${opts.mode})</div>` + (rows.length ? rows.map((e, i) =>
    `<div class="score-row${i === rank ? ' me' : ''}"><span>${i + 1}.</span><span>${attack ? fmtTime(e.time) : e.score.toLocaleString()}</span><span>${e.smashed} smashed</span><span>${WEAPONS[e.w]?.name || ''}</span></div>`).join('') : '<div class="score-row"><span></span><span>No clears yet</span></div>');
  $('replayBox').classList.add('hidden');
  replay.stop().then(() => { if (state === 'end' && replay.best) { $('replayBox').classList.remove('hidden'); playReplay(); } });
  $('unlocks').innerHTML = fresh.map(k => `<div class="unlock">Unlocked: ${WEAPONS[k].name}</div>`).join('');
  if (fresh.length) setTimeout(() => A.SFX.unlock(), 900);
  $('end').classList.remove('hidden');
}
const fmtTime = t => t == null ? '-' : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const bestKey = sc => opts.gm === 'classic' ? `${opts.mode}:${sc}` : `${opts.mode}:${sc}:${opts.gm}`;
function playReplay() {
  const c = $('replayCanvas'), b = $('saveClip'); c.width = 640; c.height = 360; b.disabled = true; b.textContent = 'Preparing clip…';
  replay.play(c, `+${replay.best.peak} in 1.5 seconds`).then(() => { b.disabled = !replay.clip; b.textContent = replay.clip ? 'Save clip' : 'Clip not available'; });
}
function lockMouse() { try { const r = $('c').requestPointerLock?.(); r && r.catch && r.catch(() => {}); } catch (e) {} }
function setPaused(p) {
  if (state !== 'play') return; paused = p; mouseHeld = false; charging = false;
  $('pause').classList.toggle('hidden', !p); p ? A.suspend() : A.resume();
}
function toLobby() {
  state = 'menu'; A.stopAmbience(); A.setMusic(opts.music, false);
  for (const id of ['end', 'pause', 'hud', 'touch', 'modeScreen']) $(id).classList.add('hidden');
  renderLobby(); $('lobby').classList.remove('hidden'); build();
}

// ---------- menus
function renderMode() {
  $('gpuNote').textContent = gpu.name ? `Your graphics: ${gpu.name.replace(/ANGLE \(|\)$/g, '').slice(0, 80)}. Suggested realistic quality: ${gpu.tier}.` : '';
  $('modeScreen').classList.remove('hidden');
}
function card(sel, inner, data, locked) { return `<button class="card${sel ? ' sel' : ''}${locked ? ' locked' : ''}" ${data}>${inner}</button>`; }
function renderLobby() {
  $('modeName').textContent = opts.mode === 'realistic' ? 'Realistic' : 'Stylized';
  $('gmodes').innerHTML = Object.entries(GMODES).map(([k, m]) => card(k === opts.gm, `<b>${m.name}</b><small>${m.desc}</small>`, `data-g="${k}"`)).join('');
  $('scenes').innerHTML = Object.entries(SCENES).map(([k, s]) => { const b = save.best[bestKey(k)]?.[0];
    const best = b ? (opts.gm === 'attack' ? `Best: ${fmtTime(b.time)}` : `Best: ${b.score.toLocaleString()}`) : '';
    return card(k === opts.scene, `<b>${s.name}</b><small>${s.desc}</small>${best ? `<small class="best">${best}</small>` : ''}`, `data-s="${k}"`); }).join('');
  $('weapons').innerHTML = Object.entries(WEAPONS).map(([k, w]) => { const ok = unlocked(k);
    return card(k === opts.weapon, `<b>${ok ? '' : '🔒 '}${w.name}</b><small>${ok ? w.desc : 'Unlock: ' + unlockText(w.unlock)}</small>`, `data-w="${k}"`, !ok); }).join('');
  $('qualityRow').classList.toggle('hidden', opts.mode !== 'realistic');
  $('quality').value = opts.quality;
  $('music').checked = opts.music; $('voice').checked = opts.voice;
  $('lifetime').textContent = `Lifetime: ${save.points.toLocaleString()} points · ${save.smashed.toLocaleString()} things smashed`;
  $('photoName').textContent = photoTex ? 'Photo added. It shows up on cut-outs and picture frames.' : 'Optional. Stays on your device and is never uploaded.';
  $('photoClear').classList.toggle('hidden', !photoTex);
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  opts.mode = b.dataset.mode; $('modeScreen').classList.add('hidden'); renderLobby(); $('lobby').classList.remove('hidden'); build();
  if (opts.mode === 'realistic') modelsReady = modelsReady || preloadItemModels().then(() => { if (state === 'menu' && opts.mode === 'realistic') build(); });
});
$('scenes').onclick = e => { const b = e.target.closest('.card'); if (!b) return; opts.scene = b.dataset.s; if (opts.scene === 'studio') opts.weapon = 'hands'; renderLobby(); build(); };
$('weapons').onclick = e => { const b = e.target.closest('.card'); if (!b || b.classList.contains('locked')) return; opts.weapon = b.dataset.w; renderLobby(); equip(opts.weapon); };
document.querySelectorAll('.vol').forEach(el => {
  el.value = Math.round(save.vol[el.dataset.v] * 100);
  el.oninput = () => { save.vol[el.dataset.v] = el.value / 100; document.querySelectorAll(`.vol[data-v=${el.dataset.v}]`).forEach(o => { o.value = el.value; }); A.setVolume(save.vol); persist(); };
});
$('gmodes').onclick = e => { const b = e.target.closest('.card'); if (!b) return; opts.gm = b.dataset.g; renderLobby(); };
$('voice').onchange = e => { opts.voice = e.target.checked; };
$('watchAgain').onclick = () => replay.best && playReplay();
$('saveClip').onclick = () => replay.download();
$('quality').onchange = e => { opts.quality = e.target.value; build(); };
$('music').onchange = e => { opts.music = e.target.checked; A.setMusic(opts.music, state === 'play'); };
$('backMode').onclick = () => { $('lobby').classList.add('hidden'); renderMode(); };
$('start').onclick = startSession;
$('again').onclick = startSession;
$('changeScene').onclick = toLobby;
$('changeLook').onclick = () => { toLobby(); $('lobby').classList.add('hidden'); renderMode(); };
$('resume').onclick = () => { if (!isTouch) lockMouse(); setPaused(false); };
$('quit').onclick = () => { setPaused(false); timeLeft = 0; };
$('photoBtn').onclick = () => $('photoInput').click();
$('photoInput').onchange = e => {
  const f = e.target.files[0]; if (!f || !f.type.startsWith('image/')) return;
  const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'), s = Math.min(1, 1024 / Math.max(img.width, img.height)); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    photoTex = new THREE.CanvasTexture(c); photoTex.colorSpace = THREE.SRGBColorSpace; URL.revokeObjectURL(img.src); renderLobby(); build();
  };
  img.src = URL.createObjectURL(f); e.target.value = '';
};
$('photoClear').onclick = () => { photoTex = null; renderLobby(); build(); };
if (isTouch) $('keysDesk').textContent = 'Left thumb moves, right thumb looks. Smash swings, hold it to wind up a heavy hit. Grab picks things up, tap it again to throw.';

// ---------- input
document.addEventListener('pointerlockchange', () => { if (state === 'play' && !isTouch) setPaused(!document.pointerLockElement); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });
document.addEventListener('mousemove', e => {
  if (state !== 'play' || paused || (document.pointerLockElement !== $('c') && !(e.buttons & 1))) return; // drag-to-look fallback when pointer lock is blocked
  player.yaw -= e.movementX * 0.0022; player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch - e.movementY * 0.0022));
});
$('c').addEventListener('contextmenu', e => e.preventDefault());
$('c').addEventListener('mousedown', e => {
  if (state !== 'play' || paused) return;
  if (e.button === 0) { if (held) { charging = true; chargeT = 0; } else { mouseHeld = true; startSwing(); } }
  if (e.button === 2) grabOrThrow();
});
addEventListener('mouseup', e => { if (e.button === 0) { mouseHeld = false; if (charging && held) throwHeld(Math.min(1, chargeT / 0.8)); charging = false; } });
function grabOrThrow() { if (held) throwHeld(0.65); else grab(hlTarget || findGrabTarget()); }
addEventListener('keydown', e => {
  keys[e.code] = true; if (state !== 'play' || paused || e.repeat) return;
  if (e.code === 'Space') startSwing(W.hands ? 'kick' : 'swing');
  if (e.code === 'KeyF') W.hands ? startSwing('slap') : grabOrThrow();
  if (e.code === 'KeyE') grabOrThrow();
  if (e.code === 'KeyQ') dropHeld();
});
addEventListener('keyup', e => keys[e.code] = false);

let joyId = null, joyO = null, lookId = null, lookLast = null;
const tl = $('touch');
tl.addEventListener('pointerdown', e => {
  if (e.target.id === 'smashBtn') { mouseHeld = true; startSwing(); return; }
  if (e.target.id === 'grabBtn') { grabOrThrow(); return; }
  if (e.target.id === 'kickBtn') { startSwing('kick'); return; }
  if (e.clientX < innerWidth * 0.45 && joyId === null) { joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY }; const j = $('joy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.classList.remove('hidden'); }
  else if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
});
tl.addEventListener('pointermove', e => {
  if (e.pointerId === joyId) { const dx = Math.max(-55, Math.min(55, e.clientX - joyO.x)), dy = Math.max(-55, Math.min(55, e.clientY - joyO.y));
    joy.x = dx / 55; joy.y = dy / 55; $('knob').style.transform = `translate(${dx}px,${dy}px)`; }
  if (e.pointerId === lookId) { player.yaw -= (e.clientX - lookLast.x) * 0.006; player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch - (e.clientY - lookLast.y) * 0.006)); lookLast = { x: e.clientX, y: e.clientY }; }
});
const tEnd = e => {
  if (e.target.id === 'smashBtn') mouseHeld = false;
  if (e.pointerId === joyId) { joyId = null; joy.x = joy.y = 0; $('joy').classList.add('hidden'); $('knob').style.transform = ''; }
  if (e.pointerId === lookId) lookId = null;
};
tl.addEventListener('pointerup', tEnd); tl.addEventListener('pointercancel', tEnd);

// ---------- per-frame
function updatePlayer(dt) {
  let mx = joy.x, mz = joy.y;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw), sp = (keys.ShiftLeft ? 5 : 3.6) * dt;
  player.x += (mx * c + mz * s) * sp; player.z += (-mx * s + mz * c) * sp;
  const [bx1, bx2, bz1, bz2] = room.bounds;
  player.x = Math.max(bx1, Math.min(bx2, player.x)); player.z = Math.max(bz1, Math.min(bz2, player.z));
  const R = 0.3;
  for (const [x1, x2, z1, z2] of room.obstacles) {
    if (player.x > x1 - R && player.x < x2 + R && player.z > z1 - R && player.z < z2 + R) {
      const push = [[x1 - R - player.x, 0], [x2 + R - player.x, 0], [0, z1 - R - player.z], [0, z2 + R - player.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
      player.x += push[0]; player.z += push[1];
    }
  }
  if (len > 0.1) {
    player.bob += dt * 9;
    const ph = Math.floor(player.bob / Math.PI);
    if (ph !== lastStep) { lastStep = ph; // a footstep; crunch if there's broken glass or china underfoot
      const crunch = I.chunks.some(c => (c.kind === 'glass' || c.kind === 'ceramic') && c.body.position.y < 0.2 && Math.hypot(c.body.position.x - player.x, c.body.position.z - player.z) < 0.45);
      A.SFX.step(STEP[opts.scene] || 'stone', crunch); }
  }
}
const STEP = { classic: 'stone', abandoned: 'stone', haunted: 'wood', office: 'carpet', kitchen: 'stone', caryard: 'stone', studio: 'wood' };
function poseHands() {
  const { L, R, palm, leg } = weaponMesh.userData, t = swingT < 0 ? 0 : swingT, b = Math.sin(player.bob) * 0.012;
  const jab = k => k < 0.45 ? Math.sin(k / 0.45 * Math.PI / 2) : Math.cos((k - 0.45) / 0.55 * Math.PI / 2);
  pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); pivot.scale.setScalar(1);
  const nx = camera.aspect < 1 ? 0.13 : 0.24, low = held ? 0.3 : 0;
  L.position.set(-nx, -0.27 + b - low, -0.48); R.position.set(nx, -0.27 - b - low, -0.48); R.visible = true; palm.visible = false; leg.visible = false;
  if (swingT < 0) return;
  const j = jab(t);
  if (atk === 'punch') { const F = side < 0 ? L : R; F.position.set(side * (nx - 0.2 * j), -0.27 + 0.12 * j, -0.48 - 0.42 * j); }
  if (atk === 'slap') { R.visible = false; palm.visible = true; palm.position.set(0.42 - 0.75 * j, -0.12 + 0.04 * j, -0.55 - 0.15 * j); palm.rotation.set(0, -0.5 + 0.9 * j, 0.25); }
  if (atk === 'kick') { leg.visible = true; leg.position.set(0.1, -0.55 + 0.3 * j, 0.25); leg.rotation.set(1.25 * j, 0, 0); }
}
function poseWeapon() {
  const t = swingT < 0 ? 0 : swingT, ease = k => 1 - Math.pow(1 - k, 3);
  let rx = 0.15, rz = -0.3, px = 0, pz = 0;
  if (t > 0 && t < 0.18) { const k = ease(t / 0.18); rx = 0.15 + 0.45 * k; rz = -0.3 + 0.2 * k; }
  else if (t >= 0.18 && t < 0.42) { const k = Math.pow((t - 0.18) / 0.24, 2); rx = 0.6 - 2.6 * k; rz = -0.1 + 1.2 * k; px = -0.25 * k; pz = -0.12 * k; }
  else if (t >= 0.42) { const k = ease((t - 0.42) / 0.58); rx = -2 + 2.15 * k; rz = 1.1 - 1.4 * k; px = -0.25 * (1 - k); pz = -0.12 * (1 - k); }
  const b = Math.sin(player.bob) * 0.015, lower = held ? 0.35 : 0;
  if (swingHold > 0.12 && !hitDone) { const k = Math.min(1, (swingHold - 0.12) / 0.55); rx += 0.3 * k + rand(-1, 1) * 0.015 * k; rz -= 0.15 * k; }
  rx += recoil * 0.85; pz += recoil * 0.06;
  pivot.scale.setScalar(camera.aspect < 1 ? 0.7 : 1); pivot.rotation.set(rx, 0, rz); pivot.position.set((camera.aspect < 1 ? 0.05 : Math.min(0.45, camera.aspect * 0.3)) + px, -0.6 + b + Math.abs(b) - lower, -0.7 + pz);
}

let last = performance.now(), orbit = 0, fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!scene) return;
  const rdt = Math.min((now - last) / 1000, 0.05); last = now;
  const dt = now < freezeUntil ? 0 : rdt * (now < slowUntil ? 0.25 : 1), t = now / 1000;
  const playing = state === 'play' && !paused;

  if (playing) {
    timeLeft -= rdt; updatePlayer(rdt);
    if (mouseHeld && swingT < 0) startSwing();
    if (swingT >= 0) {
      // holding the button pauses a weapon swing at the top to wind up a heavy hit
      if (atk === 'swing' && !W.hands && !hitDone && swingT >= 0.16 && mouseHeld && swingHold < 0.75) swingHold += rdt; else swingT += dt / CW.speed;
      if (!hitDone && swingT >= 0.4) { hitDone = true; doHit(); } if (swingT >= 1) { swingT = -1; swingHold = 0; }
    }
    recoil *= Math.pow(0.0008, rdt);
    for (const it of I.list) { // damaged screens flicker, then dim
      if (it.screens && it.flicker) { const on = now > it.flicker; const c = on ? (it.hp <= 1 ? 0x555555 : 0xffffff) : (Math.random() < 0.5 ? 0x111111 : 0xffffff); it.screens.forEach(m => m.material.color.setHex(c)); if (on) it.flicker = 0; }
    }
    smokeT += rdt; if (smokeT > 0.22) { smokeT = 0;
      for (const it of I.list) if (it.smoking && !it.dead) puff(it.body.position, 0x55555a, 1, 0.3, 0.7, 0.35);
      smokers = smokers.filter(k => { puff(k.p, 0x4a4a50, 1, 0.35, 0.8, 0.4); return now < k.until; }); }
    W.hands ? poseHands() : poseWeapon();
    const fu = figure && figure.update(dt);
    if (fu) { banner(fu === 'boss' ? 'Boss sculpture!' : 'New sculpture'); if (fu === 'boss') A.SFX.voice('boss'); }
    if (now > goldenAt) { goldenAt = now + rand(14000, 22000); makeGolden(); }
    updateGolden(now, t);
    if (opts.gm === 'attack') { elapsed += rdt; if (remaining() === 0) endSession(); }
    if (charging) chargeT += rdt;
    setHighlight(held ? null : findGrabTarget());
    if (comboTimer > 0 && (comboTimer -= rdt) <= 0) combo = 0;
    if (rageUntil && now > rageUntil) { rageUntil = 0; document.body.classList.remove('rage'); }
    else if (!rageUntil) rageMeter = Math.max(0, rageMeter - rdt * 3);
    if (opts.gm !== 'attack' && !restocking && I.list.filter(i => !i.dead && !i.fixed).length <= 2) {
      restocking = true; banner('Restock!'); A.SFX.restock();
      setTimeout(() => { if (state === 'play') { I.batch(room.pool, room.slots, batchSize()); if (Math.random() < 0.5) I.pyramid(room.slots); spawnPhotos(); } restocking = false; }, 700);
    }
    if (timeLeft <= 0) endSession();
    // automatic quality: step down if it runs slow
    fpsT += rdt; fpsN++;
    if (fpsT > 3) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
      if (opts.mode === 'realistic' && opts.quality === 'auto' && fps < 28 && S.quality !== 'low') {
        const next = S.quality === 'high' ? 'medium' : 'low'; S.setQuality(next, scene, camera); toast(`Running slow, switched to ${next} quality`); } }
  }
  if (!paused) {
    updateHeld(dt);
    world.step(1 / 60, dt, 5);
    I.flush(); I.sync(dt);
    for (const u of room.updates) u(t, dt);
    fx = fx.filter(f => { f.life += rdt; const k = f.life / f.max; f.mesh.scale.setScalar(0.2 + f.grow * Math.min(1, k * 1.6)); f.mesh.material.opacity = f.op * (1 - k);
      if (k >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); return false; } return true; });
    puffs = puffs.filter(o => { o.life += dt; const k = o.life / o.max; o.m.position.addScaledVector(o.v, dt); o.v.multiplyScalar(Math.pow(0.2, dt)); o.m.scale.setScalar(o.size * (0.5 + 1.6 * k)); o.m.material.opacity = o.op * (1 - k);
      if (k >= 1) { scene.remove(o.m); o.m.material.dispose(); return false; } return true; });
    if (boomLight && boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity * Math.pow(0.002, rdt) - 1);
  }
  if (state === 'play') {
    camera.position.set(player.x, 1.65 + Math.sin(player.bob * 2) * 0.02, player.z);
    camera.rotation.set(player.pitch + kick, player.yaw, 0); pivot.visible = true;
    kick *= Math.pow(0.0005, rdt);
  } else {
    orbit += rdt * 0.1; pivot.visible = false;
    const [bx1, bx2, bz1, bz2] = room.bounds, rx = (bx2 - bx1) * 0.32, rz = (bz2 - bz1) * 0.32;
    camera.position.set(Math.sin(orbit) * rx, 2.1, -1 + Math.cos(orbit) * rz); camera.lookAt(0, 0.9, -1.2);
  }
  shake *= Math.pow(0.002, rdt);
  if (shake > 0.001) { camera.position.x += rand(-1, 1) * shake * 0.3; camera.position.y += rand(-1, 1) * shake * 0.3; camera.rotation.z += rand(-1, 1) * shake * 0.08; }

  if (state === 'play') {
    if (opts.gm === 'attack') $('time').textContent = fmtTime(elapsed);
    else if (!isFinite(timeLeft)) $('time').textContent = '∞';
    else { const tl2 = Math.max(0, Math.ceil(timeLeft)); $('time').textContent = Math.floor(tl2 / 60) + ':' + String(tl2 % 60).padStart(2, '0'); }
    $('time').classList.toggle('low', isFinite(timeLeft) && timeLeft <= 10);
    $('extra').textContent = opts.gm === 'attack' ? `${remaining()} left` : opts.gm === 'targets' ? `${targetsHit} targets` : '';
    $('score').textContent = score; $('smashed').textContent = smashed;
    $('combo').textContent = combo >= 3 ? 'Combo x' + combo : '';
    const rage = now < rageUntil;
    $('rageFill').style.width = (rage ? (rageUntil - now) / 80 : rageMeter) + '%';
    $('rageTxt').textContent = rage ? 'Rage mode x2' : 'Rage';
    const hint = held ? (isTouch ? 'Tap Grab to throw' : 'Click to throw (hold for power) · E quick throw · Q drop')
      : hlTarget ? (isTouch ? `Grab the ${nameOf(hlTarget.key)}` : `E or right-click: grab the ${nameOf(hlTarget.key)}`)
      : W.hands && !isTouch ? 'Click punch · F slap · Space kick' : '';
    $('kickBtn').classList.toggle('hidden', !W.hands);
    $('hint').textContent = hint;
    const wind = swingHold > 0.12 && !hitDone;
    $('charge').style.opacity = charging || wind ? 1 : 0; $('chargeFill').style.width = Math.min(100, (wind ? (swingHold - 0.12) / 0.55 : chargeT / 0.8) * 100) + '%';
    $('grabBtn').textContent = held ? 'Throw' : 'Grab';
  }
  A.listener(camera.position, camera.getWorldDirection(v2)); A.setMuffle(state === 'play' && (now < slowUntil || now < deafUntil));
  S.render(scene, camera, t);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } S?.resize(innerWidth, innerHeight); });

renderMode();
opts.mode = 'stylized'; build(); opts.mode = null; // background behind the first screen
requestAnimationFrame(frame);
window.__smash = { A, get I() { return I; }, get figure() { return figure; }, get W() { return W; }, startSwing, get swingT() { return swingT; }, tick(n = 1, ms = 16) { for (let i = 0; i < n; i++) { last = performance.now() - ms; frame(performance.now()); } }, get state() { return state; }, get S() { return S; }, player, startSession, get camera() { return camera; }, grab, throwHeld, findGrabTarget, opts };
