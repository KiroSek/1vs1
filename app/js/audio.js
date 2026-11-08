// Fully synthesized audio (no sound files needed)
let ctx, master, noiseBuf, vol = 0.7, started = false;

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function resume() { init(); if (ctx.state !== 'running') ctx.resume(); if (!started) { started = true; ambient(); } }
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }

function noise(dur, type, f0, f1, gain, q = 1) {
  if (!ctx) return; const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, gain, type = 'sine', slideTo) {
  if (!ctx) return; const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export const sfx = {
  swing(heavy) { noise(heavy ? 0.45 : 0.25, 'bandpass', heavy ? 500 : 900, heavy ? 2200 : 3500, heavy ? 0.5 : 0.35, 1.5); },
  clang() { noise(0.12, 'highpass', 3000, 6000, 0.6); [2100, 3300, 4700, 6100].forEach((f, i) => tone(f * (1 + Math.random() * .03), 0.5 - i * 0.07, 0.16, 'square')); tone(900, 0.2, 0.2, 'triangle'); },
  block() { noise(0.1, 'bandpass', 2500, 1500, 0.5); [1500, 2300, 3100].forEach((f, i) => tone(f, 0.28 - i * .05, 0.12, 'square')); tone(200, 0.12, 0.35, 'sine', 90); },
  parry() {
    noise(0.1, 'highpass', 3500, 9000, 0.9); noise(0.25, 'bandpass', 5000, 2500, 0.5, 2);
    [2637, 3951, 5274, 7040, 9100].forEach((f, i) => { tone(f, 1.4 - i * 0.15, 0.17, 'sine'); tone(f * 1.003, 1.0 - i * 0.12, 0.08, 'sine'); });
    tone(1200, 0.3, 0.25, 'square', 600); tone(110, 0.3, 0.7, 'sine', 45);
    setTimeout(() => { [3951, 5274].forEach(f => tone(f, 0.6, 0.07, 'sine')); }, 90);
  },
  hit(heavy) { noise(heavy ? 0.3 : 0.18, 'lowpass', 1800, 200, heavy ? 1 : 0.7); tone(heavy ? 90 : 130, 0.25, 0.6, 'sine', 45); noise(0.06, 'highpass', 2500, 5000, 0.35); },
  dodge() { noise(0.28, 'bandpass', 400, 1200, 0.22, 0.8); },
  broken() { [1800, 1400, 1000, 700].forEach((f, i) => setTimeout(() => tone(f, 0.5, 0.14, 'triangle', f * 0.5), i * 40)); noise(0.5, 'highpass', 5000, 1500, 0.3); },
  deathblow() { sfx.swing(true); setTimeout(() => { noise(0.5, 'lowpass', 3000, 100, 1); tone(60, 0.7, 0.9, 'sine', 25); tone(1200, 0.6, 0.15, 'sawtooth', 200); }, 160); },
  step() { noise(0.07, 'lowpass', 500, 200, 0.12); },
  ui() { tone(520, 0.08, 0.08, 'triangle'); },
};

function ambient() {
  // wind
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(g.gain); lfo.start();
  s.connect(f); f.connect(g); g.connect(master); s.start();
  // sparse koto-like plucks, pentatonic (in-sen scale)
  const scale = [293.66, 311.13, 392, 440, 466.16, 587.33, 622.25];
  const pluck = () => {
    const base = scale[Math.random() * scale.length | 0];
    if (ctx.state === 'running') { tone(base, 2.2, 0.05, 'triangle'); tone(base * 2, 1.2, 0.02, 'sine'); tone(base / 2, 3, 0.04, 'sine'); }
    setTimeout(pluck, 1800 + Math.random() * 4200);
  };
  pluck();
}
