// Synthesized audio (metal partials, filtered noise, generated hall reverb) with an optional layer of real
// CC0 samples dropped into /assets/sfx. Without sample files the synthesis alone is used.
let ctx, master, dry, verb, conv, noiseBuf, vol = 0.7, started = false;
// ---- designed sample bank: assets/sfx/<category>_<nn>.ogg (tools/sfxgen.py — 48 kHz mono, one mastering chain, the
// loudness hierarchy baked in with 6 dB headroom). Every category has several takes: playback never repeats the last
// take, adds a small controlled pitch/level spread, caps simultaneous voices, and a new steel contact damps the ring
// of the previous one so parry chains stay articulate. The synthesis below stays as the fallback for missing files.
const SAMPLE_GAIN = 1.6;      // gives back most of the bank's 6 dB headroom (the rest is mix headroom)
const ALIAS = [   // foreign packs dropped into assets/sfx (e.g. Kenney CC0 names) still map onto categories
  [/^(swingheavy|swing_heavy)/i, 'swingheavy'], [/^(swing|whoosh|swoosh|knifeslice)/i, 'swing'],
  [/^(hitheavy|hit_heavy|impactpunch_heavy)/i, 'hitheavy'], [/^(hit|flesh|impactpunch_medium|impactsoft_heavy)/i, 'hit'],
  [/^(deflect|parry|impactbell|impactmetal_light)/i, 'deflect'], [/^(clash|impactmetal_heavy)/i, 'clash'], [/^(block|impactmetal_medium|impactplate_heavy)/i, 'block'],
];
const OWN = /^([A-Za-z][A-Za-z0-9]*(?:_[a-z]+)?)_(\d+)\.(ogg|wav|mp3)$/;
const BANK = {}, LAST = {}, VOICES = {};
// category: [pitch spread, level spread dB, reverb send, max voices, choke group]
const PLAY = {
  deflect: [0.015, 1, 0.34, 3, 'steel'], clash: [0.02, 1, 0.3, 2, 'steel'], block: [0.03, 1.5, 0.22, 3, 'steel'],
  hit: [0.04, 1.5, 0.12, 3], hitheavy: [0.03, 1.5, 0.14, 2], hitarmor: [0.04, 1.5, 0.15, 3], deathblow: [0.015, 0.5, 0.28, 1], immune: [0.04, 1.5, 0.15, 2],
  swing: [0.05, 1.5, 0.06, 3], swingheavy: [0.04, 1.5, 0.08, 2], cloth: [0.06, 2, 0.04, 3], armorfoley: [0.06, 2, 0.04, 2],
  dodge: [0.05, 1.5, 0.06, 2], jump: [0.05, 1.5, 0.06, 2], land: [0.04, 1.5, 0.1, 2], slam: [0.03, 1, 0.22, 1], bodyfall: [0.04, 1, 0.18, 2],
  draw: [0.015, 1, 0.24, 2], sheathe: [0.015, 1, 0.2, 2], broken: [0.01, 0.5, 0.35, 1], perilous: [0, 0, 0.4, 1], mikiri: [0.03, 1, 0.24, 1],
  begin: [0, 0, 0.45, 1], victory: [0, 0, 0.45, 1], death: [0, 0, 0.45, 1], revive: [0, 0, 0.45, 1], bell: [0, 0, 0.5, 2], ui: [0.03, 1, 0.05, 2], coin: [0.02, 1, 0.2, 2],
};
const DEF = [0.04, 1.5, 0.18, 3];   // footsteps, world details
async function loadSamples() {
  try {
    const list = await (await fetch('/sfx-list')).json();
    await Promise.all(list.map(async f => {
      const m = OWN.exec(f), a = m ? [0, m[1]] : ALIAS.find(([re]) => re.test(f)); if (!a) return;
      try { const buf = await ctx.decodeAudioData(await (await fetch('/assets/sfx/' + encodeURIComponent(f))).arrayBuffer()); (BANK[a[1]] = BANK[a[1]] || []).push(buf); } catch (e) { console.warn('sfx decode failed', f); }
    }));
  } catch (e) { /* no sample folder: synthesis only */ }
}
// play one take of a category; false when the bank has none (the caller falls back to synthesis)
function play(cat, gain = 1, o = {}) {
  const b = BANK[cat]; if (!ctx || !b || !b.length) return false;
  const [pv, gv, wet, maxV, choke] = PLAY[cat] || DEF, now = ctx.currentTime, key = choke || cat;
  let k = Math.random() * b.length | 0; if (b.length > 1 && k === LAST[cat]) k = (k + 1 + (Math.random() * (b.length - 1) | 0)) % b.length; LAST[cat] = k;
  const list = VOICES[key] = (VOICES[key] || []).filter(v => v.end > now);
  if (choke) for (const v of list) { if (v.end - now > 0.25) { v.g.gain.setTargetAtTime(0, now + 0.03, 0.07); v.end = now + 0.4; } }   // damp the previous ring, keep its attack
  while (list.length >= maxV) { const v = list.shift(); v.g.gain.setTargetAtTime(0, now, 0.015); }   // voice cap: steal the oldest
  const s = ctx.createBufferSource(), rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * pv); s.buffer = b[k]; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain * SAMPLE_GAIN * Math.pow(10, (Math.random() * 2 - 1) * gv / 20);
  s.connect(g); out(g, (o.wet ?? wet) * SPACE.k); const at = now + (o.delay || 0); s.start(at);
  list.push({ g, end: at + b[k].duration / rate });
  if (o.duck) duck(o.duck);
  return true;
}
// the synthesis fallbacks below were written for an older sample layer; with the bank handled by play() they run alone at full level
const sample = () => 1;
export function sampleCounts() { const o = {}; for (const k in BANK) o[k] = BANK[k].length; return o; }
// music ducking: a few dB under the big steel/flesh moments, fast in and a slow, smooth return (no pumping on chains)
function duck(depth) { const g = music.duckG && music.duckG.gain; if (!g) return; const now = ctx.currentTime; hold(g, now); g.setTargetAtTime(Math.min(depth, g.value), now, 0.012); g.setTargetAtTime(1, now + 0.15, 0.55); }

