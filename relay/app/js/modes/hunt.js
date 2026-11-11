// SAMURAI HUNT: two samurai in a large valley. Find, stalk, ambush, duel.
// Online: each client simulates its own fighter (as in duels), resolves hits on itself, computes its own awareness,
// and broadcasts its noises / broken props. The host owns the clock and the spawn layout.
import * as THREE from 'three';
import { Weather } from '../world.js';
import { Senses, Footsteps, SENSE } from '../stealth.js';
import { MOVES } from '../moves.js';
import { AI } from '../ai.js';
import { sfx, music, battle } from '../audio.js';
import { Stone } from './huntitems.js';
import { DAY } from '../maps.js';
import { inBush } from '../stealth.js';
import { MOVE_K } from '../fighter.js';

const V3 = THREE.Vector3;
const setH = (el, h) => { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };   // HUD: touch the DOM only when the text changes
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const HUNT = {
  respawnDelay: 4.5, respawnGuard: 3, overtime: 180, pingEvery: 10, lureCooldown: 5, lureDist: 13, noiseNet: 0.12,
  combatDist: 7, tensionDist: 28, lockMemory: 2, ambushCue: 8,
  weapon: 'tanto', duelGap: 8, duelGuard: 1.5, lightRate: 0.25,   // the hunt is stalked with the tanto; at 12:30 both draw their own katana and duel in the square
};

// ---------------------------------------------------------------- practice opponent (no second player)
class HuntBot {
  constructor(f, world, weather, tod, level) {
    this.f = f; this.W = world; this.level = level; this.senses = new Senses(world, weather, tod);
    this.ai = new AI(f, level); this.state = 'patrol'; this.goal = null; this.timer = 0; this.stuck = 0; this.lastPos = f.pos.clone(); this.detour = 0; this.detourDir = 1;
    this.inp = { move: new V3(), light: 0, heavy: 0, dodge: 0, jump: 0, finisher: 0, guard: false, walk: false, crouch: false, lock: false, sprint: false };
    this.pickWaypoint();
  }
  pickWaypoint() { const w = this.W.waypoints.concat(this.W.spawns), f = this.f; const c = w.filter(p => Math.hypot(p[0] - f.pos.x, p[1] - f.pos.z) > 12); const p = c[Math.random() * c.length | 0] || w[0]; this.goal = new V3(p[0], 0, p[1]); this.gait = this.level > 0 && Math.random() < 0.6 ? 'run' : 'walk'; this.path = null; }
  moveTo(dt, p, mode) {   // follows an A* path over the map's nav grid; re-plans when the goal moves or it gets stuck
    const i = this.inp, f = this.f; this.repath = (this.repath ?? 0) - dt;
    const gd = Math.hypot(p.x - f.pos.x, p.z - f.pos.z); if (gd < 0.8) return true;
    this.nearT = gd < 3 ? (this.nearT || 0) + dt : 0; if (this.nearT > 1.5) { this.nearT = 0; return true; }   // goal blocked by a wall: close enough
    if (!this.path || this.repath <= 0 || (this.pathGoal && this.pathGoal.distanceTo(p) > 2.5 && this.repath < 2)) { this.path = gd < 6 ? [p.clone()] : this.W.findPath(f.pos, p); this.pathGoal = p.clone(); this.repath = 3; }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - f.pos.x, this.path[0].z - f.pos.z) < 1.0) this.path.shift();
    const q = this.path[0] || p, dx = q.x - f.pos.x, dz = q.z - f.pos.z, d = Math.hypot(dx, dz) || 1;
    const dir = new V3(dx / d, 0, dz / d);
    this.stuck += dt; if (this.stuck > 1.2) { if (f.pos.distanceTo(this.lastPos) < 0.5) { this.repath = 0; this.detour = 0.8; this.detourDir = -this.detourDir; } this.stuck = 0; this.lastPos.copy(f.pos); }
    if (this.detour > 0) { this.detour -= dt; dir.applyAxisAngle(new V3(0, 1, 0), this.detourDir * 1.3); }
    i.move.copy(dir); i.crouch = mode === 'crouch'; i.walk = mode === 'walk'; i.sprint = mode === 'sprint'; i.lock = false;
    return false;
  }  think(dt, tgt, now, tgtNoise) {
    const i = this.inp, f = this.f; i.move.set(0, 0, 0); i.crouch = false; i.walk = false; i.sprint = false; i.lock = false; i.guard = false;
    if (f.dead || !tgt) return i;
    const spotNow = this.senses.update(dt, f, f.yaw, tgt, now);
    const d = Math.hypot(tgt.pos.x - f.pos.x, tgt.pos.z - f.pos.z);
    const tgtFacesMe = tgt.fwd.dot(new V3(f.pos.x - tgt.pos.x, 0, f.pos.z - tgt.pos.z).normalize()) > 0.5;
    if (this.state !== 'duel' && (this.senses.spotted && (d < 6 || (tgtFacesMe && d < 12)) || MOVES[tgt.act] && d < 5 || f.hp < f.maxHp)) this.state = 'duel';
    else if (this.state === 'patrol' && this.senses.aware > 0.25 && this.senses.lastKnown) this.state = 'investigate';
    else if (this.state !== 'duel' && this.senses.spotted) this.state = 'stalk';
    switch (this.state) {
      case 'patrol': if (this.moveTo(dt, this.goal, this.W.coverAt(f.pos.x, f.pos.z, 1) > 0.3 ? 'crouch' : this.gait)) this.pickWaypoint(); break;
      case 'investigate': {
        const lk = this.senses.lastKnown; const near = Math.hypot(lk.x - f.pos.x, lk.z - f.pos.z) < 12;
        if (this.moveTo(dt, lk, near ? 'crouch' : 'run')) { this.timer += dt; f.yaw += dt * 1.2; if (this.timer > 3) { this.timer = 0; this.senses.lastKnown = null; this.state = 'patrol'; this.pickWaypoint(); } }
        break;
      }
      case 'stalk': {   // circle behind the target and close in crouched
        const behind = tgt.pos.clone().addScaledVector(tgt.fwd, -2.2);
        if (d < 3.1 && !tgtFacesMe) { i.crouch = true; f.canAmbush = true; i.light = 0.2; this.state = 'duel'; break; }
        this.moveTo(dt, d > 14 ? tgt.pos : behind, d > 16 ? 'run' : 'crouch');
        if (!this.senses.spotted) this.state = 'investigate';
        break;
      }
      case 'duel': {
        if (d > 20 && !this.senses.spotted) { this.state = 'investigate'; break; }
        const a = this.ai.think(dt, tgt); Object.assign(i, a); i.move = a.move; i.lock = true; i.crouch = false;
        break;
      }
    }
    return i;
  }
}

