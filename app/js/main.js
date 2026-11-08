import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildArena } from './arena.js';
import { FX } from './fx.js';
import { Fighter } from './fighter.js';
import { AI } from './ai.js';
import { Net } from './net.js';
import * as audio from './audio.js';
const { sfx } = audio;

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const defaults = { quality: 'auto', diff: 1, sens: 1, vol: 0.7, invert: false, serverUrl: '', fps: false };
let S = { ...defaults };
try { Object.assign(S, JSON.parse(localStorage.getItem('kd-settings') || '{}')); } catch (e) { }
const save = () => { try { localStorage.setItem('kd-settings', JSON.stringify(S)); } catch (e) { } };

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
const arena = buildArena(scene, renderer, S.quality);
const fx = new FX(scene);
function gpuTier() {   // auto quality: discrete NVIDIA/AMD (e.g. Lenovo LOQ) -> high, Apple Silicon -> medium, others -> low
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'), r = (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/nvidia|geforce|rtx|radeon rx|radeon pro/.test(r)) return 'high'; if (/apple/.test(r)) return 'med'; return 'low'; } catch (e) { return 'med'; }
}
function applyQuality() {
  const q = S.quality === 'auto' ? gpuTier() : S.quality, dpr = window.devicePixelRatio || 1;
  G.q = q; G.prMax = q === 'low' ? Math.min(dpr, 0.8) : q === 'med' ? Math.min(dpr, 1.25) : Math.min(dpr, 1.5); G.pr = G.prMax;
  renderer.setPixelRatio(G.pr);
  arena.setQuality(q); fx.density = q === 'low' ? 0.5 : 1; arena.lamps.forEach(l => l.visible = q !== 'low');
  resize();
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------- game state ----------
const G = { mode: 'menu', me: null, opp: null, ai: null, net: new Net(), over: true, count: 0, lock: true, hs: 0, shake: 0, camYaw: 0, camPitch: 0.25, t: 0, started: false, rematch: [false, false], fov: 0, breakT: -9 };
window.__G = G; window.__step = dt => step(dt); window.__cam = () => camera;
const inp = { move: new V3(), walk: false, block: false, light: 0, heavy: 0, dodge: 0, finisher: 0, lock: true, aim: new V3(0, 0, 1) };
const keys = {}; window.__inp = inp;

function banner(text, color) {
  const b = $('banner'); b.textContent = text; b.style.color = color || '#fff'; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id); $('hud').classList.add('hidden'); if (id === 'menu') $('hud').classList.add('hidden'); }
function showHud() { for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); $('hud').classList.remove('hidden'); }

// ---------- combat feedback ----------
function screenFlash(op, ms) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = op; void f.offsetWidth; f.style.transition = 'opacity ' + ms + 'ms ease-out'; f.style.opacity = 0; }
function showResult(r, att, vic) {
  if (!r || r.res === 'miss') return;
  const p = vic.hitPoint.clone(); p.x += (att.pos.x - vic.pos.x) * 0.35; p.z += (att.pos.z - vic.pos.z) * 0.35; p.y = 1.35;
  const mine = att === G.me || vic === G.me;
  switch (r.res) {
    case 'parry': if (vic === G.me) REC.parries++; fx.parry(p); sfx.parry(); G.hs = 0.16; G.shake = 0.55; G.fov = 7; screenFlash(0.35, 260); vic.jolt = 0.3; if (vic === G.me) banner('PARRY', '#ffe9a8'); break;
    case 'block': fx.clash(p, r.heavy); sfx.block(); G.hs = r.heavy ? 0.09 : 0.06; G.shake = r.heavy ? 0.3 : 0.16; G.fov = r.heavy ? 3 : 1.5; vic.jolt = r.heavy ? 1 : 0.65; break;
    case 'hit': fx.hit(p); sfx.hit(r.heavy); G.hs = r.heavy ? 0.13 : 0.08; G.shake = r.heavy ? 0.4 : 0.22; G.fov = r.heavy ? 3 : 1; if (vic === G.me) screenFlash(0.18, 300); break;
    case 'dodge': if (mine) sfx.dodge(); break;
    case 'finisher': if (att === G.me) REC.deathblows++; fx.finisher(p); sfx.hit(true); G.hs = 0.4; G.shake = 0.8; G.fov = 6; screenFlash(0.5, 500); banner(r.killed ? '死' : '忍殺', '#ff3030'); break;
  }
  if (r.broke) { sfx.broken(); G.shake = Math.max(G.shake, .3); fx.clash(p, true); G.breakT = G.t; banner('POSTURE BROKEN', '#ff6a3a'); }
}function onStrike(att, kind) {
  const vic = att === G.me ? G.opp : G.me;
  if (G.mode === 'online') { G.net.send('strike', { kind, x: att.pos.x, z: att.pos.z }); return; }
  const r = vic.resolveStrike(kind, att.pos, att.dmgMul, att.fMul); showResult(r, att, vic); att.applyOutcome(r);
}

