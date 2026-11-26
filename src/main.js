import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeStyle, detectGPU, canvasTex } from './style.js?v=25';
import { SCENES } from './scenes.js?v=25';
import { createItems, DEFS } from './items.js?v=25';
import * as A from './audio.js?v=25';
import { preloadItemModels } from './models.js?v=25';
import { createClayFigure, preloadClayBody } from './clay.js?v=25';
import { createReplay } from './replay.js?v=25';
import { clayBody } from './clay.js?v=25';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const isTouch = matchMedia('(pointer:coarse)').matches;
const SESSION = 120;

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight, false);
const gpu = detectGPU(renderer);

// ---------- saved progress (this browser only)
const SAVE_KEY = 'smashroom.v2';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } })();
save.points ??= 0; save.smashed ??= 0; save.best ??= {}; save.vol ??= { master: 1, music: 1, sfx: 1 }; save.set ??= {}; save.set = { sens: 1, invert: false, fov: 72, shake: true, ...save.set }; save.stats ??= {}; save.ach ??= {}; save.words ??= ''; save.view ??= 'fp';
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

const WEAPONS = {
  hands: { name: 'Bare hands', desc: 'Punch (click), slap (F), kick (Space). Made for the clay figure.', power: 1, reach: 1.6, cone: 0.82, speed: 0.22, knock: 5, hands: true },
  bat: { name: 'Baseball bat', desc: 'Balanced, quick. Sends things flying.', power: 1, reach: 2.2, cone: 0.8, speed: 0.34, knock: 9 },
  hammer: { name: 'Sledgehammer', desc: 'Slow but brutal. Hits everything in front.', power: 2, reach: 2.0, cone: 0.7, speed: 0.6, knock: 7, area: true, heavy: true },
  crowbar: { name: 'Crowbar', desc: 'Fastest swing. Extra damage to electronics.', power: 1, reach: 2.4, cone: 0.86, speed: 0.26, knock: 8, bonus: 'electronics' },
  pan: { name: 'Frying pan', desc: 'Wide swing, loud BONG. Hits a whole row.', power: 1, reach: 1.9, cone: 0.62, speed: 0.3, knock: 10, area: true, unlock: { pts: 1500 } },
  golf: { name: 'Golf club', desc: 'Longest reach. Launches things across the room.', power: 1, reach: 2.7, cone: 0.88, speed: 0.22, knock: 14, unlock: { smashed: 120 } },
  axe: { name: 'Fire axe', desc: 'Splits wood: tables, shelves and chairs give way fast.', power: 2, reach: 2.1, cone: 0.76, speed: 0.45, knock: 8, bonus: 'wood', unlock: { ach: 'collapse' } },
  goldbat: { name: 'Golden bat', desc: 'A bat that pays: every break is worth 25% more.', power: 1, reach: 2.2, cone: 0.8, speed: 0.34, knock: 9, gold: true, unlock: { ach: 'missions' } },
  katana: { name: 'Katana', desc: 'Fast and razor sharp: slices things clean in two along your swing.', power: 3, reach: 2.2, cone: 0.86, speed: 0.24, knock: 3, slice: true },
  wreck: { name: 'Wrecking ball', desc: 'Calls down a crane ball that swings through whatever you point at.', tool: 'wreck', speed: 0.5, power: 0, reach: 1, cone: 1, knock: 0 },
  blower: { name: 'Leaf blower', desc: 'Hold to blast shards, dust and light things across the room.', tool: 'blow', speed: 0.2, power: 0, reach: 6, cone: 1, knock: 0 },
  cannon: { name: 'Ball cannon', desc: 'Fires heavy iron balls that smash through whatever is in the way. Press 8 for a ramp, 9 for a trampoline.', tool: 'cannon', speed: 0.9, power: 0, reach: 1, cone: 1, knock: 0 },
  grav: { name: 'Gravity gun', desc: 'Click to lift anything, even a TV or a car. Click again to fling it.', tool: 'grav', speed: 0.3, power: 0, reach: 15, cone: 1, knock: 0 },
  paintball: { name: 'Paintball gun', desc: 'Splat the room in colour. Pops glass, knocks small things over. Hold to keep firing.', tool: 'paint', speed: 0.14, power: 0, reach: 30, cone: 1, knock: 2 },
  bowling: { name: 'Bowling ball', desc: 'Roll a heavy ball into rows of bottles, stacks and dominoes.', tool: 'bowl', speed: 0.7, power: 0, reach: 1, cone: 1, knock: 0 },
  extinguisher: { name: 'Fire extinguisher', desc: 'Hold to blast foam. Shoves things around and coats everything white.', tool: 'foam', speed: 0.2, power: 0, reach: 4, cone: 1, knock: 0 },
  broom: { name: 'Broom', desc: 'Sweep the mess into a bin. Slow, quiet and oddly satisfying.', tool: 'broom', speed: 0.3, power: 0, reach: 1.6, cone: 1, knock: 0 },
  wrench: { name: 'Pipe wrench', desc: 'Heavy, double damage, still quick.', power: 2, reach: 2.1, cone: 0.8, speed: 0.4, knock: 9, unlock: { pts: 6000 } },
};
const unlocked = k => { const u = WEAPONS[k].unlock; return !u || (u.pts && save.points >= u.pts) || (u.smashed && save.smashed >= u.smashed) || (u.ach && !!save.ach[u.ach]); };
const unlockText = u => u.ach ? `achievement "${ACH.find(a => a.id === u.ach).name}"` : u.pts ? `${save.points.toLocaleString()} / ${u.pts.toLocaleString()} lifetime points` : `${save.smashed} / ${u.smashed} things smashed`;
const NAMES = { scrapcube: 'scrap cube', domino: 'domino', leg: 'table leg', plank: 'board', beam: 'wooden beam', coffeetable: 'coffee table', platestack: 'stack of plates', crt: 'old TV', tv: 'TV', beermug: 'beer mug', wineglass: 'wine glass', fishbowl: 'fish bowl', watercooler: 'water cooler', cinder: 'cinder block', fork: 'cutlery', flowerpot: 'plant pot' };
const nameOf = k => NAMES[k] || k;
const GMODES = {
  classic: { name: 'Classic', desc: 'Two minutes. Score as much as you can.' },
  zen: { name: 'Zen', desc: 'No timer, calm music. Smash at your own pace.' },
  attack: { name: 'Time attack', desc: 'Clear the whole room as fast as you can.' },
  targets: { name: 'Target practice', desc: 'Throw things at targets on the walls. 90 seconds.' },
  build: { name: 'Build & smash', desc: 'No timer. Set up dominoes, towers and pyramids with keys 1 to 7, then knock them down.' },
};
const vibrate = ms => { if (isTouch) try { navigator.vibrate?.(ms); } catch (e) {} };

// ---------- world
let opts = { mode: null, scene: 'classic', weapon: 'bat', quality: 'auto', music: true, gm: 'classic' };
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
  camera = new THREE.PerspectiveCamera(save.set.fov, innerWidth / innerHeight, 0.05, 80); camera.rotation.order = 'YXZ'; scene.add(camera);
  const def = SCENES[opts.scene];
  S = makeStyle(opts.mode, renderer, qualityFor()); S.envI = def.env;
  I = createItems({ scene, world, S, onBreak, onClink });
  I.photo = photoTex;
  room = def.build({ scene, world, S, items: I });
  world.gravity.set(0, room.gravity ?? -9.82, 0); // the space station floats
  figure = room.clay ? createClayFigure({ scene, world, S, items: I, ...room.clay, onLoose: c => I.chunks.push(c) }) : null;
  S.setup(scene, camera, def);
  pivot = new THREE.Group(); camera.add(pivot); equip(opts.weapon);
  const sea = season(); if (sea && room.pool.length) room.pool = room.pool.concat(SEASON_ITEMS[sea]); // holiday things mixed into the room
  I.batch(room.pool, room.slots, opts.gm === 'build' ? 10 : batchSize());
  applyWords(); fireworks = []; fwT = 0; room.extra = []; broken = 0; fires = []; fireSnd?.stop(); fireSnd = null; fireLight = null; toys = 0; jumpT = 0; floorHits = []; basement = null; floorY = 0; fall = null; storm = null; hot = []; drawDom = null; stopSprinklers(); cityAlarms.forEach(a => a.sound?.stop()); cityAlarms = [];
  I.silly = !!opts.silly; if (opts.silly) { world.defaultContactMaterial.restitution = 0.72; if (!room.gravity) world.gravity.set(0, -7.5, 0); }
  spawnPet(); setupZen(); rushT = performance.now() + 4000; pressT = 0; pressSnd?.stop(); pressSnd = null; beltT = 0; boss = null; bossAt = performance.now() + 25000; $('boss').classList.add('hidden');
  I.onBossHit = it => { it.pop = 1; A.at(it.body.position, () => A.SFX[it.def.kind]?.(0.5, 0.7)); shake = Math.max(shake, 0.08); };
  if (!room.open && !room.calm && room.pool.length && opts.gm !== 'build' && Math.random() < 0.45) dominoRun();
  if (Math.random() < 0.7) I.pyramid(room.slots);
  spawnPhotos();
  boomLight = new THREE.PointLight(0xffa040, 0, 12, 2); scene.add(boomLight); fx = [];
  applyBlackout();
  held = null; hlTarget = null; hlMeshes = []; charging = false; swingT = -1; marks = []; puffs = []; smokers = []; recoil = 0; swingHold = 0; loose = []; wallHits = []; pipes.forEach(P => P.sound?.stop()); pipes = []; resetHeat(); resetTools(); setupOpenWorld(); museumAlarm?.sound?.stop(); museumAlarm = null; breaches.forEach(b => b.sound?.stop()); breaches = [];
}
const batchSize = () => room.batch ? (S.quality === 'low' ? 40 : room.batch) : Math.min(S.quality === 'low' ? 24 : 36, Math.max(16, Math.ceil(room.slots.length * 0.5))); // bigger rooms hold more
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
  if (key === 'goldbat') { add(C(0.048, 0.022, 0.86, 16), 'metal', 0xffc93c, 0.43); add(C(0.026, 0.026, 0.22), 'plastic', 0x222222, 0.11); add(new THREE.SphereGeometry(0.032, 10, 8), 'metal', 0xffc93c, 0); }
  if (key === 'axe') { add(C(0.02, 0.024, 0.85), 'wood', 0xb07a45, 0.425); add(B(0.2, 0.12, 0.025), 'paint', 0xc0392b, 0.8, 0.07); add(B(0.04, 0.16, 0.012), 'metal', 0xd0d4dc, 0.8, 0.18); add(B(0.06, 0.07, 0.035), 'metal', 0x59606e, 0.8, -0.04); }
  if (key === 'katana') { add(C(0.018, 0.018, 0.26, 10), 'fabric', 0x1a1a22, 0.13); add(B(0.1, 0.016, 0.06), 'metal', 0xc8a040, 0.27); add(B(0.032, 0.86, 0.006), 'metal', 0xe8ecf0, 0.71); add(B(0.03, 0.04, 0.006), 'metal', 0xe8ecf0, 1.15); }
  if (key === 'wreck') { add(B(0.09, 0.15, 0.05), 'plastic', 0xf0c020, 0, 0, -0.1); add(B(0.05, 0.025, 0.01), 'plastic', 0xc8202a, 0.04, 0, -0.07); const a = add(C(0.004, 0.004, 0.2, 6), 'metal', 0x2a2a2e, 0.17, 0.03, -0.1); g.userData.pose = 'gun'; }
  if (key === 'blower') { add(B(0.14, 0.16, 0.22), 'plastic', 0xd86a1a, -0.05, 0, 0); const t = add(C(0.04, 0.03, 0.6, 14), 'plastic', 0x2a2a2e, 0, 0, -0.38); t.rotation.x = Math.PI / 2; add(B(0.03, 0.1, 0.03), 'plastic', 0x2a2a2e, 0.09, 0, 0.05); g.userData.pose = 'gun'; }
  if (key === 'cannon') { const b = add(C(0.07, 0.085, 0.5, 18), 'metal', 0x2a2a2e, 0, 0, -0.18); b.rotation.x = Math.PI / 2; add(new THREE.TorusGeometry(0.075, 0.015, 8, 18), 'metal', 0x8a6a2a, 0, 0, -0.43); add(B(0.12, 0.1, 0.16), 'wood', 0x6a4a2a, -0.06, 0, 0.08); add(B(0.04, 0.12, 0.05), 'plastic', 0x1a1a1e, -0.1, 0, 0.12); g.userData.pose = 'gun'; }
  if (key === 'grav') { add(B(0.1, 0.12, 0.34), 'metal', 0x3a3e48, 0, 0, -0.05); for (const s of [-1, 1]) { const p = add(B(0.012, 0.012, 0.2), 'metal', 0xb8bcc4, 0.04 * s, 0.03 * s, -0.3); }
    add(new THREE.SphereGeometry(0.035, 14, 10), 'emissive', 0x6ad8ff, 0, 0, -0.24); add(B(0.04, 0.12, 0.05), 'plastic', 0x1a1a1e, -0.08, 0, 0.06); g.userData.pose = 'gun'; }
  if (key === 'paintball') { const b = add(B(0.07, 0.11, 0.32), 'plastic', 0x1e2a1e, 0, 0, -0.12); add(B(0.05, 0.14, 0.06), 'plastic', 0x1e2a1e, -0.09, 0.04); const br = add(C(0.016, 0.016, 0.34, 10), 'metal', 0x2a2a2e, 0.03, 0, -0.42); br.rotation.x = Math.PI / 2; add(new THREE.SphereGeometry(0.05, 14, 10), 'plastic', 0xf0c020, 0.08, 0, -0.08); g.userData.pose = 'gun'; }
  if (key === 'bowling') { add(new THREE.SphereGeometry(0.11, 24, 18), 'paint', 0x2a3a8a, 0, 0, 0); g.userData.pose = 'ball'; }
  if (key === 'extinguisher') { add(C(0.07, 0.07, 0.4, 18), 'paint', 0xc8202a, -0.16, 0.04, 0.02); add(C(0.03, 0.03, 0.06, 10), 'metal', 0x2a2a2e, 0.07, 0.04, 0.02); add(B(0.03, 0.03, 0.16), 'metal', 0x2a2a2e, 0.09, 0.04, -0.06);
    const n = add(C(0.035, 0.015, 0.14, 12), 'plastic', 0x111111, 0.09, 0.04, -0.2); n.rotation.x = -Math.PI / 2; g.userData.pose = 'ext'; }
  if (key === 'broom') { // handle from the hands down to a head resting on the floor in front
    const a = new THREE.Vector3(0.26, -0.22, -0.3), b = new THREE.Vector3(0.02, -0.5, -1.05), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    const s = add(C(0.015, 0.015, len, 8), 'wood', 0xc8a06a, mid.y, mid.x, mid.z); s.lookAt(a); s.rotateX(Math.PI / 2); // add() takes y before x; the handle points from the head up to the hands
    add(B(0.4, 0.05, 0.08), 'plastic', 0x2a6ad8, b.y, b.x, b.z); add(B(0.38, 0.1, 0.06), 'fabric', 0xd8c080, b.y - 0.07, b.x, b.z - 0.01); g.userData.pose = 'broom'; }
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
function equip(key) { toolStop(); if (weaponMesh) pivot.remove(weaponMesh); opts.weapon = key; W = WEAPONS[key]; weaponMesh = buildWeapon(key); pivot.add(weaponMesh); }

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
function puff(p, color, n = 3, size = 0.25, rise = 0.3, op = 0.5, life = 1, vel = null) {
  if (!puffTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); puffTex = new THREE.CanvasTexture(c); }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, opacity: op, depthWrite: false }));
    m.position.set(p.x + rand(-0.1, 0.1), p.y + rand(-0.05, 0.1), p.z + rand(-0.1, 0.1)); m.scale.setScalar(size * 0.5); scene.add(m);
    puffs.push({ m, v: vel ? new THREE.Vector3(vel.x + rand(-0.6, 0.6), vel.y + rand(-0.3, 0.5), vel.z + rand(-0.6, 0.6)) : new THREE.Vector3(rand(-0.5, 0.5), rise + rand(0, 0.3), rand(-0.5, 0.5)), life: 0, max: rand(0.7, 1.4) * life, size, op });
  }
  while (puffs.length > 140) { const o = puffs.shift(); scene.remove(o.m); o.m.material.dispose(); }
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
function damageDecal(it, h, type, size, color = 0xffffff) {
  it.decals = (it.decals || 0) + 1; if (it.decals > 6) return;
  const root = it.mesh; root.updateMatrixWorld(true);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: markTex(type), color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide }));
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
  petScare(it.body.position); if (opts.silly) A.at(it.body.position, sillySound);
  const d = it.def, p = it.body.position;
  const sz = Math.min(1.2, d.size), rate = Math.max(0.7, Math.min(1.15, 1.22 - sz * 0.55)), lv = Math.max(0.85, Math.min(1.25, 0.8 + sz * 0.5));
  const zl = room.zen ? 0.5 : 1; A.at(p, () => { (A.SFX[d.kind] || A.SFX.plastic)(lv * zl, rate * (room.zen ? 0.9 : 1)); if (sz > 0.4) A.SFX.body(lv * zl); }); // zen garden: softer, lower // small things ring high and light, big things low and loud
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
  emit('break', { kind: d.kind, key: it.key, thrown: !!it.thrown, held: !!it.byHeld, size: d.size });
  afterBreak(it, { x: p.x, y: p.y, z: p.z });
  if (room.museum && !museumAlarm) startMuseumAlarm(p);
  if (room.space && it.key === 'window') hullBreach(it);
  if (room.heat) addHeat(it.group != null ? 5 : it.key === 'window' ? 7 : it.fixed ? 6 : d.size > 0.45 ? 3 : 1.6);
  if (it.group != null) carAlarm(it.group);
  if (it.key === 'hydrant') burstPipe(new THREE.Vector3(p.x, p.y + 0.2, p.z), new THREE.Vector3(0, 1, 0), true);
  if (it.blast) { it.blast.n++; maxStat('chain', it.blast.n); }
  if ((it.key === 'carglass' || it.key === 'carlight') && !I.list.some(i => !i.dead && (i.key === 'carglass' || i.key === 'carlight'))) { addStat('carclear'); banner('Car wrecked!'); }
  bumpCombo();
  const rage = performance.now() < rageUntil, gold = it.golden && performance.now() < it.golden;
  const mult = Math.min(4, 1 + Math.floor(combo / 4) * 0.5) * (rage ? 2 : 1) * (it.thrown ? 1.5 : 1) * (gold ? 10 : 1) * (W.gold ? 1.25 : 1) * (1 + heatStars() * 0.15);
  addScore(Math.round(d.pts * mult), p, d.pts >= 30 || it.thrown || gold ? 'big' : '');
  if (gold) { banner('Golden!'); A.SFX.coin(); A.SFX.golden(); freeze(90); vibrate(80); I.sparks_(p, 30, 0xffd23f); }
  if (it.blasted) popup('Chain!', { x: p.x, y: p.y + 0.35, z: p.z }, 'small');
  if (it.thrown) { popup('Throw!', { x: p.x, y: p.y + 0.35, z: p.z }, 'small'); markNear(p, it.key === 'watercooler' ? 'splat' : 'crack', 0.35, it.key === 'watercooler' ? 0x5aa0d0 : 0xffffff); }
  if (!rage) { rageMeter += 6 + Math.min(combo, 10); if (rageMeter >= 100) startRage(); }
}

const CALLS = { 3: 'Nice!', 5: 'Combo!', 8: 'Rampage!', 12: 'Unstoppable!', 16: 'Godlike!', 22: 'Legendary!' };
function bumpCombo() { combo++; comboTimer = 2.5; bestCombo = Math.max(bestCombo, combo); if (CALLS[combo]) announce(CALLS[combo]); emit('combo', { n: combo }); }
function announce(text) {
  const a = $('announce'); a.textContent = text; a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}

