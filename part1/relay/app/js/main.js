import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildArena, MAPS } from './arena.js';
import { OUTFITS, WEAPONS } from './gear.js';
import { FX } from './fx.js';
import { Fighter, prepareClips } from './fighter.js';
import { MOVES } from './moves.js';
import { AI } from './ai.js';
import { Net } from './net.js';
import { CameraRig } from './camera.js';
import { Post } from './post.js';
import * as audio from './audio.js';
import { t, applyI18n, setLang, getLang, LANGS } from './i18n.js';
import { BINDS, actionsOf, isDown, mouseCode, keyOf, renderBinds, captureBind, isWaiting } from './binds.js';
import { CAM } from './camera.js';
import { SV_MAPS } from './maps.js';
import { Weather, setWorldQuality } from './world.js';
import { Hunt } from './modes/hunt.js';
import { Survival } from './modes/survival.js';
import { Team } from './modes/team.js';
import { foliageTick, setFoliageQuality, foliageCull } from './foliage.js';
import './tune.js';   // F9: live tuning panel
const { sfx } = audio;

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const defaults = { quality: 'auto', diff: 1, sens: 1, vol: 0.7, mvol: 0.5, invert: false, pvpPeril: false, serverUrl: '', fps: false, map: 'dojo', autoCam: true };
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
const camFill = new THREE.DirectionalLight(0xffd8b0, 0.55);   // per-map intensity: cfg.camFill camFill.position.set(0.6, 0.4, 1); camera.add(camFill); camFill.target.position.set(0, 0, -5); camera.add(camFill.target); scene.add(camera);
const arena = buildArena(scene, renderer);
const fx = new FX(scene);
const MAP_KEYS = Object.keys(MAPS);
function useMap(name) { if (name === 'random') name = MAP_KEYS[Math.random() * MAP_KEYS.length | 0]; G.mapName = name; arena.setMap(name); fx.amb.visible = arena.amb === 'embers'; arena.setQuality(G.q || 'high'); const c = arena.cfg; camFill.intensity = c.camFill ?? 0.55; post.setBloom(c.bloom); if (G.applyWx) G.applyWx(); }
const rig = new CameraRig(camera);
const post = new Post(renderer, scene, camera);
function gpuTier() {   // discrete NVIDIA/AMD (e.g. Lenovo LOQ RTX) -> high, Apple Silicon -> medium, others -> low
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'), r = (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/nvidia|geforce|rtx|radeon rx|radeon pro/.test(r)) return 'high'; if (/apple/.test(r)) return 'med'; return 'low'; } catch (e) { return 'med'; }
}
function applyQuality() {
  const ultra = S.quality === 'ultra', q = S.quality === 'auto' ? (G.autoTier || gpuTier()) : ultra ? 'high' : S.quality, dpr = window.devicePixelRatio || 1;
  G.ultra = ultra; setFoliageQuality(ultra ? 'ultra' : q);
  setWorldQuality(q);
  G.q = q; G.prMax = q === 'low' ? Math.min(dpr, 0.75) : q === 'med' ? Math.min(dpr, 1.0) : ultra ? Math.min(dpr, 2) : Math.min(dpr, 1.35); G.pr = G.prMax;
  arena.setQuality(q); post.setQuality(q); fx.density = q === 'low' ? 0.55 : 1; renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  resize();
}
const _sv = new V3(), _cd = new V3();
function sunHaze() {   // where the key light sits on screen + how much the camera faces it (Grade pass: halo and god rays)
  const c = arena.cfg, L = c.sunL; if (!L || !c.haze) { post.sun(null); return; }
  _sv.copy(L.position).sub(L.target.position).normalize(); camera.getWorldDirection(_cd); const face = _cd.dot(_sv);
  if (face <= 0.05) { post.sun(null); return; }
  const p = _sv.clone().multiplyScalar(400).add(camera.position).project(camera);
  post.sun((p.x + 1) / 2, (p.y + 1) / 2, c.haze * Math.min(1, (face - 0.05) / 0.5), L.color);
}
function resize() { renderer.setPixelRatio(G.pr); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.setSize(innerWidth, innerHeight, G.pr); }
addEventListener('resize', resize);

