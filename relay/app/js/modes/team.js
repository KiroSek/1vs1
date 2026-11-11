// TEAM 2 vs 2. Four slots, team = slot % 2 (0, 2 = East / blue; 1, 3 = West / red).
// Ownership mirrors the duel netcode: every human is authoritative for its own fighter (it detects its hits and resolves the
// hits it takes), the host (slot 0, or the solo player offline) owns the bots that fill empty slots and runs the rounds.
// Messages ('tm', relayed by the server with the sender slot f):
//   st {s, d}           fighter snapshot (owner -> all)           strike {a, v, kind, x, z, mul, fm, pm}  attacker -> owner of v
//   out {a, v, r}       resolved outcome (owner of v -> all)       ph {ph, n, sc, w}                       round phase (host -> all)
import * as THREE from 'three';
import { AI } from '../ai.js';
import { sfx, music } from '../audio.js';

const V3 = THREE.Vector3;
export const TM = {
  winRounds: 2,                       // first team to win 2 rounds takes the match
  intro: 2.4, post: 3.4,              // s: draw + stare-down before a round, pause after the last fighter of a team falls
  intro1: { bow: 2.8, draw: 4.4, end: 5.5 },   // first round: the teams face each other, bow together, draw (camera: my team, theirs, wide, over my shoulder)
  netRate: 1 / 22,                    // s between snapshots of owned fighters
  spawn: [[-1.7, -4.2], [-1.7, 4.2], [1.7, -4.2], [1.7, 4.2]],   // per slot: team A at -z, team B at +z
  colors: [0x4aa3ff, 0xff5a4a], css: ['#4aa3ff', '#ff5a4a'],
  botLooks: [[['ashina', 'standard'], ['ronin', 'kuro']], [['oni', 'kuro'], ['kage', 'mortal']]],   // [team][n]
  retarget: 2.0,                      // m: a bot switches to a closer enemy only if it is this much closer
  sep: 0.42,                          // m: body radius used to keep fighters apart
};
const DECAY = ['light', 'heavy', 'dodge', 'finisher', 'jump'];

