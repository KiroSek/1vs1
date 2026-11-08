import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MOVES, REACT, sample } from './moves.js';
import { dress, OUTFITS } from './gear.js';
import { SlashTrail } from './fx.js';
import { sfx } from './audio.js';
import { bounds } from './arena.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, UP = new V3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const smooth = u => u * u * (3 - 2 * u);
export const PARRY_WINDOW = 0.2;
// ---- tuning ----
const HEAD_RATE = 8;               // 1/s, smoothing of head/neck tracking
const HEAD_MAX = 0.9;              // rad, max head+neck turn
const HEAD_BEHIND = 1.7;           // rad, opponent behind this angle -> look straight ahead
const HEAD_NECK_SHARE = 0.4;       // share of the turn on neck_01 (rest on Head)
const HEAD_OFF = new Set(['dodgeL', 'dodgeR', 'roll', 'guardBreak', 'dbVictim', 'hitL', 'hitR', 'hitU', 'hitD', 'hitHeavy', 'deflected', 'deathblow', 'die', 'dieFwd', 'revive', 'draw', 'sheathe', 'jump']);
const SPEED = { lockRun: 3.8, lockSprint: 5.6, freeRun: 3.8, freeSprint: 5.6, guardWalk: 2.2, walk: 1.4 };
const CANCEL_AFTER_HIT = 0.08;     // s after the active frames when guard/dodge/jump may cancel a swing
const JUMP = { height: 0.8, air: [0.14, 0.62], carry: 0.85 };   // airborne window (s) of the 'jump' act
const SWEEP_JUMP_POST = 40;        // posture an attacker takes when a sweep is jumped
const HIT_FLASH = 0.08;            // s, emissive flash on the body when struck

// ---------- clip library (shared by all fighters) ----------
const LOWER = /^(root|pelvis|thigh_|calf_|foot_|ball_)/;
let LIB = null;
export function prepareClips(gltfA, gltfB) {
  const all = {}; for (const c of [...gltfA.animations, ...gltfB.animations]) all[c.name] = c;
  const mask = (clip, lower) => new THREE.AnimationClip(clip.name + (lower ? '#lo' : '#up'), clip.duration, clip.tracks.filter(t => LOWER.test(t.name.split('.')[0]) === lower));
  const lo = {}, up = {};
  for (const n of ['Walk_Fwd_Loop', 'Walk_Bwd_Loop', 'Walk_L_Loop', 'Walk_R_Loop', 'Jog_Fwd_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop', 'Sprint_Loop', 'Sword_Regular_A', 'Idle_Loop', 'Sword_Idle']) lo[n] = mask(all[n], true);
  for (const n of ['Sword_Regular_A', 'Sword_Block', 'Sprint_Loop', 'Jog_Fwd_Loop']) up[n] = mask(all[n], false);
  LIB = { all, lo, up };
  return LIB;
}
// locomotion clip sets: [clip, natural speed m/s]
const WALK = { F: ['Walk_Fwd_Loop', 1.25], B: ['Walk_Bwd_Loop', 1.2], L: ['Walk_L_Loop', 1.0], R: ['Walk_R_Loop', 1.0] };
const JOG = { F: ['Jog_Fwd_Loop', 3.4], B: ['Jog_Bwd_Loop', 2.6], L: ['Jog_Left_Loop', 2.4], R: ['Jog_Right_Loop', 2.4] };