// ---- acoustic space per location: its own impulse response and send level; combat sends stay small so hits stay readable
// [length s, decay power, start lowpass Hz, pre-delay s, early-reflection taps s, send scale]
const SPACES = {
  dojo: [1.4, 2.4, 4200, 0.008, [0.011, 0.016, 0.023, 0.031], 1.0],    // big wooden hall: dense early reflections, warm tail
  momiji: [1.2, 3.4, 5200, 0.05, [0.07, 0.11], 0.5],                     // open night field, distant tree line
  bamboo: [0.9, 2.8, 6500, 0.02, [0.028, 0.041, 0.055, 0.07], 0.6],     // stalks scatter short, bright reflections
  winter: [2.4, 3.8, 3200, 0.045, [0.09], 0.45],                         // vast cold valley, snow eats the highs
  town: [1.5, 3.0, 5200, 0.012, [0.065, 0.1, 0.15], 0.75],              // slap-back from house walls across the street
};
const SPACE = { name: '', k: 1 };
function impulse(sec, decay, lpHz = 6000, pre = 0, taps = []) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), p0 = Math.floor(pre * sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let y = 0;
    for (let i = p0; i < n; i++) {   // noise tail; the one-pole lowpass closes over time (air absorbs highs first)
      const u = (i - p0) / (n - p0), a = Math.exp(-2 * Math.PI * lpHz * (1 - 0.65 * u) / sr);
      y = (1 - a) * (Math.random() * 2 - 1) + a * y; d[i] = y * Math.pow(1 - u, decay) * 3 * (u < 0.01 ? u / 0.01 : 1);
    }
    taps.forEach((tp, k) => { const i = Math.floor(tp * sr) + (c ? 7 * (k + 1) : 0); if (i < n) d[i] += (k % 2 === c ? 0.55 : 0.35) * Math.pow(0.8, k); });
  }
  return b;
}
export function setSpace(name) {
  if (!ctx || SPACE.name === name || !SPACES[name]) return; SPACE.name = name; const [sec, dec, lpHz, pre, taps, k] = SPACES[name]; SPACE.k = k;
  const c = ctx.createConvolver(); c.buffer = impulse(sec, dec, lpHz, pre, taps); const old = conv; conv = c; verb.connect(c); c.connect(master);
  if (old) setTimeout(() => { try { verb.disconnect(old); old.disconnect(); } catch (e) { /* gone */ } }, 3000);
}
function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = vol;
  // output chain: drive -> fast peak limiter (its automatic make-up gain is undone, so quiet beds are NOT pumped up and
  // hits keep their margin over music) -> oversampled soft clipper as a safety net: never a hard digital clip
  const drive = ctx.createGain(); drive.gain.value = 0.9;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.0005; lim.release.value = 0.12;
  const comp = ctx.createGain(); comp.gain.value = 1 / Math.pow(1 / Math.pow(10, (-4 + 4 / 20) / 20), 0.6);   // = 1 / make-up gain of the limiter
  const clip = ctx.createWaveShaper(), cv = new Float32Array(2049); for (let i = 0; i < cv.length; i++) { const x = i / 1024 - 1, a = Math.abs(x); cv[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.29 * Math.tanh((a - 0.7) / 0.29)); }
  clip.curve = cv; clip.oversample = '4x';
  master.connect(drive); drive.connect(lim); lim.connect(comp); comp.connect(clip); clip.connect(ctx.destination);
  dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
  verb = ctx.createGain(); verb.gain.value = 0.5; setSpace('dojo');
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadSamples();
}
export function resume() { init(); if (ctx.state !== 'running') ctx.resume(); if (!started) { started = true; amb.play(); music.play(); } }
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }

// positional playback: sfx.at() sets PAN (stereo -1..1) and GAINK (distance attenuation) for the calls inside it
const PAN = { v: 0, k: 1 };
function out(node, wet = 0.3) { let n = node; if (PAN.k !== 1) { const g = ctx.createGain(); g.gain.value = PAN.k; n.connect(g); n = g; } if (PAN.v) { const p = ctx.createStereoPanner(); p.pan.value = PAN.v; n.connect(p); n = p; } n.connect(dry); if (wet > 0) { const g = ctx.createGain(); g.gain.value = wet; n.connect(g); g.connect(verb); } }
// every synthesized voice gets a little random pitch / level spread so repeated actions never sound identical
const VARY = { pitch: 0.06, gain: 0.15 }, vp = () => 1 + (Math.random() * 2 - 1) * VARY.pitch, vg = () => 1 + (Math.random() * 2 - 1) * VARY.gain;
function noise(dur, type, f0, f1, gain, q = 1, wet = 0.25, delay = 0) {
  if (!ctx) return; const t = ctx.currentTime + delay; { const k = vp(); f0 *= k; f1 *= k; gain *= vg(); }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.008, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); out(g, wet); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, gain, type = 'sine', slideTo, wet = 0.3, delay = 0, attack = 0.002) {
  if (!ctx) return; const t = ctx.currentTime + delay; { const k = vp(); freq *= k; if (slideTo) slideTo *= k; gain *= vg(); }
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(g, wet); o.start(t); o.stop(t + dur + 0.05);
}
// struck steel: inharmonic partials (free bar modes ~ 1, 2.76, 5.40, 8.93) + sizzle
function metal(f0, dur, gain, wet = 0.4, delay = 0) {
  f0 *= vp(); gain *= vg();
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
  slam() { noise(0.35, 'lowpass', 600, 80, 0.9, 1, 0.25); tone(58, 0.45, 0.6, 'sine', 32, 0.4); noise(0.08, 'bandpass', 1800, 900, 0.25, 2, 0.1); },   // heavy landing of an air attack
  dodge() { noise(0.26, 'bandpass', 500, 1500, 0.28, 0.9, 0.1); noise(0.08, 'lowpass', 400, 150, 0.25, 1, 0.1, 0.2); },
  // footstep by surface; k: loudness (sprint / distance)
  step(k = 1, surf = 'stone') {
    if (surf === 'wood') { noise(0.07, 'bandpass', 420, 260, 0.13 * k, 3, 0.12); tone(140, 0.06, 0.03 * k, 'sine', 90, 0.1); }   // hollow boards
    else if (surf === 'grass' || surf === 'dirt') { noise(0.09, 'highpass', 1800, 900, 0.05 * k, 0.7, 0.05); noise(0.05, 'lowpass', 500, 200, 0.06 * k, 1, 0.05); }
    else if (surf === 'snow') { noise(0.13, 'bandpass', 1300, 700, 0.09 * k, 1.5, 0.05); noise(0.05, 'highpass', 3500, 2500, 0.025 * k, 1, 0.03); }   // crunch
    else if (surf === 'water') { noise(0.18, 'bandpass', 900, 2200, 0.08 * k, 1.2, 0.2); }
    else if (surf === 'bamboo') { noise(0.08, 'bandpass', 2200, 1200, 0.05 * k, 1.5, 0.08); noise(0.06, 'lowpass', 600, 200, 0.06 * k, 1, 0.05); }
    else { noise(0.05, 'bandpass', 2000, 900, 0.07 * k, 2, 0.08); noise(0.06, 'lowpass', 700, 200, 0.08 * k, 1, 0.08); }   // stone / tiles
    if (k > 1.2) noise(0.04, 'bandpass', 2400, 1200, 0.03 * k, 2, 0.05);
  },
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
  const pluck = () => { const b = scale[Math.random() * scale.length | 0]; if (ctx.state === 'running' && !music.cur) { tone(b, 2.4, 0.045, 'triangle', null, 0.7); tone(b * 2, 1.2, 0.015, 'sine', null, 0.7); } setTimeout(pluck, 2500 + Math.random() * 5000); };
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
sfx.jump = () => sfx.dodge(); sfx.land = () => noise(0.12, 'lowpass', 500, 120, 0.4, 1, 0.1); sfx.bodyfall = () => sfx.slam();   // synth stand-ins

// ---------- sample-bank front-end: every event plays designed takes, layered where noted; synthesis = fallback ----------
const SYN = { ...sfx }, DEFL = { t: -9, n: 0 };
const BANKED = {
  swing: (heavy, armored) => play(heavy ? 'swingheavy' : 'swing') && (play(armored ? 'armorfoley' : 'cloth', heavy ? 1 : 0.75), true),   // blade air + body foley
  block: heavy => play('block', heavy ? 0.72 : 0.58, { rate: heavy ? 0.94 : 1, duck: 0.85 }),   // a plain block sits clearly under a perfect parry
  deflect(heavy) {   // perfect parry; a chain of deflects climbs a little in pitch, like the rhythm of a duel tightening
    const now = ctx ? ctx.currentTime : 0; DEFL.n = now - DEFL.t < 1.1 ? Math.min(DEFL.n + 1, 6) : 0; DEFL.t = now;
    const ok = play('deflect', heavy ? 1.1 : 1, { rate: (heavy ? 0.95 : 1) * (1 + 0.022 * DEFL.n), duck: 0.72 });
    if (ok && heavy) play('immune', 0.5, { rate: 0.85 });   // a heavy blow adds weight in the hands
    return ok;
  },
  clash: () => play('clash', 1, { duck: 0.66 }),
  hit: (heavy, armored) => armored ? play('hitarmor', heavy ? 0.95 : 0.85, { rate: heavy ? 0.93 : 1, duck: heavy ? 0.74 : 0.84 }) && (heavy && play('hitheavy', 0.35), true)
    : play(heavy ? 'hitheavy' : 'hit', 1, { duck: heavy ? 0.72 : 0.82 }),
  slam: () => play('slam', 1, { duck: 0.75 }),
  dodge: () => play('dodge') && (play('cloth', 0.6), true),
  jump: () => play('jump'), land: () => play('land', 0.55), bodyfall: () => play('bodyfall', 0.6, { duck: 0.88 }),
  step: (k = 1, surf = 'stone') => play('step_' + surf, k) || play('step_stone', k),
  foot: (surface = 'dirt', loud = 0.5) => play('step_' + surface, 0.5 + loud) || play('step_dirt', 0.5 + loud),
  broken: () => play('broken', 1, { duck: 0.62 }), perilous: () => play('perilous', 1, { duck: 0.7 }), mikiri: () => play('mikiri', 1, { duck: 0.7 }),
  deathblow: () => play('deathblow', 1, { duck: 0.55 }), immune: () => play('immune'),
  draw: () => play('draw'), sheathe: () => play('sheathe'),
  revive: () => play('revive'), death: () => play('death'), victory: () => play('victory'), begin: () => play('begin'),
  ui: () => play('ui'), coin: () => play('coin'), bell: () => play('bell'), cue: () => play('cue'), roar: () => play('roar', 1, { duck: 0.7 }), wave: () => play('wave'),
  rustle: (k = 1) => play('rustle', k), breakWood: () => play('breakWood'), breakPaper: () => play('breakPaper'), pebble: () => play('pebble'), revive2: () => play('revive2'),
};
for (const k in BANKED) { const f = BANKED[k]; sfx[k] = (...a) => { if (!f(...a) && SYN[k]) SYN[k](...a); }; }

// ---------- location soundtrack: three loop-aligned stems per theme (assets/music, made by tools/musicgen.py) ----------
// base = exploration bed; perc = combat drums; layer = combat ostinato / extra voices. Starting a fight never just turns
// the volume up: the drums swell in first, the extra layer enters on a later downbeat; when the fight ends the layer
// leaves first and the drums thin out after it, back to the calm bed.
const THEMES = { sakura: 'momiji', dojo: 'dojo', bamboo: 'bamboo', snow: 'winter', sv_glade: 'bamboo' };   // other maps (towns, valley, castle) -> 'town'
const BPM = { momiji: 84, dojo: 98, bamboo: 106, winter: 88, town: 110 };
export const themeFor = map => THEMES[map] || 'town';
const MIX = { off: [0, 0, 0], explore: [1, 0, 0], tension: [1, 0.45, 0], combat: [1, 0.9, 0.85], boss: [1, 1, 1] };
const STEMS = ['base', 'perc', 'layer'], LOADS = {};
let dec;
function loadTheme(name) {   // decoded at the files' own 32 kHz: ~a third less memory than at the context rate
  return LOADS[name] = LOADS[name] || Promise.all(STEMS.map(async st => {
    const a = await (await fetch(`/assets/music/${name}_${st}.ogg`)).arrayBuffer();
    dec = dec || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 32000); return dec.decodeAudioData(a);
  })).catch(e => { console.warn('music load failed', name, e); delete LOADS[name]; return null; });
}
const hold = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); } };
export const music = {
  state: 'off', want: 'town', cur: null, bus: null, duckG: null, vol: 0.5, lvl: [0, 0, 0],
  theme(name) { if (name === this.want) return; this.want = name; this.play(); },
  set(s) { if (s === this.state) return; this.state = s; this.play(); this.mix(); },
  setVolume(v) { this.vol = v; if (this.bus) this.bus.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
  async play() {
    if (!ctx) return;
    if (this.state === 'off') { if (this.cur) { this.fadeOut(this.cur); this.cur = null; } return; }
    if (this.cur && this.cur.name === this.want) return;   // already playing (or loading) this theme
    const slot = { name: this.want }, old = this.cur; this.cur = slot; this.lvl = [0, 0, 0];
    if (old) this.fadeOut(old);   // crossfade: the old theme leaves while the new one loads in
    for (const k in LOADS) if (k !== slot.name) delete LOADS[k];   // keep only the current theme decoded (the old one is freed once it stops)
    const bufs = await loadTheme(slot.name);
    if (this.cur !== slot || !bufs) return;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = this.vol; this.duckG = ctx.createGain(); this.bus.connect(this.duckG); this.duckG.connect(master); }
    const t = slot.t0 = ctx.currentTime + 0.1;
    slot.g = bufs.map(() => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus); return g; });
    slot.src = bufs.map((b, i) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(slot.g[i]); s.start(t); return s; });   // one start time -> the stems stay sample-locked forever
    this.mix();
  },
  fadeOut(slot) {
    if (!slot.g) return; const t = ctx.currentTime;
    slot.g.forEach(g => { hold(g.gain, t); g.gain.setTargetAtTime(0, t, 1.0); });
    setTimeout(() => slot.src.forEach(s => { try { s.stop(); } catch (e) { /* already stopped */ } }), 6000);
  },
  mix() {
    const c = this.cur; if (!ctx || !c || !c.g) return;
    const t = ctx.currentTime, m = MIX[this.state] || MIX.off, bar = 240 / (BPM[c.name] || 96);
    const nextBar = (min) => { const e = (t + min - c.t0) % bar; return t + min + (e > 0.02 ? bar - e : 0); };   // downbeat at least `min` s away
    const ramp = (i, v, at, tau) => { const p = c.g[i].gain; hold(p, t); p.setTargetAtTime(v, Math.max(t, at), tau); };
    const up = m[1] + m[2] > this.lvl[1] + this.lvl[2];
    ramp(0, m[0], t, this.lvl[0] ? 1.5 : 1.0);
    if (up) { ramp(1, m[1], t, 0.8); ramp(2, m[2], nextBar(1.2), 0.5); }   // drums swell in now, the extra voices join on a downbeat
    else { ramp(2, m[2], t, 1.0); ramp(1, m[1], nextBar(1.0), 1.6); }      // layer leaves first, drums thin out a bar later
    this.lvl = m.slice();
  },
};