// a gas can went off: fireball, knock everything back, break what's close (which can set off more cans)
function explode(p, src) {
  const P = new THREE.Vector3(p.x, p.y, p.z), R = 2.6, now = performance.now(), blast = { n: 0 }, chain = (src && src.chain) || { n: 0 }; chain.n++;
  if (chain.n >= 2 && state === 'play') { banner('Chain reaction x' + chain.n); addScore(20 * chain.n, P, 'big'); maxStat('chainLen', chain.n); }
  for (const f of room.furniture) { if (f.dead) continue; const c = f.parts[0].position, d = c.distanceTo(P); if (d < R + 0.6) { f.hp -= 7 * (1 - d / (R + 0.6)) + 2; if (f.hp <= 0) collapse(f, c.clone().sub(P).setY(0).normalize()); } }
  for (const L of room.lamps) if (!L.broken && L.pos.distanceTo(P) < R + 0.5) breakLamp(L);
  for (const f of room.furniture) if (!f.dead && f.parts[0].position.distanceTo(P) < R + 0.8) ignite(f, true);
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
    const lit = it.def.kind === 'explosive' && d < R * 0.8 && !it.chain; if (lit) it.chain = chain; // gas cans nearby go off in turn
    if (burnable(it) && d < R * 1.1) ignite(it);
    if (it.def.hp !== Infinity && (d < R * 0.65 || lit)) { it.blasted = true; it.blast = blast; setTimeout(() => { if (!it.dead) I.shatter(it, dir, 6 * f + 2, false); }, 50 + d * 120); }
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
const remaining = () => I.list.filter(i => !i.dead && !i.debris && i.def.hp !== Infinity && i.key !== 'cutout' && i.key !== 'target').length + (figure && !figureDowned ? 1 : 0);

let atk = 'swing', side = 1, CW = W, atkCount = 0, swingHold = 0, chargeK = 0, heavyNow = false, recoil = 0, deafUntil = 0, lastStep = 0;
const ATTACK = { punch: { speed: 0.22, reach: 1.6, power: 1, knock: 5, cone: 0.82 }, slap: { speed: 0.3, reach: 1.5, power: 1, knock: 3, cone: 0.72 }, kick: { speed: 0.45, reach: 1.9, power: 2, knock: 10, cone: 0.72 } };
const defaultAttack = () => W.hands ? (isTouch && ++atkCount % 3 === 0 ? 'slap' : 'punch') : 'swing';
// anything you hold is a weapon: heavier things hit harder but swing slower, and breakable things break in your hand
const heldStats = it => { const m = it.def.mass || 1, sz = it.def.size; return { name: nameOf(it.key), power: m >= 3 ? 2 : 1, reach: 1.7 + sz * 0.6, cone: 0.78, speed: Math.min(0.7, 0.26 + m * 0.05), knock: 5 + Math.min(m, 8) * 1.2, area: sz > 0.45, heavy: m >= 4 }; };
function heldImpact(hit) {
  if (!hit || !held) return; const it = held;
  if (it.def.hp === Infinity) { A.at(it.body.position, () => A.SFX.metal(0.7)); return; }
  it.hp -= 1; it.pop = 1;
  if (it.hp <= 0) { held = null; it.held = false; it.body.type = CANNON.Body.DYNAMIC; it.byHeld = true; popup('Broke it!', it.body.position, 'small'); I.shatter(it, camera.getWorldDirection(v2), 3, true); }
}
function startSwing(type = defaultAttack()) {
  if (zen) ringChimes();
  if (swingT >= 0 || state !== 'play' || paused || driving) return;
  if (held) { atk = 'held'; CW = heldStats(held); swingT = 0; hitDone = false; swingHold = 0; A.SFX.whoosh(CW.heavy); return; }
  if (W.tool) { atk = 'tool'; CW = W; swingT = 0; hitDone = true; swingHold = 0; useTool(); return; } // tools fire on the press; foam and broom keep going while held
  if (type !== 'swing' && !W.hands) type = 'swing';
  atk = type; CW = type === 'swing' ? W : { ...W, ...ATTACK[type] }; if (type === 'punch') side = -side;
  swingT = 0; hitDone = false; swingHold = 0; A.SFX.whoosh(W.heavy || type === 'kick');
}
function doHit() {
  const origin = camera.getWorldPosition(v1), fwd = camera.getWorldDirection(v2), hits = [];
  chargeK = atk === 'swing' ? Math.max(0, Math.min(1, (swingHold - 0.12) / 0.55)) : 0; heavyNow = atk === 'held' ? !!CW.heavy : (!!W.heavy || chargeK >= 0.6);
  if (chargeK >= 0.6) emit('heavy'); if (atk === 'kick') emit('kick'); if (atk === 'held') emit('heldhit');
  let lampHit = false; // lights overhead: swing up at them
  for (const L of room.lamps) { if (L.broken) continue; v3.subVectors(L.pos, origin); const d = v3.length(); if (d < CW.reach + L.r && v3.normalize().dot(fwd) > 0.86) { breakLamp(L); lampHit = true; } }
  if (chargeK > 0.05) { CW = { ...W, power: W.power + (chargeK >= 0.6 ? 1 : 0), knock: W.knock * (1 + 0.7 * chargeK), area: W.area || chargeK >= 0.9 }; if (chargeK > 0.3) A.SFX.whoosh(true); }
  if (atk === 'kick') { fwd.y -= 0.5; fwd.normalize(); }
  if (figure) {
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const res = figure.hit(origin, fwd, CW.reach, atk === 'swing' || atk === 'held' ? (heavyNow ? 'heavy' : 'weapon') : atk, right);
    if (res) { clayHit(res, fwd); if (atk === 'held') heldImpact(true); return; }
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
  if (atk === 'held') heldImpact(hits.length > 0 || lampHit);
  for (const c of I.chunks) { const p = c.body.position; v3.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    if (v3.length() < CW.reach && v3.normalize().dot(fwd) > CW.cone - 0.15) { c.body.wakeUp(); c.body.velocity.set(dir.x * 6 + rand(-1, 1), 2 + rand(0, 2), dir.z * 6 + rand(-1, 1)); } }
  if (!hits.length && !lampHit && cars.length) { const ch = carRayHit(origin, fwd, CW.reach + 0.4); if (ch) { hitCar(ch.car, ch.point, fwd); return; } }
  if (!hits.length && !lampHit) {
    const h = surfaceHit(origin, fwd, CW.reach + 0.3), f = h && h.object.userData.furn;
    if (f && !f.dead) { hitFurniture(f, h, dir, 1.5 * (CW.power || 1) * (heavyNow ? 2 : 1) * (W.hands && atk !== 'held' ? 0.5 : 1)); if (atk === 'held') heldImpact(true); return; }
    if (h && h.normal.y < 0.7 && (!W.hands || atk === 'held')) damageWall(h);
    if (h && (!W.hands || atk === 'held')) { addMark(h.point, h.normal, 'crack', heavyNow ? 0.55 : 0.34); A.at(h.point, () => A.SFX.thud('wood', 0.8 + chargeK * 0.4, 0.9)); puff(h.point, 0xb0aaa2, 2, 0.2, 0.1, 0.4); I.sparks_(h.point, 6, 0xbbb4aa); shake = Math.max(shake, 0.08 + chargeK * 0.1); recoil = 1; freeze(25); }
    else shake = Math.max(shake, 0.02);
  }
}
function clayHit(res, dir) {
  const p = res.point, hard = atk === 'kick' || heavyNow;
  A.at(p, () => { // the clay takes hits like a sandbag: a dull thud, deeper for kicks and heavy swings
    if (atk === 'slap') { A.SFX.slap(0.8); A.SFX.bag(0.5, 1.15); }
    else A.SFX.bag(hard ? 1 : 0.8, atk === 'kick' ? 0.8 : heavyNow ? 0.85 : atk === 'punch' ? 1 : 0.92); });
  shake = Math.max(shake, hard ? 0.16 : 0.07); recoil = 0.6; freeze(hard ? 35 : 20);
  kick = Math.min(0.08, kick + (hard ? 0.03 : 0.015)); vibrate(hard ? 35 : 15);
  bumpCombo(); emit('hit');
  emit('clay', { atk, lost: res.lost.map(q => q.name), collapsed: res.collapsed });
  addScore(atk === 'slap' ? 2 : 3, p, 'small');
  const names = { head: 'Head off!', arm: 'Arm off!', leg: 'Leg off!', torso: 'Smashed!' };
  for (const part of res.lost) {
    smashed++; byKind.clay = (byKind.clay || 0) + 1;
    const mult = Math.min(4, 1 + Math.floor(combo / 4) * 0.5) * (performance.now() < rageUntil ? 2 : 1);
    addScore(Math.round(part.pts * mult), p, 'big'); if (names[part.name]) popup(names[part.name], { x: p.x, y: p.y + 0.4, z: p.z }, 'small');
    if (performance.now() >= rageUntil) { rageMeter += 10; if (rageMeter >= 100) startRage(); }
  }
  if (res.lost.length) { A.at(p, () => { A.SFX.bag(1, 0.72); A.SFX.land('stone', 0.6); }); slowUntil = performance.now() + 200; flash(0.12); freeze(70); vibrate(60); }
  if (res.collapsed) { banner('Sculpture smashed!'); addScore(80, p, 'big'); figureDowned = true; }
}
function hitItem(it, dir) {
  const rage = performance.now() < rageUntil, p = it.body.position, kind = it.def.kind;
  if (it.key === 'target') { toast('Throw something at it!'); return; }
  if (atk === 'held') it.byHeld = true;
  emit('hit');
  kick = Math.min(0.08, kick + (heavyNow ? 0.03 : 0.015)); vibrate(20);
  const h = itemHitPoint(it), at = h ? h.point : p, lv = 0.8 + chargeK * 0.5, hw = Math.min(1.2, Math.max(0.15, it.def.size * 1.4 + (CW.power || 1) * 0.12 + (heavyNow ? 0.3 : 0))); // how hard the hit should feel: big things and heavy blows land harder
  if (it.def.hp === Infinity) { // metal: it rings, dents and flies, but never breaks
    A.at(at, () => { A.SFX.metal(lv, Math.max(0.7, 1.3 - it.def.size)); if (opts.weapon === 'pan') A.SFX.metal(0.8); });
    if (it.group != null) { carAlarm(it.group); addHeat(2); }
    it.pop = 1; shake = Math.max(shake, 0.12); I.sparks_(at, 8, 0xffd27a); addScore(it.def.pts, p, 'small'); recoil = 1; freeze(14 + 40 * hw);
    if (!it.fixed) { if (h) damageDecal(it, h, 'dent', Math.min(0.2, it.def.size * 0.6)); it.body.wakeUp(); it.body.velocity.set(dir.x * CW.knock, dir.y * CW.knock * 0.5 + 2, dir.z * CW.knock); it.body.angularVelocity.set(rand(-12, 12), rand(-12, 12), rand(-12, 12)); }
    else { const sh = surfaceHit(camera.getWorldPosition(v1), camera.getWorldDirection(v2), CW.reach + 2.5, it.mesh.children); if (sh) addMark(sh.point, sh.normal, 'dent', heavyNow ? 0.45 : 0.3); }
    return;
  }
  it.hp -= CW.power + (CW.bonus === kind ? 1 : 0) + (rage ? 1 : 0);
  if (CW.slice && atk === 'swing') { // the blade passes through: a clean cut along the swing plane
    const fwd = camera.getWorldDirection(new THREE.Vector3()), cut = new THREE.Vector3(0, 1, 0).applyAxisAngle(fwd, rand(-0.8, 0.8));
    recoil = 0.15; freeze(40); slashFx(); A.at(at, () => { A.SFX.metal(0.35, 2.2); A.SFX.whoosh(false); }); addStat('slices');
    return I.shatter(it, dir, 1.2, true, h ? h.point : new THREE.Vector3(p.x, p.y, p.z), false, cut);
  }
  if (it.hp <= 0) { recoil = 0.35; freeze(18 + 70 * hw); shake = Math.max(shake, 0.06 + 0.32 * hw); kick = Math.min(0.12, kick + 0.05 * hw); vibrate(15 + 60 * hw); return I.shatter(it, dir, CW.knock * 0.7, true, h && h.point, opts.weapon === 'hammer' && atk === 'swing'); }
  // still in one piece: leave a crack where it was hit, break the screen, start it smoking
  it.pop = 1; recoil = 1; freeze(14 + 40 * hw);
  if (h) damageDecal(it, h, 'crack', Math.min(0.3, Math.max(0.1, it.def.size * 0.45)));
  if (kind === 'electronics') { crackScreen(it); it.smoking = true; I.sparks_(at, 10, 0xffc531); }
  puff(at, DUST[kind] || 0xbbbbbb, 2, 0.18, 0.2, 0.4);
  if (!it.fixed) { it.body.wakeUp(); it.born = 0; it.body.velocity.set(dir.x * CW.knock, dir.y * CW.knock * 0.5 + 2, dir.z * CW.knock); it.body.angularVelocity.set(rand(-10, 10), rand(-10, 10), rand(-10, 10)); }
  for (let i = 0; i < 5; i++) I.shard(kind, Math.min(0.3, it.def.size) * rand(0.06, 0.13), it.color, at, it.fixed ? new CANNON.Vec3() : it.body.velocity, dir, 2, 0.15, I.photo);
  A.at(at, () => { if (W.hands && atk !== 'held') A.SFX[atk === 'slap' ? 'slap' : atk === 'kick' ? 'kick' : 'punch'](0.8); A.SFX.thud(kind, lv, Math.max(0.75, 1.25 - it.def.size * 0.5)); if (kind === 'electronics') A.SFX.plastic(0.5, 1.2); });
  shake = Math.max(shake, 0.05 + 0.18 * hw); flash(0.03 + 0.05 * hw);
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
  A.SFX.grab(); emit('grab');
}
function throwHeld(power) {
  if (!held) return; const it = held; held = null; charging = false;
  const fwd = camera.getWorldDirection(v2);
  it.body.type = CANNON.Body.DYNAMIC; it.body.wakeUp();
  const speed = (8 + power * 14) / Math.sqrt(Math.max(1, it.def.mass / 1.5));
  it.body.velocity.set(fwd.x * speed, fwd.y * speed + 1.5 + power * 1.5, fwd.z * speed);
  it.body.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
  it.held = false; it.thrown = true; it.born = 0; throws++;
  A.SFX.throw(); shake = Math.max(shake, 0.05 + power * 0.08); emit('throw');
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
  const k = atk === 'held' && swingT >= 0 ? Math.sin(Math.min(1, swingT) * Math.PI) : 0; // swinging it: out, across and back
  v4.copy(cam).addScaledVector(fwd, dist + 0.35 * k).addScaledVector(right, 0.22 - 0.55 * k).add({ x: 0, y: -0.18 + 0.12 * k, z: 0 });
  v4.y = Math.max(v4.y, 0.25);
  const b = held.body.position, f = 14 + 30 * k;
  held.body.velocity.set((v4.x - b.x) * f, (v4.y - b.y) * f, (v4.z - b.z) * f);
  held.body.quaternion.setFromEuler(0, player.yaw + 1.2 * k, -0.8 * k);
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
  } else if (type === 'hole') { // broken-through patch: dark ragged centre, pale torn rim, cracks running out
    g.lineCap = 'round'; g.strokeStyle = 'rgba(15,10,8,.85)';
    for (let k = 0; k < 12; k++) { let a = k / 12 * Math.PI * 2, x = 64, y = 64; g.lineWidth = rand(1, 2.5); g.beginPath(); g.moveTo(x, y); for (let d = 0; d < 60; d += 7) { a += rand(-0.3, 0.3); x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); } g.stroke(); }
    const pts = []; for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = rand(20, 34); pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); }
    g.fillStyle = 'rgba(225,215,195,.9)'; g.beginPath(); pts.forEach(([x, y], i) => { const X = 64 + (x - 64) * 1.18, Y = 64 + (y - 64) * 1.18; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.fill();
    g.fillStyle = '#0b0806'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.fill();
  } else if (type === 'paint') { // a burst paintball: round core, spikes, a few droplets and a drip
    g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2, r = k % 2 ? rand(18, 26) : rand(30, 52); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill();
    for (let k = 0; k < 14; k++) { const a = rand(0, 6.28), r = rand(36, 60); g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(1.5, 5), 0, 7); g.fill(); }
    g.fillRect(rand(56, 66), 64, rand(3, 6), rand(28, 58));
  } else if (type === 'foam') { // extinguisher foam: soft lumpy white
    for (let k = 0; k < 18; k++) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      const x = 64 + rand(-30, 30), y = 64 + rand(-30, 30), s = rand(14, 34); g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); }
  } else if (type === 'powder') { // fine dust from broken china and plaster
    for (let k = 0; k < 900; k++) { const a = rand(0, 6.28), r = Math.pow(Math.random(), 0.6) * 60; g.fillStyle = `rgba(255,255,255,${rand(0.08, 0.5)})`; g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(1, 2.5), rand(1, 2.5)); }
  } else if (type === 'puddle') { // a spill: irregular blob with a soft edge
    const pts = []; for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; pts.push([64 + Math.cos(a) * rand(34, 58), 64 + Math.sin(a) * rand(34, 58)]); }
    g.filter = 'blur(3px)'; g.fillStyle = '#fff'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.fill(); g.filter = 'none';
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
  if (marks.length > 160) { const o = marks.shift(); scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
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
function addScore(n, p, cls) { if (state !== 'play' || room.zen) return; /* the zen garden keeps no score */ score += n; replay.mark(n); popup('+' + n, p, cls); }
function popup(text, p, cls = '') {
  v1.set(p.x, p.y + 0.15, p.z).project(camera); if (v1.z > 1) return;
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = (v1.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-v1.y * 0.5 + 0.5) * innerHeight + 'px';
  $('pops').appendChild(el); el.addEventListener('animationend', () => el.remove());
}
function banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
function flash(a) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .18s'; f.style.opacity = 0; }); }

// ---------- progress: missions during a round, achievements that last, the first-time tutorial
const ACH = [
  ['first', 'First swing', 'Break anything', 'smashed', 1], ['china', 'Bull in a china shop', 'Break 100 ceramic things', 'ceramic', 100],
  ['glass', 'Glass act', 'Break 100 glass things', 'glass', 100], ['tech', 'Tech support', 'Smash 50 electronics', 'electronics', 50],
  ['throws', 'Quarterback', 'Break 50 things by throwing them', 'throwBreaks', 50], ['improv', 'Improviser', 'Break 25 things with something you are holding', 'improv', 25],
  ['boom', 'Demolition expert', 'Set off 25 gas cans', 'gascans', 25], ['chain', 'Chain reaction', 'Break 3 things with one explosion', 'chain', 3],
  ['statues', 'Sculptor', 'Bring down 10 clay statues', 'statues', 10], ['heads', 'Off with his head', 'Knock off 10 statue heads', 'heads', 10],
  ['collapse', 'Bring the house down', 'Wreck 5 shelves or tables', 'collapses', 5], ['lamps', 'Lights out', 'Smash 10 lights', 'lamps', 10],
  ['holes', 'Wall puncher', 'Smash 5 holes in walls', 'holes', 5], ['car', 'Car wrecker', 'Break every window and light on the car in one round', 'carclear', 1],
  ['combo', 'Unstoppable', 'Reach a 20x combo', 'combo', 20], ['menace', 'Absolute menace', 'Smash 45 things in one round', 'round', 45],
  ['missions', 'Mission ace', 'Complete 20 missions', 'missions', 20], ['wanted', 'Most wanted', 'Reach five stars of heat Downtown', 'stars', 5], ['letgo', 'Let it go', 'Smash 25 things with your own words on them', 'words', 25], ['tidy', 'Spotless', 'Sweep a whole room clean', 'spotless', 1], ['builder', 'Architect', 'Set up 20 builds in Build & smash', 'builds', 20], ['wrecker', 'Demolition derby', 'Wreck 5 cars in the open city', 'wrecks', 5], ['strike', 'Strike!', 'Bowl a strike in the bowling alley', 'strikes', 1], ['ninja', 'Clean cut', 'Slice 30 things in half with the katana', 'slices', 30],
].map(([id, name, desc, stat, need]) => ({ id, name, desc, stat, need }));
const REWARD = { collapse: 'Fire axe', missions: 'Golden bat', lamps: 'Blackout mode (any room, by flashlight)' };
let achQueue = [], achUntil = 0, persistT = 0;
function addStat(k, n = 1) { save.stats[k] = (save.stats[k] || 0) + n; checkAch(); }
function maxStat(k, v) { if (v > (save.stats[k] || 0)) { save.stats[k] = v; checkAch(); } }
function checkAch() {
  for (const a of ACH) if (!save.ach[a.id] && (save.stats[a.stat] || 0) >= a.need) { save.ach[a.id] = Date.now(); achQueue.push(a); }
  clearTimeout(persistT); persistT = setTimeout(persist, 400);
}
function showAch(now) {
  if (!achQueue.length || now < achUntil) return; const a = achQueue.shift(); achUntil = now + 3200;
  const el = $('ach'); el.innerHTML = `<div class="lbl">Achievement unlocked</div><b>${a.name}</b><small>${a.desc}</small>${REWARD[a.id] ? `<small style="color:var(--yellow)">Unlocked: ${REWARD[a.id]}</small>` : ''}`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); A.SFX.unlock();
}
const hasKey = k => I.list.some(i => !i.dead && i.key === k);
const MISSIONS = [
  { id: 'glass5', text: 'Break 5 glass things', need: 5, time: 18, ev: 'break', test: e => e.kind === 'glass' },
  { id: 'tech3', text: 'Smash 3 electronics', need: 3, time: 20, ev: 'break', test: e => e.kind === 'electronics', req: () => I.list.filter(i => !i.dead && i.def.kind === 'electronics').length >= 3 },
  { id: 'throw3', text: 'Break 3 things by throwing them', need: 3, time: 25, ev: 'break', test: e => e.thrown },
  { id: 'boom2', text: 'Set off 2 gas cans', need: 2, time: 25, ev: 'break', test: e => e.key === 'gascan', req: () => I.list.filter(i => !i.dead && i.key === 'gascan').length >= 2 },
  { id: 'combo8', text: 'Reach an 8x combo', need: 8, time: 18, ev: 'combo', max: true },
  { id: 'improv2', text: 'Break 2 things with something you are holding', need: 2, time: 30, ev: 'break', test: e => e.held },
  { id: 'wreck', text: 'Wreck a shelf or table', need: 1, time: 30, ev: 'collapse', req: () => room.furniture.some(f => !f.dead) },
  { id: 'lights', text: 'Smash 2 lights', need: 2, time: 30, ev: 'lamp', req: () => room.lamps.filter(L => !L.broken).length >= 2 },
  { id: 'head', text: "Knock the statue's head off", need: 1, time: 25, ev: 'clay', test: e => e.lost.includes('head'), req: () => figure && figure.alive },
  { id: 'kick5', text: 'Kick the statue 5 times', need: 5, time: 18, ev: 'clay', test: e => e.atk === 'kick', req: () => figure && figure.alive && W.hands },
  { id: 'car3', text: 'Break 3 car windows or lights', need: 3, time: 25, ev: 'break', test: e => e.key === 'carglass' || e.key === 'carlight', req: () => hasKey('carglass') || hasKey('carlight') },
  { id: 'big3', text: 'Smash 3 big things', need: 3, time: 25, ev: 'break', test: e => e.size > 0.45, req: () => I.list.filter(i => !i.dead && i.def.size > 0.45 && i.def.hp !== Infinity).length >= 3 },
  { id: 'alarm3', text: 'Set off 3 car alarms', need: 3, time: 30, ev: 'alarm', req: () => room.cars && room.cars.length >= 3 },
  { id: 'heat3', text: 'Reach 3 stars of heat', need: 3, time: 35, ev: 'heat', max: true, req: () => !!room.heat },
  { id: 'hole', text: 'Smash a hole in a wall', need: 1, time: 25, ev: 'hole', req: () => !W.hands },
];
let mission = null, nextMission = 0, lastMission = '';
function emit(ev, d = {}) {
  if (ev === 'break') { addStat('smashed'); if (['ceramic', 'glass', 'electronics'].includes(d.kind)) addStat(d.kind); if (d.thrown) addStat('throwBreaks'); if (d.held) addStat('improv'); if (d.key === 'gascan') addStat('gascans'); }
  if (ev === 'clay') { if (d.lost.includes('head')) addStat('heads'); if (d.collapsed) addStat('statues'); }
  if (ev === 'combo') maxStat('combo', d.n);
  if (ev === 'collapse') addStat('collapses'); if (ev === 'lamp') addStat('lamps'); if (ev === 'hole') addStat('holes');
  tutEvent(ev);
  if (!mission || state !== 'play' || mission.def.ev !== ev || (mission.def.test && !mission.def.test(d))) return;
  mission.count = mission.def.max ? Math.max(mission.count, d.n || 0) : mission.count + 1;
  if (mission.count >= mission.def.need) {
    score += 150; replay.mark(150); announce('Mission complete!'); A.SFX.unlock(); addStat('missions');
    $('missionText').textContent = `${mission.def.text}  ✓  +150`; $('mission').classList.add('done'); setTimeout(() => $('mission').classList.add('hidden'), 1400);
    mission = null; nextMission = performance.now() + rand(7000, 11000);
  }
}
function updateMission(now) {
  if (tut || !['classic', 'zen'].includes(opts.gm)) { $('mission').classList.add('hidden'); return; }
  if (!mission && now > nextMission) {
    const ok = MISSIONS.filter(m => m.id !== lastMission && (!m.req || m.req()));
    if (ok.length) { const def = pick(ok); mission = { def, count: 0, until: now + def.time * 1000 }; lastMission = def.id; $('mission').classList.remove('hidden', 'done', 'fail'); A.SFX.restock(); }
  }
  if (!mission) return;
  if (now > mission.until) { $('mission').classList.add('fail'); toast('Mission failed'); mission = null; nextMission = now + 6000; setTimeout(() => $('mission').classList.add('hidden'), 900); return; }
  $('missionText').textContent = `${mission.def.text}  ${Math.min(mission.count, mission.def.need)}/${mission.def.need}`;
  $('missionFill').style.width = (100 * (mission.until - now) / (mission.def.time * 1000)) + '%';
}

let tut = null, tutAgain = false;
function startTut() {
  tut = { i: 0, dist: 0, yaw: 0, lx: player.x, lz: player.z, ly: player.yaw, steps: [
    { id: 'move', text: isTouch ? 'Drag on the left side of the screen to walk' : 'Walk around with W A S D' },
    { id: 'look', text: isTouch ? 'Drag on the right side to look around' : 'Move the mouse to look around' },
    { id: 'swing', text: isTouch ? 'Tap Smash to hit something' : 'Click to hit something' },
    W.hands ? { id: 'kick', text: isTouch ? 'Tap Kick to kick' : 'Press Space to kick' } : { id: 'heavy', text: isTouch ? 'Hold Smash to wind up a heavy swing, then let go' : 'Hold the click to wind up a heavy swing, then let go' },
    { id: 'grab', text: isTouch ? 'Tap Grab to pick up the highlighted thing' : 'Press E or right-click to grab the highlighted thing' },
    { id: 'heldhit', text: isTouch ? 'Tap Smash to hit with what you are holding' : 'Click to hit things with what you are holding' },
    { id: 'throw', text: isTouch ? 'Tap Throw to throw it (hold it to throw harder)' : 'Press E to throw it' }] };
  showTut();
}
function showTut() { $('tut').classList.remove('hidden'); $('tutStep').textContent = `Tutorial ${tut.i + 1} of ${tut.steps.length}`; $('tutText').textContent = tut.steps[tut.i].text; }
function tutNext() { A.SFX.coin(); tut.i++; tut.dist = 0; tut.yaw = 0; if (tut.i >= tut.steps.length) tutDone(false); else showTut(); }
function tutDone(skipped) { tut = null; save.tut = true; persist(); $('tut').classList.add('hidden'); if (!skipped) { banner("You're ready!"); A.SFX.unlock(); } nextMission = performance.now() + 6000; goldenAt = performance.now() + 9000; }
function tutEvent(ev) { if (!tut) return; const id = tut.steps[tut.i].id; if ((id === 'swing' && (ev === 'hit' || ev === 'break')) || id === ev) tutNext(); }
function updateTut() {
  if (!tut) return; const id = tut.steps[tut.i].id;
  tut.dist += Math.hypot(player.x - tut.lx, player.z - tut.lz); tut.yaw += Math.abs(player.yaw - tut.ly) + Math.abs(player.pitch - (tut.lp ?? player.pitch));
  tut.lx = player.x; tut.lz = player.z; tut.ly = player.yaw; tut.lp = player.pitch;
  if ((id === 'move' && tut.dist > 2) || (id === 'look' && tut.yaw > 1.5)) tutNext();
}

// ---------- wrecking the room: tables and shelves give out, lights pop, walls get holes
let loose = [], wallHits = [];
function hitFurniture(f, h, dir, dmg) {
  f.hp -= dmg * (CW.bonus === 'wood' && atk !== 'held' ? 2.5 : 1); emit('hit');
  addMark(h.point, h.normal, 'crack', 0.25 + 0.08 * dmg); puff(h.point, 0xb89a70, 2, 0.25, 0.15, 0.45); I.sparks_(h.point, 5, 0xc8a878);
  A.at(h.point, () => { A.SFX.wood(0.9, 0.85); if (f.hp < f.maxHp * 0.6) A.SFX.crack(0.5, rand(1.1, 1.3)); }); shake = Math.max(shake, 0.1); recoil = 1; freeze(30); kick = Math.min(0.08, kick + 0.02);
  for (const it of I.list) if (!it.dead && !it.held && it.body.position.distanceTo(new CANNON.Vec3(h.point.x, h.point.y, h.point.z)) < 1.6) { it.body.wakeUp(); it.body.velocity.y += rand(0.3, 1.2); } // things on it jump
  addScore(3, h.point, 'small');
  if (f.hp <= f.maxHp * 0.4 && !f.warned) { f.warned = true; toast(`The ${f.name} is about to give way`); }
  if (f.hp <= 0) collapse(f, dir);
}
function collapse(f, dir) {
  if (f.dead) return; f.dead = true;
  const oi = room.obstacles.indexOf(f.obstacle); if (oi >= 0) room.obstacles.splice(oi, 1);
  room.statics = room.statics.filter(m => !f.parts.includes(m));
  const cx = f.parts.reduce((t, m) => t + m.position.x, 0) / f.parts.length, cz = f.parts.reduce((t, m) => t + m.position.z, 0) / f.parts.length;
  for (const m of f.parts) {
    if (m.userData.body) world.removeBody(m.userData.body);
    const [w, h, d] = m.userData.size, body = new CANNON.Body({ mass: Math.max(1.5, Math.min(25, w * h * d * 500)), collisionFilterGroup: 4, collisionFilterMask: 1, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), position: new CANNON.Vec3(m.position.x, m.position.y, m.position.z) });
    body.quaternion.set(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w);
    // legs and posts get knocked out from under it, so the top really comes down instead of resting on them
    const ox = m.position.x - cx, oz = m.position.z - cz, ol = Math.hypot(ox, oz) || 1, tall = h > Math.max(w, d);
    if (tall) { body.velocity.set(ox / ol * rand(2.5, 4) + dir.x * 1.5, rand(-0.5, 0.5), oz / ol * rand(2.5, 4) + dir.z * 1.5); body.angularVelocity.set(oz / ol * 7, 0, -ox / ol * 7); }
    else { body.velocity.set(dir.x * rand(1, 2.5), rand(-0.5, 0.8), dir.z * rand(1, 2.5)); body.angularVelocity.set(rand(-4, 4), rand(-1, 1), rand(-4, 4)); }
    body.linearDamping = 0.05; body.angularDamping = 0.2; world.addBody(body);
    const len = Math.max(w, h, d); // anything you could pick up becomes a weapon; the top stays a heavy slab
    if (Math.min(w, h, d) < 0.1 && Math.max(w, h, d) / Math.min(w, h, d) > 4 && !(w > 0.5 && d > 0.5)) I.adopt(len > 1.6 ? 'beam' : h >= len ? 'leg' : 'plank', m, body);
    else loose.push({ mesh: m, body });
  }
  for (const it of I.list) if (!it.dead && !it.held) { it.body.wakeUp(); it.born = 0; }
  const c = f.parts[0].position.clone();
  A.at(c, () => { A.SFX.crack(0.85, rand(0.85, 1)); A.SFX.crack(0.45, rand(1.1, 1.3)); A.SFX.wood(0.7, 0.7); A.SFX.body(1.2); A.SFX.land('wood', 1); });
  shake = Math.max(shake, 0.4); slowUntil = performance.now() + 500; freeze(80); flash(0.15); vibrate(120); puff(c, 0xb0a090, 8, 0.8, 0.4, 0.5);
  if (state === 'play') { addScore(60, c, 'big'); popup(f.name === 'shelf' ? 'Shelf down!' : 'Table down!', { x: c.x, y: c.y + 0.5, z: c.z }, 'small'); bumpCombo(); }
  emit('collapse');
}
function breakLamp(L) {
  if (L.broken) return; L.broken = true; L.base = L.light.intensity; L.dying = performance.now() + 450;
  A.at(L.pos, () => { A.SFX.glass(0.8, 1.2); A.SFX.zap(0.9); }); I.sparks_(L.pos, 18, 0xffe9a0);
  for (let i = 0; i < 6; i++) I.shard('glass', rand(0.01, 0.025), 0xfff6e0, L.pos, new CANNON.Vec3(), new THREE.Vector3(0, -1, 0), 1, 0.1);
  if (state === 'play') { addScore(20, L.pos, 'small'); bumpCombo(); }
  emit('lamp');
}
function updateLamps(now) {
  for (const L of room.lamps) {
    if (!L.dying) continue;
    if (now > L.dying) { L.dying = 0; L.light.intensity = 0; L.meshes.forEach(m => { m.visible = false; m.userData.broken = true; }); }
    else { const on = Math.random() < 0.45; L.light.intensity = on ? L.base : 0; L.meshes.forEach(m => { m.visible = on; }); } // sputters, then goes dark
  }
  for (const it of I.list) if (it.thrown && !it.dead) for (const L of room.lamps) if (!L.broken && L.pos.distanceTo(it.mesh.position) < L.r + it.def.size * 0.5) breakLamp(L);
}
function damageWall(h) {
  let w = wallHits.find(q => q.p.distanceTo(h.point) < 0.35); if (!w) wallHits.push(w = { p: h.point.clone(), n: 0, hole: 0 });
  const sledge = opts.weapon === 'hammer' && atk === 'swing'; w.n += sledge ? 3 : heavyNow ? 2 : 1;
  if (w.n >= 16 && w.hole === 2 && breakThrough(h)) { w.hole = 3; return; }
  if ((w.n >= 4 && !w.hole) || (w.n >= 9 && w.hole === 1)) {
    w.hole++; addMark(h.point, h.normal, 'hole', (w.hole === 1 ? 0.5 : 0.85) * (sledge ? 1.4 : 1));
    for (let i = 0; i < (sledge ? 14 : 8); i++) I.shard('stone', sledge ? rand(0.04, 0.09) : rand(0.02, 0.05), 0xb8b0a4, h.point, new CANNON.Vec3(), h.normal.clone().setY(0.3).normalize(), 3, 0.15);
    puff(h.point, 0xc8c0b4, 5, 0.5, 0.2, 0.55); A.at(h.point, () => { A.SFX.stone(1, 0.9); A.SFX.land('stone', 1); }); shake = Math.max(shake, 0.2);
    if (room.pipes && h.point.y > 0.4 && h.point.y < 2.2 && (w.hole === 1 && (!pipes.length || Math.random() < 0.5)) && pipes.length < 3) burstPipe(h.point, h.normal);
    if (w.hole === 1) { addScore(30, h.point, 'big'); popup('Hole!', { x: h.point.x, y: h.point.y + 0.3, z: h.point.z }, 'small'); emit('hole'); }
  }
}

