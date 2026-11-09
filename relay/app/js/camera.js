// Over-the-right-shoulder combat camera (Sekiro-style).
// Locked on: the boom sits behind the player, offset to the right, and the aim point leans toward the opponent so
// his whole silhouette (shoulders, arms, blade, wind-up) stays readable in the upper-middle of the frame.
import * as THREE from 'three';
import { camClip } from './arena.js';

const V3 = THREE.Vector3;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// crowdDist / crowdUp: extra boom length / pitch when a second enemy is close (2 vs 2, survival); sprintFov: max FOV gain at full sprint
// deathblow shot cuts (attacker's deathblow time, s): approach until cut1, impact close-up until cut2, then the pull-back
const DB_SHOTS = { cut1: 0.5, cut2: 0.95 };
export const CAM = { crowdDist: 0.7, crowdUp: 0.05, sprintFov: 5, lockRate: 3.2, closeDist: 2, closePitch: 0.12, closeBack: 0.7, followDelay: 1.5, unlockDist: 15, flick: 140 };   // rad/s, m, s, px

export class CameraRig {
  constructor(camera) {
    this.cam = camera; this.baseFov = 52;
    this.yaw = 0; this.pitch = 0.18; this.dist = 3.6; this.side = 0.62;
    this.pos = new V3(0, 2, -5); this.look = new V3(0, 1.3, 0);
    this.trauma = 0; this.kickV = new V3(); this.kickP = new V3(); this.fovPunch = 0; this.roll = 0; this.rollV = 0; this.t = 0;
    this.cine = null; this.cineT = 0; this.userT = 9; this.autoFollow = true;
  }
  shake(a) { this.trauma = Math.min(1.2, this.trauma + a); }
  kick(dir, a) { this.kickV.addScaledVector(dir, a); }
  punch(f) { this.fovPunch = Math.max(this.fovPunch, f); }
  tilt(r) { this.rollV += r; }
  mouse(dx, dy, sens, invert) { this.yaw -= dx * 0.0022 * sens; this.pitch = clamp(this.pitch + dy * 0.0022 * sens * (invert ? -1 : 1), -0.25, 0.95); this.userT = 0; }
  snapBehind(me) { this.yaw = me.yaw; this.pitch = 0.18; this.pos.copy(this.desired(me, null)); }