// ---------- match flow ----------
function startMatch(mode) {
  G.mode = mode; G.over = false; G.started = true; G.rematch = [false, false];
  const slot = mode === 'online' ? G.net.slot : 0;
  const { me, opp } = G;
  me.remote = false; opp.remote = mode === 'online';
  const gaunt = mode === 'gauntlet';
  if (!gaunt) { applyStats([]); applyBoss(null); }
  me.spawn(0, slot === 0 ? -4.2 : 4.2, slot === 0 ? 0 : Math.PI);
  opp.spawn(0, slot === 0 ? 4.2 : -4.2, slot === 0 ? Math.PI : 0);
  me.lives = mode === 'training' ? 99 : 2 + (gaunt ? G.extraLife : 0); opp.lives = mode === 'training' ? 99 : 2; me.invuln = opp.invuln = true;
  me.onStrike = onStrike; opp.onStrike = mode === 'online' ? null : onStrike;
  G.ai = mode === 'online' ? null : new AI(opp, gaunt ? 1 : +S.diff, gaunt ? G.boss.ai : null);
  if (mode === 'training') G.ai.mode = 'dummy-idle';
  G.lock = true; inp.lock = true; G.camYaw = slot === 0 ? 0 : Math.PI;
  $('oppName').textContent = gaunt ? G.boss.name.toUpperCase() : mode === 'online' ? 'OPPONENT' : mode === 'training' ? 'TRAINING DUMMY' : ['ASHIKAGA RONIN', 'KURO THE BLADE', 'ISSHIN, SWORD SAINT'][+S.diff];
  $('hint').innerHTML = mode === 'training' ? '1 passive · 2 blocking · 3 attacking · R reset<br>LMB attack · E heavy · RMB block · Space dodge · F deathblow · Q lock-on' : 'LMB attack · E heavy · RMB or C block (tap before hit = parry)<br>Space dodge · F deathblow when posture broken · Q lock-on';
  showHud(); G.count = mode === 'training' ? 0.8 : 3.4; sfx.ui();
  tryLock();
}
function newRound(deadF) {   // a fighter lost a life: both return to start, dead one is revived with full health
  const { me, opp } = G, slot = G.mode === 'online' ? G.net.slot : 0;
  const reset = (f, x, z, yaw) => { const hp = f === deadF ? f.maxHp : f.hp, l = f.lives; f.spawn(x, z, yaw); f.hp = hp; f.lives = l; f.invuln = true; };
  reset(me, 0, slot === 0 ? -4.2 : 4.2, slot === 0 ? 0 : Math.PI); reset(opp, 0, slot === 0 ? 4.2 : -4.2, slot === 0 ? Math.PI : 0);
  if (G.ai) { const m = G.ai.mode, g = G.mode === 'gauntlet'; G.ai = new AI(opp, g ? 1 : +S.diff, g ? G.boss.ai : null); G.ai.mode = m; }
  G.count = 2.6; G.camYaw = slot === 0 ? 0 : Math.PI; G.cine = null;
  banner(deadF === me ? 'REVIVED' : 'ENEMY FALLS', '#ffd870'); sfx.ui();
}
function checkRounds() {
  const { me, opp } = G; if (G.over || G.count > 0) return;
  if (me.dead && me.t > 2.2) { if (me.lives > 0) { if (G.mode === 'online') net.send('round', {}); newRound(me); } else endMatch(false); }
  else if (G.mode !== 'online' && opp.dead && opp.t > 2.2) { if (opp.lives > 0) newRound(opp); else endMatch(true); }
  else if (G.mode === 'online' && opp.dead && opp.lives <= 0 && opp.t > 1.4) endMatch(true);
}
function endMatch(win) {
  if (G.over) return; G.over = true;
  banner(win ? '勝利' : '死', win ? '#ffd870' : '#ff2a2a');
  if (win) G.me.setAct('victory');
  if (G.mode === 'gauntlet') { if (win) { G.run.stage++; REC.wins++; REC.best = Math.max(REC.best, G.run.stage); } saveRec(); } else saveRec();
  setTimeout(() => {
    if (G.mode === 'menu') return;
    document.exitPointerLock && document.exitPointerLock();
    if (G.mode === 'gauntlet' && win) { showPerks(); return; }
    const g = G.mode === 'gauntlet';
    $('resBig').textContent = g ? 'RUN ENDED' : win ? 'VICTORY' : 'DEATH'; $('resBig').className = win ? 'win' : 'lose';
    $('resSub').textContent = g ? 'Bosses defeated: ' + G.run.stage + ' · Best: ' + REC.best : win ? 'Your blade prevails.' : 'Your journey ends here.';
    $('result').classList.remove('hidden'); $('bRematch').textContent = g ? 'New Run' : 'Rematch';
  }, 2200);
}
// ---------- gauntlet (roguelike run: 5 distinct bosses, then endless; pick an upgrade after each win) ----------
const BOSSES = [
  { name: 'Reed Ronin', line: 'A wandering swordsman. Slow, patient, honest.', tint: 0x55704f, hp: 85, dmg: 0.9, tempo: 0.9, ai: { react: .18, parry: .1, block: .5, aggr: .45, heavy: .15, combo: 2, err: .25 } },
  { name: 'Kuro the Quickdraw', line: 'Fast chains of cuts. Keep your guard tight.', tint: 0x2d2d36, hp: 90, dmg: 1, tempo: 1.25, ai: { react: .35, parry: .3, block: .2, aggr: .68, heavy: .08, combo: 3, err: .12 } },
  { name: 'Tessen the Brute', line: 'Every swing can end you. Dodge, then punish.', tint: 0x7d5a2c, hp: 140, dmg: 1.5, tempo: 0.85, scale: 1.12, ai: { react: .25, parry: .1, block: .3, aggr: .6, heavy: .55, combo: 1, err: .2 } },
  { name: 'Akane, Mirror Blade', line: 'She reads every strike. Break her rhythm.', tint: 0x7a2c6c, hp: 100, dmg: 1.1, tempo: 1.1, ai: { react: .7, parry: .7, block: .15, aggr: .4, heavy: .2, combo: 2, err: .06 } },
  { name: 'Isshin, Sword Saint', line: 'The strongest blade in the land.', tint: 0xb59b2c, hp: 150, dmg: 1.25, tempo: 1.2, scale: 1.06, ai: { react: .65, parry: .55, block: .2, aggr: .6, heavy: .3, combo: 3, err: .07 } },
];
const PERKS = [
  { id: 'vit', name: 'Iron Body', desc: '+25 max health', max: 3 }, { id: 'wrist', name: 'Mirror Wrist', desc: 'Perfect Parry window +0.06 s', max: 2 },
  { id: 'mind', name: 'Calm Mind', desc: 'Posture recovers 40% faster', max: 3 }, { id: 'edge', name: 'Keen Edge', desc: '+20% damage', max: 3 },
  { id: 'exe', name: 'Executioner', desc: 'Deathblow deals +25% more', max: 2 }, { id: 'step', name: 'Wind Step', desc: 'Dodge invincibility +0.08 s', max: 2 },
  { id: 'life', name: 'Second Wind', desc: '+1 extra life in every fight', max: 1 },
];
const REC_KEY = 'kd-rec'; const REC = { best: 0, runs: 0, wins: 0, parries: 0, deathblows: 0 };
try { Object.assign(REC, JSON.parse(localStorage.getItem(REC_KEY) || '{}')); } catch (e) { }
function showRec() { $('rec').textContent = REC.runs || REC.wins ? `Best run: ${REC.best} bosses · duels won ${REC.wins} · parries ${REC.parries} · deathblows ${REC.deathblows}` : ''; }
function saveRec() { try { localStorage.setItem(REC_KEY, JSON.stringify(REC)); } catch (e) { } showRec(); }
function bossFor(n) {
  const b = BOSSES[n % BOSSES.length], c = Math.floor(n / BOSSES.length);
  return { ...b, name: c ? b.name + ' ' + '★'.repeat(Math.min(c, 5)) : b.name, hp: Math.round(b.hp * (1 + c * 0.2)), dmg: b.dmg * (1 + c * 0.12), tempo: b.tempo * (1 + c * 0.04), ai: { ...b.ai, react: Math.min(.9, b.ai.react + c * .06), parry: Math.min(.85, b.ai.parry + c * .05) } };
}
function applyStats(perks) {
  const n = id => perks.filter(p => p === id).length, m = G.me;
  m.maxHp = 100 + 25 * n('vit'); m.parryWin = 0.24 + 0.06 * n('wrist'); m.postRegen = 1 + 0.4 * n('mind'); m.dmgMul = 1 + 0.2 * n('edge'); m.fMul = 1 + 0.25 * n('exe'); m.iExtra = 0.08 * n('step'); G.extraLife = n('life');
}
function applyBoss(b) {
  const o = G.opp; o.maxHp = b ? b.hp : 100; o.dmgMul = b ? b.dmg : 1; o.tempo = b ? b.tempo : 1; o.fMul = 1; o.restyle(b ? b.tint : 0x9a3436, b ? b.scale || 1 : 1);
}
function startRun() {
  G.run = { stage: 0, perks: [] }; REC.runs++; saveRec(); introStage();
}
function introStage() {
  const b = G.boss = bossFor(G.run.stage); G.mode = 'menu'; G.over = true; applyBoss(b); applyStats(G.run.perks);
  G.me.remote = G.opp.remote = false; G.me.spawn(-1.6, 0, Math.PI / 2); G.opp.spawn(1.6, 0, -Math.PI / 2); G.me.onStrike = G.opp.onStrike = null;
  $('inStage').textContent = 'STAGE ' + (G.run.stage + 1) + (G.run.stage >= BOSSES.length ? ' · ENDLESS' : '');
  $('inName').textContent = b.name; $('inLine').textContent = b.line + '   (HP ' + b.hp + ')';
  showScreen('intro'); clearTimeout(G.introT); G.introT = setTimeout(beginStage, 3200); sfx.ui();
}
function beginStage() { clearTimeout(G.introT); if (!$('intro').classList.contains('hidden')) startMatch('gauntlet'); }
function showPerks() {
  const have = G.run.perks, elig = PERKS.filter(p => have.filter(x => x === p.id).length < p.max).sort(() => Math.random() - .5).slice(0, 3);
  const list = $('perkList'); list.innerHTML = '';
  for (const p of elig) { const b = document.createElement('button'); b.className = 'perk'; b.innerHTML = `<b>${p.name}</b><span>${p.desc}</span>`; b.onclick = () => { have.push(p.id); sfx.ui(); introStage(); }; list.appendChild(b); }
  $('perkHave').textContent = 'Defeated: ' + G.run.stage + ' · Upgrades: ' + (have.length ? have.map(id => PERKS.find(p => p.id === id).name).join(', ') : 'none');
  showScreen('perks');
}function toMenu() {
  clearTimeout(G.introT); saveRec(); G.run = null; if (G.me) { applyStats([]); applyBoss(null); }
  G.mode = 'menu'; G.over = true; G.net.close(); G.ai = null;
  if (document.pointerLockElement) document.exitPointerLock();
  G.me.remote = G.opp.remote = false; G.me.spawn(-1.6, 0, Math.PI / 2); G.opp.spawn(1.6, 0, -Math.PI / 2); G.me.onStrike = G.opp.onStrike = null;
  showScreen('menu');
}
function tryLock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }

// ---------- online ----------
const net = G.net;
function bindNet() {
  net.on('start', () => { $('onMsg').textContent = ''; startMatch('online'); });
  net.on('round', () => { if (G.mode === 'online' && !G.over) newRound(G.opp); });
  net.on('state', s => { if (G.mode === 'online' && G.opp) G.opp.setRemote(s); });
  net.on('strike', d => {
    if (G.mode !== 'online' || G.over) return;
    const r = G.me.resolveStrike(d.kind, { x: d.x, z: d.z }); showResult(r, G.opp, G.me); net.send('outcome', r);
  });
  net.on('outcome', r => { if (G.mode !== 'online') return; showResult(r, G.me, G.opp); G.me.applyOutcome(r); });
  net.on('rematch', () => { G.rematch[1] = true; if (G.rematch[0]) { $('result').classList.add('hidden'); startMatch('online'); } else $('resSub').textContent = 'Opponent wants a rematch!'; });
  net.on('peerleft', () => {
    if (G.mode === 'online' && !G.over) { G.opp.dead = true; endMatch(true); $('resSub').textContent = 'Opponent left the duel.'; }
    else if (G.mode === 'menu' || $('lobby') && !$('lobby').classList.contains('hidden')) { $('onMsg').textContent = 'Connection closed.'; }
  });
}
bindNet();
async function connectNet() {
  $('onMsg').textContent = 'Connecting…'; S.serverUrl = $('serverUrl').value; save();
  try { await net.connect(S.serverUrl); bindNet(); return true; } catch (e) { $('onMsg').textContent = e.message + ' — check address / firewall.'; return false; }
}
$('btnHost').onclick = async () => {
  audio.resume(); if (!await connectNet()) return;
  const a = await net.create(); $('roomCode').textContent = a.code; $('lobby').classList.remove('hidden'); $('onMsg').textContent = '';
  let txt = 'Online (internet): both players use the same relay server address.';
  if (!S.serverUrl.trim()) {
    try { const i = await (await fetch('/info')).json(); txt = 'LAN: friend enters Server address  ' + i.ips.map(ip => ip + ':' + i.port).join('  or  ') + '  and code ' + a.code + '.  No app on that PC? Open http://' + i.ips[0] + ':' + i.port + ' in Chrome.'; } catch (e) { }
  }
  $('lanInfo').textContent = txt;
};
$('btnJoin').onclick = async () => {
  audio.resume(); const code = $('joinCode').value.trim(); if (code.length !== 4) { $('onMsg').textContent = 'Enter the 4-letter room code.'; return; }
  if (!await connectNet()) return;
  const a = await net.join(code); $('onMsg').textContent = a.ok ? 'Joined! Starting…' : a.err;
};