// ---------- burst pipes: water sprays out of a hole in an apartment wall and pools on the floor
let pipes = [];
const DROP = new THREE.SphereGeometry(1, 6, 4);
function burstPipe(p, n, geyser) {
  const mat = S.mat('liquid', 0x9cc8e8), puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 24), S.mat('liquid', 0x7fa8c8));
  puddle.rotation.x = -Math.PI / 2; puddle.position.set(p.x + n.x * 0.6, 0.012, p.z + n.z * 0.6); puddle.scale.setScalar(0.05); scene.add(puddle);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, geyser ? 0.2 : 0.5, 10), S.mat('metal', geyser ? 0x6a6e74 : 0xb87333)); pipe.position.copy(p).addScaledVector(n, geyser ? -0.1 : 0.03); scene.add(pipe); // the copper pipe shows in the hole
  const sound = A.loopAt('spray', p, 0.45);
  A.at(p, () => { A.SFX.splash(1); A.SFX.metal(0.6, 0.8); });
  pipes.push({ p: p.clone(), n: n.clone(), mat, puddle, pipe, sound, drops: [], until: performance.now() + 22000, acc: 0, geyser });
  popup(geyser ? 'Hydrant!' : 'Burst pipe!', { x: p.x, y: p.y + 0.3, z: p.z }, 'small'); addScore(40, p, 'big'); emit('pipe');
}
function updatePipes(dt, now) {
  for (const P of pipes) {
    const on = now < P.until, k = on ? 1 : 0;
    if (!on && P.sound) { P.sound.stop(); P.sound = null; }
    P.acc += dt * (on ? (P.geyser ? 160 : 90) : 4); // drips once it runs dry
    while (P.acc > 1 && P.drops.length < (P.geyser ? 260 : 160)) { P.acc--; const m = new THREE.Mesh(DROP, P.mat); m.scale.setScalar(rand(0.008, 0.02)); m.position.copy(P.p); scene.add(m);
      P.drops.push({ m, v: P.geyser ? new THREE.Vector3(rand(-0.9, 0.9) * k, rand(5, 8.5) * k, rand(-0.9, 0.9) * k) : new THREE.Vector3(P.n.x * rand(1.5, 3.2) * k + rand(-0.4, 0.4) * k, rand(-0.2, 1.2) * k, P.n.z * rand(1.5, 3.2) * k + rand(-0.4, 0.4) * k) }); }
    P.drops = P.drops.filter(d => { d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt); if (d.m.position.y > 0.02) return true; scene.remove(d.m); return false; });
    if (on) P.puddle.scale.setScalar(Math.min(1.6, P.puddle.scale.x + dt * 0.07));
  }
}
function clearPipes() { for (const P of pipes) { P.sound?.stop(); P.drops.forEach(d => scene.remove(d.m)); scene.remove(P.puddle, P.pipe); } pipes = []; }

// ---------- heat (Downtown): wreck enough and the cops come. Stars raise the score multiplier; five stars in a timed round ends it: Busted.
let heat = 0, lastHeat = 0, stars = 0, siren = null, bustedAt = 0, busted = false, alarms = [];
const heatStars = () => (room && room.heat ? stars : 0);
function resetHeat() { heat = 0; stars = 0; bustedAt = 0; busted = false; siren?.stop(); siren = null; alarms.forEach(a => a.sound?.stop()); alarms = []; $('heat').classList.add('hidden'); }
function addHeat(n) { if (!room.heat || state !== 'play' || ['targets', 'build', 'clean'].includes(opts.gm)) return; heat = Math.min(100, heat + n); lastHeat = performance.now(); }
function carAlarm(g) {
  if (alarms.some(a => a.g === g && a.until > performance.now())) return;
  const c = room.cars[g], pos = { x: c.x, y: 0.9, z: c.z };
  alarms.push({ g, until: performance.now() + 9000, sound: A.loopAt('alarm', pos, 0.55) });
  addHeat(8); popup('Car alarm!', { x: c.x, y: 1.8, z: c.z }, 'small'); emit('alarm');
  room.cars.forEach((o, g2) => { if (g2 !== g && Math.hypot(o.x - c.x, o.z - c.z) < 12) setTimeout(() => state === 'play' && carAlarm(g2), rand(600, 1500)); }); // the others nearby join in
}
function updateHeat(dt, now) {
  if (!room.heat) return;
  for (const a of alarms) if (a.sound && now > a.until) { a.sound.stop(); a.sound = null; }
  for (const it of I.list) if (it.group != null && it.key === 'carlight' && !it.dead) { const on = alarms.some(a => a.g === it.group && a.sound); it.mesh.visible = !on || Math.floor(now / 350) % 2 === 0; } // hazard lights blink with the alarm
  if (now - lastHeat > 5000 && !bustedAt) heat = Math.max(0, heat - dt * 2.5); // lie low and it cools off
  const s = Math.min(5, Math.floor(heat / 18));
  if (s !== stars) { if (s > stars) { flash(0.08); toast(s >= 5 ? 'Every cop in the city is coming' : s >= 3 ? 'Sirens are getting closer' : 'Someone called the cops'); emit('heat', { n: s }); maxStat('stars', s); } stars = s; }
  const el = $('heat'); el.classList.toggle('hidden', state !== 'play' || stars === 0);
  el.querySelector('.stars').innerHTML = [0, 1, 2, 3, 4].map(i => `<i class="${i < stars ? 'on' : ''}">★</i>`).join('');
  if (stars >= 2 && !siren) siren = A.loopAt('siren', { x: 0, y: 2, z: -24 }, 0);
  if (siren) { if (stars < 2) { siren.stop(); siren = null; } else siren.set(0.08 + 0.09 * stars); }
  const flashOn = stars >= 4 && Math.floor(now / 260) % 2 === 0;
  if (room.copLights) { room.copLights[0].intensity = stars >= 4 ? (flashOn ? S.realistic ? 60 : 30 : 0) : 0; room.copLights[1].intensity = stars >= 4 ? (!flashOn ? S.realistic ? 60 : 30 : 0) : 0; }
  if (stars >= 5 && opts.gm === 'classic' && !bustedAt) { bustedAt = now + 6000; banner('Busted in 6...'); }
  $('heatLbl').textContent = bustedAt ? `Cops arrive in ${Math.max(0, Math.ceil((bustedAt - now) / 1000))}` : `Heat x${(1 + stars * 0.15).toFixed(2)}`;
  if (bustedAt && now > bustedAt && state === 'play') { busted = true; endSession(); }
}

// ---------- smash your stress: your own words, written on things in the room (they never leave this device)
const wordList = () => save.words.split(/[,\n]/).map(w => w.trim()).filter(Boolean).slice(0, 6).map(w => w.slice(0, 22));
let wordIx = 0;
function wordTex(text) {
  return canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 150; g.font = `800 ${size}px Rubik, Arial, sans-serif`; while (g.measureText(text).width > w * 0.88 && size > 40) { size -= 8; g.font = `800 ${size}px Rubik, Arial, sans-serif`; }
    g.save(); g.translate(w / 2, h / 2); g.rotate(rand(-0.08, 0.08));
    g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(text, 0, 0); // marker on a paper-white halo so it reads on anything
    g.fillStyle = pick(['#c8101e', '#141418', '#1a3aa8']); g.fillText(text, 0, 0); g.restore();
  });
}
function labelMesh(root, text) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), box = new THREE.Box3();
  root.traverse(o => { if (o.isMesh && !o.userData.ol && !o.userData.hl && o.geometry) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld))); } });
  if (box.isEmpty()) return null;
  const s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), flat = s.y < 0.35 * Math.max(s.x, s.z);
  const w = Math.max(0.16, flat ? Math.min(s.x, s.z) * 0.95 : s.x * 0.98), h = w * 0.55;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: wordTex(text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide }));
  m.userData.ol = true;
  if (flat) { m.rotation.x = -Math.PI / 2; m.position.set(c.x, box.max.y + 0.004, c.z); } else m.position.set(c.x, c.y + Math.min(s.y * 0.1, 0.05), box.max.z + 0.004);
  root.add(m); return m;
}
function applyWords() {
  const words = wordList(); if (!words.length) return;
  for (const it of I.list) {
    if (it.word || it.dead || it.fixed || it.debris || it.def.hp === Infinity || it.key === 'gascan' || it.key === 'domino' || Math.random() > 0.6) continue;
    const word = words[wordIx++ % words.length]; if (labelMesh(it.mesh, word)) it.word = word;
  }
  if (figure && figure.alive && !figure.word) { const torso = figure.parts.find(q => q.name === 'torso'); if (torso && labelMesh(torso.mesh, words[0])) figure.word = words[0]; }
}

// ---------- what a break leaves behind: settling debris you can hear, spills that spread, dust that hangs in the air
const SPILL = { eggs: [0xf0c020], pumpkin: [0xe8862a], bottle: [0x5a1020, 0xc89030, 0x9cc8e8], beermug: [0xd8a040], wineglass: [0x6a1020], fishbowl: [0x9cc8e8], watercooler: [0x9cc8e8], jug: [0x9cc8e8, 0xf0ece0], mug: [0x4a2a14], cup: [0x9cc8e8, 0x6a3a1a], teapot: [0x8a5a2a], jar: [0xc87a1a, 0x9a2030] };
let spills = [];
function afterBreak(it, p) {
  const d = it.def, k = d.kind === 'explosive' ? 'metal' : d.kind, n = Math.round(2 + Math.min(1, d.size) * 7);
  for (let i = 0; i < n; i++) setTimeout(() => { if (state === 'play') A.at({ x: p.x + rand(-0.7, 0.7), y: 0.05, z: p.z + rand(-0.7, 0.7) }, () => A.SFX.land(k, rand(0.1, 0.32))); }, rand(220, 1800));
  if (['ceramic', 'stone', 'wood', 'electronics', 'explosive'].includes(d.kind)) {
    puff(p, DUST[d.kind] || 0xbbbbbb, 3, 0.7 + d.size, 0.06, S.realistic ? 0.14 : 0.2, 4.5); // a slow cloud that hangs and drifts
    const fl = surfaceHit(new THREE.Vector3(p.x, p.y + 0.1, p.z), new THREE.Vector3(0, -1, 0), 3);
    if (fl && (d.kind === 'ceramic' || d.kind === 'stone')) addMark(fl.point, fl.normal, 'powder', 0.35 + d.size * 0.8, DUST[d.kind]);
  }
  const cols = SPILL[it.key]; if (cols) spill(p, pick(cols), d.size);
  if (it.word) { popup(`${it.word}: smashed`, { x: p.x, y: p.y + 0.5, z: p.z }, 'big'); addStat('words'); }
}
function spill(p, color, size) {
  const fl = surfaceHit(new THREE.Vector3(p.x, p.y + 0.05, p.z), new THREE.Vector3(0, -1, 0), 3); if (!fl || fl.normal.y < 0.7) return;
  const mat = S.realistic ? new THREE.MeshStandardMaterial({ color, alphaMap: markTex('puddle'), transparent: true, opacity: 0.82, roughness: 0.04, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
    : new THREE.MeshBasicMaterial({ color, alphaMap: markTex('puddle'), transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 6.28); m.position.copy(fl.point).y += 0.006; m.scale.setScalar(0.05); scene.add(m);
  spills.push({ m, target: 0.35 + size * 1.6, t: 0 }); A.at(fl.point, () => A.SFX.splash(0.25));
  if (spills.length > 16) { const o = spills.shift(); scene.remove(o.m); o.m.material.dispose(); }
}
function updateSpills(dt) { for (const s of spills) if (s.t < 1) { s.t = Math.min(1, s.t + dt / 2.2); const k = 1 - Math.pow(1 - s.t, 3); s.m.scale.setScalar(0.05 + (s.target - 0.05) * k); } }

// ---------- tools: paintball gun, bowling ball, fire extinguisher, broom
let shots = [], balls = [], foamSnd = null, foamT = 0, sweepT = 0, broomPhase = 0, bin = null, swept = 0, cleanPrev = { gm: 'zen', weapon: 'bat' }, spotless = false;
const PAINT = [0xff2a6a, 0x2ad1ff, 0xffd02a, 0x7aff3a, 0xb04aff, 0xff7a1a];
function resetTools() { gravDrop(true); wrecks.forEach(w => killWreck(w)); wrecks = []; shots.forEach(s => scene.remove(s.m)); balls.forEach(b => { world.removeBody(b.body); scene.remove(b.mesh); }); shots = []; balls = []; toolStop(); bin = null; swept = 0; spotless = false; spills = []; }
function toolStop() { if (foamSnd) { foamSnd.stop(); foamSnd = null; } }
function toolOrigin() { const o = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3()), r = new THREE.Vector3().crossVectors(f, camera.up).normalize(); return { o: o.clone().addScaledVector(f, 0.45).addScaledVector(r, 0.16).add({ x: 0, y: -0.14, z: 0 }), f, r }; }
function useTool() {
  const { o, f } = toolOrigin();
  if (W.tool === 'paint') {
    const color = pick(PAINT), m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), S.mat('paint', color)); m.position.copy(o); scene.add(m);
    const cam = camera.getWorldPosition(new THREE.Vector3()); ray.set(cam, f); ray.far = 30; // fly from the barrel to whatever is under the crosshair
    const aim = ray.intersectObjects(room.statics.concat(I.list.filter(i => !i.dead).map(i => i.mesh)), true).find(x => !x.object.userData.ol && !x.object.userData.hl);
    const dir = (aim ? aim.point.clone() : cam.clone().addScaledVector(f, 20)).sub(o).normalize();
    shots.push({ m, v: dir.multiplyScalar(38).add({ x: rand(-0.7, 0.7), y: rand(-0.3, 0.6), z: rand(-0.7, 0.7) }), color, life: 0 });
    A.SFX.pball(0.8); recoil = 0.5; kick = Math.min(0.05, kick + 0.008);
  }
  if (W.tool === 'bowl') {
    const r = 0.11, body = new CANNON.Body({ mass: 7, shape: new CANNON.Sphere(r), position: new CANNON.Vec3(o.x, Math.max(r + 0.05, o.y - 0.7), o.z) });
    const flat = new THREE.Vector3(f.x, 0, f.z).normalize(); body.velocity.set(flat.x * 9, 0.5, flat.z * 9); body.angularVelocity.set(flat.z * 80, 0, -flat.x * 80); body.linearDamping = 0.01; body.angularDamping = 0.02;
    body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 2.5) A.at(body.position, () => A.SFX.thud('stone', Math.min(1, v / 8), 0.7)); });
    world.addBody(body); const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), S.mat('paint', pick([0x2a3a8a, 0x8a1a2a, 0x1a1a1e, 0x1a6a4a]))); mesh.castShadow = true; scene.add(mesh); S.outline(mesh, 1.04);
    balls.push({ body, mesh }); if (balls.length > 4) { const b = balls.shift(); world.removeBody(b.body); scene.remove(b.mesh); }
    A.at(body.position, () => A.SFX.roll(0.9)); weaponMesh.visible = false; setTimeout(() => { if (weaponMesh) weaponMesh.visible = true; }, 600);
  }
  if (W.tool === 'foam' && !foamSnd) foamSnd = A.loopAt('spray', camera.position, 0.5, 1.35);
  if (W.tool === 'blow' && !foamSnd) foamSnd = A.loopAt('engine', null, 0.22, 2.5);
  if (W.tool === 'wreck') wreckingBall();
  if (W.tool === 'cannon') fireCannon();
  if (W.tool === 'grav') gravClick();
}
function updateTools(dt, now) {
  // paintballs fly, then burst on whatever they reach first
  for (const s of shots) {
    s.life += dt; s.v.y -= 9.8 * dt * 0.35; const step = s.v.clone().multiplyScalar(dt), len = step.length();
    const targets = room.statics.concat(I.list.filter(i => !i.dead).map(i => i.mesh));
    ray.set(s.m.position, step.clone().normalize()); ray.far = len + 0.02; const h = ray.intersectObjects(targets, true).find(x => x.face && !x.object.userData.ol && !x.object.userData.hl);
    if (h) {
      s.dead = true; const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      let it = null; for (let o = h.object; o && !it; o = o.parent) it = I.list.find(i => i.mesh === o) || null;
      if (it) { damageDecal(it, { point: h.point, normal: n }, 'paint', Math.min(0.4, 0.14 + it.def.size * 0.55), s.color);
        if (!it.fixed) { it.body.wakeUp(); it.born = 0; it.body.velocity.x += step.x / len * 1.6 / Math.max(1, it.def.mass); it.body.velocity.z += step.z / len * 1.6 / Math.max(1, it.def.mass); }
        if ((it.def.kind === 'glass' && it.def.size < 0.25) || (it.def.kind === 'ceramic' && it.def.size < 0.16)) I.shatter(it, step.clone().normalize(), 2, true, h.point);
        addScore(1, h.point, 'small'); emit('hit'); }
      else addMark(h.point, n, 'paint', rand(0.45, 0.8), s.color);
      A.at(h.point, () => A.SFX.splat(0.9)); puff(h.point, s.color, 2, 0.12, 0.1, 0.45);
    } else s.m.position.add(step);
    if (s.life > 1.5) s.dead = true;
  }
  shots = shots.filter(s => { if (s.dead) scene.remove(s.m); return !s.dead; });
  for (const b of balls) { b.mesh.position.copy(b.body.interpolatedPosition); b.mesh.quaternion.copy(b.body.interpolatedQuaternion); }
  const on = state === 'play' && !paused && mouseHeld && !held;
  // extinguisher: a cone of foam that shoves things and coats surfaces
  if (W.tool === 'blow') { // leaf blower: a strong cone of air, no foam
    if (!on) toolStop();
    else { const { o, f } = toolOrigin(); foamT += dt; if (foamT > 0.05) { foamT = 0; puff(o.clone().addScaledVector(f, 0.6), 0xc8c0b0, 1, 0.14, 0, 0.25, 0.5, f.clone().multiplyScalar(9)); }
      for (const it of I.list) { if (it.dead || it.fixed || it.held) continue; const q = it.body.position, v = new THREE.Vector3(q.x - o.x, q.y - o.y, q.z - o.z), dist = v.length(); if (dist > 6 || v.normalize().dot(f) < 0.88) continue;
        it.body.wakeUp(); it.born = 0; const k = 30 * dt * (1 - dist / 6.5) / Math.max(0.5, it.def.mass); it.body.velocity.x += f.x * k; it.body.velocity.y += 0.3 * k; it.body.velocity.z += f.z * k; }
      for (const c of I.chunks) { const q = c.body.position, v = new THREE.Vector3(q.x - o.x, q.y - o.y, q.z - o.z), dist = v.length(); if (dist > 6 || v.normalize().dot(f) < 0.85) continue; c.body.wakeUp(); c.body.velocity.x += f.x * 26 * dt; c.body.velocity.y += 4 * dt; c.body.velocity.z += f.z * 26 * dt; }
      fanFire(o, f, dt);
      for (const p of puffs) { const v = p.m.position.clone().sub(o); if (v.length() < 6 && v.normalize().dot(f) > 0.8) p.v.addScaledVector(f, 12 * dt); } } }
  updateGrav(dt); updateWreck(dt);
  if (W.tool === 'foam') {
    if (!on) toolStop();
    else {
      const { o, f } = toolOrigin(); foamT += dt; douse(o, f, 4.5);
      puff(o.clone().addScaledVector(f, 0.15), 0xffffff, 2, 0.22, 0, 0.75, 0.8, f.clone().multiplyScalar(7));
      if (foamT > 0.07) { foamT = 0; const d = f.clone().add({ x: rand(-0.14, 0.14), y: rand(-0.14, 0.1), z: rand(-0.14, 0.14) }).normalize(), h = surfaceHit(o, d, 4.5); if (h) addMark(h.point, h.normal, 'foam', rand(0.3, 0.55), 0xffffff); }
      for (const it of I.list) { if (it.dead || it.fixed || it.held) continue; const q = it.body.position, v = new THREE.Vector3(q.x - o.x, q.y - o.y, q.z - o.z), dist = v.length(); if (dist > 4 || v.normalize().dot(f) < 0.86) continue;
        it.body.wakeUp(); it.born = 0; const k = 14 * dt * (1 - dist / 4.5) / Math.sqrt(Math.max(0.3, it.def.mass)); it.body.velocity.x += f.x * k; it.body.velocity.y += 0.15 * k; it.body.velocity.z += f.z * k; }
      for (const c of I.chunks) { const q = c.body.position, v = new THREE.Vector3(q.x - o.x, q.y - o.y, q.z - o.z), dist = v.length(); if (dist > 4 || v.normalize().dot(f) < 0.86) continue; c.body.wakeUp(); c.body.velocity.x += f.x * 10 * dt; c.body.velocity.z += f.z * 10 * dt; }
    }
  }
  // broom: side-to-side strokes push shards along the floor; anything that reaches the bin is gone
  if (W.tool === 'broom') {
    if (on) { broomPhase += dt * 6; sweepT += dt; }
    if (on && sweepT > 0.26) {
      sweepT = 0; const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x), cx = player.x + fwd.x * 1.0, cz = player.z + fwd.z * 1.0; let moved = 0;
      const push = (body, light) => { const q = body.position, dx = q.x - cx, dz = q.z - cz; if (q.y > 0.6 || dx * dx + dz * dz > 1.7) return; body.wakeUp(); const s = Math.sin(broomPhase) * 0.3, k = light ? rand(2.6, 3.6) : rand(0.5, 0.9);
        let d = fwd; if (bin) { const tb = new THREE.Vector3(bin.x - q.x, 0, bin.z - q.z), L = tb.length(); if (L < 6 && tb.normalize().dot(fwd) > 0) d = fwd.clone().multiplyScalar(0.25).addScaledVector(tb, 0.75).normalize(); } // sweeping toward the bin guides the pile into it
        body.velocity.set(d.x * k + side.x * s, 0.15, d.z * k + side.z * s); moved++; };
      for (const c of I.chunks) push(c.body, true);
      for (const it of I.list) if (!it.dead && !it.fixed && !it.held && it.def.size < 0.35) push(it.body, false);
      A.SFX.sweep(0.9, Math.min(1, moved / 8));
    }
    if (bin) {
      for (const c of [...I.chunks]) { const q = c.body.position; const db = Math.hypot(q.x - bin.x, q.z - bin.z);
        if (W.tool === 'broom' && db < 1.1 && db > 0.45 && q.y < 0.5) { c.body.wakeUp(); c.body.velocity.x = (bin.x - q.x) / db * 1.3; c.body.velocity.z = (bin.z - q.z) / db * 1.3; } // the bin's lip catches what lands near it
        if (q.y < 0.7 && db < 0.55) { world.removeBody(c.body); scene.remove(c.mesh); I.chunks.splice(I.chunks.indexOf(c), 1); swept++; if (swept % 3 === 0) A.at({ x: bin.x, y: 0.3, z: bin.z }, () => A.SFX.land(c.kind || 'glass', 0.25)); } }
      if (opts.gm === 'clean') { if (!spotless && swept > 0 && I.chunks.length === 0) { spotless = true; banner('Spotless!'); A.SFX.unlock(); addStat('spotless'); } }
    }
  }
}
function poseTool() {
  const b = Math.sin(player.bob) * 0.012, type = weaponMesh.userData.pose;
  pivot.scale.setScalar(camera.aspect < 1 ? 0.75 : 1);
  if (type === 'broom') { pivot.rotation.set(0, Math.sin(broomPhase) * (mouseHeld ? 0.35 : 0.04), 0); pivot.position.set(0.04, b - (mouseHeld ? 0.04 : 0), 0); return; }
  if (type === 'ext') { pivot.rotation.set(recoil * 0.2, 0, 0); pivot.position.set(camera.aspect < 1 ? 0.2 : 0.4, -0.36 + b, -0.6); return; }
  if (type === 'ball') { pivot.rotation.set(0, 0, 0); pivot.position.set(0.3, -0.36 + b, -0.6); return; }
  pivot.rotation.set(recoil * 0.25, 0, 0); pivot.position.set(camera.aspect < 1 ? 0.16 : 0.3, -0.3 + b, -0.5 + recoil * 0.05);
}
function spawnBin() {
  if (bin) return; const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), bx = room.bounds;
  const x = Math.max(bx[0] + 0.6, Math.min(bx[1] - 0.6, player.x + 1.4)), z = Math.max(bx[2] + 0.6, Math.min(bx[3] - 0.6, player.z + fwd.z * 1.2));
  const g = new THREE.Group(), mat = S.mat('plastic', 0x2a4a3a); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.6, 24, 1, true), mat); c.material = mat.clone(); c.material.side = THREE.DoubleSide; c.position.y = 0.3;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), S.mat('plastic', 0x1a2a22)); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; g.add(c, floor); g.position.set(x, 0, z); scene.add(g); S.outline(c, 1.03);
  bin = { x, z, mesh: g };
}
function cleanUp() {
  cleanPrev = { gm: opts.gm, weapon: opts.weapon }; opts.gm = 'clean'; equip('broom'); swept = 0; spotless = false;
  state = 'play'; paused = false; timeLeft = Infinity; mission = null;
  $('end').classList.add('hidden'); $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  spawnBin(); A.setMusicStyle('calm'); A.setMusic(opts.music, true); A.startAmbience(room.amb); banner('Sweep it into the bin'); toast('Hold click to sweep');
  if (!isTouch) lockMouse();
}

