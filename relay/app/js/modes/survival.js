// SURVIVAL: co-op (or solo) waves of enemies. The host (or the solo player) is authoritative for the waves, every
// enemy's AI, health, posture and death. Each player stays authoritative for its own fighter (hits on a player are
// resolved on that player's machine, exactly like duels). Enemy state is streamed to the guest at ~15 Hz.
import * as THREE from 'three';
import { MOVES } from '../moves.js';
import { AI } from '../ai.js';
import { sfx, music, battle } from '../audio.js';
import { SV_MAPS } from '../maps.js';
import { Flasks, Shuriken, ITEMS } from './svitems.js';
import { BossAbilities } from './svabil.js';

const V3 = THREE.Vector3;
const setH = (el, h) => { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };   // HUD: touch the DOM only when the text changes
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
const pickW = w => { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };

// gems for clearing all ten waves, by difficulty (plus the usual coins)
export const SV_GEMS = { normal: 40, hard: 60 };
const NAV = { repath: 1.2, near: 2.5 };   // enemy pathing around cover: re-plan interval (s), no pathing closer than this (m)
const _a = new V3(), _b = new V3(), _up = new V3(0, 1, 0);
// AI move weights for the polearm bosses (the level's sword moves switched off)
const POLE_MOVES = { slash: 0, heavy: 0, heavyB: 0, kick: 0, uppercut: 0, leap: 0, crush: 0, grab: 0, thrust: 1, dash: 1.5, sweep: 1.5, pJab: 3, pSpin: 2, pRise: 1.5, pSlam: 2.2 };
export const SV = {
  netRate: 1 / 15, maxAlive: 6, spawnGap: [3.5, 6], groupSize: [1, 3], clearPause: 2.2, pickTime: 25, introTime: 3.2,
  reviveTime: 3.2, reviveRange: 1.8, riseHp: 0.4, respawnHp: 0.5, bossEvery: 10, miniEvery: 5, removeAfter: 3.5,
  tokens: (n) => n >= 8 ? 2 : 1,                          // simultaneous attackers per player (mini-bosses included): the rest circle, flank and wait their turn
  dir: { gap: 0.9, holdMax: 3.2, cool: [1.8, 3.4], ring: 4.8, ring2: 0.8 },   // token handover gap (s), max time a token is held, cooldown after an attack, waiting ring radius (+ second ring)
  final: 10,                                              // the run ends when the wave-10 boss falls
};
// ---------------------------------------------------------------- AI skill
// How smart a bot fights (0 weak .. 1 medium .. 2 strong) depends on the wave, never on its type or skin: the rank and
// file of a wave roll in the 'base' range, 1-2 'leaders' a step above (medium early, strong late). Mini-bosses and the
// final boss have their own skill and fight in a fixed, learnable pattern (ETYPES.*.pattern / phases[].ai.pattern).
const SKILL = {
  base: [[0, 0.1], [0, 0.2], [0.1, 0.3], [0.15, 0.4], [0.2, 0.45], [0.3, 0.6], [0.35, 0.7], [0.4, 0.75], [0.5, 0.9]],   // waves 1..9
  lead: [[1, 0.5], [1, 0.6], [1, 0.8], [1, 1.0], [1, 0.8], [2, 1.1], [2, 1.3], [1, 1.2], [2, 1.6]],                         // [how many, skill]; mini-boss waves (5, 8) keep their escort a notch softer
  mini: [1.0, 1.2], boss: 1.2,   // wave-5 general, wave-8 generals; the wave-10 shogun
  hard: 0.35, hardLead: 0.25, endless: 0.08,   // hard difficulty bonus (rank and file / leaders & bosses); per wave past the table
};
// ---------------------------------------------------------------- enemy archetypes
// look: [skin, weapon], tint (null = skin colours), ai: STYLE only (roles, spacing, mobility, aggression) — no skill;
// styleK: multipliers <= 1 for things a type is bad at (brutes barely deflect); moves: AI move weights
// the run, wave by wave: [normal bots, mini-bosses, final boss]
const WAVES = [[3, 0, 0], [4, 0, 0], [5, 0, 0], [6, 0, 0], [5, 1, 0], [7, 0, 0], [8, 0, 0], [5, 2, 0], [10, 0, 0], [0, 0, 1]];
export const ETYPES = {
  ashigaru: { name: 'Ashigaru', look: ['ashina', 'standard'], hp: 60, post: 80, scale: 1, tempo: 1, speed: 1, dmg: 0.9, cost: 1, from: 1,
    ai: { aggr: 0.5 }, moves: { slash: 6, heavy: 2, kick: 0.6 } },
  swift: { name: 'Shinobi', look: ['shinobi', 'kuro'], tint: 0x2a2a34, hp: 42, post: 60, scale: 0.95, tempo: 1.25, speed: 1.35, dmg: 0.75, cost: 1.4, from: 2, role: 'flank',
    ai: { aggr: 0.65, mobility: 0.95, guard: 0.15 }, styleK: { deflect: 0.5 }, moves: { slash: 5, dash: 2.5, uppercut: 1.5, sweep: 0.5 } },
  spear: { name: 'Yari Guard', look: ['ronin', 'yari'], tint: 0x5a4a30, hp: 70, post: 90, scale: 1.02, tempo: 0.95, speed: 0.95, dmg: 1, cost: 1.6, from: 3, role: 'keep', reach: 1.55,
    ai: { prefDist: [3.6, 4.6], aggr: 0.45, mobility: 0.4 }, moves: { jab: 5, thrust: 2, sweep: 1.5 } },
  brute: { name: 'Oni Brute', look: ['oni', 'crimson'], hp: 150, post: 170, scale: 1.18, tempo: 0.85, speed: 0.85, dmg: 1.4, cost: 2.6, from: 4, role: 'pressure', armor: true,
    ai: { guard: 0.6, aggr: 0.55, mobility: 0.1 }, styleK: { react: 0.6, deflect: 0.15 }, moves: { heavy: 4, heavyB: 2, leap: 2, kick: 2, sweep: 1 } },
  elite: { name: 'Shadow Elite', look: ['kage', 'mortal'], hp: 120, post: 130, scale: 1.02, tempo: 1.1, speed: 1.1, dmg: 1.15, cost: 3.2, from: 6,
    ai: { feint: 0.25, mobility: 0.6 }, moves: { slash: 5, heavyB: 1.5, thrust: 1.5, uppercut: 1.2, dash: 1, sweep: 0.8 } },
  oniGeneral: { name: 'Golden Dragon General', boss: 'mini', look: ['dragonGold', 'bisento'], tint: null, reach: 1.35, hp: 420, post: 240, scale: 1.3, tempo: 0.95, speed: 0.95, dmg: 1.25, armor: 'attack',
    ai: { aggr: 0.6, feint: 0.15, think: [0.55, 0.9], gap: [1.2, 1.6], pattern: [['pJab', 'pJab2'], ['pSlam', 'pBack'], ['sweep']] }, moves: POLE_MOVES,   // fixed order: thrusts, cleave + backhand, low sweep (jump it)
    phases: [{ at: 0.5, tempo: 1.1, ai: { feint: 0.25, gap: [1, 1.3], pattern: [['pJab', 'pJab2', 'pRise'], ['pSpin'], ['pSlam', 'pBack'], ['sweep', 'pJab']] }, aura: 0xff3010 }] },
  oniGeneral2: { name: 'Black Dragon General', boss: 'mini', look: ['dragonBlack', 'bisento'], tint: null, reach: 1.35, hp: 420, post: 240, scale: 1.3, tempo: 1, speed: 1, dmg: 1.2, armor: 'attack',
    ai: { aggr: 0.6, feint: 0.15, think: [0.55, 0.9], gap: [1.2, 1.6], pattern: [['pJab', 'pJab2'], ['pSlam', 'pBack'], ['sweep']] }, moves: POLE_MOVES,   // fixed order: thrusts, cleave + backhand, low sweep (jump it)
    phases: [{ at: 0.5, tempo: 1.1, ai: { feint: 0.25, gap: [1, 1.3], pattern: [['pJab', 'pJab2', 'pRise'], ['pSpin'], ['pSlam', 'pBack'], ['sweep', 'pJab']] }, aura: 0xff3010 }] },
  sawSaint: { name: 'Skeleton Shogun', boss: 'major', look: ['skullLord', 'naginata'], tint: null, reach: 1.45, hp: 1100, post: 320, scale: 1.22, tempo: 1, speed: 1.05, dmg: 1.3, armor: 'attack',
    // the final boss fights in a fixed rhythm the player can learn: the same combos in the same order, each followed by an
    // opening (gap, s) where it backs off and barely defends; every phase adds a new element and shortens the openings
    ai: { aggr: 0.6, feint: 0.15, mobility: 0.5, think: [0.5, 0.85], gap: [1.4, 1.8], openReact: 0.2,
      pattern: [['pJab', 'pJab2'], ['pSlam', 'pBack'], ['sweep'], ['pJab', 'pJab2', 'pRise']] }, moves: { ...POLE_MOVES, boss1: 1.5, pSlam: 1 },
    phases: [{ at: 0.66, tempo: 1.06, ai: { feint: 0.25, gap: [1.1, 1.5], pattern: [['pSlam', 'pBack', 'pRise'], ['flameSweep'], ['pJab', 'pJab2'], ['boss1', 'boss2'], ['pSpin']] }, aura: 0xff9a3a },
      { at: 0.33, tempo: 1.14, ai: { feint: 0.35, mobility: 0.7, gap: [0.9, 1.2], pattern: [['pJab', 'pJab2', 'pRise'], ['flameSweep', 'pSpin'], ['pSlam', 'pBack'], ['sweep', 'pJab'], ['boss1', 'boss2', 'boss3']] }, aura: 0xff2a1a }] },
};
// ---------------------------------------------------------------- upgrades
// stat: applied to the player's fighter by apply(). team: affects the partner too.
const R = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const UPG = [
  { id: 'edge', r: 'common', max: 3, k: { dmg: 0.15 } }, { id: 'crusher', r: 'common', max: 3, k: { pmul: 0.22 } }, { id: 'vit', r: 'common', max: 3, k: { hp: 25 } },
  { id: 'calm', r: 'common', max: 3, k: { regen: 0.35 } }, { id: 'wall', r: 'common', max: 2, k: { block: -0.2 } }, { id: 'mend', r: 'common', max: 2, k: { mend: 0.25 } },
  { id: 'mirror', r: 'rare', max: 2, k: { defl: 0.3 } }, { id: 'wrist', r: 'rare', max: 2, k: { parry: 0.04 } }, { id: 'quick', r: 'rare', max: 2, k: { cancel: -0.15 } },
  { id: 'stone', r: 'rare', max: 2, k: { taken: -0.12 } }, { id: 'heavyArt', r: 'rare', max: 2, k: { heavy: 0.35 } }, { id: 'medic', r: 'rare', max: 1, k: { revive: 0.6 }, team: true },
  { id: 'bond', r: 'rare', max: 1, k: { bond: 1 }, team: true },
  { id: 'counterEdge', r: 'epic', max: 1, k: { counter: 0.6 } }, { id: 'bloodlust', r: 'epic', max: 1, k: { lust: 1 } }, { id: 'reaper', r: 'epic', max: 1, k: { reap: 20 } },
  { id: 'windStep', r: 'epic', max: 1, k: { dodge: 1 } }, { id: 'tandem', r: 'epic', max: 1, k: { tandem: 1 }, team: true }, { id: 'guardian', r: 'epic', max: 1, k: { guardian: 1 }, team: true },
  { id: 'kensei', r: 'legendary', max: 1, k: { dmg: 0.3, pmul: 0.3, parry: 0.05 } }, { id: 'phoenix', r: 'legendary', max: 1, k: { phoenix: 1 } }, { id: 'sharedLife', r: 'legendary', max: 2, k: { teamheal: 0.35 }, team: true },
];
const RARITY_W = [60, 28, 10, 2.5];

