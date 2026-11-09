// Move library. Animation clips: Quaternius Universal Animation Library 1+2 (CC0), in-place.
// Each move is a time-warped timeline over one or more clip ranges: seg = [clip, clipFrom, clipTo, gameDuration].
// Phases (game seconds from move start): hit = [activeStart, activeEnd]; cancel = time after which the next combo / dodge / guard input is accepted.
// lunge = [t0, t1, metres] forward travel; track = seconds of yaw tracking toward the target during the wind-up.
// dmg: health damage on clean hit · post: posture damage to a blocker · hitPost: posture on clean hit · deflPost: posture the ATTACKER takes when deflected.
// perilous: cannot be blocked (only deflected with exact timing or Mikiri-countered / dodged).

export const MOVES = {
  // ---- light chain: rising cut -> overhead cut -> turning thrust-cut ----
  slash1: { segs: [['Sword_Regular_A', 0, 0.19, 0.34], ['Sword_Regular_A', 0.19, 0.31, 0.11], ['Sword_Regular_A', 0.31, 0.43, 0.16], ['Sword_Regular_A_Rec', 0.1, 0.97, 0.5]],
    hit: [0.35, 0.46], cancel: 0.5, next: 'slash2', track: 0.32, lunge: [0.12, 0.44, 1.1], dmg: 9, post: 14, hitPost: 8, deflPost: 22, range: 2.3, kind: 'slash', dir: 'up' },
  slash2: { segs: [['Sword_Regular_B', 0, 0.2, 0.24], ['Sword_Regular_B', 0.2, 0.31, 0.1], ['Sword_Regular_B', 0.31, 0.53, 0.2], ['Sword_Regular_B_Rec', 0.15, 1.03, 0.5]],
    hit: [0.25, 0.35], cancel: 0.4, next: 'slash3', track: 0.22, lunge: [0.05, 0.32, 1.0], dmg: 10, post: 15, hitPost: 9, deflPost: 24, range: 2.3, kind: 'slash', dir: 'down' },
  slash3: { segs: [['Sword_Light_C', 0.05, 0.42, 0.36], ['Sword_Light_C', 0.42, 0.6, 0.12], ['Sword_Light_C', 0.6, 0.87, 0.2], ['Sword_Light_C_Rec', 0, 0.7, 0.45]],
    hit: [0.37, 0.49], cancel: 0.62, next: null, track: 0.34, lunge: [0.1, 0.48, 1.6], dmg: 12, post: 18, hitPost: 11, deflPost: 28, range: 2.6, kind: 'slash', dir: 'side' },
  // ---- heavy: big wind-up, sweeping cut that ends in a lunge ----
  heavy: { segs: [['Sword_Heavy_C', 0, 0.48, 0.62], ['Sword_Heavy_C', 0.48, 0.64, 0.14], ['Sword_Heavy_C', 0.64, 0.7, 0.08], ['Sword_Heavy_C_Rec', 0, 0.57, 0.5]],
    hit: [0.62, 0.76], cancel: 0.92, track: 0.58, lunge: [0.3, 0.74, 1.6], dmg: 18, post: 32, hitPost: 16, deflPost: 34, range: 2.6, kind: 'slash', dir: 'up', armor: true, heavy: true },
  // ---- riposte after a perfect deflect: fast overhead cut ----
  counter: { segs: [['Sword_Regular_B', 0.12, 0.2, 0.08], ['Sword_Regular_B', 0.2, 0.31, 0.09], ['Sword_Regular_B', 0.31, 0.53, 0.18], ['Sword_Regular_B_Rec', 0.15, 1.03, 0.45]],
    hit: [0.08, 0.17], cancel: 0.3, next: 'slash3', track: 0.08, lunge: [0, 0.18, 1.0], dmg: 12, post: 20, hitPost: 16, deflPost: 26, range: 2.4, kind: 'slash', dir: 'down' },
  // ---- quickdraw dash: crosses ~5 m in a blink (the Jinsuke opener) ----
  dash: { segs: [['Sword_Dash', 0, 0.26, 0.5], ['Sword_Dash', 0.26, 0.42, 0.14], ['Sword_Dash', 0.42, 1.57, 0.85]],
    hit: [0.5, 0.64], cancel: 1.05, track: 0.45, lunge: [0.38, 0.6, 5.2], dmg: 13, post: 20, hitPost: 10, deflPost: 26, range: 2.4, kind: 'slash', dir: 'side' },
  // ---- perilous thrust (危): unblockable; deflect it exactly or step INTO it (Mikiri) ----
  thrust: { segs: [['Sword_Heavy_A', 0, 0.44, 0.75], ['Sword_Heavy_A', 0.44, 0.52, 0.12], ['Sword_Heavy_A', 0.52, 0.73, 0.26], ['Sword_Heavy_A_Rec', 0.1, 1.0, 0.55]],
    hit: [0.75, 0.87], cancel: 1.12, track: 0.66, lunge: [0.55, 0.88, 2.8], dmg: 17, post: 30, hitPost: 12, deflPost: 32, range: 2.9, kind: 'thrust', perilous: true },
  // ---- boss chain: heavy -> leaping rise -> spinning cut ----
  heavyB: { segs: [['Sword_Heavy_B', 0, 0.38, 0.3], ['Sword_Heavy_B', 0.38, 0.5, 0.12], ['Sword_Heavy_B_Rec', 0, 0.77, 0.5]],
    hit: [0.3, 0.42], cancel: 0.45, next: 'heavyC', track: 0.28, lunge: [0.1, 0.42, 1.2], dmg: 15, post: 24, hitPost: 12, deflPost: 24, range: 2.5, kind: 'slash', dir: 'down', heavy: true },
  heavyC: { segs: [['Sword_Heavy_C', 0, 0.48, 0.42], ['Sword_Heavy_C', 0.48, 0.64, 0.13], ['Sword_Heavy_C', 0.64, 0.7, 0.06], ['Sword_Heavy_C_Rec', 0, 0.57, 0.48]],
    hit: [0.42, 0.55], cancel: 0.7, track: 0.4, lunge: [0.2, 0.55, 1.4], dmg: 16, post: 26, hitPost: 12, deflPost: 26, range: 2.5, kind: 'slash', dir: 'up', heavy: true },
  // ---- leaping overhead (Heavy_D): kneel, jump, crash down ----
  leap: { segs: [['Sword_Heavy_D', 0.2, 0.62, 0.55], ['Sword_Heavy_D', 0.62, 0.8, 0.14], ['Sword_Heavy_D', 0.8, 2.33, 0.9]],
    hit: [0.55, 0.69], cancel: 1.25, track: 0.5, lunge: [0.25, 0.65, 3.4], dmg: 20, post: 32, hitPost: 16, deflPost: 30, range: 2.7, kind: 'slash', dir: 'down', heavy: true, armor: true },
  uppercut: { segs: [['Sword_UpperCut', 0, 0.2, 0.3], ['Sword_UpperCut', 0.2, 0.36, 0.12], ['Sword_UpperCut', 0.36, 0.7, 0.32], ['Sword_Light_B_Rec', 0.1, 0.57, 0.35]],
    hit: [0.3, 0.42], cancel: 0.6, track: 0.28, lunge: [0.1, 0.4, 1.0], dmg: 11, post: 15, hitPost: 8, deflPost: 18, range: 2.3, kind: 'slash', dir: 'up' },
  // ---- kick: breaks a turtling guard (no damage worth noting, big posture) ----
  kick: { segs: [['Kick', 0.1, 0.4, 0.3], ['Kick', 0.4, 0.55, 0.12], ['Kick', 0.55, 1.1, 0.45]],
    hit: [0.3, 0.42], cancel: 0.7, track: 0.28, lunge: [0.1, 0.4, 0.7], dmg: 3, post: 34, hitPost: 22, deflPost: 10, range: 1.9, kind: 'kick', perilous: true },
  // ---- Sekiro-style links ----
  // jump + LMB: plunging cut from the air (deflectable, big posture)
  plunge: { segs: [['Sword_Heavy_D', 0.52, 0.62, 0.12], ['Sword_Heavy_D', 0.62, 0.8, 0.14], ['Sword_Heavy_D', 0.8, 1.7, 0.55]],
    hit: [0.12, 0.26], cancel: 0.6, track: 0.1, lunge: [0, 0.2, 1.2], dmg: 13, post: 36, hitPost: 20, deflPost: 22, range: 2.6, kind: 'slash', dir: 'down', heavy: true },
  // jump over a sweep, jump again: kick off the attacker (posture only) and spring back
  vault: { segs: [['Kick', 0.3, 0.55, 0.18], ['Kick', 0.55, 1.1, 0.4]],
    hit: [0.06, 0.2], cancel: 0.45, track: 0.1, lunge: [9, 9, 0], dmg: 0, post: 35, hitPost: 35, deflPost: 0, range: 2.6, kind: 'vault' },
  // dodge + LMB: quick step-in cut with no wind-up
  stepCut: { segs: [['Sword_Light_C', 0.38, 0.6, 0.15], ['Sword_Light_C', 0.6, 0.87, 0.18], ['Sword_Light_C_Rec', 0, 0.7, 0.4]],
    hit: [0.06, 0.17], cancel: 0.4, track: 0.06, lunge: [0, 0.18, 1.8], dmg: 10, post: 15, hitPost: 9, deflPost: 22, range: 2.6, kind: 'slash', dir: 'side' },
  // ---- Samurai Hunt: surprise strike from cover (crouched + attack). Long, quiet wind-up: it can still be read and deflected ----
  ambush: { segs: [['Sword_Heavy_A', 0.05, 0.44, 0.5], ['Sword_Heavy_A', 0.44, 0.52, 0.12], ['Sword_Heavy_A', 0.52, 0.73, 0.24], ['Sword_Heavy_A_Rec', 0.1, 1.0, 0.5]],
    hit: [0.5, 0.62], cancel: 0.9, track: 0.45, lunge: [0.3, 0.62, 2.2], dmg: 12, post: 22, hitPost: 20, deflPost: 26, range: 2.9, kind: 'ambush', heavy: true },
  // ---- spear: quick jab with long reach ----
  jab: { segs: [['Sword_Light_C', 0.2, 0.42, 0.34], ['Sword_Light_C', 0.42, 0.6, 0.12], ['Sword_Light_C_Rec', 0.2, 0.7, 0.36]],
    hit: [0.34, 0.46], cancel: 0.55, track: 0.32, lunge: [0.2, 0.46, 0.8], dmg: 8, post: 13, hitPost: 8, deflPost: 18, range: 2.4, kind: 'jab' },
  // ---- bosses ----
  // 4-hit chain: heavy cut -> rising cut -> uppercut -> leaping crash (each link deflectable, rhythm varies)
  boss1: { segs: [['Sword_Heavy_B', 0, 0.38, 0.36], ['Sword_Heavy_B', 0.38, 0.5, 0.12], ['Sword_Heavy_B_Rec', 0, 0.77, 0.45]], hit: [0.36, 0.48], cancel: 0.5, next: 'boss2', track: 0.34, lunge: [0.1, 0.48, 1.4], dmg: 14, post: 22, hitPost: 12, deflPost: 16, range: 2.6, kind: 'slash', dir: 'down', heavy: true },
  boss2: { segs: [['Sword_Heavy_C', 0.1, 0.48, 0.3], ['Sword_Heavy_C', 0.48, 0.64, 0.13], ['Sword_Heavy_C_Rec', 0, 0.57, 0.4]], hit: [0.3, 0.43], cancel: 0.46, next: 'boss3', track: 0.28, lunge: [0.1, 0.43, 1.3], dmg: 14, post: 22, hitPost: 12, deflPost: 16, range: 2.6, kind: 'slash', dir: 'up', heavy: true },
  boss3: { segs: [['Sword_UpperCut', 0, 0.2, 0.42], ['Sword_UpperCut', 0.2, 0.36, 0.12], ['Sword_UpperCut', 0.36, 0.7, 0.3]], hit: [0.42, 0.54], cancel: 0.6, next: 'leap', track: 0.4, lunge: [0.15, 0.54, 1.2], dmg: 13, post: 20, hitPost: 10, deflPost: 16, range: 2.5, kind: 'slash', dir: 'up' },
  // perilous burning sweep (fire trail): jump it
  flameSweep: { segs: [['Sword_Heavy_B', 0, 0.38, 0.75], ['Sword_Heavy_B', 0.38, 0.5, 0.16], ['Sword_Heavy_B_Rec', 0, 0.77, 0.55]], hit: [0.72, 0.9], cancel: 1.1, track: 0.7, lunge: [0.35, 0.88, 2.4], dmg: 20, post: 30, hitPost: 18, deflPost: 30, range: 3.2, kind: 'sweep', perilous: true, dir: 'side', heavy: true },  // ---- perilous sweep (危): low ground cut. Guard, deflect and dodge don't stop it - jump over it ----
  sweep: { segs: [['Sword_Heavy_B', 0, 0.38, 0.66], ['Sword_Heavy_B', 0.38, 0.5, 0.14], ['Sword_Heavy_B_Rec', 0, 0.77, 0.6]],
    hit: [0.62, 0.78], cancel: 1.05, track: 0.6, lunge: [0.3, 0.75, 1.6], dmg: 15, post: 24, hitPost: 14, deflPost: 30, range: 2.7, kind: 'sweep', perilous: true, dir: 'side', heavy: true },
  // ---- deathblow (cinematic lunge stab and pull-out) ----
  deathblow: { segs: [['Sword_Heavy_A', 0.3, 0.45, 0.6], ['Sword_Heavy_A', 0.45, 0.52, 0.2], ['Sword_Heavy_A', 0.52, 0.73, 0.55], ['Sword_Heavy_A_Rec', 0.1, 1.0, 0.55]],
    hit: [0.72, 0.8], cancel: 1.75, track: 0, lunge: [0.45, 0.72, 0.45], kind: 'deathblow', range: 3 },
};
export const ATTACKS = new Set(Object.keys(MOVES));
export const moveDur = m => m.segs.reduce((s, x) => s + x[3], 0);
for (const k in MOVES) MOVES[k].dur = moveDur(MOVES[k]);