// ---------- katana slash, wrecking ball, gravity gun, ground pound
function slashFx() { // a bright arc across the view, gone in a blink
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32, 1, -0.4, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(0, -0.1, -0.6); m.rotation.z = rand(-0.8, 0.8); camera.add(m); fx.push({ mesh: m, life: 0, max: 0.18, grow: 0.25, op: 0.7, cam: true });
}
let wrecks = [], wreckT = 0;
function killWreck(w) { world.removeConstraint(w.con); world.removeBody(w.body); world.removeBody(w.anchor); scene.remove(w.mesh, w.chain); }
function wreckingBall() {
  const now = performance.now(); if (now < wreckT) return; wreckT = now + 2200;
  const cam = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3());
  let target = cam.clone().addScaledVector(f, 5); const h = surfaceHit(cam, f, 14); if (h) target = h.point.clone().addScaledVector(h.normal, 0.5);
  const R = room.open ? 0.9 : 0.45, back = new THREE.Vector3(-f.x, 0, -f.z).normalize();
  target.y = Math.max(R + 0.05, Math.min(target.y, 2));
  const up = surfaceHit(target, new THREE.Vector3(0, 1, 0), 12), L = up ? Math.max(1.6, up.point.y - 0.15 - target.y) : (room.open ? 9 : 5.5); // hang it from the ceiling indoors
  const anchorP = target.clone().add({ x: 0, y: L, z: 0 }), a = up ? 1.2 : 1.25, start = anchorP.clone().addScaledVector(back, Math.sin(a) * L).add({ x: 0, y: -Math.cos(a) * L, z: 0 });
  const anchor = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(anchorP.x, anchorP.y, anchorP.z) }); world.addBody(anchor);
  const body = new CANNON.Body({ mass: room.open ? 1500 : 300, shape: new CANNON.Sphere(R), position: new CANNON.Vec3(start.x, start.y, start.z), linearDamping: 0.02 }); world.addBody(body);
  const con = new CANNON.DistanceConstraint(body, anchor, L); world.addConstraint(con);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), S.mat('metal', 0x2a2a30)); mesh.castShadow = true; scene.add(mesh); S.outline(mesh, 1.03);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), S.mat('metal', 0x5a5a60)); scene.add(chain);
  const w = { body, anchor, con, mesh, chain, until: now + 7000, lastHit: 0, anchorP };
  body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v < 2.5) return; const t = performance.now();
    const f2 = room.furniture.find(q => !q.dead && q.parts.some(m => m.userData.body === e.body)); if (f2) { f2.hp -= v * 0.9; if (f2.hp <= 0) collapse(f2, new THREE.Vector3(body.velocity.x, 0, body.velocity.z).normalize()); }
    const hitIt = I.list.find(i => i.body === e.body && !i.dead && i.def.hp !== Infinity); if (hitIt) { const d = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z).normalize(); setTimeout(() => !hitIt.dead && I.shatter(hitIt, d, 4, false), 0); }
    if (t - w.lastHit < 250) return; w.lastHit = t; const p = body.position;
    A.at(p, () => { A.SFX.stone(Math.min(1.2, v / 6), 0.7); A.SFX.body(1); A.SFX.metal(0.5, 0.5); }); shake = Math.max(shake, Math.min(0.5, v / 18)); puff(p, 0xb0a898, 4, 0.6, 0.3, 0.5);
    if (!e.body.mass && !f2 && Math.abs(e.contact.ni.y) < 0.5) { const n = new THREE.Vector3(e.contact.ni.x, e.contact.ni.y, e.contact.ni.z); if (e.contact.bi === body) n.negate(); addMark(new THREE.Vector3(p.x, p.y, p.z).addScaledVector(n, -R), n, 'hole', 1.3 * R); } });
  wrecks.push(w); A.SFX.whoosh(true); toast('Here comes the wrecking ball'); emit('wreck');
}
function updateWreck(dt) {
  const now = performance.now();
  wrecks = wrecks.filter(w => { if (now > w.until) { killWreck(w); return false; }
    const p = w.body.position; w.mesh.position.set(p.x, p.y, p.z); const a = w.anchorP, mid = new THREE.Vector3((a.x + p.x) / 2, (a.y + p.y) / 2, (a.z + p.z) / 2), len = a.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
    w.chain.position.copy(mid); w.chain.scale.set(1, len, 1); w.chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(a.x - p.x, a.y - p.y, a.z - p.z).normalize()); return true; });
}
let grav = null, gravBeam = null, gravSnd = null;
function gravTarget() {
  const cam = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3()); ray.set(cam, f); ray.far = 15;
  const its = I.list.filter(i => !i.dead && !i.fixed && !i.held), objs = its.map(i => i.mesh).concat(cars.filter(c => !c.dead && c !== driving).map(c => c.g));
  const h = ray.intersectObjects(objs, true).find(x => !x.object.userData.ol && !x.object.userData.hl); if (!h) return null;
  for (let o = h.object; o; o = o.parent) { const it = its.find(i => i.mesh === o); if (it) return { body: it.body, it, mass: it.def.mass, size: it.def.size }; const c = cars.find(c => c.g === o); if (c) { if (c.ai) freeTraffic(c); return { body: c.body, car: c, mass: c.type.mass, size: 4.5 }; } }
  return null;
}
function gravClick() {
  if (grav) { // fling it
    const f = camera.getWorldDirection(new THREE.Vector3()), b = grav.body, sp = grav.car ? 16 : Math.min(30, 34 / Math.sqrt(Math.max(1, grav.mass / 2)));
    b.velocity.set(f.x * sp, f.y * sp + 2, f.z * sp); b.angularVelocity.set(rand(-4, 4), rand(-4, 4), rand(-4, 4));
    if (grav.it) { const it = grav.it; it.thrown = true; it.born = 0; setTimeout(() => { it.thrown = false; }, 4000); } // thrown things break on landing
    A.SFX.zap(0.7); A.SFX.whoosh(true); shake = Math.max(shake, 0.12); emit('throw'); gravDrop(true); return;
  }
  const t = gravTarget(); if (!t) { A.SFX.static(0.6); return; }
  grav = t; t.body.wakeUp(); A.SFX.zap(0.5); gravSnd = A.loopAt('engine', null, 0.12, 3.2);
  gravBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1, 8), new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.75, depthWrite: false })); scene.add(gravBeam);
}
function gravDrop(quiet) { if (!grav && !gravBeam) return; grav = null; gravBeam && scene.remove(gravBeam); gravBeam = null; gravSnd?.stop(); gravSnd = null; }
function updateGrav(dt) {
  if (!grav) return; if (W.tool !== 'grav' || (grav.it && grav.it.dead) || (grav.car && grav.car.dead)) { gravDrop(true); return; }
  const cam = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3()), want = cam.clone().addScaledVector(f, 2.4 + grav.size * 0.9), b = grav.body; want.y = Math.max(want.y, 0.9 + grav.size * 0.5);
  b.wakeUp(); b.velocity.set((want.x - b.position.x) * 9, (want.y - b.position.y) * 9, (want.z - b.position.z) * 9); b.angularVelocity.scale(0.9, b.angularVelocity);
  const { o } = toolOrigin(), to = new THREE.Vector3(b.position.x, b.position.y, b.position.z), len = o.distanceTo(to);
  gravBeam.position.copy(o).lerp(to, 0.5); gravBeam.scale.set(1, len, 1); gravBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(o).normalize()); gravBeam.material.opacity = 0.5 + Math.random() * 0.4;
}
let pound = null, poundT = 0;
const poundY = () => { if (!pound) return 0; const t = (performance.now() - pound.t0) / 1000; return t < 0.28 ? Math.sin(t / 0.28 * Math.PI / 2) * 0.55 : Math.max(0, 0.55 * (1 - (t - 0.28) / 0.1)); };
function groundPound() { // jump and slam: a shockwave through everything around you
  const now = performance.now(); if (state !== 'play' || paused || driving || now < poundT) return; poundT = now + 1500; pound = { t0: now }; A.SFX.whoosh(true);
  setTimeout(() => {
    pound = null; if (state !== 'play') return; const P = new THREE.Vector3(player.x, 0.05, player.z), R = 4.5;
    A.at(P, () => { A.SFX.stone(1.3, 0.6); A.SFX.body(1.4); A.SFX.land('stone', 1); }); shake = Math.max(shake, 0.55); kick = Math.min(0.12, kick + 0.06); freeze(70); vibrate(140);
    addMark(P.clone().add({ x: 0, y: 0.03, z: 0 }), new THREE.Vector3(0, 1, 0), 'crack', 2.2); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; puff(P.clone().add({ x: Math.cos(a) * 0.8, y: 0.1, z: Math.sin(a) * 0.8 }), 0xb0a898, 1, 0.6, 0.2, 0.5, 1.2, new THREE.Vector3(Math.cos(a) * 4, 0.6, Math.sin(a) * 4)); }
    for (const it of I.list) { if (it.dead || it.held) continue; const q = it.body.position, d = Math.hypot(q.x - P.x, q.z - P.z); if (d > R) continue; const k = 1 - d / R;
      if (!it.fixed) { it.body.wakeUp(); it.born = 0; it.body.velocity.set(it.body.velocity.x + (q.x - P.x) / (d || 1) * 4 * k, it.body.velocity.y + 6 * k, it.body.velocity.z + (q.z - P.z) / (d || 1) * 4 * k); }
      if (it.def.hp !== Infinity && d < 2.6 && (it.def.size < 0.4 || it.key === 'mini' || it.key === 'minitree')) setTimeout(() => !it.dead && I.shatter(it, new THREE.Vector3(q.x - P.x, 0.6, q.z - P.z).normalize(), 3, false), 40 + d * 60); }
    for (const c of I.chunks) { const q = c.body.position, d = Math.hypot(q.x - P.x, q.z - P.z); if (d < R) { c.body.wakeUp(); c.body.velocity.y += 5 * (1 - d / R); } }
    for (const f of room.furniture) { if (f.dead) continue; const c = f.parts[0].position, d = Math.hypot(c.x - P.x, c.z - P.z); if (d < 2.6) { f.hp -= 4; if (f.hp <= 0) collapse(f, new THREE.Vector3(c.x - P.x, 0, c.z - P.z).normalize()); } }
    if (state === 'play') { addScore(10, P, 'small'); emit('pound'); addStat('pounds'); if (floorY === 0) poundFloor(P); }
  }, 380);
}

// ---------- Build & smash: set-ups placed where you look
const PRESETS = ['Draw dominoes', 'Crate tower', 'Glass pyramid', 'Old TV wall', 'Bottle pins', 'Plate towers', 'Gas can row'];
function placePreset(i) {
  if (state !== 'play' || paused) return; if (i === 0) return toggleDraw();
  if (I.list.filter(x => !x.dead).length > 170) { toast('That is a lot of stuff. Smash some first'); return; }
  const o = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3());
  let h = surfaceHit(o, f, 7); if (!h || h.normal.y < 0.7) h = surfaceHit(o.clone().add(new THREE.Vector3(f.x, 0, f.z).normalize().multiplyScalar(2.2)), new THREE.Vector3(0, -1, 0), 4);
  if (!h) return;
  const yaw = player.yaw, fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), base = h.point, y0 = base.y;
  const at = (a, b) => ({ x: base.x + fw.x * a + rt.x * b, z: base.z + fw.z * a + rt.z * b });
  const put = (key, a, b, y, o2) => { const q = at(a, b), it = I.add(key, q.x, y, q.z, yaw, o2 || {}); it.body.sleep(); it.born = performance.now(); return it; };
  const stack = (key, a, b, n) => { let y = y0; for (let k = 0; k < n; k++) { const it = put(key, a, b, y); y = it.body.position.y + (it.body.position.y - y) - 0.01; } };
  if (i === 0) for (let k = 0; k < 16; k++) put('domino', 0.3 * k, Math.sin(k * 0.35) * 0.3, y0);
  if (i === 1) for (const b of [-0.5, 0, 0.5]) stack('crate', 0, b, 4);
  if (i === 2) { let y = y0; [4, 3, 2, 1].forEach((n, row) => { let top = y; for (let k = 0; k < n; k++) { const it = put('cup', 0, (k - (n - 1) / 2) * 0.135, y, { color: 0xdff3ff }); top = it.body.position.y + (it.body.position.y - y) - 0.012; } y = top; }); }
  if (i === 3) for (const b of [-0.55, 0.55]) stack('crt', 0, b, 2);
  if (i === 4) { let k = 0; for (let row = 0; row < 4; row++) for (let c = 0; c <= row; c++) { put('bottle', row * 0.2, (c - row / 2) * 0.2, y0); k++; } }
  if (i === 5) for (const b of [-0.4, 0, 0.4]) stack('platestack', 0, b, 3);
  if (i === 6) for (let k = 0; k < 5; k++) put('gascan', k * 0.7, 0, y0);
  applyWords(); A.SFX.grab(); popup(PRESETS[i], { x: base.x, y: base.y + 0.6, z: base.z }, 'small'); addStat('builds');
}

// ---------- open world: drivable cars, first/third person, mini-map
let cars = [], driving = null, view = save.view || 'fp', tpCam = null, avatar = null, mapBg = null, mapT = 0, engine = null, skidT = 0, chase = null, traffic = [];
const SEDAN = { mass: 900, force: 3300, steer: 0.55, slip: 2.6, half: [0.9, 0.42, 2.1], hy: 0.62, cabin: [0.82, 0.24, 0.9, 1.22, -0.22], r: 0.34, conn: 0.62, pitch: 0.75, ext: [1.0, 2.25],
  wheels: [[0.85, 1.35], [-0.85, 1.35], [0.85, -1.35], [-0.85, -1.35]] };
