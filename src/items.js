// Breakable things: definitions, spawning, shattering.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { canvasTex } from './style.js?v=13';
import { itemModel, fitInto } from './models.js?v=13';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const V = (x, y, z) => new CANNON.Vec3(x, y, z);
const cylS = (rt, rb, h, n = 10) => new CANNON.Cylinder(rt, rb, h, n);
const boxS = (x, y, z) => new CANNON.Box(V(x, y, z));
const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const cyl = (rt, rb, h, s = 18) => new THREE.CylinderGeometry(rt, rb, h, s);
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function m(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }
function grp(...parts) { const g = new THREE.Group(); parts.forEach(p => g.add(p)); return g; }
// a vessel with real wall thickness: the outer profile from the foot centre up to the rim, then back down the inside
function vessel(outer, t, base = t, seg = 36) {
  const y0 = outer[0][1], rim = outer[outer.length - 1], pts = outer.map(q => [q[0], q[1]]);
  pts.push([Math.max(0.001, rim[0] - t * 0.5), rim[1] + t * 0.4]);
  for (let i = outer.length - 1; i >= 1; i--) { const [r, y] = outer[i]; if (y > y0 + base + 0.002) pts.push([Math.max(0.001, r - t), y]); }
  pts.push([Math.max(0.001, outer[1][0] - t * 1.5), y0 + base], [0, y0 + base]);
  return lathe(pts, seg);
}
function rrect(w, h, r) { // rounded rectangle centred on the origin
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// a slab with softened edges: w x h facing +z, d deep (or lying flat when flat = true: w x d footprint, h thick)
function slab(w, h, d, r, bevel = 0.003, flat = false) {
  const g = new THREE.ExtrudeGeometry(rrect(w, flat ? d : h, r), { depth: Math.max(0.0005, (flat ? h : d) - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -((flat ? h : d) - bevel * 2) / 2); if (flat) g.rotateX(-Math.PI / 2); return g;
}
const PLATE = [[0, -0.0175], [0.058, -0.0175], [0.064, -0.012], [0.11, -0.007], [0.15, 0.005], [0.17, 0.0165], [0.168, 0.0185], [0.147, 0.0095], [0.108, 0.0005], [0.06, -0.004], [0, -0.004]];

// ---- generated pictures
const TX = {};
const lazy = (k, fn) => () => TX[k] || (TX[k] = fn());
const screenTex = lazy('screen', () => canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#2e6bff'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 70px sans-serif'; g.fillText(':(', 24, 80); g.font = '16px sans-serif'; g.fillText('Your PC ran into a problem.', 24, 124); }));
const staticTex = lazy('static', () => canvasTex(128, 80, (g, w, h) => { for (let i = 0; i < w * h / 4; i++) { const v = Math.random() * 255 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect((i % (w / 2)) * 2, ((i / (w / 2)) | 0) * 2, 2, 2); } }));
const keysTex = lazy('keys', () => canvasTex(256, 88, (g, w, h) => { g.fillStyle = '#2b2b3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9d6e6'; for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) g.fillRect(6 + c * 17.6, 6 + r * 20, 14, 16); }));
const spreadsheetTex = lazy('sheet', () => canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d7a46'; g.fillRect(0, 0, w, 18); g.strokeStyle = '#ccd'; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, h); g.stroke(); } for (let y = 18; y < h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = '#333'; g.font = '9px sans-serif'; for (let y = 28; y < h; y += 12) for (let x = 4; x < w; x += 32) if (Math.random() < .6) g.fillText((Math.random() * 999 | 0) + '', x, y); }));
const clockTex = lazy('clock', () => canvasTex(256, 256, (g, w) => { g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.fillStyle = '#222'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; g.fillText(i, 128 + Math.sin(a) * 95, 128 - Math.cos(a) * 95); }
  g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 - 30); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 20, 128 - 85); g.stroke(); }));
const paintingTex = lazy('painting', () => canvasTex(200, 160, (g, w, h) => { const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#7fb2e6'); s.addColorStop(0.6, '#f1d29a'); g.fillStyle = s; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3f6b3a'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.65); g.quadraticCurveTo(w * 0.4, h * 0.4, w, h * 0.7); g.lineTo(w, h); g.fill(); g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(w * 0.75, h * 0.25, 14, 0, 7); g.fill(); }));
const targetTex = lazy('target', () => canvasTex(256, 256, (g) => { for (let i = 5; i > 0; i--) { g.fillStyle = i % 2 ? '#e8202c' : '#f4efe2'; g.beginPath(); g.arc(128, 128, i * 25, 0, 7); g.fill(); } }));
const hazardTex = lazy('hazard', () => canvasTex(128, 128, (g) => { g.fillStyle = '#c0392b'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffc531'; g.beginPath(); g.moveTo(64, 22); g.lineTo(108, 100); g.lineTo(20, 100); g.fill();
  g.fillStyle = '#140d1f'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText('!', 64, 94); }));
const portraitTex = lazy('portrait', () => canvasTex(160, 220, (g, w, h) => { g.fillStyle = '#1b1712'; g.fillRect(0, 0, w, h); const r = g.createRadialGradient(w / 2, h * 0.38, 5, w / 2, h * 0.4, 70); r.addColorStop(0, '#c9b49a'); r.addColorStop(1, '#3a2e22');
  g.fillStyle = r; g.beginPath(); g.ellipse(w / 2, h * 0.38, 38, 48, 0, 0, 7); g.fill(); g.fillStyle = '#2a2018'; g.fillRect(w / 2 - 55, h * 0.62, 110, h); g.fillStyle = '#0a0806'; for (const x of [-14, 14]) { g.beginPath(); g.ellipse(w / 2 + x, h * 0.36, 6, 4, 0, 0, 7); g.fill(); }
  g.fillStyle = '#a0141c'; g.beginPath(); g.arc(w / 2 + 14, h * 0.36, 1.8, 0, 7); g.arc(w / 2 - 14, h * 0.36, 1.8, 0, 7); g.fill(); }));

// ---- definitions. kind decides material, shards and sound. hp Infinity = never breaks (metal dents and bounces).
const GLASS = [0x2f8f5a, 0x6b8f2a, 0x3a6fa6, 0x8a4a1c], CLEAR = [0xeaf8ff, 0xf0ecff, 0xffffff], CHINA = [0xf4f1e8, 0xfff2d6, 0xdfeeff], BRIGHT = [0xff6b6b, 0xc56cf0, 0x54a0ff, 0xffc531, 0x2fd1c0];
const SMALL = ['table', 'shelf'], ANY = ['table', 'shelf', 'floor'], BIG = ['table', 'floor'];
export const DEFS = {
  bottle: { kind: 'glass', hp: 1, pts: 10, mass: 0.4, bv: 3.4, size: 0.15, spots: ANY, colors: GLASS,
    make: (M, c) => { const h = 0.34, r = 0.07; return { mesh: m(lathe([[0, -h / 2], [r, -h / 2], [r, 0.03], [r * 0.4, 0.11], [r * 0.38, h / 2], [0, h / 2]], 14), M('glass', c)), shape: cylS(r, r, h, 8), halfH: h / 2 }; } },
  cup: { kind: 'glass', hp: 1, pts: 8, mass: 0.25, bv: 3.2, size: 0.13, spots: SMALL, colors: CLEAR,
    make: (M, c) => ({ mesh: m(vessel([[0, -0.07], [0.046, -0.07], [0.048, -0.066], [0.06, 0.07]], 0.004, 0.016), M('glass', c)), shape: cylS(0.06, 0.048, 0.14, 8), halfH: 0.07 }) },
  wineglass: { kind: 'glass', hp: 1, pts: 12, mass: 0.2, bv: 3, size: 0.11, spots: SMALL, colors: CLEAR,
    make: (M, c) => ({ mesh: m(lathe([[0, -0.1], [0.045, -0.1], [0.045, -0.096], [0.012, -0.09], [0.005, -0.08], [0.005, -0.025], [0.012, -0.015], [0.035, 0.005], [0.048, 0.04], [0.05, 0.07], [0.046, 0.1],
      [0.044, 0.1015], [0.047, 0.07], [0.045, 0.04], [0.032, 0.009], [0.008, -0.009], [0, -0.011]], 36), M('glass', c)), shape: cylS(0.05, 0.045, 0.2, 8), halfH: 0.1 }) },
  beermug: { kind: 'glass', hp: 1, pts: 12, mass: 0.6, bv: 3.6, size: 0.15, spots: SMALL, colors: [0xfff1c4, 0xffffff],
    make: (M, c) => ({ mesh: grp(m(vessel([[0, -0.075], [0.05, -0.075], [0.053, -0.07], [0.056, 0.075]], 0.006, 0.022), M('glass', c)),
      m(cyl(0.049, 0.046, 0.104, 28), M('liquid', 0xe8a530), 0, -0.002), m(cyl(0.05, 0.05, 0.02, 28), M('plastic', 0xfaf4e0), 0, 0.058),
      m(new THREE.TorusGeometry(0.04, 0.011, 10, 20, Math.PI), M('glass', c), 0.056, 0, 0, 0, 0, -Math.PI / 2)), shape: cylS(0.065, 0.065, 0.15, 8), halfH: 0.075 }) },
  jar: { kind: 'glass', hp: 1, pts: 10, mass: 0.5, bv: 3.4, size: 0.15, spots: SMALL, colors: CLEAR,
    make: (M, c) => ({ mesh: grp(m(vessel([[0, -0.09], [0.064, -0.09], [0.07, -0.082], [0.07, 0.05], [0.06, 0.066], [0.06, 0.082]], 0.004, 0.01), M('glass', c)),
      m(cyl(0.064, 0.066, 0.1, 28), M('plastic', pick([0x8b1e2a, 0xc98a1a, 0x4a7a2a])), 0, -0.032),
      m(lathe([[0, 0.096], [0.061, 0.096], [0.064, 0.091], [0.064, 0.076], [0.06, 0.076], [0.06, 0.08], [0, 0.08]], 32), M('metal', 0xc9a227))), shape: cylS(0.072, 0.072, 0.18, 8), halfH: 0.09 }) },
  fishbowl: { kind: 'glass', hp: 1, pts: 20, mass: 1, bv: 3.2, size: 0.34, spots: SMALL, colors: [0xdff8ff],
    make: (M, c) => { const fish = grp(m(new THREE.SphereGeometry(0.02, 14, 10), M('plastic', 0xff7a1a)), m(new THREE.ConeGeometry(0.016, 0.022, 10), M('plastic', 0xff9a3a), -0.03, 0, 0, 0, 0, Math.PI / 2)); fish.children[0].scale.set(1.6, 1, 0.65); fish.position.set(0.03, -0.05, 0.02); fish.rotation.y = 0.6;
      return { mesh: grp(m(vessel([[0, -0.15], [0.08, -0.15], [0.14, -0.11], [0.17, -0.03], [0.16, 0.06], [0.11, 0.12], [0.095, 0.14], [0.105, 0.15]], 0.005, 0.01), M('glass', c)),
        m(lathe([[0, -0.138], [0.078, -0.138], [0.133, -0.104], [0.158, -0.03], [0.15, 0.05], [0, 0.05]], 32), M('liquid', 0x7fd0ff)), m(cyl(0.075, 0.08, 0.016, 24), M('stone', 0xc8a878), 0, -0.132), fish), shape: cylS(0.15, 0.1, 0.3, 10), halfH: 0.15 }; } },
  plate: { kind: 'ceramic', hp: 1, pts: 8, mass: 0.5, bv: 3.6, size: 0.34, spots: SMALL, colors: CHINA,
    make: (M, c) => ({ mesh: grp(m(lathe(PLATE, 48), M('ceramic', c)), m(new THREE.TorusGeometry(0.162, 0.0016, 4, 64), M('metal', 0xc9a227), 0, 0.0145, 0, Math.PI / 2)), shape: cylS(0.17, 0.12, 0.035, 12), halfH: 0.0175 }) },
  platestack: { kind: 'ceramic', hp: 1, pts: 40, mass: 3, bv: 3.6, size: 0.34, spots: SMALL, colors: CHINA, shards: 2.5,
    make: (M, c) => { const g = new THREE.Group(), geo = lathe(PLATE, 48); for (let i = 0; i < 6; i++) g.add(m(geo, M('ceramic', c), 0, -0.0475 + i * 0.019, 0, 0, i * 0.7)); return { mesh: g, shape: cylS(0.17, 0.17, 0.13, 12), halfH: 0.065 }; } },
  bowl: { kind: 'ceramic', hp: 1, pts: 8, mass: 0.4, bv: 3.6, size: 0.26, spots: SMALL, colors: [...CHINA, 0x9ec7e8],
    make: (M, c) => ({ mesh: m(vessel([[0, -0.05], [0.045, -0.05], [0.047, -0.043], [0.05, -0.042], [0.09, -0.024], [0.12, 0.01], [0.13, 0.05]], 0.005, 0.009), M('ceramic', c)), shape: cylS(0.13, 0.06, 0.1, 10), halfH: 0.05 }) },
  mug: { kind: 'ceramic', hp: 1, pts: 10, mass: 0.35, bv: 3.8, size: 0.16, spots: SMALL, colors: [0xff9f43, 0xff7eb6, 0xf4f1e8, 0x2fd1c0, 0x2b2b3a],
    make: (M, c) => ({ mesh: grp(m(cyl(0.06, 0.055, 0.12), M('ceramic', c)), m(new THREE.TorusGeometry(0.035, 0.012, 8, 12), M('ceramic', c), 0.065)), shape: cylS(0.065, 0.065, 0.12, 8), halfH: 0.06 }) },
  teapot: { kind: 'ceramic', hp: 1, pts: 25, mass: 0.9, bv: 3.6, size: 0.3, spots: SMALL, colors: [0xf4f1e8, 0x9ec7e8, 0xe8b4b8],
    make: (M, c) => { const mt = M('ceramic', c), body = m(new THREE.SphereGeometry(0.11, 24, 16), mt); body.scale.y = 0.8;
      return { mesh: grp(body, m(cyl(0.012, 0.025, 0.12, 10), mt, 0.12, 0.02, 0, 0, 0, -1), m(new THREE.TorusGeometry(0.05, 0.012, 8, 14), mt, -0.11, 0.02), m(cyl(0.05, 0.05, 0.02), mt, 0, 0.09), m(new THREE.SphereGeometry(0.016, 10, 8), mt, 0, 0.11)), shape: cylS(0.11, 0.11, 0.18, 10), halfH: 0.09 }; } },
  jug: { kind: 'ceramic', hp: 1, pts: 15, mass: 0.7, bv: 3.6, size: 0.2, spots: SMALL, colors: [0xf4f1e8, 0x3a6fa6, 0xc96f3b],
    make: (M, c) => { const mt = M('ceramic', c); return { mesh: grp(m(lathe([[0, -0.12], [0.08, -0.12], [0.09, 0], [0.06, 0.1], [0.075, 0.13]]), mt), m(new THREE.TorusGeometry(0.05, 0.012, 8, 14, Math.PI), mt, 0.07, 0.02, 0, 0, 0, -Math.PI / 2)), shape: cylS(0.08, 0.08, 0.25, 8), halfH: 0.125 }; } },
  vase: { kind: 'ceramic', hp: 1, pts: 15, mass: 0.8, bv: 3.4, size: 0.24, spots: ANY, colors: BRIGHT,
    make: (M, c) => ({ mesh: m(lathe([[0, -0.2], [0.08, -0.2], [0.12, -0.04], [0.07, 0.12], [0.05, 0.16], [0.075, 0.2], [0.06, 0.2]]), M('ceramic', c)), shape: cylS(0.1, 0.08, 0.4, 8), halfH: 0.2 }) },
  pot: { kind: 'ceramic', hp: 1, pts: 12, mass: 0.9, bv: 3.6, size: 0.26, spots: ANY, colors: [0xc96f3b, 0xb85c2c],
    make: (M, c) => ({ mesh: m(cyl(0.13, 0.09, 0.2), M('ceramic', c)), shape: cylS(0.13, 0.09, 0.2, 8), halfH: 0.1 }) },
  flowerpot: { kind: 'ceramic', hp: 1, pts: 12, mass: 1, bv: 3.6, size: 0.22, spots: ANY, colors: [0xc96f3b],
    make: (M, c) => ({ mesh: grp(m(cyl(0.1, 0.07, 0.16), M('ceramic', c)), m(new THREE.IcosahedronGeometry(0.11, 1), M('plastic', 0x3f8f3a), 0, 0.13)), shape: cylS(0.1, 0.07, 0.16, 8), halfH: 0.08 }) },
  doll: { kind: 'ceramic', hp: 1, pts: 25, mass: 0.6, bv: 3.4, size: 0.16, spots: SMALL, colors: [0x6b2a3a, 0x2a3a6b, 0xe8e0d0],
    make: (M, c) => { const skin = M('ceramic', 0xf3e6dc), lace = M('fabric', 0xf4efe6), dark = M('emissive', 0x1a1010), arm = new THREE.CapsuleGeometry(0.011, 0.05, 4, 8);
      return { mesh: grp(m(lathe([[0, -0.15], [0.075, -0.15], [0.07, -0.12], [0.05, -0.04], [0.03, 0.02], [0.022, 0.04], [0, 0.045]], 28), M('fabric', c)),
        m(new THREE.TorusGeometry(0.073, 0.006, 6, 28), lace, 0, -0.146, 0, Math.PI / 2), m(new THREE.TorusGeometry(0.025, 0.006, 6, 20), lace, 0, 0.036, 0, Math.PI / 2),
        m(new THREE.SphereGeometry(0.045, 24, 18), skin, 0, 0.085), m(new THREE.SphereGeometry(0.048, 24, 16, 0, Math.PI * 2, 0, 1.75), M('fabric', 0x3a2414), 0, 0.09, -0.004, -0.25),
        m(new THREE.SphereGeometry(0.006, 8, 6), dark, -0.016, 0.088, 0.041), m(new THREE.SphereGeometry(0.006, 8, 6), dark, 0.016, 0.088, 0.041), m(new THREE.SphereGeometry(0.004, 8, 6), M('emissive', 0xa0141c), 0, 0.068, 0.043),
        m(arm, skin, -0.034, 0.0, 0.004, 0, 0, -0.35), m(arm, skin, 0.034, 0.0, 0.004, 0, 0, 0.35), m(new THREE.TorusGeometry(0.012, 0.005, 6, 12), M('fabric', 0xd06080), 0.03, 0.125, -0.01)), shape: cylS(0.07, 0.07, 0.29, 8), halfH: 0.15 }; } },
  candlestick: { kind: 'metal', hp: Infinity, pts: 3, mass: 0.6, bv: 99, size: 0.14, spots: SMALL, colors: [0xc9a227, 0xb8bcc4],
    make: (M, c) => ({ mesh: grp(m(lathe([[0, -0.15], [0.065, -0.15], [0.065, -0.142], [0.05, -0.136], [0.02, -0.125], [0.014, -0.11], [0.022, -0.095], [0.013, -0.08], [0.011, 0.02], [0.02, 0.03], [0.012, 0.04], [0.012, 0.06], [0.03, 0.07], [0.032, 0.08], [0.014, 0.082], [0, 0.082]], 32), M('metal', c)),
      m(cyl(0.012, 0.0125, 0.1, 16), M('plastic', 0xf3ead8), 0, 0.132), m(new THREE.CapsuleGeometry(0.003, 0.025, 3, 6), M('plastic', 0xf3ead8), 0.012, 0.155),
      m(cyl(0.0015, 0.0015, 0.012, 6), M('emissive', 0x1a1010), 0, 0.188), m(new THREE.SphereGeometry(0.007, 10, 8), M('emissive', 0xffb347), 0, 0.2)), shape: cylS(0.06, 0.06, 0.3, 8), halfH: 0.15 }) },
  pan: { kind: 'metal', hp: Infinity, pts: 3, mass: 1.2, bv: 99, size: 0.3, spots: SMALL, colors: [0x2b2b30, 0x9aa0aa],
    make: (M, c) => ({ mesh: grp(m(cyl(0.14, 0.12, 0.04, 24), M('metal', c)), m(bx(0.22, 0.02, 0.03), M('plastic', 0x1a1a1a), 0.25, 0.01)), shape: cylS(0.14, 0.12, 0.04, 10), halfH: 0.02 }) },
  saucepan: { kind: 'metal', hp: Infinity, pts: 3, mass: 1, bv: 99, size: 0.22, spots: SMALL, colors: [0xb8bcc4, 0xb5653a],
    make: (M, c) => ({ mesh: grp(m(cyl(0.1, 0.1, 0.12, 24), M('metal', c)), m(bx(0.18, 0.02, 0.025), M('plastic', 0x1a1a1a), 0.19, 0.04)), shape: cylS(0.1, 0.1, 0.12, 10), halfH: 0.06 }) },
  kettle: { kind: 'metal', hp: Infinity, pts: 3, mass: 1, bv: 99, size: 0.22, spots: SMALL, colors: [0xb8bcc4, 0xd04030],
    make: (M, c) => ({ mesh: grp(m(lathe([[0, -0.1], [0.1, -0.1], [0.11, -0.02], [0.08, 0.08], [0.03, 0.1], [0, 0.1]]), M('metal', c)), m(new THREE.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), M('plastic', 0x1a1a1a), 0, 0.1), m(cyl(0.01, 0.02, 0.1, 8), M('metal', c), 0.11, 0.01, 0, 0, 0, -0.9)), shape: cylS(0.1, 0.1, 0.2, 10), halfH: 0.1 }) },
  fork: { kind: 'metal', hp: Infinity, pts: 2, mass: 0.05, bv: 99, size: 0.16, spots: SMALL, colors: [0xc8ccd4],
    make: (M, c) => { const sh = new THREE.Shape(); sh.moveTo(-0.085, -0.006); sh.lineTo(0.02, -0.004); sh.lineTo(0.035, -0.012); sh.lineTo(0.085, -0.012); sh.lineTo(0.085, 0.012); sh.lineTo(0.035, 0.012); sh.lineTo(0.02, 0.004); sh.lineTo(-0.085, 0.006); sh.lineTo(-0.085, -0.006);
      for (const y of [-0.0055, 0, 0.0055]) { const h = new THREE.Path(); h.moveTo(0.05, y - 0.0012); h.lineTo(0.086, y - 0.0012); h.lineTo(0.086, y + 0.0012); h.lineTo(0.05, y + 0.0012); h.lineTo(0.05, y - 0.0012); sh.holes.push(h); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false }); g.translate(0, 0, -0.0015); g.rotateX(-Math.PI / 2);
      return { mesh: m(g, M('metal', c)), shape: boxS(0.085, 0.004, 0.011), halfH: 0.004 }; } },
  keyboard: { kind: 'electronics', hp: 2, pts: 20, mass: 0.8, bv: 8, size: 0.46, spots: SMALL, colors: [0x2b2b3a, 0xc8c8d0],
    make: (M, c) => { const keys = [], dark = c === 0x2b2b3a, key = (w, x, z) => keys.push(new THREE.BoxGeometry(w - 0.003, 0.008, 0.0155).translate(x, 0.0085, z));
      for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) key(0.0175, -0.205 + 0.019 * k + (r % 2) * 0.006, -0.055 + r * 0.021);
      key(0.03, -0.19, 0.029); key(0.03, -0.155, 0.029); key(0.13, -0.05, 0.029); key(0.03, 0.055, 0.029); key(0.03, 0.09, 0.029); for (let k = 0; k < 3; k++) key(0.0175, 0.14 + k * 0.019, 0.029);
      return { mesh: grp(m(slab(0.44, 0.022, 0.15, 0.01, 0.003, true), M('electronics', c), 0, -0.004), m(mergeGeometries(keys), M('plastic', dark ? 0x1c1c24 : 0xf0f0f4))), shape: boxS(0.22, 0.015, 0.075), halfH: 0.015 }; } },
  monitor: { kind: 'electronics', hp: 3, pts: 40, mass: 4, bv: 7.5, size: 0.72, spots: BIG, colors: [0x2b2b3a, 0xd9d6e6],
    make: (M, c) => { const mt = M('electronics', c), tx = Math.random() < 0.5 ? screenTex() : spreadsheetTex(), base = m(cyl(0.11, 0.12, 0.014, 36), mt, 0, -0.276, -0.02); base.scale.z = 0.7;
      return { mesh: grp(m(slab(0.72, 0.44, 0.024, 0.012, 0.004), M('electronics', 0x15151a), 0, 0.06), m(slab(0.42, 0.26, 0.05, 0.03, 0.01), mt, 0, 0.06, -0.035),
        m(new THREE.PlaneGeometry(0.68, 0.4), M('screen', 0xffffff, { map: tx }), 0, 0.065, 0.0165), m(slab(0.05, 0.16, 0.025, 0.008, 0.003), mt, 0, -0.18, -0.06, -0.12), base), shape: boxS(0.36, 0.29, 0.09), halfH: 0.29 }; } },
  tv: { kind: 'electronics', hp: 4, pts: 60, mass: 7, bv: 7, size: 0.96, spots: ['floor', 'table'], colors: [0x1d1b26],
    make: (M, c) => { const mt = M('electronics', c), g = grp(m(bx(0.96, 0.58, 0.08), mt, 0, 0.03), m(new THREE.PlaneGeometry(0.9, 0.52), M('screen', 0xffffff, { map: staticTex() }), 0, 0.03, 0.041));
      for (const x of [-0.35, 0.35]) g.add(m(bx(0.06, 0.05, 0.2), mt, x, -0.285)); return { mesh: g, shape: boxS(0.48, 0.31, 0.1), halfH: 0.31 }; } },
  crt: { kind: 'electronics', hp: 4, pts: 55, mass: 12, bv: 7, size: 0.6, spots: BIG, colors: [0xcfc6a8, 0x3a3a3a],
    make: (M, c) => ({ mesh: grp(m(bx(0.6, 0.5, 0.5), M('electronics', c)), m(new THREE.PlaneGeometry(0.48, 0.38), M('screen', 0xffffff, { map: staticTex() }), 0, 0.02, 0.252)), shape: boxS(0.3, 0.25, 0.25), halfH: 0.25 }) },
  printer: { kind: 'electronics', hp: 3, pts: 35, mass: 5, bv: 8.5, size: 0.52, spots: BIG, colors: [0xd4d4dc, 0xc4cad6],
    make: (M, c) => { const dark = M('electronics', 0x2b2b3a), paper = M('plastic', 0xfafafa);
      return { mesh: grp(m(slab(0.5, 0.2, 0.38, 0.03, 0.008, true), M('electronics', c), 0, -0.02), m(slab(0.46, 0.02, 0.3, 0.02, 0.004, true), M('electronics', 0xd0d0d8), 0, 0.088, -0.02),
        m(bx(0.36, 0.008, 0.17), M('electronics', 0x9a9aa6), 0, 0.15, -0.2, -0.9), m(bx(0.21, 0.003, 0.16), paper, 0, 0.155, -0.195, -0.9),
        m(bx(0.38, 0.026, 0.02), dark, 0, 0.025, 0.19), m(bx(0.34, 0.006, 0.12), M('electronics', 0xb0b0ba), 0, -0.03, 0.25), m(bx(0.21, 0.003, 0.1), paper, 0, -0.025, 0.24),
        m(slab(0.12, 0.006, 0.05, 0.01, 0.002, true), dark, 0.15, 0.1, 0.13), m(cyl(0.006, 0.006, 0.006, 12), M('plastic', 0x707080), 0.12, 0.105, 0.13), m(cyl(0.006, 0.006, 0.006, 12), M('plastic', 0x707080), 0.14, 0.105, 0.13), m(bx(0.012, 0.004, 0.006), M('emissive', 0x2fd18a), 0.18, 0.105, 0.13)),
        shape: boxS(0.25, 0.12, 0.19), halfH: 0.12 }; } },
  laptop: { kind: 'electronics', hp: 2, pts: 30, mass: 1.5, bv: 7, size: 0.36, spots: SMALL, colors: [0xb8bcc4, 0x2b2b3a],
    make: (M, c) => { const mt = M('electronics', c), lid = grp(m(bx(0.34, 0.22, 0.012), mt), m(new THREE.PlaneGeometry(0.31, 0.19), M('screen', 0xffffff, { map: spreadsheetTex() }), 0, 0, 0.007)); lid.position.set(0, 0.01, -0.11); lid.rotation.x = -0.25;
      return { mesh: grp(m(bx(0.34, 0.02, 0.24), mt, 0, -0.1), m(new THREE.PlaneGeometry(0.3, 0.12), M('screen', 0xffffff, { map: keysTex() }), 0, -0.089, 0.03, -Math.PI / 2), lid), shape: boxS(0.17, 0.11, 0.12), halfH: 0.11 }; } },
  phone: { kind: 'electronics', hp: 1, pts: 12, mass: 0.2, bv: 6, size: 0.15, spots: SMALL, colors: [0x1a1a22, 0xd9d6e6],
    make: (M, c) => ({ mesh: grp(m(slab(0.075, 0.009, 0.15, 0.01, 0.0015, true), M('electronics', c)), m(new THREE.PlaneGeometry(0.068, 0.142), M('screen', 0xffffff, { map: screenTex() }), 0, 0.0047, 0, -Math.PI / 2),
      m(slab(0.022, 0.003, 0.022, 0.005, 0.001, true), M('electronics', 0x101014), -0.018, -0.0055, -0.055), m(cyl(0.005, 0.005, 0.002, 14), M('glass', 0x222244), -0.018, -0.0072, -0.055)), shape: boxS(0.0375, 0.005, 0.075), halfH: 0.005 }) },
  speaker: { kind: 'electronics', hp: 2, pts: 25, mass: 3, bv: 7, size: 0.22, spots: ANY, colors: [0x1a1a22],
    make: (M, c) => ({ mesh: grp(m(bx(0.2, 0.32, 0.2), M('electronics', c)), m(cyl(0.07, 0.07, 0.02, 20), M('electronics', 0x3a3a44), 0, -0.05, 0.1, Math.PI / 2), m(cyl(0.03, 0.03, 0.02, 16), M('electronics', 0x3a3a44), 0, 0.09, 0.1, Math.PI / 2)), shape: boxS(0.1, 0.16, 0.1), halfH: 0.16 }) },
  microwave: { kind: 'electronics', hp: 3, pts: 40, mass: 8, bv: 8, size: 0.5, spots: BIG, colors: [0xe6e6ee, 0x2b2b30],
    make: (M, c) => ({ mesh: grp(m(bx(0.5, 0.3, 0.36), M('electronics', c)), m(new THREE.PlaneGeometry(0.32, 0.2), M('glass', 0x111111), -0.06, 0, 0.181), m(bx(0.08, 0.2, 0.01), M('electronics', 0x555560), 0.18, 0, 0.181)), shape: boxS(0.25, 0.15, 0.18), halfH: 0.15 }) },
  lamp: { kind: 'electronics', hp: 1, pts: 15, mass: 1.2, bv: 5, size: 0.2, spots: ANY, colors: [0xf2e2c4, 0x9ec7e8],
    make: (M, c) => ({ mesh: grp(m(cyl(0.07, 0.08, 0.02), M('metal', 0x2b2b30), 0, -0.18), m(cyl(0.01, 0.01, 0.3, 8), M('metal', 0x2b2b30), 0, -0.03), m(new THREE.ConeGeometry(0.1, 0.14, 18, 1, true), M('fabric', c), 0, 0.15), m(new THREE.SphereGeometry(0.03, 10, 8), M('emissive', 0xfff2c4), 0, 0.12)), shape: cylS(0.08, 0.08, 0.38, 8), halfH: 0.19 }) },
  clock: { kind: 'glass', hp: 1, pts: 15, mass: 0.8, bv: 4, size: 0.3, spots: SMALL, colors: [0x2b2b30, 0x8a5a3c],
    make: (M, c) => ({ mesh: grp(m(cyl(0.15, 0.15, 0.04, 28), M('plastic', c), 0, 0, 0, Math.PI / 2), m(new THREE.CircleGeometry(0.13, 28), M('screen', 0xffffff, { map: clockTex() }), 0, 0, 0.021)), shape: boxS(0.15, 0.15, 0.02), halfH: 0.15 }) },
  chair: { kind: 'wood', hp: 2, pts: 30, mass: 4, bv: 10, size: 0.5, spots: ['floor'], colors: [0xc58b52, 0x8a5a3c],
    make: (M, c) => { const mt = M('wood', c), g = grp(m(bx(0.44, 0.05, 0.44), mt), m(bx(0.44, 0.4, 0.05), mt, 0, 0.22, -0.2));
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.add(m(bx(0.05, 0.43, 0.05), mt, x, -0.235, z));
      return { mesh: g, shape: boxS(0.22, 0.45, 0.22), halfH: 0.45 }; } },
  stool: { kind: 'wood', hp: 2, pts: 20, mass: 2.5, bv: 10, size: 0.36, spots: ['floor'], colors: [0xc58b52, 0x6b4430],
    make: (M, c) => { const mt = M('wood', c), g = grp(m(cyl(0.18, 0.18, 0.04, 20), mt, 0, 0.3));
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(m(cyl(0.02, 0.025, 0.62, 8), mt, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15)); }
      return { mesh: g, shape: cylS(0.18, 0.15, 0.64, 8), halfH: 0.32 }; } },
  crate: { kind: 'wood', hp: 2, pts: 20, mass: 4, bv: 10, size: 0.45, spots: ['floor'], colors: [0xc69a5e],
    make: (M, c) => ({ mesh: m(bx(0.44, 0.44, 0.44), M('wood', c)), shape: boxS(0.22, 0.22, 0.22), halfH: 0.22 }) },
  frame: { kind: 'wood', hp: 1, pts: 15, mass: 0.6, bv: 4, size: 0.3, spots: SMALL, colors: [0x6b4430, 0xc9a227, 0x1a1a1a],
    make: (M, c, o) => ({ mesh: grp(m(bx(0.3, 0.24, 0.025), M('wood', c)), m(new THREE.PlaneGeometry(0.25, 0.19), M('photo', 0xffffff, { map: o.photo || paintingTex() }), 0, 0, 0.0135)), shape: boxS(0.15, 0.12, 0.0125), halfH: 0.12, tilt: true }) },
  cinder: { kind: 'stone', hp: 2, pts: 15, mass: 10, bv: 12, size: 0.4, spots: ['floor', 'table'], colors: [0x9a9590],
    make: (M, c) => { const sh = rrect(0.39, 0.19, 0.006); for (const x of [-0.095, 0.095]) sh.holes.push(rrect(0.13, 0.115, 0.012).getPoints(4).reduce((pth, q, i) => (i ? pth.lineTo(q.x + x, q.y) : pth.moveTo(q.x + x, q.y), pth), new THREE.Path()));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.182, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 3 }); g.translate(0, 0, -0.091); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4 + 0.3, uv.getY(i) * 4 + 0.6); // spread the concrete texture across the block
      return { mesh: m(g, M('stone', c)), shape: boxS(0.195, 0.095, 0.095), halfH: 0.095 }; } },
  watercooler: { kind: 'plastic', hp: 2, pts: 35, mass: 6, bv: 9, size: 0.34, spots: ['floor'], colors: [0xf0f0f4],
    make: (M, c) => { const BOTTLE = [[0, 0.27], [0.03, 0.27], [0.03, 0.31], [0.12, 0.36], [0.14, 0.4], [0.14, 0.47], [0.133, 0.48], [0.14, 0.49], [0.14, 0.58], [0.12, 0.63], [0, 0.645]];
      return { mesh: grp(m(slab(0.3, 0.9, 0.3, 0.03, 0.01), M('plastic', c), 0, -0.2), m(bx(0.2, 0.17, 0.02), M('plastic', 0x2a2a30), 0, 0.06, 0.145), m(bx(0.17, 0.012, 0.07), M('metal', 0x9aa0aa), 0, -0.03, 0.16),
        m(bx(0.026, 0.03, 0.035), M('plastic', 0xd03030), -0.045, 0.1, 0.165), m(bx(0.026, 0.03, 0.035), M('plastic', 0x3060d0), 0.045, 0.1, 0.165), m(cyl(0.11, 0.13, 0.03, 32), M('plastic', c), 0, 0.265),
        m(lathe(BOTTLE, 36), M('glass', 0x6fc3ff)), m(lathe(BOTTLE.map(([r, y]) => [r * 0.94, y]).slice(1, -1).concat([[0, 0.6]]), 32), M('liquid', 0x3a9ae0))), shape: boxS(0.16, 0.65, 0.16), halfH: 0.65 }; } },
  // fixed things that stay put until they break (mass 0)
  window: { kind: 'glass', hp: 3, pts: 30, mass: 0, bv: 5, size: 1, spots: [], colors: [0xdff3ff], fixed: true,
    make: (M, c, o) => ({ mesh: m(bx(o.w, o.h, 0.012), M('glass', c)), shape: boxS(o.w / 2, o.h / 2, 0.03), halfH: o.h / 2 }) },
  mirror: { kind: 'glass', hp: 2, pts: 30, mass: 0, bv: 5, size: 0.7, spots: [], colors: [0xffffff], fixed: true,
    make: (M, c, o) => ({ mesh: grp(m(bx(o.w + 0.08, o.h + 0.08, 0.03), M('wood', 0x3a2a1a), 0, 0, -0.02), m(bx(o.w, o.h, 0.01), M('mirror', c))), shape: boxS(o.w / 2, o.h / 2, 0.03), halfH: o.h / 2 }) },
  portrait: { kind: 'wood', hp: 1, pts: 30, mass: 0, bv: 5, size: 0.7, spots: [], colors: [0x5a3a1a, 0xa07a2a], fixed: true,
    make: (M, c, o) => ({ mesh: grp(m(bx(0.62, 0.82, 0.05), M('wood', c)), m(new THREE.PlaneGeometry(0.5, 0.7), M('photo', 0xffffff, { map: o.photo || portraitTex() }), 0, 0, 0.026)), shape: boxS(0.31, 0.41, 0.04), halfH: 0.41 }) },
  cutout: { kind: 'photo', hp: 2, pts: 50, mass: 0, bv: 6, size: 0.7, spots: [], colors: [0xc8a878], fixed: true,
    make: (M, c, o) => ({ mesh: grp(m(bx(0.64, 1.5, 0.02), M('wood', c)), m(new THREE.PlaneGeometry(0.6, 1.46), M('photo', 0xffffff, { map: o.photo }), 0, 0, 0.011), m(new THREE.PlaneGeometry(0.6, 1.46), M('photo', 0xffffff, { map: o.photo }), 0, 0, -0.011, 0, Math.PI)), shape: boxS(0.32, 0.75, 0.04), halfH: 0.75 }) },
  carglass: { kind: 'glass', hp: 1, pts: 25, mass: 0, bv: 5, size: 1, spots: [], colors: [0x9fb7c4], fixed: true,
    make: (M, c, o) => ({ mesh: m(bx(o.w, o.h, o.d || 0.02), M('glass', c)), shape: boxS(o.w / 2, o.h / 2, Math.max(0.03, (o.d || 0.02) / 2)), halfH: o.h / 2 }) },
  carlight: { kind: 'glass', hp: 1, pts: 15, mass: 0, bv: 5, size: 0.25, spots: [], colors: [0xfff6d0], fixed: true,
    make: (M, c, o) => ({ mesh: m(bx(o.w, o.h, 0.04), M(o.glow ? 'emissive' : 'glass', c)), shape: boxS(o.w / 2, o.h / 2, 0.04), halfH: o.h / 2 }) },
  carmirror: { kind: 'plastic', hp: 1, pts: 15, mass: 0, bv: 5, size: 0.2, spots: [], colors: [0x1a1a1a], fixed: true,
    make: (M, c) => ({ mesh: grp(m(bx(0.18, 0.1, 0.06), M('plastic', c)), m(bx(0.15, 0.08, 0.005), M('mirror', 0xffffff), 0, 0, -0.032)), shape: boxS(0.09, 0.05, 0.04), halfH: 0.05 }) },
  // apartment: a fridge and a glass coffee table that stay put until they break
  fridge: { kind: 'electronics', hp: 5, pts: 120, mass: 0, bv: 9, size: 1, spots: [], colors: [0xeef0f2, 0xd8dce0], fixed: true,
    make: (M, c) => ({ mesh: grp(m(bx(0.7, 1.8, 0.66), M('electronics', c)), m(bx(0.69, 0.012, 0.01), M('plastic', 0x9aa0a8), 0, 0.28, 0.335),
      m(bx(0.03, 0.42, 0.04), M('metal', 0xb8bcc4), -0.28, 0.55, 0.36), m(bx(0.03, 0.7, 0.04), M('metal', 0xb8bcc4), -0.28, -0.25, 0.36)), shape: boxS(0.35, 0.9, 0.33), halfH: 0.9 }) },
  coffeetable: { kind: 'glass', hp: 2, pts: 80, mass: 0, bv: 6, size: 1, spots: [], colors: [0xcfe8f0], fixed: true,
    make: (M, c) => { const g = grp(m(bx(1.1, 0.025, 0.6), M('glass', c), 0, 0.2)); for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) g.add(m(cyl(0.015, 0.015, 0.4, 8), M('metal', 0x2a2a2e), x, 0, z));
      return { mesh: g, shape: boxS(0.55, 0.21, 0.3), halfH: 0.21 }; } },
  // wreckage you can pick up: legs, boards and beams from tables and shelves that gave way (never spawned, see adopt)
  leg: { kind: 'wood', hp: 3, pts: 10, mass: 2, bv: 99, size: 0.45, spots: [], colors: [0x8a6a4a] },
  plank: { kind: 'wood', hp: 3, pts: 15, mass: 3, bv: 99, size: 0.9, spots: [], colors: [0x8a6a4a] },
  beam: { kind: 'wood', hp: 4, pts: 20, mass: 4, bv: 99, size: 1.2, spots: [], colors: [0x8a6a4a] },
  // explodes when it breaks: knocks everything around and sets off other cans
  gascan: { kind: 'explosive', hp: 1, pts: 25, mass: 3, bv: 7, size: 0.32, spots: ['floor', 'table'], colors: [0xc0392b, 0xd35400],
    make: (M, c) => ({ mesh: grp(m(bx(0.28, 0.34, 0.15), M('paint', c)), m(new THREE.PlaneGeometry(0.14, 0.14), M('photo', 0xffffff, { map: hazardTex() }), 0, -0.02, 0.076), m(bx(0.1, 0.04, 0.12), M('paint', c), 0.05, 0.19), m(cyl(0.018, 0.018, 0.08, 10), M('metal', 0x222222), -0.09, 0.2)),
      shape: boxS(0.14, 0.17, 0.075), halfH: 0.17 }) },
  // bullseye on a wall for target practice; only thrown things break it
  target: { kind: 'wood', hp: 1, pts: 50, mass: 0, bv: 4.5, size: 0.6, spots: [], colors: [0x8a5a3c], fixed: true,
    make: (M, c) => ({ mesh: grp(m(cyl(0.3, 0.3, 0.04, 32), M('wood', c), 0, 0, 0, Math.PI / 2), m(new THREE.CircleGeometry(0.28, 32), M('photo', 0xffffff, { map: targetTex() }), 0, 0, 0.021)), shape: boxS(0.3, 0.3, 0.04), halfH: 0.3 }) },
  carbody: { kind: 'metal', hp: Infinity, pts: 5, mass: 0, bv: 99, size: 2, spots: [], colors: [0xb3202a], fixed: true,
    make: (M, c) => { const p = M('paint', c), dark = M('plastic', 0x15151a), g = grp(m(bx(1.8, 0.55, 4.2), p, 0, 0.62), m(bx(0.08, 0.5, 0.08), p, -0.82, 1.15, 0.55), m(bx(0.08, 0.5, 0.08), p, 0.82, 1.15, 0.55), m(bx(0.08, 0.5, 0.08), p, -0.82, 1.15, -1.0), m(bx(0.08, 0.5, 0.08), p, 0.82, 1.15, -1.0), m(bx(1.7, 0.06, 1.65), p, 0, 1.42, -0.22), m(bx(1.84, 0.2, 0.12), dark, 0, 0.42, 2.12), m(bx(1.84, 0.2, 0.12), dark, 0, 0.42, -2.12));
      for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) g.add(m(cyl(0.34, 0.34, 0.24, 20), dark, x, 0.34, z, 0, 0, Math.PI / 2));
      return { mesh: g, shapes: [[boxS(0.9, 0.42, 2.1), V(0, 0.62, 0)], [boxS(0.85, 0.05, 0.85), V(0, 1.42, -0.22)]], halfH: 0 }; } },
};