export class Team {
  constructor(ctx, opts) {
    this.c = ctx; this.o = opts; this.online = !!opts.online; this.p = opts.params || {};
    this.my = this.online ? ctx.net.slot : 0; this.host = !this.online || this.my === 0;
    this.humans = this.online ? (opts.slots || [true, true, false, false]).map(Boolean) : [true, false, false, false];
    this.F = []; this.ai = []; this.rings = []; this.netT = 0; this.score = [0, 0]; this.round = 0; this.phase = 'intro'; this.phaseT = 0;
    this.over = false; this.lockF = null; this.stats = { dealt: 0, deflects: 0, kills: 0 };
  }
  team(s) { return s % 2; }
  owned(s) { return s === this.my || (this.host && !this.humans[s]); }
  slotOf(f) { return this.F.indexOf(f); }
  enemiesOf(s) { return this.F.filter((f, i) => f && this.team(i) !== this.team(s) && !f.dead); }
  // ================= setup =================
  start() {
    const c = this.c, G = c.G;
    c.useMap(this.p.map || 'random');
    c.setLook(true, c.REC.skin, c.REC.weapon);
    G.dummy = G.opp; G.opp.group.visible = false; G.opp.katana.visible = false; G.opp.pos.set(999, 0, 999); G.opp.dead = true;
    for (let s = 0; s < 4; s++) {
      let f;
      if (s === this.my) f = G.me;
      else { const look = this.humans[s] ? (this.team(s) === this.team(this.my) ? ['ronin', 'standard'] : ['oni', 'kuro']) : TM.botLooks[this.team(s)][s >> 1];
        f = c.newFighter(look[0], look[1], this.humans[s] ? 'Player ' + (s + 1) : 'Bot'); }
      this.setupFighter(f, s); this.F[s] = f;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TM.colors[this.team(s)], transparent: true, opacity: s === this.my ? 0.35 : 0.6, depthWrite: false }));
      ring.renderOrder = 2; c.scene.add(ring); this.rings[s] = ring;
    }
    this.hudEl = document.createElement('div'); this.hudEl.id = 'teamHud';
    this.hudEl.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:26px;align-items:flex-start;font:600 13px system-ui;color:#eee;text-shadow:0 1px 3px #000;pointer-events:none;z-index:5';
    document.body.appendChild(this.hudEl);
    this.tagEl = document.createElement('div'); this.tagEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4'; document.body.appendChild(this.tagEl);
    G.lock = true; c.inp.lock = true; G.over = false; G.mode = 'team'; G.phase = 'fight';
    c.showHud(); c.$('oppBars').style.opacity = 0; c.hint('team');
    if (this.online) this.bindNet();
    if (this.host) this.newRound(1);
  }
  setupFighter(f, s) {
    f.remote = !this.owned(s); f.lives = 1; f.downable = false;
    if (this.owned(s)) {
      f.hitTargets = () => this.enemiesOf(s);
      f.onStrike = (a, k, v) => this.onStrike(a, k, v);
      if (s !== this.my) { const ai = new AI(f, this.p.bot ?? 1); this.ai[s] = ai; } else this.ai[s] = null;
    } else { f.hitTargets = () => []; f.onStrike = null; this.ai[s] = null; }
  }
  // a human left: the host takes the fighter over as a bot (keeps its health; the match goes on)
  takeOver(s) {
    if (!this.host || !this.F[s] || s === this.my) return;
    this.humans[s] = false; this.setupFighter(this.F[s], s); this.c.toast(this.c.t('tm.left', { n: s + 1 }));
  }
  // ================= rounds (host decides, everybody resets its own fighters) =================
  newRound(n) {
    this.c.fx.clearStains();   // blood of the last round is washed away
    this.round = n; this.setPhase('intro');
    if (this.online) this.c.net.send('tm', { t: 'ph', ph: 'intro', n, sc: this.score });
  }
  setPhase(ph, w) {
    const c = this.c; this.phase = ph; this.phaseT = 0;
    if (ph === 'intro') {
      const first = this.round === 1; this.introSt = first ? 0 : 2;
      for (let s = 0; s < 4; s++) if (this.owned(s)) this.respawn(s, first);
      if (first) c.rig.startCine({ type: 'teams', dur: TM.intro1.end, me: c.G.me, mine: [0, 1, 2, 3].filter(s => this.team(s) === this.team(this.my)).map(s => this.F[s]).filter(Boolean), foes: this.enemiesOf(this.my) });
      c.$('title').innerHTML = `<small>${c.t('tm.round', { n: this.round })}</small><b style="color:${TM.css[0]}">${this.score[0]}</b> : <b style="color:${TM.css[1]}">${this.score[1]}</b>`; c.$('title').classList.add('show');
      if (!first) c.rig.snapBehind(c.G.me);
    } else if (ph === 'fight') { c.$('title').classList.remove('show'); c.banner('斬', '#fff', true); sfx.begin(); for (const f of this.F) if (f && !f.remote) f.invuln = false; }
    else if (ph === 'post') { const mine = w === this.team(this.my); c.banner(mine ? '勝' : '負', mine ? '#ffe2a0' : '#ff6060', true); }
  }
  respawn(s, ceremony = false) {
    const f = this.F[s], [x, z] = TM.spawn[s], ally = this.F[s ^ 2];
    f.spawn(x, z, this.team(s) === 0 ? 0 : Math.PI); f.lives = 1; f.hp = f.maxHp; f.posture = 0; f.dead = false;
    f.invuln = true; f.sheathed = true; f.setAct(ceremony ? 'idle' : 'draw');   // the first round draws only after the bow
    if (ally) f.target.x = x;   // no-op for owned fighters, keeps remote targets sane
  }
  hostRounds(rawDt) {
    if (this.phase === 'intro' && this.phaseT > (this.round === 1 ? TM.intro1.end : TM.intro)) { this.setPhase('fight'); if (this.online) this.c.net.send('tm', { t: 'ph', ph: 'fight', n: this.round, sc: this.score }); }
    else if (this.phase === 'fight') {
      const alive = [0, 1].map(t => this.F.filter((f, i) => f && this.team(i) === t && !f.dead).length);
      if (alive[0] === 0 || alive[1] === 0) {
        const w = alive[0] ? 0 : alive[1] ? 1 : -1; if (w >= 0) this.score[w]++;
        this.setPhase('post', w); if (this.online) this.c.net.send('tm', { t: 'ph', ph: 'post', n: this.round, sc: this.score, w });
      }
    } else if (this.phase === 'post' && this.phaseT > TM.post) {
      const champ = this.score.findIndex(v => v >= TM.winRounds);
      if (champ >= 0) { this.end(champ); if (this.online) this.c.net.send('tm', { t: 'ph', ph: 'over', n: this.round, sc: this.score, w: champ }); }
      else this.newRound(this.round + 1);
    }
  }
  // ================= frame =================
  step(dt, rawDt, live) {
    const c = this.c, G = c.G, me = G.me;
    this.phaseT += rawDt;
    if (this.phase === 'intro' && this.introSt < 2) {   // first-round ceremony on every client: all four bow, then the owned fighters draw
      if (this.introSt === 0 && this.phaseT > TM.intro1.bow) { this.introSt = 1; for (const f of this.F) if (f) f.bow(); }
      if (this.introSt === 1 && this.phaseT > TM.intro1.draw) { this.introSt = 2; for (let s = 0; s < 4; s++) if (this.F[s] && this.owned(s)) this.F[s].setAct('draw'); }
    }
    const fight = this.phase === 'fight' && !this.over;
    // my target: chosen by the player via lock-on
    const foes = this.enemiesOf(this.my);
    G.targets = foes; const tgt = c.pickTarget(foes);   // the player picks (main.js: mouse sweep while locked)
    this.lockF = tgt || null; G.opp = this.lockF || G.dummy; G.targets = foes; c.inp.lock = G.lock && !!this.lockF;
    // fighters
    for (let s = 0; s < 4; s++) {
      const f = this.F[s]; if (!f) continue;
      const near = this.enemiesOf(s).sort((a, b) => a.pos.distanceTo(f.pos) - b.pos.distanceTo(f.pos))[0] || null;
      if (s === this.my) f.update(dt, live && fight && !f.dead ? c.inp : c.noInput, this.lockF);
      else if (this.owned(s)) {
        const ai = this.ai[s]; let t = ai.tgt && !ai.tgt.dead ? ai.tgt : near;
        if (near && t !== near && near.pos.distanceTo(f.pos) + TM.retarget < t.pos.distanceTo(f.pos)) t = near;
        ai.tgt = t;
        const inp = fight && t && !f.dead ? ai.think(dt, t) : c.noInput;
        f.update(dt, inp, t || null);
        if (inp !== c.noInput) for (const k of DECAY) if (inp[k]) inp[k] = Math.max(0, inp[k] - dt);
      } else f.update(dt, null, near);
      c.fighterEvents(f);
      const r = this.rings[s]; r.position.set(f.pos.x, (f.pos.y || 0) + 0.035, f.pos.z); r.visible = !f.dead && f.group.visible;
    }
    this.separate();
    if (this.host) this.hostRounds(rawDt);
    // stream my fighters
    if (this.online && (this.netT -= rawDt) <= 0) {
      this.netT = TM.netRate;
      for (let s = 0; s < 4; s++) if (this.owned(s) && this.F[s]) { const d = this.F[s].snapshot(); if (s === this.my) d.lk = me.style + '|' + me.weapon; c.net.send('tm', { t: 'st', s, d }); }
    }
    if (me.dead && fight && !this.deadNote) { this.deadNote = true; c.toast(c.t('tm.dead')); } else if (!me.dead) this.deadNote = false;
    this.hud();
    c.arena.follow && c.arena.follow(me.pos);
  }
  separate() {
    const all = this.F.filter(f => f && !f.dead);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; if (a.act === 'deathblow' || b.act === 'deathblow') continue;
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz), m = TM.sep * (a.scaleF + b.scaleF);
      if (d < m && d > 1e-4) { const k = (m - d) / d * 0.5; if (!a.remote) { a.pos.x += dx * k; a.pos.z += dz * k; } if (!b.remote) { b.pos.x -= dx * k; b.pos.z -= dz * k; } }
    }
  }
  // ================= strikes =================
  onStrike(att, kind, vic) {
    const c = this.c, a = this.slotOf(att), v = this.slotOf(vic); if (a < 0 || v < 0 || this.team(a) === this.team(v)) return;
    const mul = att.dmgMul * (kind === 'heavy' ? att.heavyMul : 1) * (kind === 'counter' ? att.counterMul : 1);
    if (this.owned(v)) this.resolve(a, v, kind, att.pos, mul, att.fMul, att.pmul);
    else c.net.send('tm', { t: 'strike', to: v, a, v, kind, x: att.pos.x, z: att.pos.z, mul, fm: att.fMul, pm: att.pmul });
  }
  resolve(a, v, kind, from, mul, fm, pm) {
    const att = this.F[a], vic = this.F[v];
    const r = vic.resolveStrike(kind, from, mul, fm, { pmul: pm });
    this.outcome(a, v, r);
    if (this.online) this.c.net.send('tm', { t: 'out', a, v, r });
  }
  outcome(a, v, r) {   // every client: effects; the attacker's owner also applies recoil / posture to the attacker
    const att = this.F[a], vic = this.F[v]; if (!att || !vic || !r) return;
    const mine = a === this.my || v === this.my;
    this.c.showResult(r, att, vic, !mine);
    if (this.owned(a)) att.applyOutcome(r);
    if (a === this.my) { if (r.res === 'hit' || r.res === 'finisher') this.stats.dealt += r.dmg || 0; if (vic.dead || r.killed) this.stats.kills++; }
    if (v === this.my && r.res === 'deflect') this.stats.deflects++;
  }
  // ================= network =================
  bindNet() {
    const c = this.c, net = c.net;
    net.on('tm', m => this.onMsg(m));
    net.on('state', () => {});
    net.on('roster', d => { if (d && typeof d.left === 'number') this.takeOver(d.left); });
    net.on('peerleft', d => { if (d && d.self && !this.over) this.end(-1, c.t('tm.lost')); });
    net.on('disconnected', () => { if (!this.over) this.end(-1, c.t('tm.lost')); });   // my own connection dropped
    net.on('peergone', () => { if (!this.over) this.end(-1, c.t('net.hostLeft')); });
  }
  onMsg(m) {
    const c = this.c; if (!m || this.over && m.t !== 'ph') return;
    switch (m.t) {
      case 'st': { const s = m.s, f = this.F[s]; if (!f || this.owned(s)) return;
        if (m.d.lk && this.humans[s] && m.d.lk !== f.style + '|' + f.weapon && s === m.f) this.relook(s, m.d.lk);
        this.F[s].setRemote(m.d); break; }
      case 'strike': if (this.owned(m.v) && this.F[m.a]) this.resolve(m.a, m.v, m.kind, { x: m.x, z: m.z }, m.mul, m.fm, m.pm); break;
      case 'out': this.outcome(m.a, m.v, m.r); break;
      case 'ph': if (this.host) return; this.score = m.sc || this.score; this.round = m.n || this.round;
        if (m.ph === 'over') this.end(m.w); else this.setPhase(m.ph, m.w); break;
    }
  }
  relook(s, lk) {   // a remote human picked another skin / blade: rebuild that fighter
    const [st, wp] = lk.split('|'), old = this.F[s]; if (!st || !wp) return;
    let f; try { f = this.c.newFighter(st, wp, old.name); } catch (e) { return; }
    f.spawn(old.pos.x, old.pos.z, old.yaw); old.dispose(); this.F[s] = f; this.setupFighter(f, s);
  }
  // ================= HUD =================
  hud() {
    const c = this.c, T = this.F; if (!this.hudEl) return;
    const card = s => { const f = T[s]; if (!f) return ''; const w = Math.max(0, f.hp / f.maxHp * 100), pw = Math.min(100, f.posture / f.maxPosture * 100);
      const nm = s === this.my ? c.t('tm.you') : this.humans[s] ? c.t('tm.player', { n: s + 1 }) : c.t('tm.bot');
      return `<div style="width:120px;opacity:${f.dead ? 0.35 : 1}"><div>${nm}${f.dead ? ' ✝' : ''}</div><div style="height:5px;background:#0008;margin-top:3px"><div style="height:100%;width:${w}%;background:${TM.css[this.team(s)]}"></div></div><div style="height:3px;background:#0006;margin-top:2px"><div style="height:100%;width:${pw}%;background:#f0b040"></div></div></div>`; };
    const col = t => `<div style="display:flex;flex-direction:column;gap:6px">${[t, t + 2].map(card).join('')}</div>`;
    const html = `${col(0)}<div style="font:700 22px serif;padding-top:6px"><span style="color:${TM.css[0]}">${this.score[0]}</span> : <span style="color:${TM.css[1]}">${this.score[1]}</span></div>${col(1)}`;
    if (html !== this.lastHud) { this.hudEl.innerHTML = html; this.lastHud = html; }
    // name tags over the other fighters (team colour)
    let i = 0; const box = this.tagEl;
    for (let s = 0; s < 4; s++) { const f = T[s]; if (!f || s === this.my || f.dead) continue;
      const p = new V3(f.pos.x, f.pos.y + 2.15 * f.scaleF, f.pos.z).project(c.camera); if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      let el = box.children[i]; if (!el) { el = document.createElement('div'); el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:600 12px system-ui;text-shadow:0 1px 3px #000;white-space:nowrap'; box.appendChild(el); }
      el.style.display = 'block'; el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px'; el.style.color = TM.css[this.team(s)];
      el.textContent = (f === this.lockF ? '◆ ' : '') + (this.humans[s] ? c.t('tm.player', { n: s + 1 }) : c.t('tm.bot')); i++; }
    for (; i < box.children.length; i++) box.children[i].style.display = 'none';
  }
  // ================= end =================
  end(w, note) {
    if (this.over) return; const c = this.c; this.over = true; this.phase = 'over'; c.G.over = true; c.G.phase = 'end';
    const win = w === this.team(this.my); c.banner(win ? '勝' : '終', win ? '#ffe2a0' : '#e8dcc4', true);
    if (w >= 0) c.addCoins(win ? 90 : 30);
    if (win && this.online) c.ach.add('onlineWins');
    setTimeout(() => {
      if (c.G.mode !== 'team') return; document.exitPointerLock && document.exitPointerLock();
      c.$('resBig').textContent = w < 0 ? c.t('tm.ended') : win ? c.t('tm.win') : c.t('tm.lose'); c.$('resBig').className = win ? 'win' : 'lose';
      c.$('resSub').innerHTML = (note ? note + '<br>' : '') + `<b style="color:${TM.css[0]}">${this.score[0]}</b> : <b style="color:${TM.css[1]}">${this.score[1]}</b><br>${c.t('st.dealt')}: ${Math.round(this.stats.dealt)} · ${c.t('st.parry')}: ${this.stats.deflects}` + (w >= 0 ? `<br>+${win ? 90 : 30} ◎` : '');
      c.$('result').classList.remove('hidden'); c.$('bRematch').textContent = c.t('sv.again');
    }, 2200);
  }
  requestRematch() {
    this.c.$('result').classList.add('hidden');
    if (!this.online) { this.c.restartMode(); return; }
    if (this.host) { this.over = false; this.c.G.over = false; this.score = [0, 0]; this.newRound(1); } else this.c.toast(this.c.t('tm.hostRematch'));
  }
  dispose() {
    const c = this.c; for (let s = 0; s < 4; s++) { if (this.F[s] && this.F[s] !== c.G.me) this.F[s].dispose(); if (this.rings[s]) { c.scene.remove(this.rings[s]); this.rings[s].geometry.dispose(); } }
    c.G.me.hitTargets = null; c.G.me.onStrike = null;
    this.hudEl && this.hudEl.remove(); this.tagEl && this.tagEl.remove(); c.$('title').classList.remove('show');
    c.G.targets = null; const o = c.G.dummy || c.G.opp; o.group.visible = true; o.katana.visible = true; o.dead = false; c.G.opp = o;
  }
}
