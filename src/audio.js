// Sound engine: CC0 recordings (assets/sounds) placed in 3D with a per-room echo; generated sounds are the fallback.
const rand = (a, b) => a + Math.random() * (b - a);
let musicStyle = 'heavy';
export const setMusicStyle = m => { musicStyle = m; };
let cur = null, master, muffle, conv, wet, ringBus, muffled = false;
const vol = { master: 1, music: 1, sfx: 1 };
const B = () => cur || sfx; // where a sound goes: the current 3D position, or straight to the effects bus
let ac, sfx, music, amb, noiseBuf, musicOn = true, playing = false, nextBeat = 0, beat = 0, ambNodes = [], ambTimers = [];

export function initAudio() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const limit = ac.createDynamicsCompressor(); limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.08; limit.connect(ac.destination); // keeps stacked breaks off the ceiling
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; comp.connect(limit);
  master = ac.createGain(); master.gain.value = 0.8 * vol.master; master.connect(comp);
  muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(master); // closes during slow motion and after a blast
  sfx = ac.createGain(); sfx.gain.value = vol.sfx; sfx.connect(muffle);
  music = ac.createGain(); music.gain.value = 0; music.connect(muffle);
  amb = ac.createGain(); amb.gain.value = 0.5; amb.connect(muffle);
  conv = ac.createConvolver(); wet = ac.createGain(); wet.gain.value = 0; sfx.connect(conv); conv.connect(wet); wet.connect(muffle);
  ringBus = ac.createGain(); ringBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setInterval(musicTick, 50);
  loadSamples();
}

// ---- space: where sounds come from, and what the room does to them
export function at(p, fn) { // every sound started inside fn comes from point p
  if (!ac || !p) return fn();
  const n = ac.createPanner(); n.panningModel = 'HRTF'; n.distanceModel = 'inverse'; n.refDistance = 1.8; n.rolloffFactor = 1.1; n.maxDistance = 40;
  if (n.positionX) { n.positionX.value = p.x; n.positionY.value = p.y; n.positionZ.value = p.z; } else n.setPosition(p.x, p.y, p.z);
  n.connect(sfx); cur = n; try { return fn(); } finally { cur = null; }
}
// a looping recording fixed at point p (a burst pipe); returns a handle to fade it out
export function loopAt(set, p, gain = 1) {
  if (!ac || !has(set)) return null;
  const s = ac.createBufferSource(), b = bufs[set][0]; s.buffer = b; s.loop = true; s.loopStart = 0.06; s.loopEnd = b.duration - 0.06; // skip the mp3 padding at both ends
  const g = ac.createGain(); g.gain.value = gain;
  at(p, () => s.connect(g).connect(B())); s.start();
  return { set: v => g.gain.setTargetAtTime(v, ac.currentTime, 0.4), stop() { g.gain.setTargetAtTime(0, ac.currentTime, 0.5); setTimeout(() => { try { s.stop(); } catch (e) {} }, 2500); } };
}
export function listener(p, f) {
  if (!ac) return; const l = ac.listener;
  if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
}
// [echo length s, wet level, damping 0..1, slap-back delay s]
const ROOMS = { classic: [0.55, 0.2, 0.5, 0], abandoned: [1.7, 0.34, 0.25, 0], haunted: [0.9, 0.24, 0.6, 0], office: [0.3, 0.1, 0.8, 0], kitchen: [0.75, 0.28, 0.15, 0], caryard: [0.35, 0.12, 0.5, 0.21], studio: [0.8, 0.22, 0.4, 0] };
export function setRoom(kind) {
  if (!ac) return; const [len, level, damp, slap] = ROOMS[kind] || ROOMS.classic, sr = ac.sampleRate, n = Math.floor(sr * (len + slap + 0.05));
  const ir = ac.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, x = (Math.random() * 2 - 1) * Math.exp(-6.2 * t / len); lp += (x - lp) * (1 - damp * Math.min(1, 0.3 + t / len)); d[i] = lp; }
    for (let k = 0; k < 6; k++) { const i = Math.floor(sr * (0.006 + Math.random() * 0.035)); d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.5; } // early reflections
    if (slap) { const o = Math.floor(sr * slap); for (let i = 0; i < sr * 0.03; i++) d[o + i] += (Math.random() * 2 - 1) * 0.6 * Math.exp(-i / (sr * 0.008)); }
  }
  conv.buffer = ir; wet.gain.setTargetAtTime(level, ac.currentTime, 0.1);
}
export function setMuffle(on) { if (!ac || on === muffled) return; muffled = on; muffle.frequency.setTargetAtTime(on ? 650 : 20000, ac.currentTime, on ? 0.03 : 0.25); }
export function setVolume(v) {
  Object.assign(vol, v); if (!ac) return;
  master.gain.setTargetAtTime(0.8 * vol.master, ac.currentTime, 0.05); sfx.gain.setTargetAtTime(vol.sfx, ac.currentTime, 0.05); setMusic(musicOn);
}
export const tap = () => { const d = ac.createMediaStreamDestination(); master.connect(d); return d.stream; }; // test hook: record what the game plays
export const audioState = () => ac && ac.state;
export const suspend = () => ac && ac.suspend();
export const resume = () => ac && ac.resume();

