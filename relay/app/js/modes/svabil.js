// Survival boss abilities: the mini-bosses' incendiary bomb (fire zone + burning), the final boss's chain hook (Hook Pull)
// and its summons. The host decides when an ability starts; projectiles are simulated on both machines from the same
// message, and every player is hurt / pulled only on its own machine (like strikes).
import * as THREE from 'three';
import { sfx } from '../audio.js';

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = u => u * u * (3 - 2 * u);

export const ABIL = {
  bomb: { cd: 60, first: [8, 15], range: [3.5, 14], release: 0.42, flight: 0.95, arc: 3.4, scatter: 0.6 },   // s, s, m, s into the toss, s in the air, apex m, m
  fire: { size: 3, life: 10, tick: 2, dmg: 0.10, burn: 5, burnDmg: 0.02, flames: 11 },                     // 3x3 m for 10 s; 10% max HP / 2 s inside, then 2% / 2 s for 5 s
  hook: { cd: 14, first: [6, 10], range: [4.5, 13], windup: 0.55, speed: 24, turn: 2.5, hitR: 0.75, maxLen: 15, back: 32, pull: 0.45, stopAt: 1.6, hold: 0.8, wait: 0.6 },
  summon: { first: 40, every: 120, n: [1, 3], cap: 3, type: 'ashigaru' },                                 // first call 40 s into the fight, then every 2 min
};

// ---------------------------------------------------------------- shared assets (built once)
let A = null;
function assets() {
  if (A) return A;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
  // a tongue of flame: hot core low, tapering, soft edges
  const gr = g.createRadialGradient(32, 96, 2, 32, 84, 60); gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(0.25, 'rgba(255,170,60,0.95)'); gr.addColorStop(0.6, 'rgba(230,70,15,0.55)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(52, 50, 62, 90, 32, 124); g.bezierCurveTo(2, 90, 12, 50, 32, 4); g.fill();
  const flame = new THREE.CanvasTexture(cv); flame.colorSpace = THREE.SRGBColorSpace;
  const cg = document.createElement('canvas'); cg.width = cg.height = 128; const h = cg.getContext('2d');
  const rg = h.createRadialGradient(64, 64, 4, 64, 64, 64); rg.addColorStop(0, 'rgba(255,150,50,0.9)'); rg.addColorStop(0.55, 'rgba(200,60,10,0.45)'); rg.addColorStop(1, 'rgba(80,10,0,0)');
  h.fillStyle = rg; h.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { h.fillStyle = `rgba(255,${120 + Math.random() * 100 | 0},40,${0.2 + Math.random() * 0.3})`; h.beginPath(); h.arc(20 + Math.random() * 88, 20 + Math.random() * 88, 2 + Math.random() * 7, 0, 7); h.fill(); }
  const glow = new THREE.CanvasTexture(cg); glow.colorSpace = THREE.SRGBColorSpace;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.85, roughness: 0.45, flatShading: true });
  // hook head: a curved iron claw with a point, on a ring for the chain
  const claw = new THREE.TorusGeometry(0.1, 0.02, 5, 10, Math.PI * 1.35).rotateZ(-Math.PI * 0.18), tip = new THREE.ConeGeometry(0.026, 0.09, 5).rotateZ(Math.PI * 0.62).translate(-0.085, 0.07, 0);
  const eye = new THREE.TorusGeometry(0.03, 0.009, 4, 8).rotateY(Math.PI / 2).translate(0.1, -0.02, 0);
  A = { flame, glow, iron, claw, tip, eye, link: new THREE.TorusGeometry(0.034, 0.009, 4, 8), ball: new THREE.IcosahedronGeometry(0.12, 1), fuse: new THREE.CylinderGeometry(0.012, 0.016, 0.07, 5).translate(0, 0.14, 0) };
  return A;
}

