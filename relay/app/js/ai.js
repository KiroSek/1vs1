import * as THREE from 'three';
import { MOVES } from './moves.js';

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const SWEEP_JUMP_SKILL = [0.15, 0.55, 0.85];
const SWEEP_JUMP_LEAD = 0.2;
const NO_TRADE = 0.85;                            // chance the AI guards instead of swinging into an incoming wind-up
const LINK_CHANCE = [0, 0.4, 0.7];                // per AI level: chance to chain a Sekiro link (dodge->step cut, jump->plunge/vault)                     // s before the sweep's active frames the AI jumps (jump is airborne 0.14 s after take-off)   // per AI level: chance to answer a sweep with a jump (else it eats it)
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const pickW = w => { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };

// Behaviour profiles. Move weights: plain light / heavy swings carry the fight, specials and perilous moves are spice.
// react: chance to answer an incoming swing at all · deflect: share of answers that are timed deflects
// err: deflect timing error (s) · guard: share of answers that are held guards (rest = sidestep). Blades should meet
// far more often than bodies step aside: guards are the main answer, sidesteps the exception · aggr: how often it opens offence
// combo: max chain length · punish: chance to exploit an opening · track: wind-up tracking rate · think: decision interval
export const PROFILES = [
  { mobility: 0.12, react: 0.4, deflect: 0.18, err: 0.09, guard: 0.6, aggr: 0.38, combo: 2, punish: 0.3, track: 3.5, think: [0.7, 1.4], moves: { slash: 6, heavy: 2, dash: 0.5 } },
  { mobility: 0.35, react: 0.68, deflect: 0.5, err: 0.05, guard: 0.7, aggr: 0.5, combo: 3, punish: 0.6, track: 5.5, think: [0.45, 1.0], moves: { slash: 7, heavy: 2.5, dash: 1, thrust: 0.6, kick: 0.4, uppercut: 0.7, sweep: 0.4, crush: 0.3, grab: 0.3 } },
  { mobility: 0.55, react: 0.88, deflect: 0.72, err: 0.028, guard: 0.65, aggr: 0.62, combo: 3, punish: 0.85, track: 7.5, think: [0.3, 0.75], moves: { slash: 8, heavy: 3, dash: 1, thrust: 0.8, kick: 0.5, uppercut: 0.8, heavyB: 1, leap: 0.6, sweep: 0.5, crush: 0.4, grab: 0.3 } },
];

// skill can be fractional (Survival: 0 weak .. 1 medium .. 2 strong): numbers in the two neighbouring profiles are blended
function blendProfile(sk) {
  const lo = Math.floor(sk), hi = Math.min(2, lo + 1), t = sk - lo, A = PROFILES[lo], B = PROFILES[hi], out = {};
  for (const k in A) { const a = A[k], b = B[k]; out[k] = typeof a === 'number' ? a + (b - a) * t : Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a; }
  const mv = {}; for (const k of new Set([...Object.keys(A.moves), ...Object.keys(B.moves)])) mv[k] = (A.moves[k] || 0) + ((B.moves[k] || 0) - (A.moves[k] || 0)) * t; out.moves = mv;
  return out;
}
const lerpLv = (arr, sk) => { const lo = Math.floor(sk), hi = Math.min(2, lo + 1); return arr[lo] + (arr[hi] - arr[lo]) * (sk - lo); };