function nz(t, dur, type, f, q, g, bus = B(), f2) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rand(0.85, 1.15);
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  const gn = ac.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(fl).connect(gn).connect(bus); s.start(t, rand(0, 0.8)); s.stop(t + dur + 0.05);
}
function tn(t, f, dur, g, type = 'sine', bus = B(), f2) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
const now = () => ac.currentTime;

const SYN = {
  glass(i = 1) { if (!ac) return; const t = now(); nz(t, 0.5, 'highpass', 2500, 0.7, 0.8 * i); nz(t, 0.08, 'bandpass', 5000, 1, i); tn(t, 95, 0.12, 0.6 * i, 'sine', B(), 45);
    for (let k = 0; k < 9; k++) tn(t + rand(0, 0.4), rand(2600, 7000), rand(0.06, 0.3), 0.08 * i); },
  ceramic(i = 1) { if (!ac) return; const t = now(); nz(t, 0.32, 'bandpass', 1700, 0.8, 0.9 * i); nz(t, 0.06, 'highpass', 3000, 0.5, 0.7 * i); tn(t, 140, 0.13, 0.7 * i, 'sine', B(), 55);
    for (let k = 0; k < 5; k++) tn(t + rand(0, 0.2), rand(1200, 2800), rand(0.04, 0.14), 0.07 * i, 'triangle'); },
  electronics(i = 1) { if (!ac) return; const t = now(); nz(t, 0.4, 'bandpass', 800, 0.6, i); nz(t, 0.25, 'lowpass', 500, 0.5, 0.9 * i); tn(t, 85, 0.28, i, 'sine', B(), 38);
    for (const f of [310, 517, 823, 1290]) tn(t, f * rand(0.95, 1.05), 0.45, 0.03 * i, 'square');
    for (let k = 0; k < 6; k++) nz(t + rand(0.05, 0.4), 0.04, 'highpass', 4000, 1, 0.35 * i);
    nz(t + 0.02, 0.3, 'highpass', 6000, 0.7, 0.25 * i); },
  wood(i = 1) { if (!ac) return; const t = now(); nz(t, 0.28, 'lowpass', 900, 0.7, i); nz(t, 0.07, 'bandpass', 2600, 1.5, 0.7 * i); tn(t, 110, 0.2, 0.9 * i, 'sine', B(), 50);
    for (let k = 0; k < 3; k++) nz(t + rand(0.05, 0.2), 0.05, 'bandpass', 1800, 2, 0.4 * i); },
  stone(i = 1) { if (!ac) return; const t = now(); nz(t, 0.45, 'lowpass', 700, 0.6, i); tn(t, 70, 0.3, i, 'sine', B(), 35);
    for (let k = 0; k < 8; k++) nz(t + rand(0.03, 0.4), 0.05, 'bandpass', rand(900, 2500), 2, 0.3 * i); },
  plastic(i = 1) { if (!ac) return; const t = now(); nz(t, 0.18, 'bandpass', 1300, 1.2, 0.9 * i); tn(t, 160, 0.12, 0.6 * i, 'sine', B(), 70);
    for (let k = 0; k < 3; k++) nz(t + rand(0.02, 0.15), 0.03, 'highpass', 3000, 1, 0.3 * i); },
  photo(i = 1) { SYN.wood(i * 0.8); SYN.plastic(i * 0.5); },
  metal(i = 1) { if (!ac) return; const t = now(); nz(t, 0.05, 'highpass', 2000, 0.8, 0.6 * i);
    for (const f of [523, 1187, 1873, 2711, 3402]) tn(t, f * rand(0.97, 1.03), rand(0.5, 1.2), 0.07 * i); tn(t, 180, 0.2, 0.5 * i); },
  thud(kind, i = 1) { if (!ac) return; if (kind === 'metal') return SYN.metal(i); const t = now();
    tn(t, kind === 'electronics' ? 120 : 200, 0.14, 0.7 * i, 'sine', B(), 55); nz(t, 0.1, 'bandpass', kind === 'glass' ? 3200 : 900, 1, 0.5 * i);
    if (kind === 'electronics') for (const f of [420, 690, 1100]) tn(t, f, 0.25, 0.03 * i, 'square'); },
  whoosh(heavy) { if (!ac) return; nz(now(), heavy ? 0.35 : 0.22, 'bandpass', 250, 1.4, 0.35, B(), heavy ? 900 : 1700); },
  throw() { if (!ac) return; nz(now(), 0.3, 'bandpass', 400, 1.2, 0.3, B(), 2400); },
  grab() { if (!ac) return; const t = now(); tn(t, 300, 0.08, 0.15, 'triangle'); tn(t + 0.05, 450, 0.08, 0.12, 'triangle'); },
  clink(kind, i = 1) { if (!ac) return; const t = now();
    if (kind === 'glass' || kind === 'ceramic') tn(t, rand(2200, 4200), 0.07, 0.06 * i);
    else if (kind === 'metal') tn(t, rand(900, 1800), 0.25, 0.05 * i);
    else nz(t, 0.05, 'lowpass', 600, 1, 0.3 * i); },
  rage() { if (!ac) return; const t = now(); tn(t, 60, 0.9, 0.9, 'sawtooth', B(), 220); nz(t, 0.6, 'lowpass', 300, 1, 0.8, B(), 3000); },
  restock() { if (!ac) return; const t = now(); tn(t, 440, 0.1, 0.15, 'square'); tn(t + 0.1, 660, 0.15, 0.15, 'square'); },
  unlock() { if (!ac) return; const t = now(); [523, 659, 784, 1047].forEach((f, k) => tn(t + k * 0.09, f, 0.25, 0.15, 'square')); },
  buzzer() { if (!ac) return; const t = now(); tn(t, 110, 0.9, 0.5, 'sawtooth'); tn(t, 116, 0.9, 0.4, 'sawtooth'); },
};