// ---------------------------------------------------------------- incendiary bomb: arcs to the spot, bursts, leaves a fire
class Bomb {
  constructor(scene, from, to) {
    const a = assets(); this.scene = scene; this.from = from.clone(); this.to = to.clone(); this.t = 0; this.done = false;
    this.m = new THREE.Group(); this.m.add(new THREE.Mesh(a.ball, a.iron), new THREE.Mesh(a.fuse, new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.9 })));
    this.m.children[0].castShadow = true; this.m.position.copy(from); scene.add(this.m); this.fuse = new V3();
  }
  update(dt, fx) {
    this.t += dt; const B = ABIL.bomb, u = Math.min(1, this.t / B.flight), p = this.m.position;
    p.lerpVectors(this.from, this.to, u); p.y += Math.sin(Math.PI * u) * B.arc;
    this.m.rotation.x += dt * 9; this.m.rotation.z += dt * 5;
    this.fuse.set(0, 0.17, 0).applyEuler(this.m.rotation).add(p); fx.spark(this.fuse, 1, 1.2, 0xffc060, 0.25, null, 1, 2);
    if (u >= 1) { this.done = true; this.scene.remove(this.m); this.m.children[1].material.dispose(); return true; }
    return false;
  }
}
class Fire {
  constructor(scene, pos) {
    const a = assets(), F = ABIL.fire; this.scene = scene; this.pos = pos.clone(); this.t = 0; this.yaw = Math.random() * Math.PI; this.done = false;
    this.g = new THREE.Group(); this.g.position.copy(pos); this.g.rotation.y = this.yaw; scene.add(this.g);
    this.glowM = new THREE.MeshBasicMaterial({ map: a.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(F.size * 1.25, F.size * 1.25).rotateX(-Math.PI / 2), this.glowM); glow.position.y = 0.04; glow.renderOrder = 2; this.g.add(glow);
    this.flameM = new THREE.SpriteMaterial({ map: a.flame, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.fl = [];
    for (let i = 0; i < F.flames; i++) {   // a jittered grid fills the square, so its edge reads at a glance
      const s = new THREE.Sprite(this.flameM), gx = (i % 4) / 3 - 0.5, gz = ((i / 4 | 0) % 3) / 2 - 0.5;
      s.position.set(gx * F.size * 0.85 + rnd(-0.2, 0.2), 0, gz * F.size * 0.85 + rnd(-0.2, 0.2)); s.center.set(0.5, 0.05);
      this.g.add(s); this.fl.push({ s, ph: Math.random() * 6.28, k: rnd(0.75, 1.25) });
    }
    this.emT = 0;
  }
  contains(p) {   // inside the 3x3 m square (in its own rotated frame), feet within a step of the ground
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw), h = ABIL.fire.size / 2;
    return Math.abs(dx * c - dz * s) < h && Math.abs(dx * s + dz * c) < h && Math.abs(p.y - this.pos.y) < 1.2;
  }
  update(dt, fx) {
    const F = ABIL.fire; this.t += dt;
    const k = Math.min(1, this.t / 0.25) * Math.min(1, (F.life - this.t) / 1.2);   // flare up fast, die down over the last second
    this.glowM.opacity = 0.75 * k * (0.85 + 0.15 * Math.sin(this.t * 17)); this.flameM.opacity = 0.9 * k;
    for (const f of this.fl) { const w = 0.55 + 0.25 * Math.sin(this.t * 9 * f.k + f.ph), hgt = (0.9 + 0.45 * Math.sin(this.t * 13 * f.k + f.ph * 2)) * f.k; f.s.scale.set(w * k, hgt * k, 1); }
    if ((this.emT -= dt) <= 0 && k > 0.2) {   // embers and smoke, rate-limited
      this.emT = 0.09; const p = new V3(rnd(-1.4, 1.4), 0.3, rnd(-1.4, 1.4)).applyAxisAngle(new V3(0, 1, 0), this.yaw).add(this.pos);
      fx.spark(p, 2, 1.6, 0xffa040, 0.7, new V3(0, 1, 0), 0.6, -2); if (Math.random() < 0.4) fx.puff(p.setY(p.y + 0.8), 1, 0.4, 0x2a2420, 1.4, 1.4, 0.9);
    }
    if (this.t >= F.life) this.dispose();
  }
  dispose() { if (this.done) return; this.done = true; this.scene.remove(this.g); this.glowM.dispose(); this.flameM.dispose(); this.g.children[0].geometry.dispose(); }
}

// ---------------------------------------------------------------- chain hook: flies at the target, bites or is parried, pulls
class Hook {
  constructor(scene, boss, target, local) {
    const a = assets(); this.scene = scene; this.boss = boss; this.target = target; this.local = local; this.state = 'out'; this.t = 0; this.done = false; this.len = 0;
    this.head = new THREE.Group(); this.head.add(new THREE.Mesh(a.claw, a.iron), new THREE.Mesh(a.tip, a.iron), new THREE.Mesh(a.eye, a.iron)); scene.add(this.head);
    this.chain = new THREE.InstancedMesh(a.link, a.iron, 220); this.chain.count = 0; this.chain.frustumCulled = false; scene.add(this.chain);
    this.head.position.copy(this.hand()); this.v = target.hitPoint.sub(this.head.position).normalize().multiplyScalar(ABIL.hook.speed);
  }
  hand() { const b = this.boss.b; return (b && b.handL ? b.handL.getWorldPosition(new V3()) : this.boss.hitPoint); }
  // 'arrive' when it reaches the target, 'gone' when back in the hand
  update(dt, los) {
    const H = ABIL.hook, p = this.head.position; this.t += dt; let ev = null;
    if (this.state === 'out') {
      const want = this.target.hitPoint.sub(p).normalize().multiplyScalar(H.speed); this.v.lerp(want, 1 - Math.exp(-H.turn * dt)).setLength(H.speed);
      const next = p.clone().addScaledVector(this.v, dt);
      if (los && !los(p, next)) { this.retract(); ev = 'wall'; }
      else { p.copy(next); this.len += H.speed * dt; if (p.distanceTo(this.target.hitPoint) < H.hitR) { this.state = 'wait'; this.t = 0; ev = 'arrive'; } else if (this.len > H.maxLen || this.boss.dead) { this.retract(); ev = 'miss'; } }
    } else if (this.state === 'wait') { p.copy(this.target.hitPoint); if (this.t > H.wait) this.retract(); }   // remote target: hold until its machine answers
    else if (this.state === 'pull') { p.copy(this.target.hitPoint); if (this.t > H.pull + 0.1) this.retract(); }
    else if (this.state === 'back') {
      const h = this.hand(), d = h.clone().sub(p), L = d.length(), s = H.back * dt;
      if (L <= s || this.t > 1.2) { this.dispose(); return 'gone'; }
      p.addScaledVector(d, s / L);
    }
    this.lay();
    return ev;
  }
  retract() { this.state = 'back'; this.t = 0; }
  bite() { this.state = 'pull'; this.t = 0; }
  lay() {   // links from the hand to the head, every other one turned 90 deg, with a little sag when slack
    const h = this.hand(), p = this.head.position, d = p.clone().sub(h), L = d.length(), n = Math.min(this.chain.count = Math.min(220, Math.floor(L / 0.062)), 220);
    const dir = d.clone().divideScalar(Math.max(L, 1e-4)), q0 = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), dir), q90 = new THREE.Quaternion().setFromAxisAngle(dir, Math.PI / 2).multiply(q0);
    const sag = this.state === 'back' || this.state === 'out' ? Math.min(0.5, L * 0.04) : 0.05, M = new THREE.Matrix4(), one = new V3(1, 1, 1), at = new V3();
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; at.copy(h).addScaledVector(d, u); at.y -= Math.sin(Math.PI * u) * sag; this.chain.setMatrixAt(i, M.compose(at, i % 2 ? q90 : q0, one)); }
    this.chain.instanceMatrix.needsUpdate = true;
    this.head.lookAt(h); this.head.rotateY(Math.PI / 2);
  }
  dispose() { if (this.done) return; this.done = true; this.scene.remove(this.head); this.scene.remove(this.chain); this.chain.dispose(); }
}