const CAR_TYPES = {
  sedan: { ...SEDAN, name: 'Sedan' },
  taxi: { ...SEDAN, name: 'Taxi', pitch: 0.8 },
  van: { name: 'Van', mass: 1500, force: 3500, steer: 0.45, slip: 2.1, half: [0.97, 0.9, 2.35], hy: 1.25, cabin: null, r: 0.37, conn: 0.66, pitch: 0.58, ext: [1.07, 2.45],
    wheels: [[0.88, 1.6], [-0.88, 1.6], [0.88, -1.6], [-0.88, -1.6]] },
  sports: { name: 'Sports car', mass: 820, force: 5600, steer: 0.62, slip: 3.4, half: [0.97, 0.3, 2.15], hy: 0.55, cabin: [0.72, 0.19, 0.85, 0.98, -0.25], r: 0.33, conn: 0.58, pitch: 0.98, ext: [1.07, 2.3],
    wheels: [[0.88, 1.38], [-0.88, 1.38], [0.88, -1.38], [-0.88, -1.38]] },
};
const pickType = () => { const r = Math.random(); return r < 0.4 ? 'sedan' : r < 0.55 ? 'taxi' : r < 0.77 ? 'van' : 'sports'; };
const typeColor = t => t === 'taxi' ? 0xf2c21a : pick(t === 'sports' ? [0xd01820, 0x1a5ad8, 0xf0f0f0, 0x101014, 0xf07a10, 0x2ab04a] : t === 'van' ? [0xe8e8ec, 0x8a8f96, 0x2a5ab3, 0x5a3a24, 0x2a6a4a] : [0xb3202a, 0x2a5ab3, 0x2a8a4a, 0xd9a22a, 0x8a8f96, 0x1a1a1e, 0xe8e8ec, 0x6a2a8a]);
function carBody(type, x, z, ry, kin) { // the chassis (and cabin) as boxes; parked cars also rest on four wheel balls
  const T = CAR_TYPES[type], b = new CANNON.Body(kin ? { mass: 0, type: CANNON.Body.KINEMATIC, position: new CANNON.Vec3(x, 0, z) } : { mass: T.mass, position: new CANNON.Vec3(x, 0.02, z), allowSleep: true, sleepSpeedLimit: 0.3, sleepTimeLimit: 0.6 });
  b.carType = T; b.addShape(new CANNON.Box(new CANNON.Vec3(...T.half)), new CANNON.Vec3(0, T.hy, 0));
  if (T.cabin) b.addShape(new CANNON.Box(new CANNON.Vec3(T.cabin[0], T.cabin[1], T.cabin[2])), new CANNON.Vec3(0, T.cabin[3], T.cabin[4]));
  if (!kin) { wheelShapes(b, true); b.angularDamping = 0.5; b.linearDamping = 0.08; }
  b.quaternion.setFromEuler(0, ry, 0); world.addBody(b); return b;
}
function carMesh(color, type = 'sedan') {
  const M = S.mat, g = new THREE.Group(), glass = [], lights = [];
  const merged = parts => { // one mesh per material: a car is a handful of draw calls instead of thirty
    const by = new Map(); parts.updateMatrixWorld(true);
    parts.traverse(m => { if (!m.isMesh) return; const k = m.material.uuid; if (!by.has(k)) by.set(k, { mat: m.material, geos: [] }); const ge = m.geometry.clone().applyMatrix4(m.matrixWorld); for (const a of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(a)) ge.deleteAttribute(a); by.get(k).geos.push(ge.index ? ge : ge); });
    return [...by.values()].map(({ mat, geos }) => new THREE.Mesh(mergeGeometries(geos.map(x => x.index ? x.toNonIndexed() : x), false), mat));
  };
  const pane = (w, h, x, y, z, ry, rx) => { const p = DEFS.carglass.make(M, 0x9fb7c4, { w, h }).mesh; p.position.set(x, y, z); p.rotation.set(rx, ry, 0); g.add(p); glass.push(p); };
  const B = new THREE.Group(), paint = M('paint', color), dark = M('plastic', 0x15151a), box = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; B.add(m); return m; };
  const wheel = (r, wd, x, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wd, 20), dark); m.position.set(x, r, z); m.rotation.z = Math.PI / 2; B.add(m); const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wd + 0.02, 14), M('metal', 0xb8bcc4)); hub.position.copy(m.position); hub.rotation.z = Math.PI / 2; B.add(hub); };
  let lightAt;
  if (type === 'van') { // tall box van: big windscreen, sliding-door side, flat back
    box(1.94, 1.8, 4.7, paint, 0, 1.25, 0); box(1.98, 0.24, 0.16, dark, 0, 0.45, 2.38); box(1.98, 0.24, 0.16, dark, 0, 0.45, -2.38); box(1.4, 0.3, 0.04, dark, 0, 0.8, 2.36); box(0.02, 0.06, 1.3, dark, 0.98, 1.2, -0.6); box(0.02, 0.06, 1.3, dark, -0.98, 1.2, -0.6);
    for (const [x, z] of CAR_TYPES.van.wheels) wheel(0.37, 0.26, x, z);
    pane(1.72, 0.72, 0, 1.72, 2.37, 0, -0.12); pane(1.5, 0.5, 0, 1.75, -2.37, 0, 0);
    for (const s of [-1, 1]) { pane(0.9, 0.6, s * 0.98, 1.72, 1.55, Math.PI / 2, 0); pane(1.4, 0.45, s * 0.98, 1.78, -0.6, Math.PI / 2, 0); }
    lightAt = { fy: 0.85, fz: 2.37, fx: 0.72, ry: 1.2, rz: -2.37 };
  } else if (type === 'sports') { // low wedge with a small raked cabin and a rear wing
    box(1.94, 0.46, 4.3, paint, 0, 0.53, 0); box(1.8, 0.16, 1.2, paint, 0, 0.82, 1.4, -0.12); box(1.46, 0.34, 1.7, paint, 0, 0.96, -0.3); box(1.6, 0.05, 0.32, dark, 0, 1.02, -2.0); for (const s of [-1, 1]) box(0.05, 0.22, 0.12, dark, s * 0.6, 0.88, -2.0);
    box(1.96, 0.12, 0.14, dark, 0, 0.36, 2.14); box(1.96, 0.12, 0.14, dark, 0, 0.36, -2.14);
    for (const [x, z] of CAR_TYPES.sports.wheels) wheel(0.33, 0.3, x, z);
    pane(1.4, 0.48, 0, 1.0, 0.66, 0, -0.95); pane(1.3, 0.36, 0, 1.0, -1.2, 0, 0.8);
    for (const s of [-1, 1]) pane(1.25, 0.3, s * 0.74, 0.98, -0.3, Math.PI / 2, 0);
    lightAt = { fy: 0.62, fz: 2.16, fx: 0.68, ry: 0.66, rz: -2.16 };
  } else { // sedan and taxi
    B.add(DEFS.carbody.make(M, color).mesh);
    pane(1.56, 0.6, 0, 1.15, 0.6, 0, -0.5); pane(1.56, 0.5, 0, 1.15, -1.05, 0, 0.5);
    for (const s of [-1, 1]) for (const z of [0.15, -0.55]) pane(0.62, 0.42, s * 0.84, 1.13, z, Math.PI / 2, 0);
    if (type === 'taxi') { box(0.62, 0.2, 0.3, M('emissive', 0xfff2b0), 0, 1.58, -0.22); box(1.82, 0.08, 0.02, M('plastic', 0x15151a), 0, 0.78, 0); }
    lightAt = { fy: 0.72, fz: 2.12, fx: 0.62, ry: 0.72, rz: -2.12 };
  }
  for (const m of merged(B)) { g.add(m); if (m.material !== undefined && m.material.type !== 'MeshBasicMaterial') S.outline(m, 1.03); }
  if (type === 'taxi') { const t = canvasTex(256, 64, (c2, w, h) => { c2.fillStyle = '#fff2b0'; c2.fillRect(0, 0, w, h); c2.fillStyle = '#15151a'; c2.font = '900 46px Rubik, Arial'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('TAXI', w / 2, h / 2 + 2); });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.16), new THREE.MeshBasicMaterial({ map: t })); p.position.set(0, 1.58, -0.22 + s * 0.152); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); } }
  const lg = new THREE.Group(), L = lightAt;
  for (const s of [-1, 1]) { const f = DEFS.carlight.make(M, 0xfff6d0, { w: 0.34, h: 0.14, glow: true }).mesh; f.position.set(s * L.fx, L.fy, L.fz); lg.add(f);
    const r = DEFS.carlight.make(M, 0xff2a2a, { w: 0.3, h: 0.12, glow: true }).mesh; r.position.set(s * L.fx, L.ry, L.rz); lg.add(r); }
  for (const m of merged(lg)) { g.add(m); lights.push(m); }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(g); return { g, glass, lights };
}
function wheelShapes(body, on) { // parked cars rest on four balls; a driven car rides on raycast wheels instead
  const T = body.carType || SEDAN, base = T.cabin ? 2 : 1;
  if (on) for (const [x, z] of T.wheels) body.addShape(new CANNON.Sphere(T.r), new CANNON.Vec3(x, T.r, z));
  else while (body.shapes.length > base) body.removeShape(body.shapes[body.shapes.length - 1]);
}
function setupOpenWorld() {
  cars = []; traffic = []; driving = null; engine?.stop(); engine = null; chase = null; mapBg = null; human.weapon = null;
  if (avatar) { avatar.removeFromParent(); avatar = null; }
  if (!tpCam) tpCam = new THREE.PerspectiveCamera(save.set.fov, innerWidth / innerHeight, 0.05, 900);
  tpCam.far = room.far || 80; tpCam.fov = save.set.fov; tpCam.updateProjectionMatrix();
  if (room.far) { camera.far = room.far; camera.updateProjectionMatrix(); }
  $('minimap').classList.toggle('hidden', !room.mapRects);
  for (const [x, z, ry] of room.cityCars || []) {
    const type = pickType(), color = typeColor(type), body = carBody(type, x, z, ry, false); body.sleep();
    const car = { body, ...carMesh(color, type), type: CAR_TYPES[type], hp: type === 'van' ? 130 : 100, dead: false, speed: 0, alarm: null, smokeT: 0, color };
    body.addEventListener('collide', e => carImpact(car, e)); cars.push(car);
  }
  if (room.signals) spawnTraffic(S.quality === 'low' ? 6 : 11);
  syncCars();
  if (room.open || view === 'tp') loadHuman();
}
const carYaw = car => { const q = car.body.quaternion; return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); };
function syncCars() { for (const c of cars) { const b = c.body, ai = !!c.ai; c.g.position.copy(ai ? b.position : b.interpolatedPosition || b.position); c.g.quaternion.copy(ai ? b.quaternion : b.interpolatedQuaternion || b.quaternion); } } // traffic is placed directly each frame
function nearCar() { let best = null, bd = 3.2; for (const c of cars) { if (c.dead || c.ai) continue; const d = Math.hypot(c.body.position.x - player.x, c.body.position.z - player.z); if (d < bd) { bd = d; best = c; } } return best; }
function carKey() {
  if (!cars.length || state !== 'play' || paused) return false;
  if (driving) { exitCar(); return true; }
  const c = !held && nearCar(); if (!c) return false; enterCar(c); return true;
}
function enterCar(car) {
  const b = car.body; wheelShapes(b, false); b.wakeUp(); b.position.y += 0.15;
  const v = new CANNON.RaycastVehicle({ chassisBody: b, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  const T = car.type;
  for (const [x, z] of T.wheels)
    v.addWheel({ radius: T.r, directionLocal: new CANNON.Vec3(0, -1, 0), suspensionStiffness: T === CAR_TYPES.van ? 34 : T === CAR_TYPES.sports ? 52 : 40, suspensionRestLength: 0.32, frictionSlip: T.slip, dampingRelaxation: 2.4, dampingCompression: 4.5, maxSuspensionForce: 1e6, rollInfluence: 0.02,
      axleLocal: new CANNON.Vec3(-1, 0, 0), chassisConnectionPointLocal: new CANNON.Vec3(x, T.conn, z), maxSuspensionTravel: 0.3, customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true });
  v.addToWorld(world); car.vehicle = v; driving = car; car.alarm?.stop(); car.alarm = null;
  if (held) dropHeld(); setHighlight(null);
  engine = A.loopAt('engine', null, 0.35, T.pitch); radio(false); toast(isTouch ? `${T.name}: joystick to drive · Grab to get out` : `${T.name}: W/S drive · A/D steer · Space handbrake · R radio · E get out · V camera`);
  emit('drive');
}
const STATIONS = ['SMASH FM', 'Chill Waves', 'Radio off']; let station = 0;
function radio(next) { // in the car the music becomes a radio: R changes station
  if (next) { station = (station + 1) % STATIONS.length; A.SFX.static(); }
  const st = STATIONS[station];
  if (st === 'Radio off') A.setMusic(false, true); else { A.setMusicStyle(st === 'SMASH FM' ? 'heavy' : 'calm'); A.setMusic(true, true); }
  if (next || station !== 2) toast(`Radio: ${st}`);
}
function exitCar(eject) {
  const car = driving; if (!car) return;
  car.vehicle.removeFromWorld(world); car.vehicle = null; wheelShapes(car.body, true); driving = null; engine?.stop(); engine = null;
  A.setMusicStyle(opts.gm === 'zen' || room.calm ? 'calm' : 'heavy'); A.setMusic(opts.music, true); // the radio goes off with the engine
  const yaw = carYaw(car), side = eject ? 2.6 : 1.7, x = car.body.position.x + Math.cos(yaw) * side, z = car.body.position.z - Math.sin(yaw) * side;
  player.x = x; player.z = z; player.yaw = yaw + Math.PI; player.pitch = -0.1; updatePlayer(0);
}
function updateDriving(dt) {
  const car = driving, v = car.vehicle, b = car.body; if (!v) return;
  let thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  let steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) - joy.x;
  thr = Math.max(-1, Math.min(1, thr)); steer = Math.max(-1, Math.min(1, steer));
  const q = b.quaternion, fwd = q.vmult(new CANNON.Vec3(0, 0, 1)), right = q.vmult(new CANNON.Vec3(1, 0, 0)), vf = b.velocity.dot(fwd), vs = b.velocity.dot(right);
  car.speed = b.velocity.length();
  const T = car.type, maxF = car.dead ? 0 : T.force * (car.hp > 30 ? 1 : 0.55), hand = keys.Space;
  let force = 0, brake = 0;
  if (thr > 0) force = vf < -1 ? 0 : maxF * thr; else if (thr < 0) { if (vf > 1.2) brake = 60 * -thr; else force = maxF * 0.55 * thr; } else brake = 2;
  if (thr > 0 && vf < -1) brake = 60;
  for (const i of [2, 3]) { v.applyEngineForce(-force, i); v.setBrake(hand ? 90 : brake, i); }
  for (const i of [0, 1]) { v.setBrake(brake, i); v.setSteeringValue(steer * T.steer * (1 - Math.min(0.65, car.speed / 38)), i); }
  b.velocity.y = Math.min(b.velocity.y, 6);
  player.x = b.position.x; player.z = b.position.z; player.bob += dt * 2;
  if (engine) { engine.rate(T.pitch + Math.min(1.6, Math.abs(vf) / 14) + (thr !== 0 ? 0.15 : 0)); engine.set(0.28 + Math.min(0.25, Math.abs(thr) * 0.15 + car.speed / 120)); }
  skidT -= dt; if ((Math.abs(vs) > 4.5 || (hand && car.speed > 8)) && skidT <= 0) { skidT = 0.45; A.SFX.skid(Math.min(1, Math.abs(vs) / 9 + 0.3)); }
  const [bx1, bx2, bz1, bz2] = room.bounds; if (b.position.x < bx1 - 2 || b.position.x > bx2 + 2 || b.position.z < bz1 - 2 || b.position.z > bz2 + 2) { b.position.set(Math.max(bx1, Math.min(bx2, b.position.x)), 0.6, Math.max(bz1, Math.min(bz2, b.position.z))); b.velocity.setZero(); }
  if (b.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y < 0.2 && car.speed < 1) { b.quaternion.setFromEuler(0, carYaw(car), 0); b.position.y += 1; } // flipped: put it back on its wheels
}
function carImpact(car, e) {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v < 2.5 || state !== 'play') return;
  if (car.ai && (cars.some(c => c.body === e.body && !c.ai) || v > 6)) freeTraffic(car);
  const other = e.body, it = I.list.find(i => i.body === other && !i.dead), oc = cars.find(c => c.body === other);
  if (it) { if (it.def.hp !== Infinity || it.key === 'hydrant') { const dir = new THREE.Vector3(car.body.velocity.x, 0.4, car.body.velocity.z).normalize(); setTimeout(() => !it.dead && I.shatter(it, dir, Math.min(9, v), true), 0); } else return; }
  if (oc && oc !== car) damageCar(oc, v * 0.8);
  if (it && v < 6) return; // small things don't hurt the car much
  damageCar(car, v);
}
function damageCar(car, v, point) {
  if (car.dead) return; const tnow = performance.now(); if (!point && tnow - (car.lastHit || 0) < 350) return; car.lastHit = tnow; // one crash fires many contacts: count it once
  car.hp -= Math.max(0, v - 3) * 3.6; if (!car.ai && v > 3) cityAlarm(car);
  const p = car.body.position;
  if (v > 5 || point) breakCarWindow(car, point);
  A.at(p, () => { A.SFX.metal(Math.min(1.2, v / 8), 0.6); if (v > 7) A.SFX.crash?.(Math.min(1, v / 12)) || A.SFX.metal(1, 0.5); });
  if (car === driving) { shake = Math.max(shake, Math.min(0.5, v / 25)); kick = Math.min(0.08, kick + v / 200); vibrate(Math.min(120, v * 8)); }
  else if (!car.alarm && room.heat) { car.alarm = A.loopAt('alarm', { x: p.x, y: 0.9, z: p.z }, 0.5); setTimeout(() => { car.alarm?.stop(); car.alarm = null; }, 9000); emit('alarm'); }
  if (state === 'play') { addScore(Math.round(v * 3), { x: p.x, y: p.y + 1.6, z: p.z }, v > 8 ? 'big' : 'small'); addHeat(2 + v * 0.3); bumpCombo(); }
  if (car.hp <= 0) wreckCar(car);
}
function breakCarWindow(car, point) {
  const live = car.glass.filter(g => g.visible); if (!live.length) return;
  let pane = live[0]; if (point) { let bd = 1e9; for (const g of live) { const d = g.getWorldPosition(v4).distanceTo(point); if (d < bd) { bd = d; pane = g; } } } else pane = pick(live);
  pane.visible = false; const wp = pane.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < 12; i++) I.shard('glass', rand(0.02, 0.05), 0xcfe0ea, wp, car.body.velocity, new THREE.Vector3(rand(-1, 1), 0.5, rand(-1, 1)).normalize(), 2, 0.5);
  A.at(wp, () => A.SFX.glass(1, 1)); I.sparks_(wp, 10);
}
function hitCar(car, point, dir) {
  if (car.ai) freeTraffic(car);
  damageCar(car, 7 + (CW.power || 1) * 3, point); addMark(point, dir.clone().negate(), 'dent', 0.25);
  if (!car.vehicle) { car.body.wakeUp(); car.body.velocity.x += dir.x * 0.4; car.body.velocity.z += dir.z * 0.4; }
  recoil = 1; freeze(35); shake = Math.max(shake, 0.12); emit('hit');
}
function wreckCar(car) {
  car.dead = true; const p = car.body.position;
  explode({ x: p.x, y: p.y + 0.8, z: p.z });
  const burnt = S.mat('paint', 0x1a1816); car.g.traverse(m => { if (m.isMesh && !m.userData.ol) { if (car.glass.includes(m) || car.lights.includes(m)) m.visible = false; else m.material = burnt; } });
  car.body.velocity.y += 5; car.body.angularVelocity.set(rand(-2, 2), rand(-1, 1), rand(-2, 2));
  if (car === driving) exitCar(true);
  addStat('wrecks'); popup('Wrecked!', { x: p.x, y: p.y + 2, z: p.z }, 'big');
}
// ---------- traffic: cars that drive the lanes, wait at red lights and stop for whatever is in front of them
const GRID = [-100, -50, 0, 50, 100], LANE = 1.8;
const inner = v => v > -100 && v < 100;
function spawnTraffic(n) {
  for (let i = 0; i < n; i++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z', line = pick(GRID), from = pick(GRID.slice(0, 4)), sgn = Math.random() < 0.5 ? 1 : -1;
    const a = sgn > 0 ? from : from + 50, d = axis === 'x' ? new THREE.Vector3(sgn, 0, 0) : new THREE.Vector3(0, 0, sgn);
    const node = axis === 'x' ? new THREE.Vector3(a, 0, line) : new THREE.Vector3(line, 0, a);
    if (Math.hypot(node.x - player.x, node.z - player.z) < 25) continue;
    const type = pickType(), color = typeColor(type), body = carBody(type, node.x, node.z, 0, true);
    const car = { body, ...carMesh(color, type), type: CAR_TYPES[type], hp: type === 'van' ? 130 : 100, dead: false, speed: 0, alarm: null, smokeT: 0, color, ai: { node, d, s: rand(5, 40), v: 6, next: null, turn: null } };
    body.addEventListener('collide', e => carImpact(car, e)); cars.push(car); traffic.push(car); pickNext(car.ai);
  }
}
function pickNext(ai) { // at the next crossing: straight, left or right, never off the map or back the way it came
  const end = ai.node.clone().addScaledVector(ai.d, 50), opts = [];
  for (const d of [ai.d, new THREE.Vector3(-ai.d.z, 0, ai.d.x), new THREE.Vector3(ai.d.z, 0, -ai.d.x)]) { const n = end.clone().addScaledVector(d, 50); if (Math.abs(n.x) <= 100.1 && Math.abs(n.z) <= 100.1) opts.push(d); }
  ai.next = opts.length ? (opts.includes(ai.d) && Math.random() < 0.55 ? ai.d : pick(opts)) : ai.d.clone().negate();
}
const laneRight = d => new THREE.Vector3(-d.z, 0, d.x);
function freeTraffic(car) {
  const ai = car.ai; if (!ai) return; car.ai = null; traffic = traffic.filter(c => c !== car);
  const b = car.body, v = b.velocity.clone(); b.type = CANNON.Body.DYNAMIC; b.mass = car.type.mass; wheelShapes(b, true); b.updateMassProperties(); b.velocity.copy(v); b.angularDamping = 0.5; b.linearDamping = 0.08; b.wakeUp();
}
function blocked(car, pos, dir) { // anything in the lane ahead: another car, you, your car
  for (const o of cars) { if (o === car) continue; const dx = o.body.position.x - pos.x, dz = o.body.position.z - pos.z, ahead = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x); if (ahead > 0 && ahead < 8.5 && side < 1.9) return true; }
  if (!driving) { const dx = player.x - pos.x, dz = player.z - pos.z, ahead = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x); if (ahead > 0 && ahead < 6 && side < 1.6) return true; }
  return false;
}
function updateTraffic(dt) {
  if (!traffic.length || dt <= 0) return;
  for (const car of traffic) {
    const ai = car.ai, b = car.body, end = ai.node.clone().addScaledVector(ai.d, 50), left = 50 - ai.s;
    const cross = inner(end.x) && inner(end.z), axis = ai.d.x ? 'ew' : 'ns', light = cross && room.signals ? room.signals.state(axis) : 'green';
    let pos, dir;
    if (ai.turn) { const T = ai.turn, k = T.k, p = new THREE.Vector3().copy(T.p0).multiplyScalar((1 - k) ** 2).addScaledVector(T.p1, 2 * (1 - k) * k).addScaledVector(T.p2, k * k);
      dir = new THREE.Vector3().copy(T.p1).sub(T.p0).multiplyScalar(2 * (1 - k)).addScaledVector(new THREE.Vector3().copy(T.p2).sub(T.p1), 2 * k).normalize(); pos = p; }
    else { pos = ai.node.clone().addScaledVector(ai.d, ai.s).addScaledVector(laneRight(ai.d), LANE); dir = ai.d; }
    let target = ai.turn ? (ai.turn.straight ? 9 : 5.5) : 9;
    if (!ai.turn && cross && light !== 'green' && left > 7.5 && left < 16) target = 0; // red or amber: wait at the line
    if (blocked(car, pos, dir)) target = 0;
    ai.v += Math.max(-9 * dt, Math.min(3 * dt, target - ai.v));
    const step = Math.max(0, ai.v) * dt;
    if (ai.turn) { ai.turn.k += step / ai.turn.len; if (ai.turn.k >= 1) { ai.node = end.clone(); ai.d = ai.next; ai.s = 7; ai.turn = null; pickNext(ai); } }
    else { ai.s += step; if (ai.s >= 43) { const n2 = ai.next, endN = end, p0 = pos.clone(), p2 = endN.clone().addScaledVector(n2, 7).addScaledVector(laneRight(n2), LANE);
      const straight = n2.equals(ai.d), p1 = straight ? p0.clone().add(p2).multiplyScalar(0.5) : endN.clone().addScaledVector(laneRight(ai.d), LANE).addScaledVector(laneRight(n2), LANE).sub(endN).add(endN);
      if (!straight) { p1.copy(endN).addScaledVector(laneRight(ai.d), LANE).addScaledVector(laneRight(n2), LANE); }
      ai.turn = { p0, p1, p2, k: 0, len: p0.distanceTo(p1) + p1.distanceTo(p2), straight }; } }
    const yaw = Math.atan2(dir.x, dir.z), np = new CANNON.Vec3(pos.x, 0, pos.z);
    b.velocity.set((np.x - b.position.x) / dt, 0, (np.z - b.position.z) / dt); b.position.copy(np); b.quaternion.setFromEuler(0, yaw, 0);
    car.speed = Math.max(0, ai.v);
  }
}
let cullT = 0;
function updateCars(dt, now) {
  if (!cars.length) return; updateTraffic(dt); syncCars();
  if ((cullT -= dt) <= 0) { cullT = 0.3; const far2 = (S.quality === 'low' ? 70 : 110) ** 2, itemFar2 = (S.quality === 'low' ? 45 : 75) ** 2; // past the fog nothing needs drawing
    for (const c of cars) c.g.visible = c === driving || (c.body.position.x - player.x) ** 2 + (c.body.position.z - player.z) ** 2 < far2;
    if (room.open) for (const it of I.list) if (!it.dead && !it.fixed) it.mesh.visible = (it.body.position.x - player.x) ** 2 + (it.body.position.z - player.z) ** 2 < itemFar2; }
  for (const c of cars) {
    if (c.dead || c.hp > 55) continue; c.smokeT -= dt; if (c.smokeT > 0) continue; c.smokeT = c.hp > 25 ? 0.18 : 0.08;
    const hood = c.g.localToWorld(new THREE.Vector3(0, 1.1, 1.6));
    puff(hood, c.hp > 25 ? 0x6a6a6a : 0x2a2622, 1, 0.5, 0.9, 0.5); if (c.hp <= 25) puff(hood, 0xff7a20, 1, 0.3, 1.2, 0.7);
  }
}
function carRayHit(origin, dir, far) {
  ray.set(origin, dir); ray.far = far; const hit = ray.intersectObjects(cars.map(c => c.g), true).find(h => !h.object.userData.ol);
  if (!hit) return null; let o = hit.object; while (o.parent && !cars.some(c => c.g === o)) o = o.parent; return { car: cars.find(c => c.g === o), point: hit.point };
}
function pushOutOfCars() { // walking into a car stops you at its side
  for (const c of cars) { const yaw = carYaw(c), dx = player.x - c.body.position.x, dz = player.z - c.body.position.z, cs = Math.cos(yaw), sn = Math.sin(yaw);
    let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; const E = c.type ? c.type.ext : SEDAN.ext, ex = E[0] + 0.3 - Math.abs(lx), ez = E[1] + 0.3 - Math.abs(lz);
    if (ex <= 0 || ez <= 0) continue; if (ex < ez) lx += Math.sign(lx || 1) * ex; else lz += Math.sign(lz || 1) * ez;
    player.x = c.body.position.x + lx * cs + lz * sn; player.z = c.body.position.z - lx * sn + lz * cs; }
}
function cockpitCamera() { // first person in the car: the driver's seat, looking where the car points (mouse looks around)
  if (view !== 'fp') return; const c = driving; c.g.updateMatrixWorld();
  camera.position.copy(c.g.localToWorld(new THREE.Vector3(0.38, c.type === CAR_TYPES.van ? 1.85 : c.type === CAR_TYPES.sports ? 1.0 : 1.28, c.type === CAR_TYPES.van ? 1.4 : 0.05)));
  camera.quaternion.copy(c.g.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(player.pitch * 0.6, Math.PI + (player.yaw - (carYaw(c) + Math.PI)) * 0, 0, 'YXZ')));
}
const human = { src: null, p: null, mixer: null, acts: {}, cur: null, weapon: null };
function loadHuman() { // CC0 animated human by Quaternius; the clay mannequin stands in until it arrives
  return human.p ||= import('three/addons/loaders/FBXLoader.js').then(({ FBXLoader }) => new FBXLoader().loadAsync('assets/models/human/human.fbx')).then(o => {
    const tex = new THREE.TextureLoader().load(`assets/models/human/${pick(['ClothedLightSkin', 'ClothedDarkSkin', 'ClothedLightSkin1', 'ClothedDarkSkin2'])}.png`); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    o.scale.setScalar(0.0033); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.userData.noOutline = true; m.userData.tex = tex; } });
    human.src = o; human.mixer = new THREE.AnimationMixer(o);
    for (const clip of o.animations) human.acts[clip.name.split('|').pop()] = human.mixer.clipAction(clip);
    if (human.acts.Punch) { human.acts.Punch.setLoop(THREE.LoopOnce); human.acts.Punch.clampWhenFinished = false; }
    if (avatar && avatar !== o) { avatar.removeFromParent(); avatar = null; } return o;
  }).catch(e => { console.warn('character failed to load', e); return null; });
}
function humanPlay(name, fade = 0.2) { const a = human.acts[name]; if (!a || human.cur === a) return; a.reset().play(); if (human.cur) human.cur.crossFadeTo(a, fade, false); human.cur = a; }
function ensureAvatar() {
  if (human.src) { // dress it for this look, hand it the weapon
    if (avatar !== human.src) { avatar?.removeFromParent(); avatar = human.src; scene.add(avatar); avatar.traverse(m => { if (m.isMesh) m.material = S.mat('plastic', 0xffffff, { map: m.userData.tex }); }); human.weapon = null; }
    if (human.weapon !== opts.weapon) { const hand = avatar.getObjectByName('RightHand'); hand?.children.filter(c => c.userData.held).forEach(c => hand.remove(c));
      if (hand && !W.hands) { avatar.updateMatrixWorld(true); const ws = hand.getWorldScale(new THREE.Vector3()).x || 1; const wm = buildWeapon(opts.weapon); wm.userData.held = true; wm.scale.setScalar(1 / ws); wm.rotation.set(Math.PI / 2, 0, 0); wm.position.set(0, 0.08 / ws, 0.02 / ws); hand.add(wm); } human.weapon = opts.weapon; } // the bones carry their own scale: size the weapon from the hand's real size
    return avatar;
  }
  if (avatar || !clayBody()) return avatar; const B = clayBody(), skin = S.mat('clay', 0xc8906a), shirt = S.mat('fabric', pick([0x2a4a7a, 0x7a2a2a, 0x2a6a4a, 0x3a3a42])), jeans = S.mat('fabric', 0x2a3048);
  avatar = new THREE.Group(); avatar.userData.parts = {};
  for (const [key, mat] of [['head', skin], ['torso', shirt], ['armL', shirt], ['armR', shirt], ['legL', jeans], ['legR', jeans]]) { if (!B[key]) continue; const m = new THREE.Mesh(B[key].geo, mat); m.position.copy(B[key].pivot); m.castShadow = true; avatar.add(m); avatar.userData.parts[key] = m; }
  S.outline(avatar, 1.02); scene.add(avatar); return avatar;
}
function toggleView() { view = view === 'fp' ? 'tp' : 'fp'; if (view === 'tp') loadHuman(); save.view = view; persist(); toast(view === 'tp' ? 'Third person' : 'First person'); }
const groundY = (x, z) => { const h = surfaceHit(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0), 6); return h ? h.point.y : 0; };
function viewCamera(dt) {
  const tp = state === 'play' && ((driving && view !== 'fp') || (!driving && view === 'tp'));
  const a = ensureAvatar(); if (a) a.visible = state === 'play' && !driving && view === 'tp';
  if (!tp) return camera;
  if (driving) { // chase camera behind the car
    const g = driving.g, want = g.localToWorld(new THREE.Vector3(0, 2.9, -7.2)), look = g.localToWorld(new THREE.Vector3(0, 1.1, 3));
    if (!chase) chase = want.clone(); chase.lerp(want, Math.min(1, dt * 5)); chase.y = Math.max(chase.y, 1.2);
    tpCam.position.copy(chase); tpCam.lookAt(look); return tpCam;
  }
  // over the shoulder on foot: the character walks, the weapon swings in front of it
  const y0 = groundY(player.x, player.z), moving = keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || Math.hypot(joy.x, joy.y) > 0.1;
  pivot.visible = false; // the character holds the weapon now
  if (a && a === human.src) { a.position.set(player.x, y0, player.z); a.rotation.y = player.yaw + Math.PI; human.mixer.update(dt);
    humanPlay(swingT >= 0 && human.acts.Punch ? 'Punch' : moving ? (keys.ShiftLeft ? 'Run' : 'Walk') : 'Idle', swingT >= 0 ? 0.08 : 0.2); }
  else if (a) { a.position.set(player.x, y0, player.z); a.rotation.y = player.yaw + Math.PI; const P = a.userData.parts, sw = moving ? Math.sin(player.bob) * 0.55 : 0;
    if (P.legL) P.legL.rotation.x = sw; if (P.legR) P.legR.rotation.x = -sw; if (P.armL) P.armL.rotation.set(-sw * 0.7, 0, -1.15); if (P.armR) P.armR.rotation.set(swingT >= 0 ? -1.4 + Math.sin(swingT * Math.PI) * 1.2 : sw * 0.7 - 0.25, 0, 1.15); } // the body comes in a T-pose: arms down by the sides
  const head = new THREE.Vector3(player.x, y0 + 1.62, player.z), f = camera.getWorldDirection(new THREE.Vector3()), r = new THREE.Vector3(-f.z, 0, f.x).normalize();
  let want = head.clone().addScaledVector(f, -3.3).addScaledVector(r, 0.55).add({ x: 0, y: 0.35, z: 0 });
  const d = want.clone().sub(head), L = d.length(), h = surfaceHit(head, d.normalize(), L); if (h) want = head.clone().addScaledVector(d, Math.max(0.4, h.point.distanceTo(head) - 0.25));
  tpCam.position.copy(want); tpCam.lookAt(head.clone().addScaledVector(f, 8)); return tpCam;
}
function drawMinimap(now) {
  if (!room.mapRects || now - mapT < 66) return; mapT = now;
  const cv = $('minimap'), g = cv.getContext('2d'), W = cv.width, span = 230, k = W / span, tx = x => W / 2 + x * k, tz = z => W / 2 + z * k;
  if (!mapBg) { mapBg = document.createElement('canvas'); mapBg.width = mapBg.height = W; const b = mapBg.getContext('2d'); b.fillStyle = '#1a1622'; b.fillRect(0, 0, W, W);
    for (const [x1, z1, x2, z2, col] of room.mapRects) { b.fillStyle = col; b.fillRect(tx(x1), tz(z1), (x2 - x1) * k, (z2 - z1) * k); } }
  g.drawImage(mapBg, 0, 0);
  for (const c of cars) { g.fillStyle = c.dead ? '#222' : c === driving ? '#ffc531' : '#6ab8ff'; g.fillRect(tx(c.body.position.x) - 2, tz(c.body.position.z) - 2, 4, 4); }
  g.save(); g.translate(tx(player.x), tz(player.z)); g.rotate(-player.yaw); g.fillStyle = '#ff4f9a'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill(); g.restore();
}

