// All sound is synthesized in the browser: no audio files.
const rand = (a, b) => a + Math.random() * (b - a);
let ac, sfx, music, amb, noiseBuf, musicOn = true, playing = false, nextBeat = 0, beat = 0, ambNodes = [], ambTimers = [];

export function initAudio() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; comp.connect(ac.destination);
  const master = ac.createGain(); master.gain.value = 0.9; master.connect(comp);
  sfx = ac.createGain(); sfx.connect(master);
  music = ac.createGain(); music.gain.value = 0; music.connect(master);
  amb = ac.createGain(); amb.gain.value = 0.5; amb.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setInterval(musicTick, 50);
}
export const suspend = () => ac && ac.suspend();
export const resume = () => ac && ac.resume();

function nz(t, dur, type, f, q, g, bus = sfx, f2) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rand(0.85, 1.15);
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  const gn = ac.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(fl).connect(gn).connect(bus); s.start(t, rand(0, 0.8)); s.stop(t + dur + 0.05);
}
function tn(t, f, dur, g, type = 'sine', bus = sfx, f2) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
const now = () => ac.currentTime;

export const SFX = {
  glass(i = 1) { if (!ac) return; const t = now(); nz(t, 0.5, 'highpass', 2500, 0.7, 0.8 * i); nz(t, 0.08, 'bandpass', 5000, 1, i); tn(t, 95, 0.12, 0.6 * i, 'sine', sfx, 45);
    for (let k = 0; k < 9; k++) tn(t + rand(0, 0.4), rand(2600, 7000), rand(0.06, 0.3), 0.08 * i); },
  ceramic(i = 1) { if (!ac) return; const t = now(); nz(t, 0.32, 'bandpass', 1700, 0.8, 0.9 * i); nz(t, 0.06, 'highpass', 3000, 0.5, 0.7 * i); tn(t, 140, 0.13, 0.7 * i, 'sine', sfx, 55);
    for (let k = 0; k < 5; k++) tn(t + rand(0, 0.2), rand(1200, 2800), rand(0.04, 0.14), 0.07 * i, 'triangle'); },
  electronics(i = 1) { if (!ac) return; const t = now(); nz(t, 0.4, 'bandpass', 800, 0.6, i); nz(t, 0.25, 'lowpass', 500, 0.5, 0.9 * i); tn(t, 85, 0.28, i, 'sine', sfx, 38);
    for (const f of [310, 517, 823, 1290]) tn(t, f * rand(0.95, 1.05), 0.45, 0.03 * i, 'square');
    for (let k = 0; k < 6; k++) nz(t + rand(0.05, 0.4), 0.04, 'highpass', 4000, 1, 0.35 * i);
    nz(t + 0.02, 0.3, 'highpass', 6000, 0.7, 0.25 * i); },
  wood(i = 1) { if (!ac) return; const t = now(); nz(t, 0.28, 'lowpass', 900, 0.7, i); nz(t, 0.07, 'bandpass', 2600, 1.5, 0.7 * i); tn(t, 110, 0.2, 0.9 * i, 'sine', sfx, 50);
    for (let k = 0; k < 3; k++) nz(t + rand(0.05, 0.2), 0.05, 'bandpass', 1800, 2, 0.4 * i); },
  stone(i = 1) { if (!ac) return; const t = now(); nz(t, 0.45, 'lowpass', 700, 0.6, i); tn(t, 70, 0.3, i, 'sine', sfx, 35);
    for (let k = 0; k < 8; k++) nz(t + rand(0.03, 0.4), 0.05, 'bandpass', rand(900, 2500), 2, 0.3 * i); },
  plastic(i = 1) { if (!ac) return; const t = now(); nz(t, 0.18, 'bandpass', 1300, 1.2, 0.9 * i); tn(t, 160, 0.12, 0.6 * i, 'sine', sfx, 70);
    for (let k = 0; k < 3; k++) nz(t + rand(0.02, 0.15), 0.03, 'highpass', 3000, 1, 0.3 * i); },
  photo(i = 1) { SFX.wood(i * 0.8); SFX.plastic(i * 0.5); },
  metal(i = 1) { if (!ac) return; const t = now(); nz(t, 0.05, 'highpass', 2000, 0.8, 0.6 * i);
    for (const f of [523, 1187, 1873, 2711, 3402]) tn(t, f * rand(0.97, 1.03), rand(0.5, 1.2), 0.07 * i); tn(t, 180, 0.2, 0.5 * i); },
  thud(kind, i = 1) { if (!ac) return; if (kind === 'metal') return SFX.metal(i); const t = now();
    tn(t, kind === 'electronics' ? 120 : 200, 0.14, 0.7 * i, 'sine', sfx, 55); nz(t, 0.1, 'bandpass', kind === 'glass' ? 3200 : 900, 1, 0.5 * i);
    if (kind === 'electronics') for (const f of [420, 690, 1100]) tn(t, f, 0.25, 0.03 * i, 'square'); },
  whoosh(heavy) { if (!ac) return; nz(now(), heavy ? 0.35 : 0.22, 'bandpass', 250, 1.4, 0.35, sfx, heavy ? 900 : 1700); },
  throw() { if (!ac) return; nz(now(), 0.3, 'bandpass', 400, 1.2, 0.3, sfx, 2400); },
  grab() { if (!ac) return; const t = now(); tn(t, 300, 0.08, 0.15, 'triangle'); tn(t + 0.05, 450, 0.08, 0.12, 'triangle'); },
  clink(kind, i = 1) { if (!ac) return; const t = now();
    if (kind === 'glass' || kind === 'ceramic') tn(t, rand(2200, 4200), 0.07, 0.06 * i);
    else if (kind === 'metal') tn(t, rand(900, 1800), 0.25, 0.05 * i);
    else nz(t, 0.05, 'lowpass', 600, 1, 0.3 * i); },
  rage() { if (!ac) return; const t = now(); tn(t, 60, 0.9, 0.9, 'sawtooth', sfx, 220); nz(t, 0.6, 'lowpass', 300, 1, 0.8, sfx, 3000); },
  restock() { if (!ac) return; const t = now(); tn(t, 440, 0.1, 0.15, 'square'); tn(t + 0.1, 660, 0.15, 0.15, 'square'); },
  unlock() { if (!ac) return; const t = now(); [523, 659, 784, 1047].forEach((f, k) => tn(t + k * 0.09, f, 0.25, 0.15, 'square')); },
  buzzer() { if (!ac) return; const t = now(); tn(t, 110, 0.9, 0.5, 'sawtooth'); tn(t, 116, 0.9, 0.4, 'sawtooth'); },
};