const SHARD = {
  glass: { geo: new THREE.TetrahedronGeometry(1), he: s => [s * 0.45, s * 0.45, s * 0.45], n: 14 },
  ceramic: { geo: new THREE.CylinderGeometry(1, 1, 0.25, 3), he: s => [s * 0.6, s * 0.125, s * 0.6], n: 10 },
  electronics: { geo: new THREE.BoxGeometry(1, 1, 1), he: s => [s * 0.5, s * 0.5, s * 0.5], n: 13 },
  wood: { geo: new THREE.BoxGeometry(1, 0.35, 0.35), he: s => [s * 0.5, s * 0.175, s * 0.175], n: 8 },
  stone: { geo: new THREE.DodecahedronGeometry(0.6), he: s => [s * 0.5, s * 0.5, s * 0.5], n: 9 },
  plastic: { geo: new THREE.CylinderGeometry(1, 1, 0.3, 4), he: s => [s * 0.6, s * 0.15, s * 0.6], n: 9 },
  photo: { geo: new THREE.BoxGeometry(1, 1, 0.05), he: s => [s * 0.5, s * 0.5, s * 0.05], n: 14 },
};
SHARD.metal = SHARD.electronics;
SHARD.explosive = SHARD.electronics;
SHARD.clay = { geo: new THREE.SphereGeometry(1, 8, 6).scale(1, 0.6, 1), he: s => [s * 0.8, s * 0.5, s * 0.8], n: 6 };