// ---------- the new rooms: museum alarm, hull breaches, bowling scores, trolleys
let museumAlarm = null, breaches = [];
function startMuseumAlarm(p) {
  if (state !== 'play') return; const light = new THREE.PointLight(0xff1a1a, 0, 30); light.position.set(0, 3.8, 1); scene.add(light);
  museumAlarm = { light, sound: A.loopAt('alarm', { x: 0, y: 3.5, z: 1 }, 0.45), until: performance.now() + 20000 };
  banner('ALARM!'); toast('Security is on the way. Smash what you can'); addScore(100, p, 'big'); emit('alarm');
}
function hullBreach(it) { // a broken window drags everything loose toward the hole and out into space
  const p = it.body.position, at = new THREE.Vector3(p.x, p.y, p.z), n = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(it.body.quaternion.x, it.body.quaternion.y, it.body.quaternion.z, it.body.quaternion.w));
  const sound = A.loopAt('spray', at, 0.6, 0.55); breaches.push({ at, n, until: performance.now() + 5000, sound });
  banner('HULL BREACH!'); shake = Math.max(shake, 0.4); A.at(at, () => A.SFX.boom()); emit('breach');
}
function pushTrolleys(dx, dz, len) { // walking into a trolley rolls it ahead of you
  if (len < 0.1) return;
  for (const it of I.list) if (it.key === 'trolley' && !it.dead && !it.held) { const q = it.body.position; if (Math.hypot(q.x - player.x, q.z - player.z) < 0.85) { it.body.wakeUp(); it.body.velocity.x = dx * 4.4 / len; it.body.velocity.z = dz * 4.4 / len; } }
}
// ---------- Holidays: themed things to smash, and fireworks outside at New Year
const SEASON_ITEMS = { halloween: ['pumpkin', 'pumpkin', 'pumpkin', 'pumpkin', 'pumpkin'], christmas: ['bauble', 'bauble', 'bauble', 'gift', 'gift', 'gift'], newyear: ['bottle', 'wineglass', 'wineglass', 'gift', 'bauble'] };
const OUTDOOR = new Set(['city', 'downtown', 'caryard', 'beach', 'tinytown']);
function season() {
  if (opts.season && opts.season !== 'auto') return opts.season === 'off' ? null : opts.season;
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
  if ((m === 12 && day === 31) || (m === 1 && day <= 2)) return 'newyear';
  if (m === 10 && day >= 15) return 'halloween'; if (m === 12) return 'christmas'; return null;
}
let fireworks = [], fwT = 0;
function updateFireworks(dt, now) {
  if (season() !== 'newyear' || !OUTDOOR.has(opts.scene)) return;
  if (now > fwT) { fwT = now + rand(700, 2200); // launch one somewhere in front of you, far off
    const a = player.yaw + rand(-0.9, 0.9), d = rand(35, 60), x = player.x - Math.sin(a) * d, z = player.z - Math.cos(a) * d, n = 90, pos = new Float32Array(n * 3), vel = [];
    const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.62), y = rand(22, 34);
    for (let i = 0; i < n; i++) { pos.set([x, y, z], i * 3); const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(7, 10)); vel.push(v); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.visible = false; scene.add(pts); fireworks.push({ pts, vel, t: -0.9, flash: col });
    A.at(new THREE.Vector3(x, 1, z), () => A.SFX.whoosh(false)); }
  fireworks = fireworks.filter(f => { f.t += dt;
    if (f.t < 0) return true;
    if (!f.pts.visible) { f.pts.visible = true; const p = f.pts.geometry.attributes.position.array; A.at(new THREE.Vector3(p[0], p[1], p[2]), () => A.SFX.boom()); }
    const a = f.pts.geometry.attributes.position; for (let i = 0; i < f.vel.length; i++) { const v = f.vel[i]; v.y -= 4 * dt; v.multiplyScalar(1 - 1.2 * dt); a.array[i * 3] += v.x * dt; a.array[i * 3 + 1] += v.y * dt; a.array[i * 3 + 2] += v.z * dt; }
    a.needsUpdate = true; f.pts.material.opacity = Math.max(0, 1 - f.t / 2.2);
    if (f.t > 2.2) { scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); return false; } return true; });
}
// ---------- Scream to rage: opt-in mic level feeds the rage meter. Nothing is recorded or sent.
let mic = null;
async function startMic() {
  if (!opts.mic || mic) return;
  try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
    mic = { stream, ctx, an, buf: new Float32Array(an.fftSize), lvl: 0 }; $('micLvl').classList.remove('hidden');
  } catch (e) { toast('No microphone, so no scream power this time'); opts.mic = false; $('mic').checked = false; }
}
function stopMic() { if (!mic) return; mic.stream.getTracks().forEach(t => t.stop()); mic.ctx.close(); mic = null; $('micLvl').classList.add('hidden'); }
function updateMic(dt, now) {
  if (!mic) return; mic.an.getFloatTimeDomainData(mic.buf); let sum = 0; for (const v of mic.buf) sum += v * v;
  const rms = Math.sqrt(sum / mic.buf.length); mic.lvl = Math.max(rms, mic.lvl - dt * 0.6); $('micFill').style.width = Math.min(100, mic.lvl * 400) + '%';
  if (rms > 0.12 && now >= rageUntil && state === 'play' && !paused) { rageMeter += rms * 120 * dt; shake = Math.max(shake, Math.min(0.08, rms * 0.2)); if (rageMeter >= 100) { startRage(); emit('scream'); } }
}
// ---------- Bosses: now and then a giant version of something in the room turns up. Many hits to break, big reward
const BOSS_KEYS = ['vase', 'crt', 'tv', 'microwave', 'teapot', 'jug', 'pot', 'flowerpot', 'speaker', 'monitor', 'bust', 'pumpkin', 'kettle', 'mug', 'bottle', 'jar', 'fishbowl'];
let boss = null, bossAt = 0;
function freeSpot(minFromPlayer = 2.5, clear = 0.6) {
  const [x1, x2, z1, z2] = room.bounds;
  for (let i = 0; i < 40; i++) { const x = rand(x1 + 1, x2 - 1), z = rand(z1 + 1, z2 - 1);
    if (Math.hypot(x - player.x, z - player.z) < minFromPlayer || room.obstacles.some(([a, b, c, d]) => x > a - clear && x < b + clear && z > c - clear && z < d + clear)) continue;
    if (I.list.some(i => !i.dead && Math.hypot(i.body.position.x - x, i.body.position.z - z) < clear)) continue; return { x, z }; }
  return null;
}
function spawnBoss() {
  const keys = BOSS_KEYS.filter(k => room.pool.includes(k)); if (!keys.length) return;
  const key = pick(keys), spot = freeSpot(); if (!spot) return; const sc = Math.min(4.5, 1.5 / I.DEFS[key].size);
  const it = I.add(key, spot.x, 0, spot.z, rand(0, 6.28), { scale: sc, mass: 0, fixed: true, hpMul: 1 }); it.boss = true; it.hp = it.maxHp = 10 + Math.round(sc * 1.5);
  boss = it; banner('Boss: giant ' + (NAMES[key] || key)); A.at(it.body.position, () => { A.SFX.land('stone', 1); A.SFX.body(1.3); }); shake = Math.max(shake, 0.3);
  puff(new THREE.Vector3(spot.x, 0.1, spot.z), 0xc8c0b4, 10, 0.8, 0.2, 0.5); $('boss').classList.remove('hidden'); $('bossName').textContent = 'Giant ' + (NAMES[key] || key);
}
function updateBoss(now) {
  if (boss && boss.dead) { const p = boss.body.position; boss = null; bossAt = now + 60000; $('boss').classList.add('hidden');
    if (state === 'play') { banner('Boss down!'); addScore(300, p, 'big'); shake = Math.max(shake, 0.6); flash(0.3); freeze(120); vibrate(200); I.sparks_(p, 40, 0xffd27a); emit('boss'); addStat('bosses'); } }
  if (boss) $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
  else if (state === 'play' && !paused && !room.open && !room.calm && opts.gm !== 'build' && now > bossAt) { bossAt = now + 20000; spawnBoss(); }
}
// ---------- Room machines: orders on the pass, the scrapyard crusher, conveyor belts
let rushT = 0, pressT = 0, pressSnd = null, pressHit = false, beltT = 0;
function updateMachines(dt, now) {
  const live = state === 'play' && !paused;
  if (room.rush && live && now > rushT) { // order up: a bell, and fresh plates land on the pass
    rushT = now + rand(7000, 10000); const r = room.rush;
    if (!room.furniture.some(f => f.dead && Math.hypot(f.parts[0].position.x - r.x, f.parts[0].position.z - r.z) < 1)) {
      A.at(r, () => { A.SFX.metal(0.45, 3.2); setTimeout(() => A.SFX.metal(0.3, 3.2), 140); });
      popup('Order up!', { x: r.x, y: r.y + 0.6, z: r.z }, 'small');
      for (let i = 0; i < 3; i++) { const it = I.add(pick(['plate', 'platestack', 'bowl', 'wineglass', 'mug']), r.x + rand(-2.6, 2.6), r.y, r.z + rand(-0.25, 0.25), rand(0, 6)); it.body.sleep(); }
    }
  }
  const P = room.press;
  if (P) { // a 10 s cycle: wait up top, come down hard, hold, go back up
    pressT += dt; const cyc = Math.floor(pressT / 10), t = pressT % 10, top = P.top, low = 0.32;
    const y = t < 5 ? top : t < 6.4 ? top - (top - low) * Math.pow((t - 5) / 1.4, 2) : t < 7.4 ? low : t < 10 ? low + (top - low) * ((t - 7.4) / 2.6) : top;
    P.plate.position.set(P.x, y + 0.2, P.z); P.ram.position.set(P.x, (y + 0.4 + 4.95) / 2, P.z); P.ram.scale.y = Math.max(0.01, 4.95 - y - 0.4);
    const moving = (t > 5 && t < 6.4) || (t > 7.4 && t < 10);
    if (moving && !pressSnd && live) pressSnd = A.loopAt('engine', P.plate.position, 0.35, 0.5); if (!moving && pressSnd) { pressSnd.stop(); pressSnd = null; }
    if (t >= 6.4 && t < 7.4 && !pressHit) { pressHit = true; if (live) makeCube(P); A.at(P.plate.position, () => { A.SFX.metal(1.2, 0.5); A.SFX.stone(1, 0.5); }); if (Math.hypot(player.x - P.x, player.z - P.z) < 9) shake = Math.max(shake, 0.25); }
    if (t < 6.4) pressHit = false;
    if (P.respawn && t < 4.5 && live) { P.respawn = false; room.car(P.x, P.z, pick([0xb3202a, 0x2a5ab3, 0x2a8a4a, 0xd9a22a, 0x8a8f96])); toast('Another one for the crusher'); }
    const inside = q => Math.abs(q.x - P.x) < P.w / 2 + 0.1 && Math.abs(q.z - P.z) < P.d / 2 + 0.1;
    if (y < top - 0.1) {
      for (const it of I.list) { if (it.dead || it.held || !inside(it.body.position)) continue;
        if (it.crushCycle !== cyc) { it.crushCycle = cyc; const b = new THREE.Box3().setFromObject(it.mesh); it.crushTop = b.max.y; it.crushY0 = it.mesh.position.y; }
        if (y > it.crushTop) continue;
        if (it.def.hp !== Infinity) { if (live) { I.shatter(it, new THREE.Vector3(rand(-1, 1), -0.3, rand(-1, 1)).normalize(), 3, false); P.count = (P.count || 0) + 1; } continue; }
        const k = Math.max(0.22, y / it.crushTop); it.mesh.scale.y = Math.min(it.mesh.scale.y, k); // metal folds flat
        if (it.key === 'carbody' && k < 0.5 && !it.crushed && live) { it.crushed = true; P.car = it; banner('Crushed!'); addScore(250, it.body.position, 'big'); emit('crush'); addStat('crushed'); A.at(it.body.position, () => { A.SFX.metal(1.3, 0.6); A.SFX.glass(1, 0.8); }); }
      }
      for (const c of I.chunks) { const q = c.body.position; if (inside(q) && q.y > y - 0.05) { q.y = Math.max(0.03, y - 0.06); c.body.velocity.set(rand(-1, 1), 0, rand(-1, 1)); } }
      if (y < 2.2 && inside(player)) player.x = P.x + Math.sign(player.x - P.x || 1) * (P.w / 2 + 0.6);
    }
  }
  if (room.belts) { // glass rides the belts out of the furnace and drops into the crates at the end
    beltT -= dt;
    for (const it of I.list) { if (it.dead || it.held || it.thrown) continue; const q = it.body.position;
      const b = room.belts.find(b => Math.abs(q.z - b.z) < 0.38 && q.x > b.x1 - 0.2 && q.x < b.x2 + 0.3 && q.y > b.y - 0.05 && q.y < b.y + 0.7); if (!b) continue;
      if (q.x > b.x2) { I.remove(it); continue; }
      it.body.wakeUp(); it.body.velocity.x = 0.9; it.body.velocity.z *= 0.8; }
    if (beltT <= 0 && live) { beltT = 1.1; for (const b of room.belts) if (Math.random() < 0.7 && I.list.filter(i => !i.dead && Math.abs(i.body.position.z - b.z) < 0.4 && i.body.position.y > b.y - 0.1).length < 12) { const it = I.add(pick(room.beltKeys), b.x1, b.y, b.z + rand(-0.08, 0.08), rand(0, 6)); it.born = now; } }
  }
}
// ---------- Fire: blasts set wood alight, flames spread to whatever is close, the extinguisher puts them out
let fires = [], fireTex = null, fireSnd = null, fireLight = null, fireT = 0;
const burnable = it => it.def.kind === 'wood' && !it.dead && !it.held;
function flameTex() {
  if (fireTex) return fireTex; const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 70, 2, 32, 58, 34); gr.addColorStop(0, 'rgba(255,214,120,.95)'); gr.addColorStop(0.3, 'rgba(255,130,30,.8)'); gr.addColorStop(0.7, 'rgba(210,50,5,.4)'); gr.addColorStop(1, 'rgba(160,20,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(58, 40, 62, 92, 32, 94); g.bezierCurveTo(2, 92, 6, 40, 32, 2); g.fill();
  return (fireTex = new THREE.CanvasTexture(c));
}
function ignite(tg, furn) {
  if (!tg || tg.fire || tg.dead || smoke?.on) return; // nothing catches while the sprinklers run
  const size = furn ? 0.7 : Math.max(0.3, Math.min(0.9, tg.def.size * 1.3)), n = furn ? 6 : 3, sprites = [];
  for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    s.userData.o = furn ? new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.3, 0.3)) : new THREE.Vector3(rand(-0.1, 0.1), 0, rand(-0.1, 0.1)); s.userData.ph = rand(0, 6); s.scale.set(0.01, 0.01, 1); scene.add(s); sprites.push(s); }
  const f = { tg, furn, sprites, size, t: 0, life: furn ? rand(10, 14) : rand(5, 8), smoke: 0 }; tg.fire = f; fires.push(f);
}
const firePos = f => f.furn ? f.tg.parts[0].position : f.tg.mesh.position;
function updateFire(dt, now) {
  if (!fireLight || fireLight.parent !== scene) { fireLight = new THREE.PointLight(0xff8a30, 0, 9, 2); scene.add(fireLight); }
  fires = fires.filter(f => {
    if (f.tg.dead || f.out) { f.sprites.forEach(s => { scene.remove(s); s.material.dispose(); }); f.tg.fire = null; return false; }
    f.t += dt; const p = firePos(f), grow = Math.min(1, f.t / 1.2), top = f.furn ? 0.05 : f.tg.def.size * 0.3;
    f.sprites.forEach((s, i) => { const k = grow * f.size * (0.85 + 0.25 * Math.sin(now * 0.018 + s.userData.ph) + 0.1 * Math.sin(now * 0.041 + i)); s.scale.set(k * 0.75, k * 1.3, 1); s.position.copy(p).add(s.userData.o).y += top + k * 0.5; });
    if ((f.smoke -= dt) < 0) { f.smoke = 0.35; puff(new THREE.Vector3(p.x, p.y + top + f.size, p.z), 0x2a2622, 1, 0.35 * f.size + 0.2, 0.9, 0.3, 2.2); }
    if (f.t > f.life) { // burnt through
      if (f.furn) { f.tg.hp = 0; collapse(f.tg, new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize()); }
      else if (state === 'play') I.shatter(f.tg, new THREE.Vector3(0, 1, 0), 1, false);
      f.out = true; }
    return true; });
  if ((fireT -= dt) < 0 && fires.length) { fireT = 0.8; // spread to wood close by, cook gas cans
    for (const f of fires.slice()) { if (f.t < 1.5) continue; const p = firePos(f), r = f.furn ? 1.4 : 1;
      for (const it of I.list) { if (it.dead || it.fire || it.held) continue; const q = it.body.position, d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); if (d > r) continue;
        if (burnable(it) && Math.random() < 0.4) ignite(it); if (it.def.kind === 'explosive' && (it.cook = (it.cook || 0) + 0.8) > 2.4 && state === 'play') I.shatter(it, new THREE.Vector3(0, 1, 0), 3, false); }
      for (const fu of room.furniture) if (!fu.dead && !fu.fire && fu.parts[0].position.distanceTo(p) < r + 0.4 && Math.random() < 0.3) ignite(fu, true); } }
  const near = fires.reduce((m, f) => Math.min(m, Math.hypot(firePos(f).x - player.x, firePos(f).z - player.z)), 99);
  if (fires.length) { const f0 = fires[0], p = firePos(f0); fireLight.position.set(p.x, p.y + 0.6, p.z); fireLight.intensity = (S.realistic ? 10 : 3) * Math.min(1.6, 0.6 + fires.length * 0.15) * (0.8 + Math.random() * 0.4); }
  else fireLight.intensity = 0;
  const g = fires.length ? Math.min(0.7, 0.18 + fires.length * 0.06) * Math.max(0, 1 - near / 14) : 0;
  if (g > 0.01 && !fireSnd && state === 'play') fireSnd = A.loopAt('fire', null, 0, 1); if (fireSnd) { fireSnd.set(g); if (!fires.length) { fireSnd.stop(); fireSnd = null; } }
}
function douse(o, f, reach) { // foam over a fire puts it out
  for (const fi of fires) { const p = firePos(fi), v = p.clone().sub(o), d = v.length(); if (d > reach || v.normalize().dot(f) < 0.8) continue;
    fi.out = true; puff(p.clone().add({ x: 0, y: 0.3, z: 0 }), 0xe8e8ec, 4, 0.5, 0.8, 0.5, 1.6); if (state === 'play') { popup('Out!', { x: p.x, y: p.y + 0.6, z: p.z }, 'small'); addScore(5, p, 'small'); addStat('fires'); } }
}

// ---------- Toys: a ball cannon, ramps and trampolines (8 and 9 put them where you look)
let toys = 0, jumpT = 0;
function fireCannon() {
  const o = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3()), r = 0.14, p = o.clone().addScaledVector(f, 0.9);
  const body = new CANNON.Body({ mass: 14, shape: new CANNON.Sphere(r), position: new CANNON.Vec3(p.x, p.y - 0.1, p.z), linearDamping: 0.01, angularDamping: 0.05 }); body.velocity.set(f.x * 26, f.y * 26 + 1.5, f.z * 26);
  body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v < 4) return;
    const fu = room.furniture.find(q => !q.dead && q.parts.some(m => m.userData.body === e.body)); if (fu) { fu.hp -= v * 0.4; if (fu.hp <= 0) collapse(fu, new THREE.Vector3(body.velocity.x, 0, body.velocity.z).normalize()); }
    A.at(body.position, () => A.SFX.thud('stone', Math.min(1, v / 14), 0.6)); });
  world.addBody(body); const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), S.mat('metal', 0x26262a)); mesh.castShadow = true; scene.add(mesh); S.outline(mesh, 1.04);
  balls.push({ body, mesh }); while (balls.length > 6) { const b = balls.shift(); world.removeBody(b.body); scene.remove(b.mesh); }
  A.at(o, () => { A.SFX.stone(1.1, 0.45); A.SFX.body(1.2); }); puff(p, 0x8a8478, 4, 0.4, 0.3, 0.55, 1.2, f.clone().multiplyScalar(2)); shake = Math.max(shake, 0.25); kick = Math.min(0.12, kick + 0.07); recoil = 1; vibrate(60);
}
function placeToy(kind) {
  if (state !== 'play' || paused || driving || room.open) return; if (toys >= 4) { toast('That is enough toys for one room'); return; }
  const yaw = player.yaw, fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), c = new THREE.Vector3(player.x, 0, player.z).addScaledVector(fw, kind === 'ramp' ? 2.6 : 2);
  const [x1, x2, z1, z2] = room.bounds; if (c.x < x1 + 0.6 || c.x > x2 - 0.6 || c.z < z1 + 0.6 || c.z > z2 - 0.6) { toast('Not enough room there'); return; }
  const wood = S.surface('wood', 1, 1), add = (w, h, d, mat, y, rx = 0, phys = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(c.x, y, c.z); m.rotation.set(rx, yaw, 0, 'YXZ'); m.castShadow = m.receiveShadow = true; scene.add(m); S.outline(m, 1.02);
    if (!phys) return m; const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), position: new CANNON.Vec3(c.x, y, c.z) }); b.quaternion.setFromEuler(rx, yaw, 0, 'YXZ'); world.addBody(b); room.statics.push(m); m.userData.body = b; return m; };
  if (kind === 'ramp') { // a long board tipped up toward the far end: things rolling up it take off
    const L = 2.6, a = 0.3; add(1.3, 0.08, L, wood, Math.sin(a) * L / 2, a); add(1.2, Math.sin(a) * L - 0.05, 0.08, S.mat('metal', 0x555a60), (Math.sin(a) * L) / 2, 0, false).position.addScaledVector(fw, L / 2 - 0.1);
    room.obstacles.push([c.x - 1.2, c.x + 1.2, c.z - 1.2, c.z + 1.2]); // ponytail: square footprint around the tilted board
    for (let k = 0; k < 3; k++) { const it = I.add(pick(['crate', 'tv', 'microwave', 'cinder']), c.x + fw.x * (L / 2 + 0.8 + k * 0.5), 0, c.z + fw.z * (L / 2 + 0.8 + k * 0.5), yaw); it.body.sleep(); }
  } else { // trampoline: a springy pad on legs. Things bounce, and so do you if you walk onto it
    const R = 0.9, pad = add(R * 2, 0.06, R * 2, S.mat('fabric', 0x1a1a22), 0.5); add(R * 2 + 0.16, 0.1, R * 2 + 0.16, S.mat('paint', 0x2a6ad8), 0.42, 0, false);
    pad.userData.body.addEventListener('collide', e => { const b = e.body; if (!b.mass) return; b.wakeUp(); b.velocity.y = Math.max(6.5, Math.abs(b.velocity.y) * 0.95); A.at(b.position, () => A.SFX.bag?.(0.35)); });
    (room.tramps ??= []).push({ x: c.x, z: c.z, r: R });
  }
  toys++; A.at(c, () => A.SFX.wood(0.6, 0.8)); puff(c.clone().add({ x: 0, y: 0.2, z: 0 }), 0xc8c0b4, 4, 0.5, 0.2, 0.45); emit('toy');
}
const jumpY = () => { const t = (performance.now() - jumpT) / 1000; return t < 0.9 ? Math.sin(t / 0.9 * Math.PI) * 1.5 : 0; };
function updateTramps(now) { if (!room.tramps || now - jumpT < 900) return; for (const T of room.tramps) if (Math.hypot(player.x - T.x, player.z - T.z) < T.r) { jumpT = now; A.SFX.whoosh(false); vibrate(30); emit('bounce'); } }

// ---------- Breakable floors: pound the same spot three times and you go through into a basement
let floorHits = [], basement = null, floorY = 0, fall = null;
function poundFloor(P) {
  let h = floorHits.find(q => Math.hypot(q.x - P.x, q.z - P.z) < 1.5); if (!h) floorHits.push(h = { x: P.x, z: P.z, n: 0 }); h.n++;
  if (h.n === 2) { addMark(new THREE.Vector3(P.x, 0.032, P.z), new THREE.Vector3(0, 1, 0), 'hole', 1.4); toast('The floor is giving way'); }
  if (h.n >= 3 && !basement) breakFloor(P);
}
function breakFloor(P) {
  if (room.open || room.space || room.gravity) return; const hit = surfaceHit(new THREE.Vector3(P.x, 0.5, P.z), new THREE.Vector3(0, -1, 0), 2), fl = hit && hit.object, sz = fl && fl.userData.size;
  if (!sz || sz[1] > 0.3 || sz[0] < 4 || sz[2] < 4 || Math.abs(fl.position.y + 0.1) > 0.05) return;
  const fx = fl.position.x, fz = fl.position.z, W = sz[0], D = sz[2], H = 1, BH = 3, BW = 6, BD = 6;
  const hx = Math.max(fx - W / 2 + H + 0.4, Math.min(fx + W / 2 - H - 0.4, P.x)), hz = Math.max(fz - D / 2 + H + 0.4, Math.min(fz + D / 2 - H - 0.4, P.z));
  world.removeBody(fl.userData.body); scene.remove(fl); room.statics.splice(room.statics.indexOf(fl), 1);
  const mat = fl.material, box = (w, h, d, m, x, y, z) => { if (w > 0.02 && d > 0.02) room.box(w, h, d, m, x, y, z, { cast: false }); };
  const x0 = fx - W / 2, x1 = fx + W / 2, z0 = fz - D / 2, z1 = fz + D / 2;
  box(hx - H - x0, 0.2, D, mat, (x0 + hx - H) / 2, -0.1, fz); box(x1 - hx - H, 0.2, D, mat, (hx + H + x1) / 2, -0.1, fz);
  box(2 * H, 0.2, hz - H - z0, mat, hx, -0.1, (z0 + hz - H) / 2); box(2 * H, 0.2, z1 - hz - H, mat, hx, -0.1, (hz + H + z1) / 2);
  // the basement: bare concrete, one bulb, a ladder back up, and boxes of old stuff
  const conc = S.surface('concreteFloor', 3, 3), wall = S.surface('blockWall', 3, 1.5), by = -BH;
  room.box(BW, 0.2, BD, conc, hx, by - 0.1, hz, { cast: false }); room.box(BW, BH, 0.2, wall, hx, by + BH / 2, hz - BD / 2 - 0.1, { cast: false }); room.box(BW, BH, 0.2, wall, hx, by + BH / 2, hz + BD / 2 + 0.1, { cast: false });
  room.box(0.2, BH, BD, wall, hx - BW / 2 - 0.1, by + BH / 2, hz, { cast: false }); room.box(0.2, BH, BD, wall, hx + BW / 2 + 0.1, by + BH / 2, hz, { cast: false });
  const bulb = new THREE.PointLight(0xffd8a0, S.realistic ? 10 : 3, 8, 2); bulb.position.set(hx + 1.5, by + BH - 0.4, hz + 1.5); scene.add(bulb);
  const rail = S.mat('metal', 0x8a8f96), lad = new THREE.Group(); for (const s of [-0.25, 0.25]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, BH + 0.5, 0.05), rail); r.position.set(s, 0, 0); lad.add(r); }
  for (let k = 0; k < 9; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), rail); r.position.y = -BH / 2 + 0.3 + k * 0.36; lad.add(r); } lad.position.set(hx, by + (BH + 0.5) / 2, hz - H + 0.12); scene.add(lad);
  const stash = room.pool.filter(k => k !== 'gascan'); for (let i = 0; i < 12; i++) I.add(pick(stash.length ? stash : ['crate']), hx + rand(-BW / 2 + 0.6, BW / 2 - 0.6), by + 0.02, hz + rand(-BD / 2 + 0.8, BD / 2 - 0.6), rand(0, 6));
  for (let i = 0; i < 22; i++) I.shard('stone', rand(0.05, 0.13), 0xb8b0a4, new THREE.Vector3(hx + rand(-0.8, 0.8), 0, hz + rand(-0.8, 0.8)), new CANNON.Vec3(), new THREE.Vector3(0, -1, 0), 2, 0.3);
  for (const m of marks) if (Math.abs(m.position.x - hx) < H + 0.4 && Math.abs(m.position.z - hz) < H + 0.4 && m.position.y < 0.1) m.visible = false;
  basement = { hx, hz, H, by, rect: [hx - BW / 2 + 0.35, hx + BW / 2 - 0.35, hz - BD / 2 + 0.35, hz + BD / 2 - 0.35], ladder: { x: hx, z: hz - H + 0.5 } };
  puff(new THREE.Vector3(hx, 0.1, hz), 0xc8c0b4, 14, 0.9, 0.3, 0.6); A.at(new THREE.Vector3(hx, 0, hz), () => { A.SFX.stone(1.4, 0.5); A.SFX.boom(); }); shake = Math.max(shake, 0.7);
  banner('Through the floor!'); addScore(150, new THREE.Vector3(hx, 0.3, hz), 'big'); emit('floor'); addStat('floors');
}
function updateFloor(dt, now) {
  if (!basement) return; const B = basement, inHole = Math.abs(player.x - B.hx) < B.H - 0.25 && Math.abs(player.z - B.hz) < B.H - 0.25;
  if (fall) { fall.v += 18 * dt * (fall.up ? -1 : 1); floorY += (fall.up ? 1 : -1) * Math.max(2, fall.up ? 3 : fall.v) * dt;
    if (!fall.up && floorY <= B.by) { floorY = B.by; fall = null; shake = Math.max(shake, 0.35); A.SFX.land?.('stone', 1); vibrate(80); }
    else if (fall?.up && floorY >= 0) { floorY = 0; fall = null; player.x = B.ladder.x; player.z = B.hz - B.H - 0.5; } return; }
  if (floorY === 0 && inHole) { fall = { v: 0 }; A.SFX.whoosh(true); }
  if (floorY < -0.5 && Math.hypot(player.x - B.ladder.x, player.z - B.ladder.z) < 0.55 && keys.KeyW) { fall = { v: 0, up: true }; toast('Climbing back up'); }
}
function playerRects() { return floorY < -0.5 && basement ? [basement.rect] : [room.bounds, ...(room.extra || [])]; }

// ---------- Storms indoors: rain, lightning flashes, thunder, and now and then the power goes
let storm = null;
function startStorm() {
  storm = null; if (!opts.storm || room.open || room.calm || OUTDOOR.has(opts.scene) || room.space) return;
  const amb = new THREE.AmbientLight(0xd8e0ff, 0); amb.userData.keep = true; scene.add(amb); storm = { amb, next: performance.now() + rand(4000, 9000), cut: 0, lights: null }; A.storm();
}
function updateStorm(now) {
  if (!storm || state !== 'play') return; const s = storm;
  if (now > s.next) { s.next = now + rand(9000, 20000); const near = Math.random() < 0.4;
    s.flashes = [now, now + 120, now + (near ? 260 : 400)]; flash(near ? 0.35 : 0.18); setTimeout(() => A.thunder(near), near ? 250 : rand(900, 2500));
    if (near && !s.cut && Math.random() < 0.55) setTimeout(() => powerCut(true), 300); }
  s.amb.intensity = (s.flashes || []).some(t => now > t && now < t + 70) ? (S.realistic ? 3 : 1.6) : 0;
  if (s.cut && now > s.cut) { s.cut = 0; powerCut(false); }
}
function powerCut(off) {
  const s = storm; if (!s) return;
  if (off) { s.lights = []; scene.traverse(o => { if (o.isLight && !o.userData.keep && o !== fireLight && o !== boomLight) { s.lights.push([o, o.intensity]); o.intensity *= o.isHemisphereLight ? 0.12 : 0.03; } if (o.isMesh && o.visible && o.material?.isMeshBasicMaterial && o.material.toneMapped === false && !o.material.transparent) { s.glow = s.glow || []; s.glow.push(o); o.visible = false; } }); // light panels and bulbs go dark too
    s.torch = new THREE.SpotLight(0xfff4e0, S.realistic ? 8 : 5, 14, 0.45, 0.5, 1); s.torch.userData.keep = true; s.torch.position.set(-0.1, 0.1, 0.25); s.torch.target.position.set(0, -0.15, -1); camera.add(s.torch, s.torch.target);
    s.cut = performance.now() + rand(7000, 11000); A.SFX.zap(0.8); banner('Power cut!'); emit('powercut'); }
  else { let k = 0; const back = () => { const on = k++ % 2 === 0 || k > 5; s.lights.forEach(([o, i]) => { o.intensity = on ? i : i * 0.03; }); (s.glow || []).forEach(m => { m.visible = on && !m.userData.broken; }); if (k <= 5) setTimeout(back, 90 + Math.random() * 120); else { camera.remove(s.torch, s.torch.target); s.lights = null; s.glow = null; } }; back(); }
}
// ---------- Weapons meet fire: balls that pass through flames catch and carry them, thrown burning things light what they land
// on, and the leaf blower fans a fire along
let hot = [];
function heatBody(body, r) {
  const h = hot.find(q => q.body === body); if (h) { h.until = performance.now() + 8000; return; }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); scene.add(s);
  hot.push({ body, r, s, until: performance.now() + 8000 }); A.at(body.position, () => A.SFX.whoosh(false));
}
function updateHot(now) {
  if (fires.length) for (const [b, r] of wrecks.map(w => [w.body, room.open ? 0.9 : 0.45]).concat(balls.map(b => [b.body, b.body.shapes[0].radius || 0.14])))
    for (const f of fires) if (firePos(f).distanceTo(b.position) < r + (f.furn ? 0.9 : 0.5)) { heatBody(b, r); break; }
  hot = hot.filter(h => {
    if (now > h.until || !h.body.world) { scene.remove(h.s); h.s.material.dispose(); return false; }
    const p = h.body.position, k = h.r * 2.4 * (0.85 + 0.2 * Math.sin(now * 0.02)); h.s.scale.set(k * 0.8, k * 1.3, 1); h.s.position.set(p.x, p.y + h.r * 0.5, p.z);
    for (const it of I.list) if (!it.fire && burnable(it) && it.body.position.distanceTo(p) < h.r + 0.45) ignite(it);
    for (const fu of room.furniture) if (!fu.dead && !fu.fire && fu.parts[0].position.distanceTo(p) < h.r + 0.9) ignite(fu, true);
    return true; });
  for (const f of fires) if (!f.furn && f.tg.thrown) for (const it of I.list) if (!it.fire && burnable(it) && it.body.position.distanceTo(f.tg.body.position) < 1.1) ignite(it); // a flaming throw lights what it lands in
}
function fanFire(o, f, dt) { // the leaf blower makes flames jump downwind
  for (const fi of fires) { const p = firePos(fi), v = p.clone().sub(o), d = v.length(); if (d > 6 || v.normalize().dot(f) < 0.85) continue;
    fi.size = Math.min(fi.furn ? 1.1 : 1, fi.size * (1 + dt * 0.4));
    if (Math.random() < dt * 2) { const ahead = p.clone().addScaledVector(f, 1.2); for (const it of I.list) if (!it.fire && burnable(it) && it.body.position.distanceTo(ahead) < 1) ignite(it);
      for (const fu of room.furniture) if (!fu.dead && !fu.fire && fu.parts[0].position.distanceTo(ahead) < 1.4) ignite(fu, true); } }
}

