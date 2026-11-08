import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildArena } from './arena.js';
import { FX } from './fx.js';
import { Fighter, prepareClips } from './fighter.js';
import { MOVES } from './moves.js';
import { AI } from './ai.js';
import { Net } from './net.js';
import { CameraRig } from './camera.js';
import { Post } from './post.js';
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: location.search.includes('shot') });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 400);
// soft fill that rides with the camera: keeps both fighters readable in the dark hall (no shadows)
const camFill = new THREE.DirectionalLight(0xffd8b0, 0.55); camFill.position.set(0.6, 0.4, 1); camera.add(camFill); camFill.target.position.set(0, 0, -5); camera.add(camFill.target); scene.add(camera);
const arena = buildArena(scene, renderer);
const fx = new FX(scene);
const rig = new CameraRig(camera);
const post = new Post(renderer, scene, camera);
function gpuTier() {   // discrete NVIDIA/AMD (e.g. Lenovo LOQ RTX) -> high, Apple Silicon -> medium, others -> low
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'), r = (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/nvidia|geforce|rtx|radeon rx|radeon pro/.test(r)) return 'high'; if (/apple/.test(r)) return 'med'; return 'low'; } catch (e) { return 'med'; }
}
function applyQuality() {
  const q = S.quality === 'auto' ? gpuTier() : S.quality, dpr = window.devicePixelRatio || 1;
  G.q = q; G.prMax = q === 'low' ? Math.min(dpr, 0.75) : q === 'med' ? Math.min(dpr, 1.0) : Math.min(dpr, 1.35); G.pr = G.prMax;
  arena.setQuality(q); post.setQuality(q); fx.density = q === 'low' ? 0.55 : 1; renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  resize();
}
function resize() { renderer.setPixelRatio(G.pr); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.setSize(innerWidth, innerHeight, G.pr); }
addEventListener('resize', resize);

// ---------- game state ----------
const G = { mode: 'menu', me: null, opp: null, ai: null, net: new Net(), over: true, lock: true, hs: 0, t: 0, started: false, rematch: [false, false], phase: 'menu', phaseT: 0, slow: 1, slowT: 0, q: 'high', pr: 1, prMax: 1 };
window.__dbg = { renderer, scene, camera, post, rig, fx, AI, MOVES }; window.__G = G; window.__step = dt => step(dt); window.__cam = () => camera;
const inp = { move: new V3(), walk: false, guard: false, light: 0, heavy: 0, dodge: 0, finisher: 0, lock: true, aim: new V3(0, 0, 1), sprint: false };
const keys = {}; window.__inp = inp;

function banner(text, color, big) {
  const b = $('banner'); b.textContent = text; b.style.color = color || '#fff'; b.classList.toggle('big', !!big); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id); $('hud').classList.add('hidden'); }