// ---------- UI wiring ----------
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (!go) return;
  audio.resume(); sfx.ui();
  const t = go.dataset.go;
  if (t === 'menu') { net.close(); $('lobby').classList.add('hidden'); toMenu(); }
  else if (t === 'ai') startMatch('ai');
  else if (t === 'gauntlet') startRun();
  else if (t === 'training') startMatch('training');
  else if (t === 'online') { $('lobby').classList.add('hidden'); $('onMsg').textContent = ''; $('serverUrl').value = S.serverUrl; showScreen('online'); }
  else if (t === 'settings') showScreen('settings');
  else if (t === 'quit') window.close();
});
const bind = (id, key, fmt) => {
  const el = $(id); if (el.type === 'checkbox') el.checked = S[key]; else el.value = S[key];
  el.oninput = el.onchange = () => { S[key] = el.type === 'checkbox' ? el.checked : el.value; save(); if (key === 'quality') applyQuality(); if (key === 'vol') audio.setVolume(+S.vol); if (fmt) $(fmt).textContent = (+S[key]).toFixed(2); };
  if (fmt) $(fmt).textContent = (+S[key]).toFixed(2);
};
bind('sQuality', 'quality'); bind('sDiff', 'diff'); bind('sSens', 'sens', 'vSens'); bind('sVol', 'vol', 'vVol'); bind('sInvert', 'invert'); bind('sFps', 'fps'); $('sFps').addEventListener('change', () => { $('fps').style.display = S.fps ? 'block' : 'none'; }); $('fps').style.display = S.fps ? 'block' : 'none'; showRec();
$('bResume').onclick = () => { $('pause').classList.add('hidden'); tryLock(); };
$('bQuitMatch').onclick = () => { $('pause').classList.add('hidden'); toMenu(); };
$('intro').onclick = beginStage;
$('bResMenu').onclick = () => { $('result').classList.add('hidden'); toMenu(); };
$('bRematch').onclick = () => {
  if (G.mode === 'gauntlet') { $('result').classList.add('hidden'); startRun(); }
  else if (G.mode === 'online') { G.rematch[0] = true; net.send('rematch', 1); $('bRematch').textContent = 'Waiting…'; if (G.rematch[1]) { $('result').classList.add('hidden'); startMatch('online'); } }
  else { $('result').classList.add('hidden'); startMatch(G.mode); }
};
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.mode !== 'menu' && !G.over && $('result').classList.contains('hidden') && G.started) $('pause').classList.remove('hidden');
});

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.repeat) return; keys[e.code] = true;
  if (G.mode === 'menu' || G.over) return;
  if (e.code === 'KeyC') inp.block = true; else if (e.code === 'KeyE') inp.heavy = 0.25; else if (e.code === 'Space') { inp.dodge = 0.25; e.preventDefault(); }
  else if (e.code === 'KeyF') inp.finisher = 0.35; else if (e.code === 'KeyQ') { G.lock = !G.lock; inp.lock = G.lock; }
  else if (G.mode === 'training') {
    if (e.code === 'Digit1') G.ai.mode = 'dummy-idle'; else if (e.code === 'Digit2') G.ai.mode = 'dummy-block'; else if (e.code === 'Digit3') G.ai.mode = 'dummy-attack';
    else if (e.code === 'KeyR') { G.me.spawn(0, -4.2, 0); G.opp.spawn(0, 4.2, Math.PI); }
  }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyC') inp.block = false; });
