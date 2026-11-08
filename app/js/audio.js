// Synthesized audio (metal partials, filtered noise, generated hall reverb) with an optional layer of real
// CC0 samples dropped into /assets/sfx. Without sample files the synthesis alone is used.
let ctx, master, dry, verb, noiseBuf, vol = 0.7, started = false;
// ---- sample layer tuning ----
const SAMPLE_GAIN = 0.9;      // overall level of the recorded layer
const PITCH_VAR = 0.06;       // random playback-rate spread (±6%)
const SYNTH_UNDER = 0.6;      // synth level when a sample of that category plays on top
// file name (prefix) -> category. Own names (clash_1.ogg ...) and Kenney CC0 pack names both work.
const ALIAS = [
  [/^(swingheavy|swing_heavy)/i, 'swingheavy'], [/^(swing|whoosh|swoosh|knifeslice)/i, 'swing'],
  [/^(hitheavy|hit_heavy|impactpunch_heavy)/i, 'hitheavy'], [/^(hit|flesh|impactpunch_medium|impactsoft_heavy)/i, 'hit'],
  [/^(deflect|parry|impactbell|impactmetal_light)/i, 'deflect'], [/^(clash|impactmetal_heavy)/i, 'clash'], [/^(block|impactmetal_medium|impactplate_heavy)/i, 'block'],
];
const BANK = {};
async function loadSamples() {
  try {
    const list = await (await fetch('/sfx-list')).json();
    for (const f of list) {
      const a = ALIAS.find(([re]) => re.test(f)); if (!a) continue;
      try { const buf = await ctx.decodeAudioData(await (await fetch('/assets/sfx/' + encodeURIComponent(f))).arrayBuffer()); (BANK[a[1]] = BANK[a[1]] || []).push(buf); } catch (e) { console.warn('sfx decode failed', f); }
    }
  } catch (e) { /* no sample folder: synthesis only */ }
}
// play a random sample of a category; returns the synth scale to use underneath it
function sample(cat, gain = 1, wet = 0.3) {
  const b = BANK[cat]; if (!ctx || !b || !b.length) return 1;
  const s = ctx.createBufferSource(); s.buffer = b[Math.random() * b.length | 0]; s.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH_VAR;
  const g = ctx.createGain(); g.gain.value = gain * SAMPLE_GAIN; s.connect(g); out(g, wet); s.start();
  return SYNTH_UNDER;
}
export function sampleCounts() { const o = {}; for (const k in BANK) o[k] = BANK[k].length; return o; }

function impulse(sec, decay) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < ctx.sampleRate * 0.012 ? 0.3 : 1); }
  return b;
}
function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = vol;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);
  dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
  const conv = ctx.createConvolver(); conv.buffer = impulse(2.2, 3.2); verb = ctx.createGain(); verb.gain.value = 0.32; verb.connect(conv); conv.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadSamples();
}
export function resume() { init(); if (ctx.state !== 'running') ctx.resume(); if (!started) { started = true; ambient(); } }
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }

function out(node, wet = 0.3) { node.connect(dry); if (wet > 0) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(verb); } }
function noise(dur, type, f0, f1, gain, q = 1, wet = 0.25, delay = 0) {
  if (!ctx) return; const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.008, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); out(g, wet); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, gain, type = 'sine', slideTo, wet = 0.3, delay = 0, attack = 0.002) {
  if (!ctx) return; const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(g, wet); o.start(t); o.stop(t + dur + 0.05);
}
// struck steel: inharmonic partials (free bar modes ~ 1, 2.76, 5.40, 8.93) + sizzle
function metal(f0, dur, gain, wet = 0.4, delay = 0) {
  [[1, 1], [2.76, 0.6], [5.4, 0.38], [8.93, 0.22], [13.3, 0.12]].forEach(([m, a], i) => tone(f0 * m * (1 + (Math.random() - 0.5) * 0.01), dur * (1 - i * 0.13), gain * a, 'sine', null, wet, delay));
}
export const sfx = {
  swing(heavy) { const k = heavy ? sample('swingheavy', 0.8, 0.15) * (BANK.swingheavy ? 1 : sample('swing', 0.9, 0.15)) : sample('swing', 0.6, 0.15); noise(heavy ? 0.4 : 0.22, 'bandpass', heavy ? 600 : 1100, heavy ? 2600 : 4200, (heavy ? 0.55 : 0.4) * k, 2.2, 0.15); noise(heavy ? 0.3 : 0.18, 'highpass', 3000, 7000, 0.12 * k, 1, 0.1); },
  block(heavy) { const k = sample(heavy && BANK.clash ? 'clash' : 'block', heavy ? 1 : 0.75, 0.3); noise(0.05, 'highpass', 2500, 5000, 0.9 * k, 1, 0.2); metal(heavy ? 520 : 640, heavy ? 0.5 : 0.35, 0.22 * k, 0.35); tone(heavy ? 110 : 150, 0.18, 0.5, 'sine', 60, 0.1); noise(0.2, 'lowpass', 900, 200, 0.4, 1, 0.1); },
  deflect(heavy) {   // the bright "tiiing": high steel ring with long tail
    const k = sample('deflect', heavy ? 1 : 0.85, 0.5); sample('clash', 0.5, 0.4);
    noise(0.04, 'highpass', 4000, 9000, k, 1, 0.3); metal(1180, 1.6, 0.26, 0.6); metal(1767, 1.2, 0.14, 0.6, 0.004);
    tone(heavy ? 95 : 120, 0.3, 0.7, 'sine', 50, 0.2); noise(0.35, 'bandpass', 6000, 2500, 0.35, 3, 0.4);
  },
  clash() { sample('clash', 1, 0.5); noise(0.05, 'highpass', 3000, 8000, 1, 1, 0.3); metal(880, 1.1, 0.3, 0.5); metal(940, 1, 0.2, 0.5, 0.012); tone(90, 0.35, 0.7, 'sine', 45, 0.2); },
  hit(heavy) { const k = heavy && BANK.hitheavy ? sample('hitheavy', 1, 0.15) : sample('hit', heavy ? 1 : 0.75, 0.15); noise(heavy ? 0.28 : 0.16, 'bandpass', 1800, 500, (heavy ? 1 : 0.75) * k, 0.8, 0.15); noise(0.06, 'highpass', 4000, 8000, 0.3 * k, 1, 0.05); tone(heavy ? 85 : 120, 0.25, 0.6, 'sine', 40, 0.1); noise(0.35, 'lowpass', 600, 120, heavy ? 0.5 : 0.3, 1, 0.2, 0.02); },
  dodge() { noise(0.26, 'bandpass', 500, 1500, 0.28, 0.9, 0.1); noise(0.08, 'lowpass', 400, 150, 0.25, 1, 0.1, 0.2); },
  step() { noise(0.06, 'lowpass', 700, 200, 0.1, 1, 0.08); },
  broken() { metal(300, 0.9, 0.25, 0.6); [1600, 1200, 900, 640].forEach((f, i) => tone(f, 0.45, 0.12, 'triangle', f * 0.5, 0.4, i * 0.045)); noise(0.6, 'highpass', 5000, 1500, 0.3, 1, 0.4); },
  perilous() { tone(196, 1.6, 0.4, 'sine', null, 0.7); tone(392, 1.1, 0.18, 'sine', null, 0.7); tone(587, 0.7, 0.08, 'triangle', null, 0.7); noise(0.18, 'lowpass', 300, 80, 0.8, 1, 0.5); },
  mikiri() { noise(0.12, 'lowpass', 900, 120, 1, 1, 0.3); tone(70, 0.5, 0.8, 'sine', 35, 0.3); metal(700, 0.6, 0.2, 0.5, 0.02); },
  deathblow() { sfx.swing(true); noise(0.6, 'lowpass', 2500, 90, 1, 1, 0.4, 0.14); tone(55, 0.9, 0.9, 'sine', 25, 0.4, 0.14); noise(0.5, 'bandpass', 900, 300, 0.5, 0.7, 0.3, 0.2); },
  draw() { noise(0.45, 'bandpass', 2500, 6500, 0.25, 6, 0.4); metal(2100, 0.7, 0.07, 0.6, 0.35); },
  sheathe() { noise(0.35, 'bandpass', 5000, 2000, 0.2, 5, 0.3); noise(0.06, 'lowpass', 1200, 300, 0.6, 1, 0.3, 0.33); },
  revive() { [392, 587, 784, 1175].forEach((f, i) => tone(f, 2.2 - i * 0.3, 0.1, 'sine', null, 0.8, i * 0.12, 0.08)); noise(1.5, 'bandpass', 800, 3000, 0.12, 0.6, 0.8); },
  death() { tone(110, 2.5, 0.35, 'sine', 55, 0.8); tone(165, 2, 0.15, 'triangle', 82, 0.8); },
  victory() { [293.7, 392, 440, 587.3].forEach((f, i) => tone(f, 2.5, 0.12, 'triangle', null, 0.8, i * 0.18, 0.01)); },
  immune() { noise(0.12, 'lowpass', 420, 120, 0.45, 1, 0.15); tone(150, 0.12, 0.25, 'sine', 90, 0.1); },
  coin() { [1568, 2093].forEach((f, i) => tone(f, 0.25, 0.08, 'triangle', null, 0.4, i * 0.06)); },
  ui() { tone(620, 0.09, 0.07, 'triangle', null, 0.2); },
  begin() { tone(98, 2.2, 0.55, 'sine', null, 0.8); tone(196, 1.6, 0.2, 'sine', null, 0.8); noise(0.25, 'lowpass', 400, 60, 0.9, 1, 0.6); },
};

function ambient() {
  // night wind
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 350; f.Q.value = 0.5;
  const g = ctx.createGain(); g.gain.value = 0.04; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  s.connect(f); f.connect(g); g.connect(master); s.start();
  // crickets
  const cricket = () => { if (ctx.state === 'running') for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) tone(4200 + Math.random() * 300, 0.035, 0.012, 'sine', null, 0.5, i * 0.07); setTimeout(cricket, 700 + Math.random() * 2600); };
  cricket();
  // sparse koto plucks, in-sen scale
  const scale = [293.66, 311.13, 392, 440, 466.16, 587.33, 622.25];
  const pluck = () => { const b = scale[Math.random() * scale.length | 0]; if (ctx.state === 'running') { tone(b, 2.4, 0.045, 'triangle', null, 0.7); tone(b * 2, 1.2, 0.015, 'sine', null, 0.7); } setTimeout(pluck, 2500 + Math.random() * 5000); };
  pluck();
}