// ---------- game state ----------
const G = { mode: 'menu', me: null, opp: null, ai: null, net: new Net(), over: true, lock: true, hs: 0, t: 0, started: false, rematch: [false, false], phase: 'menu', phaseT: 0, slow: 1, slowT: 0, q: 'high', pr: 1, prMax: 1 };
window.__dbg = { renderer, scene, camera, post, rig, fx, AI, MOVES, arena, startMode: (k, o) => startMode(k, o), CTX: () => CTX, setLook: (...a) => setLook(...a), REC: () => REC, useMap: n => useMap(n), lockSweep: dx => lockSweep(dx), toggleLock: () => toggleLock(), camAngle: f => camAngle(f) }; window.__G = G; window.__step = dt => step(dt); window.__cam = () => camera;
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
const HITSTOP = { light: 0.09, heavy: 0.14 };   // clean-hit freeze (s)
// point on the victim's body closest to the attacker's blade (for blood/spark placement)
function bladeContact(att, vic) {
  if (!att.bladeBase || !att.bladeTip) return null;
  const a = new V3(vic.pos.x, 0.4, vic.pos.z), b = new V3(vic.pos.x, 1.7 * vic.scaleF, vic.pos.z); let best = null, bd = 9;
  for (let s = 0.3; s <= 1.001; s += 0.1) { const p = att.bladeBase.clone().lerp(att.bladeTip, s), ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())), q = a.clone().addScaledVector(ab, t), d = q.distanceTo(p); if (d < bd) { bd = d; best = q.lerp(p, 0.6); } }
  return bd < 0.8 ? best : null;
}
// where two blades actually meet: closest points of both blade segments; if they are apart, the point of the attacker's
// blade nearest the defender's guard. Used for parry visuals (the defender's blade is IK'd onto it) and for the sparks.
function segClosest(a0, a1, b0, b1) {
  const d1 = a1.clone().sub(a0), d2 = b1.clone().sub(b0), r = a0.clone().sub(b0), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-6 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0, t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
  const p = a0.clone().addScaledVector(d1, s), q = b0.clone().addScaledVector(d2, t); return { p, q, d: p.distanceTo(q) };
}
function bladeMeet(att, vic) {
  if (att.bladeBase && att.bladeTip && vic.bladeBase && vic.bladeTip) { const k = segClosest(att.bladeBase, att.bladeTip, vic.bladeBase, vic.bladeTip); if (k.d < 0.22) return k.p.lerp(k.q, 0.5); }
  if (att.bladeBase && att.bladeTip) { const g = vic.hitPoint.clone().addScaledVector(vic.fwd, 0.45); g.y = 1.3 * vic.scaleF;
    const ab = att.bladeTip.clone().sub(att.bladeBase), u = Math.max(0.35, Math.min(0.95, g.clone().sub(att.bladeBase).dot(ab) / ab.lengthSq())); const p = att.bladeBase.clone().addScaledVector(ab, u);
    if (p.distanceTo(g) < 1.1) return p; }
  return contactPoint(att, vic);
}
function contactPoint(att, vic) {   // where the blades meet: closest point on the defender's blade to the attacker's tip
  if (vic.bladeBase && att.bladeTip) { const a = vic.bladeBase, b = vic.bladeTip, ab = b.clone().sub(a), t = Math.max(0, Math.min(1, att.bladeTip.clone().sub(a).dot(ab) / ab.lengthSq())); const p = a.clone().addScaledVector(ab, t); if (p.y > 0.4 && p.distanceTo(vic.hitPoint) < 1.3) return p; }
  const p = vic.hitPoint.clone().lerp(att.hitPoint, 0.35); p.y = 1.35; return p;
}
const QUIET_RIG = { shake() {}, punch() {}, tilt() {}, kick() {} }, QUIET_POST = { impact() {} };
const RIG = rig, POST = post, SCREEN_FLASH = (...a) => screenFlash(...a), BANNER = (...a) => banner(...a);
function showResult(r, att, vic, quiet = false) {
  const rig = quiet ? QUIET_RIG : RIG, post = quiet ? QUIET_POST : POST, screenFlash = quiet ? () => {} : SCREEN_FLASH, banner = quiet ? () => {} : BANNER;
  const HS = v => { if (!quiet) G.hs = v; };
  const meet = ['deflect', 'clash', 'block'].includes(r.res) ? bladeMeet(att, vic) : null;
  if (meet) { vic.meetBlade(meet, att, false, r.res); att.meetBlade(meet, vic, true, r.res); }
  if (!r || r.res === 'miss') return;
  const mine = att === G.me || vic === G.me, dir = new V3(vic.pos.x - att.pos.x, 0, vic.pos.z - att.pos.z).normalize();
  const camDir = dir.clone(); camDir.y = 0;
  switch (r.res) {
    case 'deflect': {
      const p = meet, sprayDir = dir.clone().negate().add(new V3(0, 0.6, 0)).normalize();
      if (vic === G.me) REC.parries++;
      fx.deflect(p, sprayDir, r.heavy); sfx.deflect(r.heavy); HS(r.heavy ? 0.16 : 0.12); rig.shake(0.38); rig.punch(5); rig.tilt((Math.random() < .5 ? -1 : 1) * 0.6); rig.kick(camDir, -1.2);
      post.impact({ aberr: 0.012, radial: 0.012, flash: 0.06, flashCol: 0xfff2d0, center: toScreen(p) });
      break;
    }
    case 'clash': { const p = meet; fx.clash(p, new V3(0, 1, 0)); sfx.clash(); HS(0.14); rig.shake(0.4); rig.punch(4); post.impact({ aberr: 0.015, radial: 0.015, center: toScreen(p) }); banner('鍔迫り', '#ffd9a0'); break; }
    case 'block': { const p = meet; fx.block(p, r.heavy, dir.clone().negate().add(new V3(0, .5, 0)).normalize()); sfx.block(r.heavy); HS(r.heavy ? 0.07 : 0.045); rig.shake(r.heavy ? 0.28 : 0.14); rig.punch(r.heavy ? 2.5 : 1); break; }
    case 'hit': {
      let p = bladeContact(att, vic); if (!p) { p = vic.hitPoint.clone(); p.y = 1.2 + Math.random() * 0.3; }
      fx.hit(p, dir.clone().add(new V3(0, 0.3, 0)).normalize(), r.heavy); fx.spark(p, r.heavy ? 26 : 14, 6, 0xffc080, 0.25, dir, 0.7); sfx.hit(r.heavy, vic.armored); if (att.trail && att.trail.cutFlash) att.trail.cutFlash();
      vic.flashT = 0.08; HS(r.heavy ? HITSTOP.heavy : HITSTOP.light); rig.shake(r.heavy ? 0.4 : 0.22); rig.punch(r.heavy ? 3 : 1.5); if (vic === G.me) { screenFlash('#a00000', 0.22, 350); rig.kick(camDir, 1.5); post.impact({ aberr: 0.02 }); }
      break;
    }
    case 'dodge': break;
    case 'grabbed': {   // grab scene: knee (impact now) + kick (impact later)
      const p = vic.hitPoint.clone(); fx.hit(p, dir.clone().add(new V3(0, 0.4, 0)).normalize(), true); sfx.hit(true, vic.armored); HS(0.12); rig.shake(0.35); rig.punch(3); vic.flashT = 0.08;
      if (att === G.me) banner('掴', '#ffd0a0'); if (vic === G.me) screenFlash('#a00000', 0.25, 400);
      setTimeout(() => { if (!vic.pos) return; const q = vic.hitPoint.clone(); fx.hit(q, dir, true); fx.dust(vic.pos, 14); sfx.hit(true, vic.armored); if (!quiet) { G.hs = 0.1; rig.shake(0.45); } }, 1050);
      break;
    }
    case 'vaulted': { fx.dust(vic.pos, 14); fx.spark(vic.hitPoint, 24, 5, 0xffd090, 0.3); sfx.block(true); HS(0.1); rig.shake(0.3); if (att === G.me) banner('跳', '#fff4dc'); break; }
    case 'immune': { const p = bladeContact(att, vic) || vic.hitPoint.clone(); fx.spark(p, 8, 3, 0x9a8a7a, 0.2); sfx.immune(); if (att === G.me) toast(t('toast.fin', { F: keyOf('finisher') })); break; }
    case 'jumped': { const p = vic.pos.clone().setY(0.25); fx.dust(vic.pos, 18); fx.spark(p, 30, 6, 0xffd090, 0.35); sfx.mikiri(); HS(0.14); rig.shake(0.3); rig.punch(3); if (vic === G.me) banner('跳', '#fff4dc', true); break; }
    case 'mikiri': { const p = att.hitPoint.clone().lerp(vic.hitPoint, 0.5); fx.mikiri(p); sfx.mikiri(); HS(0.22); rig.shake(0.5); rig.punch(5); banner('見切り', '#fff4dc', true); post.impact({ radial: 0.03, flash: 0.2, center: toScreen(p) }); break; }
    case 'finisher': {
      if (att === G.me) REC.deathblows++;
      const p = vic.hitPoint.clone(); fx.finisher(p, dir); HS(r.killed ? 0.45 : 0.28); rig.shake(0.7); rig.punch(5); screenFlash('#ff0000', 0.35, 700);
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
const ARENA_SURF = { dojo: 'wood', sakura: 'wood', snow: 'snow', bamboo: 'stone' };   // duel arenas: what the fighting floor is made of
// leaves / petals where there is foliage: sakura arena (petals), open maps (dry leaves)
function kickLeaves(pos, n) { if (arena.amb === 'petals') fx.leaves(pos, n, 0xa8242a); else if (G.ctl && G.ctl.W) fx.leaves(pos, n, Math.random() < 0.5 ? 0xa0682a : 0x6a7a34); }
function fighterEvents(f) {
  for (const e of f.events) {
    if (e.type === 'perilous') { fx.perilous(f); sfx.perilous(); }
    else if (e.type === 'broken') { if (f !== G.me || G.mode === 'online') {} }
    else if (e.type === 'revive') { fx.revive(new V3(f.pos.x, 1, f.pos.z)); sfx.revive(); }
    else if (e.type === 'dodge') { fx.dust(f.pos, 8); kickLeaves(f.pos, 7); }
    else if (e.type === 'land' || e.type === 'fall') { const d = camera.position.distanceTo(f.pos), k = Math.max(0, 1 - d / 22) * (e.data && e.data.k || 1); if (k > 0.02) { e.type === 'land' ? sfx.land() : sfx.bodyfall(); const surf = G.ctl && G.ctl.W ? G.ctl.W.surfaceAt(f.pos.x, f.pos.z) : ARENA_SURF[G.mapName] || 'stone'; sfx.step(1.3 * k, surf); } }
    else if (e.type === 'step') { const d = camera.position.distanceTo(f.pos); if (d < 14) sfx.step((e.data && e.data.sprint ? 1.6 : 1) * (1 - d / 14), G.ctl && G.ctl.W ? G.ctl.W.surfaceAt(f.pos.x, f.pos.z) : ARENA_SURF[G.mapName] || 'stone'); if (e.data && e.data.sprint) fx.dust(f.pos, 3); }
    else if (e.type === 'slam') { fx.dust(f.pos, 34); kickLeaves(f.pos, 16); fx.ring(new V3(f.pos.x, 0.06, f.pos.z), 1.4, 0.35, 0xc8b49a); sfx.slam(); const near = G.me && Math.hypot(G.me.pos.x - f.pos.x, G.me.pos.z - f.pos.z); rig.shake(f === G.me ? 0.45 : near < 6 ? 0.25 : 0.1); if (f === G.me) rig.punch(2.5); }
  }
  f.events.length = 0;
}

// ---------- wallet, skins, weapons ----------
const coinFmt = n => '◎ ' + Math.round(n).toLocaleString();
function showCoins() { $('coinMenu').textContent = coinFmt(REC.coins); $('coinShop').textContent = coinFmt(REC.coins); const h = $('coinHud'); h.textContent = G.mode === 'gauntlet' && G.run ? coinFmt(G.run.coins) + '  (run)' : ''; }
function addCoins(n) { n = Math.round(n); if (n <= 0) return 0; REC.coins += n; if (G.run && G.mode === 'gauntlet') G.run.coins += n; saveRec(); showCoins(); toast('+' + n + ' ◎'); sfx.coin(); return n; }
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
const FCOPY = ['pos', 'yaw', 'maxHp', 'hp', 'lives', 'posture', 'remote', 'onStrike', 'tempo', 'dmgMul', 'fMul', 'parryWin', 'iExtra', 'postRegen', 'dead', 'invuln'];
// swap a fighter's look (skin / weapon) by rebuilding it; gameplay state is carried over
function setLook(isMe, style, weapon) {
  const old = isMe ? G.me : G.opp; if (old && old.style === style && old.weapon === weapon) return old;
  const f = new Fighter(scene, G.base, style, isMe ? 'You' : 'Enemy', weapon);
  if (old) { for (const k of FCOPY) { if (k === 'pos') f.pos.copy(old.pos); else f[k] = old[k]; } f.restyle(null, old.scaleF); old.dispose(); }
  if (isMe) G.me = f; else G.opp = f;
  if (G.ai && !isMe) G.ai.f = f; if (G.auto && isMe) G.auto.f = f;
  return f;
}
const ENEMY_LOOK = [['ashina', 'standard'], ['oni', 'kuro'], ['kage', 'mortal']];

// ---------- match flow ----------
const START_D = 3.6;
function placeStart(slot) {
  const { me, opp } = G, z = slot === 0 ? -START_D : START_D;
  me.spawn(0, z, slot === 0 ? 0 : Math.PI); opp.spawn(0, -z, slot === 0 ? Math.PI : 0);
}
function startMatch(mode) {
  G.mode = mode; G.over = false; G.started = true; G.rematch = [false, false];
  const slot = mode === 'online' ? G.net.slot : 0;
  setLook(true, REC.skin, REC.weapon);
  if (mode === 'ai') setLook(false, ...ENEMY_LOOK[+S.diff]); else if (mode === 'training') setLook(false, 'ashina', 'standard'); else if (mode === 'gauntlet') setLook(false, G.boss.look[0], G.boss.look[1]);
  if (mode !== 'gauntlet' && S.map) useMap(S.map);
  const { me, opp } = G;
  me.remote = false; opp.remote = mode === 'online';
  const gaunt = mode === 'gauntlet';
  if (!gaunt) { applyStats([]); applyBoss(null); }
  placeStart(slot);
  me.lives = mode === 'training' ? 99 : 2 + (gaunt ? G.extraLife : 0); opp.lives = mode === 'training' ? 99 : 2; me.invuln = opp.invuln = true;
  me.onStrike = onStrike; opp.onStrike = mode === 'online' ? null : onStrike;
  G.ai = mode === 'online' ? null : new AI(opp, gaunt ? G.boss.level : +S.diff, gaunt ? G.boss.ai : null);
  if (mode === 'training') G.ai.mode = 'dummy-idle';
  G.lock = true; inp.lock = true; G.lockPick = null;
  $('oppName').textContent = gaunt ? G.boss.name.toUpperCase() : mode === 'online' ? 'OPPONENT' : mode === 'training' ? 'TRAINING DUMMY' : ['ASHIKAGA RONIN', 'KURO THE BLADE', 'ISSHIN, SWORD SAINT'][+S.diff];
  renderHelp(mode);
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
  // rewards are banked immediately, so leaving at any moment keeps them
  let earned = 0;
  if (G.mode === 'gauntlet') {
    if (win) { const D = GDIFF[G.run.diff], n = G.run.stage, flawless = G.me.lives >= 2 + G.extraLife; earned = addCoins((45 + 20 * n) * D.coin * (flawless ? 1.3 : 1)); G.run.stage++; REC.wins++; REC.bestBy[G.run.diff] = Math.max(REC.bestBy[G.run.diff] || 0, G.run.stage); REC.best = Math.max(REC.best, G.run.stage); }
  } else if (G.mode === 'ai') { earned = addCoins(win ? [30, 60, 110][+S.diff] : 10); if (win) REC.wins++; }
  else if (G.mode === 'online') { earned = addCoins(win ? 80 : 25); if (win) REC.wins++; }
  saveRec();
  setTimeout(() => {
    if (G.mode === 'menu') return;
    document.exitPointerLock && document.exitPointerLock();
    if (G.mode === 'gauntlet' && win) { showPerks(); return; }
    const g = G.mode === 'gauntlet';
    $('resBig').textContent = g ? t('res.run') : win ? t('res.win') : t('res.lose'); $('resBig').className = win ? 'win' : 'lose';
    $('resSub').innerHTML = (g ? 'Bosses defeated: ' + G.run.stage + ' · Best (' + GDIFF[G.run.diff].name + '): ' + (REC.bestBy[G.run.diff] || 0) + '<br>Coins this run: ' + coinFmt(G.run.coins) : (win ? t('res.winSub') : t('res.loseSub')) + (earned ? '<br>+' + earned + ' ◎' : '')) + '<br>Wallet: ' + coinFmt(REC.coins);
    $('result').classList.remove('hidden'); $('bRematch').textContent = g ? t('res.newrun') : t('res.rematch');
  }, 3600);
}

// ---------- gauntlet: endless run of bosses, three difficulties ----------
// coin: reward multiplier · perk: strength of upgrades · hp/dmg/tempo/ai: growth per stage (forever) · lvl: AI tier bonus
// boost: flat behaviour boost from stage 1 · mob: map mobility (strafing, side-steps, back-steps, flanking)
const GDIFF = {
  easy: { name: 'Easy', coin: 0.6, perk: 1.5, hp: 0.07, dmg: 0.045, tempo: 0.012, ai: 0.02, lvl: 0, mob: 0.15, boost: {}, desc: 'Fewer coins · upgrades 150% strength · gentle growth' },
  normal: { name: 'Normal', coin: 1.0, perk: 0.8, hp: 0.13, dmg: 0.08, tempo: 0.022, ai: 0.035, lvl: 1, mob: 0.55, boost: { react: 0.12, deflect: 0.1, aggr: 0.06, punish: 0.15 }, desc: 'More coins · upgrades 80% · bosses tough and mobile' },
  hard: { name: 'Hard', coin: 1.7, perk: 0.5, hp: 0.18, dmg: 0.11, tempo: 0.032, ai: 0.05, lvl: 2, mob: 0.9, boost: { react: 0.22, deflect: 0.18, aggr: 0.12, punish: 0.3 }, desc: 'Most coins · upgrades 50% · relentless, agile masters' },
};
const BOSSES = [
  { name: 'Reed Ronin', line: 'A wandering swordsman. Slow, patient, honest.', look: ['ronin', 'standard'], hp: 90, dmg: 0.95, tempo: 0.95, level: 0, ai: { moves: { slash: 6, heavy: 2, dash: 0.5 } } },
  { name: 'Kuro the Quickdraw', line: 'Closes ten paces in a heartbeat. Deflect the dash.', look: ['shinobi', 'kuro'], hp: 100, dmg: 1.05, tempo: 1.15, level: 1, ai: { aggr: 0.66, mobility: 0.6, moves: { slash: 4, dash: 4, uppercut: 1.5, thrust: 0.8, sweep: 1 } } },
  { name: 'Tessen the Brute', line: 'Every swing can end you. Read the wind-up.', look: ['oni', 'crimson'], hp: 150, dmg: 1.5, tempo: 0.9, scale: 1.12, level: 1, ai: { react: 0.4, moves: { slash: 2, heavy: 4, heavyB: 2.5, leap: 2.5, kick: 2, sweep: 2 } } },
  { name: 'Akane, Mirror Blade', line: 'She deflects everything. Break her rhythm.', look: ['ashina', 'frost'], tint: 0x6a2a7a, hp: 110, dmg: 1.1, tempo: 1.1, level: 2, ai: { react: 0.95, deflect: 0.85, aggr: 0.45, mobility: 0.5, moves: { slash: 5, thrust: 2.5, uppercut: 1.5 } } },
  { name: 'Isshin, Sword Saint', line: 'The strongest blade in the land.', look: ['kensei', 'mortal'], hp: 160, dmg: 1.3, tempo: 1.15, scale: 1.06, level: 2, ai: { mobility: 0.6, moves: { sweep: 1.6 } } },
];
const PERKS = [
  { id: 'vit', name: 'Iron Body', d: m => `+${Math.round(25 * m)} max health`, max: 3 }, { id: 'wrist', name: 'Mirror Wrist', d: m => `Deflect window +${(0.05 * m).toFixed(3)} s`, max: 2 },
  { id: 'mind', name: 'Calm Mind', d: m => `Posture recovers ${Math.round(40 * m)}% faster`, max: 3 }, { id: 'edge', name: 'Keen Edge', d: m => `+${Math.round(20 * m)}% damage`, max: 3 },
  { id: 'exe', name: 'Executioner', d: m => `Deathblow deals +${Math.round(25 * m)}% more`, max: 2 }, { id: 'step', name: 'Wind Step', d: m => `Dodge invincibility +${(0.08 * m).toFixed(2)} s`, max: 2 },
  { id: 'life', name: 'Second Wind', d: () => '+1 extra life in every fight', max: 1 },
];
const REC_KEY = 'kd-rec'; const REC = { best: 0, runs: 0, wins: 0, parries: 0, deathblows: 0, coins: 0, bestBy: {}, skins: ['shinobi', 'ashina'], weapons: ['standard'], skin: 'shinobi', weapon: 'standard' };
try { Object.assign(REC, JSON.parse(localStorage.getItem(REC_KEY) || '{}')); } catch (e) { }
if (!OUTFITS[REC.skin]) REC.skin = 'shinobi'; if (!WEAPONS[REC.weapon]) REC.weapon = 'standard';
function showRec() { $('rec').textContent = REC.runs || REC.wins ? `Best run: ${REC.best} bosses · duels won ${REC.wins} · deflects ${REC.parries} · deathblows ${REC.deathblows}` : ''; }
function saveRec() { try { localStorage.setItem(REC_KEY, JSON.stringify(REC)); } catch (e) { } showRec(); }
const cap = (v, m) => Math.min(m, v);
function bossFor(n, diff) {
  const b = BOSSES[n % BOSSES.length], loop = Math.floor(n / BOSSES.length), D = GDIFF[diff];
  const base = diff === 'hard' ? 1.25 : diff === 'normal' ? 1.1 : 1;
  const ai = { ...b.ai }, P = { react: 0.5, deflect: 0.4, aggr: 0.5, punish: 0.5, err: 0.05 };
  for (const k of ['react', 'deflect', 'aggr', 'punish']) ai[k] = cap((ai[k] ?? P[k]) + (D.boost[k] || 0) + D.ai * n * (k === 'aggr' ? 0.6 : 1), k === 'deflect' ? 0.92 : 0.97);
  ai.err = Math.max(0.012, (ai.err ?? (b.level === 2 ? 0.03 : 0.05)) * Math.max(0.35, 1 - D.ai * n * 1.5));
  ai.mobility = cap(Math.max(ai.mobility || 0, D.mob) + n * 0.05, 1);
  ai.track = 4 + b.level * 1.5 + D.lvl + n * 0.25;
  return { ...b, name: loop ? b.name + ' ' + '★'.repeat(Math.min(loop, 5)) + (loop > 5 ? ' ' + loop : '') : b.name,
    hp: Math.round(b.hp * base * (1 + D.hp * n)), dmg: b.dmg * base * (1 + D.dmg * n), tempo: cap(b.tempo * (1 + D.tempo * n), 1.6), level: Math.min(2, b.level + D.lvl), ai };
}
function applyStats(perks, mul = 1) {
  const n = id => perks.filter(p => p === id).length, m = G.me;
  m.maxHp = Math.round(100 + 25 * mul * n('vit')); m.parryWin = 0.2 + 0.05 * mul * n('wrist'); m.postRegen = 1 + 0.4 * mul * n('mind'); m.dmgMul = 1 + 0.2 * mul * n('edge'); m.fMul = 1 + 0.25 * mul * n('exe'); m.iExtra = 0.08 * mul * n('step'); G.extraLife = n('life');
}
function applyBoss(b) { const o = G.opp; o.maxHp = b ? b.hp : 100; o.dmgMul = b ? b.dmg : 1; o.tempo = b ? b.tempo : 1; o.fMul = 1; o.restyle(b && b.tint ? b.tint : null, b ? b.scale || 1 : 1); }
function startRun(diff) { G.run = { stage: 0, perks: [], diff, coins: 0 }; REC.runs++; saveRec(); introStage(); }
function introStage() {
  G.mode = 'menu'; G.over = true; const b = G.boss = bossFor(G.run.stage, G.run.diff);
  setLook(true, REC.skin, REC.weapon); setLook(false, b.look[0], b.look[1]); applyBoss(b); applyStats(G.run.perks, GDIFF[G.run.diff].perk);
  useMap(G.run.stage % 2 === 0 && S.map !== 'random' ? S.map : MAP_KEYS[G.run.stage % MAP_KEYS.length]);
  menuPose();
  $('inStage').textContent = GDIFF[G.run.diff].name.toUpperCase() + ' · STAGE ' + (G.run.stage + 1) + (G.run.stage >= BOSSES.length ? ' · ENDLESS' : '') + ' · ' + MAPS[arena.name];
  $('inName').textContent = b.name; $('inLine').textContent = b.line + '   (HP ' + b.hp + ' · speed ' + Math.round(b.tempo * 100) + '%)';
  showScreen('intro'); clearTimeout(G.introT); G.introT = setTimeout(beginStage, 3400); sfx.ui();
}
function beginStage() { clearTimeout(G.introT); if (!$('intro').classList.contains('hidden')) startMatch('gauntlet'); }
function showPerks() {
  const mul = GDIFF[G.run.diff].perk, have = G.run.perks, elig = PERKS.filter(p => have.filter(x => x === p.id).length < p.max).sort(() => Math.random() - .5).slice(0, 3);
  const list = $('perkList'); list.innerHTML = '';
  for (const p of elig) { const b = document.createElement('button'); b.className = 'perk'; b.innerHTML = `<b>${p.name}</b><span>${p.d(mul)}</span>`; b.onclick = () => { have.push(p.id); sfx.ui(); introStage(); }; list.appendChild(b); }
  if (!elig.length) { const b = document.createElement('button'); b.className = 'perk'; b.innerHTML = '<b>Onward</b><span>All upgrades taken</span>'; b.onclick = () => introStage(); list.appendChild(b); }
  $('perkHave').innerHTML = 'Defeated: ' + G.run.stage + ' · Run coins: ' + coinFmt(G.run.coins) + '<br>Upgrades: ' + (have.length ? have.map(id => PERKS.find(p => p.id === id).name).join(', ') : 'none');
  const q = document.createElement('button'); q.className = 'back'; q.textContent = 'Leave run (coins are kept)'; q.onclick = () => toMenu(); list.appendChild(q);
  showScreen('perks');
}
function menuPose() {
  G.me.remote = G.opp.remote = false; G.me.spawn(-1.5, 0.3, Math.PI / 2 - 0.3); G.opp.spawn(1.5, -0.3, -Math.PI / 2 - 0.3); G.me.onStrike = G.opp.onStrike = null;
}
function toMenu() {
  stopMode(); clearTimeout(G.introT); saveRec(); G.run = null;
  G.mode = 'menu'; G.phase = 'menu'; G.over = true; G.net.close(); G.ai = null; G.auto = null; rig.endCine(); $('title').classList.remove('show');
  if (G.me) { setLook(true, REC.skin, REC.weapon); setLook(false, 'ashina', 'standard'); applyStats([]); applyBoss(null); }
  useMap(S.map);
  if (document.pointerLockElement) document.exitPointerLock();
  menuPose(); showScreen('menu'); showCoins();
}function tryLock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }

// ---------- online ----------
const net = G.net;
function bindNet() {
  net.on('roster', d => { if (d && d.slots && !G.ctl) renderRoster(d.slots); });
  net.on('start', d => { $('onMsg').textContent = ''; const m = (d && d.meta) || net.meta || {}; if (m.mode === 'team') { $('tLobby').classList.add('hidden'); startMode('team', { online: true, params: m.params, slots: d.slots }); } else if (m.mode === 'hunt' || m.mode === 'survival') startMode(m.mode, { online: true, params: m.params }); else startMatch('online'); });
  net.on('round', () => { if (G.mode === 'online' && !G.over && G.downed === G.opp) doRevive(G.opp); });
  net.on('state', s => { if (G.mode !== 'online' || !G.opp) return; if (s.lk && s.lk !== G.opp.style + '|' + G.opp.weapon) { const [st, wp] = s.lk.split('|'); if (OUTFITS[st] && WEAPONS[wp]) { setLook(false, st, wp); G.opp.remote = true; G.opp.onStrike = null; } } G.opp.setRemote(s); });
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
  if (t === 'menu') { net.close(); for (const l of ['lobby', 'hLobby', 'sLobby', 'tLobby']) $(l).classList.add('hidden'); toMenu(); }
  else if (t === 'duelMenu') showScreen('duelMenu');
  else if (t === 'huntSetup') { syncSrv(); showScreen('huntSetup'); }
  else if (t === 'svSetup') { syncSrv(); showScreen('svSetup'); }
  else if (t === 'teamSetup') { syncSrv(); renderTeamMaps(); showScreen('teamSetup'); }
  else if (t === 'ai') startMatch('ai');
  else if (t === 'gauntlet') { renderGDiff(); showScreen('gdiff'); }
  else if (t === 'shop') { renderShop(); showScreen('shop'); }
  else if (t === 'training') startMatch('training');
  else if (t === 'online') { $('lobby').classList.add('hidden'); $('onMsg').textContent = ''; $('serverUrl').value = S.serverUrl; showScreen('online'); }
  else if (t === 'settings') showScreen('settings');
  else if (t === 'quit') window.close();
});
const bind = (id, key, fmt) => {
  const el = $(id); if (el.type === 'checkbox') el.checked = S[key]; else el.value = S[key];
  el.oninput = el.onchange = () => { S[key] = el.type === 'checkbox' ? el.checked : el.value; save(); if (key === 'quality') applyQuality(); if (key === 'vol') audio.setVolume(+S.vol); if (key === 'mvol') audio.music.setVolume(+S.mvol); if (fmt) $(fmt).textContent = (+S[key]).toFixed(2); };
  if (fmt) $(fmt).textContent = (+S[key]).toFixed(2);
};
bind('sQuality', 'quality'); bind('sDiff', 'diff'); bind('sSens', 'sens', 'vSens'); bind('sVol', 'vol', 'vVol'); bind('sMvol', 'mvol', 'vMvol'); audio.music.setVolume(+S.mvol); bind('sInvert', 'invert'); bind('sFps', 'fps'); bind('sAutoCam', 'autoCam'); $('sAutoCam').addEventListener('change', () => { rig.autoFollow = !!S.autoCam; }); rig.autoFollow = !!S.autoCam;
{ const sl = $('sLang'); for (const [k, n] of Object.entries(LANGS)) { const o = document.createElement('option'); o.value = k; o.textContent = n; sl.appendChild(o); } sl.value = getLang(); sl.onchange = () => { setLang(sl.value); refreshTexts(); }; } $('sFps').addEventListener('change', () => { $('fps').style.display = S.fps ? 'block' : 'none'; }); $('fps').style.display = S.fps ? 'block' : 'none'; showRec();
$('bResume').onclick = () => { $('pause').classList.add('hidden'); tryLock(); };
$('bQuitMatch').onclick = () => { $('pause').classList.add('hidden'); toMenu(); };
$('intro').onclick = beginStage;
$('bResMenu').onclick = () => { $('result').classList.add('hidden'); toMenu(); };
$('bRematch').onclick = () => {
  if (G.ctl) { G.ctl.requestRematch(); return; }
  if (G.mode === 'gauntlet') { $('result').classList.add('hidden'); startRun(G.run ? G.run.diff : 'normal'); }
  else if (G.mode === 'online') { G.rematch[0] = true; net.send('rematch', 1); $('bRematch').textContent = 'Waiting…'; if (G.rematch[1]) { $('result').classList.add('hidden'); startMatch('online'); } }
  else { $('result').classList.add('hidden'); startMatch(G.mode); }
};
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.mode !== 'menu' && !G.over && $('result').classList.contains('hidden') && G.started && G.mode !== 'online' && !(G.ctl && G.ctl.online) && $('upgrades').classList.contains('hidden')) $('pause').classList.remove('hidden');
});