// ---------------------------------------------------------------- manager (one per Survival run)
export class BossAbilities {
  constructor(sv) { this.sv = sv; this.c = sv.c; this.bombs = []; this.fires = []; this.hooks = []; this.pull = null; this.tickT = 0; this.burnLeft = 0; this.crT = 0; this.stats = { fireTicks: 0, burnTicks: 0, hookHits: 0, hookParries: 0, summoned: 0 }; }
  clear() {
    for (const b of this.bombs) if (!b.done) { this.c.scene.remove(b.m); b.done = true; }
    for (const f of this.fires) f.dispose(); for (const h of this.hooks) h.dispose();
    this.bombs = []; this.fires = []; this.hooks = []; this.pull = null; this.tickT = 0; this.burnLeft = 0;
  }
  // host: per boss, per frame. Returns true while the boss is busy with an ability (its AI is paused, it keeps facing the target)
  step(e, dt, tgt) {
    const f = e.f, T = e.T, sv = this.sv;
    if (!T.boss || f.dead) return false;
    const ab = e.abil;
    if (ab) {
      ab.t += dt;
      if (ab.k === 'bomb') {
        if (!ab.thrown && ab.t >= ABIL.bomb.release) { ab.thrown = true; if (f.act === 'toss') this.throwBomb(e, ab.to); }   // a hit during the wind-up cancels the throw
        if (ab.t >= 0.8 || (f.act !== 'toss' && ab.t > 0.05)) e.abil = null;
      } else if (ab.k === 'hook') {
        if (!ab.cast && ab.t >= ABIL.hook.windup) { ab.cast = true; if (f.act === 'hookCast' && ab.tgt && !ab.tgt.dead) this.castHook(e, ab.tgt); else e.abil = null; }
        if (ab.cast && !this.hooks.some(h => h.boss === f && !h.done)) e.abil = null;
        if (f.act !== 'hookCast' && f.act !== 'idle') { e.abil = null; for (const h of this.hooks) if (h.boss === f && h.state === 'out') h.retract(); }
      } else if (ab.k === 'hold') { if (ab.t >= ab.d) e.abil = null; }
      if (e.abil && ab.k !== 'hold' && f.act === 'idle' && ab.t > 0.1 && !(ab.k === 'hook' && ab.cast)) e.abil = null;
      if (!e.abil && (f.act === 'toss' || f.act === 'hookCast')) f.setAct('idle');
      return !!e.abil || ab.k === 'hold';
    }
    if (sv.phase !== 'fight' || !tgt || tgt.dead || tgt.downed) return false;
    const free = f.act === 'idle' && !f.airborne, d = Math.hypot(tgt.pos.x - f.pos.x, tgt.pos.z - f.pos.z);
    if (T.boss === 'mini') {
      if (e.bombCd == null) e.bombCd = rnd(...ABIL.bomb.first);
      if ((e.bombCd -= dt) <= 0 && free && d > ABIL.bomb.range[0] && d < ABIL.bomb.range[1] && sv.W.los(f.hitPoint, tgt.hitPoint)) {
        e.bombCd = ABIL.bomb.cd; const lead = (tgt.locoV ? tgt.locoV.clone().multiplyScalar(ABIL.bomb.flight * 0.5) : new V3());
        const to = new V3(tgt.pos.x + lead.x + rnd(-1, 1) * ABIL.bomb.scatter, 0, tgt.pos.z + lead.z + rnd(-1, 1) * ABIL.bomb.scatter); sv.W.bounds(to, 0.5); to.y = tgt.pos.y;
        e.abil = { k: 'bomb', t: 0, to }; f.setAct('toss'); sfx.at('fuse', this.pan(f), 0.9); return true;
      }
    } else if (T.boss === 'major') {
      if (e.hookCd == null) { e.hookCd = rnd(...ABIL.hook.first); e.sumT = ABIL.summon.first; }
      if ((e.sumT -= dt) <= 0) { e.sumT = ABIL.summon.every; this.summon(e); }
      if ((e.hookCd -= dt) <= 0 && free && d > ABIL.hook.range[0] && d < ABIL.hook.range[1] && sv.W.los(f.hitPoint, tgt.hitPoint)) {
        e.hookCd = ABIL.hook.cd; e.abil = { k: 'hook', t: 0, tgt }; f.setAct('hookCast');
        this.c.fx.flare(f.hitPoint.clone().setY(f.pos.y + 1.9 * f.scaleF), 1.4, 0.45, 0xff3a1a); sfx.at('cue', this.pan(f), 1);   // telegraph: a red glint and the cue
        return true;
      }
    }
    return false;
  }
  pan(f) { const me = this.c.G.me; return Math.max(-1, Math.min(1, (f.pos.x - me.pos.x) * 0.08)); }
  hold(e, d) { e.abil = { k: 'hold', t: 0, d }; if (e.f.act === 'hookCast') e.f.setAct('idle'); }
  // ---- bomb
  throwBomb(e, to) { const from = e.f.b.handL ? e.f.b.handL.getWorldPosition(new V3()) : e.f.hitPoint; this.spawnBomb(from, to); if (this.sv.online) this.c.net.send('sv', { t: 'ab', k: 'bomb', id: e.id, x: to.x, y: to.y, z: to.z }); }
  spawnBomb(from, to) { this.bombs.push(new Bomb(this.c.scene, from, to)); sfx.at('swing', 0, 0.5); }
  burst(at) {
    const c = this.c, up = new V3(0, 1, 0), p = at.clone().setY(at.y + 0.3);
    c.fx.flare(p, 3.2, 0.35, 0xffa040); c.fx.ring(at.clone().setY(at.y + 0.1), 3.2, 0.5, 0xff7a30); c.fx.spark(p, 40, 7, 0xffb050, 0.7, up, 1.4, 6); c.fx.puff(p, 16, 2.2, 0x2a2420, 1.6, 2.2, 1);
    const d = at.distanceTo(c.G.me.pos); sfx.at('boom', this.pan({ pos: at }), Math.max(0.2, 1 - d / 40)); if (d < 10) c.rig.shake(0.5 * (1 - d / 10));
    this.fires.push(new Fire(c.scene, at));
  }
  // ---- hook
  castHook(e, tgt) {
    const me = this.c.G.me, local = tgt === me; this.hooks.push(new Hook(this.c.scene, e.f, tgt, local)); this.hooks[this.hooks.length - 1].eid = e.id; sfx.at('chain', this.pan(e.f), 1);
    if (this.sv.online) this.c.net.send('sv', { t: 'ab', k: 'hook', id: e.id, who: local ? 0 : 1 });   // who: 0 = the host's player, 1 = the guest's
  }
  // the hook reached this machine's own player: parry / block / dodge / bitten, exactly like a strike
  hookArrive(h) {
    const c = this.c, me = c.G.me, sv = this.sv, e = sv.enemies.get(h.eid);
    const r = me.resolveStrike('hookPull', h.boss.pos, h.boss.dmgMul || 1, 1, { pmul: h.boss.pmul || 1 });
    sv.onMeStruck(r); c.showResult(r, h.boss, me);
    this.hookResult(h, e, r);
    if (sv.online) c.net.send('sv', { t: 'abr', id: h.eid, r });   // the other machine shows (and, on the host, applies to the boss) the same result
  }
  hookResult(h, e, r) {   // both machines: what happened at the moment of contact
    const c = this.c;
    if (r.res === 'hit') {
      h.bite(); this.stats.hookHits++; sfx.at('hookbite', 0, 1); c.fx.spark(h.target.hitPoint, 10, 2.5, 0xb01010, 0.4);
      if (h.target === c.G.me) { const b = h.boss.pos, p = c.G.me.pos, d = new V3(p.x - b.x, 0, p.z - b.z), L = d.length(); if (L > ABIL.hook.stopAt) this.pull = { t: 0, from: new V3(p.x, 0, p.z), to: new V3(b.x, 0, b.z).addScaledVector(d.divideScalar(L), ABIL.hook.stopAt * (h.boss.scaleF || 1)) }; }
      if (e && this.sv.host) this.hold(e, ABIL.hook.pull + ABIL.hook.hold);   // pulled in, then the boss waits: no automatic follow-up strike
    } else {
      h.retract();
      if (r.res === 'deflect') { this.stats.hookParries++; c.fx.spark(h.head.position, 14, 3, 0xffe0a0, 0.35); if (e && this.sv.host && !e.f.dead) e.f.applyOutcome(r); }   // parried at the moment of contact: the chain recoils into the boss
      if (e && this.sv.host) this.hold(e, 0.3);
    }
  }
  // ---- summons: 1..3 ordinary ashigaru, never more than 3 of them alive at once
  summon(e) {
    const sv = this.sv, S = ABIL.summon, alive = [...sv.enemies.values()].filter(x => x.summoned && !x.f.dead).length;
    const n = Math.min(S.n[0] + Math.floor(Math.random() * (S.n[1] - S.n[0] + 1)), S.cap - alive); if (n <= 0) return;
    e.f.setAct('roar'); sfx.roar(); this.c.banner('召', '#ff5a3a', true);
    for (let i = 0; i < n; i++) {
      const a = e.f.yaw + Math.PI + (i - (n - 1) / 2) * 0.9, q = new V3(e.f.pos.x + Math.sin(a) * 3, 0, e.f.pos.z + Math.cos(a) * 3); sv.W.bounds(q, 0.5); const at = [q.x, q.z];
      const x = sv.spawnEnemy(S.type, at); x.summoned = true; this.stats.summoned++;
      this.c.fx.puff(x.f.pos.clone().setY(x.f.pos.y + 0.8), 18, 1.6, 0x1a1418, 1.2, 2, 0.6);
    }
  }
  // network (both sides)
  onMsg(m) {
    const sv = this.sv, c = this.c, e = sv.enemies.get(m.id);
    if (m.k === 'bomb' && e) this.spawnBomb(e.f.b.handL ? e.f.b.handL.getWorldPosition(new V3()) : e.f.hitPoint, new V3(m.x, m.y, m.z));
    else if (m.k === 'hook' && e) { const tgt = m.who === 1 ? c.G.me : sv.mate; if (!tgt) return; const h = new Hook(c.scene, e.f, tgt, tgt === c.G.me); h.eid = m.id; this.hooks.push(h); sfx.at('chain', this.pan(e.f), 1); }
  }
  onResult(m) {   // host: the guest's player met the hook
    const h = this.hooks.find(x => x.eid === m.id && !x.done && !x.local); const e = this.sv.enemies.get(m.id);
    if (h) this.hookResult(h, e, m.r); else if (e && m.r.res === 'hit') this.hold(e, ABIL.hook.pull + ABIL.hook.hold);
  }
  // every frame on both machines: projectiles, fire, and this machine's own player
  update(dt) {
    const c = this.c, me = c.G.me, los = (a, b) => this.sv.W.los(a, b);
    for (const b of this.bombs) if (!b.done && b.update(dt, c.fx)) this.burst(b.to);
    this.bombs = this.bombs.filter(b => !b.done);
    for (const f of this.fires) f.update(dt, c.fx);
    this.fires = this.fires.filter(f => !f.done);
    for (const h of this.hooks) { const ev = h.update(dt, los); if (ev === 'arrive' && h.local) this.hookArrive(h); if (ev === 'wall') c.fx.spark(h.head.position, 6, 2, 0xd0c8b0, 0.3); }
    this.hooks = this.hooks.filter(h => !h.done);
    // pulled along the chain (position only; the hit reaction plays on top)
    if (this.pull) { const P = this.pull; P.t += dt; const u = smooth(Math.min(1, P.t / ABIL.hook.pull)); me.pos.x = P.from.x + (P.to.x - P.from.x) * u; me.pos.z = P.from.z + (P.to.z - P.from.z) * u; me.locoV.set(0, 0, 0); me.vel.set(0, 0, 0); if (u >= 1 || me.dead) this.pull = null; }
    // fire: ONE tick timer per player, so standing in two fires or stepping in and out never ticks twice
    this.tickT = Math.max(0, this.tickT - dt);
    if (me.dead || me.downed) { this.burnLeft = 0; return; }
    const inFire = this.fires.some(f => f.t < ABIL.fire.life - 0.6 && f.contains(me.pos)), F = ABIL.fire;
    if (inFire) { this.burnLeft = F.burn; if (this.tickT <= 0) { this.tickT = F.tick; this.stats.fireTicks++; this.burnTick(F.dmg); } }
    else if (this.burnLeft > 0) { this.burnLeft -= dt; if (this.tickT <= 0 && this.burnLeft > 0) { this.tickT = F.tick; this.stats.burnTicks++; this.burnTick(F.burnDmg); } }
    if ((inFire || this.burnLeft > 0) && (this.emT = (this.emT || 0) - dt) <= 0) { this.emT = 0.07; const p = me.hitPoint; p.x += rnd(-0.25, 0.25); p.y += rnd(-0.7, 0.5); p.z += rnd(-0.25, 0.25); c.fx.spark(p, 1, 0.8, 0xff8a20, 0.5, new V3(0, 1, 0), 0.4, -2); }
    if (inFire && (this.crT -= dt) <= 0) { this.crT = rnd(0.5, 0.9); sfx.at('crackle', 0, 0.8); }
  }
  burnTick(frac) {
    const c = this.c, me = c.G.me; if (me.dead || me.downed || me.invuln) return;
    me.hp -= me.maxHp * frac; me.flashT = 0.12; sfx.burn(); this.sv.lastHitT = this.sv.t;
    if (me.hp <= 0) { me.hp = 0; me.die(false); }
  }
}