function showHud() { for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); $('hud').classList.remove('hidden'); }
function screenFlash(color, op, ms) { const f = $('flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = op; void f.offsetWidth; f.style.transition = 'opacity ' + ms + 'ms ease-out'; f.style.opacity = 0; }
const toScreen = p => { const v = p.clone().project(camera); return new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5); };

// ---------- combat feedback ----------
function contactPoint(att, vic) {   // where the blades meet: closest point on the defender's blade to the attacker's tip
  if (vic.bladeBase && att.bladeTip) { const a = vic.bladeBase, b = vic.bladeTip, ab = b.clone().sub(a), t = Math.max(0, Math.min(1, att.bladeTip.clone().sub(a).dot(ab) / ab.lengthSq())); const p = a.clone().addScaledVector(ab, t); if (p.y > 0.4 && p.distanceTo(vic.hitPoint) < 1.3) return p; }
  const p = vic.hitPoint.clone().lerp(att.hitPoint, 0.35); p.y = 1.35; return p;
}
function showResult(r, att, vic) {
  if (!r || r.res === 'miss') return;
  const mine = att === G.me || vic === G.me, dir = new V3(vic.pos.x - att.pos.x, 0, vic.pos.z - att.pos.z).normalize();
  const camDir = dir.clone(); camDir.y = 0;
  switch (r.res) {
    case 'deflect': {
      const p = contactPoint(att, vic), sprayDir = dir.clone().negate().add(new V3(0, 0.6, 0)).normalize();
      if (vic === G.me) REC.parries++;
      fx.deflect(p, sprayDir, r.heavy); sfx.deflect(r.heavy); G.hs = r.heavy ? 0.16 : 0.12; rig.shake(0.38); rig.punch(5); rig.tilt((Math.random() < .5 ? -1 : 1) * 0.6); rig.kick(camDir, -1.2);
      post.impact({ aberr: 0.012, radial: 0.012, flash: 0.06, flashCol: 0xfff2d0, center: toScreen(p) });
      break;
    }
    case 'clash': { const p = contactPoint(att, vic); fx.clash(p, new V3(0, 1, 0)); sfx.clash(); G.hs = 0.14; rig.shake(0.4); rig.punch(4); post.impact({ aberr: 0.015, radial: 0.015, center: toScreen(p) }); banner('鍔迫り', '#ffd9a0'); break; }
    case 'block': { const p = contactPoint(att, vic); fx.block(p, r.heavy, dir.clone().negate().add(new V3(0, .5, 0)).normalize()); sfx.block(r.heavy); G.hs = r.heavy ? 0.07 : 0.045; rig.shake(r.heavy ? 0.28 : 0.14); rig.punch(r.heavy ? 2.5 : 1); break; }
    case 'hit': {
      const p = vic.hitPoint.clone(); p.y = 1.2 + Math.random() * 0.3; fx.hit(p, dir.clone().add(new V3(0, 0.3, 0)).normalize(), r.heavy); sfx.hit(r.heavy);
      G.hs = r.heavy ? 0.11 : 0.07; rig.shake(r.heavy ? 0.4 : 0.22); rig.punch(r.heavy ? 3 : 1.5); if (vic === G.me) { screenFlash('#a00000', 0.22, 350); rig.kick(camDir, 1.5); post.impact({ aberr: 0.02 }); }
      break;
    }
    case 'dodge': break;
    case 'mikiri': { const p = att.hitPoint.clone().lerp(vic.hitPoint, 0.5); fx.mikiri(p); sfx.mikiri(); G.hs = 0.22; rig.shake(0.5); rig.punch(5); banner('見切り', '#fff4dc', true); post.impact({ radial: 0.03, flash: 0.2, center: toScreen(p) }); break; }
    case 'finisher': {
      if (att === G.me) REC.deathblows++;
      const p = vic.hitPoint.clone(); fx.finisher(p, dir); G.hs = 0.28; rig.shake(0.7); rig.punch(5); screenFlash('#ff0000', 0.35, 700);
      post.impact({ radial: 0.04, aberr: 0.03, center: toScreen(p) }); banner(r.killed ? '死' : '忍殺', '#ff3030', true); break;
    }
  }
  if (r.broke) { sfx.broken(); fx.broken(vic.hitPoint.clone().setY(1.6)); rig.shake(0.3); }
}
function onStrike(att, kind) {
  const vic = att === G.me ? G.opp : G.me;
  if (G.mode === 'online') { G.net.send('strike', { kind, x: att.pos.x, z: att.pos.z }); return; }
  const r = vic.resolveStrike(kind, att.pos, att.dmgMul, att.fMul); showResult(r, att, vic); att.applyOutcome(r);
}
function fighterEvents(f) {
  for (const e of f.events) {
    if (e.type === 'perilous') { fx.perilous(f); sfx.perilous(); }
    else if (e.type === 'broken') { if (f !== G.me || G.mode === 'online') {} }
    else if (e.type === 'revive') { fx.revive(new V3(f.pos.x, 1, f.pos.z)); sfx.revive(); }
    else if (e.type === 'dodge') fx.dust(f.pos, 8);
  }
  f.events.length = 0;
}

// ---------- match flow ----------
const START_D = 3.6;
function placeStart(slot) {
  const { me, opp } = G, z = slot === 0 ? -START_D : START_D;
  me.spawn(0, z, slot === 0 ? 0 : Math.PI); opp.spawn(0, -z, slot === 0 ? Math.PI : 0);
}
function startMatch(mode) {
  G.mode = mode; G.over = false; G.started = true; G.rematch = [false, false];
  const slot = mode === 'online' ? G.net.slot : 0, { me, opp } = G;
  me.remote = false; opp.remote = mode === 'online';
  const gaunt = mode === 'gauntlet';
  if (!gaunt) { applyStats([]); applyBoss(null); }
  placeStart(slot);
  me.lives = mode === 'training' ? 99 : 2 + (gaunt ? G.extraLife : 0); opp.lives = mode === 'training' ? 99 : 2; me.invuln = opp.invuln = true;
  me.onStrike = onStrike; opp.onStrike = mode === 'online' ? null : onStrike;
  G.ai = mode === 'online' ? null : new AI(opp, gaunt ? G.boss.level : +S.diff, gaunt ? G.boss.ai : null);
  if (mode === 'training') G.ai.mode = 'dummy-idle';
  G.lock = true; inp.lock = true;
  $('oppName').textContent = gaunt ? G.boss.name.toUpperCase() : mode === 'online' ? 'OPPONENT' : mode === 'training' ? 'TRAINING DUMMY' : ['ASHIKAGA RONIN', 'KURO THE BLADE', 'ISSHIN, SWORD SAINT'][+S.diff];
  $('hint').innerHTML = mode === 'training' ? '1 passive · 2 guarding · 3 attacking · R reset<br>LMB attack · E heavy · RMB/C guard (press just before a hit = Deflect) · Space dodge · F deathblow · Q lock-on' : 'LMB attack · E heavy · RMB or C guard — press just before the hit to DEFLECT<br>Space dodge (into a 危 thrust = Mikiri) · F deathblow on broken posture · Q lock-on';
  showHud(); sfx.ui();
  if (mode === 'training') { G.phase = 'fight'; G.phaseT = 0; rig.snapBehind(me); me.invuln = opp.invuln = false; }
  else {
    // intro: both fighters draw their blades while the camera sweeps around them
    me.sheathed = opp.sheathed = true; me.setAct('draw'); if (!opp.remote) opp.setAct('draw');
    G.phase = 'intro'; G.phaseT = 0; rig.startCine({ type: 'intro', dur: 2.4 });
    $('title').innerHTML = `<small>${mode === 'online' ? 'ONLINE DUEL' : gaunt ? 'STAGE ' + (G.run.stage + 1) : 'DUEL'}</small>${$('oppName').textContent}`; $('title').classList.add('show');
  }
  tryLock();
}
function beginFight() { G.phase = 'fight'; G.phaseT = 0; G.me.invuln = G.opp.invuln = false; $('title').classList.remove('show'); banner('斬', '#fff', true); sfx.begin(); rig.endCine(G.me); rig.snapBehind(G.me); }
// a fighter lost a life but has more: dramatic fall, then resurrection where they lie; the survivor steps back
function startDowned(f) {
  G.phase = 'downed'; G.phaseT = 0; G.downed = f; G.slow = 0.35; G.slowT = 0.9;
  rig.startCine({ type: 'death', f, ang: Math.atan2(rig.pos.x - f.pos.x, rig.pos.z - f.pos.z) }); sfx.death();
  if (f.lives > 0) banner(f === G.me ? '死' : '討', f === G.me ? '#ff2a2a' : '#ffd870', true);
}
function doRevive(f) {
  G.phase = 'revive'; G.phaseT = 0;
  const other = f === G.me ? G.opp : G.me;
  if (!other.remote) { const d = new V3(other.pos.x - f.pos.x, 0, other.pos.z - f.pos.z); if (d.length() < 0.1) d.set(0, 0, 1); d.normalize(); const p = f.pos.clone().addScaledVector(d, 5); other.pos.copy(p); other.vel.set(0, 0, 0); other.locoV.set(0, 0, 0); other.yaw = Math.atan2(-d.x, -d.z); if (other.act !== 'idle') other.setAct('idle'); other.guard = false; }
  if (!f.remote) f.revive(); other.invuln = true;
  rig.startCine({ type: 'revive', f, ang: Math.atan2(other.pos.x - f.pos.x, other.pos.z - f.pos.z) + 0.6 });
  banner('回生', '#ffd27a', true); screenFlash('#ffcc66', 0.25, 900);
}
function checkLives() {
  const { me, opp } = G; if (G.over) return;
  if (G.phase === 'fight') {
    if (me.dead) { startDowned(me); return; }
    if (opp.dead) { startDowned(opp); return; }
  } else if (G.phase === 'downed') {
    const f = G.downed;
    if (G.phaseT > 2.4) {
      if (f.lives > 0) { if (f === me || G.mode !== 'online') { doRevive(f); if (G.mode === 'online') G.net.send('round', {}); } }
      else endMatch(f !== me);
    }
  } else if (G.phase === 'revive' && G.phaseT > 1.7) {
    G.phase = 'fight'; G.phaseT = 0; me.invuln = opp.invuln = false; if (G.downed && !G.downed.remote) G.downed.invuln = false; rig.endCine(me); rig.snapBehind(me); banner('斬', '#fff');
    if (G.ai) G.ai.answered = -1;
  }
}
function endMatch(win) {
  if (G.over) return; G.over = true; G.phase = 'end'; G.phaseT = 0;
  const w = win ? G.me : G.opp;
  banner(win ? '勝利' : '死', win ? '#ffd870' : '#ff2a2a', true); win ? sfx.victory() : sfx.death();
  setTimeout(() => { if (!w.dead && !w.remote) w.setAct('sheathe'); rig.startCine({ type: 'victory', f: w, ang: w.yaw + 0.8 }); }, 900);
  if (G.mode === 'gauntlet') { if (win) { G.run.stage++; REC.wins++; REC.best = Math.max(REC.best, G.run.stage); } } else if (win) REC.wins++;
  saveRec();
  setTimeout(() => {
    if (G.mode === 'menu') return;
    document.exitPointerLock && document.exitPointerLock();
    if (G.mode === 'gauntlet' && win) { showPerks(); return; }
    const g = G.mode === 'gauntlet';
    $('resBig').textContent = g ? 'RUN ENDED' : win ? 'VICTORY' : 'DEATH'; $('resBig').className = win ? 'win' : 'lose';
    $('resSub').textContent = g ? 'Bosses defeated: ' + G.run.stage + ' · Best: ' + REC.best : win ? 'Your blade prevails.' : 'Your journey ends here.';
    $('result').classList.remove('hidden'); $('bRematch').textContent = g ? 'New Run' : 'Rematch';
  }, 3600);
}

// ---------- gauntlet ----------
const BOSSES = [
  { name: 'Reed Ronin', line: 'A wandering swordsman. Slow, patient, honest.', tint: 0x55704f, hp: 85, dmg: 0.9, tempo: 0.92, level: 0, ai: { moves: { slash: 6, heavy: 2 } } },
  { name: 'Kuro the Quickdraw', line: 'Closes ten paces in a heartbeat. Deflect the dash.', tint: 0x2d2d36, hp: 95, dmg: 1, tempo: 1.15, level: 1, ai: { aggr: 0.66, moves: { slash: 4, dash: 4, uppercut: 1.5, thrust: 0.6 } } },
  { name: 'Tessen the Brute', line: 'Every swing can end you. Read the wind-up.', tint: 0x7d5a2c, hp: 140, dmg: 1.45, tempo: 0.88, scale: 1.12, level: 1, ai: { react: 0.35, moves: { slash: 2, heavy: 4, heavyB: 2.5, leap: 2.5, kick: 2 } } },
  { name: 'Akane, Mirror Blade', line: 'She deflects everything. Break her rhythm.', tint: 0x7a2c6c, hp: 100, dmg: 1.1, tempo: 1.08, level: 2, ai: { react: 0.95, deflect: 0.85, aggr: 0.42, moves: { slash: 5, thrust: 2.5, uppercut: 1.5 } } },
  { name: 'Isshin, Sword Saint', line: 'The strongest blade in the land.', tint: 0xb59b2c, hp: 150, dmg: 1.25, tempo: 1.15, scale: 1.06, level: 2, ai: {} },
];
const PERKS = [
  { id: 'vit', name: 'Iron Body', desc: '+25 max health', max: 3 }, { id: 'wrist', name: 'Mirror Wrist', desc: 'Deflect window +0.05 s', max: 2 },
  { id: 'mind', name: 'Calm Mind', desc: 'Posture recovers 40% faster', max: 3 }, { id: 'edge', name: 'Keen Edge', desc: '+20% damage', max: 3 },
  { id: 'exe', name: 'Executioner', desc: 'Deathblow deals +25% more', max: 2 }, { id: 'step', name: 'Wind Step', desc: 'Dodge invincibility +0.08 s', max: 2 },
  { id: 'life', name: 'Second Wind', desc: '+1 extra life in every fight', max: 1 },
];
const REC_KEY = 'kd-rec'; const REC = { best: 0, runs: 0, wins: 0, parries: 0, deathblows: 0 };
try { Object.assign(REC, JSON.parse(localStorage.getItem(REC_KEY) || '{}')); } catch (e) { }
function showRec() { $('rec').textContent = REC.runs || REC.wins ? `Best run: ${REC.best} bosses · duels won ${REC.wins} · deflects ${REC.parries} · deathblows ${REC.deathblows}` : ''; }
function saveRec() { try { localStorage.setItem(REC_KEY, JSON.stringify(REC)); } catch (e) { } showRec(); }
function bossFor(n) {
  const b = BOSSES[n % BOSSES.length], c = Math.floor(n / BOSSES.length);
  return { ...b, name: c ? b.name + ' ' + '★'.repeat(Math.min(c, 5)) : b.name, hp: Math.round(b.hp * (1 + c * 0.2)), dmg: b.dmg * (1 + c * 0.12), tempo: b.tempo * (1 + c * 0.04), level: Math.min(2, b.level + c), ai: { ...b.ai } };
}
function applyStats(perks) {
  const n = id => perks.filter(p => p === id).length, m = G.me;
  m.maxHp = 100 + 25 * n('vit'); m.parryWin = 0.2 + 0.05 * n('wrist'); m.postRegen = 1 + 0.4 * n('mind'); m.dmgMul = 1 + 0.2 * n('edge'); m.fMul = 1 + 0.25 * n('exe'); m.iExtra = 0.08 * n('step'); G.extraLife = n('life');
}
function applyBoss(b) { const o = G.opp; o.maxHp = b ? b.hp : 100; o.dmgMul = b ? b.dmg : 1; o.tempo = b ? b.tempo : 1; o.fMul = 1; o.restyle(b ? b.tint : 0x8f1c1c, b ? b.scale || 1 : 1); }
function startRun() { G.run = { stage: 0, perks: [] }; REC.runs++; saveRec(); introStage(); }
function introStage() {
  const b = G.boss = bossFor(G.run.stage); G.mode = 'menu'; G.over = true; applyBoss(b); applyStats(G.run.perks);
  menuPose();
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
}
function menuPose() {
  G.me.remote = G.opp.remote = false; G.me.spawn(-1.5, 0.3, Math.PI / 2 - 0.3); G.opp.spawn(1.5, -0.3, -Math.PI / 2 - 0.3); G.me.onStrike = G.opp.onStrike = null;
}
function toMenu() {
  clearTimeout(G.introT); saveRec(); G.run = null; if (G.me) { applyStats([]); applyBoss(null); }
  G.mode = 'menu'; G.phase = 'menu'; G.over = true; G.net.close(); G.ai = null; rig.endCine(); $('title').classList.remove('show');
  if (document.pointerLockElement) document.exitPointerLock();
  menuPose(); showScreen('menu');
}
function tryLock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }

// ---------- online ----------
const net = G.net;
function bindNet() {
  net.on('start', () => { $('onMsg').textContent = ''; startMatch('online'); });
  net.on('round', () => { if (G.mode === 'online' && !G.over && G.downed === G.opp) doRevive(G.opp); });
  net.on('state', s => { if (G.mode === 'online' && G.opp) G.opp.setRemote(s); });
  net.on('strike', d => {
    if (G.mode !== 'online' || G.over) return;
    const r = G.me.resolveStrike(d.kind, { x: d.x, z: d.z }); showResult(r, G.opp, G.me); net.send('outcome', r);
  });
  net.on('outcome', r => { if (G.mode !== 'online') return; showResult(r, G.me, G.opp); G.me.applyOutcome(r); });
  net.on('rematch', () => { G.rematch[1] = true; if (G.rematch[0]) { $('result').classList.add('hidden'); startMatch('online'); } else $('resSub').textContent = 'Opponent wants a rematch!'; });
  net.on('peerleft', () => {
    if (G.mode === 'online' && !G.over) { G.opp.dead = true; G.opp.lives = 0; endMatch(true); $('resSub').textContent = 'Opponent left the duel.'; }
    else if (G.mode === 'menu' || $('lobby') && !$('lobby').classList.contains('hidden')) { $('onMsg').textContent = 'Connection closed.'; }
  });
}
bindNet();
async function connectNet() {
  $('onMsg').textContent = 'Connecting… (a sleeping free server can take up to a minute)'; S.serverUrl = $('serverUrl').value; save();
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
  if (!document.pointerLockElement && G.mode !== 'menu' && !G.over && $('result').classList.contains('hidden') && G.started && G.mode !== 'online') $('pause').classList.remove('hidden');
});

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.repeat) return; keys[e.code] = true;
  if (G.mode === 'menu' || G.over) return;
  if (e.code === 'KeyC') inp.guard = true; else if (e.code === 'KeyE') inp.heavy = 0.3; else if (e.code === 'Space') { inp.dodge = 0.25; G.spaceT = 0; e.preventDefault(); }
  else if (e.code === 'KeyF') inp.finisher = 0.4; else if (e.code === 'KeyQ') { G.lock = !G.lock; inp.lock = G.lock; if (!G.lock) rig.userT = 0; }
  else if (G.mode === 'training') {
    if (e.code === 'Digit1') G.ai.mode = 'dummy-idle'; else if (e.code === 'Digit2') G.ai.mode = 'dummy-block'; else if (e.code === 'Digit3') G.ai.mode = 'dummy-attack'; else if (e.code === 'Digit4') G.ai.mode = 'duel';
    else if (e.code === 'KeyR') { placeStart(0); rig.snapBehind(G.me); }
  }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyC') inp.guard = false; });
