import * as THREE from 'three';
import { FOLIAGE } from './foliage.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MOVES, REACT, sample } from './moves.js';
import { dress, OUTFITS } from './gear.js';
import { SlashTrail } from './fx.js';
import { sfx } from './audio.js';
import { bounds, groundAt, WORLD } from './arena.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, UP = new V3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const smooth = u => u * u * (3 - 2 * u);
export const PARRY_WINDOW = 0.2;
// ---- tuning ----
const HEAD_RATE = 8;               // 1/s, smoothing of head/neck tracking
const HEAD_MAX = 1.05;             // rad (60°), max head+neck turn relative to the chest
const BREATH = 0.02;               // rad, breathing sway of the spine
const JOLT_BACK = 0.3;             // rad, spine lean-back at the peak of a full (1.0) impact
const JOLT_TWIST = 0.32;           // rad, spine twist at the peak of a full impact
// impact jolt is a damped spring: `this.jolt = k` kicks it, the spine is thrown, overshoots a little and settles
// (hz: how fast it snaps, damp: 0..1, lower = more wobble)
const JOLT = { hz: 3.4, damp: 0.42 };
const HEAD_BEHIND = 1.7;           // rad, opponent behind this angle -> look straight ahead
const NECK_MAX = 0.87;             // rad (50°), hard cap of the head's total twist vs the chest (mocap clips reach 90°+)
const HEAD_NECK_SHARE = 0.4;       // share of the turn on neck_01 (rest on Head)
const HEAD_OFF = new Set(['grabbed', 'grabHold', 'dbBack', 'dodgeL', 'dodgeR', 'roll', 'guardBreak', 'dbVictim', 'hitL', 'hitR', 'hitF', 'hitBack', 'knockdown', 'hitU', 'hitD', 'hitHeavy', 'deflected', 'deathblow', 'die', 'dieFwd', 'revive', 'draw', 'sheathe', 'jump']);
const DOWNED = { bleed: 22, hitPenalty: 4 };                    // survival: seconds until a downed fighter bleeds out; seconds lost per hit taken while down
const AMBUSH_RANGE = 3.4;
const AMBUSH = { back: 2.6, side: 1.6, front: 1, post: 2.2 };   // surprise-attack damage multipliers by angle; posture multiplier
const SPEED = { lockSide: 0.78, lockBack: 0.72, crouch: 1.7, water: 0.6, lockRun: 3.8, lockSprint: 5.6, freeRun: 3.8, freeSprint: 5.6, guardWalk: 2.2, walk: 1.4 };
const CANCEL_AFTER_HIT = 0.08;     // s after the active frames when guard/dodge/jump may cancel a swing
const ARMORED = new Set(['ashina', 'oni', 'bone', 'kage']);   // skins in lacquered plates: armour foley and armour hits
const JUMP = { height: 1.1, air: [0.12, 0.72], land: 0.1, airControl: 1.3, minSpeed: 3.8 };   // airborne window (s) of 'jump'; air control rate (1/s ~ 20%/0.17s)
// attack pacing (anti-spam): rest = pause before a NEW chain may start after an attack ends (s; longer after a finisher);
// early = presses this long before a link's active frames are swallowed instead of buffered; plunge = jump-attack gating
// blend into an attack: from idle / walk the first pose of the swing eases in over `enter` s (capped by the wind-up length),
// chained swings over `chain` s; weights follow a smoothstep so poses never start or stop moving with a jerk
const _rollQ = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1), _fl = new THREE.Vector3(), _fr = new THREE.Vector3();
// foot plant during swings: plantH = how high (m) a foot may be and still count as on the floor; maxStep = largest per-frame correction
const FOOT = { on: true, plantH: 0.12, maxStep: 0.12, stepSpeed: 1.4 };   // stepSpeed: m/s of a foot relative to the body above which it counts as stepping
const ATK_FADE = { enter: 0.15, chain: 0.07, min: 0.06 };
const PACE = { rest: 0.22, restFinisher: 0.5, early: 0.12, plungeRise: 0.3, plungeLate: 0.52, plungeHang: 0.12, plungeCd: 2.2, jumpCd: 0.28 };
// weight of a swing: spine leans into the strike around the active frames, then settles (rad; heavy / light)
const STRIKE_LEAN = { heavy: 0.16, light: 0.07, pre: 0.12, post: 0.3 };
// coil -> release: spine twist against the swing during the wind-up, unwinding past centre through the cut (rad);
// back: lean-back coil before a vertical chop; post: seconds to settle after the hit window; rate: smoothing (1/s)
const THRUST_MIN_REACH = 0.38;   // m, closest the deathblow hand comes to its own shoulder
const COIL = { yaw: 0.2, release: 0.26, heavyK: 1.35, back: 0.12, post: 0.32, rate: 22 };
// body response to movement (our layer): lean into acceleration, bank into turns, settle on stops; idle micro-motion
const MOTION = { dodgeBank: 0.006, accLean: 0.011, maxLean: 0.13, bank: 0.035, maxBank: 0.1, rate: 7, sway: 0.022, swayHz: 0.55, blade: 0.03, bladeHz: 1.25 };
// parry visuals: env = [blend in, hold until, blend out] (s); reach = contact point distance from the hand along the blade (m)
const PARRY_FX = { env: [0.05, 0.1, 0.28], reach: 0.42, bounce: 0.85, recoil: 0.25 };
// attacker recoil when the swing is stopped: push = m/s backwards, jolt = body kick (1 = clean hit on the victim)
const RECOIL = { deflectPush: 4.2, clashPush: 3.2, blockPush: 1.2, deflectJolt: 1.1, clashJolt: 0.8, blockJolt: 0.45 };
// hit reaction choice: attacker behind if front < back; on a side if |side| > side; heavy blows knock down above knockPost posture
const REACT_PICK = { back: -0.35, side: 0.3, knockPost: 0.72, knockInv: 1.3 };
// delayed heavy wind-ups for AI: wind-up stretched by a random factor in [min, max]
const DELAY = { min: 1.35, max: 2.1 };
// grab: victim stands this far in front of the grabber; player grab (PvP option) cooldown
const GRAB = { dist: 0.85, cd: 8 };
// finger curl (rad) per phalanx for the sword fist; thumb wraps less
const FIST_RELAX = 0.45;   // sheathed: loosely closed hand
const FIST = { finger: [1.15, 1.35, 0.85], thumb: [0.25, 0.45, 0.4] };
const GRIP = { handZ: 0.065, z: -0.17, near: 0.12, far: 0.3, atkFar: 0.5, rate: 14, roll: 1.6, edgeRate: 14 };   // roll: base turn of the blade in the fist (edge down-forward in stance); edgeRate: wrist turn speed toward a swing's edge roll (1/s)   // left hand on the hilt: seat point (katana z), full weight below near, none beyond far (m)
const LINK = { combo: 0.1, stepCut: 0.35, vault: 0.4, vaultRange: 3.2, vaultBack: 5.5, vaultHeight: 0.7, sprintDash: 4.2 };   // Sekiro-style link windows (s) / ranges (m)
const SWEEP_JUMP_POST = 40;        // posture an attacker takes when a sweep is jumped
const HIT_FLASH = 0.08;            // s, emissive flash on the body when struck

// ---------- clip library (shared by all fighters) ----------
const LOWER = /^(root|pelvis|thigh_|calf_|foot_|ball_)/;
const CROUCH = ['Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Crouch_Bwd_Loop', 'Crouch_Left_Loop', 'Crouch_Right_Loop'];
let LIB = null;
// gltfC (optional): kd_mixamo.glb, Mixamo clips retargeted onto this skeleton by tools/retarget.html (MX_* names)
export function prepareClips(gltfA, gltfB, gltfC) {
  const all = {}; for (const c of [...gltfA.animations, ...gltfB.animations, ...(gltfC ? gltfC.animations : [])]) all[c.name] = c;
  const sprint = all.MX_Run2 ? 'MX_Run2' : 'Sprint_Loop';   // great-sword run (blade over the shoulder) when available
  const mask = (clip, lower) => new THREE.AnimationClip(clip.name + (lower ? '#lo' : '#up'), clip.duration, clip.tracks.filter(t => LOWER.test(t.name.split('.')[0]) === lower));
  const lo = {}, up = {};
  for (const n of ['Walk_Fwd_Loop', 'Walk_Bwd_Loop', 'Walk_L_Loop', 'Walk_R_Loop', 'Jog_Fwd_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop', sprint, 'Sword_Regular_A', 'Idle_Loop', 'Sword_Idle', ...CROUCH]) if (all[n]) lo[n] = mask(all[n], true);
  for (const n of CROUCH) if (all[n]) up[n] = mask(all[n], false);
  for (const n of ['Sword_Regular_A', 'Sword_Block', sprint, 'Jog_Fwd_Loop']) up[n] = mask(all[n], false);
  LIB = { all, lo, up, sprint, sprintCycle: sprint === 'MX_Run2' ? STRIDE.sprintCycle : 0.67 };
  return LIB;
}
// locomotion clip sets: [clip, natural speed m/s]
const WALK = { F: ['Walk_Fwd_Loop', 1.25], B: ['Walk_Bwd_Loop', 1.2], L: ['Walk_L_Loop', 0.75], R: ['Walk_R_Loop', 0.75] };
const JOG = { F: ['Jog_Fwd_Loop', 3.4], B: ['Jog_Bwd_Loop', 1.25], L: ['Jog_Left_Loop', 1.2], R: ['Jog_Left_Loop', 1.2, true] };   // R = the left side-step clip played backwards (the stock right clip's feet do not plant)   // natural speeds measured from planted-foot slip
const STRIDE = { maxRate: 4.4, sprintCycle: 0.47 };   // max clip speed-up for locomotion; MX_Run2 cycle at full sprint (s)
// live-tunable groups (tune.js, F9): the objects are mutated in place, so the game reads the new values immediately
export const TUNE = { FOOT, COIL, RECOIL, JOLT, ATK_FADE, PACE, STRIKE_LEAN, MOTION, PARRY_FX, REACT_PICK, DELAY, GRIP, STRIDE, SPEED, JUMP };

