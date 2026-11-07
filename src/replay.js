// Records the game in short back-to-back clips and keeps the ones around your best smash
// (the most points in 1.5 seconds). At the end it plays them back in slow motion and can save
// that slow-motion replay as a video file. Does nothing in browsers without MediaRecorder.

const SEG = 4000;
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

export function createReplay(canvas) {
  const type = canvas.captureStream && window.MediaRecorder ? TYPES.find(t => MediaRecorder.isTypeSupported(t)) : null;
  const api = { supported: !!type, best: null, clip: null };
  let stream = null, rec = null, timer = null, cur = null, prev = null, events = [], stopping = null;

  function startSeg() {
    const seg = { start: performance.now(), peak: 0, peakAt: 0, prev, blob: null }, chunks = [];
    const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5e6 });
    r.ondataavailable = e => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      seg.blob = new Blob(chunks, { type });
      if (seg.peak > 0 && (!api.best || seg.peak > api.best.peak)) api.best = { peak: seg.peak, peakAt: seg.peakAt, a: seg.prev && seg.prev.blob, b: seg.blob };
      seg.prev = null; prev = seg;
      if (stopping && r === rec) stopping();
    };
    r.start(); rec = r; cur = seg;
  }

  api.start = () => {
    if (!type) return;
    api.best = null; api.clip = null; prev = null; events = [];
    try { stream = canvas.captureStream(30); } catch (e) { return; }
    startSeg();
    timer = setInterval(() => { const old = rec; startSeg(); old.stop(); }, SEG);
  };

  // call with the points from each scoring moment
  api.mark = pts => {
    if (!cur) return;
    const now = performance.now(); events.push([now, pts]); events = events.filter(e => now - e[0] < 1500);
    const sum = events.reduce((a, e) => a + e[1], 0);
    if (sum > cur.peak) { cur.peak = sum; cur.peakAt = now - cur.start; }
  };

  api.stop = () => new Promise(res => {
    clearInterval(timer); timer = null;
    if (!rec || rec.state === 'inactive') return res();
    stopping = () => { stopping = null; stream.getTracks().forEach(t => t.stop()); cur = null; res(); };
    rec.stop();
  });

  // play the best moment into `out` (a canvas) at slow speed, recording the result for download
  api.play = (out, label) => new Promise(res => {
    const b = api.best; if (!b) return res(false);
    const clips = b.peakAt < 1500 && b.a ? [b.a, b.b] : [b.b];
    const g = out.getContext('2d'), vid = document.createElement('video'); vid.muted = true; vid.playsInline = true;
    let i = 0, raf = 0, outRec = null, outChunks = [];
    if (!api.clip && out.captureStream) {
      outRec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 5e6 });
      outRec.ondataavailable = e => e.data.size && outChunks.push(e.data);
      outRec.onstop = () => { api.clip = new Blob(outChunks, { type }); res(true); };
    }
    const draw = () => {
      if (vid.readyState >= 2) {
        const s = Math.min(out.width / vid.videoWidth, out.height / vid.videoHeight) || 1, w = vid.videoWidth * s, h = vid.videoHeight * s;
        g.fillStyle = '#140d1f'; g.fillRect(0, 0, out.width, out.height); g.drawImage(vid, (out.width - w) / 2, (out.height - h) / 2, w, h);
        g.font = `${Math.round(out.height * 0.07)}px Bungee, Impact, sans-serif`; g.textAlign = 'left'; g.lineWidth = 6; g.strokeStyle = '#140d1f';
        g.strokeText('BEST SMASH', 20, out.height * 0.12); g.fillStyle = '#ffc531'; g.fillText('BEST SMASH', 20, out.height * 0.12);
        g.font = `${Math.round(out.height * 0.045)}px Bungee, Impact, sans-serif`; g.strokeText(label, 20, out.height * 0.2); g.fillStyle = '#fff7ea'; g.fillText(label, 20, out.height * 0.2);
        g.textAlign = 'right'; g.strokeText('SMASHROOM', out.width - 20, out.height - 20); g.fillStyle = '#ff4f9a'; g.fillText('SMASHROOM', out.width - 20, out.height - 20);
      }
      raf = requestAnimationFrame(draw);
    };
    const next = () => {
      if (i >= clips.length) { cancelAnimationFrame(raf); URL.revokeObjectURL(vid.src); if (outRec && outRec.state === 'recording') outRec.stop(); else res(true); return; }
      if (vid.src) URL.revokeObjectURL(vid.src);
      vid.src = URL.createObjectURL(clips[i++]);
      vid.onloadeddata = () => { vid.playbackRate = 0.5; vid.play().catch(() => next()); };
    };
    vid.onended = next; vid.onerror = next;
    if (outRec) outRec.start();
    raf = requestAnimationFrame(draw); next();
  });

  api.download = () => {
    if (!api.clip) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(api.clip);
    a.download = `smashroom-best-smash.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  return api;
}