// ---- real fragments: cut the object's own triangles with a few planes through the impact point,
// so every piece is a piece of that object, with its shape, colour and texture.
function collectTris(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), out = [], m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  let count = 0;
  root.traverse(o => {
    if (!o.isMesh || o.userData.ol || o.userData.hl || o.userData.gold) return;
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
    if (!pos) return;
    m4.multiplyMatrices(inv, o.matrixWorld); n3.getNormalMatrix(m4);
    const cache = new Array(pos.count);
    const get = i => cache[i] || (cache[i] = (v.fromBufferAttribute(pos, i).applyMatrix4(m4), nor ? n.fromBufferAttribute(nor, i).applyMatrix3(n3).normalize() : n.set(0, 1, 0),
      [v.x, v.y, v.z, n.x, n.y, n.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0]));
    const cnt = idx ? idx.count : pos.count, polys = [];
    for (let i = 0; i + 2 < cnt; i += 3) polys.push([get(idx ? idx.getX(i) : i), get(idx ? idx.getX(i + 1) : i + 1), get(idx ? idx.getX(i + 2) : i + 2)]);
    count += polys.length; out.push({ mat: Array.isArray(o.material) ? o.material[0] : o.material, polys });
  });
  return { parts: out, count };
}
function splitPoly(poly, pl, front, back) {
  const d = poly.map(q => q[0] * pl[0] + q[1] * pl[1] + q[2] * pl[2] - pl[3]);
  let pos = false, neg = false; for (const x of d) { if (x > 1e-6) pos = true; else if (x < -1e-6) neg = true; }
  if (!neg) return front.push(poly); if (!pos) return back.push(poly);
  const f = [], b = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, a = poly[i], c = poly[j], da = d[i], dc = d[j];
    if (da >= 0) f.push(a); if (da <= 0) b.push(a);
    if ((da > 0 && dc < 0) || (da < 0 && dc > 0)) { const t = da / (da - dc), mid = a.map((x, k) => x + (c[k] - x) * t); f.push(mid); b.push(mid); }
  }
  if (f.length >= 3) front.push(f); if (b.length >= 3) back.push(b);
}
// returns [{ group, centroid (root-local), half, verts }]
function fracture(root, impact, nPlanes, ds) {
  const { parts, count } = collectTris(root); if (!count) return [];
  if (count > 60000) nPlanes = Math.min(nPlanes, 2);
  const box = new THREE.Box3(); for (const part of parts) for (const poly of part.polys) for (const q of poly) box.expandByPoint(new THREE.Vector3(q[0], q[1], q[2]));
  const ext = box.getSize(new THREE.Vector3()).length() / 2, at = impact ? impact.clone().clamp(box.min, box.max) : box.getCenter(new THREE.Vector3());
  let cells = [parts.map(q => q.polys)];
  for (let j = 0; j < nPlanes; j++) {
    const nrm = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), pt = at.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(ext * (j ? 0.3 : 0.06)));
    const pl = [nrm.x, nrm.y, nrm.z, nrm.dot(pt)], next = [];
    for (const cell of cells) {
      const f = cell.map(() => []), b = cell.map(() => []);
      cell.forEach((polys, k) => { for (const poly of polys) splitPoly(poly, pl, f[k], b[k]); });
      if (f.some(x => x.length)) next.push(f); if (b.some(x => x.length)) next.push(b);
    }
    cells = next;
  }
  const out = [];
  for (const cell of cells) {
    const c = new THREE.Vector3(), bb = new THREE.Box3(); let nv = 0;
    for (const polys of cell) for (const poly of polys) for (const q of poly) { c.x += q[0]; c.y += q[1]; c.z += q[2]; nv++; bb.expandByPoint(new THREE.Vector3(q[0], q[1], q[2])); }
    if (!nv) continue; c.multiplyScalar(1 / nv);
    const half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5); if (Math.max(half.x, half.y, half.z) < 0.012) continue;
    const group = new THREE.Group();
    cell.forEach((polys, k) => {
      if (!polys.length) return; const P = [], N = [], U = [];
      for (const poly of polys) for (let i = 1; i + 1 < poly.length; i++) for (const q of [poly[0], poly[i], poly[i + 1]]) { P.push(q[0] - c.x, q[1] - c.y, q[2] - c.z); N.push(q[3], q[4], q[5]); U.push(q[6], q[7]); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      const mesh = new THREE.Mesh(g, ds(parts[k].mat)); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    });
    out.push({ group, centroid: c, half, verts: nv });
  }
  return out.sort((a, b) => b.verts - a.verts);
}