export class AI {
  constructor(f, level = 1, prof = null) {
    const sk = Math.max(0, Math.min(2, level)); this.sk = sk;
    this.f = f; this.level = Math.round(sk); this.mode = 'duel';
    f.delayChance = lerpLv([0, 0.25, 0.4], sk);   // share of heavy attacks with a held, delayed wind-up
    const base = Number.isInteger(sk) ? PROFILES[sk] : blendProfile(sk);
    this.P = { ...base, ...(prof || {}) }; if (prof && prof.moves) this.P.moves = { ...base.moves, ...prof.moves };
    this.pi = 0; this.combo = null; this.opening = 0;
    this.inp = { move: new V3(), light: 0, heavy: 0, heavyKind: 'heavy', dodge: 0, finisher: 0, guard: false, walk: false, lock: true, aim: null, sprint: false, trackRate: this.P.track };
    this.state = 'neutral'; this.timer = rnd(0.4, 1); this.strafe = Math.random() < 0.5 ? 1 : -1; this.plan = null; this.chain = 0;
    this.answered = -1; this.deflectAt = -1; this.guardFor = 0; this.oppGuardTime = 0; this.retreat = 0; this.prefDist = rnd(2.6, 3.4);
  }
  think(dt, opp) {
    const f = this.f, i = this.inp, P = this.P;
    i.move.set(0, 0, 0); i.walk = false; i.sprint = false; i.trackRate = P.track; i.light = i.light || 0;
    if (f.dead || !opp) { i.guard = false; return i; }
    const d = new V3(opp.pos.x - f.pos.x, 0, opp.pos.z - f.pos.z), dist = d.length(); d.divideScalar(Math.max(dist, 1e-3));
    const side = new V3(-d.z, 0, d.x);
    if (this.mode === 'dummy-idle') { i.guard = false; return i; }
    if (this.mode === 'dummy-block') { i.guard = true; return i; }
    if (this.mode === 'dummy-attack') { i.guard = false; if (f.act === 'idle') { if (dist > 2.2) i.move.copy(d); else if ((this.timer -= dt) <= 0) { i.light = 0.2; this.timer = 2; } } return i; }
    if (opp.dead) { i.guard = false; return i; }
    this.timer -= dt; this.guardFor -= dt; this.retreat -= dt;
    if (this.linkAt > 0) { this.linkAt -= dt; if (this.linkAt <= 0 && dist < 3.4) { i[this.linkKey] = 0.2; if (this.linkKey === 'light') i.guard = false; } }
    const link = key => { if (Math.random() < lerpLv(LINK_CHANCE, this.sk)) { this.linkAt = key === 'light' ? 0.24 : 0.3; this.linkKey = key; } };
    this.oppGuardTime = opp.guard ? this.oppGuardTime + dt : Math.max(0, this.oppGuardTime - dt * 2);

    // ---- finish a broken opponent ----
    // a broken / finished opponent is immune to normal cuts: only go for the deathblow, otherwise wait
    if (opp.act === 'guardBreak' || opp.act === 'dbVictim') { i.guard = false; i.light = 0; i.heavy = 0; this.chain = 0; this.plan = null;
      if (this.allowAttack === false) { if (dist < 3) i.move.copy(d).negate(); return i; }   // only the one holding the attack token finishes
      if (opp.broken && dist < 3.0) i.finisher = 0.25; else if (opp.broken) { i.move.copy(d); i.sprint = dist > 4; } else if (dist < 2) i.move.copy(d).negate(); return i; }

    // ---- defence: answer the opponent's swing once per attack ----
    const om = MOVES[opp.act];
    if (this.opening > 0) this.opening -= dt;
    if (om && opp.act !== 'deathblow' && dist < om.range + 1.6 + (opp.act === 'dash' ? 4 : 0) && opp.seq !== this.answered && opp.t < om.hit[0]) {
      this.answered = opp.seq;
      const busy = this.combo && this.combo.length, react = busy ? 0 : this.opening > 0 ? P.react * (P.openReact ?? 0.25) : P.react;   // a boss mid-pattern doesn't answer; in its opening it barely does
      if (Math.random() < react) {
        const eta = (om.hit[0] - opp.t) / (opp.tempo || 1);
        const r = Math.random();
        if (om.kind === 'sweep') { if (Math.random() < lerpLv(SWEEP_JUMP_SKILL, this.sk)) this.jumpAt = eta - SWEEP_JUMP_LEAD + gauss() * P.err * 1.5; }
        else if (om.perilous && om.kind === 'thrust' && this.sk >= 0.8 && Math.random() < P.deflect * 0.8) { this.dodgeAt = eta - 0.08 + gauss() * P.err; this.dodgeDir = d.clone(); }       // Mikiri: step into it
        else if (om.perilous) { this.dodgeAt = eta - 0.1 + gauss() * P.err; this.dodgeDir = side.clone().multiplyScalar(this.strafe); }
        else if (r < P.deflect) this.deflectAt = eta - 0.07 + gauss() * P.err;
        else if (r < P.deflect + (1 - P.deflect) * P.guard) this.guardFor = eta + (om.hit[1] - om.hit[0]) + 0.25;
        else { this.dodgeAt = eta - 0.15 + gauss() * P.err; this.dodgeDir = side.clone().multiplyScalar(this.strafe); }
      }
    }
    if (this.deflectAt !== -1) { this.deflectAt -= dt; if (this.deflectAt <= 0) { this.deflectAt = -1; this.guardFor = 0.28; this.freshGuard = true; } }
    if (this.jumpAt !== undefined && this.jumpAt !== -1) { this.jumpAt -= dt; if (this.jumpAt <= 0) { this.jumpAt = -1; i.jump = 0.2; i.guard = false; link(Math.random() < 0.5 ? 'jump' : 'light'); return i; } }
    if (this.dodgeAt !== undefined && this.dodgeAt !== -1) { this.dodgeAt -= dt; if (this.dodgeAt <= 0) { this.dodgeAt = -1; i.dodge = 0.2; i.move.copy(this.dodgeDir); i.guard = false; if (this.dodgeDir.dot(d) < 0.5) link('light'); return i; } }
    // a deflect is a fresh press: release for one frame so the guard edge registers
    if (this.freshGuard) { this.freshGuard = false; i.guard = false; return i; }
    i.guard = this.guardFor > 0 && f.act === 'idle';
    if (i.guard) { i.move.copy(side).multiplyScalar(this.strafe * 0.4); i.walk = true; return i; }

    // ---- mobility: back-step out of its own finished combo, random re-positioning ----
    const free = f.act === 'idle';
    const resting = P.pattern && this.opening > 0;   // a pattern boss stays readable in its opening: no random hops
    if (free && !resting && this.prevAct && MOVES[this.prevAct] && dist < 3.2 && Math.random() < P.mobility * 0.3) { this.prevAct = f.act; i.dodge = 0.2; i.move.copy(d).negate().addScaledVector(side, this.strafe * 0.6).normalize(); return i; }
    this.prevAct = f.act;
    if (free && Math.random() < P.mobility * dt * 0.9) this.strafe = -this.strafe;
    if (free && !resting && !this.plan && !this.calm && dist < 5 && Math.random() < P.mobility * dt * 0.18) { i.dodge = 0.2; i.move.copy(side).multiplyScalar(this.strafe).addScaledVector(d, Math.random() < 0.5 ? 0.4 : -0.4).normalize(); return i; }
    // don't start a swing into the opponent's wind-up: meet it with the blade (mutual trades read as cheap, not as a duel)
    const winding = om && opp.act !== 'deathblow' && opp.t < om.hit[0] && dist < om.range + 1.2;
    if (winding && opp.seq !== this.windSeq) { this.windSeq = opp.seq; this.windGuard = Math.random() < NO_TRADE; }
    if (free && winding && this.windGuard) { i.guard = f.act === 'idle'; if (i.guard) { i.move.copy(side).multiplyScalar(this.strafe * 0.3); i.walk = true; } return i; }
    // ---- offence ----
    // punish openings: opponent recoiling, stumbling or stuck in a whiffed swing
    const open = opp.act === 'deflected' || opp.act === 'hitHeavy' || (om && opp.t > om.hit[1] + 0.05 && !opp.hitDone);
    const mayAttack = this.allowAttack !== false;
    // feint: vary the rhythm of the wind-up right after a swing starts
    if (MOVES[f.act] && f.seq !== this.feintSeq) { this.feintSeq = f.seq; if (P.feint && Math.random() < P.feint) f.feint = rnd(0.45, 0.7); }
    if (!mayAttack && this.plan) this.plan = null;
    if (mayAttack && free && open && !(P.pattern && (this.opening > 0 || this.combo)) && dist < 3.2 && Math.random() < P.punish * dt * 8) { this.press(P.moves.pJab ? 'pJab' : 'slash'); this.chain = 1 + (Math.random() * P.combo | 0); }
    // keep a combo going
    if (MOVES[f.act] && MOVES[f.act].next && this.chain > 0 && f.t > MOVES[f.act].hit[0] && opp.act !== 'guardBreak') { if (Math.random() < 0.9) i.light = 0.2; this.chain--; }
    // ---- fixed attack pattern (Survival bosses): the same combos in the same order, each followed by an opening ----
    if (P.pattern) {
      if (this.combo && this.combo.length) {
        const k = this.combo[0], m = MOVES[k], reach = k === 'dash' ? 6 : m.range * 0.85 * (f.reach || 1), cur = MOVES[f.act];
        if (!mayAttack) { this.combo = null; return i; }
        if (dist > reach && free) { i.move.copy(d); i.sprint = dist > 5; if ((this.comboWait = (this.comboWait || 0) + dt) > 3.5) this.combo = null; return i; }
        if (free || (cur && f.t > cur.cancel + (P.patternLink ?? 0.08))) { this.press(k === 'slash' ? 'slash' : k); this.combo.shift(); this.comboWait = 0; if (!this.combo.length) { this.combo = null; this.opening = rnd(...(P.gap || [1, 1.4])); this.timer = this.opening + rnd(...P.think); } }
        return i;
      }
      if (free && mayAttack && this.timer <= 0 && this.opening <= 0) { this.combo = [...P.pattern[this.pi++ % P.pattern.length]]; this.comboWait = 0; return i; }
      if (this.opening > 0 && free) { i.move.copy(d).negate().addScaledVector(side, this.strafe * 0.5); i.walk = true; return i; }   // recovering: backs off slowly, open to punishment
    }
    if (this.plan) {   // approach until in range, then commit
      const m = MOVES[this.plan.move];
      const reach = this.plan.move === 'dash' ? 6 : m.range * 0.85 * (f.reach || 1);
      if (dist > reach) { i.move.copy(d).addScaledVector(side, this.strafe * P.mobility * 0.5).normalize(); i.sprint = (dist > 5 || (dist > 3.6 && P.mobility > 0.4)) && this.plan.move !== 'dash'; if (this.timer < -3) this.plan = null; }
      else if (free) { this.press(this.plan.kind); this.plan = null; this.timer = rnd(...P.think); }
      return i;
    }
    if (!free) return i;
    if (this.timer <= 0) {
      this.timer = rnd(...P.think);
      const lowPosture = f.posture > 0.7 * (f.maxPosture || 100), theyTurtle = this.oppGuardTime > 1.6;
      if (lowPosture && Math.random() < 0.6) { this.retreat = rnd(0.8, 1.6); this.strafe = -this.strafe; }
      else if (mayAttack && !P.pattern && Math.random() < P.aggr) {
        const w = { ...P.moves }; if (theyTurtle) w.kick = (w.kick || 0) * 4 + 0.5; if (dist > 4.5) { w.dash = (w.dash || 0) * 3; }
        const k = pickW(w); this.plan = { kind: k, move: k === 'slash' ? 'slash1' : k }; this.chain = k === 'slash' || k === 'pJab' || k === 'pSlam' ? (Math.random() * P.combo | 0) : 0;
      } else { this.strafe = Math.random() < 0.5 ? 1 : -1; this.prefDist = P.prefDist ? rnd(...P.prefDist) : rnd(2.4, 3.6 + P.mobility); this.jog = Math.random() < P.mobility; if (Math.random() < 0.25 * (1 - P.mobility * 0.5)) this.guardFor = rnd(0.5, 1.2); }
    }
    // director-assigned position (survival roles: flank / keep distance / wait for an attack token)
    if (this.anchor && this.retreat <= 0) {
      const ax = this.anchor.x - f.pos.x, az = this.anchor.z - f.pos.z, ad = Math.hypot(ax, az);
      if (ad > 0.7) { i.move.set(ax / ad, 0, az / ad); i.walk = this.calm ? ad < 6 : ad < 2.5; i.sprint = ad > (this.calm ? 14 : 7); } else { i.move.copy(side).multiplyScalar(this.strafe * 0.3); i.walk = true; }   // calm: waiting for a token, no rushing
      if (dist < (P.prefDist ? P.prefDist[0] - 0.4 : 1.6)) i.move.addScaledVector(d, -1).normalize();
      return i;
    }
    // spacing: circle at the preferred distance, back off to recover posture
    const want = this.retreat > 0 ? 5 : this.prefDist;
    i.move.copy(side).multiplyScalar(this.strafe).addScaledVector(d, dist > want + 0.4 ? 0.8 : dist < want - 0.4 ? -0.8 : 0);
    i.walk = dist < 4 && this.retreat <= 0 && !this.jog;
    return i;
  }
  press(kind) {
    const i = this.inp;
    if (kind === 'slash') { i.light = 0.2; i.lightKind = 'slash1'; }
    else { i.heavy = 0.2; i.heavyKind = kind; }
  }
}
