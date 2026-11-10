// Move library. Animation clips: Quaternius Universal Animation Library 1+2 (CC0) + Mixamo clips (MX_*, kd_mixamo.glb), all in-place.
// Each move is a time-warped timeline over one or more clip ranges: seg = [clip, clipFrom, clipTo, gameDuration].
// Phases (game seconds from move start): hit = [activeStart, activeEnd]; cancel = time after which the next combo / dodge / guard input is accepted.
// lunge = [t0, t1, metres] forward travel; track = seconds of yaw tracking toward the target during the wind-up.
// dmg: health damage on clean hit · post: posture damage to a blocker · hitPost: posture on clean hit · deflPost: posture the ATTACKER takes when deflected.
// perilous: cannot be blocked (only deflected with exact timing or Mikiri-countered / dodged).

export const MOVES = {
  // ---- light chain LMB x1..3 (UAL Sword_Light A->B->C): each cut ends in exactly the pose the next one starts from, so
  // two or three cuts read as one movement. A cut that is not followed plays its own _Rec (back to guard) instead.
  // cancel = end of the cut proper (= start of _Rec): a queued next cut starts there, seamless.
  slash1: { segs: [['Sword_Light_A', 0, 0.14, 0.15], ['Sword_Light_A', 0.14, 0.3, 0.12], ['Sword_Light_A', 0.3, 0.37, 0.08], ['Sword_Light_A_Rec', 0, 0.5, 0.45]],
    hit: [0.15, 0.27], cancel: 0.35, next: 'slash2', track: 0.25, lunge: [0.04, 0.27, 0.8], dmg: 9, post: 14, hitPost: 8, deflPost: 22, range: 2.3, kind: 'slash', dir: 'side' },
  slash2: { segs: [['Sword_Light_B', 0, 0.17, 0.15], ['Sword_Light_B', 0.17, 0.3, 0.11], ['Sword_Light_B', 0.3, 0.43, 0.12], ['Sword_Light_B_Rec', 0, 0.57, 0.48]],
    hit: [0.15, 0.26], cancel: 0.38, next: 'slash3', track: 0.2, lunge: [0.03, 0.26, 0.8], dmg: 10, post: 15, hitPost: 9, deflPost: 24, range: 2.3, kind: 'slash', dir: 'side' },
  slash3: { segs: [['Sword_Light_C', 0, 0.4, 0.28], ['Sword_Light_C', 0.4, 0.54, 0.12], ['Sword_Light_C', 0.54, 0.87, 0.26], ['Sword_Light_C_Rec', 0, 0.7, 0.5]],
    hit: [0.28, 0.4], cancel: 0.66, next: null, track: 0.3, lunge: [0.1, 0.4, 1.3], dmg: 12, post: 18, hitPost: 11, deflPost: 28, range: 2.5, kind: 'slash', dir: 'side' },
  // ---- heavy chain E x1..3 (UAL Sword_Heavy A->B->C), same seamless rule; the third is an armoured finisher ----
  heavy: { segs: [['Sword_Heavy_A', 0, 0.35, 0.42], ['Sword_Heavy_A', 0.35, 0.53, 0.15], ['Sword_Heavy_A', 0.53, 0.73, 0.2], ['Sword_Heavy_A_Rec', 0, 1.0, 0.65]],
    hit: [0.42, 0.57], cancel: 0.77, nextHeavy: 'heavy2', track: 0.42, lunge: [0.25, 0.57, 1.3], dmg: 18, post: 32, hitPost: 16, deflPost: 34, range: 2.6, kind: 'slash', dir: 'down', armor: true, heavy: true },
  heavy2: { segs: [['Sword_Heavy_B', 0, 0.32, 0.32], ['Sword_Heavy_B', 0.32, 0.45, 0.13], ['Sword_Heavy_B', 0.45, 0.5, 0.06], ['Sword_Heavy_B_Rec', 0, 0.77, 0.55]],
    hit: [0.32, 0.45], cancel: 0.51, nextHeavy: 'heavy3', track: 0.3, lunge: [0.12, 0.45, 1.1], dmg: 16, post: 28, hitPost: 14, deflPost: 30, range: 2.6, kind: 'slash', dir: 'side', heavy: true },
  heavy3: { segs: [['Sword_Heavy_C', 0, 0.42, 0.36], ['Sword_Heavy_C', 0.42, 0.6, 0.16], ['Sword_Heavy_C', 0.6, 0.7, 0.1], ['Sword_Heavy_C_Rec', 0, 0.57, 0.5]],
    hit: [0.36, 0.52], cancel: 0.62, track: 0.32, lunge: [0.14, 0.52, 1.4], dmg: 22, post: 38, hitPost: 20, deflPost: 34, range: 2.7, kind: 'slash', dir: 'up', armor: true, heavy: true, commit: true },
  // ---- riposte after a perfect deflect: fast overhead cut ----
  counter: { segs: [['Sword_Regular_B', 0.12, 0.2, 0.08], ['Sword_Regular_B', 0.2, 0.31, 0.09], ['Sword_Regular_B', 0.31, 0.53, 0.18], ['Sword_Regular_B_Rec', 0.15, 1.03, 0.45]],
    hit: [0.08, 0.17], cancel: 0.3, next: 'slash3', track: 0.08, lunge: [0, 0.18, 1.0], dmg: 12, post: 20, hitPost: 16, deflPost: 26, range: 2.4, kind: 'slash', dir: 'down' },
  // ---- quickdraw dash: crosses ~5 m in a blink (the Jinsuke opener) ----
  dash: { segs: [['Sword_Dash', 0, 0.26, 0.5], ['Sword_Dash', 0.26, 0.42, 0.14], ['Sword_Dash', 0.42, 1.57, 0.85]],
    hit: [0.5, 0.64], cancel: 1.05, track: 0.45, lunge: [0.06, 0.32, 2.6], dmg: 13, post: 20, hitPost: 10, deflPost: 26, range: 2.4, kind: 'slash', dir: 'side', glide: true },   // AI gap-closer: the burst rides the stance-swap step
  // ---- perilous thrust (危): unblockable; deflect it exactly or step INTO it (Mikiri) ----
  thrust: { segs: [['Sword_Heavy_A', 0, 0.44, 0.75], ['Sword_Heavy_A', 0.44, 0.52, 0.12], ['Sword_Heavy_A', 0.52, 0.73, 0.26], ['Sword_Heavy_A_Rec', 0.1, 1.0, 0.55]],
    hit: [0.75, 0.87], cancel: 1.12, track: 0.66, lunge: [0.55, 0.88, 2.8], dmg: 17, post: 30, hitPost: 12, deflPost: 32, range: 2.9, kind: 'thrust', perilous: true },
  // ---- boss chain: heavy -> leaping rise -> spinning cut ----
  heavyB: { segs: [['Sword_Heavy_B', 0, 0.38, 0.3], ['Sword_Heavy_B', 0.38, 0.5, 0.12], ['Sword_Heavy_B_Rec', 0, 0.77, 0.5]],
    hit: [0.3, 0.42], cancel: 0.45, next: 'heavyC', track: 0.28, lunge: [0.1, 0.42, 1.2], dmg: 15, post: 24, hitPost: 12, deflPost: 24, range: 2.5, kind: 'slash', dir: 'down', heavy: true },
  heavyC: { segs: [['Sword_Heavy_C', 0, 0.48, 0.42], ['Sword_Heavy_C', 0.48, 0.64, 0.13], ['Sword_Heavy_C', 0.64, 0.7, 0.06], ['Sword_Heavy_C_Rec', 0, 0.57, 0.48]],
    hit: [0.42, 0.55], cancel: 0.7, track: 0.4, lunge: [0.2, 0.55, 1.4], dmg: 16, post: 26, hitPost: 12, deflPost: 26, range: 2.5, kind: 'slash', dir: 'up', heavy: true },
  // ---- leaping overhead (Heavy_D): kneel, jump, crash down ----
  // ---- leaping overhead (Mixamo jump attack): crouch, real jump, crash down ----
  leap: { segs: [['MX_JumpAttack', 0.15, 1.07, 0.62], ['MX_JumpAttack', 1.07, 1.32, 0.14], ['MX_JumpAttack', 1.32, 2.3, 0.75]],
    hit: [0.62, 0.76], cancel: 1.25, track: 0.5, lunge: [0.2, 0.7, 3.4], dmg: 20, post: 32, hitPost: 16, deflPost: 30, range: 2.7, kind: 'slash', dir: 'down', heavy: true, armor: true, commit: true, slam: 0.74 },
  // S + E: charged rising cut out of a low crouch (own clip: the rising half of Sword_Attack). Armoured; a blocked hit breaks the guard
  uppercutH: { segs: [['Sword_Attack', 0.52, 0.82, 0.5], ['Sword_Attack', 0.82, 0.96, 0.14], ['Sword_Attack', 0.96, 1.53, 0.55]],
    hit: [0.5, 0.64], cancel: 0.95, track: 0.45, lunge: [0.2, 0.6, 1.2], dmg: 16, post: 26, hitPost: 14, deflPost: 30, range: 2.5, kind: 'slash', dir: 'up', heavy: true, armor: true, breakGuard: true, commit: true },
  // perilous (AI / bosses): crushing overhead - pierces the guard (guard break), cannot be dodged, only an exact deflect stops it
  crush: { segs: [['Sword_Heavy_Combo', 2.0, 2.6, 1.0], ['Sword_Heavy_Combo', 2.6, 2.78, 0.16], ['Sword_Heavy_Combo', 2.78, 3.6, 0.8]],
    hit: [1.0, 1.16], cancel: 1.6, track: 0.85, lunge: [0.5, 1.05, 1.8], dmg: 26, post: 40, hitPost: 30, deflPost: 40, range: 2.8, kind: 'crush', dir: 'down', heavy: true, armor: true, perilous: true, commit: true, slam: 1.12 },
  // perilous grab: a low shoulder rush. Guard and deflect do nothing - dodge it, jump it or keep away
  grab: { segs: [['Shield_Dash', 0, 0.04, 0.38], ['Shield_Dash', 0.04, 0.3, 0.25], ['Shield_Dash', 0.3, 1.1, 0.6]],
    hit: [0.38, 0.6], cancel: 1.0, track: 0.38, lunge: [0.3, 0.6, 2.4], dmg: 28, post: 40, hitPost: 40, deflPost: 0, range: 1.5, kind: 'grab', perilous: true, commit: true },
  uppercut: { segs: [['Sword_UpperCut', 0, 0.2, 0.3], ['Sword_UpperCut', 0.2, 0.36, 0.12], ['Sword_UpperCut', 0.36, 0.7, 0.32], ['Sword_Light_B_Rec', 0.1, 0.57, 0.35]],
    hit: [0.3, 0.42], cancel: 0.6, track: 0.28, lunge: [0.1, 0.4, 1.0], dmg: 11, post: 15, hitPost: 8, deflPost: 18, range: 2.3, kind: 'slash', dir: 'up' },
  // ---- kick: breaks a turtling guard (no damage worth noting, big posture) ----
  kick: { segs: [['Kick', 0.1, 0.4, 0.3], ['Kick', 0.4, 0.55, 0.12], ['Kick', 0.55, 1.1, 0.45]],
    hit: [0.3, 0.42], cancel: 0.7, track: 0.28, lunge: [0.1, 0.4, 0.7], dmg: 3, post: 34, hitPost: 22, deflPost: 10, range: 1.9, kind: 'kick', perilous: true },
  // ---- Sekiro-style links ----
  // jump, then attack at the top of the arc: drive the blade into the ground (UAL Sword_GroundPound). Only around the apex,
  // long cooldown (fighter.js PACE.plunge*), so it cannot be spammed.
  plunge: { segs: [['Sword_GroundPound', 0, 0.24, 0.16], ['Sword_GroundPound', 0.24, 0.33, 0.1], ['Sword_GroundPound', 0.33, 0.6, 0.25], ['Sword_GroundPound', 0.6, 1.17, 0.35]],
    hit: [0.14, 0.3], cancel: 0.6, track: 0.12, lunge: [0, 0.22, 1.0], dmg: 14, post: 36, hitPost: 20, deflPost: 22, range: 2.6, kind: 'slash', dir: 'down', heavy: true, commit: true, slam: 0.25 },
  // jump over a sweep, jump again: kick off the attacker (posture only) and spring back
  vault: { segs: [['Kick', 0.3, 0.55, 0.18], ['Kick', 0.55, 1.1, 0.4]],
    hit: [0.06, 0.2], cancel: 0.45, track: 0.1, lunge: [9, 9, 0], dmg: 0, post: 35, hitPost: 35, deflPost: 0, range: 2.6, kind: 'vault' },
  // dodge + LMB: quick step-in cut straight out of the dodge (UAL Sword_Regular_A, entered past its wind-up)
  stepCut: { segs: [['Sword_Regular_A', 0.08, 0.18, 0.1], ['Sword_Regular_A', 0.18, 0.3, 0.12], ['Sword_Regular_A', 0.3, 0.43, 0.1], ['Sword_Regular_A_Rec', 0, 0.97, 0.55]],
    hit: [0.1, 0.22], cancel: 0.32, track: 0.08, lunge: [0, 0.22, 2.0], dmg: 10, post: 15, hitPost: 9, deflPost: 22, range: 2.5, kind: 'slash', dir: 'side' },
  // dodge + E: heavy lunging cut out of the dodge (UAL Sword_Dash)
  dashCut: { segs: [['Sword_Dash', 0, 0.24, 0.22], ['Sword_Dash', 0.24, 0.36, 0.12], ['Sword_Dash', 0.36, 0.6, 0.2], ['Sword_Dash', 0.6, 1.57, 0.55]],
    hit: [0.22, 0.34], cancel: 0.54, track: 0.2, lunge: [0.02, 0.18, 1.7], dmg: 15, post: 26, hitPost: 14, deflPost: 28, range: 2.7, kind: 'slash', dir: 'side', heavy: true, armor: true, glide: true },   // a dash: the burst rides the stance-swap step (0.05-0.15), feet planted after
  // ---- Samurai Hunt: surprise strike from cover (crouched + attack). Long, quiet wind-up: it can still be read and deflected ----
  ambush: { segs: [['Sword_Heavy_A', 0.05, 0.44, 0.5], ['Sword_Heavy_A', 0.44, 0.52, 0.12], ['Sword_Heavy_A', 0.52, 0.73, 0.24], ['Sword_Heavy_A_Rec', 0.1, 1.0, 0.5]],
    hit: [0.5, 0.62], cancel: 0.9, track: 0.45, lunge: [0.3, 0.62, 2.2], dmg: 12, post: 22, hitPost: 20, deflPost: 26, range: 2.9, kind: 'ambush', heavy: true },
  // ---- spear: quick jab with long reach ----
  // own clip (was a copy of stepCut): quick rising flick into a short diagonal down-cut
  jab: { segs: [['Sword_Light_A', 0, 0.17, 0.3], ['Sword_Light_A', 0.17, 0.31, 0.11], ['Sword_Light_A', 0.31, 0.37, 0.06], ['Sword_Light_A_Rec', 0, 0.6, 0.32]],
    hit: [0.28, 0.4], cancel: 0.52, track: 0.32, lunge: [0.2, 0.46, 0.8], dmg: 8, post: 13, hitPost: 8, deflPost: 18, range: 2.4, kind: 'jab' },
  // ---- bosses ----
  // 4-hit chain: heavy cut -> rising cut -> uppercut -> leaping crash (each link deflectable, rhythm varies)
  // boss string, three different trajectories: low-to-high diagonal (Regular C), rising cut, overhead ground slam
  boss1: { segs: [['Sword_Regular_C', 0.25, 0.6, 0.42], ['Sword_Regular_C', 0.6, 0.8, 0.16], ['Sword_Regular_C', 0.8, 1.5, 0.45]], hit: [0.42, 0.56], cancel: 0.5, next: 'boss2', track: 0.34, lunge: [0.1, 0.48, 1.4], dmg: 14, post: 22, hitPost: 12, deflPost: 16, range: 2.6, kind: 'slash', dir: 'down', heavy: true },
  boss2: { segs: [['Sword_Heavy_C', 0.1, 0.48, 0.3], ['Sword_Heavy_C', 0.48, 0.64, 0.13], ['Sword_Heavy_C_Rec', 0, 0.57, 0.4]], hit: [0.3, 0.43], cancel: 0.46, next: 'boss3', track: 0.28, lunge: [0.1, 0.43, 1.3], dmg: 14, post: 22, hitPost: 12, deflPost: 16, range: 2.6, kind: 'slash', dir: 'up', heavy: true },
  boss3: { segs: [['Sword_GroundPound', 0, 0.27, 0.48], ['Sword_GroundPound', 0.27, 0.37, 0.1], ['Sword_GroundPound', 0.37, 1.17, 0.62]], hit: [0.47, 0.6], cancel: 0.85, next: 'leap', track: 0.44, lunge: [0.15, 0.56, 1.2], dmg: 15, post: 24, hitPost: 12, deflPost: 18, range: 2.5, kind: 'slash', dir: 'down', heavy: true, slam: 0.58 },
  // perilous burning sweep (fire trail): jump it
  flameSweep: { segs: [['Sword_Heavy_B', 0, 0.38, 0.75], ['Sword_Heavy_B', 0.38, 0.5, 0.16], ['Sword_Heavy_B_Rec', 0, 0.77, 0.55]], hit: [0.72, 0.9], cancel: 1.1, track: 0.7, lunge: [0.35, 0.88, 2.4], dmg: 20, post: 30, hitPost: 18, deflPost: 30, range: 3.2, kind: 'sweep', perilous: true, dir: 'side', heavy: true },  // ---- perilous sweep (危): low ground cut. Guard, deflect and dodge don't stop it - jump over it ----
  sweep: { segs: [['Sword_Heavy_B', 0, 0.38, 0.66], ['Sword_Heavy_B', 0.38, 0.5, 0.14], ['Sword_Heavy_B_Rec', 0, 0.77, 0.6]],
    hit: [0.62, 0.78], cancel: 1.05, track: 0.6, lunge: [0.3, 0.75, 1.6], dmg: 15, post: 24, hitPost: 14, deflPost: 30, range: 2.7, kind: 'sweep', perilous: true, dir: 'side', heavy: true },
  // ---- deathblow (cinematic lunge stab and pull-out) ----
  deathblow: { segs: [['Sword_Heavy_A', 0.3, 0.45, 0.6], ['Sword_Heavy_A', 0.45, 0.52, 0.2], ['Sword_Heavy_A', 0.52, 0.73, 0.55], ['Sword_Heavy_A_Rec', 0.1, 1.0, 0.55]],
    hit: [0.72, 0.8], cancel: 1.75, track: 0, lunge: [0.45, 0.72, 0.45], kind: 'deathblow', range: 3 },
};
// Edge alignment (hasuji): roll of the blade about its own axis, relative to the base grip, so the cutting edge leads the
// swing. The clips turn the wrist differently (Mixamo vs UAL), so each attack has its own value, measured from the blade
// motion inside the hit window. The wrist eases into it during the wind-up (Fighter.attachSword). Thrusts / kicks: 0.
const EDGE = {slash1: 0.51, slash2: 0.1, slash3: 0.14, heavy: 0.34, heavy2: 0.27, heavy3: 0.04, counter: 0.17, dash: 0.13, heavyB: 0.28, heavyC: 0.1, leap: -0.06, crush: 0.14, uppercut: 0.27, plunge: 0.43, stepCut: 0.62, boss1: 0.22, boss2: 0.09, boss3: 0.43, sweep: 0.28, deathblow: -1.35, dashCut: 0.13};
for (const k in EDGE) if (MOVES[k]) MOVES[k].edge = EDGE[k];
// Body drive (coil -> release): which way the blade sweeps round the body in the hit window, measured from the clips
// (+1 = toward the fighter's left, -1 = toward the right), 'down' = vertical chop. Fighter twists the spine against it
// during the wind-up and unwinds through the cut (COIL in fighter.js). Thrusts, kicks, deathblows: none.
const SWING = { slash1: 1, slash2: -1, slash3: -1, heavy2: -1, heavy3: -1, counter: -1, dash: -1, heavyB: -1, heavyC: -1, uppercut: -1, stepCut: 1, boss1: 1, boss2: -1, sweep: -1, flameSweep: -1, heavy: 1, leap: 'down', crush: 'down', plunge: 'down', boss3: 'down', dashCut: -1 };
for (const k in SWING) if (MOVES[k]) MOVES[k].swing = SWING[k];
export const ATTACKS = new Set(Object.keys(MOVES));
export const moveDur = m => { m.warp = null; return m.segs.reduce((s, x) => s + x[3], 0); };
for (const k in MOVES) { MOVES[k].name = k; MOVES[k].dur = moveDur(MOVES[k]); }

