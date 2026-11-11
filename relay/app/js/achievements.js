// Achievements: 48 feats (8 x 6 grid in the menu). Progress lives in REC.ach (saved with the record), counted from
// game events: ach.add(stat, n) for running totals, ach.max(stat, v) for best-reached values (stages, waves, rating).
// Each feat: [id, seal kanji, stat, goal, coins, gems]. Names and descriptions: i18n 'ach.<id>' / 'ach.<id>.d'.
// Rewards by tier: easy 100-500 coins, medium 500-1000 coins, hard 1000-1500 coins + 5-10 gems, hardest 2000-3000 + 20 gems.
// A reward is paid once, when the feat unlocks (REC.ach.paid); feats unlocked before rewards existed are paid on load.
export const ACH = [
  // ---- the first 18 (patch 1.1) ----
  ['firstBlood', '血', 'kills', 1, 100, 0], ['deflects', '弾', 'deflects', 50, 500, 0], ['deathblows', '止', 'deathblows', 25, 700, 0],
  ['mikiri', '見', 'mikiri', 1, 200, 0], ['duelist', '決', 'aiWins', 10, 700, 0], ['saint', '聖', 'saintWins', 1, 1000, 5],
  ['gauntlet5', '道', 'gauntletStage', 5, 1000, 0], ['gauntlet10', '極', 'gauntletStage', 10, 1500, 10], ['waves5', '波', 'svWave', 5, 500, 0],
  ['oniSlayer', '鬼', 'svCleared', 1, 1500, 10], ['flasks', '薬', 'flasks', 10, 200, 0], ['shuriken', '星', 'shurikenHits', 10, 200, 0],
  ['hunter', '狩', 'huntWins', 1, 200, 0], ['shadow', '影', 'ambushes', 5, 500, 0], ['noon', '午', 'noonWins', 1, 500, 0],
  ['bond', '縁', 'onlineWins', 1, 500, 0], ['collector', '蔵', 'blades', 5, 1000, 0], ['wealth', '金', 'earned', 5000, 500, 0],
  // ---- easy ----
  ['firstWin', '初', 'wins', 1, 100, 0], ['breaker', '崩', 'breaks', 10, 200, 0], ['leaper', '跳', 'leaps', 5, 200, 0],
  ['sprinter', '疾', 'runHits', 10, 200, 0], ['stones', '石', 'stones', 25, 200, 0], ['wardrobe', '衣', 'skins', 4, 500, 0],
  ['veteran', '戦', 'matches', 50, 500, 0],
  // ---- medium ----
  ['kills100', '斬', 'kills', 100, 700, 0], ['deflects200', '鉄', 'deflects', 200, 700, 0], ['rhythm', '拍', 'dflChain', 5, 700, 0],
  ['mikiri10', '看', 'mikiri', 10, 700, 0], ['flawless', '完', 'flawless', 1, 1000, 0], ['lastStand', '粘', 'lastStand', 1, 700, 0],
  ['team1', '組', 'teamWins', 1, 500, 0], ['ranked1', '位', 'rankedWins', 1, 500, 0], ['hunter10', '獵', 'huntWins', 10, 1000, 0],
  ['waves8', '嵐', 'svWave', 8, 1000, 0], ['wealth25', '富', 'earned', 25000, 1000, 0],
  // ---- hard ----
  ['deathblows100', '終', 'deathblows', 100, 1500, 10], ['duelist50', '師', 'aiWins', 50, 1000, 5], ['saint10', '仙', 'saintWins', 10, 1500, 10],
  ['online25', '友', 'onlineWins', 25, 1500, 10], ['rating1300', '段', 'rating', 1300, 1500, 10], ['coop', '共', 'svCoop', 1, 1000, 5],
  ['bossSlayer', '将', 'bossKills', 5, 1000, 5],
  // ---- hardest ----
  ['svHard', '獄', 'svHard', 1, 3000, 20], ['flawlessSaint', '無', 'flawlessSaint', 1, 2500, 20], ['deflects1000', '鋼', 'deflects', 1000, 2000, 20],
  ['rating1500', '王', 'rating', 1500, 3000, 20], ['gauntletHard', '魔', 'gauntletHard', 10, 3000, 20],
];
export const ACH_COLS = 8;
let REC = null, save = () => {}, notify = () => {}, reward = () => {};
// notify(id, coins, gems) shows the toast; reward(coins, gems) credits the wallet
export function initAch(rec, saveFn, notifyFn, rewardFn) {
  REC = rec; save = saveFn; notify = notifyFn; reward = rewardFn || reward;
  REC.ach = REC.ach || { n: {}, done: {} }; REC.ach.n = REC.ach.n || {}; REC.ach.done = REC.ach.done || {}; REC.ach.paid = REC.ach.paid || {};
  let c = 0, g = 0;   // feats unlocked before rewards existed: pay them now, in one go
  for (const [id, , , , rc, rg] of ACH) if (REC.ach.done[id] && !REC.ach.paid[id]) { REC.ach.paid[id] = 1; c += rc; g += rg; }
  if (c || g) { reward(c, g); save(); }
}
const val = stat => (REC && REC.ach.n[stat]) || 0;
export function progress(id) { const a = ACH.find(x => x[0] === id); return { have: Math.min(val(a[2]), a[3]), goal: a[3], done: !!(REC && REC.ach.done[id]), coins: a[4], gems: a[5] }; }
function check(stat) {
  let got = false;
  for (const [id, , st, goal, rc, rg] of ACH) if (st === stat && !REC.ach.done[id] && val(st) >= goal) {
    REC.ach.done[id] = Date.now(); got = true;
    if (!REC.ach.paid[id]) { REC.ach.paid[id] = 1; reward(rc, rg); }
    notify(id, rc, rg);
  }
  save(); return got;
}
export const ach = {
  add(stat, n = 1) { if (!REC || !(n > 0)) return; REC.ach.n[stat] = val(stat) + n; check(stat); },
  max(stat, v) { if (!REC || !(v > val(stat))) return; REC.ach.n[stat] = v; check(stat); },
  count() { return REC ? Object.keys(REC.ach.done).filter(id => ACH.some(a => a[0] === id)).length : 0; },
};