// recorded CC0 samples (assets/sounds, see CREDITS.txt); generated sounds are the fallback until they load
const SETS = { glass: 7, glasshit: 2, ceramic: 5, crash: 3, wood: 4, stone: 3, metal: 6, metalfall: 5, rockfall: 9, woodfall: 2, thud: 3, punch: 5, slap: 5, clink: 5, debris: 4, plastic: 5, stepwood: 3, stepstone: 1, crack: 5, zap: 1, splash: 2, spray: 1, bag: 6, type: 1, door: 2, keys: 2 };
const bufs = {};
function loadSamples() {
  for (const [set, n] of Object.entries(SETS)) for (let i = 0; i < n; i++)
    fetch(`assets/sounds/${set}_${i}.mp3`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => (bufs[set] ??= []).push(d)).catch(() => {});
}
const has = k => bufs[k] && bufs[k].length;
function smp(set, gain = 1, rate = 1, delay = 0) {
  if (!ac || !has(set)) return false;
  const s = ac.createBufferSource(), l = bufs[set]; s.buffer = l[Math.floor(Math.random() * l.length)]; s.playbackRate.value = rate * rand(0.92, 1.08);
  const g = ac.createGain(); g.gain.value = gain; s.connect(g).connect(B()); s.start(ac.currentTime + delay); return true;
}
function tinkle(n, i) { const t = now(); for (let k = 0; k < n; k++) tn(t + rand(0.05, 0.45), rand(3000, 7000), rand(0.05, 0.2), 0.035 * i); }
// Break sounds take a level and a pitch rate: main.js sets both from the object's size (small = higher and quieter).
export const SFX = {
  ...SYN,
  glass(i = 1, r = 1) { if (!smp('glass', i, r)) return SYN.glass(i); smp('glass', 0.5 * i, r * 1.12, 0.03); smp('debris', 0.5 * i, r, 0.12); },
  ceramic(i = 1, r = 1) { if (!smp('ceramic', i, r)) return SYN.ceramic(i); smp('crash', 0.35 * i, 1.3 * r); },
  electronics(i = 1, r = 1) { if (!smp('crash', 0.8 * i, r)) return SYN.electronics(i); smp('glass', 0.6 * i, 0.9 * r, 0.02); smp('plastic', 0.6 * i, r, 0.04); smp('debris', 0.4 * i, 0.9, 0.2); const t = now(); for (let k = 0; k < 4; k++) nz(t + rand(0.05, 0.35), 0.04, 'highpass', 4000, 1, 0.2 * i); },
  wood(i = 1, r = 1) { smp('wood', i, r) || SYN.wood(i); },
  stone(i = 1, r = 1) { smp('stone', i, r) || SYN.stone(i); },
  plastic(i = 1, r = 1) { smp('plastic', i, r) || SYN.plastic(i); },
  explosive(i = 1) { smp('metal', i, 0.7); },
  photo(i = 1) { if (!smp('wood', 0.7 * i, 1.2)) return SYN.photo(i); smp('slap', 0.4 * i, 1.3); },
  metal(i = 1, r = 1) { smp('metal', i, r) || SYN.metal(i); },
  thud(kind, i = 1, r = 1) { const k = kind === 'metal' ? 'metal' : kind === 'glass' || kind === 'ceramic' ? 'glasshit' : 'thud'; smp(k, i, r) || SYN.thud(kind, i); },
  clink(kind, i = 1) { SFX.land(kind, i); },
  // a piece of debris landing or two things knocking together
  land(kind, i = 1) {
    const ok = kind === 'glass' ? smp(Math.random() < 0.5 ? 'debris' : 'clink', 0.4 * i, rand(1, 1.5)) : kind === 'ceramic' ? smp('clink', 0.5 * i, rand(0.9, 1.3))
      : kind === 'metal' || kind === 'explosive' ? smp('metalfall', 0.45 * i) : kind === 'stone' ? smp('rockfall', 0.5 * i) : kind === 'wood' || kind === 'photo' ? smp('woodfall', 0.4 * i, rand(1, 1.4))
      : kind === 'clay' ? smp('punch', 0.25 * i, 0.6) : smp('plastic', 0.3 * i, rand(1.1, 1.5));
    if (!ok) SYN.clink(kind, i);
  },
  bag(i = 1, r = 1) { smp('bag', i, r) || SYN.thud('wood', i); }, // a dull, heavy hit, like punching a sandbag: the clay figure
  crack(i = 1, r = 1) { smp('crack', i, r) || SYN.wood(i); }, // wood splitting: tables and shelves giving way
  zap(i = 1) { if (!smp('zap', i, rand(0.9, 1.2))) return; smp('zap', 0.6 * i, rand(1.1, 1.4), 0.12); smp('zap', 0.35 * i, rand(0.8, 1), 0.3); }, // a light shorting out
  splash(i = 1) { smp('splash', i, rand(0.9, 1.1)); },
  body(i = 1) { if (!ac) return; tn(now(), 95, 0.22, 0.4 * i, 'sine', B(), 42); }, // the low thump of something big
  step(surface, crunch) {
    if (!ac) return; const soft = surface === 'carpet';
    smp(surface === 'wood' || soft ? 'stepwood' : 'stepstone', soft ? 0.18 : 0.28, soft ? rand(0.6, 0.72) : rand(0.8, 1.2)) || nz(now(), 0.06, 'lowpass', 400, 1, 0.1);
    if (crunch) smp('debris', 0.3, rand(1.2, 1.6));
  },
  ring() { if (!ac) return; const t = now(); tn(t, 4150, 3.2, 0.035, 'sine', ringBus); tn(t, 6230, 2.4, 0.015, 'sine', ringBus); }, // ears after a blast
  punch(i = 1) { smp('punch', i) || SYN.thud('wood', i); },
  kick(i = 1) { smp('punch', i, 0.75) || SYN.thud('wood', i); },
  slap(i = 1) { if (!ac) return; smp('slap', i, 1.3) || SYN.thud('plastic', i); nz(now(), 0.05, 'highpass', 2500, 0.7, 0.5 * i); },
  clay(i = 1) { if (!ac) return; smp('punch', 0.7 * i, rand(0.5, 0.62)); nz(now(), 0.22, 'lowpass', 700, 1, 0.5 * i, B(), 180); },
  boom() { if (!ac) return; const t = now(); nz(t, 1.4, 'lowpass', 1400, 0.7, 1.6, B(), 70); tn(t, 75, 0.9, 1.2, 'sine', B(), 28); nz(t, 0.12, 'highpass', 1500, 0.6, 0.8);
    smp('crash', 1, 0.6); smp('stone', 0.8, 0.7, 0.05); smp('debris', 0.6, 0.8, 0.3); },
  golden() { if (!ac) return; const t = now(); [1047, 1319, 1568, 2093, 2637].forEach((f, k) => { tn(t + k * 0.06, f, 0.35, 0.09, 'triangle'); tn(t + k * 0.06, f * 2, 0.2, 0.03); }); },
  coin() { if (!ac) return; const t = now(); tn(t, 1319, 0.08, 0.12, 'square'); tn(t + 0.07, 1760, 0.35, 0.12, 'square'); },
  // cartoon voice for the clay figure: a buzzy source through two vowel formants
  voice(kind = 'oof') {
    if (!ac) return; const t = now(), r = rand(0.85, 1.2);
    const [a, b, dur, f1, f2] = { oof: [170, 105, 0.28, 450, 800], ow: [300, 190, 0.38, 750, 1200], groan: [150, 80, 1.3, 520, 860], boss: [95, 60, 0.6, 400, 700] }[kind];
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(a * r, t); o.frequency.exponentialRampToValueAtTime(b * r, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.03); g.gain.setValueAtTime(0.9, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const f of [f1, f2]) { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 5; o.connect(bp).connect(g); }
    g.connect(B()); o.start(t); o.stop(t + dur + 0.05);
  },
};