export class Fighter {
  constructor(scene, base, style, name, weapon = 'standard') {
    this.scene = scene; this.name = name; this.style = style; this.weapon = weapon; this.base = base;
    this.group = new THREE.Group(); this.body = new THREE.Group(); scene.add(this.group); this.group.add(this.body);
    this.model = clone(base.scene); this.body.add(this.model);
    this.model.updateMatrixWorld(true);
    this.gear = dress(this.model, scene, style, weapon);
    this.katana = this.gear.katana; this.saya = this.gear.saya;
    const B = n => this.model.getObjectByName(n);
    this.b = { pelvis: B('pelvis'), sp1: B('spine_01'), sp2: B('spine_02'), sp3: B('spine_03'), neck: B('neck_01'), head: B('Head'), hand: B('hand_r'), farm: B('lowerarm_r'), uarm: B('upperarm_r'), uarmL: B('upperarm_l'), handL: B('hand_l'), farmL: B('lowerarm_l'), palmL: B('middle_01_l') };
    // grip frame: blade along the hand's +Z, edge toward the knuckles (hand X, away from the forearm)
    const hx = new V3(1, 0, 0).applyQuaternion(this.b.hand.getWorldQuaternion(new Q()));
    const fdir = this.b.hand.getWorldPosition(new V3()).sub(this.b.farm.getWorldPosition(new V3()));
    this.edgeSign = Math.sign(hx.dot(fdir)) || 1;
    this.gripQ = new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2 * this.edgeSign);
    this.setupGrip();
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
    this.maxPosture = 100; this.cancelMul = 1; this.quickDodge = false; this.superArmor = false; this.pmul = 1; this.heavyMul = 1; this.counterMul = 1; this.deflMul = 1; this.blockMul = 1; this.dmgTaken = 1; this.speedMul = 1; this.reach = 1; this.feint = 0; this.downable = false; this.bleedMax = DOWNED.bleed; this.hitSet = new Set();
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
  get hitPoint() { return new V3(this.pos.x, this.pos.y + 1.25 * this.scaleF, this.pos.z); }
  get broken() { return this.act === 'guardBreak' && this.t < REACT.guardBreak.dur - 0.7; }
  get brokenLeft() { return this.broken ? REACT.guardBreak.dur - 0.7 - this.t : 0; }
  get chest() { return this.b.sp3.getWorldPosition(new V3()); }
  get armored() { return ARMORED.has(this.style); }
  get airborne() { return this.act === 'jump' && this.t > JUMP.air[0] && this.t < JUMP.air[1]; }
  inActive() { const m = MOVES[this.act]; return m && this.t >= m.hit[0] && this.t <= m.hit[1]; }
  perilousWarn() { const m = MOVES[this.act]; return m && m.perilous && this.t < m.hit[0]; }

  setAct(name, t0 = 0) {
    this.actStart = (this.actStart || 0) + 1;
    if (this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll') this.dodgeEnd = this.time;
    const pm = MOVES[this.act];
    if (pm && !MOVES[name]) this.atkRestUntil = this.time + (pm.next || pm.nextHeavy ? PACE.rest : PACE.restFinisher);   // swing over -> short breath
    if (this.act === 'plunge' && name !== 'plunge') this.plungeReadyAt = this.time + PACE.plungeCd;                   // air attack cooldown
    if ((this.act === 'jump' || this.act === 'plunge') && name !== this.act) this.jumpReadyAt = this.time + PACE.jumpCd;
    this.act = name; this.t = t0; this.seq++; this.hitDone = false; this.slamDone = false;
    this.delayK = this.delayChance && MOVES[name] && MOVES[name].heavy && !this.remote && Math.random() < this.delayChance ? DELAY.min + Math.random() * (DELAY.max - DELAY.min) : 0; this.queued = null; this.hitSet.clear(); this.feint = 0;
    const m = MOVES[name]; if (m) { this.swungSfx = false; if (m.perilous) this.emit('perilous'); }
    this.fadeIn = m ? Math.max(ATK_FADE.min, Math.min(pm ? ATK_FADE.chain : ATK_FADE.enter, m.hit[0] * 0.9)) : 0;   // blend done before the blade goes live
    if (name === 'idle') this.visYawT = 0;
  }
  emit(type, data) { this.events.push({ type, data }); }

  spawn(x, z, yaw) {
    this.pos.set(x, groundAt(x, z), z); this.yaw = yaw; this.downed = false; this.bleed = 0; this.crouch = false; this.target = { x, z, yaw }; this.hp = this.maxHp; this.posture = 0; this.dead = false;
    this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0); this.speed = 0; this.setAct('idle'); this.jolt = 0; this.invuln = false; this.guard = false;
    this.counterT = 0; this.visYaw = this.visYawT = 0; this.sheathed = false; this.full.length = 0; this.headYaw = 0; this.gripW = 0;
    for (const a of this.acts.values()) a.setEffectiveWeight(0);
    this.trail.clear(); for (const r of this.gear.ropes) r.rope.reset();
  }

