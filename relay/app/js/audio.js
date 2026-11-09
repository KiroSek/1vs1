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

// positional playback: sfx.at() sets PAN (stereo -1..1) and GAINK (distance attenuation) for the calls inside it
const PAN = { v: 0, k: 1 };
function out(node, wet = 0.3) { let n = node; if (PAN.k !== 1) { const g = ctx.createGain(); g.gain.value = PAN.k; n.connect(g); n = g; } if (PAN.v) { const p = ctx.createStereoPanner(); p.pan.value = PAN.v; n.connect(p); n = p; } n.connect(dry); if (wet > 0) { const g = ctx.createGain(); g.gain.value = wet; n.connect(g); g.connect(verb); } }
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

// ---------- positional helpers ----------
sfx.at = (name, pan, vol, ...args) => { if (!ctx || vol <= 0.01) return; PAN.v = Math.max(-1, Math.min(1, pan)); PAN.k = vol; try { sfx[name](...args); } finally { PAN.v = 0; PAN.k = 1; } };
// footsteps by surface (also used for the opponent's steps in Samurai Hunt)
sfx.foot = (surface = 'dirt', loud = 0.5) => {
  const v = 0.25 + loud * 0.5;
  if (surface === 'stone') { noise(0.05, 'bandpass', 2400, 1400, 0.35 * v, 2, 0.15); tone(180, 0.05, 0.08 * v, 'triangle', 120, 0.1); }
  else if (surface === 'wood') { tone(140, 0.09, 0.25 * v, 'sine', 90, 0.2); noise(0.05, 'lowpass', 900, 300, 0.25 * v, 1, 0.2); }
  else if (surface === 'water') { noise(0.22, 'bandpass', 900, 2600, 0.4 * v, 1.2, 0.2); noise(0.12, 'highpass', 3000, 5000, 0.15 * v, 1, 0.1, 0.05); }
  else if (surface === 'grass') { noise(0.22, 'highpass', 2500, 5500, 0.22 * v, 0.7, 0.1); }
  else if (surface === 'bamboo') { noise(0.18, 'highpass', 2000, 4500, 0.2 * v, 0.7, 0.1); tone(320 + Math.random() * 80, 0.25, 0.04 * v, 'triangle', 260, 0.3, 0.05); }
  else { noise(0.07, 'lowpass', 700, 200, 0.28 * v, 1, 0.1); }
};
sfx.rustle = (k = 1) => { noise(0.4, 'highpass', 2200, 5200, 0.25 * k, 0.6, 0.15); };
sfx.bell = () => { [196, 392.4, 588.6, 784.8].forEach((f, i) => tone(f * (1 + i * 0.003), 3.5 - i * 0.6, 0.18 / (i + 1), 'sine', null, 0.9)); };
sfx.cue = () => { noise(0.25, 'bandpass', 3000, 7000, 0.4, 4, 0.3); tone(880, 0.25, 0.08, 'triangle', 1320, 0.3); };   // sudden-danger sting (surprise attack wind-up)
sfx.breakWood = () => { noise(0.3, 'lowpass', 1600, 200, 0.7, 1, 0.3); for (let i = 0; i < 4; i++) tone(200 + Math.random() * 300, 0.12, 0.12, 'triangle', 90, 0.2, i * 0.04); };
sfx.breakPaper = () => { noise(0.35, 'bandpass', 1800, 600, 0.5, 0.8, 0.3); noise(0.6, 'lowpass', 600, 100, 0.25, 1, 0.3, 0.2); };
sfx.pebble = () => { tone(1800, 0.06, 0.1, 'triangle', 1200, 0.2); tone(1500, 0.05, 0.08, 'triangle', 1100, 0.2, 0.12); tone(1300, 0.05, 0.05, 'triangle', 1000, 0.2, 0.22); };
sfx.roar = () => { noise(1.4, 'bandpass', 300, 120, 0.9, 0.8, 0.6); tone(70, 1.4, 0.7, 'sawtooth', 45, 0.6); tone(105, 1.2, 0.3, 'sawtooth', 60, 0.6); };
sfx.wave = () => { [98, 147, 196].forEach((f, i) => tone(f, 2.2, 0.25, 'sine', null, 0.8, i * 0.08)); noise(0.5, 'lowpass', 500, 80, 0.8, 1, 0.6); };
sfx.revive2 = () => { [523, 659, 784].forEach((f, i) => tone(f, 0.8, 0.1, 'sine', null, 0.6, i * 0.09)); };