export function createItems({ scene, world, S, onBreak, onClink }) {
  const dsCache = new Map(); // fragments are open shells, so their materials draw both sides
  const ds = mat => { if (mat.side === THREE.DoubleSide) return mat; let c = dsCache.get(mat); if (!c) { c = mat.clone(); c.side = THREE.DoubleSide; dsCache.set(mat, c); } return c; };
  const api = { list: [], chunks: [], sparks: [], queue: [], photo: null };
  const M = S.mat;

  function add(key, x, y, z, ry = 0, o = {}) {
    const def = DEFS[key], color = o.color ?? pick(def.colors), r = def.make(M, color, { photo: api.photo, ...o });
    const src = S.realistic && !(key === 'frame' && api.photo) && itemModel(key); // realistic look: swap in a real model, sized to the simple shape
    if (src) { const g = new THREE.Group(); g.add(fitInto(src, new THREE.Box3().setFromObject(r.mesh), 'item')); r.mesh = g; }
    r.mesh.traverse(n => { if (n.isMesh) { n.castShadow = !def.fixed || key === 'carbody'; n.receiveShadow = true; } });
    if (def.kind !== 'glass' && key !== 'bowl') S.outline(r.mesh, 1.05); // outlines show through see-through and open vessels, so those go without
    scene.add(r.mesh);
    const body = new CANNON.Body({ mass: def.mass, position: V(x, def.fixed ? y : y + r.halfH + 0.01, z) }); // fixed things: y is their centre
    if (r.shapes) r.shapes.forEach(([s, off]) => body.addShape(s, off)); else body.addShape(r.shape);
    body.quaternion.setFromEuler(o.rx || 0, ry, 0);
    body.sleepSpeedLimit = 0.15; body.angularDamping = 0.2; body.linearDamping = 0.02;
    world.addBody(body);
    const it = { key, def, mesh: r.mesh, body, color, hp: def.hp * (o.hpMul || 1), born: performance.now(), pop: 0, dead: false, fixed: !!def.fixed };
    if (def.fixed) { r.mesh.position.copy(body.position); r.mesh.quaternion.copy(body.quaternion); }
    body.addEventListener('collide', e => {
      if (it.dead || it.queued || it.held) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const limit = it.thrown ? def.bv * 0.55 : def.bv;
      if (v > limit && performance.now() - it.born > 900) { it.queued = true; api.queue.push([it, v]); }
      else if (v > 1.4) onClink(def.kind, Math.min(1, v / 5), body.position);
    });
    api.list.push(it); return it;
  }
  api.add = add;
  // turn a loose piece of a wrecked table or shelf into something you can grab, swing and break
  api.adopt = (key, mesh, body) => {
    const it = { key, def: DEFS[key], mesh, body, color: 0x8a6a4a, hp: DEFS[key].hp, born: performance.now(), pop: 0, dead: false, fixed: false, debris: true };
    api.list.push(it); return it;
  };

  api.batch = (pool, slots, n = 14) => {
    const placed = api.list.filter(i => !i.dead && !i.fixed).map(i => ({ x: i.body.position.x, y: i.body.position.y - 0.2, z: i.body.position.z, r: i.def.size / 2 }));
    const order = [...slots].sort(() => Math.random() - 0.5); let count = 0;
    for (const s of order) {
      if (count >= n) break;
      const opts = pool.filter(k => DEFS[k] && DEFS[k].spots.includes(s.k) && (!s.max || DEFS[k].size <= s.max));
      if (!opts.length) continue;
      const key = pick(opts), r = DEFS[key].size / 2;
      if (placed.some(p => Math.abs(p.y - s.y) < 0.35 && Math.hypot(p.x - s.x, p.z - s.z) < r + p.r + 0.03)) continue;
      if (s.w && r > s.w) continue;
      placed.push({ x: s.x, y: s.y, z: s.z, r });
      const tilt = DEFS[key].tilt ? -0.25 : 0;
      add(key, s.x + rand(-0.02, 0.02), s.y, s.z + rand(-0.02, 0.02), s.ry ?? (s.k === 'shelf' || DEFS[key].size > 0.45 ? rand(-0.25, 0.25) : rand(0, 6.28)), { rx: tilt });
      count++;
    }
    return count;
  };

  // a 3-2-1 pyramid of cups on a free table spot: knock the bottom and the lot comes down
  api.pyramid = slots => {
    const free = slots.filter(s => s.k === 'table' && s.w >= 0.3 && !api.list.some(i => !i.dead && Math.abs(i.body.position.y - s.y - 0.1) < 0.3 && Math.hypot(i.body.position.x - s.x, i.body.position.z - s.z) < 0.45));
    if (!free.length) return false;
    const s = free[Math.floor(Math.random() * free.length)], color = pick(DEFS.cup.colors);
    [[-0.13, 0], [0, 0], [0.13, 0], [-0.065, 1], [0.065, 1], [0, 2]].forEach(([x, row]) => { const it = add('cup', s.x + x, s.y + row * 0.142, s.z, 0, { color }); it.body.sleep(); });
    return true;
  };

  function remove(it) { it.dead = true; world.removeBody(it.body); scene.remove(it.mesh); }
  api.remove = remove;

  const shardMax = () => S.Q.chunks;
  function trim() { while (api.chunks.length > shardMax()) { const c = api.chunks.shift(); world.removeBody(c.body); scene.remove(c.mesh); if (c.own) c.mesh.traverse(o => o.geometry && o.geometry.dispose()); } }
  api.shard = (kind, s, color, p, base, dir, force, spread, map) => {
    const C = SHARD[kind] || SHARD.electronics;
    const mat = kind === 'photo' && map ? M('photo', 0xffffff, { map }) : M(kind === 'photo' ? 'wood' : kind, color);
    const mesh = new THREE.Mesh(C.geo, mat); mesh.scale.setScalar(s); mesh.castShadow = true; scene.add(mesh);
    const [x, y, z] = C.he(s);
    const body = new CANNON.Body({ mass: Math.max(0.02, s * s * s * 40), shape: boxS(x, y, z),
      position: V(p.x + rand(-0.3, 0.3) * spread, p.y + rand(0, 0.4) * spread, p.z + rand(-0.3, 0.3) * spread) });
    body.velocity.set(base.x + dir.x * force * rand(0.4, 1.2) + rand(-2, 2), base.y + dir.y * force * rand(0.3, 1) + rand(0.5, 3.5), base.z + dir.z * force * rand(0.4, 1.2) + rand(-2, 2));
    body.angularVelocity.set(rand(-15, 15), rand(-15, 15), rand(-15, 15));
    body.sleepSpeedLimit = 0.3; body.sleepTimeLimit = 0.4; body.linearDamping = 0.05;
    world.addBody(body); api.chunks.push({ mesh, body, kind }); trim();
  };
  const sparkGeo = new THREE.TetrahedronGeometry(0.014);
  api.sparks_ = (p, n, color = 0xffffff) => {
    const mat = M('emissive', color);
    for (let i = 0; i < n; i++) { const s = new THREE.Mesh(sparkGeo, mat); s.position.set(p.x, p.y, p.z); scene.add(s);
      api.sparks.push({ mesh: s, v: new THREE.Vector3(rand(-4, 4), rand(1, 5), rand(-4, 4)), life: rand(0.4, 0.9) }); }
  };

  // shatter: the object comes apart into pieces of itself (smaller near the hit), plus a little grit. Reports via onBreak.
  const MAXFR = { low: 6, medium: 10, high: 14 };
  api.shatter = (it, dir, force, fromHit, hitPoint, chunky) => { // chunky: a sledgehammer knocks it into fewer, bigger pieces
    if (it.dead) return;
    const d = it.def, p = it.body.position, vel = it.fixed ? V(0, 0, 0) : it.body.velocity, root = it.mesh;
    let made = 0;
    try {
      root.updateMatrixWorld(true);
      const hitW = hitPoint ? hitPoint.clone() : new THREE.Vector3(p.x - dir.x * d.size * 0.3, p.y, p.z - dir.z * d.size * 0.3);
      const frags = fracture(root, root.worldToLocal(hitW.clone()), (d.size > 0.45 ? 4 : 3) - (S.quality === 'low' ? 1 : 0) - (chunky ? 1 : 0), ds).slice(0, MAXFR[S.quality] || 10);
      const total = frags.reduce((a, f) => a + f.half.x * f.half.y * f.half.z, 0) || 1, q = root.getWorldQuaternion(new THREE.Quaternion()), sc = root.getWorldScale(new THREE.Vector3());
      for (const f of frags) {
        const w = root.localToWorld(f.centroid.clone()), out = w.clone().sub(hitW), dist = out.length() || 0.01; out.multiplyScalar(1 / dist);
        f.group.position.copy(w); f.group.quaternion.copy(q); f.group.scale.copy(sc); S.outline(f.group, 1.04); scene.add(f.group);
        const hx = Math.max(0.012, f.half.x * sc.x), hy = Math.max(0.012, f.half.y * sc.y), hz = Math.max(0.012, f.half.z * sc.z);
        const body = new CANNON.Body({ mass: Math.max(0.03, (d.mass || d.size * 2) * f.half.x * f.half.y * f.half.z / total), shape: boxS(hx, hy, hz), position: V(w.x, w.y, w.z) });
        body.quaternion.set(q.x, q.y, q.z, q.w);
        const near = 1 / (0.35 + dist / Math.max(0.1, d.size)), k = force * rand(0.45, 1) * Math.min(1.6, near);
        body.velocity.set(vel.x + dir.x * k + out.x * (1 + force * 0.3) + rand(-0.6, 0.6), vel.y + dir.y * k + out.y * (1 + force * 0.2) + rand(0.4, 2.2), vel.z + dir.z * k + out.z * (1 + force * 0.3) + rand(-0.6, 0.6));
        body.angularVelocity.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        body.sleepSpeedLimit = 0.3; body.sleepTimeLimit = 0.4; body.linearDamping = 0.05; body.angularDamping = 0.1;
        body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 1.2) onClink(d.kind, Math.min(1, v / 6), body.position); });
        world.addBody(body); api.chunks.push({ mesh: f.group, body, kind: d.kind, own: true }); made++;
      }
    } catch (e) { console.warn('fracture failed, using plain shards', e); }
    remove(it);
    const n = Math.round((SHARD[d.kind].n + d.size * 8) * (d.shards || 1) * (made ? 0.4 : 1) * (chunky ? 0.5 : 1));
    const map = d.kind === 'photo' ? api.photo : null;
    for (let i = 0; i < n; i++) {
      const col = d.kind === 'electronics' ? pick([it.color, it.color, 0x222233, 0x1fae5b, 0xcfcfd8]) : (Math.random() < 0.85 ? it.color : 0xffffff);
      api.shard(d.kind, Math.min(0.35, d.size) * (made ? rand(0.05, 0.13) : rand(0.1, 0.26)), col, p, vel, dir, force, Math.min(d.size, 1), map);
    }
    trim();
    if (d.kind === 'glass') api.sparks_(p, 18);
    if (d.kind === 'electronics') api.sparks_(p, 14, 0xffc531);
    if (d.kind === 'stone') api.sparks_(p, 20, 0xb8b0a8);
    onBreak(it, fromHit);
  };

  api.flush = () => {
    while (api.queue.length) { const [it, v] = api.queue.shift(); const bv = it.body.velocity;
      api.shatter(it, new THREE.Vector3(bv.x, Math.abs(bv.y), bv.z).normalize(), Math.min(v * 0.3, 4), false); }
    api.list = api.list.filter(it => { if (!it.dead && it.body.position.y < -3) remove(it); return !it.dead; });
  };

  api.sync = dt => {
    for (const it of api.list) {
      if (!it.fixed) { it.mesh.position.copy(it.body.interpolatedPosition); it.mesh.quaternion.copy(it.body.interpolatedQuaternion); }
      if (it.pop > 0) { it.pop = Math.max(0, it.pop - dt * 6); it.mesh.scale.setScalar(1 + it.pop * (it.fixed ? 0.04 : 0.15)); }
    }
    for (const c of api.chunks) { c.mesh.position.copy(c.body.interpolatedPosition); c.mesh.quaternion.copy(c.body.interpolatedQuaternion); }
    api.sparks = api.sparks.filter(s => { s.life -= dt; s.v.y -= 9.8 * dt; s.mesh.position.addScaledVector(s.v, dt); s.mesh.rotation.x += dt * 10;
      if (s.life <= 0 || s.mesh.position.y < 0) { scene.remove(s.mesh); return false; } return true; });
  };
  return api;
}