  desired(me, opp, dt = 0) {
    const pivot = new V3(me.pos.x, me.pos.y + (me.crouch ? 1.15 : 1.55) * (me.scaleF || 1), me.pos.z);
    const F = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), R = new V3(-F.z, 0, F.x);   // R = screen right when looking along F
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const p = pivot.clone().addScaledVector(F, -cp * this.dist).addScaledVector(R, this.side); p.y += sp * this.dist;
    const k = camClip(pivot.clone().addScaledVector(R, this.side * 0.6), p);
    if (k < 1) p.copy(pivot.clone().addScaledVector(R, this.side * 0.6).lerp(p, k));
    return p;
  }

  update(dt, ctx) {
    this.t += dt; this.userT += dt;
    const { me, opp, locked, mode } = ctx, cam = this.cam;
    this.crowd = (this.crowd || 0) + ((ctx.crowd ? 1 : 0) - (this.crowd || 0)) * Math.min(1, 2 * dt); this.spd = me ? me.speed || 0 : 0;
    if (mode === 'menu') {
      const a = this.t * 0.07 + 0.4; const p = new V3(Math.cos(a) * 5.4, 1.7 + Math.sin(this.t * 0.2) * 0.2, Math.sin(a) * 5.4);
      this.pos.lerp(p, 1 - Math.exp(-2 * dt)); this.look.lerp(new V3(0, 1.15, 0), 1 - Math.exp(-3 * dt)); this.apply(dt, 0); return;
    }
    if (this.cine) return this.cinematic(dt, ctx);
    const oppOk = opp && !opp.dead && opp.act !== 'die' && opp.act !== 'dieFwd';
    if (locked && oppOk) {
      const dx = opp.pos.x - me.pos.x, dz = opp.pos.z - me.pos.z, d = Math.hypot(dx, dz), ty = Math.atan2(dx, dz);
      // keep a slight angle so the player stands left of the line of sight instead of covering the opponent
      const bias = d < 3.2 ? 0.17 - (d - 1.2) * 0.04 : 0.09; const dy = angDiff(this.yaw, ty + bias) * Math.min(1, 6.5 * dt); this.yaw += clamp(dy, -CAM.lockRate * dt, CAM.lockRate * dt);   // capped turn speed: no whip when he runs past
      const close = clamp((CAM.closeDist - d) / CAM.closeDist, 0, 1);   // opponent nearer than 2 m: lift and pull back
      const wantPitch = clamp(0.25 - (d - 3) * 0.012, 0.16, 0.3) + CAM.closePitch * close + CAM.crowdUp * this.crowd;
      this.pitch += (wantPitch - this.pitch) * Math.min(1, 3 * dt);
      const wantDist = clamp(3.4 + (d - 2.5) * 0.18, 3.3, 4.4) + CAM.closeBack * close + CAM.crowdDist * this.crowd, wantSide = clamp(0.95 - (d - 1.5) * 0.12, 0.62, 0.95);
      this.dist += (wantDist - this.dist) * Math.min(1, 3 * dt);
      this.side += (wantSide - this.side) * Math.min(1, 4 * dt);
    } else {
      // free camera: drift behind the player's motion after a moment without mouse input
      if (this.autoFollow && this.userT > CAM.followDelay && me.speed > 1) this.yaw += angDiff(this.yaw, me.yaw) * Math.min(1, 1.2 * dt);
      this.dist += (3.9 - this.dist) * Math.min(1, 3 * dt); this.side += (0.55 - this.side) * Math.min(1, 4 * dt);
    }
    let p = this.desired(me, opp, dt);
    // never let the player's own body hide the opponent's chest: widen the shoulder offset if the sight line clips him
    if (locked && oppOk) {
      const oc = new V3(opp.pos.x, opp.pos.y + 1.3, opp.pos.z), mc = new V3(me.pos.x, me.pos.y + 1.3, me.pos.z);
      const seg = oc.clone().sub(p), t = clamp(mc.clone().sub(p).dot(seg) / seg.lengthSq(), 0, 1), close = p.clone().addScaledVector(seg, t).distanceTo(mc);
      if (close < 0.55) { this.side = Math.min(1.3, this.side + (0.55 - close) * 6 * dt); }
    }
    this.pos.lerp(p, 1 - Math.exp(-(locked ? 9 : 12) * dt));
    // aim point: player shoulder blended toward the opponent's chest
    const pivot = new V3(me.pos.x, me.pos.y + (me.crouch ? 1.05 : 1.4) * (me.scaleF || 1), me.pos.z);
    const F = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), R = new V3(-F.z, 0, F.x);
    let look = pivot.clone().addScaledVector(R, this.side * 0.35).addScaledVector(F, 1.2);
    if (locked && oppOk) { const oc = new V3(opp.pos.x, opp.pos.y + 1.25 * (opp.scaleF || 1), opp.pos.z); look = pivot.clone().addScaledVector(R, this.side * 0.3).lerp(oc, 0.55); look.y = Math.max(look.y, Math.min(me.pos.y, opp.pos.y) + 1.15); }
    this.look.lerp(look, 1 - Math.exp(-10 * dt));
    this.apply(dt, locked ? 0.5 : 0);
  }

  cinematic(dt, ctx) {
    const c = this.cine; this.cineT += dt;
    if (c.type === 'fixed') { this.pos.copy(c.p); this.look.copy(c.l); }
    else if (c.type === 'deathblow') {
      const a = c.att, v = c.vic, mid = a.pos.clone().lerp(v.pos, 0.5), d = v.pos.clone().sub(a.pos).setY(0).normalize(), side = new V3(-d.z, 0, d.x).multiplyScalar(c.sign);
      // three shots with hard cuts keyed to the blow: wide side (approach) -> low close-up at the impact -> pull-back orbit
      const t = a.act === 'deathblow' ? a.t : 9, shot = t < DB_SHOTS.cut1 ? 0 : t < DB_SHOTS.cut2 ? 1 : 2, cut = shot !== c.shot; c.shot = shot;
      let p, look;
      if (shot === 0) { const orbit = this.cineT * 0.25; p = mid.clone().addScaledVector(side, 2.6 * Math.cos(orbit)).addScaledVector(d, -0.9 + 2.5 * Math.sin(orbit) * 0.4); p.y = a.pos.y + 1.05 + this.cineT * 0.12; look = mid.clone().setY(a.pos.y + 1.15); }
      else if (shot === 1) { p = v.pos.clone().addScaledVector(side, 2.0).addScaledVector(d, 0.7); p.y = v.pos.y + 0.8; look = v.pos.clone().lerp(a.pos, 0.45).setY(v.pos.y + 1.25); }
      else { const ang = (this.cineT - (c.t2 ?? (c.t2 = this.cineT))) * 0.3; p = mid.clone().addScaledVector(side, 3.6 * Math.cos(ang)).addScaledVector(d, 3.6 * Math.sin(ang) * 0.5); p.y = a.pos.y + 1.7 + ang * 0.4; look = mid.clone().setY(a.pos.y + 0.9); }
      if (cut) { this.pos.copy(p); this.look.copy(look); } else { this.pos.lerp(p, 1 - Math.exp(-(shot === 1 ? 4 : 7) * dt)); this.look.lerp(look, 1 - Math.exp(-8 * dt)); }
      c.fovK = shot === 1 ? 1 : 0;
    } else if (c.type === 'death' || c.type === 'revive') {
      const f = c.f, a = c.ang + this.cineT * 0.18, r = c.type === 'death' ? 3.2 - Math.min(0.8, this.cineT * 0.3) : 3.4;
      const p = new V3(f.pos.x + Math.sin(a) * r, f.pos.y + (c.type === 'death' ? 1.4 + this.cineT * 0.25 : 1.1), f.pos.z + Math.cos(a) * r);
      this.pos.lerp(p, 1 - Math.exp(-3 * dt)); this.look.lerp(new V3(f.pos.x, f.pos.y + (c.type === 'death' ? 0.4 : 0.9 + Math.min(0.5, this.cineT * 0.4)), f.pos.z), 1 - Math.exp(-4 * dt));
    } else if (c.type === 'intro') {
      const { me, opp } = ctx, mid = me.pos.clone().lerp(opp.pos, 0.5), d = opp.pos.clone().sub(me.pos).setY(0).normalize(), side = new V3(-d.z, 0, d.x);
      const u = Math.min(1, this.cineT / c.dur), a = -0.9 + u * 0.9;
      const p = mid.clone().addScaledVector(side, Math.cos(a) * 5.2).addScaledVector(d, Math.sin(a) * 5.2); p.y = me.pos.y + 1.25 + u * 0.4;
      this.pos.lerp(p, 1 - Math.exp(-4 * dt)); this.look.lerp(mid.setY(me.pos.y + 1.2), 1 - Math.exp(-5 * dt));
      if (u >= 1) { this.cine = null; this.snapBehind(me); }
    } else if (c.type === 'orbit') {   // boss intro / phase change: slow low orbit around a fighter
      const f = c.f, a = c.ang + this.cineT * 0.35, r = c.r || 4.2; const p = new V3(f.pos.x + Math.sin(a) * r, f.pos.y + 0.9 + this.cineT * 0.15, f.pos.z + Math.cos(a) * r);
      this.pos.lerp(p, 1 - Math.exp(-3 * dt)); this.look.lerp(new V3(f.pos.x, f.pos.y + 1.5 * (f.scaleF || 1), f.pos.z), 1 - Math.exp(-4 * dt));
      if (c.dur && this.cineT > c.dur) { this.cine = null; if (ctx.me) this.snapBehind(ctx.me); }
    } else if (c.type === 'victory') {
      const f = c.f, a = c.ang + this.cineT * 0.22; const p = new V3(f.pos.x + Math.sin(a) * 3, f.pos.y + 1.5, f.pos.z + Math.cos(a) * 3);
      this.pos.lerp(p, 1 - Math.exp(-3 * dt)); this.look.lerp(new V3(f.pos.x, f.pos.y + 1.3, f.pos.z), 1 - Math.exp(-4 * dt));
    }
    if (c.type !== 'fixed') { const k = camClip(this.look, this.pos); if (k < 1) this.pos.copy(this.look.clone().lerp(this.pos, k)); }
    this.apply(dt, 0);
  }
  startCine(c) { this.cine = c; this.cineT = 0; }
  endCine(me) { if (this.cine) { this.cine = null; if (me) this.yaw = me.yaw; } }

  apply(dt, lookLag) {
    const cam = this.cam;
    // trauma shake (smooth noise), kick spring, roll spring, FOV punch
    this.trauma = Math.max(0, this.trauma - dt * 1.8); const s = this.trauma * this.trauma;
    const n = (f, o) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
    this.kickP.addScaledVector(this.kickV, dt); this.kickV.multiplyScalar(Math.exp(-10 * dt)); this.kickP.multiplyScalar(Math.exp(-7 * dt));
    this.roll += this.rollV * dt; this.rollV = this.rollV * Math.exp(-8 * dt) - this.roll * 60 * dt;
    cam.position.copy(this.pos).add(this.kickP);
    cam.position.x += n(37, 1) * s * 0.12; cam.position.y += n(41, 2) * s * 0.1; cam.position.z += n(33, 3) * s * 0.12;
    cam.lookAt(this.look);
    cam.rotateZ(this.roll + n(29, 4) * s * 0.03);
    this.fovPunch = Math.max(0, this.fovPunch - dt * 18);
    this.sprintK = (this.sprintK || 0) + (clamp(((this.spd || 0) - 4.5) / 2.5, 0, 1) * (this.cine ? 0 : 1) - (this.sprintK || 0)) * Math.min(1, 3 * dt);   // speed feel
    const fov = this.baseFov - this.fovPunch * (this.cine ? -0.6 : 1) + (this.cine && this.cine.type === 'deathblow' ? (this.cine.fovK ? -12 : -6) : 0) + CAM.sprintFov * this.sprintK;
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov += (fov - cam.fov) * Math.min(1, 12 * dt); cam.updateProjectionMatrix(); }
  }
}