// ---------- controls / mechanics panel (bottom of the HUD), built from the current key map + language ----------
function renderHelp(mode) {
  clearTimeout(G.hintT); $('hint').classList.remove('mini'); G.hintT = setTimeout(() => $('hint').classList.add('mini'), 12000);   // collapses to the key line; H toggles
  const k = a => `<kbd>${keyOf(a)}</kbd>`;
  $('hint').innerHTML = `<div>${k('light')} ${t('h.keys')} · ${k('heavy')} ${t('h.heavy')} · ${k('guard')} ${t('h.guard')} · ${k('dodge')} ${t('h.dodge')} · ${k('jump')} ${t('h.jump')} · ${k('sprint')} ${t('h.sprint')} · ${k('walk')} ${t('h.walk')} · ${k('lock')} ${t('h.lock')}</div>`
    + `<div>${t('h.parry')} · ${t('h.posture', { F: k('finisher') })}</div><div>${t('h.peril')}</div><div class="dim">${t('h.links')}</div>`
    + (mode === 'training' ? `<div class="dim">${t('h.train')}</div>` : '')
    + (mode === 'hunt' ? `<div>${k('crouch')} ${t('h.crouch')} · ${k('lure')} ${t('h.lure')}</div><div class="dim">${t('h.ambush')}</div>` : '')
    + (mode === 'survival' ? `<div>${k('interact')} ${t('h.interact')}</div><div class="dim">${t('h.coop')}</div>` : '');
}
// ---------- lock-on (Sekiro-style) ----------
// The player owns the target: it changes only when they sweep the mouse left/right while locked (moves to the nearest
// enemy on that side of the screen), when it dies / walks out of range (lock passes to the enemy nearest the screen
// centre), or when they press deathblow next to another broken enemy. Modes ask pickTarget(foes) every frame.
let swAcc = 0, swT = 0, swCd = 0;
const _cf = new V3(), _cr = new V3(), _cv = new V3();
function camAngle(f) {   // horizontal angle of an enemy from the camera's view direction (+ = right of centre)
  camera.getWorldDirection(_cf); _cf.y = 0; _cf.normalize(); _cr.set(-_cf.z, 0, _cf.x);
  _cv.set(f.pos.x - camera.position.x, 0, f.pos.z - camera.position.z); return Math.atan2(_cv.dot(_cr), _cv.dot(_cf));
}
const inReach = f => f && !f.dead && G.me && f.pos.distanceTo(G.me.pos) < CAM.lockDist;
function centreTarget(list) {   // closest to where the camera looks, distance as a tie-break
  let best = null, bs = Infinity;
  for (const f of list) { if (!inReach(f)) continue; const sc = Math.abs(camAngle(f)) + f.pos.distanceTo(G.me.pos) * 0.03; if (sc < bs) { bs = sc; best = f; } }
  return best;
}
function switchTarget(dir) {
  const cur = G.opp, list = (G.targets || []).filter(f => f !== cur && inReach(f) && Math.abs(camAngle(f)) < 1.9); if (!cur || !list.length) return false;
  const a0 = camAngle(cur); let best = null, bd = Infinity;
  for (const f of list) { const d = (camAngle(f) - a0) * dir; if (d > 0.03 && d < bd) { bd = d; best = f; } }
  if (!best) return false; G.lockPick = G.opp = best; return true;
}
function lockSweep(dx) {
  const now = performance.now() / 1000; swAcc = swAcc * Math.exp(-(now - swT) * CAM.switchDecay) + dx; swT = now;
  if (now < swCd || Math.abs(swAcc) < CAM.switchPx) return;
  if (switchTarget(Math.sign(swAcc))) swCd = now + CAM.switchCd; swAcc = 0;
}
function pickTarget(foes) {
  const me = G.me; if (!me) return null;
  if (!G.lock) return G.lockPick = foes.filter(f => !f.dead).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0] || null;   // free camera: nearest (attack tracking only, the camera does not follow)
  if (inp.finisher > 0 && !(G.lockPick && G.lockPick.broken && G.lockPick.pos.distanceTo(me.pos) < 3.4)) {   // deathblow pressed beside another broken enemy
    const b = foes.find(f => !f.dead && f.broken && f.pos.distanceTo(me.pos) < 3.4); if (b) G.lockPick = b;
  }
  if (!(foes.includes(G.lockPick) && inReach(G.lockPick))) G.lockPick = centreTarget(foes);
  return G.lockPick;
}
function toggleLock() {
  G.lock = !G.lock; inp.lock = G.lock; swAcc = 0;
  if (!G.lock) { rig.userT = 0; return; }
  if (G.targets && G.targets.length) G.lockPick = centreTarget(G.targets);   // lock onto whoever is in front of the camera
}
function refreshTexts() { applyI18n(); renderBinds($('bindList')); renderMapSel(); showCoins(); if (G.mode !== 'menu') renderHelp(G.mode); }