  // ================= combat resolution (runs on the DEFENDER's machine) =================
  // extra: { pmul: attacker's posture-damage multiplier, ambushOk: defender-side check for a surprise attack }
  resolveStrike(kind, from, mul = 1, fmul = 1, extra = {}) {
    const pm = extra.pmul || 1;
    if (this.downed) { if (kind !== 'deathblow') { this.bleed -= DOWNED.hitPenalty; this.emit('downedHit'); } return { res: 'immune' }; }
    const m = MOVES[kind]; if (!m) return { res: 'miss' };
    if (this.dead || this.invuln || this.act === 'revive' || (this.act === 'knockdown' && this.t < REACT_PICK.knockInv)) return { res: 'miss' };
    const toAtt = new V3(from.x - this.pos.x, 0, from.z - this.pos.z).normalize();
    if (kind === 'deathblow') {
      if (!(this.act === 'guardBreak')) return { res: 'miss' };
      // variants: from behind -> pitched forward (no turn); from the front -> knocked back, or (half the time) thrown down and kip-up
      const behind = this.fwd.dot(toAtt) < -0.3;
      if (!behind) this.yaw = Math.atan2(toAtt.x, toAtt.z);
      this.hp -= this.maxHp * 0.38 * fmul; this.posture = 0; this.lastPost = this.time;
      if (this.hp <= 0) { this.hp = 0; this.die(!behind); return { res: 'finisher', killed: true, behind }; }
      this.setAct(behind ? 'dbBack' : Math.random() < 0.5 ? 'dbVictim' : 'knockdown'); this.vel.addScaledVector(toAtt, behind ? -2 : -3); return { res: 'finisher', killed: false, behind };
    }
    // a broken / finished fighter can only be hurt by the deathblow
    if (this.act === 'guardBreak' || this.act === 'dbVictim') return { res: 'immune' };
    // perilous sweep: guard, deflect and dodge don't help - only a jump does (then the attacker is exposed)
    if (m.kind === 'vault') { this.posture += m.post; this.lastPost = this.time; this.jolt = 0.6; const broke = this.checkBreak(); return { res: 'vaulted', broke }; }
    if (m.kind === 'sweep') { if (this.airborne) { this.sweepJumpedAt = this.time; return { res: 'jumped', apost: SWEEP_JUMP_POST }; } }
    else if (m.kind === 'grab') {
      if (this.airborne || ((this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll') && this.t < 0.34 + this.iExtra)) return { res: 'dodge' };
      // caught: stand in front of the grabber, take the knee + kick
      const back = toAtt.clone().negate(); this.pos.set(from.x + back.x * GRAB.dist, this.pos.y, from.z + back.z * GRAB.dist); this.yaw = Math.atan2(toAtt.x, toAtt.z);
      this.hp -= m.dmg * mul * this.dmgTaken; this.posture += m.hitPost * pm; this.lastPost = this.time; this.flashT = HIT_FLASH; this.guard = false;
      if (this.hp <= 0) { this.hp = 0; this.setAct('grabbed'); this.grabDie = true; return { res: 'grabbed', killed: true }; }
      this.setAct('grabbed'); return { res: 'grabbed' };
    }
    else {
    // dodge i-frames; stepping INTO a thrust = Mikiri counter
    if ((this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll') && this.t > 0.02 && this.t < 0.34 + this.iExtra && m.kind !== 'crush') {
      if (m.kind === 'thrust' && this.dodgeDir.dot(toAtt) > 0.35) { this.posture = Math.max(0, this.posture - 10); return { res: 'mikiri', apost: 46 }; }
      return { res: 'dodge' };
    }
    const facing = this.fwd.dot(toAtt) > 0.15;
    // two blades meeting mid-swing
    if (facing && this.isAttack && this.inActive() && !m.perilous && this.act !== 'deathblow') { this.posture += 6; this.lastPost = this.time; this.setAct('deflected'); return { res: 'clash', apost: 10 }; }
    const guarding = (this.guard && (this.act === 'idle' || this.act === 'deflect')) || this.act === 'deflect';
    if (guarding && facing) {
      const win = this.parryWin * (this.guardSpam > 1 ? 0.45 : 1);
      if (this.time - this.guardStart <= win && m.kind !== 'kick' && m.kind !== 'grab') {   // perfect deflect (works on perilous thrusts too)
        this.posture = Math.max(0, this.posture + (m.heavy ? 4 : 2)); this.lastPost = this.time; this.counterT = 0.85;
        this.setAct('deflect'); this.jolt = 0.35; this.joltDir = Math.random() < .5 ? 1 : -1;
        return { res: 'deflect', heavy: !!m.heavy, apost: m.deflPost * this.deflMul, kind: m.kind };
      }
      if (!m.perilous) {
        this.posture += m.post * pm * this.blockMul * (this.act === 'deflect' ? 0.6 : 1); this.lastPost = this.time; this.vel.addScaledVector(toAtt, m.heavy ? -4.2 : -2.6);
        this.jolt = m.heavy ? 1 : 0.6; this.joltDir = Math.random() < .5 ? 1 : -1;
        if (m.breakGuard) this.posture = Math.max(this.posture, this.maxPosture);   // S+E: the guard gives way
        if (this.checkBreak()) return { res: 'block', heavy: !!m.heavy, broke: true };
        return { res: 'block', heavy: !!m.heavy };
      }
    }
    }
    // clean hit
    const pierced = m.kind === 'crush' && this.guard;   // crushing blow went through the guard
    // surprise attack from cover/behind on an unaware fighter: heavy but survivable, angle-dependent
    let amb = 1; if (kind === 'ambush' && extra.ambushOk) { const back = -this.fwd.dot(toAtt); amb = back > 0.3 ? AMBUSH.back : back > -0.3 ? AMBUSH.side : AMBUSH.front; }
    this.hp -= m.dmg * mul * amb * this.dmgTaken; this.flashT = HIT_FLASH; this.posture += m.hitPost * pm * (amb > 1 ? AMBUSH.post : 1); this.lastPost = this.time;
    const side = toAtt.dot(new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw))), front = toAtt.dot(this.fwd);   // + side = attacker on my right
    this.vel.addScaledVector(toAtt, -(m.heavy ? 4.5 : 2.6)); this.jolt = 1; this.joltDir = side > 0 ? -1 : 1;   // twist away from the blow
    if (this.hp <= 0) { this.hp = 0; this.die(false); return { res: 'hit', heavy: !!m.heavy, killed: true, kind: m.kind }; }
    let broke = false;
    const armored = (this.isAttack && MOVES[this.act].armor && this.t < MOVES[this.act].hit[0] && !m.heavy) || (this.superArmor && !m.heavy && (this.superArmor === true || this.isAttack)) || this.act === 'roar';
    if (pierced) this.posture = Math.max(this.posture, this.maxPosture);
    { broke = this.checkBreak();
      if (!broke && !armored) {
        const heavyHit = m.heavy || m.kind === 'kick';
        const r = heavyHit ? (this.posture / this.maxPosture > REACT_PICK.knockPost && !this.superArmor ? 'knockdown' : 'hitHeavy')
          : front < REACT_PICK.back ? 'hitBack' : m.dir === 'down' ? 'hitU' : m.dir === 'up' ? 'hitD'
          : side > REACT_PICK.side ? 'hitR' : side < -REACT_PICK.side ? 'hitL' : 'hitF';
        if (r === 'knockdown') this.vel.addScaledVector(toAtt, -2.5);
        this.setAct(r);
      } }
    return { res: 'hit', heavy: !!m.heavy, broke, kind: m.kind };
  }
  checkBreak() { if (this.posture >= this.maxPosture && this.act !== 'guardBreak') { this.posture = this.maxPosture; this.guard = false; this.setAct('guardBreak'); this.emit('broken'); return true; } return false; }
  joltStep(dt) {   // spring: x'' = -w^2 x - 2 z w x'
    const w = 2 * Math.PI * JOLT.hz, z = JOLT.damp;
    if (this.jolt > 0) { this.jV = (this.jV || 0) + this.jolt * w * 1.6; this.jDir = this.joltDir || 1; this.jolt = 0; }
    let x = this.jX || 0, v = this.jV || 0; const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (-w * w * x - 2 * z * w * v) * h; x += v * h; }
    this.jX = Math.abs(x) < 1e-4 && Math.abs(v) < 1e-3 ? 0 : x; this.jV = this.jX ? v : 0;
  }
  // attacker side
  applyOutcome(r) {
    if (r.res === 'grabbed') { this.setAct('grabHold'); this.grabbedAt = this.time; return; }
    if (r.res === 'deflect' || r.res === 'clash') {   // blade knocked back: the whole body is thrown back off the opponent's sword
      this.posture += r.apost; this.lastPost = this.time; this.vel.addScaledVector(this.fwd, r.res === 'deflect' ? -RECOIL.deflectPush : -RECOIL.clashPush);
      this.jolt = r.res === 'deflect' ? RECOIL.deflectJolt : RECOIL.clashJolt; this.joltDir = Math.random() < 0.5 ? 1 : -1;
      if (!this.checkBreak()) this.setAct('deflected'); }
    else if (r.res === 'block') { this.jolt = r.heavy ? RECOIL.blockJolt * 1.4 : RECOIL.blockJolt; this.joltDir = Math.random() < 0.5 ? 1 : -1; this.vel.addScaledVector(this.fwd, -RECOIL.blockPush); }
    else if (r.res === 'jumped') { this.posture += r.apost; this.lastPost = this.time; if (!this.checkBreak()) this.setAct('deflected'); }
    else if (r.res === 'mikiri') { this.posture += r.apost; this.lastPost = this.time; if (!this.checkBreak()) this.setAct('hitHeavy'); }
  }
  die(fwd) {
    if (this.downable) { this.downed = true; this.bleed = this.bleedMax; this.hp = 0; this.guard = false; this.setAct('downed'); this.emit('downed'); return; }
    this.dead = true; this.lives = Math.max(0, this.lives - 1); this.guard = false; this.setAct(fwd ? 'dieFwd' : 'die'); }
  // survival: picked up by the partner (or self at wave start)
  rise(frac) { this.downed = false; this.dead = false; this.hp = this.maxHp * frac; this.posture = 0; this.invuln = true; this.setAct('revive'); this.emit('revive'); }
  revive() { this.dead = false; this.hp = this.maxHp; this.posture = 0; this.invuln = true; this.setAct('revive'); this.emit('revive'); }

  // ================= update =================
  update(dt, inp, opp) {
    if (this.invulnT > 0) { this.invulnT -= dt; if (this.invulnT <= 0) this.invuln = false; }   // game-time invulnerability (boss intros, respawns)
    this.opp = opp; this.time += dt; this.joltStep(dt); this.counterT = Math.max(0, this.counterT - dt);
    const md = this.moveDef, tempo = MOVES[this.act] && this.act !== 'deathblow' ? this.tempo : 1;
    // feint: an AI-set slow-down of the first part of the wind-up (changes the rhythm, not the reaction window)
    const fe = MOVES[this.act] && this.feint && this.t < MOVES[this.act].hit[0] * 0.7 ? this.feint : 1;
    // delayed wind-up (AI rhythm, Sekiro-style): the first segment of a heavy attack runs slower by delayK, everything after keeps its timing
    const dm = MOVES[this.act]; const dk = this.delayK > 1 && dm && this.t < dm.segs[0][3] ? 1 / this.delayK : 1;
    this.t += dt * tempo * fe * dk;
    if (this.downed && !this.remote) { this.bleed -= dt; if (this.bleed <= 0) { this.downed = false; this.dead = true; this.lives = 0; this.setAct('die'); this.emit('bledOut'); } }
    if (this.remote) this.updateRemote(dt); else this.updateLocal(dt, inp || {}, opp);
    if (!isFinite(this.pos.x + this.pos.z + this.yaw)) { this.pos.set(0, 0, 0); this.yaw = 0; this.vel.set(0, 0, 0); }
    // procedural jump arc (same on local and remote fighters: derived from act/t)
    const ja = this.act === 'jump' ? clamp((this.t - JUMP.air[0]) / (JUMP.air[1] - JUMP.air[0]), 0, 1) : 0;
    this.jumpY = this.act === 'jump' ? 4 * JUMP.height * ja * (1 - ja) : this.act === 'plunge' && this.t < PACE.plungeHang ? this.jumpY : Math.max(0, this.jumpY - dt * (this.act === 'plunge' ? 9 : 6));
    if (this.act === 'vault') this.jumpY = Math.max(this.jumpY, LINK.vaultHeight * Math.sin(Math.PI * clamp(this.t / 0.55, 0, 1)));
    this.group.position.copy(this.pos); this.group.position.y = this.pos.y + this.jumpY; this.group.rotation.y = this.yaw;
    this.visYaw += angDiff(this.visYaw, this.visYawT) * Math.min(1, dt * 10); this.body.rotation.y = this.visYaw;
    this.animate(dt);
    this.footLock();
  }
  // foot plant: the attack clips step in place, and the game lunge moves the body on top of that - the feet skated.
  // While a swing is on, the lower foot that touches the floor is pinned where it landed and the body is moved instead,
  // so the fighter travels by stepping. (Local simulation only: remote fighters get the resulting positions.)
  footLock() {
    const A = this.act, on = !this.remote && !this.dead && MOVES[A] && !MOVES[A].glide && A !== 'deathblow' && this.jumpY < 0.02 && FOOT.on;
    if (!on) { this.plant = null; return; }
    if (!this.b.footL) { this.b.footL = this.model.getObjectByName('foot_l'); this.b.footR = this.model.getObjectByName('foot_r'); }
    const pl = this.b.footL.getWorldPosition(_fl), pr = this.b.footR.getWorldPosition(_fr), left = pl.y < pr.y, sp = left ? pl : pr;
    // body-local foot position: a foot that moves fast relative to the body is stepping (or dragging), not standing
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), lx = (sp.x - this.pos.x) * c - (sp.z - this.pos.z) * sn, lz = (sp.x - this.pos.x) * sn + (sp.z - this.pos.z) * c;
    const lv = this.footLoc && this.footLoc.left === left && this.dtLast > 0 ? Math.hypot(lx - this.footLoc.x, lz - this.footLoc.z) / this.dtLast : 0;
    this.footLoc = { left, x: lx, z: lz };
    if (sp.y - this.pos.y > FOOT.plantH * this.scaleF || lv > FOOT.stepSpeed) { this.plant = null; return; }
    if (this.plant && this.plant.left === left && this.plant.seq === this.seq) {
      const dx = this.plant.x - sp.x, dz = this.plant.z - sp.z;
      if (dx * dx + dz * dz < FOOT.maxStep * FOOT.maxStep) { this.pos.x += dx; this.pos.z += dz; this.group.position.x += dx; this.group.position.z += dz; this.group.updateMatrixWorld(true); return; }
    }
    this.plant = { left, seq: this.seq, x: sp.x, z: sp.z };
  }