// ---------------------------------------------------------------- mode controller
const HUNT_DUEL_DROP = 3.5;   // s after the 12:30 duel is called until the fight music drops in
export class Hunt {
  constructor(ctx, opts) {
    this.c = ctx; this.o = opts; this.online = !!opts.online; this.p = opts.params;
    this.t = 0; this.left = this.p.duration * 60; this.overtime = false; this.over = false; this.phase = 'hunt';
    this.stats = { start: 0, firstSpot: null, ambush: 0, attacks: 0, deflects: 0, blocks: 0, hitsTaken: 0, dealt: 0, taken: 0, props: 0, time: 0 };
    this.noiseT = 0; this.lureT = 0; this.pingT = HUNT.pingEvery; this.dmgLast = { me: 100, opp: 100 }; this.myAtkSeq = -1; this.respawnT = -1; this.oppRespawnT = -1; this.cueSeq = -1; this.waiting = false; this.stones = []; this.throwAt = null;
  }
  // ---- setup ----
  start() {
    const c = this.c, G = c.G, p = this.p;
    c.arena.setMap('hunt_valley', { tod: p.tod });
    this.W = c.arena.world; this.weather = c.weather; this.weather.set(p.weather || 'clear');
    this.senses = new Senses(this.W, this.weather, p.tod); this.steps = new Footsteps(this.W, this.weather); this.oppSteps = new Footsteps(this.W, this.weather);
    c.setLook(true, c.REC.skin, HUNT.weapon); this.botLook = [['ronin', 'kuro'], ['ashina', 'standard'], ['kage', 'mortal']][p.bot ?? 1];
    if (!this.online) c.setLook(false, this.botLook[0], HUNT.weapon);
    this.phase = 'hunt'; this.total = p.duration * 60; this.hourT = 0;
    const { me, opp } = G;
    const pair = this.W.spawns.length ? c.arena.cfg.huntStart[p.pair % c.arena.cfg.huntStart.length] : [0, 1];
    const mySp = this.W.spawns[pair[this.online ? c.net.slot : 0]], opSp = this.W.spawns[pair[this.online ? 1 - c.net.slot : 1]];
    me.spawn(mySp[0], mySp[1], Math.atan2(-mySp[0], -mySp[1])); opp.spawn(opSp[0], opSp[1], Math.atan2(-opSp[0], -opSp[1]));
    me.lives = opp.lives = p.lives; me.maxHp = opp.maxHp = 100; me.hp = opp.hp = 100;
    me.remote = false; opp.remote = this.online; me.canAmbush = true; opp.canAmbush = !this.online;
    me.onStrike = (a, k, v) => this.onStrike(a, k, v); opp.onStrike = this.online ? null : (a, k, v) => this.onStrike(a, k, v);
    me.onProp = ids => this.breakProps(ids, true); opp.onProp = this.online ? null : ids => this.breakProps(ids, true);
    if (!this.online) this.bot = new HuntBot(opp, this.W, this.weather, p.tod, p.bot ?? 1);
    G.lock = false; c.inp.lock = false; c.rig.snapBehind(me); c.rig.autoFollow = true;
    this.t = 0; this.left = p.duration * 60; this.over = false; G.over = false; G.phase = 'fight'; G.mode = 'hunt';
    c.showHud(); document.body.classList.add('hunt'); c.$('oppBars').style.opacity = 0;
    c.$('oppName').textContent = this.online ? c.t('hunt.opp') : c.t('hunt.bot');
    c.banner('狩', '#e8dcc4', true); c.toast(c.t('hunt.begin')); sfx.bell(); music.set('explore');
    c.hint('hunt');
    if (this.online) this.bindNet();
    this.dayStep(0, true);
  }
  // ---- networking ----
  bindNet() {
    const c = this.c, net = c.net, G = c.G;
    net.on('state', s => { if (!G.opp) return; if (s.lk && s.lk !== G.opp.style + '|' + G.opp.weapon) { const [st, wp] = s.lk.split('|'); c.setLook(false, st, wp); G.opp.remote = true; G.opp.onStrike = null; } G.opp.setRemote(s); });   // the rival drew his katana
    net.on('strike', d => {
      if (this.over) return;
      const r = G.me.resolveStrike(d.kind, { x: d.x, z: d.z }, d.mul || 1, d.fmul || 1, { pmul: d.pm || 1, ambushOk: !this.senses.isAware });
      r.amb = d.kind === 'ambush' && !this.senses.isAware;
      this.tally(r, false); c.showResult(r, G.opp, G.me); net.send('outcome', r);
    });
    net.on('outcome', r => { this.tally(r, true); c.showResult(r, G.me, G.opp); G.me.applyOutcome(r); });
    net.on('hunt', m => this.onMsg(m));
    net.on('peerleft', d => { if (this.over) return; if (d && d.grace) { this.waiting = true; c.toast(c.t('net.waiting', { s: d.grace })); } else this.end(true, c.t('net.left')); });
    net.on('peergone', () => { if (!this.over) this.end(true, c.t('net.left')); });
    net.on('peerback', () => { this.waiting = false; c.toast(c.t('net.back')); if (net.slot === 0) this.sendSync(); });
    net.on('rematch', () => { this.rematch[1] = true; this.tryRematch(); });
    if (net.slot === 1 && this.o.resume) net.send('hunt', { t: 'needSync' });
  }
  sendSync() { const c = this.c; c.net.send('hunt', { t: 'sync', left: this.left, overtime: this.overtime, props: this.W.props.filter(p => p.broken).map(p => p.id) }); }
  onMsg(m) {
    const c = this.c;
    if (m.t === 'noise') this.hearNoise(m);
    else if (m.t === 'stone') this.stones.push(new Stone(c.scene, this.W, new V3(...m.p), 0, 0, new V3(...m.v)));   // their stone in flight (its noise comes separately)
    else if (m.t === 'prop') this.breakProps([m.id], false);
    else if (m.t === 'clock') { this.left = m.left; this.overtime = m.overtime; }
    else if (m.t === 'needSync' && c.net.slot === 0) this.sendSync();
    else if (m.t === 'sync') { this.left = m.left; this.overtime = m.overtime; for (const id of m.props) this.W.breakProp(id); }
    else if (m.t === 'restart') { this.p.pair = m.pair; c.$('result').classList.add('hidden'); this.restart(); }
  }
  // ---- combat ----
  onStrike(att, kind, vic) {
    const c = this.c, G = c.G;
    if (this.online && att === G.me) { c.net.send('strike', { kind, x: att.pos.x, z: att.pos.z, mul: att.dmgMul, fmul: att.fMul }); return; }
    const vs = vic === G.me ? this.senses : this.bot.senses;
    const r = vic.resolveStrike(kind, att.pos, att.dmgMul, att.fMul, { ambushOk: !vs.isAware }); r.amb = kind === 'ambush' && !vs.isAware;
    this.tally(r, att === G.me); c.showResult(r, att, vic); att.applyOutcome(r);
    if (vic !== G.me && vs) { vs.aware = Math.max(vs.aware, 1.1); vs.lastSeen = this.t; vs.lastKnown = att.pos.clone(); }   // the bot always notices who hit it
  }
  tally(r, mine) {
    const s = this.stats;
    if (mine) { if (r.res === 'hit' && r.amb) { s.ambush++; this.c.ach.add('ambushes'); this.c.banner('奇襲', '#ffd0a0', true); } }
    else { if (r.res === 'deflect') s.deflects++; if (r.res === 'block') s.blocks++; if (r.res === 'hit') { s.hitsTaken++; if (r.amb) this.c.banner('奇襲', '#ff6a50', true); } }
    // any exchange alerts the defender completely
    if (!mine && r.res !== 'miss') { this.senses.aware = Math.max(this.senses.aware, 1.1); this.senses.lastSeen = this.t; }
  }
  breakProps(ids, local) {
    const c = this.c;
    for (const id of ids) { const p = this.W.breakProp(id, c.fx); if (!p) continue;
      if (local) { this.stats.props++; if (this.online) c.net.send('hunt', { t: 'prop', id }); const n = { x: p.x, z: p.z, loud: 1.3, kind: p.kind === 'lantern' ? 'paper' : 'wood' }; this.emitNoise(n); }
      const d = Math.hypot(p.x - c.G.me.pos.x, p.z - c.G.me.pos.z); sfx.at(p.kind === 'lantern' ? 'breakPaper' : 'breakWood', this.pan(p.x, p.z), Math.max(0.15, 1 - d / 40)); }
  }
  // ---- noise ----
  emitNoise(n) { if (this.online) c_send(this.c, n); else if (this.bot) this.bot.senses.hear(n, this.c.G.opp); }
  hearNoise(n) {
    const me = this.c.G.me, k = this.senses.hear(n, me); if (k <= 0) return;
    const pan = this.pan(n.x, n.z);
    if (n.kind === 'step') sfx.at('foot', pan, Math.min(1, k * 1.4), n.surface, n.loud); else if (n.kind === 'pebble') sfx.at('pebble', pan, k); else if (n.kind === 'paper') sfx.at('breakPaper', pan, k); else if (n.kind === 'wood') sfx.at('breakWood', pan, k);
    if (n.surface === 'grass' || n.surface === 'bamboo' || n.surface === 'bush') sfx.at('rustle', pan, k * (n.surface === 'bush' ? 1 : 0.8));
    this.indicate(n.x, n.z, k);
  }
  pan(x, z) { const cam = this.c.rig, a = Math.atan2(x - cam.pos.x, z - cam.pos.z); return Math.sin(angDiff(cam.yaw, a)) * -1; }
  indicate(x, z, k, danger) {   // direction arc around the screen centre (not the exact position)
    const box = this.c.$('noiseRing'), cam = this.c.rig, a = angDiff(cam.yaw, Math.atan2(x - cam.pos.x, z - cam.pos.z));
    const el = document.createElement('i'); el.style.transform = `rotate(${-a}rad)`; el.style.opacity = Math.min(1, 0.25 + k); if (danger) el.className = 'danger';
    box.appendChild(el); setTimeout(() => el.remove(), 1300);
  }
  // throw a stone where the camera looks: a real arc, it knocks on walls and makes its noise where it lands (lures the enemy)
  lure() {
    const c = this.c, me = c.G.me; if (this.lureT > 0 || me.dead || me.act !== 'idle') return; this.lureT = HUNT.lureCooldown;
    me.setAct('toss'); this.throwAt = { t: 0.42, yaw: c.rig.yaw, pitch: c.rig.pitch };   // released at the forward snap of the arm
  }
  throwStone(yaw, pitch) {
    const c = this.c, me = c.G.me, from = me.b && me.b.handL ? me.b.handL.getWorldPosition(new V3()) : me.hitPoint;
    const s = new Stone(c.scene, this.W, from, yaw, pitch); s.mine = true; this.stones.push(s); c.ach.add('stones'); sfx.at('swing', 0, 0.35);
    if (this.online) c.net.send('hunt', { t: 'stone', p: from.toArray().map(v => +v.toFixed(2)), v: s.v0.toArray().map(v => +v.toFixed(2)) });
  }
  stonesStep(dt) {
    const c = this.c, me = c.G.me;
    if (this.throwAt && (this.throwAt.t -= dt) <= 0) { const T = this.throwAt; this.throwAt = null; if (me.act === 'toss') this.throwStone(T.yaw, T.pitch); }
    for (const s of this.stones) {
      const r = s.update(dt); if (!r) continue;
      const p = s.land, d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
      c.fx.spark(p.clone().setY(p.y + 0.05), r === 'wall' ? 8 : 5, 2, 0xc8c0b0, 0.3); sfx.at('pebble', this.pan(p.x, p.z), Math.max(0.15, 1 - d / 30));
      if (s.mine) this.emitNoise({ x: p.x, z: p.z, loud: 0.9, kind: 'pebble' });
    }
    this.stones = this.stones.filter(s => !s.done);
  }
  // ---- frame ----
  step(dt, rawDt, live) {
    const c = this.c, G = c.G, { me, opp } = G, inp = c.inp;
    this.t += dt; this.lureT -= rawDt; this.noiseT -= rawDt;
    if (this.phase === 'duel' && !this.over && (this.duelT = (this.duelT || 0) + rawDt) > HUNT_DUEL_DROP) battle.drop();   // the square: a short intro, then the drive
    if (!this.over && !this.waiting) this.clock(rawDt);
    // senses: my view = camera direction
    const newSpot = this.senses.update(dt, me, c.rig.yaw, opp, this.t);
    if (newSpot) { if (this.stats.firstSpot === null) this.stats.firstSpot = this.t; c.toast(c.t('hunt.spotted')); sfx.at('cue', this.pan(opp.pos.x, opp.pos.z), 0.35); }
    const canLock = this.phase === 'duel' ? !opp.dead : this.senses.spotted && (this.senses.vis > 0 || this.t - this.senses.lastSeen < HUNT.lockMemory) && !opp.dead;
    if (!canLock && G.lock) { G.lock = false; inp.lock = false; }
    inp.lock = G.lock && canLock;
    // input + fighters
    if (c.wantLure && live) { c.wantLure = false; this.lure(); }
    this.stonesStep(dt);
    if (MOVES[me.act] && me.seq !== this.myAtkSeq) { this.myAtkSeq = me.seq; this.stats.attacks++; }
    let myInp = live && !me.dead ? inp : c.noInput;
    if (G.auto && live) { myInp = G.auto.think(dt, opp); for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump']) if (myInp[k]) myInp[k] = Math.max(0, myInp[k] - dt); }   // test harness: AI drives the player
    me.update(dt, myInp, opp);
    if (this.online) opp.update(dt, null, me);
    else { const bi = live ? this.bot.think(dt, me, this.t) : c.noInput; opp.update(dt, bi, me); for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump']) if (bi[k]) bi[k] = Math.max(0, bi[k] - dt); }
    c.fighterEvents(me); c.fighterEvents(opp);
    // my footsteps -> opponent; bot footsteps -> me
    const n = this.steps.update(dt, me); if (n) { sfx.at('foot', 0, 0.12, n.surface, n.loud); if (this.noiseT <= 0 || !this.online) { this.noiseT = HUNT.noiseNet; this.emitNoise(n); } }
    if (!this.online) { const bn = this.oppSteps.update(dt, opp); if (bn) this.hearNoise(bn); }
    // surprise-attack wind-up cue (gives the victim a fair chance to react)
    if (opp.act === 'ambush' && opp.seq !== this.cueSeq && Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z) < HUNT.ambushCue) { this.cueSeq = opp.seq; sfx.at('cue', this.pan(opp.pos.x, opp.pos.z), 1); this.indicate(opp.pos.x, opp.pos.z, 1, true); }
    // music
    const d = Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z);
    music.set(this.over ? 'off' : (d < HUNT.combatDist && this.senses.spotted) || MOVES[opp.act] && d < 10 ? 'combat' : this.senses.spotted || this.senses.aware > 0.4 ? 'tension' : 'explore');
    // deaths and respawns
    this.lives(rawDt);
    // damage stats (from hp deltas, works the same online and offline)
    if (opp.hp < this.dmgLast.opp) this.stats.dealt += this.dmgLast.opp - opp.hp; if (me.hp < this.dmgLast.me) this.stats.taken += this.dmgLast.me - me.hp;
    this.dmgLast.opp = opp.hp; this.dmgLast.me = me.hp;
    this.hud();
    c.arena.follow(me.pos); this.weather.update(rawDt, this.W.wind);
  }
  clock(dt) {
    const c = this.c; this.left -= dt;
    if (this.online && c.net.slot === 0 && ((this.syncT = (this.syncT || 0) - dt) < 0)) { this.syncT = 5; c.net.send('hunt', { t: 'clock', left: this.left, overtime: this.overtime }); }
    this.dayStep(dt);
    if (this.left <= 0 && this.phase === 'hunt') this.startDuel();
    if (this.overtime && (this.pingT -= dt) <= 0) { this.pingT = HUNT.pingEvery; const o = c.G.opp; sfx.at('bell', this.pan(o.pos.x, o.pos.z), 0.6); this.indicate(o.pos.x, o.pos.z, 1, true);
      if (this.bot) { const s = this.bot.senses; s.lastKnown = c.G.me.pos.clone(); s.aware = Math.max(s.aware, 0.5); if (this.bot.state === 'patrol') this.bot.state = 'investigate'; } }
  }
  // the clock runs from the dead of night to 12:30 (maps.js DAY): lighting, mist and the sight model follow the hour
  get hour() { return DAY.start + (DAY.duel - DAY.start) * Math.min(1, Math.max(0, 1 - this.left / this.total)); }
  dayStep(dt, now = false) {
    if ((this.hourT -= dt) > 0 && !now) return; this.hourT = HUNT.lightRate;
    const cfg = this.c.arena.cfg; if (!cfg.setHour) return;
    const h = this.hour; cfg.setHour(h); const tod = DAY.sense(h); this.senses.tod = tod; if (this.bot) this.bot.senses.tod = tod;
  }
  // 12:30: the hunt is over. Both stand in the village square, draw their katana and fight to the death.
  startDuel() {
    const c = this.c, G = c.G; if (this.phase === 'duel') return; this.phase = 'duel'; this.overtime = true; this.left = 0;
    c.banner('決闘', '#ff8a60', true); c.toast(c.t('hunt.duel')); sfx.bell(); battle.start(); this.duelT = 0;
    for (const s of this.stones) s.finish(); this.stones = []; this.throwAt = null; this.respawnT = this.oppRespawnT = -1;
    c.setLook(true, c.REC.skin, c.REC.weapon); const me = G.me; me.onProp = ids => this.breakProps(ids, true); me.canAmbush = false; me.remote = false; me.onStrike = (a, k, v) => this.onStrike(a, k, v);
    if (!this.online) { c.setLook(false, this.botLook[0], this.botLook[1]); const o = G.opp; o.remote = false; o.canAmbush = false; o.onStrike = (a, k, v) => this.onStrike(a, k, v); o.onProp = ids => this.breakProps(ids, true); this.bot.f = o; this.bot.ai.f = o; this.bot.state = 'duel'; this.bot.senses.aware = 1.3; }
    const P = this.W.duelSpot || [0, 0], place = (f, side) => { const lives = f.lives; f.spawn(P[0] + side * HUNT.duelGap / 2, P[1], side < 0 ? Math.PI / 2 : -Math.PI / 2); f.lives = lives; f.invuln = true; f.invulnT = HUNT.duelGuard; };
    const side = this.online && c.net.slot === 1 ? 1 : -1; place(me, side); if (!this.online) place(G.opp, -side);
    this.senses.aware = 1.3; this.senses.spotted = true; this.senses.lastSeen = this.t; G.lock = true; c.inp.lock = true; c.rig.snapBehind(me);
  }
  decide() {
    const { me, opp } = this.c.G;
    if (me.lives !== opp.lives) this.end(me.lives > opp.lives); else if (Math.abs(me.hp - opp.hp) > 1) this.end(me.hp > opp.hp); else this.end(null);
  }
  lives(dt) {
    const c = this.c, { me, opp } = c.G;
    if (this.over) return;
    if (this.phase === 'duel') { if (me.dead) this.end(false); else if (opp.dead) this.end(true); return; }   // the duel: first to fall loses
    if (me.dead && me.lives <= 0) { this.end(false); return; }
    if (opp.dead && opp.lives <= 0) { this.end(true); return; }
    if (me.dead) { if (this.respawnT < 0) { this.respawnT = HUNT.respawnDelay; c.banner('死', '#ff2a2a', true); } else if ((this.respawnT -= dt) <= 0) { this.respawnT = -1; this.respawn(me, opp); } }
    if (!this.online && opp.dead) { if (this.oppRespawnT < 0) { this.oppRespawnT = HUNT.respawnDelay; c.banner('討', '#ffd870', true); } else if ((this.oppRespawnT -= dt) <= 0) { this.oppRespawnT = -1; this.respawn(opp, me); this.bot.state = 'patrol'; this.bot.senses.aware = 0; this.bot.pickWaypoint(); } }
  }
  respawn(f, other) {
    const sp = this.W.spawns.slice().sort((a, b) => Math.hypot(b[0] - other.pos.x, b[1] - other.pos.z) - Math.hypot(a[0] - other.pos.x, a[1] - other.pos.z))[0];
    const lives = f.lives; f.spawn(sp[0], sp[1], Math.atan2(-sp[0], -sp[1])); f.lives = lives; f.invuln = true; f.invulnT = HUNT.respawnGuard;
    if (f === this.c.G.me) { this.c.rig.snapBehind(f); this.senses.aware = 0; this.senses.spotted = false; this.c.toast(this.c.t('hunt.respawn')); }
  }
  hud() {
    const c = this.c, s = this.senses, { me, opp } = c.G;
    c.$('oppBars').style.opacity = s.spotted && !opp.dead ? 1 : 0;
    const m = Math.max(0, this.left), mm = Math.floor(m / 60), ss = Math.floor(m % 60), h = this.hour, hh = Math.floor(h), hm = Math.floor((h - hh) * 60);
    const rem = `${mm}:${String(ss).padStart(2, '0')}`, clock = this.phase === 'duel' ? '決闘 ' + c.t('hunt.duelT') : !c.arena.cfg.setHour ? rem : `${String(hh).padStart(2, '0')}:${String(hm).padStart(2, '0')} <small>· ${mm}:${String(ss).padStart(2, '0')}</small>`;   // the hour of the hunt (duel at 12:30) and the time left
    setH(c.$('huntInfo'), `<b class="${this.phase === 'duel' ? 'ot' : ''}">${clock}</b><span>${c.t('hunt.lives')} ${'◆'.repeat(Math.max(0, me.lives))}${'◇'.repeat(Math.max(0, this.p.lives - me.lives))}</span>`);
    // awareness eye (how close I am to spotting him) and my own concealment
    const eye = c.$('eye'); eye.style.setProperty('--k', Math.min(1, s.aware)); eye.classList.toggle('on', s.spotted);
    const cover = this.W.coverAt(me.pos.x, me.pos.z, me.crouch ? 0.9 : 1.6), light = this.W.lightAt(me.pos.x, me.pos.z), gait = me.crouch ? 0.6 : me.speed > 4.6 * MOVE_K ? 1.25 : me.speed > 2 * MOVE_K ? 1 : 0.8;
    const night = this.senses.tod === 'night', exposure = me.crouch && inBush(this.W, me.pos.x, me.pos.z) ? 0 : (1 - cover * 0.8) * (night ? 0.4 + light : 0.8 + light * 0.3) * gait;
    const hid = c.$('hidden'); { const ht = exposure < 0.45 ? c.t('hunt.hidden') : exposure < 0.8 ? c.t('hunt.partly') : c.t('hunt.exposed'); if (hid._t !== ht) { hid._t = ht; hid.textContent = ht; } } hid.className = exposure < 0.45 ? 'h' : exposure < 0.8 ? 'p' : 'e';
  }
  end(win, note) {
    if (this.over) return; battle.stop(); const c = this.c; this.over = true; c.G.over = true; c.G.phase = 'end'; music.set('off');
    if (win) { c.ach.add('huntWins'); if (this.phase === 'duel') c.ach.add('noonWins'); if (this.online) c.ach.add('onlineWins'); }
    const s = this.stats; s.time = this.t;
    c.banner(win === null ? '引分' : win ? '勝利' : '死', win ? '#ffd870' : win === null ? '#e8dcc4' : '#ff2a2a', true);
    const coins = win ? 120 : win === null ? 50 : 30; c.addCoins(coins);
    c.ach.add('matches'); const gems = win ? c.addGems(this.online ? 2 : 1) : 0; if (win) c.ach.add('wins');
    const fmt = x => x === null ? '—' : Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
    const acc = s.deflects + s.blocks + s.hitsTaken ? Math.round(100 * s.deflects / (s.deflects + s.blocks + s.hitsTaken)) + '%' : '—';
    setTimeout(() => {
      if (c.G.mode !== 'hunt') return;
      document.exitPointerLock && document.exitPointerLock();
      c.$('resBig').textContent = win === null ? c.t('res.draw') : win ? c.t('res.win') : c.t('res.lose'); c.$('resBig').className = win ? 'win' : 'lose';
      c.$('resSub').innerHTML = (note ? note + '<br>' : '') + `<table class="stats">
        <tr><td>${c.t('st.time')}</td><td>${fmt(s.time)}</td></tr><tr><td>${c.t('st.firstSpot')}</td><td>${fmt(s.firstSpot)}</td></tr>
        <tr><td>${c.t('st.ambush')}</td><td>${s.ambush}</td></tr><tr><td>${c.t('st.attacks')}</td><td>${s.attacks}</td></tr>
        <tr><td>${c.t('st.parry')}</td><td>${acc} (${s.deflects})</td></tr><tr><td>${c.t('st.dealt')}</td><td>${Math.round(s.dealt)}</td></tr>
        <tr><td>${c.t('st.taken')}</td><td>${Math.round(s.taken)}</td></tr><tr><td>${c.t('st.props')}</td><td>${s.props}</td></tr></table>${c.payLine(coins, gems)}`;
      c.$('result').classList.remove('hidden'); c.$('bRematch').textContent = c.t('res.rematch');
    }, 3200);
    this.rematch = [false, false];
  }
  requestRematch() {
    const c = this.c;
    if (!this.online) { c.$('result').classList.add('hidden'); this.p.pair = Math.random() * 3 | 0; this.restart(); return; }
    this.rematch[0] = true; c.net.send('rematch', 1); c.$('bRematch').textContent = c.t('res.waiting'); this.tryRematch();
  }
  tryRematch() { const c = this.c; if (this.rematch && this.rematch[0] && this.rematch[1] && c.net.slot === 0) { const pair = Math.random() * 3 | 0; c.net.send('hunt', { t: 'restart', pair }); this.p.pair = pair; c.$('result').classList.add('hidden'); this.restart(); } }
  restart() {
    for (const st of this.stones) st.finish(); this.stones = []; this.throwAt = null;
    for (const p of this.W.props) if (p.broken) { /* the map is rebuilt below */ }
    this.c.arena.setMap('dojo'); this.stats = { start: 0, firstSpot: null, ambush: 0, attacks: 0, deflects: 0, blocks: 0, hitsTaken: 0, dealt: 0, taken: 0, props: 0, time: 0 };
    this.overtime = false; this.respawnT = this.oppRespawnT = -1; this.start();
  }
  dispose() { battle.stop(); document.body.classList.remove('hunt'); music.set('off'); if (this.weather) this.weather.set('clear'); this.c.$('noiseRing').innerHTML = ''; }
}
function c_send(c, n) { c.net.send('hunt', { t: 'noise', x: +n.x.toFixed(2), z: +n.z.toFixed(2), loud: n.loud, kind: n.kind, surface: n.surface }); }