// ---------- Build & smash: draw a domino line by looking along the floor (key 1 starts and stops)
let drawDom = null;
function toggleDraw() {
  if (drawDom) { toast(drawDom.n ? `${drawDom.n} dominoes. Knock the first one over` : 'No dominoes laid'); drawDom = null; return; }
  drawDom = { last: null, n: 0 }; toast('Look along the floor to lay dominoes. Press 1 again to finish');
}
function updateDraw() {
  if (!drawDom || state !== 'play' || paused) return;
  const h = surfaceHit(camera.getWorldPosition(new THREE.Vector3()), camera.getWorldDirection(new THREE.Vector3()), 8); if (!h || h.normal.y < 0.8) return;
  const p = h.point, L = drawDom.last; if (!L) { drawDom.last = { x: p.x, y: p.y, z: p.z }; return; }
  const dx = p.x - L.x, dz = p.z - L.z, d = Math.hypot(dx, dz); if (d < 0.3) return; if (d > 1.5) { drawDom.last = { x: p.x, y: p.y, z: p.z }; return; } // jumped: start a new line there
  const a = Math.atan2(dx, dz), steps = Math.floor(d / 0.3);
  for (let k = 1; k <= steps; k++) { const x = L.x + dx / d * 0.3 * k, z = L.z + dz / d * 0.3 * k;
    if (room.obstacles.some(([x1, x2, z1, z2]) => x > x1 && x < x2 && z > z1 && z < z2)) continue;
    const it = I.add('domino', x, p.y, z, a); it.body.sleep(); it.born = performance.now(); drawDom.n++; drawDom.last = { x, y: p.y, z }; }
  A.SFX.wood(0.12, 1.7); if (drawDom.n >= 150) toggleDraw();
}

// ---------- Rooms that react: smoke alarms then sprinklers when a fire takes hold; car alarms set each other off
let smoke = null;
function updateSprinklers(dt, now) {
  if (room.open || OUTDOOR.has(opts.scene) || room.space || room.zen) return;
  if (!smoke && fires.some(f => f.t > 3)) { smoke = { t0: now, beep: 0, on: 0 }; toast('Smoke alarm!'); }
  if (!smoke) return;
  if (now > smoke.beep && !smoke.on) { smoke.beep = now + 1700; A.smokeBeep(); }
  if (!smoke.on && now - smoke.t0 > 6000) { smoke.on = now; banner('Sprinklers!'); smoke.hiss = A.loopAt('rain', null, 0.55, 1.25); emit('sprinkler'); }
  if (smoke.on) {
    if ((smoke.dropT = (smoke.dropT || 0) - dt) < 0) { smoke.dropT = 0.05; const [x1, x2, z1, z2] = room.bounds; for (let i = 0; i < 4; i++) puff(new THREE.Vector3(rand(x1, x2), 2.7, rand(z1, z2)), 0xa8d0f0, 1, 0.05, 0, 0.7, 0.45, new THREE.Vector3(0, -7, 0)); }
    for (const f of fires) if (f.t > 0.5 && Math.random() < dt * 0.9) { f.out = true; puff(firePos(f).clone().add({ x: 0, y: 0.3, z: 0 }), 0xe8e8ec, 3, 0.5, 0.8, 0.5, 1.4); }
    if (now - smoke.on > 12000) stopSprinklers();
  }
}
function stopSprinklers() { smoke?.hiss?.stop(); smoke = null; }
let cityAlarms = [];
function cityAlarm(c, depth = 0) { // a parked car in the open city starts wailing, and the ones parked nearby join in
  const now = performance.now(); if (c.ai || c === driving || c.dead || (c.alarmUntil || 0) > now) return;
  c.alarmUntil = now + 9000; cityAlarms.push({ c, until: c.alarmUntil, sound: A.loopAt('alarm', c.body.position, 0.45, rand(0.95, 1.08)) }); addHeat(5);
  if (depth < 2) for (const o of cars) if (o !== c && !o.ai && !o.dead && o !== driving && o.body.position.distanceTo(c.body.position) < 14) setTimeout(() => state === 'play' && cityAlarm(o, depth + 1), rand(500, 1500)); // two rings out, not the whole city
}
function updateCityAlarms(now) { cityAlarms = cityAlarms.filter(a => { if (now > a.until || a.c.dead) { a.sound?.stop(); return false; } return true; }); }

// ---------- Pets: a cat or a dog that wanders, hides from crashes, and likes being petted (E). Nothing can hurt it
let pet = null;
function makePet(kind) {
  const dog = kind === 'dog', fur = S.mat('fabric', dog ? pick([0xc89a5a, 0x3a2a20, 0xe8e0d0, 0x8a6a4a]) : pick([0xe0a050, 0x3a3a3e, 0xd8d4cc, 0x9a7a5a])), dark = S.mat('plastic', 0x15151a), pink = S.mat('plastic', 0xd88a8a);
  const g = new THREE.Group(), s = dog ? 1.45 : 1, ball = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; return o; };
  const body = ball(0.11 * s, fur, 0, 0.2 * s, 0, 1, 0.85, 1.9); g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.3 * s, 0.2 * s); g.add(head); head.add(ball(0.085 * s, fur, 0, 0, 0));
  if (dog) { head.add(ball(0.05 * s, fur, 0, -0.02 * s, 0.08 * s, 1, 0.8, 1.3)); head.add(ball(0.018 * s, dark, 0, -0.005 * s, 0.14 * s)); for (const x of [-1, 1]) head.add(ball(0.035 * s, fur, x * 0.075 * s, -0.01 * s, -0.01 * s, 0.5, 1.4, 1)); }
  else { head.add(ball(0.012, pink, 0, -0.015, 0.083)); for (const x of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), fur); e.position.set(x * 0.045, 0.07, 0); head.add(e); } }
  for (const x of [-1, 1]) head.add(ball(0.013 * s, dark, x * 0.035 * s, 0.02 * s, 0.072 * s));
  const legs = []; for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const p = new THREE.Group(); p.position.set(x * 0.06 * s, 0.17 * s, z * 0.13 * s); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * s, 0.02 * s, 0.17 * s, 8), fur); l.position.y = -0.085 * s; l.castShadow = true; p.add(l); g.add(p); legs.push(p); }
  const tail = new THREE.Group(); tail.position.set(0, 0.24 * s, -0.2 * s); const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * s, 0.022 * s, dog ? 0.14 : 0.26, 8), fur); tl.position.y = (dog ? 0.07 : 0.13); tail.add(tl); tail.rotation.x = dog ? -0.6 : -0.3; g.add(tail);
  g.traverse(o => { if (o.isMesh) S.outline(o, 1.06); });
  return { g, head, legs, tail, dog, sp: dog ? 1.3 : 0.9 };
}
function spawnPet() {
  pet = null; if (!opts.pet || opts.pet === 'none' || room.open || room.space || opts.scene === 'tinytown') return;
  const m = makePet(opts.pet), spot = freeSpot(1.5, 0.4) || { x: room.start.x + 1, z: room.start.z - 1 }; m.g.position.set(spot.x, 0, spot.z); scene.add(m.g);
  pet = { ...m, x: spot.x, z: spot.z, yaw: 0, mode: 'idle', until: performance.now() + 1500, tx: spot.x, tz: spot.z, phase: 0, happy: 0, sound: null };
}
const petBlocked = (x, z, hide) => { const [x1, x2, z1, z2] = room.bounds; if (x < x1 || x > x2 || z < z1 || z > z2) return true; return room.obstacles.some(o => o !== hide && x > o[0] - 0.1 && x < o[1] + 0.1 && z > o[2] - 0.1 && z < o[3] + 0.1); };
function petScare(p) {
  if (!pet || pet.mode === 'hide' || floorY < -0.5) return; const d = Math.hypot(p.x - pet.x, p.z - pet.z); if (d > 4.5) return;
  const tables = room.furniture.filter(f => !f.dead && f.name === 'table' && f.obstacle).sort((a, b) => Math.hypot(a.parts[0].position.x - pet.x, a.parts[0].position.z - pet.z) - Math.hypot(b.parts[0].position.x - pet.x, b.parts[0].position.z - pet.z));
  const t = tables[0]; if (t && Math.hypot(t.parts[0].position.x - pet.x, t.parts[0].position.z - pet.z) < 7) { pet.mode = 'run'; pet.hide = t; pet.tx = t.parts[0].position.x; pet.tz = t.parts[0].position.z; }
  else { const a = Math.atan2(pet.x - p.x, pet.z - p.z); pet.mode = 'run'; pet.hide = null; pet.tx = pet.x + Math.sin(a) * 3; pet.tz = pet.z + Math.cos(a) * 3; }
  pet.until = performance.now() + 7000; if (Math.random() < 0.6) A.at(new THREE.Vector3(pet.x, 0.3, pet.z), () => A.play(pet.dog ? 'bark' : 'meow', pet.dog ? 0.6 : 0.5, pet.dog ? 1 : 1.15));
}
function petPet() {
  if (!pet || Math.hypot(player.x - pet.x, player.z - pet.z) > 1.4 || floorY < -0.5) return false;
  pet.happy = performance.now() + 2500; pet.mode = 'idle'; pet.until = pet.happy; popup('♥', { x: pet.x, y: 0.7, z: pet.z }, 'small'); addStat('pets'); emit('pet'); vibrate(20);
  A.at(new THREE.Vector3(pet.x, 0.3, pet.z), () => pet.dog ? A.play('bark', 0.35, 1.2) : (pet.sound = A.loopAt('purr', new THREE.Vector3(pet.x, 0.3, pet.z), 0.5)));
  if (pet.sound) { const s = pet.sound; setTimeout(() => s.stop(), 2200); pet.sound = null; } return true;
}
function updatePet(dt, now) {
  if (!pet) return; const P = pet;
  if (P.mode === 'idle' && now > P.until) { // pick somewhere to go: often toward you, otherwise anywhere free
    let tx, tz; for (let i = 0; i < 12; i++) { if (Math.random() < 0.35) { tx = player.x + rand(-1.2, 1.2); tz = player.z + rand(-1.2, 1.2); } else { const s = freeSpot(0, 0.3); if (!s) continue; tx = s.x; tz = s.z; } if (!petBlocked(tx, tz)) break; }
    if (tx != null) { P.tx = tx; P.tz = tz; P.mode = 'walk'; } P.until = now + 9000; }
  const moving = P.mode === 'walk' || P.mode === 'run';
  if (moving) { const dx = P.tx - P.x, dz = P.tz - P.z, d = Math.hypot(dx, dz), sp = P.sp * (P.mode === 'run' ? 2.4 : 1);
    if (d < 0.15 || now > P.until) { if (P.mode === 'run' && P.hide) { P.mode = 'hide'; P.until = now + rand(4000, 6500); } else { P.mode = 'idle'; P.until = now + rand(1500, 4500); } }
    else { const want = Math.atan2(dx, dz); let da = want - P.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); P.yaw += Math.max(-6 * dt, Math.min(6 * dt, da));
      const nx = P.x + Math.sin(P.yaw) * sp * dt, nz = P.z + Math.cos(P.yaw) * sp * dt;
      if (!petBlocked(nx, nz, P.mode === 'run' ? P.hide?.obstacle : null)) { P.x = nx; P.z = nz; } else { P.mode = 'idle'; P.until = now + 600; } } }
  if (P.mode === 'hide' && now > P.until) { P.mode = 'idle'; P.until = now + 800; }
  P.phase += dt * (moving ? (P.mode === 'run' ? 22 : 11) : 0);
  P.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(P.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0; });
  const crouch = P.mode === 'hide' ? 0.6 : 1, happy = now < P.happy;
  P.g.position.set(P.x, moving ? Math.abs(Math.sin(P.phase)) * 0.015 : 0, P.z); P.g.rotation.y = P.yaw; P.g.scale.y = crouch;
  P.tail.rotation.z = P.dog ? Math.sin(now * (happy ? 0.03 : 0.008)) * (happy ? 0.8 : 0.3) : Math.sin(now * 0.002) * 0.4;
  P.head.rotation.x = P.mode === 'hide' ? 0.4 : happy ? -0.2 : Math.sin(now * 0.001) * 0.1;
}

// ---------- Silly physics: bouncy everything, big chunks, cartoon noises (lobby toggle)
function sillySound() { const k = pick(['boing', 'boing', 'whistle', 'honk', 'pop']); A.SILLY[k](); }

// ---------- Zen garden: rake the sand with the broom, feed the koi, ring the chimes
let zen = null;
function setupZen() {
  zen = null; if (!room.zen) return; const Z = room.zenParts; if (!Z) return;
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'); const tex = new THREE.CanvasTexture(c);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(Z.W, Z.D), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); plane.rotation.x = -Math.PI / 2; plane.position.y = 0.004; scene.add(plane);
  const fish = []; for (let i = 0; i < 5; i++) { const f = new THREE.Group(), col = pick([0xf07a20, 0xf8f4ec, 0xe84a2a, 0xf0c040]); const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), S.mat('paint', col)); b.scale.set(0.6, 0.4, 1.6); f.add(b); const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 6), S.mat('paint', col)); t.rotation.x = -Math.PI / 2; t.position.z = -0.12; f.add(t); f.position.y = -0.005; scene.add(f); fish.push({ f, a: rand(0, 6.28), r: rand(0.4, 1.3), sp: rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1), food: null }); }
  zen = { Z, g, tex, plane, fish, last: null, chimeSwing: 0, food: [] };
}
function rakeSand(dt) {
  if (!zen || W.tool !== 'broom' || !mouseHeld || state !== 'play' || paused) { if (zen) zen.last = null; return; }
  const h = surfaceHit(camera.getWorldPosition(new THREE.Vector3()), camera.getWorldDirection(new THREE.Vector3()), 4); if (!h || h.normal.y < 0.8) return;
  const Z = zen.Z, u = (h.point.x + Z.W / 2) / Z.W * 1024, v = (h.point.z + Z.D / 2) / Z.D * 1024, L = zen.last; zen.last = { u, v };
  if (!L || Math.hypot(u - L.u, v - L.v) < 1) return; const g = zen.g, nx = -(v - L.v), ny = u - L.u, n = Math.hypot(nx, ny) || 1;
  g.lineCap = 'round'; for (let k = -2; k <= 2; k++) { const ox = nx / n * k * 7, oy = ny / n * k * 7; g.strokeStyle = 'rgba(110,95,70,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(L.u + ox, L.v + oy); g.lineTo(u + ox, v + oy); g.stroke(); g.strokeStyle = 'rgba(250,244,228,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(L.u + ox + 2, L.v + oy + 2); g.lineTo(u + ox + 2, v + oy + 2); g.stroke(); }
  zen.tex.needsUpdate = true; if (Math.random() < dt * 6) A.at(h.point, () => A.SFX.sweep?.(0.15));
}
function feedKoi() {
  if (!zen) return false; const P = zen.Z.pond, d = Math.hypot(player.x - P.x, player.z - P.z); if (d > P.r + 1.6) return false;
  for (let i = 0; i < 6; i++) { const a = rand(0, 6.28), r = rand(0, P.r * 0.6), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r; const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), S.mat('paint', 0xc89a5a)); m.position.set(x, 0.015, z); scene.add(m); zen.food.push({ m, t: performance.now() + 8000 }); }
  zen.fish.forEach(f => { f.food = zen.food[Math.floor(Math.random() * zen.food.length)]; });
  popup('Feeding time', { x: P.x, y: 0.6, z: P.z }, 'small'); A.at(new THREE.Vector3(P.x, 0, P.z), () => A.SFX.splash?.(0.2)); emit('koi'); return true;
}
function ringChimes() {
  if (!zen) return; const C = zen.Z.chimes, o = camera.getWorldPosition(new THREE.Vector3()), v = C.pos.clone().sub(o); if (v.length() > 2.6 || v.normalize().dot(camera.getWorldDirection(new THREE.Vector3())) < 0.75) return;
  zen.chimeSwing = 1; for (let k = 0; k < 5; k++) setTimeout(() => A.chime(rand(0.04, 0.08)), k * rand(60, 160)); emit('chimes');
}
function updateZen(dt, now) {
  if (!zen) return; rakeSand(dt); const P = zen.Z.pond;
  zen.food = zen.food.filter(f => { if (now > f.t || f.eaten) { scene.remove(f.m); return false; } return true; });
  for (const F of zen.fish) {
    if (F.food && !F.food.eaten && zen.food.includes(F.food)) { const p = F.food.m.position, dx = p.x - F.f.position.x, dz = p.z - F.f.position.z, d = Math.hypot(dx, dz);
      if (d < 0.06) { F.food.eaten = true; A.at(p, () => A.SFX.splash?.(0.08)); F.food = null; } else { const s = Math.min(d, dt * 0.7); F.f.position.x += dx / d * s; F.f.position.z += dz / d * s; F.f.rotation.y = Math.atan2(dx, dz); } continue; }
    F.a += F.sp * dt / F.r; const x = P.x + Math.cos(F.a) * F.r, z = P.z + Math.sin(F.a) * F.r; F.f.rotation.y = Math.atan2(x - F.f.position.x, z - F.f.position.z) || F.f.rotation.y; F.f.position.set(x, -0.005, z);
    F.f.children[1].rotation.y = Math.sin(now * 0.012 + F.r * 5) * 0.4; }
  const C = zen.Z.chimes; zen.chimeSwing *= Math.pow(0.4, dt); C.tubes.forEach((t, i) => { t.rotation.z = Math.sin(now * 0.004 + i) * (0.05 + zen.chimeSwing * 0.35); });
}

// ---------- Scrapyard: whatever the press flattens comes out as a scrap cube, stacked beside it
function makeCube(P) {
  const n = P.count || 0, car = P.car; P.count = 0; P.car = null; if (!n && !car) return;
  for (let i = I.chunks.length - 1; i >= 0; i--) { const c = I.chunks[i], q = c.body.position; if (Math.abs(q.x - P.x) < P.w / 2 + 0.1 && Math.abs(q.z - P.z) < P.d / 2 + 0.1) { world.removeBody(c.body); scene.remove(c.mesh); I.chunks.splice(i, 1); } }
  if (car) { for (const it of I.list.slice()) if (!it.dead && it.group === car.group) I.remove(it);
    P.respawn = true; } // a fresh car rolls in once the press is back up
  const k = (P.cubes = (P.cubes || 0) + 1) - 1, s = car ? 0.95 : Math.min(0.75, 0.4 + n * 0.05), x = P.x + P.w / 2 + 1.3 + (k % 2) * 1.05, z = P.z - 1.6 + (Math.floor(k / 2) % 4) * 1.05, y = Math.floor(k / 8) * 1.0;
  const cube = I.add('scrapcube', x, y, z, rand(-0.2, 0.2), { s }), pts = 60 + n * 25 + (car ? 200 : 0);
  addScore(pts, cube.body.position, 'big'); popup('Scrap cube!', { x, y: y + 1.2, z }, 'small'); addStat('cubes'); emit('cube');
  A.at(cube.body.position, () => { A.SFX.metal(1, 0.55); A.SFX.metalfall?.(0.6); }); puff(new THREE.Vector3(x, 0.3, z), 0x8a8478, 5, 0.5, 0.2, 0.5);
}
// ---------- Domino runs: a snaking line across the floor that ends at gas cans
function dominoRun() {
  const [x1, x2, z1, z2] = room.bounds, free = (x, z) => x > x1 && x < x2 && z > z1 && z < z2 && !room.obstacles.some(([a, b, c, d]) => x > a - 0.3 && x < b + 0.3 && z > c - 0.3 && z < d + 0.3) && Math.hypot(x - room.start.x, z - room.start.z) > 1.2;
  for (let tries = 0; tries < 12; tries++) {
    let x = rand(x1 + 1, x2 - 1), z = rand(z1 + 1, z2 - 1), a = rand(0, 6.28); const pts = [];
    while (pts.length < 40 && free(x, z)) { pts.push([x, z, a]); a += Math.sin(pts.length * 0.4) * 0.12; x += Math.sin(a) * 0.3; z += Math.cos(a) * 0.3; }
    if (pts.length < 14) continue;
    for (const [px, pz, pa] of pts) { const it = I.add('domino', px, 0, pz, pa); it.body.sleep(); it.born = performance.now(); }
    const [ex, ez, ea] = pts[pts.length - 1];
    for (let k = 1; k <= 2; k++) { const gx = ex + Math.sin(ea) * 0.35 * k, gz = ez + Math.cos(ea) * 0.35 * k; if (free(gx, gz)) { const g = I.add('gascan', gx, 0, gz, ea); g.body.sleep(); } }
    return true;
  }
  return false;
}
// ---------- Break right through a wall into a hidden room behind it
let broken = 0;
function breakThrough(h) {
  const wall = h.object, sz = wall.userData.size; if (!sz || !wall.userData.body || broken >= 2 || room.open) return false;
  const alongX = sz[2] <= 0.25 && sz[0] > 1; if (!alongX && !(sz[0] <= 0.25 && sz[2] > 1)) return false;
  const L = alongX ? sz[0] : sz[2], H = sz[1], T = 0.2, c = wall.position, cu = alongX ? c.x : c.z, wc = alongX ? c.z : c.x;
  const out = Math.sign(alongX ? c.z - player.z : c.x - player.x), DW = 1.6, DH = Math.min(2.3, H - 0.3), CW = 3.4, CD = 3;
  if (L < CW + 0.6 || H < 2.4) return false;
  const u = Math.max(cu - L / 2 + CW / 2 + 0.2, Math.min(cu + L / 2 - CW / 2 - 0.2, alongX ? h.point.x : h.point.z));
  world.removeBody(wall.userData.body); scene.remove(wall); room.statics.splice(room.statics.indexOf(wall), 1);
  const mat = wall.material, XZ = (a, b) => alongX ? [a, b] : [b, a];
  const box = (lu, ly, lw, pu, py, pw, m = mat) => { if (lu < 0.02) return; const [sx, sz2] = XZ(lu, lw), [px, pz] = XZ(pu, pw); room.box(sx, ly, sz2, m, px, py, pz, { cast: false }); };
  const a0 = cu - L / 2, a1 = u - DW / 2, b0 = u + DW / 2, b1 = cu + L / 2;
  box(a1 - a0, H, T, (a0 + a1) / 2, H / 2, wc); box(b1 - b0, H, T, (b0 + b1) / 2, H / 2, wc); box(DW, H - DH, T, u, DH + (H - DH) / 2, wc); // the wall, now with a ragged doorway
  const cw = wc + out * (T / 2 + CD / 2), back = wc + out * (T / 2 + CD + T / 2);
  box(CW + 2 * T, 0.2, CD + T, u, -0.1, cw + out * T / 2, S.surface('concreteFloor', 2, 2)); box(CW, H, T, u, H / 2, back);
  box(T, H, CD, u - CW / 2 - T / 2, H / 2, cw); box(T, H, CD, u + CW / 2 + T / 2, H / 2, cw); box(CW + 2 * T, 0.2, CD + T, u, H + 0.1, cw + out * T / 2);
  const [lx, lz] = XZ(u, cw), bulb = new THREE.PointLight(0xffd8a0, S.realistic ? 9 : 3, 6, 2); bulb.position.set(lx, H - 0.4, lz); scene.add(bulb);
  // walkable: the doorway and the room behind
  const rect = (u0, u1, w0, w1) => { const [p0, q0] = XZ(Math.min(u0, u1), Math.min(w0, w1)), [p1, q1] = XZ(Math.max(u0, u1), Math.max(w0, w1)); room.extra.push([p0, p1, q0, q1]); };
  rect(u - DW / 2 + 0.35, u + DW / 2 - 0.35, wc - out * 0.6, cw); rect(u - CW / 2 + 0.35, u + CW / 2 - 0.35, wc + out * (T / 2 + 0.35), back - out * (T / 2 + 0.35));
  // a hidden stash: things to smash, worth extra
  const stash = room.pool.filter(k => k !== 'gascan'); for (let i = 0; i < 9; i++) { const [sx, sz2] = XZ(u + rand(-CW / 2 + 0.5, CW / 2 - 0.5), cw + out * rand(-CD / 2 + 0.5, CD / 2 - 0.5)); I.add(pick(stash), sx, 0.05, sz2, rand(0, 6)); }
  for (const m of marks.filter(m => Math.abs((alongX ? m.position.z : m.position.x) - wc) < 0.3 && Math.abs((alongX ? m.position.x : m.position.z) - u) < DW / 2 + 0.2 && m.position.y < DH + 0.2)) m.visible = false;
  for (let i = 0; i < 26; i++) I.shard('stone', rand(0.05, 0.13), 0xb8b0a4, h.point, new CANNON.Vec3(), h.normal.clone().setY(0.2).normalize(), 4, 0.4);
  puff(h.point, 0xc8c0b4, 14, 0.9, 0.3, 0.6); A.at(h.point, () => { A.SFX.stone(1.4, 0.6); A.SFX.boom(); }); shake = Math.max(shake, 0.6); freeze(90); vibrate(160);
  broken++; banner('Breakthrough!'); addScore(100, h.point, 'big'); emit('breakthrough'); addStat('breakthroughs');
  return true;
}
function stayInside() { // keep the player in the room, or in any space opened up behind a wall
  const rs = playerRects(); if (rs.some(([a, b, c, d]) => player.x >= a && player.x <= b && player.z >= c && player.z <= d)) return;
  let best = null, bd = Infinity; for (const [a, b, c, d] of rs) { const x = Math.max(a, Math.min(b, player.x)), z = Math.max(c, Math.min(d, player.z)), dd = Math.hypot(x - player.x, z - player.z); if (dd < bd) { bd = dd; best = [x, z]; } }
  player.x = best[0]; player.z = best[1];
}
function updateRooms(dt, now) {
  updateBoss(now); updateMachines(dt, now); updateFire(dt, now); updateTramps(now); updateFloor(dt, now); updateStorm(now); updateHot(now); updateDraw(); updateSprinklers(dt, now); updateCityAlarms(now); updatePet(dt, now); updateZen(dt, now); updateFireworks(dt, now); updateMic(dt, now);
  if (museumAlarm) { museumAlarm.light.intensity = Math.floor(now / 300) % 2 ? (S.realistic ? 60 : 25) : 0; if (now > museumAlarm.until) { museumAlarm.sound?.stop(); museumAlarm.light.intensity = 0; museumAlarm.done = true; } }
  for (const B of breaches) {
    if (now > B.until) { if (B.sound) { B.sound.stop(); B.sound = null; banner('Breach sealed'); } continue; }
    const pull = (body, k) => { const d = B.at.clone().sub(body.position), L = d.length(); if (L > 9) return; body.wakeUp(); d.normalize().multiplyScalar(k * dt * (1 - L / 10)); body.velocity.x += d.x; body.velocity.y += d.y; body.velocity.z += d.z; };
    for (const it of I.list) if (!it.dead && !it.fixed && !it.held) { pull(it.body, 22 / Math.sqrt(Math.max(0.3, it.def.mass))); if (it.body.position.distanceTo(B.at) < 0.7) { I.shatter(it, B.n.clone().negate(), 4, false); addScore(5, B.at, 'small'); } }
    for (const c of [...I.chunks]) { pull(c.body, 26); if (c.body.position.distanceTo(B.at) < 0.6) { world.removeBody(c.body); scene.remove(c.mesh); I.chunks.splice(I.chunks.indexOf(c), 1); } }
    puff(B.at.clone().addScaledVector(B.n, 0.4), 0xd8e8ff, 1, 0.3, 0, 0.35, 0.6, B.n.clone().multiplyScalar(-4));
  }
  if (room.bowling && room.lanes) for (const L of room.lanes) { // after a roll, count what is down, then reset the pins
    const ballNear = balls.some(b => Math.abs(b.body.position.x - L.x) < 0.7 && b.body.position.z < -8.5);
    if (ballNear) L.rolled = true;
    if (!L.rolled) continue; L.wait += dt; if (L.wait < 3.2) continue;
    const down = L.pins.filter(p => p.dead || new THREE.Vector3(0, 1, 0).applyQuaternion(p.mesh.quaternion).y < 0.8 || p.body.position.y < -0.2).length;
    const at = { x: L.x, y: 1.2, z: -10.5 };
    if (down === 10) { banner('STRIKE!'); addScore(300, at, 'big'); A.SFX.unlock(); addStat('strikes'); emit('strike'); } else if (down > 0) { popup(`${down} pins`, at, 'big'); addScore(down * 15, at, 'small'); }
    room.rack(L); A.at(at, () => A.SFX.wood(0.5, 0.8));
    balls = balls.filter(b => { const gone = Math.abs(b.body.position.x - L.x) < 0.7 && b.body.position.z < -8.5; if (gone) { world.removeBody(b.body); scene.remove(b.mesh); } return !gone; }); // the ball comes back
  }
}