// ---------- gauntlet difficulty, armory, arena picker ----------
function renderGDiff() {
  const box = $('gdList'); box.innerHTML = '';
  for (const [k, d] of Object.entries(GDIFF)) {
    const b = document.createElement('button'); b.className = 'perk diff-' + k;
    b.innerHTML = `<b>${d.name}</b><span>${d.desc}</span><small>Coins ×${d.coin} · best: ${REC.bestBy[k] || 0} bosses</small>`;
    b.onclick = () => { sfx.ui(); startRun(k); }; box.appendChild(b);
  }
}
let shopTab = 'skins';
function renderShop() {
  showCoins();
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === shopTab);
  const list = $('shopList'); list.innerHTML = '';
  const isSkin = shopTab === 'skins', DB = isSkin ? OUTFITS : WEAPONS, owned = isSkin ? REC.skins : REC.weapons, eq = isSkin ? REC.skin : REC.weapon;
  for (const [k, it] of Object.entries(DB)) {
    if (it.hidden) continue;
    const have = owned.includes(k), on = eq === k, b = document.createElement('div'); b.className = 'item' + (on ? ' on' : '');
    const sw = isSkin ? '' : `<i class="sw" style="background:#${it.trail.toString(16).padStart(6, '0')}"></i>`;
    b.innerHTML = `<div><b>${sw}${it.name}</b><span>${it.desc}</span></div>`;
    const btn = document.createElement('button'); btn.className = 'big buy';
    btn.textContent = on ? 'Equipped' : have ? 'Equip' : it.price + ' ◎'; btn.disabled = on || (!have && REC.coins < it.price);
    btn.onclick = () => {
      if (!have) { if (REC.coins < it.price) return; REC.coins -= it.price; owned.push(k); sfx.coin(); }
      if (isSkin) REC.skin = k; else REC.weapon = k; saveRec(); setLook(true, REC.skin, REC.weapon); menuPose(); sfx.ui(); renderShop();
    };
    b.appendChild(btn); list.appendChild(b);
  }
  $('shopNote').textContent = isSkin ? 'Skins only change the look.' : 'All blades share the same length, damage and timing; only the look and the slash trail differ.';
}
for (const t of document.querySelectorAll('.tab')) t.onclick = () => { shopTab = t.dataset.tab; sfx.ui(); renderShop(); };
function renderMapSel() { $('mapName').textContent = S.map === 'random' ? 'Random' : MAPS[S.map] || MAPS.dojo; }
const MAP_CYCLE = [...MAP_KEYS, 'random'];
const stepMap = d => { S.map = MAP_CYCLE[(MAP_CYCLE.indexOf(S.map) + d + MAP_CYCLE.length) % MAP_CYCLE.length]; save(); renderMapSel(); if (G.mode === 'menu') useMap(S.map === 'random' ? MAP_KEYS[Math.random() * MAP_KEYS.length | 0] : S.map); sfx.ui(); };
$('mapPrev').onclick = () => stepMap(-1); $('mapNext').onclick = () => stepMap(1);
// ---------- input (all gameplay keys go through the rebindable map in binds.js) ----------
function press(code, e) {
  if (captureBind(code)) { e && e.preventDefault(); return; }
  keys[code] = true;
  if (G.mode === 'menu' || G.over) return;
  for (const a of actionsOf(code)) {
    if (a === 'light') inp.light = 0.3; else if (a === 'heavy') inp.heavy = 0.3; else if (a === 'guard') inp.guard = true;
    else if (a === 'dodge') inp.dodge = 0.25; else if (a === 'jump') inp.jump = 0.25; else if (a === 'finisher') inp.finisher = 0.4;
    else if (a === 'lock') toggleLock();
    else if (a === 'lure') CTX.wantLure = true;
  }
  if (e && (code === 'Space' || /^Alt|^Control/.test(code) || code === 'Mouse1')) e.preventDefault();
}
function release(code) { keys[code] = false; if (BINDS.guard.includes(code) && !isDown('guard', keys)) inp.guard = false; }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (isWaiting()) { e.preventDefault(); captureBind(e.code); return; }
  if (e.repeat) return;
  if (e.code === 'KeyH' && !actionsOf('KeyH').length) $('hint').classList.toggle('mini');
  press(e.code, e);
  if (G.mode === 'training' && !G.over) {
    if (e.code === 'Digit1') G.ai.mode = 'dummy-idle'; else if (e.code === 'Digit2') G.ai.mode = 'dummy-block'; else if (e.code === 'Digit3') G.ai.mode = 'dummy-attack'; else if (e.code === 'Digit4') G.ai.mode = 'duel';
    else if (e.code === 'Backspace') { placeStart(0); rig.snapBehind(G.me); }
  }
});
addEventListener('keyup', e => release(e.code));
addEventListener('mousedown', e => {
  if (isWaiting()) { e.preventDefault(); e.stopPropagation(); captureBind(mouseCode(e.button)); return; }
  if (e.target !== canvas) return;
  audio.resume();
  if (G.mode === 'menu' || G.over) return;
  if (!document.pointerLockElement) { tryLock(); return; }
  press(mouseCode(e.button), e);
}, true);
addEventListener('mouseup', e => release(mouseCode(e.button)));addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!document.pointerLockElement || G.mode === 'menu') return;
  if (G.lock && G.opp && !G.opp.dead) { lockSweep(e.movementX * S.sens); return; }
  rig.mouse(e.movementX, e.movementY, S.sens, S.invert);
});