  updateRemote(dt) {
    const k = 1 - Math.exp(-14 * dt), ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (this.target.x - this.pos.x) * k; this.pos.z += (this.target.z - this.pos.z) * k; this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.yaw += angDiff(this.yaw, this.target.yaw) * k;
    this.locoV.set((this.pos.x - ox) / Math.max(dt, 1e-3), 0, (this.pos.z - oz) / Math.max(dt, 1e-3));
    this.speed = this.locoV.length();
    const md = this.moveDef; if (md && this.t >= md.dur && this.act !== 'die' && this.act !== 'dieFwd') this.act = 'idle';
    this.sfxEvents();
  }
  setRemote(s) {
    if (Math.hypot(s.x - this.pos.x, s.z - this.pos.z) > 8) { this.pos.set(s.x, groundAt(s.x, s.z), s.z); this.yaw = s.yaw; }   // respawn / teleport: no sliding across the map
    this.target.x = s.x; this.target.z = s.z; this.target.yaw = s.yaw; this.hp = s.hp; this.posture = s.po; this.lives = s.lv ?? this.lives;
    this.guard = !!s.g; this.sheathed = !!s.sh; this.crouch = !!s.cr; this.downed = !!s.dn; this.bleed = s.bl || 0; if (s.mx) this.maxHp = s.mx; this.visYawT = s.vy || 0;
    if (s.seq !== this.seq) { this.act = s.act; this.t = Math.max(0, s.t || 0); this.seq = s.seq; this.delayK = s.dk || 0; this.hitDone = false; if (MOVES[s.act]) this.swungSfx = false; if (MOVES[s.act] && MOVES[s.act].perilous && s.t < 0.15) this.emit('perilous'); if (s.act === 'revive') this.emit('revive'); if (s.act === 'guardBreak') this.emit('broken'); }
    if (s.gs !== this.gsN) { this.gsN = s.gs; this.guardStart = this.time; }
    this.dead = s.act === 'die' || s.act === 'dieFwd';
  }
  snapshot() { return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, act: this.act, t: this.t, seq: this.seq, hp: this.hp, po: this.posture, lv: this.lives, dk: this.delayK || 0, g: this.guard ? 1 : 0, sh: this.sheathed ? 1 : 0, vy: this.visYawT, gs: this.gsCount || 0, cr: this.crouch ? 1 : 0, dn: this.downed ? 1 : 0, bl: this.downed ? +this.bleed.toFixed(1) : 0, mx: this.maxHp }; }

  sfxEvents() {
    const m = MOVES[this.act];
    if (m && !this.swungSfx && this.t >= m.hit[0] - 0.06) { this.swungSfx = true; this.act === 'deathblow' ? sfx.deathblow() : sfx.swing(m.heavy || m.kind === 'thrust', this.armored); }
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
    const recov = md && MOVES[A] && this.t >= MOVES[A].cancel * this.cancelMul;
    const reactDone = md && !MOVES[A] && this.t >= md.dur;
    // defensive cancel: guard / dodge / jump out of a swing once its active frames are over (combo links unchanged)
    const earlyOut = MOVES[A] && A !== 'deathblow' && !MOVES[A].commit && !recov && this.t >= MOVES[A].hit[1] + CANCEL_AFTER_HIT;
    if (earlyOut && !this.dead) {
      if (inp.guard && !inp.dodge && !inp.jump) { this.setAct('idle'); this.queued = null; }
      else if (inp.dodge > 0) this.setAct('idle');
    }
    const canAct = idle || recov || (A === 'deflect' && this.t > 0.12) || ((A === 'dodgeL' || A === 'dodgeR' || A === 'roll') && this.t > (this.quickDodge ? 0.18 : 0.42)) || (A === 'jump' && this.t > JUMP.air[1] + JUMP.land);
    // ---- Sekiro-style links (checked before the generic action gate) ----
    if (!this.dead && toOpp) {
      if (this.canAmbush && this.crouch && this.act === 'idle' && inp.light > 0 && dist < AMBUSH_RANGE) { inp.light = 0; face(toOpp); this.crouch = false; this.setAct('ambush'); return this.integrate(dt, null, 0, opp); }
      if (this.act === 'jump' && this.airborne && (inp.light > 0 || inp.heavy > 0) && this.t >= PACE.plungeRise && this.t <= PACE.plungeLate && this.time >= (this.plungeReadyAt ?? -9)) { inp.heavy = 0; inp.light = 0; face(toOpp); this.locoV.multiplyScalar(0.4); this.setAct('plunge'); return this.integrate(dt, null, 0, opp); }
      const dodging = this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll';
      if (inp.light > 0 && ((dodging && this.t > 0.2) || (this.act === 'idle' && this.time - (this.dodgeEnd ?? -9) <= LINK.stepCut))) {
        inp.light = 0; face(toOpp); this.setAct('stepCut'); this.guard = false; return this.integrate(dt, null, 0, opp); }
      if (inp.heavy > 0 && (inp.heavyKind || 'heavy') === 'heavy' && ((dodging && this.t > 0.2) || (this.act === 'idle' && this.time - (this.dodgeEnd ?? -9) <= LINK.stepCut))) {
        inp.heavy = 0; face(toOpp); this.setAct('dashCut'); this.guard = false; return this.integrate(dt, null, 0, opp); }
    }
    if (this.dead) { this.guard = false; }
    else if (canAct && A !== 'draw' && A !== 'sheathe' && A !== 'revive') {
      if (inp.jump > 0 && this.act !== 'jump' && this.act !== 'vault' && this.time >= (this.jumpReadyAt ?? -9)) {
        inp.jump = 0; this.setAct('jump'); this.guard = false;
        // keep momentum: input direction x current speed (at least running speed), so a sprint jump carries further
        const mv = inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : null;
        this.jumpSpeed = mv ? Math.max(this.speed, JUMP.minSpeed) : this.speed; if (mv) this.locoV.copy(mv).multiplyScalar(this.jumpSpeed); this.vel.set(0, 0, 0); sfx.jump(); this.landSfx = false; this.emit('dodge'); return this.integrate(dt, null, 0, opp);
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
        const fromBehind = opp.fwd.dot(d) > 0.3;   // I am behind him: no turning him around -> deathblow in the back
        this.pos.set(opp.pos.x - d.x * 1.05, 0, opp.pos.z - d.z * 1.05); face(d); if (!fromBehind) opp.yaw = Math.atan2(-d.x, -d.z); this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0);
        this.setAct('deathblow'); this.guard = false; return this.integrate(dt, null, 0, opp);
      }
      const fin = MOVES[A] && !MOVES[A].next && !MOVES[A].nextHeavy;
      const rested = this.counterT > 0 || (MOVES[A] ? !fin || this.t >= Math.min(MOVES[A].dur, MOVES[A].cancel + PACE.restFinisher) : this.time >= (this.atkRestUntil ?? -9));
      if (inp.heavy > 0 && rested) { inp.heavy = 0; let hk = inp.heavyKind || 'heavy';
        if (hk === 'heavy' && MOVES[A] && MOVES[A].nextHeavy && this.t < MOVES[A].dur - 0.05) hk = MOVES[A].nextHeavy;   // E x3 heavy chain
        face(aim()); this.setAct(hk); this.guard = false; return this.integrate(dt, null, 0, opp); }
      if (inp.light > 0 && rested) {
        inp.light = 0; let next = inp.lightKind || 'slash1';
        if (MOVES[A] && MOVES[A].next && this.t < MOVES[A].dur - 0.05) next = MOVES[A].next;
        if (this.counterT > 0 && !MOVES[A]) next = 'counter';
        this.counterT = 0; face(aim()); this.setAct(next); this.guard = false; return this.integrate(dt, null, 0, opp);
      }
      if ((recov || A === 'deflect') && inp.guard) { this.setAct('idle'); }
    }
    // (player move set kept simple: light chain, heavy chain, dodge cuts, apex slam. Specials such as leap / grab /
    // uppercut / kick stay AI-only, chosen through inp.heavyKind)
    // combo buffering: an attack press during the swing queues the next link
    if (MOVES[A] && this.t < MOVES[A].hit[0] - PACE.early) { inp.light = 0; inp.heavy = 0; }   // mash during the wind-up -> dropped
    if (MOVES[A] && inp.light > 0 && this.t > MOVES[A].hit[0] - 0.1 && MOVES[A].next) { this.queued = MOVES[A].next; inp.light = 0; }
    if (MOVES[A] && inp.heavy > 0 && (inp.heavyKind || 'heavy') === 'heavy' && this.t > MOVES[A].hit[0] - 0.1 && MOVES[A].nextHeavy) { this.queued = MOVES[A].nextHeavy; inp.heavy = 0; }
    if (MOVES[A] && this.queued && this.t >= MOVES[A].cancel) { const q = this.queued; face(aim()); this.setAct(q); return this.integrate(dt, null, 0, opp); }

    let moveDir = null, moveSpeed = 0;
    switch (this.act) {
      case 'idle': {
        this.guard = !!inp.guard;
        const mv = inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : null;
        this.sprint = !!inp.sprint && !this.guard && !!mv;
        this.crouch = !!inp.crouch && !this.guard && !this.sprint;
        let top = this.guard ? SPEED.guardWalk : this.crouch ? SPEED.crouch : inp.walk ? SPEED.walk : locked ? (this.sprint ? SPEED.lockSprint : SPEED.lockRun) : this.sprint ? SPEED.freeSprint : SPEED.freeRun;
        if (WORLD.active && WORLD.active.inWater(this.pos.x, this.pos.z)) top *= SPEED.water;
        top *= this.speedMul;
        // locked on (not sprinting): side-steps and backpedal are slower than advancing, like Sekiro's guarded circling;
        // it also keeps the side / back clips at a pace their feet can actually plant at
        if (locked && !this.sprint && mv && toOpp && !inp.walk) { const fw = mv.clone().normalize().dot(toOpp); top *= fw >= 0 ? 1 - (1 - fw) * (1 - SPEED.lockSide) : SPEED.lockSide + fw * (SPEED.lockSide - SPEED.lockBack); }
        moveDir = mv; moveSpeed = mv ? top : 0;
        if (locked && !this.sprint) face(toOpp, 12);
        else if (mv) face(mv, this.sprint ? 8 : 12);
        break;
      }
      case 'deflect': this.guard = true; if (this.t >= REACT.deflect.dur) this.setAct('idle'); if (toOpp) face(toOpp, 10); break;
      case 'grabbed': this.vel.set(0, 0, 0); if (this.grabDie && this.t >= REACT.grabbed.dur - 0.05) { this.grabDie = false; this.die(false); } else if (this.t >= REACT.grabbed.dur) this.setAct('idle'); break;
      case 'grabHold': this.vel.set(0, 0, 0); if (toOpp) face(toOpp, 10); if (this.t >= REACT.grabHold.dur) this.setAct('idle'); break;
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
          if (m.slam !== undefined && !this.slamDone && this.t >= m.slam) { this.slamDone = true; this.emit('slam', { heavy: !!m.heavy }); }   // landing crash of air attacks
          if (this.t >= m.dur) this.setAct('idle');
        } else if (this.act === 'jump') {
          if (!this.landSfx && this.t >= JUMP.air[1]) { this.landSfx = true; this.emit('land'); }
          if (this.t < JUMP.air[1] && inp.move && inp.move.lengthSq() > 0.01) this.locoV.lerp(inp.move.clone().normalize().multiplyScalar(Math.max(this.jumpSpeed || 0, this.locoV.length(), 1.5)), 1 - Math.exp(-JUMP.airControl * dt));
          if (this.t >= REACT.jump.dur) this.setAct('idle');
        } else if (this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll') {
          const u = clamp(this.t / 0.4, 0, 1), sp = (this.act === 'roll' ? 6.5 : 7.6) * (1 - u) * (1 - u) * 1.6;
          this.vel.set(this.dodgeDir.x * sp, 0, this.dodgeDir.z * sp);
          if (this.t >= REACT[this.act].dur) { this.setAct('idle'); this.vel.set(0, 0, 0); }
        } else if (this.act === 'guardBreak') {
          this.vel.multiplyScalar(0.85); if (opp && opp.act === 'deathblow') { const to = new V3(opp.pos.x - this.pos.x, 0, opp.pos.z - this.pos.z); if (this.fwd.dot(to.clone().normalize()) > -0.2) face(to, 12); }   // stunned: no turning around to someone behind
          if (this.t >= REACT.guardBreak.dur) { this.posture = this.maxPosture * 0.4; this.setAct('idle'); }
        } else if (this.act === 'revive') { if (this.t >= REACT.revive.dur) { this.invuln = false; this.setAct('idle'); } }
        else if (md && this.t >= md.dur && this.act !== 'sheathe') this.setAct('idle');
      }
    }
    this.integrate(dt, moveDir, moveSpeed, opp);
  }

  integrate(dt, moveDir, moveSpeed, opp) {
    const target = moveDir ? moveDir.clone().multiplyScalar(moveSpeed) : new V3();
    if (this.act !== 'idle') target.set(0, 0, 0);
    if (!(this.act === 'jump' && this.t < JUMP.air[1])) this.locoV.lerp(target, 1 - Math.exp(-(moveDir ? 10 : 14) * dt));   // airborne: no friction
    this.pos.x += (this.locoV.x + this.vel.x) * dt; this.pos.z += (this.locoV.z + this.vel.z) * dt;
    const dodging = this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll' || this.act === 'jump';
    this.vel.multiplyScalar(dodging || MOVES[this.act] ? Math.exp(-3 * dt) : Math.exp(-8 * dt));
    if (MOVES[this.act]) { const m = MOVES[this.act]; if (this.t > m.lunge[1]) this.vel.multiplyScalar(Math.exp(-10 * dt)); }
    this.speed = Math.hypot(this.locoV.x, this.locoV.z);
    if (opp && !opp.dead && this.act !== 'deathblow' && opp.act !== 'deathblow') {
      const dx = this.pos.x - opp.pos.x, dz = this.pos.z - opp.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.85 && d > 1e-4) { this.pos.x += dx / d * (0.85 - d); this.pos.z += dz / d * (0.85 - d); }
    }
    bounds(this.pos, 0.45 * this.scaleF); this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.sfxEvents();
  }

  // blade sweep vs. opponent capsule, plus a little forgiveness ("magnetism") at the heart of the swing
  // every fighter in hitTargets() (default: the current opponent) can be struck once per swing
  hitCheck(m, opp) {
    if (this.t < m.hit[0] || this.t > m.hit[1]) return;
    if (this.act === 'deathblow') { if (!this.hitDone && opp && !opp.dead) { this.hitDone = true; this.onStrike && this.onStrike(this, this.act, opp); } return; }
    const base = this.bladeBase, tip = this.bladeTip, mid = (m.hit[0] + m.hit[1]) / 2, reach = this.reach || 1;
    const list = this.hitTargets ? this.hitTargets() : [opp];
    for (const v of list) {
      if (!v || v.dead || v === this || this.hitSet.has(v)) continue;
      const dx = v.pos.x - this.pos.x, dz = v.pos.z - this.pos.z, d = Math.hypot(dx, dz); if (d > 6 * reach) continue;
      let hit = false;
      if (m.kind === 'grab') { if (d < m.range * reach && this.fwd.dot(new V3(dx / d, 0, dz / d)) > 0.6 && Math.abs(v.pos.y - this.pos.y) < 0.6) hit = true; }
      else if (base && tip) {
        const r = 0.42 * (v.scaleF || 1), a = new V3(v.pos.x, v.pos.y + 0.25, v.pos.z), b = new V3(v.pos.x, v.pos.y + 1.75 * (v.scaleF || 1), v.pos.z);
        const hk = this.katana.userData.hitK ?? 1;   // the bigger drawn blade keeps the classic cutting reach (AI parry timing stays honest)
        for (let s = 0; s <= 1.001; s += 0.2) { const p = base.clone().lerp(tip, s * hk); if (segPointDist(a, b, p) < r) { hit = true; break; } }
      }
      // forgiveness at the heart of the swing, only for the fighter we are facing
      if (!hit && this.t >= mid && d < m.range * reach && this.fwd.dot(new V3(dx / d, 0, dz / d)) > 0.55 && Math.abs(v.pos.y - this.pos.y) < 1.4) hit = true;
      if (hit) { this.hitSet.add(v); this.hitDone = true; this.onStrike && this.onStrike(this, this.act, v); }
    }
    // destructible props (lanterns, crates) in open-world maps
    if (WORLD.active && base && tip && this.onProp && !this.remote) { const ids = WORLD.active.propsHitBy(base, tip); if (ids.length) this.onProp(ids); }
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
    const fade = MOVES[this.act] ? (this.fadeIn || 0.07) : this.act === 'die' || this.act === 'dieFwd' ? 0.18 : 0.1;
    if (topClip) {
      const a = this.action(L.all[topClip]); a.time = Math.min(ct, a.getClip().duration - 1e-4);
      let e = this.full.find(e => e.a === a); if (!e) { e = { a, w: 0 }; this.full.push(e); }
      this.full.splice(this.full.indexOf(e), 1); this.full.push(e);
    }
    const n = this.full.length;
    for (let i = 0; i < n; i++) { const e = this.full[i], top = topClip && i === n - 1; e.w = top ? Math.min(1, e.w + dt / fade) : Math.max(0, e.w - dt / (MOVES[this.act] ? fade : 0.16)); }   // same rate out as in: a true crossfade
    this.full = this.full.filter(e => { if (e.w <= 0.001) { e.a.setEffectiveWeight(0); return false; } return true; });
    const sm = w => w * w * (3 - 2 * w);   // smoothstep: blend weights ease in and out
    let fullW = 0; for (const e of this.full) fullW += sm(e.w);
    const k = fullW > 1 ? 1 / fullW : 1; for (const e of this.full) e.a.setEffectiveWeight(sm(e.w) * k); fullW = Math.min(1, fullW);
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
    this.phase = (this.phase + dt * (s > 0.05 ? clamp(s / Math.max(natural, 0.5), 0.6, STRIDE.maxRate) : 0) / (sprintK > 0.5 ? L.sprintCycle : cycle)) % 1;
    const loW = new Map();   // the same clip can serve two directions (e.g. left jog reversed for right): sum weights per clip
    const setLo = (name, w, rev = false) => { const a = this.action(L.lo[name]), d = a.getClip().duration; const tt = ((rev ? 1 - this.phase : this.phase) * d) % d;
      const prev = loW.get(a) || 0; if (w > prev) a.time = tt; loW.set(a, prev + w); a.setEffectiveWeight((prev + w) * baseW); };
    const idleW = 1 - moveK;
    setLo('Sword_Regular_A', idleW * 0.55); this.action(L.lo.Sword_Regular_A).time = 0;
    setLo('Sword_Idle', idleW * 0.45); this.action(L.lo.Sword_Idle).time = (this.time * 0.6) % 1.6;
    for (const d of 'FBLR') { setLo(WALK[d][0], moveK * (1 - jogK) * dirW[d] * (1 - sprintK)); setLo(JOG[d][0], moveK * jogK * dirW[d] * (1 - sprintK), !!JOG[d][2]); }
    setLo(L.sprint, moveK * sprintK);
    // crouch layer (both halves): blends over the standing set
    this.ck = (this.ck || 0) + ((this.crouch && !this.dead ? 1 : 0) - (this.ck || 0)) * Math.min(1, dt * 8); const ck = this.ck;
    if (L.lo.Crouch_Fwd_Loop) {
      if (ck > 0.001) for (const a of this.acts.values()) { const n = a.getClip().name; if (n.endsWith('#lo') && !n.startsWith('Crouch')) a.setEffectiveWeight(a.getEffectiveWeight() * (1 - ck)); }
      this.cphase = ((this.cphase || 0) + dt * clamp(s / 1.2, 0, 1.6) / 2.0) % 1;
      const cw = { Crouch_Idle_Loop: 1 - moveK, Crouch_Fwd_Loop: moveK * dirW.F, Crouch_Bwd_Loop: moveK * dirW.B, Crouch_Left_Loop: moveK * dirW.L, Crouch_Right_Loop: moveK * dirW.R };
      for (const n of CROUCH) { const w = cw[n] * ck * baseW; for (const part of ['lo', 'up']) { const a = this.action(L[part][n]); a.time = n === 'Crouch_Idle_Loop' ? (this.time % a.getClip().duration) : (this.cphase * a.getClip().duration); a.setEffectiveWeight(w); } }
    }
    // ---- upper body: guard stance / block / running arms ----
    const U = this.uw, want = { stance: 1, block: 0, run: 0 };
    if (this.guard && !this.dead) { want.block = 1; want.stance = 0; } else if (sprintK > 0.3) { want.run = 1; want.stance = 0; }
    for (const kk in U) U[kk] += (want[kk] - U[kk]) * Math.min(1, dt * 14);
    const us = U.stance + U.block + U.run || 1;
    const up = (name, w, t) => { const a = this.action(L.up[name]); a.time = t; a.setEffectiveWeight(w / us * baseW); };
    const nck = 1 - (this.ck || 0);
    up('Sword_Regular_A', U.stance * nck, 0); up('Sword_Block', U.block * nck, 0.42); { const sd = L.all[L.sprint].duration; up(L.sprint, U.run * nck, (this.phase * sd) % sd); }
    // Procedural layers (head look, breathing, jolt, IK) write straight into bone.quaternion. The mixer only re-writes a
    // property when the sampled value CHANGES, so on held poses (stance frame, guard) those offsets used to stack up every
    // frame: the spinning head and the slow 'bows'. Restore the clean animated pose before the mixer runs, then re-save it.
    if (this.pose) for (const [o, q, pp] of this.pose) { o.quaternion.copy(q); if (pp) o.position.copy(pp); }
    this.mixer.update(0);
    if (!this.pose) { this.pose = []; this.model.traverse(o => { if (o.isBone) this.pose.push([o, new Q(), o.name === 'pelvis' ? new V3() : null]); }); }
    for (const e of this.pose) { e[1].copy(e[0].quaternion); if (e[2]) e[2].copy(e[0].position); }
    this.procedural(dt, baseW);
    this.model.updateMatrixWorld(true);
    this.attachSword(dt);
    // cloth tails
    const gt = FOLIAGE.time.value, gust = FOLIAGE.wind.value * (0.7 + 0.5 * Math.sin(gt * 0.9 + this.pos.x * 0.3) + 0.3 * Math.sin(gt * 2.7 + this.pos.z));   // same gusts as the trees
    const sideV = new V3(), wind = new V3(-this.locoV.x * 6 - this.vel.x * 4 + 0.9 * gust, 0.15 * gust, -this.locoV.z * 6 - this.vel.z * 4 + 0.45 * gust);
    this.colliders[0].c.copy(this.chest); this.colliders[1].c.copy(this.b.pelvis.getWorldPosition(new V3())).y += 0.05;
    for (const ro of this.gear.ropes) {
      const ap = ro.anchor.getWorldPosition(new V3()); sideV.set(1, 0, 0).applyQuaternion(ro.sideBone.getWorldQuaternion(new Q())).normalize();
      ro.rope.update(dt, ap, sideV, wind);
    }
  }

  // two-bone arm IK: drive the sword hand to a point with the blade aimed along dir (thrusts, deathblow)
  // two-bone arm IK. side 'r' (sword arm) or 'l'. dir: blade/finger direction for the hand, or null = keep the hand's world rotation
  armIK(target, dir, w, side = 'r') {
    if (w <= 0.001) return;
    const L = side === 'l', ua = L ? this.b.uarmL : this.b.uarm, la = L ? this.b.farmL : this.b.farm, h = L ? this.b.handL : this.b.hand;
    ua.updateWorldMatrix(true, false);   // only the chain up to the shoulder needs fresh matrices (getWorld* refresh their parents)
    const orig = [ua.quaternion.clone(), la.quaternion.clone(), h.quaternion.clone()];
    const wp = o => o.getWorldPosition(new V3());
    const S = wp(ua), l1 = S.distanceTo(wp(la)), l2 = wp(la).distanceTo(wp(h));
    const d = target.clone().sub(S); let dist = d.length(); d.divideScalar(Math.max(dist, 1e-4));
    dist = clamp(dist, Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.005); const Tc = S.clone().addScaledVector(d, dist);
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const right = new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const keepQ = dir ? null : h.getWorldQuaternion(new Q());
    const pole = right.clone().multiplyScalar(L ? -0.6 : 0.6).add(new V3(0, -1, 0)); pole.addScaledVector(d, -pole.dot(d)).normalize();
    const E = S.clone().addScaledVector(d, a).addScaledVector(pole, hh);
    const aim = (bone, child, to) => { const bp = wp(bone), cp = wp(child); const q = new Q().setFromUnitVectors(cp.sub(bp).normalize(), to.clone().sub(bp).normalize());
      const bw = bone.getWorldQuaternion(new Q()), pw = bone.parent.getWorldQuaternion(new Q()); bone.quaternion.copy(pw.invert().multiply(q.multiply(bw))); bone.updateMatrixWorld(true); };
    aim(ua, la, E); aim(la, h, Tc);
    if (dir) { const hq = h.getWorldQuaternion(new Q()), z = (L || !this.bladeLocal ? new V3(0, 0, 1) : this.bladeLocal.clone()).applyQuaternion(hq);
      const nq = new Q().setFromUnitVectors(z, dir.clone().normalize()).multiply(hq), pw = h.parent.getWorldQuaternion(new Q());
      h.quaternion.copy(pw.invert().multiply(nq)); }
    else h.quaternion.copy(h.parent.getWorldQuaternion(new Q()).invert().multiply(keepQ));
    if (w < 0.999) [ua, la, h].forEach((b, i) => { const q = b.quaternion.clone(); b.quaternion.copy(orig[i]).slerp(q, w); });
    ua.updateMatrixWorld(true);   // arm subtree (forearm, hand, fingers) instead of the whole character
  }
  thrustIK() {
    const A = this.act; if (A !== 'thrust' && A !== 'deathblow' && A !== 'ambush' && A !== 'jab') return;
    const m = MOVES[A], t = this.t;
    const w = A === 'deathblow' ? (t < 0.55 ? 0 : t < 0.72 ? smooth((t - 0.55) / 0.17) : t < 1.35 ? 1 : t < 1.7 ? 1 - smooth((t - 1.35) / 0.35) : 0)
      : (t < m.hit[0] - 0.1 ? 0 : t < m.hit[0] ? smooth((t - m.hit[0] + 0.1) / 0.1) : t < m.hit[1] + 0.15 ? 1 : t < m.hit[1] + 0.4 ? 1 - smooth((t - m.hit[1] - 0.15) / 0.25) : 0);
    if (w <= 0) return;
    const sh = this.b.uarm.getWorldPosition(new V3()), o = this.opp;
    const aimP = o ? o.chest.clone() : sh.clone().addScaledVector(this.fwd, 2);
    if (A === 'deathblow' && o) aimP.y = o.chest.y - 0.05;
    const dir = aimP.clone().sub(sh); dir.y = clamp(dir.y, -0.4, 0.15); dir.normalize();
    let hand;
    if (A === 'deathblow' && o) hand = sh.clone().addScaledVector(dir, Math.max(THRUST_MIN_REACH, aimP.distanceTo(sh) - 0.5));   // never pull the hand into the shoulder (the elbow flipped through it)
    else hand = sh.clone().addScaledVector(dir, 0.62).add(new V3(0, -0.04, 0));
    // follow the target smoothly: the victim's own reaction moves its chest every frame, a raw target made the elbow jump
    const k = this.tikSeq === this.seq ? 1 - Math.exp(-18 * this.dtLast) : 1; this.tikSeq = this.seq;
    this.tikH = k < 1 ? this.tikH.lerp(hand, k) : hand.clone(); this.tikD = k < 1 ? this.tikD.lerp(dir, k).normalize() : dir.clone();
    this.armIK(this.tikH, this.tikD, w);
  }

  // Two-handed grip: where the clip already brings the left hand near the hilt (Mixamo great-sword moves), seat the
  // palm on the wrap just below the sword hand. One-handed frames (hand far away) are left alone.
  // ---- hilt frame from the real hand bones (rest pose) ----
  // The fist is formed procedurally (FIST angles) and the hilt axis runs through the middle of the finger loop:
  // blade out of the thumb / index side (pinky -> index), edge toward the knuckles. Stored relative to hand_r.
  setupGrip() {
    const B = n => this.model.getObjectByName(n), W = o => o.getWorldPosition(new V3());
    const sides = { r: [], l: [] };
    for (const t of ['r', 'l']) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (let i = 1; i <= 3; i++) { const b = B(`${f}_0${i}_${t}`); if (b) sides[t].push({ b, f, i, rest: b.quaternion.clone() }); }
    this.fingers = sides; this.model.updateMatrixWorld(true);
    for (const t of ['r', 'l']) {
      const hand = B('hand_' + t), idx = B('index_01_' + t), pk = B('pinky_01_' + t), mid = B('middle_01_' + t); if (!hand || !idx || !pk || !mid) continue;
      const lat = W(idx).sub(W(pk)).normalize(), fdir = W(mid).sub(W(hand)).normalize(), thumbAx = fdir.clone();
      for (const e of sides[t]) {   // curl axis in bone space; the sign is picked so the finger closes toward the palm
        const ax = (e.f === 'thumb' ? thumbAx : lat).clone().applyQuaternion(e.b.getWorldQuaternion(new Q()).invert()).normalize(); e.ax = ax; e.sign = 1;
      }
      // pick the closing direction numerically: curl the middle finger both ways, keep the one that brings its tip nearer the wrist
      // palm normal: toward the thumb side, perpendicular to the finger direction and the knuckle line
      const th = B('thumb_01_' + t), pn = th ? W(th).sub(W(hand)) : new V3(0, -1, 0); pn.addScaledVector(fdir, -pn.dot(fdir)).addScaledVector(lat, -pn.dot(lat)).normalize();
      const tip = B('middle_03_' + t), chain = sides[t].filter(e => e.f === 'middle'), t0 = W(tip);
      const tryCurl = sg => { for (const e of chain) e.b.quaternion.copy(e.rest).multiply(new Q().setFromAxisAngle(e.ax, sg * 0.8)); this.model.updateMatrixWorld(true); const d = W(tip).sub(t0).dot(pn); for (const e of chain) e.b.quaternion.copy(e.rest); return d; };
      const sg = tryCurl(1) > tryCurl(-1) ? 1 : -1;   // the side that moves the fingertip into the palm
      const tb = B('thumb_03_' + t), tchain = sides[t].filter(e => e.f === 'thumb');
      const tryThumb = q => { for (const e of tchain) e.b.quaternion.copy(e.rest).multiply(new Q().setFromAxisAngle(e.ax, q * 0.6)); this.model.updateMatrixWorld(true); const d = W(tb).distanceTo(W(B('middle_02_' + t))); for (const e of tchain) e.b.quaternion.copy(e.rest); return d; };
      const tsg = tb && tchain.length ? (tryThumb(1) < tryThumb(-1) ? 1 : -1) : 1;
      for (const e of sides[t]) e.sign = e.f === 'thumb' ? tsg : sg;
      if (t !== 'r') continue;
      // hilt through the closed fist
      this.fist('r', 1); this.model.updateMatrixWorld(true);
      const G = ['middle_01_r', 'middle_03_r', 'index_02_r', 'ring_02_r'].map(n => W(B(n))).reduce((a, b) => a.add(b), new V3()).multiplyScalar(0.25);
      const Z = lat.clone(), Y = W(mid).sub(G); Y.addScaledVector(Z, -Y.dot(Z)).normalize(); const X = Y.clone().cross(Z).normalize();
      const qW = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      const pW = G.clone().addScaledVector(Z, GRIP.handZ);
      this.gripLocalPos = hand.worldToLocal(pW.clone()); this.gripLocalQ = hand.getWorldQuaternion(new Q()).invert().multiply(qW);
      this.bladeLocal = new V3(0, 0, 1).applyQuaternion(this.gripLocalQ);   // blade axis in hand space (for arm IK)
      for (const e of sides.r) e.b.quaternion.copy(e.rest); this.model.updateMatrixWorld(true);
    }
  }
  // close the fingers of one hand around the hilt (w: 0 = keep the clip, 1 = full fist)
  fist(t, w) {
    if (!this.fingers || w <= 0.001) return;
    for (const e of this.fingers[t]) { const a = FIST[e.f === 'thumb' ? 'thumb' : 'finger'][e.i - 1] * e.sign;
      const q = e.rest.clone().multiply(new Q().setFromAxisAngle(e.ax, a)); if (w >= 0.999) e.b.quaternion.copy(q); else e.b.quaternion.slerp(q, w); }
  }
  // world pose of the katana for the current hand pose
  hiltWorld() {
    const h = this.b.hand; return { p: h.localToWorld(this.gripLocalPos.clone()), q: h.getWorldQuaternion(new Q()).multiply(this.gripLocalQ).multiply(_rollQ.setFromAxisAngle(_Z, GRIP.roll)) };
  }
  // blade-on-blade: called by the game at the exact moment a deflect / block / clash is resolved
  meetBlade(p, other, attacker, res) {
    const od = other.bladeTip && other.bladeBase ? other.bladeTip.clone().sub(other.bladeBase).normalize() : new V3(0, 1, 0);
    this.parryV = { p: p.clone(), od, att: attacker, t: 0, heavy: res === 'clash', from: other.pos.clone() };
    if (attacker) this.recoilT = PARRY_FX.recoil;   // sword arm bounces off
  }
  parryIK(dt) {
    const P = this.parryV; if (!P) return; P.t += dt;
    const [tin, hold, tout] = PARRY_FX.env, t = P.t;
    if (t > hold + tout || this.dead) { this.parryV = null; return; }
    const w = t < tin ? smooth(t / tin) : t < hold ? 1 : 1 - smooth((t - hold) / tout);
    if (P.att) {   // attacker: the blade is knocked back up and away from the contact
      const RIGHT = new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)), k = w * (P.heavy ? 1.4 : 1);
      const ax = RIGHT.clone().applyQuaternion(this.b.hand.getWorldQuaternion(new Q()).invert()).normalize(); this.b.hand.quaternion.multiply(new Q().setFromAxisAngle(ax, -PARRY_FX.bounce * k));
      const ax2 = RIGHT.clone().applyQuaternion(this.b.farm.getWorldQuaternion(new Q()).invert()).normalize(); this.b.farm.quaternion.multiply(new Q().setFromAxisAngle(ax2, -PARRY_FX.bounce * 0.5 * k));
      return;
    }
    // defender: blade across the incoming one, through the contact point, edge toward the attacker
    const toAtt = new V3(P.from.x - this.pos.x, 0, P.from.z - this.pos.z).normalize();
    let d = P.od.clone().cross(toAtt); if (d.lengthSq() < 1e-3) d.set(0, 1, 0); d.normalize(); if (d.y < 0) d.negate();
    d.addScaledVector(toAtt, 0.35).normalize();
    const sh = this.b.uarm.getWorldPosition(new V3()), el = this.b.farm.getWorldPosition(new V3()), hd = this.b.hand.getWorldPosition(new V3());
    const arm = (sh.distanceTo(el) + el.distanceTo(hd)) * 0.97;   // reachable hand distance from the shoulder
    let H = P.p.clone().addScaledVector(d, -PARRY_FX.reach * this.scaleF);
    const off = H.clone().sub(sh), L = off.length(); if (L > arm) H = sh.clone().addScaledVector(off, arm / L);
    // the blade must pass through the contact point: aim it from the (reachable) hand straight at it, with the palm offset
    const pd = P.p.clone().sub(H); if (pd.length() > 0.05) d = pd.normalize();
    this.armIK(H, d, w);
    // second pass: measure where the blade really is (the hilt sits off the hand bone) and correct the miss
    // (weighted by the envelope, not switched at a threshold: a switch made the forearm jump as the parry let go)
    if (w > 0.02) { this.model.updateMatrixWorld(true); const hw = this.hiltWorld(), base = hw.p;
      const bd = new V3(0, 0, 1).applyQuaternion(hw.q), u = Math.max(0, P.p.clone().sub(base).dot(bd));
      const miss = P.p.clone().sub(base.clone().addScaledVector(bd, u));
      if (miss.length() > 0.01) this.armIK(this.b.hand.getWorldPosition(new V3()).add(miss), bd, w); }
  }
  leftGripIK(dt) {
    const K = this.katana; let w = 0, tgt = null, palmOff = null;
    if (!this.sheathed && !this.dead && K && !K.userData.spear && this.b.palmL) {
      const s = this.scaleF, hw = this.hiltWorld(), kq = hw.q, kp = hw.p;
      const wrist = this.b.handL.getWorldPosition(new V3()), palm = this.b.palmL.getWorldPosition(new V3()).lerp(wrist, 0.35);
      palmOff = palm.clone().sub(wrist);
      // distance of the animated palm from the hilt axis (z -0.25..-0.04 in katana space)
      const loc = palm.clone().sub(kp).applyQuaternion(kq.clone().invert()).divideScalar(s);
      const zc = clamp(loc.z, -0.25, -0.04), d = Math.hypot(loc.x, loc.y, loc.z - zc);
      w = 1 - smooth(clamp((d - GRIP.near) / (GRIP.far - GRIP.near), 0, 1));
      if (this.guard || this.act === 'deflect') w = 1;                       // block and parry: always both hands on the hilt
      else if (MOVES[this.act]) w = Math.max(w, 1 - smooth(clamp((d - GRIP.near) / (GRIP.atkFar - GRIP.near), 0, 1)));   // swings: grab the hilt whenever it is within reach
      tgt = new V3(0, 0, GRIP.z * s).applyQuaternion(kq).add(kp).sub(palmOff);
    }
    this.gripW = (this.gripW || 0) + (w - (this.gripW || 0)) * (1 - Math.exp(-GRIP.rate * dt));
    if (tgt && this.gripW > 0.01) this.armIK(tgt, null, this.gripW, 'l');
  }

  procedural(dt, baseW) {
    this.dtLast = dt;
    this.thrustIK();
    // rotate a bone about a WORLD axis (the rig's local axes are not the character's pitch/yaw axes)
    const twW = (bone, worldAxis, ang) => { if (Math.abs(ang) < 1e-4) return; const ax = worldAxis.clone().applyQuaternion(bone.getWorldQuaternion(new Q()).invert()).normalize(); bone.quaternion.multiply(new Q().setFromAxisAngle(ax, ang)); };
    const yawT = this.yaw + this.visYaw, RIGHT = new V3(-Math.cos(yawT), 0, Math.sin(yawT));   // + angle about RIGHT = lean back
    // breathing (only under the guard pose)
    const br = Math.sin(this.time * 2.1) * BREATH * baseW;
    twW(this.b.sp2, RIGHT, br); twW(this.b.sp3, RIGHT, br * 0.6);
    // impact jolt: spine thrown back + twisted, head untouched
    const j = Math.max(-0.6, Math.min(1.4, this.jX || 0));
    if (j) { twW(this.b.sp1, RIGHT, JOLT_BACK * 0.4 * j); twW(this.b.sp2, RIGHT, JOLT_BACK * 0.35 * j); twW(this.b.sp3, RIGHT, JOLT_BACK * 0.25 * j); twW(this.b.sp2, UP, JOLT_TWIST * j * (this.jDir || 1)); }
    // movement response from the actual ground velocity (works for remote fighters too): accelerate -> lean in,
    // brake -> lean back, turn while moving -> bank. Smoothed so it reads as weight, not as jitter.
    if (dt > 0 && !this.dead) {
      const pv = this.mPrev || (this.mPrev = this.pos.clone()), v = new V3(this.pos.x - pv.x, 0, this.pos.z - pv.z).divideScalar(dt); pv.copy(this.pos);
      if (v.length() > 14) v.set(0, 0, 0);   // teleport / respawn
      const vs = this.mVel || (this.mVel = new V3()), acc = v.clone().sub(vs).divideScalar(Math.max(dt, 1e-3)); vs.lerp(v, 1 - Math.exp(-MOTION.rate * dt));
      const FWD = new V3(Math.sin(yawT), 0, Math.cos(yawT)), yr = angDiff(this.mYaw ?? yawT, yawT) / dt; this.mYaw = yawT;
      const busy = !!MOVES[this.act];   // attacks carry their own body mechanics
      const lt = busy ? 0 : clamp(-acc.dot(FWD) * MOTION.accLean, -MOTION.maxLean, MOTION.maxLean);
      const RT = new V3(-Math.cos(yawT), 0, Math.sin(yawT)), dodging = this.act === 'dodgeL' || this.act === 'dodgeR' || this.act === 'roll';
      const bt = busy ? 0 : clamp(-yr * vs.length() * MOTION.bank * 0.1 + (dodging ? acc.dot(RT) * MOTION.dodgeBank : 0), -MOTION.maxBank * (dodging ? 2.2 : 1), MOTION.maxBank * (dodging ? 2.2 : 1));
      this.mLean = (this.mLean || 0) + (lt - (this.mLean || 0)) * (1 - Math.exp(-MOTION.rate * dt));
      this.mBank = (this.mBank || 0) + (bt - (this.mBank || 0)) * (1 - Math.exp(-MOTION.rate * dt));
      { const ph = (this.phase || 0) % 1, half = ph >= 0.5 ? 1 : 0, sp = vs.length();   // footsteps: two per locomotion cycle
        if (this.stepHalf !== undefined && half !== this.stepHalf && sp > 1.2 && !busy && !this.airborne) this.emit('step', { sprint: sp > 5 }); this.stepHalf = half; }
      if (Math.abs(this.mLean) > 1e-3) { twW(this.b.sp1, RIGHT, this.mLean * 0.5); twW(this.b.sp2, RIGHT, this.mLean * 0.5); }
      if (Math.abs(this.mBank) > 1e-3) { twW(this.b.pelvis, FWD, this.mBank * 0.4); twW(this.b.sp2, FWD, this.mBank * 0.6); }
      // stance life: slow weight shift and a faint blade drift while standing in guard
      const still = !busy && vs.length() < 0.4 ? baseW : 0;
      if (still > 0.01) { const T = this.time + (this.seedT || (this.seedT = Math.random() * 10));
        twW(this.b.pelvis, FWD, Math.sin(T * MOTION.swayHz * 6.283) * MOTION.sway * still);
        twW(this.b.sp3, FWD, -Math.sin(T * MOTION.swayHz * 6.283) * MOTION.sway * 0.6 * still);
        twW(this.b.hand, RIGHT, Math.sin(T * MOTION.bladeHz * 6.283 + 1.3) * MOTION.blade * still); }
    }
    // strike weight: lean the spine into the cut around the active frames (our own layer over the clip)
    const sm = MOVES[this.act];
    if (sm && sm.kind !== 'deathblow') {
      const a0 = sm.hit[0] - STRIKE_LEAN.pre, a1 = sm.hit[1], t = this.t;
      const e = t < a0 ? 0 : t < a1 ? smooth((t - a0) / (a1 - a0)) : Math.max(0, 1 - (t - a1) / STRIKE_LEAN.post);
      const lean = -(sm.heavy ? STRIKE_LEAN.heavy : STRIKE_LEAN.light) * e;   // negative = forward
      if (e > 0) { twW(this.b.sp1, RIGHT, lean * 0.4); twW(this.b.sp2, RIGHT, lean * 0.6); }
    }
    // body drive: coil against the cut in the wind-up, unwind through it (the hips and chest pull the sword round)
    { let yawT = 0, backT = 0;
      if (sm && sm.swing && sm.kind !== 'deathblow') {
        const h0 = Math.max(0.05, sm.hit[0]), h1 = sm.hit[1], t = this.t, k = sm.heavy ? COIL.heavyK : 1;
        const coil = t < h0 ? smooth(t / h0) : 0, rel = t < h0 ? 0 : t < h1 ? 1 - (1 - (t - h0) / (h1 - h0)) ** 2 : 1, fade = t < h1 ? 1 : Math.max(0, 1 - (t - h1) / COIL.post);
        if (sm.swing === 'down') backT = COIL.back * k * (t < h0 ? coil : 0);
        else yawT = sm.swing * k * (t < h0 ? -COIL.yaw * coil : (-COIL.yaw + (COIL.yaw + COIL.release) * rel) * smooth(fade));
      }
      const a = 1 - Math.exp(-COIL.rate * dt); this.coilY = (this.coilY || 0) + (yawT - (this.coilY || 0)) * a; this.coilB = (this.coilB || 0) + (backT - (this.coilB || 0)) * a;
      if (Math.abs(this.coilY) > 1e-3) { twW(this.b.sp1, UP, this.coilY * 0.3); twW(this.b.sp2, UP, this.coilY * 0.35); twW(this.b.sp3, UP, this.coilY * 0.35); }
      if (this.coilB > 1e-3) { twW(this.b.sp2, RIGHT, this.coilB * 0.5); twW(this.b.sp3, RIGHT, this.coilB * 0.5); }
    }
    // head + neck: turn only by the difference between the chest's real facing (after animation) and the opponent
    let want = 0;
    if (this.opp && !this.dead && !HEAD_OFF.has(this.act) && !MOVES[this.act]) {
      const l = this.b.uarmL.getWorldPosition(new V3()), r = this.b.uarm.getWorldPosition(new V3());
      const cf = UP.clone().cross(r.sub(l)); const chestYaw = Math.atan2(cf.x, cf.z);
      const raw = angDiff(chestYaw, Math.atan2(this.opp.pos.x - this.pos.x, this.opp.pos.z - this.pos.z));
      want = Math.abs(raw) > HEAD_BEHIND ? 0 : clamp(raw, -HEAD_MAX, HEAD_MAX);
    }
    this.headYaw = clamp(this.headYaw + (want - this.headYaw) * clamp(1 - Math.exp(-HEAD_RATE * dt), 0, 1), -HEAD_MAX, HEAD_MAX);   // hard limit: never more than HEAD_MAX off the chest
    if (Math.abs(this.headYaw) > 1e-4) for (const [bone, share] of [[this.b.neck, HEAD_NECK_SHARE], [this.b.head, 1 - HEAD_NECK_SHARE]]) {
      const axis = UP.clone().applyQuaternion(bone.getWorldQuaternion(new Q()).invert());
      bone.quaternion.multiply(new Q().setFromAxisAngle(axis, this.headYaw * share));
    }
    this.fist('r', this.sheathed ? FIST_RELAX : 1);
    this.parryIK(dt);
    this.leftGripIK(dt);
    this.fist('l', this.gripW || 0);
    // neck limiter: whatever the clip + look-at did, the head never twists more than NECK_MAX off the chest
    if (!this.neckRest) { const B0 = n => this.base.scene.getObjectByName(n); this.base.scene.updateMatrixWorld(true);
      this.neckRest = B0('spine_03').getWorldQuaternion(new Q()).invert().multiply(B0('Head').getWorldQuaternion(new Q())); }
    { this.model.updateMatrixWorld(true);
      const cw = this.b.sp3.getWorldQuaternion(new Q()), hw = this.b.head.getWorldQuaternion(new Q());
      const rel = cw.clone().invert().multiply(hw).multiply(this.neckRest.clone().invert());   // chest-space twist from rest
      const ang = 2 * Math.acos(Math.min(1, Math.abs(rel.w)));
      if (ang > NECK_MAX) { const lim = new Q().slerp(rel, NECK_MAX / ang); const nw = cw.multiply(lim).multiply(this.neckRest);
        this.b.head.quaternion.copy(this.b.head.parent.getWorldQuaternion(new Q()).invert().multiply(nw)); } }
    // hit flash: brief emissive pulse on body and clothes
    if (this.flashT > 0 || this.flashOn) {
      if (!this.flashMats) { this.flashMats = []; this.model.traverse(o => { if (o.isMesh && o.material && o.material.emissive) for (const m of [].concat(o.material)) if (!this.flashMats.includes(m)) this.flashMats.push({ m, c: m.emissive.clone(), i: m.emissiveIntensity }); }); }
      this.flashT = Math.max(0, this.flashT - dt); const k = this.flashT / HIT_FLASH;
      for (const f of this.flashMats) { if (k > 0) { f.m.emissive.setRGB(1, 0.12, 0.08); f.m.emissiveIntensity = 0.22 * k; } else { f.m.emissive.copy(f.c); f.m.emissiveIntensity = f.i; } }   // a hot red pulse, not a white-out: the cut line and blood carry the hit
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
    const fall = this.act === 'die' || this.act === 'dieFwd' ? 0.6 : this.act === 'knockdown' ? 0.35 : 0;   // body hits the ground
    if (fall && this.fellAct !== this.actStart && this.t > fall) { this.fellAct = this.actStart; this.emit('fall', { k: this.act === 'knockdown' ? 0.7 : 1 }); }
    if (this.sheathed) { this.saya.updateMatrixWorld(true); this.saya.matrixWorld.decompose(K.position, K.quaternion, new V3()); K.scale.setScalar(this.scaleF); }
    else {
      // edge alignment: during an attack the wrist turns the blade about its axis so the edge leads (MOVES[].edge)
      const em = MOVES[this.act], tgt = em && em.edge ? em.edge : 0; let dr = tgt - (this.edgeRoll || 0); dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.edgeRoll = Math.atan2(Math.sin((this.edgeRoll || 0) + dr * (1 - Math.exp(-GRIP.edgeRate * dt))), Math.cos((this.edgeRoll || 0) + dr * (1 - Math.exp(-GRIP.edgeRate * dt))));
      const hw = this.hiltWorld(); K.quaternion.copy(hw.q).multiply(_rollQ.setFromAxisAngle(_Z, this.edgeRoll)); K.position.copy(hw.p);
      K.scale.setScalar(this.scaleF);
    }
    K.updateMatrixWorld(true);
    // grip cutaway (gear.js): open around the fist and hilt in the stance poses, closed while swinging or sheathed
    const cut = this.gear.cut; if (cut) { const open = !this.sheathed && !this.dead && !MOVES[this.act]; cut.cutR.value += ((open ? 0.085 * this.scaleF : 0) - cut.cutR.value) * 0.35;
      if (cut.cutR.value > 0.002) { K.localToWorld(cut.cutA.value.set(0, 0, 0.03)); K.localToWorld(cut.cutB.value.set(0, 0, -0.42)); } }
    const ud = K.userData, base = new V3(0, 0, ud.baseZ ?? 0.12).applyMatrix4(K.matrixWorld), tip = new V3(0, -0.02, ud.tipZ ?? 0.76).applyMatrix4(K.matrixWorld);
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
  // shadow LOD: distant fighters skip the shadow pass (it re-draws every mesh)
  setShadows(on) { if (this.shadowsOn === on) return; this.shadowsOn = on; this.group.traverse(o => { if (o.isMesh) o.castShadow = on; }); this.katana.traverse(o => { if (o.isMesh) o.castShadow = on; }); }
  // frees GPU memory of this fighter's own geometry/materials (shared textures and the base model's joint mesh stay)
  dispose() {
    this.scene.remove(this.group, this.katana); this.trail.dispose(); for (const r of this.gear.ropes) r.rope.dispose(this.scene);
    const free = o => o.traverse(m => { if (m.geometry && !m.userData.sharedGeo) m.geometry.dispose(); if (m.material) for (const mt of [].concat(m.material)) mt.dispose(); });
    free(this.group); free(this.katana); for (const m of this.gear.mats) m.dispose();
    const sk = new Set(); this.model.traverse(o => { if (o.isSkinnedMesh && o.skeleton) sk.add(o.skeleton); }); for (const s of sk) s.dispose();   // bone textures
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); this.acts.clear();
  }
}

function segPointDist(a, b, p) { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(p); }