canvas.addEventListener('mousedown', e => {
  audio.resume();
  if (G.mode === 'menu' || G.over) return;
  if (!document.pointerLockElement) { tryLock(); return; }
  if (e.button === 0) inp.light = 0.3; else if (e.button === 2) inp.guard = true;
});
addEventListener('mouseup', e => { if (e.button === 2) inp.guard = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!document.pointerLockElement || G.mode === 'menu') return;
  if (G.lock && G.opp && !G.opp.dead) return;
  rig.mouse(e.movementX, e.movementY, S.sens, S.invert);
});

// ---------- HUD ----------
function updateHud() {
  const set = (hp, tr, po, f) => {
    const pc = Math.max(0, f.hp) / f.maxHp * 100 + '%'; $(hp).style.width = pc; $(tr).style.width = pc;
    const pe = $(po); pe.style.transform = `translateX(-50%) scaleX(${Math.min(1, f.posture / 100)})`;
    pe.parentElement.className = 'posture' + (f.act === 'guardBreak' ? ' broken' : f.posture > 66 ? ' warn' : '');
  };
  set('meHp', 'meHpTrail', 'mePost', G.me); set('oppHp', 'oppHpTrail', 'oppPost', G.opp);
  for (const [id, f] of [['meLives', G.me], ['oppLives', G.opp]]) { const el = $(id); if (G.mode === 'training') { el.style.visibility = 'hidden'; continue; } el.style.visibility = 'visible'; [...el.children].forEach((c, i) => c.classList.toggle('lost', i >= f.lives)); }
  // deathblow prompt only while the opponent is broken and in reach
  const { me, opp } = G, fin = $('fin');
  const canFin = opp && !opp.dead && opp.broken && opp.brokenLeft > 0.2 && Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z) < 3.6 && G.phase === 'fight' && me.act !== 'deathblow';
  if (canFin) { const p = new V3(opp.pos.x, 1.55 * opp.scaleF, opp.pos.z).project(camera); if (p.z < 1) { fin.style.display = 'block'; fin.style.left = (p.x * .5 + .5) * innerWidth + 'px'; fin.style.top = (-p.y * .5 + .5) * innerHeight + 'px'; fin.classList.toggle('late', opp.brokenLeft < 1); } else fin.style.display = 'none'; } else fin.style.display = 'none';
  const lk = $('lock'), locked = G.lock && opp && !opp.dead && G.phase === 'fight';
  if (locked) { const p = new V3(opp.pos.x, 1.3 * opp.scaleF, opp.pos.z).project(camera); if (p.z < 1) { lk.style.display = 'block'; lk.style.left = (p.x * .5 + .5) * innerWidth + 'px'; lk.style.top = (-p.y * .5 + .5) * innerHeight + 'px'; } else lk.style.display = 'none'; } else lk.style.display = 'none';
}