// ---------- ambience per location: streamed stereo bed (assets/amb) + weather-driven rain layer + sparse details ----------
// details: [category, min gap s, max gap s, level] — scattered around the listener, never competing with combat
const AMB_DETAILS = {
  momiji: [['leafgust', 7, 16, 0.8], ['suzumushi', 5, 12, 0.7], ['farbell', 50, 100, 0.8], ['farwind', 18, 35, 0.7]],
  dojo: [['creak', 6, 15, 0.8], ['floorknock', 9, 22, 0.6]],
  bamboo: [['bambooknock', 5, 12, 0.9], ['bamboocreak', 8, 18, 0.8], ['leafgust', 10, 20, 0.6]],
  winter: [['snowcreak', 8, 18, 0.7], ['icecrack', 25, 50, 0.7], ['snowslide', 20, 40, 0.7], ['farwind', 14, 28, 0.8]],
  town: [['drip', 1.5, 4, 0.8], ['lantern', 7, 15, 0.7], ['creak', 10, 22, 0.6], ['hyoshigi', 40, 80, 0.7]],
};
const AMB_BUF = {};
function loadAmb(name) {
  return AMB_BUF[name] = AMB_BUF[name] || (async () => {
    const a = await (await fetch(`/assets/amb/${name}.ogg`)).arrayBuffer();
    dec = dec || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 32000); return dec.decodeAudioData(a);
  })().catch(e => { console.warn('ambience load failed', name, e); delete AMB_BUF[name]; return null; });
}
export const amb = {
  want: 'town', cur: null, bus: null, rainSlot: null, rainK: 0, windK: 1, next: {}, failed: false,
  set(name) { if (name === this.want) return; this.want = name; this.play(); },
  weather(kind) {   // rain layer follows the weather; wind lifts the bed a little
    const r = kind === 'rain' ? 1 : 0, w = kind === 'wind' ? 1.4 : 1; if (r === this.rainK && w === this.windK) return; this.rainK = r; this.windK = w;
    if (this.bus) { this.bus.gain.setTargetAtTime(0.9 * w, ctx.currentTime, 1.5); if (r) this.loop('rain', 'rainSlot', 1); else if (this.rainSlot) { this.fade(this.rainSlot); this.rainSlot = null; } }
  },
  async loop(name, key, gain) {
    if (this[key] && this[key].name === name) return; const slot = { name }, old = this[key]; this[key] = slot; if (old) this.fade(old);
    const buf = await loadAmb(name); if (this[key] !== slot) return;
    if (!buf) { if (key === 'cur' && !this.failed) { this.failed = true; ambient(); } return; }   // old synth night ambience as the fallback
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = buf.duration;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(gain, ctx.currentTime, 1.2); s.connect(g); g.connect(this.bus);
    s.start(ctx.currentTime, Math.random() * buf.duration); slot.s = s; slot.g = g;
  },
  fade(slot) { if (!slot.g) return; hold(slot.g.gain, ctx.currentTime); slot.g.gain.setTargetAtTime(0, ctx.currentTime, 1.2); setTimeout(() => { try { slot.s.stop(); } catch (e) { /* stopped */ } }, 6000); },
  play() {
    if (!ctx) return;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = 0.9; this.bus.connect(master); setInterval(() => this.tick(), 500); }
    this.loop(this.want, 'cur', 1); this.next = {}; if (this.rainK) this.loop('rain', 'rainSlot', 1);
    for (const k in AMB_BUF) if (k !== this.want && k !== 'rain') delete AMB_BUF[k];
  },
  tick() {   // sparse one-shot details at random places around the listener
    if (!ctx || ctx.state !== 'running' || !this.cur) return; const now = ctx.currentTime, list = AMB_DETAILS[this.want] || [];
    for (const [cat, a, b, lvl] of list) {
      if (this.next[cat] === undefined) { this.next[cat] = now + a * 0.5 + Math.random() * (b - a); continue; }
      if (now < this.next[cat]) continue; this.next[cat] = now + a + Math.random() * (b - a);
      PAN.v = Math.random() * 1.6 - 0.8; PAN.k = lvl * (0.45 + Math.random() * 0.55);
      try { play(cat, 1, { wet: 0.5 }); } finally { PAN.v = 0; PAN.k = 1; }
    }
    if (this.rainK && Math.random() < 0.6) { PAN.v = Math.random() * 1.8 - 0.9; PAN.k = 0.35 + Math.random() * 0.4; try { play('drip', 1, { wet: 0.4 }); } finally { PAN.v = 0; PAN.k = 1; } }
  },
};