// Reaction / utility clips (non-attacks). seg format identical.
export const REACT = {
  hitL: { segs: [['Hit_Chest', 0, 0.33, 0.3], ['Hit_Chest', 0.33, 0.33, 0.12]] },
  hitR: { segs: [['Hit_Shoulder_R', 0, 0.5, 0.42]] },
  hitU: { segs: [['Hit_Head', 0, 0.43, 0.4]] },
  hitD: { segs: [['Hit_Stomach', 0, 0.67, 0.48]] },
  hitHeavy: { segs: [['Hit_Knockback', 0, 0.83, 0.75]] },
  deflect: { segs: [['Sword_Block', 0.04, 0.3, 0.09], ['Sword_Block', 0.3, 0.42, 0.22]] },                  // defender's snap on a perfect deflect
  deflected: { segs: [['Hit_Shoulder_R', 0, 0.25, 0.14], ['Hit_Shoulder_R', 0.25, 0.5, 0.5]] },      // attacker after being deflected
  guardBreak: { segs: [['Idle_Shield_Break', 0, 0.36, 0.5], ['Idle_Shield_Break', 0.36, 0.38, 2.6], ['Idle_Shield_Break', 0.38, 1.07, 0.7]] },
  dodgeL: { segs: [['Dodge_Left', 0.05, 0.62, 0.36], ['Dodge_Left', 0.62, 1.3, 0.3]] },
  dodgeR: { segs: [['Dodge_Right', 0.05, 0.62, 0.36], ['Dodge_Right', 0.62, 1.3, 0.3]] },
  roll: { segs: [['Roll', 0.05, 1.1, 0.62], ['Roll', 1.1, 1.47, 0.18]] },
  die: { segs: [['Death01', 0, 2.4, 2.1]] },
  dieFwd: { segs: [['Death02', 0, 2.47, 2.2]] },
  jump: { segs: [['Jump_Start', 0.12, 0.45, 0.12], ['Jump_Start', 0.45, 1.25, 0.6], ['Jump_Land', 0.05, 0.75, 0.3]] },
  downed: { segs: [['IdleToLay', 0, 2.2, 1.1], ['IdleToLay', 2.2, 2.2, 9999]] },
  roar: { segs: [['Celebration', 0.2, 1.5, 1.5]] },
  revive: { segs: [['LayToIdle', 0, 1.53, 1.6]] },
  draw: { segs: [['Sword_Enter', 0, 1.3, 1.25]] },
  sheathe: { segs: [['Sword_Exit', 0, 1.3, 1.4]] },
  dbVictim: { segs: [['Hit_Knockback', 0, 0.4, 0.75], ['Hit_Knockback', 0.4, 0.83, 0.75]] },
};
for (const k in REACT) REACT[k].dur = moveDur(REACT[k]);

// game time -> [clip, clipTime] along a segmented timeline
export function sample(m, t) {
  let acc = 0;
  for (const s of m.segs) {
    if (t <= acc + s[3] || s === m.segs[m.segs.length - 1]) { const u = Math.min(1, Math.max(0, (t - acc) / s[3])); return [s[0], s[1] + (s[2] - s[1]) * u]; }
    acc += s[3];
  }
}
