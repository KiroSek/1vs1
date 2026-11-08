import * as THREE from 'three';
import { ACT } from './fighter.js';

// level: 0 novice, 1 ronin, 2 master. prof: optional per-boss overrides of the behaviour numbers below.
// mode: 'duel' | 'dummy-idle' | 'dummy-block' | 'dummy-attack'
const BASE = [
  { react: .18, parry: .1, block: .4, aggr: .5, heavy: .25, combo: 1, err: .25 },
  { react: .4, parry: .5, block: .25, aggr: .5, heavy: .25, combo: 2, err: .14 },
  { react: .6, parry: .65, block: .2, aggr: .55, heavy: .25, combo: 3, err: .07 },
];
export class AI {
  constructor(f, level = 1, prof = null) {
    this.f = f; this.level = level; this.mode = 'duel'; this.P = { ...BASE[level], ...(prof || {}) };
    this.inp = { move: new THREE.Vector3(), light: 0, heavy: 0, dodge: 0, finisher: 0, block: false, walk: false, lock: true, aim: null };
    this.state = 'approach'; this.timer = 0; this.react = 0; this.strafe = 1; this.queue = 0; this.pendingBlock = -1; this.holdBlock = 0;
  }
  think(dt, opp) {
    const f = this.f, i = this.inp, P = this.P;
    i.move.set(0, 0, 0); i.block = this.holdBlock > 0; this.holdBlock -= dt;
    if (f.dead || !opp || opp.dead) return i;
    const d = new THREE.Vector3(opp.pos.x - f.pos.x, 0, opp.pos.z - f.pos.z), dist = d.length(); d.divideScalar(Math.max(dist, 0.001));
    if (this.mode === 'dummy-idle') return i;
    if (this.mode === 'dummy-block') { i.block = true; return i; }
    this.timer -= dt; this.react -= dt;
    if (opp.act === 'broken' && dist < 3.2) { i.finisher = 0.2; return i; }
    if (opp.act === 'broken') { i.move.copy(d); return i; }
    if (this.pendingBlock >= 0) { this.pendingBlock -= dt; if (this.pendingBlock < 0) this.holdBlock = 0.45; }
    const oa = ACT[opp.act];
    if (this.mode === 'duel' && oa && oa.hit && dist < 3.4 && this.react <= 0 && opp.act !== 'dying' && opp.t < oa.hit[0]) {
      this.react = 0.7;
      if (Math.random() < P.react) {
        const r = Math.random();
        if (r < P.parry) {   // parry attempt, timed against the incoming strike (with human-like error)
          const eta = (oa.hit[0] - opp.t) / (opp.tempo || 1); this.pendingBlock = Math.max(0, eta - 0.1 + (Math.random() - 0.5) * P.err);
        } else if (r < P.parry + P.block) this.holdBlock = (oa.hit[1] - opp.t) / (opp.tempo || 1) + 0.3;
        else { i.dodge = 0.2; const s = this.strafe; i.move.set(-d.z * s, 0, d.x * s); }
      }
    }
    if (this.mode === 'dummy-attack') {
      if (f.act === 'idle') { i.aim = d; if (dist > 2) i.move.copy(d); else if (this.timer <= 0) { i.light = 0.2; this.timer = 1.8; } }
      return i;
    }
    if (f.act !== 'idle' && f.act !== 'block') return i;
    switch (this.state) {
      case 'approach': i.move.copy(d); if (dist < 2.1) this.pick(); break;
      case 'circle':
        i.move.set(-d.z * this.strafe, 0, d.x * this.strafe).addScaledVector(d, dist > 3 ? 0.5 : dist < 2 ? -0.5 : 0); i.walk = true;
        if (this.timer <= 0) this.pick(); break;
      case 'attack':
        if (dist > 2.3) { this.state = 'approach'; break; }
        if (this.queue > 0) { i.light = 0.2; this.queue--; this.timer = 0.35; if (this.queue <= 0) this.state = 'circle'; }
        else if (this.heavyNext) { i.heavy = 0.2; this.heavyNext = false; this.state = 'circle'; this.timer = 0.8; }
        break;
      case 'block': this.holdBlock = 0.1; if (this.timer <= 0) this.pick(); break;
    }
    return i;
  }
  pick() {
    const r = Math.random(), P = this.P; this.strafe = Math.random() < 0.5 ? 1 : -1;
    if (r < P.aggr) { this.state = 'attack'; this.queue = 1 + (Math.random() * P.combo | 0); this.timer = 0.3; if (Math.random() < P.heavy) { this.heavyNext = true; this.queue = 0; } }
    else if (r < P.aggr + (1 - P.aggr) * 0.55) { this.state = 'circle'; this.timer = 0.5 + Math.random() * 0.8; }
    else { this.state = 'block'; this.timer = 0.7 + Math.random() * 0.8; }
  }
}