// ---------- blackout: any room in the dark with a flashlight (unlocked by "Lights out")
function applyBlackout() {
  if (!opts.dark || !save.ach.lamps) return;
  scene.traverse(o => { if (o.isLight) o.intensity *= o.isHemisphereLight ? 0.08 : 0.04; });
  for (const L of room.lamps) { L.broken = true; L.light.intensity = 0; L.meshes.forEach(m => { m.visible = false; m.userData.broken = true; }); }
  const torch = new THREE.SpotLight(0xfff4e0, S.realistic ? 9 : 6, 14, 0.45, 0.5, 1); torch.position.set(-0.1, 0.1, 0.25); torch.castShadow = true; // decay 1 so the weapon close by isn't blown out
  torch.target.position.set(0, -0.15, -1); camera.add(torch, torch.target);
  scene.environment = null; // no ambient reflections in the dark
  scene.fog && scene.fog.color.setHex(0x050508); scene.background = new THREE.Color(0x050508);
}

// ---------- session flow
let modelsReady = null;
const headReady = preloadClayBody().then(() => { if (state === 'menu' && opts.scene === 'studio') build(); });
async function startSession() {
  A.initAudio(); A.setVolume(save.vol); A.setRoom(opts.scene);
  if (opts.scene === 'studio') { $('start').textContent = 'Loading…'; await Promise.race([headReady, new Promise(r => setTimeout(r, 20000))]); $('start').textContent = 'Start smashing'; }
  if (opts.mode === 'realistic' && modelsReady) { $('start').textContent = 'Loading…'; await modelsReady; $('start').textContent = 'Start smashing'; }
  build(); startMic();
  Object.assign(player, { x: room.start.x, z: room.start.z, yaw: 0, pitch: -0.18 });
  timeLeft = room.zen ? Infinity : opts.gm === 'targets' ? 90 : opts.gm === 'classic' ? SESSION : Infinity; document.body.classList.toggle('zen', !!room.zen);
  score = 0; smashed = 0; combo = 0; bestCombo = 0; rageMeter = 0; rageUntil = 0; byKind = {}; restocking = false; throws = 0;
  elapsed = 0; figureDowned = false; targetsHit = 0; kick = 0; goldenAt = performance.now() + 8000;
  if (opts.gm === 'attack') { I.batch(room.pool, room.slots, 8); I.pyramid(room.slots); }
  if (opts.gm === 'targets') for (let i = 0; i < 4; i++) spawnTarget();
  state = 'play'; paused = false; fpsT = 0; fpsN = 0;
  replay.start();
  mission = null; nextMission = performance.now() + 9000; $('mission').classList.add('hidden'); $('tut').classList.add('hidden'); tut = null;
  if (!save.tut || tutAgain) { tutAgain = false; startTut(); }
  for (const id of ['modeScreen', 'lobby', 'end', 'pause', 'achScreen']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  A.setMusicStyle(opts.gm === 'zen' || room.calm ? 'calm' : 'heavy'); A.setMusic(opts.music, true); A.startAmbience(room.amb); startStorm();
  banner({ classic: 'Go!', zen: 'Relax', attack: 'Clear the room!', targets: 'Hit the targets!', build: 'Build it, then break it' }[opts.gm]);
  $('palette').classList.toggle('hidden', opts.gm !== 'build'); if (W.tool === 'broom') spawnBin();
  if (!isTouch) lockMouse();
}
function endSession() {
  state = 'end'; mouseHeld = false; dropHeld(); stopMic(); pressSnd?.stop(); pressSnd = null; fireSnd?.stop(); fireSnd = null; stopSprinklers(); cityAlarms.forEach(a => a.sound?.stop()); cityAlarms = []; setHighlight(null); document.exitPointerLock?.(); A.SFX.buzzer(); A.setMusic(opts.music, false); A.stopAmbience();
  document.body.classList.remove('rage'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const before = Object.keys(WEAPONS).filter(unlocked);
  save.points += score; save.smashed += smashed; maxStat('round', smashed);
  if (tut) { tut = null; $('tut').classList.add('hidden'); } mission = null; $('mission').classList.add('hidden');
  const attack = opts.gm === 'attack', cleared = attack && remaining() === 0;
  const key = bestKey(opts.scene), list = save.best[key] || [], entry = { score, smashed, w: opts.weapon, d: Date.now(), time: cleared ? Math.round(elapsed * 10) / 10 : null };
  if ((!attack || cleared) && !['build', 'clean'].includes(opts.gm)) { list.push(entry); list.sort((a, b) => attack ? a.time - b.time : b.score - a.score); save.best[key] = list.slice(0, 5); }
  persist();
  const fresh = Object.keys(WEAPONS).filter(k => unlocked(k) && !before.includes(k));
  if (siren) { siren.stop(); siren = null; } alarms.forEach(a => a.sound?.stop()); toolStop(); if (driving) exitCar(); museumAlarm?.sound?.stop(); breaches.forEach(b => { b.sound?.stop(); b.sound = null; }); cars.forEach(c => { c.alarm?.stop(); c.alarm = null; }); A.setRain(0); $('palette').classList.add('hidden');
  $('cleanBtn').classList.toggle('hidden', opts.gm === 'clean' || I.chunks.length < 12);
  $('rating').textContent = opts.gm === 'clean' ? (I.chunks.length === 0 ? 'Spotless. Feel better?' : `Swept ${swept} pieces`) : busted ? 'Busted! The cops got you' : attack ? (cleared ? `Cleared in ${fmtTime(elapsed)}` : 'Room not cleared')
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
  $('music').checked = opts.music;
  $('darkTog').classList.toggle('hidden', !save.ach.lamps);
  $('achBtn').textContent = `Achievements ${ACH.filter(a => save.ach[a.id]).length}/${ACH.length}`;
  $('lifetime').textContent = `Lifetime: ${save.points.toLocaleString()} points · ${save.smashed.toLocaleString()} things smashed`;
  $('photoName').textContent = photoTex ? 'Photo added. It shows up on cut-outs and picture frames.' : 'Optional. Stays on your device and is never uploaded.';
  $('photoClear').classList.toggle('hidden', !photoTex);
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  opts.mode = b.dataset.mode; $('modeScreen').classList.add('hidden'); renderLobby(); $('lobby').classList.remove('hidden'); build();
  if (opts.mode === 'realistic') modelsReady = modelsReady || preloadItemModels().then(() => { if (state === 'menu' && opts.mode === 'realistic') build(); });
});
$('scenes').onclick = e => { const b = e.target.closest('.card'); if (!b) return; opts.scene = b.dataset.s; if (opts.scene === 'studio') opts.weapon = 'hands'; if (opts.scene === 'bowling') opts.weapon = 'bowling'; if (opts.scene === 'city' && opts.gm === 'classic') opts.gm = 'zen'; renderLobby(); build(); };
$('weapons').onclick = e => { const b = e.target.closest('.card'); if (!b || b.classList.contains('locked')) return; opts.weapon = b.dataset.w; renderLobby(); equip(opts.weapon); };
$('words').value = save.words;
$('words').oninput = () => { save.words = $('words').value.slice(0, 120); persist(); };
$('palette').onclick = e => { const b = e.target.closest('[data-p]'); if (b) placePreset(+b.dataset.p); };
document.querySelectorAll('.vol').forEach(el => {
  el.value = Math.round(save.vol[el.dataset.v] * 100);
  el.oninput = () => { save.vol[el.dataset.v] = el.value / 100; document.querySelectorAll(`.vol[data-v=${el.dataset.v}]`).forEach(o => { o.value = el.value; }); A.setVolume(save.vol); persist(); };
});
document.querySelectorAll('.set').forEach(el => {
  const k = el.dataset.k; if (el.type === 'checkbox') el.checked = !!save.set[k]; else el.value = save.set[k];
  el.oninput = el.onchange = () => {
    save.set[k] = el.type === 'checkbox' ? el.checked : +el.value;
    document.querySelectorAll(`.set[data-k=${k}]`).forEach(o => { if (o !== el) { if (o.type === 'checkbox') o.checked = el.checked; else o.value = el.value; } });
    if (k === 'fov' && camera) { camera.fov = save.set.fov; camera.updateProjectionMatrix(); }
    persist();
  };
});
function renderAch() {
  const got = ACH.filter(a => save.ach[a.id]).length; $('achCount').textContent = `${got} of ${ACH.length} unlocked`;
  $('achGrid').innerHTML = ACH.map(a => { const v = Math.min(a.need, save.stats[a.stat] || 0), ok = !!save.ach[a.id];
    const rw = REWARD[a.id];
    return `<div class="card${ok ? ' got' : ''}"><b>${a.name}</b><small>${a.desc}</small>${rw ? `<small class="best">Unlocks: ${rw}</small>` : ''}<div class="bar"><i style="width:${100 * (ok ? 1 : v / a.need)}%"></i></div><small>${ok ? 'Unlocked' : `${v} / ${a.need}`}</small></div>`; }).join('');
}
$('achBtn').onclick = () => { renderAch(); $('achScreen').classList.remove('hidden'); };
$('achClose').onclick = () => $('achScreen').classList.add('hidden');
$('tutBtn').onclick = () => { tutAgain = true; startSession(); };
$('tutSkip').onclick = () => tut && tutDone(true);
$('gmodes').onclick = e => { const b = e.target.closest('.card'); if (!b) return; opts.gm = b.dataset.g; renderLobby(); };
$('dark').onchange = e => { opts.dark = e.target.checked; };
$('watchAgain').onclick = () => replay.best && playReplay();
$('saveClip').onclick = () => replay.download();
$('quality').onchange = e => { opts.quality = e.target.value; build(); };
$('mic').onchange = e => { opts.mic = e.target.checked; };
$('storm').onchange = e => { opts.storm = e.target.checked; };
$('silly').onchange = e => { opts.silly = e.target.checked; };
$('pet').onchange = e => { opts.pet = e.target.value; };
$('season').onchange = e => { opts.season = e.target.value; build(); };
$('music').onchange = e => { opts.music = e.target.checked; A.setMusic(opts.music, state === 'play'); };
$('backMode').onclick = () => { $('lobby').classList.add('hidden'); renderMode(); };
$('start').onclick = startSession;
$('again').onclick = () => { if (opts.gm === 'clean') { opts.gm = cleanPrev.gm; opts.weapon = cleanPrev.weapon; } startSession(); };
$('cleanBtn').onclick = () => cleanUp();
$('changeScene').onclick = () => { if (opts.gm === 'clean') { opts.gm = cleanPrev.gm; opts.weapon = cleanPrev.weapon; } toLobby(); };
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
if (isTouch) $('keysDesk').textContent = 'Left thumb moves (push all the way to run), right thumb looks. Smash swings, hold it to wind up a heavy hit. Grab picks things up; hold Throw to throw harder. Pound slams the ground.';
// installable app: offline play after the first visit
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
let installEvt = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('installBtn').classList.add('hidden'); };
addEventListener('appinstalled', () => $('installBtn').classList.add('hidden'));

// ---------- input
document.addEventListener('pointerlockchange', () => { if (state === 'play' && !isTouch) setPaused(!document.pointerLockElement); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });
document.addEventListener('mousemove', e => {
  if (state !== 'play' || paused || (document.pointerLockElement !== $('c') && !(e.buttons & 1))) return; // drag-to-look fallback when pointer lock is blocked
  const k = 0.0022 * save.set.sens; player.yaw -= e.movementX * k; player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch - e.movementY * k * (save.set.invert ? -1 : 1)));
});
$('c').addEventListener('contextmenu', e => e.preventDefault());
$('c').addEventListener('mousedown', e => {
  if (state !== 'play' || paused) return;
  if (e.button === 0) { mouseHeld = true; startSwing(); } // with something in hand, this swings it
  if (e.button === 2) { if (grav) { gravDrop(); return; } if (held) { charging = true; chargeT = 0; } else grab(hlTarget || findGrabTarget()); } // hold right-click to power-throw
});
addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false; if (e.button === 2) { if (charging && held) throwHeld(Math.min(1, chargeT / 0.8)); charging = false; } });
function grabOrThrow() { if (held) throwHeld(0.65); else grab(hlTarget || findGrabTarget()); }
addEventListener('keydown', e => {
  keys[e.code] = true; if (state !== 'play' || paused || e.repeat) return;
  if (e.code === 'Space') startSwing(W.hands ? 'kick' : 'swing');
  if (e.code === 'KeyF') W.hands ? startSwing('slap') : grabOrThrow();
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyG') groundPound();
  if (e.code === 'KeyR' && driving) radio(true);
  if (e.code === 'KeyE') { if (carKey()) return; if (!held && !hlTarget && (petPet() || feedKoi())) return; grabOrThrow(); }
  if (e.code === 'KeyQ') dropHeld();
  if (opts.gm === 'build' && state === 'play' && /^Digit[1-7]$/.test(e.code)) placePreset(+e.code.slice(5) - 1);
  if (e.code === 'KeyT' && tut) tutDone(true);
  if (e.code === 'Digit8') placeToy('ramp'); if (e.code === 'Digit9') placeToy('tramp');
});
addEventListener('keyup', e => keys[e.code] = false);

let joyId = null, joyO = null, lookId = null, lookLast = null;
const tl = $('touch');
tl.addEventListener('pointerdown', e => {
  const id = e.target.id; if (id && id.endsWith('Btn')) { vibrate(8); try { e.target.setPointerCapture(e.pointerId); } catch (_) {} } // the finger can slide off and the release still counts
  if (id === 'smashBtn') { mouseHeld = true; startSwing(); return; }
  if (id === 'grabBtn') { if (grav) gravDrop(); else if (held) dropHeld(); else if (!carKey() && !(!hlTarget && (petPet() || feedKoi()))) grab(hlTarget || findGrabTarget()); return; }
  if (id === 'throwBtn') { if (held) { charging = true; chargeT = 0; } return; } // hold to throw harder
  if (id === 'kickBtn') { startSwing('kick'); return; }
  if (id === 'poundBtn') { groundPound(); return; }
  if (id === 'viewBtn') { toggleView(); return; }
  if (e.clientX < innerWidth * 0.45 && joyId === null) { joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY }; const j = $('joy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.classList.remove('hidden'); }
  else if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
});
tl.addEventListener('pointermove', e => {
  if (e.pointerId === joyId) { const dx = Math.max(-55, Math.min(55, e.clientX - joyO.x)), dy = Math.max(-55, Math.min(55, e.clientY - joyO.y));
    joy.x = dx / 55; joy.y = dy / 55; $('knob').style.transform = `translate(${dx}px,${dy}px)`; }
  if (e.pointerId === lookId) { const k = 0.006 * save.set.sens; player.yaw -= (e.clientX - lookLast.x) * k; player.pitch = Math.max(-1.35, Math.min(1.2, player.pitch - (e.clientY - lookLast.y) * k * (save.set.invert ? -1 : 1))); lookLast = { x: e.clientX, y: e.clientY }; }
});
const tEnd = e => {
  if (e.target.id === 'smashBtn') mouseHeld = false;
  if (e.target.id === 'throwBtn' && charging && held) { throwHeld(Math.max(0.55, Math.min(1, chargeT / 0.8))); charging = false; }
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
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw), sp = (keys.ShiftLeft || Math.hypot(joy.x, joy.y) > 0.92 ? 5 : 3.6) * dt; // push the stick all the way to run
  player.x += (mx * c + mz * s) * sp; player.z += (-mx * s + mz * c) * sp;
  stayInside();
  const R = 0.3;
  if (floorY > -0.5) for (const [x1, x2, z1, z2] of room.obstacles) {
    if (player.x > x1 - R && player.x < x2 + R && player.z > z1 - R && player.z < z2 + R) {
      const push = [[x1 - R - player.x, 0], [x2 + R - player.x, 0], [0, z1 - R - player.z], [0, z2 + R - player.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
      player.x += push[0]; player.z += push[1];
    }
  }
  pushOutOfCars(); pushTrolleys(mx * c + mz * s, -mx * s + mz * c, len);
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
  if (W.tool) return poseTool();
  const t = swingT < 0 || atk === 'held' ? 0 : swingT, ease = k => 1 - Math.pow(1 - k, 3);
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
  const rdt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now; // never negative, so shake and fades cannot blow up
  const dt = now < freezeUntil ? 0 : rdt * (now < slowUntil ? 0.25 : 1) * (room.zen ? 0.6 : 1), t = now / 1000; // zen: everything falls and breaks slowly
  const playing = state === 'play' && !paused;

  if (playing) {
    if (!tut) timeLeft -= rdt; // the clock waits while you learn
    if (driving) updateDriving(rdt); else updatePlayer(rdt);
    updateCars(rdt, now); if (room.follow) { room.follow.x = player.x; room.follow.z = player.z; A.setRain(room.day ? room.day.rain : 0); }
    updateTut(); updateMission(now); updateLamps(now); updatePipes(dt, now); updateHeat(rdt, now); updateTools(rdt, now); updateSpills(rdt); updateRooms(rdt, now);
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
    if (fu) banner(fu === 'boss' ? 'Boss sculpture!' : 'New sculpture');
    if (!tut && now > goldenAt) { goldenAt = now + rand(14000, 22000); makeGolden(); }
    updateGolden(now, t);
    if (opts.gm === 'attack') { elapsed += rdt; if (remaining() === 0) endSession(); }
    if (charging) chargeT += rdt;
    setHighlight(held ? null : findGrabTarget());
    if (comboTimer > 0 && (comboTimer -= rdt) <= 0) combo = 0;
    if (rageUntil && now > rageUntil) { rageUntil = 0; document.body.classList.remove('rage'); }
    else if (!rageUntil) rageMeter = Math.max(0, rageMeter - rdt * 3);
    if (!['attack', 'build', 'clean'].includes(opts.gm) && !restocking && I.list.filter(i => !i.dead && !i.fixed).length <= 2) {
      restocking = true; banner('Restock!'); A.SFX.restock();
      setTimeout(() => { if (state === 'play') { if (room.restock) room.restock(); I.batch(room.pool, room.slots, batchSize()); if (Math.random() < 0.5) I.pyramid(room.slots); spawnPhotos(); applyWords(); } restocking = false; }, 700);
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
    for (const l of loose) { l.mesh.position.copy(l.body.interpolatedPosition); l.mesh.quaternion.copy(l.body.interpolatedQuaternion); }
    for (const u of room.updates) u(t, dt);
    fx = fx.filter(f => { f.life += rdt; const k = f.life / f.max; f.mesh.scale.setScalar(f.cam ? 1 + k * 0.4 : 0.2 + f.grow * Math.min(1, k * 1.6)); f.mesh.material.opacity = f.op * (1 - k);
      if (k >= 1) { f.mesh.removeFromParent(); f.mesh.material.dispose(); return false; } return true; });
    puffs = puffs.filter(o => { o.life += dt; const k = o.life / o.max; o.m.position.addScaledVector(o.v, dt); o.v.multiplyScalar(Math.pow(0.2, dt)); o.m.scale.setScalar(o.size * (0.5 + 1.6 * k)); o.m.material.opacity = o.op * (1 - k);
      if (k >= 1) { scene.remove(o.m); o.m.material.dispose(); return false; } return true; });
    if (boomLight && boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity * Math.pow(0.002, rdt) - 1);
  }
  if (state === 'play') {
    camera.position.set(player.x, 1.65 + floorY + Math.sin(player.bob * 2) * 0.02 + poundY() + jumpY(), player.z);
    camera.rotation.set(player.pitch + (save.set.shake ? kick : 0), player.yaw, 0); pivot.visible = !driving;
    if (driving) cockpitCamera();
    kick *= Math.pow(0.0005, rdt);
  } else {
    orbit += rdt * 0.1; pivot.visible = false;
    const [bx1, bx2, bz1, bz2] = room.bounds, rx = (bx2 - bx1) * 0.32, rz = (bz2 - bz1) * 0.32;
    camera.position.set(Math.sin(orbit) * rx, 2.1, -1 + Math.cos(orbit) * rz); camera.lookAt(0, 0.9, -1.2);
  }
  shake *= Math.pow(0.002, rdt);
  if (shake > 0.001 && save.set.shake) { camera.position.x += rand(-1, 1) * shake * 0.3; camera.position.y += rand(-1, 1) * shake * 0.3; camera.rotation.z += rand(-1, 1) * shake * 0.08; }

  if (state === 'play') {
    if (opts.gm === 'attack') $('time').textContent = fmtTime(elapsed);
    else if (!isFinite(timeLeft)) $('time').textContent = '∞';
    else { const tl2 = Math.max(0, Math.ceil(timeLeft)); $('time').textContent = Math.floor(tl2 / 60) + ':' + String(tl2 % 60).padStart(2, '0'); }
    $('time').classList.toggle('low', isFinite(timeLeft) && timeLeft <= 10);
    $('extra').textContent = opts.gm === 'attack' ? `${remaining()} left` : opts.gm === 'targets' ? `${targetsHit} targets` : opts.gm === 'clean' ? `Swept ${swept} · ${I.chunks.length} left` : '';
    $('score').textContent = score; $('smashed').textContent = smashed;
    $('combo').textContent = combo >= 3 ? 'Combo x' + combo : '';
    const rage = now < rageUntil;
    $('rageFill').style.width = (rage ? (rageUntil - now) / 80 : rageMeter) + '%';
    $('rageTxt').textContent = rage ? 'Rage mode x2' : 'Rage';
    const nc = !driving && !held && cars.length ? nearCar() : null;
    const hint = driving ? (isTouch ? `Grab: get out · ${Math.round(driving.speed * 3.6)} km/h` : `${driving.type.name} · E get out · V camera · Space handbrake · R radio · ${Math.round(driving.speed * 3.6)} km/h`) : nc ? (isTouch ? 'Grab: get in the car' : 'E: get in the car · V: switch camera') : held ? (isTouch ? 'Smash hits with it · Throw throws it' : `Click to hit with the ${nameOf(held.key)} · E throws · hold right-click for a power throw · Q drop`)
      : hlTarget ? (isTouch ? `Grab the ${nameOf(hlTarget.key)}` : `E or right-click: grab the ${nameOf(hlTarget.key)}`)
      : W.hands && !isTouch ? 'Click punch · F slap · Space kick' : '';
    $('kickBtn').classList.toggle('hidden', !W.hands);
    $('hint').textContent = hint;
    const wind = swingHold > 0.12 && !hitDone;
    $('charge').style.opacity = charging || wind ? 1 : 0; $('chargeFill').style.width = Math.min(100, (wind ? (swingHold - 0.12) / 0.55 : chargeT / 0.8) * 100) + '%';
    $('grabBtn').textContent = grav ? 'Drop' : held ? 'Drop' : driving ? 'Exit' : 'Grab'; $('throwBtn').classList.toggle('hidden', !held); $('viewBtn').classList.toggle('hidden', !room.open); $('poundBtn').classList.toggle('hidden', !!driving);
  }
  showAch(now);
  A.listener(camera.position, camera.getWorldDirection(v2)); A.setMuffle(state === 'play' && (now < slowUntil || now < deafUntil));
  const rc = viewCamera(rdt);
  if (state === 'play') drawMinimap(now);
  S.render(scene, rc, t);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } if (tpCam) { tpCam.aspect = innerWidth / innerHeight; tpCam.updateProjectionMatrix(); } S?.resize(innerWidth, innerHeight); });

renderMode();
opts.mode = 'stylized'; build(); opts.mode = null; // background behind the first screen
requestAnimationFrame(frame);
window.__smash = { A, get I() { return I; }, get figure() { return figure; }, get W() { return W; }, startSwing, get swingT() { return swingT; }, tick(n = 1, ms = 16) { for (let i = 0; i < n; i++) { last = performance.now() - ms; frame(performance.now()); } }, get state() { return state; }, get S() { return S; }, player, startSession, get camera() { return camera; }, grab, throwHeld, findGrabTarget, opts, get room() { return room; }, get mission() { return mission; }, save, get shots() { return shots; }, get bin() { return bin; }, get swept() { return swept; }, get mouseHeld() { return mouseHeld; }, set mouseHeld(v) { mouseHeld = v; }, get shake() { return shake; }, get kick() { return kick; }, get cars() { return cars; }, get traffic() { return traffic; }, get renderer() { return renderer; }, get driving() { return driving; }, carKey, toggleView, get view() { return view; }, get wrecks() { return wrecks; }, get grav() { return grav; }, get paused() { return paused; }, get boss() { return boss; }, spawnBoss, get elapsed() { return elapsed; }, equip, placeToy, get basement() { return basement; }, get floorY() { return floorY; }, get storm() { return storm; }, get fires() { return fires; }, jumpY, get pet() { return pet; }, get zen() { return zen; }, get smoke() { return smoke; }, get hot() { return hot; }, petPet, feedKoi, petScare, damageCar, get cityAlarms() { return cityAlarms; } };