// ---- attack time-warp (applies to MOVES only) ----
// Inside a run of consecutive segments of one clip, clip time follows a monotone cubic through the segment boundaries
// instead of straight lines, so the clip speed never jumps at a boundary. Knot slopes give the swing its shape:
//   cock   — at the strike start (hit[0]) the clip nearly stops: the wind-up settles into a readable cocked pose;
//   carry  — through the hit window the speed keeps building and carries past it (follow-through);
//   settle — the move ends slowing down into the next pose.
// Boundary times stay exact, so hit windows, cancels and AI timings are unchanged. Values are in the F9 panel (WARP).
export const WARP = { cock: 0.5, carry: 1.15, settle: 0.45 };
export function invalidateWarps() { for (const k in MOVES) MOVES[k].warp = null; }
function buildWarp(m) {
  const runs = []; let acc = 0, cur = null;
  for (const s of m.segs) {
    if (!cur || cur.clip !== s[0] || Math.abs(cur.y[cur.y.length - 1] - s[1]) > 1e-4) { cur = { clip: s[0], x: [acc], y: [s[1]] }; runs.push(cur); }
    acc += s[3]; cur.x.push(acc); cur.y.push(s[2]);
  }
  const h0 = m.hit ? m.hit[0] : -1, h1 = m.hit ? m.hit[1] : -1;
  runs.forEach((r, ri) => {
    const n = r.x.length, d = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((r.y[i + 1] - r.y[i]) / Math.max(1e-6, r.x[i + 1] - r.x[i]));
    t[0] = d[0]; t[n - 1] = ri === runs.length - 1 ? d[n - 2] * WARP.settle : d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      const a = d[i - 1], b = d[i], x = r.x[i];
      if (a * b <= 0) t[i] = 0;
      else if (Math.abs(x - h0) < 0.03) t[i] = WARP.cock * Math.min(a, b);
      else if (x > h0 && x <= h1 + 0.03) t[i] = WARP.carry * Math.max(a, b);
      else t[i] = (a + b) / 2;
    }
    for (let i = 0; i < n - 1; i++) {   // Fritsch–Carlson limit keeps clip time monotone (no backward twitch)
      if (d[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / d[i], b = t[i + 1] / d[i], q = a * a + b * b; if (q > 9) { const k = 3 / Math.sqrt(q); t[i] = k * a * d[i]; t[i + 1] = k * b * d[i]; }
    }
    r.t = t;
  });
  return runs;
}
function sampleWarp(m, tt) {
  const runs = m.warp || (m.warp = buildWarp(m));
  let r = runs[runs.length - 1]; for (const q of runs) if (tt <= q.x[q.x.length - 1]) { r = q; break; }
  const n = r.x.length; tt = Math.min(r.x[n - 1], Math.max(r.x[0], tt));
  let i = 0; while (i < n - 2 && tt > r.x[i + 1]) i++;
  const h = Math.max(1e-6, r.x[i + 1] - r.x[i]), s = (tt - r.x[i]) / h, s2 = s * s, s3 = s2 * s;
  return [r.clip, (2 * s3 - 3 * s2 + 1) * r.y[i] + (s3 - 2 * s2 + s) * h * r.t[i] + (-2 * s3 + 3 * s2) * r.y[i + 1] + (s3 - s2) * h * r.t[i + 1]];
}

// Reaction / utility clips (non-attacks). seg format identical.
export const REACT = {
  // hit reactions are picked by where the blow lands (see Fighter.resolveStrike): left / right shoulder, chest (front),
  // high / low cut, from behind, heavy knock-back, knocked down (posture nearly full) -> back on the feet with a kip-up
  hitF: { segs: [['Hit_Chest', 0, 0.33, 0.3], ['Hit_Chest', 0.33, 0.33, 0.12]] },
  hitL: { segs: [['Hit_Shoulder_L', 0, 0.53, 0.44]] },
  hitBack: { segs: [['Hit_Stomach', 0, 0.3, 0.2], ['Hit_Stomach', 0.3, 0.67, 0.4]] },
  knockdown: { segs: [['LiftAir_Fall_Impact', 0, 0.67, 0.62], ['LiftAir_Fall_Impact', 0.67, 0.67, 0.35], ['KipUp', 0.1, 1.17, 0.85]] },
  hitR: { segs: [['Hit_Shoulder_R', 0, 0.5, 0.42]] },
  hitU: { segs: [['Hit_Head', 0, 0.43, 0.4]] },
  hitD: { segs: [['Hit_Stomach', 0, 0.67, 0.48]] },
  hitHeavy: { segs: [['Hit_Stomach', 0, 0.3, 0.13], ['Hit_Stomach', 0.3, 0.42, 0.24], ['Hit_Stomach', 0.42, 0.67, 0.33]] },   // heavy blow / kick: doubled over and driven back, stays on the feet (knockdown is its own reaction)
  deflect: { segs: [['Sword_Block', 0.04, 0.3, 0.09], ['Sword_Block', 0.3, 0.42, 0.22]] },                  // defender's snap on a perfect deflect
  deflected: { segs: [['Idle_Shield_Break', 0.04, 0.3, 0.14], ['Idle_Shield_Break', 0.3, 0.45, 0.2], ['Idle_Shield_Break', 0.45, 0.62, 0.3]] },   // attacker after a deflect / clash: thrown back off the blade, arms flung, recovers
  guardBreak: { segs: [['Idle_Shield_Break', 0, 0.36, 0.5], ['Idle_Shield_Break', 0.36, 0.38, 2.6], ['Idle_Shield_Break', 0.38, 1.07, 0.7]] },
  dodgeL: { segs: [['Dodge_Left', 0.05, 0.62, 0.36], ['Dodge_Left', 0.62, 1.3, 0.3]] },
  dodgeR: { segs: [['Dodge_Right', 0.05, 0.62, 0.36], ['Dodge_Right', 0.62, 1.3, 0.3]] },
  roll: { segs: [['Roll', 0.05, 1.1, 0.62], ['Roll', 1.1, 1.47, 0.18]] },
  die: { segs: [['MX_DeathBack', 0, 2.4, 2.0]] },          // Mixamo two-handed death, falls back
  dieFwd: { segs: [['MX_DeathFwd', 0.1, 2.57, 2.1]] },     // falls forward to the knees
  jump: { segs: [['Jump_Start', 0.12, 0.45, 0.12], ['Jump_Start', 0.45, 1.25, 0.6], ['Jump_Land', 0.05, 0.75, 0.3]] },
  downed: { segs: [['IdleToLay', 0, 2.2, 1.1], ['IdleToLay', 2.2, 2.2, 9999]] },
  roar: { segs: [['Celebration', 0.2, 1.5, 1.5]] },
  revive: { segs: [['LayToIdle', 0, 1.53, 1.6]] },
  draw: { segs: [['Sword_Enter', 0, 1.3, 1.25]] },
  sheathe: { segs: [['Sword_Exit', 0, 1.3, 1.4]] },
  // grab scene: the grabber knees and kicks, the victim takes it (both run in lock-step from the same moment)
  grabHold: { segs: [['Melee_Knee', 0.1, 0.87, 0.75], ['Kick', 0.15, 1.1, 0.85]] },
  grabbed: { segs: [['Hit_Stomach', 0, 0.67, 0.75], ['Hit_Knockback', 0, 0.83, 0.85]] },
  // deathblow variants for the victim: from behind (pitched forward), last life (slow collapse to the knees)
  dbBack: { segs: [['Hit_Stomach', 0, 0.3, 0.6], ['Hit_Stomach', 0.3, 0.67, 0.9]] },
  dbVictim: { segs: [['Hit_Knockback', 0, 0.4, 0.75], ['Hit_Knockback', 0.4, 0.83, 0.75]] },
};
for (const k in REACT) REACT[k].dur = moveDur(REACT[k]);

// game time -> [clip, clipTime] along a segmented timeline
export function sample(m, t) {
  if (m.hit && MOVES[m.name || ''] === m) return sampleWarp(m, t);
  let acc = 0;
  for (const s of m.segs) {
    if (t <= acc + s[3] || s === m.segs[m.segs.length - 1]) { const u = Math.min(1, Math.max(0, (t - acc) / s[3])); return [s[0], s[1] + (s[2] - s[1]) * u]; }
    acc += s[3];
  }
}