canvas.addEventListener('mousedown', e => {
  audio.resume();
  if (G.mode === 'menu' || G.over) return;
  if (!document.pointerLockElement) { tryLock(); return; }
  if (e.button === 0) inp.light = 0.25; else if (e.button === 2) inp.block = true;
});
addEventListener('mouseup', e => { if (e.button === 2) inp.block = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!document.pointerLockElement || G.mode === 'menu') return;
  if (G.lock && G.opp && !G.opp.dead) return;
  G.camYaw -= e.movementX * 0.0022 * S.sens; G.camPitch = Math.max(-0.1, Math.min(1.0, G.camPitch + e.movementY * 0.0022 * S.sens * (S.invert ? -1 : 1)));
});

// ---------- loop ----------
const tmp = new V3(), camPos = new V3(), camLook = new V3();
function updateCamera(dt) {
  const { me, opp } = G;
  if (G.dbg) { camera.position.copy(G.dbg.p); camera.lookAt(G.dbg.l); return; }
  if (G.mode === 'menu') {
    const a = G.t * 0.1 + 0.6; camPos.set(Math.cos(a) * 5.2, 1.5, Math.sin(a) * 5.2); camera.position.lerp(camPos, 1 - Math.exp(-3 * dt)); camera.lookAt(0, 1.25, 0); return;
  }
  const locked = G.lock && opp && !opp.dead;
  if (G.cine && me && opp) {   // deathblow cinematic: side-on close camera
    const mx = (me.pos.x + opp.pos.x) / 2, mz = (me.pos.z + opp.pos.z) / 2, dx = opp.pos.x - me.pos.x, dz = opp.pos.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
    camPos.set(mx + dz / l * 3.2 + dx / l * -0.6, 1.5, mz - dx / l * 3.2 + dz / l * -0.6); camera.position.lerp(camPos, Math.min(1, 6 * dt)); camLook.set(mx, 1.25, mz); camera.lookAt(camLook);
    G.fov += (3 - G.fov) * Math.min(1, 4 * dt); if (Math.abs(camera.fov - (58 - G.fov)) > .05) { camera.fov = 58 - G.fov; camera.updateProjectionMatrix(); }
    $('lock').style.display = 'none'; $('fin').style.display = 'none'; return;
  }
  if (locked) {
    const dx = opp.pos.x - me.pos.x, dz = opp.pos.z - me.pos.z, ty = Math.atan2(dx, dz);
    let d = ty - G.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); G.camYaw += d * Math.min(1, 7 * dt);
    G.camPitch += (0.2 + Math.min(0.12, Math.hypot(dx, dz) * 0.01) - G.camPitch) * Math.min(1, 3 * dt);
  }
  const F = tmp.set(Math.sin(G.camYaw), 0, Math.cos(G.camYaw)), cp = Math.cos(G.camPitch), D = locked ? 5.4 : 4.8;
  const tgt = new V3(me.pos.x, 1.55, me.pos.z);
  camPos.copy(tgt).addScaledVector(F, -cp * D).addScaledVector(new V3(-Math.cos(G.camYaw), 0, Math.sin(G.camYaw)), 0.8); camPos.y += Math.sin(G.camPitch) * D + 0.4;
  const lim = 14; if (Math.hypot(camPos.x, camPos.z) > lim + 3) { const k = (lim + 3) / Math.hypot(camPos.x, camPos.z); camPos.x *= k; camPos.z *= k; }
  camera.position.lerp(camPos, Math.min(1, 14 * dt));
  camLook.copy(tgt); if (locked) camLook.lerp(new V3(opp.pos.x, 1.3, opp.pos.z), 0.5);
  if (G.shake > 0) { camera.position.x += (Math.random() - .5) * G.shake * .4; camera.position.y += (Math.random() - .5) * G.shake * .4; G.shake = Math.max(0, G.shake - dt * 1.6); }
  camera.lookAt(camLook);
  G.fov += (0 - G.fov) * Math.min(1, 9 * dt); const nf = 58 + G.fov * -1; if (Math.abs(camera.fov - nf) > .05) { camera.fov = nf; camera.updateProjectionMatrix(); }
  // finisher prompt: only while the opponent's posture is broken and a deathblow is possible
  const fin = $('fin'), canFin = opp && !opp.dead && opp.act === 'broken' && opp.brokenLeft > 0.25 && Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z) < 3.6 && !G.over && me.act !== 'deathblow';
  if (canFin) { const p = new V3(opp.pos.x, 1.55, opp.pos.z).project(camera); if (p.z < 1) { fin.style.display = 'block'; fin.style.left = (p.x * .5 + .5) * innerWidth + 'px'; fin.style.top = (-p.y * .5 + .5) * innerHeight + 'px'; fin.classList.toggle('late', opp.brokenLeft < 1); } else fin.style.display = 'none'; } else fin.style.display = 'none';
  // lock marker
  const lk = $('lock');
  if (locked) { const p = new V3(opp.pos.x, 1.45, opp.pos.z).project(camera); if (p.z < 1) { lk.style.display = 'block'; lk.style.left = (p.x * .5 + .5) * innerWidth + 'px'; lk.style.top = (-p.y * .5 + .5) * innerHeight + 'px'; } else lk.style.display = 'none'; } else lk.style.display = 'none';
}
function updateHud(dt) {
  const set = (hp, tr, po, f) => {
    const pc = Math.max(0, f.hp) / f.maxHp * 100 + '%'; $(hp).style.width = pc; $(tr).style.width = pc;
    const pe = $(po); pe.style.transform = `translateX(-50%) scaleX(${Math.min(1, f.posture / 100)})`;
    pe.parentElement.className = 'posture' + (f.act === 'broken' ? ' broken' : f.posture > 66 ? ' warn' : '');
  };
  set('meHp', 'meHpTrail', 'mePost', G.me); set('oppHp', 'oppHpTrail', 'oppPost', G.opp);
  for (const [id, f] of [['meLives', G.me], ['oppLives', G.opp]]) { const el = $(id); if (G.mode === 'training') { el.style.visibility = 'hidden'; continue; } el.style.visibility = 'visible'; [...el.children].forEach((c, i) => c.classList.toggle('lost', i >= f.lives)); }
}
let netT = 0, last = performance.now();
function adapt(raw) {   // adaptive resolution: keeps frame rate smooth on laptops
  G.fa = (G.fa || 0) + raw; G.fn = (G.fn || 0) + 1; if (G.fa < 2) return;
  const avg = G.fa / G.fn; G.fa = G.fn = 0;
  if (avg > 1 / 50 && G.pr > 0.6) { G.pr = Math.max(0.6, G.pr - 0.1); renderer.setPixelRatio(G.pr); resize(); }
  else if (avg < 1 / 57 && G.pr < G.prMax) { G.pr = Math.min(G.prMax, G.pr + 0.05); renderer.setPixelRatio(G.pr); resize(); }
  if (S.fps) $('fps').textContent = Math.round(1 / avg) + ' fps · render ' + Math.round(G.pr * 100) + '% · ' + G.q;
}
function frame(now) { requestAnimationFrame(frame); const raw = Math.min(0.1, (now - last) / 1000); step(Math.min(0.05, raw)); adapt(raw); last = now; }
function step(dt) {
  G.t += dt;
  if (G.hs > 0) { G.hs -= dt; dt *= 0.08; }
  const dbA = G.me && (G.me.act === 'deathblow' ? G.me : G.opp && G.opp.act === 'deathblow' ? G.opp : null); G.cine = dbA;
  if (dbA && dbA.t > 0.3 && dbA.t < 0.95) dt *= 0.3;
  const { me, opp } = G;
  if (me) {
    if (G.mode === 'menu') { me.update(dt, null, null); opp.update(dt, null, null); me.speed = opp.speed = 0; }
    else {
      // input -> move vector
      const F = new V3(Math.sin(G.camYaw), 0, Math.cos(G.camYaw)), R = new V3(-F.z, 0, F.x).multiplyScalar(-1);
      // right vector for forward (sinφ,0,cosφ) is (-cosφ,0,sinφ) -> equals (-F.z... ) check: use explicit
      R.set(-Math.cos(G.camYaw), 0, Math.sin(G.camYaw));
      inp.move.set(0, 0, 0);
      const live = G.count <= 0 && !G.over;
      if (live) {
        if (keys.KeyW) inp.move.add(F); if (keys.KeyS) inp.move.sub(F); if (keys.KeyD) inp.move.add(R); if (keys.KeyA) inp.move.sub(R);
      }
      // note: R points to character-left in this convention, so D subtracts it
      inp.walk = !!(keys.ShiftLeft || keys.ShiftRight); inp.aim.copy(F);
      if (G.count > 0) { G.count -= dt; const n = Math.ceil(G.count - 0.4); $('count').textContent = G.count > 0.4 ? n : G.count > 0 ? '斬' : ''; if (G.count <= 0) { $('count').textContent = ''; banner('BEGIN', '#fff'); } }
      const myInp = live ? inp : { ...inp, block: false, light: 0, heavy: 0, dodge: 0, finisher: 0, move: new V3() };
      me.update(dt, myInp, opp);
      if (live) { inp.light = Math.max(0, inp.light - dt); inp.heavy = Math.max(0, inp.heavy - dt); inp.dodge = Math.max(0, inp.dodge - dt); inp.finisher = Math.max(0, inp.finisher - dt); }
      else { inp.light = inp.heavy = inp.dodge = inp.finisher = 0; }
      if (G.mode === 'online') {
        opp.update(dt, null, me);
        netT += dt; if (netT > 0.04) { netT = 0; net.send('state', me.snapshot()); }
      } else {
        const ai = G.ai, ii = ai.inp;
        if (live) ai.think(dt, me);
        else { ii.move.set(0, 0, 0); ii.block = false; }
        opp.update(dt, ii, me);
        for (const k of ['light', 'heavy', 'dodge', 'finisher']) ii[k] = Math.max(0, ii[k] - dt);
      }
      if (G.count <= 0 && me.invuln) me.invuln = opp.invuln = false;
      checkRounds();
      if (opp.act === 'broken' && !opp.dead && ((G.bt = (G.bt || 0) - dt) < 0)) { G.bt = 0.3; fx.spawn(new V3(opp.pos.x, 1.7, opp.pos.z), 7, 2.5, 1, .12, .05, 1, .6); }
      updateHud(dt);
    }
  }
  fx.update(dt, camera); updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------- boot ----------
new GLTFLoader().load('/assets/Soldier.glb', gltf => { try {
  G.me = new Fighter(scene, gltf, 'player', 'You'); G.opp = new Fighter(scene, gltf, 'enemy', 'Enemy');
  G.me.spawn(-1.6, 0, Math.PI / 2); G.opp.spawn(1.6, 0, -Math.PI / 2);
  applyQuality(); showScreen('menu');
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 700);
  last = performance.now(); requestAnimationFrame(frame);
} catch (e) { $('loading').textContent = 'Error: ' + e.stack; console.error(e); } }, undefined, err => { $('loading').textContent = 'Failed to load model: ' + err.message; });