// heavy loop: kick, snare, hats, grungy bass
const BASS = [41.2, 41.2, 0, 41.2, 49, 0, 41.2, 55, 41.2, 41.2, 0, 41.2, 61.7, 0, 55, 49];
function musicTick() {
  if (!ac || !musicOn || !playing) return;
  const step = 60 / 132 / 2;
  if (nextBeat < ac.currentTime) nextBeat = ac.currentTime + 0.05;
  while (nextBeat < ac.currentTime + 0.15) {
    const t = nextBeat, i = beat % 16;
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
  if (ac) music.gain.setTargetAtTime(on && isPlaying ? 0.32 : 0, ac.currentTime, 0.2);
}

// looping ambience per scene
function loopNoise(type, f, q, g) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const gn = ac.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(amb); s.start(); ambNodes.push(s); return fl;
}
function loopTone(f, g, type = 'sine') { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const gn = ac.createGain(); gn.gain.value = g; o.connect(gn).connect(amb); o.start(); ambNodes.push(o); }
export function startAmbience(kind) {
  stopAmbience(); if (!ac || !kind) return;
  const every = (ms, fn) => ambTimers.push(setInterval(() => { if (Math.random() < 0.5) fn(now()); }, ms));
  const tick = (ms, fn) => ambTimers.push(setInterval(fn, ms));
  if (kind === 'haunted') { loopNoise('lowpass', 300, 0.5, 0.25); loopTone(55, 0.04, 'triangle'); loopTone(58.3, 0.03, 'triangle');
    every(4000, t => { if (Math.random() < 0.5) nz(t, 1.2, 'bandpass', rand(300, 600), 8, 0.25, amb, rand(200, 900)); else tn(t, rand(180, 260), 1.5, 0.05, 'sawtooth', amb, rand(90, 140)); }); }
  if (kind === 'abandoned') { const w = loopNoise('bandpass', 500, 0.8, 0.22); every(1800, t => tn(t, rand(1800, 2600), 0.08, 0.05, 'sine', amb));
    tick(2500, () => w.frequency.setTargetAtTime(rand(300, 800), now(), 1.5)); }
  if (kind === 'office') { loopTone(120, 0.02, 'sawtooth'); loopNoise('lowpass', 400, 0.5, 0.06);
    every(9000, t => { for (let k = 0; k < 4; k++) { tn(t + k * 0.12, 1300, 0.08, 0.04, 'square', amb); tn(t + k * 0.12, 1600, 0.08, 0.03, 'square', amb); } }); }
  if (kind === 'kitchen') { loopTone(60, 0.025, 'sawtooth'); loopNoise('lowpass', 250, 0.5, 0.05); every(3000, t => tn(t, rand(500, 900), 0.06, 0.03, 'sine', amb)); }
  if (kind === 'caryard') { const w = loopNoise('bandpass', 350, 0.6, 0.25); loopNoise('lowpass', 150, 0.4, 0.12); tick(3000, () => w.frequency.setTargetAtTime(rand(250, 600), now(), 2));
    every(6000, t => nz(t, 2, 'lowpass', 400, 0.7, 0.12, amb, 150)); }
}
export function stopAmbience() { for (const n of ambNodes) { try { n.stop(); } catch (e) {} } ambNodes = []; ambTimers.forEach(clearInterval); ambTimers = []; }
