// Breakable things: definitions, spawning, shattering.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { canvasTex } from './style.js?v=4';
import { itemModel, fitInto } from './models.js?v=4';

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
    make: (M, c) => ({ mesh: m(cyl(0.06, 0.048, 0.14, 16), M('glass', c)), shape: cylS(0.06, 0.048, 0.14, 8), halfH: 0.07 }) },
  wineglass: { kind: 'glass', hp: 1, pts: 12, mass: 0.2, bv: 3, size: 0.11, spots: SMALL, colors: CLEAR,
    make: (M, c) => ({ mesh: m(lathe([[0, -0.1], [0.045, -0.1], [0.045, -0.094], [0.006, -0.088], [0.006, -0.02], [0.04, 0.01], [0.05, 0.06], [0.046, 0.1]]), M('glass', c)), shape: cylS(0.05, 0.045, 0.2, 8), halfH: 0.1 }) },
  beermug: { kind: 'glass', hp: 1, pts: 12, mass: 0.6, bv: 3.6, size: 0.15, spots: SMALL, colors: [0xfff1c4, 0xffffff],
    make: (M, c) => ({ mesh: grp(m(cyl(0.055, 0.05, 0.15), M('glass', c)), m(new THREE.TorusGeometry(0.04, 0.012, 8, 14), M('glass', c), 0.07)), shape: cylS(0.065, 0.065, 0.15, 8), halfH: 0.075 }) },
  jar: { kind: 'glass', hp: 1, pts: 10, mass: 0.5, bv: 3.4, size: 0.15, spots: SMALL, colors: CLEAR,
    make: (M, c) => ({ mesh: grp(m(cyl(0.07, 0.07, 0.16), M('glass', c)), m(cyl(0.072, 0.072, 0.02), M('metal', 0xc9a227), 0, 0.09)), shape: cylS(0.072, 0.072, 0.18, 8), halfH: 0.09 }) },
  fishbowl: { kind: 'glass', hp: 1, pts: 20, mass: 1, bv: 3.2, size: 0.34, spots: SMALL, colors: [0xdff8ff],
    make: (M, c) => ({ mesh: m(new THREE.SphereGeometry(0.17, 24, 16, 0, Math.PI * 2, 0.5, 2.4), M('glass', c), 0, 0.02), shape: cylS(0.15, 0.1, 0.3, 10), halfH: 0.15 }) },
  plate: { kind: 'ceramic', hp: 1, pts: 8, mass: 0.5, bv: 3.6, size: 0.34, spots: SMALL, colors: CHINA,
    make: (M, c) => ({ mesh: m(cyl(0.17, 0.12, 0.035, 26), M('ceramic', c)), shape: cylS(0.17, 0.12, 0.035, 12), halfH: 0.0175 }) },
  platestack: { kind: 'ceramic', hp: 1, pts: 40, mass: 3, bv: 3.6, size: 0.34, spots: SMALL, colors: CHINA, shards: 2.5,
    make: (M, c) => { const g = new THREE.Group(); for (let i = 0; i < 6; i++) g.add(m(cyl(0.17, 0.12, 0.03, 26), M('ceramic', c), 0, -0.05 + i * 0.022)); return { mesh: g, shape: cylS(0.17, 0.17, 0.13, 12), halfH: 0.065 }; } },
  bowl: { kind: 'ceramic', hp: 1, pts: 8, mass: 0.4, bv: 3.6, size: 0.26, spots: SMALL, colors: [...CHINA, 0x9ec7e8],
    make: (M, c) => ({ mesh: m(lathe([[0, -0.05], [0.06, -0.05], [0.11, 0], [0.13, 0.05]]), M('ceramic', c)), shape: cylS(0.13, 0.06, 0.1, 10), halfH: 0.05 }) },
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
    make: (M, c) => ({ mesh: grp(m(new THREE.ConeGeometry(0.07, 0.18, 14), M('fabric', c), 0, -0.06), m(new THREE.SphereGeometry(0.055, 16, 12), M('ceramic', 0xf3e6dc), 0, 0.08),
      m(new THREE.SphereGeometry(0.008, 6, 6), M('emissive', 0x111111), -0.02, 0.09, 0.05), m(new THREE.SphereGeometry(0.008, 6, 6), M('emissive', 0x111111), 0.02, 0.09, 0.05)), shape: cylS(0.07, 0.07, 0.29, 8), halfH: 0.15 }) },
  candlestick: { kind: 'metal', hp: Infinity, pts: 3, mass: 0.6, bv: 99, size: 0.14, spots: SMALL, colors: [0xc9a227, 0xb8bcc4],
    make: (M, c) => ({ mesh: grp(m(cyl(0.06, 0.07, 0.02), M('metal', c), 0, -0.14), m(cyl(0.012, 0.016, 0.24), M('metal', c), 0, -0.02), m(cyl(0.03, 0.02, 0.03), M('metal', c), 0, 0.1), m(cyl(0.014, 0.014, 0.08), M('plastic', 0xf3ead8), 0, 0.15)), shape: cylS(0.06, 0.06, 0.3, 8), halfH: 0.15 }) },
  pan: { kind: 'metal', hp: Infinity, pts: 3, mass: 1.2, bv: 99, size: 0.3, spots: SMALL, colors: [0x2b2b30, 0x9aa0aa],
    make: (M, c) => ({ mesh: grp(m(cyl(0.14, 0.12, 0.04, 24), M('metal', c)), m(bx(0.22, 0.02, 0.03), M('plastic', 0x1a1a1a), 0.25, 0.01)), shape: cylS(0.14, 0.12, 0.04, 10), halfH: 0.02 }) },
  saucepan: { kind: 'metal', hp: Infinity, pts: 3, mass: 1, bv: 99, size: 0.22, spots: SMALL, colors: [0xb8bcc4, 0xb5653a],
    make: (M, c) => ({ mesh: grp(m(cyl(0.1, 0.1, 0.12, 24), M('metal', c)), m(bx(0.18, 0.02, 0.025), M('plastic', 0x1a1a1a), 0.19, 0.04)), shape: cylS(0.1, 0.1, 0.12, 10), halfH: 0.06 }) },
  kettle: { kind: 'metal', hp: Infinity, pts: 3, mass: 1, bv: 99, size: 0.22, spots: SMALL, colors: [0xb8bcc4, 0xd04030],
    make: (M, c) => ({ mesh: grp(m(lathe([[0, -0.1], [0.1, -0.1], [0.11, -0.02], [0.08, 0.08], [0.03, 0.1], [0, 0.1]]), M('metal', c)), m(new THREE.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), M('plastic', 0x1a1a1a), 0, 0.1), m(cyl(0.01, 0.02, 0.1, 8), M('metal', c), 0.11, 0.01, 0, 0, 0, -0.9)), shape: cylS(0.1, 0.1, 0.2, 10), halfH: 0.1 }) },
  fork: { kind: 'metal', hp: Infinity, pts: 2, mass: 0.05, bv: 99, size: 0.16, spots: SMALL, colors: [0xc8ccd4],
    make: (M, c) => ({ mesh: m(bx(0.17, 0.008, 0.022), M('metal', c)), shape: boxS(0.085, 0.004, 0.011), halfH: 0.004 }) },
  keyboard: { kind: 'electronics', hp: 2, pts: 20, mass: 0.8, bv: 8, size: 0.46, spots: SMALL, colors: [0x2b2b3a],
    make: (M, c) => ({ mesh: grp(m(bx(0.44, 0.03, 0.15), M('electronics', c)), m(new THREE.PlaneGeometry(0.42, 0.13), M('screen', 0xffffff, { map: keysTex() }), 0, 0.0155, 0, -Math.PI / 2)), shape: boxS(0.22, 0.015, 0.075), halfH: 0.015 }) },
  monitor: { kind: 'electronics', hp: 3, pts: 40, mass: 4, bv: 7.5, size: 0.72, spots: BIG, colors: [0x2b2b3a, 0xd9d6e6],
    make: (M, c) => { const mt = M('electronics', c), tx = Math.random() < 0.5 ? screenTex() : spreadsheetTex();
      return { mesh: grp(m(bx(0.72, 0.46, 0.06), mt, 0, 0.06), m(new THREE.PlaneGeometry(0.66, 0.4), M('screen', 0xffffff, { map: tx }), 0, 0.06, 0.031), m(bx(0.06, 0.12, 0.04), mt, 0, -0.22), m(bx(0.28, 0.025, 0.18), mt, 0, -0.275)), shape: boxS(0.36, 0.29, 0.09), halfH: 0.29 }; } },
  tv: { kind: 'electronics', hp: 4, pts: 60, mass: 7, bv: 7, size: 0.96, spots: ['floor', 'table'], colors: [0x1d1b26],
    make: (M, c) => { const mt = M('electronics', c), g = grp(m(bx(0.96, 0.58, 0.08), mt, 0, 0.03), m(new THREE.PlaneGeometry(0.9, 0.52), M('screen', 0xffffff, { map: staticTex() }), 0, 0.03, 0.041));
      for (const x of [-0.35, 0.35]) g.add(m(bx(0.06, 0.05, 0.2), mt, x, -0.285)); return { mesh: g, shape: boxS(0.48, 0.31, 0.1), halfH: 0.31 }; } },
  crt: { kind: 'electronics', hp: 4, pts: 55, mass: 12, bv: 7, size: 0.6, spots: BIG, colors: [0xcfc6a8, 0x3a3a3a],
    make: (M, c) => ({ mesh: grp(m(bx(0.6, 0.5, 0.5), M('electronics', c)), m(new THREE.PlaneGeometry(0.48, 0.38), M('screen', 0xffffff, { map: staticTex() }), 0, 0.02, 0.252)), shape: boxS(0.3, 0.25, 0.25), halfH: 0.25 }) },
  printer: { kind: 'electronics', hp: 3, pts: 35, mass: 5, bv: 8.5, size: 0.52, spots: BIG, colors: [0xe6e6ee, 0xcfd6e6],
    make: (M, c) => ({ mesh: grp(m(bx(0.5, 0.24, 0.38), M('electronics', c)), m(bx(0.38, 0.03, 0.2), M('electronics', 0x8d8aa0), 0, 0.13, -0.05), m(bx(0.36, 0.03, 0.02), M('electronics', 0x2b2b3a), 0, 0.04, 0.19), m(bx(0.04, 0.02, 0.01), M('emissive', 0x2fd18a), 0.18, 0.08, 0.192)), shape: boxS(0.25, 0.12, 0.19), halfH: 0.12 }) },
  laptop: { kind: 'electronics', hp: 2, pts: 30, mass: 1.5, bv: 7, size: 0.36, spots: SMALL, colors: [0xb8bcc4, 0x2b2b3a],
    make: (M, c) => { const mt = M('electronics', c), lid = grp(m(bx(0.34, 0.22, 0.012), mt), m(new THREE.PlaneGeometry(0.31, 0.19), M('screen', 0xffffff, { map: spreadsheetTex() }), 0, 0, 0.007)); lid.position.set(0, 0.01, -0.11); lid.rotation.x = -0.25;
      return { mesh: grp(m(bx(0.34, 0.02, 0.24), mt, 0, -0.1), m(new THREE.PlaneGeometry(0.3, 0.12), M('screen', 0xffffff, { map: keysTex() }), 0, -0.089, 0.03, -Math.PI / 2), lid), shape: boxS(0.17, 0.11, 0.12), halfH: 0.11 }; } },
  phone: { kind: 'electronics', hp: 1, pts: 12, mass: 0.2, bv: 6, size: 0.15, spots: SMALL, colors: [0x1a1a22, 0xd9d6e6],
    make: (M, c) => ({ mesh: grp(m(bx(0.075, 0.01, 0.15), M('electronics', c)), m(new THREE.PlaneGeometry(0.068, 0.138), M('screen', 0xffffff, { map: screenTex() }), 0, 0.0055, 0, -Math.PI / 2)), shape: boxS(0.0375, 0.005, 0.075), halfH: 0.005 }) },
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
    make: (M, c) => ({ mesh: m(bx(0.39, 0.19, 0.19), M('stone', c)), shape: boxS(0.195, 0.095, 0.095), halfH: 0.095 }) },
  watercooler: { kind: 'plastic', hp: 2, pts: 35, mass: 6, bv: 9, size: 0.34, spots: ['floor'], colors: [0xf0f0f4],
    make: (M, c) => ({ mesh: grp(m(bx(0.3, 0.9, 0.3), M('plastic', c), 0, -0.2), m(cyl(0.14, 0.14, 0.38, 22), M('glass', 0x6fc3ff), 0, 0.45)), shape: boxS(0.16, 0.65, 0.16), halfH: 0.65 }) },
  // fixed things that stay put until they break (mass 0)
  window: { kind: 'glass', hp: 1, pts: 20, mass: 0, bv: 5, size: 1, spots: [], colors: [0xdff3ff], fixed: true,
    make: (M, c, o) => ({ mesh: m(bx(o.w, o.h, 0.012), M('glass', c)), shape: boxS(o.w / 2, o.h / 2, 0.03), halfH: o.h / 2 }) },
  mirror: { kind: 'glass', hp: 1, pts: 30, mass: 0, bv: 5, size: 0.7, spots: [], colors: [0xffffff], fixed: true,
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

export function createItems({ scene, world, S, onBreak, onClink }) {
  const api = { list: [], chunks: [], sparks: [], queue: [], photo: null };
  const M = S.mat;

  function add(key, x, y, z, ry = 0, o = {}) {
    const def = DEFS[key], color = o.color ?? pick(def.colors), r = def.make(M, color, { photo: api.photo, ...o });
    const src = S.realistic && itemModel(key); // realistic look: swap in a real model, sized to the simple shape
    if (src) { const g = new THREE.Group(); g.add(fitInto(src, new THREE.Box3().setFromObject(r.mesh), 'item')); r.mesh = g; }
    r.mesh.traverse(n => { if (n.isMesh) { n.castShadow = !def.fixed || key === 'carbody'; n.receiveShadow = true; } });
    S.outline(r.mesh, def.kind === 'glass' ? 1.04 : 1.05); scene.add(r.mesh);
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
      else if (v > 1.4) onClink(def.kind, Math.min(1, v / 5));
    });
    api.list.push(it); return it;
  }
  api.add = add;

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
    world.addBody(body); api.chunks.push({ mesh, body });
    while (api.chunks.length > shardMax()) { const c = api.chunks.shift(); world.removeBody(c.body); scene.remove(c.mesh); }
  };
  const sparkGeo = new THREE.TetrahedronGeometry(0.014);
  api.sparks_ = (p, n, color = 0xffffff) => {
    const mat = M('emissive', color);
    for (let i = 0; i < n; i++) { const s = new THREE.Mesh(sparkGeo, mat); s.position.set(p.x, p.y, p.z); scene.add(s);
      api.sparks.push({ mesh: s, v: new THREE.Vector3(rand(-4, 4), rand(1, 5), rand(-4, 4)), life: rand(0.4, 0.9) }); }
  };

  // shatter: returns nothing, reports via onBreak
  api.shatter = (it, dir, force, fromHit) => {
    if (it.dead) return; remove(it);
    const d = it.def, p = it.body.position, vel = it.fixed ? V(0, 0, 0) : it.body.velocity;
    const n = Math.round((SHARD[d.kind].n + d.size * 8) * (d.shards || 1));
    const map = d.kind === 'photo' ? api.photo : null;
    for (let i = 0; i < n; i++) {
      const col = d.kind === 'electronics' ? pick([it.color, it.color, 0x222233, 0x1fae5b, 0xcfcfd8]) : (Math.random() < 0.85 ? it.color : 0xffffff);
      api.shard(d.kind, Math.min(0.35, d.size) * rand(0.1, 0.26), col, p, vel, dir, force, Math.min(d.size, 1), map);
    }
    if (d.kind === 'glass') api.sparks_(p, 18);
    if (d.kind === 'electronics') api.sparks_(p, 14, 0xffc531);
    if (d.kind === 'stone') api.sparks_(p, 20, 0xb8b0a8);
    if (it.key === 'watercooler') api.sparks_(p, 40, 0x6fc3ff);
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