// ---------- HUD ----------
// HUD writes go through css(): a DOM style is touched only when its value really changes (no per-frame style churn)
const css = (el, prop, v) => { const k = '_' + prop; if (el[k] !== v) { el[k] = v; el.style[prop] = v; } };
const cls = (el, v) => { if (el._cls !== v) { el._cls = v; el.className = v; } };
function updateHud() {
  const set = (hp, tr, po, f) => {
    const pc = (Math.max(0, f.hp) / f.maxHp * 100).toFixed(1) + '%'; css($(hp), 'width', pc); css($(tr), 'width', pc);
    const pe = $(po); css(pe, 'transform', `translateX(-50%) scaleX(${Math.min(1, f.posture / 100).toFixed(3)})`);
    cls(pe.parentElement, 'posture' + (f.act === 'guardBreak' ? ' broken' : f.posture > 66 ? ' warn' : ''));
  };
  set('meHp', 'meHpTrail', 'mePost', G.me); set('oppHp', 'oppHpTrail', 'oppPost', G.opp);
  for (const [id, f] of [['meLives', G.me], ['oppLives', G.opp]]) { const el = $(id); if (G.mode === 'training' || G.ctl) { css(el, 'visibility', 'hidden'); continue; } css(el, 'visibility', 'visible'); if (el._lives !== f.lives) { el._lives = f.lives; [...el.children].forEach((c, i) => c.classList.toggle('lost', i >= f.lives)); } }
  // deathblow prompt only while the opponent is broken and in reach
  const { me, opp } = G, fin = $('fin');
  const canFin = opp && !opp.dead && opp.broken && opp.brokenLeft > 0.2 && Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z) < 3.6 && G.phase === 'fight' && me.act !== 'deathblow';
  if (canFin) { const p = _hv.set(opp.pos.x, 1.55 * opp.scaleF, opp.pos.z).project(camera); if (p.z < 1) { css(fin, 'display', 'block'); css(fin, 'left', ((p.x * .5 + .5) * innerWidth).toFixed(0) + 'px'); css(fin, 'top', ((-p.y * .5 + .5) * innerHeight).toFixed(0) + 'px'); fin.classList.toggle('late', opp.brokenLeft < 1); } else css(fin, 'display', 'none'); } else css(fin, 'display', 'none');
  const lk = $('lock'), locked = G.lock && opp && !opp.dead && G.phase === 'fight';
  if (locked) { const p = _hv.set(opp.pos.x, 1.3 * opp.scaleF, opp.pos.z).project(camera); if (p.z < 1) { css(lk, 'display', 'block'); css(lk, 'left', ((p.x * .5 + .5) * innerWidth).toFixed(0) + 'px'); css(lk, 'top', ((-p.y * .5 + .5) * innerHeight).toFixed(0) + 'px'); } else css(lk, 'display', 'none'); } else css(lk, 'display', 'none');
}
const _hv = new V3();