// ---------- loop ----------
let netT = 0, last = performance.now();
function adapt(raw) {
  G.fa = (G.fa || 0) + raw; G.fn = (G.fn || 0) + 1; if (G.fa < 2) return;
  const avg = G.fa / G.fn; G.fa = G.fn = 0;
  if (avg > 1 / 50 && G.pr > 0.6) { G.pr = Math.max(0.6, G.pr - 0.1); resize(); }
  else if (avg < 1 / 58 && G.pr < G.prMax) { G.pr = Math.min(G.prMax, G.pr + 0.05); resize(); }
  if (S.fps) $('fps').textContent = Math.round(1 / avg) + ' fps · render ' + Math.round(G.pr * 100) + '% · ' + G.q;
}
function frame(now) { requestAnimationFrame(frame); const raw = Math.min(0.1, (now - last) / 1000); last = now; step(Math.min(0.05, raw)); adapt(raw); }
const noInput = { move: new V3(), guard: false, light: 0, heavy: 0, dodge: 0, finisher: 0, lock: true };
function step(rawDt) {
  G.t += rawDt; G.phaseT += rawDt;
  let dt = rawDt;
  if (G.hs > 0) { G.hs -= rawDt; dt *= 0.06; }
  if (G.slowT > 0) { G.slowT -= rawDt; dt *= G.slow; }
  const { me, opp } = G;
  const dbA = me && (me.act === 'deathblow' ? me : opp && opp.act === 'deathblow' ? opp : null);
  if (dbA && G.phase === 'fight') {
    if (!rig.cine) rig.startCine({ type: 'deathblow', att: dbA, vic: dbA === me ? opp : me, sign: Math.random() < .5 ? 1 : -1 });
    if (dbA.t > 0.35 && dbA.t < 0.95) dt *= 0.35;
  } else if (rig.cine && rig.cine.type === 'deathblow' && G.phase === 'fight') { rig.endCine(me); }
  if (me) {
    if (G.mode === 'menu') { me.update(dt, null, opp); opp.update(dt, null, me); }
    else {
      const F = new V3(Math.sin(rig.yaw), 0, Math.cos(rig.yaw)), R = new V3(-F.z, 0, F.x);
      inp.move.set(0, 0, 0);
      const live = G.phase === 'fight' && !G.over;
      if (live) { if (keys.KeyW) inp.move.add(F); if (keys.KeyS) inp.move.sub(F); if (keys.KeyD) inp.move.add(R); if (keys.KeyA) inp.move.sub(R); }
      inp.walk = !!(keys.ShiftLeft || keys.ShiftRight); inp.aim.copy(F);
      if (keys.Space) G.spaceT = (G.spaceT || 0) + rawDt; inp.sprint = !!keys.Space && G.spaceT > 0.3;
      if (G.auto && live) { G.auto.think(dt, opp); me.update(dt, G.auto.inp, opp); for (const k of ['light', 'heavy', 'dodge', 'finisher']) G.auto.inp[k] = Math.max(0, G.auto.inp[k] - dt); }
      else me.update(dt, live ? inp : noInput, opp);
      if (live) { for (const k of ['light', 'heavy', 'dodge', 'finisher']) inp[k] = Math.max(0, inp[k] - dt); } else inp.light = inp.heavy = inp.dodge = inp.finisher = 0;
      if (G.mode === 'online') {
        opp.update(dt, null, me);
        netT += rawDt; if (netT > 0.04) { netT = 0; net.send('state', me.snapshot()); }
      } else {
        const ai = G.ai, ii = ai.inp;
        if (live) ai.think(dt, me); else { ii.move.set(0, 0, 0); ii.guard = false; ii.light = ii.heavy = ii.dodge = ii.finisher = 0; }
        opp.update(dt, ii, me);
        for (const k of ['light', 'heavy', 'dodge', 'finisher']) ii[k] = Math.max(0, ii[k] - dt);
      }
      fighterEvents(me); fighterEvents(opp);
      if (G.phase === 'intro' && G.phaseT > 2.5) beginFight();
      checkLives();
      if (opp.broken && ((G.bt = (G.bt || 0) - dt) < 0)) { G.bt = 0.35; fx.spark(new V3(opp.pos.x, 1.75 * opp.scaleF, opp.pos.z), 6, 2, 0xff6a20, 0.5); }
      updateHud();
    }
  }
  arena.update(rawDt); fx.update(dt, camera);
  rig.update(rawDt, { me, opp, locked: G.lock && G.mode !== 'menu', mode: G.mode });
  const mono = rig.cine && rig.cine.type === 'deathblow' && dbA && dbA.t > 0.55 && dbA.t < 0.85 ? 0.85 : 0;
  const dof = rig.cine ? rig.pos.distanceTo(rig.look) : 0;
  if (!G.noRender) post.frame(rawDt, { hp: me && G.mode !== 'menu' ? me.hp / me.maxHp : 1, sat: G.phase === 'downed' ? 0.35 : 1, mono, dof });
}
window.__snap = async (name, dt = 0.0001) => { step(dt); const url = canvas.toDataURL('image/png'); await fetch('/__shot?n=' + name, { method: 'POST', body: url }); return name; };

// ---------- boot ----------
const loader = new GLTFLoader();
Promise.all([loader.loadAsync('/assets/kd_ual1.glb'), loader.loadAsync('/assets/kd_ual2.glb')]).then(([a, b]) => { try {
  prepareClips(a, b);
  G.me = new Fighter(scene, a, 'player', 'You'); G.opp = new Fighter(scene, a, 'enemy', 'Enemy');
  menuPose(); applyQuality(); showScreen('menu');
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 700);
  last = performance.now(); requestAnimationFrame(frame);
} catch (e) { $('loading').textContent = 'Error: ' + e.stack; console.error(e); } }).catch(err => { $('loading').textContent = 'Failed to load: ' + err.message; console.error(err); });