// ---------------------------------------------------------------- controller
export class Survival {
  constructor(ctx, opts) {
    this.c = ctx; this.o = opts; this.online = !!opts.online; this.host = !this.online || ctx.net.slot === 0; this.p = opts.params;
    this.enemies = new Map(); this.nextId = 1; this.wave = 0; this.phase = 'intro'; this.phaseT = 0; this.queue = []; this.spawnT = 0; this.netT = 0;
    this.picks = []; this.mods = {}; this.buffs = { lust: 0, guardian: 0 }; this.picked = { me: false, mate: false };
    this.reviveP = 0; this.lastHitT = -9; this.res = this.o.resurrections ?? 1;
    this.stats = { waves: 0, kills: 0, deathblows: 0, deflects: 0, rescues: 0, dealt: 0, taken: 0, bosses: 0, time: 0, byType: {} };
    this.over = false; this.mate = null; this.t = 0; this.tandemMarks = new Map(); this.phoenixUsed = false;
    this.flasks = new Flasks(ctx.scene); this.shuris = []; this.shuriCd = 0; this.abil = new BossAbilities(this);
  }
  // ================= setup =================
  start() {
    const c = this.c, G = c.G, p = this.p;
    c.arena.setMap(p.map, { tod: p.tod }); this.W = c.arena.world; this.cfg = c.arena.cfg;
    this.weather = c.weather; this.weather.set(pick(this.cfg.weathers || ['clear']));
    c.setLook(true, c.REC.skin, c.REC.weapon);
    const me = G.me; me.spawn(this.online && c.net.slot === 1 ? 2 : -2, 4, Math.PI); me.lives = 1; me.downable = true; me.remote = false;
    me.onStrike = (a, k, v) => this.onStrike(a, k, v); me.onProp = ids => this.breakProps(ids, true);
    me.hitTargets = () => [...this.enemies.values()].filter(e => !e.f.dead).map(e => e.f);
    if (this.online) { this.mate = c.newFighter(c.REC.skin === 'shinobi' ? 'ronin' : 'shinobi', 'standard', 'Ally'); this.mate.remote = true; this.mate.downable = true; this.mate.spawn(c.net.slot === 1 ? -2 : 2, 4, Math.PI); }
    G.dummy = G.opp; G.opp.group.visible = false; G.opp.katana.visible = false; G.opp.pos.set(999, 0, 999); G.opp.dead = true;
    this.applyMods();
    G.lock = true; c.inp.lock = true; c.rig.snapBehind(me); G.over = false; G.phase = 'fight'; G.mode = 'survival';
    document.body.classList.add('surv'); c.showHud(); c.hint('survival'); c.$('oppBars').style.opacity = 0;
    c.$('mateCard').style.display = this.online ? 'block' : 'none';
    if (this.online) this.bindNet();
    if (this.host) this.beginWave(this.o.resumeWave || 1); else if (this.o.resume) c.net.send('sv', { t: 'needSync' });
  }
  // ================= waves (host) =================
  composition(n) {
    const W = WAVES[n - 1];   // fixed run: [normal bots, mini-bosses, final boss]
    if (W) { const out = []; if (W[2]) out.push('sawSaint'); for (let i = 0; i < W[1]; i++) out.push(i % 2 ? 'oniGeneral2' : 'oniGeneral');
      const th = n < 3 ? { ashigaru: 1 } : [{ ashigaru: 3, swift: 1 }, { spear: 3, ashigaru: 1 }, { swift: 3, ashigaru: 1 }, { brute: 2, ashigaru: 2 }, { ashigaru: 1, swift: 1, spear: 1, brute: 1, elite: 1 }, { elite: 2, swift: 1 }][(n * 7) % 6];
      for (let i = 0; i < W[0]; i++) { const w = {}; for (const k in th) if (ETYPES[k].from <= n) w[k] = th[k]; if (!Object.keys(w).length) w.ashigaru = 1; out.push(pickW(w)); }
      return out; }
    const out = [], boss = n % SV.bossEvery === 0, mini = !boss && n % SV.miniEvery === 0;
    if (boss) { out.push('sawSaint'); if (n > 10) out.push('elite'); return out; }
    if (mini) { out.push('oniGeneral'); for (let i = 0; i < 1 + Math.floor(n / 10); i++) out.push(pick(['ashigaru', 'spear'])); return out; }
    let budget = 3 + n * 1.5 + (this.online ? 2 + n * 0.5 : 0);
    // a theme makes consecutive waves feel different
    const themes = [{ ashigaru: 3, swift: 1 }, { spear: 3, ashigaru: 1 }, { swift: 3, ashigaru: 1 }, { brute: 2, ashigaru: 2 }, { ashigaru: 1, swift: 1, spear: 1, brute: 1, elite: 1 }, { elite: 2, swift: 1 }];
    const th = themes[(n * 7 + Math.floor(Math.random() * 3)) % themes.length];
    while (budget > 0.9) {
      const w = {}; for (const k in th) if (ETYPES[k].from <= n && ETYPES[k].cost <= budget + 0.4) w[k] = th[k];
      if (!Object.keys(w).length) w.ashigaru = 1;
      const k = pickW(w); out.push(k); budget -= ETYPES[k].cost;
    }
    return out;
  }
  skillsFor(n, queue) {   // one skill per queued bot (see SKILL)
    const i = Math.min(n, SKILL.base.length) - 1, extra = Math.max(0, n - SKILL.base.length) * SKILL.endless, hard = this.p.diff === 'hard';
    const [b0, b1] = SKILL.base[i], [nl, ls] = SKILL.lead[i], plain = queue.map((k, j) => ETYPES[k].boss ? -1 : j).filter(j => j >= 0), leads = new Set();
    while (leads.size < Math.min(nl, plain.length)) leads.add(plain[Math.random() * plain.length | 0]);
    return queue.map((k, j) => { const T = ETYPES[k], top = !!T.boss || leads.has(j); let s = T.boss === 'major' ? SKILL.boss : T.boss ? SKILL.mini[n >= 8 ? 1 : 0] : leads.has(j) ? ls : rnd(b0, b1);
      if (hard) s += top ? SKILL.hardLead : SKILL.hard; return Math.min(2, s + extra); });
  }
  beginWave(n) {
    const c = this.c; c.fx.clearStains(); this.wave = n; this.phase = 'intro'; this.phaseT = 0; this.queue = this.composition(n); this.qSkill = this.skillsFor(n, this.queue); this.spawnT = 1.5; this.stats.waves = n - 1;
    if (n > 1 && (n - 1) % 3 === 0) this.weather.set(pick(this.cfg.weathers || ['clear']));
    this.respawnDead(); this.healUp();
    const boss = this.queue.some(k => ETYPES[k].boss);
    c.banner(boss ? '首' : '波', boss ? '#ff5a3a' : '#e8dcc4', true); c.toast(c.t('sv.wave', { n }) + (boss ? ' · ' + c.t('sv.boss') : '')); sfx.wave();
    music.set(boss ? 'boss' : 'combat');
    if (this.online) c.net.send('sv', { t: 'wave', n, weather: this.weather.kind, boss });
  }
  healUp() { const me = this.c.G.me; if (!me.dead && !me.downed) { me.hp = me.maxHp; me.posture = 0; } this.flasks.clear(); this.abil.clear(); }   // every wave starts at full health
  respawnDead() {   // players who bled out return at the start of the next wave with half health
    const me = this.c.G.me;
    if (me.dead || me.downed) { me.dead = false; me.rise(SV.respawnHp); this.c.toast(this.c.t('sv.back')); }
  }
  spawnEnemy(type, at, skill) {
    const c = this.c, T = ETYPES[type], n = this.wave, id = this.nextId++;
    const sp = at || pick(this.W.spawns); const x = sp[0] + rnd(-1.5, 1.5), z = sp[1] + rnd(-1.5, 1.5);
    const scale = Math.max(0, n - 10), hpK = (1 + 0.07 * scale) * (this.online ? 1.35 : 1) * (this.p.diff === 'hard' ? 1.25 : 1), dmgK = (1 + 0.045 * scale) * (this.p.diff === 'hard' ? 1.2 : 1);
    const e = this.makeEnemy(id, type, x, z, Math.atan2(-x, -z), Math.round(T.hp * hpK), dmgK, Math.min(1.45, T.tempo * (1 + 0.015 * scale)), skill);
    if (this.online) c.net.send('sv', { t: 'spawn', id, type, x, z, yaw: e.f.yaw, hp: e.f.maxHp, dk: dmgK, tempo: e.f.tempo });
    if (T.boss) this.bossIntro(e);
    return e;
  }
  makeEnemy(id, type, x, z, yaw, hp, dmgK, tempo, skill = 0.5) {
    const c = this.c, T = ETYPES[type], f = c.newFighter(T.look[0], T.look[1], T.name);
    f.restyle(T.tint ?? null, T.scale); f.spawn(x, z, yaw); f.maxHp = f.hp = hp; f.maxPosture = Math.round(T.post * (1 + 0.04 * Math.max(0, this.wave - 10)));
    f.tempo = tempo; f.speedMul = T.speed; f.dmgMul = T.dmg * dmgK; f.reach = T.reach || 1; f.superArmor = T.armor || false; f.lives = 1;
    f.remote = !this.host; f.hitTargets = () => this.players(); f.onStrike = (a, k, v) => this.onStrike(a, k, v);
    const ai = this.host ? new AI(f, skill, { ...T.ai, moves: T.moves }) : null;   // skill from the wave (SKILL), style from the type
    if (ai) { ai.P.moves = { ...T.moves }; for (const k in T.styleK || {}) ai.P[k] *= T.styleK[k]; }
    const e = { id, type, T, f, ai, skill, role: T.role || 'any', target: null, deadT: 0, phase: 0, lastHitBy: null, aura: null };
    this.enemies.set(id, e); return e;
  }
  // walk around cover: when the straight line to the goal (anchor or target) is blocked by walls, carts, rocks or water,
  // follow an A* path over the arena's nav grid instead (re-planned every NAV.repath s); a stuck enemy side-steps
  steer(e, inp, goal, dt) {
    if (inp.move.lengthSq() < 0.01 || MOVES[e.f.act]) return;
    const f = e.f, N = e.nav || (e.nav = { t: 0, path: null, stuck: 0, last: f.pos.clone(), side: 1, det: 0 }), d = Math.hypot(goal.x - f.pos.x, goal.z - f.pos.z);
    N.t -= dt;
    if (N.t <= 0) { N.t = NAV.repath; _a.set(f.pos.x, f.pos.y + 1, f.pos.z); _b.set(goal.x, f.pos.y + 1, goal.z);
      N.path = d > NAV.near && (this.W.los(_a, _b, 0.6).blocked || (this.W.water && this.W.inWater((f.pos.x + goal.x) / 2, (f.pos.z + goal.z) / 2))) ? this.W.findPath(f.pos, goal) : null; }
    if (N.path && N.path.length) {
      while (N.path.length > 1 && Math.hypot(N.path[0].x - f.pos.x, N.path[0].z - f.pos.z) < 1.1) N.path.shift();
      const q = N.path[0], qx = q.x - f.pos.x, qz = q.z - f.pos.z, qd = Math.hypot(qx, qz) || 1; inp.move.set(qx / qd, 0, qz / qd);
    }
    if ((N.stuck += dt) > 1) { if (f.pos.distanceTo(N.last) < 0.35) { N.det = 0.7; N.side = -N.side; N.t = 0; } N.stuck = 0; N.last.copy(f.pos); }
    if (N.det > 0) { N.det -= dt; inp.move.applyAxisAngle(_up, N.side * 1.2); }
  }
  players() { const a = [this.c.G.me]; if (this.mate) a.push(this.mate); return a; }
  alivePlayers() { return this.players().filter(p => !p.dead && !p.downed); }
  // ================= director: targets, attack tokens, roles, anchors =================
  direct() {
    const pl = this.alivePlayers(); if (!pl.length) { for (const e of this.enemies.values()) if (e.ai) { e.ai.allowAttack = false; e.ai.anchor = null; } return; }
    const live = [...this.enemies.values()].filter(e => !e.f.dead && e.ai);
    // targets: nearest player, but balance the load between two players
    const load = new Map(pl.map(p => [p, 0]));
    for (const e of live.sort((a, b) => (a.T.boss ? -1 : 0) - (b.T.boss ? -1 : 0))) {
      let best = null, bs = 1e9;
      for (const p of pl) { const d = Math.hypot(p.pos.x - e.f.pos.x, p.pos.z - e.f.pos.z), s = d + load.get(p) * 3 + (e.target === p ? -2 : 0); if (s < bs) { bs = s; best = p; } }
      e.target = best; load.set(best, load.get(best) + (e.T.boss ? 3 : 1));
    }
    // per target: attack tokens. A token is held for one attack (plus its combo); after it the enemy cools down and the
    // next token is handed out only after a short gap, so blows come one after another instead of all at once. Those
    // without a token wait on a ring around the player, spread evenly, walking (no sprinting at the player).
    const now = this.t, D = SV.dir;
    for (const p of pl) {
      const group = live.filter(e => e.target === p).sort((a, b) => a.f.pos.distanceTo(p.pos) - b.f.pos.distanceTo(p.pos));
      const cap = SV.tokens(this.wave); let held = 0, heavyBusy = false;
      p.tokGap = p.tokGap ?? 0;
      // 1) current holders: keep the token while swinging, release it after the swing (or after holdMax) with a cooldown
      for (const e of group) {
        if (!e.tok) continue;
        const busy = !!MOVES[e.f.act]; if (busy) e.swung = true;
        if ((e.swung && !busy) || (now - e.tokAt > D.holdMax && !busy) || e.f.dead) { e.tok = false; e.swung = false; e.tokCd = now + D.cool[0] + Math.random() * (D.cool[1] - D.cool[0]); p.tokGap = now + D.gap; }
        else { held++; if (e.role === 'pressure') heavyBusy = true; }
      }
      // 2) hand out free tokens, one per gap: mini-bosses first, then the nearest (only the final boss never waits)
      const major = group.find(e => e.T.boss === 'major' && !e.f.dead), bossBusy = major && (MOVES[major.f.act] || major.abil) && major.f.pos.distanceTo(p.pos) < 6;
      for (const e of [...group].sort((a, b) => (b.T.boss ? 1 : 0) - (a.T.boss ? 1 : 0))) {
        if (e.tok || e.T.boss === 'major' || bossBusy) continue;
        if (held >= cap || now < p.tokGap || now < (e.tokCd || 0)) continue;
        if (e.role === 'pressure' && heavyBusy) continue;
        if (e.role === 'keep' && group.indexOf(e) !== 0 && held > 0) continue;   // spears poke from the line, they do not join a crowd
        e.tok = true; e.tokAt = now; e.swung = false; held++; p.tokGap = now + D.gap; if (e.role === 'pressure') heavyBusy = true;
      }
      // 3) everyone else: a slot on the waiting ring, spread evenly around the player (flankers prefer the back)
      const wait = group.filter(e => !e.tok && e.T.boss !== 'major'), k = wait.length;
      const ang = e => Math.atan2(e.f.pos.x - p.pos.x, e.f.pos.z - p.pos.z);
      wait.sort((a, b) => ang(a) - ang(b));
      const base = k ? ang(wait[0]) : 0;
      wait.forEach((e, i) => {
        let a = base + (i / Math.max(1, k)) * Math.PI * 2, r = D.ring + (i % 2) * D.ring2;
        if (e.role === 'flank') { a = Math.atan2(-p.fwd.x, -p.fwd.z) + (i % 2 ? 0.8 : -0.8); r = D.ring - 0.6; }
        else if (e.role === 'keep') r = D.ring - 0.3;
        const q = new V3(p.pos.x + Math.sin(a) * r, 0, p.pos.z + Math.cos(a) * r); this.W.bounds(q, 0.5);
        e.ai.allowAttack = false; e.ai.anchor = q; e.ai.calm = true;
      });
      for (const e of group) if (e.tok || e.T.boss === 'major') { e.ai.allowAttack = true; e.ai.anchor = null; e.ai.calm = false; }
    }
  }
  // ================= combat =================
  onStrike(att, kind, vic) {
    const c = this.c, me = c.G.me, enemyAtt = this.isEnemy(att), mul = att.dmgMul * (kind === 'heavy' ? att.heavyMul : 1) * (kind === 'counter' ? att.counterMul : 1);
    if (!enemyAtt) {   // a player hits an enemy
      const e = this.enemyOf(vic); if (!e) return;
      let tm = 1; if (this.mods.tandem) { const mk = this.tandemMarks.get(e.id); if (mk && mk.who !== att && this.t - mk.t < 2) tm = 1.3; }
      if (att === me && !this.host) { c.net.send('sv', { t: 'hit', id: e.id, kind, x: att.pos.x, z: att.pos.z, mul: mul * tm, fmul: att.fMul, pm: att.pmul * tm }); return; }
      const r = this.resolveOnEnemy(e, kind, att, mul * tm, att.fMul, att.pmul * tm);
      if (att === me) { c.showResult(r, att, vic); att.applyOutcome(r); this.afterMyHit(r, e); }
      if (this.online) c.net.send('sv', { t: 'eout', id: e.id, r, by: att === me ? 0 : 1 });
      return;
    }
    // an enemy hits a player
    if (vic === me) {
      const r = me.resolveStrike(kind, att.pos, mul, att.fMul, { pmul: att.pmul }); this.onMeStruck(r);
      c.showResult(r, att, me); att.applyOutcome(r);
      if (this.online) c.net.send('sv', { t: 'efx', id: this.enemyOf(att).id, r });
    } else if (vic === this.mate && this.host) c.net.send('sv', { t: 'strike', eid: this.enemyOf(att).id, kind, x: att.pos.x, z: att.pos.z, mul, pm: att.pmul });
  }
  resolveOnEnemy(e, kind, att, mul, fmul, pmul) {
    const f = e.f, hp0 = f.hp, r = f.resolveStrike(kind, att.pos, mul, fmul, { pmul });
    e.lastHitBy = att === this.c.G.me ? 'host' : 'guest'; this.tandemMarks.set(e.id, { who: att, t: this.t });
    r.dmg = Math.max(0, hp0 - f.hp);
    if (att === this.c.G.me) this.stats.dealt += r.dmg;
    if (f.hp <= 0 || f.dead) { r.kill = true; this.onKill(e, e.lastHitBy); }
    else this.checkPhase(e);
    return r;
  }
  afterMyHit(r, e) {
    if (r.res === 'finisher') { this.stats.deathblows++; if (this.mods.reap) this.c.G.me.hp = Math.min(this.c.G.me.maxHp, this.c.G.me.hp + this.mods.reap); }
    if (r.kill) { if (this.mods.lust) this.buffs.lust = 5; }
  }
  onMeStruck(r) {
    if (r.res === 'deflect') this.stats.deflects++;
    if (r.res === 'hit' || r.res === 'block') this.lastHitT = this.t;
    if (r.res === 'hit') this.reviveP = 0;
  }
  onKill(e, by) {
    this.stats.kills++; this.stats.byType[e.type] = (this.stats.byType[e.type] || 0) + 1;
    if (e.T.boss) { this.stats.bosses++; this.bossDeath(e); }
    if (this.host && !e.T.boss && Math.random() < ITEMS.flaskChance && this.flasks.list.size < ITEMS.flaskMax) {
      const id = this.flasks.nextId, p = e.f.pos; this.flasks.add(id, p.x, p.y, p.z); if (this.online) this.c.net.send('sv', { t: 'fl', id, x: p.x, y: p.y, z: p.z }); }
    if (by === 'host' && this.mods.lust) this.buffs.lust = 5;
    if (this.online && by === 'guest') this.c.net.send('sv', { t: 'killed', id: e.id, type: e.type });
  }
  isEnemy(f) { for (const e of this.enemies.values()) if (e.f === f) return true; return false; }
  enemyOf(f) { for (const e of this.enemies.values()) if (e.f === f) return e; return null; }
  // ================= bosses =================
  bossIntro(e) {
    const c = this.c; c.$('bossBar').style.display = 'block'; c.$('bossName').textContent = c.t('boss.' + e.type);
    c.rig.startCine({ type: 'orbit', f: e.f, ang: e.f.yaw, r: 4.5 * e.T.scale, dur: 2.6 }); c.$('title').innerHTML = `<small>${c.t(e.T.boss === 'major' ? 'sv.bossMajor' : 'sv.bossMini')}</small>${c.t('boss.' + e.type)}`; c.$('title').classList.add('show');
    this.titleT = 2.6; e.f.setAct('roar'); e.f.invuln = true; e.f.invulnT = 2.4; sfx.roar(); music.set('boss');
  }
  checkPhase(e) {
    const ph = e.T.phases; if (!ph || e.phase >= ph.length) return;
    const P = ph[e.phase]; if (e.f.hp / e.f.maxHp > P.at) return;
    e.phase++; const c = this.c;
    e.f.tempo = e.T.tempo * P.tempo; if (e.ai) { Object.assign(e.ai.P, P.ai); e.ai.P.moves = { ...e.ai.P.moves, ...(P.moves || {}) }; if (P.ai && P.ai.pattern) { e.ai.pi = 0; e.ai.combo = null; e.ai.opening = 1.2; } }
    e.f.posture = 0; e.f.setAct('roar'); e.f.invuln = true; e.f.invulnT = 1.5;
    this.shockwave(e.f.pos, 5); sfx.roar(); c.banner(e.phase === 2 ? '鬼' : '怒', '#ff4a2a', true);
    if (P.aura) this.setAura(e, P.aura);
    if (this.online) c.net.send('sv', { t: 'phase', id: e.id, phase: e.phase });
  }
  setAura(e, color) {
    const f = e.f; for (const m of f.gear.tint) { m.emissive = new THREE.Color(color); m.emissiveIntensity = 0.35; }
    e.aura = color;
  }
  shockwave(pos, r) {
    const c = this.c; c.fx.ring(new V3(pos.x, pos.y + 0.2, pos.z), r, 0.5, 0xff8040); c.fx.dust(pos, 30); c.rig.shake(0.5);
    for (const p of this.players()) { if (p.remote) continue; const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < r && d > 0.01) { p.vel.set((p.pos.x - pos.x) / d * 7, 0, (p.pos.z - pos.z) / d * 7); p.jolt = 1; } }
  }
  bossDeath(e) {
    const c = this.c; c.G.slow = 0.25; c.G.slowT = 1.6; c.fx.finisher(e.f.hitPoint, new V3(0, 1, 0)); c.fx.ring(e.f.pos.clone().setY(e.f.pos.y + 0.3), 7, 1, 0xffd27a);
    this.shockwave(e.f.pos, 4); sfx.victory(); c.banner('討', '#ffd870', true); c.$('bossBar').style.display = 'none';
    c.rig.startCine({ type: 'orbit', f: e.f, ang: c.rig.yaw, r: 5, dur: 2.4 });
    const coins = e.T.boss === 'major' ? 200 : 90; c.addCoins(coins); c.ach.add('bossKills'); this.res += 1; this.bossReward = true;
  }
  // ================= frame =================
  step(dt, rawDt, live) {
    const c = this.c, G = c.G, me = G.me;
    this.t += dt; this.phaseT += rawDt; this.stats.time += rawDt;
    if (!this.over) { battle.start(); if (this.phase === 'fight' || this.wave > 1) battle.drop(); }   // fight music: intro while wave 1 gathers, then the drive
    if (this.titleT > 0 && (this.titleT -= rawDt) <= 0) c.$('title').classList.remove('show');
    // target: chosen by the player via lock-on
    const alive = [...this.enemies.values()].filter(e => !e.f.dead);
    G.targets = alive.map(e => e.f); const tgt = c.pickTarget(G.targets);   // the player picks (main.js: mouse sweep while locked)
    this.lockF = tgt || null; G.opp = this.lockF || G.dummy; G.targets = alive.map(e => e.f);
    c.inp.lock = G.lock && !!this.lockF;
    this.buffs.lust = Math.max(0, this.buffs.lust - rawDt); this.buffs.guardian = Math.max(0, this.buffs.guardian - rawDt); this.applyBuffs();
    // local player
    let myInp = live && !me.dead && !me.downed ? c.inp : c.noInput;
    if (G.auto && live && this.lockF && !me.downed) { G.auto.f = me; myInp = G.auto.think(dt, this.lockF); for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump']) if (myInp[k]) myInp[k] = Math.max(0, myInp[k] - dt); }   // test harness
    me.update(dt, myInp, this.lockF || null);
    c.fighterEvents(me);
    if (this.mate) { this.mate.update(dt, null, me); c.fighterEvents(this.mate); }
    // enemies
    if (this.host) this.hostStep(dt, rawDt); else for (const e of this.enemies.values()) { e.f.update(dt, null, e.f.lastTgt || me); c.fighterEvents(e.f); }
    for (const e of this.enemies.values()) if (e.f.act === 'flameSweep' && e.f.inActive() && e.f.bladeTip) { c.fx.spark(e.f.bladeTip, 6, 2.5, 0xff7a20, 0.5, new V3(0, 1, 0), 0.5, -1); c.fx.puff(e.f.bladeTip.clone().setY(e.f.pos.y + 0.1), 2, 0.5, 0xff5a10, 0.6, 1, 0.8); }
    this.items(rawDt, live);
    this.abil.update(dt);
    this.separate();
    this.rescue(rawDt);
    this.downedFlow(rawDt);
    this.hud();
    c.arena.follow(me.pos); this.weather.update(rawDt, this.W.wind);
    if (this.weather.kind === 'wind') this.W.wind.set(2.5, 0, 1.2); else this.W.wind.set(0.6, 0, 0.3);
  }
  hostStep(dt, rawDt) {
    const c = this.c;
    if ((this.dirT = (this.dirT || 0) - rawDt) <= 0) { this.dirT = 0.4; this.direct(); }
    for (const e of [...this.enemies.values()]) {
      const f = e.f;
      if (f.dead) { e.deadT += rawDt; if (e.deadT > SV.removeAfter) this.removeEnemy(e); f.update(dt, null, null); continue; }
      const tgt = e.target && !e.target.dead && !e.target.downed ? e.target : this.alivePlayers()[0];
      const inp = tgt && this.phase !== 'over' ? (this.abil.step(e, dt, tgt) ? c.noInput : e.ai.think(dt, tgt)) : c.noInput;   // a boss busy with an ability (or holding after a Hook Pull) does not attack
      if (inp !== c.noInput && tgt) this.steer(e, inp, e.ai.anchor || tgt.pos, dt);
      f.update(dt, inp, tgt || null); f.lastTgt = tgt;
      for (const k of ['light', 'heavy', 'dodge', 'finisher', 'jump']) if (inp[k]) inp[k] = Math.max(0, inp[k] - dt);
      c.fighterEvents(f);
    }
    // waves
    if (this.phase === 'intro' && this.phaseT > SV.introTime) { this.phase = 'fight'; this.phaseT = 0; }
    else if (this.phase === 'fight') {
      const aliveN = [...this.enemies.values()].filter(e => !e.f.dead).length;
      this.spawnT -= rawDt;
      if (this.queue.length && this.spawnT <= 0 && aliveN < SV.maxAlive + (this.online ? 1 : 0)) {
        const at = pick(this.W.spawns), n = Math.min(this.queue.length, Math.round(rnd(...SV.groupSize)));
        for (let i = 0; i < n; i++) this.spawnEnemy(this.queue.shift(), at, (this.qSkill || []).shift());
        this.spawnT = rnd(...SV.spawnGap);
      }
      if (!this.queue.length && aliveN === 0 && this.enemies.size === 0) { this.phase = 'clear'; this.phaseT = 0; this.waveCleared(); }
    } else if (this.phase === 'clear' && this.phaseT > SV.clearPause) { this.phase = 'pick'; this.phaseT = 0; this.openPicks(); if (this.online) c.net.send('sv', { t: 'pick' }); }
    else if (this.phase === 'pick' && ((this.picked.me && (!this.mate || this.picked.mate || !this.c.net.connected)) || this.phaseT > SV.pickTime)) { this.closePicks(); this.picked = { me: false, mate: false }; this.beginWave(this.wave + 1); }
    // stream enemy state
    if (this.online && (this.netT -= rawDt) <= 0) {
      this.netT = SV.netRate;
      c.net.send('sv', { t: 'es', l: [...this.enemies.values()].map(e => { const f = e.f; return [e.id, +f.pos.x.toFixed(2), +f.pos.z.toFixed(2), +f.yaw.toFixed(3), f.act, +f.t.toFixed(3), f.seq, Math.round(f.hp), Math.round(f.posture), f.guard ? 1 : 0, +(f.visYawT || 0).toFixed(2), e.target === this.mate ? 1 : 0]; }), ph: this.phase, w: this.wave, q: this.queue.length });
    }
  }
  waveCleared() {
    const c = this.c; this.stats.waves = this.wave; music.set('explore'); c.banner('勝', '#ffd870', true); sfx.victory();
    const me = c.G.me; if (this.mods.mend && !me.downed && !me.dead) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * this.mods.mend);
    if (this.online) c.net.send('sv', { t: 'clear', n: this.wave });
    const best = c.REC.svBest || {}; if (this.wave > (best[this.p.map] || 0)) { best[this.p.map] = this.wave; c.REC.svBest = best; c.saveRec(); }
    c.addCoins(10 + this.wave * 4);
    c.ach.max('svWave', this.wave);
    if (this.wave >= SV.final) { this.clearReward(); setTimeout(() => this.end(c.t('sv.victory')), 1500); }   // run complete
  }
  // all ten waves survived (host and co-op partner alike): Oni's Bane, gems by difficulty (SV_GEMS), clear feats
  clearReward() {
    const c = this.c; if (this.paid) return; this.paid = true;
    c.ach.max('svCleared', 1); c.REC.svCleared = true; if (!c.REC.weapons.includes('onisbane')) { c.REC.weapons.push('onisbane'); c.toast(c.t('sv.reward')); }
    const hard = this.p.diff === 'hard'; this.gemsWon = c.addGems(hard ? SV_GEMS.hard : SV_GEMS.normal);
    if (hard) c.ach.add('svHard'); if (this.online) c.ach.add('svCoop'); c.saveRec();
  }
  removeEnemy(e) {
    this.enemies.delete(e.id); e.f.dispose();
    if (this.online && this.host) this.c.net.send('sv', { t: 'erem', id: e.id });
  }
  separate() {   // keep bodies apart (enemies among themselves and around players)
    const all = [...this.enemies.values()].filter(e => !e.f.dead).map(e => e.f).concat(this.players().filter(p => !p.remote));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; if (a.act === 'deathblow' || b.act === 'deathblow') continue;
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz), m = 0.42 * (a.scaleF + b.scaleF);
      if (d < m && d > 1e-4) { const k = (m - d) / d * 0.5; const ar = !a.remote, br = !b.remote && this.host || (!b.remote && b === this.c.G.me);
        if (ar) { a.pos.x += dx * k; a.pos.z += dz * k; } if (br) { b.pos.x -= dx * k; b.pos.z -= dz * k; } }
    }
  }
  // ================= rescue / downed =================
  rescue(dt) {
    const c = this.c, me = c.G.me, m = this.mate, pr = c.$('prompt');
    if (!m || !m.downed || me.downed || me.dead) { this.reviveP = 0; if (!me.downed) pr.style.display = 'none'; return; }
    const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
    if (d > SV.reviveRange) { this.reviveP = 0; pr.style.display = 'block'; setH(pr, c.t('sv.mateDown', { s: Math.ceil(m.bleed) })); return; }
    const holding = c.isDown('interact') && me.act === 'idle';
    if (holding && this.t - this.lastHitT > 0.3) { this.reviveP += dt * (1 + (this.mods.revive || 0)); me.locoV.set(0, 0, 0); }
    else if (!holding) this.reviveP = Math.max(0, this.reviveP - dt * 2);
    pr.style.display = 'block'; pr.innerHTML = c.t('sv.hold', { k: c.keyOf('interact') }) + `<div class="bar"><i style="width:${Math.min(100, this.reviveP / SV.reviveTime * 100)}%"></i></div>`;
    if (this.reviveP >= SV.reviveTime) {
      this.reviveP = 0; this.stats.rescues++; c.net.send('sv', { t: 'raise', frac: SV.riseHp + (this.mods.revive ? 0.15 : 0) }); sfx.revive2();
      if (this.mods.guardian) this.buffs.guardian = 6; c.toast(c.t('sv.rescued'));
    }
  }
  downedFlow(dt) {
    const c = this.c, me = c.G.me, pr = c.$('prompt');
    if (me.downed) {
      if (this.mods.phoenix && !this.phoenixUsed && (this.phT = (this.phT || 0) + dt) > 2.5) { this.phoenixUsed = true; this.phT = 0; me.rise(0.5); c.fx.revive(me.pos.clone().setY(me.pos.y + 1)); c.banner('不死', '#ffb070', true); return; }
      pr.style.display = 'block';
      if (!this.online) {   // solo: a limited number of resurrections, otherwise the run ends
        pr.innerHTML = this.res > 0 ? c.t('sv.resurrect', { k: c.keyOf('interact'), n: this.res }) : c.t('sv.fallen');
        if (this.res > 0 && c.isDown('interact')) { this.res--; me.rise(0.5); c.fx.revive(me.pos.clone().setY(me.pos.y + 1)); sfx.revive(); c.banner('回生', '#ffd27a', true); }
      } else pr.innerHTML = c.t('sv.downed', { s: Math.ceil(me.bleed) });
    }
    // run over: every player down or dead (host decides; solo: no resurrections left after a short grace)
    if (this.host && !this.over && this.phase !== 'over') {
      const pl = this.players(), allOut = pl.every(p => p.dead || p.downed);
      if (allOut) { this.outT = (this.outT || 0) + dt; if (this.outT > (this.online ? 1.5 : this.res > 0 ? 9e9 : 2.5)) this.end(); } else this.outT = 0;
      if (!this.online && me.dead) this.end();
    }
  }
  // ================= upgrades =================
  offer() {
    const have = id => this.picks.filter(x => x === id).length, luck = Math.min(0.5, this.wave * 0.02) + (this.bossReward ? 0.5 : 0);
    const pool = UPG.filter(u => have(u.id) < u.max && (this.online || !u.team));   // team upgrades only in co-op
    const out = [];
    for (let k = 0; k < 3 && pool.length; k++) {
      const w = RARITY_W.map((x, i) => x * (1 + luck * i * 1.5)); let s = w.reduce((a, b) => a + b), r = Math.random() * s, rar = 0; for (; rar < 4; rar++) { r -= w[rar]; if (r <= 0) break; }
      const cand = pool.filter(u => R[u.r] === Math.min(3, rar) && !out.includes(u)); const u = cand.length ? pick(cand) : pick(pool.filter(u => !out.includes(u))); if (u) out.push(u);
    }
    this.bossReward = false; return out;
  }
  openPicks() {
    const c = this.c, list = c.$('upList'), opts = this.offer(); list.innerHTML = '';
    document.exitPointerLock && document.exitPointerLock();
    for (const u of opts) { const b = document.createElement('button'); b.className = 'perk rar-' + u.r; b.innerHTML = `<small>${c.t('rar.' + u.r)}${u.team ? ' · ' + c.t('rar.team') : ''}</small><b>${c.t('up.' + u.id)}</b><span>${c.t('up.' + u.id + '.d')}</span>`; b.onclick = () => this.choose(u); list.appendChild(b); }
    const sk = document.createElement('button'); sk.className = 'back'; sk.textContent = c.t('sv.skip'); sk.onclick = () => this.choose(null); list.appendChild(sk);
    c.$('upInfo').innerHTML = this.buildText(); c.$('upgrades').classList.remove('hidden'); this.pickOpen = true;
  }
  buildText() { const c = this.c, cnt = {}; for (const id of this.picks) cnt[id] = (cnt[id] || 0) + 1; return c.t('sv.wave', { n: this.wave }) + ' ✓ · ' + (Object.keys(cnt).length ? Object.entries(cnt).map(([k, n]) => c.t('up.' + k) + (n > 1 ? ' ×' + n : '')).join(', ') : c.t('sv.noUp')); }
  choose(u) {
    const c = this.c; if (!this.pickOpen) return; this.pickOpen = false; c.$('upgrades').classList.add('hidden'); c.tryLock(); sfx.ui();
    if (u) { this.picks.push(u.id); this.applyMods(); if (u.k.teamheal) { const me = c.G.me; me.hp = Math.min(me.maxHp, me.hp + me.maxHp * u.k.teamheal); if (this.online) c.net.send('sv', { t: 'teamheal', frac: u.k.teamheal }); } }
    this.picked.me = true; if (this.online && !this.host) c.net.send('sv', { t: 'picked' });
    c.toast(c.t('sv.waitMate'));
  }
  closePicks() { if (this.pickOpen) this.choose(null); this.c.$('upgrades').classList.add('hidden'); }
  applyMods() {
    const m = {}; for (const id of this.picks) { const u = UPG.find(x => x.id === id); for (const k in u.k) m[k] = (m[k] || 0) + u.k[k]; }
    this.mods = m; const f = this.c.G.me;
    const hp0 = f.maxHp; f.maxHp = 100 + (m.hp || 0); if (f.maxHp > hp0) f.hp += f.maxHp - hp0;
    f.parryWin = 0.2 + (m.parry || 0); f.deflMul = 1 + (m.defl || 0); f.cancelMul = 1 + (m.cancel || 0); f.dmgTaken = Math.max(0.5, 1 + (m.taken || 0)); f.postRegen = 1 + (m.regen || 0);
    f.blockMul = 1 + (m.block || 0); f.heavyMul = 1 + (m.heavy || 0); f.counterMul = 1 + (m.counter || 0); f.quickDodge = !!m.dodge; f.iExtra = m.dodge ? 0.06 : 0;
    this.applyBuffs();
  }
  applyBuffs() {
    const f = this.c.G.me, m = this.mods; let dmg = 1 + (m.dmg || 0), pm = 1 + (m.pmul || 0), spd = 1, taken = Math.max(0.5, 1 + (m.taken || 0));
    if (this.buffs.lust > 0) { dmg *= 1.25; spd *= 1.15; }
    if (this.buffs.guardian > 0) { dmg *= 1.4; taken *= 0.7; }
    if (m.bond && this.mate && !this.mate.downed && this.mate.pos.distanceTo(f.pos) < 6) { dmg *= 1.15; f.postRegen = (1 + (m.regen || 0)) * 1.25; }
    f.dmgMul = dmg; f.pmul = pm; f.speedMul = spd; f.dmgTaken = taken;
  }
  // ================= networking =================
  bindNet() {
    const c = this.c, net = c.net, G = c.G;
    net.on('state', s => { if (this.mate) { this.mate.setRemote(s); } });
    net.on('sv', m => this.onMsg(m));
    net.on('peerleft', d => {
      if (this.over) return;
      if (this.host) { c.toast(c.t('net.mateLeft')); if (this.mate) { this.mate.group.visible = false; this.mate.katana.visible = false; this.mateGone = true; this.mate.dead = true; } }
      else if (d && d.grace) { c.toast(c.t('net.waiting', { s: d.grace })); } else this.end(c.t('net.hostLeft'));
    });
    net.on('peergone', () => { if (!this.host && !this.over) this.end(c.t('net.hostLeft')); });
    net.on('peerback', () => { c.toast(c.t('net.back')); if (this.mate) { this.mate.group.visible = true; this.mate.katana.visible = true; this.mate.dead = false; this.mateGone = false; } if (this.host) this.sendSync(); });
  }
  sendSync() {
    const c = this.c; c.net.send('sv', { t: 'sync', wave: this.wave, phase: this.phase, enemies: [...this.enemies.values()].filter(e => !e.f.dead).map(e => ({ id: e.id, type: e.type, x: e.f.pos.x, z: e.f.pos.z, yaw: e.f.yaw, hp: e.f.maxHp, cur: e.f.hp, dk: e.f.dmgMul / e.T.dmg, tempo: e.f.tempo, phase: e.phase })), weather: this.weather.kind });
  }
  onMsg(m) {
    const c = this.c, G = c.G, me = G.me;
    switch (m.t) {
      case 'fl': this.flasks.add(m.id, m.x, m.y, m.z); break;
      case 'ab': this.abil.onMsg(m); break;
      case 'abr': this.abil.onResult(m); break;
      case 'flt': this.flasks.remove(m.id); break;
      case 'shu': { const tg = m.tid != null ? (this.enemies.get(m.tid) || {}).f : null; if (tg && this.mate) this.shuris.push(new Shuriken(c.scene, this.mate.hitPoint, tg, null, true)); break; }
      // ---- guest side ----
      case 'wave': this.c.fx.clearStains(); this.healUp(); this.wave = m.n; this.phase = 'intro'; this.weather.set(m.weather); this.respawnDead(); c.banner(m.boss ? '首' : '波', m.boss ? '#ff5a3a' : '#e8dcc4', true); c.toast(c.t('sv.wave', { n: m.n })); sfx.wave(); music.set(m.boss ? 'boss' : 'combat'); this.closePicks(); break;
      case 'spawn': { if (this.enemies.has(m.id)) break; const e = this.makeEnemy(m.id, m.type, m.x, m.z, m.yaw, m.hp, m.dk, m.tempo); if (e.T.boss) this.bossIntro(e); break; }
      case 'es': this.phase = m.ph; this.wave = m.w; this.queueLeft = m.q;
        for (const a of m.l) { const e = this.enemies.get(a[0]); if (!e) continue; const f = e.f; f.setRemote({ x: a[1], z: a[2], yaw: a[3], act: a[4], t: a[5], seq: a[6], hp: a[7], po: a[8], g: a[9], vy: a[10], lv: 1 }); f.lastTgt = a[11] ? me : this.mate; if (a[4] === 'die' || a[4] === 'dieFwd') f.dead = true; }
        break;
      case 'erem': { const e = this.enemies.get(m.id); if (e) { this.enemies.delete(m.id); e.f.dispose(); } break; }
      case 'eout': { const e = this.enemies.get(m.id); if (!e) break; if (m.by === 1) { c.showResult(m.r, me, e.f); me.applyOutcome(m.r); if (m.r.dmg) this.stats.dealt += m.r.dmg; this.afterMyHit(m.r, e); } else if (this.mate) c.showResult(m.r, this.mate, e.f); if (m.r.kill) { e.f.dead = true; this.stats.kills++; } break; }
      case 'efx': { const e = this.enemies.get(m.id); if (e && this.mate) c.showResult(m.r, e.f, this.mate); break; }
      case 'strike': { const e = this.enemies.get(m.eid); if (!e) break; const r = me.resolveStrike(m.kind, { x: m.x, z: m.z }, m.mul, 1, { pmul: m.pm }); this.onMeStruck(r); c.showResult(r, e.f, me); c.net.send('sv', { t: 'sout', eid: m.eid, r }); break; }
      case 'phase': { const e = this.enemies.get(m.id); if (e) { e.phase = m.phase; const P = e.T.phases[m.phase - 1]; if (P.aura) this.setAura(e, P.aura); sfx.roar(); this.shockwave(e.f.pos, 5); c.banner(m.phase === 2 ? '鬼' : '怒', '#ff4a2a', true); } break; }
      case 'clear': this.stats.waves = m.n; { const best = c.REC.svBest || {}; if (m.n > (best[this.p.map] || 0)) { best[this.p.map] = m.n; c.REC.svBest = best; c.saveRec(); } } c.banner('勝', '#ffd870', true); music.set('explore'); { if (this.mods.mend && !me.downed && !me.dead) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * this.mods.mend); } c.addCoins(10 + m.n * 4); if (m.n >= SV.final) this.clearReward(); break;
      case 'pick': this.openPicks(); break;
      case 'killed': break;
      case 'over': this.end(null, m.stats); break;
      case 'sync': this.wave = m.wave; this.phase = m.phase; this.weather.set(m.weather); for (const s of m.enemies) if (!this.enemies.has(s.id)) { const e = this.makeEnemy(s.id, s.type, s.x, s.z, s.yaw, s.hp, s.dk, s.tempo); e.f.hp = s.cur; e.phase = s.phase; } break;
      // ---- host side ----
      case 'hit': { const e = this.enemies.get(m.id); if (!e || e.f.dead || !this.mate) break; const r = this.resolveOnEnemy(e, m.kind, this.mate, m.mul, m.fmul, m.pm); c.showResult(r, this.mate, e.f); c.net.send('sv', { t: 'eout', id: e.id, r, by: 1 }); break; }
      case 'sout': { const e = this.enemies.get(m.eid); if (e && !e.f.dead) { e.f.applyOutcome(m.r); if (this.mate) c.showResult(m.r, e.f, this.mate); } break; }
      case 'picked': this.picked.mate = true; break;
      case 'needSync': this.sendSync(); break;
      // ---- both ----
      case 'raise': if (me.downed) { me.rise(m.frac); c.fx.revive(me.pos.clone().setY(me.pos.y + 1)); sfx.revive2(); c.banner('回生', '#ffd27a', true); if (this.mods.guardian) this.buffs.guardian = 6; } break;
      case 'teamheal': if (!me.downed && !me.dead) { me.hp = Math.min(me.maxHp, me.hp + me.maxHp * m.frac); c.toast(c.t('sv.healed')); } break;
    }
  }
  breakProps(ids, local) { for (const id of ids) { const p = this.W.breakProp(id, this.c.fx); if (p) { sfx[p.kind === 'lantern' ? 'breakPaper' : 'breakWood'](); if (local && this.online) this.c.net.send('sv', { t: 'prop', id }); } } }
  // ================= HUD =================
  // ================= items: flasks on the ground, the shuriken =================
  items(dt, live) {
    const c = this.c, me = c.G.me, alive = !me.dead && !me.downed;
    const got = this.flasks.update(dt, alive ? me.pos : null);
    if (got != null) { me.hp = Math.min(me.maxHp, me.hp + me.maxHp * ITEMS.flaskHeal); this.flasks.remove(got); sfx.revive2(); c.fx.puff(me.pos.clone().setY(me.pos.y + 1), 14, 1.2, 0xffc070, 0.6, 1, 0.1, -1); c.toast(c.t('sv.flask'));
      c.ach.add('flasks'); if (this.online) c.net.send('sv', { t: 'flt', id: got }); }
    this.shuriCd = Math.max(0, this.shuriCd - dt);
    if (c.inp.shuriken > 0) { c.inp.shuriken = 0;
      if (!live || !alive) {}
      else if (this.shuriCd > 0) c.toast(c.t('sv.shuriCd', { s: Math.ceil(this.shuriCd) }));
      else if (!c.inp.lock || !this.lockF || this.lockF.dead) c.toast(c.t('sv.shuriNoTgt'));   // only the locked (Focus) target, never a soft auto-pick   // no lock: no throw (never a random target)
      else { const e = this.enemyOf(this.lockF), from = me.hitPoint.clone().addScaledVector(me.fwd, 0.4);
        const s = new Shuriken(c.scene, from, this.lockF, (a, b) => this.W.los(a, b)); s.eid = e && e.id; this.shuris.push(s); this.shuriCd = ITEMS.shuriCd; sfx.at('swing', 0, 0.5);
        if (this.online && e) c.net.send('sv', { t: 'shu', tid: e.id }); } }
    for (const s of this.shuris) {
      const r = s.update(dt); if (!r) continue;
      if (r === 'wall') { sfx.pebble(); c.fx.spark(s.m.position.clone(), 6, 2, 0xd0c8b0, 0.3); }
      if (r === 'hit' && !s.visual) { const e = this.enemies.get(s.eid); if (e && !e.f.dead) { c.ach.add('shurikenHits'); this.onStrike(me, 'shuriken', e.f); } }
    }
    this.shuris = this.shuris.filter(s => !s.done);
  }
  hud() {
    const c = this.c, me = c.G.me, alive = [...this.enemies.values()].filter(e => !e.f.dead);
    const left = alive.length + (this.host ? this.queue.length : (this.queueLeft || 0));
    const le = this.lockF && this.enemyOf(this.lockF); c.$('oppBars').style.opacity = le && !le.T.boss ? 1 : 0; if (le) c.$('oppName').textContent = c.t('en.' + le.type);
    setH(c.$('waveInfo'), `<b>${c.t('sv.waveN', { n: this.wave })}</b><span>${this.phase === 'pick' ? c.t('sv.choosing') : this.phase === 'clear' ? c.t('sv.cleared') : c.t('sv.left', { n: left })}</span>`);
    // partner card
    if (this.mate) { const m = this.mate, st = this.mateGone ? c.t('net.offline') : m.dead ? c.t('sv.dead') : m.downed ? c.t('sv.down', { s: Math.ceil(m.bleed) }) : ''; c.$('mateHp').style.width = Math.max(0, m.hp / m.maxHp * 100) + '%'; c.$('mateSt').textContent = st; c.$('mateCard').classList.toggle('down', m.downed || m.dead); }
    // boss bar
    const boss = alive.find(e => e.T.boss);
    if (boss) { c.$('bossBar').style.display = 'block'; c.$('bossHp').style.width = boss.f.hp / boss.f.maxHp * 100 + '%'; c.$('bossPost').style.transform = `translateX(-50%) scaleX(${Math.min(1, boss.f.posture / boss.f.maxPosture)})`; } else c.$('bossBar').style.display = 'none';
    // small bars over nearby enemies
    const box = c.$('ebars'); let i = 0;
    for (const e of alive) {
      if (e.T.boss || e.f.pos.distanceTo(me.pos) > 16) continue;
      const p = new V3(e.f.pos.x, e.f.pos.y + 2.1 * e.f.scaleF, e.f.pos.z).project(c.camera); if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      let el = box.children[i]; if (!el) { el = document.createElement('div'); el.innerHTML = '<i class="h"></i><i class="p"></i>'; box.appendChild(el); }
      el.style.display = 'block'; el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px';
      el.className = e.f === this.lockF ? 'lk' : ''; el.children[0].style.width = e.f.hp / e.f.maxHp * 100 + '%'; el.children[1].style.width = Math.min(1, e.f.posture / e.f.maxPosture) * 100 + '%';
      i++;
    }
    for (; i < box.children.length; i++) box.children[i].style.display = 'none';
  }
  // ================= end =================
  end(note, remoteStats) {
    if (this.over) return; battle.stop(); const c = this.c; this.over = true; this.phase = 'over'; c.G.over = true; c.G.phase = 'end'; music.set('off');
    if (this.host && this.online) c.net.send('sv', { t: 'over', stats: { waves: this.stats.waves, kills: this.stats.kills } });
    const s = this.stats; if (remoteStats) { s.waves = remoteStats.waves; s.teamKills = remoteStats.kills; }
    c.banner('終', '#e8dcc4', true);
    const best = (c.REC.svBest || {})[this.p.map] || 0;
    const coins = 20 + s.waves * 12; c.addCoins(coins); c.ach.add('matches');
    const fmt = x => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
    setTimeout(() => {
      if (c.G.mode !== 'survival') return; document.exitPointerLock && document.exitPointerLock(); this.closePicks();
      c.$('resBig').textContent = c.t('sv.over'); c.$('resBig').className = 'lose';
      const by = Object.entries(s.byType).map(([k, n]) => `${c.t('en.' + k)} ${n}`).join(' · ') || '—';
      c.$('resSub').innerHTML = (note ? note + '<br>' : '') + `<table class="stats">
        <tr><td>${c.t('sv.wavesDone')}</td><td>${s.waves} (${c.t('sv.best')} ${best})</td></tr><tr><td>${c.t('sv.kills')}</td><td>${s.teamKills ?? s.kills}</td></tr>
        <tr><td>${c.t('sv.byType')}</td><td>${by}</td></tr><tr><td>${c.t('sv.bosses')}</td><td>${s.bosses}</td></tr>
        <tr><td>${c.t('st.parry')}</td><td>${s.deflects}</td></tr><tr><td>${c.t('sv.deathblows')}</td><td>${s.deathblows}</td></tr>
        <tr><td>${c.t('sv.rescues')}</td><td>${s.rescues}</td></tr><tr><td>${c.t('st.dealt')}</td><td>${Math.round(s.dealt)}</td></tr><tr><td>${c.t('st.time')}</td><td>${fmt(s.time)}</td></tr></table>${c.payLine(coins, this.gemsWon || 0)}`;
      c.$('result').classList.remove('hidden'); c.$('bRematch').textContent = c.t('sv.again');
    }, 2600);
  }
  requestRematch() { this.c.$('result').classList.add('hidden'); this.c.restartMode(); }
  dispose() {
    battle.stop(); const c = this.c; this.flasks.clear(); this.abil.clear(); for (const s of this.shuris) if (!s.done) s.finish(); this.shuris = []; for (const e of this.enemies.values()) e.f.dispose(); this.enemies.clear(); if (this.mate) { this.mate.dispose(); this.mate = null; }
    document.body.classList.remove('surv'); c.$('ebars').innerHTML = ''; c.$('bossBar').style.display = 'none'; c.$('prompt').style.display = 'none'; c.$('upgrades').classList.add('hidden');
    music.set('off'); c.G.targets = null; const o = c.G.dummy || c.G.opp; o.group.visible = true; o.katana.visible = true; o.dead = false; c.G.opp = o;
  }
}