// ---------- loop ----------
let netT = 0, last = performance.now();
function adapt(raw) {
  G.fa = (G.fa || 0) + raw; G.fn = (G.fn || 0) + 1; if (G.fa < 2) return;
  const avg = G.fa / G.fn; G.fa = G.fn = 0;
  if (avg > 1 / 50 && G.pr > 0.6) { G.pr = Math.max(0.6, G.pr - 0.1); resize(); }
  else if (avg < 1 / 58 && G.pr < G.prMax) { G.pr = Math.min(G.prMax, G.pr + 0.05); resize(); }
  // Auto quality: still slow at the lowest render scale -> drop one quality tier (shadows, bloom, lights, grass)
  if (S.quality === 'auto' && avg > 1 / 40 && G.pr <= 0.61 && G.q !== 'low' && G.mode !== 'menu') { if ((G.slowWin = (G.slowWin || 0) + 1) >= 2) { G.slowWin = 0; G.autoTier = G.q === 'high' ? 'med' : 'low'; applyQuality(); toast('Graphics: ' + G.autoTier); } } else G.slowWin = 0;
  if (S.fps) $('fps').textContent = Math.round(1 / avg) + ' fps · render ' + Math.round(G.pr * 100) + '% · ' + G.q;
}
function frame(now) { requestAnimationFrame(frame); const raw = Math.min(0.1, (now - last) / 1000); last = now; step(Math.min(0.05, raw)); adapt(raw); }
const noInput = { move: new V3(), guard: false, light: 0, heavy: 0, dodge: 0, finisher: 0, lock: true };
function readInput(live) {
  const F = new V3(Math.sin(rig.yaw), 0, Math.cos(rig.yaw)), R = new V3(-F.z, 0, F.x);
  inp.move.set(0, 0, 0);
  if (live) { if (isDown('forward', keys)) inp.move.add(F); if (isDown('back', keys)) inp.move.sub(F); if (isDown('right', keys)) inp.move.add(R); if (isDown('left', keys)) inp.move.sub(R); }
  inp.walk = isDown('walk', keys); inp.aim.copy(F); inp.crouch = isDown('crouch', keys);
  inp.back = live && isDown('back', keys); inp.fwd = live && isDown('forward', keys);   // S + LMB / S + E / W + LMB + E
  inp.sprint = isDown('sprint', keys) && !inp.walk && !inp.crouch;
}
// soundtrack: theme follows the map; in duels/team fights the intensity follows the phase (calm intro sweep -> drums -> full combat)
function music() {
  const M = audio.music, th = audio.themeFor(arena.name); M.theme(th); audio.setSpace(th); audio.amb.set(th); audio.amb.weather(weather.kind);
  if (G.ctl && G.ctlKind !== 'team') return;
  const ph = G.phase, fight = ph === 'fight' || ph === 'downed' || ph === 'revive';
  M.set(G.mode === 'menu' || !G.started || G.over ? 'explore' : G.ctlKind === 'team' && G.ctl ? 'combat' : ph === 'intro' || G.mode === 'training' ? 'tension' : fight ? (G.mode === 'gauntlet' && G.boss && G.boss.level >= 2 ? 'boss' : 'combat') : 'explore');
}
function step(rawDt) {
  G.t += rawDt; G.phaseT += rawDt;
  music();
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
      const live = G.phase === 'fight' && !G.over;
      readInput(live);
      // shadow LOD: on low/medium only fighters near the camera cast shadows
      { const lim = G.q === 'high' ? 40 : G.q === 'med' ? 18 : 9; for (const f of [G.me, G.opp, ...(G.targets || []), G.ctl && G.ctl.mate].filter(Boolean)) f.setShadows(f.pos.distanceTo(camera.position) < lim); }
      if (G.ctl) {   // Samurai Hunt / Survival run their own frame
        const paused = !G.ctl.online && !$('pause').classList.contains('hidden');
        if (!paused) {
          G.ctl.step(dt, rawDt, live);
          if (live) { for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump', 'grab']) inp[k] = Math.max(0, (inp[k] || 0) - dt); } else inp.light = inp.heavy = inp.dodge = inp.finisher = inp.jump = inp.grab = 0;
          if (G.ctl.online) { netT += rawDt; if (netT > 0.045) { netT = 0; const sn = me.snapshot(); sn.lk = me.style + '|' + me.weapon; net.send('state', sn); } }
        }
        updateHud();
      } else {
      if (G.lock && opp && G.mode !== 'menu' && Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z) > CAM.unlockDist) { G.lock = false; inp.lock = false; rig.userT = 0; }
      if (G.auto && live) { G.auto.think(dt, opp); me.update(dt, G.auto.inp, opp); for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump']) G.auto.inp[k] = Math.max(0, (G.auto.inp[k] || 0) - dt); }
      else me.update(dt, live ? inp : noInput, opp);
      if (live) { for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump', 'grab']) inp[k] = Math.max(0, (inp[k] || 0) - dt); } else inp.light = inp.heavy = inp.dodge = inp.finisher = inp.jump = inp.grab = 0;
      if (G.mode === 'online') {
        opp.update(dt, null, me);
        netT += rawDt; if (netT > 0.04) { netT = 0; { const sn = me.snapshot(); sn.lk = me.style + '|' + me.weapon; net.send('state', sn); } }
      } else {
        const ai = G.ai, ii = ai.inp;
        if (live) ai.think(dt, me); else { ii.move.set(0, 0, 0); ii.guard = false; ii.light = ii.heavy = ii.dodge = ii.finisher = 0; }
        opp.update(dt, ii, me);
        for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump']) ii[k] = Math.max(0, (ii[k] || 0) - dt);
      }
      fighterEvents(me); fighterEvents(opp);
      if (G.phase === 'intro' && G.phaseT > 2.5) beginFight();
      checkLives();
      if (opp.broken && ((G.bt = (G.bt || 0) - dt) < 0)) { G.bt = 0.35; fx.spark(new V3(opp.pos.x, 1.75 * opp.scaleF, opp.pos.z), 6, 2, 0xff6a20, 0.5); }
      updateHud();
      }
    }
  }
  foliageCull(camera); arena.update(rawDt); if (!arena.world && weather.kind !== 'clear') weather.update(rawDt, WX_WIND);
  if (arena.cfg.flashNow) { arena.cfg.flashNow = false; post.impact({ flash: 0.22, flashCol: 0xc8d6ff }); }
  if (!G.noRender) sunHaze(); foliageTick(rawDt, G.ctl && G.ctl.W && G.ctl.W.wind ? 0.6 + G.ctl.W.wind.length() * 0.6 : 1); fx.update(dt, camera);
  const crowd = !!(G.me && G.targets && G.targets.filter(f => f !== G.opp && !f.dead && f.pos.distanceTo(G.me.pos) < 5.5).length);   // another enemy close by
  rig.update(rawDt, { me: G.me, opp: G.opp, locked: G.lock && G.mode !== 'menu' && (!G.ctl || inp.lock), mode: G.mode, crowd });
  const mono = rig.cine && rig.cine.type === 'deathblow' && dbA && dbA.t > 0.55 && dbA.t < 0.85 ? 0.85 : 0;
  const dof = rig.cine ? rig.pos.distanceTo(rig.look) : 0;
  if (!G.noRender) post.frame(rawDt, { hp: me && G.mode !== 'menu' ? me.hp / me.maxHp : 1, sat: G.phase === 'downed' ? 0.35 : 1, mono, dof });
}
// ---------- Samurai Hunt / Survival ----------
const weather = new Weather(scene, camera);
// duel arenas roll their own weather (open maps: the mode decides). Cosmetic only, so online peers may see different skies
G.applyWx = () => { if (arena.world) return; const list = arena.cfg.weathers || ['clear'], k = list[Math.random() * list.length | 0]; weather.set(k); arena.setWeather(k); weather.leaves.material.color.set(G.mapName === 'sakura' ? 0x9a1c1e : 0xb06a2a); };
const WX_WIND = new V3(0.8, 0, 0.35);
const CTX = { G, scene, camera, rig, fx, post, arena, net, inp, keys, S, REC, $, t, banner, toast, showResult, screenFlash, fighterEvents, noInput, weather, wantLure: false,
  setLook: (...a) => setLook(...a), newFighter: (style, weapon, name) => new Fighter(scene, G.base, style, name, weapon), showHud, showScreen, saveRec: () => saveRec(), addCoins: n => addCoins(n),
  tryLock, pickTarget: foes => pickTarget(foes), hint: m => renderHelp(m), useMap: m => useMap(m), isDown: a => isDown(a, keys), keyOf, restartMode: () => restartMode() };