// ---------- adaptive music: 'off' | 'explore' | 'tension' | 'combat' | 'boss' ----------
const SCALE = [146.83, 155.56, 196, 220, 233.08, 293.66, 311.13, 392];
export const music = {
  state: 'off', bus: null, timer: null, beat: 0, next: 0,
  set(s) {
    if (!ctx || s === this.state) return; this.state = s;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = 0; this.bus.connect(master); this.drone(); this.timer = setInterval(() => this.tick(), 60); }
    const target = { off: 0, explore: 0.5, tension: 0.7, combat: 0.85, boss: 1 }[s] ?? 0;
    this.bus.gain.cancelScheduledValues(ctx.currentTime); this.bus.gain.setTargetAtTime(target, ctx.currentTime, 0.8);
    if (this.dg) { this.dg.gain.setTargetAtTime(s === 'off' ? 0 : s === 'explore' ? 0.05 : s === 'boss' ? 0.14 : 0.09, ctx.currentTime, 1); this.df.frequency.setTargetAtTime(s === 'boss' ? 420 : s === 'combat' ? 300 : 180, ctx.currentTime, 1); }
  },
  drone() {   // low string/brass drone under everything
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 73.4; o2.frequency.value = 73.4 * 1.498;
    const f = this.df = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; const g = this.dg = ctx.createGain(); g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.bus); o1.start(); o2.start();
  },
  hit(time, f0, dur, gain, noiseGain) {   // taiko-like drum
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, time); o.frequency.exponentialRampToValueAtTime(f0 * 0.45, time + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, time); g.gain.exponentialRampToValueAtTime(0.0001, time + dur); o.connect(g); g.connect(this.bus); o.start(time); o.stop(time + dur + 0.05);
    if (noiseGain) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; const ng = ctx.createGain(); ng.gain.setValueAtTime(noiseGain, time); ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.08); s.connect(nf); nf.connect(ng); ng.connect(this.bus); s.start(time, Math.random()); s.stop(time + 0.1); }
  },
  pluck(time, f, gain) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(gain, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.9); o.connect(g); g.connect(this.bus); o.start(time); o.stop(time + 1); },
  flute(time, f, dur, gain) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = f * 0.012; lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(gain, time + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, time + dur); o.connect(g); g.connect(this.bus); o.start(time); lfo.start(time); o.stop(time + dur + 0.1); lfo.stop(time + dur + 0.1); },
  tick() {
    if (!ctx || ctx.state !== 'running' || this.state === 'off') return;
    const now = ctx.currentTime; if (this.next < now) this.next = now + 0.05;
    const bpm = { explore: 50, tension: 72, combat: 118, boss: 136 }[this.state], spb = 60 / bpm;
    while (this.next < now + 0.25) {
      const t = this.next, b = this.beat++, s = this.state;
      if (s === 'explore') { if (b % 16 === 0 && Math.random() < 0.6) this.flute(t, SCALE[5 + (Math.random() * 3 | 0)], 3.5, 0.05); if (b % 4 === 2 && Math.random() < 0.4) this.pluck(t, SCALE[Math.random() * 5 | 0], 0.04); }
      else if (s === 'tension') { if (b % 2 === 0) this.hit(t, 70, 0.5, 0.25, 0); if (b % 2 === 1) this.hit(t, 62, 0.4, 0.14, 0); if (b % 8 === 4) this.pluck(t, SCALE[Math.random() * 3 | 0] * 2, 0.04); }
      else {
        const boss = s === 'boss', pat = boss ? [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1] : [1, 0, 0, 1, 1, 0, 1, 0];
        if (pat[b % pat.length]) this.hit(t, b % 4 === 0 ? 62 : 90, b % 4 === 0 ? 0.55 : 0.25, b % 4 === 0 ? 0.45 : 0.22, 0.12);
        if (b % 2 === 1) this.hit(t, 400, 0.05, 0.05, 0.06);
        if (b % 4 === 2 && Math.random() < 0.7) this.pluck(t, SCALE[Math.random() * SCALE.length | 0], boss ? 0.07 : 0.05);
      }
      this.next += spb / (s === 'explore' ? 1 : 2);
    }
  },
};