// heavy loop: kick, snare, hats, grungy bass
const BASS = [41.2, 41.2, 0, 41.2, 49, 0, 41.2, 55, 41.2, 41.2, 0, 41.2, 61.7, 0, 55, 49];
function musicTick() {
  if (!ac || !musicOn || !playing) return;
  const step = 60 / 132 / 2;
  if (nextBeat < ac.currentTime) nextBeat = ac.currentTime + 0.05;
  while (nextBeat < ac.currentTime + 0.15) {
    const t = nextBeat, i = beat % 16;
    if (musicStyle === 'calm') { // slow pad chords and a soft pluck, no drums
      const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]], ch = chords[Math.floor(beat / 16) % 4];
      if (i === 0) ch.forEach(f => { tn(t, f, step * 15, 0.05, 'triangle', music); tn(t, f / 2, step * 15, 0.04, 'sine', music); });
      if (i % 4 === 2 && Math.random() < 0.6) tn(t, ch[Math.floor(Math.random() * 3)] * 2, 0.6, 0.04, 'sine', music);
      nextBeat += step; beat++; continue;
    }
    if (i % 4 === 0 || i === 10) tn(t, 150, 0.22, 0.9, 'sine', music, 40);
    if (i % 8 === 4) { nz(t, 0.16, 'bandpass', 1800, 0.8, 0.6, music); tn(t, 190, 0.08, 0.3, 'triangle', music); }
    if (i % 2 === 1) nz(t, 0.04, 'highpass', 7500, 0.7, 0.18, music);
    if (BASS[i]) { const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = BASS[i] * 2;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(200, t + step); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.95);
      o.connect(fl).connect(g).connect(music); o.start(t); o.stop(t + step); }
    nextBeat += step; beat++;
  }
}
export function setMusic(on, isPlaying = playing) {
  musicOn = on; playing = isPlaying;
  if (ac) music.gain.setTargetAtTime(on && isPlaying ? 0.32 * vol.music : 0, ac.currentTime, 0.2);
}