function startMode(kind, opts) {
  stopMode(); $('result').classList.add('hidden'); $('pause').classList.add('hidden'); for (const l of ['hLobby', 'sLobby']) $(l).classList.add('hidden');
  G.started = true; G.over = false; G.ai = null; G.auto = null; rig.endCine();
  G.ctlKind = kind; G.ctlOpts = opts; G.ctl = kind === 'hunt' ? new Hunt(CTX, opts) : kind === 'team' ? new Team(CTX, opts) : new Survival(CTX, opts);
  G.ctl.start(); tryLock();
}
function stopMode() { if (!G.ctl) return; G.ctl.dispose(); G.ctl = null; weather.set('clear'); bindNet(); }
function restartMode() { const k = G.ctlKind, o = G.ctlOpts; stopMode(); startMode(k, o); }
function syncSrv() { for (const el of document.querySelectorAll('.srv')) el.value = S.serverUrl; }
async function connectAny(msgEl, srvEl) {
  msgEl.textContent = t('net.connecting'); S.serverUrl = srvEl.value; save(); syncSrv();
  try { await net.connect(S.serverUrl); bindNet(); return true; } catch (e) { msgEl.textContent = e.message + ' — ' + t('net.check'); return false; }
}
async function hostMode(kind, params, pre) {
  const msg = $(pre + 'Msg'); audio.resume(); if (!await connectAny(msg, $(pre + 'Srv'))) return;
  const a = await net.create({ mode: kind, params, persist: true }); $(pre + 'Room').textContent = a.code; $(pre + 'Lobby').classList.remove('hidden'); msg.textContent = '';
  if (!S.serverUrl.trim()) { try { const i = await (await fetch('/info')).json(); msg.textContent = 'LAN: ' + i.ips.map(ip => ip + ':' + i.port).join(' / '); } catch (e) { } }
}
async function joinMode(pre) {
  const msg = $(pre + 'Msg'), code = $(pre + 'Code').value.trim(); audio.resume(); if (code.length !== 4) { msg.textContent = t('net.code4'); return; }
  if (!await connectAny(msg, $(pre + 'Srv'))) return;
  const a = await net.join(code); if (!a.ok) { msg.textContent = a.err; return; }
  msg.textContent = t('net.joined');
  if (a.resume && a.meta && a.meta.mode) startMode(a.meta.mode, { online: true, params: a.meta.params, resume: true });
}
const huntParams = () => ({ duration: +$('hDur').value, tod: $('hTod').value, weather: $('hWeather').value, lives: +$('hLives').value, pair: Math.random() * 3 | 0, bot: +$('hBot').value });
const svParams = () => { let map = $('sMap').value; if (map === 'random') map = SV_MAPS[Math.random() * SV_MAPS.length | 0]; const tod = $('sTod').value; return { map, diff: $('sDiffSel').value, tod: tod === 'auto' ? undefined : tod }; };
$('hPractice').onclick = () => { audio.resume(); startMode('hunt', { online: false, params: huntParams() }); };
$('hHost').onclick = () => hostMode('hunt', huntParams(), 'h');
$('hJoin').onclick = () => joinMode('h');
// ---------- 2 vs 2 ----------
const teamParams = () => { let map = $('tMap').value; if (map === 'random') map = MAP_KEYS[Math.random() * MAP_KEYS.length | 0]; return { map, bot: +$('tBot').value }; };
function renderTeamMaps() { const el = $('tMap'); if (el.options.length) return; el.innerHTML = `<option value="random">${t('map.random')}</option>` + MAP_KEYS.map(k => `<option value="${k}">${MAPS[k]}</option>`).join(''); el.value = S.map && MAP_KEYS.includes(S.map) ? S.map : 'random'; }
function renderRoster(slots) {
  G.roster = slots; const me = net.slot;
  $('tSlots').innerHTML = [0, 1, 2, 3].map(s => `<div style="padding:6px 8px;border:1px solid ${s % 2 ? '#ff5a4a' : '#4aa3ff'};border-radius:4px;opacity:${slots[s] ? 1 : 0.55}">${s % 2 ? t('ts.west') : t('ts.east')} · ${slots[s] ? (s === me ? t('tm.you') : t('tm.player', { n: s + 1 })) : t('tm.bot')}</div>`).join('');
  $('tStart').style.display = me === 0 ? '' : 'none';
}
$('tSolo').onclick = () => { audio.resume(); startMode('team', { online: false, params: teamParams() }); };
$('tHost').onclick = async () => {
  const msg = $('tMsg'); audio.resume(); if (!await connectAny(msg, $('tSrv'))) return;
  const a = await net.create({ mode: 'team', size: 4, params: teamParams() }); $('tRoom').textContent = a.code; $('tLobby').classList.remove('hidden'); msg.textContent = t('ts.share');
  renderRoster([true, false, false, false]);
  if (!S.serverUrl.trim()) { try { const i = await (await fetch('/info')).json(); msg.textContent = 'LAN: ' + i.ips.map(ip => ip + ':' + i.port).join(' / '); } catch (e) { } }
};
$('tJoin').onclick = async () => {
  const msg = $('tMsg'), code = $('tCode').value.trim(); audio.resume(); if (code.length !== 4) { msg.textContent = t('net.code4'); return; }
  if (!await connectAny(msg, $('tSrv'))) return;
  const a = await net.join(code); if (!a.ok) { msg.textContent = a.err; return; }
  if (!a.meta || a.meta.mode !== 'team') { msg.textContent = t('ts.notTeam'); return; }
  $('tRoom').textContent = a.code; $('tLobby').classList.remove('hidden'); msg.textContent = t('ts.waitHost'); renderRoster(a.slots || [true, true, false, false]);
};
$('tStart').onclick = () => { if (net.slot === 0) net.send('tmstart'); };
$('sSolo').onclick = () => { audio.resume(); startMode('survival', { online: false, params: svParams() }); };
$('sHost').onclick = () => hostMode('survival', svParams(), 's');
$('sJoin').onclick = () => joinMode('s');
window.__snap = async (name, dt = 0.0001) => { step(dt); const url = canvas.toDataURL('image/png'); await fetch('/__shot?n=' + name, { method: 'POST', body: url }); return name; };

// ---------- boot ----------
const loader = new GLTFLoader();
Promise.all([loader.loadAsync('/assets/kd_ual1.glb'), loader.loadAsync('/assets/kd_ual2.glb'), loader.loadAsync('/assets/kd_mixamo.glb')]).then(([a, b, c]) => { try {
  prepareClips(a, b, c); G.base = a;
  G.me = new Fighter(scene, a, REC.skin, 'You', REC.weapon); G.opp = new Fighter(scene, a, 'ashina', 'Enemy');
  applyQuality(); useMap(S.map); menuPose(); showScreen('menu'); refreshTexts();
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 700);
  last = performance.now(); requestAnimationFrame(frame);
} catch (e) { $('loading').textContent = 'Error: ' + e.stack; console.error(e); } }).catch(err => { $('loading').textContent = 'Failed to load: ' + err.message; console.error(err); });