export class Fighter {
  constructor(scene, base, style, name, weapon = 'standard') {
    this.scene = scene; this.name = name; this.style = style; this.weapon = weapon; this.base = base;
    this.group = new THREE.Group(); this.body = new THREE.Group(); scene.add(this.group); this.group.add(this.body);
    this.model = clone(base.scene); this.body.add(this.model);
    this.model.updateMatrixWorld(true);
    this.gear = dress(this.model, scene, style, weapon);
    this.katana = this.gear.katana; this.saya = this.gear.saya;
    const B = n => this.model.getObjectByName(n);
    this.b = { pelvis: B('pelvis'), sp1: B('spine_01'), sp2: B('spine_02'), sp3: B('spine_03'), neck: B('neck_01'), head: B('Head'), hand: B('hand_r'), farm: B('lowerarm_r'), uarm: B('upperarm_r'), handL: B('hand_l') };
    // grip frame: blade along the hand's +Z, edge toward the knuckles (hand X, away from the forearm)
    const hx = new V3(1, 0, 0).applyQuaternion(this.b.hand.getWorldQuaternion(new Q()));
    const fdir = this.b.hand.getWorldPosition(new V3()).sub(this.b.farm.getWorldPosition(new V3()));
    this.edgeSign = Math.sign(hx.dot(fdir)) || 1;
    this.gripQ = new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2 * this.edgeSign);
    // animation
    this.mixer = new THREE.AnimationMixer(this.model); this.acts = new Map();
    this.full = [];                 // full-body layer entries {a, w}
    this.lw = {}; this.uw = { stance: 1, block: 0, run: 0 };
    this.phase = 0; this.locoV = new V3(); this.visYaw = 0; this.visYawT = 0;
    this.trail = new SlashTrail(scene); this.trail.baseTint = this.gear.trail;
    this.tipPrev = null; this.basePrev = null;
    this.colliders = [{ c: new V3(), r: 0.2 }, { c: new V3(), r: 0.22 }];
    for (const r of this.gear.ropes) r.rope.colliders = this.colliders;
    // state
    this.pos = new V3(); this.yaw = 0; this.vel = new V3(); this.speed = 0;
    this.maxHp = 100; this.hp = 100; this.posture = 0; this.lives = 2; this.dead = false; this.remote = false; this.invuln = false;
    this.act = 'idle'; this.t = 0; this.seq = 0; this.time = 0; this.lastPost = -9;
    this.guard = false; this.guardStart = -9; this.lastGuardPress = -9; this.guardSpam = 0; this.counterT = 0;
    this.hitDone = false; this.queued = null; this.jolt = 0; this.joltDir = 1; this.flash = 0;
    this.dodgeDir = new V3(0, 0, -1); this.sprint = false; this.sheathed = false; this.opp = null; this.target = { x: 0, z: 0, yaw: 0 };
    this.tempo = 1; this.dmgMul = 1; this.fMul = 1; this.parryWin = PARRY_WINDOW; this.iExtra = 0; this.postRegen = 1; this.scaleF = 1;
    this.events = []; this.headYaw = 0; this.jumpY = 0; this.flashT = 0; this.flashMats = null;
  }

  // ---------- helpers ----------
  action(clip) {
    let a = this.acts.get(clip); if (a) return a;
    a = this.mixer.clipAction(clip); a.play(); a.paused = true; a.setEffectiveWeight(0); a.enabled = true; this.acts.set(clip, a); return a;
  }
  get moveDef() { return MOVES[this.act] || REACT[this.act] || null; }
  get isAttack() { return !!MOVES[this.act]; }
  get fwd() { return new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get hitPoint() { return new V3(this.pos.x, 1.25, this.pos.z); }
  get broken() { return this.act === 'guardBreak' && this.t < REACT.guardBreak.dur - 0.7; }
  get brokenLeft() { return this.broken ? REACT.guardBreak.dur - 0.7 - this.t : 0; }
  get chest() { return this.b.sp3.getWorldPosition(new V3()); }
  get airborne() { return this.act === 'jump' && this.t > JUMP.air[0] && this.t < JUMP.air[1]; }
  inActive() { const m = MOVES[this.act]; return m && this.t >= m.hit[0] && this.t <= m.hit[1]; }
  perilousWarn() { const m = MOVES[this.act]; return m && m.perilous && this.t < m.hit[0]; }

  setAct(name, t0 = 0) {
    this.act = name; this.t = t0; this.seq++; this.hitDone = false; this.queued = null;
    const m = MOVES[name]; if (m) { this.swungSfx = false; if (m.perilous) this.emit('perilous'); }
    if (name === 'idle') this.visYawT = 0;
  }
  emit(type, data) { this.events.push({ type, data }); }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.target = { x, z, yaw }; this.hp = this.maxHp; this.posture = 0; this.dead = false;
    this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0); this.speed = 0; this.setAct('idle'); this.jolt = 0; this.invuln = false; this.guard = false;
    this.counterT = 0; this.visYaw = this.visYawT = 0; this.sheathed = false; this.full.length = 0;
    for (const a of this.acts.values()) a.setEffectiveWeight(0);
    this.trail.clear(); for (const r of this.gear.ropes) r.rope.reset();
  }

  // ================= combat resolution (runs on the DEFENDER's machine) =================
  resolveStrike(kind, from, mul = 1, fmul = 1) {
    const m = MOVES[kind]; if (!m) return { res: 'miss' };
    if (this.dead || this.invuln || this.act === 'revive') return { res: 'miss' };
    const toAtt = new V3(from.x - this.pos.x, 0, from.z - this.pos.z).normalize();
    if (kind === 'deathblow') {
      if (!(this.act === 'guardBreak')) return { res: 'miss' };
      this.yaw = Math.atan2(toAtt.x, toAtt.z); this.hp -= this.maxHp * 0.38 * fmul; this.posture = 0; this.lastPost = this.time;
      if (this.hp <= 0) { this.hp = 0; this.die(true); return { res: 'finisher', killed: true }; }
      this.setAct('dbVictim'); this.vel.addScaledVector(toAtt, -3); return { res: 'finisher', killed: false };
    }
    // a broken / finished fighter can only be hurt by the deathblow
    if (this.act === 'guardBreak' || this.act === 'dbVictim') return { res: 'immune' };
    // perilous sweep: guard, deflect and dodge don't help - only a jump does (then the attacker is exposed)
    if (m.kind === 'sweep') { if (this.airborne) return { res: 'jumped', apost: SWEEP_JUMP_POST }; }
    else {
    // dodge i-frames; stepping INTO a thrust = Mikiri counter
    if ((this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll') && this.t > 0.02 && this.t < 0.34 + this.iExtra) {
      if (m.kind === 'thrust' && this.dodgeDir.dot(toAtt) > 0.35) { this.posture = Math.max(0, this.posture - 10); return { res: 'mikiri', apost: 46 }; }
      return { res: 'dodge' };
    }
    const facing = this.fwd.dot(toAtt) > 0.15;
    // two blades meeting mid-swing
    if (facing && this.isAttack && this.inActive() && !m.perilous && this.act !== 'deathblow') { this.posture += 6; this.lastPost = this.time; this.setAct('deflected'); return { res: 'clash', apost: 10 }; }
    const guarding = (this.guard && (this.act === 'idle' || this.act === 'deflect')) || this.act === 'deflect';
    if (guarding && facing) {
      const win = this.parryWin * (this.guardSpam > 1 ? 0.45 : 1);
      if (this.time - this.guardStart <= win && m.kind !== 'kick') {   // perfect deflect (works on perilous thrusts too)
        this.posture = Math.max(0, this.posture + (m.heavy ? 4 : 2)); this.lastPost = this.time; this.counterT = 0.85;
        this.setAct('deflect'); this.jolt = 0.35; this.joltDir = Math.random() < .5 ? 1 : -1;
        return { res: 'deflect', heavy: !!m.heavy, apost: m.deflPost, kind: m.kind };
      }
      if (!m.perilous) {
        this.posture += m.post * (this.act === 'deflect' ? 0.6 : 1); this.lastPost = this.time; this.vel.addScaledVector(toAtt, m.heavy ? -4.2 : -2.6);
        this.jolt = m.heavy ? 1 : 0.6; this.joltDir = Math.random() < .5 ? 1 : -1;
        if (this.checkBreak()) return { res: 'block', heavy: !!m.heavy, broke: true };
        return { res: 'block', heavy: !!m.heavy };
      }
    }
    }
    // clean hit
    this.hp -= m.dmg * mul; this.flashT = HIT_FLASH; this.posture += m.hitPost; this.lastPost = this.time;
    this.vel.addScaledVector(toAtt, -(m.heavy ? 4.5 : 2.6)); this.jolt = 1; this.joltDir = Math.random() < .5 ? 1 : -1;
    if (this.hp <= 0) { this.hp = 0; this.die(false); return { res: 'hit', heavy: !!m.heavy, killed: true, kind: m.kind }; }
    let broke = false;
    const armored = this.isAttack && MOVES[this.act].armor && this.t < MOVES[this.act].hit[0] && !m.heavy;
    { broke = this.checkBreak(); if (!broke && !armored) this.setAct(m.heavy || m.kind === 'kick' ? 'hitHeavy' : m.dir === 'down' ? 'hitU' : m.dir === 'up' ? 'hitD' : Math.random() < .5 ? 'hitL' : 'hitR'); }
    return { res: 'hit', heavy: !!m.heavy, broke, kind: m.kind };
  }
  checkBreak() { if (this.posture >= 100 && this.act !== 'guardBreak') { this.posture = 100; this.guard = false; this.setAct('guardBreak'); this.emit('broken'); return true; } return false; }
  // attacker side
  applyOutcome(r) {
    if (r.res === 'deflect' || r.res === 'clash') { this.posture += r.apost; this.lastPost = this.time; this.vel.addScaledVector(this.fwd, -2.2); if (!this.checkBreak()) this.setAct('deflected'); }
    else if (r.res === 'jumped') { this.posture += r.apost; this.lastPost = this.time; if (!this.checkBreak()) this.setAct('deflected'); }
    else if (r.res === 'mikiri') { this.posture += r.apost; this.lastPost = this.time; if (!this.checkBreak()) this.setAct('hitHeavy'); }
  }
  die(fwd) { this.dead = true; this.lives = Math.max(0, this.lives - 1); this.guard = false; this.setAct(fwd ? 'dieFwd' : 'die'); }
  revive() { this.dead = false; this.hp = this.maxHp; this.posture = 0; this.invuln = true; this.setAct('revive'); this.emit('revive'); }

  // ================= update =================
  update(dt, inp, opp) {
    this.opp = opp; this.time += dt; this.jolt = Math.max(0, this.jolt - dt * 4); this.counterT = Math.max(0, this.counterT - dt);
    const md = this.moveDef, tempo = MOVES[this.act] && this.act !== 'deathblow' ? this.tempo : 1;
    this.t += dt * tempo;
    if (this.remote) this.updateRemote(dt); else this.updateLocal(dt, inp || {}, opp);
    if (!isFinite(this.pos.x + this.pos.z + this.yaw)) { this.pos.set(0, 0, 0); this.yaw = 0; this.vel.set(0, 0, 0); }
    // procedural jump arc (same on local and remote fighters: derived from act/t)
    const ja = this.act === 'jump' ? clamp((this.t - JUMP.air[0]) / (JUMP.air[1] - JUMP.air[0]), 0, 1) : 0;
    this.jumpY = this.act === 'jump' ? 4 * JUMP.height * ja * (1 - ja) : Math.max(0, this.jumpY - dt * 6);
    this.group.position.copy(this.pos); this.group.position.y = this.jumpY; this.group.rotation.y = this.yaw;
    this.visYaw += angDiff(this.visYaw, this.visYawT) * Math.min(1, dt * 10); this.body.rotation.y = this.visYaw;
    this.animate(dt);
  }

  updateRemote(dt) {
    const k = 1 - Math.exp(-14 * dt), ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (this.target.x - this.pos.x) * k; this.pos.z += (this.target.z - this.pos.z) * k;
    this.yaw += angDiff(this.yaw, this.target.yaw) * k;
    this.locoV.set((this.pos.x - ox) / Math.max(dt, 1e-3), 0, (this.pos.z - oz) / Math.max(dt, 1e-3));
    this.speed = this.locoV.length();
    const md = this.moveDef; if (md && this.t >= md.dur && this.act !== 'die' && this.act !== 'dieFwd') this.act = 'idle';
    this.sfxEvents();
  }
  setRemote(s) {
    this.target.x = s.x; this.target.z = s.z; this.target.yaw = s.yaw; this.hp = s.hp; this.posture = s.po; this.lives = s.lv ?? this.lives;
    this.guard = !!s.g; this.sheathed = !!s.sh; this.visYawT = s.vy || 0;
    if (s.seq !== this.seq) { this.act = s.act; this.t = Math.max(0, s.t || 0); this.seq = s.seq; this.hitDone = false; if (MOVES[s.act]) this.swungSfx = false; if (MOVES[s.act] && MOVES[s.act].perilous && s.t < 0.15) this.emit('perilous'); if (s.act === 'revive') this.emit('revive'); if (s.act === 'guardBreak') this.emit('broken'); }
    if (s.gs !== this.gsN) { this.gsN = s.gs; this.guardStart = this.time; }
    this.dead = s.act === 'die' || s.act === 'dieFwd';
  }
  snapshot() { return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, act: this.act, t: this.t, seq: this.seq, hp: this.hp, po: this.posture, lv: this.lives, g: this.guard ? 1 : 0, sh: this.sheathed ? 1 : 0, vy: this.visYawT, gs: this.gsCount || 0 }; }

  sfxEvents() {
    const m = MOVES[this.act];
    if (m && !this.swungSfx && this.t >= m.hit[0] - 0.06) { this.swungSfx = true; this.act === 'deathblow' ? sfx.deathblow() : sfx.swing(m.heavy || m.kind === 'thrust'); }
  }

  updateLocal(dt, inp, opp) {
    const A = this.act, md = this.moveDef;
    const oppAlive = opp && !opp.dead;
    const toOpp = oppAlive ? new V3(opp.pos.x - this.pos.x, 0, opp.pos.z - this.pos.z) : null;
    const dist = toOpp ? toOpp.length() : 99; if (toOpp && dist > 1e-3) toOpp.divideScalar(dist);
    const locked = !!(toOpp && inp.lock);
    // posture recovery: faster when guarding still, slower at low health, paused right after taking posture
    if (A !== 'guardBreak' && !this.dead && this.time - this.lastPost > 1.5) this.posture = Math.max(0, this.posture - (this.guard ? 15 : 8.5) * this.postRegen * (0.3 + 0.7 * this.hp / this.maxHp) * dt);
    const aim = () => locked || (toOpp && dist < 4) ? toOpp : (inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : this.fwd);
    const face = (d, rate) => { const y = Math.atan2(d.x, d.z); this.yaw += rate ? angDiff(this.yaw, y) * Math.min(1, rate * dt) : angDiff(this.yaw, y); };
    // guard press bookkeeping (deflect window + anti-spam)
    if (inp.guard && !this.guardHeld) { this.guardStart = this.time; this.guardSpam = this.time - this.lastGuardPress < 0.45 ? this.guardSpam + 1 : 0; this.lastGuardPress = this.time; this.gsCount = (this.gsCount || 0) + 1; }
    this.guardHeld = !!inp.guard;

    const idle = A === 'idle';
    const recov = md && MOVES[A] && this.t >= (MOVES[A].cancel);
    const reactDone = md && !MOVES[A] && this.t >= md.dur;
    // defensive cancel: guard / dodge / jump out of a swing once its active frames are over (combo links unchanged)
    const earlyOut = MOVES[A] && A !== 'deathblow' && !recov && this.t >= MOVES[A].hit[1] + CANCEL_AFTER_HIT;
    if (earlyOut && !this.dead) {
      if (inp.guard && !inp.dodge && !inp.jump) { this.setAct('idle'); this.queued = null; }
      else if (inp.dodge > 0 || inp.jump > 0) this.setAct('idle');
    }
    const canAct = idle || recov || (A === 'deflect' && this.t > 0.12) || ((A === 'dodgeL' || A === 'dodgeR' || A === 'roll') && this.t > 0.42) || (A === 'jump' && this.t > JUMP.air[1] + 0.05);
    if (this.dead) { this.guard = false; }
    else if (canAct && A !== 'draw' && A !== 'sheathe' && A !== 'revive') {
      if (inp.jump > 0 && this.act !== 'jump') {
        inp.jump = 0; this.setAct('jump'); this.guard = false; this.vel.copy(this.locoV).multiplyScalar(JUMP.carry); sfx.dodge(); this.emit('dodge'); return this.integrate(dt, null, 0, opp);
      }
      if (inp.dodge > 0 && this.act !== 'roll') {
        inp.dodge = 0;
        const mv = inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : (toOpp ? toOpp.clone().negate() : this.fwd.negate());
        this.dodgeDir.copy(mv);
        if (locked) face(toOpp);
        const lf = this.fwd, side = new V3(lf.z, 0, -lf.x).dot(mv), fw = lf.dot(mv);   // side>0 = to the character's left
        if (!locked && fw > 0.5) { this.yaw = Math.atan2(mv.x, mv.z); this.setAct('roll'); this.visYawT = 0; }
        else { const left = Math.abs(side) > 0.3 ? side > 0 : (this.lastSideL = !this.lastSideL); this.setAct(left ? 'dodgeL' : 'dodgeR'); this.visYawT = fw < -0.5 ? (left ? 1.25 : -1.25) : fw > 0.5 ? (left ? -0.9 : 0.9) : 0; }
        sfx.dodge(); this.emit('dodge'); return this.integrate(dt, null, 0, opp);
      }
      if (inp.finisher > 0 && oppAlive && opp.broken && dist < 3.4) {
        inp.finisher = 0; const d = toOpp.clone();
        this.pos.set(opp.pos.x - d.x * 1.05, 0, opp.pos.z - d.z * 1.05); face(d); opp.yaw = Math.atan2(-d.x, -d.z); this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0);
        this.setAct('deathblow'); this.guard = false; return this.integrate(dt, null, 0, opp);
      }
      if (inp.heavy > 0) { inp.heavy = 0; face(aim()); this.setAct(inp.heavyKind || 'heavy'); this.guard = false; return this.integrate(dt, null, 0, opp); }
      if (inp.light > 0) {
        inp.light = 0; let next = inp.lightKind || 'slash1';
        if (MOVES[A] && MOVES[A].next && this.t < MOVES[A].dur - 0.05) next = MOVES[A].next;
        if (this.counterT > 0 && !MOVES[A]) next = 'counter';
        this.counterT = 0; face(aim()); this.setAct(next); this.guard = false; return this.integrate(dt, null, 0, opp);
      }
      if ((recov || A === 'deflect') && inp.guard) { this.setAct('idle'); }
    }
    // combo buffering: an attack press during the swing queues the next link
    if (MOVES[A] && inp.light > 0 && this.t > MOVES[A].hit[0] - 0.1 && MOVES[A].next) { this.queued = MOVES[A].next; inp.light = 0; }
    if (MOVES[A] && this.queued && this.t >= MOVES[A].cancel) { const q = this.queued; face(aim()); this.setAct(q); return this.integrate(dt, null, 0, opp); }

    let moveDir = null, moveSpeed = 0;
    switch (this.act) {
      case 'idle': {
        this.guard = !!inp.guard;
        const mv = inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : null;
        this.sprint = !!inp.sprint && !this.guard && !!mv;
        const top = this.guard ? SPEED.guardWalk : inp.walk ? SPEED.walk : locked ? (this.sprint ? SPEED.lockSprint : SPEED.lockRun) : this.sprint ? SPEED.freeSprint : SPEED.freeRun;
        moveDir = mv; moveSpeed = mv ? top : 0;
        if (locked && !this.sprint) face(toOpp, 12);
        else if (mv) face(mv, this.sprint ? 8 : 12);
        break;
      }
      case 'deflect': this.guard = true; if (this.t >= REACT.deflect.dur) this.setAct('idle'); if (toOpp) face(toOpp, 10); break;
      case 'die': case 'dieFwd': break;
      default: {
        const m = MOVES[this.act];
        if (m) {
          if (this.t < m.track && toOpp) face(toOpp, this.remote ? 0 : (inp.trackRate || 7));
          // scripted lunge (in-place clips carry no root motion)
          const [l0, l1, ld] = m.lunge; if (this.t > l0 && this.t < l1 && (dist > 1.15 || this.act === 'deathblow')) {
            const u = (this.t - l0) / (l1 - l0), v = ld * Math.PI / 2 * Math.sin(Math.PI * u) / (l1 - l0);
            const lim = toOpp && this.act !== 'deathblow' ? clamp((dist - 1.1) * 6, 0, 1) : 1;
            this.vel.copy(this.fwd).multiplyScalar(v * lim);
          }
          this.hitCheck(m, opp, toOpp, dist);
          if (this.t >= m.dur) this.setAct('idle');
        } else if (this.act === 'jump') {
          if (this.t >= REACT.jump.dur) this.setAct('idle');
        } else if (this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll') {
          const u = clamp(this.t / 0.4, 0, 1), sp = (this.act === 'roll' ? 6.5 : 7.6) * (1 - u) * (1 - u) * 1.6;
          this.vel.set(this.dodgeDir.x * sp, 0, this.dodgeDir.z * sp);
          if (this.t >= REACT[this.act].dur) { this.setAct('idle'); this.vel.set(0, 0, 0); }
        } else if (this.act === 'guardBreak') {
          this.vel.multiplyScalar(0.85); if (opp && opp.act === 'deathblow') face(new V3(opp.pos.x - this.pos.x, 0, opp.pos.z - this.pos.z), 12);
          if (this.t >= REACT.guardBreak.dur) { this.posture = 40; this.setAct('idle'); }
        } else if (this.act === 'revive') { if (this.t >= REACT.revive.dur) { this.invuln = false; this.setAct('idle'); } }
        else if (md && this.t >= md.dur && this.act !== 'sheathe') this.setAct('idle');
      }
    }
    this.integrate(dt, moveDir, moveSpeed, opp);
  }

  integrate(dt, moveDir, moveSpeed, opp) {
    const target = moveDir ? moveDir.clone().multiplyScalar(moveSpeed) : new V3();
    if (this.act !== 'idle') target.set(0, 0, 0);
    this.locoV.lerp(target, 1 - Math.exp(-(moveDir ? 10 : 14) * dt));
    this.pos.x += (this.locoV.x + this.vel.x) * dt; this.pos.z += (this.locoV.z + this.vel.z) * dt;
    const dodging = this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll' || this.act === 'jump';
    this.vel.multiplyScalar(dodging || MOVES[this.act] ? Math.exp(-3 * dt) : Math.exp(-8 * dt));
    if (MOVES[this.act]) { const m = MOVES[this.act]; if (this.t > m.lunge[1]) this.vel.multiplyScalar(Math.exp(-10 * dt)); }
    this.speed = Math.hypot(this.locoV.x, this.locoV.z);
    if (opp && !opp.dead && this.act !== 'deathblow' && opp.act !== 'deathblow') {
      const dx = this.pos.x - opp.pos.x, dz = this.pos.z - opp.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.85 && d > 1e-4) { this.pos.x += dx / d * (0.85 - d); this.pos.z += dz / d * (0.85 - d); }
    }
    bounds(this.pos, 0.45);
    this.sfxEvents();
  }

  // blade sweep vs. opponent capsule, plus a little forgiveness ("magnetism") at the heart of the swing
  hitCheck(m, opp, toOpp, dist) {
    if (this.hitDone || !opp || opp.dead || !toOpp) return;
    if (this.t < m.hit[0] || this.t > m.hit[1]) return;
    let hit = false;
    if (this.act === 'deathblow') hit = true;
    else {
      const base = this.bladeBase, tip = this.bladeTip;
      if (base && tip) {
        const r = 0.42, a = new V3(opp.pos.x, 0.25, opp.pos.z), b = new V3(opp.pos.x, 1.75, opp.pos.z);
        for (let s = 0; s <= 1; s += 0.25) { const p = base.clone().lerp(tip, s); if (segPointDist(a, b, p) < r) { hit = true; break; } }
      }
      const mid = (m.hit[0] + m.hit[1]) / 2;
      if (!hit && this.t >= mid && dist < m.range && this.fwd.dot(toOpp) > 0.55) hit = true;
    }
    if (hit) { this.hitDone = true; this.onStrike && this.onStrike(this, this.act); }
  }

  // ================= animation =================
  animate(dt) {
    const L = LIB; if (!L) return;
    const md = this.moveDef;
    // ---- full-body layer ----
    let topClip = null, ct = 0;
    if (md && this.act !== 'idle') {
      [topClip, ct] = sample(md, this.t);
      if (this.act === 'guardBreak' && this.t > md.segs[0][3] && this.t < md.segs[0][3] + md.segs[1][3]) ct += Math.sin(this.time * 2.3) * 0.015;   // stagger sway
    }
    const fade = MOVES[this.act] ? 0.07 : this.act === 'die' || this.act === 'dieFwd' ? 0.18 : 0.1;
    if (topClip) {
      const a = this.action(L.all[topClip]); a.time = Math.min(ct, a.getClip().duration - 1e-4);
      let e = this.full.find(e => e.a === a); if (!e) { e = { a, w: 0 }; this.full.push(e); }
      this.full.splice(this.full.indexOf(e), 1); this.full.push(e);
    }
    const n = this.full.length;
    for (let i = 0; i < n; i++) { const e = this.full[i], top = topClip && i === n - 1; e.w = top ? Math.min(1, e.w + dt / fade) : Math.max(0, e.w - dt / (MOVES[this.act] ? 0.07 : 0.16)); }
    this.full = this.full.filter(e => { if (e.w <= 0.001) { e.a.setEffectiveWeight(0); return false; } return true; });
    let fullW = 0; for (const e of this.full) fullW += e.w;
    const k = fullW > 1 ? 1 / fullW : 1; for (const e of this.full) e.a.setEffectiveWeight(e.w * k); fullW = Math.min(1, fullW);
    const baseW = 1 - fullW;
    // ---- locomotion (lower body) ----
    const v = this.locoV, f = this.fwd, r = new V3(f.z, 0, -f.x);   // r = character left
    const vf = v.dot(f), vl = v.dot(r), s = Math.hypot(vf, vl);
    const jogK = clamp((s - 1.3) / 1.4, 0, 1), sprintK = clamp((s - 4.2) / 1.0, 0, 1) * clamp(vf / Math.max(s, 1e-3), 0, 1);
    const moveK = clamp(s / 0.45, 0, 1);
    const dirW = s > 1e-3 ? { F: Math.max(0, vf) / (Math.abs(vf) + Math.abs(vl)), B: Math.max(0, -vf) / (Math.abs(vf) + Math.abs(vl)), L: Math.max(0, vl) / (Math.abs(vf) + Math.abs(vl)), R: Math.max(0, -vl) / (Math.abs(vf) + Math.abs(vl)) } : { F: 0, B: 0, L: 0, R: 0 };
    let natural = 0; for (const d of 'FBLR') natural += dirW[d] * (WALK[d][1] * (1 - jogK) + JOG[d][1] * jogK);
    natural = natural * (1 - sprintK) + 5.6 * sprintK;
    const cycle = 1.3 * (1 - jogK) + 0.93 * jogK;
    this.phase = (this.phase + dt * (s > 0.05 ? clamp(s / Math.max(natural, 0.5), 0.6, 1.6) : 0) / (sprintK > 0.5 ? 0.67 : cycle)) % 1;
    const setLo = (name, w) => { const a = this.action(L.lo[name]); a.time = (this.phase * a.getClip().duration) % a.getClip().duration; a.setEffectiveWeight(w * baseW); };
    const idleW = 1 - moveK;
    setLo('Sword_Regular_A', idleW * 0.55); this.action(L.lo.Sword_Regular_A).time = 0;
    setLo('Sword_Idle', idleW * 0.45); this.action(L.lo.Sword_Idle).time = (this.time * 0.6) % 1.6;
    for (const d of 'FBLR') { setLo(WALK[d][0], moveK * (1 - jogK) * dirW[d] * (1 - sprintK)); setLo(JOG[d][0], moveK * jogK * dirW[d] * (1 - sprintK)); }
    setLo('Sprint_Loop', moveK * sprintK);
    // ---- upper body: guard stance / block / running arms ----
    const U = this.uw, want = { stance: 1, block: 0, run: 0 };
    if (this.guard && !this.dead) { want.block = 1; want.stance = 0; } else if (sprintK > 0.3) { want.run = 1; want.stance = 0; }
    for (const kk in U) U[kk] += (want[kk] - U[kk]) * Math.min(1, dt * 14);
    const us = U.stance + U.block + U.run || 1;
    const up = (name, w, t) => { const a = this.action(L.up[name]); a.time = t; a.setEffectiveWeight(w / us * baseW); };
    up('Sword_Regular_A', U.stance, 0); up('Sword_Block', U.block, 0.42); up('Sprint_Loop', U.run, (this.phase * 0.67) % 0.67);
    this.mixer.update(0);
    this.procedural(dt, baseW);
    this.model.updateMatrixWorld(true);
    this.attachSword(dt);
    // cloth tails
    const sideV = new V3(), wind = new V3(-this.locoV.x * 6 - this.vel.x * 4 + 0.6, 0, -this.locoV.z * 6 - this.vel.z * 4 + 0.3);
    this.colliders[0].c.copy(this.chest); this.colliders[1].c.copy(this.b.pelvis.getWorldPosition(new V3())).y += 0.05;
    for (const ro of this.gear.ropes) {
      const ap = ro.anchor.getWorldPosition(new V3()); sideV.set(1, 0, 0).applyQuaternion(ro.sideBone.getWorldQuaternion(new Q())).normalize();
      ro.rope.update(dt, ap, sideV, wind);
    }
  }

  // two-bone arm IK: drive the sword hand to a point with the blade aimed along dir (thrusts, deathblow)
  armIK(target, dir, w) {
    if (w <= 0.001) return;
    const ua = this.b.uarm, la = this.b.farm, h = this.b.hand;
    this.model.updateMatrixWorld(true);
    const orig = [ua.quaternion.clone(), la.quaternion.clone(), h.quaternion.clone()];
    const wp = o => o.getWorldPosition(new V3());
    const S = wp(ua), l1 = S.distanceTo(wp(la)), l2 = wp(la).distanceTo(wp(h));
    const d = target.clone().sub(S); let dist = d.length(); d.divideScalar(Math.max(dist, 1e-4));
    dist = clamp(dist, Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.005); const Tc = S.clone().addScaledVector(d, dist);
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const right = new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pole = right.clone().multiplyScalar(0.6).add(new V3(0, -1, 0)); pole.addScaledVector(d, -pole.dot(d)).normalize();
    const E = S.clone().addScaledVector(d, a).addScaledVector(pole, hh);
    const aim = (bone, child, to) => { const bp = wp(bone), cp = wp(child); const q = new Q().setFromUnitVectors(cp.sub(bp).normalize(), to.clone().sub(bp).normalize());
      const bw = bone.getWorldQuaternion(new Q()), pw = bone.parent.getWorldQuaternion(new Q()); bone.quaternion.copy(pw.invert().multiply(q.multiply(bw))); bone.updateMatrixWorld(true); };
    aim(ua, la, E); aim(la, h, Tc);
    const hq = h.getWorldQuaternion(new Q()), z = new V3(0, 0, 1).applyQuaternion(hq);
    const nq = new Q().setFromUnitVectors(z, dir.clone().normalize()).multiply(hq), pw = h.parent.getWorldQuaternion(new Q());
    h.quaternion.copy(pw.invert().multiply(nq));
    if (w < 0.999) [ua, la, h].forEach((b, i) => { const q = b.quaternion.clone(); b.quaternion.copy(orig[i]).slerp(q, w); });
    this.model.updateMatrixWorld(true);
  }
  thrustIK() {
    const A = this.act; if (A !== 'thrust' && A !== 'deathblow') return;
    const m = MOVES[A], t = this.t;
    const w = A === 'deathblow' ? (t < 0.55 ? 0 : t < 0.72 ? smooth((t - 0.55) / 0.17) : t < 1.35 ? 1 : t < 1.7 ? 1 - smooth((t - 1.35) / 0.35) : 0)
      : (t < m.hit[0] - 0.1 ? 0 : t < m.hit[0] ? smooth((t - m.hit[0] + 0.1) / 0.1) : t < m.hit[1] + 0.15 ? 1 : t < m.hit[1] + 0.4 ? 1 - smooth((t - m.hit[1] - 0.15) / 0.25) : 0);
    if (w <= 0) return;
    const sh = this.b.uarm.getWorldPosition(new V3()), o = this.opp;
    const aimP = o ? o.chest.clone() : sh.clone().addScaledVector(this.fwd, 2);
    if (A === 'deathblow' && o) aimP.y = o.chest.y - 0.05;
    const dir = aimP.clone().sub(sh); dir.y = clamp(dir.y, -0.4, 0.15); dir.normalize();
    let hand;
    if (A === 'deathblow' && o) hand = aimP.clone().addScaledVector(dir, -0.5);
    else hand = sh.clone().addScaledVector(dir, 0.62).add(new V3(0, -0.04, 0));
    this.armIK(hand, dir, w);
  }

  procedural(dt, baseW) {
    this.thrustIK();
    const tw = (bone, axis, ang) => { if (Math.abs(ang) > 1e-4) bone.quaternion.multiply(new Q().setFromAxisAngle(axis, ang)); };
    // breathing + idle sway (only under the guard pose)
    const br = Math.sin(this.time * 2.1) * 0.02 * baseW;
    tw(this.b.sp2, new V3(1, 0, 0), br); tw(this.b.sp3, new V3(1, 0, 0), br * 0.6);
    // impact jolt: thrown back + twisted
    const j = smooth(Math.min(1, this.jolt));
    if (j > 0) { tw(this.b.sp1, new V3(1, 0, 0), -0.18 * j); tw(this.b.sp2, new V3(1, 0, 0), -0.22 * j); tw(this.b.sp2, new V3(0, 1, 0), 0.25 * j * this.joltDir); tw(this.b.head, new V3(1, 0, 0), -0.3 * j); }
    // head + neck track the opponent: smoothed, off during reactions/dodges, neutral when he is behind us
    let want = 0;
    if (this.opp && !this.dead && !HEAD_OFF.has(this.act)) {
      const raw = angDiff(this.yaw + this.visYaw, Math.atan2(this.opp.pos.x - this.pos.x, this.opp.pos.z - this.pos.z));
      want = Math.abs(raw) > HEAD_BEHIND ? 0 : clamp(raw, -HEAD_MAX, HEAD_MAX) * (MOVES[this.act] ? 0.5 : 1);
    }
    this.headYaw += (want - this.headYaw) * (1 - Math.exp(-HEAD_RATE * dt));
    if (Math.abs(this.headYaw) > 1e-4) for (const [bone, share] of [[this.b.neck, HEAD_NECK_SHARE], [this.b.head, 1 - HEAD_NECK_SHARE]]) {
      const axis = UP.clone().applyQuaternion(bone.getWorldQuaternion(new Q()).invert());
      bone.quaternion.multiply(new Q().setFromAxisAngle(axis, this.headYaw * share));
    }
    // hit flash: brief emissive pulse on body and clothes
    if (this.flashT > 0 || this.flashOn) {
      if (!this.flashMats) { this.flashMats = []; this.model.traverse(o => { if (o.isMesh && o.material && o.material.emissive) for (const m of [].concat(o.material)) if (!this.flashMats.includes(m)) this.flashMats.push({ m, c: m.emissive.clone(), i: m.emissiveIntensity }); }); }
      this.flashT = Math.max(0, this.flashT - dt); const k = this.flashT / HIT_FLASH;
      for (const f of this.flashMats) { if (k > 0) { f.m.emissive.setRGB(1, 0.82, 0.75); f.m.emissiveIntensity = 0.9 * k; } else { f.m.emissive.copy(f.c); f.m.emissiveIntensity = f.i; } }
      this.flashOn = k > 0;
    }
  }

  attachSword(dt) {
    const K = this.katana;
    // draw / sheathe: swap the katana between saya and hand when the hand reaches the scabbard mouth
    if (this.act === 'draw' || this.act === 'sheathe') {
      const hd = this.b.hand.getWorldPosition(new V3()).distanceTo(this.saya.getWorldPosition(new V3()));
      if (this.act === 'draw' && this.sheathed && this.t > 0.25 && (hd < 0.2 || this.t > 0.7)) { this.sheathed = false; sfx.draw(); }
      if (this.act === 'sheathe' && !this.sheathed && this.t > 0.55 && (hd < 0.2 || this.t > 1.05)) { this.sheathed = true; sfx.sheathe(); }
    }
    if (this.sheathed) { this.saya.updateMatrixWorld(true); this.saya.matrixWorld.decompose(K.position, K.quaternion, new V3()); K.scale.setScalar(this.scaleF); }
    else {
      const h = this.b.hand, hp = h.getWorldPosition(new V3()), hq = h.getWorldQuaternion(new Q());
      const ax = new V3(this.edgeSign, 0, 0).applyQuaternion(hq), az = new V3(0, 0, 1).applyQuaternion(hq), ay = new V3(0, 1, 0).applyQuaternion(hq);
      K.quaternion.copy(hq).multiply(this.gripQ);
      K.position.copy(hp).addScaledVector(ax, 0.085 * this.scaleF).addScaledVector(ay, -0.012 * this.scaleF).addScaledVector(az, 0.07 * this.scaleF);
      K.scale.setScalar(this.scaleF);
    }
    K.updateMatrixWorld(true);
    const base = new V3(0, 0, 0.12).applyMatrix4(K.matrixWorld), tip = new V3(0, -0.02, 0.76).applyMatrix4(K.matrixWorld);
    this.bladeBase = base; this.bladeTip = tip;
    // slash trail during the active swing (sub-sampled between frames for a smooth arc)
    const m = MOVES[this.act], swinging = m && this.t >= m.hit[0] - 0.07 && this.t <= m.hit[1] + 0.05;
    if (swinging) {
      if (this.tipPrev) for (let s = 1; s <= 3; s++) { const u = s / 3; const b = this.basePrev.clone().lerp(base, u), pv = this.tipPrev.clone().sub(this.basePrev), cv = tip.clone().sub(base); const len = pv.length() * (1 - u) + cv.length() * u; const dir = pv.normalize().lerp(cv.normalize(), u).normalize(); this.trail.push(b, b.clone().addScaledVector(dir, len)); }
      else this.trail.push(base, tip);
      this.trail.power = m.heavy || m.kind === 'thrust' ? 1.4 : 1; this.trail.red = m.perilous;
    }
    this.trail.update(dt, swinging);
    this.tipPrev = tip.clone(); this.basePrev = base.clone();
  }

  restyle(color, scale = 1) {
    for (const m of this.gear.tint) { if (!m.userData.c0) m.userData.c0 = m.color.clone(); if (color == null) m.color.copy(m.userData.c0); else m.color.set(color); }
    this.group.scale.setScalar(scale); this.scaleF = scale;
  }
  dispose() { this.scene.remove(this.group, this.katana); this.trail.dispose(); for (const r of this.gear.ropes) r.rope.dispose(this.scene); }
}

function segPointDist(a, b, p) { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(p); }