// looping ambience per scene
function loopNoise(type, f, q, g) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const gn = ac.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(amb); s.start(); ambNodes.push(s); return fl;
}
function loopTone(f, g, type = 'sine') { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const gn = ac.createGain(); gn.gain.value = g; o.connect(gn).connect(amb); o.start(); ambNodes.push(o); }
// a recording heard from somewhere else in the room: softened, off to one side, optionally just a slice of it
function far(set, g, o = {}) {
  if (!has(set)) return; const l = bufs[set], b = l[Math.floor(Math.random() * l.length)], t = now();
  const s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = o.rate || rand(0.95, 1.05);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 2800;
  const pan = ac.createStereoPanner(); pan.pan.value = rand(-0.8, 0.8);
  const gn = ac.createGain(); gn.gain.value = g;
  s.connect(lp).connect(pan).connect(gn).connect(amb);
  const off = o.dur ? rand(0, Math.max(0, b.duration - o.dur)) : 0;
  if (o.dur) { gn.gain.setValueAtTime(g, t + o.dur - 0.15); gn.gain.linearRampToValueAtTime(0, t + o.dur); }
  s.start(t, off, o.dur || undefined); ambNodes.push(s);
}
export function startAmbience(kind) {
  stopAmbience(); if (!ac || !kind) return;
  const every = (ms, fn) => ambTimers.push(setInterval(() => { if (Math.random() < 0.5) fn(now()); }, ms));
  const tick = (ms, fn) => ambTimers.push(setInterval(fn, ms));
  if (kind === 'haunted') { loopNoise('lowpass', 300, 0.5, 0.25); loopTone(55, 0.04, 'triangle'); loopTone(58.3, 0.03, 'triangle');
    every(4000, t => { if (Math.random() < 0.5) nz(t, 1.2, 'bandpass', rand(300, 600), 8, 0.25, amb, rand(200, 900)); else tn(t, rand(180, 260), 1.5, 0.05, 'sawtooth', amb, rand(90, 140)); }); }
  if (kind === 'abandoned') { const w = loopNoise('bandpass', 500, 0.8, 0.22); every(1800, t => tn(t, rand(1800, 2600), 0.08, 0.05, 'sine', amb));
    tick(2500, () => w.frequency.setTargetAtTime(rand(300, 800), now(), 1.5)); }
  if (kind === 'office') { // soft air, someone typing a few desks over, doors, keys, mugs set down, footsteps on carpet
    loopNoise('lowpass', 700, 0.3, 0.025);
    every(3500, () => far('type', rand(0.25, 0.4), { dur: rand(1.2, 3), lp: 3500 }));
    every(14000, () => far('door', 0.3, { lp: 1500, rate: rand(0.85, 1) }));
    every(11000, () => far('keys', 0.14, { lp: 4000 }));
    every(8000, () => far('clink', 0.12, { lp: 3000 }));
    every(12000, () => { const n = 3 + Math.floor(rand(0, 4)); for (let k = 0; k < n; k++) setTimeout(() => far('stepwood', 0.12, { lp: 900, rate: rand(0.6, 0.7) }), k * 520); }); }
  if (kind === 'kitchen') { loopTone(60, 0.025, 'sawtooth'); loopNoise('lowpass', 250, 0.5, 0.05); every(3000, t => tn(t, rand(500, 900), 0.06, 0.03, 'sine', amb)); }
  if (kind === 'apartment') { loopTone(50, 0.02, 'sawtooth'); loopNoise('lowpass', 220, 0.5, 0.08); // fridge hum and traffic outside
    every(7000, t => nz(t, 2.5, 'bandpass', rand(250, 450), 0.8, 0.08, amb, rand(150, 250))); }
  if (kind === 'caryard') { const w = loopNoise('bandpass', 350, 0.6, 0.25); loopNoise('lowpass', 150, 0.4, 0.12); tick(3000, () => w.frequency.setTargetAtTime(rand(250, 600), now(), 2));
    every(6000, t => nz(t, 2, 'lowpass', 400, 0.7, 0.12, amb, 150)); }
}
export function stopAmbience() { for (const n of ambNodes) { try { n.stop(); } catch (e) {} } ambNodes = []; ambTimers.forEach(clearInterval); ambTimers = []; }
