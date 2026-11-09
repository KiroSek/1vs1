// Detection for Samurai Hunt: sight (distance, line of sight, foliage, light, motion, elevation, view cone)
// and hearing (footsteps by gait and surface, combat, props, lures). Each observer keeps its own awareness.
import * as THREE from 'three';
import { MOVES } from './moves.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const SENSE = {
  range: { day: 62, dusk: 46, night: 28, fog: 20 },   // base sight range by time of day (m)
  fov: 1.3,                 // half-angle of the view cone (rad)
  closeSense: 2.4,          // always noticed within this distance (m)
  gain: 1.7,                // awareness gained per second at full visibility
  decay: 0.12,              // awareness lost per second when nothing is seen or heard
  memory: 4,                // s a spotted target stays spotted after line of sight is lost
  spotted: 1,               // awareness needed to spot
  aware: 0.6,               // awareness at which a surprise attack is no longer possible
  noiseCap: 0.7,            // hearing alone can raise awareness only up to this
  hearR: 26,                // metres of hearing radius per unit of loudness
  grassDens: 1.25, bambooDens: 0.55,
  elevation: 1.5,           // height advantage (m) giving the overlook bonus
};
export const GAIT = { still: 0.45, crouch: 0.6, walk: 0.8, run: 1, sprint: 1.25, attack: 1.45 };
export const LOUD = { crouch: 0.12, walk: 0.32, run: 0.62, sprint: 0.95 };
export const SURF = { stone: 1.25, wood: 1.35, water: 1.7, dirt: 0.8, grass: 0.95, bamboo: 1.15 };
export const STEP = { walk: 0.62, run: 0.36, sprint: 0.3, crouch: 0.8 };

export function gaitOf(f) {
  if (MOVES[f.act]) return 'attack';
  if (f.speed < 0.3) return 'still';
  if (f.crouch) return 'crouch';
  return f.speed > 4.6 ? 'sprint' : f.speed > 2 ? 'run' : 'walk';
}
export class Senses {
  constructor(world, weather, tod) { this.W = world; this.weather = weather; this.tod = tod; this.aware = 0; this.spotted = false; this.lastSeen = -99; this.lastKnown = null; this.vis = 0; this.t = 0; this.firstSpot = null; }
  // observer: { pos, crouch, scaleF }, viewYaw: where the observer looks (camera yaw for players, body yaw for bots)
  visibility(obs, viewYaw, tgt) {
    const W = this.W, d = Math.hypot(tgt.pos.x - obs.pos.x, tgt.pos.z - obs.pos.z);
    if (d < SENSE.closeSense) return 1;
    const elev = obs.pos.y - tgt.pos.y > SENSE.elevation;
    const range = SENSE.range[this.tod] * (this.weather ? this.weather.visMul : 1) * (elev ? 1.25 : 1);
    if (d > range) return 0;
    const ang = Math.atan2(tgt.pos.x - obs.pos.x, tgt.pos.z - obs.pos.z), da = Math.abs(Math.atan2(Math.sin(ang - viewYaw), Math.cos(ang - viewYaw)));
    if (da > SENSE.fov) return 0;
    const eye = new V3(obs.pos.x, obs.pos.y + (obs.crouch ? 1.0 : 1.6), obs.pos.z);
    let best = 0;
    for (const h of tgt.crouch ? [0.55, 0.9] : [0.9, 1.5]) {
      const L = W.los(eye, new V3(tgt.pos.x, tgt.pos.y + h, tgt.pos.z));
      if (L.blocked) continue;
      best = Math.max(best, Math.exp(-(L.grass * SENSE.grassDens + L.bamboo * SENSE.bambooDens)));
    }
    if (best <= 0) return 0;
    const light = W.lightAt(tgt.pos.x, tgt.pos.z), lf = this.tod === 'night' ? 0.4 + light * 1.1 : this.tod === 'dusk' || this.tod === 'fog' ? 0.75 + light * 0.4 : 1;
    const motion = GAIT[gaitOf(tgt)], edge = 1 - da / SENSE.fov * 0.45;
    return clamp(Math.pow(1 - d / range, 0.7) * best * lf * motion * edge * (elev ? 1.2 : 1) * 1.6, 0, 1);
  }
  update(dt, obs, viewYaw, tgt, now) {
    this.t = now; const v = this.vis = tgt && !tgt.dead ? this.visibility(obs, viewYaw, tgt) : 0;
    if (v > 0.02) { this.aware = Math.min(1.3, this.aware + v * SENSE.gain * dt); this.lastSeen = now; this.lastKnown = tgt.pos.clone(); }
    else if (now - this.lastSeen > (this.spotted ? SENSE.memory : 0.6)) this.aware = Math.max(0, this.aware - SENSE.decay * dt);
    const was = this.spotted;
    this.spotted = this.aware >= SENSE.spotted || (was && now - this.lastSeen < SENSE.memory);
    if (this.spotted && !was && this.firstSpot === null) this.firstSpot = now;
    return this.spotted && !was;   // true on the frame of a new spot
  }
  hear(noise, listener) {   // returns loudness 0..1 at the listener (and raises awareness a little)
    const d = Math.hypot(noise.x - listener.pos.x, noise.z - listener.pos.z), r = noise.loud * SENSE.hearR * (this.weather ? this.weather.noiseMul : 1);
    if (d > r) return 0;
    const k = 1 - d / r;
    if (this.aware < SENSE.noiseCap) this.aware = Math.min(SENSE.noiseCap, this.aware + k * 0.22);
    if (!this.lastKnown || k > 0.3) this.lastKnown = new V3(noise.x, 0, noise.z);
    return k;
  }
  get isAware() { return this.aware >= SENSE.aware || this.spotted; }
}
// footstep noise generator for one fighter
export class Footsteps {
  constructor(world, weather) { this.W = world; this.weather = weather; this.acc = 0; }
  // returns a noise {x,z,loud,kind,surface} when a step lands, else null
  update(dt, f) {
    if (f.dead || f.act === 'downed') return null;
    const g = gaitOf(f); if (g === 'still' || g === 'attack') { this.acc = 0; return null; }
    this.acc += dt; if (this.acc < STEP[g]) return null; this.acc = 0;
    const s = this.W.surfaceAt(f.pos.x, f.pos.z);
    return { x: f.pos.x, z: f.pos.z, loud: LOUD[g] * (SURF[s] || 1), kind: 'step', surface: s };
  }
}
